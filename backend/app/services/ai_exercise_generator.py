"""
app/services/ai_exercise_generator.py

AI generator for interactive exercises — provider-agnostic.

Currently supported exercise types
------------------------------------
drag_to_gap   — student drags word chips into sentence gaps

Token-optimisation strategy (Groq → Ollama)
--------------------------------------------
For high sentence / gap counts we use a TWO-PHASE approach:

  Phase 1 — PASSAGE GENERATION (plain text, tiny output)
    Ask the model to write only the passage as plain text with gap markers
    inline, e.g.  "She [will finish] her work before [leaving] home."
    Output is a single string — no JSON structure at all.
    Token cost ≈ N × 15 words, instead of N × 60 JSON tokens.

  Phase 2 — SERVER-SIDE SEGMENTATION (zero LLM tokens)
    _parse_marked_passage() converts the marked plain text into the full
    DragToGapData dict, assigning g1…gN ids and building the gaps map.

The single-call JSON path is kept only for the edge case where gap_count is
None *and* no explicit sentence count is present — fully auto-decided small
exercises where JSON overhead is acceptable. For every other case (any
gap_count >= 1 or any explicit sentence count) passage mode is used, which
avoids token-limit truncation on long exercises.

The public API is unchanged:
    exercise, meta = await generate_drag_to_gap_from_unit_content(...)
"""

from __future__ import annotations

import json
import logging
import os
import random
import re
from typing import Any

from app.services.ai.providers.base import AIProvider, AIProviderError
from app.services.image_prompt_builder import ImagePromptBuilder

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Threshold above which we switch to passage-level generation.
# When gap_count >= this value, OR an explicit sentence count is given,
# we use the two-phase approach to save output tokens.
#
# Set to 1 so passage mode is always used when gap_count is present.
# JSON mode is reserved for the explicit json-only path only.
# Previously 4 — but "10 sentences, 3 gaps" would fall into JSON mode and
# overflow the token limit.
# ─────────────────────────────────────────────────────────────────────────────
_PASSAGE_MODE_GAP_THRESHOLD = 1

# When the AI generates ≥ this fraction of the requested sentences/gaps we
# accept the result but surface a user-facing warning instead of retrying.
# Below this threshold the attempt is treated as a hard failure and retried
# (or handed off to the Ollama fallback).
_PARTIAL_SUCCESS_THRESHOLD = 0.40


# Written-out numbers recognised as explicit counts (one → 1 … twenty → 20).
_WORD_TO_INT: dict[str, int] = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14,
    "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18,
    "nineteen": 19, "twenty": 20,
}

# Matches a word-count range so those digit(s) are NOT treated as a sentence count.
# e.g. "4–6 words", "4-6 words", "4 to 6 words", "5 words"
_WORD_COUNT_RANGE_RE = re.compile(
    r"\b\d+\s*(?:[-–]|to)\s*\d+\s*words?|\b\d+\s*words?",
    re.IGNORECASE,
)


def _extract_count_from_hint(topic_hint: str | None, default: int) -> int:
    """
    Return the first explicit *count* found in the teacher's topic_hint.

    Priority
    --------
    1. Written number words: "one sentence" → 1, "three pairs" → 3.
       These are checked before digits so "one sentence with 5-6 words" correctly
       returns 1 rather than 5.
    2. Digit numbers that are NOT part of a word-count range.
       "4–6 words" and "5 words" are skipped so they don't shadow the real count.

    The result is clamped to [1, 30].

    Examples
    --------
    >>> _extract_count_from_hint("generate one sentence about Harry Potter", 5)
    1
    >>> _extract_count_from_hint("Shuffle 4–6 words into one sentence", 5)
    1
    >>> _extract_count_from_hint("Match 5 italian words to English", 6)
    5
    >>> _extract_count_from_hint("build 3 sentences with 5-6 words", 5)
    3
    >>> _extract_count_from_hint(None, 5)
    5
    """
    if not topic_hint:
        return default

    hint_lower = topic_hint.lower()

    # ── 1. Written number words (highest priority) ──────────────────────────
    for word, value in _WORD_TO_INT.items():
        if re.search(rf"\b{word}\b", hint_lower):
            return max(1, min(value, 30))

    # ── 2. Digit numbers, skipping any that are part of a word-count range ──
    # Strip word-count patterns from the hint before searching for digits.
    stripped = _WORD_COUNT_RANGE_RE.sub("", hint_lower)
    m = re.search(r"\b(\d+)\b", stripped)
    if m:
        n = int(m.group(1))
        return max(1, min(n, 30))

    return default


def _extract_word_count_from_hint(topic_hint: str | None) -> tuple[int | None, int | None]:
    """
    Parse an optional word-count constraint from the teacher's topic_hint.

    Recognised patterns (case-insensitive):
      "5-6 words"      → (5, 6)
      "5 to 6 words"   → (5, 6)
      "about 5 words"  → (5, 5)
      "5 words"        → (5, 5)
      "at least 5 words" → (5, None)
      "up to 8 words"    → (None, 8)

    Returns
    -------
    (min_words, max_words) — either or both may be None if not specified.
    """
    if not topic_hint:
        return None, None

    hint = topic_hint.lower()

    # Range: "5-6 words" or "5 to 6 words"
    m = re.search(r"(\d+)\s*(?:-|to)\s*(\d+)\s*words?", hint)
    if m:
        lo, hi = int(m.group(1)), int(m.group(2))
        return (min(lo, hi), max(lo, hi))

    # "at least N words"
    m = re.search(r"at\s+least\s+(\d+)\s*words?", hint)
    if m:
        return int(m.group(1)), None

    # "up to N words" / "at most N words" / "max N words"
    m = re.search(r"(?:up\s+to|at\s+most|max(?:imum)?)\s+(\d+)\s*words?", hint)
    if m:
        return None, int(m.group(1))

    # "about / around / ~N words" or plain "N words"
    m = re.search(r"(?:about|around|~|approximately)?\s*(\d+)\s*words?", hint)
    if m:
        n = int(m.group(1))
        return n, n

    return None, None


# ══════════════════════════════════════════════════════════════════════════════
#  PROVIDER BOOTSTRAP
# ══════════════════════════════════════════════════════════════════════════════

def _build_ollama_provider() -> "AIProvider | None":
    """Try to build a LocalLlamaProvider; return None if unavailable."""
    try:
        from app.services.ai.providers.ollama import LocalLlamaProvider
        p = LocalLlamaProvider()
        logger.info("AI exercise fallback provider: LocalLlamaProvider (model=%s)", p.model)
        return p
    except Exception as exc:
        logger.warning("Could not initialise Ollama fallback provider: %s", exc)
        return None


class _WithOllamaFallback(AIProvider):
    """
    Wraps a primary provider and transparently falls back to a local Ollama
    instance when the primary raises a rate-limit (HTTP 429) AIProviderError.
    """

    _RATE_LIMIT_PHRASES = (
        "rate limit",
        "429",
        "slow down",
        "quota",
        "too many requests",
    )

    def __init__(self, primary: AIProvider, fallback: AIProvider) -> None:
        self._primary  = primary
        self._fallback = fallback
        self.model = getattr(primary, "model", type(primary).__name__)

    def _is_rate_limit(self, exc: AIProviderError) -> bool:
        msg = str(exc).lower()
        return any(phrase in msg for phrase in self._RATE_LIMIT_PHRASES)

    def generate(self, prompt: str) -> str:
        try:
            return self._primary.generate(prompt)
        except AIProviderError as exc:
            if self._is_rate_limit(exc):
                logger.warning(
                    "Primary provider rate-limited (%s) — falling back to Ollama.", exc,
                )
                self.model = getattr(self._fallback, "model", type(self._fallback).__name__)
                return self._fallback.generate(prompt)
            raise

    async def agenerate(self, prompt: str) -> str:
        import asyncio
        try:
            return await self._primary.agenerate(prompt)
        except AIProviderError as exc:
            if self._is_rate_limit(exc):
                logger.warning(
                    "Primary provider rate-limited (%s) — falling back to Ollama (async).", exc,
                )
                self.model = getattr(self._fallback, "model", type(self._fallback).__name__)
                return await self._fallback.agenerate(prompt)
            raise

    def __repr__(self) -> str:
        return f"<_WithOllamaFallback primary={self._primary!r} fallback={self._fallback!r}>"


def _build_default_provider() -> AIProvider:
    provider_name = os.environ.get("AI_PROVIDER", "groq").strip().lower()

    if provider_name == "groq":
        from app.services.ai.providers.groq_provider import GroqProvider
        p = GroqProvider()
        logger.info("AI exercise provider: GroqProvider (model=%s)", p.model)
        fallback = _build_ollama_provider()
        if fallback is not None:
            logger.info("Ollama fallback available — rate-limit errors will auto-retry locally.")
            return _WithOllamaFallback(primary=p, fallback=fallback)
        return p

    if provider_name == "ollama":
        from app.services.ai.providers.ollama import LocalLlamaProvider
        p = LocalLlamaProvider()
        logger.info("AI exercise provider: LocalLlamaProvider (model=%s)", p.model)
        return p

    if provider_name == "anthropic":
        from app.services.ai.providers.anthropic_provider import AnthropicProvider
        p = AnthropicProvider()
        logger.info("AI exercise provider: AnthropicProvider (model=%s)", p.model)
        return p

    if provider_name == "openai":
        from app.services.ai.providers.openai_provider import OpenAIProvider
        p = OpenAIProvider()
        logger.info("AI exercise provider: OpenAIProvider (model=%s)", p.model)
        return p

    if provider_name == "deepseek":
        from app.services.ai.providers.deepseek_provider import DeepSeekProvider
        p = DeepSeekProvider()
        logger.info("AI exercise provider: DeepSeekProvider (model=%s)", p.model)
        return p

    raise ValueError(
        f"Unknown AI_PROVIDER={provider_name!r}. Valid values: 'groq', 'ollama', 'anthropic', 'openai', 'deepseek'."
    )


_default_provider: AIProvider = _build_default_provider()


# ══════════════════════════════════════════════════════════════════════════════
#  DRAG-TO-GAP — PHASE 1: PASSAGE-LEVEL GENERATION
#
#  Instead of asking the model to produce a fully segmented JSON (very token-
#  heavy for long exercises), we ask it to write the passage as plain text
#  with gap answers wrapped in square brackets, e.g.:
#
#      She [will finish] her work before [leaving] home.
#      The manager [had already sent] the report when we [arrived].
#
#  The model only needs to emit the passage string — no JSON scaffolding,
#  no segment arrays, no id fields.  For a 10-gap exercise the output tokens
#  drop from ~600 → ~150.
#
#  Phase 2 (_parse_marked_passage) converts this to full DragToGapData
#  server-side at zero LLM cost.
# ══════════════════════════════════════════════════════════════════════════════

# ── regex that finds [gap answer] markers ─────────────────────────────────────
_MARKER_RE = re.compile(r"\[([^\[\]]+)\]")


def _build_passage_prompt(
    unit_content: str,
    gap_count: int | None,
    sentence_count: int | None,
    content_language: str,
    instruction_language: str,
    topic_hint: str | None,
    gap_type: str | None,
) -> str:
    """
    Build a minimal prompt for Phase 1 (passage-level generation).

    The model outputs ONLY a plain-text passage with gap words/phrases
    wrapped in square brackets.  No JSON, no metadata.

    Output token budget (rough estimate):
        sentence_count * avg_words_per_sentence(15) ≈ 150 tokens for 10 sentences
        vs. full JSON ≈ 60 tokens * gap_count + overhead ≈ 650 tokens for 10 gaps
    """
    # Passage + gap answers follow content_language; instruction_language affects only the TITLE line.
    lang_lines: list[str] = []
    if content_language and content_language != "auto":
        lang_lines.append(
            f"The exercise passage (all plain text and every [bracketed] answer) MUST be "
            f"entirely in {content_language.upper()}. "
            f"The SOURCE CONTENT is in {content_language.upper()} — use it as reference; "
            "do not write the passage in any other language."
        )
    else:
        lang_lines.append(
            "Write the passage in the same primary language as the SOURCE CONTENT below."
        )
    # Optional UI locale for teachers: title only, never the gap text.
    # Normalized instruction locale for comparison with content_language
    _instr = (instruction_language or "").strip().lower()
    # Normalized target language for the passage body
    _content = (content_language or "").strip().lower()
    if _instr and _instr != "auto" and (_content == "auto" or _instr != _content):
        lang_lines.append(
            f'Write only the "TITLE:" line in {_instr.upper()}; keep the passage in the '
            "exercise language stated above."
        )
    lang_block = ("\n" + "\n".join(lang_lines)) if lang_lines else ""

    hint_block = f"\nTEACHER DIRECTIVE:\n{topic_hint}\n" if topic_hint else ""

    # ── gap count line ────────────────────────────────────────────────────────
    if gap_count is not None:
        gap_line = f"exactly {gap_count} gap markers"
    else:
        gap_line = "between 3 and 8 gap markers"

    # ── sentence count line ───────────────────────────────────────────────────
    if sentence_count is not None:
        # Explicit or derived sentence count — enforce strictly.
        # When derived from gap_count, this produces exactly 1 gap per sentence.
        sentence_line = (
            f"EXACTLY {sentence_count} sentences. "
            f"Spread the {gap_count if gap_count else 'chosen number of'} "
            "gaps evenly across ALL sentences — EVERY sentence must contain "
            "at least one [bracketed] gap."
        )
    else:
        # Fully auto: gap_count is also None here.
        sentence_line = "AT LEAST 2 complete sentences."

    # ── gap type constraint ───────────────────────────────────────────────────
    gap_type_block = ""
    if gap_type:
        gap_type_block = (
            f"\nGAP TYPE CONSTRAINT: Every bracketed answer MUST be a {gap_type}. "
            "No other word class is allowed inside brackets."
        )
        if "verb" in gap_type.lower():
            gap_type_block += (
                "\nCOMPOUND VERB RULE: For compound tenses bracket the ENTIRE phrase "
                "as one unit: [will finish], [had left], [is going to travel]. "
                "NEVER bracket only the auxiliary: [will] alone is INVALID."
            )

    # ── uniqueness rule ───────────────────────────────────────────────────────
    uniqueness_note = (
        "\nUNIQUENESS: Every bracketed answer must be DISTINCT — no two brackets "
        "may contain the same word or phrase (case-insensitive)."
    )

    # ── build a dynamic example that matches the sentence/gap constraint ───────
    # When sentence_count == gap_count (derived mode), the example must show
    # ONE gap per sentence — otherwise the model will follow the example and
    # generate multiple gaps in one sentence while leaving others empty.
    _example_label, _example_body = _build_dynamic_example(sentence_count, gap_count)

    return f"""You are a language-exercise author. Write ONE titled passage for a fill-in-the-gap exercise.

RULES
-----
1. Output EXACTLY two parts, separated by a blank line:
   - Line 1: TITLE: <a short, descriptive, topic-specific exercise title — max 8 words>
   - Then the passage text with gap markers.
2. The TITLE must reflect the TOPIC of the content (e.g. "Past Tenses: Travel Vocabulary", "Business English: Office Routines"). Do NOT use generic titles like "Fill in the gaps".
3. Mark each gap answer by wrapping it in square brackets: [answer].
4. Use {gap_line}.
5. The passage must contain {sentence_line}
6. Each bracketed answer is the exact word/phrase (≤4 words) the student must fill in.{gap_type_block}{uniqueness_note}
{lang_block}{hint_block}
EXAMPLE ({_example_label}):
TITLE: Present Perfect: Travel Experiences

{_example_body}

SOURCE CONTENT
--------------
\"\"\"{unit_content}\"\"\"

Output ONLY the TITLE line + blank line + passage. Nothing else."""


