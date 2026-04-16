"""
app/api/v1/endpoints/exercise_generation.py

REST endpoints for AI-powered exercise generation.

Architecture
------------
A single generic endpoint handles ALL exercise types:

    POST /segments/{segment_id}/exercises/{exercise_type}

This replaces the old per-type routes.  The old drag-to-gap route is kept
as a backward-compatible alias so existing clients don't break.

Adding a new exercise type
--------------------------
1.  Implement the generator in ai_exercise_generator.py.
2.  Add it to EXERCISE_GENERATORS there.
3.  Done — zero changes needed here.

The only change you might make here is adding type-specific request validation
(e.g. clamping a value range) via the ExerciseGenerateRequest.build_generator_params()
method at the bottom of this file.
"""

from __future__ import annotations

import logging
from typing import Annotated, Any, Literal, Union

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.auth import get_current_teacher
from app.core.database import get_db
from app.models.user import User
from app.schemas.exercise_generation import (
    ExerciseGenerateRequest,
    ExerciseGenerateResponse,
    # Backward-compat aliases
    DragToGapGenerateRequest,
    DragToGapGenerateResponse,
)
from app.services.exercise_generation_flow import generate_exercise_for_segment
from app.services.document_parsers.pdf_parser  import PDFParser
from app.services.document_parsers.docx_parser import DocxParser
from app.services.document_parsers.base        import ParserError
from app.services.ai.providers.base            import AIProviderError
from app.services.ai_exercise_generator        import generate_exercise
from app.services.exercise_generation_flow import (
    _load_segment,
    _append_block,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/segments", tags=["exercise-generation"])


# ── Supported exercise types ──────────────────────────────────────────────────
# Used for validation so the API returns a clear 400 instead of a cryptic
# "generator not found" error for unknown slugs.
#
# The slug is the URL segment; it maps 1-to-1 to the registry key by replacing
# hyphens with underscores.

SUPPORTED_TYPES: set[str] = {
    "drag-to-gap",
    "type-word-in-gap",
    "select-word-form",
    "match-pairs",
    "build-sentence",
    "order-paragraphs",
    "sort-into-columns",
    "test-without-timer",
    "test-with-timer",
    "true-false",
}


def _slug_to_type(slug: str) -> str:
    """Convert URL slug to registry key.  'drag-to-gap' → 'drag_to_gap'."""
    return slug.replace("-", "_")


# ── Generic endpoint ──────────────────────────────────────────────────────────

@router.post(
    "/{segment_id}/exercises/{exercise_slug}",
    response_model=ExerciseGenerateResponse,
    summary="Generate any exercise block for a segment",
    description=(
        "Uses AI to create an interactive exercise from the unit's content and "
        "appends it to the segment's media_blocks list.  Returns the newly created block.\n\n"
        f"Supported exercise types: {', '.join(sorted(SUPPORTED_TYPES))}"
    ),
)
async def generate_exercise_block(
    segment_id: int,
    exercise_slug: str,
    body: ExerciseGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher),
) -> dict:
    if exercise_slug not in SUPPORTED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unknown exercise type '{exercise_slug}'. "
                f"Supported: {', '.join(sorted(SUPPORTED_TYPES))}"
            ),
        )

    exercise_type = _slug_to_type(exercise_slug)

    # Resolve unit_id: body may omit it; fall back to the segment's parent unit.
    unit_id = _resolve_unit_id(db, segment_id, body.unit_id)

    block, metadata = await generate_exercise_for_segment(
        exercise_type=exercise_type,
        db=db,
        segment_id=segment_id,
        unit_id=unit_id,
        created_by=current_user.id,
        block_title=body.block_title,
        topic_hint=body.topic_hint,
        content_language=body.content_language,
        instruction_language=body.instruction_language,
        generator_params=body.build_generator_params(),
    )

    return {"block": block, "metadata": metadata}


# ── File-upload endpoint (all types) ─────────────────────────────────────────

MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024   # 20 MB
ALLOWED_EXTENSIONS  = {"pdf", "docx", "jpg", "jpeg", "png"}


