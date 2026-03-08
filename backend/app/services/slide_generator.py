"""
services/slide_generator.py
============================
SlideGeneratorService — model-agnostic AI slide deck generator.

Architecture
------------
* Accepts any AIProvider via constructor injection — no vendor lock-in.
* Builds a strict JSON-only system prompt so parsing is deterministic.
* Validates LLM output with Pydantic; retries exactly once on failure.
* Never leaks raw LLM reasoning to callers.
* Fully synchronous (generate) + async (agenerate) APIs.

Usage
-----
    from app.services.ai.providers.ollama import LocalLlamaProvider
    from app.services.slide_generator import SlideGeneratorService
    from app.schemas.slides import SlideGenerationRequest

    service = SlideGeneratorService(ai_provider=LocalLlamaProvider())
    deck = service.generate_slides(
        SlideGenerationRequest(
            topic="Newton's laws",
            level="high school",
            duration_minutes=45,
            include_exercises=True,
            include_teacher_notes=True,
        )
    )
    print(deck.model_dump_json(indent=2))
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from app.services.ai.cache.cache_service import CacheService

from pydantic import ValidationError

from app.schemas.slides import Slide, SlideDeck, SlideGenerationRequest
from app.services.ai.providers.base import AIProvider, AIProviderError

logger = logging.getLogger(__name__)


# ── Prompt templates ───────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are an expert instructional designer and experienced teacher.
Your task is to generate a structured, pedagogically sound slide deck.

STRICT OUTPUT RULES — follow them exactly:
1. Respond with a single valid JSON object and NOTHING else.
2. Do not include markdown fences (```), explanations, or any text outside JSON.
3. Do not add comments inside the JSON.
4. Every string value must be properly escaped.

JSON SCHEMA (reproduce this structure exactly):
{{
  "topic": "<string>",
  "level": "<string>",
  "target_audience": "<string | null>",
  "duration_minutes": <integer>,
  "slides": [
    {{
      "title": "<string>",
      "bullet_points": ["<string>", ...],
      "examples": ["<string>", ...] | null,
      "exercise": "<string | null>",
      "teacher_notes": "<string | null>"
    }}
  ]
}}

PEDAGOGICAL RULES:
- Slide 1 must always be an Introduction / Learning Objectives slide.
- Last slide must always be a Summary / Recap slide.
- Slides must flow logically: introduce → teach → practice → review.
- Bullet points: concise teaching statements (not full sentences).
- Examples: concrete, age-appropriate, tied to bullet points.
- Exercises: active-learning prompts (pair discussion, quick quiz, think-pair-share).
- Teacher notes: timing hints, common misconceptions, differentiation tips.
- Number of slides: scale to duration ({slide_count} slides for {duration_minutes} min).
- Avoid filler content, vague statements, or off-topic material.
"""

_USER_PROMPT = """\
Generate a slide deck with the following specifications:

Topic            : {topic}
Audience level   : {level}
Duration         : {duration_minutes} minutes
Target audience  : {target_audience}
Learning goals   : {learning_goals}
Include exercises: {include_exercises}
Include teacher notes: {include_teacher_notes}
Language         : {language}

Return ONLY the JSON object. No preamble. No commentary. No markdown.
After the closing }} of the JSON object, output nothing else.
"""


# ── Service ────────────────────────────────────────────────────────────────────