def _build_dynamic_example(sentence_count, gap_count):
    """Generate a prompt example that matches the sentence/gap constraint."""
    if sentence_count is not None and gap_count is not None and sentence_count == gap_count:
        n = min(sentence_count, 3)
        if n >= 3:
            return (
                f"{n} gaps, {n} sentences — ONE gap per sentence",
                "Next summer, they [will open] a new restaurant in the city.\n"
                "She [finished] the project ahead of schedule.\n"
                "He [is planning] a trip to Italy next month.",
            )
        elif n == 2:
            return (
                "2 gaps, 2 sentences — ONE gap per sentence",
                "They [will travel] to Paris next summer.\n"
                "She [finished] the report ahead of schedule.",
            )
        else:
            return (
                "1 gap, 1 sentence",
                "She [finished] the report ahead of schedule.",
            )
    return (
        "3 gaps, 2 sentences",
        "Next summer, they [will open] a new restaurant in Barcelona. "
        "She [will finish] the project, and he [will join] the team.",
    )


def _parse_marked_passage(
    raw_text: str,
    title: str,
) -> dict:
    """
    Convert a marked passage (plain text with [answer] markers) into a
    full DragToGapData dict:
        { title, segments: [TextSeg | GapSeg, ...], gaps: { gId: answer } }

    If the AI output begins with "TITLE: <text>" (from the new prompt format),
    that line is extracted as the exercise title, overriding the fallback `title`.

    Algorithm
    ---------
    Split the raw text on [marker] occurrences.  Odd-indexed pieces are
    answers; even-indexed pieces are surrounding text.

    Example
    -------
    Input:  "She [will finish] her work. I [had left] home."
    Output:
        segments = [
            {"type": "text", "value": "She "},
            {"type": "gap",  "id": "g1"},
            {"type": "text", "value": " her work. I "},
            {"type": "gap",  "id": "g2"},
            {"type": "text", "value": " home."},
        ]
        gaps = {"g1": "will finish", "g2": "had left"}
    """
    # ── Extract AI-generated title if present ─────────────────────────────────
    passage_text = raw_text
    _title_re = re.compile(r"^TITLE:\s*(.+?)(?:\n|$)", re.IGNORECASE)
    _title_match = _title_re.match(raw_text.lstrip())
    if _title_match:
        extracted_title = _title_match.group(1).strip()
        if extracted_title:
            title = extracted_title
        # Remove the TITLE line (and any following blank lines) from the passage
        passage_text = raw_text.lstrip()[_title_match.end():].lstrip("\n\r")

    segments: list[dict] = []
    gaps: dict[str, str] = {}

    # Split into alternating text / marker pieces
    parts = _MARKER_RE.split(passage_text)
    # parts = [text0, answer1, text1, answer2, text2, ...]

    gap_idx = 0
    for i, piece in enumerate(parts):
        if i % 2 == 0:
            # Even index → plain text
            value = piece.strip(" \n\t")
            # Keep internal whitespace; only strip leading/trailing
            value = piece  # preserve original spacing
            if value:
                segments.append({"type": "text", "value": value})
        else:
            # Odd index → gap answer extracted by the regex group
            gap_idx += 1
            gid = f"g{gap_idx}"
            answer = piece.strip()
            segments.append({"type": "gap", "id": gid})
            gaps[gid] = answer

    return {
        "title": title,
        "segments": segments,
        "gaps": gaps,
    }


def _infer_title(
    topic_hint: str | None,
    instruction_language: str,
    gap_type: str | None,
) -> str:
    """Fallback title when the AI does not output a TITLE: line."""
    # Language-specific defaults keyed by (language, gap_type presence)
    _TITLED_DEFAULTS: dict[str, dict[str, str]] = {
        "russian": {
            "verb":   "Глаголы: вставьте пропущенные слова",
            "noun":   "Существительные: вставьте пропущенные слова",
            "":       "Вставьте пропущенные слова",
        },
        "italian": {
            "verb":   "Verbi: completa le frasi",
            "noun":   "Sostantivi: completa le frasi",
            "":       "Inserisci le parole mancanti",
        },
        "spanish": {
            "verb":   "Verbos: rellena los huecos",
            "noun":   "Sustantivos: rellena los huecos",
            "":       "Rellena los huecos",
        },
        "french": {
            "verb":   "Verbes: complétez les blancs",
            "":       "Complétez les blancs",
        },
        "german": {
            "verb":   "Verben: Lücken ausfüllen",
            "":       "Lücken ausfüllen",
        },
        "portuguese": {
            "":       "Preencha os espaços",
        },
    }

    lang = (instruction_language or "").lower()
    if lang in _TITLED_DEFAULTS:
        lang_map = _TITLED_DEFAULTS[lang]
        if gap_type:
            # Match on first word of gap_type (e.g. "Verbs only" → "verb")
            first_word = gap_type.lower().split()[0].rstrip("s")
            for key, val in lang_map.items():
                if key and first_word.startswith(key):
                    return val
        return lang_map.get("", list(lang_map.values())[-1])

    # English / auto — build a descriptive fallback from the topic hint
    if topic_hint:
        first = topic_hint.split(".")[0].strip()
        base = first[:60] if len(first) > 60 else first
        if gap_type:
            return f"{gap_type}: {base}"
        return base if base else "Fill in the Gaps"

    if gap_type:
        return f"Fill in the Gaps: {gap_type}"
    return "Fill in the Gaps"


# ══════════════════════════════════════════════════════════════════════════════
#  DRAG-TO-GAP — PHASE 1 (JSON path, kept for small exercises)
# ══════════════════════════════════════════════════════════════════════════════

def _build_drag_to_gap_prompt(
    unit_content: str,
    gap_count: int | None,
    content_language: str = "auto",
    instruction_language: str = "english",
    topic_hint: str | None = None,
    gap_type: str | None = None,
) -> str:
    """
    Build the LLM system+user prompt for drag-to-gap exercise generation
    (JSON output path — used for small exercises with gap_count < 4).

    The prompt enforces the exact DragToGapData JSON contract:
        { title, segments: [TextSeg | GapSeg], gaps: { gapId: answer } }
    """
    lang_block = ""
    if content_language and content_language != "auto":
        lang_block += (
            f"\n- The SOURCE CONTENT is written in {content_language.upper()}. "
            f"Every TextSeg \"value\" and every string in \"gaps\" MUST be in "
            f"{content_language.upper()} — not in any other language."
        )
    else:
        lang_block += (
            "\n- Match the primary language of the SOURCE CONTENT for all segment text "
            "and gap answers."
        )
    if instruction_language:
        lang_block += (
            f'\n- Write only the JSON "title" field in {instruction_language.upper()}; '
            "do not put that language into segments or gap answers."
        )

    hint_block = ""
    if topic_hint:
        hint_block = f"\nGENERATION DIRECTIVE (from teacher):\n{topic_hint}\n"

    # ── explicit sentence count ───────────────────────────────────────────────
    explicit_sentence_count: int | None = None
    if topic_hint:
        _m = re.search(
            r"\b(\d+)\b(?:\s+\w+){0,4}\s+sentences?\b",
            topic_hint,
            re.IGNORECASE,
        )
        if _m:
            explicit_sentence_count = int(_m.group(1))

    _gap_label = str(gap_count) if gap_count is not None else "3–8"
    _gap_ge4   = (gap_count is None) or (gap_count >= 4)

    if explicit_sentence_count is not None and gap_count is None:
        _gap_label = str(explicit_sentence_count)
        _gap_ge4   = True

    gap_type_block = ""
    if gap_type:
        gap_type_block = f"""
GAP TYPE CONSTRAINT  ← CRITICAL, ENFORCED BEFORE OUTPUT
--------------------------------------------------------
The teacher has specified: "{gap_type}"
EVERY SINGLE gap answer must belong to that word class.
If the gap type is "Verbs only":
  - Every answer must be a verb (infinitive, conjugated, or auxiliary+verb phrase).
  - COMPOUND TENSE RULE: bracket the ENTIRE verb phrase as ONE gap.
    ✓ gap = "will finish"  ✗ gap = "will" alone
"""

    if explicit_sentence_count is not None:
        sentence_rule = (
            f"PASSAGE LENGTH: Write EXACTLY {explicit_sentence_count} sentences. "
            f"Spread {_gap_label} gaps across all {explicit_sentence_count} sentences."
        )
    elif _gap_ge4:
        sentence_rule = (
            f"PASSAGE LENGTH: {_gap_label} gaps require AT LEAST 2 full sentences."
        )
    else:
        sentence_rule = "One clear sentence is sufficient."

    example_content = json.dumps(
        {
            "title": "Present Tense: Everyday Actions",
            "segments": [
                {"type": "text", "value": "In italiano il verbo "},
                {"type": "gap", "id": "g1"},
                {"type": "text", "value": " si usa per esprimere azione. La parola "},
                {"type": "gap", "id": "g2"},
                {"type": "text", "value": " significa 'casa'."},
            ],
            "gaps": {"g1": "essere", "g2": "casa"},
        },
        ensure_ascii=False,
        indent=2,
    )

    return f"""You are a strict JSON generator for language-learning exercises.
Output ONLY one JSON object. No markdown, no code fences, no commentary.

TASK: Create ONE drag-word-to-gap exercise with {
    f"exactly {gap_count} gaps" if gap_count is not None
    else "an appropriate number of gaps (3–8)"
}.
{lang_block}
{hint_block}{gap_type_block}
{sentence_rule}

OUTPUT CONTRACT (TypeScript shape):
  type TextSeg = {{ "type": "text"; "value": string }};
  type GapSeg  = {{ "type": "gap";  "id": string }};
  type DragToGapData = {{
    "title":    string;
    "segments": Array<TextSeg | GapSeg>;
    "gaps":     Record<string, string>;
  }};

RULES:
1. segments encodes the FULL passage in reading order.
2. Every TextSeg value must be non-empty.
3. Every GapSeg id must be unique; use "g1", "g2", "g3", ...
4. First and last segment SHOULD be TextSeg.
5. gaps contains exactly one key per GapSeg id.
6. Each answer is the exact word/phrase (≤4 words) — no extra whitespace.
7. ALL gap answers MUST be UNIQUE (case-insensitive). Hard constraint.
8. "title" must be SHORT (≤8 words), DESCRIPTIVE and topic-specific (e.g. "Past Tenses: Travel Vocabulary"). NEVER use generic titles like "Fill in the gaps".

EXAMPLE:
{example_content}

SOURCE CONTENT
--------------
\"\"\"{unit_content}\"\"\"

Return ONLY the JSON object. No markdown. No prose. No code fences."""


# ══════════════════════════════════════════════════════════════════════════════
#  JSON EXTRACTOR, REPAIR, VALIDATION
# ══════════════════════════════════════════════════════════════════════════════

def _extract_json_object(raw: str) -> str:
    """Strip markdown fences and extract the first top-level JSON object."""
    cleaned = re.sub(r"```(?:json)?", "", raw, flags=re.IGNORECASE).strip()
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if not match:
        logger.error("No JSON object found in model output:\n%s", raw[:500])
        raise ValueError(
            "Model did not return a JSON object. "
            f"Raw output (first 500 chars): {raw[:500]!r}"
        )
    json_text = match.group(0)
    json_text = re.sub(r",\s*(\])", r"\1", json_text)
    json_text = re.sub(r",\s*(\})", r"\1", json_text)
    return json_text


def _sanitize_json_control_chars(json_str: str) -> str:
    """Escape unescaped control characters (newline, carriage return, tab)
    that appear *inside* JSON string values.

    Ollama (and some other local models) sometimes emit literal newlines within
    a JSON string instead of the escaped ``\\n`` sequence.  This causes
    ``json.loads`` to fail with "Expecting ',' delimiter" because the parser
    thinks the string ended at the newline.

    The function walks the JSON character-by-character, tracking whether we are
    inside a string, and replaces any bare control character it finds there with
    its proper JSON escape sequence.  It is safe to call on already-valid JSON.
    """
    result: list[str] = []
    in_string = False
    escape_next = False

    for ch in json_str:
        if escape_next:
            result.append(ch)
            escape_next = False
            continue

        if ch == "\\" and in_string:
            result.append(ch)
            escape_next = True
            continue

        if ch == '"':
            in_string = not in_string
            result.append(ch)
            continue

        if in_string:
            if ch == "\n":
                result.append("\\n")
            elif ch == "\r":
                result.append("\\r")
            elif ch == "\t":
                result.append("\\t")
            else:
                result.append(ch)
        else:
            result.append(ch)

    return "".join(result)


def _robust_json_loads(raw: str) -> Any:
    """Parse JSON from a raw LLM response with progressive repair steps.

    1. Extract the first JSON object and strip trailing commas
       (via ``_extract_json_object``).
    2. Try ``json.loads`` directly.
    3. If that fails, sanitize unescaped control characters inside strings
       (via ``_sanitize_json_control_chars``) and retry.

    Raises ``json.JSONDecodeError`` only when all attempts are exhausted.
    """
    extracted = _extract_json_object(raw)
    try:
        return json.loads(extracted)
    except json.JSONDecodeError:
        sanitized = _sanitize_json_control_chars(extracted)
        return json.loads(sanitized)


def _repair_drag_to_gap(data: Any) -> dict:
    """
    Best-effort fix for common LLM mistakes before strict validation.

    Repairs applied
    ---------------
    * Wraps a bare list of segments in the expected dict shape.
    * Strips extra whitespace from gap answer values.
    * Converts numeric gap ids to string ("1" → "g1") if needed.
    * Removes gaps entries whose id is absent from segments.
    """
    if not isinstance(data, dict):
        raise ValueError(
            f"Expected a JSON object at the top level, got {type(data).__name__}: {data!r}"
        )

    if "title" not in data or not isinstance(data["title"], str):
        data["title"] = "Fill in the gaps"

    segments = data.get("segments")
    if not isinstance(segments, list):
        raise ValueError(f"'segments' must be a list, got {type(segments).__name__}.")

    repaired_segments = []
    for i, seg in enumerate(segments):
        if not isinstance(seg, dict):
            logger.warning("Skipping non-dict segment at index %d: %r", i, seg)
            continue

        seg_type = seg.get("type", "")

        if seg_type == "text":
            value = str(seg.get("value", "")).strip()
            if not value:
                logger.warning("Dropping empty text segment at index %d", i)
                continue
            repaired_segments.append({"type": "text", "value": value})

        elif seg_type == "gap":
            raw_id = seg.get("id", "")
            seg_id = str(raw_id).strip()
            if re.fullmatch(r"\d+", seg_id):
                seg_id = f"g{seg_id}"
            if not seg_id:
                seg_id = f"g{i + 1}"
            repaired_segments.append({"type": "gap", "id": seg_id})

        else:
            logger.warning("Unknown segment type %r at index %d — skipping.", seg_type, i)

    data["segments"] = repaired_segments

    gaps = data.get("gaps")
    if not isinstance(gaps, dict):
        data["gaps"] = {}
        gaps = data["gaps"]

    data["gaps"] = {k: str(v).strip() for k, v in gaps.items()}

    gap_ids_in_segments = {
        seg["id"] for seg in repaired_segments if seg.get("type") == "gap"
    }
    orphan_keys = set(data["gaps"]) - gap_ids_in_segments
    if orphan_keys:
        logger.warning("Removing orphan gap keys not in segments: %s", orphan_keys)
        for k in orphan_keys:
            del data["gaps"][k]

    return data


