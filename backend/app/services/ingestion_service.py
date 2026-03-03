"""
app/services/ingestion_service.py
===================================
Ingests documents (PDF, VTT, SRT, DOCX, plain text) into the vector store.

Pipeline
--------
  raw bytes
      │
      ▼
  get_parser(filename) → parser.parse(bytes) → ParsedDocument
      │
      ▼
  make_chunks(text, title)  ← section-context-aware, preserves headings
      │
      ▼
  EmbeddingService.embed_batch(chunks)
      │
      ▼
  VectorRepository.upsert_many(items)  → lesson_chunks table

Chunk ID is deterministic:
    uuid5(NS, f"{lesson_id}:{source_hash[:8]}:{chunk_index}")
so re-uploading the same file produces the same UUIDs → clean upsert,
no duplicate rows.
"""
from __future__ import annotations

import hashlib
import logging
import re
import uuid
from dataclasses import dataclass
from typing import List, Optional

from sqlalchemy.orm import Session

from app.repositories.vector_repository import VectorRepository
from app.services.ai.embedding_service import EmbeddingService, get_embedding_service
from app.services.document_parsers import get_parser, ParsedDocument, ParserError

logger = logging.getLogger(__name__)

_CHUNK_NS = uuid.UUID("a1b2c3d4-e5f6-7890-abcd-ef1234567890")

MAX_CHUNK_WORDS = 80
MIN_CHUNK_WORDS = 15
WORD_OVERLAP    = 15


@dataclass
class IngestionResult:
    lesson_id:   int
    course_id:   int
    filename:    str
    source_type: str
    chunk_count: int
    title:       str


# ── Chunker (identical to test_rag_ingestion.py) ──────────────────────────────

def _words(s: str) -> List[str]:
    return re.split(r"\s+", s.strip())

def _force_split(paragraph: str, max_w: int, overlap: int) -> List[str]:
    words, step, parts, start = _words(paragraph), max(1, max_w - overlap), [], 0
    while start < len(words):
        end = min(start + max_w, len(words))
        parts.append(" ".join(words[start:end]))
        if end >= len(words):
            break
        start += step
    return parts


def make_chunks(raw_text: str, lesson_title: str,
                max_words: int = MAX_CHUNK_WORDS,
                min_words: int = MIN_CHUNK_WORDS,
                overlap:   int = WORD_OVERLAP) -> List[str]:
    """
    Section-context-aware chunker.
    '--- Section Title ---' markers become chunk context prefixes:
      "[Lesson Title] Section Title — paragraph content…"
    """
    _header_re = re.compile(r"^\s*---+\s*(.+?)\s*-*\s*$", re.MULTILINE)
    headers = [
        (m.start(), m.end(), m.group(1).strip())
        for m in _header_re.finditer(raw_text)
    ]

    sections: list[tuple] = []
    if not headers:
        sections.append(("", raw_text))
    else:
        pre = raw_text[: headers[0][0]].strip()
        if pre:
            sections.append(("", pre))
        for i, (start, end, title) in enumerate(headers):
            next_start = headers[i + 1][0] if i + 1 < len(headers) else len(raw_text)
            sections.append((title, raw_text[end:next_start].strip()))

    raw_chunks: List[str] = []
    for sec_title, sec_body in sections:
        prefix  = f"{sec_title} — " if sec_title else ""
        eff_max = max(10, max_words - (len(_words(prefix)) if prefix else 0))

        for block in re.split(r"\n{2,}", sec_body):
            lines = [
                ln for ln in block.splitlines()
                if ln.strip()
                and not re.fullmatch(r"[\s─═\-]+", ln)
                and not re.match(r"^\s*---", ln)
            ]
            cleaned = " ".join(ln.strip() for ln in lines).strip()
            if not cleaned:
                continue
            if len(_words(cleaned)) <= eff_max:
                raw_chunks.append(prefix + cleaned)
            else:
                for part in _force_split(cleaned, eff_max, overlap):
                    raw_chunks.append((prefix + part).strip())

    merged: List[str] = []
    for c in raw_chunks:
        if merged and len(_words(c)) < min_words:
            merged[-1] += " " + c
        else:
            merged.append(c)

    return [f"[{lesson_title}] {c.strip()}" for c in merged if c.strip()]


# ── Service ───────────────────────────────────────────────────────────────────

