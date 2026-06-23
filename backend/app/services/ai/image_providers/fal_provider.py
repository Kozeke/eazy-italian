"""
app/services/ai/image_providers/fal_provider.py
================================================
FalImageProvider — generates images via fal.ai (FLUX.1 [dev]).

Setup
-----
1. Get a key at https://fal.ai/dashboard/keys
2. Set env-var: FAL_KEY=fal-ai:xxxx...

Model IDs
---------
fal-ai/flux/dev        — FLUX.1 [dev], best quality, ~3–5s
fal-ai/flux/schnell    — FLUX.1 [schnell], fastest, ~1–2s
fal-ai/flux-lora       — FLUX.1 + LoRA support (recommended for consistent style)

LoRA tip
--------
To apply an "educational illustration" LoRA, pass its URL via
FAL_LORA_URL env-var.  The provider will inject it automatically.
"""

from __future__ import annotations

import asyncio
import base64
import logging
import os
from typing import Optional

import fal_client
import httpx

from app.services.ai.image_providers.image_base import (
    ImageFormat,
    ImageProvider,
    ImageProviderError,
    ImageResult,
)

logger = logging.getLogger(__name__)

_DEFAULT_MODEL     = "fal-ai/flux/dev"
_DEFAULT_LORA_URL  = ""   # set FAL_LORA_URL to enable consistent style
_DEFAULT_TIMEOUT   = 60.0

_STYLE_PREFIX = (
    "educational flat vector illustration, clean white background, "
    "absolutely no text, no words, no letters, no labels, "
    "simple geometric shapes, icons only, "
)

_CONCEPT_VISUALS = {
    "verb":         "colorful arrows showing movement and action",
    "tense":        "clock and calendar with timeline arrow",
    "past":         "hourglass with timeline flowing left",
    "grammar":      "geometric shapes connected by colorful lines",
    "sentence":     "flowing river with stepping stones",
    "exercise":     "pencil and checkmark on paper",
    "practice":     "person climbing steps toward a goal",
    "review":       "magnifying glass over colorful blocks",
    "introduction": "lightbulb surrounded by colorful circles",
    "summary":      "funnel collecting colored dots",
}


