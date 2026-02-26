"""
Migration: lesson_chunks table + pgvector extension + HNSW index for cosine similarity.
Run with: python -m alembic upgrade head  (if using Alembic)
Or run this file directly: python alembic/versions/0001_lesson_chunks.py
"""
import os
import sys

# Allow running as script from backend dir
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from sqlalchemy import create_engine, text
from app.core.config import settings

REVISION_ID = "0001_lesson_chunks"
VECTOR_DIM = 768


def upgrade():
    """Create vector extension, lesson_chunks table, and HNSW index."""
    url = str(settings.DATABASE_URL)
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    engine = create_engine(url)

    with engine.connect() as conn:
        # Enable pgvector extension
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.commit()

        # Create lesson_chunks table
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS lesson_chunks (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                lesson_id VARCHAR(255),
                content TEXT NOT NULL,
                embedding vector({VECTOR_DIM}),
                meta JSONB DEFAULT '{{}}',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
            );
        """))
        conn.commit()

        # Index for lesson_id lookups
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_lesson_chunks_lesson_id
            ON lesson_chunks(lesson_id);
        """))
        conn.commit()

        # HNSW index for cosine distance similarity search (<=> operator)
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_lesson_chunks_embedding_hnsw
            ON lesson_chunks
            USING hnsw (embedding vector_cosine_ops)
            WITH (m = 16, ef_construction = 64);
        """))
        conn.commit()


def downgrade():
    """Drop table and extension (optional; comment out if you want to keep data)."""
    url = str(settings.DATABASE_URL)
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    engine = create_engine(url)
    with engine.connect() as conn:
        conn.execute(text("DROP TABLE IF EXISTS lesson_chunks CASCADE"))
        conn.commit()
        # conn.execute(text("DROP EXTENSION IF EXISTS vector CASCADE"))
        # conn.commit()


if __name__ == "__main__":
    # Run from repo root: python backend/alembic/versions/0001_lesson_chunks.py
    # Or from backend: python alembic/versions/0001_lesson_chunks.py
    upgrade()
    print("Migration 0001_lesson_chunks: done.")
