"""
app/api/v1/endpoints/generate_test.py

POST /units/{unit_id}/generate-test

Implements PROMPT 4 + PROMPT 5:
  - Teacher-only auth
  - Immediately creates a DRAFT Test shell and returns its ID (202 Accepted)
  - Runs MCQ generation + question persistence in a FastAPI BackgroundTask
  - Updates Test.settings["generation_status"] during the lifecycle:
      "pending"   → job queued
      "running"   → LLM + DB writes in progress
      "done"      → questions attached, ready to review/publish
      "failed"    → error detail stored in settings["generation_error"]
  - GET /units/{unit_id}/generate-test/{test_id}/status  — poll endpoint

Why BackgroundTask instead of blocking?
  LLaMA generation can take 15–60 s.  Returning 202 immediately keeps the
  HTTP connection short and lets the frontend poll for completion.
"""

# ── LEGACY FILE — generate_test.py ────────────────────────────────────────────
# Architecture change: AI test generation now happens through the segment block
# editor.  exercise_generation_flow.py writes test_without_timer /
# test_with_timer blocks directly into Segment.media_blocks JSONB instead of
# creating legacy Test ORM rows.
#
# Old path:  POST /units/{unit_id}/generate-test
#            → test_generation_flow.py → creates Test + TestQuestion rows
# New path:  segment block editor UI → exercise_generation_flow.py
#            → writes test_without_timer / test_with_timer blocks into
#              Segment.media_blocks JSONB
#
# This file is fully commented out and kept for reference during migration.
# ─────────────────────────────────────────────────────────────────────────────

# LEGACY: from __future__ import annotations

# LEGACY: import logging
# LEGACY: from datetime import datetime, timezone
# LEGACY: from typing import Any, Literal

# LEGACY: from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
# LEGACY: from pydantic import BaseModel, Field, conint, constr
# LEGACY: from sqlalchemy.orm import Session

# LEGACY: from app.core.auth import get_current_teacher
# LEGACY: from app.core.database import SessionLocal, get_db
# LEGACY: from app.core.teacher_tariffs import check_and_consume_teacher_ai_quota
# LEGACY: from app.models.test import Test, TestQuestion, TestStatus
# LEGACY: from app.models.user import User
# LEGACY: from app.services.ai.providers.base import AIProviderError
# LEGACY: from app.services.test_generation_flow import _assemble_unit_content, _load_unit_with_content

# LEGACY: logger = logging.getLogger(__name__)

from fastapi import APIRouter

router = APIRouter()


# LEGACY: # ── Pydantic schemas ──────────────────────────────────────────────────────────

# LEGACY: class GenerateTestRequest(BaseModel):
# LEGACY:     mcq_count: conint(ge=1, le=50) = Field(  # type: ignore[valid-type]
# LEGACY:         ..., description="Number of MCQ questions to generate (1–50)."
# LEGACY:     )
# LEGACY:     answers_per_question: conint(ge=2, le=6) = Field(  # type: ignore[valid-type]
# LEGACY:         4, description="Number of answer options per question (2–6)."
# LEGACY:     )
# LEGACY:     difficulty: constr(strip_whitespace=True, min_length=1) = Field(  # type: ignore[valid-type]
# LEGACY:         ..., description="Difficulty / CEFR level hint, e.g. 'A1', 'B2', 'hard'."
# LEGACY:     )
# LEGACY:     title: str | None = Field(
# LEGACY:         None,
# LEGACY:         max_length=255,
# LEGACY:         description="Optional test title; auto-generated from unit title if omitted.",
# LEGACY:     )
# LEGACY:     time_limit_minutes: conint(ge=5, le=180) = Field(  # type: ignore[valid-type]
# LEGACY:         30, description="Test time limit in minutes."
# LEGACY:     )
# LEGACY:     passing_score: float = Field(
# LEGACY:         70.0, ge=0.0, le=100.0, description="Minimum percentage to pass."
# LEGACY:     )
# LEGACY:     content_language: str = Field(
# LEGACY:         "auto",
# LEGACY:         description=(
# LEGACY:             "Language the RAG documents / unit content are written in. "
# LEGACY:             "E.g. 'russian' for a Russian-language PDF explaining Italian grammar. "
# LEGACY:             "Use 'auto' to let the model detect it."
# LEGACY:         ),
# LEGACY:     )
# LEGACY:     question_language: str = Field(
# LEGACY:         "english",
# LEGACY:         description=(
# LEGACY:             "Language in which to write questions, options, and explanations. "
# LEGACY:             "E.g. 'russian' if students are Russian-speaking learners."
# LEGACY:         ),
# LEGACY:     )


