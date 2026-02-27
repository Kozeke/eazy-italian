"""
LocalLlamaProvider — calls a locally running Ollama instance.

Ollama exposes a REST API at http://localhost:11434 by default.
Any model pulled via `ollama pull <model>` can be referenced
by name (e.g. "llama3", "mistral", "phi3", "gemma2").

Environment variables
---------------------
OLLAMA_BASE_URL   default: http://localhost:11434
OLLAMA_MODEL      default: llama3

Install Ollama: https://ollama.com/download
Pull a model  : ollama pull llama3
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from app.services.ai.providers.base import AIProvider, AIProviderError

logger = logging.getLogger(__name__)

_DEFAULT_BASE_URL = "http://localhost:11434"
_DEFAULT_MODEL    = "llama3"
_DEFAULT_TIMEOUT  = 120.0          # seconds — local inference can be slow


class LocalLlamaProvider(AIProvider):
    """
    Generates text by POSTing to the Ollama /api/generate endpoint.

    Parameters
    ----------
    base_url : str
        Ollama server URL.  Reads OLLAMA_BASE_URL env-var as fallback.
    model : str
        Model tag recognised by Ollama.  Reads OLLAMA_MODEL env-var.
    timeout : float
        HTTP request timeout in seconds.
    options : dict
        Ollama model options forwarded verbatim (temperature, top_p, …).

    Example
    -------
    provider = LocalLlamaProvider(model="mistral")
    answer   = provider.generate("Explain RAG in one sentence.")
    """

    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
        timeout: float = _DEFAULT_TIMEOUT,
        options: dict[str, Any] | None = None,
    ) -> None:
        self.base_url: str = (
            base_url or os.environ.get("OLLAMA_BASE_URL", _DEFAULT_BASE_URL)
        ).rstrip("/")
        self.model: str = model or os.environ.get("OLLAMA_MODEL", _DEFAULT_MODEL)
        self.timeout    = timeout
        self.options    = options or {}

    # ── AIProvider ────────────────────────────────────────────────────────────

    def generate(self, prompt: str) -> str:
        """
        POST /api/generate with `stream=false` → return full response text.
        """
        url     = f"{self.base_url}/api/generate"
        payload = {
            "model":  self.model,
            "prompt": prompt,
            "stream": False,
            "options": self.options,
        }

        logger.debug("Ollama request → model=%s url=%s", self.model, url)

        try:
            with httpx.Client(timeout=self.timeout) as client:
                resp = client.post(url, json=payload)
                resp.raise_for_status()
        except httpx.TimeoutException as exc:
            raise AIProviderError(
                f"Ollama timed out after {self.timeout}s"
            ) from exc
        except httpx.HTTPStatusError as exc:
            raise AIProviderError(
                f"Ollama HTTP {exc.response.status_code}: {exc.response.text}"
            ) from exc
        except httpx.RequestError as exc:
            raise AIProviderError(
                f"Cannot reach Ollama at {self.base_url}: {exc}"
            ) from exc

        data = resp.json()
        text: str = data.get("response", "")
        logger.debug(
            "Ollama response — tokens: %s",
            data.get("eval_count", "?"),
        )
        return text

    async def agenerate(self, prompt: str) -> str:
        """
        Async version using httpx.AsyncClient — does NOT block the event loop.
        """
        url     = f"{self.base_url}/api/generate"
        payload = {
            "model":  self.model,
            "prompt": prompt,
            "stream": False,
            "options": self.options,
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
        except httpx.TimeoutException as exc:
            raise AIProviderError(
                f"Ollama timed out after {self.timeout}s"
            ) from exc
        except httpx.HTTPStatusError as exc:
            raise AIProviderError(
                f"Ollama HTTP {exc.response.status_code}: {exc.response.text}"
            ) from exc
        except httpx.RequestError as exc:
            raise AIProviderError(
                f"Cannot reach Ollama at {self.base_url}: {exc}"
            ) from exc

        return resp.json().get("response", "")

    def __repr__(self) -> str:
        return f"<LocalLlamaProvider model={self.model!r} url={self.base_url!r}>"