def _validate_drag_to_gap(
    data: Any,
    gap_count: int | None,
    explicit_sentence_count: int | None = None,
) -> None:
    """
    Raise ValueError if *data* does not satisfy the DragToGapData contract.

    When gap_count is None (auto mode), any count between 1 and 15 is accepted.

    Partial shortfalls (>= _PARTIAL_SUCCESS_THRESHOLD) are written into
    data["_sentence_count_warning"] / data["_partial_gap_warning"] so the
    caller can surface them to the user without failing the request.
    Hard shortfalls (< threshold) raise ValueError so the caller retries.
    """
    for key in ("title", "segments", "gaps"):
        if key not in data:
            raise ValueError(f"Missing required key: '{key}'.")

    title: str = data["title"]
    if not isinstance(title, str) or not title.strip():
        raise ValueError(f"'title' must be a non-empty string, got {title!r}.")

    segments: list = data["segments"]
    gaps: dict = data["gaps"]

    if not isinstance(segments, list) or not segments:
        raise ValueError("'segments' must be a non-empty list.")
    if not isinstance(gaps, dict):
        raise ValueError("'gaps' must be an object/dict.")

    gap_segs  = [s for s in segments if isinstance(s, dict) and s.get("type") == "gap"]
    text_segs = [s for s in segments if isinstance(s, dict) and s.get("type") == "text"]

    if not text_segs:
        raise ValueError("'segments' contains no TextSeg entries — the sentence is empty.")

    gap_ids_in_segs = [s["id"] for s in gap_segs]

    if len(gap_ids_in_segs) != len(set(gap_ids_in_segs)):
        dupes = [g for g in gap_ids_in_segs if gap_ids_in_segs.count(g) > 1]
        raise ValueError(f"Duplicate gap ids in segments: {list(set(dupes))}.")

    actual_gap_count = len(gap_segs)
    if gap_count is not None:
        if actual_gap_count != gap_count:
            ratio = actual_gap_count / gap_count if gap_count else 0
            if ratio < _PARTIAL_SUCCESS_THRESHOLD:
                raise ValueError(
                    f"Expected exactly {gap_count} gap segments, found {actual_gap_count} "
                    f"({ratio:.0%} — below {_PARTIAL_SUCCESS_THRESHOLD:.0%} threshold)."
                )
            # Partial success: attach warning, don't raise
            data["_partial_gap_warning"] = (
                f"Requested {gap_count} gaps but the model generated {actual_gap_count} "
                f"({ratio:.0%}). This is a model capacity limitation — "
                "please make another request to get the full exercise."
            )
            logger.warning(
                "drag_to_gap gap shortfall: requested %d, actual %d (%.0f%%). "
                "Saving partial result.",
                gap_count, actual_gap_count, ratio * 100,
            )
    else:
        if actual_gap_count < 1:
            raise ValueError("Auto mode: at least 1 gap segment is required.")
        if actual_gap_count > 15:
            raise ValueError(
                f"Auto mode: too many gaps ({actual_gap_count}). Maximum is 15."
            )

    # ── sentence count check (applies in both auto and fixed gap_count mode) ──
    if explicit_sentence_count is not None:
        all_text = " ".join(
            s.get("value", "") for s in segments if s.get("type") == "text"
        )
        found_sentences = len(re.findall(r"[.!?]+", all_text))
        if found_sentences < explicit_sentence_count:
            ratio = found_sentences / explicit_sentence_count
            if ratio < _PARTIAL_SUCCESS_THRESHOLD:
                raise ValueError(
                    f"Requested {explicit_sentence_count} sentences, "
                    f"found only ~{found_sentences} ({ratio:.0%} — "
                    f"below {_PARTIAL_SUCCESS_THRESHOLD:.0%} threshold)."
                )
            _sentence_warning = (
                f"Requested {explicit_sentence_count} sentences but the model generated "
                f"~{found_sentences} ({ratio:.0%}). This is a model capacity limitation — "
                "please make another request to get the full exercise."
            )
            logger.warning(
                "drag_to_gap sentence-count shortfall: %s", _sentence_warning
            )
            data["_sentence_count_warning"] = _sentence_warning

    missing = set(gap_ids_in_segs) - set(gaps)
    if missing:
        raise ValueError(
            f"Gap ids {sorted(missing)} appear in segments but have no entry in 'gaps'."
        )

    extra = set(gaps) - set(gap_ids_in_segs)
    if extra:
        raise ValueError(
            f"'gaps' contains keys {sorted(extra)} that are absent from segments."
        )

    for gid, answer in gaps.items():
        if not isinstance(answer, str) or not answer.strip():
            raise ValueError(
                f"Gap '{gid}' has an empty or non-string answer: {answer!r}."
            )

    # ── uniqueness check (scaled by gap count) ────────────────────────────────
    answer_values = [v.strip().lower() for v in gaps.values()]
    n = len(answer_values)
    max_occurrences = 1 if n <= 3 else (2 if n <= 7 else 3)
    dupes = [v for v in set(answer_values) if answer_values.count(v) > max_occurrences]
    if dupes:
        raise ValueError(
            f"Duplicate gap answers are not allowed. "
            f"Repeated: {dupes}. "
            f"With {n} gaps, each answer may appear at most {max_occurrences} time(s)."
        )

    logger.info(
        "drag_to_gap validation passed — %s gaps, %d segments, title=%r",
        actual_gap_count, len(segments), title,
    )


# ══════════════════════════════════════════════════════════════════════════════
#  PASSAGE-MODE VALIDATION (Phase 2 sanity check)
# ══════════════════════════════════════════════════════════════════════════════

def _validate_marked_passage(
    raw_text: str,
    gap_count: int | None,
    sentence_count: int | None,
) -> "str | None":
    """
    Lightweight validation of the Phase 1 plain-text output before parsing.

    Returns
    -------
    None   — perfect result, no shortfalls.
    str    — partial result (>= 40% of requested): the caller should surface
             this warning to the user but accept the exercise.

    Raises ValueError on hard failures:
    - No brackets found (model ignored the format entirely).
    - Gap or sentence count is < 40% of what was requested.
    - Duplicate gap answers (always a hard failure).
    """
    # Strip TITLE line if present before validation
    _title_re_v = re.compile(r"^TITLE:\s*.+?(?:\n|$)", re.IGNORECASE)
    _title_match_v = _title_re_v.match(raw_text.lstrip())
    validation_text = raw_text.lstrip()[_title_match_v.end():].lstrip("\n\r") if _title_match_v else raw_text

    markers = _MARKER_RE.findall(validation_text)
    if not markers:
        raise ValueError(
            "Model did not produce any [bracketed] gap markers. "
            f"Raw output: {raw_text[:300]!r}"
        )

    partial_warnings: list[str] = []

    # ── gap count check ───────────────────────────────────────────────────────
    if gap_count is not None and len(markers) != gap_count:
        ratio = len(markers) / gap_count
        if ratio < _PARTIAL_SUCCESS_THRESHOLD:
            raise ValueError(
                f"Expected {gap_count} gap markers, found only {len(markers)} "
                f"({ratio:.0%} of requested — below {_PARTIAL_SUCCESS_THRESHOLD:.0%} threshold). "
                "Retrying."
            )
        partial_warnings.append(
            f"Requested {gap_count} gaps but the model generated {len(markers)} "
            f"({ratio:.0%}). This is a model capacity limitation — "
            "please make another request to get the full exercise."
        )
        logger.warning(
            "Passage-mode gap shortfall: requested %d, found %d (%.0f%%). "
            "Accepting partial result.",
            gap_count, len(markers), ratio * 100,
        )

    # ── sentence count check ──────────────────────────────────────────────────
    if sentence_count is not None:
        found_sentences = len(re.findall(r"[.!?]+", validation_text))
        if found_sentences < sentence_count:
            ratio = found_sentences / sentence_count
            if ratio < _PARTIAL_SUCCESS_THRESHOLD:
                raise ValueError(
                    f"Requested {sentence_count} sentences, found only ~{found_sentences} "
                    f"({ratio:.0%} — below {_PARTIAL_SUCCESS_THRESHOLD:.0%} threshold). "
                    "Retrying."
                )
            partial_warnings.append(
                f"Requested {sentence_count} sentences but the model generated ~{found_sentences} "
                f"({ratio:.0%}). This is a model capacity limitation — "
                "please make another request to get the full exercise."
            )
            logger.warning(
                "Passage-mode sentence shortfall: requested %d, found ~%d (%.0f%%). "
                "Accepting partial result.",
                sentence_count, found_sentences, ratio * 100,
            )

    # ── uniqueness check (always a hard failure) ──────────────────────────────
    answers_lower = [m.strip().lower() for m in markers]
    seen: dict[str, int] = {}
    for a in answers_lower:
        seen[a] = seen.get(a, 0) + 1
    n = len(markers)
    max_occ = 1 if n <= 3 else (2 if n <= 7 else 3)
    dupes = [a for a, c in seen.items() if c > max_occ]
    if dupes:
        raise ValueError(
            f"Duplicate bracketed answers: {dupes}. All gap answers must be unique."
        )

    return " | ".join(partial_warnings) if partial_warnings else None


# ══════════════════════════════════════════════════════════════════════════════
#  PUBLIC API
# ══════════════════════════════════════════════════════════════════════════════

