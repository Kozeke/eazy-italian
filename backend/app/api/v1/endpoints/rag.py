"""
app/api/v1/endpoints/rag.py
============================
FastAPI routes that expose the RAG pipeline.

Mount in api_router:
    from app.api.v1.endpoints import rag
    api_router.include_router(rag.router, prefix="/rag", tags=["RAG"])
"""

from __future__ import annotations

import logging
import time
from functools import lru_cache
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

logger = logging.getLogger(__name__)
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.ai.answer_synthesizer import AnswerResponse
from app.services.ai.providers.ollama import LocalLlamaProvider
from app.services.rag_service import RAGService

router = APIRouter()


# ── Provider singleton ─────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def get_ai_provider() -> LocalLlamaProvider:
    """
    Module-level provider cache — one Ollama client for the whole process.
    warm_up() is called here so the model is loaded into Ollama memory
    before the first real request arrives.
    """
    provider = LocalLlamaProvider()
    # Fire-and-forget warm-up: loads the model into Ollama's memory.
    # If Ollama isn't ready yet (e.g. container still starting), this logs
    # a warning and continues — the first real request will be slower.
    provider.warm_up()
    return provider


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


class OllamaHealthResponse(BaseModel):
    status:  str          # "ok" | "error"
    model:   str
    base_url: str
    message: str


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get(
    "/health",
    response_model=OllamaHealthResponse,
    summary="Check Ollama connectivity and model availability",
)
def rag_health(provider: LocalLlamaProvider = Depends(get_ai_provider)) -> OllamaHealthResponse:
    """
    Ping Ollama with a 1-token prompt to verify the model is loaded.
    Use this to debug connectivity before the first /ask call.
    """
    ok = provider.warm_up()
    return OllamaHealthResponse(
        status   = "ok" if ok else "error",
        model    = provider.model,
        base_url = provider.base_url,
        message  = "Ollama is reachable and model is loaded" if ok
                   else "Cannot reach Ollama — check OLLAMA_BASE_URL and that the container is running",
    )


@router.post(
    "/ask",
    response_model=AnswerResponse,
    summary="Ask a question answered from course content (RAG)",
)
async def ask(body: AskRequest, rag: RagDep) -> AnswerResponse:
    """
    Full RAG pipeline:
      1. Embed question  (SentenceTransformers / LaBSE)
      2. Retrieve top-k similar chunks scoped to course_id / lesson_id
      3. Synthesise answer with the local Ollama LLM

    The entire pipeline runs in asyncio.to_thread — no async HTTP on the
    event loop — which avoids the httpx.AsyncClient/PyTorch GIL contention
    that causes indefinite hangs in Docker.

    Returns enough_context: false when the course material does not contain
    a good answer (LLM still tries to help with a caveat).
    """
    preview = (body.question[:80] + "...") if len(body.question) > 80 else body.question
    print(
        f"[RAG /ask] course={body.course_id} lesson={body.lesson_id} "
        f"q={preview!r}",
        flush=True,
    )

    t0 = time.perf_counter()
    try:
        result = await rag.aanswer(
            question  = body.question,
            course_id = body.course_id,
            lesson_id = body.lesson_id,
        )
        elapsed = time.perf_counter() - t0
        print(f"[RAG /ask] done in {elapsed:.1f}s enough_context={result.enough_context}", flush=True)
        return result

    except Exception as exc:
        elapsed = time.perf_counter() - t0
        print(f"[RAG /ask] failed after {elapsed:.1f}s — {exc}", flush=True)
        logger.exception("RAG /ask failed: %s", exc)
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
    Returns raw vector search results — useful for testing retrieval quality
    without spending LLM tokens.
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
            "chunk_text":  c.chunk_text[:300],
        }
        for c in chunks
    ]