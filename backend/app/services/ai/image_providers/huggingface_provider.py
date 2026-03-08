"""
app/services/ai/image_providers/huggingface_provider.py
=======================================================
HuggingFaceImageProvider — generates images via HuggingFace Inference API.

Free tier access
----------------
HuggingFace provides free serverless inference for public models with a
rate limit.  No credit card required — just a free account + API token.

Setup
-----
1. Create a free account at https://huggingface.co
2. Go to Settings → Access Tokens → New token (type: "read")
3. Set the env-var:
       export HF_API_KEY=hf_xxxxxxxxxxxxxxxxxxxx

Rate limits (free tier, as of 2025)
------------------------------------
- ~1000 requests / month per model on the Inference API
- Cold start: 20–60 s on first request (model loading)
- Warm: 5–15 s per image
- Max 512×512 recommended for speed; 768×768 works but slower

Recommended free models for educational content
------------------------------------------------
Model ID                                    Style
--------------------------------------------------
stabilityai/stable-diffusion-2-1            General purpose, good quality
Lykon/dreamshaper-8                         Illustrated, artistic
openskyml/sky-creative-v2                   Creative illustrations
runwayml/stable-diffusion-v1-5              Classic, versatile
stabilityai/stable-diffusion-xl-base-1.0   Best quality, slower

For educational slides, Lykon/dreamshaper-8 with "illustration" style
keywords produces clean, non-photorealistic images that look intentional.

Fallback strategy
-----------------
If HF returns a 503 (model loading) this provider waits and retries once.
If it returns 429 (rate limit) it raises ImageProviderError with a clear
message so the caller can fall back to SVGImageProvider.

Educational prompt guidelines
------------------------------
Prepend "educational illustration, flat design, clean background," to any
topic description.  Avoid prompts that describe faces, text on images
(SDXL struggles with text), or copyrighted characters.
"""

from __future__ import annotations

import asyncio
import base64
import io
import logging
import os
import time
from typing import Optional

import httpx

from app.services.ai.image_providers.image_base import (
    ImageFormat,
    ImageProvider,
    ImageProviderError,
    ImageResult,
)

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

_HF_API_BASE   = "https://router.huggingface.co/hf-inference/models"
_DEFAULT_MODEL = "black-forest-labs/FLUX.1-schnell"

# Educational style prefix appended to every prompt for consistent results
_STYLE_PREFIX  = (
    "educational flat vector illustration, clean white background, "
    "absolutely no text, no words, no letters, no labels, "
    "simple geometric shapes, icons only, "
)

_NEGATIVE_PROMPT = (
    "text, letters, alphabet, words, numbers, labels, captions, "
    "speech bubbles, watermark, typography, font, writing, "
    "handwriting, symbols, equations, arrows with text, "
    "blurry, low quality, photorealistic, dark background"
)

# Map text-heavy educational concepts to pure visual descriptions
_CONCEPT_VISUALS = {
    "verb": "colorful arrows showing movement and action",
    "tense": "clock and calendar with timeline arrow",
    "past": "hourglass with timeline flowing left",
    "grammar": "geometric shapes connected by colorful lines",
    "sentence": "flowing river with stepping stones",
    "exercise": "pencil and checkmark on paper",
    "practice": "person climbing steps toward a goal",
    "review": "magnifying glass over colorful blocks",
    "introduction": "lightbulb surrounded by colorful circles",
    "summary": "funnel collecting colored dots",
}

_DEFAULT_TIMEOUT        = 60.0   # seconds — HF can be slow on cold start
_LOADING_RETRY_WAIT     = 25     # seconds to wait when model is loading
_MAX_LOADING_RETRIES    = 2


