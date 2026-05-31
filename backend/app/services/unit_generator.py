"""
app/services/unit_generator.py
===============================
AI-powered unit segment & exercise generator.

Generates a full set of Segments (with text blocks, exercise blocks, and
optionally AI images) for a given Unit from a high-level topic description
or an uploaded source document.

Flow  (three-phase design for topic-based; four-phase for file-based)
----------------------------------------------------------------------
Phase 0 — Document Analysis & Planning  *** FILE-BASED ONLY ***
    When ``source_content`` is set (teacher uploaded a file), a dedicated LLM
    call reads the full extracted text (up to 8 000 chars), understands the
    document's overall structure, and divides it into N *distinct* conceptual
    sections — each with a unique title, one-sentence focus statement, and a
    dedicated text excerpt drawn from a *different* part of the document.

    This phase is the key fix for the "all segments look the same" problem:
    by assigning each segment its own excerpt *before* any text is generated,
    we guarantee that Phase 2 cannot accidentally repeat ideas across sections.

    If Phase 0 fails (any exception), the pipeline falls back to the standard
    Phase 1 title-generation path.

Phase 1 — Titles
    • File-based: titles come directly from Phase 0 (already grounded in doc).
    • Topic-based: one fast LLM call derives N titles from the topic +
      description.  The description is the primary driver.

Phase 2 — Rich text blocks (one LLM call per segment)
    Each segment title gets its own dedicated call.
    • File-based: uses the per-segment excerpt from Phase 0, instructing the
      model to draw ONLY from that portion of the document.
    • Topic-based: generates fresh language-teaching content (grammar rules,
      vocabulary, examples) from the topic alone.

Phase 3 — Exercises (one call per exercise, inside _persist)
    Every exercise generator receives the segment title + the actual text-block
    content as its ``topic_hint``, grounding exercises in what the text teaches.

Exercise distribution (deterministic, inside _persist)
------------------------------------------------------
``_distribute_exercises()`` spreads ``request.exercise_types`` across segments
so every requested type appears at least once, regardless of model quality or
segment count.

Blueprint schema the LLM must return  (no "exercises" key)
------------------------------------------------------------
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
      ]
    }
  ]
}

Supported exercise type values
---------------------------------
image_stacked, drag_to_gap, type_word_in_gap, select_word_form, match_pairs,
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
from app.models.unit import Unit
from app.services.ai.providers.base import AIProvider, AIProviderError
from app.services.exercise_generation_flow import generate_exercise_for_segment

logger = logging.getLogger(__name__)


# ── Supported exercise types ──────────────────────────────────────────────────

SUPPORTED_EXERCISE_TYPES: frozenset[str] = frozenset(
    {
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
        max_length=2000,
        description=(
            "Markdown-formatted educational content: grammar explanations, "
            "vocabulary lists, usage examples. 120–250 words."
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


# ── File-analysis planning types ──────────────────────────────────────────────

@dataclass
class SegmentPlan:
    """One planned section derived from a source document during Phase 0."""

    title: str
    focus: str              # one-sentence description of what makes this section unique
    excerpt: str            # the specific chunk of source text that belongs to this section
    forbidden_topics: list[str] = field(default_factory=list)
    # ^ titles of all OTHER sections — injected into the text prompt as hard exclusions


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
    plan: str = "free"             # teacher's subscription plan (all plans route to DeepSeek)
    # Teacher-edited outline sections [{title, description}, ...] from the
    # PATCH /outline endpoint.  When present they are used directly as the
    # segment plan, bypassing the AI topic planner (Phase 0) entirely so the
    # generator creates exactly the segments the teacher reviewed and approved.
    outline_sections: list[dict] | None = None


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
        """
        4-phase pipeline (both topic-based and file-based):

        Phase 0 — Unit Plan
            One fast LLM call builds a coherent lesson plan:
            • File-based : reads the full document, detects distinct topics,
              assigns each section its own excerpt from a different part of the doc.
            • Topic-based: uses topic + description + num_segments to derive an
              overview section + one section per sub-topic.
            Both paths return list[SegmentPlan] with per-section focus statements
            and forbidden_topics lists that prevent cross-contamination.

        Phase 1 — Titles
            Taken directly from the Phase 0 plan (no extra LLM call needed).

        Phase 2 — Rich text blocks (one LLM call per segment)
            Each segment is generated in isolation, anchored to its own focus
            and forbidden from mentioning other sections' topics.

        Phase 3 — Persist + Exercises
            _smart_assign_exercises() picks one best-fit exercise type per segment
            from the teacher's chosen types, ensuring every chosen type appears at
            least once across the unit rather than repeating all types in every segment.
        """
        logger.info(
            "UnitGenerator: start unit_id=%d teacher_id=%d topic=%r level=%s "
            "language=%s instruction_language=%s segments=%d include_images=%s source=%s",
            request.unit_id, request.teacher_id, request.topic,
            request.level, request.language, request.instruction_language,
            request.num_segments, request.include_images,
            "file" if request.source_content else "topic",
        )
        if request.description:
            logger.info(
                "UnitGenerator: teacher directive unit_id=%d — %r",
                request.unit_id, request.description[:200],
            )

        # ── Phase 0: unit plan ────────────────────────────────────────────────
        segment_plans: list[SegmentPlan] = []

        # Fast path: teacher already reviewed and approved an explicit outline.
        # Convert those sections directly to SegmentPlans and bypass the AI
        # topic planner entirely so we generate *exactly* what the teacher set.
        if request.outline_sections:
            segment_plans = self._plans_from_outline_sections(request)
            logger.info(
                "UnitGenerator: phase0 (outline) — using %d teacher-defined sections: %s",
                len(segment_plans), [p.title for p in segment_plans],
            )

        if not segment_plans and request.source_content:
            try:
                segment_plans = await self._analyze_and_plan(request)
                logger.info(
                    "UnitGenerator: phase0 (file) complete — %d sections: %s",
                    len(segment_plans), [p.title for p in segment_plans],
                )
            except Exception as exc:
                logger.warning(
                    "UnitGenerator: phase0 (file) failed — falling back to topic planner: %s", exc,
                )
        if not segment_plans:
            try:
                segment_plans = await self._plan_topic_segments(request)
                logger.info(
                    "UnitGenerator: phase0 (topic) complete — %d sections: %s",
                    len(segment_plans), [p.title for p in segment_plans],
                )
            except Exception as exc:
                logger.warning(
                    "UnitGenerator: phase0 (topic) failed — using bare titles: %s", exc,
                )

        # ── Phase 1: titles ───────────────────────────────────────────────────
        if segment_plans:
            titles = [p.title for p in segment_plans]
        else:
            # Last-resort fallback: old title-generation call
            titles = await self._generate_titles(request)
            titles = titles[: request.num_segments]

        if len(titles) < 2:
            titles.append(f"{request.topic} — Part 2")

        logger.info("UnitGenerator: phase1 complete — titles=%s", titles)

        # ── Phase 2: rich text block per segment ──────────────────────────────
        segments: list[SegmentBlueprint] = []
        for idx, title in enumerate(titles):
            plan_entry = segment_plans[idx] if idx < len(segment_plans) else None
            # Log what drives this segment so problems are immediately visible in logs
            logger.info(
                "UnitGenerator: phase2 segment %d/%d generating — title=%r "
                "teaches=%r explain_in=%r directive=%r focus=%r",
                idx + 1, len(titles), title,
                request.language, request.instruction_language,
                (request.description or "")[:120],
                (plan_entry.focus[:120] if plan_entry and plan_entry.focus else "—"),
            )
            try:
                seg_bp = await self._generate_segment_text(
                    title, idx, request,
                    source_excerpt=plan_entry.excerpt if plan_entry else None,
                    section_focus=plan_entry.focus if plan_entry else None,
                    forbidden_topics=plan_entry.forbidden_topics if plan_entry else None,
                    is_overview=(idx == 0 and plan_entry is not None),
                )
            except Exception as exc:
                logger.warning(
                    "UnitGenerator: text generation failed for segment %d %r — "
                    "using placeholder: %s", idx, title, exc,
                )
                seg_bp = SegmentBlueprint(
                    title=title,
                    description=f"Segment about {title}",
                    texts=[TextBlueprint(
                        title="Key Points",
                        content=f"## {title}\n\nThis segment covers key points.",
                    )],
                )
            segments.append(seg_bp)
            logger.info(
                "UnitGenerator: phase2 segment %d/%d complete — %r",
                idx + 1, len(titles), title,
            )

        blueprint = UnitBlueprint(segments=segments)

        # ── Phase 3: persist + exercises ──────────────────────────────────────
        result = await self._persist(blueprint, request, db, segment_plans=segment_plans)

        logger.info(
            "UnitGenerator: completed unit_id=%d — %d segments, %d texts, "
            "%d exercises, %d images (%d errors)",
            request.unit_id, result.segments_created, result.texts_created,
            result.exercises_created, result.images_created, len(result.errors),
        )
        return result

    async def preview(self, request: UnitGenerateRequest) -> UnitBlueprint:
        """Generate and validate the blueprint without touching the database."""
        segment_plans: list[SegmentPlan] = []
        if request.source_content:
            try:
                segment_plans = await self._analyze_and_plan(request)
            except Exception:
                pass
        if not segment_plans:
            try:
                segment_plans = await self._plan_topic_segments(request)
            except Exception:
                pass

        if segment_plans:
            titles = [p.title for p in segment_plans]
        else:
            titles = await self._generate_titles(request)
            titles = titles[: request.num_segments]

        if len(titles) < 2:
            titles.append(f"{request.topic} — Part 2")

        segments: list[SegmentBlueprint] = []
        for idx, title in enumerate(titles):
            plan_entry = segment_plans[idx] if idx < len(segment_plans) else None
            try:
                seg_bp = await self._generate_segment_text(
                    title, idx, request,
                    source_excerpt=plan_entry.excerpt if plan_entry else None,
                    section_focus=plan_entry.focus if plan_entry else None,
                    forbidden_topics=plan_entry.forbidden_topics if plan_entry else None,
                    is_overview=(idx == 0 and plan_entry is not None),
                )
            except Exception:
                seg_bp = SegmentBlueprint(title=title, texts=[])
            segments.append(seg_bp)

        return UnitBlueprint(segments=segments)

    async def plan_only(self, request: "UnitGenerateRequest") -> list["SegmentPlan"]:
        """
        Phase 0 only — build and return the segment plan without any DB writes
        or text/exercise generation.

        Used by the planning endpoints (POST /{unit_id}/plan and
        POST /{unit_id}/plan/from-file) so the frontend can show the teacher
        what will be generated *before* committing to the full pipeline.

        Returns list[SegmentPlan] in lesson order.  The first plan entry is
        always the "Introduction & Learning Outcomes" segment.
        """
        plans: list[SegmentPlan] = []

        # Outline fast-path: teacher already defined sections in the outline review.
        # Return them directly so the preview matches exactly what will be generated.
        if request.outline_sections:
            plans = self._plans_from_outline_sections(request)
            logger.info(
                "UnitGenerator.plan_only (outline): %d teacher-defined sections",
                len(plans),
            )
            return plans

        # File-based: analyse document structure first
        if request.source_content:
            try:
                plans = await self._analyze_and_plan(request)
                logger.info(
                    "UnitGenerator.plan_only (file): %d sections derived from document",
                    len(plans),
                )
            except Exception as exc:
                logger.warning(
                    "UnitGenerator.plan_only: file analysis failed — falling back to topic planner: %s",
                    exc,
                )

        # Topic-based (or fallback)
        if not plans:
            try:
                plans = await self._plan_topic_segments(request)
                logger.info(
                    "UnitGenerator.plan_only (topic): %d sections planned",
                    len(plans),
                )
            except Exception as exc:
                logger.warning(
                    "UnitGenerator.plan_only: topic planner failed — minimal fallback: %s", exc,
                )

        # Last-resort minimal plan
        if not plans:
            plans = [
                SegmentPlan(
                    title="Introduction & Learning Outcomes",
                    focus=f"Introduction to {request.topic}.",
                    excerpt="",
                ),
                SegmentPlan(
                    title=request.topic,
                    focus=f"Core content of {request.topic}.",
                    excerpt="",
                ),
            ]

        return plans

    # ── Phase 0a: topic-based unit planning ──────────────────────────────────

    def _plans_from_outline_sections(
        self, request: "UnitGenerateRequest"
    ) -> list["SegmentPlan"]:
        """
        Convert teacher-edited outline sections into SegmentPlan objects.

        This is the *outline fast-path* that bypasses the AI topic planner
        (Phase 0) entirely.  It is used when the teacher has already reviewed
        and approved the section structure via the PATCH /outline endpoint.

        Each section dict is expected to have:
          - "title"       : str  — section heading (required)
          - "description" : str  — one-sentence focus statement (optional)

        The first section from the outline is used verbatim — we do NOT
        force-inject an "Introduction & Learning Outcomes" header here because
        the teacher explicitly chose these sections and may already have an
        intro or prefer to start with content directly.
        """
        # Raw list of section dicts saved by the PATCH endpoint
        raw_sections: list[dict] = request.outline_sections or []

        plans: list[SegmentPlan] = []
        for i, sec in enumerate(raw_sections):
            # Extract the section title — skip entries with no title
            title = str(sec.get("title", "")).strip()
            if not title:
                continue

            # Use the teacher-provided description as the section focus.
            # Fall back to a generic statement so Phase 2 still has context.
            description = str(sec.get("description", "")).strip()
            focus = description if description else f"Cover the topic: {title}"

            plans.append(SegmentPlan(
                title=title,
                focus=focus,
                excerpt="",  # no source document; topic-based generation
            ))

        # Guard: must have at least 2 plans or the unit looks degenerate
        while len(plans) < 2:
            plans.append(SegmentPlan(
                title=f"{request.topic} — Part {len(plans) + 1}",
                focus=f"Additional content about {request.topic}.",
                excerpt="",
            ))

        # Populate forbidden_topics: each section is told not to discuss the
        # other sections, preventing cross-contamination between segments.
        all_titles = [p.title for p in plans]
        for i, plan in enumerate(plans):
            plan.forbidden_topics = [t for j, t in enumerate(all_titles) if j != i]

        return plans

    async def _plan_topic_segments(
        self, request: "UnitGenerateRequest"
    ) -> list["SegmentPlan"]:
        """
        Build a coherent lesson plan from a topic + optional description.

        Produces exactly the same ``list[SegmentPlan]`` contract as
        ``_analyze_and_plan`` (file-based), so both paths flow into the same
        Phase 1 / Phase 2 / Phase 3 logic.

        Structure the LLM is instructed to follow
        ──────────────────────────────────────────
        Section 0 — Overview
            Introduces the whole unit: what the topic is, why it matters,
            how the sections connect.  Mentions all sub-topics by name but
            does NOT teach any of them in depth.

        Sections 1–N — one sub-topic each
            Derived from the teacher's description (if provided) or from the
            natural sub-divisions of the topic.  Each covers ONE concept only.
            Example: topic="Past Tenses", description="Past Simple, Past
            Continuous, Past Perfect" → 3 content sections + 1 overview = 4 total.
        """
        import re as _re

        n = request.num_segments
        description_block = ""
        if request.description and request.description.strip():
            description_block = (
                f"\nTeacher's directive (treat as the authoritative list of sub-topics;\n"
                f"each sub-topic becomes its own section):\n  {request.description.strip()}\n"
            )

        # Detect whether the teacher's description references named source materials
        # (films, books, shows) so the planner can instruct each section focus to
        # reference them.  Same heuristic used in the outline prompt builder.
        import re as _re2
        _SOURCE_HINTS_PLAN = (
            r"\b(film|movie|show|series|book|novel|song|album|podcast|episode|"
            r"season|scene|quote|character|chapter|lyrics)\b"
        )
        _plan_has_sources = bool(
            _re2.search(_SOURCE_HINTS_PLAN, request.description or "", _re2.IGNORECASE)
            or request.source_content
        )
        source_reminder = (
            "\n- Each section's focus and scope MUST reference specific examples or "
            "quotes from the source materials / shows / books named in the directive.\n"
            if _plan_has_sources else ""
        )

        prompt = f"""You are an expert language-curriculum designer.

