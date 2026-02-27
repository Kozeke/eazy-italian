"""
AnswerSynthesizer — builds RAG prompts and parses LLM output.

Flow
----
1. Caller passes a user question + list of retrieved context chunks.
2. AnswerSynthesizer renders the system prompt template.
3. The assembled prompt is forwarded to whatever AIProvider is injected.
4. Raw LLM output is parsed into a structured AnswerResponse.

The model is instructed to reply in a strict XML-like envelope so we can
reliably extract `answer` and `enough_context` without fragile regex.
"""

from __future__ import annotations

import logging
import re
from typing import List

from pydantic import BaseModel, Field

from app.services.ai.providers.base import AIProvider

logger = logging.getLogger(__name__)


# ── Response schema ───────────────────────────────────────────────────────────

class AnswerResponse(BaseModel):
    """Structured result returned by AnswerSynthesizer.synthesize()."""

    answer: str = Field(
        description="The answer to the user's question, in the same language "
                    "as the question (English or Russian).",
    )
    enough_context: bool = Field(
        description="True when the retrieved chunks contained sufficient "
                    "information to answer confidently.",
    )


# ── System prompt template ─────────────────────────────────────────────────────

_SYSTEM_PROMPT_TEMPLATE = """\
You are a helpful assistant for an online language-learning platform.
Answer the user's question using ONLY the context provided below.
Reply in the SAME LANGUAGE as the question (English or Russian).

Rules:
- If the context is sufficient, give a clear and concise answer.
- If the context does NOT contain enough information, still try to help,
  but set enough_context to false.
- Never invent facts that are not supported by the context.
- Do not mention the word "context" or "chunks" in your answer.

You MUST wrap your response in the following XML tags — nothing else:

<answer>
YOUR ANSWER HERE
</answer>
<enough_context>true</enough_context>

Context:
{context}

User question: {question}
"""


# ── Synthesizer ───────────────────────────────────────────────────────────────

class AnswerSynthesizer:
    """
    Assembles a RAG prompt, calls the injected provider, and parses output.

    Parameters
    ----------
    provider : AIProvider
        Any concrete AIProvider implementation.
    system_prompt_template : str | None
        Override the default template (must contain {context} and {question}).

    Example
    -------
    from app.services.ai.providers.ollama import LocalLlamaProvider
    from app.services.ai.answer_synthesizer import AnswerSynthesizer

    provider   = LocalLlamaProvider(model="llama3")
    synthesizer = AnswerSynthesizer(provider)

    result = synthesizer.synthesize(
        question="How do I form the Italian subjunctive?",
        context_chunks=["The Italian subjunctive (congiuntivo) …"],
    )
    print(result.answer)
    print(result.enough_context)
    """

    def __init__(
        self,
        provider: AIProvider,
        system_prompt_template: str | None = None,
    ) -> None:
        self.provider = provider
        self._template = system_prompt_template or _SYSTEM_PROMPT_TEMPLATE

    # ── public ────────────────────────────────────────────────────────────────

    def synthesize(
        self,
        question: str,
        context_chunks: List[str],
    ) -> AnswerResponse:
        """
        Synchronous RAG synthesis.

        Parameters
        ----------
        question : str
            The user's question (English or Russian).
        context_chunks : List[str]
            Retrieved text passages — ranked by relevance, best first.

        Returns
        -------
        AnswerResponse
        """
        prompt  = self._build_prompt(question, context_chunks)
        raw_out = self.provider.generate(prompt)
        return self._parse(raw_out)

    async def asynthesize(
        self,
        question: str,
        context_chunks: List[str],
    ) -> AnswerResponse:
        """Async variant — delegates to provider.agenerate()."""
        prompt  = self._build_prompt(question, context_chunks)
        raw_out = await self.provider.agenerate(prompt)
        return self._parse(raw_out)

    # ── private ───────────────────────────────────────────────────────────────

    def _build_prompt(self, question: str, chunks: List[str]) -> str:
        """Render the template with numbered context chunks."""
        if not chunks:
            context_text = "(no context provided)"
        else:
            context_text = "\n\n".join(
                f"[{i + 1}] {chunk.strip()}" for i, chunk in enumerate(chunks)
            )
        return self._template.format(
            context=context_text,
            question=question.strip(),
        )

    @staticmethod
    def _parse(raw: str) -> AnswerResponse:
        """
        Extract <answer>…</answer> and <enough_context>…</enough_context>
        from the model's output.  Falls back gracefully when the model
        ignores the format instruction.
        """
        raw = raw.strip()

        # ── extract answer ───────────────────────────────────────────────────
        answer_match = re.search(
            r"<answer>\s*(.*?)\s*</answer>",
            raw,
            re.DOTALL | re.IGNORECASE,
        )
        answer: str = answer_match.group(1).strip() if answer_match else raw

        # ── extract enough_context ───────────────────────────────────────────
        ec_match = re.search(
            r"<enough_context>\s*(true|false)\s*</enough_context>",
            raw,
            re.IGNORECASE,
        )
        if ec_match:
            enough_context = ec_match.group(1).lower() == "true"
        else:
            # Heuristic fallback: if model says it doesn't know → False
            low = raw.lower()
            doubt_phrases = (
                "i don't know", "i do not know", "no information",
                "not enough", "cannot answer", "не знаю", "нет информации",
                "недостаточно",
            )
            enough_context = not any(p in low for p in doubt_phrases)
            logger.warning(
                "LLM did not follow <enough_context> format — "
                "inferred enough_context=%s",
                enough_context,
            )

        if not answer_match:
            logger.warning(
                "LLM did not follow <answer> format — using raw output as answer"
            )

        return AnswerResponse(answer=answer, enough_context=enough_context)