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

import asyncio
import base64 as _base64
import logging
import os
import uuid
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.services.ai.providers.base import AIProvider, AIProviderError
from app.services.ai_exercise_generator import (
    generate_exercise,
    generate_exercise_instruction,
)

# Sentinel value matching the historical default of ``instruction_language``
# across this module's public functions. When a caller does not override the
# parameter we fall back to ``course.native_language`` so generated text and
# learner instructions are emitted in the language the course teaches in.
_DEFAULT_INSTRUCTION_LANGUAGE = "english"

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
    from sqlalchemy.orm.attributes import flag_modified  # noqa: PLC0415

    # Always reload from DB before appending so we never overwrite a block that
    # was committed by the previous exercise in the same generation loop.
    # SQLAlchemy's identity-map caching means a non-expired object's attributes
    # are preserved as-is by session.query() — a fresh db.refresh() is the only
    # reliable way to guarantee we read the latest committed media_blocks.
    db.refresh(segment)

    # Build a stable id prefix from the kind so it's easy to recognise in logs.
    prefix = "".join(w[0] for w in kind.split("_"))  # e.g. "dtg", "twig", "swf"
    new_block: dict = {
        "id":    f"{prefix}_{uuid.uuid4().hex[:12]}",
        "kind":  kind,
        "title": block_title,
        "data":  data,
    }

    # Build a fresh list so SQLAlchemy detects the assignment as a change;
    # flag_modified is added as belt-and-suspenders for JSONB columns.
    existing: list = list(segment.media_blocks or [])
    existing.append(new_block)
    segment.media_blocks = existing
    flag_modified(segment, "media_blocks")

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


# ── Card image generation ─────────────────────────────────────────────────────

# Exercise types whose "cards" list must be auto-illustrated on generation.
_IMAGE_CARD_EXERCISE_TYPES: frozenset[str] = frozenset(
    {"type_word_to_image", "drag_word_to_image", "select_form_to_image"}
)


def _resolve_uploads_path() -> str:
    """
    Return the absolute path to the shared uploads directory.

    Delegates to the canonical resolver in app.utils.paths so that setting
    the UPLOADS_DIR env var (e.g. for a Render persistent disk) is sufficient
    to redirect all file writes without touching this code.
    """
    from app.utils.paths import resolve_uploads_path  # noqa: PLC0415
    return resolve_uploads_path()


async def _generate_single_card_image(
    card: dict,
    fal_key: str,
    fal_model: str,
    fal_image_size: str,
    fal_lora_url: str,
    fal_lora_scale: float,
    created_by: int,
    style: str,
) -> None:
    """
    Generate and save an image for a single vocabulary card using fal.ai only.

    fal.ai is the sole image backend — no LLM/SVG fallback is used.
    The card dict is mutated in-place: ``imageUrl`` is set to the static
    serving URL on success, left empty when FAL_KEY is absent or the request
    fails (teacher can upload manually in that case).
    """
    description = (card.get("description") or "").strip()
    # Skip cards that already have an image or lack a description to guide generation.
    if not description or card.get("imageUrl"):
        return

    # Use the scene description as alt text so the answer word never leaks
    # into the image-generation prompt (prevents text answers from appearing
    # as labels on the card image).
    alt_text = description

    # fal.ai is the sole image provider — no LLM-based SVG fallback.
    # If FAL_KEY is not configured, skip generation and leave imageUrl empty
    # so the teacher can upload the card image manually.
    if not fal_key:
        logger.warning(
            "_generate_single_card_image: FAL_KEY not configured — skipping card %r (teacher can upload manually).",
            card.get("id"),
        )
        return

    # Attempt fal.ai generation.
    try:
        from app.services.ai.image_providers import FalImageProvider  # noqa: PLC0415
        fal_provider = FalImageProvider(
            api_key=fal_key,
            model=fal_model,
            image_size=fal_image_size,
            lora_url=fal_lora_url,
            lora_scale=fal_lora_scale,
        )
        img_result = await fal_provider.agenerate_image(
            prompt=description,
            alt_text=alt_text,
            style=style,
        )
    except Exception as exc:  # noqa: BLE001
        # Prevent a single card failure from blocking the whole batch.
        logger.warning(
            "_generate_single_card_image: fal.ai failed for card %r — leaving imageUrl empty: %s",
            card.get("id"), exc,
        )
        return  # Leave imageUrl empty so the teacher can upload manually.

    # Persist the result via the file_storage abstraction.
    # In cloud mode (MINIO_PUBLIC_URL set) files go to the S3-compatible bucket
    # so they survive Render redeploys.  In local dev they land on disk as before.
    try:
        from app.services.ai.image_providers.image_base import ImageFormat  # noqa: PLC0415
        from app.services.file_storage import save_image  # noqa: PLC0415

        if img_result.format == ImageFormat.SVG:
            # SVG is plain text; encode to bytes for unified storage call.
            filename = f"{uuid.uuid4().hex[:16]}.svg"
            raw_bytes = img_result.data.encode("utf-8")
            mime = "image/svg+xml"
        else:
            # All raster formats (PNG, JPEG, WEBP) are base64-encoded bytes.
            filename = f"{uuid.uuid4().hex[:16]}.png"
            raw_bytes = _base64.b64decode(img_result.data)
            mime = "image/png"

        # Logical path inside the bucket / uploads directory.
        object_name = f"questions/{created_by}/{filename}"
        card["imageUrl"] = save_image(data=raw_bytes, object_name=object_name, content_type=mime)
        logger.info(
            "_generate_single_card_image: saved image for card %r → %s",
            card.get("id"), card["imageUrl"],
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "_generate_single_card_image: failed to save image for card %r: %s",
            card.get("id"), exc,
        )


