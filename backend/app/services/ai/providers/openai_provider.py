"""
OpenAI API provider (placeholder).
Configure OPENAI_API_KEY and use OpenAI models for completion/embedding.
"""
from typing import List, Optional, AsyncIterator

from .base import AIProvider, AIProviderError


class OpenAIProvider(AIProvider):
    """Placeholder for OpenAI API. Implement complete/stream using openai package."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: str = "gpt-4o-mini",
        base_url: Optional[str] = None,
    ):
        self._api_key = api_key or ""
        self._model = model
        self._base_url = base_url

    @property
    def name(self) -> str:
        return "openai"

    async def complete(
        self,
        prompt: str,
        *,
        system_prompt: Optional[str] = None,
        max_tokens: int = 2048,
        temperature: float = 0.7,
        stop: Optional[List[str]] = None,
    ) -> str:
        # TODO: use openai.AsyncOpenAI and chat.completions.create
        raise NotImplementedError("OpenAIProvider: set OPENAI_API_KEY and implement complete()")

    async def stream(
        self,
        prompt: str,
        *,
        system_prompt: Optional[str] = None,
        max_tokens: int = 2048,
        temperature: float = 0.7,
        stop: Optional[List[str]] = None,
    ) -> AsyncIterator[str]:
        # TODO: use openai.AsyncOpenAI and stream chat.completions
        raise NotImplementedError("OpenAIProvider: implement stream()")