class SlideGeneratorService:
    """
    Generates structured slide decks by prompting an AIProvider.

    Parameters
    ----------
    ai_provider : AIProvider
        Any concrete AIProvider implementation
        (LocalLlamaProvider, OpenAIProvider, AnthropicProvider …).
    cache : CacheService | None
        Optional semantic cache. When provided, generate_slides() and
        agenerate_slides() follow cache-aside:
          1. Compute SHA-256 key from normalized request fields
          2. Cache HIT  → return stored SlideDeck immediately (< 2 ms)
          3. Cache MISS → call AI → store result → return
        Pass None (default) to disable caching entirely — behaviour is
        identical to the original uncached version.
    max_retries : int
        How many times to retry on JSON / validation failure (default: 1).
    """

    # Rough guideline: one slide per 3–4 minutes of content.
    _MINUTES_PER_SLIDE = 3.5

    def __init__(
        self,
        ai_provider: AIProvider,
        cache:       Optional["CacheService"] = None,
        max_retries: int = 1,
    ) -> None:
        if not isinstance(ai_provider, AIProvider):
            raise TypeError(
                f"ai_provider must be an AIProvider instance, got {type(ai_provider)}"
            )
        self._provider    = ai_provider
        self._cache       = cache       # CacheService | None
        self._max_retries = max(0, max_retries)

    # ── Public API ─────────────────────────────────────────────────────────────

    def generate_slides(self, request: SlideGenerationRequest) -> SlideDeck:
        """
        Synchronous slide generation with cache-aside.

        Flow
        ----
        1. If cache is configured: compute key, check cache.
           HIT  → return SlideDeck immediately (AI is never called).
        2. MISS / no cache → call AI provider with retry loop.
        3. On success: store result in cache, then return.

        Parameters
        ----------
        request : SlideGenerationRequest
            Validated input from the API layer.

        Returns
        -------
        SlideDeck
            Fully validated, ready-to-render slide deck.

        Raises
        ------
        SlideGenerationError
            When the AI provider fails or returns unrecoverable output.
        """
        # ── 1. Cache lookup ────────────────────────────────────────────────────
        if self._cache is not None:
            cached, _ = self._cache.get_slide(request)
            if cached is not None:
                return cached

        # ── 2. AI generation ───────────────────────────────────────────────────
        system_prompt = self._build_system_prompt(request)
        user_prompt   = self._build_user_prompt(request)
        full_prompt   = f"{system_prompt}\n\n{user_prompt}"

        last_error: Exception | None = None

        for attempt in range(self._max_retries + 1):
            if attempt > 0:
                logger.warning(
                    "Slide generation retry %d/%d — topic=%r",
                    attempt, self._max_retries, request.topic,
                )

            # On retry, append a repair note to the prompt
            prompt = full_prompt
            if attempt > 0:
                prompt += (
                    "\n\nCRITICAL CORRECTION: Every single slide MUST have "
                    "bullet_points as a non-empty JSON array with at least one string. "
                    "A slide with bullet_points: [] is invalid. "
                    "Return the complete corrected JSON now."
                )

            try:
                raw = self._provider.generate(prompt)
                deck = self._parse_and_validate(raw, request)

                # ── 3. Store in cache ──────────────────────────────────────────
                if self._cache is not None:
                    self._cache.set_slide(request, deck)

                return deck

            except (SlideGenerationError, AIProviderError) as exc:
                last_error = exc
                logger.error(
                    "Slide generation attempt %d failed: %s",
                    attempt + 1, exc,
                )

        raise SlideGenerationError(
            f"Failed to generate slides after {self._max_retries + 1} attempt(s): "
            f"{last_error}"
        ) from last_error

    async def agenerate_slides(self, request: SlideGenerationRequest) -> SlideDeck:
        """
        Async slide generation with cache-aside.

        Cache reads/writes are synchronous (fast indexed single-row ops, < 2 ms).
        Only the AI call itself is async — it runs on the event loop via
        provider.agenerate() which defaults to asyncio.to_thread for sync backends.

        FastAPI endpoints should prefer this variant to avoid blocking
        the event loop on slow LLM calls.
        """
        # ── 1. Cache lookup ────────────────────────────────────────────────────
        if self._cache is not None:
            cached, _ = self._cache.get_slide(request)
            if cached is not None:
                return cached

        # ── 2. AI generation (async) ───────────────────────────────────────────
        system_prompt = self._build_system_prompt(request)
        user_prompt   = self._build_user_prompt(request)
        full_prompt   = f"{system_prompt}\n\n{user_prompt}"

        last_error: Exception | None = None

        for attempt in range(self._max_retries + 1):
            if attempt > 0:
                logger.warning(
                    "Slide generation retry %d/%d (async) — topic=%r",
                    attempt, self._max_retries, request.topic,
                )

            # On retry, append a repair note to the prompt
            prompt = full_prompt
            if attempt > 0:
                prompt += (
                    "\n\nCRITICAL CORRECTION: Every single slide MUST have "
                    "bullet_points as a non-empty JSON array with at least one string. "
                    "A slide with bullet_points: [] is invalid. "
                    "Return the complete corrected JSON now."
                )

            try:
                raw = await self._provider.agenerate(prompt)
                deck = self._parse_and_validate(raw, request)

                # ── 3. Store in cache ──────────────────────────────────────────
                if self._cache is not None:
                    self._cache.set_slide(request, deck)

                return deck

            except (SlideGenerationError, AIProviderError) as exc:
                last_error = exc
                logger.error(
                    "Slide generation attempt %d failed (async): %s",
                    attempt + 1, exc,
                )

        raise SlideGenerationError(
            f"Failed to generate slides after {self._max_retries + 1} attempt(s): "
            f"{last_error}"
        ) from last_error

    # ── Prompt builders ────────────────────────────────────────────────────────

    def _build_system_prompt(self, req: SlideGenerationRequest) -> str:
        """Render the system prompt with dynamic slide count hint."""
        slide_count = max(3, round(req.duration_minutes / self._MINUTES_PER_SLIDE))
        return _SYSTEM_PROMPT.format(
            slide_count      = slide_count,
            duration_minutes = req.duration_minutes,
        )

    def _build_user_prompt(self, req: SlideGenerationRequest) -> str:
        """Render the user prompt from request fields."""
        goals_text = (
            "\n  - ".join(req.learning_goals)
            if req.learning_goals
            else "Not specified — infer from topic and level."
        )
        audience_text = req.target_audience or "Not specified."

        return _USER_PROMPT.format(
            topic                = req.topic,
            level                = req.level,
            duration_minutes     = req.duration_minutes,
            target_audience      = audience_text,
            learning_goals       = goals_text,
            include_exercises    = "Yes" if req.include_exercises else "No — omit exercise field.",
            include_teacher_notes= "Yes" if req.include_teacher_notes else "No — omit teacher_notes field.",
            language             = req.language,
        )

    # ── Parsing & validation ───────────────────────────────────────────────────

    def _parse_and_validate(
        self,
        raw: str,
        request: SlideGenerationRequest,
    ) -> SlideDeck:
        """
        Extract JSON from the LLM response and validate it as a SlideDeck.

        Strategy
        --------
        1. Strip any accidental markdown fences.
        2. Try direct json.loads on the full response.
        3. Fall back to a first-JSON-object regex extraction.
        4. Feed the dict to SlideDeck for Pydantic validation.
        5. Back-fill top-level fields from the request (topic, level, …)
           if the model omitted them.
        """
        if not raw or not raw.strip():
            raise SlideGenerationError("AI provider returned an empty response.")

        cleaned = self._strip_markdown_fences(raw.strip())

        data = self._extract_json(cleaned)

        # Back-fill request fields the model may have omitted or altered
        data.setdefault("topic",            request.topic)
        data.setdefault("level",            request.level)
        data.setdefault("target_audience",  request.target_audience)
        data.setdefault("duration_minutes", request.duration_minutes)

        # Sanitize slide content before Pydantic validation
        data = self._sanitize(data)

        try:
            deck = SlideDeck.model_validate(data)
        except ValidationError as exc:
            logger.error(
                "SlideDeck validation failed — raw excerpt: %s…\nErrors: %s",
                cleaned[:400],
                exc,
            )
            raise SlideGenerationError(
                f"AI output failed schema validation: {exc}"
            ) from exc

        logger.info(
            "Slide deck generated — topic=%r level=%r slides=%d provider=%r",
            deck.topic, deck.level, len(deck.slides), self._provider,
        )
        return deck

    @staticmethod
    def _strip_markdown_fences(text: str) -> str:
        """Remove ```json … ``` or ``` … ``` wrappers the model sometimes adds."""
        # Match optional language tag after opening fence
        fenced = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.DOTALL)
        if fenced:
            return fenced.group(1).strip()
        return text

    @staticmethod
    def _fix_escapes(text: str) -> str:
        r"""
        Fix invalid JSON escape sequences produced by the model.

        JSON only permits: \\  \"  \/  \b  \f  \n  \r  \t  \uXXXX
        The model sometimes writes bare backslashes inside strings,
        e.g. "Timing hint: \Teacher" or "path: C:\Users\name".

        Strategy: replace any backslash NOT followed by a valid escape
        character with a double-backslash (escaped literal backslash).
        Only operates inside JSON string values to avoid mangling structure.
        """
        # Replace \X where X is not a valid JSON escape character
        # Valid: " \ / b f n r t u
        return re.sub(
            r'\\(?!["\\/bfnrtu])',
            r'\\\\',
            text,
        )

    @staticmethod
    def _repair_truncated_json(fragment: str) -> dict[str, Any] | None:
        """
        Attempt to close a truncated JSON object by counting unclosed
        brackets and strings, then appending the minimum closing tokens.

        Returns parsed dict on success, None if repair fails.
        This is a best-effort recovery — the last slide(s) may be incomplete
        but the deck will still validate if earlier slides are intact.
        """
        text    = fragment.rstrip()
        depth   = 0
        in_str  = False
        escape  = False

        for ch in text:
            if escape:
                escape = False
                continue
            if ch == "\\" and in_str:
                escape = True
                continue
            if ch == '"':
                in_str = not in_str
                continue
            if in_str:
                continue
            if ch in "{[":
                depth += 1
            elif ch in "}]":
                depth -= 1

        if depth <= 0:
            return None  # wasn't actually truncated

        # If we're still inside a string, close it first
        suffix = ""
        if in_str:
            suffix += '"'

        # Close arrays and objects based on stack depth
        # Walk the fragment to know the correct close sequence
        close_stack = []
        in_str2     = False
        escape2     = False

        for ch in fragment:
            if escape2:
                escape2 = False
                continue
            if ch == "\\" and in_str2:
                escape2 = True
                continue
            if ch == '"':
                in_str2 = not in_str2
                continue
            if in_str2:
                continue
            if ch == "{":
                close_stack.append("}")
            elif ch == "[":
                close_stack.append("]")
            elif ch in "}]":
                if close_stack:
                    close_stack.pop()

        suffix += "".join(reversed(close_stack))

        repaired_text = text + suffix
        try:
            result = json.loads(repaired_text)
            logger.warning(
                "Repaired truncated JSON by appending %r — "
                "last slide(s) may be incomplete.",
                suffix,
            )
            return result
        except json.JSONDecodeError:
            return None

    @staticmethod
    def _extract_json(text: str) -> dict[str, Any]:
        """
        Parse the first complete JSON object found in *text*.

        Handles:
        - Straight json.loads (fast path)
        - JSON embedded in prose
        - Invalid escape sequences (model writes \\T, \\e, etc.)
        - Truncated responses (model hit token limit mid-output)
        """
        # ── 1. clean invalid escape sequences ─────────────────────────────────
        text = SlideGeneratorService._fix_escapes(text)

        # ── 2. fast path ───────────────────────────────────────────────────────
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # ── 3. find outermost { } block ────────────────────────────────────────
        start = text.find("{")
        if start == -1:
            raise SlideGenerationError(
                f"No JSON object found in AI response. Excerpt: {text[:300]!r}"
            )

        depth, in_str, escape = 0, False, False
        end_idx = None

        for idx, ch in enumerate(text[start:], start=start):
            if escape:
                escape = False
                continue
            if ch == "\\" and in_str:
                escape = True
                continue
            if ch == '"':
                in_str = not in_str
                continue
            if in_str:
                continue
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    end_idx = idx
                    break

        if end_idx is not None:
            candidate = text[start : end_idx + 1]
            try:
                return json.loads(candidate)
            except json.JSONDecodeError as exc:
                # Try escape-fix again on the isolated block
                candidate = SlideGeneratorService._fix_escapes(candidate)
                try:
                    return json.loads(candidate)
                except json.JSONDecodeError:
                    raise SlideGenerationError(
                        f"Extracted JSON block is invalid: {exc}. "
                        f"Block excerpt: {candidate[:400]!r}"
                    ) from exc

        # ── 4. truncated response — attempt repair ─────────────────────────────
        logger.warning(
            "JSON appears truncated (depth=%d after full scan). "
            "Attempting repair. Text length: %d",
            depth, len(text),
        )
        repaired = SlideGeneratorService._repair_truncated_json(text[start:])
        if repaired:
            return repaired

        raise SlideGenerationError(
            f"Could not find or repair a complete JSON object. "
            f"Response was likely truncated. "
            f"Excerpt: {text[start:start+300]!r}"
        )

    @staticmethod
    def _sanitize(data: dict[str, Any]) -> dict[str, Any]:
        """
        Clean raw LLM output before Pydantic validation.

        Handles the most common model failures:
        - slide with bullet_points: []        → inject a fallback bullet
        - slide with bullet_points: null      → inject a fallback bullet
        - slide with bullet_points: ["", " "] → strip blanks, inject if empty
        - slide missing the bullet_points key → inject fallback
        - slide missing the title key         → inject fallback title
        - slides list is null / missing       → return empty list (caught later)
        """
        slides_raw = data.get("slides") or []

        cleaned = []
        for i, slide in enumerate(slides_raw):
            if not isinstance(slide, dict):
                continue  # skip completely malformed entries

            # ── title ─────────────────────────────────────────────────────────
            title = str(slide.get("title") or "").strip()
            if not title:
                title = f"Slide {i + 1}"

            # ── bullet_points ──────────────────────────────────────────────────
            raw_bullets = slide.get("bullet_points") or []
            if isinstance(raw_bullets, str):
                # model returned a single string instead of a list
                raw_bullets = [raw_bullets]

            bullets = [b.strip() for b in raw_bullets if isinstance(b, str) and b.strip()]

            if not bullets:
                # Inject a minimal fallback so validation passes
                bullets = [f"Key concepts for: {title}"]
                logger.warning(
                    "Slide %d had empty bullet_points — injected fallback bullet. "
                    "Title: %r",
                    i, title,
                )

            cleaned.append({
                **slide,
                "title":        title,
                "bullet_points": bullets,
            })

        data["slides"] = cleaned
        return data


# ── Custom exception ───────────────────────────────────────────────────────────

class SlideGenerationError(RuntimeError):
    """
    Raised when SlideGeneratorService cannot produce a valid SlideDeck.

    Callers should catch this and return an appropriate HTTP error
    (503 if provider is unavailable, 422 if content policy rejected the topic).
    """