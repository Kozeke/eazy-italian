"""
app/services/image_cache_service.py
=====================================
Caching layer for fal.ai image generation results.

Design
------
- Uses the existing `ai_cache` table (content_type = 'image').
- Cache key = SHA-256( "{model}::{image_size}::{effective_prompt_normalised}" )
  where "effective_prompt" is the FULL prompt after FalImageProvider._build_prompt()
  has been applied — i.e. the exact string that would be sent to fal.ai.
  This avoids false misses from minor description wording differences that
  ultimately produce the same effective prompt.
- Only fal.ai results are cached (SVG is fast and non-deterministic).
- TTL is not enforced here; use the admin eviction endpoint to clear old entries.

Usage
-----
    from app.services.image_cache_service import cached_generate_image

    img = await cached_generate_image(
        provider  = fal_provider_instance,
        prompt    = image_description,
        alt_text  = alt_text,
        style     = style,
        db        = db,      # sync SQLAlchemy Session
    )
    src = img.as_data_uri()
"""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models.ai_cache import AICache, CacheContentType
from app.services.ai.image_providers.image_base import ImageFormat, ImageResult

if TYPE_CHECKING:
    from app.services.ai.image_providers.fal_provider import FalImageProvider
    from app.services.ai.image_providers.image_base import ImageProvider

logger = logging.getLogger(__name__)


# ── Key helpers ───────────────────────────────────────────────────────────────

def _normalise(text: str) -> str:
    return text.strip().lower()


def build_cache_key(
    model: str,
    image_size: str,
    effective_prompt: str,
    key_seed: str | None = None,
) -> str:
    """
    Deterministic SHA-256 key for (model, image_size, prompt/seed).

    When ``key_seed`` is provided it replaces ``effective_prompt`` as the
    hashed payload.  Use this for vocabulary card images where the answer word
    is stable but the LLM-generated description varies across runs — keying by
    word guarantees a cache hit whenever the same concept is illustrated again,
    regardless of how the prompt was phrased.

    ``effective_prompt`` must already be the post-prefix, post-concept-swap
    string — i.e. what would actually be sent to fal.ai.  This is computed by
    FalImageProvider.build_effective_prompt() before the network call.
    """
    seed = _normalise(key_seed) if key_seed else _normalise(effective_prompt)
    raw = f"{model}::{image_size}::{seed}"
    return hashlib.sha256(raw.encode()).hexdigest()


# ── Serialisation ─────────────────────────────────────────────────────────────

def _result_to_json(result: ImageResult) -> dict:
    return {
        "data":        result.data,
        "format":      result.format.value if hasattr(result.format, "value") else str(result.format),
        "alt_text":    result.alt_text,
        "source":      result.source,
        "prompt_used": result.prompt_used,
        "width":       result.width,
        "height":      result.height,
    }


def _json_to_result(payload: dict) -> ImageResult:
    fmt_val = payload.get("format", "png")
    try:
        fmt = ImageFormat(fmt_val)
    except ValueError:
        fmt = ImageFormat.PNG
    return ImageResult(
        data        = payload["data"],
        format      = fmt,
        alt_text    = payload.get("alt_text", ""),
        source      = payload.get("source", "fal.ai (cached)"),
        prompt_used = payload.get("prompt_used", ""),
        width       = payload.get("width", 0),
        height      = payload.get("height", 0),
    )


# ── DB helpers ────────────────────────────────────────────────────────────────

def _get_cached(db: Session, cache_key: str) -> ImageResult | None:
    try:
        row: AICache | None = (
            db.query(AICache)
            .filter(
                AICache.content_type == CacheContentType.IMAGE,
                AICache.cache_key    == cache_key,
            )
            .first()
        )
    except Exception as exc:
        # Prevent a poisoned transaction from blocking fal.ai for every card.
        db.rollback()
        logger.warning("image_cache: lookup failed (treating as miss): %s", exc)
        return None

    if row is None:
        return None

    try:
        row.usage_count      = (row.usage_count or 0) + 1
        row.last_accessed_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as exc:
        logger.warning("image_cache: failed to update hit stats: %s", exc)
        db.rollback()

    try:
        return _json_to_result(row.output_json)
    except Exception as exc:
        logger.warning("image_cache: corrupt cache entry %s — %s", cache_key[:16], exc)
        return None


