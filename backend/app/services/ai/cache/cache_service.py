"""
app/services/ai/cache/cache_service.py
=======================================
CacheService — domain-level caching API used by SlideGeneratorService
and ImageProvider.

Responsibilities
----------------
1. Generate deterministic cache keys (delegates to cache_key.py)
2. Serialize / deserialize domain objects (SlideDeck, ImageResult)
3. Delegate reads and writes to the injected CacheBackend
4. Never let a cache failure propagate to the caller

This is the ONLY class both services import.
They never touch backends.py, cache_key.py, or the DB directly.

Constructor injection
---------------------
    cache = CacheService(backend=PostgresCacheBackend(db), enabled=True)
    service = SlideGeneratorService(ai_provider=..., cache=cache)

Swapping backends
-----------------
    cache = CacheService(backend=RedisCacheBackend(url), enabled=True)

Layering two backends (L1 Redis + L2 Postgres)
-----------------------------------------------
    class TwoLayerBackend(CacheBackend):
        def get(self, ...):
            return redis.get(...) or postgres.get(...)
        def set(self, ...):
            redis.set(...)
            postgres.set(...)
    cache = CacheService(backend=TwoLayerBackend())

Future semantic fallback
------------------------
    cached = cache.get_slide(key)
    if cached is None and embedding is not None:
        cached = cache.find_similar_slide(embedding, threshold=0.92)
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from pydantic import ValidationError

from app.services.ai.cache.backends import CacheBackend
from app.services.ai.cache.cache_key import ImageCacheKey, SlideCacheKey

logger = logging.getLogger(__name__)

# TTL policy — change here, takes effect everywhere
_SLIDE_TTL_DAYS: Optional[int] = None   # None = never expire
_IMAGE_TTL_DAYS: Optional[int] = 90     # SVGs expire after 90 days


class CacheService:
    """
    Single cache API consumed by both SlideGeneratorService and ImageProvider.

    Parameters
    ----------
    backend : CacheBackend
        Any concrete backend — Postgres, Redis, in-memory, etc.
    enabled : bool
        Master switch. When False, get() always returns None and
        set() is a no-op. Flip via SLIDE_CACHE_ENABLED=false env-var.
    """

    def __init__(
        self,
        backend: CacheBackend,
        enabled: bool = True,
    ) -> None:
        if not isinstance(backend, CacheBackend):
            raise TypeError(
                f"backend must be a CacheBackend instance, got {type(backend)}"
            )
        self._backend = backend
        self._enabled = enabled

    # ── Slide cache ───────────────────────────────────────────────────────────

    def get_slide(self, request) -> tuple[Optional[Any], str]:
        """
        Look up a cached SlideDeck for this request.

        Returns
        -------
        (SlideDeck, cache_key)  on a hit
        (None,      cache_key)  on a miss
        """
        from app.schemas.slides import SlideDeck

        cache_key = SlideCacheKey.from_request(request)

        if not self._enabled:
            return None, cache_key

        raw = self._backend.get("slide", cache_key)
        if raw is None:
            return None, cache_key

        try:
            deck = SlideDeck.model_validate(raw)
            logger.info("Slide cache HIT  — topic=%r key=%s…", request.topic, cache_key[:12])
            return deck, cache_key
        except ValidationError as exc:
            logger.error(
                "Slide cache entry corrupt — key=%s… error=%s. Treating as miss.",
                cache_key[:12], exc,
            )
            return None, cache_key

    def set_slide(self, request, deck) -> None:
        """Persist a generated SlideDeck. Errors are swallowed — never crash."""
        if not self._enabled:
            return
        cache_key = SlideCacheKey.from_request(request)
        try:
            self._backend.set(
                content_type    = "slide",
                cache_key       = cache_key,
                input_json      = SlideCacheKey.input_dict_from_request(request),
                output_json     = deck.model_dump(),
                expires_in_days = _SLIDE_TTL_DAYS,
            )
        except Exception as exc:
            logger.error("Slide cache write failed — key=%s… error=%s", cache_key[:12], exc)

    # ── Image cache ───────────────────────────────────────────────────────────

    def get_image(
        self,
        prompt:   str,
        style:    str = "",
        theme:    str = "",
        provider: str = "svg",
        width:    int = 800,
        height:   int = 600,
    ) -> tuple[Optional[Any], str]:
        """
        Look up a cached ImageResult.

        Returns
        -------
        (ImageResult, cache_key)  on a hit
        (None,        cache_key)  on a miss
        """
        from app.services.ai.image_providers.image_base import ImageFormat, ImageResult

        cache_key = ImageCacheKey.generate(
            prompt=prompt, style=style, theme=theme,
            provider=provider, width=width, height=height,
        )

        if not self._enabled:
            return None, cache_key

        raw = self._backend.get("image", cache_key)
        if raw is None:
            return None, cache_key

        try:
            fmt_raw = raw.get("format", "svg")
            try:
                fmt = ImageFormat(fmt_raw)
            except ValueError:
                fmt = ImageFormat.SVG

            result = ImageResult(
                data        = raw["data"],
                format      = fmt,
                alt_text    = raw.get("alt_text", ""),
                source      = raw.get("source", "cache"),
                prompt_used = raw.get("prompt_used", ""),
                width       = raw.get("width", 0),
                height      = raw.get("height", 0),
            )
            logger.info("Image cache HIT  — key=%s…", cache_key[:12])
            return result, cache_key
        except Exception as exc:
            logger.error(
                "Image cache entry corrupt — key=%s… error=%s. Treating as miss.",
                cache_key[:12], exc,
            )
            return None, cache_key

    def set_image(
        self,
        prompt:   str,
        style:    str,
        theme:    str,
        provider: str,
        width:    int,
        height:   int,
        result,                 # ImageResult
    ) -> None:
        """Persist a generated ImageResult. Errors are swallowed."""
        if not self._enabled:
            return
        cache_key = ImageCacheKey.generate(
            prompt=prompt, style=style, theme=theme,
            provider=provider, width=width, height=height,
        )
        try:
            fmt = result.format.value if hasattr(result.format, "value") else str(result.format)
            self._backend.set(
                content_type    = "image",
                cache_key       = cache_key,
                input_json      = ImageCacheKey.input_dict(
                    prompt=prompt, style=style, theme=theme,
                    provider=provider, width=width, height=height,
                ),
                output_json     = {
                    "data":        result.data,
                    "format":      fmt,
                    "alt_text":    result.alt_text,
                    "source":      result.source,
                    "prompt_used": result.prompt_used,
                    "width":       result.width,
                    "height":      result.height,
                },
                expires_in_days = _IMAGE_TTL_DAYS,
            )
        except Exception as exc:
            logger.error("Image cache write failed — key=%s… error=%s", cache_key[:12], exc)

    # ── Maintenance ───────────────────────────────────────────────────────────

    def stats(self) -> dict:
        return self._backend.stats()

    def purge_expired(self) -> int:
        return self._backend.purge_expired()

    def invalidate_slide(self, request) -> bool:
        key = SlideCacheKey.from_request(request)
        return self._backend.invalidate("slide", key)

    def invalidate_image_key(self, cache_key: str) -> bool:
        return self._backend.invalidate("image", cache_key)

    # ── Future: semantic similarity ───────────────────────────────────────────

    def find_similar_slide(
        self,
        embedding: list[float],
        threshold: float = 0.92,
    ) -> Optional[Any]:
        """
        Find a semantically similar cached slide using vector similarity.
        Returns None if the backend does not support it.

        Wire in when you add VectorCacheBackend:
            cache = CacheService(backend=VectorCacheBackend(db, embed_model))
            deck  = cache.find_similar_slide(embed("past tense"))
        """
        from app.schemas.slides import SlideDeck

        raw = self._backend.find_similar("slide", embedding, threshold)
        if raw is None:
            return None
        try:
            return SlideDeck.model_validate(raw)
        except ValidationError:
            return None

    def __repr__(self) -> str:
        status = "ON" if self._enabled else "OFF"
        return f"<CacheService [{status}] backend={self._backend!r}>"