async def _generate_and_save_card_images(
    cards: list[dict],
    created_by: int,
) -> None:
    """
    Generate and save images for all cards in a word-to-image exercise.

    Each card with a non-empty ``description`` and an empty ``imageUrl`` is
    illustrated in parallel using fal.ai only.  Images are written
    to the shared uploads directory under ``questions/{created_by}/`` — the
    same path tree as teacher-manual uploads — so the existing static-file
    serving route (``/api/v1/static/``) serves them without extra config.

    Dicts in ``cards`` are mutated in-place; ``imageUrl`` is populated on
    success and left empty on failure so the teacher can upload manually.
    """
    # Resolve fal.ai settings from app config, fall back to environment vars.
    fal_key = ""
    fal_model = "fal-ai/flux/dev"
    # square_hd produces the best aspect ratio for vocabulary flashcard thumbnails.
    fal_image_size = "square_hd"
    fal_lora_url = ""
    fal_lora_scale = 0.8
    try:
        from app.core.config import settings as _settings  # noqa: PLC0415
        fal_key = getattr(_settings, "FAL_KEY", "") or ""
        fal_model = getattr(_settings, "FAL_MODEL", "") or "fal-ai/flux/dev"
        # FAL_IMAGE_SIZE from config overrides the default only when explicitly set;
        # square_hd is kept as the fallback because it suits vocabulary cards best.
        fal_image_size = getattr(_settings, "FAL_IMAGE_SIZE", "") or "square_hd"
        fal_lora_url = getattr(_settings, "FAL_LORA_URL", "") or ""
        fal_lora_scale = float(getattr(_settings, "FAL_LORA_SCALE", 0.8) or 0.8)
    except Exception:  # noqa: BLE001
        fal_key = os.environ.get("FAL_KEY", "")

    # Illustration-only style: the student must identify the concept from the
    # picture, so the answer word must NEVER appear as text inside the image.
    style = (
        "educational vocabulary illustration, flat design, vibrant colors, "
        "clean white background, expressive and clear scene, "
        "ABSOLUTELY NO text, NO words, NO letters, NO labels, NO captions, "
        "NO answer word on image — visual hint only, illustration without any writing"
    )

    # Generate all card images concurrently; individual failures are swallowed
    # inside _generate_single_card_image so one bad card cannot cancel others.
    tasks = [
        _generate_single_card_image(
            card=card,
            fal_key=fal_key,
            fal_model=fal_model,
            fal_image_size=fal_image_size,
            fal_lora_url=fal_lora_url,
            fal_lora_scale=fal_lora_scale,
            created_by=created_by,
            style=style,
        )
        for card in cards
    ]
    await asyncio.gather(*tasks)


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
    # Type-specific extras forwarded verbatim to the generator.
    generator_params: dict | None = None,
    # Accepted but intentionally NOT used for quota gating here.
    # Quota enforcement is the responsibility of the calling HTTP endpoint
    # (POST /segments/{id}/exercises/{type}).  Service-layer callers such as
    # UnitGeneratorService and the course-generation SSE stream have already
    # consumed their own quota bucket (unit_generation / course_generation)
    # and must not be blocked by the standalone exercise_generation limit.
    teacher_plan: str | None = None,  # noqa: ARG001
    # When set (e.g. by UnitGenerator), forces the same LLM stack as unit text
    # instead of the module default chain (avoids surprise Groq fallback).
    provider: AIProvider | None = None,
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
    # Forwards optional provider into type-specific generators; omitted when None
    # so they keep using _default_provider inside ai_exercise_generator.
    exercise_call_kwargs = dict(params)
    if provider is not None:
        exercise_call_kwargs["provider"] = provider

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

    # ── 2b. Resolve course-level language settings ────────────────────────────
    # native_language / target_language are stored on the Course row.
    # They are forwarded to generators that use them (currently: match_pairs).
    # Generators that don't need them absorb them via **_ignored.
    course_native_language: str | None = None
    course_target_language: str | None = None
    try:
        from app.models.course import Course  # noqa: PLC0415

        if getattr(unit, "course_id", None):
            course = db.query(Course).filter(Course.id == unit.course_id).first()
            if course is not None:
                course_native_language = getattr(course, "native_language", None) or None
                course_target_language = getattr(course, "target_language", None) or None
                logger.debug(
                    "Resolved course languages — native=%r target=%r (course_id=%d)",
                    course_native_language, course_target_language, unit.course_id,
                )
    except Exception as _lang_exc:  # noqa: BLE001
        # Never let a language-lookup failure block exercise generation.
        logger.warning("Could not resolve course languages: %s", _lang_exc)

    # ── 2c. Default instruction_language to the course's native_language ─────
    # When the caller leaves ``instruction_language`` at its historical default
    # ("english") we override it with the course's persisted native_language so
    # generated titles AND the new learner-facing ``instruction`` field come
    # out in the language the course is taught in. Callers that pass an
    # explicit non-default value (e.g. from a teacher-side override) win.
    effective_instruction_language = instruction_language
    if (
        course_native_language
        and (instruction_language or "").strip().lower() == _DEFAULT_INSTRUCTION_LANGUAGE
    ):
        effective_instruction_language = course_native_language
        logger.info(
            "Defaulting instruction_language to course.native_language=%r (was %r) for course_id=%s.",
            course_native_language,
            instruction_language,
            getattr(unit, "course_id", None),
        )

    # ── 3. Generate via LLM ───────────────────────────────────────────────────
    try:
        exercise_data, metadata = await generate_exercise(
            exercise_type=exercise_type,
            unit_content=unit_content,
            content_language=content_language,
            instruction_language=effective_instruction_language,
            topic_hint=topic_hint,
            native_language=course_native_language,
            target_language=course_target_language,
            **exercise_call_kwargs,
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

    # ── 3b. Attach a localized learner instruction ───────────────────────────
    # The frontend renders ``data.instruction`` in each exercise block when
    # present (falling back to the hardcoded English copy). We only generate
    # this when the per-type generator did not already supply one — that way
    # a future generator can opt out of the extra LLM round-trip by emitting
    # its own instruction string.
    if not exercise_data.get("instruction"):
        try:
            generated_instruction = await generate_exercise_instruction(
                exercise_type=exercise_type,
                instruction_language=effective_instruction_language,
            )
        except Exception as _instr_exc:  # noqa: BLE001
            # Localization is best-effort; never let it block persistence.
            logger.warning(
                "Failed to generate learner instruction for type=%s lang=%r: %s",
                exercise_type, effective_instruction_language, _instr_exc,
            )
            generated_instruction = ""

        if generated_instruction:
            exercise_data["instruction"] = generated_instruction
            metadata["instruction"] = generated_instruction
            metadata["instruction_language"] = effective_instruction_language

    # ── 3c. Auto-generate card images for visual-match exercise types ────────
    # For drag/type-word-to-image exercises the LLM returns cards with empty
    # imageUrl fields.  We fill them now by calling fal.ai (→ SVG fallback)
    # and saving the results to disk so they are immediately usable in the
    # lesson editor without the teacher having to upload each image manually.
    if exercise_type in _IMAGE_CARD_EXERCISE_TYPES:
        cards = exercise_data.get("cards") or []
        if cards:
            try:
                await _generate_and_save_card_images(
                    cards=cards,
                    created_by=created_by,
                )
                # Count how many cards received an image for the metadata log.
                filled = sum(1 for c in cards if c.get("imageUrl"))
                logger.info(
                    "Auto-generated images for %d/%d cards — exercise_type=%s segment_id=%d",
                    filled, len(cards), exercise_type, segment_id,
                )
                metadata["images_generated"] = filled
                metadata["images_total"] = len(cards)
                if filled == len(cards):
                    metadata.pop("note", None)
            except Exception as _img_exc:  # noqa: BLE001
                # Image generation is best-effort; never block exercise save.
                logger.warning(
                    "Card image generation failed for exercise_type=%s segment_id=%d: %s",
                    exercise_type, segment_id, _img_exc,
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