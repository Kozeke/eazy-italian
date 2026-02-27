"""
app/api/v1/endpoints/rag.py
============================
FastAPI routes that expose the RAG pipeline.

Mount in api_router:
    from app.api.v1.endpoints import rag
    api_router.include_router(rag.router, prefix="/rag", tags=["RAG"])
"""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db                             # existing dep
from app.services.ai.answer_synthesizer import AnswerResponse
from app.services.ai.providers.ollama import LocalLlamaProvider
from app.services.rag_service import RAGService

router = APIRouter()


# ── Provider singleton ─────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def get_ai_provider() -> LocalLlamaProvider:
    """
    Module-level provider cache — one Ollama client for the whole process.
    Replace LocalLlamaProvider with OpenAIProvider / AnthropicProvider here
    when switching backends.
    """
    return LocalLlamaProvider()


# ── FastAPI dependency ─────────────────────────────────────────────────────────

def get_rag_service(
    db:       Session              = Depends(get_db),
    provider: LocalLlamaProvider   = Depends(get_ai_provider),
) -> RAGService:
    return RAGService(db=db, provider=provider)


RagDep = Annotated[RAGService, Depends(get_rag_service)]


# ── Request / Response schemas ────────────────────────────────────────────────

class AskRequest(BaseModel):
    question:  str = Field(..., min_length=3, max_length=1000)
    course_id: int = Field(..., gt=0)
    lesson_id: int | None = Field(None, gt=0)


class RetrieveRequest(BaseModel):
    question:  str = Field(..., min_length=3)
    course_id: int = Field(..., gt=0)
    lesson_id: int | None = None
    k:         int = Field(5, ge=1, le=20)


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post(
    "/ask",
    response_model=AnswerResponse,
    summary="Ask a question answered from course content (RAG)",
)
async def ask(body: AskRequest, rag: RagDep) -> AnswerResponse:
    """
    Full RAG pipeline:
      1. Embed question
      2. Retrieve top-k similar chunks scoped to `course_id`
      3. Synthesise answer with the LLM

    Returns `enough_context: false` when the course material does not
    contain a good answer — the LLM still tries to help.
    """
    try:
        return await rag.aanswer(
            question  = body.question,
            course_id = body.course_id,
            lesson_id = body.lesson_id,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"RAG pipeline error: {exc}",
        )


@router.post(
    "/retrieve",
    summary="Debug: retrieve chunks without calling the LLM",
)
async def retrieve(body: RetrieveRequest, rag: RagDep) -> list[dict]:
    """
    Returns the raw vector search results — useful for testing
    retrieval quality without spending LLM tokens.
    """
    import asyncio
    from app.repositories.vector_repository import ChunkSearchResult

    chunks: list[ChunkSearchResult] = await asyncio.to_thread(
        rag.retrieve_only,
        body.question,
        body.course_id,
        body.lesson_id,
    )
    return [
        {
            "chunk_id":    str(c.chunk_id),
            "lesson_id":   c.lesson_id,
            "chunk_index": c.chunk_index,
            "similarity":  round(c.similarity, 4),
            "chunk_text":  c.chunk_text[:300],   # truncate for API response
        }
        for c in chunks
    ]