# LEGACY: class GenerateTestResponse(BaseModel):
# LEGACY:     """Returned immediately — before generation completes."""
# LEGACY:     test_id: int
# LEGACY:     status: Literal["pending"]
# LEGACY:     message: str
# LEGACY:     poll_url: str


# LEGACY: class GenerationStatusResponse(BaseModel):
# LEGACY:     """Returned by the poll endpoint."""
# LEGACY:     test_id: int
# LEGACY:     generation_status: str          # pending | running | done | failed
# LEGACY:     question_count: int
# LEGACY:     title: str
# LEGACY:     created_at: datetime
# LEGACY:     generation_error: str | None


# LEGACY: # ── background worker ─────────────────────────────────────────────────────────

# LEGACY: async def _run_generation(
# LEGACY:     test_id: int,
# LEGACY:     unit_id: int,
# LEGACY:     mcq_count: int,
# LEGACY:     answers_per_question: int,
# LEGACY:     difficulty: str,
# LEGACY:     created_by: int,
# LEGACY:     content_language: str = "auto",
# LEGACY:     question_language: str = "english",
# LEGACY: ) -> None:
# LEGACY:     """
# LEGACY:     Background coroutine — owns its own DB session so the HTTP session
# LEGACY:     can be closed/committed before this work starts.

# LEGACY:     Lifecycle tags written to Test.settings["generation_status"]:
# LEGACY:         pending → running → done | failed
# LEGACY:     """
# LEGACY:     db: Session = SessionLocal()

# LEGACY:     def _set_status(db: Session, test: Test, status: str, error: str | None = None) -> None:
# LEGACY:         settings: dict[str, Any] = dict(test.settings or {})
# LEGACY:         settings["generation_status"] = status
# LEGACY:         settings["generation_updated_at"] = datetime.now(timezone.utc).isoformat()
# LEGACY:         if error:
# LEGACY:             settings["generation_error"] = error[:2000]      # cap stored error length
# LEGACY:         test.settings = settings
# LEGACY:         db.add(test)
# LEGACY:         db.commit()

# LEGACY:     try:
# LEGACY:         test = db.query(Test).filter(Test.id == test_id).first()
# LEGACY:         if not test:
# LEGACY:             logger.error("Background job: test_id=%d not found — aborting.", test_id)
# LEGACY:             return

# LEGACY:         # ── mark running ──────────────────────────────────────────────────────
# LEGACY:         _set_status(db, test, "running")
# LEGACY:         logger.info("Generation job started — test_id=%d, unit_id=%d", test_id, unit_id)

# LEGACY:         # ── load unit + assemble content ──────────────────────────────────────
# LEGACY:         unit = _load_unit_with_content(db, unit_id)
# LEGACY:         unit_content = _assemble_unit_content(unit, db)

# LEGACY:         if not unit_content.strip():
# LEGACY:             raise ValueError(
# LEGACY:                 f"Unit '{unit.title}' has no textual content to generate questions from."
# LEGACY:             )

# LEGACY:         # Temporarily disable legacy AI test generation path until module is restored.
# LEGACY:         raise ValueError("AI test generation is temporarily disabled in this build.")

