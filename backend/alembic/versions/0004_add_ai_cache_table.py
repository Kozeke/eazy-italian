"""
Alembic migration: create ai_cache table for AI slide/image cache.

Revision: 0004_add_ai_cache_table
Down revision: 0004_join_code (linear chain after join_code migration)

Creates the ai_cache table and cache_content_type enum used by
app.models.ai_cache (slide/image semantic cache).

Run with:
    alembic upgrade head
"""

from alembic import op

# revision identifiers — follows join_code so the graph has a single head
revision = "0004_ai_cache"
# Applies after courses join_code; avoids a second branch from 0003_onboarding
down_revision = "0004_join_code"
branch_labels = None
depends_on = None

# SQL from app.models.ai_cache — idempotent (IF NOT EXISTS)
UP_SQL = """
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cache_content_type') THEN
        CREATE TYPE cache_content_type AS ENUM ('slide', 'image');
    END IF;
END$$;

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

CREATE INDEX IF NOT EXISTS ix_ai_cache_lookup
    ON ai_cache (content_type, cache_key);

CREATE INDEX IF NOT EXISTS ix_ai_cache_usage
    ON ai_cache (content_type, usage_count DESC);

CREATE INDEX IF NOT EXISTS ix_ai_cache_expires
    ON ai_cache (expires_at)
    WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_ai_cache_input_gin
    ON ai_cache USING GIN (input_json);
"""

DOWN_SQL = """
DROP INDEX IF EXISTS ix_ai_cache_input_gin;
DROP INDEX IF EXISTS ix_ai_cache_expires;
DROP INDEX IF EXISTS ix_ai_cache_usage;
DROP INDEX IF EXISTS ix_ai_cache_lookup;
DROP TABLE IF EXISTS ai_cache;
DROP TYPE IF EXISTS cache_content_type;
"""


def upgrade() -> None:
    op.execute(UP_SQL)


def downgrade() -> None:
    op.execute(DOWN_SQL)
