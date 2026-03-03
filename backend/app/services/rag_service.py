"""
RAGService — Retrieval-Augmented Generation over course content.

Flow
----
  1. question + course_id arrive
  2. EmbeddingService.embed(question) → 768-dim query vector
  3. VectorRepository.search(vector, course_id) → top-k ChunkSearchResult
  4. AnswerSynthesizer.synthesize(question, chunk_texts) → AnswerResponse

The service owns no state between calls; inject it as a FastAPI dependency
or instantiate once per process.

Environment variables
---------------------
RAG_TOP_K              default 5   — number of chunks retrieved
RAG_MIN_SIMILARITY     default 0.3 — discard chunks below this cosine score
RAG_INCLUDE_LESSON_ID  optional    — restrict retrieval to one lesson
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import List

from sqlalchemy.orm import Session

from app.repositories.vector_repository import VectorRepository, ChunkSearchResult
from app.services.ai.embedding_service import EmbeddingService, get_embedding_service
from app.services.ai.answer_synthesizer import AnswerSynthesizer, AnswerResponse
from app.services.ai.providers.base import AIProvider

logger = logging.getLogger(__name__)

_DEFAULT_TOP_K          = int(os.environ.get("RAG_TOP_K",          "5"))
_DEFAULT_MIN_SIMILARITY = float(os.environ.get("RAG_MIN_SIMILARITY","0.3"))


class RAGService:
    """
    Orchestrates the full RAG pipeline for a language-learning platform.

    Parameters
    ----------
    db : Session
        SQLAlchemy session — owns the DB connection lifetime.
    provider : AIProvider
        Any concrete provider (LocalLlamaProvider, OpenAIProvider, …).
    embedding_service : EmbeddingService | None
        If None, the module-level singleton is used (recommended).
    top_k : int
        Number of chunks to retrieve per query.
    min_similarity : float
        Minimum cosine similarity [0, 1] to include a chunk.

    Example
    -------
    # Sync
    with SessionLocal() as db:
        svc = RAGService(db=db, provider=LocalLlamaProvider())
        result = svc.answer("How do I use the subjunctive?", course_id=3)
        print(result.answer)

    # Async (FastAPI route)
    result = await rag_service.aanswer(question, course_id)
    """

    def __init__(
        self,
        db:                Session,
        provider:          AIProvider,
        embedding_service: EmbeddingService | None = None,
        top_k:             int   = _DEFAULT_TOP_K,
        min_similarity:    float = _DEFAULT_MIN_SIMILARITY,
    ) -> None:
        self._db         = db
        self._embedder   = embedding_service or get_embedding_service()
        self._synthesizer = AnswerSynthesizer(provider)
        self._repo       = VectorRepository(db)
        self._top_k      = top_k
        self._min_sim    = min_similarity

    # ── Public API ────────────────────────────────────────────────────────────

    def answer(
        self,
        question:  str,
        course_id: int,
        lesson_id: int | None = None,
        unit_context: dict | None = None,
    ) -> AnswerResponse:
        """
        Synchronous RAG pipeline.

        Parameters
        ----------
        question : str
            User's question in English or Russian.
        course_id : int
            Scope retrieval to this course.
        lesson_id : int | None
            Further restrict to a single lesson/unit (optional).
        unit_context : dict | None
            Optional unit metadata with 'title' and/or 'description' keys.
            If provided, this metadata is prepended to context chunks.

        Returns
        -------
        AnswerResponse
            Pydantic model with `answer: str` and `enough_context: bool`.
        """
        context_texts = self._retrieve_chunks(question, course_id, lesson_id, unit_context)

        # Tier 2: if no metadata AND no chunks retrieved, signal clearly
        if not context_texts:
            return AnswerResponse(
                answer="Недостаточно информации для ответа на этот вопрос.",
                enough_context=False,
            )

        logger.info(
            "RAG: question=%r course=%d retrieved=%d chunks",
            question[:60],
            course_id,
            len(context_texts),
        )

        return self._synthesizer.synthesize(
            question=question,
            context_chunks=context_texts,
        )

    async def aanswer(
        self,
        question:  str,
        course_id: int,
        lesson_id: int | None = None,
        unit_context: dict | None = None,
    ) -> AnswerResponse:
        """
        Async RAG pipeline — the ENTIRE pipeline (embed + DB + Ollama HTTP)
        runs inside asyncio.to_thread so the event loop is never blocked and
        there is no interaction between PyTorch's internal thread pool and
        httpx.AsyncClient.

        Why not use agenerate / httpx.AsyncClient?
        -------------------------------------------
        When SentenceTransformers finishes encoding (in a prior to_thread call),
        PyTorch's thread pool is still winding down.  httpx.AsyncClient's async
        I/O then competes with those threads for the GIL, which can cause the
        awaited response to never arrive — the classic "works via curl, hangs
        via Python" symptom in Docker.  Running the sync httpx.Client inside a
        dedicated thread avoids the issue entirely.
        """
        return await asyncio.to_thread(
            self.answer, question, course_id, lesson_id, unit_context
        )

    async def aanswer_stream(
        self,
        question: str,
        course_id: int,
        lesson_id: int | None = None,
        unit_context: dict | None = None,
    ):
        """Async generator — retrieves chunks then streams tokens."""
        import asyncio

        # Retrieval is CPU-bound (embedding), run in thread
        chunks = await asyncio.to_thread(
            self._retrieve_chunks, question, course_id, lesson_id, unit_context
        )

        async for token in self._synthesizer.asynthesize_stream(
            question=question,
            context_chunks=chunks,
        ):
            yield token

    # ── Pipeline steps ────────────────────────────────────────────────────────

    def _retrieve(
        self,
        question:  str,
        course_id: int,
        lesson_id: int | None,
    ) -> List[ChunkSearchResult]:
        """Embed the question and run ANN search."""
        query_vector = self._embedder.embed(question)
        return self._repo.search(
            query_embedding = query_vector,
            k               = self._top_k,
            course_id       = course_id,
            lesson_id       = lesson_id,
            min_similarity  = self._min_sim,
        )

    def _retrieve_chunks(
        self,
        question:  str,
        course_id: int,
        lesson_id: int | None,
        unit_context: dict | None = None,
    ) -> List[str]:
        """
        Retrieve chunks and convert to context text strings.
        Handles unit_context injection and returns ready-to-use context chunks.
        """
        chunks = self._retrieve(question, course_id, lesson_id)
        context_texts = self._chunks_to_texts(chunks)

        # Tier 1: inject metadata if available
        if unit_context and (unit_context.get("title") or unit_context.get("description")):
            parts = []
            if unit_context.get("title"):
                parts.append(f"Unit title: {unit_context['title']}")
            if unit_context.get("description"):
                parts.append(f"Unit description: {unit_context['description']}")
            meta = "[UNIT METADATA] " + ". ".join(parts) + "."
            context_texts = [meta] + context_texts

        return context_texts

    @staticmethod
    def _chunks_to_texts(chunks: List[ChunkSearchResult]) -> List[str]:
        """
        Convert search results to plain-text strings for the LLM prompt.

        Truncation strategy: each chunk is capped at 120 words before being
        sent to the LLM.  Full chunks are stored in the DB (good for recall);
        we trim here because prompt tokens are the main driver of inference
        latency on CPU — cutting 40% of context words ≈ 30-40% faster output.

        Chunks are already ranked by similarity; the similarity score is
        included as a lightweight hint so the model can weigh evidence.
        """
        MAX_WORDS = 120
        result = []
        for c in chunks:
            words = c.chunk_text.split()
            text  = " ".join(words[:MAX_WORDS]) + ("…" if len(words) > MAX_WORDS else "")
            result.append(f"[sim:{c.similarity:.2f}] {text}")
        return result

    # ── Diagnostics ───────────────────────────────────────────────────────────

    def retrieve_only(
        self,
        question:  str,
        course_id: int,
        lesson_id: int | None = None,
    ) -> List[ChunkSearchResult]:
        """
        Return raw search results without calling the LLM.
        Useful for debugging retrieval quality without burning tokens.
        """
        return self._retrieve(question, course_id, lesson_id)