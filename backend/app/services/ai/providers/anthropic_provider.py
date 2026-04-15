"""
AnthropicProvider — production implementation.

Requirements:
  pip install anthropic
  export ANTHROPIC_API_KEY=sk-ant-...
"""

from __future__ import annotations

import logging
import os

from app.services.ai.providers.base import AIProvider, AIProviderError

logger = logging.getLogger(__name__)

_DEFAULT_MODEL   = "claude-sonnet-4-20250514"
_DEFAULT_TIMEOUT = 60.0
_MAX_TOKENS      = 2048


class AnthropicProvider(AIProvider):
    """
    Calls the Anthropic Messages API (sync + async).

    Parameters
    ----------
    api_key : str
        Reads ANTHROPIC_API_KEY env-var when not supplied explicitly.
    model : str
        Anthropic model string.
    temperature : float
        Sampling temperature.
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
        self.api_key     = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        self.model       = model
        self.temperature = temperature
        self.max_tokens  = max_tokens
        self.timeout     = timeout

        if not self.api_key:
            raise AIProviderError(
                "AnthropicProvider: ANTHROPIC_API_KEY is not set. "
                "Export the env-var or pass api_key= explicitly."
            )

    # ── AIProvider ────────────────────────────────────────────────────────────

    def generate(self, prompt: str) -> str:
        """Synchronous Anthropic Messages call."""
        try:
            import anthropic
        except ImportError as exc:
            raise AIProviderError(
                "anthropic package is not installed. Run: pip install anthropic"
            ) from exc

        try:
            client = anthropic.Anthropic(api_key=self.api_key)
            msg = client.messages.create(
                model=self.model,
                max_tokens=self.max_tokens,
                temperature=self.temperature,
                messages=[{"role": "user", "content": prompt}],
            )
            return msg.content[0].text
        except anthropic.APIStatusError as exc:
            raise AIProviderError(
                f"Anthropic API error {exc.status_code}: {exc.message}"
            ) from exc
        except anthropic.APIConnectionError as exc:
            raise AIProviderError(f"Anthropic connection error: {exc}") from exc
        except Exception as exc:
            raise AIProviderError(f"AnthropicProvider.generate failed: {exc}") from exc

    async def agenerate(self, prompt: str) -> str:
        """Async Anthropic Messages call."""
        try:
            import anthropic
        except ImportError as exc:
            raise AIProviderError(
                "anthropic package is not installed. Run: pip install anthropic"
            ) from exc

        try:
            client = anthropic.AsyncAnthropic(api_key=self.api_key)
            msg = await client.messages.create(
                model=self.model,
                max_tokens=self.max_tokens,
                temperature=self.temperature,
                messages=[{"role": "user", "content": prompt}],
            )
            return msg.content[0].text
        except anthropic.APIStatusError as exc:
            raise AIProviderError(
                f"Anthropic API error {exc.status_code}: {exc.message}"
            ) from exc
        except anthropic.APIConnectionError as exc:
            raise AIProviderError(f"Anthropic connection error: {exc}") from exc
        except Exception as exc:
            raise AIProviderError(f"AnthropicProvider.agenerate failed: {exc}") from exc

    def __repr__(self) -> str:
        masked = f"{self.api_key[:12]}..." if self.api_key else "(none)"
        return f"<AnthropicProvider model={self.model!r} key={masked}>"