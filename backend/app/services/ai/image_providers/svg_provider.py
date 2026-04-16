"""
app/services/ai/image_providers/svg_provider.py  (cache-integrated)
====================================================================
SVGImageProvider — generates educational SVG diagrams via any AIProvider,
with cache-aside logic built directly into generate_image().

Cache flow (mirrors SlideGeneratorService exactly)
--------------------------------------------------
generate_image(prompt, style, ...)
    │
    ├─ 1. cache.get_image(prompt, style, theme, provider, w, h)
    │       └─ HIT  → return ImageResult immediately  (< 2 ms)
    │
    ├─ 2. MISS → _generate_svg_from_ai()              (3–15 s)
    │
    └─ 3. cache.set_image(...)                         (< 2 ms)

The CacheService is optional — pass cache=None for uncached behaviour.
This preserves full backward compatibility with existing tests.

The same pattern applies to HuggingFaceImageProvider — see
huggingface_provider.py for an identical integration.
"""

from __future__ import annotations

import logging
import re
from typing import Optional

from app.services.ai.image_providers.image_base import (
    ImageFormat,
    ImageProvider,
    ImageProviderError,
    ImageResult,
)
from app.services.ai.providers.base import AIProvider, AIProviderError

logger = logging.getLogger(__name__)

# ── Prompt ────────────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are an expert SVG diagram creator for educational presentations.

ABSOLUTE RULES:
1. Return ONLY valid SVG code — nothing else.
2. Start with <svg and end with </svg>.
3. Use viewBox="0 0 800 450" with no fixed width/height attributes.
4. All text: font-family="'Segoe UI', system-ui, sans-serif"
5. After </svg> output nothing else.

DESIGN STANDARDS:
- Background: #FFFFFF or #F8FAFC
- Primary: #2563EB  |  Accent: #10B981 or #F59E0B
- Text: #0F172A headings, #475569 body
- Borders: #CBD5E1 light, #64748B medium
- Radius: rx="8"  |  Font sizes: title 20px, label 14px, caption 11px

ACCESSIBILITY:
- First child: <title>…</title>
- Second child: <desc>…</desc>
"""

_USER_PROMPT = """\
Create an educational SVG diagram.

Title      : {title}
Description: {prompt}
Style      : {style}
Alt text   : {alt_text}

Return ONLY the SVG — nothing else.
"""

_FALLBACK_SVG = """\
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450">
  <title>{title}</title><desc>{alt_text}</desc>
  <rect width="800" height="450" fill="#F8FAFC"/>
  <rect x="40" y="40" width="720" height="370" rx="12" fill="white"
        stroke="#E2E8F0" stroke-width="1.5"/>
  <text x="400" y="200" text-anchor="middle"
        font-family="'Segoe UI',system-ui,sans-serif"
        font-size="42" fill="#2563EB">📊</text>
  <text x="400" y="252" text-anchor="middle"
        font-family="'Segoe UI',system-ui,sans-serif"
        font-size="18" font-weight="600" fill="#0F172A">{title}</text>
  <text x="400" y="280" text-anchor="middle"
        font-family="'Segoe UI',system-ui,sans-serif"
        font-size="13" fill="#64748B">{alt_text}</text>
