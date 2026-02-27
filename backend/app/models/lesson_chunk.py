"""
LessonChunk model — stores text passages + 768-dim embeddings for RAG.

Requires pgvector PostgreSQL extension:
    CREATE EXTENSION IF NOT EXISTS vector;

Dependencies:
    pip install pgvector sqlalchemy

Column notes
------------
id          : UUID primary key — chunk identity is content-addressed,
              stable across re-ingestion.
course_id   : Integer FK → courses.id  (matches existing Integer PKs in project)
lesson_id   : Integer FK → units.id    (lessons ≈ units in this codebase)
chunk_text  : raw text passage fed to the LLM as context
embedding   : 768-dim vector from LaBSE / multilingual-e5-base
chunk_index : position of this chunk within the lesson (0-based)
metadata_   : arbitrary JSON (page number, video timestamp, heading, …)
"""

from __future__ import annotations

import uuid

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

try:
    from pgvector.sqlalchemy import Vector
except ImportError as exc:
    raise ImportError(
        "pgvector is required: pip install pgvector\n"
        "Also enable the extension in PostgreSQL: CREATE EXTENSION vector;"
    ) from exc

from app.core.database import Base


class LessonChunk(Base):
    """
    A single text chunk extracted from a lesson/unit, with its embedding.

    One lesson is typically split into N overlapping chunks of ~300–500 tokens
    before ingestion.  The HNSW index on `embedding` enables fast ANN search.
    """

    __tablename__ = "lesson_chunks"

    # ── primary key ───────────────────────────────────────────────────────────
    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
        nullable=False,
    )

    # ── foreign keys — Integer to match existing project PKs ─────────────────
    course_id = Column(
        Integer,
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="References courses.id",
    )
    lesson_id = Column(
        Integer,
        ForeignKey("units.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="References units.id (lessons == units in this codebase)",
    )

    # ── content ───────────────────────────────────────────────────────────────
    chunk_text = Column(
        Text,
        nullable=False,
        comment="Raw text passage returned to the LLM as context",
    )
    chunk_index = Column(
        Integer,
        nullable=False,
        default=0,
        comment="0-based position of this chunk within its lesson",
    )

    # ── vector ────────────────────────────────────────────────────────────────
    embedding = Column(
        Vector(768),        # 768 = LaBSE / multilingual-e5-base dimension
        nullable=False,
        comment="L2-normalised sentence embedding (LaBSE 768-dim)",
    )

    # ── extra metadata ────────────────────────────────────────────────────────
    metadata_ = Column(
        "metadata",
        JSON,
        nullable=False,
        default=dict,
        server_default="{}",
        comment="Optional: page, timestamp, heading, source_url, …",
    )

    # ── audit ─────────────────────────────────────────────────────────────────
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    def __repr__(self) -> str:
        return (
            f"<LessonChunk id={self.id!s:.8} "
            f"course={self.course_id} lesson={self.lesson_id} "
            f"idx={self.chunk_index}>"
        )