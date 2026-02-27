"""
AnthropicProvider — placeholder implementation.

Swap in a real implementation by:
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
_MAX_TOKENS      = 1024


class AnthropicProvider(AIProvider):
    """
    Calls the Anthropic Messages API.

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

    Status: PLACEHOLDER — fill in the body of `generate` when ready.
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

    # ── AIProvider ────────────────────────────────────────────────────────────

    def generate(self, prompt: str) -> str:
        """
        TODO: replace stub with real Anthropic SDK call.

        import anthropic
        client = anthropic.Anthropic(api_key=self.api_key)
        msg = client.messages.create(
            model=self.model,
            max_tokens=self.max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text
        """
        raise AIProviderError(
            "AnthropicProvider is a placeholder — "
            "install `anthropic` and implement generate()."
        )

    def __repr__(self) -> str:
        masked = f"{self.api_key[:12]}..." if self.api_key else "(none)"
        return f"<AnthropicProvider model={self.model!r} key={masked}>"