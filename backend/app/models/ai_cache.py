"""
app/models/ai_cache.py
=======================
SQLAlchemy model for the ai_cache table.

Register in main.py:
    from app.models.ai_cache import AICache  # noqa: F401 — triggers table creation

Migration SQL (for manual runs or reference) is embedded at the bottom
of this file in the module docstring so everything lives in one place.

Schema decisions
----------------
UUID primary key       — avoids sequential enumeration, safe for distributed deploys.
cache_key VARCHAR(64)  — SHA-256 produces exactly 64 hex chars; no padding needed.
JSONB for both columns — GIN-indexable, queryable, no serialisation round-trip.
UniqueConstraint       — (content_type, cache_key): the real uniqueness guarantee.
Partial index on expires_at — only indexes rows that can expire; keeps index small.
usage_count INTEGER    — incremented in-place on every hit (no join table needed).
"""

from __future__ import annotations

import enum
import uuid

from sqlalchemy import (
    Column, DateTime, Enum as SAEnum,
    Index, Integer, String, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from app.core.database import Base


# ── Enum ───────────────────────────────────────────────────────────────────────

class CacheContentType(str, enum.Enum):
    SLIDE = "slide"
    IMAGE = "image"


# ── Model ──────────────────────────────────────────────────────────────────────

class AICache(Base):
    """One row per unique (content_type, cache_key) pair."""

    __tablename__ = "ai_cache"

    # ── Identity ──────────────────────────────────────────────────────────────
    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False,
    )

    # ── Key ───────────────────────────────────────────────────────────────────
    cache_key = Column(String(64), nullable=False)
    content_type = Column(
        SAEnum(CacheContentType, name="cache_content_type"),
        nullable=False,
    )

    # ── Payload ───────────────────────────────────────────────────────────────
    input_json  = Column(JSONB, nullable=False)
    output_json = Column(JSONB, nullable=False)

    # ── Lifecycle ─────────────────────────────────────────────────────────────
    created_at       = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_accessed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expires_at       = Column(DateTime(timezone=True), nullable=True)   # NULL = never

    # ── Analytics ─────────────────────────────────────────────────────────────
    usage_count = Column(Integer, default=1, nullable=False)

    # ── Constraints & indexes ─────────────────────────────────────────────────
    __table_args__ = (
        # Primary uniqueness guarantee — enforced at DB level
        UniqueConstraint("content_type", "cache_key", name="uq_ai_cache_type_key"),
        # Fast lookup on every cache read
        Index("ix_ai_cache_lookup", "content_type", "cache_key"),
        # Analytics: most-used entries by type
        Index("ix_ai_cache_usage", "content_type", "usage_count"),
        # Expiry sweep — partial: only rows with an expiry date
        Index(
            "ix_ai_cache_expires",
            "expires_at",
            postgresql_where="expires_at IS NOT NULL",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<AICache type={self.content_type} "
            f"key={self.cache_key[:12]}… hits={self.usage_count}>"
        )


# ── Migration SQL ──────────────────────────────────────────────────────────────
#
# Run manually or paste into an Alembic migration's upgrade() function.
# Designed for PostgreSQL 14+.
#
MIGRATION_UP_SQL = """
-- ── 0. Extension (needed for gen_random_uuid) ────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. Enum type ──────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cache_content_type') THEN
        CREATE TYPE cache_content_type AS ENUM ('slide', 'image');
    END IF;
END$$;

-- ── 2. Table ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_cache (
    id               UUID            NOT NULL DEFAULT gen_random_uuid(),
    cache_key        VARCHAR(64)     NOT NULL,
    content_type     cache_content_type NOT NULL,
    input_json       JSONB           NOT NULL,
    output_json      JSONB           NOT NULL,
    created_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    expires_at       TIMESTAMPTZ     NULL,
    usage_count      INTEGER         NOT NULL DEFAULT 1,

    CONSTRAINT pk_ai_cache          PRIMARY KEY (id),
    CONSTRAINT uq_ai_cache_type_key UNIQUE      (content_type, cache_key)
);

COMMENT ON TABLE  ai_cache IS 'Semantic cache for AI-generated slides and images.';
COMMENT ON COLUMN ai_cache.cache_key    IS 'SHA-256 hex digest of the normalised input (64 chars).';
COMMENT ON COLUMN ai_cache.input_json   IS 'Normalised request fields used to produce this result.';
COMMENT ON COLUMN ai_cache.output_json  IS 'Serialised AI output — SlideDeck or ImageResult.';
COMMENT ON COLUMN ai_cache.expires_at   IS 'NULL = never expires. Set for image entries (90 days).';
COMMENT ON COLUMN ai_cache.usage_count  IS 'Incremented on every cache hit.';

-- ── 3. Indexes ────────────────────────────────────────────────────────────────

-- Primary read path: content_type + cache_key
CREATE INDEX IF NOT EXISTS ix_ai_cache_lookup
    ON ai_cache (content_type, cache_key);

-- Analytics: most-used entries per type
CREATE INDEX IF NOT EXISTS ix_ai_cache_usage
    ON ai_cache (content_type, usage_count DESC);

-- Expiry sweep: only rows that can expire (keeps index tiny)
CREATE INDEX IF NOT EXISTS ix_ai_cache_expires
    ON ai_cache (expires_at)
    WHERE expires_at IS NOT NULL;

-- GIN index for JSONB topic queries (used by stats endpoint)
CREATE INDEX IF NOT EXISTS ix_ai_cache_input_gin
    ON ai_cache USING GIN (input_json);
"""

MIGRATION_DOWN_SQL = """
DROP INDEX  IF EXISTS ix_ai_cache_input_gin;
DROP INDEX  IF EXISTS ix_ai_cache_expires;
DROP INDEX  IF EXISTS ix_ai_cache_usage;
DROP INDEX  IF EXISTS ix_ai_cache_lookup;
DROP TABLE  IF EXISTS ai_cache;
DROP TYPE   IF EXISTS cache_content_type;
"""

# ── Auto-increment usage_count via DB trigger (optional optimisation) ──────────
#
# Instead of a SELECT + UPDATE in the application, this trigger does the
# increment atomically at the DB level. Apply if you see row contention.
#
USAGE_COUNT_TRIGGER_SQL = """
CREATE OR REPLACE FUNCTION fn_ai_cache_hit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE ai_cache
       SET usage_count      = usage_count + 1,
           last_accessed_at = NOW()
     WHERE id = NEW.id;
    RETURN NEW;
END;
$$;

-- (optional — only needed if you want pure-DB hit tracking)
-- CREATE TRIGGER trg_ai_cache_hit
-- AFTER INSERT ON ai_cache
-- FOR EACH ROW EXECUTE FUNCTION fn_ai_cache_hit();
"""