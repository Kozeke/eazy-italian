"""
app/api/v1/endpoints/live.py
────────────────────────────
WebSocket endpoint:  /api/v1/ws/classroom/{classroom_id}/live
REST endpoint:       GET /api/v1/classrooms/{classroom_id}/exercise-answers

Google-Docs-style real-time exercise sync.

Protocol (client → server)
───────────────────────────
  { "type": "join",      "role": "teacher"|"student", "user_id": N }

  { "type": "patch",     "key": "ex/<id>/<gap>", "value": <any>,
                         "unit_id": N, "segment_id": N }
      unit_id / segment_id (optional) stored for later restoration.

      Extended teacher-only fields:
        "target_student_id": N  — route patch ONLY to student N instead of all.
        "is_correct": bool|null — optional correctness hint persisted to DB.

  { "type": "heartbeat" }

Protocol (server → client)
───────────────────────────
  { "type": "snapshot",  "patches": { "<key>": <value>, … } }
      Students receive a PERSONALIZED snapshot:
        • Their own "s/{uid}/ex/…" answers are stripped to plain "ex/…".
        • Other students' "s/{N}/…" keys are excluded.
        • Teacher "ex/…" fills, presence, and lesson-nav keys are included as-is.
      Teachers receive the full raw room["patches"].

  { "type": "patch",     "key": "…", "value": <any> }

Answer persistence & DB hydration
──────────────────────────────────
Every exercise field patch is written to exercise_field_answer_events with
unit_id + segment_id.  On student join, if no live answers are in memory
(e.g. server restart), the latest row per (block_id, field_key) is loaded
from DB and injected so the personalized snapshot restores their work.

REST answer endpoint
─────────────────────
GET /api/v1/classrooms/{classroom_id}/exercise-answers
  ?student_id=N   (optional — omit to get all students, teacher only)
  ?unit_id=N      (optional filter)
  ?segment_id=N   (optional filter)
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db, SessionLocal
from app.core.auth import get_current_user, get_current_user_from_token
from app.core.enrollment_guard import check_course_access
from app.models.user import User
from app.models.course import Course

from app.models.exercise_field_answer_event import ExerciseFieldAnswerEvent  # noqa: F401

router = APIRouter()
logger = logging.getLogger(__name__)

# ─── Key parsing ──────────────────────────────────────────────────────────────

_STUDENT_KEY_RE = re.compile(r"^s/(\d+)/ex/([^/]+)/(.+)$")
_TEACHER_KEY_RE = re.compile(r"^ex/([^/]+)/(.+)$")


def _parse_exercise_key(
    key: str,
) -> tuple[int | None, str | None, str | None, str | None]:
    """
    Returns (student_id_or_None, logical_key, block_id, field_key).
    logical_key = "ex/{blockId}/{fieldKey}" (no student prefix).
    Returns all-None when the key is not an exercise key.
    """
    m = _STUDENT_KEY_RE.match(key)
    if m:
        uid_str, block_id, field_key = m.groups()
        return int(uid_str), f"ex/{block_id}/{field_key}", block_id, field_key

    m = _TEACHER_KEY_RE.match(key)
    if m:
        block_id, field_key = m.groups()
        return None, f"ex/{block_id}/{field_key}", block_id, field_key

    return None, None, None, None


def _int_or_none(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


# ─── In-memory room state ─────────────────────────────────────────────────────

_rooms: dict[int, dict] = {}


def _ensure_room(classroom_id: int) -> dict:
    if classroom_id not in _rooms:
        _rooms[classroom_id] = {
            "connections":   set(),
            "patches":       {},
            "users":         {},
            "student_conns": {},
            "teacher_conns": set(),
        }
    room = _rooms[classroom_id]
    room.setdefault("student_conns", {})
    room.setdefault("teacher_conns", set())
    return room


async def _send_json(ws: WebSocket, data: dict) -> None:
    try:
        await ws.send_text(json.dumps(data))
    except Exception:
        pass


async def _broadcast(
    classroom_id: int,
    data: dict,
    exclude: Optional[WebSocket] = None,
) -> None:
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


async def _sync_presence(classroom_id: int, room: dict) -> None:
    users = list(room["users"].values())
    room["patches"]["_presence/users"] = users
    await _broadcast(classroom_id, {"type": "patch", "key": "_presence/users", "value": users})


def _is_teacher(user: User, course: Course) -> bool:
    return user.role.value == "admin" or (
        user.role.value == "teacher" and course.created_by == user.id
    )


# ─── Snapshot personalization ─────────────────────────────────────────────────

def _build_student_snapshot(patches: dict, student_id: int) -> dict:
    """
    Build a snapshot tailored for a specific student.

    Rules:
    • "s/{student_id}/ex/…"  →  emitted as plain "ex/…"  (own answers, restored)
    • "s/{other_id}/…"       →  excluded  (another student's private data)
    • Everything else        →  included as-is
                                (teacher fills "ex/…", presence, lesson nav)

    Personalised snapshots ensure exercise blocks subscribed to the plain
    "ex/…" key receive the student's saved answers on join / reconnect.
    """
    prefix = f"s/{student_id}/"
    personal: dict = {}

    for k, v in patches.items():
        if k.startswith(prefix):
            # Own scoped answer — strip prefix so exercise blocks find it
            personal[k[len(prefix):]] = v
        elif k.startswith("s/"):
            # Another student's answer — exclude
            continue
        else:
            personal[k] = v

    return personal


# ─── DB persistence ───────────────────────────────────────────────────────────

def _save_answer_event(
    *,
    classroom_id: int,
    student_id: int,
    unit_id: Optional[int],
    segment_id: Optional[int],
    exercise_key: str,
    block_id: str,
    field_key: str,
    value: Any,
    is_correct: Optional[bool],
    written_by_teacher: bool,
    is_broadcast: bool,
) -> None:
    """Write one answer event row using a fresh db session."""
    db: Session = SessionLocal()
    try:
        event = ExerciseFieldAnswerEvent(
            classroom_id=classroom_id,
            student_id=student_id,
            unit_id=unit_id,
            segment_id=segment_id,
            exercise_key=exercise_key,
            block_id=block_id,
            field_key=field_key,
            value=value,
            is_correct=is_correct,
            written_by_teacher=written_by_teacher,
            is_broadcast=is_broadcast,
        )
        db.add(event)
        db.commit()
        logger.debug(
            "Answer saved: classroom=%s student=%s key=%s unit=%s segment=%s",
            classroom_id, student_id, exercise_key, unit_id, segment_id,
        )
    except Exception as exc:
        logger.warning("Failed to persist answer event: %s", exc)
        try:
            db.rollback()
        except Exception:
            pass
    finally:
        db.close()


def _load_latest_answers_for_student(
    classroom_id: int,
    student_id: int,
    unit_id: Optional[int] = None,
    segment_id: Optional[int] = None,
) -> dict[str, Any]:
    """
    Return the latest value per (block_id, field_key) for a student.
    Uses a global DISTINCT ON (without SQL scope filtering) so null sentinel rows
    written by clear operations always beat older non-null answers.

    Python post-filtering rules:
    • value IS None -> field was explicitly cleared, exclude from result.
    • value exists but scope differs from request -> exclude.
    • value exists and scope matches request (or no scope requested) -> include.

    Returns: { "ex/{block_id}/{field_key}": value, … }
    """
    db: Session = SessionLocal()
    try:
        rows = db.execute(
            text("""
                SELECT DISTINCT ON (block_id, field_key)
                    exercise_key, value, unit_id, segment_id
                FROM exercise_field_answer_events
                WHERE classroom_id = :classroom_id
                  AND student_id   = :student_id
                ORDER BY block_id, field_key, created_at DESC
            """),
            {
                "classroom_id": classroom_id,
                "student_id":   student_id,
            },
        ).fetchall()

        result: dict[str, Any] = {}
        for row in rows:
            if row.value is None:
                continue
            if unit_id is not None and row.unit_id != unit_id:
                continue
            if segment_id is not None and row.segment_id != segment_id:
                continue
            result[row.exercise_key] = row.value

        return result

    except Exception as exc:
        logger.warning("Failed to load answers for student %s: %s", student_id, exc)
        return {}
    finally:
        db.close()


def _load_all_latest_answers(
    classroom_id: int,
    unit_id: Optional[int] = None,
    segment_id: Optional[int] = None,
) -> dict[int, dict[str, Any]]:
    """
    Return latest answers for ALL students in a classroom.

    Uses global DISTINCT ON so null sentinel rows win recency before filtering.
    Null rows are excluded and non-null rows are scope-filtered in Python.
    """
    db: Session = SessionLocal()
    try:
        rows = db.execute(
            text("""
                SELECT DISTINCT ON (student_id, block_id, field_key)
                    student_id, exercise_key, value, unit_id, segment_id
                FROM exercise_field_answer_events
                WHERE classroom_id = :classroom_id
                ORDER BY student_id, block_id, field_key, created_at DESC
            """),
            {"classroom_id": classroom_id},
        ).fetchall()

        result: dict[int, dict[str, Any]] = {}
        for row in rows:
            if row.value is None:
                continue
            if unit_id is not None and row.unit_id != unit_id:
                continue
            if segment_id is not None and row.segment_id != segment_id:
                continue
            result.setdefault(row.student_id, {})[row.exercise_key] = row.value
        return result

    except Exception as exc:
        logger.warning("Failed to load all answers for classroom %s: %s", classroom_id, exc)
        return {}
    finally:
        db.close()


# ─── REST endpoint ────────────────────────────────────────────────────────────

@router.get("/classrooms/{classroom_id}/exercise-answers")
async def get_exercise_answers(
    classroom_id: int,
    student_id: Optional[int] = Query(
        default=None,
        description="Student whose answers to fetch. Omit to get all students (teacher only).",
    ),
    unit_id: Optional[int] = Query(default=None, description="Filter by unit."),
    segment_id: Optional[int] = Query(default=None, description="Filter by segment."),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Fetch saved exercise answers for classroom restore on load.

    Student  → always their own answers; student_id param ignored.
    Teacher  → all students when student_id omitted, one student otherwise.

    Single-student response:
      { "patches": { "ex/{block}/{field}": value, … }, "student_id": N, "classroom_id": N }

    All-students response (teacher, no student_id):
      { "students": { "N": { "ex/…": value }, … }, "classroom_id": N }
    """
    course = db.query(Course).filter(Course.id == classroom_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Classroom not found")

    teacher = _is_teacher(current_user, course)

    if not teacher:
        try:
            check_course_access(db, current_user, classroom_id)
        except Exception:
            raise HTTPException(status_code=403, detail="Not enrolled in this classroom")

        patches = _load_latest_answers_for_student(
            classroom_id=classroom_id,
            student_id=current_user.id,
            unit_id=unit_id,
            segment_id=segment_id,
        )
        return {"patches": patches, "student_id": current_user.id, "classroom_id": classroom_id}

    # Teacher — specific student
    if student_id is not None:
        patches = _load_latest_answers_for_student(
            classroom_id=classroom_id,
            student_id=student_id,
            unit_id=unit_id,
            segment_id=segment_id,
        )
        return {"patches": patches, "student_id": student_id, "classroom_id": classroom_id}

    # Teacher — all students
    all_answers = _load_all_latest_answers(
        classroom_id=classroom_id,
        unit_id=unit_id,
        segment_id=segment_id,
    )
    return {
        "students":     {str(sid): answers for sid, answers in all_answers.items()},
        "classroom_id": classroom_id,
    }


# ─── Clear answers endpoint ───────────────────────────────────────────────────

# Defines the JSON payload shape for exercise block clear requests.
class ExerciseAnswerClearRequest(BaseModel):
    block_id: str
    student_id: Optional[int] = None
    unit_id: Optional[int] = None
    segment_id: Optional[int] = None


# Clears one student's block answers by writing null-sentinel rows for each field key.
def _clear_block_for_student(
    db: Session,
    *,
    classroom_id: int,
    student_id: int,
    block_id: str,
    unit_id: Optional[int],
    segment_id: Optional[int],
) -> int:
    """
    Discover which field_keys exist for this (classroom, student, block_id)
    then write one null-value event per field_key.
    Returns the number of null rows written.
    """
    # Collect all distinct historical field keys for the target block.
    existing_fields = db.execute(
        text("""
            SELECT DISTINCT field_key
            FROM exercise_field_answer_events
            WHERE classroom_id = :classroom_id
              AND student_id   = :student_id
              AND block_id     = :block_id
        """),
        {
            "classroom_id": classroom_id,
            "student_id": student_id,
            "block_id": block_id,
        },
    ).fetchall()

    # Tracks how many null sentinel rows are written in this call.
    rows_written = 0
    for row in existing_fields:
        # Stores the block field key being nulled for the new event row.
        field_key = row.field_key
        # Stores the normalized exercise key consumed by hydrate/restore queries.
        logical_key = f"ex/{block_id}/{field_key}"
        # Creates one null-value sentinel event so DISTINCT ON resolves to null.
        null_event = ExerciseFieldAnswerEvent(
            classroom_id=classroom_id,
            student_id=student_id,
            exercise_key=logical_key,
            block_id=block_id,
            field_key=field_key,
            value=None,
            written_by_teacher=False,
            is_broadcast=False,
            unit_id=unit_id,
            segment_id=segment_id,
        )
        db.add(null_event)
        rows_written += 1

    db.commit()
    return rows_written


@router.post("/classrooms/{classroom_id}/exercise-answers/clear")
async def clear_exercise_answers(
    classroom_id: int,
    payload: ExerciseAnswerClearRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Clear exercise answers for a specific block by writing null-value sentinel rows.

    Teacher: can clear for one student (payload.student_id) or all students (omit it).
    Student: always clears only their own answers regardless of payload.student_id.

    Returns:
      { "cleared": true, "rows_written": N, "block_id": "…" }
    """
    # Loads the classroom/course row to validate existence and teacher ownership.
    course = db.query(Course).filter(Course.id == classroom_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Classroom not found")

    # Indicates whether the caller has teacher-level clear permissions in this classroom.
    is_teacher = _is_teacher(current_user, course)
    # Stores the requested block scope to avoid repeated payload lookups.
    block_id = payload.block_id
    # Stores optional unit metadata that gets copied into new null rows.
    unit_id = payload.unit_id
    # Stores optional segment metadata that gets copied into new null rows.
    segment_id = payload.segment_id

    if not is_teacher:
        # Writes null sentinel events for the current student only.
        rows = _clear_block_for_student(
            db,
            classroom_id=classroom_id,
            student_id=current_user.id,
            block_id=block_id,
            unit_id=unit_id,
            segment_id=segment_id,
        )
        return {"cleared": True, "rows_written": rows, "block_id": block_id}

    if payload.student_id is not None:
        # Writes null sentinel events for one teacher-selected student.
        rows = _clear_block_for_student(
            db,
            classroom_id=classroom_id,
            student_id=payload.student_id,
            block_id=block_id,
            unit_id=unit_id,
            segment_id=segment_id,
        )
        return {"cleared": True, "rows_written": rows, "block_id": block_id}

    # Lists every student who has historical rows for this classroom block.
    all_student_ids_result = db.execute(
        text("""
            SELECT DISTINCT student_id
            FROM exercise_field_answer_events
            WHERE classroom_id = :classroom_id
              AND block_id     = :block_id
        """),
        {"classroom_id": classroom_id, "block_id": block_id},
    ).fetchall()

    # Accumulates the total number of null rows written for all students.
    total_rows = 0
    for sid_row in all_student_ids_result:
        total_rows += _clear_block_for_student(
            db,
            classroom_id=classroom_id,
            student_id=sid_row.student_id,
            block_id=block_id,
            unit_id=unit_id,
            segment_id=segment_id,
        )

    return {
        "cleared": True,
        "rows_written": total_rows,
        "block_id": block_id,
        "students_cleared": len(all_student_ids_result),
    }


# ─── WebSocket endpoint ───────────────────────────────────────────────────────

@router.websocket("/ws/classroom/{classroom_id}/live")
async def live_ws(
    websocket: WebSocket,
    classroom_id: int,
    token: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    # ── Auth ────────────────────────────────────────────────────────────────
    if not token:
        await websocket.accept()
        await websocket.close(code=4001, reason="Missing auth token")
        return

    current_user: User | None = get_current_user_from_token(token, db)
    if current_user is None:
        await websocket.accept()
        await websocket.close(code=4003, reason="Invalid or expired token")
        return

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

    await websocket.accept()
    logger.info(
        "Live WS connected: user=%s classroom=%s role=%s",
        current_user.id, classroom_id, "teacher" if teacher else "student",
    )

    room = _ensure_room(classroom_id)
    room["connections"].add(websocket)

    if teacher:
        room["teacher_conns"].add(websocket)
    else:
        uid = current_user.id
        room["student_conns"].setdefault(uid, set()).add(websocket)

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
                room["users"][current_user.id] = {
                    "user_id":    current_user.id,
                    "user_name":  current_user.full_name or f"User {current_user.id}",
                    "avatar_url": getattr(current_user, "avatar_url", None),
                    "role":       "teacher" if teacher else "student",
                }
                await _sync_presence(classroom_id, room)

                if not teacher:
                    uid = current_user.id
                    student_prefix = f"s/{uid}/"

                    # Hydrate from DB when live memory has no answers for this student
                    # (covers server restart and first-ever join)
                    has_live_answers = any(k.startswith(student_prefix) for k in room["patches"])
                    if not has_live_answers:
                        saved = _load_latest_answers_for_student(
                            classroom_id=classroom_id,
                            student_id=uid,
                        )
                        for exercise_key, value in saved.items():
                            scoped = f"{student_prefix}{exercise_key}"
                            if scoped not in room["patches"]:
                                room["patches"][scoped] = value
                        if saved:
                            logger.debug(
                                "DB-hydrated %d answers for student=%s classroom=%s",
                                len(saved), uid, classroom_id,
                            )

                    # Send personalised snapshot: own answers as plain "ex/…" keys
                    personal = _build_student_snapshot(room["patches"], uid)
                    await _send_json(websocket, {"type": "snapshot", "patches": personal})
                else:
                    # Teachers get the full raw snapshot (all scoped keys visible)
                    await _send_json(websocket, {"type": "snapshot", "patches": room["patches"]})

                logger.debug(
                    "User %s joined live room %s (teacher=%s, snapshot_keys=%d)",
                    current_user.id, classroom_id, teacher, len(room["patches"]),
                )

            # ── patch ────────────────────────────────────────────────────────
            elif msg_type == "patch":
                key: str = msg.get("key", "")
                value: Any = msg.get("value")
                is_correct: Optional[bool] = msg.get("is_correct")

                # Lesson context (optional, forwarded by LiveSessionProvider)
                unit_id: Optional[int]    = _int_or_none(msg.get("unit_id"))
                segment_id: Optional[int] = _int_or_none(msg.get("segment_id"))

                if not key:
                    continue

                # ── Teacher targeted (single student) ─────────────────────────
                if teacher and "target_student_id" in msg:
                    try:
                        target_uid = int(msg["target_student_id"])
                    except (ValueError, TypeError):
                        continue

                    scoped_key = f"s/{target_uid}/{key}"
                    room["patches"][scoped_key] = value

                    student_frame = {"type": "patch", "key": key, "value": value}
                    dead: set[WebSocket] = set()
                    for sw in list(room["student_conns"].get(target_uid, set())):
                        try:
                            await sw.send_text(json.dumps(student_frame))
                        except Exception:
                            dead.add(sw)
                    if dead:
                        room["student_conns"].get(target_uid, set()).difference_update(dead)
                        room["connections"] -= dead

                    teacher_echo = {"type": "patch", "key": scoped_key, "value": value}
                    for tw in list(room["teacher_conns"]):
                        await _send_json(tw, teacher_echo)

                    _, logical_key, block_id, field_key = _parse_exercise_key(key)
                    if logical_key and block_id and field_key:
                        _save_answer_event(
                            classroom_id=classroom_id,
                            student_id=target_uid,
                            unit_id=unit_id,
                            segment_id=segment_id,
                            exercise_key=logical_key,
                            block_id=block_id,
                            field_key=field_key,
                            value=value,
                            is_correct=is_correct,
                            written_by_teacher=True,
                            is_broadcast=False,
                        )

                    logger.debug(
                        "Teacher targeted: classroom=%s key=%s → student=%s unit=%s segment=%s",
                        classroom_id, key, target_uid, unit_id, segment_id,
                    )

                # ── Teacher broadcast (all students) ──────────────────────────
                elif teacher:
                    room["patches"][key] = value
                    await _broadcast(
                        classroom_id,
                        {"type": "patch", "key": key, "value": value},
                        exclude=websocket,
                    )

                    _, logical_key, block_id, field_key = _parse_exercise_key(key)
                    if logical_key and block_id and field_key:
                        for sid in list(room["student_conns"].keys()):
                            _save_answer_event(
                                classroom_id=classroom_id,
                                student_id=sid,
                                unit_id=unit_id,
                                segment_id=segment_id,
                                exercise_key=logical_key,
                                block_id=block_id,
                                field_key=field_key,
                                value=value,
                                is_correct=is_correct,
                                written_by_teacher=True,
                                is_broadcast=True,
                            )

                    logger.debug(
                        "Teacher broadcast: classroom=%s key=%s students=%s unit=%s segment=%s",
                        classroom_id, key, list(room["student_conns"].keys()), unit_id, segment_id,
                    )

                # ── Student patch ─────────────────────────────────────────────
                else:
                    room["patches"][key] = value
                    await _broadcast(
                        classroom_id,
                        {"type": "patch", "key": key, "value": value},
                        exclude=websocket,
                    )

                    sid_from_key, logical_key, block_id, field_key = _parse_exercise_key(key)
                    if sid_from_key and logical_key and block_id and field_key:
                        _save_answer_event(
                            classroom_id=classroom_id,
                            student_id=sid_from_key,
                            unit_id=unit_id,
                            segment_id=segment_id,
                            exercise_key=logical_key,
                            block_id=block_id,
                            field_key=field_key,
                            value=value,
                            is_correct=is_correct,
                            written_by_teacher=False,
                            is_broadcast=False,
                        )

                    logger.debug(
                        "Student patch: classroom=%s key=%s user=%s unit=%s segment=%s",
                        classroom_id, key, current_user.id, unit_id, segment_id,
                    )

            # ── heartbeat ────────────────────────────────────────────────────
            elif msg_type == "heartbeat":
                pass

            else:
                logger.debug("Unknown live message type: %s", msg_type)

    except WebSocketDisconnect:
        logger.info("Live WS disconnected: user=%s classroom=%s", current_user.id, classroom_id)
    except Exception as exc:
        logger.exception("Unhandled error in live WS: %s", exc)
    finally:
        room["connections"].discard(websocket)
        if teacher:
            room["teacher_conns"].discard(websocket)
        else:
            uid = current_user.id
            bucket = room["student_conns"].get(uid)
            if bucket:
                bucket.discard(websocket)
                if not bucket:
                    del room["student_conns"][uid]

        if joined:
            room["users"].pop(current_user.id, None)
            await _sync_presence(classroom_id, room)

        if not room["connections"]:
            _rooms.pop(classroom_id, None)
            logger.debug("Live room %s removed (no more connections)", classroom_id)