class FalImageProvider(ImageProvider):
    """
    Calls the fal.ai queue API to generate images with FLUX.1 [dev].

    Parameters
    ----------
    api_key      : fal.ai API key (falls back to FAL_KEY env-var)
    model        : fal.ai model path (default: fal-ai/flux/dev)
    image_size   : fal.ai size preset — landscape_4_3 | square_hd | portrait_4_3 etc.
    num_steps    : inference steps (28 default for [dev], 4 for [schnell])
    guidance_scale: CFG scale (3.5 recommended for FLUX)
    lora_url     : optional LoRA weights URL for consistent illustration style
    lora_scale   : LoRA blend strength 0.0–1.0
    style_prefix : prepended to every prompt
    timeout      : HTTP timeout in seconds
    apply_concept_visuals : when True, swap single lesson keywords for a generic
                   visual (good for lesson images, bad for rich banner prompts)
    """

    def __init__(
        self,
        api_key:        Optional[str] = None,
        model:          str   = _DEFAULT_MODEL,
        image_size:     str   = "landscape_4_3",   # ~683×512 — good for slides
        num_steps:      int   = 28,
        guidance_scale: float = 3.5,
        lora_url:       str   = "",
        lora_scale:     float = 0.8,
        style_prefix:   str   = _STYLE_PREFIX,
        timeout:        float = _DEFAULT_TIMEOUT,
        apply_concept_visuals: bool = True,
    ) -> None:
        self.api_key        = api_key or os.environ.get("FAL_KEY", "")
        self.model          = model   or os.environ.get("FAL_MODEL", _DEFAULT_MODEL)
        self.image_size     = image_size
        self.num_steps      = num_steps
        self.guidance_scale = guidance_scale
        self.lora_url       = lora_url or os.environ.get("FAL_LORA_URL", _DEFAULT_LORA_URL)
        self.lora_scale     = lora_scale
        self.style_prefix   = style_prefix
        self.timeout        = timeout
        # When True, single-concept lesson keywords (e.g. "grammar", "verb")
        # in the prompt are swapped for a generic visual. This is desirable for
        # lesson/section illustrations but destroys rich descriptive prompts
        # (e.g. course banners), so callers like the course-thumbnail endpoint
        # disable it to preserve the full title/language/landmark description.
        self.apply_concept_visuals = apply_concept_visuals

        if not self.api_key:
            raise ImageProviderError(
                "FalImageProvider requires an API key. "
                "Set FAL_KEY env-var or pass api_key= to the constructor."
            )

        # Configure fal-client with the key
        os.environ.setdefault("FAL_KEY", self.api_key)

    # ── ImageProvider interface ───────────────────────────────────────────────

    def generate_image(
        self,
        prompt:   str,
        alt_text: str = "",
        style:    str = "",
        width:    int = 0,   # ignored — fal uses named size presets
        height:   int = 0,
    ) -> ImageResult:
        """Synchronous wrapper — runs the async call in a thread-safe way."""
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                    future = pool.submit(asyncio.run, self._generate_async(prompt, alt_text, style))
                    return future.result(timeout=self.timeout)
            else:
                return loop.run_until_complete(self._generate_async(prompt, alt_text, style))
        except ImageProviderError:
            raise
        except Exception as exc:
            raise ImageProviderError(f"fal.ai generation failed: {exc}") from exc

    async def agenerate_image(
        self,
        prompt:   str,
        alt_text: str = "",
        style:    str = "",
        width:    int = 0,
        height:   int = 0,
    ) -> ImageResult:
        """Native async path — preferred when called from async context."""
        return await self._generate_async(prompt, alt_text, style)

    # ── Private ───────────────────────────────────────────────────────────────

    async def _generate_async(self, prompt: str, alt_text: str, style: str) -> ImageResult:
        full_prompt = self._build_prompt(prompt, style)

        arguments: dict = {
            "prompt":          full_prompt,
            "image_size":      self.image_size,
            "num_inference_steps": self.num_steps,
            "guidance_scale":  self.guidance_scale,
            "num_images":      1,
            "enable_safety_checker": False,
        }

        # Attach LoRA if configured
        if self.lora_url:
            arguments["loras"] = [{"path": self.lora_url, "scale": self.lora_scale}]
            # Use the LoRA-capable model endpoint
            model = "fal-ai/flux-lora"
        else:
            model = self.model

        logger.info("fal.ai request — model=%r size=%s", model, self.image_size)

        result = await fal_client.run_async(model, arguments=arguments)

        # result.images[0].url is a CDN URL; download and base64-encode it
        image_url = result["images"][0]["url"]
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(image_url)
            resp.raise_for_status()

        image_bytes = resp.content
        b64 = base64.b64encode(image_bytes).decode("ascii")

        # Infer dimensions from response metadata if available
        w = result["images"][0].get("width",  683)
        h = result["images"][0].get("height", 512)

        logger.info("fal.ai image ready — model=%r size=%dx%d bytes=%d", model, w, h, len(image_bytes))

        return ImageResult(
            data        = b64,
            format      = ImageFormat.PNG,
            alt_text    = alt_text or prompt[:100],
            source      = f"fal.ai/{model}",
            prompt_used = full_prompt,
            width       = w,
            height      = h,
        )

    def build_effective_prompt(self, user_prompt: str, style: str) -> str:
        """
        Return the FULL prompt that would be sent to fal.ai — after applying the
        style prefix and concept-visual swap — WITHOUT making a network call.

        Called by ``image_cache_service`` to compute a stable cache key before
        the actual generation request.  Must stay in sync with ``_build_prompt``.
        """
        return self._build_prompt(user_prompt, style)

    def _build_prompt(self, user_prompt: str, style: str) -> str:
        # Only collapse the prompt to a generic concept visual for lesson/section
        # illustrations. Disabled for course banners so the full descriptive
        # prompt (title, language, landmarks) reaches the model intact.
        if self.apply_concept_visuals:
            visual = user_prompt.lower()
            for keyword, replacement in _CONCEPT_VISUALS.items():
                if keyword in visual:
                    user_prompt = replacement
                    break
        parts = [
            self.style_prefix,
            style or "colorful educational style,",
            user_prompt,
        ]
        return " ".join(parts)[:1200]

    def __repr__(self) -> str:
        masked = f"{self.api_key[:8]}…" if self.api_key else "(none)"
        return f"<FalImageProvider model={self.model!r} key={masked}>"