"""
Anthropic Claude API provider (placeholder).
Configure ANTHROPIC_API_KEY to use Claude for completion.
"""
from typing import List, Optional, AsyncIterator

from .base import AIProvider, AIProviderError


class AnthropicProvider(AIProvider):
    """Placeholder for Anthropic API. Implement complete/stream using anthropic package."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: str = "claude-3-5-sonnet-20241022",
    ):
        self._api_key = api_key or ""
        self._model = model

    @property
    def name(self) -> str:
        return "anthropic"

    async def complete(
        self,
        prompt: str,
        *,
        system_prompt: Optional[str] = None,
        max_tokens: int = 2048,
        temperature: float = 0.7,
        stop: Optional[List[str]] = None,
    ) -> str:
        # TODO: use anthropic.AsyncAnthropic and messages.create
        raise NotImplementedError("AnthropicProvider: set ANTHROPIC_API_KEY and implement complete()")

    async def stream(
        self,
        prompt: str,
        *,
        system_prompt: Optional[str] = None,
        max_tokens: int = 2048,
        temperature: float = 0.7,
        stop: Optional[List[str]] = None,
    ) -> AsyncIterator[str]:
        # TODO: use anthropic.AsyncAnthropic and stream messages
        raise NotImplementedError("AnthropicProvider: implement stream()")
