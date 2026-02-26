"""
RAG API: POST /rag/ask and POST /rag/retrieve.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.auth import get_current_user
from app.models.user import User
from app.services.rag_service import RAGService
from app.services.ai.providers.ollama import LocalLlamaProvider
from app.services.ai.answer_synthesizer import AnswerResponse

router = APIRouter()


# ─── Request/Response schemas ─────────────────────────────────────────────────

class RAGAskRequest(BaseModel):
    question: str = Field(..., min_length=1, description="User question")
    top_k: int = Field(5, ge=1, le=20, description="Number of chunks to retrieve")
    lesson_id: Optional[str] = Field(None, description="Filter chunks by lesson id")


class RAGAskResponse(BaseModel):
    answer: str
    enough_context: bool


class RAGRetrieveRequest(BaseModel):
    question: str = Field(..., min_length=1, description="Query for semantic search")
    top_k: int = Field(5, ge=1, le=20, description="Number of chunks to return")
    lesson_id: Optional[str] = Field(None, description="Filter by lesson id")


class RetrievedChunk(BaseModel):
    id: str
    lesson_id: Optional[str]
    content: str
    meta: dict
    distance: float


class RAGRetrieveResponse(BaseModel):
    chunks: List[RetrievedChunk]


# ─── Dependency: RAG service with default Ollama provider ────────────────────

def get_rag_service() -> RAGService:
    provider = LocalLlamaProvider()
    return RAGService(provider=provider)


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/ask", response_model=RAGAskResponse)
async def rag_ask(
    body: RAGAskRequest,
    current_user: User = Depends(get_current_user),
    rag: RAGService = Depends(get_rag_service),
) -> RAGAskResponse:
    """
    RAG pipeline: embed question → retrieve top-k chunks → synthesize answer.
    """
    try:
        result: AnswerResponse = await rag.ask(
            question=body.question,
            top_k=body.top_k,
            lesson_id=body.lesson_id,
        )
        return RAGAskResponse(
            answer=result.answer,
            enough_context=result.enough_context,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/retrieve", response_model=RAGRetrieveResponse)
async def rag_retrieve(
    body: RAGRetrieveRequest,
    current_user: User = Depends(get_current_user),
    rag: RAGService = Depends(get_rag_service),
) -> RAGRetrieveResponse:
    """
    Semantic retrieval only: embed question and return top-k chunks (no LLM).
    """
    try:
        chunks = rag.retrieve(
            question=body.question,
            top_k=body.top_k,
            lesson_id=body.lesson_id,
        )
        return RAGRetrieveResponse(
            chunks=[
                RetrievedChunk(
                    id=c["id"],
                    lesson_id=c.get("lesson_id"),
                    content=c["content"],
                    meta=c.get("meta") or {},
                    distance=c["distance"],
                )
                for c in chunks
            ]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
