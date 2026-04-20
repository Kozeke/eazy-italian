"""
app/services/unit_generator.py
===============================
AI-powered unit segment & exercise generator.

Generates a full set of Segments (with text blocks, exercise blocks, and
optionally AI images) for a given Unit from a high-level topic description.

Flow
----
1.  Call the configured AI provider with a structured prompt.
2.  Parse + validate the returned JSON blueprint.
3.  For each segment in the blueprint:
      a. Create a ``Segment`` DB record.
      b. For each text block: insert a ``kind="text"`` media block with
         grammar rules / vocabulary / examples in Markdown.
      c. For each exercise block: call ``generate_exercise_for_segment()``.
      d. If ``include_images=True``: generate an SVG diagram via
         ``SVGImageProvider`` and append a ``kind="image"`` media block.
4.  Return a summary: ``{ segments_created, texts_created,
    exercises_created, images_created }``.

Blueprint schema the LLM must return
--------------------------------------
{
  "segments": [
    {
      "title": "Greetings and introductions",
      "description": "Learn how to introduce yourself",
      "texts": [
        {
          "title": "Grammar Rules",
          "content": "## Greetings\\n\\nUse *Hello* for formal..."
        }
      ],
      "exercises": [
        { "type": "drag_to_gap",  "topic_hint": "Greetings vocabulary" },
        { "type": "match_pairs",  "topic_hint": "Common phrases" }
      ]
    }
  ]
}

Supported exercise type values
---------------------------------
drag_to_gap, type_word_in_gap, select_word_form, match_pairs,
build_sentence, order_paragraphs, sort_into_columns,
test_without_timer, test_with_timer, true_false
"""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass, field
from typing import Any

from pydantic import BaseModel, Field, ValidationError, model_validator
from sqlalchemy.orm import Session

from app.models.segment import Segment, SegmentStatus
from app.services.ai.providers.base import AIProvider, AIProviderError
from app.services.exercise_generation_flow import generate_exercise_for_segment

logger = logging.getLogger(__name__)


# ── Supported exercise types ──────────────────────────────────────────────────

SUPPORTED_EXERCISE_TYPES: frozenset[str] = frozenset(
    {
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
)


# ── Pydantic schemas for blueprint validation ─────────────────────────────────

class TextBlueprint(BaseModel):
    """One text / explanation block inside a segment blueprint."""

    title: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Short heading, e.g. 'Grammar Rules', 'Key Vocabulary', 'Examples'.",
    )
    content: str = Field(
        ...,
        min_length=1,
        max_length=4000,
        description=(
            "Markdown-formatted educational content: grammar explanations, "
            "vocabulary lists, usage examples, tips."
        ),
    )


class ExerciseBlueprint(BaseModel):
    """One exercise block declared inside a segment blueprint."""

    type: str = Field(..., description="Exercise type key, e.g. 'drag_to_gap'")
    topic_hint: str | None = Field(
        default=None,
        max_length=512,
        description="Optional teacher directive forwarded to the exercise generator.",
    )

    @model_validator(mode="after")
    def _normalise_type(self) -> "ExerciseBlueprint":
        self.type = self.type.replace("-", "_").lower()
        if self.type not in SUPPORTED_EXERCISE_TYPES:
            supported = ", ".join(sorted(SUPPORTED_EXERCISE_TYPES))
            raise ValueError(
                f"Unknown exercise type '{self.type}'. Supported: {supported}"
            )
        return self


class SegmentBlueprint(BaseModel):
    """One segment as returned by the LLM."""

    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(default=None)
    texts: list[TextBlueprint] = Field(
        default_factory=list,
        description="Text / explanation blocks (grammar rules, vocabulary, examples).",
    )
    exercises: list[ExerciseBlueprint] = Field(default_factory=list)


class UnitBlueprint(BaseModel):
    """Top-level JSON object returned by the LLM."""

    segments: list[SegmentBlueprint] = Field(..., min_length=1)


# ── Request schema ────────────────────────────────────────────────────────────

@dataclass
class UnitGenerateRequest:
    """Parameters for a full unit-generation run."""

    unit_id: int
    topic: str
    level: str
    language: str
    num_segments: int
    exercise_types: list[str] = field(default_factory=list)
    teacher_id: int = 0
    content_language: str = "auto"
    instruction_language: str = "english"
    source_content: str | None = None
    include_images: bool = False   # generate SVG images only when requested
    description: str | None = None  # optional teacher directive injected into the prompt


