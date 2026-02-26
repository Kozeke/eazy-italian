"""
Vector repository: DDL helpers, upsert, and cosine similarity search for lesson_chunks.
Uses raw SQL for vector operations (pgvector).
"""
import json
from typing import List, Optional
from uuid import UUID
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from app.core.config import settings

VECTOR_DIM = 768


def _get_engine() -> Engine:
    url = str(settings.DATABASE_URL)
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    return create_engine(url)


def _embedding_to_pg_str(embedding: List[float]) -> str:
    """Serialize embedding list to PostgreSQL vector literal."""
    if len(embedding) != VECTOR_DIM:
        raise ValueError(f"embedding must have length {VECTOR_DIM}, got {len(embedding)}")
    return "[" + ",".join(str(float(x)) for x in embedding) + "]"


def ensure_vector_extension(engine: Optional[Engine] = None) -> None:
    """Create pgvector extension if not exists."""
    engine = engine or _get_engine()
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.commit()


def ensure_lesson_chunks_table(engine: Optional[Engine] = None) -> None:
    """Create lesson_chunks table and HNSW index if they do not exist."""
    engine = engine or _get_engine()
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.commit()
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
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_lesson_chunks_lesson_id
            ON lesson_chunks(lesson_id);
        """))
        conn.commit()
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_lesson_chunks_embedding_hnsw
            ON lesson_chunks
            USING hnsw (embedding vector_cosine_ops)
            WITH (m = 16, ef_construction = 64);
        """))
        conn.commit()


def upsert_chunk(
    chunk_id: Optional[UUID],
    content: str,
    embedding: List[float],
    lesson_id: Optional[str] = None,
    meta: Optional[dict] = None,
    engine: Optional[Engine] = None,
) -> UUID:
    """
    Insert or update a lesson chunk. Returns the chunk id.
    If chunk_id is None, a new UUID is generated.
    """
    engine = engine or _get_engine()
    meta = meta or {}
    emb_str = _embedding_to_pg_str(embedding)

    with engine.connect() as conn:
        if chunk_id is None:
            row = conn.execute(
                text("""
                    INSERT INTO lesson_chunks (content, embedding, lesson_id, meta)
                    VALUES (:content, :embedding::vector, :lesson_id, :meta::jsonb)
                    RETURNING id
                """),
                {
                    "content": content,
                    "embedding": emb_str,
                    "lesson_id": lesson_id,
                    "meta": json.dumps(meta),
                },
            ).fetchone()
            conn.commit()
            return row[0]
        else:
            conn.execute(
                text("""
                    INSERT INTO lesson_chunks (id, content, embedding, lesson_id, meta)
                    VALUES (:id, :content, :embedding::vector, :lesson_id, :meta::jsonb)
                    ON CONFLICT (id) DO UPDATE SET
                        content = EXCLUDED.content,
                        embedding = EXCLUDED.embedding,
                        lesson_id = EXCLUDED.lesson_id,
                        meta = EXCLUDED.meta
                """),
                {
                    "id": str(chunk_id),
                    "content": content,
                    "embedding": emb_str,
                    "lesson_id": lesson_id,
                    "meta": json.dumps(meta),
                },
            )
            conn.commit()
            return chunk_id


def cosine_search(
    embedding: List[float],
    top_k: int = 5,
    lesson_id: Optional[str] = None,
    engine: Optional[Engine] = None,
) -> List[dict]:
    """
    Return top_k chunks by cosine similarity (smallest distance first).
    Each row: {"id", "lesson_id", "content", "meta", "distance"}.
    """
    engine = engine or _get_engine()
    emb_str = _embedding_to_pg_str(embedding)

    with engine.connect() as conn:
        if lesson_id:
            rows = conn.execute(
                text("""
                    SELECT id, lesson_id, content, meta,
                           (embedding <=> :embedding::vector) AS distance
                    FROM lesson_chunks
                    WHERE embedding IS NOT NULL AND lesson_id = :lesson_id
                    ORDER BY embedding <=> :embedding2::vector
                    LIMIT :top_k
                """),
                {"embedding": emb_str, "embedding2": emb_str, "lesson_id": lesson_id, "top_k": top_k},
            ).fetchall()
        else:
            rows = conn.execute(
                text("""
                    SELECT id, lesson_id, content, meta,
                           (embedding <=> :embedding::vector) AS distance
                    FROM lesson_chunks
                    WHERE embedding IS NOT NULL
                    ORDER BY embedding <=> :embedding2::vector
                    LIMIT :top_k
                """),
                {"embedding": emb_str, "embedding2": emb_str, "top_k": top_k},
            ).fetchall()

    return [
        {
            "id": str(r[0]),
            "lesson_id": r[1],
            "content": r[2],
            "meta": r[3] or {},
            "distance": float(r[4]),
        }
        for r in rows
    ]