async def generate_drag_to_gap_from_unit_content(
    unit_content: str,
    gap_count: int | None = None,
    *,
    content_language: str = "auto",
    instruction_language: str = "english",
    topic_hint: str | None = None,
    gap_type: str | None = None,
    provider: AIProvider | None = None,
    max_retries: int = 2,
    **_ignored,  # absorb unrelated kwargs (e.g. pair_count from shared param builder)
) -> tuple[dict, dict]:
    """
    Generate one drag-to-gap exercise from *unit_content*.

    Automatically chooses between two generation strategies:

    PASSAGE MODE (gap_count >= 1 OR explicit sentence count in topic_hint)
        Phase 1: LLM emits a plain-text passage with [answer] markers — 3–4×
                 fewer output tokens than the full JSON path.
        Phase 2: Server parses markers into DragToGapData — zero LLM cost.
        This is now the default path for virtually all exercises.

    JSON MODE (only when gap_count is None and no explicit sentence count)
        Single LLM call that directly produces the DragToGapData JSON.
        Kept only for the rare case where neither gap_count nor a sentence
        count is supplied — i.e. fully auto-decided small exercises.

    Parameters
    ----------
    unit_content
        Assembled text from the unit (metadata + RAG chunks + transcripts).
    gap_count
        Number of word gaps to create, or None to let the AI decide (3–8).
    content_language
        Language the source content is written in ("auto" = let LLM infer).
    instruction_language
        Language for the exercise title only. Passage and gap answers always
        follow ``content_language`` (not this field).
    gap_type
        Optional word-class constraint: "Verbs only", "Nouns only", etc.
    provider
        Override the module-level default provider.
    max_retries
        How many additional LLM attempts to make on parse/validate failure.

    Returns
    -------
    (exercise_data, metadata)
        exercise_data : dict — validated DragToGapData
        metadata : dict      — traceability info

    Raises
    ------
    ValueError      — if generation fails after all retries.
    AIProviderError — if the underlying LLM provider is unreachable.
    """
    if not unit_content or not unit_content.strip():
        raise ValueError("unit_content must not be empty.")
    if gap_count is not None and gap_count < 1:
        raise ValueError("gap_count must be >= 1.")

    _provider = provider or _default_provider

    # ── extract gap count from topic_hint if not supplied by caller ──────────
    # e.g. "Create 8 gaps", "10 word gaps", "fill in 6 blanks"
    if gap_count is None and topic_hint:
        _gap_m = re.search(
            r"\b(\d+)\b(?:\s+\w+){0,3}\s+(?:gaps?|blanks?|spaces?)\b",
            topic_hint,
            re.IGNORECASE,
        )
        if _gap_m:
            gap_count = max(1, min(int(_gap_m.group(1)), 30))
            logger.info(
                "drag_to_gap: inferred gap_count=%d from topic_hint=%r",
                gap_count, topic_hint[:120],
            )

    # ── detect explicit sentence count from teacher hint ──────────────────────
    # Patterns matched (case-insensitive):
    #   "10 sentences"              → \b(\d+)\s+sentences?\b
    #   "10-sentence"               → \b(\d+)[- ]sentence\b
    #   "10 engaging sentences"     → \b(\d+)\s+\w+\s+sentences?\b
    #   "generate 10 ... sentences" → any words between digit and "sentences"
    explicit_sentence_count: int | None = None
    if topic_hint:
        _m = re.search(
            r"\b(\d+)\b(?:\s+\w+){0,4}\s+sentences?\b",
            topic_hint,
            re.IGNORECASE,
        )
        if _m:
            explicit_sentence_count = int(_m.group(1))
            logger.info(
                "drag_to_gap: detected explicit_sentence_count=%d from topic_hint=%r",
                explicit_sentence_count,
                topic_hint[:120],
            )
        else:
            logger.info(
                "drag_to_gap: no sentence count found in topic_hint=%r",
                topic_hint[:120],
            )

    # ── derive effective sentence count ───────────────────────────────────────
    # When the teacher hasn't specified a sentence count but HAS specified a
    # gap_count, we target exactly gap_count sentences (one gap per sentence).
    # This prevents the AI from writing e.g. 10 sentences for a 3-gap exercise,
    # which produces a confusingly sparse result.
    effective_sentence_count: int | None = explicit_sentence_count
    if effective_sentence_count is None and gap_count is not None:
        effective_sentence_count = gap_count
        logger.info(
            "drag_to_gap: derived effective_sentence_count=%d from gap_count "
            "(one gap per sentence — no explicit sentence count in topic_hint).",
            effective_sentence_count,
        )

    # ── short content: augment hint ───────────────────────────────────────────
    if len(unit_content.strip()) < 50:
        logger.warning(
            "drag_to_gap: unit_content is very short (%d chars). "
            "Model will generate freely from topic_hint.",
            len(unit_content.strip()),
        )
        _gap_type_note = (
            f"\nCRITICAL: gap_type='{gap_type}'. Every gap answer MUST be a {gap_type}."
        ) if gap_type else (
            "\nCRITICAL GAP DIVERSITY: For compound tenses gap the COMPLETE verb phrase "
            "(e.g. 'will finish', 'had left') — never the auxiliary alone."
        )
        _sent_note = (
            f"\nPASSAGE LENGTH: Write exactly {effective_sentence_count} sentences."
        ) if effective_sentence_count else (
            "\nPASSAGE LENGTH: Write AT LEAST 2 full sentences."
        )
        topic_hint = (topic_hint or "") + (
            "\nNOTE: Source material is minimal. Generate a GRAMMATICALLY CORRECT "
            "passage from scratch."
            + _gap_type_note
            + _sent_note
            + "\nDouble-check: no two gaps may have the same answer (case-insensitive)."
        )

    # ── decide strategy ───────────────────────────────────────────────────────
    use_passage_mode = (
        explicit_sentence_count is not None
        or gap_count is None
        or gap_count >= _PASSAGE_MODE_GAP_THRESHOLD
    )

    model_name = getattr(_provider, "model", type(_provider).__name__)
    strategy   = "passage" if use_passage_mode else "json"
    logger.info(
        "drag_to_gap strategy=%s gap_count=%s sentence_count=%s model=%s",
        strategy,
        gap_count if gap_count is not None else "auto",
        explicit_sentence_count if explicit_sentence_count is not None else "auto",
        model_name,
    )

    last_error: Exception | None = None
    last_raw:   str              = ""
    total_attempts = max_retries + 1

    # ── helper: build metadata dict ───────────────────────────────────────────
    def _make_metadata(
        m_name: str,
        strat: str,
        attempt_n: int,
        prompt_str: str,
        actual_gaps: int,
        all_warnings: "list[str]",
    ) -> dict:
        meta: dict = {
            "generation_model":     m_name,
            "generation_strategy":  strat,
            "generation_attempts":  attempt_n,
            "content_char_count":   len(unit_content),
            "prompt_char_count":    len(prompt_str),
            "raw_output_preview":   last_raw[:500],
            "content_language":     content_language,
            "instruction_language": instruction_language,
            "topic_hint":           topic_hint,
            "gap_type":             gap_type,
            "gap_count_requested":  gap_count if gap_count is not None else "auto",
            "gap_count_actual":     actual_gaps,
        }
        if all_warnings:
            meta["warning"] = " | ".join(all_warnings)
        return meta

    # ── helper: attempt one passage-mode generation ───────────────────────────
    async def _attempt_passage(
        prov: "AIProvider",
        m_name: str,
        attempt_n: int,
        total_n: int,
    ) -> "tuple[dict, dict] | None":
        """
        Try one passage-mode attempt on *prov*.
        Returns (data, metadata) on success/partial, None on hard failure.
        Sets nonlocal last_raw and last_error on failure.
        """
        nonlocal last_raw, last_error
        prompt = _build_passage_prompt(
            unit_content=unit_content,
            gap_count=gap_count,
            sentence_count=effective_sentence_count,  # derived: gap_count when no explicit
            content_language=content_language,
            instruction_language=instruction_language,
            topic_hint=topic_hint,
            gap_type=gap_type,
        )
        last_raw = await prov.agenerate(prompt)
        if attempt_n == 1:
            logger.debug("Passage-mode raw output (attempt %d):\n%.600s", attempt_n, last_raw)

        try:
            passage_warning = _validate_marked_passage(last_raw, gap_count, effective_sentence_count)

            title = _infer_title(topic_hint, instruction_language, gap_type)
            data  = _parse_marked_passage(last_raw.strip(), title)
            data  = _repair_drag_to_gap(data)
            _validate_drag_to_gap(data, gap_count, effective_sentence_count)

            actual_gaps = len([s for s in data["segments"] if s.get("type") == "gap"])
            all_warnings: list[str] = []
            if passage_warning:
                all_warnings.append(passage_warning)
            sentence_warning = data.pop("_sentence_count_warning", None)
            if sentence_warning:
                all_warnings.append(sentence_warning)
            gap_partial = data.pop("_partial_gap_warning", None)
            if gap_partial:
                all_warnings.append(gap_partial)

            metadata = _make_metadata(m_name, "passage", attempt_n, prompt, actual_gaps, all_warnings)
            logger.info(
                "drag_to_gap (passage-mode) succeeded attempt %d/%d — %d gaps%s.",
                attempt_n, total_n, actual_gaps,
                " [partial]" if all_warnings else "",
            )
            return data, metadata

        except (ValueError, json.JSONDecodeError) as exc:
            last_error = exc
            logger.warning(
                "Passage attempt %d/%d FAILED — %s\nRaw preview:\n%.400s",
                attempt_n, total_n, exc, last_raw,
            )
            return None

    # ── helper: attempt one JSON-mode generation ──────────────────────────────
    async def _attempt_json(
        prov: "AIProvider",
        m_name: str,
        attempt_n: int,
        total_n: int,
    ) -> "tuple[dict, dict] | None":
        nonlocal last_raw, last_error
        prompt = _build_drag_to_gap_prompt(
            unit_content=unit_content,
            gap_count=gap_count,
            content_language=content_language,
            instruction_language=instruction_language,
            topic_hint=topic_hint,
            gap_type=gap_type,
        )
        last_raw = await prov.agenerate(prompt)
        if attempt_n == 1:
            logger.debug("JSON-mode raw output (attempt %d):\n%.800s", attempt_n, last_raw)

        try:
            json_text = _extract_json_object(last_raw)
            data: Any = json.loads(json_text)
            data = _repair_drag_to_gap(data)
            _validate_drag_to_gap(data, gap_count, effective_sentence_count)

            actual_gaps = len([s for s in data.get("segments", []) if s.get("type") == "gap"])
            all_warnings: list[str] = []
            sentence_warning = data.pop("_sentence_count_warning", None)
            if sentence_warning:
                all_warnings.append(sentence_warning)
            gap_partial = data.pop("_partial_gap_warning", None)
            if gap_partial:
                all_warnings.append(gap_partial)

            metadata = _make_metadata(m_name, "json", attempt_n, prompt, actual_gaps, all_warnings)
            logger.info(
                "drag_to_gap (json-mode) succeeded attempt %d/%d — %d gaps validated.",
                attempt_n, total_n, actual_gaps,
            )
            return data, metadata

        except (ValueError, json.JSONDecodeError) as exc:
            last_error = exc
            logger.warning(
                "JSON attempt %d/%d FAILED — %s\nRaw output preview:\n%.600s",
                attempt_n, total_n, exc, last_raw,
            )
            return None

    # ═════════════════════════════════════════════════════════════════════════
    #  PRIMARY PROVIDER ATTEMPTS
    # ═════════════════════════════════════════════════════════════════════════
    for attempt in range(1, total_attempts + 1):
        logger.info(
            "drag_to_gap attempt %d/%d — strategy=%s model=%s",
            attempt, total_attempts, strategy, model_name,
        )

        if use_passage_mode:
            result = await _attempt_passage(_provider, model_name, attempt, total_attempts)
        else:
            result = await _attempt_json(_provider, model_name, attempt, total_attempts)

        if result is not None:
            return result

    # ═════════════════════════════════════════════════════════════════════════
    #  OLLAMA EXPLICIT FALLBACK
    #  Primary exhausted all retries — try Ollama up to 3 times.
    #  Even if all 3 Ollama attempts fail validation, return the last
    #  partial result rather than raising (best-effort delivery).
    # ═════════════════════════════════════════════════════════════════════════
    # Don't build a second Ollama if the primary IS already Ollama
    primary_is_ollama = "ollama" in type(_provider).__name__.lower() or (
        "ollama" in getattr(_provider, "model", "").lower()
    )

    if not primary_is_ollama:
        ollama_prov = _build_ollama_provider()
        if ollama_prov is not None:
            ollama_model = getattr(ollama_prov, "model", "ollama")
            logger.warning(
                "Primary provider (%s) exhausted all %d attempts. "
                "Switching to Ollama fallback (%s) for up to 3 attempts.",
                model_name, total_attempts, ollama_model,
            )

            ollama_last_data: "dict | None" = None
            ollama_last_meta: "dict | None" = None

            for ollama_attempt in range(1, 4):
                logger.info("Ollama fallback attempt %d/3", ollama_attempt)

                if use_passage_mode:
                    result = await _attempt_passage(ollama_prov, ollama_model, ollama_attempt, 3)
                else:
                    result = await _attempt_json(ollama_prov, ollama_model, ollama_attempt, 3)

                if result is not None:
                    # Clean success or partial success from Ollama
                    return result

                # Ollama failed — try to salvage whatever was in last_raw
                if last_raw and use_passage_mode:
                    try:
                        _title = _infer_title(topic_hint, instruction_language, gap_type)
                        _data  = _parse_marked_passage(last_raw.strip(), _title)
                        _data  = _repair_drag_to_gap(_data)
                        _actual = len([s for s in _data["segments"] if s.get("type") == "gap"])
                        if _actual >= 1:
                            ollama_last_data = _data
                            ollama_last_meta = {
                                "generation_model":     ollama_model,
                                "generation_strategy":  "passage",
                                "generation_attempts":  ollama_attempt,
                                "content_char_count":   len(unit_content),
                                "raw_output_preview":   last_raw[:500],
                                "gap_count_requested":  gap_count if gap_count is not None else "auto",
                                "gap_count_actual":     _actual,
                                "warning": (
                                    f"Validation failed on all Ollama attempts. "
                                    f"Returning best partial result ({_actual} gaps). "
                                    f"Last error: {last_error}"
                                ),
                            }
                    except Exception as salvage_exc:
                        logger.debug("Could not salvage Ollama raw output: %s", salvage_exc)

            # All 3 Ollama attempts done — return last salvaged result if any
            if ollama_last_data is not None:
                logger.warning(
                    "Ollama exhausted all 3 fallback attempts — "
                    "returning last partial result (%d gaps).",
                    ollama_last_meta.get("gap_count_actual", "?"),  # type: ignore[union-attr]
                )
                return ollama_last_data, ollama_last_meta  # type: ignore[return-value]

            logger.warning("Ollama fallback also failed with no salvageable output.")

    logger.error(
        "drag_to_gap EXHAUSTED all attempts (strategy=%s, primary=%s).\n"
        "Last error: %s\nLast raw output:\n%s",
        strategy, model_name, last_error, last_raw,
    )
    raise ValueError(
        f"drag_to_gap generation failed after all attempts "
        f"(strategy={strategy}). Last error: {last_error}"
    ) from last_error


 
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# type_word_in_gap
# ─────────────────────────────────────────────────────────────────────────────
# SAME data shape as drag_to_gap (DragToGapData: title + segments + gaps dict).
# The difference is purely in the front-end interaction (student types instead
# of dragging).  We reuse the drag_to_gap generator unchanged; the block is
# stored with kind="type_word_in_gap".
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 
async def generate_type_word_in_gap_from_unit_content(
    unit_content: str,
    gap_count: int | None = None,
    content_language: str = "auto",
    instruction_language: str = "english",
    topic_hint: str | None = None,
    gap_type: str | None = None,
    **_ignored,
) -> tuple[dict, dict]:
    """Reuses drag_to_gap generator — same data shape, different kind."""
    return await generate_drag_to_gap_from_unit_content(
        unit_content=unit_content,
        gap_count=gap_count,
        content_language=content_language,
        instruction_language=instruction_language,
        topic_hint=topic_hint,
        gap_type=gap_type,
    )
 
 
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# select_word_form
# ─────────────────────────────────────────────────────────────────────────────
# Data shape: SelectWordFormData
#   { title, segments: Segment[], gaps: Record<gapId, SelectWordFormGapConfig> }
#   SelectWordFormGapConfig: { options: string[], correctAnswers: string[] }
#
# Strategy: ask the LLM to generate a passage with [correct|distractor1|distractor2]
# markers.  Server parses them into the gap config.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 
import re
import uuid
 
def _parse_select_word_form_passage(
    passage: str,
    instruction_language: str,
) -> dict:
    """
    Parse AI output that looks like:

      TITLE: Present simple vs present continuous
      She [goes|go|went] to school every [day|days|daily].

    The optional ``TITLE:`` line on the first line is extracted as the exercise
    title.  If absent, a static fallback title is used.
    The first option inside [...] is always the correct answer.
    """
    # ── Extract AI-generated title from optional first line ───────────────────
    title = ""
    lines = passage.splitlines()
    if lines and lines[0].upper().startswith("TITLE:"):
        title = lines[0][6:].strip()
        passage = "\n".join(lines[1:]).strip()

    # ── Fallback static titles (used only when AI did not supply one) ─────────
    if not title:
        _FALLBACK_TITLES: dict[str, str] = {
            "russian":    "Выберите правильную форму",
            "italian":    "Scegli la forma corretta",
            "english":    "Select the correct form",
            "german":     "Wähle die richtige Form",
            "french":     "Choisissez la bonne forme",
            "spanish":    "Selecciona la forma correcta",
        }
        title = _FALLBACK_TITLES.get(instruction_language.lower(), "Select the correct form")

    segments: list[dict] = []
    gaps: dict[str, dict] = {}
    gap_counter = 0
    cursor = 0

    for m in re.finditer(r"\[([^\[\]]+)\]", passage):
        # Text before this match
        if m.start() > cursor:
            segments.append({"type": "text", "value": passage[cursor:m.start()]})

        options = [o.strip() for o in m.group(1).split("|") if o.strip()]
        if not options:
            cursor = m.end()
            continue

        gap_counter += 1
        gap_id = f"swf_g{gap_counter}_{uuid.uuid4().hex[:6]}"
        correct = options[0]  # first = correct answer
        import random
        shuffled = options[:]
        random.shuffle(shuffled)

        segments.append({"type": "gap", "id": gap_id})
        gaps[gap_id] = {
            "options": shuffled,
            "correctAnswers": [correct],
        }
        cursor = m.end()

    # Remaining text
    if cursor < len(passage):
        segments.append({"type": "text", "value": passage[cursor:]})

    if not gaps:
        raise ValueError("No [option|option] markers found in the generated passage.")

    return {"title": title, "segments": segments, "gaps": gaps}
 
 
