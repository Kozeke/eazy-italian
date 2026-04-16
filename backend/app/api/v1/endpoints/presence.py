"""
app/api/v1/endpoints/presence.py
─────────────────────────────────
WebSocket endpoint:  /api/v1/ws/classroom/{classroom_id}/presence

Protocol (client → server)
───────────────────────────
  { "type": "join",      "classroom_id": N, "user_id": N,
    "user_name": "...",  "avatar_url": "..." | null }

  { "type": "heartbeat", "classroom_id": N, "user_id": N }

Protocol (server → client, teachers only)
──────────────────────────────────────────
  { "type": "presence_update", "users": [ OnlineUser, … ] }
      Sent immediately after join; gives the full snapshot.

  { "type": "user_joined", "user": OnlineUser }
      Sent to ALL connections in the room (including the new joiner's
      other tabs) when a user goes from offline → online.

  { "type": "user_left", "user_id": N }
      Sent when a user fully disconnects (all tabs closed / timed out).

Students receive nothing back from the presence socket intentionally –
they still connect so the teacher can see them, but the server returns
an empty snapshot and suppresses join/leave broadcasts to their socket.
This matches the frontend contract in useOnlinePresence.ts:
  isTeacher=false → onlineUsers is [] on the client side.

Auth
────
The WS upgrade carries the standard JWT token via
?token=<jwt>   (query param, because browsers can't set WS headers).
The token is validated with the same `get_current_user` logic used
everywhere else; the connection is rejected (403) if invalid.

Access control
──────────────
• Teachers must own the classroom (course).
• Students must be enrolled.
• Superusers bypass both checks.
"""

from __future__ import annotations

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.auth import get_current_user_from_token
from app.core.enrollment_guard import check_course_access
from app.core.presence_manager import presence_manager
from app.models.user import User
from app.models.course import Course

router = APIRouter()
logger = logging.getLogger(__name__)

# ─── Helpers ─────────────────────────────────────────────────────────────────


async def _send_json(ws: WebSocket, data: dict) -> None:
    """Fire-and-forget JSON send; swallows errors if socket already closed."""
    try:
        await ws.send_text(json.dumps(data))
    except Exception:
        pass


def _is_teacher(user: User, course: Course) -> bool:
    is_admin = user.role.value == "admin"
    return is_admin or (
        user.role.value == "teacher"
        and course.created_by == user.id
    )


# ─── WebSocket endpoint ───────────────────────────────────────────────────────


@router.websocket("/ws/classroom/{classroom_id}/presence")
async def presence_ws(
    websocket: WebSocket,
    classroom_id: int,
    token: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    """
    Presence WebSocket for a single classroom.

    Lifecycle
    ─────────
    1. Upgrade & authenticate (token query param).
    2. Verify access (teacher owns course OR student enrolled).
    3. Wait for the first `join` message to learn user meta.
    4. Register in PresenceManager; broadcast presence_update to the joiner
       and user_joined to all other teacher sockets.
    5. Loop: handle heartbeat / unknown messages.
    6. On disconnect: broadcast user_left if the user is fully offline.
    """

    # ── Step 1: Authenticate ────────────────────────────────────────────────
    if not token:
        await websocket.close(code=4001, reason="Missing auth token")
        return

    current_user: User | None = get_current_user_from_token(token, db)
    if current_user is None:
        await websocket.close(code=4003, reason="Invalid or expired token")
        return

    # ── Step 2: Verify course access ────────────────────────────────────────
    course = db.query(Course).filter(Course.id == classroom_id).first()
    if not course:
        await websocket.close(code=4004, reason="Classroom not found")
        return

    teacher = _is_teacher(current_user, course)

    if not teacher:
        # Must be an enrolled student
        try:
            check_course_access(db, current_user, classroom_id)
        except Exception:
            await websocket.close(code=4003, reason="Not enrolled in this classroom")
            return

    # ── Accept the WebSocket upgrade ────────────────────────────────────────
    await websocket.accept()
    logger.info(
        "Presence WS connected: user=%s classroom=%s role=%s",
        current_user.id,
        classroom_id,
        "teacher" if teacher else "student",
    )

    user_id: Optional[int] = None   # set after first `join` message
    joined = False

    try:
        async for raw in websocket.iter_text():
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type")

            # ── join ────────────────────────────────────────────────────────
            if msg_type == "join":
                # Accept user meta from the client; fall back to DB values
                user_id = int(msg.get("user_id", current_user.id))
                user_name = msg.get("user_name") or current_user.full_name or "Unknown"
                avatar_url = msg.get("avatar_url") or getattr(current_user, "avatar_url", None)

                is_new = await presence_manager.join(
                    classroom_id=classroom_id,
                    user_id=user_id,
                    user_name=user_name,
                    avatar_url=avatar_url,
                    ws=websocket,
                    is_teacher=teacher,
                )
                joined = True

                # Always send the full snapshot back to the joiner (teachers only
                # see data; students get an empty list per the frontend contract).
                snapshot = await presence_manager.get_users(classroom_id)
                await _send_json(websocket, {
                    "type": "presence_update",
                    "users": snapshot if teacher else [],
                })

                # Broadcast user_joined to teachers in the room (not to students,
                # and not back to the joiner's own socket).
                if is_new:
                    user_dict = next(
                        (u for u in snapshot if u["user_id"] == user_id), None
                    ) or {
                        "user_id": user_id,
                        "user_name": user_name,
                        "avatar_url": avatar_url,
                    }
                    await presence_manager.broadcast_to_teachers(
                        classroom_id,
                        {"type": "user_joined", "user": user_dict},
                    )

                logger.debug(
                    "User %s joined classroom %s presence (is_new=%s)",
                    user_id, classroom_id, is_new,
                )

            # ── heartbeat ───────────────────────────────────────────────────
            elif msg_type == "heartbeat":
                hb_user_id = int(msg.get("user_id", current_user.id))
                await presence_manager.heartbeat(classroom_id, hb_user_id)
                # No response needed

            # ── unknown ─────────────────────────────────────────────────────
            else:
                logger.debug("Unknown presence message type: %s", msg_type)

    except WebSocketDisconnect:
        logger.info(
            "Presence WS disconnected: user=%s classroom=%s",
            user_id or current_user.id,
            classroom_id,
        )
    except Exception as exc:
        logger.exception("Unhandled error in presence WS: %s", exc)
    finally:
        if joined and user_id is not None:
            fully_offline = await presence_manager.leave(
                classroom_id=classroom_id,
                user_id=user_id,
                ws=websocket,
            )

            if fully_offline:
                # Broadcast user_left to teachers
                await presence_manager.broadcast_to_teachers(
                    classroom_id,
                    {"type": "user_left", "user_id": user_id},
                )
                logger.debug(
                    "User %s left classroom %s (fully offline)", user_id, classroom_id
                )