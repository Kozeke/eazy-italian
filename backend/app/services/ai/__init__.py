"""
app.services.ai
~~~~~~~~~~~~~~~
Model-agnostic AI layer:

  EmbeddingService   — multilingual EN+RU sentence embeddings (LaBSE)
  AIProvider         — abstract interface for text generation
  AnswerSynthesizer  — RAG prompt builder + structured response parser
"""

from app.services.ai.embedding_service import EmbeddingService, get_embedding_service
from app.services.ai.answer_synthesizer import AnswerSynthesizer, AnswerResponse
from app.services.ai.providers.base import AIProvider, AIProviderError
from app.services.ai.providers.ollama import LocalLlamaProvider
from app.services.ai.providers.openai_provider import OpenAIProvider
from app.services.ai.providers.anthropic_provider import AnthropicProvider

__all__ = [
    # embeddings
    "EmbeddingService",
    "get_embedding_service",
    # generation
    "AIProvider",
    "AIProviderError",
    "LocalLlamaProvider",
    "OpenAIProvider",
    "AnthropicProvider",
    # rag
    "AnswerSynthesizer",
    "AnswerResponse",
]