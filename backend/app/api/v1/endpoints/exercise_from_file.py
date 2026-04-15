"""
app/routers/exercise_from_file.py
==================================
Endpoint: POST /segments/{segment_id}/exercises/drag-to-gap/from-file

Accepts a multipart/form-data upload (PDF, DOCX, JPG, JPEG, PNG) and
generates a drag-to-gap exercise block directly from the file content,
without requiring the file to be ingested into the vector store first.

Flow
----
  1.  Validate file type and size.
  2.  Parse the file → plain text  (uses the document_parsers registry).
  3.  Guard: raise 400 if no text was extracted.
  4.  Load the target Segment (ownership check).
  5.  Generate drag-to-gap exercise via LLM.
  6.  Append the block to segment.media_blocks and persist.
  7.  Return { block, metadata }.

Register in api.py / main.py:
    from app.routers.exercise_from_file import router as exercise_from_file_router
    api_router.include_router(exercise_from_file_router, prefix="", tags=["Exercises"])

Or directly in main.py:
    from app.routers.exercise_from_file import router as exercise_from_file_router
    app.include_router(exercise_from_file_router, prefix="/api/v1")
"""
from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.auth import get_current_teacher
from app.core.database import get_db
from app.models.user import User
from app.services.document_parsers import get_parser, ParserError
from app.services.ai.providers.base import AIProviderError
from app.services.ai_exercise_generator import generate_drag_to_gap_from_unit_content

logger = logging.getLogger(__name__)

router = APIRouter( prefix="/segments",
    tags=["exercise-generation"],)

# ── Constants ─────────────────────────────────────────────────────────────────

MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024   # 20 MB
ALLOWED_EXTENSIONS  = {"pdf", "docx", "jpg", "jpeg", "png"}
ALLOWED_MIMETYPES   = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/jpg",
    "image/png",
}


# ── Helper: load segment with ownership check ─────────────────────────────────

def _get_segment_or_404(db: Session, segment_id: int, teacher_id: int):
    from app.models.segment import Segment  # deferred to avoid circular imports
    from app.models.course import Course
    from sqlalchemy.orm import joinedload

    seg = (
        db.query(Segment)
        .options(joinedload(Segment.unit))
        .filter(Segment.id == segment_id)
        .first()
    )
    if seg is None:
        raise HTTPException(status_code=404, detail=f"Segment {segment_id} not found.")

    unit = seg.unit
    if unit and unit.course_id:
        course = db.query(Course).filter(Course.id == unit.course_id).first()
        if course and course.created_by != teacher_id:
            raise HTTPException(status_code=403, detail="Access denied.")

    return seg


# ── Helper: append block ──────────────────────────────────────────────────────