A teacher wants to build a bilingual lesson unit:
  Target language (TAUGHT): {request.language}
  Explanation language    : {request.instruction_language}
  Topic                   : {request.topic}
  Level                   : {request.level}
{description_block}
════════════════════════════════════════
TASK
════════════════════════════════════════
Plan a lesson unit with up to {n} sections following this EXACT structure:

  Section 1 — INTRODUCTION & LEARNING OUTCOMES  (ALWAYS first, ALWAYS present)
    • Title must be: "Introduction & Learning Outcomes"
    • States the overall unit aims (what students will be able to do by the end).
    • Lists the specific learning outcomes as bullet points.
    • Previews ALL sub-topics covered in later sections.
    • Explains WHY the topic matters in real-world {request.language} use.
    • Does NOT teach any grammar rule or vocabulary in depth — only orients the student.

  Sections 2–N — CONTENT SECTIONS (one per sub-topic)
    • Derived from the teacher's directive (if given) or from the natural
      sub-divisions of "{request.topic}".
    • Each section covers EXACTLY ONE concept / sub-topic.
    • NEVER merge two clearly distinct sub-topics into a single section.
    • If the directive lists 3 sub-topics → produce 1 intro + 3 content = 4 total.
    • Cap at {n} total sections. If directive has more sub-topics than {n}-1, merge
      only the least important ones.