# LEGACY:         # ── LLM call ──────────────────────────────────────────────────────────
# LEGACY:         questions_data, gen_metadata = await generate_mcq_from_unit_content(
# LEGACY:             unit_content=unit_content,
# LEGACY:             mcq_count=mcq_count,
# LEGACY:             answers_per_question=answers_per_question,
# LEGACY:             difficulty=difficulty,
# LEGACY:             content_language=content_language,
# LEGACY:             question_language=question_language,
# LEGACY:         )
# LEGACY:         logger.info(
# LEGACY:             "LLM produced %d questions for test_id=%d — model=%s attempts=%d content_chars=%d",
# LEGACY:             len(questions_data), test_id,
# LEGACY:             gen_metadata.get("generation_model"),
# LEGACY:             gen_metadata.get("generation_attempts"),
# LEGACY:             gen_metadata.get("content_char_count"),
# LEGACY:         )

# LEGACY:         # ── persist questions ─────────────────────────────────────────────────
# LEGACY:         from app.services.test_builder import _build_question

# LEGACY:         for order_index, q_data in enumerate(questions_data):
# LEGACY:             question = _build_question(
# LEGACY:                 q_data, created_by, difficulty,
# LEGACY:                 ai_metadata={
# LEGACY:                     "generation_model":   gen_metadata.get("generation_model"),
# LEGACY:                     "generation_attempt": gen_metadata.get("generation_attempts"),
# LEGACY:                     "content_language":   content_language,
# LEGACY:                     "question_language":  question_language,
# LEGACY:                 },
# LEGACY:             )
# LEGACY:             db.add(question)
# LEGACY:             db.flush()
# LEGACY:             logger.info(
# LEGACY:                 "Persisted Q%d (question_id=%d) — prompt=%.80r correct=%r",
# LEGACY:                 order_index + 1, question.id,
# LEGACY:                 q_data.get("prompt_rich", ""),
# LEGACY:                 q_data.get("correct_answer", []),
# LEGACY:             )

# LEGACY:             tq = TestQuestion(
# LEGACY:                 test_id=test_id,
# LEGACY:                 question_id=question.id,
# LEGACY:                 order_index=order_index,
# LEGACY:                 points=q_data.get("points", 1.0),
# LEGACY:             )
# LEGACY:             db.add(tq)

# LEGACY:         db.commit()
# LEGACY:         db.refresh(test)
# LEGACY:         logger.info(
# LEGACY:             "Generation job complete — test_id=%d, %d questions persisted.",
# LEGACY:             test_id, len(questions_data),
# LEGACY:         )

# LEGACY:         # ── mark done + write traceability metadata ───────────────────────────
# LEGACY:         finished_at = datetime.now(timezone.utc).isoformat()
# LEGACY:         settings: dict[str, Any] = dict(test.settings or {})
# LEGACY:         settings.update({
# LEGACY:             "generation_status":      "done",
# LEGACY:             "generation_updated_at":  finished_at,
# LEGACY:             "generation_finished_at": finished_at,
# LEGACY:             # AI traceability — exactly what the task specified
# LEGACY:             "generated_by_ai":        True,
# LEGACY:             "generation_model":       gen_metadata.get("generation_model"),
# LEGACY:             "generation_attempts":    gen_metadata.get("generation_attempts"),
# LEGACY:             "content_char_count":     gen_metadata.get("content_char_count"),
# LEGACY:             "prompt_char_count":      gen_metadata.get("prompt_char_count"),
# LEGACY:             "raw_output_preview":     gen_metadata.get("raw_output_preview"),
# LEGACY:         })
# LEGACY:         test.settings = settings
# LEGACY:         db.add(test)
# LEGACY:         db.commit()

# LEGACY:     except (ValueError, AIProviderError, Exception) as exc:
# LEGACY:         logger.error(
# LEGACY:             "Generation job FAILED — test_id=%d: %s", test_id, exc, exc_info=True
# LEGACY:         )
# LEGACY:         try:
# LEGACY:             db.rollback()
# LEGACY:             test = db.query(Test).filter(Test.id == test_id).first()
# LEGACY:             if test:
# LEGACY:                 _set_status(db, test, "failed", error=str(exc))
# LEGACY:         except Exception as inner:
# LEGACY:             logger.error("Could not write failure status for test_id=%d: %s", test_id, inner)
# LEGACY:     finally:
# LEGACY:         db.close()


# LEGACY: # ── endpoints ─────────────────────────────────────────────────────────────────

