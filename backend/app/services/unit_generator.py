"""
app/services/unit_generator.py
===============================
AI-powered unit segment & exercise generator.

Generates a full set of Segments (with exercise blocks) for a given Unit
from a high-level topic description.

Flow
----
1.  Call the configured AI provider with a structured prompt.
2.  Parse + validate the returned JSON blueprint.
3.  For each segment in the blueprint:
      a. Create a ``Segment`` DB record.
      b. For each exercise block declared in the segment:
           call ``generate_exercise_for_segment()`` — the exact same function
           used by the exercise editor endpoint.
4.  Return a summary dict: ``{ segments_created: N, exercises_created: M }``.

Blueprint schema the LLM must return
--------------------------------------
{
  "segments": [
    {
      "title": "Greetings and introductions",
      "description": "Learn how to introduce yourself",
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
from dataclasses import dataclass, field
from typing import Any

from pydantic import BaseModel, Field, ValidationError, model_validator
from sqlalchemy.orm import Session

from app.models.segment import Segment, SegmentStatus
from app.services.ai.providers.base import AIProvider, AIProviderError
from app.services.exercise_generation_flow import generate_exercise_for_segment

logger = logging.getLogger(__name__)


# ── Supported exercise types (mirrors exercise_generation.py) ─────────────────

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
        # Accept hyphenated slugs as well (e.g. "drag-to-gap" → "drag_to_gap")
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
    exercises: list[ExerciseBlueprint] = Field(default_factory=list)


class UnitBlueprint(BaseModel):
    """Top-level JSON object returned by the LLM."""

    segments: list[SegmentBlueprint] = Field(..., min_length=1)


# ── Request schema ────────────────────────────────────────────────────────────

@dataclass
class UnitGenerateRequest:
    """
    Parameters for a full unit-generation run.

    Attributes
    ----------
    unit_id : int
        ID of the Unit to attach segments to.
    topic : str
        High-level topic for the unit (e.g. "Daily routines in Italian").
    level : str
        CEFR level string, e.g. "A1", "B2".
    language : str
        Target language for generated content (e.g. "Italian").
    num_segments : int
        Number of segments (sections) to generate.  1–10.
    exercise_types : list[str]
        Ordered list of exercise type keys the AI should distribute across
        segments.  If empty the AI chooses freely.
    teacher_id : int
        ID of the creating teacher — stamped on every Segment record.
    content_language : str
        Language the source content is written in (forwarded to exercise
        generator).  Defaults to "auto".
    instruction_language : str
        Language for exercise UI labels shown to students (forwarded to
        exercise generator).  Defaults to "english".
    """

    unit_id: int
    topic: str
    level: str
    language: str
    num_segments: int
    exercise_types: list[str] = field(default_factory=list)
    teacher_id: int = 0
    content_language: str = "auto"
    instruction_language: str = "english"
    source_content: str | None = None  # raw text extracted from an uploaded file


# ── Result type ───────────────────────────────────────────────────────────────

@dataclass
class UnitGenerateResult:
    segments_created: int
    exercises_created: int
    segment_ids: list[int] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "segments_created": self.segments_created,
            "exercises_created": self.exercises_created,
            "segment_ids": self.segment_ids,
            "errors": self.errors,
        }


# ── Service ───────────────────────────────────────────────────────────────────

class UnitGeneratorService:
    """
    Orchestrates AI-powered segment + exercise generation for a Unit.

    Parameters
    ----------
    ai_provider : AIProvider
        Any provider that implements ``AIProvider.agenerate(prompt) -> str``.
        Inject via dependency injection or instantiate directly.
    """

    def __init__(self, ai_provider: AIProvider) -> None:
        self.provider = ai_provider

    # ── Public API ────────────────────────────────────────────────────────────

    async def generate(
        self,
        request: UnitGenerateRequest,
        db: Session,
    ) -> UnitGenerateResult:
        """
        Full pipeline: prompt → parse → persist → return summary.

        Steps
        -----
        1. Build and send the structured prompt to the LLM.
        2. Parse + validate the JSON blueprint.
        3. Create Segment DB records.
        4. Generate exercise blocks via ``generate_exercise_for_segment()``.
        5. Return a ``UnitGenerateResult`` summary.

        Parameters
        ----------
        request : UnitGenerateRequest
            Generation parameters.
        db : Session
            Active SQLAlchemy session.

        Returns
        -------
        UnitGenerateResult
        """
        # ── Step 1: Generate blueprint ────────────────────────────────────────
        prompt = self._build_prompt(request)
        logger.info(
            "UnitGenerator: calling AI provider for unit_id=%d topic=%r",
            request.unit_id,
            request.topic,
        )
        try:
            raw_output = await self.provider.agenerate(prompt)
        except AIProviderError as exc:
            raise RuntimeError(f"AI provider error during unit generation: {exc}") from exc

        # ── Step 2: Parse + validate ──────────────────────────────────────────
        blueprint = self._parse_blueprint(raw_output)

        # ── Step 3 & 4: Persist ───────────────────────────────────────────────
        result = await self._persist(blueprint, request, db)

        logger.info(
            "UnitGenerator: completed unit_id=%d — %d segments, %d exercises (%d errors)",
            request.unit_id,
            result.segments_created,
            result.exercises_created,
            len(result.errors),
        )
        return result

    async def preview(self, request: UnitGenerateRequest) -> UnitBlueprint:
        """
        Generate and validate the blueprint without touching the database.

        Useful for showing a preview before committing.
        """
        prompt = self._build_prompt(request)
        raw_output = await self.provider.agenerate(prompt)
        return self._parse_blueprint(raw_output)

    # ── Prompt builder ────────────────────────────────────────────────────────

    def _build_prompt(self, request: UnitGenerateRequest) -> str:
        """
        Construct the structured prompt sent to the LLM.

        The prompt is deliberately explicit about the JSON schema the model
        must return so that ``_parse_blueprint`` has predictable input.
        """
        # Build the exercise-type hint section
        if request.exercise_types:
            normalised = [t.replace("-", "_").lower() for t in request.exercise_types]
            # Filter to supported types to avoid confusing the LLM
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

        # Build optional source-material section.
        # Cap to 1 500 chars — large excerpts cause Ollama to produce
        # longer responses that get truncated mid-JSON.
        content_section = ""
        if request.source_content:
            excerpt = request.source_content[:1500].strip()
            content_section = (
                f"\nSource material (base your segments on this):\n"
                f"---\n{excerpt}\n---\n"
            )

        return f"""You are a professional language-teaching curriculum designer.

