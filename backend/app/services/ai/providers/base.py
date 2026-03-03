"""
AIProvider — model-agnostic interface for text generation.

Every concrete provider must implement `generate(prompt) -> str`.
Async variant `agenerate` has a default implementation via
`asyncio.to_thread` so sync providers work in async FastAPI handlers
without blocking the event-loop.
"""

from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod


class AIProvider(ABC):
    """
    Abstract base class for LLM backends.

    Implementations
    ---------------
    LocalLlamaProvider   — Ollama local LLM via HTTP
    OpenAIProvider       — OpenAI API (placeholder)
    AnthropicProvider    — Anthropic API (placeholder)
    """

    # ── required ──────────────────────────────────────────────────────────────

    @abstractmethod
    def generate(self, prompt: str) -> str:
        """
        Send *prompt* to the underlying model and return the text reply.

        Parameters
        ----------
        prompt : str
            Full prompt string (system + user already merged by caller,
            or a raw user message — depends on provider).

        Returns
        -------
        str
            Raw text content from the model.

        Raises
        ------
        AIProviderError
            On any network / API / model error.
        """

    # ── optional async variant ────────────────────────────────────────────────

    async def agenerate(self, prompt: str) -> str:
        """
        Async version — defaults to running `generate` in a thread pool.
        Override for providers that have a native async SDK.
        """
        return await asyncio.to_thread(self.generate, prompt)

    # ── dunder ────────────────────────────────────────────────────────────────

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__}>"


# ── shared exception ──────────────────────────────────────────────────────────

class AIProviderError(RuntimeError):
    """Raised when a provider cannot fulfil a generation request."""