# LEGACY: @router.post(
# LEGACY:     "/units/{unit_id}/generate-test",
# LEGACY:     response_model=GenerateTestResponse,
# LEGACY:     status_code=status.HTTP_202_ACCEPTED,
# LEGACY:     summary="Generate an AI MCQ test for a unit (async)",
# LEGACY:     tags=["AI Test Generation"],
# LEGACY: )
# LEGACY: async def generate_test_for_unit(
# LEGACY:     unit_id: int,
# LEGACY:     payload: GenerateTestRequest,
# LEGACY:     background_tasks: BackgroundTasks,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db),
# LEGACY: ) -> GenerateTestResponse:
# LEGACY:     """
# LEGACY:     **PROMPT 4 + 5 combined.**

# LEGACY:     1. Validates the unit exists (404 if not).
# LEGACY:     2. Creates an empty DRAFT Test shell immediately.
# LEGACY:     3. Enqueues MCQ generation + DB writes as a background task.
# LEGACY:     4. Returns **202 Accepted** with `test_id` and a `poll_url`.

# LEGACY:     Poll `GET /units/{unit_id}/generate-test/{test_id}/status` to check progress.
# LEGACY:     When `generation_status == "done"` the test is ready to review and publish.
# LEGACY:     """
# LEGACY:     # ── 1. Verify unit exists early (don't waste a background slot) ───────────
# LEGACY:     # Use a lightweight existence check; full content load happens in the background.
# LEGACY:     from app.models.unit import Unit
# LEGACY:     unit = db.query(Unit).filter(Unit.id == unit_id).first()
# LEGACY:     if not unit:
# LEGACY:         raise HTTPException(status_code=404, detail=f"Unit with id={unit_id} not found.")
# LEGACY:     # Consumes one AI test-generation credit after unit validation succeeds.
# LEGACY:     check_and_consume_teacher_ai_quota(db, current_user, "test_generation")

# LEGACY:     # ── 2. Build test title ───────────────────────────────────────────────────
# LEGACY:     title = (
# LEGACY:         payload.title
# LEGACY:         or f"{unit.title} — AI Test ({payload.difficulty.upper()})"
# LEGACY:     )

# LEGACY:     # ── 3. Create DRAFT Test shell ────────────────────────────────────────────
# LEGACY:     test = Test(
# LEGACY:         unit_id=unit_id,
# LEGACY:         title=title,
# LEGACY:         description=(
# LEGACY:             f"Auto-generated {payload.difficulty} test. "
# LEGACY:             f"{payload.mcq_count} MCQs, {payload.answers_per_question} options each."
# LEGACY:         ),
# LEGACY:         status=TestStatus.DRAFT,
# LEGACY:         time_limit_minutes=payload.time_limit_minutes,
# LEGACY:         passing_score=payload.passing_score,
# LEGACY:         created_by=current_user.id,
# LEGACY:         settings={
# LEGACY:             # ── generation status (polled by frontend) ────────────────────────
# LEGACY:             "generation_status":        "pending",
# LEGACY:             "generation_updated_at":    datetime.now(timezone.utc).isoformat(),
# LEGACY:             "generation_error":         None,
# LEGACY:             # ── AI traceability ───────────────────────────────────────────────
# LEGACY:             "generated_by_ai":          True,
# LEGACY:             "generation_model":         None,      # filled in when done
# LEGACY:             "generation_attempts":      None,      # filled in when done
# LEGACY:             "generation_started_at":    datetime.now(timezone.utc).isoformat(),
# LEGACY:             "generation_finished_at":   None,      # filled in when done
# LEGACY:             # ── request parameters (what the teacher asked for) ───────────────
# LEGACY:             "difficulty":               payload.difficulty,
# LEGACY:             "mcq_count":                payload.mcq_count,
# LEGACY:             "answers_per_question":     payload.answers_per_question,
# LEGACY:             "content_language":         payload.content_language,
# LEGACY:             "question_language":        payload.question_language,
# LEGACY:             # ── content snapshot (for diagnosis) ─────────────────────────────
# LEGACY:             "content_char_count":       None,      # filled in when done
# LEGACY:             "prompt_char_count":        None,      # filled in when done
# LEGACY:             "raw_output_preview":       None,      # filled in when done
# LEGACY:             # ── test behaviour ────────────────────────────────────────────────
# LEGACY:             "shuffle_questions":        False,
# LEGACY:             "shuffle_options":          False,
# LEGACY:             "show_results_immediately": True,
# LEGACY:         },
# LEGACY:     )
# LEGACY:     db.add(test)
# LEGACY:     db.commit()
# LEGACY:     db.refresh(test)
# LEGACY:     logger.info(
# LEGACY:         "Created DRAFT test shell — test_id=%d, unit_id=%d, requested_by=%d",
# LEGACY:         test.id, unit_id, current_user.id,
# LEGACY:     )

