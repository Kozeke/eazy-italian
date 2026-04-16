"""
OpenAIProvider — production implementation.

Requirements:
  pip install openai
  export OPENAI_API_KEY=sk-...

The interface is intentionally minimal so the AnswerSynthesizer
never needs to know which backend it is talking to.
"""

from __future__ import annotations

import logging
import os

from app.services.ai.providers.base import AIProvider, AIProviderError

logger = logging.getLogger(__name__)

_DEFAULT_MODEL   = "gpt-4o-mini"
_DEFAULT_TIMEOUT = 60.0
_MAX_TOKENS      = 2048


class OpenAIProvider(AIProvider):
    """
    Calls the OpenAI Chat Completions API (sync + async).

    Parameters
    ----------
    api_key : str
        Reads OPENAI_API_KEY env-var when not supplied explicitly.
    model : str
        OpenAI model name (gpt-4o, gpt-4o-mini, gpt-3.5-turbo, …).
    temperature : float
        Sampling temperature, 0 → deterministic.
    max_tokens : int
        Maximum tokens in the response.
    timeout : float
        HTTP timeout in seconds.
    """

    def __init__(
        self,
        api_key: str | None = None,
        model: str = _DEFAULT_MODEL,
        temperature: float = 0.2,
        max_tokens: int = _MAX_TOKENS,
        timeout: float = _DEFAULT_TIMEOUT,
    ) -> None:
        self.api_key     = api_key or os.environ.get("OPENAI_API_KEY", "")
        self.model       = model
        self.temperature = temperature
        self.max_tokens  = max_tokens
        self.timeout     = timeout

        if not self.api_key:
            raise AIProviderError(
                "OpenAIProvider: OPENAI_API_KEY is not set. "
                "Export the env-var or pass api_key= explicitly."
            )

    # ── AIProvider ────────────────────────────────────────────────────────────

    def generate(self, prompt: str) -> str:
        """Synchronous OpenAI Chat Completions call."""
        try:
            from openai import OpenAI, APIStatusError, APIConnectionError
        except ImportError as exc:
            raise AIProviderError(
                "openai package is not installed. Run: pip install openai"
            ) from exc

        try:
            client = OpenAI(api_key=self.api_key, timeout=self.timeout)
            resp = client.chat.completions.create(
                model=self.model,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
                messages=[{"role": "user", "content": prompt}],
            )
            return resp.choices[0].message.content or ""
        except APIStatusError as exc:
            raise AIProviderError(
                f"OpenAI API error {exc.status_code}: {exc.message}"
            ) from exc
        except APIConnectionError as exc:
            raise AIProviderError(f"OpenAI connection error: {exc}") from exc
        except Exception as exc:
            raise AIProviderError(f"OpenAIProvider.generate failed: {exc}") from exc

    async def agenerate(self, prompt: str) -> str:
        """Async OpenAI Chat Completions call."""
        try:
            from openai import AsyncOpenAI, APIStatusError, APIConnectionError
        except ImportError as exc:
            raise AIProviderError(
                "openai package is not installed. Run: pip install openai"
            ) from exc

        try:
            client = AsyncOpenAI(api_key=self.api_key, timeout=self.timeout)
            resp = await client.chat.completions.create(
                model=self.model,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
                messages=[{"role": "user", "content": prompt}],
            )
            return resp.choices[0].message.content or ""
        except APIStatusError as exc:
            raise AIProviderError(
                f"OpenAI API error {exc.status_code}: {exc.message}"
            ) from exc
        except APIConnectionError as exc:
            raise AIProviderError(f"OpenAI connection error: {exc}") from exc
        except Exception as exc:
            raise AIProviderError(f"OpenAIProvider.agenerate failed: {exc}") from exc

    def __repr__(self) -> str:
        masked = f"{self.api_key[:8]}..." if self.api_key else "(none)"
        return f"<OpenAIProvider model={self.model!r} key={masked}>"