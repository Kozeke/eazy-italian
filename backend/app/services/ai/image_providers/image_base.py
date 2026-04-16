"""
app/services/ai/image_providers/image_base.py
=============================================
ImageProvider — model-agnostic interface for image generation.

Architecture mirrors AIProvider exactly:
  - Sync  generate_image()  → ImageResult
  - Async agenerate_image() → ImageResult  (default: thread-pool wrapper)

Every concrete implementation must only override generate_image().
The async path is provided for free via asyncio.to_thread.

Implementations shipped
-----------------------
SVGImageProvider        — Uses the LLM to generate structured SVG code.
                          Zero cost, zero external API, works offline.
                          Best for: diagrams, flowcharts, concept maps.

HuggingFaceImageProvider — HuggingFace Inference API (free tier).
                          Requires HF_API_KEY env-var.
                          Best for: realistic or artistic illustrations.

NullImageProvider       — No-op. Returns a placeholder grey SVG.
                          Use in tests or when image generation is disabled.
"""

from __future__ import annotations

import asyncio
import base64
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

logger = logging.getLogger(__name__)


# ── Value types ───────────────────────────────────────────────────────────────

class ImageFormat(str, Enum):
    SVG  = "svg"
    PNG  = "png"
    JPEG = "jpeg"
    WEBP = "webp"


@dataclass(frozen=True)
class ImageResult:
    """
    Immutable result returned by every ImageProvider.

    Fields
    ------
    data        : Base64-encoded image bytes (or raw SVG string for SVG format).
    format      : File format — svg / png / jpeg / webp.
    alt_text    : Screen-reader description (also used as <img alt=…>).
    source      : Provider name, e.g. "SVGImageProvider", "HuggingFace/sdxl".
    prompt_used : The exact prompt that was sent to the backend.
    width       : Pixel width (0 for SVG — inherently scalable).
    height      : Pixel height (0 for SVG).
    """

    data:        str
    format:      ImageFormat
    alt_text:    str
    source:      str
    prompt_used: str
    width:       int = 0
    height:      int = 0

    # ── convenience helpers ───────────────────────────────────────────────────

    def as_data_uri(self) -> str:
        """
        Return a CSS / HTML data URI ready to drop into <img src=…> or
        CSS background-image.

        SVG is already text; other formats are binary base64.
        """
        if self.format == ImageFormat.SVG:
            # Inline SVG doesn't need base64 — embed as UTF-8 data URI
            import urllib.parse
            encoded = urllib.parse.quote(self.data, safe="/:@!$&'()*+,;=")
            return f"data:image/svg+xml;charset=utf-8,{encoded}"
        mime = {
            ImageFormat.PNG:  "image/png",
            ImageFormat.JPEG: "image/jpeg",
            ImageFormat.WEBP: "image/webp",
        }.get(self.format, "application/octet-stream")
        return f"data:{mime};base64,{self.data}"

    def is_empty(self) -> bool:
        return not self.data or self.data == NullImageProvider.PLACEHOLDER_DATA


# ── Abstract base ─────────────────────────────────────────────────────────────

class ImageProvider(ABC):
    """
    Abstract base class for image generation backends.

    All implementations must be injected — never instantiated inside
    services directly.  Swap providers from the DI layer (routes/ai.py).

    Example
    -------
    provider = SVGImageProvider(ai_provider=LocalLlamaProvider())
    result   = provider.generate_image(
        prompt   = "Diagram showing the water cycle with sun, clouds, rain",
        alt_text = "Water cycle diagram",
        style    = "educational diagram, clean lines, labeled",
    )
    img_tag = f'<img src="{result.as_data_uri()}" alt="{result.alt_text}">'
    """

    # ── required ──────────────────────────────────────────────────────────────

    @abstractmethod
    def generate_image(
        self,
        prompt:    str,
        alt_text:  str = "",
        style:     str = "",
        width:     int = 800,
        height:    int = 600,
    ) -> ImageResult:
        """
        Generate an image and return it as an ImageResult.

        Parameters
        ----------
        prompt   : What the image should depict (subject + context).
        alt_text : Accessibility description for the image.
        style    : Style modifiers, e.g. "flat illustration, blue palette".
        width    : Requested pixel width (ignored by SVG provider).
        height   : Requested pixel height (ignored by SVG provider).

        Returns
        -------
        ImageResult

        Raises
        ------
        ImageProviderError
            On any network, API, or generation failure.
        """

    # ── optional async variant ────────────────────────────────────────────────

    async def agenerate_image(
        self,
        prompt:   str,
        alt_text: str = "",
        style:    str = "",
        width:    int = 800,
        height:   int = 600,
    ) -> ImageResult:
        """
        Async variant — defaults to running generate_image in a thread pool.
        Override for providers with a native async SDK.
        """
        return await asyncio.to_thread(
            self.generate_image, prompt, alt_text, style, width, height
        )

    # ── dunder ────────────────────────────────────────────────────────────────

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__}>"


# ── Null provider (safe default / test stub) ──────────────────────────────────

class NullImageProvider(ImageProvider):
    """
    No-op provider.  Returns a minimal grey placeholder SVG.

    Use when:
    - Image generation is disabled in the request.
    - Running unit tests without real provider credentials.
    - The ImageProvider is optional and no backend is configured.
    """

    PLACEHOLDER_DATA = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400">'
        '<rect width="800" height="400" fill="#F1F5F9"/>'
        '<text x="400" y="210" text-anchor="middle" font-family="sans-serif" '
        'font-size="18" fill="#94A3B8">No image generated</text>'
        '</svg>'
    )

    def generate_image(
        self,
        prompt:   str,
        alt_text: str = "",
        style:    str = "",
        width:    int = 800,
        height:   int = 600,
    ) -> ImageResult:
        return ImageResult(
            data        = self.PLACEHOLDER_DATA,
            format      = ImageFormat.SVG,
            alt_text    = alt_text or "Placeholder image",
            source      = "NullImageProvider",
            prompt_used = prompt,
        )


# ── Shared exception ──────────────────────────────────────────────────────────

class ImageProviderError(RuntimeError):
    """Raised when an ImageProvider cannot fulfil a generation request."""