class IngestionService:
    """
    High-level ingestion pipeline: file bytes → vector store.

    Parameters
    ----------
    db                : SQLAlchemy session
    embedding_service : LaBSE singleton by default
    """

    def __init__(self, db: Session,
                 embedding_service: Optional[EmbeddingService] = None) -> None:
        self._db       = db
        self._embedder = embedding_service or get_embedding_service()
        self._repo     = VectorRepository(db)

    def ingest(
        self,
        *,
        file_bytes:    bytes,
        filename:      str,
        lesson_id:     int,
        course_id:     int,
        title:         Optional[str] = None,
        language:      Optional[str] = None,
        mimetype:      str           = "",
        wipe_existing: bool          = True,
    ) -> IngestionResult:
        """
        Parse → chunk → embed → upsert a document file.

        Parameters
        ----------
        file_bytes    : raw file content
        filename      : original filename (selects the parser)
        lesson_id     : FK → units.id
        course_id     : FK → courses.id
        title         : override the parsed/inferred title
        language      : override detected language ('en', 'ru', 'it')
        mimetype      : MIME type hint (optional)
        wipe_existing : delete previous chunks for this lesson first
        """
        parser = get_parser(filename, mimetype)
        doc    = parser.parse(file_bytes, filename=filename)

        effective_title = title or doc.title or filename
        effective_lang  = language or doc.language

        logger.info("Parsed '%s' → %d chars, title='%s'",
                    filename, len(doc.text), effective_title)

        chunks = make_chunks(doc.text, effective_title)
        if not chunks:
            raise ValueError(
                f"Document '{filename}' produced no chunks after parsing."
            )

        if wipe_existing:
            deleted = self._repo.delete_by_lesson(lesson_id)
            if deleted:
                logger.info("Deleted %d old chunks for lesson_id=%d",
                            deleted, lesson_id)

        embeddings  = self._embedder.embed_batch(chunks)
        source_hash = hashlib.md5(file_bytes).hexdigest()
        source_type = doc.extra.get("source_type", _infer_source_type(filename))

        items = []
        for idx, (chunk_text, embedding) in enumerate(zip(chunks, embeddings)):
            chunk_id = uuid.uuid5(_CHUNK_NS, f"{lesson_id}:{source_hash[:8]}:{idx}")
            items.append({
                "chunk_id":    chunk_id,
                "embedding":   embedding,
                "course_id":   course_id,
                "lesson_id":   lesson_id,
                "chunk_text":  chunk_text,
                "chunk_index": idx,
                "source_type": source_type,
                "filename":    filename,
                "language":    effective_lang,
                "title":       effective_title,
            })

        count = self._repo.upsert_many(items)
        logger.info("Ingested '%s' → lesson=%d course=%d chunks=%d",
                    filename, lesson_id, course_id, count)

        return IngestionResult(
            lesson_id   = lesson_id,
            course_id   = course_id,
            filename    = filename,
            source_type = source_type,
            chunk_count = count,
            title       = effective_title,
        )

    def ingest_text(
        self,
        *,
        text:          str,
        title:         str,
        lesson_id:     int,
        course_id:     int,
        language:      str  = "en",
        wipe_existing: bool = True,
    ) -> IngestionResult:
        """Ingest plain text directly without a file."""
        source_hash = hashlib.md5(text.encode()).hexdigest()
        chunks      = make_chunks(text, title)
        embeddings  = self._embedder.embed_batch(chunks)

        if wipe_existing:
            self._repo.delete_by_lesson(lesson_id)

        items = []
        for idx, (chunk_text, embedding) in enumerate(zip(chunks, embeddings)):
            chunk_id = uuid.uuid5(_CHUNK_NS, f"{lesson_id}:{source_hash[:8]}:{idx}")
            items.append({
                "chunk_id":    chunk_id,
                "embedding":   embedding,
                "course_id":   course_id,
                "lesson_id":   lesson_id,
                "chunk_text":  chunk_text,
                "chunk_index": idx,
                "source_type": "text",
                "filename":    "",
                "language":    language,
                "title":       title,
            })

        count = self._repo.upsert_many(items)
        return IngestionResult(
            lesson_id=lesson_id, course_id=course_id,
            filename="", source_type="text",
            chunk_count=count, title=title,
        )


def _infer_source_type(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return {"pdf": "pdf", "vtt": "subtitle", "srt": "subtitle",
            "docx": "docx", "doc": "docx"}.get(ext, "text")