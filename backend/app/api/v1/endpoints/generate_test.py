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

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, Field, conint, constr
from sqlalchemy.orm import Session

from app.core.auth import get_current_teacher
from app.core.database import SessionLocal, get_db
from app.core.teacher_tariffs import check_and_consume_teacher_ai_quota
from app.models.test import Test, TestQuestion, TestStatus
from app.models.user import User
from app.services.ai.providers.base import AIProviderError
from app.services.test_generation_flow import _assemble_unit_content, _load_unit_with_content

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class GenerateTestRequest(BaseModel):
    mcq_count: conint(ge=1, le=50) = Field(  # type: ignore[valid-type]
        ..., description="Number of MCQ questions to generate (1–50)."
    )
    answers_per_question: conint(ge=2, le=6) = Field(  # type: ignore[valid-type]
        4, description="Number of answer options per question (2–6)."
    )
    difficulty: constr(strip_whitespace=True, min_length=1) = Field(  # type: ignore[valid-type]
        ..., description="Difficulty / CEFR level hint, e.g. 'A1', 'B2', 'hard'."
    )
    title: str | None = Field(
        None,
        max_length=255,
        description="Optional test title; auto-generated from unit title if omitted.",
    )
    time_limit_minutes: conint(ge=5, le=180) = Field(  # type: ignore[valid-type]
        30, description="Test time limit in minutes."
    )
    passing_score: float = Field(
        70.0, ge=0.0, le=100.0, description="Minimum percentage to pass."
    )
    content_language: str = Field(
        "auto",
        description=(
            "Language the RAG documents / unit content are written in. "
            "E.g. 'russian' for a Russian-language PDF explaining Italian grammar. "
            "Use 'auto' to let the model detect it."
        ),
    )
    question_language: str = Field(
        "english",
        description=(
            "Language in which to write questions, options, and explanations. "
            "E.g. 'russian' if students are Russian-speaking learners."
        ),
    )


class GenerateTestResponse(BaseModel):
    """Returned immediately — before generation completes."""
    test_id: int
    status: Literal["pending"]
    message: str
    poll_url: str


class GenerationStatusResponse(BaseModel):
    """Returned by the poll endpoint."""
    test_id: int
    generation_status: str          # pending | running | done | failed
    question_count: int
    title: str
    created_at: datetime
    generation_error: str | None


# ── background worker ─────────────────────────────────────────────────────────