# ── Result type ───────────────────────────────────────────────────────────────

@dataclass
class UnitGenerateResult:
    segments_created: int
    exercises_created: int
    texts_created: int = 0
    images_created: int = 0
    segment_ids: list[int] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "segments_created": self.segments_created,
            "exercises_created": self.exercises_created,
            "texts_created": self.texts_created,
            "images_created": self.images_created,
            "segment_ids": self.segment_ids,
            "errors": self.errors,
        }


# ── Service ───────────────────────────────────────────────────────────────────

class UnitGeneratorService:
    """
    Orchestrates AI-powered segment + text + exercise + image generation.
    """

    def __init__(self, ai_provider: AIProvider) -> None:
        self.provider = ai_provider

    # ── Public API ────────────────────────────────────────────────────────────

    async def generate(
        self,
        request: UnitGenerateRequest,
        db: Session,
    ) -> UnitGenerateResult:
        """Full pipeline: prompt → parse → persist → return summary."""
        prompt = self._build_prompt(request)
        logger.info(
            "UnitGenerator: start unit_id=%d teacher_id=%d topic=%r level=%s language=%s segments=%d include_images=%s",
            request.unit_id,
            request.teacher_id,
            request.topic,
            request.level,
            request.language,
            request.num_segments,
            request.include_images,
        )
        # Keep provider errors explicit in logs while preserving API-friendly exceptions.
        try:
            raw_output = await self.provider.agenerate(prompt)
        except AIProviderError as exc:
            logger.error(
                "UnitGenerator: provider failed for unit_id=%d teacher_id=%d: %s",
                request.unit_id,
                request.teacher_id,
                exc,
                exc_info=True,
            )
            raise RuntimeError(f"AI provider error during unit generation: {exc}") from exc

        blueprint = self._parse_blueprint(raw_output)
        result = await self._persist(blueprint, request, db)

        logger.info(
            "UnitGenerator: completed unit_id=%d — %d segments, %d texts, "
            "%d exercises, %d images (%d errors)",
            request.unit_id,
            result.segments_created,
            result.texts_created,
            result.exercises_created,
            result.images_created,
            len(result.errors),
        )
        return result

    async def preview(self, request: UnitGenerateRequest) -> UnitBlueprint:
        """Generate and validate the blueprint without touching the database."""
        prompt = self._build_prompt(request)
        raw_output = await self.provider.agenerate(prompt)
        return self._parse_blueprint(raw_output)

    # ── Prompt builder ────────────────────────────────────────────────────────

    def _build_prompt(self, request: UnitGenerateRequest) -> str:
        if request.exercise_types:
            normalised = [t.replace("-", "_").lower() for t in request.exercise_types]
            valid = [t for t in normalised if t in SUPPORTED_EXERCISE_TYPES]
            exercise_hint = (
                f"Distribute these exercise types across the segments "
                f"(repeat as needed to cover all segments): {', '.join(valid)}.\n"
                f"Each segment should have 1–3 exercises chosen from this list."
            )
        else:
            exercise_hint = (
                "Choose appropriate exercise types from this list for each segment: "
                + ", ".join(sorted(SUPPORTED_EXERCISE_TYPES))
                + ".\nEach segment should have 1–3 exercises."
            )

        content_section = ""
        if request.source_content:
            excerpt = request.source_content[:1500].strip()
            content_section = (
                f"\nSource material (base your segments on this):\n"
                f"---\n{excerpt}\n---\n"
            )

        teacher_directive = ""
        if request.description and request.description.strip():
            teacher_directive = (
                f"\nTeacher directive (MUST be followed — highest priority instruction):\n"
                f"  {request.description.strip()}\n"
            )

        return f"""You are a professional language-teaching curriculum designer.

Generate a lesson unit structure for the following specification:

  Topic    : {request.topic}
  Level    : {request.level}
  Language : {request.language}
  Segments : {request.num_segments}
{teacher_directive}{content_section}
{exercise_hint}

Return ONLY a single valid JSON object — no markdown, no code fences, no
preamble, no trailing text.  The JSON must match this exact schema:

{{
  "segments": [
    {{
      "title": "<concise segment title>",
      "description": "<one or two sentences describing what students will learn>",
      "texts": [
        {{
          "title": "<block heading, e.g. 'Grammar Rules', 'Key Vocabulary', 'Examples'>",
          "content": "<educational markdown content: rules, vocab lists, usage examples>"
        }}
      ],
      "exercises": [
        {{
          "type": "<exercise_type_key>",
          "topic_hint": "<brief directive for the AI exercise generator>"
        }}
      ]
    }}
  ]
}}

Rules:
- Generate exactly {request.num_segments} segment(s).
- Each segment must include exactly 1 text block in "texts":
  * Contain grammar rules, vocabulary, or examples relevant to the segment.
  * Written in clear, student-friendly Markdown.
  * Use headings (##), bold (**word**), and bullet lists (- item) freely.
  * Text title and content MUST be in {request.language}. Aim for 80–200 words.
- Exercise "type" must be one of: {', '.join(sorted(SUPPORTED_EXERCISE_TYPES))}.
- "topic_hint" must be a short, specific instruction in English (internal AI directive).
  Example: "Greetings vocabulary — formal and informal", "Past tense regular verbs".
- Segment titles and descriptions must be in {request.language}.
- Keep JSON strictly valid: no trailing commas, no comments.

Return ONLY the JSON object."""

    # ── Blueprint parser ──────────────────────────────────────────────────────

    _LOG_RAW_CHARS = 600

    def _parse_blueprint(self, raw_output: str) -> UnitBlueprint:
        """
        Extract and validate the JSON blueprint from the raw LLM output.
        Resilient to markdown fences and truncated output.
        """
        text = raw_output.strip()

        # Strip markdown fences
        if text.startswith("```"):
            lines = text.splitlines()
            lines = lines[1:]
            if lines and lines[-1].strip().startswith("```"):
                lines = lines[:-1]
            text = "\n".join(lines).strip()

        # Isolate first JSON object
        brace_start = text.find("{")
        if brace_start == -1:
            raise ValueError(
                "AI response contained no JSON object. "
                f"Raw output (first 300 chars): {raw_output[:300]!r}"
            )

        depth = 0
        brace_end = -1
        for i, ch in enumerate(text[brace_start:], start=brace_start):
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    brace_end = i + 1
                    break

        json_text = text[brace_start:brace_end] if brace_end != -1 else text[brace_start:]

        # Fast path
        try:
            return self._validate_blueprint(json.loads(json_text))
        except json.JSONDecodeError:
            pass
        except ValueError:
            raise

        # Repair truncated JSON
        logger.warning(
            "UnitGenerator: LLM output appears truncated — attempting repair. "
            "Raw (first %d chars):\n%s",
            self._LOG_RAW_CHARS,
            raw_output[: self._LOG_RAW_CHARS],
        )
        repaired = self._repair_json(json_text)
        try:
            return self._validate_blueprint(json.loads(repaired))
        except (json.JSONDecodeError, ValueError):
            pass

        # Extract partial segments
        partial = self._extract_partial_segments(json_text or text)
        if partial:
            logger.warning(
                "UnitGenerator: recovered %d partial segment(s) from truncated output.",
                len(partial),
            )
            try:
                return UnitBlueprint(segments=partial)
            except Exception:
                pass

        logger.error(
            "UnitGenerator: JSON decode failed after all recovery attempts.\n"
            "Raw (%d chars): %s",
            self._LOG_RAW_CHARS,
            raw_output[: self._LOG_RAW_CHARS],
        )
        raise ValueError(
            "AI returned invalid / truncated JSON that could not be recovered. "
            "Try again or reduce the amount of source material."
        )

    # ── JSON repair helpers ───────────────────────────────────────────────────

    @staticmethod
    def _repair_json(text: str) -> str:
        stack: list[str] = []
        in_string = False
        escape_next = False

        for ch in text:
            if escape_next:
                escape_next = False
                continue
            if ch == "\\" and in_string:
                escape_next = True
                continue
            if ch == '"':
                in_string = not in_string
                continue
            if in_string:
                continue
            if ch in "{[":
                stack.append(ch)
            elif ch == "}" and stack and stack[-1] == "{":
                stack.pop()
            elif ch == "]" and stack and stack[-1] == "[":
                stack.pop()

        suffix = ""
        if in_string:
            suffix += '"'
        if (text + suffix).rstrip().endswith(":"):
            suffix += "null"
        for opener in reversed(stack):
            suffix += "}" if opener == "{" else "]"

        return text + suffix

    @staticmethod
    def _extract_partial_segments(text: str) -> list[SegmentBlueprint]:
        segments: list[SegmentBlueprint] = []
        i = 0
        while i < len(text):
            if text[i] != "{":
                i += 1
                continue
            depth = 0
            j = i
            in_str = False
            esc = False
            while j < len(text):
                ch = text[j]
                if esc:
                    esc = False
                elif ch == "\\" and in_str:
                    esc = True
                elif ch == '"':
                    in_str = not in_str
                elif not in_str:
                    if ch == "{":
                        depth += 1
                    elif ch == "}":
                        depth -= 1
                        if depth == 0:
                            candidate = text[i : j + 1]
                            try:
                                data = json.loads(candidate)
                                if "title" in data:
                                    seg = SegmentBlueprint.model_validate(data)
                                    segments.append(seg)
                            except Exception:
                                pass
                            break
                j += 1
            i = j + 1

        return segments

    @staticmethod
    def _validate_blueprint(data: Any) -> UnitBlueprint:
        try:
            return UnitBlueprint.model_validate(data)
        except ValidationError as exc:
            raise ValueError(f"Blueprint schema validation failed: {exc}") from exc

    # ── Persistence ───────────────────────────────────────────────────────────

    async def _persist(
        self,
        blueprint: UnitBlueprint,
        request: UnitGenerateRequest,
        db: Session,
    ) -> UnitGenerateResult:
        """
        Write all Segment records:
          1. Text blocks  (grammar/vocabulary/examples — always)
          2. Exercise blocks (AI-generated interactive exercises)
          3. Image block  (SVG diagram — only if include_images=True)
        """
        from sqlalchemy.orm.attributes import flag_modified

        result = UnitGenerateResult(segments_created=0, exercises_created=0)

        # Initialise image provider once and reuse across segments.
        # Priority: HuggingFaceImageProvider (real AI images) → SVGImageProvider (fallback)
        img_provider = None
        if request.include_images:
            import os
            hf_api_key = os.environ.get("HF_API_KEY", "")
            if hf_api_key:
                try:
                    from app.services.ai.image_providers.huggingface_provider import (
                        HuggingFaceImageProvider,
                    )
                    img_provider = HuggingFaceImageProvider(
                        api_key=hf_api_key,
                        width=512,
                        height=384,
                    )
                    logger.info(
                        "UnitGenerator: image generation enabled (HuggingFaceImageProvider)"
                    )
                except Exception as exc:
                    logger.warning(
                        "UnitGenerator: could not init HuggingFaceImageProvider — "
                        "falling back to SVGImageProvider: %s",
                        exc,
                    )
            if img_provider is None:
                # Fallback: SVG diagrams generated by the LLM (no external API needed)
                try:
                    from app.services.ai.image_providers.svg_provider import SVGImageProvider
                    img_provider = SVGImageProvider(ai_provider=self.provider)
                    logger.info(
                        "UnitGenerator: image generation enabled (SVGImageProvider fallback)"
                    )
                except Exception as exc:
                    logger.warning(
                        "UnitGenerator: could not init SVGImageProvider — images disabled: %s",
                        exc,
                    )

        for order_idx, seg_bp in enumerate(blueprint.segments):
            logger.info(
                "UnitGenerator: segment start unit_id=%d segment_index=%d segment_title=%r",
                request.unit_id,
                order_idx,
                seg_bp.title,
            )
            # ── Create Segment record ─────────────────────────────────────────
            segment = Segment(
                unit_id=request.unit_id,
                title=seg_bp.title,
                description=seg_bp.description,
                order_index=order_idx,
                status=SegmentStatus.DRAFT,
                is_visible_to_students=False,
                created_by=request.teacher_id,
                media_blocks=[],
            )
            db.add(segment)
            try:
                db.flush()
            except Exception as exc:
                db.rollback()
                error_msg = f"Segment[{order_idx}] '{seg_bp.title}': DB flush failed — {exc}"
                logger.error("UnitGenerator: %s", error_msg, exc_info=True)
                result.errors.append(error_msg)
                continue

            result.segments_created += 1
            result.segment_ids.append(segment.id)

            # Collect text/image blocks to prepend before exercise blocks
            prepend_blocks: list[dict[str, Any]] = []

            # ── 1. Text blocks ────────────────────────────────────────────────
            for txt_bp in seg_bp.texts:
                text_block: dict[str, Any] = {
                    "id": str(uuid.uuid4()),
                    "kind": "text",
                    "title": txt_bp.title,
                    "data": {
                        "content": txt_bp.content,
                        "format": "markdown",
                    },
                }
                prepend_blocks.append(text_block)
                result.texts_created += 1
                logger.debug(
                    "UnitGenerator: text block '%s' added to segment id=%d",
                    txt_bp.title, segment.id,
                )

            # ── 2. Image block (optional, placed after text, before exercises) ─
            if img_provider is not None:
                try:
                    from app.services.image_prompt_builder import ImagePromptBuilder
                    img_prompt = ImagePromptBuilder.build(
                        slide_title=seg_bp.title,
                        bullet_points=(
                            [seg_bp.description] if seg_bp.description else [request.topic]
                        ),
                        topic=request.topic,
                        audience=f"{request.level} level {request.language} learner",
                        style="educational, flat illustration, clean background",
                    )
                    img_result = await img_provider.agenerate_image(
                        prompt=img_prompt,
                        alt_text=f"Educational illustration for: {seg_bp.title}",
                        style="educational, flat illustration, clean background",
                    )
                    image_block: dict[str, Any] = {
                        "id": str(uuid.uuid4()),
                        "kind": "image",
                        "title": seg_bp.title,
                        "data": {
                            "src": img_result.as_data_uri(),
                            "alt_text": f"Educational illustration for: {seg_bp.title}",
                        },
                    }
                    prepend_blocks.append(image_block)
                    result.images_created += 1
                    logger.debug(
                        "UnitGenerator: image generated for segment id=%d", segment.id
                    )
                except Exception as exc:
                    error_msg = (
                        f"Segment[{order_idx}] '{seg_bp.title}': "
                        f"image generation failed — {exc}"
                    )
                    logger.warning("UnitGenerator: %s", error_msg, exc_info=True)
                    result.errors.append(error_msg)

            # ── 3. Exercise blocks ────────────────────────────────────────────
            for ex_bp in seg_bp.exercises:
                try:
                    await generate_exercise_for_segment(
                        exercise_type=ex_bp.type,
                        db=db,
                        segment_id=segment.id,
                        unit_id=request.unit_id,
                        created_by=request.teacher_id,
                        block_title=None,
                        topic_hint=ex_bp.topic_hint,
                        content_language=request.content_language,
                        instruction_language=request.instruction_language,
                        generator_params={},
                    )
                    result.exercises_created += 1
                    logger.debug(
                        "UnitGenerator: exercise '%s' generated for segment id=%d",
                        ex_bp.type, segment.id,
                    )
                except Exception as exc:
                    error_msg = (
                        f"Segment[{order_idx}] '{seg_bp.title}' / "
                        f"exercise '{ex_bp.type}': generation failed — {exc}"
                    )
                    logger.warning("UnitGenerator: %s", error_msg, exc_info=True)
                    result.errors.append(error_msg)

            # ── Merge prepend_blocks before any exercise blocks already written ─
            if prepend_blocks:
                db.refresh(segment)
                existing_exercise_blocks = list(segment.media_blocks or [])
                segment.media_blocks = prepend_blocks + existing_exercise_blocks
                flag_modified(segment, "media_blocks")
                try:
                    db.flush()
                except Exception as exc:
                    logger.warning(
                        "UnitGenerator: flush of text/image blocks for segment id=%d failed: %s",
                        segment.id, exc,
                    )

            logger.info(
                "UnitGenerator: segment complete unit_id=%d segment_id=%d texts=%d exercises=%d",
                request.unit_id,
                segment.id,
                len(seg_bp.texts),
                len(seg_bp.exercises),
            )

        # Final commit
        try:
            db.commit()
        except Exception as exc:
            db.rollback()
            raise RuntimeError(
                f"UnitGenerator: final DB commit failed — {exc}"
            ) from exc

        return result