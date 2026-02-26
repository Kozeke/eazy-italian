"""
Answer synthesizer: use an LLM provider to generate an answer from context (e.g. RAG).
"""
from dataclasses import dataclass
from typing import List, Optional

from .providers.base import AIProvider, AIProviderError


@dataclass
class AnswerResponse:
    """Result of synthesizing an answer."""
    text: str
    model: str
    usage_tokens: Optional[int] = None
    finish_reason: Optional[str] = None


class AnswerSynthesizer:
    """Builds a prompt from context and question, then calls an AI provider to generate an answer."""

    DEFAULT_SYSTEM = (
        "You are a helpful assistant. Answer the user's question using only the provided context. "
        "If the context does not contain enough information, say so. Be concise and accurate."
    )

    def __init__(self, provider: AIProvider, system_prompt: Optional[str] = None):
        self._provider = provider
        self._system_prompt = system_prompt or self.DEFAULT_SYSTEM

    def _build_prompt(self, context: List[str], question: str) -> str:
        context_block = "\n\n".join(context) if context else "(No context provided.)"
        return f"Context:\n{context_block}\n\nQuestion: {question}\n\nAnswer:"

    async def synthesize(
        self,
        context: List[str],
        question: str,
        *,
        max_tokens: int = 1024,
        temperature: float = 0.3,
    ) -> AnswerResponse:
        """Generate an answer from context and question."""
        prompt = self._build_prompt(context, question)
        try:
            text = await self._provider.complete(
                prompt,
                system_prompt=self._system_prompt,
                max_tokens=max_tokens,
                temperature=temperature,
            )
        except AIProviderError as e:
            raise e
        return AnswerResponse(
            text=text.strip(),
            model=self._provider.name,
        )

    async def stream(
        self,
        context: List[str],
        question: str,
        *,
        max_tokens: int = 1024,
        temperature: float = 0.3,
    ):
        """Stream the answer token by token. Yields text chunks."""
        prompt = self._build_prompt(context, question)
        async for chunk in self._provider.stream(
            prompt,
            system_prompt=self._system_prompt,
            max_tokens=max_tokens,
            temperature=temperature,
        ):
            yield chunk
