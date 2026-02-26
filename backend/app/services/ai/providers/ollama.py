"""
Ollama provider for local LLM inference.
"""
import json
from typing import List, Optional, AsyncIterator

import httpx

from .base import AIProvider, AIProviderError


class LocalLlamaProvider(AIProvider):
    """Provider that talks to a local Ollama server."""

    def __init__(
        self,
        base_url: str = "http://localhost:11434",
        model: str = "llama3.2",
        timeout: float = 120.0,
    ):
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._timeout = timeout

    @property
    def name(self) -> str:
        return "ollama"

    def _build_messages(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
    ) -> List[dict]:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        return messages

    async def complete(
        self,
        prompt: str,
        *,
        system_prompt: Optional[str] = None,
        max_tokens: int = 2048,
        temperature: float = 0.7,
        stop: Optional[List[str]] = None,
    ) -> str:
        messages = self._build_messages(prompt, system_prompt)
        payload = {
            "model": self._model,
            "messages": messages,
            "stream": False,
            "options": {
                "num_predict": max_tokens,
                "temperature": temperature,
            },
        }
        if stop:
            payload["options"]["stop"] = stop

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            try:
                r = await client.post(
                    f"{self._base_url}/api/chat",
                    json=payload,
                )
                r.raise_for_status()
            except httpx.HTTPStatusError as e:
                raise AIProviderError(f"Ollama API error: {e.response.text}") from e
            except httpx.RequestError as e:
                raise AIProviderError(f"Ollama request failed: {e}") from e

        data = r.json()
        message = data.get("message")
        if not message:
            return ""
        return message.get("content", "")

    async def stream(
        self,
        prompt: str,
        *,
        system_prompt: Optional[str] = None,
        max_tokens: int = 2048,
        temperature: float = 0.7,
        stop: Optional[List[str]] = None,
    ) -> AsyncIterator[str]:
        messages = self._build_messages(prompt, system_prompt)
        payload = {
            "model": self._model,
            "messages": messages,
            "stream": True,
            "options": {
                "num_predict": max_tokens,
                "temperature": temperature,
            },
        }
        if stop:
            payload["options"]["stop"] = stop

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            try:
                async with client.stream(
                    "POST",
                    f"{self._base_url}/api/chat",
                    json=payload,
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            chunk = json.loads(line)
                            content = chunk.get("message", {}).get("content", "")
                            if content:
                                yield content
                            if chunk.get("done"):
                                break
                        except json.JSONDecodeError:
                            continue
            except httpx.HTTPStatusError as e:
                raise AIProviderError(f"Ollama API error: {e.response.text}") from e
            except httpx.RequestError as e:
                raise AIProviderError(f"Ollama request failed: {e}") from e