Generate a lesson unit structure for the following specification:

  Topic    : {request.topic}
  Level    : {request.level}
  Language : {request.language}
  Segments : {request.num_segments}
{content_section}
{exercise_hint}

Return ONLY a single valid JSON object — no markdown, no code fences, no
preamble, no trailing text.  The JSON must match this exact schema:

{{
  "segments": [
    {{
      "title": "<concise segment title>",
      "description": "<one or two sentences describing what students will learn>",
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
- Exercise "type" values must be one of: {', '.join(sorted(SUPPORTED_EXERCISE_TYPES))}.
- "topic_hint" should be a short, specific instruction relevant to the segment
  topic so the exercise generator knows what vocabulary/grammar to focus on.
  Example: "Greetings vocabulary — formal and informal", "Past tense verbs".
- Titles and descriptions must be in {request.language}.
- topic_hint values should be in English (they are internal AI directives).
- Keep JSON strictly valid: no trailing commas, no comments.

Return ONLY the JSON object."""

    # ── Blueprint parser ──────────────────────────────────────────────────────

    # Maximum chars to log when debugging a bad LLM response
    _LOG_RAW_CHARS = 600

    def _parse_blueprint(self, raw_output: str) -> UnitBlueprint:
        """
        Extract and validate the JSON blueprint from the raw LLM output.

        Resilient to the two most common failure modes seen with local
        Ollama models when the prompt is long (e.g. file-based generation):

        1. **Markdown fences** — some models wrap JSON in ```json ... ```.
        2. **Truncated output** — the model hits its token/context limit and
           stops mid-JSON, leaving unclosed strings / arrays / objects.

        Recovery strategy
        -----------------
        a. Strip fences and isolate the first ``{...}`` block (existing logic).
        b. Try ``json.loads`` — succeeds for well-formed output.
        c. On ``JSONDecodeError``, call ``_repair_json`` which closes any
           dangling strings and unclosed brackets, then retry ``json.loads``.
        d. If repair also fails, call ``_extract_partial_segments`` which
           uses a brace-matching scanner to collect every *complete* segment
           object already present in the truncated output, and assembles a
           valid blueprint from them.  Raises only if zero complete segments
           are found.

        Raises
        ------
        ValueError
            If no valid segment can be recovered from the LLM output.
        """
        text = raw_output.strip()

        # ── a. Strip markdown fences (```json ... ``` or ``` ... ```) ─────────
        if text.startswith("```"):
            lines = text.splitlines()
            lines = lines[1:]  # drop opening fence
            if lines and lines[-1].strip().startswith("```"):
                lines = lines[:-1]  # drop closing fence
            text = "\n".join(lines).strip()

        # ── Isolate first JSON object ─────────────────────────────────────────
        brace_start = text.find("{")
        if brace_start == -1:
            raise ValueError(
                "AI response contained no JSON object. "
                f"Raw output (first 300 chars): {raw_output[:300]!r}"
            )

        # Find matching closing brace (may be absent in truncated output)
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

        # ── b. Fast path: standard parse ──────────────────────────────────────
        try:
            return self._validate_blueprint(json.loads(json_text))
        except json.JSONDecodeError:
            pass  # fall through to repair
        except ValueError:
            raise  # schema validation error — not a JSON problem

        # ── c. Repair truncated JSON and retry ────────────────────────────────
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
            pass  # fall through to partial-segment extraction

        # ── d. Extract whatever complete segments are already present ─────────
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
        """
        Close unclosed strings and bracket structures in truncated JSON.

        Iterates the text character-by-character, tracking string/escape
        state and a bracket stack, then appends the missing closing tokens.
        Also handles the case where a JSON key was declared but its value
        was never started (e.g. the model wrote ``"description":`` and then
        the output was cut — a bare colon at the end is filled with ``null``).

        Pure Python, no dependencies.
        """
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

        # Close an unterminated string value
        if in_string:
            suffix += '"'

        # If a key was written but its value was never started
        # (bare colon at end, outside any string), insert null.
        if (text + suffix).rstrip().endswith(":"):
            suffix += "null"

        # Close open structures in reverse order
        for opener in reversed(stack):
            suffix += "}" if opener == "{" else "]"

        return text + suffix


    @staticmethod
    def _extract_partial_segments(text: str) -> list[SegmentBlueprint]:
        """
        Scan *text* for complete JSON objects that look like segment blueprints
        and return a list of validated ``SegmentBlueprint`` instances.

        Used as a last-resort recovery when even the repaired JSON cannot be
        parsed (e.g. the model omitted the outer wrapper entirely).
        """
        segments: list[SegmentBlueprint] = []
        i = 0
        while i < len(text):
            if text[i] != "{":
                i += 1
                continue
            # Try to extract a balanced object starting at i
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
                            # Candidate object found
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
        """Wrap ``UnitBlueprint.model_validate`` with a clean ``ValueError``."""
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
        Write all Segment records and generate exercise blocks.

        Each segment is committed individually so a single failing exercise
        does not roll back successfully created segments.  Errors are
        collected and returned in ``UnitGenerateResult.errors``.
        """
        result = UnitGenerateResult(segments_created=0, exercises_created=0)

        for order_idx, seg_bp in enumerate(blueprint.segments):
            # ── Create Segment record ─────────────────────────────────────────
            segment = Segment(
                unit_id=request.unit_id,
                title=seg_bp.title,
                description=seg_bp.description,
                order_index=order_idx,
                status=SegmentStatus.DRAFT,
                is_visible_to_students=False,
                created_by=request.teacher_id,
            )
            db.add(segment)
            try:
                db.flush()  # obtain segment.id without committing the transaction
            except Exception as exc:
                db.rollback()
                error_msg = f"Segment[{order_idx}] '{seg_bp.title}': DB flush failed — {exc}"
                logger.error("UnitGenerator: %s", error_msg, exc_info=True)
                result.errors.append(error_msg)
                continue

            result.segments_created += 1
            result.segment_ids.append(segment.id)
            logger.debug(
                "UnitGenerator: created segment id=%d '%s' for unit_id=%d",
                segment.id,
                segment.title,
                request.unit_id,
            )

            # ── Generate exercise blocks ──────────────────────────────────────
            for ex_bp in seg_bp.exercises:
                try:
                    _block, _meta = await generate_exercise_for_segment(
                        exercise_type=ex_bp.type,
                        db=db,
                        segment_id=segment.id,
                        unit_id=request.unit_id,
                        created_by=request.teacher_id,
                        block_title=None,           # let the generator choose
                        topic_hint=ex_bp.topic_hint,
                        content_language=request.content_language,
                        instruction_language=request.instruction_language,
                        generator_params={},        # use generator defaults
                    )
                    result.exercises_created += 1
                    logger.debug(
                        "UnitGenerator: exercise '%s' generated for segment id=%d",
                        ex_bp.type,
                        segment.id,
                    )
                except Exception as exc:
                    error_msg = (
                        f"Segment[{order_idx}] '{seg_bp.title}' / "
                        f"exercise '{ex_bp.type}': generation failed — {exc}"
                    )
                    logger.warning("UnitGenerator: %s", error_msg, exc_info=True)
                    result.errors.append(error_msg)
                    # Continue with next exercise — do not abort the entire run

        # Commit all successfully created segments at once
        try:
            db.commit()
        except Exception as exc:
            db.rollback()
            raise RuntimeError(
                f"UnitGenerator: final DB commit failed — {exc}"
            ) from exc

        return result