════════════════════════════════════════
STRICT RULES
════════════════════════════════════════
- Section 1 title MUST be exactly "Introduction & Learning Outcomes".
- Follow the teacher's directive exactly — do not add sub-topics not listed there.
- No two sections may cover the same grammar point or concept.
- Titles must be concise (2–6 words) and written in {request.instruction_language}.
- The "focus" field must be written in {request.instruction_language}.
  Grammar rules and explanations go in {request.instruction_language}.
  {request.language} words and example phrases appear ONLY as quoted/italic examples inside focus text.{source_reminder}

════════════════════════════════════════
OUTPUT FORMAT
════════════════════════════════════════
Return ONLY valid JSON — no markdown fences, no preamble:
{{
  "sections": [
    {{
      "title": "<section title — section 1 must be 'Introduction & Learning Outcomes'>",
      "focus": "<ONE sentence: what this section does. For section 1 write the unit aims.>",
      "learning_outcomes": "<comma-separated list of what students will be able to do — only for section 1, empty string for others>",
      "scope": "<2–4 specific sub-points this section covers, as a short bullet list>",
      "is_intro": <true for section 1, false for all others>
    }}
  ]
}}

The "sections" array must contain between 2 and {n} objects."""

        try:
            raw = await self.provider.agenerate(prompt)
        except AIProviderError as exc:
            raise RuntimeError(f"AI provider error during topic planning: {exc}") from exc

        import re as _re
        text = raw.strip()
        text = _re.sub(r"^```[a-z]*\n?", "", text)
        text = _re.sub(r"\n?```$", "", text)
        brace_start = text.find("{")
        if brace_start == -1:
            raise ValueError("Topic planner returned no JSON.")
        depth = 0
        brace_end = len(text)
        for i, ch in enumerate(text[brace_start:], brace_start):
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    brace_end = i + 1
                    break
        raw_json = text[brace_start:brace_end]
        try:
            data = json.loads(raw_json)
        except json.JSONDecodeError:
            data = json.loads(self._repair_json(raw_json))

        sections = data.get("sections", [])
        if not isinstance(sections, list) or not sections:
            raise ValueError("Topic planner returned empty sections.")

        plans: list[SegmentPlan] = []
        for i, sec in enumerate(sections[:n]):
            raw_title = str(sec.get("title", "")).strip()
            # Enforce the first segment title
            if i == 0:
                # Keep whatever title the LLM produced for the intro section
                # (it should already be in instruction_language from the planner
                # prompt).  Only fall back to English if the LLM returned nothing.
                title = raw_title if raw_title else "Introduction & Learning Outcomes"
                # Do NOT force-overwrite with the English string — the planner
                # prompt instructs titles to be in instruction_language, so if
                # the model returned e.g. "Введение и учебные цели" keep it.
            else:
                title = raw_title or f"{request.topic} — Part {i + 1}"

            focus = str(sec.get("focus", "")).strip()
            scope = str(sec.get("scope", "")).strip()
            outcomes = str(sec.get("learning_outcomes", "")).strip()

            # For the intro segment, weave learning outcomes into the focus text
            if i == 0 and outcomes:
                combined_focus = (
                    f"{focus}\n\nLearning Outcomes: {outcomes}"
                    if focus
                    else f"Learning Outcomes: {outcomes}"
                )
            else:
                combined_focus = f"{focus}\nScope: {scope}" if scope else focus

            plans.append(SegmentPlan(
                title=title,
                focus=combined_focus,
                excerpt="",  # topic-based: no source text
            ))

        while len(plans) < 2:
            plans.append(SegmentPlan(
                title=f"{request.topic} — Part {len(plans) + 1}",
                focus=f"Additional content about {request.topic}.",
                excerpt="",
            ))

        # Populate forbidden_topics: each section is told not to discuss others
        all_titles = [p.title for p in plans]
        for i, plan in enumerate(plans):
            plan.forbidden_topics = [t for j, t in enumerate(all_titles) if j != i]

        return plans

    # ── Phase 0b: file-based document analysis + section planning ─────────────

    async def _analyze_and_plan(
        self, request: "UnitGenerateRequest"
    ) -> list["SegmentPlan"]:
        """
        Analyse the uploaded source document and produce *content-driven* section plans.

        Key design decisions:
        ─────────────────────
        1. The LLM reads the FULL extracted text (up to 10 000 chars) so it sees
           the document's complete structure — not just the opening paragraph.

        2. The LLM determines the natural section count from the document's own
           structure, capped at ``request.num_segments``.  Example: if the file
           contains Past Simple, Past Continuous and Past Perfect, the plan will
           have an intro section + one section per tense = 4 sections regardless
           of what the teacher typed in the "number of segments" field.

        3. Every section gets a ``forbidden_topics`` list — the titles of all
           OTHER sections.  This list is injected verbatim into the Phase 2 text-
           generation prompt as hard "DO NOT MENTION" constraints, preventing
           cross-contamination between segments.

        4. Section topics must map 1-to-1 to clearly distinct named concepts in
           the source (e.g. individual tenses, individual vocabulary groups).
           The model is explicitly told NOT to merge distinct topics into one
           section just to hit a target count.

        Returns list[SegmentPlan] sorted in document order.
        Falls back gracefully — caller catches any exception.
        """
        import re as _re

        max_sections = request.num_segments
        full_text = (request.source_content or "").strip()
        source_body = full_text[:10000]
        truncated_note = (
            f"\n[Document truncated to 10 000 chars; full length {len(full_text):,} chars]"
            if len(full_text) > 10000
            else ""
        )

        prompt = f"""You are an expert curriculum designer and document analyst.

