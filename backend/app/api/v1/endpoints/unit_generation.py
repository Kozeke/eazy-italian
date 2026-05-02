"""
app/api/v1/endpoints/unit_generation.py
========================================
AI-powered unit generation endpoint.

Both endpoints now delegate to UnitGeneratorService, which generates:
  - Text blocks  (grammar rules, vocabulary, examples — always included)
  - Exercise blocks (AI-generated interactive exercises)
  - Image blocks (SVG diagram per segment — only when include_images=True)

Endpoints
---------
POST /units/{unit_id}/generate
POST /units/{unit_id}/generate/from-file
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.core.auth import get_current_teacher
from app.core.database import get_db
from app.core.teacher_tariffs import check_and_consume_teacher_ai_quota
from app.models.segment import Segment
from app.models.unit import Unit
from app.models.user import User
from app.services.document_parsers import get_parser, ParserError
from app.services.unit_generator import (
    UnitGeneratorService,
    UnitGenerateRequest as _SvcUnitGenerateRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# ── Supported exercise types ──────────────────────────────────────────────────

SUPPORTED_TYPES: set[str] = {
    "image_stacked",
    "drag_to_gap",
    "drag_word_to_image",
    "select_form_to_image",
    "type_word_in_gap",
    "select_word_form",
    "match_pairs",
    "build_sentence",
    "order_paragraphs",
    "sort_into_columns",
    "test_without_timer",
    "test_with_timer",
    "true_false",
}

CEFR_LEVELS: set[str] = {"A1", "A2", "B1", "B2", "C1", "C2"}


# ── Request / Response schemas ────────────────────────────────────────────────

class UnitGenerateRequest(BaseModel):
    topic: str = Field(
        ...,
        min_length=2,
        max_length=512,
        description="The grammar / vocabulary topic, e.g. 'Present Simple tense'.",
    )
    description: str | None = Field(
        default=None,
        max_length=2000,
        description=(
            "Optional teacher directive forwarded verbatim to the AI prompt. "
            "Use it to steer style, vocabulary source, examples, or any special "
            "instructions, e.g. 'Focus on vocabulary; use Harry Potter examples'."
        ),
    )
    level: str = Field(default="A2", description="CEFR level: A1, A2, B1, B2, C1, C2.")
    language: str = Field(
        default="English",
        max_length=64,
        description="Target language of the content (e.g. 'English', 'Spanish').",
    )
    num_segments: int = Field(
        default=3, ge=1, le=6,
        description="Number of lesson segments to create (1–6).",
    )
    exercise_types: list[str] = Field(
        default=["drag_to_gap", "match_pairs"],
        description=f"Exercise type(s) to generate per segment. Supported: {sorted(SUPPORTED_TYPES)}",
    )
    instruction_language: str = Field(
        default="english",
        max_length=64,
        description="Language used for UI labels shown to students.",
    )
    include_images: bool = Field(
        default=False,
        description=(
            "Generate an AI SVG illustration for each segment. "
            "Adds significant processing time (10–30 s extra). "
            "Disabled by default."
        ),
    )

    @field_validator("level")
    @classmethod
    def validate_level(cls, v: str) -> str:
        upper = v.upper()
        if upper not in CEFR_LEVELS:
            raise ValueError(f"level must be one of {sorted(CEFR_LEVELS)}, got '{v}'")
        return upper

    @field_validator("exercise_types")
    @classmethod
    def validate_exercise_types(cls, types: list[str]) -> list[str]:
        if not types:
            raise ValueError("exercise_types must not be empty.")
        unknown = [t for t in types if t not in SUPPORTED_TYPES]
        if unknown:
            raise ValueError(
                f"Unknown exercise type(s): {unknown}. Supported: {sorted(SUPPORTED_TYPES)}"
            )
        return types


class SegmentSummary(BaseModel):
    id: int
    title: str
    exercises_created: int
    exercise_types: list[str]
    texts_created: int = 0
    has_image: bool = False


class UnitGenerateResponse(BaseModel):
    segments_created: int
    exercises_created: int
    texts_created: int = 0
    images_created: int = 0
    segments: list[SegmentSummary]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_unit_or_404(db: Session, unit_id: int, teacher_id: int) -> Unit:
    unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found.")
    from app.models.course import Course
    if unit.course_id:
        course = db.query(Course).filter(Course.id == unit.course_id).first()
        if course and course.created_by != teacher_id:
            raise HTTPException(status_code=403, detail="Access denied.")
    elif unit.created_by != teacher_id:
        raise HTTPException(status_code=403, detail="Access denied.")
    return unit


def _build_segment_summary(seg: Segment) -> SegmentSummary:
    """Build a SegmentSummary from a persisted Segment record."""
    blocks = seg.media_blocks or []
    ex_types = [b.get("kind", "") for b in blocks if b.get("kind") not in ("text", "image")]
    texts_count = sum(1 for b in blocks if b.get("kind") == "text")
    has_img = any(b.get("kind") == "image" for b in blocks)
    return SegmentSummary(
        id=seg.id,
        title=seg.title,
        exercises_created=len(ex_types),
        exercise_types=ex_types,
        texts_created=texts_count,
        has_image=has_img,
    )


# ── File-upload constants & provider helper ───────────────────────────────────

_MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024   # 20 MB
_ALLOWED_EXTENSIONS  = {"pdf"}


def _get_ai_provider():
    """
    Instantiate the configured AI provider.

    Priority (AI_PROVIDER env-var, default: "groq"):
      1. groq   → GroqProvider with automatic Ollama fallback
      2. ollama → LocalLlamaProvider
      3. anthropic / openai — uncommment to enable
    """
    import os

    provider_name = os.environ.get("AI_PROVIDER", "groq").strip().lower()

    if provider_name == "groq":
        from app.services.ai.providers.groq_provider import GroqProvider
        p = GroqProvider(max_tokens=8000, json_mode=True) 
        logger.info("Unit-gen AI provider: GroqProvider (model=%s)", p.model)
        from app.services.ai_exercise_generator import _build_ollama_provider, _WithOllamaFallback  # type: ignore[attr-defined]
        fallback = _build_ollama_provider()
        if fallback is not None:
            logger.info("Ollama fallback available for unit generation.")
            return _WithOllamaFallback(primary=p, fallback=fallback)
        return p

    if provider_name == "ollama":
        from app.services.ai.providers.ollama import LocalLlamaProvider
        p = LocalLlamaProvider()
        logger.info("Unit-gen AI provider: LocalLlamaProvider (model=%s)", p.model)
        return p

    if provider_name == "deepseek":
        from app.services.ai.providers.deepseek_provider import DeepSeekProvider
        p = DeepSeekProvider(max_tokens=8000, json_mode=True)
        logger.info("Unit-gen AI provider: DeepSeekProvider (model=%s)", p.model)
        return p

    raise ValueError(
        f"Unknown AI_PROVIDER={provider_name!r}. "
        "Valid values: 'groq' (default), 'ollama', 'deepseek'."
    )









# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post(
    "/{unit_id}/generate",
    response_model=UnitGenerateResponse,
    summary="AI-generate segments with text, exercises, and optional images",
    description=(
        "Generates `num_segments` lesson segments, each containing:\n\n"
        "- **Text block** — grammar rules, vocabulary, or examples in Markdown\n"
        "- **Exercise blocks** — AI-generated interactive exercises\n"
        "- **Image block** (optional) — SVG illustration, enabled with `include_images=true`\n\n"
        f"**Supported exercise types:** {', '.join(sorted(SUPPORTED_TYPES))}"
    ),
    tags=["AI Unit Generation"],
)
async def generate_unit_content(
    unit_id: int,
    body: UnitGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher),
) -> UnitGenerateResponse:
    logger.info(
        "generate_unit_content: start unit_id=%d teacher_id=%d topic=%r segments=%d include_images=%s",
        unit_id,
        current_user.id,
        body.topic,
        body.num_segments,
        body.include_images,
    )
    _get_unit_or_404(db, unit_id, current_user.id)
    # Consumes one AI unit-generation credit based on the teacher's active tariff.
    check_and_consume_teacher_ai_quota(db, current_user, "unit_generation")

    # Prevent request crash when AI provider cannot be initialized.
    try:
        provider = _get_ai_provider()
    except Exception as exc:
        logger.error(
            "generate_unit_content: provider init failed unit_id=%d teacher_id=%d: %s",
            unit_id,
            current_user.id,
            exc,
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail=f"AI provider unavailable: {exc}") from exc

    svc_request = _SvcUnitGenerateRequest(
        unit_id=unit_id,
        topic=body.topic,
        description=body.description,
        level=body.level,
        language=body.language,
        num_segments=body.num_segments,
        exercise_types=list(body.exercise_types),
        teacher_id=current_user.id,
        content_language=body.language.lower(),
        instruction_language=body.instruction_language,
        include_images=body.include_images,
    )

    service = UnitGeneratorService(ai_provider=provider)
    # Convert generation runtime failures into stable API errors.
    try:
        result = await service.generate(svc_request, db)
    except RuntimeError as exc:
        logger.error(
            "generate_unit_content: generation failed unit_id=%d teacher_id=%d: %s",
            unit_id,
            current_user.id,
            exc,
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    segments_summary: list[SegmentSummary] = []
    for seg_id in result.segment_ids:
        seg = db.query(Segment).filter(Segment.id == seg_id).first()
        if seg is not None:
            segments_summary.append(_build_segment_summary(seg))

    logger.info(
        "generate_unit_content: success unit_id=%d teacher_id=%d segments=%d texts=%d exercises=%d images=%d errors=%d",
        unit_id,
        current_user.id,
        result.segments_created,
        result.texts_created,
        result.exercises_created,
        result.images_created,
        len(result.errors),
    )
    return UnitGenerateResponse(
        segments_created=result.segments_created,
        exercises_created=result.exercises_created,
        texts_created=result.texts_created,
        images_created=result.images_created,
        segments=segments_summary,
    )


# ── from-file endpoint ────────────────────────────────────────────────────────

@router.post(
    "/{unit_id}/generate/from-file",
    response_model=UnitGenerateResponse,
    summary="AI-generate unit segments from an uploaded file",
    description=(
        "Upload a PDF file. The endpoint extracts its text, derives the topic "
        "from the document title (or filename), and runs the full generation pipeline:\n\n"
        "- **Text blocks** — grammar rules, vocabulary, examples in Markdown\n"
        "- **Exercise blocks** — AI-generated interactive exercises\n"
        "- **Image blocks** (optional) — SVG illustrations, enabled with `include_images=true`\n\n"
        f"**Supported file types:** pdf — max 20 MB"
    ),
    tags=["AI Unit Generation"],
)
async def generate_unit_from_file(
    unit_id: int,
    file: UploadFile = File(..., description="PDF file — max 20 MB"),
    level: str = Form(default="A2", description="CEFR level: A1–C2"),
    language: str = Form(default="English", description="Target language of the content"),
    num_segments: int = Form(default=3, ge=1, le=6, description="Number of segments to create (1–6)"),
    exercise_types: str = Form(
        default="drag_to_gap,match_pairs",
        description="Comma-separated exercise type keys",
    ),
    instruction_language: str = Form(default="english", description="Language for student-facing UI labels"),
    include_images: bool = Form(default=False, description="Generate SVG image per segment"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher),
) -> UnitGenerateResponse:
    # ── Validate unit access ──────────────────────────────────────────────────
    unit = _get_unit_or_404(db, unit_id, current_user.id)

    # ── Validate file type & size ─────────────────────────────────────────────
    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '.{ext}'. Allowed: {', '.join(sorted(_ALLOWED_EXTENSIONS))}.",
        )

    raw = await file.read()
    if len(raw) > _MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(raw) // 1024} KB). Maximum is 20 MB.",
        )

    # ── Parse file → text ─────────────────────────────────────────────────────
    try:
        ct = (file.content_type or "").lower().split(";")[0].strip()
        parser = get_parser(filename, ct)
        parsed_doc = parser.parse(raw, filename=filename)
    except ParserError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Could not extract text from the file: {exc}",
        ) from exc
    except Exception as exc:
        logger.error("Unexpected parse error for '%s': %s", filename, exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Unexpected error while parsing the file.")

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
        "generate_unit_from_file: unit_id=%d, filename=%r, chars=%d, title=%r",
        unit_id, filename, len(file_text), parsed_doc.title,
    )

    # ── Derive topic ──────────────────────────────────────────────────────────
    topic = (
        parsed_doc.title
        or filename.rsplit(".", 1)[0].replace("_", " ").replace("-", " ").strip()
        or unit.title
    )

    # ── Validate form fields ──────────────────────────────────────────────────
    level_upper = level.upper()
    if level_upper not in CEFR_LEVELS:
        raise HTTPException(
            status_code=400,
            detail=f"level must be one of {sorted(CEFR_LEVELS)}, got '{level}'",
        )

    parsed_types = [t.strip() for t in exercise_types.split(",") if t.strip()]
    if not parsed_types:
        raise HTTPException(status_code=400, detail="exercise_types must not be empty.")
    unknown = [t for t in parsed_types if t not in SUPPORTED_TYPES]
    if unknown:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown exercise type(s): {unknown}. Supported: {sorted(SUPPORTED_TYPES)}",
        )

    # ── Run generator ─────────────────────────────────────────────────────────
    # Consumes one AI unit-generation credit after file/form validation succeeds.
    check_and_consume_teacher_ai_quota(db, current_user, "unit_generation")
    try:
        provider = _get_ai_provider()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI provider unavailable: {exc}") from exc

    svc_request = _SvcUnitGenerateRequest(
        unit_id=unit_id,
        topic=topic,
        level=level_upper,
        language=language,
        num_segments=num_segments,
        exercise_types=parsed_types,
        teacher_id=current_user.id,
        content_language="auto",
        instruction_language=instruction_language,
        source_content=file_text,
        include_images=include_images,
    )

    service = UnitGeneratorService(ai_provider=provider)
    try:
        result = await service.generate(svc_request, db)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    # ── Shape response ────────────────────────────────────────────────────────
    segments_summary: list[SegmentSummary] = []
    for seg_id in result.segment_ids:
        seg = db.query(Segment).filter(Segment.id == seg_id).first()
        if seg is not None:
            segments_summary.append(_build_segment_summary(seg))

    return UnitGenerateResponse(
        segments_created=result.segments_created,
        exercises_created=result.exercises_created,
        texts_created=result.texts_created,
        images_created=result.images_created,
        segments=segments_summary,
    )