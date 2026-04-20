"""
app/api/v1/endpoints/generate_tasks.py

POST /units/{unit_id}/generate-tasks

Synchronous AI task generation endpoint.
Mirrors generate_test.py but calls the task generation pipeline
(task_generation_flow.generate_tasks_for_unit) and returns task IDs directly.

Unlike test generation, task generation is synchronous — the frontend waits
for the response before opening the Task Builder with the returned task IDs.

# TODO (future): convert to async background generation with status polling,
#                mirroring the async flow used by test generation.
# TODO (future): add generation progress reporting.
# TODO (future): add generation history / audit log per unit.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.auth import get_current_teacher
from app.core.database import get_db
from app.core.teacher_tariffs import check_and_consume_teacher_ai_quota
from app.models.user import User
from app.services.task_generation_flow import generate_tasks_for_unit

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class GenerateTasksRequest(BaseModel):
    task_count: int = Field(
        ...,
        ge=1,
        le=10,
        description="Number of tasks to generate (1–10).",
    )
    difficulty: str = Field(
        default="medium",
        description="Difficulty hint for the LLM: easy | medium | hard.",
    )
    content_language: str = Field(
        default="auto",
        description=(
            "Language the source content is written in. "
            "Use 'auto' to let the model detect it automatically."
        ),
    )
    task_language: str = Field(
        default="english",
        description="Language for task instructions and example answers.",
    )


class GenerateTasksResponse(BaseModel):
    tasks_created: int
    tasks: list[int]
    message: str


# ── endpoint ──────────────────────────────────────────────────────────────────

@router.post(
    "/units/{unit_id}/generate-tasks",
    response_model=GenerateTasksResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate AI tasks for a unit (synchronous)",
    tags=["AI Task Generation"],
)
async def generate_tasks(
    unit_id: int,
    req: GenerateTasksRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher),
) -> GenerateTasksResponse:
    """
    Generate AI-powered draft tasks for a unit and return their IDs.

    The endpoint is **synchronous** — the client waits for generation to
    complete before receiving the response.  All tasks are created in
    **DRAFT** status so the teacher can review and edit them in the
    Task Builder before publishing.

    Error responses are mapped by the service layer:
    - **404** Unit not found.
    - **400** No textual content to generate from, or AI validation failure.
    - **502** AI provider is unreachable or returned an error.
    - **500** Unexpected internal error.
    """
    # Consumes one AI task-generation credit based on the teacher's active tariff.
    check_and_consume_teacher_ai_quota(db, current_user, "task_generation")
    logger.info(
        "API request: generate_tasks unit_id=%d task_count=%d difficulty=%s user=%d",
        unit_id,
        req.task_count,
        req.difficulty,
        current_user.id,
    )

    tasks = await generate_tasks_for_unit(
        db=db,
        unit_id=unit_id,
        task_count=req.task_count,
        difficulty=req.difficulty,
        created_by=current_user.id,
        content_language=req.content_language,
        task_language=req.task_language,
    )

    return GenerateTasksResponse(
        tasks_created=len(tasks),
        tasks=[task.id for task in tasks],
        message=f"{len(tasks)} tasks generated successfully",
    )