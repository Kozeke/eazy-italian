"""
app/api/v1/endpoints/live.py
────────────────────────────
WebSocket endpoint:  /api/v1/ws/classroom/{classroom_id}/live

Google-Docs-style real-time exercise sync.

Protocol (client → server)
───────────────────────────
  { "type": "join",      "role": "teacher"|"student", "user_id": N }

  { "type": "patch",     "key": "ex/<id>/<gap>", "value": <any> }
      Any role. Persisted in the room snapshot and relayed immediately to every
      other connection in the room. Teachers use this to drive student state;
      students use this for bidirectional exercises (e.g. TypeWordInGap) so the
      teacher can monitor their input in real time.

  { "type": "heartbeat" }
      Keep-alive. No response.

Protocol (server → client)
───────────────────────────
  { "type": "snapshot",  "patches": { "<key>": <value>, … } }
      Sent once, immediately after a successful join, so late-joining students
      see the teacher's current exercise state without waiting for a new patch.

  { "type": "patch",     "key": "…", "value": <any> }
      Relayed to all connections whenever any client sends a patch.

Auth
────
JWT token via ?token=<jwt> query parameter (browsers cannot set WS headers).
Same validation as the presence endpoint.

Access control
──────────────
• Teachers must own the classroom (course).
• Students must be enrolled.
• Superusers bypass both checks.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.auth import get_current_user_from_token
from app.core.enrollment_guard import check_course_access
from app.models.user import User
from app.models.course import Course

router = APIRouter()
logger = logging.getLogger(__name__)

# ─── In-memory live session state ────────────────────────────────────────────
#
# Structure:
#   _rooms[classroom_id] = {
#       "connections": set[WebSocket],
#       "patches":     dict[str, Any],   ← persisted snapshot
#   }
#
# This is intentionally process-local. For multi-worker deployments, swap out
# _rooms for a Redis pub/sub manager (same interface).

_rooms: dict[int, dict] = {}


def _ensure_room(classroom_id: int) -> dict:
    if classroom_id not in _rooms:
        _rooms[classroom_id] = {
            "connections": set(),
            "patches": {},
            # user_id → {user_id, user_name, avatar_url, role}
            "users": {},
        }
    return _rooms[classroom_id]


# ─── Presence helpers ─────────────────────────────────────────────────────────

def _users_list(room: dict) -> list[dict]:
    """Snapshot of connected users as a plain list (JSON-serialisable)."""
    return list(room["users"].values())


async def _sync_presence(classroom_id: int, room: dict) -> None:
    """
    Update the persisted _presence/users patch and broadcast it to all
    connections in the room so the teacher's panel refreshes instantly.
    """
    users = _users_list(room)
    room["patches"]["_presence/users"] = users
    await _broadcast(classroom_id, {
        "type": "patch",
        "key": "_presence/users",
        "value": users,
    })


async def _send_json(ws: WebSocket, data: dict) -> None:
    """Fire-and-forget JSON send; swallows errors if socket already closed."""
    try:
        await ws.send_text(json.dumps(data))
    except Exception:
        pass


async def _broadcast(classroom_id: int, data: dict, exclude: Optional[WebSocket] = None) -> None:
    """Relay a message to every connection in the room except the sender."""
    room = _rooms.get(classroom_id)
    if not room:
        return
    dead: set[WebSocket] = set()
    for ws in list(room["connections"]):
        if ws is exclude:
            continue
        try:
            await ws.send_text(json.dumps(data))
        except Exception:
            dead.add(ws)
    room["connections"] -= dead


def _is_teacher(user: User, course: Course) -> bool:
    is_admin = user.role.value == "admin"
    return is_admin or (
        user.role.value == "teacher" and course.created_by == user.id
    )


# ─── WebSocket endpoint ───────────────────────────────────────────────────────


@router.websocket("/ws/classroom/{classroom_id}/live")
async def live_ws(
    websocket: WebSocket,
    classroom_id: int,
    token: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    """
    Live-sync WebSocket for real-time exercise state sharing.

    Lifecycle
    ─────────
    1. Authenticate via JWT token query param.
    2. Authorise (teacher owns course OR student enrolled).
    3. Accept the WebSocket upgrade.
    4. Wait for the `join` message to learn role.
    5. Send the current snapshot so late joiners see existing state.
    6. Loop: handle `patch` (teacher) and `heartbeat`.
    7. On disconnect: remove from room; clean up empty rooms.
    """

    # ── Step 1: Authenticate ────────────────────────────────────────────────
    # NOTE: websocket.accept() must be called BEFORE websocket.close() —
    # Starlette/FastAPI requires the WS handshake to complete before the
    # server can send a close frame. Closing before accept is silently
    # ignored on many ASGI servers, causing the client to see a plain
    # connection-refused / 403 with no meaningful error code.
    if not token:
        await websocket.accept()
        await websocket.close(code=4001, reason="Missing auth token")
        return

    current_user: User | None = get_current_user_from_token(token, db)
    if current_user is None:
        await websocket.accept()
        await websocket.close(code=4003, reason="Invalid or expired token")
        return

    # ── Step 2: Authorise ───────────────────────────────────────────────────
    course = db.query(Course).filter(Course.id == classroom_id).first()
    if not course:
        await websocket.accept()
        await websocket.close(code=4004, reason="Classroom not found")
        return

    teacher = _is_teacher(current_user, course)

    if not teacher:
        try:
            check_course_access(db, current_user, classroom_id)
        except Exception:
            await websocket.accept()
            await websocket.close(code=4003, reason="Not enrolled in this classroom")
            return

    # ── Step 3: Accept ──────────────────────────────────────────────────────
    await websocket.accept()
    logger.info(
        "Live WS connected: user=%s classroom=%s role=%s",
        current_user.id,
        classroom_id,
        "teacher" if teacher else "student",
    )

    room = _ensure_room(classroom_id)
    room["connections"].add(websocket)

    joined = False

    try:
        async for raw in websocket.iter_text():
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type")

            # ── join ─────────────────────────────────────────────────────────
            if msg_type == "join":
                joined = True

                # Register this user's metadata so the teacher's panel can
                # show their name and avatar without a separate presence WS.
                room["users"][current_user.id] = {
                    "user_id":    current_user.id,
                    "user_name":  current_user.full_name or f"User {current_user.id}",
                    "avatar_url": getattr(current_user, "avatar_url", None),
                    "role":       "teacher" if teacher else "student",
                }

                # Persist and relay the updated user list to every connection
                # (especially important so the teacher's panel lights up).
                await _sync_presence(classroom_id, room)

                # Send the full snapshot (now includes _presence/users) so
                # late-joining students see the current exercise state.
                await _send_json(websocket, {
                    "type": "snapshot",
                    "patches": room["patches"],
                })

                logger.debug(
                    "User %s joined live room %s (teacher=%s, snapshot_keys=%d)",
                    current_user.id,
                    classroom_id,
                    teacher,
                    len(room["patches"]),
                )

            # ── patch ────────────────────────────────────────────────────────
            elif msg_type == "patch":
                key: str = msg.get("key", "")
                value: Any = msg.get("value")

                if not key:
                    continue  # Ignore malformed patches

                # Persist so late joiners receive it in the snapshot
                room["patches"][key] = value

                # Relay to everyone else in the room (students + other teacher tabs)
                patch_frame = {"type": "patch", "key": key, "value": value}
                await _broadcast(classroom_id, patch_frame, exclude=websocket)

                logger.debug(
                    "Patch relayed: classroom=%s key=%s user=%s",
                    classroom_id,
                    key,
                    current_user.id,
                )

            # ── heartbeat ────────────────────────────────────────────────────
            elif msg_type == "heartbeat":
                pass  # No response needed — TCP keep-alive is enough

            # ── unknown ──────────────────────────────────────────────────────
            else:
                logger.debug("Unknown live message type: %s", msg_type)

    except WebSocketDisconnect:
        logger.info(
            "Live WS disconnected: user=%s classroom=%s",
            current_user.id,
            classroom_id,
        )
    except Exception as exc:
        logger.exception("Unhandled error in live WS: %s", exc)
    finally:
        room["connections"].discard(websocket)

        # Remove the user from presence and broadcast the updated list so
        # the teacher's panel removes the card immediately.
        if joined:
            room["users"].pop(current_user.id, None)
            await _sync_presence(classroom_id, room)

        # Clean up empty rooms to avoid unbounded memory growth
        if not room["connections"]:
            _rooms.pop(classroom_id, None)
            logger.debug("Live room %s removed (no more connections)", classroom_id)