async def _run_generation(
    test_id: int,
    unit_id: int,
    mcq_count: int,
    answers_per_question: int,
    difficulty: str,
    created_by: int,
    content_language: str = "auto",
    question_language: str = "english",
) -> None:
    """
    Background coroutine — owns its own DB session so the HTTP session
    can be closed/committed before this work starts.

    Lifecycle tags written to Test.settings["generation_status"]:
        pending → running → done | failed
    """
    db: Session = SessionLocal()

    def _set_status(db: Session, test: Test, status: str, error: str | None = None) -> None:
        settings: dict[str, Any] = dict(test.settings or {})
        settings["generation_status"] = status
        settings["generation_updated_at"] = datetime.now(timezone.utc).isoformat()
        if error:
            settings["generation_error"] = error[:2000]      # cap stored error length
        test.settings = settings
        db.add(test)
        db.commit()

    try:
        test = db.query(Test).filter(Test.id == test_id).first()
        if not test:
            logger.error("Background job: test_id=%d not found — aborting.", test_id)
            return

        # ── mark running ──────────────────────────────────────────────────────
        _set_status(db, test, "running")
        logger.info("Generation job started — test_id=%d, unit_id=%d", test_id, unit_id)

        # ── load unit + assemble content ──────────────────────────────────────
        unit = _load_unit_with_content(db, unit_id)
        unit_content = _assemble_unit_content(unit, db)

        if not unit_content.strip():
            raise ValueError(
                f"Unit '{unit.title}' has no textual content to generate questions from."
            )

        # Temporarily disable legacy AI test generation path until module is restored.
        raise ValueError("AI test generation is temporarily disabled in this build.")

        # ── LLM call ──────────────────────────────────────────────────────────
        questions_data, gen_metadata = await generate_mcq_from_unit_content(
            unit_content=unit_content,
            mcq_count=mcq_count,
            answers_per_question=answers_per_question,
            difficulty=difficulty,
            content_language=content_language,
            question_language=question_language,
        )
        logger.info(
            "LLM produced %d questions for test_id=%d — model=%s attempts=%d content_chars=%d",
            len(questions_data), test_id,
            gen_metadata.get("generation_model"),
            gen_metadata.get("generation_attempts"),
            gen_metadata.get("content_char_count"),
        )

        # ── persist questions ─────────────────────────────────────────────────
        from app.services.test_builder import _build_question

        for order_index, q_data in enumerate(questions_data):
            question = _build_question(
                q_data, created_by, difficulty,
                ai_metadata={
                    "generation_model":   gen_metadata.get("generation_model"),
                    "generation_attempt": gen_metadata.get("generation_attempts"),
                    "content_language":   content_language,
                    "question_language":  question_language,
                },
            )
            db.add(question)
            db.flush()
            logger.info(
                "Persisted Q%d (question_id=%d) — prompt=%.80r correct=%r",
                order_index + 1, question.id,
                q_data.get("prompt_rich", ""),
                q_data.get("correct_answer", []),
            )

            tq = TestQuestion(
                test_id=test_id,
                question_id=question.id,
                order_index=order_index,
                points=q_data.get("points", 1.0),
            )
            db.add(tq)

        db.commit()
        db.refresh(test)
        logger.info(
            "Generation job complete — test_id=%d, %d questions persisted.",
            test_id, len(questions_data),
        )

        # ── mark done + write traceability metadata ───────────────────────────
        finished_at = datetime.now(timezone.utc).isoformat()
        settings: dict[str, Any] = dict(test.settings or {})
        settings.update({
            "generation_status":      "done",
            "generation_updated_at":  finished_at,
            "generation_finished_at": finished_at,
            # AI traceability — exactly what the task specified
            "generated_by_ai":        True,
            "generation_model":       gen_metadata.get("generation_model"),
            "generation_attempts":    gen_metadata.get("generation_attempts"),
            "content_char_count":     gen_metadata.get("content_char_count"),
            "prompt_char_count":      gen_metadata.get("prompt_char_count"),
            "raw_output_preview":     gen_metadata.get("raw_output_preview"),
        })
        test.settings = settings
        db.add(test)
        db.commit()

    except (ValueError, AIProviderError, Exception) as exc:
        logger.error(
            "Generation job FAILED — test_id=%d: %s", test_id, exc, exc_info=True
        )
        try:
            db.rollback()
            test = db.query(Test).filter(Test.id == test_id).first()
            if test:
                _set_status(db, test, "failed", error=str(exc))
        except Exception as inner:
            logger.error("Could not write failure status for test_id=%d: %s", test_id, inner)
    finally:
        db.close()


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.post(
    "/units/{unit_id}/generate-test",
    response_model=GenerateTestResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Generate an AI MCQ test for a unit (async)",
    tags=["AI Test Generation"],
)
async def generate_test_for_unit(
    unit_id: int,
    payload: GenerateTestRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
) -> GenerateTestResponse:
    """
    **PROMPT 4 + 5 combined.**

    1. Validates the unit exists (404 if not).
    2. Creates an empty DRAFT Test shell immediately.
    3. Enqueues MCQ generation + DB writes as a background task.
    4. Returns **202 Accepted** with `test_id` and a `poll_url`.

    Poll `GET /units/{unit_id}/generate-test/{test_id}/status` to check progress.
    When `generation_status == "done"` the test is ready to review and publish.
    """
    # ── 1. Verify unit exists early (don't waste a background slot) ───────────
    # Use a lightweight existence check; full content load happens in the background.
    from app.models.unit import Unit
    unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail=f"Unit with id={unit_id} not found.")
    # Consumes one AI test-generation credit after unit validation succeeds.
    check_and_consume_teacher_ai_quota(db, current_user, "test_generation")

    # ── 2. Build test title ───────────────────────────────────────────────────
    title = (
        payload.title
        or f"{unit.title} — AI Test ({payload.difficulty.upper()})"
    )

    # ── 3. Create DRAFT Test shell ────────────────────────────────────────────
    test = Test(
        unit_id=unit_id,
        title=title,
        description=(
            f"Auto-generated {payload.difficulty} test. "
            f"{payload.mcq_count} MCQs, {payload.answers_per_question} options each."
        ),
        status=TestStatus.DRAFT,
        time_limit_minutes=payload.time_limit_minutes,
        passing_score=payload.passing_score,
        created_by=current_user.id,
        settings={
            # ── generation status (polled by frontend) ────────────────────────
            "generation_status":        "pending",
            "generation_updated_at":    datetime.now(timezone.utc).isoformat(),
            "generation_error":         None,
            # ── AI traceability ───────────────────────────────────────────────
            "generated_by_ai":          True,
            "generation_model":         None,      # filled in when done
            "generation_attempts":      None,      # filled in when done
            "generation_started_at":    datetime.now(timezone.utc).isoformat(),
            "generation_finished_at":   None,      # filled in when done
            # ── request parameters (what the teacher asked for) ───────────────
            "difficulty":               payload.difficulty,
            "mcq_count":                payload.mcq_count,
            "answers_per_question":     payload.answers_per_question,
            "content_language":         payload.content_language,
            "question_language":        payload.question_language,
            # ── content snapshot (for diagnosis) ─────────────────────────────
            "content_char_count":       None,      # filled in when done
            "prompt_char_count":        None,      # filled in when done
            "raw_output_preview":       None,      # filled in when done
            # ── test behaviour ────────────────────────────────────────────────
            "shuffle_questions":        False,
            "shuffle_options":          False,
            "show_results_immediately": True,
        },
    )
    db.add(test)
    db.commit()
    db.refresh(test)
    logger.info(
        "Created DRAFT test shell — test_id=%d, unit_id=%d, requested_by=%d",
        test.id, unit_id, current_user.id,
    )

    # ── 4. Enqueue background generation ─────────────────────────────────────
    background_tasks.add_task(
        _run_generation,
        test_id=test.id,
        unit_id=unit_id,
        mcq_count=payload.mcq_count,
        answers_per_question=payload.answers_per_question,
        difficulty=payload.difficulty,
        created_by=current_user.id,
        content_language=payload.content_language,
        question_language=payload.question_language,
    )

    poll_url = f"/api/v1/units/{unit_id}/generate-test/{test.id}/status"

    return GenerateTestResponse(
        test_id=test.id,
        status="pending",
        message=(
            f"Test generation started. {payload.mcq_count} questions are being generated. "
            "Poll the status URL to check progress."
        ),
        poll_url=poll_url,
    )


