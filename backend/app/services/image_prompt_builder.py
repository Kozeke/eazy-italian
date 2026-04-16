"""
app/services/image_prompt_builder.py
=====================================
ImagePromptBuilder — constructs a rich, structured image-generation prompt
from slide content and deck-level metadata.

Motivation
----------
The naive approach — just joining slide title and bullet points — produces
vague prompts like "Future Continuous. Use will be. Add ing to verbs."
Image providers interpret these literally and return generic diagrams.

A structured prompt with clear roles for each field produces much better
results:

    Educational illustration explaining "Future Continuous: Future Actions".
    Key concepts: ongoing future actions, will be + present participle,
    actions in progress at a specific future moment.
    Flat vector illustration, minimal colour palette.
    Designed for a professional audience.

Usage
-----
    from app.services.image_prompt_builder import ImagePromptBuilder

    prompt = ImagePromptBuilder.build(
        slide_title   = "Future Actions in Progress",
        bullet_points = ["Use will be + -ing", "Describes ongoing future events"],
        topic         = "Future Continuous",
        audience      = "Professional adult learners",
        style         = "flat illustration",
        keywords      = "clean lines, blue palette",
    )
    # → multi-line prompt string, ≤ 400 chars

Design
------
*   Static method — no instance state, no DI required.  Call directly.
*   Deterministic — same inputs always produce the same prompt.
*   Length-capped — providers behave poorly with prompts > ~400 chars.
*   Audience mapping — converts freeform text to a concise scene descriptor.
*   Graceful degradation — every parameter is optional (empty string = skip).
"""

from __future__ import annotations

import re


