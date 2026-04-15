"""
app/api/v1/endpoints/unit_generation.py
========================================
AI-powered unit generation endpoint.

Synchronous V1 — generates segments with exercises in one HTTP call.
SSE / async job queue can be layered on top in a later step.

Register in api.py:
    from app.api.v1.endpoints import unit_generation
    api_router.include_router(unit_generation.router, prefix="/units", tags=["AI Unit Generation"])

Endpoint
--------
POST /units/{unit_id}/generate

    Accepts a topic, CEFR level, language, number of segments and a list of
    exercise types.  For each requested segment it:
      1. Creates a Segment row (title derived from topic + index).
      2. Generates one exercise block per requested exercise_type and appends
         it to the segment's media_blocks JSONB column.

    Returns a summary of what was created:
        { "segments_created": int, "exercises_created": int, "segments": [...] }
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.core.auth import get_current_teacher
from app.core.database import get_db
from app.models.segment import Segment, SegmentStatus
from app.models.unit import Unit
from app.models.user import User
from app.services.ai_exercise_generator import EXERCISE_GENERATORS
from app.services.document_parsers import get_parser, ParserError
from app.services.unit_generator import (
    UnitGeneratorService,
    UnitGenerateRequest as _SvcUnitGenerateRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# ── Supported exercise types (mirrors exercise_generation.py) ─────────────────

SUPPORTED_TYPES: set[str] = {
    "drag_to_gap",
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
        description="The grammar / vocabulary topic to generate content for, e.g. 'Present Simple tense'.",
    )
    level: str = Field(
        default="A2",
        description="CEFR level: A1, A2, B1, B2, C1, C2.",
    )
    language: str = Field(
        default="English",
        max_length=64,
        description="Target language of the content (e.g. 'English', 'Spanish').",
    )
    num_segments: int = Field(
        default=3,
        ge=1,
        le=6,
        description="Number of lesson segments to create (1–6).",
    )
    exercise_types: list[str] = Field(
        default=["drag_to_gap", "match_pairs"],
        description=f"Exercise type(s) to generate per segment. Supported: {sorted(SUPPORTED_TYPES)}",
    )
    instruction_language: str = Field(
        default="english",
        max_length=64,
        description="Language used for UI labels shown to students (e.g. 'english', 'russian').",
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
                f"Unknown exercise type(s): {unknown}. "
                f"Supported: {sorted(SUPPORTED_TYPES)}"
            )
        return types


class SegmentSummary(BaseModel):
    id: int
    title: str
    exercises_created: int
    exercise_types: list[str]


class UnitGenerateResponse(BaseModel):
    segments_created: int
    exercises_created: int
    segments: list[SegmentSummary]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_unit_or_404(db: Session, unit_id: int, teacher_id: int) -> Unit:
    unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found.")
    from app.models.course import Course  # local import avoids circular dep
    if unit.course_id:
        course = db.query(Course).filter(Course.id == unit.course_id).first()
        if course and course.created_by != teacher_id:
            raise HTTPException(status_code=403, detail="Access denied.")
    elif unit.created_by != teacher_id:
        raise HTTPException(status_code=403, detail="Access denied.")
    return unit


def _next_order_index(db: Session, unit_id: int) -> int:
    existing = (
        db.query(Segment)
        .filter(Segment.unit_id == unit_id)
        .order_by(Segment.order_index.desc())
        .first()
    )
    return (existing.order_index + 1) if existing else 0


def _segment_title(topic: str, index: int, total: int) -> str:
    """Create a meaningful segment title from the topic."""
    if total == 1:
        return topic
    labels = [
        "Introduction",
        "Practice",
        "Deep Dive",
        "Application",
        "Review",
        "Challenge",
    ]
    suffix = labels[index] if index < len(labels) else f"Part {index + 1}"
    return f"{topic} — {suffix}"


def _build_topic_hint(topic: str, level: str, language: str, segment_index: int) -> str:
    """Build a rich topic_hint for the exercise generator."""
    return (
        f"Topic: {topic}. "
        f"CEFR level: {level}. "
        f"Language: {language}. "
        f"This is segment {segment_index + 1} of the lesson. "
        "Generate exercises that are appropriate for the level and topic."
    )


# ── File-upload constants & provider helper ──────────────────────────────────

_MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024   # 20 MB
_ALLOWED_EXTENSIONS  = {"pdf", "docx"}


def _get_ai_provider():
    """
    Instantiate the configured AI provider — mirrors ai_exercise_generator.py.

    Priority order (controlled by AI_PROVIDER env-var, default: "groq"):
      1. groq   → GroqProvider with automatic Ollama fallback on rate-limit
      2. ollama → LocalLlamaProvider (fully local, no API key needed)
      3. anthropic → AnthropicProvider  (requires ANTHROPIC_API_KEY)
      4. openai    → OpenAIProvider     (requires OPENAI_API_KEY)
    """
    import os
    from app.services.ai.providers.base import AIProvider, AIProviderError

    provider_name = os.environ.get("AI_PROVIDER", "groq").strip().lower()

    # ── Groq (default) with automatic Ollama fallback ────────────────────────
    if provider_name == "groq":
        from app.services.ai.providers.groq_provider import GroqProvider
        p = GroqProvider()
        logger.info("Unit-gen AI provider: GroqProvider (model=%s)", p.model)
        # Reuse the same Ollama-fallback wrapper from ai_exercise_generator
        from app.services.ai_exercise_generator import _build_ollama_provider, _WithOllamaFallback  # type: ignore[attr-defined]
        fallback = _build_ollama_provider()
        if fallback is not None:
            logger.info("Ollama fallback available for unit generation.")
            return _WithOllamaFallback(primary=p, fallback=fallback)
        return p

    # ── Fully local Ollama ────────────────────────────────────────────────────
    if provider_name == "ollama":
        from app.services.ai.providers.ollama import LocalLlamaProvider
        p = LocalLlamaProvider()
        logger.info("Unit-gen AI provider: LocalLlamaProvider (model=%s)", p.model)
        return p

    # ── Cloud providers (require API keys) ───────────────────────────────────
    # if provider_name == "anthropic":
    #     from app.services.ai.providers.anthropic_provider import AnthropicProvider
    #     return AnthropicProvider()

    # if provider_name == "openai":
    #     from app.services.ai.providers.openai_provider import OpenAIProvider
    #     return OpenAIProvider()

    raise ValueError(
        f"Unknown AI_PROVIDER={provider_name!r}. "
        "Valid values: 'groq' (default), 'ollama'. "
        "Set the AI_PROVIDER environment variable accordingly."
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post(
    "/{unit_id}/generate",
    response_model=UnitGenerateResponse,
    summary="AI-generate segments + exercises for a unit",
    description=(
        "Synchronously creates `num_segments` lesson segments and populates each with "
        "AI-generated exercise blocks of the requested `exercise_types`.\n\n"
        "Returns a summary of all created segments and exercises.\n\n"
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
    unit = _get_unit_or_404(db, unit_id, current_user.id)

    # Build a unit content string used as context for exercise generators.
    # Even without existing RAG chunks we can provide the topic + level as a hint.
    unit_content = (
        f"Unit: {unit.title}\n"
        f"Description: {unit.description or ''}\n"
        f"Topic: {body.topic}\n"
        f"CEFR level: {body.level}\n"
        f"Language: {body.language}\n"
    )

    created_segments: list[SegmentSummary] = []
    total_exercises = 0
    start_order = _next_order_index(db, unit_id)

    for seg_idx in range(body.num_segments):
        seg_title = _segment_title(body.topic, seg_idx, body.num_segments)
        topic_hint = _build_topic_hint(body.topic, body.level, body.language, seg_idx)

        # 1. Create the Segment row
        segment = Segment(
            unit_id=unit_id,
            title=seg_title,
            description=f"Auto-generated segment for: {body.topic}",
            order_index=start_order + seg_idx,
            status=SegmentStatus.DRAFT,
            is_visible_to_students=False,
            created_by=current_user.id,
            media_blocks=[],
        )
        db.add(segment)
        db.flush()  # get segment.id

        # 2. Generate each requested exercise type
        seg_exercises: list[str] = []
        for ex_type in body.exercise_types:
            generator_fn = EXERCISE_GENERATORS.get(ex_type)
            if generator_fn is None:
                logger.warning("No generator found for exercise type '%s' — skipping.", ex_type)
                continue

            try:
                exercise_data, _metadata = await generator_fn(
                    unit_content=unit_content,
                    content_language=body.language.lower(),
                    instruction_language=body.instruction_language,
                    topic_hint=topic_hint,
                )
            except Exception as exc:
                logger.warning(
                    "Exercise generation failed for type '%s' in segment %d: %s",
                    ex_type, segment.id, exc,
                )
                continue

            # Build the media_block dict and append to segment
            block: dict[str, Any] = {
                "id": str(uuid.uuid4()),
                "kind": ex_type,
                "title": exercise_data.get("title", ex_type.replace("_", " ").title()),
                "data": exercise_data,
            }
            media_blocks = list(segment.media_blocks or [])
            media_blocks.append(block)
            segment.media_blocks = media_blocks
            flag_modified(segment, "media_blocks")

            seg_exercises.append(ex_type)
            total_exercises += 1

        db.flush()
        created_segments.append(
            SegmentSummary(
                id=segment.id,
                title=seg_title,
                exercises_created=len(seg_exercises),
                exercise_types=seg_exercises,
            )
        )

    db.commit()

    return UnitGenerateResponse(
        segments_created=len(created_segments),
        exercises_created=total_exercises,
        segments=created_segments,
    )


# ── from-file endpoint ────────────────────────────────────────────────────────

@router.post(
    "/{unit_id}/generate/from-file",
    response_model=UnitGenerateResponse,
    summary="AI-generate unit segments from an uploaded file",
    description=(
        "Upload a PDF or DOCX file. The endpoint extracts its text, derives the topic "
        "from the document title (or filename), and runs the same generation pipeline "
        "as `POST /units/{unit_id}/generate`.\n\n"
        "All form fields mirror the JSON body of the standard generate endpoint.\n\n"
        f"**Supported file types:** pdf, docx — max 20 MB"
    ),
    tags=["AI Unit Generation"],
)
async def generate_unit_from_file(
    unit_id: int,
    file: UploadFile = File(..., description="PDF or DOCX file — max 20 MB"),
    level: str = Form(default="A2", description="CEFR level: A1–C2"),
    language: str = Form(default="English", description="Target language of the content"),
    num_segments: int = Form(default=3, ge=1, le=6, description="Number of segments to create (1–6)"),
    exercise_types: str = Form(
        default="drag_to_gap,match_pairs",
        description="Comma-separated exercise type keys, e.g. 'drag_to_gap,match_pairs'",
    ),
    instruction_language: str = Form(default="english", description="Language for student-facing UI labels"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher),
) -> UnitGenerateResponse:
    # ── 1. Validate unit access ───────────────────────────────────────────────
    unit = _get_unit_or_404(db, unit_id, current_user.id)

    # ── 2. Validate file type & size ──────────────────────────────────────────
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

    # ── 3. Parse file → text ──────────────────────────────────────────────────
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

    # ── 4. Derive topic from document title or filename ───────────────────────
    topic = (
        parsed_doc.title
        or filename.rsplit(".", 1)[0].replace("_", " ").replace("-", " ").strip()
        or unit.title
    )

    # ── 5. Parse & validate form fields ──────────────────────────────────────
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

    # ── 6. Build service request & run generator ──────────────────────────────
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
    )

    service = UnitGeneratorService(ai_provider=provider)
    try:
        result = await service.generate(svc_request, db)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    # ── 7. Shape response to match UnitGenerateResponse ───────────────────────
    segments_summary: list[SegmentSummary] = []
    for seg_id in result.segment_ids:
        seg = db.query(Segment).filter(Segment.id == seg_id).first()
        if seg is None:
            continue
        ex_types_in_seg = [b.get("kind", "") for b in (seg.media_blocks or [])]
        segments_summary.append(
            SegmentSummary(
                id=seg.id,
                title=seg.title,
                exercises_created=len(ex_types_in_seg),
                exercise_types=ex_types_in_seg,
            )
        )

    return UnitGenerateResponse(
        segments_created=result.segments_created,
        exercises_created=result.exercises_created,
        segments=segments_summary,
    )