class HuggingFaceImageProvider(ImageProvider):
    """
    Calls the HuggingFace Inference API to generate images.

    Parameters
    ----------
    api_key : str | None
        HF token.  Falls back to HF_API_KEY env-var.
    model : str
        HuggingFace model ID, e.g. "Lykon/dreamshaper-8".
    width : int
        Output width in pixels (default 512, max 768 recommended for speed).
    height : int
        Output height in pixels (default 384, 4:3 ratio for slides).
    guidance_scale : float
        How strongly the model follows the prompt. 7–9 is a good range.
    num_inference_steps : int
        Denoising steps.  20–30 balances quality vs speed.
    style_prefix : str
        Prepended to every user prompt for consistent educational style.
    timeout : float
        HTTP request timeout in seconds.
    """

    def __init__(
        self,
        api_key:              Optional[str] = None,
        model:                str           = _DEFAULT_MODEL,
        width:                int           = 512,
        height:               int           = 384,  # 4:3 ratio — better for slide images than square
        guidance_scale:       float         = 7.5,
        num_inference_steps:  int           = 25,
        style_prefix:         str           = _STYLE_PREFIX,
        timeout:              float         = _DEFAULT_TIMEOUT,
    ) -> None:
        self.api_key             = api_key or os.environ.get("HF_API_KEY", "")
        self.model               = model
        self.width               = width
        self.height              = height
        self.guidance_scale      = guidance_scale
        self.num_inference_steps = num_inference_steps
        self.style_prefix        = style_prefix
        self.negative_prompt     = _NEGATIVE_PROMPT
        self.timeout             = timeout
        self._endpoint           = f"{_HF_API_BASE}/{self.model}"

        if not self.api_key:
            raise ImageProviderError(
                "HuggingFaceImageProvider requires an API key. "
                "Set HF_API_KEY env-var or pass api_key= to the constructor."
            )

    # ── ImageProvider ─────────────────────────────────────────────────────────

    def generate_image(
        self,
        prompt:   str,
        alt_text: str = "",
        style:    str = "",
        width:    int = 0,
        height:   int = 0,
    ) -> ImageResult:
        """
        Call HF Inference API synchronously.  Retries once if model is loading.
        """
        full_prompt = self._build_prompt(prompt, style)
        w = width  or self.width
        h = height or self.height

        # Payload format matching HF router API
        # FLUX doesn't support negative_prompt in parameters
        payload = {
            "inputs": full_prompt,
            "parameters": {
                "width":  w,
                "height": h,
            },
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type":  "application/json",
        }

        logger.error("HF endpoint being called: %s", self._endpoint)
        logger.error("HF payload: %s", {k: v for k, v in payload.items() if k != "inputs"})

        for attempt in range(_MAX_LOADING_RETRIES):
            try:
                with httpx.Client(timeout=self.timeout) as client:
                    resp = client.post(self._endpoint, json=payload, headers=headers)
            except httpx.TimeoutException as exc:
                raise ImageProviderError(
                    f"HuggingFace timed out after {self.timeout}s — "
                    "increase HF timeout or try a smaller/faster model."
                ) from exc
            except httpx.RequestError as exc:
                raise ImageProviderError(
                    f"Cannot reach HuggingFace API: {exc}"
                ) from exc

            # Model is loading — wait and retry
            if resp.status_code == 503:
                if attempt < _MAX_LOADING_RETRIES - 1:
                    logger.info(
                        "HuggingFace model loading, waiting %ds (attempt %d/%d)…",
                        _LOADING_RETRY_WAIT, attempt + 1, _MAX_LOADING_RETRIES,
                    )
                    time.sleep(_LOADING_RETRY_WAIT)
                    continue
                raise ImageProviderError(
                    f"HuggingFace model {self.model!r} is still loading after "
                    f"{_MAX_LOADING_RETRIES} retries.  Try again in ~60s."
                )

            # Rate limited
            if resp.status_code == 429:
                raise ImageProviderError(
                    "HuggingFace free-tier rate limit exceeded. "
                    "Wait a while or switch to SVGImageProvider for dev."
                )

            if resp.status_code != 200:
                logger.error(
                    "HF full error response — status=%d url=%s body=%s",
                    resp.status_code, self._endpoint, resp.text[:500],
                )
                raise ImageProviderError(
                    f"HuggingFace API HTTP {resp.status_code}: {resp.text[:300]}"
                )

            # Response is raw PNG bytes
            image_bytes = resp.content
            b64         = base64.b64encode(image_bytes).decode("ascii")

            logger.info(
                "HF image generated — model=%r size=%dx%d bytes=%d",
                self.model, w, h, len(image_bytes),
            )
            return ImageResult(
                data        = b64,
                format      = ImageFormat.PNG,
                alt_text    = alt_text or prompt[:100],
                source      = f"HuggingFace/{self.model}",
                prompt_used = full_prompt,
                width       = w,
                height      = h,
            )

        # Should never reach here
        raise ImageProviderError("HuggingFace generation failed unexpectedly.")

    # ── Private helpers ───────────────────────────────────────────────────────

    def _build_prompt(self, user_prompt: str, style: str) -> str:
        """
        Convert text-heavy slide topics into purely visual descriptions
        that won't trigger text generation in diffusion models.
        """
        # Replace any grammar/language keywords with visual metaphors
        visual = user_prompt.lower()
        for keyword, replacement in _CONCEPT_VISUALS.items():
            if keyword in visual:
                user_prompt = replacement
                break

        parts = [
            "flat vector illustration,",
            "clean white background,",
            "geometric shapes and icons,",
            "absolutely zero text or letters,",
            style or "colorful educational style,",
            user_prompt,
        ]
        full = " ".join(parts)
        return full[:1200]

    def __repr__(self) -> str:
        masked = f"{self.api_key[:8]}…" if self.api_key else "(none)"
        return f"<HuggingFaceImageProvider model={self.model!r} key={masked}>"