"""
Ingestion service: text → chunks → embeddings → vector store (lesson_chunks).
"""
from __future__ import annotations

import re
from typing import List, Optional
from uuid import UUID

from app.services.ai.embedding_service import get_embedding_service
from app.repositories.vector_repository import upsert_chunk, ensure_lesson_chunks_table


def chunk_text(
    text: str,
    max_chars: int = 500,
    overlap: int = 50,
    split_on: str = r"\n\n+|\n",
) -> List[str]:
    """
    Split text into overlapping chunks. Tries to break on paragraphs first,
    then on sentences, then hard-cut at max_chars.
    """
    if not text or not text.strip():
        return []

    text = text.strip()
    if len(text) <= max_chars:
        return [text] if text else []

    chunks: List[str] = []
    parts = re.split(split_on, text)
    current = []
    current_len = 0

    for part in parts:
        part = part.strip()
        if not part:
            continue
        part_len = len(part) + (1 if current else 0)
        if current_len + part_len <= max_chars:
            current.append(part)
            current_len += part_len
        else:
            if current:
                chunk = "\n".join(current)
                chunks.append(chunk)
                # overlap: keep last N chars for next chunk
                overlap_text = chunk[-overlap:] if len(chunk) >= overlap else chunk
                current = [overlap_text] if overlap_text else []
                current_len = len(overlap_text)
            if len(part) > max_chars:
                # Hard split long segment
                for i in range(0, len(part), max_chars - overlap):
                    seg = part[i : i + max_chars]
                    if seg.strip():
                        chunks.append(seg.strip())
                current = []
                current_len = 0
            else:
                current.append(part)
                current_len = len(part)

    if current:
        chunks.append("\n".join(current))
    return chunks


class IngestionService:
    """
    Takes raw text (e.g. lesson content), chunks it, embeds chunks, upserts into lesson_chunks.
    """

    def __init__(
        self,
        embedding_service=None,
        max_chars: int = 500,
        overlap: int = 50,
    ) -> None:
        self._embedding_service = embedding_service or get_embedding_service()
        self._max_chars = max_chars
        self._overlap = overlap

    def ingest(
        self,
        text: str,
        lesson_id: Optional[str] = None,
        meta_base: Optional[dict] = None,
        ensure_table: bool = True,
    ) -> List[UUID]:
        """
        Chunk text, embed each chunk, upsert into lesson_chunks.
        Returns list of chunk UUIDs.
        """
        if ensure_table:
            ensure_lesson_chunks_table()

        chunks = chunk_text(
            text,
            max_chars=self._max_chars,
            overlap=self._overlap,
        )
        if not chunks:
            return []

        # Batch embed
        embeddings = self._embedding_service.embed_batch(chunks)
        if len(embeddings) != len(chunks):
            raise RuntimeError(
                f"embed_batch returned {len(embeddings)} vectors for {len(chunks)} chunks"
            )

        ids: List[UUID] = []
        meta_base = meta_base or {}
        for i, (content, embedding) in enumerate(zip(chunks, embeddings)):
            meta = {**meta_base, "chunk_index": i}
            chunk_id = upsert_chunk(
                chunk_id=None,
                content=content,
                embedding=embedding,
                lesson_id=lesson_id,
                meta=meta,
            )
            ids.append(chunk_id)
        return ids