async def generate_select_word_form_from_unit_content(
    unit_content: str,
    gap_count: int | None = None,
    content_language: str = "auto",
    instruction_language: str = "english",
    topic_hint: str | None = None,
    gap_type: str | None = None,
    provider=None,
    max_retries: int = 2,
    **_ignored,
) -> tuple[dict, dict]:
    """
    Generate a select-word-form exercise.

    The LLM produces a passage with [correct|distractor|distractor] markers.
    Server-side parsing builds the SelectWordFormData structure.

    Sentence-density fix: effective_sentence_count = effective_gaps so that
    every sentence contains exactly one gap — avoids AI writing 10 sentences
    for a 3-gap exercise (the same fix applied to drag_to_gap).
    """
    _provider = provider or _default_provider

    # ── resolve gap count ─────────────────────────────────────────────────────
    effective_gaps = gap_count or _extract_count_from_hint(topic_hint, default=6)

    # ── derive sentence count = gap count (1 gap per sentence) ───────────────
    # Without an explicit sentence constraint, the AI is free to write many
    # more sentences than there are gaps, producing a sparse, confusing exercise.
    effective_sentence_count = effective_gaps
    logger.info(
        "select_word_form: effective_gaps=%d, derived effective_sentence_count=%d",
        effective_gaps, effective_sentence_count,
    )

    # ── build prompt hints ────────────────────────────────────────────────────
    lang_hint = (
        f" The passage must be written in {content_language.upper()}."
        if content_language and content_language != "auto" else ""
    )
    gap_type_hint = f" Focus all gaps on: {gap_type}." if gap_type else ""
    topic_str = f"\n\nTeacher directive: {topic_hint}" if topic_hint else ""
    title_lang_hint = (
        f" Write the TITLE in {instruction_language.upper()}."
        if instruction_language and instruction_language.lower() not in ("auto", "")
        else ""
    )

    system_prompt = (
        "You are an expert language-exercise designer. "
        "Your output must be exactly two parts: a TITLE line followed by the exercise passage."
    )
    user_prompt = (
        f"Create a select-word-form exercise with EXACTLY {effective_gaps} word-choice gaps "
        f"and EXACTLY {effective_sentence_count} sentences.\n"
        f"Format each gap as [CORRECT|wrong1|wrong2] where the FIRST word is the correct answer "
        f"and the others are plausible distractors. Use 2–3 real words per gap.{lang_hint}{gap_type_hint}\n\n"
        "SENTENCE DENSITY RULE (CRITICAL): The passage must contain EXACTLY "
        f"{effective_sentence_count} sentences. "
        "EVERY sentence must contain at least one [word|choice|gap] marker — "
        "a sentence with no gap marker is NOT allowed.\n\n"
        "CRITICAL: Replace CORRECT, wrong1, wrong2 with actual words from the language being practised. "
        "NEVER output the literal words 'correct_answer', 'distractor1', 'distractor2', 'CORRECT', 'wrong1', or 'wrong2'.\n\n"
        "OUTPUT FORMAT — strictly two parts, nothing else:\n"
        f"TITLE: <short descriptive title reflecting the grammar/vocabulary topic>{title_lang_hint}\n"
        "<the passage with [...|...] gap markers>\n\n"
        "EXAMPLE output for 3 gaps / 3 sentences (do not copy — write content for your topic):\n"
        "TITLE: Past simple vs present simple\n"
        "Yesterday, she [went|go|goes] to the market early in the morning.\n"
        "She [bought|buys|buy] some fresh vegetables and a bag of rice.\n"
        "Every weekend she [visits|visited|visit] her grandmother in the village.\n\n"
        f"Source material:\n{unit_content[:3000]}{topic_str}\n\n"
        "Rules:\n"
        "- The TITLE must be specific and descriptive (NOT generic like 'Select the correct form').\n"
        "- Every word inside [...] must be a real word from the language being practised.\n"
        f"- The passage must have EXACTLY {effective_sentence_count} sentences, each with one gap.\n"
        "- Output ONLY the TITLE line followed by the passage — no intro, no extra explanation."
    )

    prompt = f"{system_prompt}\n\n{user_prompt}"

    # Words that indicate the LLM echoed back our prompt placeholders
    _PLACEHOLDER_LITERALS = {"correct_answer", "distractor1", "distractor2", "correct", "wrong1", "wrong2"}

    def _contains_placeholders(data: dict) -> bool:
        for gap_config in data.get("gaps", {}).values():
            for opt in gap_config.get("options", []):
                if opt.strip().lower() in _PLACEHOLDER_LITERALS:
                    return True
            for ans in gap_config.get("correctAnswers", []):
                if ans.strip().lower() in _PLACEHOLDER_LITERALS:
                    return True
        return False

    def _validate_gap_count(data: dict, expected: int) -> str | None:
        """
        Check that the actual number of parsed gaps is close enough to *expected*.
        Returns a warning string on partial success, raises ValueError on hard failure.
        """
        actual = len(data.get("gaps", {}))
        if actual == expected:
            return None
        ratio = actual / expected if expected else 0
        if ratio < _PARTIAL_SUCCESS_THRESHOLD:
            raise ValueError(
                f"Expected {expected} gaps, found only {actual} "
                f"({ratio:.0%} — below {_PARTIAL_SUCCESS_THRESHOLD:.0%} threshold). Retrying."
            )
        return (
            f"Requested {expected} gaps but the model generated {actual} "
            f"({ratio:.0%}). This is a model capacity limitation — "
            "please make another request to get the full exercise."
        )

    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            raw = await _provider.agenerate(prompt)
            data = _parse_select_word_form_passage(raw.strip(), instruction_language)

            if _contains_placeholders(data):
                raise ValueError(
                    "LLM echoed prompt placeholders (e.g. 'correct_answer') instead of real words. "
                    "Retrying."
                )

            gap_warning = _validate_gap_count(data, effective_gaps)

            actual_gaps = len(data.get("gaps", {}))
            metadata: dict = {
                "generation_model":     getattr(_provider, "model", "unknown"),
                "generation_attempts":  attempt + 1,
                "exercise_type":        "select_word_form",
                "gap_count_requested":  effective_gaps,
                "gap_count_actual":     actual_gaps,
                "sentence_count_target": effective_sentence_count,
                "content_language":     content_language,
                "instruction_language": instruction_language,
            }
            if gap_warning:
                metadata["warning"] = gap_warning
                logger.warning("select_word_form gap shortfall (attempt %d): %s", attempt + 1, gap_warning)

            logger.info(
                "select_word_form succeeded attempt %d/%d — %d gaps%s.",
                attempt + 1, max_retries + 1, actual_gaps,
                " [partial]" if gap_warning else "",
            )
            return data, metadata

        except (ValueError, Exception) as exc:
            last_exc = exc
            logger.warning("select_word_form attempt %d/%d failed: %s", attempt + 1, max_retries + 1, exc)

    raise ValueError(
        f"select_word_form generation failed after {max_retries + 1} attempts: {last_exc}"
    )
 
 
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# match_pairs
# ─────────────────────────────────────────────━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Data shape (MatchingPairsDraft-compatible):
#   { title, left_items: [{id,text}], right_items: [{id,text}], pairs: [{left_id,right_id}] }
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 
def _parse_match_pairs_json(raw: str) -> dict:
    """Parse LLM JSON output into match_pairs data structure."""
    import json as _json
    cleaned = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
    data = _json.loads(cleaned)
 
    # Normalise: ensure ids exist
    left_items  = []
    right_items = []
    pairs       = []
 
    for i, pair in enumerate(data.get("pairs", []), 1):
        lid = f"l_{i}"
        rid = f"r_{i}"
        left_items.append({"id": lid, "text": str(pair.get("left", ""))})
        right_items.append({"id": rid, "text": str(pair.get("right", ""))})
        pairs.append({"left_id": lid, "right_id": rid})

    if not pairs:
        raise ValueError("No pairs found in LLM output.")

    # Break row-by-row alignment with the LLM list order so students cannot trivially match by index
    random.shuffle(left_items)
    random.shuffle(right_items)

    return {
        "title":       str(data.get("title", "")).strip(),
        "left_items":  left_items,
        "right_items": right_items,
        "pairs":       pairs,
    }
 
 
async def generate_match_pairs_from_unit_content(
    unit_content: str,
    pair_count: int | None = None,
    content_language: str = "auto",
    instruction_language: str = "english",
    topic_hint: str | None = None,
    provider=None,
    max_retries: int = 2,
    **_ignored,
) -> tuple[dict, dict]:
    _provider = provider or _default_provider
    # Honour an explicit number in the teacher's topic hint (e.g. "Match 5 italian
    # words") before falling back to pair_count and then the hard-coded default.
    effective_pairs = pair_count or _extract_count_from_hint(topic_hint, default=6)
    lang_hint = f" Pairs must be in {content_language}." if content_language != "auto" else ""
    topic_str = f"\n\nTeacher directive: {topic_hint}" if topic_hint else ""
 
    fallback_titles = {
        "russian": "Соотнесите пары",
        "italian": "Abbina le coppie",
        "english": "Match the pairs",
        "german":  "Ordne die Paare zu",
        "french":  "Associez les paires",
        "spanish": "Empareja las parejas",
    }
    fallback_title = fallback_titles.get(instruction_language.lower(), "Match the pairs")
 
    system_prompt = (
        "You are a language-exercise designer. "
        "Respond ONLY with valid JSON — no markdown, no explanation."
    )
    user_prompt = (
        f"Create a match-pairs exercise with exactly {effective_pairs} pairs.{lang_hint}\n"
        f"Source material:\n{unit_content[:3000]}{topic_str}\n\n"
        "Rules:\n"
        "- The top-level \"title\" must be a SHORT, DESCRIPTIVE exercise name that reflects the topic.\n"
        "- Do NOT use generic titles like 'Match the pairs'.\n"
        "- Pairs must be clearly related and derived from the source material.\n\n"
        "Respond with this JSON structure (no extra keys):\n"
        "{\n"
        '  "title": "<descriptive exercise title>",\n'
        '  "pairs": [\n'
        '    {"left": "term or phrase", "right": "definition or translation"},\n'
        "    ...\n"
        "  ]\n"
        "}"
    )
 
    prompt = f"{system_prompt}\n\n{user_prompt}"

    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            raw = await _provider.agenerate(prompt)
            data = _parse_match_pairs_json(raw)
            data["title"] = str(data.get("title", "")).strip() or fallback_title
            metadata = {
                "generation_model":    getattr(_provider, "model", "unknown"),
                "generation_attempts": attempt + 1,
                "exercise_type":       "match_pairs",
            }
            return data, metadata
        except Exception as exc:
            last_exc = exc
            logger.warning("match_pairs attempt %d failed: %s", attempt + 1, exc)

    raise ValueError(f"match_pairs generation failed after {max_retries + 1} attempts: {last_exc}")
 
 
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# build_sentence
# ─────────────────────────━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Returned data includes title, sentences (preview / legacy), plus question +
# payload ordering_words shapes matching the manual editor save format.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def _ordering_words_from_build_sentence_rows(
    title: str,
    sentence_rows: list[dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, Any]]:
    """
    Maps raw LLM sentence rows (words / shuffled / sentence) to the same
    `question` + `payload` shape the manual editor saves — see BuildSentenceEditorPage.
    """
    # Collects token objects and per-sentence slot groups for the ordering_words UI
    tokens_out: list[dict[str, str]] = []
    # Parallel lists of token ids belonging to each sentence line
    sentence_groups: list[list[str]] = []

    for s_idx, sent in enumerate(sentence_rows):
        # Word list in correct reading order (same order as manual build_sentence save)
        words = sent.get("words") or []
        group_ids: list[str] = []
        for w_idx, word in enumerate(words):
            # Stable ids so placements match correct_order (mirrors frontend tok_sIdx_wIdx)
            tok_id = f"tok_{s_idx}_{w_idx}"
            tokens_out.append({"id": tok_id, "text": str(word)})
            group_ids.append(tok_id)
        sentence_groups.append(group_ids)

    # Flat list of ids in correct order for grading and drag targets
    correct_order = [t["id"] for t in tokens_out]

    # Scrambles the word-bank order per sentence line while keeping correct_order for slots/grading
    token_by_id: dict[str, dict[str, str]] = {t["id"]: t for t in tokens_out}
    scrambled_tokens: list[dict[str, str]] = []
    for group_ids in sentence_groups:
        row_tokens = [token_by_id[tid] for tid in group_ids if tid in token_by_id]
        random.shuffle(row_tokens)
        scrambled_tokens.extend(row_tokens)
    tokens_out = scrambled_tokens

    # In-memory draft shape consumed by BuildSentenceBlock / QuestionEditorRenderer
    question: dict[str, Any] = {
        "type": "ordering_words",
        "prompt": title,
        "tokens": tokens_out,
        "correct_order": correct_order,
        "score": 1,
        "metadata": {"sentence_groups": sentence_groups},
    }

    # Mirrors frontend draftToApiPayload(ordering_words) for API parity
    payload: dict[str, Any] = {
        "type": "ordering_words",
        "prompt_rich": title,
        "points": 1,
        "autograde": True,
        "tokens": tokens_out,
        "correct_order": correct_order,
        "punctuation_mode": "tokenized",
        "metadata": {"sentence_groups": sentence_groups},
    }
    return question, payload