# LEGACY:     # ── 4. Enqueue background generation ─────────────────────────────────────
# LEGACY:     background_tasks.add_task(
# LEGACY:         _run_generation,
# LEGACY:         test_id=test.id,
# LEGACY:         unit_id=unit_id,
# LEGACY:         mcq_count=payload.mcq_count,
# LEGACY:         answers_per_question=payload.answers_per_question,
# LEGACY:         difficulty=payload.difficulty,
# LEGACY:         created_by=current_user.id,
# LEGACY:         content_language=payload.content_language,
# LEGACY:         question_language=payload.question_language,
# LEGACY:     )

# LEGACY:     poll_url = f"/api/v1/units/{unit_id}/generate-test/{test.id}/status"

# LEGACY:     return GenerateTestResponse(
# LEGACY:         test_id=test.id,
# LEGACY:         status="pending",
# LEGACY:         message=(
# LEGACY:             f"Test generation started. {payload.mcq_count} questions are being generated. "
# LEGACY:             "Poll the status URL to check progress."
# LEGACY:         ),
# LEGACY:         poll_url=poll_url,
# LEGACY:     )


# LEGACY: @router.get(
# LEGACY:     "/units/{unit_id}/generate-test/{test_id}/status",
# LEGACY:     response_model=GenerationStatusResponse,
# LEGACY:     summary="Poll AI test generation status",
# LEGACY:     tags=["AI Test Generation"],
# LEGACY: )
# LEGACY: def get_generation_status(
# LEGACY:     unit_id: int,
# LEGACY:     test_id: int,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db),
# LEGACY: ) -> GenerationStatusResponse:
# LEGACY:     """
# LEGACY:     Poll this endpoint after calling `POST /units/{unit_id}/generate-test`.

# LEGACY:     `generation_status` values:
# LEGACY:     - **pending**  — job is queued, not started yet
# LEGACY:     - **running**  — LLM is generating questions
# LEGACY:     - **done**     — questions are attached; test is ready to publish
# LEGACY:     - **failed**   — generation failed; see `generation_error` for details
# LEGACY:     """
# LEGACY:     test = (
# LEGACY:         db.query(Test)
# LEGACY:         .filter(Test.id == test_id, Test.unit_id == unit_id)
# LEGACY:         .first()
# LEGACY:     )
# LEGACY:     if not test:
# LEGACY:         raise HTTPException(status_code=404, detail="Test not found.")

# LEGACY:     # Ownership check — only the creator or admins may poll
# LEGACY:     if test.created_by != current_user.id:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=403,
# LEGACY:             detail="You are not authorised to view this test.",
# LEGACY:         )

# LEGACY:     settings: dict[str, Any] = test.settings or {}
# LEGACY:     question_count = (
# LEGACY:         db.query(TestQuestion)
# LEGACY:         .filter(TestQuestion.test_id == test_id)
# LEGACY:         .count()
# LEGACY:     )

# LEGACY:     return GenerationStatusResponse(
# LEGACY:         test_id=test.id,
# LEGACY:         generation_status=settings.get("generation_status", "unknown"),
# LEGACY:         question_count=question_count,
# LEGACY:         title=test.title,
# LEGACY:         created_at=test.created_at,
# LEGACY:         generation_error=settings.get("generation_error"),
# LEGACY:     )