A teacher uploaded a document to build a {request.language} lesson (level {request.level}).

════════════════════════════════════════
TASK
════════════════════════════════════════
1. Read the entire document below.
2. Identify all DISTINCT named topics / concepts / grammar points it covers.
   Example: if the document is about past tenses, list "Past Simple",
   "Past Continuous", "Past Perfect" as separate topics.
3. Plan a lesson flow with the following structure:
   • Section 1 — ALWAYS "Introduction & Learning Outcomes": what the unit is about,
     the unit aims, measurable learning outcomes, why these topics matter.
     Do NOT teach any specific topic here — only orient the student.
   • Sections 2–N — one section per distinct named topic found in the document.
     Each section covers ONE AND ONLY ONE topic. Do not merge two topics into one section.
4. Cap the total number of sections at {max_sections}.
   If the document has more distinct topics than {max_sections}-1, merge the least
   important ones, but NEVER merge two topics that have clearly different grammar rules.

════════════════════════════════════════
STRICT RULES
════════════════════════════════════════
- Section 1 title MUST be exactly "Introduction & Learning Outcomes".
- Each content section's topic must appear explicitly in the source document.
  Do NOT invent topics not present.
- If the document already contains exercises (tests, fill-in-the-gap, etc.),
  identify the EXPLANATION / READING parts only; ignore the exercise questions.
- Each section's excerpt must be taken from a DIFFERENT part of the source text.
- No two sections may cover the same grammar point, vocabulary set, or concept.
- Titles must be concise (2–6 words), in {request.instruction_language}.

════════════════════════════════════════
SOURCE DOCUMENT
════════════════════════════════════════
{source_body}{truncated_note}

════════════════════════════════════════
OUTPUT FORMAT
════════════════════════════════════════
Return ONLY valid JSON — no markdown fences, no preamble, no trailing text:
{{
  "overall_topic": "<3–8 word description of the whole document>",
  "sections": [
    {{
      "title": "<section title — section 1 must be 'Introduction & Learning Outcomes'>",
      "focus": "<ONE sentence: what this section does. For section 1 write the unit aims.>",
      "learning_outcomes": "<for section 1 only: comma-separated measurable outcomes. Empty string for other sections.>",
      "scope": "<bullet list of the 2–4 specific sub-points this section covers>",
      "excerpt": "<200–600 chars copied verbatim or closely from the source text that belongs to THIS section ONLY — empty string for section 1>"
    }}
  ]
}}

The "sections" array must contain between 2 and {max_sections} objects.
IMPORTANT: if the document clearly has N distinct topics (e.g. 3 tenses),
produce N+1 sections (intro + one per topic), even if that is less than {max_sections}."""

        try:
            raw = await self.provider.agenerate(prompt)
        except AIProviderError as exc:
            raise RuntimeError(f"AI provider error during document analysis: {exc}") from exc

        # ── Parse JSON ────────────────────────────────────────────────────────
        text = raw.strip()
        text = _re.sub(r"^```[a-z]*\n?", "", text)
        text = _re.sub(r"\n?```$", "", text)

        brace_start = text.find("{")
        if brace_start == -1:
            raise ValueError("Document analysis returned no JSON object.")
        depth = 0
        brace_end = len(text)
        for i, ch in enumerate(text[brace_start:], brace_start):
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    brace_end = i + 1
                    break
        raw_json = text[brace_start:brace_end]
        try:
            data = json.loads(raw_json)
        except json.JSONDecodeError:
            data = json.loads(self._repair_json(raw_json))

        sections = data.get("sections", [])
        if not isinstance(sections, list) or not sections:
            raise ValueError("Document analysis returned no sections.")

        # ── Build SegmentPlan list ────────────────────────────────────────────
        plans: list[SegmentPlan] = []
        for i, sec in enumerate(sections[:max_sections]):
            raw_title = str(sec.get("title", "")).strip()
            # Enforce the first segment title regardless of what the model returned
            if i == 0:
                title = "Introduction & Learning Outcomes"
            else:
                title = raw_title or f"{request.topic} — Part {i + 1}"

            focus = str(sec.get("focus", "")).strip()
            scope = str(sec.get("scope", "")).strip()
            excerpt = str(sec.get("excerpt", "")).strip()
            outcomes = str(sec.get("learning_outcomes", "")).strip()

            # For the intro segment, weave outcomes into focus and clear excerpt
            if i == 0:
                if outcomes:
                    combined_focus = (
                        f"{focus}\n\nLearning Outcomes: {outcomes}"
                        if focus else f"Learning Outcomes: {outcomes}"
                    )
                else:
                    combined_focus = focus
                excerpt = ""   # intro has no source excerpt by design
            else:
                combined_focus = f"{focus}\nScope: {scope}" if scope else focus

            plans.append(SegmentPlan(title=title, focus=combined_focus, excerpt=excerpt))

        # Pad only if truly necessary (rare: model returned fewer than 2 sections)
        while len(plans) < 2:
            idx = len(plans)
            plans.append(SegmentPlan(
                title=f"{request.topic} — Part {idx + 1}",
                focus=f"Additional content from the source document (part {idx + 1}).",
                excerpt=full_text[idx * 800: (idx + 1) * 800].strip(),
            ))

        # ── Populate forbidden_topics for each plan ───────────────────────────
        # Each section is told explicitly not to discuss what the other sections cover.
        all_titles = [p.title for p in plans]
        for i, plan in enumerate(plans):
            plan.forbidden_topics = [t for j, t in enumerate(all_titles) if j != i]

        return plans

    # ── Phase 1: title generation ─────────────────────────────────────────────

    async def _generate_titles(self, request: "UnitGenerateRequest") -> list[str]:
        """
        Derive N segment titles from the topic + description in one fast call.

        The ``description`` is treated as the primary directive — if it already
        lists the sub-topics (e.g. "past simple, present simple, future simple"),
        those become the titles.  The model fills any gaps with sensible defaults.
        """
        description_line = ""
        if request.description and request.description.strip():
            description_line = (
                f"\nTeacher directive (use this to derive the titles — "
                f"HIGHEST PRIORITY):\n  {request.description.strip()}\n"
            )

        source_hint = ""
        if request.source_content:
            excerpt = request.source_content[:400].strip()
            source_hint = f"\nSource material hint:\n---\n{excerpt}\n---\n"

        prompt = f"""You are a language-curriculum designer.

