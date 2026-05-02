"""
app/services/test_generation_flow.py

Orchestration layer — wires the AI generator and DB builder together.

Flow
----
1. Load Unit (with its videos and tasks eagerly).
2. Assemble all available textual content:
     - unit.title + unit.description + unit.goals
     - video transcripts (published videos, ordered)
     - task content / instructions (published tasks, ordered)
3. Guard against empty content — nothing useful to generate from.
4. Call generate_mcq_from_unit_content()  → list[dict]
5. Call create_ai_generated_test()         → Test
6. Return Test.

Exception mapping (caught here, re-raised as HTTPException)
------------------------------------------------------------
Unit not found          → 404
Empty content           → 400
AI validation failure   → 400  (ValueError from generator)
AI provider error       → 502  (AIProviderError — upstream LLM down)
Unexpected error        → 500
"""

from __future__ import annotations

import logging
import textwrap
from typing import Any

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session, joinedload

from app.models.test import Test
from app.models.unit import Unit
from app.models.video import Video, VideoStatus
from app.models.task import Task, TaskStatus
from app.services.ai.providers.base import AIProviderError
from app.services.test_builder import create_ai_generated_test

logger = logging.getLogger(__name__)

# ── content assembly ──────────────────────────────────────────────────────────

_SECTION_SEPARATOR = "\n\n" + "─" * 60 + "\n\n"


def _fetch_rag_chunks(db: Session, unit_id: int, max_chars: int = 12_000) -> str:
    """
    Pull raw chunk text from the ``lesson_chunks`` vector table for the given
    unit (lesson_id == unit_id).

    We ORDER BY chunk_index so the content is returned in reading order.
    We cap at *max_chars* to avoid blowing the LLM context window.

    Returns
    -------
    str
        All chunk texts joined with newlines, or empty string when no chunks
        exist for this unit.
    """
    rows = db.execute(
        text("""
            SELECT chunk_text
            FROM   lesson_chunks
            WHERE  lesson_id = :uid
            ORDER  BY chunk_index
        """),
        {"uid": unit_id},
    ).fetchall()

    if not rows:
        return ""

    chunks: list[str] = []
    total = 0
    for row in rows:
        t = (row[0] or "").strip()
        if not t:
            continue
        if total + len(t) > max_chars:
            # Append a partial chunk to fill the budget
            remaining = max_chars - total
            if remaining > 100:
                chunks.append(t[:remaining])
            break
        chunks.append(t)
        total += len(t)

    combined = "\n\n".join(chunks)
    logger.info(
        "Fetched %d RAG chunks (%d chars) for unit_id=%d",
        len(chunks), len(combined), unit_id,
    )
    return combined


def _assemble_unit_content(unit: Unit, db: Session) -> str:
    """
    Combine all available textual material from a Unit into a single string
    suitable for use as LLM context.

    Priority / order
    ----------------
    1. Unit metadata  (title, description, goals)
    2. RAG document chunks  (lesson_chunks table, ordered by chunk_index)  ← NEW
    3. Video transcripts  (published, ordered by order_index)
    4. Task content + instructions  (published, ordered by order_index)

    RAG chunks are the primary source when documents have been ingested —
    they contain the actual course material that questions should be based on.
    """
    sections: list[str] = []

    # ── 1. Unit metadata ──────────────────────────────────────────────────────
    meta_parts: list[str] = [f"UNIT: {unit.title.strip()}"]
    if unit.description and unit.description.strip():
        meta_parts.append(f"Description: {unit.description.strip()}")
    if unit.goals and unit.goals.strip():
        meta_parts.append(f"Learning Goals: {unit.goals.strip()}")
    sections.append("\n".join(meta_parts))

    # ── 2. RAG document chunks (primary content source) ───────────────────────
    rag_text = _fetch_rag_chunks(db, unit.id)
    if rag_text:
        sections.append(f"COURSE DOCUMENT CONTENT:\n{rag_text}")
        logger.debug(
            "Included RAG content for unit_id=%d (%d chars)",
            unit.id, len(rag_text),
        )

    # ── 3. Video transcripts ──────────────────────────────────────────────────
    published_videos: list[Video] = sorted(
        [v for v in unit.videos if v.status == VideoStatus.PUBLISHED and v.transcript],
        key=lambda v: v.order_index,
    )
    for video in published_videos:
        transcript = video.transcript.strip()
        if transcript:
            header = f"VIDEO TRANSCRIPT — {video.title.strip()}"
            sections.append(f"{header}\n{transcript}")
            logger.debug(
                "Included transcript for video_id=%d (%d chars)",
                video.id, len(transcript),
            )

    # ── 4. Task content + instructions ────────────────────────────────────────
    published_tasks: list[Task] = sorted(
        [t for t in unit.tasks if t.status == TaskStatus.PUBLISHED],
        key=lambda t: t.order_index,
    )
    for task in published_tasks:
        task_parts: list[str] = [f"TASK — {task.title.strip()}"]
        if task.description and task.description.strip():
            task_parts.append(task.description.strip())
        if task.content and task.content.strip():
            task_parts.append(task.content.strip())
        if task.instructions and task.instructions.strip():
            task_parts.append(f"Instructions: {task.instructions.strip()}")
        body = "\n".join(task_parts)
        if len(task_parts) > 1:
            sections.append(body)
            logger.debug("Included content for task_id=%d", task.id)

    combined = _SECTION_SEPARATOR.join(sections)
    return combined


