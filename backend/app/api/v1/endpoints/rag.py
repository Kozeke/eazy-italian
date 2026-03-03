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
from fastapi.responses import StreamingResponse

logger = logging.getLogger(__name__)
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.unit import Unit
from app.services.ai.answer_synthesizer import AnswerResponse
from app.services.ai.providers.base import AIProvider
from app.services.rag_service import RAGService
from app.services.ai_test_generator import _default_provider

router = APIRouter()


# ── Provider singleton ─────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def get_ai_provider() -> AIProvider:
    """
    Module-level provider cache — uses the default provider from ai_test_generator.
    This respects the AI_PROVIDER env-var (groq/ollama) set at import time.
    No warm-up needed for Groq (external API), and Ollama warm-up is optional.
    """
    # Use the same provider instance as test generation
    provider = _default_provider
    # Optional warm-up for Ollama (no-op for Groq)
    if hasattr(provider, 'warm_up'):
        try:
            provider.warm_up()
        except Exception:
            # Non-fatal — will work on first request (just slower)
            pass
    return provider


# ── FastAPI dependency ─────────────────────────────────────────────────────────

def get_rag_service(
    db:       Session     = Depends(get_db),
    provider: AIProvider  = Depends(get_ai_provider),
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


class AIProviderHealthResponse(BaseModel):
    status:  str          # "ok" | "error"
    model:   str
    provider_type: str    # "groq" | "ollama" | etc.
    base_url: str | None
    message: str


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get(
    "/health",
    response_model=AIProviderHealthResponse,
    summary="Check AI provider connectivity and model availability",
)
def rag_health(provider: AIProvider = Depends(get_ai_provider)) -> AIProviderHealthResponse:
    """
    Check AI provider connectivity. For Ollama, pings with a 1-token prompt.
    For Groq, just verifies the provider is initialized.
    Use this to debug connectivity before the first /ask call.
    """
    provider_type = type(provider).__name__
    base_url = getattr(provider, 'base_url', None)
    
    # Try warm-up for Ollama (no-op for Groq)
    ok = True
    message = f"{provider_type} is ready"
    if hasattr(provider, 'warm_up'):
        ok = provider.warm_up()
        if not ok:
            message = f"Cannot reach {provider_type} — check configuration"
    elif provider_type == "GroqProvider":
        message = "Groq API is configured and ready"
    
    return AIProviderHealthResponse(
        status   = "ok" if ok else "error",
        model    = provider.model,
        provider_type = provider_type,
        base_url = base_url,
        message  = message,
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
      3. Synthesise answer with the AI provider (Groq/Ollama based on AI_PROVIDER env-var)

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

    # Fetch unit metadata defensively
    unit_context = None
    if body.lesson_id:
        unit = rag._db.query(Unit).filter(Unit.id == body.lesson_id).first()
        if unit:
            unit_context = {
                "title": unit.title or "",
                "description": unit.description or "",
            }
        # If unit not found, unit_context stays None — pipeline still works

    t0 = time.perf_counter()
    try:
        result = await rag.aanswer(
            question  = body.question,
            course_id = body.course_id,
            lesson_id = body.lesson_id,
            unit_context = unit_context,
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
    "/ask/stream",
    summary="Streaming RAG — tokens arrive in real time via SSE",
)
async def ask_stream(body: AskRequest, rag: RagDep):
    """
    Same pipeline as /ask but returns a text/event-stream response.

    Each SSE event:   data: <token>\n\n
    Final event:      data: __DONE__{"enough_context": true}__END__\n\n

    The frontend reads this with a ReadableStream / EventSource reader.
    """
    # Fetch unit metadata (same as /ask)
    unit_context = None
    if body.lesson_id:
        unit = rag._db.query(Unit).filter(Unit.id == body.lesson_id).first()
        if unit:
            unit_context = {"title": unit.title or "", "description": unit.description or ""}

    async def event_generator():
        try:
            async for token in rag.aanswer_stream(
                question=body.question,
                course_id=body.course_id,
                lesson_id=body.lesson_id,
                unit_context=unit_context,
            ):
                # SSE format: "data: <payload>\n\n"
                yield f"data: {token}\n\n"
        except Exception as exc:
            logger.exception("RAG /ask/stream failed: %s", exc)
            yield f"data: __ERROR__{exc}__END__\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # disable nginx buffering
        },
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