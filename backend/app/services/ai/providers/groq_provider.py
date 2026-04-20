"""
GroqProvider — calls the Groq Cloud API (OpenAI-compatible).

Groq offers extremely fast inference for open-source models
(LLaMA 3, Mixtral, Gemma …) via a hosted API.

Environment variables
---------------------
GROQ_API_KEY    required — get yours at https://console.groq.com/keys
GROQ_MODEL      default: llama-3.3-70b-versatile
GROQ_TIMEOUT    default: 60  (seconds)

Install: no extra dependency — uses httpx which is already in your stack.

Quick start
-----------
provider = GroqProvider()
answer   = provider.generate("Explain RAG in one sentence.")

# or pass it explicitly to the MCQ generator
from app.services.ai_test_generator import generate_mcq_from_unit_content
questions = await generate_mcq_from_unit_content(
    ..., provider=GroqProvider()
)

Available fast models (as of 2025)
------------------------------------
llama-3.3-70b-versatile   ← recommended default (best quality)
llama-3.1-8b-instant      ← fastest / cheapest
mixtral-8x7b-32768        ← long context
gemma2-9b-it              ← lightweight
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Iterator, AsyncIterator

import httpx

from app.services.ai.providers.base import AIProvider, AIProviderError

logger = logging.getLogger(__name__)

_GROQ_API_BASE   = "https://api.groq.com/openai/v1"
_DEFAULT_MODEL   = "llama-3.3-70b-versatile"
_DEFAULT_TIMEOUT = float(os.environ.get("GROQ_TIMEOUT", "60"))
# llama-3.3-70b-versatile supports up to 32 768 output tokens on Groq.
# 4 096 was too small — rich markdown text blocks in unit blueprints would
# hit the ceiling, causing the JSON to be cut mid-string.
_MAX_TOKENS      = int(os.environ.get("GROQ_MAX_TOKENS", "8192"))


class GroqProvider(AIProvider):
    """
    Text generation via Groq Cloud's OpenAI-compatible Chat Completions API.

    Groq is a drop-in replacement for OpenAI's API — same endpoint shape,
    same SSE streaming format — but dramatically faster thanks to LPU hardware.

    Parameters
    ----------
    api_key : str | None
        Groq API key.  Falls back to GROQ_API_KEY env-var.
    model : str
        Model tag.  Falls back to GROQ_MODEL env-var (default: llama-3.3-70b-versatile).
    temperature : float
        Sampling temperature (0 = deterministic, 1 = creative).
        Keep low (0.1–0.3) for structured JSON output like MCQ generation.
    max_tokens : int
        Maximum completion tokens.
    timeout : float
        HTTP timeout in seconds.  Groq is fast; 60 s is generous.
    system_prompt : str | None
        Optional system message prepended to every request.
        Useful for setting a global persona or output format constraint.

    Example
    -------
    provider = GroqProvider(model="llama-3.1-8b-instant", temperature=0.1)
    result   = provider.generate("What is the Italian word for 'hello'?")
    """

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        temperature: float = 0.2,
        max_tokens: int = _MAX_TOKENS,
        timeout: float = _DEFAULT_TIMEOUT,
        system_prompt: str | None = None,
        # Set to "json_object" to enable Groq's JSON mode (structured output).
        # Only takes effect on non-streaming calls.
        response_format: str | None = None,
    ) -> None:
        self.api_key        = api_key or os.environ.get("GROQ_API_KEY", "")
        self.model          = model or os.environ.get("GROQ_MODEL", _DEFAULT_MODEL)
        self.temperature    = temperature
        self.max_tokens     = max_tokens
        self.timeout        = timeout
        self.system_prompt  = system_prompt
        self.response_format = response_format

        if not self.api_key:
            raise AIProviderError(
                "Groq API key is missing — set the GROQ_API_KEY environment variable "
                "or pass api_key= to GroqProvider()."
            )

        # Persistent client — reuses TCP connections across requests (same
        # pattern as LocalLlamaProvider)
        self._client = httpx.Client(
            base_url=_GROQ_API_BASE,
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

    def _build_payload(self, prompt: str, *, stream: bool = False) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model":       self.model,
            "messages":    self._build_messages(prompt),
            "temperature": self.temperature,
            "max_tokens":  self.max_tokens,
            "stream":      stream,
        }
        # JSON mode: forces the model to emit only valid JSON, eliminating
        # markdown fences and preamble.  Only enabled for non-streaming calls
        # because Groq does not support response_format with streaming yet.
        if not stream and self.response_format == "json_object":
            payload["response_format"] = {"type": "json_object"}
        return payload

    @staticmethod
    def _handle_http_error(exc: httpx.HTTPStatusError) -> None:
        """Convert Groq HTTP errors into AIProviderError with a readable message."""
        status = exc.response.status_code
        try:
            body = exc.response.json()
            detail = body.get("error", {}).get("message", exc.response.text)
        except Exception:
            detail = exc.response.text

        if status == 401:
            raise AIProviderError(
                "Groq authentication failed — check your GROQ_API_KEY."
            ) from exc
        if status == 429:
            raise AIProviderError(
                "Groq rate limit reached — slow down requests or upgrade your plan."
            ) from exc
        if status == 503:
            raise AIProviderError(
                f"Groq service unavailable: {detail}"
            ) from exc
        raise AIProviderError(f"Groq HTTP {status}: {detail}") from exc

    # ── AIProvider: sync ──────────────────────────────────────────────────────

    def generate(self, prompt: str) -> str:
        """
        POST /chat/completions (non-streaming) and return the reply text.

        Groq typically responds in < 1 second for 8B models and < 3 s for 70B.
        """
        payload = self._build_payload(prompt, stream=False)
        logger.debug("Groq request → model=%s temp=%.2f", self.model, self.temperature)

        try:
            resp = self._client.post("/chat/completions", json=payload)
            resp.raise_for_status()
        except httpx.TimeoutException as exc:
            raise AIProviderError(
                f"Groq timed out after {self.timeout}s — "
                "increase GROQ_TIMEOUT or choose a smaller model."
            ) from exc
        except httpx.HTTPStatusError as exc:
            self._handle_http_error(exc)
        except httpx.RequestError as exc:
            raise AIProviderError(
                f"Cannot reach Groq API at {_GROQ_API_BASE}: {exc}"
            ) from exc

        data = resp.json()
        choice = data["choices"][0]
        # Detect token-limit truncation before handing the partial text to the
        # caller — this prevents silent JSON-parse failures downstream.
        finish_reason = choice.get("finish_reason", "")
        tokens_used   = data.get("usage", {}).get("total_tokens", "?")
        logger.debug(
            "Groq response — model=%s tokens_used=%s finish_reason=%s",
            data.get("model"),
            tokens_used,
            finish_reason,
        )
        if finish_reason == "length":
            raise AIProviderError(
                f"Groq response was truncated (finish_reason=length, "
                f"tokens_used={tokens_used}, max_tokens={self.max_tokens}). "
                "Increase GROQ_MAX_TOKENS or request fewer/shorter segments."
            )
        return choice["message"]["content"]

    # ── AIProvider: async ─────────────────────────────────────────────────────

    async def agenerate(self, prompt: str) -> str:
        """
        Async variant — runs generate() in a thread-pool thread.

        We deliberately avoid httpx.AsyncClient here for the same reason as
        LocalLlamaProvider: in Docker environments with PyTorch workers the
        sync client in a thread is more reliable than mixing async HTTP with
        the asyncio event loop.
        """
        import asyncio
        return await asyncio.to_thread(self.generate, prompt)

    # ── Streaming ─────────────────────────────────────────────────────────────

    def generate_stream(self, prompt: str) -> Iterator[str]:
        """
        Yields text tokens one by one using Groq's SSE stream.

        Each SSE line from Groq:
            data: {"choices": [{"delta": {"content": "<token>"}}]}
        Terminated with:
            data: [DONE]
        """
        payload = self._build_payload(prompt, stream=True)

        try:
            with self._client.stream("POST", "/chat/completions", json=payload) as resp:
                resp.raise_for_status()
                for raw_line in resp.iter_lines():
                    if not raw_line or not raw_line.startswith("data:"):
                        continue

                    data_str = raw_line[len("data:"):].strip()
                    if data_str == "[DONE]":
                        break

                    try:
                        chunk = json.loads(data_str)
                    except json.JSONDecodeError:
                        continue

                    delta = chunk.get("choices", [{}])[0].get("delta", {})
                    token = delta.get("content", "")
                    if token:
                        yield token

        except httpx.TimeoutException as exc:
            raise AIProviderError(
                f"Groq stream timed out after {self.timeout}s"
            ) from exc
        except httpx.HTTPStatusError as exc:
            self._handle_http_error(exc)
        except httpx.RequestError as exc:
            raise AIProviderError(
                f"Cannot reach Groq at {_GROQ_API_BASE}: {exc}"
            ) from exc

    async def agenerate_stream(self, prompt: str) -> AsyncIterator[str]:
        """
        Async generator for streaming — bridges the sync generate_stream()
        into the asyncio event loop via a thread + queue.
        FastAPI StreamingResponse can consume this directly.
        """
        import asyncio
        import queue as _queue

        q: _queue.Queue = _queue.Queue()
        _DONE = object()

        def _producer() -> None:
            try:
                for tok in self.generate_stream(prompt):
                    q.put(tok)
            finally:
                q.put(_DONE)

        loop = asyncio.get_running_loop()
        loop.run_in_executor(None, _producer)

        while True:
            while q.empty():
                await asyncio.sleep(0.005)
            item = q.get_nowait()
            if item is _DONE:
                break
            yield item

    # ── misc ──────────────────────────────────────────────────────────────────

    def list_models(self) -> list[str]:
        """
        Return the list of model IDs available on your Groq account.
        Useful for debugging / admin tooling.
        """
        try:
            resp = self._client.get("/models")
            resp.raise_for_status()
            return [m["id"] for m in resp.json().get("data", [])]
        except Exception as exc:
            logger.warning("Could not fetch Groq model list: %s", exc)
            return []

    def __repr__(self) -> str:
        masked = f"{self.api_key[:8]}..." if self.api_key else "(none)"
        return f"<GroqProvider model={self.model!r} key={masked}>"