"""
app/services/ai/cache/cache_key.py
===================================
Deterministic SHA-256 cache key generation.

The same logical request always produces the same 64-char hex key
regardless of string casing, extra whitespace, field order, or
None-vs-absent optional fields.

Pipeline
--------
    raw input
        → _norm()                   normalize strings + lists
        → {sorted keys}             field order removed
        → json.dumps(sort_keys=True) canonical string
        → sha256(utf-8)             64-char hex digest

This module has ZERO imports outside the stdlib.
It can be unit tested without a database, an AI provider, or FastAPI.
"""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Optional


# ── Normalization ─────────────────────────────────────────────────────────────

def _norm(value: Any) -> Any:
    """
    Recursively normalize a value for stable hashing.

    str   → lowercase, strip, collapse inner whitespace
    list  → sorted list of normalized items (order doesn't matter)
    dict  → recursively normalized, None values dropped
    other → unchanged (int, bool, float are already stable)
    """
    if isinstance(value, str):
        return re.sub(r"\s+", " ", value.strip().lower())
    if isinstance(value, list):
        return sorted(_norm(i) for i in value if i is not None)
    if isinstance(value, dict):
        return {k: _norm(v) for k, v in sorted(value.items()) if v is not None}
    return value


def _sha256(fields: dict[str, Any]) -> str:
    """
    Produce a 64-char SHA-256 hex digest from a normalized field dict.
    None values are dropped before hashing.
    """
    cleaned   = {k: _norm(v) for k, v in sorted(fields.items()) if v is not None}
    canonical = json.dumps(cleaned, sort_keys=True, ensure_ascii=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


# ── Slide cache key ────────────────────────────────────────────────────────────

class SlideCacheKey:
    """
    All fields that affect AI slide output must appear here.
    Fields that don't affect output (teacher_id, timestamp) must NOT.

    >>> SlideCacheKey.generate("Past Tense", "B2", 30) ==
    ... SlideCacheKey.generate("past tense", "b2", 30)
    True
    """

    _FIELDS = (
        "topic", "level", "duration_minutes", "language",
        "tone", "depth", "include_exercises",
        "include_teacher_notes", "learning_goals",
    )

    @staticmethod
    def generate(
        topic:                 str,
        level:                 str,
        duration_minutes:      int,
        language:              str                 = "English",
        tone:                  str                 = "Professional",
        depth:                 str                 = "concise",
        include_exercises:     bool                = True,
        include_teacher_notes: bool                = True,
        learning_goals:        Optional[list[str]] = None,
    ) -> str:
        return _sha256({
            "topic":                 topic,
            "level":                 level,
            "duration_minutes":      duration_minutes,
            "language":              language,
            "tone":                  tone,
            "depth":                 depth,
            "include_exercises":     include_exercises,
            "include_teacher_notes": include_teacher_notes,
            "learning_goals":        learning_goals or [],
        })

    @staticmethod
    def from_request(request: Any) -> str:
        """Generate key directly from a SlideGenerationRequest instance."""
        return SlideCacheKey.generate(
            topic                 = getattr(request, "topic", ""),
            level                 = getattr(request, "level", ""),
            duration_minutes      = getattr(request, "duration_minutes", 0),
            language              = getattr(request, "language", "English"),
            tone                  = getattr(request, "tone", ""),
            depth                 = getattr(request, "depth", "concise"),
            include_exercises     = getattr(request, "include_exercises", True),
            include_teacher_notes = getattr(request, "include_teacher_notes", True),
            learning_goals        = getattr(request, "learning_goals", None),
        )

    @staticmethod
    def input_dict_from_request(request: Any) -> dict[str, Any]:
        """Return the normalized input dict stored in input_json column."""
        return {k: _norm(v) for k, v in {
            "topic":                 getattr(request, "topic", ""),
            "level":                 getattr(request, "level", ""),
            "duration_minutes":      getattr(request, "duration_minutes", 0),
            "language":              getattr(request, "language", "English"),
            "tone":                  getattr(request, "tone", ""),
            "depth":                 getattr(request, "depth", "concise"),
            "include_exercises":     getattr(request, "include_exercises", True),
            "include_teacher_notes": getattr(request, "include_teacher_notes", True),
            "learning_goals":        getattr(request, "learning_goals", None) or [],
        }.items()}


# ── Image cache key ────────────────────────────────────────────────────────────

class ImageCacheKey:
    """
    Resolution is included — a 512×512 PNG and 1024×1024 of the same
    subject are different outputs and must not share a cache key.
    """

    @staticmethod
    def generate(
        prompt:   str,
        style:    str = "",
        theme:    str = "",
        provider: str = "svg",
        width:    int = 800,
        height:   int = 600,
    ) -> str:
        return _sha256({
            "prompt":   prompt,
            "style":    style,
            "theme":    theme,
            "provider": provider,
            "width":    width,
            "height":   height,
        })

    @staticmethod
    def input_dict(
        prompt:   str,
        style:    str = "",
        theme:    str = "",
        provider: str = "svg",
        width:    int = 800,
        height:   int = 600,
    ) -> dict[str, Any]:
        return {k: _norm(v) for k, v in {
            "prompt": prompt, "style": style, "theme": theme,
            "provider": provider, "width": width, "height": height,
        }.items()}