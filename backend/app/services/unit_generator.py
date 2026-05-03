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
    plan: str = "free"             # teacher's subscription plan — used for provider routing


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
            "language=%s segments=%d include_images=%s source=%s",
            request.unit_id, request.teacher_id, request.topic,
            request.level, request.language,
            request.num_segments, request.include_images,
            "file" if request.source_content else "topic",
        )

        # ── Phase 0: unit plan ────────────────────────────────────────────────
        segment_plans: list[SegmentPlan] = []
        if request.source_content:
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

        prompt = f"""You are an expert language-curriculum designer.

A teacher wants to build a {request.language} lesson unit (level {request.level}) on:
  Topic: {request.topic}
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
- Titles must be concise (2–6 words) and written in {request.language}.

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
                title = raw_title if raw_title else "Introduction & Learning Outcomes"
                if title.lower() not in ("introduction & learning outcomes",
                                         "introduction and learning outcomes",
                                         "intro & learning outcomes"):
                    title = "Introduction & Learning Outcomes"
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
- Titles must be concise (2–6 words), in {request.language}.

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
                block_spec = f"""Return ONLY a single valid JSON object — no markdown fences, no preamble:

{{
  "title": "{title}",
  "description": "<one sentence: what the student will gain from this whole unit>",
  "texts": [
    {{
      "title": "Learning Aims & Outcomes",
      "content": "<block 1 markdown — see requirements below>"
    }},
    {{
      "title": "What We Will Cover",
      "content": "<block 2 markdown — see requirements below>"
    }}
  ]
}}

Block 1 — "Learning Aims & Outcomes" (80–120 words):
  ## Learning Aims
  2-3 sentences: what the student will be able to do by the end of this unit.
  Why this topic matters in real life.

  ### Learning Outcomes
  Bullet list of 3-5 concrete, measurable outcomes.
  Example: "- Use **Past Simple** to describe completed events."

Block 2 — "What We Will Cover" (80–120 words):
  ## Unit Overview
  1-2 sentences introducing the flow of the unit.

  ### Unit Roadmap
  Numbered list of the upcoming sections (use exact titles from the list above),
  each with one sentence on what it teaches. This is a PREVIEW only."""
            else:
                block_spec = f"""Return ONLY a single valid JSON object — no markdown fences, no preamble:

{{
  "title": "{title}",
  "description": "<one sentence: what the student will gain from this whole unit>",
  "texts": [
    {{
      "title": "Unit Overview",
      "content": "<combined block markdown — see requirements below>"
    }}
  ]
}}

Single block (120–180 words):
  ## Learning Aims
  2-3 sentences on what the student will be able to do after this unit. Why it matters.

  ### What We Will Cover
  Numbered list of upcoming sections (use exact titles from the list above),
  each with one sentence preview.

  ### Getting Started
  1-2 motivating sentences."""

            prompt = f"""You are an expert {request.language} language teacher writing engaging lesson content.

Write the INTRODUCTION section for a lesson unit. This section has NO exercises.
This is Section 1 of {total_sections}.

  Unit topic : {request.topic}
  Level      : {request.level} (CEFR)
  Language   : {request.language}

Upcoming sections (in order):
{upcoming}
{source_block}
{block_spec}

