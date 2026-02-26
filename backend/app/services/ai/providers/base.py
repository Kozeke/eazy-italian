"""
Base AI provider interface.
"""
from abc import ABC, abstractmethod
from typing import List, Optional, AsyncIterator


class AIProviderError(Exception):
    """Raised when an AI provider request fails."""
    pass


class AIProvider(ABC):
    """Abstract base class for AI/LLM providers."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider identifier (e.g. 'ollama', 'openai')."""
        pass

    @abstractmethod
    async def complete(
        self,
        prompt: str,
        *,
        system_prompt: Optional[str] = None,
        max_tokens: int = 2048,
        temperature: float = 0.7,
        stop: Optional[List[str]] = None,
    ) -> str:
        """Generate a single completion. Returns the generated text."""
        pass

    @abstractmethod
    async def stream(
        self,
        prompt: str,
        *,
        system_prompt: Optional[str] = None,
        max_tokens: int = 2048,
        temperature: float = 0.7,
        stop: Optional[List[str]] = None,
    ) -> AsyncIterator[str]:
        """Stream tokens. Yields text chunks."""
        pass

    async def embed(self, texts: List[str], model: Optional[str] = None) -> List[List[float]]:
        """
        Optional: produce embeddings for a list of texts.
        Override in providers that support embeddings.
        """
        raise NotImplementedError(f"{self.name} does not support embeddings")
