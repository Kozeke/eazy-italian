"""
DeepSeekProvider — calls the DeepSeek AI API (OpenAI-compatible).

DeepSeek offers high-quality instruction-following and code models
(deepseek-chat, deepseek-coder …) via an API that mirrors OpenAI's
chat-completions interface.

Environment variables
---------------------
DEEPSEEK_API_KEY   required — get yours at https://platform.deepseek.com/api_keys
DEEPSEEK_MODEL     default: deepseek-chat
DEEPSEEK_TIMEOUT   default: 90  (seconds — DeepSeek inference is slower than Groq)

Install: no extra dependency — uses httpx which is already in your stack.

Quick start
-----------
provider = DeepSeekProvider()
answer   = provider.generate("Explain RAG in one sentence.")

# or pass it explicitly to your test generator service
# questions = await your_generate_mcq_function(..., provider=DeepSeekProvider())

Available models (as of 2025)
------------------------------
deepseek-chat      ← recommended default (best quality / cost ratio)
deepseek-reasoner  ← chain-of-thought reasoning model (slower, more thorough)
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from app.services.ai.providers.base import AIProvider, AIProviderError

logger = logging.getLogger(__name__)

_DEEPSEEK_API_BASE = "https://api.deepseek.com/v1"
_DEFAULT_MODEL     = "deepseek-chat"
_DEFAULT_TIMEOUT   = float(os.environ.get("DEEPSEEK_TIMEOUT", "90"))
_MAX_TOKENS        = 8000


class DeepSeekProvider(AIProvider):
    """
    Text generation via DeepSeek's OpenAI-compatible Chat Completions API.

    DeepSeek is a drop-in replacement for OpenAI's API — same endpoint shape,
    same JSON response format — with competitive quality on instruction-following
    and reasoning tasks at a lower cost than GPT-4 class models.

    Parameters
    ----------
    api_key : str | None
        DeepSeek API key.  Falls back to DEEPSEEK_API_KEY env-var.
    model : str
        Model tag.  Falls back to DEEPSEEK_MODEL env-var (default: deepseek-chat).
    temperature : float
        Sampling temperature (0 = deterministic, 1 = creative).
        Keep low (0.1–0.3) for structured JSON output like MCQ generation.
    max_tokens : int
        Maximum completion tokens.
    timeout : float
        HTTP timeout in seconds.  DeepSeek is slower than Groq; 90 s is recommended.
    system_prompt : str | None
        Optional system message prepended to every request.
        Useful for setting a global persona or output format constraint.
    json_mode : bool
        When True, sets ``response_format={"type": "json_object"}`` so the model
        always returns valid JSON.  The prompt must still ask for JSON explicitly.

    Example
    -------
    provider = DeepSeekProvider(temperature=0.1, json_mode=True)
    result   = provider.generate("List three Italian greetings as JSON.")
    """

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        temperature: float = 0.2,
        max_tokens: int = _MAX_TOKENS,
        timeout: float = _DEFAULT_TIMEOUT,
        system_prompt: str | None = None,
        json_mode: bool = False,
    ) -> None:
        self.api_key       = api_key or os.environ.get("DEEPSEEK_API_KEY", "")
        self.model         = model or os.environ.get("DEEPSEEK_MODEL", _DEFAULT_MODEL)
        self.temperature   = temperature
        self.max_tokens    = max_tokens
        self.timeout       = timeout
        self.system_prompt = system_prompt
        self.json_mode     = json_mode

        if not self.api_key:
            raise AIProviderError(
                "DeepSeek API key is missing — set the DEEPSEEK_API_KEY environment variable "
                "or pass api_key= to DeepSeekProvider()."
            )

        # Persistent client — reuses TCP connections across requests (same
        # pattern as GroqProvider)
        self._client = httpx.Client(
            base_url=_DEEPSEEK_API_BASE,
            timeout=self.timeout,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type":  "application/json",
            },
        )

    # ── internal helpers ──────────────────────────────────────────────────────

    def _build_messages(self, prompt: str) -> list[dict[str, str]]:
        """Assemble the messages array, optionally prepending a system prompt."""
        messages: list[dict[str, str]] = []
        if self.system_prompt:
            messages.append({"role": "system", "content": self.system_prompt})
        messages.append({"role": "user", "content": prompt})
        return messages

    def _build_payload(self, prompt: str) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model":       self.model,
            "messages":    self._build_messages(prompt),
            "temperature": self.temperature,
            "max_tokens":  self.max_tokens,
            "stream":      False,
        }
        if self.json_mode:
            payload["response_format"] = {"type": "json_object"}
        return payload

    @staticmethod
    def _handle_http_error(exc: httpx.HTTPStatusError) -> None:
        """Convert DeepSeek HTTP errors into AIProviderError with a readable message."""
        status = exc.response.status_code
        try:
            body   = exc.response.json()
            detail = body.get("error", {}).get("message", exc.response.text)
        except Exception:
            detail = exc.response.text

        if status == 401:
            raise AIProviderError(
                "DeepSeek authentication failed — check your DEEPSEEK_API_KEY."
            ) from exc
        if status == 429:
            raise AIProviderError(
                "DeepSeek rate limit reached — slow down requests or upgrade your plan."
            ) from exc
        if status == 503:
            raise AIProviderError(
                f"DeepSeek service unavailable: {detail}"
            ) from exc
        raise AIProviderError(f"DeepSeek HTTP {status}: {detail}") from exc

    # ── AIProvider: sync ──────────────────────────────────────────────────────

    def generate(self, prompt: str) -> str:
        """
        POST /chat/completions (non-streaming) and return the reply text.

        DeepSeek typically responds in 5–20 seconds for deepseek-chat.
        The default timeout of 90 s accommodates long structured outputs.
        """
        payload = self._build_payload(prompt)
        logger.debug("DeepSeek request → model=%s temp=%.2f", self.model, self.temperature)

        try:
            resp = self._client.post("/chat/completions", json=payload)
            resp.raise_for_status()
        except httpx.TimeoutException as exc:
            raise AIProviderError(
                f"DeepSeek timed out after {self.timeout}s — "
                "increase DEEPSEEK_TIMEOUT or reduce max_tokens."
            ) from exc
        except httpx.HTTPStatusError as exc:
            self._handle_http_error(exc)
        except httpx.RequestError as exc:
            raise AIProviderError(
                f"Cannot reach DeepSeek API at {_DEEPSEEK_API_BASE}: {exc}"
            ) from exc

        data = resp.json()
        logger.debug(
            "DeepSeek response — model=%s tokens_used=%s",
            data.get("model"),
            data.get("usage", {}).get("total_tokens", "?"),
        )
        return data["choices"][0]["message"]["content"]

    # ── AIProvider: async ─────────────────────────────────────────────────────

    async def agenerate(self, prompt: str) -> str:
        """
        Async variant — runs generate() in a thread-pool thread.

        We deliberately avoid httpx.AsyncClient here for the same reason as
        GroqProvider: in Docker environments with PyTorch workers the sync
        client in a thread is more reliable than mixing async HTTP with the
        asyncio event loop.
        """
        import asyncio
        return await asyncio.to_thread(self.generate, prompt)

    # ── misc ──────────────────────────────────────────────────────────────────

    def __repr__(self) -> str:
        masked = f"{self.api_key[:8]}..." if self.api_key else "(none)"
        return f"<DeepSeekProvider model={self.model!r} key={masked}>"