General rules:
- Written entirely in {request.language}.
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

        prompt = f"""You are an expert {request.language} language teacher writing engaging lesson content.

Write the educational text block for this lesson segment:

  Segment title : {title}
  Teaching topic: {teaching_topic}
  Level         : {request.level} (CEFR)
  Language      : {request.language}
  Segment index : {segment_index + 1}
{scope_instruction}
Return ONLY a single valid JSON object — no markdown fences, no preamble:

{{
  "title": "<segment title — same as above>",
  "description": "<one sentence: exactly what the student will learn in this segment>",
  "text_title": "<heading for the text block, e.g. 'Past Simple: Rules & Examples'>",
  "text_content": "<full educational markdown content>"
}}

Requirements for "text_content":
- Written in {request.language}.
- 120–250 words — substantive but focused.
- Structure (use all three):
    1. ## Rule / Explanation  — the key rule or concept for THIS topic in 2-4 sentences.
    2. ### Key Points  — 3-5 bullet points with bold key terms and concise explanations.
    3. ### Examples  — 4-6 concrete example sentences demonstrating THIS topic only.
       Format each example as:  ✓ *sentence* — brief note why it's correct.
- Use Markdown: ##, ###, **bold**, *italic*, bullet lists ( - ).
- Make it engaging: use relatable scenarios (daily life, travel, work).
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

    # ── Exercise assignment (smart, one-per-segment) ─────────────────────────

    # Exercise types that work best for specific segment roles.
    # Used by _smart_assign_exercises to match type to content.
    _EXERCISE_AFFINITY: dict[str, int] = {
        # Lower number = better for overview / comprehension
        "true_false":         1,
        "match_pairs":        2,
        "select_word_form":   3,
        "drag_to_gap":        4,
        "type_word_in_gap":   5,
        "build_sentence":     6,
        "sort_into_columns":  7,
        "order_paragraphs":   8,
        "drag_word_to_image": 9,
        "select_form_to_image": 10,
        "image_stacked":      11,
        "test_without_timer": 12,
        "test_with_timer":    13,
    }

    def _smart_assign_exercises(
        self,
        segment_plans: list["SegmentPlan"],
        exercise_types: list[str],
        topic: str,
    ) -> list[tuple[str, str] | None]:
        """
        Assign exactly ONE exercise type per segment from the teacher's chosen types.

        Design goals
        ────────────
        • Segment 0 (overview/intro) always gets NO exercise — returns None.
        • Every chosen type must appear at least once across the remaining segments.
        • Content sections get types matched by affinity to their position.
        • Extra segments beyond the type count cycle round-robin.

        Returns list of (exercise_type, topic_hint) | None — one entry per segment.
        """
        normalised = [
            t.replace("-", "_").lower()
            for t in exercise_types
            if t.replace("-", "_").lower() in SUPPORTED_EXERCISE_TYPES
        ]
        if not normalised:
            normalised = ["match_pairs"]

        sorted_types = sorted(normalised, key=lambda t: self._EXERCISE_AFFINITY.get(t, 99))

        n_types = len(sorted_types)
        result: list[tuple[str, str] | None] = []

        for i, plan in enumerate(segment_plans):
            if i == 0:
                # Overview section — no exercise
                result.append(None)
                continue
            # Assign type by cycling through the sorted list
            content_idx = i - 1  # offset: skip the overview slot
            ex_type = sorted_types[content_idx % n_types]
            hint = f"{plan.title} — {ex_type.replace('_', ' ')} practice"
            result.append((ex_type, hint))

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
                seg_bp.exercises = []  # overview — no exercise
            else:
                ex_type, hint = assignment
                seg_bp.exercises = [ExerciseBlueprint(type=ex_type, topic_hint=hint)]

        logger.info(
            "UnitGenerator: exercise assignment — %s",
            [(seg.title, seg.exercises[0].type if seg.exercises else "none")
             for seg in blueprint.segments],
        )

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
                    # Build bullet points from the actual generated text content so
                    # the image reflects what the segment teaches, not just the title.
                    content_bullets = self._extract_content_bullets(seg_bp)
                    img_prompt = ImagePromptBuilder.build(
                        slide_title=seg_bp.title,
                        bullet_points=content_bullets,
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
            # Build a rich topic_hint from the segment's title + text content
            # so every exercise generator knows exactly what the segment teaches.
            text_content_for_hint = " ".join(
                txt_bp.content for txt_bp in seg_bp.texts
            )
            rich_hint = (
                f"Segment: {seg_bp.title}\n\n"
                f"{text_content_for_hint[:800]}"
            )

            for ex_bp in seg_bp.exercises:
                # Prefer the blueprint's own topic_hint if it's specific;
                # fall back to the rich content-based hint.
                hint = (
                    ex_bp.topic_hint
                    if (ex_bp.topic_hint and len(ex_bp.topic_hint) > 30)
                    else rich_hint
                )
                try:
                    await generate_exercise_for_segment(
                        exercise_type=ex_bp.type,
                        db=db,
                        segment_id=segment.id,
                        unit_id=request.unit_id,
                        created_by=request.teacher_id,
                        teacher_plan=request.plan or "free",
                        block_title=None,
                        topic_hint=hint,
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