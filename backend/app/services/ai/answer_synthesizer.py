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

    async def asynthesize_stream(
        self,
        question: str,
        context_chunks: list[str],
    ):
        """
        Streams clean answer tokens, stripping the XML envelope.

        Stops at the FIRST closing tag "</" — answer body never contains XML,
        so any "</" indicates the end of the answer content.
        """
        import json

        prompt = self._build_prompt(question, context_chunks)

        full_text: list[str] = []
        answer_started = False
        answer_done = False
        buf = ""   # content buffer after <answer> opens

        async for token in self.provider.agenerate_stream(prompt):
            full_text.append(token)

            if answer_done:
                continue  # keep draining tokens for full_text only

            if not answer_started:
                combined = "".join(full_text)
                if "<answer>" not in combined:
                    continue
                answer_started = True
                # FIX 1: strip the leading newline the XML template puts after
                # <answer>.  When <answer> arrives as its own token, the \n
                # becomes a standalone 1-char yield → SSE frame "data: \n\n\n"
                # → frontend buffer retains "\n" as leftover → that "\n" gets
                # prepended to the NEXT SSE event making it "\ndata: Итал..."
                # → startsWith("data: ") fails → first word silently dropped.
                buf = combined.split("<answer>", 1)[1].lstrip("\n")
            else:
                buf += token

            # Stop at the FIRST closing tag "</" — answer body never has XML
            if "</" in buf:
                safe = buf.split("</", 1)[0]
                if safe:
                    yield safe
                answer_done = True
                continue

            # Hold back last 2 chars in case "<" arrived alone and "/" is next
            # But yield immediately if buffer doesn't end with "<" (safe to yield)
            if len(buf) >= 3:
                # Buffer is long enough - yield all but last 2 chars
                yield buf[:-2]
                buf = buf[-2:]
            elif len(buf) > 0:
                # Buffer is 1-2 chars - yield if it doesn't end with "<" (might be start of "</")
                if not buf.endswith("<"):
                    yield buf
                    buf = ""
                # else: keep "<" in buffer, wait for next token

        # End-of-stream flush (no closing tag found — model ignored format)
        if answer_started and not answer_done and buf:
            yield buf.strip()

        raw = "".join(full_text)
        parsed = self._parse(raw)
        # FIX 2: removed the "\n" prefix that was here before.
        # With it, the client received payload="\n__DONE__..." and
        # payload.startsWith("__DONE__") was always false → onDone never
        # fired → setQaLoading(false) never ran → send button stayed disabled
        # after the very first message.
        yield f"__DONE__{json.dumps({'enough_context': parsed.enough_context})}__END__"

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