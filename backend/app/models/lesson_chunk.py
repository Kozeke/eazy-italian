"""
Lesson chunk model for RAG: stores text chunks and their embeddings (vector 768).
Requires: pip install pgvector, and PostgreSQL with CREATE EXTENSION vector;
the migration creates the table and HNSW index.
"""
import uuid
from sqlalchemy import Column, String, Text, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from app.core.database import Base

from pgvector.sqlalchemy import Vector

VECTOR_DIM = 768


class LessonChunk(Base):
    """
    A chunk of lesson/content text with an embedding vector (768 dims).
    Used for semantic search and RAG retrieval.
    """
    __tablename__ = "lesson_chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lesson_id = Column(String(255), nullable=True, index=True)
    content = Column(Text, nullable=False)
    embedding = Column(Vector(VECTOR_DIM), nullable=True)
    meta = Column(JSONB, default=dict, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
