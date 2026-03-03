"""
VectorRepository — DDL helpers, upsert, and cosine-similarity search
against the `lesson_chunks` table (pgvector).

All heavy SQL lives here so the rest of the codebase never touches raw
pgvector syntax.  The repository is synchronous but every public method
is tiny enough to wrap in asyncio.to_thread when called from async routes.

Prerequisites
-------------
  PostgreSQL extension:  CREATE EXTENSION IF NOT EXISTS vector;
  Python packages:       pip install pgvector sqlalchemy psycopg2-binary

HNSW vs IVFFlat
---------------
  HNSW  — no need to pre-populate the table before building the index,
           better recall at lower ef values, chosen here.
  IVFFlat — requires data first (`VACUUM ANALYZE` after build), faster
             build, slightly lower RAM.

Index parameters (tunable via env-vars)
-----------------------------------------
  HNSW_M              default 16  — graph connectivity (↑ = better recall, more RAM)
  HNSW_EF_CONSTRUCTION default 64 — build-time beam width (↑ = better recall, slower build)
  HNSW_EF_SEARCH       default 40 — query-time beam width (↑ = better recall, slower query)
"""

from __future__ import annotations

import logging
import os
import uuid
from dataclasses import dataclass, field
from typing import Any, List

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.lesson_chunk import LessonChunk

logger = logging.getLogger(__name__)

# ── HNSW knobs ────────────────────────────────────────────────────────────────
_HNSW_M               = int(os.environ.get("HNSW_M",               "16"))
_HNSW_EF_CONSTRUCTION = int(os.environ.get("HNSW_EF_CONSTRUCTION", "64"))
_HNSW_EF_SEARCH       = int(os.environ.get("HNSW_EF_SEARCH",       "40"))

_INDEX_NAME = "idx_lesson_chunks_embedding_hnsw"


# ── Result DTO ────────────────────────────────────────────────────────────────

@dataclass
class ChunkSearchResult:
    """One row returned by VectorRepository.search()."""
    chunk_id:    uuid.UUID
    course_id:   int
    lesson_id:   int
    chunk_text:  str
    chunk_index: int
    similarity:  float                      # cosine similarity ∈ [0, 1]
    metadata:    dict[str, Any] = field(default_factory=dict)


# ── Repository ────────────────────────────────────────────────────────────────