def _append_drag_to_gap_block(
    db:               Session,
    segment,
    block_title:      str,
    drag_to_gap_data: dict,
    created_by:       int,
) -> dict:
    new_block: dict = {
        "id":    f"dtg_{uuid.uuid4().hex[:12]}",
        "kind":  "drag_to_gap",
        "title": block_title,
        "data":  drag_to_gap_data,
    }

    existing: list = list(segment.media_blocks or [])
    existing.append(new_block)
    segment.media_blocks = existing

    if hasattr(segment, "updated_by"):
        segment.updated_by = created_by

    db.add(segment)
    db.commit()
    db.refresh(segment)

    logger.info(
        "Appended drag_to_gap block id=%s to segment_id=%d (from-file flow)",
        new_block["id"], segment.id,
    )
    return new_block


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post(
    "/{segment_id}/exercises/drag-to-gap/from-file",
    status_code=200,
    summary="Generate drag-to-gap exercise from an uploaded file",
    tags=["Exercises"],
)
async def generate_drag_to_gap_from_file(
    segment_id:           int,
    file:                 UploadFile                = File(..., description="PDF, DOCX, JPG, JPEG, or PNG — max 20 MB"),
    gap_count:            int                       = Form(default=5,         ge=1, le=15),
    content_language:     str                       = Form(default="auto"),
    instruction_language: str                       = Form(default="english"),
    block_title:          str | None                = Form(default=None),
    current_user:         User                      = Depends(get_current_teacher),
    db:                   Session                   = Depends(get_db),
):
    """
    Parse an uploaded file and generate a drag-to-gap exercise from its content.

    - **file**: PDF, DOCX, JPG, JPEG, or PNG, up to 20 MB.
    - **gap_count**: How many word gaps to create (1–15, default 5).
    - **content_language**: Language of the file's content (`auto` = detect).
    - **instruction_language**: Language for the exercise title shown to students.
    - **block_title**: Optional override for the block title in the lesson.
    """

    # ── 1. Validate file type ─────────────────────────────────────────────────
    filename = file.filename or ""
    ext      = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    ct       = (file.content_type or "").lower().split(";")[0].strip()

    if ext not in ALLOWED_EXTENSIONS and ct not in ALLOWED_MIMETYPES:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Unsupported file type '.{ext}' (MIME: {ct!r}). "
                "Allowed: pdf, docx, jpg, jpeg, png."
            ),
        )

    # ── 2. Read and size-check ────────────────────────────────────────────────
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds the 20 MB limit ({len(file_bytes) / 1_048_576:.1f} MB uploaded).",
        )

    logger.info(
        "from-file exercise: segment_id=%d, filename=%r, size=%d, user=%d",
        segment_id, filename, len(file_bytes), current_user.id,
    )

    # ── 3. Parse file → text ──────────────────────────────────────────────────
    try:
        parser     = get_parser(filename, ct)
        parsed_doc = parser.parse(file_bytes, filename=filename)
    except ParserError as exc:
        logger.warning("File parse error for '%s': %s", filename, exc)
        raise HTTPException(
            status_code=422,
            detail=f"Could not extract text from the file: {exc}",
        ) from exc
    except Exception as exc:
        logger.error("Unexpected parse error for '%s': %s", filename, exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Unexpected error while parsing the file.",
        ) from exc

    file_text = (parsed_doc.text or "").strip()
    if not file_text:
        raise HTTPException(
            status_code=422,
            detail=(
                f"No text could be extracted from '{filename}'. "
                "The file may be blank, encrypted, or contain only raster images."
            ),
        )

    logger.info(
        "Parsed '%s' → %d chars (title=%r)",
        filename, len(file_text), parsed_doc.title,
    )

    # ── 4. Load segment (ownership check) ────────────────────────────────────
    segment = _get_segment_or_404(db, segment_id, current_user.id)

    # ── 5. Sanitise form params ───────────────────────────────────────────────
    effective_lang     = (content_language     or "auto"   ).strip().lower()
    effective_instr    = (instruction_language or "english").strip().lower()
    effective_title    = (block_title or "").strip() or None
    effective_gap_count = max(1, min(gap_count, 15))

    # ── 6. Generate exercise ──────────────────────────────────────────────────
    try:
        exercise_data, metadata = await generate_drag_to_gap_from_unit_content(
            unit_content=file_text,
            gap_count=effective_gap_count,
            content_language=effective_lang,
            instruction_language=effective_instr,
            topic_hint=None,
        )
    except ValueError as exc:
        logger.warning("drag_to_gap validation failed (from-file): %s", exc)
        raise HTTPException(
            status_code=400,
            detail=f"AI output validation failed: {exc}",
        ) from exc
    except AIProviderError as exc:
        logger.error("AI provider error (from-file): %s", exc, exc_info=True)
        raise HTTPException(
            status_code=502,
            detail=f"AI provider error: {exc}",
        ) from exc
    except Exception as exc:
        logger.error("Unexpected AI error (from-file): %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Unexpected error during exercise generation.",
        ) from exc

    # ── 7. Persist block ──────────────────────────────────────────────────────
    final_title = effective_title or exercise_data.get("title") or "Drag word to gap"

    try:
        block = _append_drag_to_gap_block(
            db=db,
            segment=segment,
            block_title=final_title,
            drag_to_gap_data=exercise_data,
            created_by=current_user.id,
        )
    except Exception as exc:
        logger.error(
            "DB error persisting block for segment_id=%d: %s", segment_id, exc, exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to save the generated exercise. Please try again.",
        ) from exc

    logger.info(
        "from-file generation complete — block_id=%s, segment_id=%d, file=%r",
        block["id"], segment_id, filename,
    )

    return {
        "block":    block,
        "metadata": {
            **metadata,
            "source_filename": filename,
            "source_chars":    len(file_text),
            "source_type":     parsed_doc.extra.get("source_type", ext),
        },
    }