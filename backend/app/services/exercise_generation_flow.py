"""
app/services/exercise_generation_flow.py

Orchestration layer for AI-generated interactive exercises.

Design
------
One generic pipeline handles ALL exercise types:

    generate_exercise_for_segment(exercise_type, db, segment_id, ...)

Exercise-type-specific logic (prompts, output parsing, validation) lives
exclusively in ai_exercise_generator.py — this file never knows about
individual exercise shapes.

Adding a new exercise type
--------------------------
1.  Add a generator function in ai_exercise_generator.py.
2.  Register it in EXERCISE_GENERATORS.
3.  Add a Pydantic schema in schemas/exercise_generation.py.
4.  Add an endpoint entry in api/v1/endpoints/exercise_generation.py.
5.  Zero changes needed here.

Exception mapping (all exercise types)
---------------------------------------
Segment / Unit not found  → 404
Empty content             → 400
AI validation failure     → 400
AI provider error         → 502
Unexpected error          → 500
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.services.ai.providers.base import AIProviderError
from app.services.ai_exercise_generator import generate_exercise

# Re-use content assembly from the test flow — single source of truth.
from app.services.test_generation_flow import (
    _assemble_unit_content,
    _load_unit_with_content,
)

logger = logging.getLogger(__name__)


# ── Segment DB helpers ────────────────────────────────────────────────────────

def _load_segment(db: Session, segment_id: int) -> Any:
    """Load a Segment by PK.  Raises 404 if absent."""
    from app.models.segment import Segment  # noqa: PLC0415

    segment = db.query(Segment).filter(Segment.id == segment_id).first()
    if segment is None:
        raise HTTPException(
            status_code=404,
            detail=f"Segment with id={segment_id} not found.",
        )
    return segment


def _append_block(
    db: Session,
    segment: Any,
    kind: str,
    block_title: str,
    data: dict,
    created_by: int,
) -> dict:
    """
    Generic: append any exercise block to segment.media_blocks and persist.

    Parameters
    ----------
    kind        Exercise type key, e.g. "drag_to_gap", "type_word_in_gap".
    block_title Human-readable title shown in the lesson.
    data        The exercise payload produced by the AI generator.
    created_by  PK of the teacher triggering generation.

    Returns the newly appended block dict (with its generated id).
    """
    # Build a stable id prefix from the kind so it's easy to recognise in logs.
    prefix = "".join(w[0] for w in kind.split("_"))  # e.g. "dtg", "twig", "swf"
    new_block: dict = {
        "id":    f"{prefix}_{uuid.uuid4().hex[:12]}",
        "kind":  kind,
        "title": block_title,
        "data":  data,
    }

    # JSON column — mutate a copy so SQLAlchemy detects the change.
    existing: list = list(segment.media_blocks or [])
    existing.append(new_block)
    segment.media_blocks = existing

    if hasattr(segment, "updated_by"):
        segment.updated_by = created_by

    db.add(segment)
    db.commit()
    db.refresh(segment)

    logger.info(
        "Appended %s block id=%s to segment_id=%d",
        kind, new_block["id"], segment.id,
    )
    return new_block


# Backward-compat alias used by exercise_from_file.py and any legacy callers.
def _append_drag_to_gap_block(
    db: Session,
    segment: Any,
    block_title: str,
    drag_to_gap_data: dict,
    created_by: int,
) -> dict:
    return _append_block(
        db=db,
        segment=segment,
        kind="drag_to_gap",
        block_title=block_title,
        data=drag_to_gap_data,
        created_by=created_by,
    )


# ── Public API ────────────────────────────────────────────────────────────────

async def generate_exercise_for_segment(
    *,
    exercise_type: str,
    db: Session,
    segment_id: int,
    unit_id: int,
    created_by: int,
    # Common optional params — all generators receive them; unused ones are ignored.
    block_title: str | None = None,
    topic_hint: str | None = None,
    content_language: str = "auto",
    instruction_language: str = "english",
    # Optional plan-aware AI provider (Groq → DeepSeek fallback for paid plans).
    provider: Any | None = None,
    # Type-specific extras forwarded verbatim to the generator.
    generator_params: dict | None = None,
) -> tuple[dict, dict]:
    """
    Full pipeline for any exercise type:

        load content → generate → persist block

    Parameters
    ----------
    exercise_type
        Registry key, e.g. "drag_to_gap", "type_word_in_gap", "match_pairs".
    generator_params
        Dict of extra kwargs forwarded directly to the type-specific generator.
        Example: {"gap_count": 5, "gap_type": "Verbs only"} for drag_to_gap.

    Returns
    -------
    (block_dict, metadata_dict)

    Raises
    ------
    HTTPException 404  Segment or Unit not found.
    HTTPException 400  Empty content, unsupported type, or LLM validation fail.
    HTTPException 502  LLM provider unreachable.
    HTTPException 500  Any other unexpected failure.
    """
    params = generator_params or {}

    logger.info(
        "Starting %s generation — segment_id=%d, unit_id=%d, created_by=%d",
        exercise_type, segment_id, unit_id, created_by,
    )

    # ── 1. Load Segment ───────────────────────────────────────────────────────
    segment = _load_segment(db, segment_id)

    # ── 2. Load Unit + assemble content ──────────────────────────────────────
    unit = _load_unit_with_content(db, unit_id)
    unit_content = _assemble_unit_content(unit, db)

    if not unit_content.strip():
        if not topic_hint:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Unit '{unit.title}' has no textual content to generate an exercise from. "
                    "Upload RAG documents, publish a video with transcript, or add task content. "
                    "Alternatively, provide a topic_hint to guide generation."
                ),
            )
        logger.info(
            "Unit content empty for unit_id=%d; falling back to topic_hint.", unit_id
        )
        unit_content = topic_hint

    logger.info(
        "Assembled unit content — %d chars for unit_id=%d", len(unit_content), unit_id
    )

    # ── 3. Generate via LLM ───────────────────────────────────────────────────
    try:
        exercise_data, metadata = await generate_exercise(
            exercise_type=exercise_type,
            unit_content=unit_content,
            content_language=content_language,
            instruction_language=instruction_language,
            topic_hint=topic_hint,
            provider=provider,
            **params,
        )
    except NotImplementedError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        logger.warning(
            "%s validation failed for unit_id=%d: %s", exercise_type, unit_id, exc
        )
        raise HTTPException(
            status_code=400,
            detail=f"AI output validation failed: {exc}",
        ) from exc
    except AIProviderError as exc:
        logger.error(
            "AI provider error for unit_id=%d: %s", unit_id, exc, exc_info=True
        )
        raise HTTPException(status_code=502, detail=f"AI provider error: {exc}") from exc
    except Exception as exc:
        logger.error(
            "Unexpected error during %s generation for unit_id=%d: %s",
            exercise_type, unit_id, exc, exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail="Unexpected error during exercise generation.",
        ) from exc

    logger.info(
        "Generated %s for unit_id=%d (model=%s, attempts=%s)",
        exercise_type, unit_id,
        metadata.get("generation_model", "?"),
        metadata.get("generation_attempts", "?"),
    )

    # ── 4. Persist block ──────────────────────────────────────────────────────
    default_title = exercise_data.get("title") or exercise_type.replace("_", " ").title()
    title = block_title or default_title

    try:
        block = _append_block(
            db=db,
            segment=segment,
            kind=exercise_type,
            block_title=title,
            data=exercise_data,
            created_by=created_by,
        )
    except Exception as exc:
        logger.error(
            "DB error persisting %s block for segment_id=%d: %s",
            exercise_type, segment_id, exc, exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to save the generated exercise. Please try again.",
        ) from exc

    logger.info(
        "%s generation complete — block_id=%s, segment_id=%d",
        exercise_type, block["id"], segment_id,
    )
    return block, metadata


# Convenience wrapper kept for any code that calls the old specific function.
async def generate_drag_to_gap_for_segment(
    db: Session,
    segment_id: int,
    unit_id: int,
    gap_count: int | str | None,
    created_by: int,
    topic_hint: str | None = None,
    *,
    block_title: str | None = None,
    content_language: str = "auto",
    instruction_language: str = "english",
    gap_type: str | None = None,
) -> tuple[dict, dict]:
    resolved_gap_count: int | None = (
        None if (gap_count is None or gap_count == "auto") else int(gap_count)
    )
    return await generate_exercise_for_segment(
        exercise_type="drag_to_gap",
        db=db,
        segment_id=segment_id,
        unit_id=unit_id,
        created_by=created_by,
        block_title=block_title,
        topic_hint=topic_hint,
        content_language=content_language,
        instruction_language=instruction_language,
        generator_params={
            "gap_count": resolved_gap_count,
            "gap_type": gap_type,
        },
    )