</svg>"""


class SVGImageProvider(ImageProvider):
    """
    Generates educational SVG diagrams by prompting any AIProvider.

    Parameters
    ----------
    ai_provider    : AIProvider   — text generation backend (reuse existing instance)
    cache          : CacheService — optional semantic cache
    theme          : str          — current slide theme (part of cache key)
    max_retries    : int          — retries on invalid SVG output
    min_svg_length : int          — minimum char count for a valid SVG
    """

    def __init__(
        self,
        ai_provider:    AIProvider,
        cache:          Optional[object] = None,   # CacheService | None
        theme:          str              = "",
        max_retries:    int              = 1,
        min_svg_length: int              = 200,
    ) -> None:
        if not isinstance(ai_provider, AIProvider):
            raise TypeError(f"ai_provider must be an AIProvider, got {type(ai_provider)}")
        self._provider       = ai_provider
        self._cache          = cache
        self._theme          = theme
        self._max_retries    = max(0, max_retries)
        self._min_svg_length = min_svg_length

    # ── ImageProvider ──────────────────────────────────────────────────────────

    def generate_image(
        self,
        prompt:   str,
        alt_text: str = "",
        style:    str = "educational, clean, professional",
        width:    int = 800,
        height:   int = 450,
    ) -> ImageResult:
        """
        Cache-aside image generation (sync).

        1. cache.get_image()  → HIT: return immediately
        2. MISS: generate SVG via AI
        3. cache.set_image()  → store
        4. return
        """
        # ── 1. Cache lookup ────────────────────────────────────────────────────
        if self._cache is not None:
            cached, _ = self._cache.get_image(
                prompt=prompt, style=style, theme=self._theme,
                provider=repr(self), width=width, height=height,
            )
            if cached is not None:
                return cached

        # ── 2. Generate ────────────────────────────────────────────────────────
        result = self._generate_with_retry(prompt, alt_text, style)

        # ── 3. Store ───────────────────────────────────────────────────────────
        if self._cache is not None:
            self._cache.set_image(
                prompt=prompt, style=style, theme=self._theme,
                provider=repr(self), width=width, height=height,
                result=result,
            )

        return result

    async def agenerate_image(
        self,
        prompt:   str,
        alt_text: str = "",
        style:    str = "educational, clean, professional",
        width:    int = 800,
        height:   int = 450,
    ) -> ImageResult:
        """Cache-aside image generation (async)."""
        # ── 1. Cache lookup ────────────────────────────────────────────────────
        if self._cache is not None:
            cached, _ = self._cache.get_image(
                prompt=prompt, style=style, theme=self._theme,
                provider=repr(self), width=width, height=height,
            )
            if cached is not None:
                return cached

        # ── 2. Generate (async) ────────────────────────────────────────────────
        result = await self._generate_async(prompt, alt_text, style)

        # ── 3. Store ───────────────────────────────────────────────────────────
        if self._cache is not None:
            self._cache.set_image(
                prompt=prompt, style=style, theme=self._theme,
                provider=repr(self), width=width, height=height,
                result=result,
            )

        return result

    # ── Internal generation ────────────────────────────────────────────────────

    def _generate_with_retry(
        self, prompt: str, alt_text: str, style: str
    ) -> ImageResult:
        title       = prompt.split(".")[0][:80].strip() or "Diagram"
        full_prompt = self._build_prompt(prompt, alt_text, style, title)
        last_error  = None

        for attempt in range(self._max_retries + 1):
            if attempt > 0:
                logger.warning("SVG retry %d/%d — prompt=%r…", attempt, self._max_retries, prompt[:40])
            try:
                raw = self._provider.generate(full_prompt)
                svg = self._extract_and_validate(raw)
                logger.info("SVG generated — chars=%d provider=%r", len(svg), self._provider)
                return self._make_result(svg, prompt, alt_text or title)
            except (AIProviderError, ImageProviderError, ValueError) as exc:
                last_error = exc
                logger.error("SVG attempt %d failed: %s", attempt + 1, exc)

        logger.warning("SVG generation exhausted — returning fallback.")
        return self._fallback(title, alt_text, prompt)

    async def _generate_async(
        self, prompt: str, alt_text: str, style: str
    ) -> ImageResult:
        title       = prompt.split(".")[0][:80].strip() or "Diagram"
        full_prompt = self._build_prompt(prompt, alt_text, style, title)
        last_error  = None

        for attempt in range(self._max_retries + 1):
            if attempt > 0:
                logger.warning("SVG async retry %d/%d", attempt, self._max_retries)
            try:
                raw = await self._provider.agenerate(full_prompt)
                svg = self._extract_and_validate(raw)
                return self._make_result(svg, prompt, alt_text or title)
            except (AIProviderError, ImageProviderError) as exc:
                last_error = exc
                logger.error("SVG async attempt %d failed: %s", attempt + 1, exc)

        return self._fallback(title, alt_text, prompt)

    # ── Helpers ────────────────────────────────────────────────────────────────

    def _build_prompt(self, prompt: str, alt_text: str, style: str, title: str) -> str:
        return (
            _SYSTEM_PROMPT + "\n\n"
            + _USER_PROMPT.format(
                title    = title,
                prompt   = prompt,
                style    = style or "educational, clean, professional",
                alt_text = alt_text or title,
            )
        )

    def _extract_and_validate(self, raw: str) -> str:
        raw = raw.strip()
        if not raw.startswith("<svg"):
            raw = re.sub(r"^```(?:svg|xml|html)?\s*", "", raw, flags=re.IGNORECASE)
            raw = re.sub(r"\s*```$", "", raw).strip()
            m   = re.search(r"(<svg[\s\S]*?</svg>)", raw, re.IGNORECASE)
            if m:
                raw = m.group(1).strip()
            else:
                raise ImageProviderError(f"No <svg> block found. Excerpt: {raw[:200]!r}")
        if len(raw) < self._min_svg_length:
            raise ImageProviderError(f"SVG too short ({len(raw)} chars).")
        if "</svg>" not in raw.lower():
            raise ImageProviderError("SVG missing closing </svg>.")
        return raw

    def _make_result(self, svg: str, prompt: str, alt_text: str) -> ImageResult:
        return ImageResult(
            data        = svg,
            format      = ImageFormat.SVG,
            alt_text    = alt_text,
            source      = repr(self),
            prompt_used = prompt,
        )

    def _fallback(self, title: str, alt_text: str, prompt: str) -> ImageResult:
        svg = _FALLBACK_SVG.format(
            title    = title.replace("<", "&lt;").replace(">", "&gt;"),
            alt_text = (alt_text or title).replace("<", "&lt;").replace(">", "&gt;"),
        )
        return ImageResult(
            data        = svg,
            format      = ImageFormat.SVG,
            alt_text    = alt_text or title,
            source      = f"{repr(self)}/fallback",
            prompt_used = prompt,
        )

    def __repr__(self) -> str:
        return f"<SVGImageProvider provider={self._provider!r} theme={self._theme!r}>"