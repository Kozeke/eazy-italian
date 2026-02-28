"""
LocalLlamaProvider — calls a locally running Ollama instance.

Ollama exposes a REST API at http://localhost:11434 by default.
Any model pulled via `ollama pull <model>` can be referenced
by name (e.g. "llama3", "mistral", "phi3", "gemma2").

Environment variables
---------------------
OLLAMA_BASE_URL   default: http://localhost:11434
OLLAMA_MODEL      default: llama3.2

Install Ollama: https://ollama.com/download
Pull a model  : ollama pull llama3.2
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from app.services.ai.providers.base import AIProvider, AIProviderError

logger = logging.getLogger(__name__)

_DEFAULT_BASE_URL = "http://localhost:11434"
_DEFAULT_MODEL    = "llama3.2"

# 120 s is not enough when Ollama cold-starts a model (unloaded after 5 min
# of inactivity).  Default to 5 minutes; override via OLLAMA_TIMEOUT env-var.
_DEFAULT_TIMEOUT  = float(os.environ.get("OLLAMA_TIMEOUT", "300"))


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
        # Persistent sync client — reuse TCP connections across requests
        self._client    = httpx.Client(
            base_url = self.base_url,
            timeout  = self.timeout,
        )

    def warm_up(self) -> bool:
        """
        Send a trivial prompt to load the model into Ollama's memory.
        Call once at startup so the first real request isn't slow.
        Returns True if Ollama is reachable, False otherwise.
        """
        try:
            resp = self._client.post("/api/generate", json={
                "model":  self.model,
                "prompt": " ",
                "stream": False,
                "options": {"num_predict": 1},
            })
            resp.raise_for_status()
            logger.info("Ollama warm-up OK — model=%s", self.model)
            return True
        except Exception as exc:
            logger.warning("Ollama warm-up failed (will retry on first request): %s", exc)
            return False

    # ── AIProvider ────────────────────────────────────────────────────────────

    def generate(self, prompt: str) -> str:
        """
        POST /api/generate with stream=false → return full response text.
        Uses a persistent httpx.Client for TCP connection reuse.
        """
        payload = {
            "model":   self.model,
            "prompt":  prompt,
            "stream":  False,
            "options": self.options,
        }

        logger.debug("Ollama request → model=%s", self.model)

        try:
            resp = self._client.post("/api/generate", json=payload)
            resp.raise_for_status()
        except httpx.TimeoutException as exc:
            raise AIProviderError(
                f"Ollama timed out after {self.timeout}s — "
                "increase OLLAMA_TIMEOUT or use a smaller model"
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
        logger.debug("Ollama response — eval_count=%s", data.get("eval_count", "?"))
        return data.get("response", "")

    async def agenerate(self, prompt: str) -> str:
        """
        Async wrapper — delegates to the sync generate() via asyncio.to_thread.

        We intentionally do NOT use httpx.AsyncClient here.  In Docker
        environments, httpx.AsyncClient can hang indefinitely when PyTorch's
        thread pool (used by the embedding step) competes with asyncio's I/O
        loop for the GIL.  The sync client in a thread pool thread is reliable
        and avoids the issue entirely.
        """
        import asyncio
        return await asyncio.to_thread(self.generate, prompt)

    def __repr__(self) -> str:
        return f"<LocalLlamaProvider model={self.model!r} url={self.base_url!r}>"