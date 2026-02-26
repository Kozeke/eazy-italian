from .vector_repository import (
    ensure_vector_extension,
    ensure_lesson_chunks_table,
    upsert_chunk,
    cosine_search,
    VECTOR_DIM,
)

__all__ = [
    "ensure_vector_extension",
    "ensure_lesson_chunks_table",
    "upsert_chunk",
    "cosine_search",
    "VECTOR_DIM",
]