def _load_unit_with_content(db: Session, unit_id: int) -> Unit:
    """
    Eagerly load Unit together with its videos and tasks in one query.
    Raises HTTPException 404 if not found.
    """
    unit: Unit | None = (
        db.query(Unit)
        .options(
            joinedload(Unit.videos),
            joinedload(Unit.tasks),
        )
        .filter(Unit.id == unit_id)
        .first()
    )
    if unit is None:
        raise HTTPException(status_code=404, detail=f"Unit with id={unit_id} not found.")
    return unit


# ── public API ────────────────────────────────────────────────────────────────

async def generate_test_for_unit(
    db: Session,
    unit_id: int,
    mcq_count: int,
    answers_per_question: int,
    difficulty: str,
    created_by: int,
    *,
    test_title: str | None = None,
    time_limit_minutes: int = 30,
    passing_score: float = 70.0,
) -> Test:
    """
    Full pipeline: load unit content → generate MCQs → persist test.

    Parameters
    ----------
    db : Session
        Active SQLAlchemy session.
    unit_id : int
        PK of the source Unit.
    mcq_count : int
        Number of questions to generate.
    answers_per_question : int
        Number of answer options per question (e.g. 4).
    difficulty : str
        Difficulty hint for the LLM (e.g. "easy", "medium", "hard").
    created_by : int
        PK of the admin / instructor triggering generation.
    test_title : str | None
        Override the auto-generated test title.
    time_limit_minutes : int
        Forwarded to the Test record.
    passing_score : float
        Minimum % to pass; forwarded to the Test record.

    Returns
    -------
    Test
        The fully persisted Test in DRAFT status.

    Raises
    ------
    HTTPException 404   Unit not found.
    HTTPException 400   No textual content to generate from,
                        or LLM output fails schema validation.
    HTTPException 502   The LLM provider is unreachable / errored.
    HTTPException 500   Any other unexpected failure.
    """
    logger.info(
        "Starting test generation — unit_id=%d, mcq_count=%d, difficulty=%s, created_by=%d",
        unit_id, mcq_count, difficulty, created_by,
    )

    # ── 1. Load Unit (404 raised internally if missing) ───────────────────────
    unit = _load_unit_with_content(db, unit_id)
    logger.debug("Loaded unit '%s' (id=%d)", unit.title, unit.id)

    # ── 2. Assemble content (RAG chunks + metadata + transcripts) ────────────
    unit_content = _assemble_unit_content(unit, db)

    if not unit_content.strip():
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unit '{unit.title}' has no textual content to generate questions from. "
                "Upload RAG documents via the unit page (PDF/DOCX), or publish at least "
                "one video with a transcript, or a task with content."
            ),
        )

    content_chars = len(unit_content)
    logger.info("Assembled unit content — %d chars from unit_id=%d", content_chars, unit_id)

    # Temporarily disable legacy AI test generation path until module is restored.
    raise HTTPException(
        status_code=503,
        detail="AI test generation is temporarily disabled in this build.",
    )

    # ── 3. Generate MCQs via LLM ──────────────────────────────────────────────
    try:
        questions_data: list[dict[str, Any]] = await generate_mcq_from_unit_content(
            unit_content=unit_content,
            mcq_count=mcq_count,
            answers_per_question=answers_per_question,
            difficulty=difficulty,
        )
    except ValueError as exc:
        # Schema / validation failure from the AI generator
        logger.warning("MCQ validation failed for unit_id=%d: %s", unit_id, exc)
        raise HTTPException(
            status_code=400,
            detail=f"AI output validation failed: {exc}",
        ) from exc
    except AIProviderError as exc:
        # LLM provider unreachable or returned a non-200
        logger.error("AI provider error for unit_id=%d: %s", unit_id, exc, exc_info=True)
        raise HTTPException(
            status_code=502,
            detail=f"AI provider error: {exc}",
        ) from exc
    except Exception as exc:
        logger.error("Unexpected error during MCQ generation for unit_id=%d: %s", unit_id, exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Unexpected error during question generation.",
        ) from exc

    logger.info("Generated %d MCQs for unit_id=%d", len(questions_data), unit_id)

    # ── 4. Persist test + questions ───────────────────────────────────────────
    title = test_title or f"{unit.title} — AI Generated Test ({difficulty.capitalize()})"

    try:
        test = await create_ai_generated_test(
            db=db,
            unit_id=unit_id,
            title=title,
            questions_data=questions_data,
            created_by=created_by,
            difficulty=difficulty,
            time_limit_minutes=time_limit_minutes,
            passing_score=passing_score,
            description=(
                f"Auto-generated {difficulty} test covering: {unit.title}. "
                f"{mcq_count} multiple-choice questions, "
                f"{answers_per_question} options each."
            ),
        )
    except ValueError as exc:
        logger.error("DB validation error for unit_id=%d: %s", unit_id, exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("DB error persisting test for unit_id=%d: %s", unit_id, exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to save the generated test. Please try again.",
        ) from exc

    logger.info(
        "Test generation complete — test_id=%d, unit_id=%d, questions=%d",
        test.id, unit_id, len(questions_data),
    )
    return test