"""
app/services/ai/cache/backends.py
==================================
CacheBackend — pluggable storage abstraction for the AI cache layer.

Hierarchy
---------
CacheBackend (ABC)
    ├── PostgresCacheBackend   ← ships now  (SQLAlchemy + JSONB)
    ├── RedisCacheBackend      ← stub, ready to fill in
    └── VectorCacheBackend     ← stub for semantic similarity (pgvector / Pinecone)

Why a backend ABC instead of baking Postgres in?
-------------------------------------------------
1. Tests can use a fast in-memory backend with no DB.
2. Redis backend can be dropped in for sub-millisecond hot-cache reads
   while Postgres remains the source-of-truth cold store.
3. The VectorCacheBackend stub shows where semantic similarity lookups
   will live — the interface is already prepared for it.

A CacheService (cache_service.py) owns one backend instance and exposes
the domain-level get_slide / set_slide / get_image / set_image API.
Nothing outside cache_service.py should touch a backend directly.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import uuid4

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session
from sqlalchemy import func

logger = logging.getLogger(__name__)


# ── Abstract base ─────────────────────────────────────────────────────────────

class CacheBackend(ABC):
    """
    Storage interface for the AI semantic cache.

    Every method works on raw dicts so the backend is completely
    decoupled from Pydantic models and domain objects.

    Implementations must be thread-safe (used from async FastAPI handlers
    via asyncio.to_thread when no native async SDK is available).
    """

    @abstractmethod
    def get(
        self,
        content_type: str,      # "slide" | "image"
        cache_key:    str,       # 64-char SHA-256 hex
    ) -> Optional[dict[str, Any]]:
        """
        Return the cached output dict, or None on a miss / expired entry.
        Implementations must increment usage_count and update
        last_accessed_at on a hit.
        """

    @abstractmethod
    def set(
        self,
        content_type:    str,
        cache_key:       str,
        input_json:      dict[str, Any],
        output_json:     dict[str, Any],
        expires_in_days: Optional[int] = None,
    ) -> None:
        """
        Persist a new cache entry.
        Must be idempotent — concurrent writes for the same key are safe.
        """

    @abstractmethod
    def invalidate(self, content_type: str, cache_key: str) -> bool:
        """Delete one entry. Returns True if it existed."""

    @abstractmethod
    def purge_expired(self) -> int:
        """Delete all expired entries. Returns count deleted."""

    @abstractmethod
    def stats(self) -> dict[str, Any]:
        """Return aggregate statistics for monitoring."""

    # ── Optional semantic similarity hook (future) ────────────────────────────

    def find_similar(
        self,
        content_type: str,
        embedding:    list[float],
        threshold:    float = 0.92,
        limit:        int   = 1,
    ) -> Optional[dict[str, Any]]:
        """
        Find a semantically similar cached entry using vector similarity.

        Default: returns None (not supported by this backend).
        Override in VectorCacheBackend.

        Parameters
        ----------
        embedding  : float list — the query embedding vector
        threshold  : cosine similarity floor (0.92 = very similar)
        limit      : max candidates to return
        """
        return None

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__}>"


# ── PostgreSQL backend ─────────────────────────────────────────────────────────

class PostgresCacheBackend(CacheBackend):
    """
    Persistent cache backed by the ai_cache PostgreSQL table.

    Uses JSONB for both input and output, giving us:
    - GIN-indexable JSON for analytics queries
    - No ORM overhead on the hot path (raw insert statement)
    - Race-safe writes via INSERT … ON CONFLICT DO NOTHING

    Parameters
    ----------
    db : sqlalchemy.orm.Session
        Injected per-request — never stored as a long-lived attribute.
    """

    def __init__(self, db: Session) -> None:
        self._db = db

    def get(
        self,
        content_type: str,
        cache_key:    str,
    ) -> Optional[dict[str, Any]]:
        from app.models.ai_cache import AICache

        row = (
            self._db.query(AICache)
            .filter(
                AICache.content_type == content_type,
                AICache.cache_key    == cache_key,
            )
            .first()
        )

        if row is None:
            logger.debug("Cache MISS  type=%-5s key=%s…", content_type, cache_key[:12])
            return None

        # Check expiry
        if row.expires_at and row.expires_at < datetime.now(timezone.utc):
            logger.debug("Cache EXPIRED type=%s key=%s…", content_type, cache_key[:12])
            self._db.delete(row)
            self._db.commit()
            return None

        # Record hit
        row.usage_count      += 1
        row.last_accessed_at  = datetime.now(timezone.utc)
        self._db.commit()

        logger.info(
            "Cache HIT   type=%-5s key=%s… hits=%d",
            content_type, cache_key[:12], row.usage_count,
        )
        return row.output_json

    def set(
        self,
        content_type:    str,
        cache_key:       str,
        input_json:      dict[str, Any],
        output_json:     dict[str, Any],
        expires_in_days: Optional[int] = None,
    ) -> None:
        from app.models.ai_cache import AICache

        expires_at = (
            datetime.now(timezone.utc) + timedelta(days=expires_in_days)
            if expires_in_days else None
        )

        stmt = (
            pg_insert(AICache)
            .values(
                id               = uuid4(),
                cache_key        = cache_key,
                content_type     = content_type,
                input_json       = input_json,
                output_json      = output_json,
                created_at       = func.now(),
                last_accessed_at = func.now(),
                expires_at       = expires_at,
                usage_count      = 1,
            )
            .on_conflict_do_nothing(
                index_elements=["content_type", "cache_key"]
            )
        )
        self._db.execute(stmt)
        self._db.commit()

        logger.info(
            "Cache STORE type=%-5s key=%s… expires=%s",
            content_type, cache_key[:12],
            expires_at.date() if expires_at else "never",
        )

    def invalidate(self, content_type: str, cache_key: str) -> bool:
        from app.models.ai_cache import AICache

        row = (
            self._db.query(AICache)
            .filter(
                AICache.content_type == content_type,
                AICache.cache_key    == cache_key,
            )
            .first()
        )
        if row:
            self._db.delete(row)
            self._db.commit()
            return True
        return False

    def purge_expired(self) -> int:
        from app.models.ai_cache import AICache

        now  = datetime.now(timezone.utc)
        rows = (
            self._db.query(AICache)
            .filter(AICache.expires_at.isnot(None))
            .filter(AICache.expires_at < now)
            .all()
        )
        for row in rows:
            self._db.delete(row)
        self._db.commit()
        logger.info("Purged %d expired cache entries.", len(rows))
        return len(rows)

    def stats(self) -> dict[str, Any]:
        from app.models.ai_cache import AICache

        rows = (
            self._db.query(
                AICache.content_type,
                func.count(AICache.id).label("entries"),
                func.sum(AICache.usage_count).label("total_hits"),
                func.max(AICache.usage_count).label("max_hits"),
                func.avg(AICache.usage_count).label("avg_hits"),
                func.min(AICache.created_at).label("oldest"),
                func.max(AICache.created_at).label("newest"),
            )
            .group_by(AICache.content_type)
            .all()
        )

        out: dict[str, Any] = {}
        for r in rows:
            out[r.content_type] = {
                "entries":     r.entries,
                "total_hits":  int(r.total_hits or 0),
                "max_hits":    int(r.max_hits or 0),
                "avg_hits":    round(float(r.avg_hits or 0), 2),
                "oldest":      r.oldest.isoformat() if r.oldest else None,
                "newest":      r.newest.isoformat() if r.newest else None,
            }

        # Top-10 most reused slide topics
        from app.models.ai_cache import AICache as AC
        top = (
            self._db.query(
                AC.input_json["topic"].label("topic"),
                func.sum(AC.usage_count).label("hits"),
            )
            .filter(AC.content_type == "slide")
            .group_by(AC.input_json["topic"])
            .order_by(func.sum(AC.usage_count).desc())
            .limit(10)
            .all()
        )
        out["top_slide_topics"] = [
            {"topic": r.topic, "hits": int(r.hits)} for r in top
        ]
        return out


# ── Redis backend (stub — fill in when ready) ─────────────────────────────────

class RedisCacheBackend(CacheBackend):
    """
    Hot-cache layer backed by Redis.

    Fill in when you want sub-millisecond reads for very frequent topics.
    Intended to sit in FRONT of PostgresCacheBackend:

        RedisCacheBackend (L1 — hot, volatile)
            → miss → PostgresCacheBackend (L2 — cold, persistent)

    Setup
    -----
        pip install redis
        export REDIS_URL=redis://localhost:6379/0

    Storage format
    --------------
    key  : "ai_cache:{content_type}:{cache_key}"
    value: JSON-serialized output_json
    TTL  : expires_in_days * 86400 seconds
    """

    def __init__(self, url: str = "redis://localhost:6379/0") -> None:
        self._url = url
        self._client = None   # lazy-connect on first use

    def _client_or_raise(self):
        if self._client is None:
            import redis
            self._client = redis.from_url(self._url, decode_responses=True)
        return self._client

    def _key(self, content_type: str, cache_key: str) -> str:
        return f"ai_cache:{content_type}:{cache_key}"

    def get(self, content_type: str, cache_key: str) -> Optional[dict[str, Any]]:
        import json as _json
        r   = self._client_or_raise()
        raw = r.get(self._key(content_type, cache_key))
        if raw is None:
            return None
        r.incr(f"ai_cache:hits:{content_type}:{cache_key}")
        return _json.loads(raw)

    def set(
        self,
        content_type:    str,
        cache_key:       str,
        input_json:      dict[str, Any],
        output_json:     dict[str, Any],
        expires_in_days: Optional[int] = None,
    ) -> None:
        import json as _json
        r   = self._client_or_raise()
        ttl = expires_in_days * 86400 if expires_in_days else None
        serialized = _json.dumps(output_json)
        if ttl:
            r.setex(self._key(content_type, cache_key), ttl, serialized)
        else:
            r.set(self._key(content_type, cache_key), serialized)

    def invalidate(self, content_type: str, cache_key: str) -> bool:
        r = self._client_or_raise()
        return bool(r.delete(self._key(content_type, cache_key)))

    def purge_expired(self) -> int:
        # Redis handles TTL expiry automatically
        return 0

    def stats(self) -> dict[str, Any]:
        # TODO: use Redis SCAN to aggregate stats
        return {"note": "Redis stats not yet implemented"}


# ── Vector similarity backend (stub — for future semantic cache) ──────────────

class VectorCacheBackend(CacheBackend):
    """
    Semantic similarity cache using pgvector or Pinecone.

    Instead of exact-key lookup, this backend stores an embedding of the
    normalized input and returns a cached result when cosine similarity
    exceeds `threshold`.

    Use case: "Introduction to ML" should hit the cache for "Intro to
    Machine Learning" even though the SHA-256 keys differ.

    Prerequisites
    -------------
    - pgvector extension in PostgreSQL:  CREATE EXTENSION vector;
    - An embedding model (text-embedding-3-small, nomic-embed-text, etc.)
    - pip install pgvector sqlalchemy

    Integration plan
    ----------------
    1. On set(): compute embedding → store alongside output_json
    2. On get(): compute query embedding → SELECT … ORDER BY embedding <=> query_vec LIMIT 1
    3. Return if similarity >= threshold, else None

    The exact-key cache (PostgresCacheBackend) runs first.
    VectorCacheBackend is the fallback for near-misses.
    """

    def __init__(
        self,
        db:              Session,
        embedding_model: Any,           # any callable: text → List[float]
        threshold:       float = 0.92,
    ) -> None:
        self._db        = db
        self._embed     = embedding_model
        self._threshold = threshold

    def get(self, content_type: str, cache_key: str) -> Optional[dict[str, Any]]:
        # Exact-key lookup (delegate to Postgres)
        return None  # TODO: implement vector lookup

    def find_similar(
        self,
        content_type: str,
        embedding:    list[float],
        threshold:    float = 0.92,
        limit:        int   = 1,
    ) -> Optional[dict[str, Any]]:
        # TODO:
        # SELECT output_json, 1 - (embedding <=> :query_vec) AS similarity
        # FROM ai_cache_vectors
        # WHERE content_type = :content_type
        #   AND 1 - (embedding <=> :query_vec) >= :threshold
        # ORDER BY similarity DESC
        # LIMIT :limit
        return None

    def set(self, content_type, cache_key, input_json, output_json, expires_in_days=None):
        pass  # TODO: compute embedding, store row

    def invalidate(self, content_type, cache_key):
        return False

    def purge_expired(self):
        return 0

    def stats(self):
        return {"note": "VectorCacheBackend stats not yet implemented"}