Produce exactly {request.num_segments} lesson-segment titles for:
  Topic    : {request.topic}
  Level    : {request.level}
  Language : {request.language}
{description_line}{source_hint}
Rules:
- If the teacher directive already names the sub-topics, use those as titles exactly.
- Each title must be a distinct sub-topic of {request.topic!r} appropriate for {request.level}.
- Titles must be concise (2–6 words) and in {request.language}.
- Return ONLY valid JSON: {{"titles": ["title1", "title2", ...]}}
- The array must contain EXACTLY {request.num_segments} strings.
- No markdown, no preamble, no trailing text."""

        try:
            raw = await self.provider.agenerate(prompt)
        except AIProviderError as exc:
            raise RuntimeError(f"AI provider error during title generation: {exc}") from exc

        import re as _re
        text = raw.strip()
        text = _re.sub(r"^```[a-z]*\n?", "", text)
        text = _re.sub(r"\n?```$", "", text)
        try:
            data = json.loads(text)
            titles = data.get("titles", [])
            if isinstance(titles, list):
                return [str(t).strip() for t in titles if str(t).strip()]
        except Exception:
            pass
        # Regex fallback: extract quoted strings
        found = _re.findall(r'"([^"]{2,120})"', text)
        return [t for t in found if t not in ("titles",)][: request.num_segments]

    # ── Phase 2: per-segment rich text generation ─────────────────────────────

    async def _generate_segment_text(
        self,
        title: str,
        segment_index: int,
        request: "UnitGenerateRequest",
        source_excerpt: str | None = None,
        section_focus: str | None = None,
        forbidden_topics: list[str] | None = None,
        is_overview: bool = False,
    ) -> "SegmentBlueprint":
        """
        Generate a rich educational text block for a single segment.

        Overview segment (is_overview=True, always index 0):
            Written as a roadmap — introduces the whole unit, names all upcoming
            sections, explains why the topic matters. Does NOT teach any sub-topic.

        Content segments:
            Anchored to one specific focus. Hard constraints prevent the model from
            mentioning any other section's topic.
        """
        # ── Overview prompt (no exercises — 1 or 2 text blocks) ──────────────
        if is_overview and forbidden_topics:
            # Use 2 text blocks when the unit has more than 2 segments total,
            # otherwise a single combined block is enough.
            total_sections = len(forbidden_topics) + 1  # forbidden = other sections
            two_blocks = total_sections > 2

            upcoming = "\n".join(f"  {i+1}. {t}" for i, t in enumerate(forbidden_topics))
            source_block = ""
            if source_excerpt:
                source_block = (
                    f"\nBackground context (do not teach individual sub-topics here):\n"
                    f"---\n{source_excerpt[:800].strip()}\n---\n"
                )

            if two_blocks:
                _il = request.instruction_language  # shorthand
                block_spec = f"""Return ONLY a single valid JSON object — no markdown fences, no preamble:

{{
  "title": "{title}",
  "description": "<one sentence in {_il}: what the student will gain from this whole unit>",
  "texts": [
    {{
      "title": "<Block 1 title translated to {_il}, meaning: Learning Aims & Outcomes>",
      "content": "<block 1 markdown — see requirements below>"
    }},
    {{
      "title": "<Block 2 title translated to {_il}, meaning: What We Will Cover>",
      "content": "<block 2 markdown — see requirements below>"
    }}
  ]
}}

CRITICAL: every "title" field and every ## / ### heading inside "content" MUST be in {_il}.
Do NOT use English for any heading or title — translate them all to {_il}.

Block 1 (80–120 words in {_il}):
  ## <heading in {_il} meaning "Learning Aims">
  2-3 sentences in {_il}: what the student will be able to do by the end of this unit.
  Why this topic matters in real life.

  ### <heading in {_il} meaning "Learning Outcomes">
  Bullet list of 3-5 concrete, measurable outcomes written in {_il}.

Block 2 (80–120 words in {_il}):
  ## <heading in {_il} meaning "Unit Overview">
  1-2 sentences in {_il} introducing the flow of the unit.

  ### <heading in {_il} meaning "Unit Roadmap">
  Numbered list of the upcoming sections (use their exact titles),
  each with one sentence in {_il} on what it teaches. PREVIEW only."""
            else:
                _il = request.instruction_language  # shorthand
                block_spec = f"""Return ONLY a single valid JSON object — no markdown fences, no preamble:

{{
  "title": "{title}",
  "description": "<one sentence in {_il}: what the student will gain from this whole unit>",
  "texts": [
    {{
      "title": "<title translated to {_il}, meaning: Unit Overview>",
      "content": "<combined block markdown — see requirements below>"
    }}
  ]
}}

CRITICAL: every "title" field and every ## / ### heading inside "content" MUST be in {_il}.
Do NOT use English for any heading or title — translate them all to {_il}.

Single block (120–180 words in {_il}):
  ## <heading in {_il} meaning "Learning Aims">
  2-3 sentences in {_il} on what the student will be able to do after this unit. Why it matters.

  ### <heading in {_il} meaning "What We Will Cover">
  Numbered list of upcoming sections (use their exact titles),
  each with one sentence preview in {_il}.

  ### <heading in {_il} meaning "Getting Started">
  1-2 motivating sentences in {_il}."""

            _teacher_directive_overview = ""
            if request.description and request.description.strip():
                _teacher_directive_overview = (
                    f"\nTEACHER DIRECTIVE — MANDATORY (highest priority, overrides all defaults):\n"
                    f"  {request.description.strip()}\n"
                    f"Apply every instruction above to ALL content in this section.\n"
                )

            prompt = f"""You are an expert {request.language} language teacher writing engaging lesson content.

Write the INTRODUCTION section for a lesson unit. This section has NO exercises.
This is Section 1 of {total_sections}.

  Unit topic : {request.topic}
  Level      : {request.level} (CEFR)
  Language   : {request.language}
{_teacher_directive_overview}
Upcoming sections (in order):
{upcoming}
{source_block}
{block_spec}

