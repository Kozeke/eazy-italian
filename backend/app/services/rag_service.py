"""
RAG service: embed question → retrieve top-k chunks → synthesize answer.
"""
from __future__ import annotations

from typing import List, Optional

from app.services.ai.embedding_service import get_embedding_service
from app.services.ai.answer_synthesizer import AnswerSynthesizer, AnswerResponse
from app.services.ai.providers.base import AIProvider
from app.repositories.vector_repository import cosine_search


class RAGService:
    """
    Orchestrates: embed(question) → cosine_search → AnswerSynthesizer.asynthesize.
    """

    def __init__(
        self,
        embedding_service=None,
        synthesizer: Optional[AnswerSynthesizer] = None,
        provider: Optional[AIProvider] = None,
    ) -> None:
        self._embedding_service = embedding_service or get_embedding_service()
        self._provider = provider
        self._synthesizer = synthesizer or (
            AnswerSynthesizer(provider) if provider else None
        )
        if self._synthesizer is None and provider is None:
            raise ValueError("RAGService requires either synthesizer or provider")

    @property
    def synthesizer(self) -> AnswerSynthesizer:
        if self._synthesizer is None and self._provider is not None:
            self._synthesizer = AnswerSynthesizer(self._provider)
        if self._synthesizer is None:
            raise ValueError("RAGService: no synthesizer or provider set")
        return self._synthesizer

    async def ask(
        self,
        question: str,
        top_k: int = 5,
        lesson_id: Optional[str] = None,
    ) -> AnswerResponse:
        """
        RAG pipeline: embed question, retrieve top_k chunks, synthesize answer.
        """
        if not question or not question.strip():
            from app.services.ai.answer_synthesizer import AnswerResponse
            return AnswerResponse(
                answer="Please ask a question.",
                enough_context=False,
            )

        # 1) Embed question (sync; run in executor if needed to avoid blocking)
        embedding = self._embedding_service.embed(question.strip())

        # 2) Retrieve top-k by cosine similarity
        chunks = cosine_search(embedding, top_k=top_k, lesson_id=lesson_id)
        context_chunks = [c["content"] for c in chunks]

        # 3) Synthesize answer
        return await self.synthesizer.asynthesize(question.strip(), context_chunks)

    def retrieve(
        self,
        question: str,
        top_k: int = 5,
        lesson_id: Optional[str] = None,
    ) -> List[dict]:
        """
        Retrieve only: embed question and return top_k chunks (no LLM call).
        Each item: {"id", "lesson_id", "content", "meta", "distance"}.
        """
        if not question or not question.strip():
            return []
        embedding = self._embedding_service.embed(question.strip())
        return cosine_search(embedding, top_k=top_k, lesson_id=lesson_id)