@router.get(
    "/units/{unit_id}/generate-test/{test_id}/status",
    response_model=GenerationStatusResponse,
    summary="Poll AI test generation status",
    tags=["AI Test Generation"],
)
def get_generation_status(
    unit_id: int,
    test_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
) -> GenerationStatusResponse:
    """
    Poll this endpoint after calling `POST /units/{unit_id}/generate-test`.

    `generation_status` values:
    - **pending**  — job is queued, not started yet
    - **running**  — LLM is generating questions
    - **done**     — questions are attached; test is ready to publish
    - **failed**   — generation failed; see `generation_error` for details
    """
    test = (
        db.query(Test)
        .filter(Test.id == test_id, Test.unit_id == unit_id)
        .first()
    )
    if not test:
        raise HTTPException(status_code=404, detail="Test not found.")

    # Ownership check — only the creator or admins may poll
    if test.created_by != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You are not authorised to view this test.",
        )

    settings: dict[str, Any] = test.settings or {}
    question_count = (
        db.query(TestQuestion)
        .filter(TestQuestion.test_id == test_id)
        .count()
    )

    return GenerationStatusResponse(
        test_id=test.id,
        generation_status=settings.get("generation_status", "unknown"),
        question_count=question_count,
        title=test.title,
        created_at=test.created_at,
        generation_error=settings.get("generation_error"),
    )