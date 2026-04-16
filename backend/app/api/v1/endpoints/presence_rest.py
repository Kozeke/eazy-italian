"""
app/api/v1/endpoints/presence_rest.py
──────────────────────────────────────
Thin REST companion to the presence WebSocket.

Routes
──────
GET  /classrooms/{classroom_id}/presence
    → Returns a JSON snapshot of who is currently online.
      Accessible to teachers only (students get an empty list via WS).

Background task
───────────────
`start_eviction_task()` – call once from your app lifespan / startup
event to periodically prune stale presence entries.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.presence_manager import presence_manager
from app.models.user import User
from app.models.course import Course

router = APIRouter()
logger = logging.getLogger(__name__)

# ─── REST snapshot endpoint ───────────────────────────────────────────────────


@router.get("/classrooms/{classroom_id}/presence")
async def get_presence_snapshot(
    classroom_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Return the list of users currently online in this classroom.
    Only teachers who own the course can call this endpoint.
    Students always use the WebSocket to receive presence data.
    """
    course = db.query(Course).filter(Course.id == classroom_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Classroom not found")

    is_teacher = (
        current_user.role.value in ("teacher", "admin")
        and (course.created_by == current_user.id or current_user.is_superuser)
    ) or current_user.is_superuser

    if not is_teacher:
        raise HTTPException(
            status_code=403,
            detail="Only teachers can view the online presence list.",
        )

    users = await presence_manager.get_users(classroom_id)
    return {
        "classroom_id": classroom_id,
        "online_count": len(users),
        "users": users,
    }


# ─── Background eviction task ─────────────────────────────────────────────────

_eviction_task: asyncio.Task | None = None


async def _eviction_loop(interval_seconds: int = 60, max_age_seconds: int = 90) -> None:
    """Periodically remove presence entries that have stopped sending heartbeats."""
    while True:
        await asyncio.sleep(interval_seconds)
        try:
            evicted = await presence_manager.evict_stale(max_age_seconds=max_age_seconds)
            if evicted:
                logger.info("Presence eviction: removed %d stale entries", evicted)
        except Exception as exc:
            logger.exception("Error in presence eviction loop: %s", exc)


def start_eviction_task(interval_seconds: int = 60, max_age_seconds: int = 90) -> None:
    """
    Launch the background eviction loop.

    Call this from your FastAPI startup event or lifespan context manager:

        @app.on_event("startup")
        async def startup():
            from app.api.v1.endpoints.presence_rest import start_eviction_task
            start_eviction_task()
    """
    global _eviction_task
    if _eviction_task is None or _eviction_task.done():
        _eviction_task = asyncio.create_task(
            _eviction_loop(
                interval_seconds=interval_seconds,
                max_age_seconds=max_age_seconds,
            )
        )
        logger.info(
            "Presence eviction task started (interval=%ds, max_age=%ds)",
            interval_seconds,
            max_age_seconds,
        )