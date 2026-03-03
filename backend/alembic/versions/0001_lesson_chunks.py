"""
Alembic migration: create lesson_chunks table with pgvector HNSW index.

Revision: 0001_lesson_chunks
Created:  2025-01-01

Run with:
    alembic upgrade head

Or apply manually:
    psql -U postgres -d eazy_italian -f this_file.sql
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# ── identifiers ────────────────────────────────────────────────────────────────
revision      = "0001_lesson_chunks"
down_revision = None          # set to your latest migration rev if one exists
branch_labels = None
depends_on    = None

# HNSW parameters — must match VectorRepository constants
_HNSW_M               = 16
_HNSW_EF_CONSTRUCTION = 64
_INDEX_NAME           = "idx_lesson_chunks_embedding_hnsw"


def upgrade() -> None:
    # 1. Enable extensions
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")   # gen_random_uuid()

    # 2. Create table
    op.create_table(
        "lesson_chunks",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "course_id",
            sa.Integer,
            sa.ForeignKey("courses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "lesson_id",
            sa.Integer,
            sa.ForeignKey("units.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("chunk_text",  sa.Text,    nullable=False),
        sa.Column("chunk_index", sa.Integer, nullable=False, server_default="0"),
        # vector column — raw SQL because Alembic has no native Vector type
        sa.Column(
            "embedding",
            sa.Text,    # placeholder; overridden below
            nullable=False,
        ),
        sa.Column(
            "metadata",
            postgresql.JSON,
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )

    # 3. Alter embedding column to the real vector(768) type
    #    (Alembic doesn't know about pgvector, so we use raw SQL)
    op.execute("""
        ALTER TABLE lesson_chunks
        ALTER COLUMN embedding TYPE vector(768)
        USING embedding::vector(768)
    """)

    # 4. Regular B-tree indexes on FK columns
    op.create_index("idx_lesson_chunks_course_id", "lesson_chunks", ["course_id"])
    op.create_index("idx_lesson_chunks_lesson_id", "lesson_chunks", ["lesson_id"])

    # 5. HNSW index — must be CONCURRENTLY outside a transaction block
    #    Alembic wraps migrations in transactions by default; we break out.
    op.execute("COMMIT")        # end Alembic's transaction
    op.execute(f"""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS {_INDEX_NAME}
        ON lesson_chunks
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = {_HNSW_M}, ef_construction = {_HNSW_EF_CONSTRUCTION})
    """)


def downgrade() -> None:
    op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {_INDEX_NAME}")
    op.drop_index("idx_lesson_chunks_lesson_id", table_name="lesson_chunks")
    op.drop_index("idx_lesson_chunks_course_id", table_name="lesson_chunks")
    op.drop_table("lesson_chunks")