"""
app/services/task_generation_flow.py
=====================================
Orchestration layer — wires the AI task generator and DB persistence together.

Mirrors ``test_generation_flow.py`` exactly:
* Same content-assembly logic (unit metadata → RAG chunks → transcripts → tasks)
* Same exception mapping (404/400/502/500)
* Same DB session pattern

Flow
----
1. Load Unit (with its videos and tasks eagerly).
2. Assemble all available textual content:
     - unit.title + unit.description + unit.goals
     - RAG document chunks (lesson_chunks table, ordered by chunk_index)
     - video transcripts (published videos, ordered by order_index)
     - existing task content / instructions (published tasks, ordered)
3. Guard against empty content.
4. Call generate_tasks_from_unit_content() → list[dict], metadata
5. Call create_ai_generated_tasks()         → list[Task]
6. Return tasks.

Exception mapping
-----------------
Unit not found          → 404
Empty content           → 400
AI validation failure   → 400  (ValueError from generator)
AI provider error       → 502  (AIProviderError — upstream LLM down)
Unexpected error        → 500
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session, joinedload

from app.models.task import Task, TaskStatus, TaskType
from app.models.unit import Unit
from app.models.video import Video, VideoStatus
from app.models.task import Task as TaskModel, TaskStatus
from app.services.ai.providers.base import AIProviderError

logger = logging.getLogger(__name__)

# ── content assembly (shared with test_generation_flow) ──────────────────────

_SECTION_SEPARATOR = "\n\n" + "─" * 60 + "\n\n"


def _fetch_rag_chunks(db: Session, unit_id: int, max_chars: int = 12_000) -> str:
    """
    Pull raw chunk text from the ``lesson_chunks`` vector table for the given
    unit (lesson_id == unit_id).

    Returns empty string when no chunks exist for this unit.
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
    Combine all available textual material from a Unit into a single string.

    Priority / order (identical to test_generation_flow)
    ----------------
    1. Unit metadata  (title, description, goals)
    2. RAG document chunks  (lesson_chunks table, ordered by chunk_index)
    3. Video transcripts    (published, ordered by order_index)
    4. Task content + instructions  (published, ordered by order_index)
    """
    sections: list[str] = []

    # ── 1. Unit metadata ──────────────────────────────────────────────────────
    meta_parts: list[str] = [f"UNIT: {unit.title.strip()}"]
    if unit.description and unit.description.strip():
        meta_parts.append(f"Description: {unit.description.strip()}")
    if unit.goals and unit.goals.strip():
        meta_parts.append(f"Learning Goals: {unit.goals.strip()}")
    sections.append("\n".join(meta_parts))

    # ── 2. RAG document chunks ────────────────────────────────────────────────
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

    # ── 4. Task content + instructions ────────────────────────────────────────
    published_tasks: list[TaskModel] = sorted(
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
        if len(task_parts) > 1:
            sections.append("\n".join(task_parts))

    return _SECTION_SEPARATOR.join(sections)


def _load_unit_with_content(db: Session, unit_id: int) -> Unit:
    """Eagerly load Unit together with its videos and tasks. Raises 404 if missing."""
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


# ── DB builder ────────────────────────────────────────────────────────────────

async def create_ai_generated_tasks(
    db: Session,
    unit_id: int,
    tasks_data: list[dict[str, Any]],
    created_by: int,
    difficulty: str,
    generation_metadata: dict[str, Any],
) -> list[Task]:
    """
    Persist AI-generated tasks to the database.

    Each task dict must have:
    type, title, description, instructions, content, example_answer, grading_hints.

    The example_answer and grading_hints are stored inside ``rubric`` as a JSON
    field, keeping the Task model unchanged.

    All tasks are created in DRAFT status so the teacher can review before
    publishing.

    Parameters
    ----------
    tasks_data
        List of validated task dicts from generate_tasks_from_unit_content().
    created_by
        PK of the admin / instructor who triggered generation.
    difficulty
        Passed through for logging and rubric storage.
    generation_metadata
        Traceability dict from the generator; stored in auto_check_config.

    Returns
    -------
    list[Task]
        Persisted Task objects (all in DRAFT status).
    """
    # Map the generator's type strings to TaskType enum values.
    # "practice" → TaskType.PRACTICE, etc.
    _TYPE_MAP: dict[str, TaskType] = {
        "practice":  TaskType.PRACTICE,
        "writing":   TaskType.WRITING,
        "listening": TaskType.LISTENING,
        "reading":   TaskType.READING,
    }

    created_tasks: list[Task] = []

    for idx, task_dict in enumerate(tasks_data):
        task_type = _TYPE_MAP.get(task_dict.get("type", ""), TaskType.PRACTICE)

        task = Task(
            unit_id       = unit_id,
            title         = task_dict["title"],
            description   = task_dict.get("description", ""),
            content       = task_dict.get("content", ""),
            instructions  = task_dict.get("instructions", ""),
            type          = task_type,
            status        = TaskStatus.DRAFT,
            order_index   = idx,
            created_by    = created_by,
            # Store grading guidance and generation tracing in JSON fields
            rubric        = {
                "example_answer": task_dict.get("example_answer", ""),
                "grading_hints":  task_dict.get("grading_hints", ""),
                "difficulty":     difficulty,
            },
            auto_check_config = {
                "ai_generated": True,
                **generation_metadata,
            },
        )
        db.add(task)
        created_tasks.append(task)

    db.commit()

    for task in created_tasks:
        db.refresh(task)

    logger.info(
        "Persisted %d AI-generated tasks for unit_id=%d (difficulty=%s)",
        len(created_tasks), unit_id, difficulty,
    )
    return created_tasks


# ── public API ────────────────────────────────────────────────────────────────

async def generate_tasks_for_unit(
    db: Session,
    unit_id: int,
    task_count: int,
    difficulty: str,
    created_by: int,
    *,
    content_language: str = "auto",
    task_language: str = "english",
) -> list[Task]:
    """
    Full pipeline: load unit content → generate tasks → persist.

    Parameters
    ----------
    db : Session
        Active SQLAlchemy session.
    unit_id : int
        PK of the source Unit.
    task_count : int
        Number of tasks to generate.
    difficulty : str
        Difficulty hint for the LLM ("easy", "medium", "hard").
    created_by : int
        PK of the admin / instructor triggering generation.
    content_language : str
        Language the source content is written in ("auto" = LLM infers).
    task_language : str
        Language for task instructions and example answers.

    Returns
    -------
    list[Task]
        Fully persisted Task objects, all in DRAFT status.

    Raises
    ------
    HTTPException 404   Unit not found.
    HTTPException 400   No textual content, or LLM output fails validation.
    HTTPException 502   The LLM provider is unreachable / errored.
    HTTPException 500   Any other unexpected failure.
    """
    logger.info(
        "Starting task generation — unit_id=%d, task_count=%d, "
        "difficulty=%s, created_by=%d",
        unit_id, task_count, difficulty, created_by,
    )

    # ── 1. Load Unit ──────────────────────────────────────────────────────────
    unit = _load_unit_with_content(db, unit_id)
    logger.debug("Loaded unit '%s' (id=%d)", unit.title, unit.id)

    # ── 2. Assemble content ───────────────────────────────────────────────────
    unit_content = _assemble_unit_content(unit, db)

    if not unit_content.strip():
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unit '{unit.title}' has no textual content to generate tasks from. "
                "Upload RAG documents via the unit page (PDF/DOCX), or publish at least "
                "one video with a transcript, or a task with content."
            ),
        )

    logger.info(
        "Assembled unit content — %d chars from unit_id=%d",
        len(unit_content), unit_id,
    )

    # Temporarily disable legacy AI task generation path until module is restored.
    raise HTTPException(
        status_code=503,
        detail="AI task generation is temporarily disabled in this build.",
    )

    # ── 3. Generate tasks via LLM ─────────────────────────────────────────────
    try:
        tasks_data, metadata = await generate_tasks_from_unit_content(
            unit_content     = unit_content,
            task_count       = task_count,
            difficulty       = difficulty,
            content_language = content_language,
            task_language    = task_language,
        )
    except ValueError as exc:
        logger.warning("Task validation failed for unit_id=%d: %s", unit_id, exc)
        raise HTTPException(
            status_code=400,
            detail=f"AI output validation failed: {exc}",
        ) from exc
    except AIProviderError as exc:
        logger.error(
            "AI provider error for unit_id=%d: %s", unit_id, exc, exc_info=True
        )
        raise HTTPException(
            status_code=502,
            detail=f"AI provider error: {exc}",
        ) from exc
    except Exception as exc:
        logger.error(
            "Unexpected error during task generation for unit_id=%d: %s",
            unit_id, exc, exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail="Unexpected error during task generation.",
        ) from exc

    logger.info("Generated %d tasks for unit_id=%d", len(tasks_data), unit_id)

    # ── 4. Persist tasks ──────────────────────────────────────────────────────
    try:
        tasks = await create_ai_generated_tasks(
            db                  = db,
            unit_id             = unit_id,
            tasks_data          = tasks_data,
            created_by          = created_by,
            difficulty          = difficulty,
            generation_metadata = metadata,
        )
    except Exception as exc:
        logger.error(
            "DB error persisting tasks for unit_id=%d: %s", unit_id, exc, exc_info=True
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to save the generated tasks. Please try again.",
        ) from exc

    logger.info(
        "Task generation complete — unit_id=%d, tasks=%d",
        unit_id, len(tasks),
    )
    return tasks