@router.post(
    "/{segment_id}/exercises/{exercise_slug}/from-file",
    response_model=ExerciseGenerateResponse,
    summary="Generate any exercise block from an uploaded file",
)
async def generate_exercise_from_file(
    segment_id: int,
    exercise_slug: str,
    file: UploadFile = File(...),
    gap_count: int = Form(default=5),
    content_language: str = Form(default="auto"),
    instruction_language: str = Form(default="english"),
    block_title: str | None = Form(default=None),
    gap_type: str | None = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher),
) -> dict:
    if exercise_slug not in SUPPORTED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown exercise type '{exercise_slug}'.",
        )

    exercise_type = _slug_to_type(exercise_slug)

    # ── Validate file ─────────────────────────────────────────────────────────
    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '.{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}.",
        )

    raw = await file.read()
    if len(raw) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"File too large ({len(raw) // 1024} KB). Maximum is 20 MB.",
        )

    # ── Parse file → text ─────────────────────────────────────────────────────
    try:
        if ext == "pdf":
            parsed = PDFParser().parse_bytes(raw, filename=filename)
        elif ext == "docx":
            parsed = DocxParser().parse_bytes(raw, filename=filename)
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Image parsing not yet supported for from-file generation.",
            )
        file_text = parsed.text.strip()
    except ParserError as exc:
        raise HTTPException(status_code=400, detail=f"Could not parse file: {exc}") from exc

    if not file_text:
        raise HTTPException(
            status_code=400,
            detail="No text could be extracted from the uploaded file.",
        )

    # ── Load segment ──────────────────────────────────────────────────────────
    segment = _load_segment(db, segment_id)

    # ── Generate ──────────────────────────────────────────────────────────────
    try:
        from app.services.ai_exercise_generator import generate_exercise as _gen
        exercise_data, metadata = await _gen(
            exercise_type=exercise_type,
            unit_content=file_text,
            content_language=(content_language or "auto").strip().lower(),
            instruction_language=(instruction_language or "english").strip().lower(),
            topic_hint=None,
            gap_count=max(1, min(gap_count, 15)),
            gap_type=gap_type,
        )
    except NotImplementedError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"AI output validation failed: {exc}") from exc
    except AIProviderError as exc:
        raise HTTPException(status_code=502, detail=f"AI provider error: {exc}") from exc
    except Exception as exc:
        logger.error("Unexpected AI error (from-file): %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Unexpected error during exercise generation.") from exc

    # ── Persist ───────────────────────────────────────────────────────────────
    final_title = (block_title or "").strip() or exercise_data.get("title") or exercise_type.replace("_", " ").title()
    try:
        block = _append_block(
            db=db,
            segment=segment,
            kind=exercise_type,
            block_title=final_title,
            data=exercise_data,
            created_by=current_user.id,
        )
    except Exception as exc:
        logger.error("DB error persisting block for segment_id=%d: %s", segment_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to save the generated exercise. Please try again.") from exc

    return {"block": block, "metadata": metadata}


# ── Backward-compat alias ─────────────────────────────────────────────────────
# Old route: POST /segments/{id}/exercises/drag-to-gap
# Kept so existing frontend code doesn't break. Delegates to the generic handler.

@router.post(
    "/{segment_id}/exercises/drag-to-gap",
    response_model=DragToGapGenerateResponse,
    summary="[Deprecated] Generate drag-to-gap block (use /{exercise_type} instead)",
    include_in_schema=False,  # Hide from OpenAPI docs to discourage new usage
)
async def generate_drag_to_gap_compat(
    segment_id: int,
    body: DragToGapGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher),
) -> dict:
    unit_id = _resolve_unit_id(db, segment_id, body.unit_id)

    block, metadata = await generate_exercise_for_segment(
        exercise_type="drag_to_gap",
        db=db,
        segment_id=segment_id,
        unit_id=unit_id,
        created_by=current_user.id,
        block_title=body.block_title,
        topic_hint=body.topic_hint,
        content_language=body.content_language,
        instruction_language=body.instruction_language,
        generator_params={
            "gap_count": None if (body.gap_count is None or body.gap_count == "auto") else int(body.gap_count),
            "gap_type": body.gap_type,
        },
    )
    return {"block": block, "metadata": metadata}


@router.post(
    "/{segment_id}/exercises/drag-to-gap/from-file",
    response_model=DragToGapGenerateResponse,
    include_in_schema=False,
)
async def generate_drag_to_gap_from_file_compat(
    segment_id: int,
    exercise_slug: str = "drag-to-gap",
    file: UploadFile = File(...),
    gap_count: int = Form(default=5),
    content_language: str = Form(default="auto"),
    instruction_language: str = Form(default="english"),
    block_title: str | None = Form(default=None),
    gap_type: str | None = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher),
) -> dict:
    return await generate_exercise_from_file(
        segment_id=segment_id,
        exercise_slug="drag-to-gap",
        file=file,
        gap_count=gap_count,
        content_language=content_language,
        instruction_language=instruction_language,
        block_title=block_title,
        gap_type=gap_type,
        db=db,
        current_user=current_user,
    )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _resolve_unit_id(db: Session, segment_id: int, hint_unit_id: int | None) -> int:
    """
    Derive the parent unit_id from the segment when the caller omits it.
    Falls back to hint_unit_id if the relationship isn't loaded.
    """
    if hint_unit_id:
        return hint_unit_id

    from app.models.segment import Segment  # noqa: PLC0415
    seg = db.query(Segment).filter(Segment.id == segment_id).first()
    if seg is None:
        raise HTTPException(status_code=404, detail=f"Segment {segment_id} not found.")

    unit_id = getattr(seg, "unit_id", None)
    if unit_id is None:
        raise HTTPException(
            status_code=400,
            detail="Cannot determine unit_id for this segment. Pass it explicitly in the request body.",
        )
    return unit_id