class VectorRepository:
    """
    Manages `lesson_chunks` table DDL and vector operations.

    Parameters
    ----------
    session : sqlalchemy.orm.Session
        Injected database session.  Use as a FastAPI dependency or
        instantiate directly in scripts.

    Example
    -------
    with SessionLocal() as db:
        repo = VectorRepository(db)
        repo.create_tables()
        repo.create_index()

        repo.upsert(
            chunk_id=uuid.uuid4(),
            embedding=[0.1, 0.2, ...],    # 768 floats
            metadata={
                "course_id": 3,
                "lesson_id": 17,
                "chunk_text": "In Italian, verbs ending in -are …",
                "chunk_index": 0,
            },
        )

        results = repo.search(query_embedding=[...], k=5, course_id=3)
    """

    def __init__(self, session: Session) -> None:
        self._db = session

    # ── DDL ───────────────────────────────────────────────────────────────────

    def create_tables(self) -> None:
        """
        Ensure the pgvector extension and `lesson_chunks` table exist.
        Safe to call multiple times (idempotent).
        """
        # Enable extension
        self._db.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        self._db.execute(text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))  # gen_random_uuid()

        # Create table via SQLAlchemy metadata (honours IF NOT EXISTS)
        from app.core.database import Base, engine
        Base.metadata.create_all(bind=engine, tables=[LessonChunk.__table__])

        self._db.commit()
        logger.info("lesson_chunks table ready")

    def create_index(self) -> None:
        """
        Build HNSW index on the embedding column using cosine distance.

        Safe to call when the index already exists — will skip silently.
        The index is built CONCURRENTLY so it does NOT lock the table.
        """
        # Check existence first (CREATE INDEX IF NOT EXISTS is not supported
        # for CONCURRENTLY in older Postgres)
        exists = self._db.execute(
            text("SELECT 1 FROM pg_indexes WHERE indexname = :name"),
            {"name": _INDEX_NAME},
        ).fetchone()

        if exists:
            logger.info("HNSW index '%s' already exists — skipping", _INDEX_NAME)
            return

        logger.info(
            "Building HNSW index (m=%d, ef_construction=%d) …",
            _HNSW_M,
            _HNSW_EF_CONSTRUCTION,
        )
        # Must be outside a transaction for CONCURRENTLY
        self._db.connection().execution_options(isolation_level="AUTOCOMMIT")
        self._db.execute(text(f"""
            CREATE INDEX CONCURRENTLY {_INDEX_NAME}
            ON lesson_chunks
            USING hnsw (embedding vector_cosine_ops)
            WITH (m = {_HNSW_M}, ef_construction = {_HNSW_EF_CONSTRUCTION})
        """))
        logger.info("HNSW index created successfully")

    def drop_index(self) -> None:
        """Drop the HNSW index (useful before bulk re-ingestion)."""
        self._db.execute(
            text(f"DROP INDEX CONCURRENTLY IF EXISTS {_INDEX_NAME}")
        )
        logger.info("HNSW index dropped")

    def set_ef_search(self, ef: int = _HNSW_EF_SEARCH) -> None:
        """
        Tune query-time recall/speed trade-off for the current session.
        Higher ef → better recall, slower query.  Call once per connection.
        """
        self._db.execute(
            text(f"SET LOCAL hnsw.ef_search = {ef}")
        )

    # ── Write ─────────────────────────────────────────────────────────────────

    def upsert(
        self,
        chunk_id:  uuid.UUID,
        embedding: List[float],
        metadata:  dict[str, Any],
    ) -> LessonChunk:
        """
        Insert a new chunk or update an existing one (by chunk_id).

        Parameters
        ----------
        chunk_id : uuid.UUID
            Stable identifier for this chunk (deterministic UUID recommended).
        embedding : List[float]
            768-dim L2-normalised vector from EmbeddingService.embed().
        metadata : dict
            Must contain keys:
              - course_id  : int
              - lesson_id  : int
              - chunk_text : str
              - chunk_index: int   (0-based position within lesson)
            Optional keys: any extra fields stored in metadata_ JSON column.

        Returns
        -------
        LessonChunk
            The persisted ORM object.
        """
        required = {"course_id", "lesson_id", "chunk_text", "chunk_index"}
        missing  = required - metadata.keys()
        if missing:
            raise ValueError(f"upsert() metadata missing keys: {missing}")

        # Separate known columns from arbitrary extra metadata
        extra = {k: v for k, v in metadata.items() if k not in required}

        existing: LessonChunk | None = (
            self._db.query(LessonChunk)
            .filter(LessonChunk.id == chunk_id)
            .first()
        )

        if existing:
            existing.embedding   = embedding
            existing.chunk_text  = metadata["chunk_text"]
            existing.chunk_index = metadata["chunk_index"]
            existing.metadata_   = extra
            self._db.flush()
            logger.debug("Updated chunk %s", chunk_id)
            return existing

        chunk = LessonChunk(
            id          = chunk_id,
            course_id   = metadata["course_id"],
            lesson_id   = metadata["lesson_id"],
            chunk_text  = metadata["chunk_text"],
            chunk_index = metadata["chunk_index"],
            embedding   = embedding,
            metadata_   = extra,
        )
        self._db.add(chunk)
        self._db.flush()
        logger.debug("Inserted chunk %s", chunk_id)
        return chunk

    def upsert_many(
        self,
        items: List[dict[str, Any]],
    ) -> int:
        """
        Bulk upsert.  Each item must have keys:
          chunk_id, embedding, **metadata fields.

        Returns number of rows written.
        """
        count = 0
        for item in items:
            chunk_id = item.pop("chunk_id")
            embedding = item.pop("embedding")
            self.upsert(chunk_id=chunk_id, embedding=embedding, metadata=item)
            count += 1
        self._db.commit()
        logger.info("Bulk upserted %d chunks", count)
        return count

    # ── Read / Search ─────────────────────────────────────────────────────────

    def search(
        self,
        query_embedding: List[float],
        k:               int  = 5,
        course_id:       int  | None = None,
        lesson_id:       int  | None = None,
        min_similarity:  float       = 0.0,
    ) -> List[ChunkSearchResult]:
        """
        Return the *k* most similar chunks ranked by cosine similarity.

        pgvector stores cosine *distance* (0 = identical, 2 = opposite).
        We convert: similarity = 1 - distance.

        Parameters
        ----------
        query_embedding : List[float]
            768-dim vector from EmbeddingService.embed(question).
        k : int
            Number of results to return.
        course_id : int | None
            Filter results to a specific course.
        lesson_id : int | None
            Further restrict to a single lesson.
        min_similarity : float
            Discard results below this cosine similarity threshold.

        Returns
        -------
        List[ChunkSearchResult]  sorted by similarity descending.
        """
        self.set_ef_search()

        # Build WHERE clause
        filters: list[str] = []
        params:  dict[str, Any] = {"embedding": str(query_embedding), "k": k}

        if course_id is not None:
            filters.append("course_id = :course_id")
            params["course_id"] = course_id

        if lesson_id is not None:
            filters.append("lesson_id = :lesson_id")
            params["lesson_id"] = lesson_id

        where_sql = ("WHERE " + " AND ".join(filters)) if filters else ""

        # cosine distance operator: <=>
        sql = text(f"""
            SELECT
                id,
                course_id,
                lesson_id,
                chunk_text,
                chunk_index,
                metadata,
                1 - (embedding <=> CAST(:embedding AS vector)) AS similarity
            FROM lesson_chunks
            {where_sql}
            ORDER BY embedding <=> CAST(:embedding AS vector)
            LIMIT :k
        """)

        rows = self._db.execute(sql, params).fetchall()

        results: List[ChunkSearchResult] = []
        for row in rows:
            sim = float(row.similarity)
            if sim < min_similarity:
                continue
            results.append(
                ChunkSearchResult(
                    chunk_id    = row.id,
                    course_id   = row.course_id,
                    lesson_id   = row.lesson_id,
                    chunk_text  = row.chunk_text,
                    chunk_index = row.chunk_index,
                    similarity  = sim,
                    metadata    = row.metadata or {},
                )
            )

        logger.debug(
            "Vector search: course_id=%s k=%d → %d results",
            course_id, k, len(results),
        )
        return results

    # ── Housekeeping ──────────────────────────────────────────────────────────

    def delete_by_lesson(self, lesson_id: int) -> int:
        """Delete all chunks for a lesson (called before re-ingestion)."""
        deleted = (
            self._db.query(LessonChunk)
            .filter(LessonChunk.lesson_id == lesson_id)
            .delete(synchronize_session=False)
        )
        self._db.commit()
        logger.info("Deleted %d chunks for lesson_id=%d", deleted, lesson_id)
        return deleted

    def delete_by_course(self, course_id: int) -> int:
        """Delete all chunks for an entire course."""
        deleted = (
            self._db.query(LessonChunk)
            .filter(LessonChunk.course_id == course_id)
            .delete(synchronize_session=False)
        )
        self._db.commit()
        logger.info("Deleted %d chunks for course_id=%d", deleted, course_id)
        return deleted

    def count(self, course_id: int | None = None) -> int:
        """Return chunk count (optionally scoped to a course)."""
        q = self._db.query(LessonChunk)
        if course_id is not None:
            q = q.filter(LessonChunk.course_id == course_id)
        return q.count()