General rules:
BILINGUAL RULE (most important):
- ALL prose, headings (## / ###), learning outcomes, and explanations MUST be written in {request.instruction_language}.
- {request.language} words and phrases appear ONLY as TARGET LANGUAGE examples shown in *italics* or quotes.
  NEVER use {request.language} as the explanation language.
- Use Markdown: ##, ###, **bold**, bullet/numbered lists.
- Do NOT teach any individual sub-topic in depth — this is an orientation section only.
- Do NOT include exercises, tasks, or fill-in-the-blank activities.
- Keep JSON strictly valid: escape inner quotes with \\", no trailing commas."""

            try:
                raw = await self.provider.agenerate(prompt)
            except AIProviderError as exc:
                raise RuntimeError(
                    f"AI provider error generating overview for '{title}': {exc}"
                ) from exc
            return self._parse_overview_segment(raw, title)

        # ── Content segment prompt ────────────────────────────────────────────
        if source_excerpt or section_focus:
            focus_line = (
                f"THIS SECTION'S FOCUS (the ONLY topic you may cover):\n"
                f"  {section_focus or title}\n"
            )
            forbidden_block = ""
            if forbidden_topics:
                forbidden_list = "\n".join(f"  - {t}" for t in forbidden_topics)
                forbidden_block = (
                    f"\nTOPICS YOU MUST NOT MENTION, EXPLAIN, OR REFERENCE IN ANY WAY:\n"
                    f"{forbidden_list}\n"
                    f"Do not compare this topic to the forbidden ones.\n"
                    f"Do not use phrases like 'unlike X' or 'compare with Y'.\n"
                )
            excerpt_block = ""
            if source_excerpt:
                excerpt_block = (
                    f"\nSOURCE TEXT FOR THIS SECTION ONLY "
                    f"(base your content exclusively on this passage):\n"
                    f"---\n{source_excerpt[:1400].strip()}\n---\n"
                )
            scope_instruction = (
                f"\n{focus_line}{forbidden_block}{excerpt_block}"
                f"\nCRITICAL: Every sentence must be about '{title}' and nothing else."
            )
        elif request.source_content:
            scope_instruction = (
                f"\nDraw on this source material where relevant:\n"
                f"---\n{request.source_content[:600].strip()}\n---\n"
            )
        else:
            scope_instruction = ""

        teaching_topic = title if (source_excerpt or section_focus) else request.topic

        _teacher_directive_content = ""
        if request.description and request.description.strip():
            _teacher_directive_content = (
                f"\nTEACHER DIRECTIVE — MANDATORY (highest priority, overrides all defaults):\n"
                f"  {request.description.strip()}\n"
                f"Every example sentence, vocabulary item, and illustration MUST follow the directive above.\n"
                f"If the directive names specific TV shows, films, or books, ALL examples must be drawn from them.\n"
            )
            logger.info(
                "UnitGenerator: injecting teacher directive into segment %r — %r",
                title, request.description[:160],
            )
        else:
            logger.info(
                "UnitGenerator: no teacher directive for segment %r — using topic-only generation",
                title,
            )

        prompt = f"""You are an expert {request.language} language teacher writing engaging lesson content.

Write the educational text block for this lesson segment:

  Segment title : {title}
  Teaching topic: {teaching_topic}
  Level         : {request.level} (CEFR)
  Teaches       : {request.language} (target language — vocabulary/examples in this language)
  Explain in    : {request.instruction_language} (grammar rules and instructions in this language)
  Segment index : {segment_index + 1}
{_teacher_directive_content}{scope_instruction}
Return ONLY a single valid JSON object — no markdown fences, no preamble:

{{
  "title": "<segment title — same as above>",
  "description": "<one sentence: exactly what the student will learn in this segment>",
  "text_title": "<heading for the text block, e.g. 'Past Simple: Rules & Examples'>",
  "text_content": "<full educational markdown content>"
}}

Requirements for "text_content":
BILINGUAL RULE (most important):
- ALL prose explanations, grammar rules, key points, and notes MUST be written in {request.instruction_language}.
- {request.language} words, phrases, and example sentences appear ONLY as TARGET LANGUAGE content
  — shown in *italics* or double-quotes. NEVER write explanations in {request.language}.
- Every ## / ### heading must also be in {request.instruction_language}.
- 120–250 words — substantive but focused.
- Structure (use all three sections):
    1. ## Rule / Explanation  — the key rule or concept written in {request.instruction_language}, 2-4 sentences.
    2. ### Key Points  — 3-5 bullet points in {request.instruction_language}.
       Each point highlights a {request.language} key term in **bold**, then explains it in {request.instruction_language}.
    3. ### Examples  — 4-6 {request.language} example sentences (the TARGET language).
       Format each as:  ✓ *{request.language} sentence* — brief note in {request.instruction_language} why it's correct.
- Use Markdown: ##, ###, **bold**, *italic*, bullet lists ( - ).
- SOURCE MATERIAL: if the teacher directive names specific shows, films, books, or characters,
  ALL example sentences in the Examples section MUST be drawn from those named sources.
  Do NOT use generic made-up sentences when real source material is specified.
- Do NOT include exercises or tasks — text only.
- Stay strictly within the scope of "{title}". Do not mention topics from other sections.
- Keep JSON strictly valid: escape inner quotes with \\", no trailing commas."""

        try:
            raw = await self.provider.agenerate(prompt)
        except AIProviderError as exc:
            raise RuntimeError(
                f"AI provider error generating text for segment '{title}': {exc}"
            ) from exc

        return self._parse_segment_text(raw, title)

    def _parse_segment_text(self, raw: str, title: str) -> "SegmentBlueprint":
        """Parse the per-segment JSON into a SegmentBlueprint."""
        import re as _re

        text = raw.strip()
        text = _re.sub(r"^```[a-z]*\n?", "", text, flags=_re.MULTILINE)
        text = _re.sub(r"\n?```$", "", text.strip())

        brace_start = text.find("{")
        if brace_start != -1:
            depth = 0
            for i, ch in enumerate(text[brace_start:], brace_start):
                if ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0:
                        text = text[brace_start : i + 1]
                        break

        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            # Repair common issues (unescaped quotes in content)
            repaired = self._repair_json(text)
            try:
                data = json.loads(repaired)
            except json.JSONDecodeError:
                logger.warning(
                    "UnitGenerator: could not parse segment text JSON for %r — "
                    "using raw content as fallback", title,
                )
                data = {
                    "title": title,
                    "description": f"Learn about {title}",
                    "text_title": "Key Points",
                    "text_content": raw[:1500],
                }

        seg_title = data.get("title") or title
        description = data.get("description") or f"Learn about {title}"
        text_title = data.get("text_title") or "Grammar Rules & Examples"
        text_content = data.get("text_content") or raw[:1500]

        return SegmentBlueprint(
            title=seg_title,
            description=description,
            texts=[TextBlueprint(title=text_title, content=text_content[:2000])],
        )

    def _parse_overview_segment(self, raw: str, title: str) -> "SegmentBlueprint":
        """
        Parse the overview JSON which has a ``texts`` array of multiple blocks.

        Expected shape:
            {
              "title": "...",
              "description": "...",
              "texts": [
                {"title": "Learning Aims & Outcomes", "content": "..."},
                {"title": "What We Will Cover",       "content": "..."}
              ]
            }

        Falls back gracefully to ``_parse_segment_text`` if the model returns
        the older single-block format.
        """
        import re as _re

        text = raw.strip()
        text = _re.sub(r"^```[a-z]*\n?", "", text, flags=_re.MULTILINE)
        text = _re.sub(r"\n?```$", "", text.strip())

        brace_start = text.find("{")
        if brace_start != -1:
            depth = 0
            for i, ch in enumerate(text[brace_start:], brace_start):
                if ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0:
                        text = text[brace_start: i + 1]
                        break

        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            try:
                data = json.loads(self._repair_json(text))
            except json.JSONDecodeError:
                # Fall back to single-block parser
                return self._parse_segment_text(raw, title)

        seg_title = data.get("title") or title
        description = data.get("description") or f"Introduction to {title}"

        # ── Multi-block path ──────────────────────────────────────────────────
        texts_raw = data.get("texts")
        if isinstance(texts_raw, list) and texts_raw:
            text_blocks = [
                TextBlueprint(
                    title=str(tb.get("title") or "Overview"),
                    content=str(tb.get("content") or "")[:2000],
                )
                for tb in texts_raw
                if isinstance(tb, dict) and tb.get("content")
            ]
            if text_blocks:
                return SegmentBlueprint(
                    title=seg_title,
                    description=description,
                    texts=text_blocks,
                )

        # ── Single-block fallback (old format) ────────────────────────────────
        text_title = data.get("text_title") or "Unit Overview"
        text_content = data.get("text_content") or raw[:1500]
        return SegmentBlueprint(
            title=seg_title,
            description=description,
            texts=[TextBlueprint(title=text_title, content=text_content[:2000])],
        )

    # ── Blueprint parser ──────────────────────────────────────────────────────

    _LOG_RAW_CHARS = 2000

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

    # ── Image prompt helpers ──────────────────────────────────────────────────

    @staticmethod
    def _extract_content_bullets(seg_bp: "SegmentBlueprint") -> list[str]:
        """
        Derive up to 4 concise bullet-point strings from the segment's generated
        text blocks so the image prompt reflects the actual lesson content.

        Priority order:
        1. Non-empty lines that start with a Markdown bullet (- / * / •)
           or a numbered list (1. 2. etc.) — these are already concise items.
        2. Short heading lines (## Heading) stripped of hashes.
        3. Segment description as a last resort.

        Each candidate is stripped of Markdown emphasis (**bold**, *italic*)
        and capped at 80 chars so the final prompt stays within token limits.
        """
        import re

        _MD_EMPHASIS = re.compile(r"[*_`]{1,3}")
        _MD_HEADING  = re.compile(r"^#{1,6}\s+")
        _MD_BULLET   = re.compile(r"^[-*•]\s+")
        _MD_NUMBERED = re.compile(r"^\d+[.)]\s+")

        def clean(text: str) -> str:
            text = _MD_EMPHASIS.sub("", text).strip()
            return text[:80].rstrip()

        bullets: list[str] = []
        headings: list[str] = []

        for txt_bp in seg_bp.texts:
            for raw_line in txt_bp.content.splitlines():
                line = raw_line.strip()
                if not line:
                    continue
                if _MD_BULLET.match(line) or _MD_NUMBERED.match(line):
                    candidate = clean(_MD_BULLET.sub("", _MD_NUMBERED.sub("", line)))
                    if candidate and len(candidate) > 3:
                        bullets.append(candidate)
                elif _MD_HEADING.match(line):
                    candidate = clean(_MD_HEADING.sub("", line))
                    if candidate and len(candidate) > 3:
                        headings.append(candidate)

        result = bullets[:4]

        # Pad with headings if not enough bullets
        if len(result) < 3:
            for h in headings:
                if h not in result:
                    result.append(h)
                if len(result) >= 4:
                    break

        # Final fallback: segment description or just the title
        if not result:
            if seg_bp.description:
                result = [seg_bp.description[:80]]
            else:
                result = [seg_bp.title]

        return result

    # ── Exercise assignment (smart, multi-per-segment) ───────────────────────

    # Exercise types that work best for specific segment roles.
    # Used by _smart_assign_exercises to match type to content.
    _EXERCISE_AFFINITY: dict[str, int] = {
        # Lower number = better for overview / comprehension
        "true_false":           1,
        "match_pairs":          2,
        "select_word_form":     3,
        "drag_to_gap":          4,
        "type_word_in_gap":     5,
        "build_sentence":       6,
        "sort_into_columns":    7,
        "order_paragraphs":     8,
        "drag_word_to_image":   9,
        "select_form_to_image": 10,
        "image_stacked":        11,
        "test_without_timer":   12,
        "test_with_timer":      13,
    }

    # Fallback pool used when teacher selects fewer than 3 types so every segment
    # can still receive a varied set of exercises.
    _FALLBACK_EXERCISE_POOL: list[str] = [
        "drag_to_gap",
        "match_pairs",
        "true_false",
        "type_word_in_gap",
        "select_word_form",
        "build_sentence",
        "sort_into_columns",
        "order_paragraphs",
        "test_without_timer",
    ]

    # How many exercises to generate per content segment (not the intro).
    _EXERCISES_PER_SEGMENT: int = 3

    def _smart_assign_exercises(
        self,
        segment_plans: list["SegmentPlan"],
        exercise_types: list[str],
        topic: str,
    ) -> list[list[tuple[str, str]] | None]:
        """
        Assign 2–3 *different* exercise types per content segment.

        Design goals
        ────────────
        • Segment 0 (overview/intro) always gets NO exercises — returns None.
        • Every teacher-chosen type appears at least once across the unit.
        • Each segment receives ``_EXERCISES_PER_SEGMENT`` exercises whose
          types are ALL different from each other.
        • No two consecutive segments share the same first exercise type.
        • When fewer than ``_EXERCISES_PER_SEGMENT`` distinct teacher-chosen
          types are available, the fallback pool fills in the gaps so every
          segment always has a full variety set.

        Returns list of [(exercise_type, topic_hint), ...] | None — one per segment.
        """
        # 1. Normalise teacher-chosen types
        normalised: list[str] = [
            t.replace("-", "_").lower()
            for t in exercise_types
            if t.replace("-", "_").lower() in SUPPORTED_EXERCISE_TYPES
        ]
        if not normalised:
            normalised = list(self._FALLBACK_EXERCISE_POOL[:self._EXERCISES_PER_SEGMENT])

        # 2. Build an extended pool: teacher types first, then fallbacks to reach
        #    at least _EXERCISES_PER_SEGMENT unique types.
        seen: set[str] = set(normalised)
        extended_pool: list[str] = list(normalised)
        for fb in self._FALLBACK_EXERCISE_POOL:
            if fb not in seen:
                extended_pool.append(fb)
                seen.add(fb)
            if len(extended_pool) >= self._EXERCISES_PER_SEGMENT * 3:
                break

        # 3. Sort by affinity so the best-fit types come first
        extended_pool.sort(key=lambda t: self._EXERCISE_AFFINITY.get(t, 99))
        n_pool = len(extended_pool)

        result: list[list[tuple[str, str]] | None] = []

        for i, plan in enumerate(segment_plans):
            if i == 0:
                # Intro / overview segment — no exercises by design
                result.append(None)
                continue

            content_idx = i - 1  # 0-based index among content segments
            assignments: list[tuple[str, str]] = []
            used_in_segment: set[str] = set()

            for slot in range(self._EXERCISES_PER_SEGMENT):
                # Stagger starting offset per segment so consecutive segments
                # start on a different type → natural variety across the unit.
                start = (content_idx * self._EXERCISES_PER_SEGMENT + slot) % n_pool
                chosen: str | None = None
                for offset in range(n_pool):
                    candidate = extended_pool[(start + offset) % n_pool]
                    if candidate not in used_in_segment:
                        chosen = candidate
                        break
                if chosen is None:
                    # All pool types exhausted for this segment — skip slot
                    continue
                used_in_segment.add(chosen)
                hint = f"{plan.title} — {chosen.replace('_', ' ')} practice"
                assignments.append((chosen, hint))

            result.append(assignments if assignments else None)

        return result

    # ── Persistence ───────────────────────────────────────────────────────────

    async def _persist(
        self,
        blueprint: UnitBlueprint,
        request: UnitGenerateRequest,
        db: Session,
        segment_plans: list["SegmentPlan"] | None = None,
    ) -> UnitGenerateResult:
        """
        Write all Segment records:
          1. Text blocks  (grammar/vocabulary/examples — always)
          2. Exercise blocks (one per segment, best-fit type from teacher's choices)
          3. Image block  (SVG diagram — only if include_images=True)

        Exercise types come from ``_smart_assign_exercises()`` — one type per segment,
        chosen to fit the segment's content, with every chosen type guaranteed to
        appear at least once across the unit.
        """
        from sqlalchemy.orm.attributes import flag_modified

        # ── Delete any pre-existing segments before writing AI-generated ones ─
        # When a unit is first created, `_create_default_segment` inserts an
        # empty "Section 1" placeholder so the teacher has something to click
        # into immediately.  If we then run AI generation we must remove that
        # placeholder (and any other leftover segments) before inserting new
        # ones — otherwise the unit ends up with one empty segment mixed in
        # among the AI-generated content.
        try:
            existing = (
                db.query(Segment)
                .filter(Segment.unit_id == request.unit_id)
                .all()
            )
            if existing:
                logger.info(
                    "UnitGenerator: removing %d pre-existing segment(s) from unit_id=%d "
                    "before AI generation",
                    len(existing),
                    request.unit_id,
                )
                for seg in existing:
                    db.delete(seg)
                db.flush()
        except Exception as exc:
            # Non-fatal: log and continue — worst case we get an extra empty segment
            logger.warning(
                "UnitGenerator: could not delete pre-existing segments for unit_id=%d: %s",
                request.unit_id,
                exc,
            )

        # ── Smart exercise assignment ─────────────────────────────────────────
        # One exercise type per segment, chosen to match content.
        # Falls back to segment blueprints if no plans available.
        plans_for_assignment = segment_plans or [
            SegmentPlan(title=seg.title, focus="", excerpt="")
            for seg in blueprint.segments
        ]
        exercise_assignment = self._smart_assign_exercises(
            plans_for_assignment,
            request.exercise_types,
            request.topic,
        )
        for seg_bp, assignment in zip(blueprint.segments, exercise_assignment):
            if assignment is None:
                seg_bp.exercises = []  # overview / intro — no exercises by design
            else:
                # assignment is a list of (ex_type, hint) tuples — one per exercise slot
                seg_bp.exercises = [
                    ExerciseBlueprint(type=ex_type, topic_hint=hint)
                    for ex_type, hint in assignment
                ]

        logger.info(
            "UnitGenerator: exercise assignment — %s",
            [
                (seg.title, [ex.type for ex in seg.exercises] if seg.exercises else "none")
                for seg in blueprint.segments
            ],
        )

        result = UnitGenerateResult(segments_created=0, exercises_created=0)

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

            # ── 2. Image placeholder block (optional, placed after text, before exercises) ─
            # When include_images=True we write a placeholder block with a rich
            # image_description derived from the segment content.  The actual image
            # is NOT generated here; instead the teacher clicks "Generate Image" per
            # placeholder in the lesson workspace, which calls the dedicated
            # POST /units/{unit_id}/segments/{segment_id}/generate-image endpoint.
            if request.include_images:
                try:
                    from app.services.image_prompt_builder import ImagePromptBuilder
                    content_bullets = self._extract_content_bullets(seg_bp)
                    image_description = ImagePromptBuilder.build(
                        slide_title=seg_bp.title,
                        bullet_points=content_bullets,
                        topic=request.topic,
                        audience=f"{request.level} level {request.language} learner",
                        style="educational, flat illustration, clean background",
                    )
                    placeholder_block: dict[str, Any] = {
                        "id": str(uuid.uuid4()),
                        "kind": "image_placeholder",
                        "title": seg_bp.title,
                        "data": {
                            "image_description": image_description,
                            "alt_text": f"Educational illustration for: {seg_bp.title}",
                            # Stored so the frontend can call the generate-image endpoint
                            # without needing extra context passed via props.
                            "_unit_id": request.unit_id,
                            # _segment_id is patched in after the DB flush below (see ★)
                        },
                    }
                    prepend_blocks.append(placeholder_block)
                    result.images_created += 1
                    # ★ Patch _segment_id now that segment.id is available
                    placeholder_block["data"]["_segment_id"] = segment.id
                    logger.debug(
                        "UnitGenerator: image placeholder added for segment id=%d", segment.id
                    )
                except Exception as exc:
                    error_msg = (
                        f"Segment[{order_idx}] '{seg_bp.title}': "
                        f"image placeholder creation failed — {exc}"
                    )
                    logger.warning("UnitGenerator: %s", error_msg, exc_info=True)
                    result.errors.append(error_msg)

            # ── 3. Exercise blocks ────────────────────────────────────────────
            # Build a rich topic_hint from the segment's title + text content
            # so every exercise generator knows exactly what the segment teaches.
            text_content_for_hint = " ".join(
                txt_bp.content for txt_bp in seg_bp.texts
            )
            _directive_suffix = ""
            if request.description and request.description.strip():
                _directive_suffix = (
                    f"\n\nTEACHER DIRECTIVE — MANDATORY: {request.description.strip()}\n"
                    f"ALL exercise sentences and vocabulary MUST follow the directive above. "
                    f"If the directive names specific TV shows, films, or books, draw ALL examples from them."
                )
            rich_hint = (
                f"Segment: {seg_bp.title}\n\n"
                f"{text_content_for_hint[:800]}"
                f"{_directive_suffix}"
            )

            for ex_bp in seg_bp.exercises:
                # Always use rich_hint (segment title + full text content) so the
                # AI generator has the actual lesson material to draw from.
                # ex_bp.topic_hint is intentionally ignored here — it is a short
                # label used only for logging, not a content source.
                hint = rich_hint if rich_hint.strip() else (ex_bp.topic_hint or "")

                _target_lang = request.language.strip()
                _native_lang  = request.instruction_language.strip()
                _is_bilingual = (
                    _target_lang
                    and _native_lang
                    and _target_lang.lower() != _native_lang.lower()
                )

                # ── Per-exercise-type language directive ──────────────────────
                # Each exercise type has its own language contract:
                #
                #  • drag_to_gap / type_word_in_gap / build_sentence /
                #    order_paragraphs / sort_into_columns / select_word_form /
                #    drag_word_to_image / type_word_to_image /
                #    select_form_to_image
                #      → ALL content in TARGET language only.
                #        Title in NATIVE (instruction) language.
                #
                #  • match_pairs
                #      → Left column: TARGET language word/phrase.
                #        Right column: NATIVE language translation.
                #        Both columns present, each in its own language.
                #
                #  • test_without_timer / test_with_timer / true_false
                #      → Questions (prompts) may mix languages to test
                #        comprehension (e.g. "What does X mean?").
                #        Answer options in TARGET language.
                #        Title in NATIVE language.
                #
                # The hint prepended here is read by every generator's prompt
                # builder.  Generator-level lang_hint (content_language param)
                # handles the actual enforcement; this directive is belt-and-
                # suspenders for the LLM.
                if _is_bilingual:
                    if ex_bp.type == "match_pairs":
                        lang_directive = (
                            f"[LANGUAGE DIRECTIVE — MATCH PAIRS BILINGUAL MODE]\n"
                            f"Left column  → word or phrase in {_target_lang.upper()} (the language being taught).\n"
                            f"Right column → its translation in {_native_lang.upper()} (the student's native language).\n"
                            f"Do NOT put both sides in the same language.\n"
                            f"Title: write in {_native_lang.upper()}.\n\n"
                        )
                    elif ex_bp.type in ("test_without_timer", "test_with_timer", "true_false"):
                        lang_directive = (
                            f"[LANGUAGE DIRECTIVE — TEST/TRUE-FALSE]\n"
                            f"Question prompts: may be in {_native_lang.upper()} or {_target_lang.upper()} "
                            f"depending on what is being tested (e.g. comprehension questions in "
                            f"{_native_lang.upper()}, grammar identification in {_target_lang.upper()}).\n"
                            f"Answer options: MUST be in {_target_lang.upper()}.\n"
                            f"Title: write in {_native_lang.upper()}.\n"
                            f"Source text below contains {_native_lang.upper()} grammar explanations — "
                            f"use the {_target_lang.upper()} examples embedded in them for answer options.\n\n"
                        )
                    else:
                        # All other exercise types: target language only
                        lang_directive = (
                            f"[LANGUAGE DIRECTIVE — EXERCISES]\n"
                            f"ALL exercise content (sentences, words, gaps, answer options) MUST be "
                            f"entirely in {_target_lang.upper()} (the language being taught).\n"
                            f"The source text below contains {_native_lang.upper()} grammar explanations — "
                            f"IGNORE those; extract only the {_target_lang.upper()} example sentences "
                            f"and vocabulary for exercise content.\n"
                            f"Title: write in {_native_lang.upper()}.\n\n"
                        )
                    hint = lang_directive + hint

                # NOTE: native_language / target_language for match_pairs bilingual
                # mode are intentionally NOT passed here via generator_params.
                # exercise_generation_flow.py (production) already injects them
                # from the course row.  Passing them again via generator_params
                # causes a "got multiple values for keyword argument 'native_language'"
                # TypeError because generate_exercise() receives the key twice.

                try:
                    await generate_exercise_for_segment(
                        exercise_type=ex_bp.type,
                        db=db,
                        segment_id=segment.id,
                        unit_id=request.unit_id,
                        created_by=request.teacher_id,
                        # teacher_plan intentionally NOT passed — unit generation is
                        # already metered by the unit_generation quota consumed at
                        # the endpoint.  Forwarding teacher_plan into the service
                        # layer would silently skip all exercises when the standalone
                        # exercise_generation quota is exhausted (TypeError swallowed
                        # by the broad except below).
                        block_title=None,
                        topic_hint=hint,
                        content_language=request.content_language,
                        instruction_language=request.instruction_language,
                        generator_params={},
                        # Use the same AI provider that generated the unit text so
                        # exercises don't fall back to _default_provider (Groq) and
                        # fail when GROQ_API_KEY is absent or rate-limited.
                        provider=self.provider,
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

        # Final commit — also persist the generation topic as the unit title (GenerateUnitModal field).
        try:
            # Matches the teacher's "Topic" string (e.g. "Tenses") to Unit.title in the DB
            topic_as_title = (request.topic or "").strip()
            if topic_as_title:
                # ORM row updated in the same transaction as new segments
                unit_for_title = db.query(Unit).filter(Unit.id == request.unit_id).first()
                if unit_for_title is not None:
                    unit_for_title.title = topic_as_title[:255]
            db.commit()
        except Exception as exc:
            db.rollback()
            raise RuntimeError(
                f"UnitGenerator: final DB commit failed — {exc}"
            ) from exc

        return result