class ImagePromptBuilder:
    """
    Builds a multi-line image-generation prompt from slide and deck metadata.

    All logic lives in the single public method :meth:`build`, which is a
    classmethod so it can be used without instantiation.
    """

    # Max total characters in the final prompt string.
    # SVG providers truncate at ~500; HuggingFace performs best under 400.
    _MAX_CHARS: int = 380

    # How many bullet points to include (too many overwhelm the model).
    _MAX_BULLETS: int = 3

    # Keywords that suggest a particular setting for the audience line
    _AUDIENCE_SETTINGS: dict[str, str] = {
        "professional":  "professional workplace setting",
        "business":      "professional workplace setting",
        "executive":     "corporate boardroom setting",
        "beginner":      "simple, beginner-friendly visual",
        "elementary":    "bright, child-friendly classroom",
        "primary":       "bright, child-friendly classroom",
        "high school":   "secondary school classroom",
        "university":    "university lecture setting",
        "college":       "university lecture setting",
        "adult":         "adult learning environment",
        "academic":      "academic research setting",
        "medical":       "clinical or healthcare setting",
        "technical":     "technical engineering context",
    }

    @classmethod
    def build(
        cls,
        slide_title:   str,
        bullet_points: list[str],
        topic:         str = "",
        audience:      str = "",
        style:         str = "illustration",
        keywords:      str = "",
    ) -> str:
        """
        Construct a structured image-generation prompt.

        Parameters
        ----------
        slide_title
            The slide heading — becomes the primary subject of the image.
        bullet_points
            Key teaching points — up to ``_MAX_BULLETS`` are included as
            concept anchors.
        topic
            Deck-level subject (e.g. "Future Continuous").  Combined with
            ``slide_title`` to give the image model broader context.
        audience
            Freeform audience description (e.g. "professional adult learners").
            Mapped to a scene descriptor such as "professional workplace setting".
        style
            Base visual style (e.g. "flat illustration", "minimal vector").
        keywords
            Extra comma-separated style words (e.g. "blue palette, clean lines").

        Returns
        -------
        str
            A multi-line prompt string capped at ``_MAX_CHARS`` characters.

        Examples
        --------
        >>> ImagePromptBuilder.build(
        ...     slide_title   = "Future Actions in Progress",
        ...     bullet_points = ["Use will be + -ing", "Describes ongoing events"],
        ...     topic         = "Future Continuous",
        ...     audience      = "Professional adult learners",
        ...     style         = "flat illustration",
        ...     keywords      = "minimal colour palette",
        ... )
        'Educational illustration explaining "Future Continuous: Future Actions in Progress".\\nKey concepts: Use will be + -ing, Describes ongoing events.\\nFlat illustration, minimal colour palette.\\nProfessional workplace setting.'
        """
        parts: list[str] = []

        # ── Line 1: Subject ────────────────────────────────────────────────────
        # Combine topic + slide title for maximum context.
        # If topic duplicates the title, use just the title.
        subject = cls._build_subject(topic, slide_title)
        parts.append(f'Educational illustration explaining "{subject}".')

        # ── Line 2: Key concepts from bullet points ────────────────────────────
        concepts = cls._build_concepts(bullet_points)
        if concepts:
            parts.append(f"Key concepts: {concepts}.")

        # ── Line 3: Visual style ───────────────────────────────────────────────
        style_line = cls._build_style(style, keywords)
        if style_line:
            parts.append(style_line)

        # ── Line 4: Audience / setting ─────────────────────────────────────────
        setting = cls._build_setting(audience)
        if setting:
            parts.append(setting)

        prompt = "\n".join(parts)

        # Hard cap — truncate at the last complete sentence if over limit
        if len(prompt) > cls._MAX_CHARS:
            prompt = cls._truncate(prompt, cls._MAX_CHARS)

        return prompt

    # ── Private helpers ────────────────────────────────────────────────────────

    @staticmethod
    def _build_subject(topic: str, slide_title: str) -> str:
        """
        Combine topic and title into a concise subject phrase.

        Rules
        -----
        - If topic is empty → use slide_title only.
        - If topic is a substring of slide_title (case-insensitive) → use slide_title only
          (avoids redundant "Future Continuous: Introduction to Future Continuous").
        - Otherwise → "Topic: Slide Title".
        """
        topic      = topic.strip()
        slide_title = slide_title.strip()

        if not topic:
            return slide_title
        if topic.lower() in slide_title.lower():
            return slide_title
        return f"{topic}: {slide_title}"

    @classmethod
    def _build_concepts(cls, bullet_points: list[str]) -> str:
        """
        Join the first ``_MAX_BULLETS`` bullets into a comma-separated phrase.
        Strips trailing punctuation from each bullet to avoid double-dots.
        """
        cleaned = [
            b.strip().rstrip(".,;:")
            for b in bullet_points[: cls._MAX_BULLETS]
            if b.strip()
        ]
        return ", ".join(cleaned)

    @staticmethod
    def _build_style(style: str, keywords: str) -> str:
        """
        Produce a style directive line.

        Examples
        --------
        style="flat illustration", keywords="" → "Flat illustration."
        style="minimal vector",   keywords="blue palette" → "Minimal vector, blue palette."
        style="",                 keywords="clean lines"  → "Clean lines."
        """
        parts: list[str] = []
        if style.strip():
            parts.append(style.strip().capitalize())
        if keywords.strip():
            parts.append(keywords.strip())
        if not parts:
            return ""
        return ", ".join(parts) + "."

    @classmethod
    def _build_setting(cls, audience: str) -> str:
        """
        Map a freeform audience string to a concise scene descriptor.

        Tries each keyword in ``_AUDIENCE_SETTINGS`` (longest match wins).
        Falls back to "General educational setting." when no keyword matches.
        Returns empty string when audience is blank.
        """
        audience = audience.strip()
        if not audience:
            return ""

        audience_lower = audience.lower()

        # Find the most specific (longest-key) match
        best_match = ""
        best_key_len = 0
        for keyword, setting in cls._AUDIENCE_SETTINGS.items():
            if keyword in audience_lower and len(keyword) > best_key_len:
                best_match   = setting
                best_key_len = len(keyword)

        if best_match:
            return best_match.capitalize() + "."

        # No keyword matched — use a trimmed version of the raw audience text
        # (capitalised, punctuated, max 60 chars)
        short = audience[:57].rstrip() + "..." if len(audience) > 60 else audience
        return f"Designed for: {short}."

    @staticmethod
    def _truncate(prompt: str, max_chars: int) -> str:
        """
        Truncate ``prompt`` to at most ``max_chars`` characters, preferring
        to cut at a sentence boundary ('. ') rather than mid-word.
        """
        if len(prompt) <= max_chars:
            return prompt

        # Try to cut at the last sentence boundary within the limit
        truncated = prompt[:max_chars]
        last_dot  = truncated.rfind(". ")
        if last_dot > max_chars // 2:          # found a reasonable cut point
            return truncated[: last_dot + 1]   # include the dot, drop the space

        # No sentence boundary — cut at last space to avoid a broken word
        last_space = truncated.rfind(" ")
        if last_space > 0:
            return truncated[:last_space] + "."

        return truncated  # worst case: hard cut