def _store(
    db:             Session,
    cache_key:      str,
    effective_prompt: str,
    model:          str,
    image_size:     str,
    result:         ImageResult,
) -> None:
    """Insert a new cache entry; silently skip on duplicate (race condition)."""
    stmt = (
        pg_insert(AICache)
        .values(
            id           = uuid4(),
            cache_key    = cache_key,
            content_type = CacheContentType.IMAGE,
            input_json   = {
                "model":            model,
                "image_size":       image_size,
                "effective_prompt": effective_prompt,
            },
            output_json  = _result_to_json(result),
            usage_count  = 1,
        )
        .on_conflict_do_nothing(index_elements=["content_type", "cache_key"])
    )
    try:
        db.execute(stmt)
        db.commit()
        logger.debug("image_cache: stored key=%s…", cache_key[:16])
    except Exception as exc:
        db.rollback()
        if "uq_ai_cache" in str(exc).lower() or "unique" in str(exc).lower():
            logger.debug("image_cache: concurrent insert — key already exists, skipping")
        else:
            logger.warning("image_cache: failed to store entry: %s", exc)


# ── Public API ────────────────────────────────────────────────────────────────

async def cached_generate_image(
    provider:       "ImageProvider",
    prompt:         str,
    alt_text:       str,
    style:          str,
    db:             Session | None,
    cache_key_seed: str | None = None,
) -> ImageResult:
    """
    Cache-aware wrapper around provider.agenerate_image().

    Only caches results from FalImageProvider (SVG skipped — non-deterministic
    LLM output, already fast).

    Parameters
    ----------
    provider       : Any ImageProvider instance.  Only FalImageProvider hits cache.
    prompt         : Raw user prompt (before prefix / concept-swap).
    alt_text       : Alt text forwarded to the provider.
    style          : Style string forwarded to the provider.
    db             : Sync SQLAlchemy Session.  If None, caching is skipped.
    cache_key_seed : Optional stable string used instead of the effective prompt
                     when hashing the cache key.  Pass the vocabulary ``answer``
                     word here so card images are keyed by concept, not by the
                     LLM-generated description that changes on every run.
    """
    from app.services.ai.image_providers.fal_provider import FalImageProvider

    is_fal = isinstance(provider, FalImageProvider)

    if not is_fal or db is None:
        # Not cacheable — generate directly
        return await provider.agenerate_image(prompt=prompt, alt_text=alt_text, style=style)

    # ── Compute the effective (post-transform) prompt for a stable cache key ──
    effective_prompt = provider.build_effective_prompt(prompt, style)
    cache_key        = build_cache_key(
        provider.model,
        provider.image_size,
        effective_prompt,
        key_seed=cache_key_seed,
    )

    # ── Cache read ────────────────────────────────────────────────────────────
    cached = _get_cached(db, cache_key)
    if cached is not None:
        logger.info(
            "image_cache HIT  key=%s… model=%s", cache_key[:16], provider.model
        )
        return cached

    logger.info(
        "image_cache MISS key=%s… — calling fal.ai model=%s", cache_key[:16], provider.model
    )

    # ── Generate ──────────────────────────────────────────────────────────────
    result = await provider.agenerate_image(prompt=prompt, alt_text=alt_text, style=style)

    # ── Cache write ───────────────────────────────────────────────────────────
    _store(
        db              = db,
        cache_key       = cache_key,
        effective_prompt= effective_prompt,
        model           = provider.model,
        image_size      = provider.image_size,
        result          = result,
    )

    return result


# ── Admin helpers (used by the eviction endpoint) ─────────────────────────────

def count_image_cache_entries(db: Session) -> int:
    return (
        db.query(AICache)
        .filter(AICache.content_type == CacheContentType.IMAGE)
        .count()
    )


def evict_old_image_cache_entries(db: Session, days: int = 30) -> int:
    """Delete image cache entries not accessed in `days` days. Returns count deleted."""
    from datetime import timedelta

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (
        db.query(AICache)
        .filter(
            AICache.content_type     == CacheContentType.IMAGE,
            AICache.last_accessed_at <  cutoff,
        )
        .all()
    )
    count = len(rows)
    for row in rows:
        db.delete(row)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("image_cache eviction failed: %s", exc)
        raise
    logger.info("image_cache eviction: deleted %d entries older than %d days", count, days)
    return count
