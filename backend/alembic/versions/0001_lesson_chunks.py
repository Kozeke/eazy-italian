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

    # Holds the active SQLAlchemy connection for schema inspection queries.
    connection = op.get_bind()
    # Provides table and index metadata so migration steps can be conditional.
    inspector = sa.inspect(connection)
    # Tracks whether lesson_chunks already exists to avoid duplicate DDL failures.
    lesson_chunks_exists = inspector.has_table("lesson_chunks")

    # 2. Create table only when it does not already exist.
    if not lesson_chunks_exists:
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
            sa.Column("chunk_text", sa.Text, nullable=False),
            sa.Column("chunk_index", sa.Integer, nullable=False, server_default="0"),
            # vector column — raw SQL because Alembic has no native Vector type
            sa.Column(
                "embedding",
                sa.Text,  # placeholder; overridden below
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

    # Stores current PostgreSQL type metadata for embedding column.
    embedding_type_row = connection.execute(
        sa.text(
            """
            SELECT udt_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'lesson_chunks'
              AND column_name = 'embedding'
            """
        )
    ).fetchone()
    # Keeps track of whether embedding is already pgvector.
    embedding_is_vector = embedding_type_row is not None and embedding_type_row[0] == "vector"
    # 3. Alter embedding column to vector(768) only when conversion is required.
    if not embedding_is_vector:
        op.execute(
            """
            ALTER TABLE lesson_chunks
            ALTER COLUMN embedding TYPE vector(768)
            USING embedding::vector(768)
            """
        )

    # 4. Regular B-tree indexes on FK columns (idempotent creation).
    op.execute("CREATE INDEX IF NOT EXISTS idx_lesson_chunks_course_id ON lesson_chunks (course_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_lesson_chunks_lesson_id ON lesson_chunks (lesson_id)")

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
    op.execute("DROP INDEX IF EXISTS idx_lesson_chunks_lesson_id")
    op.execute("DROP INDEX IF EXISTS idx_lesson_chunks_course_id")
    op.execute("DROP TABLE IF EXISTS lesson_chunks")