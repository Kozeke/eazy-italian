"""
OpenAIProvider — placeholder implementation.

Swap in a real implementation by:
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


class OpenAIProvider(AIProvider):
    """
    Calls the OpenAI Chat Completions API.

    Parameters
    ----------
    api_key : str
        Reads OPENAI_API_KEY env-var when not supplied explicitly.
    model : str
        OpenAI model name (gpt-4o, gpt-4o-mini, gpt-3.5-turbo, …).
    temperature : float
        Sampling temperature, 0 → deterministic.
    timeout : float
        HTTP timeout in seconds.

    Status: PLACEHOLDER — fill in the body of `generate` when ready.
    """

    def __init__(
        self,
        api_key: str | None = None,
        model: str = _DEFAULT_MODEL,
        temperature: float = 0.2,
        timeout: float = _DEFAULT_TIMEOUT,
    ) -> None:
        self.api_key     = api_key or os.environ.get("OPENAI_API_KEY", "")
        self.model       = model
        self.temperature = temperature
        self.timeout     = timeout

    # ── AIProvider ────────────────────────────────────────────────────────────

    def generate(self, prompt: str) -> str:
        """
        TODO: replace stub with real OpenAI SDK call.

        from openai import OpenAI
        client = OpenAI(api_key=self.api_key, timeout=self.timeout)
        resp = client.chat.completions.create(
            model=self.model,
            temperature=self.temperature,
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.choices[0].message.content or ""
        """
        raise AIProviderError(
            "OpenAIProvider is a placeholder — "
            "install `openai` and implement generate()."
        )

    def __repr__(self) -> str:
        masked = f"{self.api_key[:8]}..." if self.api_key else "(none)"
        return f"<OpenAIProvider model={self.model!r} key={masked}>"