async def generate_build_sentence_from_unit_content(
    unit_content: str,
    pair_count: int | None = None,  # reuse pair_count as sentence count
    content_language: str = "auto",
    instruction_language: str = "english",
    topic_hint: str | None = None,
    provider=None,
    max_retries: int = 2,
    **_ignored,
) -> tuple[dict, dict]:
    _provider = provider or _default_provider

    # ── Parse sentence count and optional word count from the teacher hint ──
    sentence_count = pair_count or _extract_count_from_hint(topic_hint, default=5)
    min_words, max_words = _extract_word_count_from_hint(topic_hint)

    lang_hint = f" Sentences must be in {content_language}." if content_language != "auto" else ""
    topic_str = f"\n\nTeacher directive: {topic_hint}" if topic_hint else ""

    # Build word-length constraint clause for the prompt
    if min_words is not None and max_words is not None and min_words == max_words:
        word_constraint = f" Each sentence must be exactly {min_words} words long."
    elif min_words is not None and max_words is not None:
        word_constraint = f" Each sentence must be {min_words}–{max_words} words long."
    elif min_words is not None:
        word_constraint = f" Each sentence must be at least {min_words} words long."
    elif max_words is not None:
        word_constraint = f" Each sentence must be no more than {max_words} words long."
    else:
        word_constraint = ""

    fallback_titles = {
        "russian": "Составьте предложения",
        "italian": "Costruisci le frasi",
        "english": "Build the sentences",
        "german":  "Bilde die Sätze",
        "french":  "Construisez les phrases",
        "spanish": "Construye las frases",
    }
    fallback_title = fallback_titles.get(instruction_language.lower(), "Build the sentences")

    system_prompt = (
        "You are a language-exercise designer. "
        "Respond ONLY with valid JSON — no markdown, no explanation."
    )
    user_prompt = (
        f"Create a build-sentence exercise with EXACTLY {sentence_count} sentence(s).{lang_hint}{word_constraint}\n"
        f"Source material:\n{unit_content[:3000]}{topic_str}\n\n"
        "Rules:\n"
        f"- The \"sentences\" array MUST contain EXACTLY {sentence_count} item(s). No more, no fewer.\n"
        "- The top-level \"title\" must be a SHORT, DESCRIPTIVE exercise name that reflects this content.\n"
        "- Do NOT use generic titles like 'Build the sentences'.\n\n"
        "Respond with this JSON structure:\n"
        "{\n"
        '  "title": "<descriptive exercise title>",\n'
        '  "sentences": [\n'
        '    "First complete sentence here.",\n'
        "    ...\n"
        "  ]\n"
        "}"
    )

    prompt = f"{system_prompt}\n\n{user_prompt}"

    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            import json as _json
            raw = await _provider.agenerate(prompt)
            cleaned = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
            parsed  = _json.loads(cleaned)

            raw_sentences = parsed.get("sentences", [])

            if not raw_sentences:
                raise ValueError("No sentences in LLM output.")

            # Enforce sentence count: truncate if the model returned too many,
            # reject and retry if it returned too few.
            if len(raw_sentences) > sentence_count:
                logger.warning(
                    "build_sentence: model returned %d sentences, expected %d — truncating.",
                    len(raw_sentences), sentence_count,
                )
                raw_sentences = raw_sentences[:sentence_count]
            elif len(raw_sentences) < sentence_count:
                raise ValueError(
                    f"build_sentence: model returned {len(raw_sentences)} sentences, "
                    f"expected {sentence_count}."
                )

            sentences_out = []
            for i, sent in enumerate(raw_sentences, 1):
                words = str(sent).split()
                shuffled = words[:]
                random.shuffle(shuffled)
                sentences_out.append({
                    "id":       f"bs_{i}",
                    "words":    words,
                    "shuffled": shuffled,
                    "sentence": str(sent),
                })

            resolved_title = str(parsed.get("title", "")).strip() or fallback_title
            question, payload = _ordering_words_from_build_sentence_rows(
                resolved_title,
                sentences_out,
            )
            data = {
                "title":     resolved_title,
                "sentences": sentences_out,
                "question":  question,
                "payload":   payload,
            }
            metadata = {
                "generation_model":    getattr(_provider, "model", "unknown"),
                "generation_attempts": attempt + 1,
                "exercise_type":       "build_sentence",
            }
            return data, metadata
        except Exception as exc:
            last_exc = exc
            logger.warning("build_sentence attempt %d failed: %s", attempt + 1, exc)

    raise ValueError(f"build_sentence generation failed after {max_retries + 1} attempts: {last_exc}")
 
 
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# order_paragraphs
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 
async def generate_order_paragraphs_from_unit_content(
    unit_content: str,
    pair_count: int | None = None,
    content_language: str = "auto",
    instruction_language: str = "english",
    topic_hint: str | None = None,
    provider=None,
    max_retries: int = 2,
    **_ignored,
) -> tuple[dict, dict]:
    _provider = provider or _default_provider
    para_count = pair_count or _extract_count_from_hint(topic_hint, default=4)
    lang_hint = f" Paragraphs must be in {content_language}." if content_language != "auto" else ""
    topic_str  = f"\n\nTeacher directive: {topic_hint}" if topic_hint else ""
 
    fallback_titles = {
        "russian": "Расставьте абзацы по порядку",
        "italian": "Metti i paragrafi nell'ordine corretto",
        "english": "Put the paragraphs in order",
        "german":  "Bringe die Absätze in die richtige Reihenfolge",
        "french":  "Mettez les paragraphes dans l'ordre",
        "spanish": "Ordena los párrafos",
    }
    fallback_title = fallback_titles.get(instruction_language.lower(), "Put the paragraphs in order")
 
    system_prompt = "You are a language-exercise designer. Respond ONLY with valid JSON. Each JSON string value must be on one line — never include literal newline characters inside a string."
    user_prompt = (
        f"Create an order-paragraphs exercise with exactly {para_count} short paragraphs (2–4 sentences each).{lang_hint}\n"
        f"Source material:\n{unit_content[:3000]}{topic_str}\n\n"
        "Rules:\n"
        "- The top-level \"title\" must be a SHORT, DESCRIPTIVE exercise name based on the source content.\n"
        "- Do NOT use generic titles like 'Put the paragraphs in order'.\n"
        "- Each paragraph string must be a single JSON string on one line. Separate sentences with a space, not a newline.\n"
        "- Output ONLY the JSON object below — no explanation, no markdown fences.\n\n"
        "Respond with this JSON:\n"
        "{\n"
        '  "title": "<descriptive exercise title>",\n'
        '  "paragraphs": ["First sentence. Second sentence.", "Next paragraph text.", ...]\n'
        "}"
    )
 
    prompt = f"{system_prompt}\n\n{user_prompt}"

    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            raw = await _provider.agenerate(prompt)

            # _robust_json_loads applies three repair steps in order:
            #   1. _extract_json_object – strips markdown fences, locates the
            #      first {...} block, removes trailing commas in arrays/objects.
            #   2. json.loads – fast path for well-formed output.
            #   3. _sanitize_json_control_chars + json.loads – handles the most
            #      common Ollama failure: literal newlines inside string values
            #      (paragraphs span multiple sentences) produce the
            #      "Expecting ',' delimiter" error at the first bare \n.
            parsed = _robust_json_loads(raw)

            paragraphs = [str(p) for p in parsed.get("paragraphs", []) if str(p).strip()]
            if not paragraphs:
                raise ValueError("No paragraphs in LLM output.")

            items = [
                {"id": f"op_{i}", "text": p, "correct_order": i}
                for i, p in enumerate(paragraphs, 1)
            ]

            data = {
                "title":    str(parsed.get("title", "")).strip() or fallback_title,
                "items":    items,
                "shuffled": [p["id"] for p in random.sample(items, len(items))],
            }
            metadata = {
                "generation_model":    getattr(_provider, "model", "unknown"),
                "generation_attempts": attempt + 1,
                "exercise_type":       "order_paragraphs",
            }
            return data, metadata
        except Exception as exc:
            last_exc = exc
            logger.warning("order_paragraphs attempt %d failed: %s", attempt + 1, exc)

    raise ValueError(f"order_paragraphs generation failed after {max_retries + 1} attempts: {last_exc}")
 
 
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# sort_into_columns
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def generate_sort_into_columns_from_unit_content(
    unit_content: str,
    pair_count: int | None = None,
    content_language: str = "auto",
    instruction_language: str = "english",
    topic_hint: str | None = None,
    provider=None,
    max_retries: int = 2,
    **_ignored,
) -> tuple[dict, dict]:
    """
    Generate a sort-into-columns exercise.

    The AI produces 2–4 named columns, each containing a list of words/phrases
    that belong to that category.  The frontend (SortIntoColumnsEditorPage /
    applyGeneratedBlock) expects this shape:

        {
          "title": "...",          ← now AI-generated, descriptive
          "columns": [
            { "title": "Column A", "words": ["word1", "word2", ...] },
            { "title": "Column B", "words": ["word3", "word4", ...] },
            ...
          ]
        }

    Words per column default to ~4.  pair_count is reused as words-per-column
    so callers can tune density with the same parameter.
    """
    _provider = provider or _default_provider
    words_per_col = pair_count or _extract_count_from_hint(topic_hint, default=4)

    # ── Parse column count from topic_hint ────────────────────────────────────
    # Teacher can write "Generate 10 columns", "make 5 columns", "6 columns", etc.
    column_count: int = 3  # sensible default
    if topic_hint:
        _col_match = re.search(r"\b(\d+)\s*col(?:umns?)?", topic_hint, re.IGNORECASE)
        if _col_match:
            column_count = max(2, min(int(_col_match.group(1)), 15))  # clamp 2–15

    # Build a directive block that surfaces the teacher's full instruction prominently
    directive_block = ""
    if topic_hint:
        directive_block = (
            f"\n\nCRITICAL TEACHER DIRECTIVE (must be followed exactly):\n"
            f"  {topic_hint}\n"
            f"This directive overrides any default rules about column count or content."
        )

    lang_hint = ""
    if content_language != "auto":
        lang_hint = f" All column titles and words must be in {content_language}."

    # Fallback title used ONLY if the model omits the field entirely.
    fallback_titles = {
        "russian":   "Распределите слова по колонкам",
        "italian":   "Ordina le parole nelle colonne",
        "english":   "Sort into columns",
        "german":    "Sortiere in Spalten",
        "french":    "Classez dans les colonnes",
        "spanish":   "Ordena en columnas",
        "ukrainian": "Розподіліть слова по колонках",
        "polish":    "Posortuj do kolumn",
    }
    fallback_title = fallback_titles.get(instruction_language.lower(), "Sort into columns")

    system_prompt = (
        "You are a language-exercise designer. "
        "Respond ONLY with valid JSON — no markdown, no explanation, no code fences."
    )
    user_prompt = (
        f"Create a sort-into-columns vocabulary exercise with exactly {column_count} columns.{lang_hint}\n"
        f"Each column must have a clear thematic title and exactly {words_per_col} words or short phrases.\n"
        f"Source material:\n{unit_content[:3000]}{directive_block}\n\n"
        "Rules:\n"
        f"- You MUST produce exactly {column_count} columns — no more, no fewer.\n"
        "- Each column must have a UNIQUE thematic title that reflects the teacher directive above.\n"
        "- Words must unambiguously belong to their column — avoid overlap.\n"
        "- Words should be vocabulary items (nouns, verbs, adjectives) or short phrases, "
        "not full sentences.\n"
        "- Do NOT number the words.\n"
        "- If the teacher directive specifies different tenses, grammar topics, or categories for "
        "each column, follow that specification strictly — each column title and its words must "
        "reflect the requested tense or category.\n"
        "- The top-level \"title\" must be a SHORT, DESCRIPTIVE name for this specific exercise "
        "(e.g. 'English Tenses: From Past to Future' or 'Kitchen Vocabulary by Category'). "
        "Do NOT use generic placeholders like 'Sort into columns' — make it reflect the actual "
        "topic and column categories.\n\n"
        f"Respond with this exact JSON structure (must have exactly {column_count} column objects):\n"
        "{\n"
        '  "title": "<descriptive exercise title>",\n'
        '  "columns": [\n'
        '    { "title": "Category A", "words": ["word1", "word2", "word3", "word4"] },\n'
        '    { "title": "Category B", "words": ["word5", "word6", "word7", "word8"] },\n'
        f'    ... (repeat for all {column_count} columns)\n'
        '  ]\n'
        "}"
    )

    prompt = f"{system_prompt}\n\n{user_prompt}"

    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            import json as _json
            raw = await _provider.agenerate(prompt)
            cleaned = raw.strip()
            if cleaned.startswith("```"):
                cleaned = re.sub(r"^```[a-zA-Z]*\n?", "", cleaned)
                cleaned = re.sub(r"\n?```$", "", cleaned).strip()

            parsed = _json.loads(cleaned)

            columns_raw = parsed.get("columns", [])
            if not isinstance(columns_raw, list) or len(columns_raw) < 2:
                raise ValueError(f"Expected ≥2 columns, got {len(columns_raw)}")
            # Warn (but don't fail) if the model produced fewer columns than requested
            if len(columns_raw) < column_count:
                logger.warning(
                    "sort_into_columns: requested %d columns but model produced %d",
                    column_count,
                    len(columns_raw),
                )

            columns = []
            for col in columns_raw:
                col_title = str(col.get("title", "")).strip()
                words = [str(w).strip() for w in col.get("words", []) if str(w).strip()]
                if not col_title or not words:
                    raise ValueError(f"Column missing title or words: {col}")
                columns.append({"title": col_title, "words": words})

            # Use AI-generated title; fall back to generic only if absent
            exercise_title = str(parsed.get("title", "")).strip() or fallback_title

            data = {
                "title":   exercise_title,
                "columns": columns,
            }
            metadata = {
                "generation_model":    getattr(_provider, "model", "unknown"),
                "generation_attempts": attempt + 1,
                "exercise_type":       "sort_into_columns",
            }
            return data, metadata

        except Exception as exc:
            last_exc = exc
            logger.warning("sort_into_columns attempt %d failed: %s", attempt + 1, exc)

    raise ValueError(
        f"sort_into_columns generation failed after {max_retries + 1} attempts: {last_exc}"
    )
 
 # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# drag_word_to_image
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def generate_drag_word_to_image_from_unit_content(
    unit_content: str,
    pair_count: int | None = None,
    content_language: str = "auto",
    instruction_language: str = "english",
    topic_hint: str | None = None,
    provider=None,
    max_retries: int = 2,
    **_ignored,
) -> tuple[dict, dict]:
    """
    Generate a drag-word-to-image exercise.

    AI produces vocabulary word + short image description pairs.
    imageUrl is left empty ("") — the teacher uploads images afterwards
    in the editor, the same way they do when creating the exercise manually.

    Output shape (matches DragToImageData in DragWordToImageEditorPage.tsx):
        {
          "title": "...",
          "cards": [
            { "id": "dti_1", "imageUrl": "", "answer": "word" },
            ...
          ]
        }
    """
    _provider = provider or _default_provider
    card_count = pair_count or _extract_count_from_hint(topic_hint, default=5)
    lang_hint = f" Words must be in {content_language}." if content_language != "auto" else ""
    topic_str = f"\n\nTeacher directive: {topic_hint}" if topic_hint else ""

    fallback_titles = {
        "russian": "Перенесите слово к изображению",
        "italian": "Trascina la parola sull'immagine giusta",
        "english": "Drag the word to the correct image",
        "german":  "Ziehe das Wort zum richtigen Bild",
        "french":  "Faites glisser le mot vers l'image correcte",
        "spanish": "Arrastra la palabra a la imagen correcta",
    }
    fallback_title = fallback_titles.get(instruction_language.lower(), "Drag the word to the correct image")

    system_prompt = (
        "You are a language-exercise designer. "
        "Respond ONLY with valid JSON — no markdown, no explanation."
    )
    user_prompt = (
        f"Create a drag-word-to-image vocabulary exercise with exactly {card_count} items.{lang_hint}\n"
        f"Source material:\n{unit_content[:3000]}{topic_str}\n\n"
        "Rules:\n"
        "- The top-level \"title\" must be a SHORT, DESCRIPTIVE exercise name reflecting the vocabulary theme.\n"
        "- Do NOT use generic titles like 'Drag the word to the correct image'.\n\n"
        "For each item provide:\n"
        '  - "answer": the vocabulary word or short phrase the student drags (target language)\n'
        '  - "description": a brief English image description so the teacher knows what photo to upload\n\n'
        "Respond with this JSON structure:\n"
        "{\n"
        '  "title": "<descriptive exercise title>",\n'
        '  "items": [\n'
        '    {"answer": "apple", "description": "a red apple on a white background"},\n'
        "    ...\n"
        "  ]\n"
        "}"
    )

    prompt = f"{system_prompt}\n\n{user_prompt}"

    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            import json as _json
            raw = await _provider.agenerate(prompt)
            cleaned = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
            parsed = _json.loads(cleaned)

            items = parsed.get("items", [])
            if not items:
                raise ValueError("No items in LLM output.")

            cards = [
                {
                    "id":          f"dti_{i}",
                    "imageUrl":    "",          # teacher uploads images in editor
                    "answer":      str(item.get("answer", "")).strip(),
                    "description": str(item.get("description", "")).strip(),
                }
                for i, item in enumerate(items, 1)
                if str(item.get("answer", "")).strip()
            ]

            if not cards:
                raise ValueError("All generated items had empty answers.")

            data = {
                "title": str(parsed.get("title", "")).strip() or fallback_title,
                "cards": cards,
            }
            metadata = {
                "generation_model":    getattr(_provider, "model", "unknown"),
                "generation_attempts": attempt + 1,
                "exercise_type":       "drag_word_to_image",
                "note": (
                    "imageUrl fields are empty — teacher uploads images in the editor. "
                    "description fields are hints for which photo to use."
                ),
            }
            return data, metadata
        except Exception as exc:
            last_exc = exc
            logger.warning("drag_word_to_image attempt %d failed: %s", attempt + 1, exc)

    raise ValueError(
        f"drag_word_to_image generation failed after {max_retries + 1} attempts: {last_exc}"
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# select_form_to_image
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def generate_select_form_to_image_from_unit_content(
    unit_content: str,
    pair_count: int | None = None,
    content_language: str = "auto",
    instruction_language: str = "english",
    topic_hint: str | None = None,
    provider=None,
    max_retries: int = 2,
    **_ignored,
) -> tuple[dict, dict]:
    """
    Generate a select-form-to-image exercise.

    AI produces image-card prompts where each card has:
      - one or more correct answers
      - option list used in the dropdown under each image

    imageUrl is left empty ("") so the teacher can upload images afterwards.
    """
    # Stores the active AI provider instance for generation calls.
    _provider = provider or _default_provider
    # Stores the desired number of cards, inferred from pair_count or hint text.
    card_count = pair_count or _extract_count_from_hint(topic_hint, default=5)
    # Stores optional language instruction when caller requests explicit language.
    lang_hint = f" All words must be in {content_language}." if content_language != "auto" else ""
    # Stores optional teacher directive appended to the prompt.
    topic_str = f"\n\nTeacher directive: {topic_hint}" if topic_hint else ""

    # Stores fallback localized instruction title used when model omits title.
    fallback_titles = {
        "russian": "Выберите правильную форму по изображению",
        "italian": "Scegli la forma corretta per ogni immagine",
        "english": "Select the correct form for each image",
        "german": "Wähle die richtige Form für jedes Bild",
        "french": "Choisissez la bonne forme pour chaque image",
        "spanish": "Selecciona la forma correcta para cada imagen",
    }
    # Stores the final fallback title for unsupported instruction languages.
    fallback_title = fallback_titles.get(
        instruction_language.lower(),
        "Select the correct form for each image",
    )

    # Stores a strict system instruction that forces JSON-only output.
    system_prompt = (
        "You are a language-exercise designer. "
        "Respond ONLY with valid JSON — no markdown, no explanation."
    )
    # Stores the full user prompt describing schema and quality constraints.
    user_prompt = (
        f"Create a select-form-to-image vocabulary exercise with exactly {card_count} items.{lang_hint}\n"
        f"Source material:\n{unit_content[:3000]}{topic_str}\n\n"
        "Rules:\n"
        "- The top-level \"title\" must be a SHORT, DESCRIPTIVE exercise name.\n"
        "- Do NOT use generic titles like 'Select the correct form for each image'.\n"
        "- Each item must include a concise image description in English.\n"
        "- Each item must include one correct word form and at least 2 distractors.\n"
        "- Distractors must be plausible but incorrect for that image.\n\n"
        "Respond with this JSON structure:\n"
        "{\n"
        '  "title": "<descriptive exercise title>",\n'
        '  "items": [\n'
        '    {\n'
        '      "answer": "buono",\n'
        '      "distractors": ["buona", "buoni"],\n'
        '      "description": "a single masculine noun context image"\n'
        "    }\n"
        "  ]\n"
        "}"
    )
    # Stores the final prompt passed to the model.
    prompt = f"{system_prompt}\n\n{user_prompt}"

    # Stores the last generation/parsing error across retry attempts.
    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            import json as _json
            # Stores raw model output before sanitization.
            raw = await _provider.agenerate(prompt)
            # Stores cleaned model output suitable for JSON parsing.
            cleaned = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
            # Stores parsed JSON object returned by the model.
            parsed = _json.loads(cleaned)

            # Stores unvalidated raw item list returned by the model.
            items = parsed.get("items", [])
            if not items:
                raise ValueError("No items in LLM output.")

            # Stores intermediate normalized cards before option backfilling.
            cards: list[dict] = []
            for i, item in enumerate(items, 1):
                # Stores trimmed primary correct answer for the current card.
                answer = str(item.get("answer", "")).strip()
                if not answer:
                    continue
                # Stores cleaned and de-duplicated distractors excluding the answer.
                distractors = [
                    str(v).strip()
                    for v in item.get("distractors", [])
                    if str(v).strip() and str(v).strip().lower() != answer.lower()
                ]
                # Stores option list with answer first to guarantee presence.
                options = [answer] + [d for d in dict.fromkeys(distractors)]
                cards.append(
                    {
                        "id": f"sfi_{i}",
                        "imageUrl": "",
                        "options": options,
                        "answers": [answer],
                        "description": str(item.get("description", "")).strip(),
                    }
                )

            if not cards:
                raise ValueError("All generated items had empty answers.")

            # Stores answer pool used to backfill missing distractors.
            answer_pool = [str(card["answers"][0]) for card in cards if card.get("answers")]
            for card in cards:
                # Stores current option list for in-place completion.
                opts = list(card.get("options", []))
                if len(opts) >= 2:
                    card["options"] = opts
                    continue
                for candidate in answer_pool:
                    if candidate.lower() == str(card["answers"][0]).lower():
                        continue
                    if candidate in opts:
                        continue
                    opts.append(candidate)
                    if len(opts) >= 3:
                        break
                card["options"] = opts

            # Stores final exercise payload consumed by SelectFormToImage editor.
            data = {
                "title": str(parsed.get("title", "")).strip() or fallback_title,
                "cards": cards,
            }
            # Stores tracing metadata for diagnostics and UX hints.
            metadata = {
                "generation_model": getattr(_provider, "model", "unknown"),
                "generation_attempts": attempt + 1,
                "exercise_type": "select_form_to_image",
                "note": (
                    "imageUrl fields are empty — teacher uploads images in the editor. "
                    "description fields are hints for which photo to use."
                ),
            }
            return data, metadata
        except Exception as exc:
            last_exc = exc
            logger.warning("select_form_to_image attempt %d failed: %s", attempt + 1, exc)

    raise ValueError(
        f"select_form_to_image generation failed after {max_retries + 1} attempts: {last_exc}"
    )
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# test_without_timer  (also used for test_with_timer — timer is set in editor)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _looks_like_question(text: str) -> bool:
    """
    Return True if *text* looks like a genuine question prompt rather than
    a bare answer sentence.

    Heuristics (any one is sufficient):
      • ends with a question mark
      • starts with an interrogative word (who / what / which / when / …)
      • contains a fill-in-the-blank marker (___  or  ***)
      • contains a typical MCQ stem phrase
    """
    t = text.strip().lower()
    if t.endswith("?"):
        return True
    interrogatives = (
        "what ", "which ", "who ", "when ", "where ", "why ", "how ",
        "choose ", "select ", "identify ", "find ", "pick ",
        "какой", "какая", "какое", "какие", "что ", "кто ", "где ",
        "wähle", "welche", "welcher", "welches",
        "quelle", "quel ", "qui ", "quand ",
        "quale", "quali", "chi ", "quando ",
        "cuál", "cuáles", "quién", "cuándo",
    )
    if any(t.startswith(w) for w in interrogatives):
        return True
    blank_markers = ("___", "***", "...", "____")
    if any(m in t for m in blank_markers):
        return True
    stem_phrases = (
        "correct form", "correct sentence", "correct option", "correct answer",
        "fill in", "complete the", "choose the", "select the", "identify the",
        "правильн", "правильный", "выберите", "заполните",
    )
    if any(p in t for p in stem_phrases):
        return True
    return False


def _prompt_duplicates_correct_option(
    prompt_text: str, options: list[dict], correct_index: int
) -> bool:
    """
    Return True when the model confused the correct answer with the question
    (i.e. prompt == options[correct_index].text).  This is the main failure
    mode observed with llama3.2.
    """
    if not options or correct_index >= len(options):
        return False
    correct_text = options[correct_index].get("text", "").strip().lower()
    return prompt_text.strip().lower() == correct_text


async def generate_test_without_timer_from_unit_content(
    unit_content: str,
    pair_count: int | None = None,
    content_language: str = "auto",
    instruction_language: str = "english",
    topic_hint: str | None = None,
    provider=None,
    max_retries: int = 2,
    **_ignored,
) -> tuple[dict, dict]:
    """
    Generate a multiple-choice test exercise (test_without_timer / test_with_timer).

    Output shape consumed by TestWithoutTimerEditorPage.tsx → applyGeneratedBlock():
        {
          "title": "...",
          "questions": [
            {
              "prompt": "Which sentence uses the past simple correctly?",
              "options": [
                {"text": "She goes to school yesterday."},
                {"text": "She went to school yesterday."},
                {"text": "She is going to school yesterday."},
                {"text": "She had going to school yesterday."}
              ],
              "correct_index": 1    ← 0-based index into options[]
            },
            ...
          ]
        }

    The frontend converts `correct_index` → `correct_option_ids` internally
    (see aiQuestionToTestQuestion in TestWithoutTimerEditorPage.tsx).

    Common failure mode with smaller models (llama3.2):
        The model echoes the correct answer sentence as the "prompt" instead of
        writing a genuine question.  We guard against this with:
          1. A much clearer prompt with a concrete two-field worked example.
          2. Post-processing validation via _looks_like_question() and
             _prompt_duplicates_correct_option(), which reject or flag bad items.
          3. Auto-retry on the same attempt if too many questions are malformed.
    """
    _provider = provider or _default_provider
    question_count = pair_count or _extract_count_from_hint(topic_hint, default=5)  # pair_count reused as question count
    topic_str = f"\n\nTeacher directive: {topic_hint}" if topic_hint else ""

    lang_hint = ""
    if content_language != "auto":
        lang_hint = (
            f" All 'prompt' fields and all option 'text' fields MUST be written "
            f"in {content_language}."
        )

    fallback_titles = {
        "russian":   "Тест",
        "italian":   "Test",
        "english":   "Test",
        "german":    "Test",
        "french":    "Test",
        "spanish":   "Test",
        "ukrainian": "Тест",
        "polish":    "Test",
    }
    fallback_title = fallback_titles.get(instruction_language.lower(), "Test")

    # ── Prompt design notes ────────────────────────────────────────────────────
    # The critical fix is in the worked example and the explicit warning.
    # Smaller models (llama3.2) tend to put the correct-answer sentence in
    # "prompt" because that is what they see first in the question block.
    # We now:
    #   • show a complete worked example where prompt is clearly a QUESTION
    #   • add an explicit "DO NOT" rule about copying options into prompt
    #   • demonstrate that correct_index is a 0-based integer, not the answer
    # ──────────────────────────────────────────────────────────────────────────
    system_prompt = (
        "You are a language-exercise designer. "
        "Respond ONLY with valid JSON — no markdown, no explanation, no code fences."
    )
    user_prompt = (
        f"Create a multiple-choice language test with exactly {question_count} questions "
        f"based on the source material below.{lang_hint}\n"
        f"Source material:\n{unit_content[:3000]}{topic_str}\n\n"
        "STRICT RULES — read carefully:\n"
        "1. The 'prompt' field MUST be a QUESTION that the student has to answer "
        "(e.g. 'Which sentence uses the past simple correctly?' or "
        "'What is the correct form of the verb?'). "
        "DO NOT copy any option text into 'prompt'. "
        "DO NOT put a sentence from the options into 'prompt'.\n"
        "2. Each question must have exactly 4 answer options.\n"
        "3. Exactly ONE option must be correct; the others are plausible distractors "
        "that reflect common grammar/vocabulary mistakes.\n"
        "4. 'correct_index' is the 0-based position of the correct option in the "
        "'options' array (0 = first, 1 = second, 2 = third, 3 = fourth).\n"
        "5. Vary correct_index across questions — do NOT always use 0.\n\n"
        "6. The top-level 'title' must be a SHORT, DESCRIPTIVE exercise name based on the source material.\n"
        "   Do NOT use generic titles like 'Test'.\n\n"
        "WORKED EXAMPLE (follow this pattern exactly):\n"
        "{\n"
        '  "title": "Past Simple: Choose the Correct Form",\n'
        '  "questions": [\n'
        '    {\n'
        '      "prompt": "Which sentence uses the past simple correctly?",\n'
        '      "options": [\n'
        '        {"text": "She go to school yesterday."},\n'
        '        {"text": "She gone to school yesterday."},\n'
        '        {"text": "She went to school yesterday."},\n'
        '        {"text": "She is going to school yesterday."}\n'
        '      ],\n'
        '      "correct_index": 2\n'
        '    },\n'
        '    {\n'
        '      "prompt": "Choose the correct past simple form of \'have\'.",\n'
        '      "options": [\n'
        '        {"text": "haved"},\n'
        '        {"text": "had"},\n'
        '        {"text": "have had"},\n'
        '        {"text": "having"}\n'
        '      ],\n'
        '      "correct_index": 1\n'
        '    }\n'
        '  ]\n'
        "}\n\n"
        f"Now generate exactly {question_count} questions following the same structure."
    )

    prompt = f"{system_prompt}\n\n{user_prompt}"

    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            import json as _json
            raw = await _provider.agenerate(prompt)
            cleaned = raw.strip()

            # Strip markdown fences if the model ignores the instruction
            if cleaned.startswith("```"):
                cleaned = re.sub(r"^```[a-zA-Z]*\n?", "", cleaned)
                cleaned = re.sub(r"\n?```$", "", cleaned).strip()

            # Some models wrap the JSON in extra text — try to extract
            # the outermost {...} block if top-level parse fails.
            try:
                parsed = _json.loads(cleaned)
            except _json.JSONDecodeError:
                m = re.search(r"\{.*\}", cleaned, re.DOTALL)
                if m:
                    parsed = _json.loads(m.group())
                else:
                    raise

            raw_questions = parsed.get("questions", [])
            if not raw_questions:
                raise ValueError("No questions in LLM output.")

            questions: list[dict] = []
            malformed_count = 0

            for q in raw_questions:
                # ── Extract prompt text ────────────────────────────────────
                prompt_text = str(
                    q.get("prompt", q.get("question", q.get("stem", "")))
                ).strip()

                # ── Extract options ────────────────────────────────────────
                options_raw = q.get("options", q.get("choices", q.get("answers", [])))
                options_text: list[str] = []
                for o in options_raw:
                    if isinstance(o, dict):
                        text = str(
                            o.get("text", o.get("value", o.get("label", "")))
                        ).strip()
                    else:
                        text = str(o).strip()
                    if text:
                        options_text.append(text)

                # ── Extract and clamp correct_index ────────────────────────
                correct_index = int(q.get("correct_index", q.get("answer_index", 0)))
                correct_index = max(0, min(correct_index, len(options_text) - 1))

                # For structural validation we still need the raw list
                options_for_validation = [{"text": t} for t in options_text]

                # ── Structural validation ──────────────────────────────────
                if not prompt_text or len(options_text) < 2:
                    malformed_count += 1
                    logger.debug(
                        "test_without_timer: skipping question with missing "
                        "prompt or < 2 options: %r", q
                    )
                    continue

                # ── Semantic validation (the main bug guard) ───────────────
                # Reject questions where the model copied the correct answer
                # into the prompt field instead of writing an actual question.
                if _prompt_duplicates_correct_option(prompt_text, options_for_validation, correct_index):
                    malformed_count += 1
                    logger.warning(
                        "test_without_timer: prompt is identical to correct option — "
                        "model confused answer with question. prompt=%r", prompt_text
                    )
                    continue

                # Warn (but keep) if prompt doesn't look like a question —
                # some question styles (fill-in-the-blank with ___) are valid
                # even without a "?" so we don't hard-reject them.
                if not _looks_like_question(prompt_text):
                    logger.warning(
                        "test_without_timer: prompt may not be a real question: %r",
                        prompt_text,
                    )

                # ── Server-side shuffle ────────────────────────────────────
                # LLMs tend to place the correct answer first regardless of
                # the "vary correct_index" instruction.  We shuffle the options
                # here so the correct position is uniformly random, then
                # re-assign stable "opt_N" ids AFTER shuffling so that
                # correct_option_ids always points to the right answer.
                correct_text = options_text[correct_index]
                shuffled_texts = options_text[:]
                random.shuffle(shuffled_texts)
                # Ensure the shuffled result differs from original when possible
                if len(shuffled_texts) > 1 and shuffled_texts == options_text:
                    # swap first two elements to break the tie
                    shuffled_texts[0], shuffled_texts[1] = shuffled_texts[1], shuffled_texts[0]
                new_correct_index = shuffled_texts.index(correct_text)

                # Build options list with stable ids for the frontend QuestionDraft format
                options = [{"id": f"opt_{i}", "text": t} for i, t in enumerate(shuffled_texts)]

                # Save in QuestionDraft format expected by TestWithoutTimerBlock /
                # TestWithTimerBlock on the frontend.  Each option carries a stable
                # "opt_N" id so the renderer can build correct_option_ids references.
                questions.append({
                    "type":              "multiple_choice",
                    "prompt":            prompt_text,
                    "options":           options,
                    "correct_option_ids": [f"opt_{new_correct_index}"],
                })

            if not questions:
                raise ValueError(
                    f"All {len(raw_questions)} generated questions were malformed "
                    f"(malformed_count={malformed_count}). "
                    "Likely the model put the correct answer into the 'prompt' field."
                )

            data = {
                "title":     str(parsed.get("title", "")).strip() or fallback_title,
                "questions": questions,
            }
            metadata = {
                "generation_model":    getattr(_provider, "model", "unknown"),
                "generation_attempts": attempt + 1,
                "exercise_type":       "test_without_timer",
                "question_count":      len(questions),
                "malformed_skipped":   malformed_count,
            }
            return data, metadata

        except Exception as exc:
            last_exc = exc
            logger.warning("test_without_timer attempt %d failed: %s", attempt + 1, exc)

    raise ValueError(
        f"test_without_timer generation failed after {max_retries + 1} attempts: {last_exc}"
    )

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# true_false
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 
async def generate_true_false_from_unit_content(
    unit_content: str,
    pair_count: int | None = None,        # reused as statement count
    content_language: str = "auto",
    instruction_language: str = "english",
    topic_hint: str | None = None,
    provider=None,
    max_retries: int = 2,
    **_ignored,
) -> tuple[dict, dict]:
    """
    Generate a True / False exercise.
 
    Output shape (matches what TrueFalseEditorPage.handleGenerated expects):
        {
          "title": "...",
          "questions": [
            { "prompt": "statement text", "correct_answer": true },
            ...
          ]
        }
 
    Frontend converts these into TrueFalseDraft objects via aiQuestionToTrueFalseQuestion.
    """
    _provider = provider or _default_provider
    statement_count = pair_count or _extract_count_from_hint(topic_hint, default=6)
    topic_str = f"\n\nTeacher directive: {topic_hint}" if topic_hint else ""
 
    lang_hint = ""
    if content_language != "auto":
        lang_hint = f" Statements must be in {content_language}."
 
    fallback_titles = {
        "russian":   "Верно / Неверно",
        "italian":   "Vero / Falso",
        "english":   "True / False",
        "german":    "Wahr / Falsch",
        "french":    "Vrai / Faux",
        "spanish":   "Verdadero / Falso",
        "ukrainian": "Правда / Брехня",
        "polish":    "Prawda / Fałsz",
    }
    fallback_title = fallback_titles.get(instruction_language.lower(), "True / False")
 
    system_prompt = (
        "You are a language-exercise designer. "
        "Respond ONLY with valid JSON — no markdown, no explanation, no code fences."
    )
    user_prompt = (
        f"Create a True/False exercise with exactly {statement_count} statements.{lang_hint}\n"
        f"Source material:\n{unit_content[:3000]}{topic_str}\n\n"
        "Rules:\n"
        "- Each statement must be a clear, unambiguous declarative sentence.\n"
        "- Approximately half should be true and half false.\n"
        "- False statements should contain a plausible but incorrect detail from the material.\n"
        "- Avoid trick questions or double negatives.\n"
        "- Use the source material language for statements unless directed otherwise.\n\n"
        "- The top-level \"title\" must be a SHORT, DESCRIPTIVE exercise name tied to the topic.\n"
        "- Do NOT use generic titles like 'True / False'.\n\n"
        "Respond with this exact JSON structure:\n"
        "{\n"
        '  "title": "<descriptive exercise title>",\n'
        '  "questions": [\n'
        '    { "prompt": "statement text here", "correct_answer": true },\n'
        '    { "prompt": "statement text here", "correct_answer": false }\n'
        '  ]\n'
        "}"
    )
 
    prompt = f"{system_prompt}\n\n{user_prompt}"
 
    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            import json as _json
            raw = await _provider.agenerate(prompt)
            cleaned = raw.strip()
            if cleaned.startswith("```"):
                cleaned = re.sub(r"^```[a-zA-Z]*\n?", "", cleaned)
                cleaned = re.sub(r"\n?```$", "", cleaned).strip()
 
            parsed = _json.loads(cleaned)
 
            raw_questions = parsed.get("questions", parsed.get("statements", []))
            if not raw_questions:
                raise ValueError("No questions/statements in LLM output.")
 
            questions = []
            for q in raw_questions:
                prompt_text = str(
                    q.get("prompt", q.get("statement", q.get("question", "")))
                ).strip()
                raw_answer = q.get("correct_answer", q.get("answer", q.get("is_true", True)))
                is_true = (
                    raw_answer
                    if isinstance(raw_answer, bool)
                    else str(raw_answer).lower() == "true"
                )
                if not prompt_text:
                    continue
                questions.append({"prompt": prompt_text, "correct_answer": is_true})
 
            if not questions:
                raise ValueError("All generated statements were malformed.")
 
            data = {
                "title":     str(parsed.get("title", "")).strip() or fallback_title,
                "questions": questions,
            }
            metadata = {
                "generation_model":    getattr(_provider, "model", "unknown"),
                "generation_attempts": attempt + 1,
                "exercise_type":       "true_false",
                "question_count":      len(questions),
            }
            return data, metadata
 
        except Exception as exc:
            last_exc = exc
            logger.warning("true_false attempt %d failed: %s", attempt + 1, exc)
 
    raise ValueError(
        f"true_false generation failed after {max_retries + 1} attempts: {last_exc}"
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# text — Markdown reading / grammar explanation (TextBlock in the lesson player)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


async def generate_reading_text_from_unit_content(
    unit_content: str,
    content_language: str = "auto",
    instruction_language: str = "english",
    topic_hint: str | None = None,
    difficulty: str | None = None,
    provider=None,
    max_retries: int = 2,
    **_ignored,
) -> tuple[dict, dict]:
    """
    Produce a teacher-facing Markdown block for ``TextBlock.tsx``.

    Returns data keys aligned with the frontend ``TextBlockData`` shape:
    ``title``, ``content`` (Markdown string), and ``format: "markdown"``.
    """
    _provider = provider or _default_provider
    topic_str = f"\n\nTeacher focus: {topic_hint}" if topic_hint else ""
    lang_rule = ""
    if content_language != "auto":
        lang_rule = f" Write the main body in {content_language}."
    # Helps when the authoring UI is localized; student-facing copy still follows content_language.
    teacher_title_hint = ""
    if instruction_language.lower() not in ("english", "auto"):
        teacher_title_hint = (
            f"\nThe \"title\" should be clear for teachers using {instruction_language} in the UI."
        )
    # Stores a normalized teacher-selected difficulty instruction for prompt control.
    difficulty_hint = ""
    if difficulty and str(difficulty).strip():
        difficulty_hint = f"\nDifficulty level: {str(difficulty).strip()}."

    system_prompt = (
        "You are an expert language teacher. "
        "Respond ONLY with valid JSON — no markdown fences, no commentary."
    )
    user_prompt = (
        "Create an engaging reading passage or grammar explanation for a digital lesson. "
        "Ground it in the source material; add brief examples only when the material supports them."
        f"{lang_rule}{difficulty_hint}\n\n"
        f"Source material:\n{unit_content[:6000]}{topic_str}\n\n"
        "Respond with JSON containing exactly:\n"
        '  \"title\": a short, specific section title (max 80 characters) tied to the topic;\n'
        '  \"content\": one string in Markdown using ## for the main heading (### for subheadings '
        "if needed), **bold** and *italic* for key terms, and bullet lists (- item) where helpful. "
        "Use short paragraphs (2–5 sentences). Target roughly 150–450 words unless the source is very short.\n"
        "Do not wrap the JSON in ``` code fences."
        f"{teacher_title_hint}"
    )

    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            raw = await _provider.agenerate(f"{system_prompt}\n\n{user_prompt}")
            cleaned = raw.strip()
            if cleaned.startswith("```"):
                cleaned = re.sub(r"^```[a-zA-Z]*\n?", "", cleaned)
                cleaned = re.sub(r"\n?```$", "", cleaned).strip()

            parsed = json.loads(cleaned)
            title = str(parsed.get("title", "")).strip()
            content = str(parsed.get("content", "")).strip()
            if not content:
                raise ValueError("Empty content in LLM output.")
            if not title:
                title = "Reading"

            data = {
                "title": title,
                "content": content,
                "format": "markdown",
            }
            metadata = {
                "generation_model": getattr(_provider, "model", "unknown"),
                "generation_attempts": attempt + 1,
                "exercise_type": "text",
                "difficulty": difficulty,
            }
            return data, metadata

        except Exception as exc:
            last_exc = exc
            logger.warning("text block attempt %d failed: %s", attempt + 1, exc)

    raise ValueError(
        f"text generation failed after {max_retries + 1} attempts: {last_exc}"
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# image — HuggingFace Inference API when HF_API_KEY is set, else SVG (LLM) fallback
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def _markdown_bullets_for_image_prompt(content: str, max_bullets: int = 3) -> list[str]:
    """
    Extract short bullet/heading lines from Markdown for ImagePromptBuilder.

    Mirrors the bullet-extraction strategy in unit_generator.UnitGeneratorService.
    """
    _md_emphasis = re.compile(r"[*_`]{1,3}")
    _md_heading = re.compile(r"^#{1,6}\s+")
    _md_bullet = re.compile(r"^[-*•]\s+")
    _md_numbered = re.compile(r"^\d+[.)]\s+")

    def clean(text: str) -> str:
        text = _md_emphasis.sub("", text).strip()
        return text[:80].rstrip()

    bullets: list[str] = []
    headings: list[str] = []
    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if _md_bullet.match(line) or _md_numbered.match(line):
            candidate = clean(_md_bullet.sub("", _md_numbered.sub("", line)))
            if candidate and len(candidate) > 3:
                bullets.append(candidate)
        elif _md_heading.match(line):
            candidate = clean(_md_heading.sub("", line))
            if candidate and len(candidate) > 3:
                headings.append(candidate)

    result = bullets[:4]
    if len(result) < max_bullets:
        for h in headings:
            if h not in result:
                result.append(h)
            if len(result) >= max_bullets:
                break
    if not result and content.strip():
        first = content.strip().split("\n")[0].strip()
        if first:
            result = [clean(first)[:120]]
    return (result[:max_bullets] if result else ["language learning concept"])


async def generate_image_block_from_unit_content(
    unit_content: str,
    content_language: str = "auto",
    instruction_language: str = "english",
    topic_hint: str | None = None,
    provider=None,
    max_retries: int = 2,
    **_ignored,
) -> tuple[dict, dict]:
    """
    Build an image block using the same provider chain as unit generation:

    HuggingFaceImageProvider when ``HF_API_KEY`` is set, otherwise SVGImageProvider
    (LLM SVG) via the default text provider.
    """
    del max_retries, provider  # Signature parity with other generators; unused here.

    slide_title = (topic_hint or "").strip().split("\n")[0][:120] or "Educational illustration"
    bullets = _markdown_bullets_for_image_prompt(unit_content or "")
    if topic_hint and topic_hint.strip():
        hint_line = topic_hint.strip().split("\n")[0].strip()
        if hint_line and hint_line not in bullets:
            bullets = [hint_line[:80]] + bullets
    bullets = bullets[:3] or ["key vocabulary and grammar concept"]

    deck_topic = (topic_hint or "").strip()[:200] or "Lesson illustration"
    audience_lang = content_language if content_language != "auto" else "the lesson language"

    img_prompt = ImagePromptBuilder.build(
        slide_title=slide_title,
        bullet_points=bullets,
        topic=deck_topic,
        audience=f"{audience_lang} learner",
        style="educational, flat illustration, clean background",
    )

    hf_key = os.environ.get("HF_API_KEY", "")
    img_provider = None
    if hf_key:
        try:
            from app.services.ai.image_providers.huggingface_provider import (
                HuggingFaceImageProvider,
            )

            img_provider = HuggingFaceImageProvider(
                api_key=hf_key,
                width=512,
                height=384,
            )
        except Exception as exc:
            logger.warning(
                "image block: HuggingFace init failed, falling back to SVG: %s",
                exc,
            )
            img_provider = None
    if img_provider is None:
        from app.services.ai.image_providers.svg_provider import SVGImageProvider

        img_provider = SVGImageProvider(ai_provider=_default_provider)

    style = "educational, flat illustration, clean background"
    alt = f"Educational illustration for: {slide_title}"
    img_result = await img_provider.agenerate_image(
        prompt=img_prompt,
        alt_text=alt,
        style=style,
    )

    caption = slide_title[:200] if slide_title else None
    data = {
        "src": img_result.as_data_uri(),
        "alt_text": img_result.alt_text or alt,
        "title": caption,
    }
    model_label = getattr(img_provider, "model", None) or type(img_provider).__name__
    metadata = {
        "generation_model": str(model_label),
        "generation_attempts": 1,
        "exercise_type": "image",
        "image_source": img_result.source,
        "instruction_language": instruction_language,
    }
    return data, metadata


async def generate_image_stacked_from_unit_content(
    unit_content: str,
    content_language: str = "auto",
    instruction_language: str = "english",
    topic_hint: str | None = None,
    provider=None,
    max_retries: int = 2,
    pair_count: int | None = None,
    **_ignored,
) -> tuple[dict, dict]:
    """
    Generate several lesson illustrations (vertical stack in the player).

    Uses the same HuggingFace → SVG fallback chain as :func:`generate_image_block_from_unit_content`.
    ``pair_count`` selects how many images to create (clamped 2–6); default 3.
    """
    del max_retries, provider

    n_images = pair_count or _extract_count_from_hint(topic_hint, default=3)
    n_images = max(2, min(n_images, 6))

    base_title = (topic_hint or "").strip().split("\n")[0][:120] or "Lesson visuals"
    bullets = _markdown_bullets_for_image_prompt(unit_content or "", max_bullets=max(n_images + 2, 6))
    if topic_hint and topic_hint.strip():
        hint_line = topic_hint.strip().split("\n")[0].strip()
        if hint_line and hint_line not in bullets:
            bullets = [hint_line[:80]] + bullets
    pad_i = 0
    while len(bullets) < n_images:
        pad_i += 1
        bullets.append(f"{base_title} — visual {pad_i}")
    bullets = bullets[:n_images]

    deck_topic = (topic_hint or "").strip()[:200] or "Lesson illustration"
    audience_lang = content_language if content_language != "auto" else "the lesson language"
    style = "educational, flat illustration, clean background"

    hf_key = os.environ.get("HF_API_KEY", "")
    img_provider = None
    if hf_key:
        try:
            from app.services.ai.image_providers.huggingface_provider import (
                HuggingFaceImageProvider,
            )

            img_provider = HuggingFaceImageProvider(
                api_key=hf_key,
                width=512,
                height=384,
            )
        except Exception as exc:
            logger.warning("image_stacked: HuggingFace init failed: %s", exc)
            img_provider = None
    if img_provider is None:
        from app.services.ai.image_providers.svg_provider import SVGImageProvider

        img_provider = SVGImageProvider(ai_provider=_default_provider)

    images_out: list[dict[str, str]] = []
    for i, slide_focus in enumerate(bullets):
        img_prompt = ImagePromptBuilder.build(
            slide_title=slide_focus,
            bullet_points=[slide_focus],
            topic=deck_topic,
            audience=f"{audience_lang} learner",
            style=style,
        )
        alt = f"Educational illustration {i + 1}/{n_images}: {slide_focus}"
        img_result = await img_provider.agenerate_image(
            prompt=img_prompt,
            alt_text=alt[:300],
            style=style,
        )
        images_out.append({
            "src": img_result.as_data_uri(),
            "alt_text": img_result.alt_text or alt,
        })

    data = {
        "title": base_title[:200],
        "images": images_out,
    }
    model_label = getattr(img_provider, "model", None) or type(img_provider).__name__
    metadata = {
        "generation_model": str(model_label),
        "generation_attempts": 1,
        "exercise_type": "image_stacked",
        "image_count": n_images,
        "instruction_language": instruction_language,
    }
    return data, metadata


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# REGISTRY + DISPATCH  ← The only public API callers should use
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

from collections.abc import Callable, Awaitable
 
GeneratorFn = Callable[..., Awaitable[tuple[dict, dict]]]
 
EXERCISE_GENERATORS: dict[str, GeneratorFn] = {
    "drag_to_gap":          generate_drag_to_gap_from_unit_content,
    "type_word_in_gap":     generate_type_word_in_gap_from_unit_content,
    "select_word_form":     generate_select_word_form_from_unit_content,
    "match_pairs":          generate_match_pairs_from_unit_content,
    "build_sentence":       generate_build_sentence_from_unit_content,
    "order_paragraphs":     generate_order_paragraphs_from_unit_content,
    "sort_into_columns":    generate_sort_into_columns_from_unit_content,
    "drag_word_to_image":   generate_drag_word_to_image_from_unit_content,
    "select_form_to_image": generate_select_form_to_image_from_unit_content,
    "test_without_timer":   generate_test_without_timer_from_unit_content,
    "test_with_timer":      generate_test_without_timer_from_unit_content,  # same shape, timer set by editor
    "true-false":           generate_true_false_from_unit_content,
    "true_false":           generate_true_false_from_unit_content,
    "text":                 generate_reading_text_from_unit_content,
    "image":                generate_image_block_from_unit_content,
    "image_stacked":        generate_image_stacked_from_unit_content,
}
 
 
async def generate_exercise(
    exercise_type: str,
    unit_content: str,
    content_language: str = "auto",
    instruction_language: str = "english",
    topic_hint: str | None = None,
    **kwargs,
) -> tuple[dict, dict]:
    """
    Dispatch to the correct generator for *exercise_type*.
 
    This is the only function imported by exercise_generation_flow.py.
    Individual generators are implementation details.
 
    Raises
    ------
    NotImplementedError  Unknown or unimplemented exercise_type.
    ValueError           Generator produced invalid output.
    AIProviderError      Underlying LLM provider failed.
    """
    generator = EXERCISE_GENERATORS.get(exercise_type)
    if generator is None:
        supported = ", ".join(sorted(EXERCISE_GENERATORS))
        raise NotImplementedError(
            f"No AI generator registered for exercise type '{exercise_type}'. "
            f"Supported types: {supported}"
        )
 
    return await generator(
        unit_content=unit_content,
        content_language=content_language,
        instruction_language=instruction_language,
        topic_hint=topic_hint,
        **kwargs,
    )