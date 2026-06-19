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

# ── LEGACY FILE — generate_task.py ────────────────────────────────────────────
# Architecture change: AI task generation now happens through the segment block
# editor.  exercise_generation_flow.py writes exercise blocks directly into
# Segment.media_blocks JSONB instead of creating legacy Task ORM rows.
#
# Old path:  POST /units/{unit_id}/generate-tasks
#            → task_generation_flow.generate_tasks_for_unit()
#            → creates Task rows in the tasks table
# New path:  segment block editor UI → exercise_generation_flow.py
#            → writes exercise blocks into Segment.media_blocks JSONB
#
# This file is fully commented out and kept for reference during migration.
# ─────────────────────────────────────────────────────────────────────────────

# LEGACY: from __future__ import annotations

# LEGACY: import logging

# LEGACY: from fastapi import APIRouter, Depends, status
# LEGACY: from pydantic import BaseModel, Field
# LEGACY: from sqlalchemy.orm import Session

# LEGACY: from app.core.auth import get_current_teacher
# LEGACY: from app.core.database import get_db
# LEGACY: from app.core.teacher_tariffs import check_and_consume_teacher_ai_quota
# LEGACY: from app.models.user import User
# LEGACY: from app.services.task_generation_flow import generate_tasks_for_unit

# LEGACY: logger = logging.getLogger(__name__)

from fastapi import APIRouter

router = APIRouter()


# LEGACY: # ── Pydantic schemas ──────────────────────────────────────────────────────────

# LEGACY: class GenerateTasksRequest(BaseModel):
# LEGACY:     task_count: int = Field(
# LEGACY:         ...,
# LEGACY:         ge=1,
# LEGACY:         le=10,
# LEGACY:         description="Number of tasks to generate (1–10).",
# LEGACY:     )
# LEGACY:     difficulty: str = Field(
# LEGACY:         default="medium",
# LEGACY:         description="Difficulty hint for the LLM: easy | medium | hard.",
# LEGACY:     )
# LEGACY:     content_language: str = Field(
# LEGACY:         default="auto",
# LEGACY:         description=(
# LEGACY:             "Language the source content is written in. "
# LEGACY:             "Use 'auto' to let the model detect it automatically."
# LEGACY:         ),
# LEGACY:     )
# LEGACY:     task_language: str = Field(
# LEGACY:         default="english",
# LEGACY:         description="Language for task instructions and example answers.",
# LEGACY:     )


# LEGACY: class GenerateTasksResponse(BaseModel):
# LEGACY:     tasks_created: int
# LEGACY:     tasks: list[int]
# LEGACY:     message: str


# LEGACY: # ── endpoint ──────────────────────────────────────────────────────────────────

# LEGACY: @router.post(
# LEGACY:     "/units/{unit_id}/generate-tasks",
# LEGACY:     response_model=GenerateTasksResponse,
# LEGACY:     status_code=status.HTTP_200_OK,
# LEGACY:     summary="Generate AI tasks for a unit (synchronous)",
# LEGACY:     tags=["AI Task Generation"],
# LEGACY: )
# LEGACY: async def generate_tasks(
# LEGACY:     unit_id: int,
# LEGACY:     req: GenerateTasksRequest,
# LEGACY:     db: Session = Depends(get_db),
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY: ) -> GenerateTasksResponse:
# LEGACY:     """
# LEGACY:     Generate AI-powered draft tasks for a unit and return their IDs.

# LEGACY:     The endpoint is **synchronous** — the client waits for generation to
# LEGACY:     complete before receiving the response.  All tasks are created in
# LEGACY:     **DRAFT** status so the teacher can review and edit them in the
# LEGACY:     Task Builder before publishing.

# LEGACY:     Error responses are mapped by the service layer:
# LEGACY:     - **404** Unit not found.
# LEGACY:     - **400** No textual content to generate from, or AI validation failure.
# LEGACY:     - **502** AI provider is unreachable or returned an error.
# LEGACY:     - **500** Unexpected internal error.
# LEGACY:     """
# LEGACY:     # Consumes one AI task-generation credit based on the teacher's active tariff.
# LEGACY:     check_and_consume_teacher_ai_quota(db, current_user, "task_generation")
# LEGACY:     logger.info(
# LEGACY:         "API request: generate_tasks unit_id=%d task_count=%d difficulty=%s user=%d",
# LEGACY:         unit_id,
# LEGACY:         req.task_count,
# LEGACY:         req.difficulty,
# LEGACY:         current_user.id,
# LEGACY:     )

# LEGACY:     tasks = await generate_tasks_for_unit(
# LEGACY:         db=db,
# LEGACY:         unit_id=unit_id,
# LEGACY:         task_count=req.task_count,
# LEGACY:         difficulty=req.difficulty,
# LEGACY:         created_by=current_user.id,
# LEGACY:         content_language=req.content_language,
# LEGACY:         task_language=req.task_language,
# LEGACY:     )

# LEGACY:     return GenerateTasksResponse(
# LEGACY:         tasks_created=len(tasks),
# LEGACY:         tasks=[task.id for task in tasks],
# LEGACY:         message=f"{len(tasks)} tasks generated successfully",
# LEGACY:     )
