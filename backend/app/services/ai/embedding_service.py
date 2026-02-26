"""
Embedding service: produce vector embeddings for text (e.g. for search/RAG).
Uses a configurable provider; defaults to a placeholder that raises until configured.
"""
from typing import List, Optional

from .providers.base import AIProvider, AIProviderError


class EmbeddingService:
    """Produces embeddings for a list of texts."""

    def __init__(self, provider: Optional[AIProvider] = None, embedding_model: Optional[str] = None):
        self._provider = provider
        self._embedding_model = embedding_model

    async def embed(self, texts: List[str], model: Optional[str] = None) -> List[List[float]]:
        """Return one embedding vector per input text. Each vector is a list of floats."""
        provider = self._provider
        if provider is None:
            raise AIProviderError("EmbeddingService: no provider configured")
        model = model or self._embedding_model
        return await provider.embed(texts, model=model)

    async def embed_one(self, text: str, model: Optional[str] = None) -> List[float]:
        """Convenience: embed a single string; returns a single vector."""
        vectors = await self.embed([text], model=model)
        return vectors[0] if vectors else []


_embedding_service: Optional[EmbeddingService] = None


def get_embedding_service(
    provider: Optional[AIProvider] = None,
    embedding_model: Optional[str] = None,
) -> EmbeddingService:
    """Return the global EmbeddingService instance. Creates one with default provider if not set."""
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService(provider=provider, embedding_model=embedding_model)
    return _embedding_service
