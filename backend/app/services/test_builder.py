"""
app/services/test_builder.py

Persists AI-generated MCQ data into the database.

Responsibilities
----------------
* Load and validate the target Unit.
* Create a Test record in DRAFT status.
* For each question dict produced by the AI generator:
    - Create a Question row (MULTIPLE_CHOICE).
    - Flush to obtain the Question PK.
    - Link it to the Test via TestQuestion.
* Commit the entire transaction atomically.
* Rollback cleanly on any error.

This service has NO knowledge of LLMs — it only speaks SQLAlchemy.

Correct-answer storage format
------------------------------
The auto-grader in tests.py reads:
    q.correct_answer.get("correct_option_ids", [])

So we persist the AI list  ["B"]  as  {"correct_option_ids": ["B"]}
to keep the grading pipeline working without modification.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.test import Question, QuestionType, Test, TestQuestion, TestStatus
from app.models.unit import Unit

logger = logging.getLogger(__name__)


# ── helpers ───────────────────────────────────────────────────────────────────

def _load_unit(db: Session, unit_id: int) -> Unit:
    """Return the Unit or raise ValueError if it does not exist."""
    unit: Unit | None = db.query(Unit).filter(Unit.id == unit_id).first()
    if unit is None:
        raise ValueError(f"Unit with id={unit_id} does not exist.")
    return unit


def _build_question(
    q_data: dict[str, Any],
    created_by: int,
    difficulty: str | None,
    *,
    ai_metadata: dict[str, Any] | None = None,
) -> Question:
    """
    Construct a Question ORM instance from one AI-generated dict.

    Options are stored as  [{"id": "A", "text": "..."}, ...]
    so the frontend can render option.text and the grader can match by id.

    Correct-answer format expected by the auto-grader:
        q.correct_answer.get("correct_option_ids", [])   →  ["B"]

    ai_metadata, when provided, is stored inside question_metadata under the
    "ai_generation" key so any teacher complaint can be traced back to the
    exact model run that produced the question.
    """
    prompt_rich: str = q_data["prompt_rich"]
    raw_options: list[str] = q_data["options"]
    raw_correct: list[str] = q_data["correct_answer"]
    explanation_rich: str = q_data.get("explanation_rich", "")
    level: str | None = q_data.get("difficulty") or difficulty

    options_payload: list[dict[str, str]] = [
        {"id": chr(65 + i), "text": text}
        for i, text in enumerate(raw_options)
    ]

    correct_answer_payload: dict[str, list[str]] = {
        "correct_option_ids": raw_correct
    }

    # Per-question traceability stored in question_metadata
    question_meta: dict[str, Any] = {}
    if ai_metadata:
        question_meta["ai_generation"] = {
            "model":            ai_metadata.get("generation_model"),
            "attempt":          ai_metadata.get("generation_attempt"),
            "content_language": ai_metadata.get("content_language"),
            "question_language": ai_metadata.get("question_language"),
            "generated_by_ai":  True,
        }

    return Question(
        type=QuestionType.MULTIPLE_CHOICE,
        prompt_rich=prompt_rich,
        options=options_payload,
        correct_answer=correct_answer_payload,
        explanation_rich=explanation_rich,
        level=level,
        created_by=created_by,
        autograde=True,
        shuffle_options=False,
        bank_tags=[],
        media=[],
        question_metadata=question_meta,
    )


# ── public API ────────────────────────────────────────────────────────────────

async def create_ai_generated_test(
    db: Session,
    unit_id: int,
    title: str,
    questions_data: list[dict[str, Any]],
    created_by: int,
    *,
    difficulty: str | None = None,
    points_per_question: float = 1.0,
    time_limit_minutes: int = 30,
    passing_score: float = 70.0,
    description: str | None = None,
) -> Test:
    """
    Persist AI-generated MCQ data and return the newly created Test.

    Parameters
    ----------
    db : Session
        Active SQLAlchemy session (caller manages lifecycle).
    unit_id : int
        PK of the Unit this test belongs to.
    title : str
        Test title.
    questions_data : list[dict]
        Output from ``generate_mcq_from_unit_content`` — each dict must
        contain prompt_rich, options, correct_answer, explanation_rich.
    created_by : int
        PK of the admin / instructor creating the test.
    difficulty : str | None
        Fallback difficulty label written to Question.level when the
        individual question dict does not supply one.
    points_per_question : float
        Points awarded per question in TestQuestion.points.
    time_limit_minutes : int
        Written to Test.time_limit_minutes (default 30).
    passing_score : float
        Minimum percentage to pass (default 70.0).
    description : str | None
        Optional test description.

    Returns
    -------
    Test
        The fully persisted, refreshed Test instance (DRAFT status).

    Raises
    ------
    ValueError
        If unit_id does not exist or questions_data is empty.
    SQLAlchemyError
        Re-raised after rollback on any DB error.
    """
    if not questions_data:
        raise ValueError("questions_data must not be empty.")

    # ── 1. Validate Unit ──────────────────────────────────────────────────────
    unit: Unit = _load_unit(db, unit_id)
    logger.info(
        "Building AI test for unit_id=%d ('%s') with %d questions.",
        unit.id, unit.title, len(questions_data),
    )

    try:
        # ── 2. Create Test (DRAFT) ────────────────────────────────────────────
        test = Test(
            unit_id=unit.id,
            title=title,
            description=description,
            status=TestStatus.DRAFT,
            time_limit_minutes=time_limit_minutes,
            passing_score=passing_score,
            created_by=created_by,
            settings={
                "ai_generated": True,
                "difficulty": difficulty,
                "shuffle_questions": False,
                "shuffle_options": False,
                "show_results_immediately": True,
            },
        )
        db.add(test)
        db.flush()  # obtain test.id before linking questions
        logger.debug("Test flushed — id=%d", test.id)

        # ── 3. Create Questions and TestQuestion links ─────────────────────────
        for order_index, q_data in enumerate(questions_data):
            # 3a. Build & persist Question
            question = _build_question(q_data, created_by, difficulty)
            db.add(question)
            db.flush()  # obtain question.id
            logger.debug(
                "Question flushed — id=%d, order=%d", question.id, order_index
            )

            # 3b. Link Question → Test
            test_question = TestQuestion(
                test_id=test.id,
                question_id=question.id,
                order_index=order_index,
                points=q_data.get("points", points_per_question),
            )
            db.add(test_question)

        # ── 4. Commit ─────────────────────────────────────────────────────────
        db.commit()
        db.refresh(test)
        logger.info(
            "AI test committed — test_id=%d, questions=%d, unit_id=%d",
            test.id, len(questions_data), unit_id,
        )
        return test

    except (SQLAlchemyError, Exception) as exc:
        # ── 5. Rollback on any error ──────────────────────────────────────────
        logger.error(
            "Error building AI test for unit_id=%d — rolling back. Error: %s",
            unit_id, exc, exc_info=True,
        )
        db.rollback()
        if isinstance(exc, SQLAlchemyError):
            raise
        raise