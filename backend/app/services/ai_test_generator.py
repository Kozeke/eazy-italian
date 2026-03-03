"""
app/services/ai_test_generator.py

MCQ generation service — provider-agnostic.

The function `generate_mcq_from_unit_content` accepts any AIProvider
implementation (Ollama/LLaMA today, OpenAI or Anthropic tomorrow).
A module-level singleton is pre-wired to LocalLlamaProvider so existing
callers can do:

    from app.services.ai_test_generator import generate_mcq_from_unit_content
    questions = await generate_mcq_from_unit_content(...)

To swap the backend at runtime just pass a different provider:

    from app.services.ai.providers.openai_provider import OpenAIProvider
    questions = await generate_mcq_from_unit_content(..., provider=OpenAIProvider())
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

from app.services.ai.providers.base import AIProvider

logger = logging.getLogger(__name__)


def _build_default_provider() -> AIProvider:
    """
    Instantiate the default AI provider based on the AI_PROVIDER env-var.

    Supported values
    ----------------
    "groq"   → GroqProvider   — Groq Cloud API (fast hosted inference)
    "ollama" → LocalLlamaProvider — local Ollama server
    (unset)  → LocalLlamaProvider  (backward-compatible default)

    Provider-specific configuration is handled entirely through env-vars
    inside each provider's __init__, so no extra config is needed here.
    """
    provider_name = os.environ.get("AI_PROVIDER", "ollama").strip().lower()

    if provider_name == "groq":
        from app.services.ai.providers.groq_provider import GroqProvider
        provider = GroqProvider()
        logger.info("AI provider: GroqProvider (model=%s)", provider.model)
        return provider

    if provider_name == "ollama":
        from app.services.ai.providers.ollama import LocalLlamaProvider
        provider = LocalLlamaProvider()
        logger.info("AI provider: LocalLlamaProvider (model=%s)", provider.model)
        return provider

    raise ValueError(
        f"Unknown AI_PROVIDER={provider_name!r}. "
        "Valid values: 'groq', 'ollama'."
    )


# Module-level singleton — created once at import time.
# Pass provider= explicitly to generate_mcq_from_unit_content() or
# regenerate_single_question() to override per-request.
_default_provider: AIProvider = _build_default_provider()


# ── prompt builder ────────────────────────────────────────────────────────────

def _build_prompt(
    unit_content: str,
    mcq_count: int,
    answers_per_question: int,
    difficulty: str,
    content_language: str = "auto",
    question_language: str = "english",
) -> str:
    """
    Construct the generation prompt.

    Parameters
    ----------
    content_language : str
        Language the source document is written in, e.g. "russian", "english".
        Used to tell the model how to interpret the content.
    question_language : str
        Language in which questions and answers should be written.
        E.g. "russian" if the course is for Russian speakers learning Italian.
    """
    # Build a realistic example with full-text options so the model
    # doesn't think options should be single letters like "A", "B", "C".
    example_opt_texts = ["первый слог", "второй слог", "третий слог", "четвёртый слог"]
    example_options = json.dumps(example_opt_texts[:answers_per_question], ensure_ascii=False)
    example_correct = json.dumps([example_opt_texts[2]], ensure_ascii=False)

    lang_block = ""
    if content_language and content_language != "auto":
        lang_block += f"\n- The SOURCE CONTENT is written in {content_language.upper()}. Read and understand it in that language."
    if question_language:
        lang_block += f"\n- Write ALL questions and ALL explanations in {question_language.upper()}."

    return f"""You are a strict JSON generator for educational quiz questions about Italian language. Output ONLY a JSON array.

TASK
----
Read the SOURCE CONTENT and generate exactly {mcq_count} multiple-choice questions that test comprehension of that material.
{lang_block}

ANTI-HALLUCINATION RULES
-------------------------
1. Every question and correct answer MUST be directly traceable to a specific sentence in SOURCE CONTENT.
2. Do NOT use general world knowledge. Do NOT invent facts not present in the content.

CRITICAL RULE FOR OPTION LANGUAGE
-----------------------------------
Questions ask students to identify, translate, or choose Italian words/forms.
Therefore: when the question is about an Italian word, particle, pronoun, letter, or form —
ALL FOUR options MUST be Italian words/forms, not Russian translations.

EXAMPLES OF CORRECT QUESTION FORMAT (follow this pattern exactly):

Example 1 — question about a particle (options are Italian particles):
{{
  "prompt_rich": "Какая частица используется для образования отрицания в итальянском языке?",
  "options": ["no", "non", "not", "ne"],
  "correct_answer": ["non"],
  "explanation_rich": "Для отрицания в итальянском используется частица 'non', которая ставится перед глаголом."
}}

Example 2 — question about a number/fact (options are numbers):
{{
  "prompt_rich": "Сколько букв в итальянском алфавите?",
  "options": ["24", "26", "21", "23"],
  "correct_answer": ["21"],
  "explanation_rich": "В итальянском алфавите 21 буква — меньше, чем в английском."
}}

Example 3 — question about a pronoun meaning (options are Italian pronouns):
{{
  "prompt_rich": "Как переводится местоимение 'io' на русский?",
  "options": ["io", "tu", "noi", "loro"],
  "correct_answer": ["io"],
  "explanation_rich": "Местоимение 'io' означает 'я' — это местоимение первого лица единственного числа."
}}

Example 4 — question about pronunciation (options are descriptions):
{{
  "prompt_rich": "Как читается буква 'h' в итальянском языке?",
  "options": ["как [х]", "как [г]", "как [к]", "не читается"],
  "correct_answer": ["не читается"],
  "explanation_rich": "Буква 'h' в итальянском немая — она не произносится."
}}

ANSWER OPTION RULES
--------------------
1. NO labels, NO prefixes, NO numbering. Clean short phrases only.
   BAD: "ЧАСТИЦА non" / "Вариант А: non" / "1) non"
   GOOD: "non"
2. All 4 options must be grammatically parallel and the same type of thing.
3. Wrong options must be plausible — real Italian words or real numbers, not nonsense.
4. 1–8 words per option maximum.

OUTPUT RULES
------------
1. Return ONLY a valid JSON array. No markdown, no prose, no code fences.
2. Exactly {mcq_count} objects with keys: "prompt_rich", "options", "correct_answer", "explanation_rich"
3. "options": exactly {answers_per_question} strings
4. "correct_answer": exactly ONE string matching an option verbatim
5. Difficulty: {difficulty}

SOURCE CONTENT
--------------
\"\"\"{unit_content}\"\"\"

Now output the JSON array with {mcq_count} questions. ONLY the JSON array."""


# ── raw-output cleaner ────────────────────────────────────────────────────────

def _extract_json_array(raw: str) -> str:
    """
    Sanitise the raw model output and extract the first JSON array found.

    Handles common LLaMA / Mistral quirks:
    * Markdown code fences  (```json … ``` or ``` … ```)
    * Extra prose before/after the JSON
    * Stray trailing commas before ] (best-effort fix)
    """
    # 1. Strip markdown code fences
    cleaned = re.sub(r"```(?:json)?", "", raw, flags=re.IGNORECASE).strip()

    # 2. Extract the outermost JSON array
    match = re.search(r"\[.*\]", cleaned, re.DOTALL)
    if not match:
        logger.error("No JSON array found in model output:\n%s", raw[:500])
        raise ValueError(
            "Model did not return a JSON array. "
            f"Raw output (first 500 chars): {raw[:500]!r}"
        )

    json_text = match.group(0)

    # 3. Best-effort: remove trailing commas before ] or } (common LLaMA bug)
    json_text = re.sub(r",\s*(\])", r"\1", json_text)
    json_text = re.sub(r",\s*(\})", r"\1", json_text)

    return json_text


# ── repair ────────────────────────────────────────────────────────────────────

# Maps Cyrillic and Latin letter indices → 0-based option index
# а=0, б=1, в=2, г=3, д=4  /  a=0, b=1, c=2, d=3, e=4
_LETTER_TO_IDX: dict[str, int] = {
    # Latin uppercase/lowercase
    **{chr(65 + i): i for i in range(6)},   # A–F
    **{chr(97 + i): i for i in range(6)},   # a–f
    # Cyrillic uppercase/lowercase (а б в г д е)
    'А': 0, 'Б': 1, 'В': 2, 'Г': 3, 'Д': 4, 'Е': 5,
    'а': 0, 'б': 1, 'в': 2, 'г': 3, 'д': 4, 'е': 5,
    # digits 1–6
    '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5,
}


def _repair_questions(questions: list[Any], answers_per_question: int) -> list[Any]:
    """
    Best-effort repair of common LLM output mistakes before strict validation.

    Handles:
    * correct_answer is a letter/index ("B", "б", "2") → replace with full option text
    * correct_answer has multiple items → keep only the first
    * options stored as dicts {id, text} instead of plain strings → extract text
    * options count mismatch — trim or skip (validator will still catch unfixable cases)
    """
    repaired = []
    for item in questions:
        if not isinstance(item, dict):
            repaired.append(item)
            continue

        item = dict(item)  # shallow copy so we don't mutate the parsed list

        # ── Normalise options ──────────────────────────────────────────────────
        opts = item.get("options", [])
        if isinstance(opts, list):
            normalized: list[str] = []
            for opt in opts:
                if isinstance(opt, dict):
                    # {id: "A", text: "..."} — extract text
                    normalized.append(str(opt.get("text") or opt.get("value") or "").strip())
                else:
                    normalized.append(str(opt).strip())
            item["options"] = [o for o in normalized if o]  # drop blanks

        opts = item["options"]

        # ── Normalise correct_answer ───────────────────────────────────────────
        correct = item.get("correct_answer")

        # If it's a plain string, wrap it
        if isinstance(correct, str):
            correct = [correct]

        if isinstance(correct, list):
            # Take only the first element
            if len(correct) > 1:
                logger.debug("Repair: trimming correct_answer from %d items to 1", len(correct))
            first = correct[0] if correct else ""

            # If first is a letter/index, map it to the option at that index
            if isinstance(first, str) and first.strip() in _LETTER_TO_IDX:
                idx = _LETTER_TO_IDX[first.strip()]
                if 0 <= idx < len(opts):
                    logger.debug(
                        "Repair: mapping correct_answer letter %r → option[%d] = %r",
                        first, idx, opts[idx],
                    )
                    first = opts[idx]

            item["correct_answer"] = [first]

        # ── Fill blank explanation_rich rather than failing all retries ────────
        explanation = item.get("explanation_rich", "")
        if not isinstance(explanation, str) or not explanation.strip():
            # Build a minimal explanation from what we know
            q_text = item.get("prompt_rich", "")
            ans = item["correct_answer"][0] if item.get("correct_answer") else ""
            item["explanation_rich"] = f"Правильный ответ: {ans}." if ans else "См. материал урока."
            logger.debug(
                "Repair: filled blank explanation_rich for Q with prompt=%.60r", q_text
            )

        repaired.append(item)
    return repaired


# ── validator ─────────────────────────────────────────────────────────────────

_REQUIRED_KEYS: frozenset[str] = frozenset(
    {"prompt_rich", "options", "correct_answer", "explanation_rich"}
)


def _validate(
    questions: list[Any],
    mcq_count: int,
    answers_per_question: int,
) -> None:
    """
    Validate parsed questions and raise ValueError with a structured message
    on the first problem found. Every check logs at WARNING level so the
    exact field that caused a retry is always visible in server logs.
    """
    if not isinstance(questions, list):
        msg = f"Expected a JSON array, got {type(questions).__name__}."
        logger.warning("VALIDATION FAIL — %s", msg)
        raise ValueError(msg)

    if len(questions) != mcq_count:
        msg = f"Expected {mcq_count} questions, got {len(questions)}."
        logger.warning("VALIDATION FAIL — %s", msg)
        raise ValueError(msg)

    seen_prompts: set[str] = set()

    for idx, item in enumerate(questions, start=1):
        prefix = f"Q{idx}"

        if not isinstance(item, dict):
            msg = f"{prefix}: expected an object, got {type(item).__name__}."
            logger.warning("VALIDATION FAIL — %s", msg)
            raise ValueError(msg)

        missing = _REQUIRED_KEYS - item.keys()
        if missing:
            msg = f"{prefix}: missing keys {missing}."
            logger.warning("VALIDATION FAIL — %s | item=%s", msg, str(item)[:200])
            raise ValueError(msg)

        # ── prompt_rich ───────────────────────────────────────────────────────
        prompt = item.get("prompt_rich", "")
        if not isinstance(prompt, str) or not prompt.strip():
            msg = f"{prefix}: 'prompt_rich' is empty or not a string — got {prompt!r}."
            logger.warning("VALIDATION FAIL — %s", msg)
            raise ValueError(msg)

        # Duplicate detection
        normalised = prompt.strip().lower()
        if normalised in seen_prompts:
            msg = f"{prefix}: duplicate question text detected: {prompt[:80]!r}"
            logger.warning("VALIDATION FAIL — %s", msg)
            raise ValueError(msg)
        seen_prompts.add(normalised)

        # ── options ───────────────────────────────────────────────────────────
        options = item["options"]
        if not isinstance(options, list):
            msg = f"{prefix}: 'options' must be a list, got {type(options).__name__}."
            logger.warning("VALIDATION FAIL — %s | options=%r", msg, options)
            raise ValueError(msg)
        if len(options) != answers_per_question:
            msg = (
                f"{prefix}: 'options' must have exactly {answers_per_question} items, "
                f"got {len(options)}: {options!r}"
            )
            logger.warning("VALIDATION FAIL — %s", msg)
            raise ValueError(msg)
        blank_opts = [o for o in options if not str(o).strip()]
        if blank_opts:
            msg = f"{prefix}: options contain blank entries: {options!r}"
            logger.warning("VALIDATION FAIL — %s", msg)
            raise ValueError(msg)

        # ── correct_answer ────────────────────────────────────────────────────
        correct = item["correct_answer"]
        if not isinstance(correct, list) or len(correct) != 1:
            msg = (
                f"{prefix}: 'correct_answer' must be a list with exactly one item, "
                f"got {correct!r}"
            )
            logger.warning("VALIDATION FAIL — %s", msg)
            raise ValueError(msg)
        if correct[0] not in options:
            msg = (
                f"{prefix}: correct_answer {correct[0]!r} is not among options {options!r}"
            )
            logger.warning("VALIDATION FAIL — %s", msg)
            raise ValueError(msg)

        # ── explanation_rich ──────────────────────────────────────────────────
        explanation = item.get("explanation_rich", "")
        if not isinstance(explanation, str) or not explanation.strip():
            msg = f"{prefix}: 'explanation_rich' is empty or not a string — got {explanation!r}."
            logger.warning("VALIDATION FAIL — %s", msg)
            raise ValueError(msg)

        logger.debug(
            "%s OK — prompt=%r correct=%r",
            prefix, prompt[:60], correct[0][:40],
        )

    logger.info("Validation passed — %d/%d questions OK.", len(questions), mcq_count)


# ── public API ────────────────────────────────────────────────────────────────

async def generate_mcq_from_unit_content(
    unit_content: str,
    mcq_count: int,
    answers_per_question: int,
    difficulty: str,
    *,
    content_language: str = "auto",
    question_language: str = "english",
    provider: AIProvider | None = None,
    max_retries: int = 2,
) -> tuple[list[dict], dict]:
    """
    Generate *mcq_count* multiple-choice questions from *unit_content*.

    Returns
    -------
    (questions, metadata)
        questions : list[dict]
            Each dict has keys: prompt_rich, options, correct_answer, explanation_rich.
        metadata : dict
            Traceability info to be stored in test.settings:
            {
                "generation_model":       str,   # provider model name
                "generation_attempts":    int,   # how many LLM calls were made
                "content_char_count":     int,   # chars of source content fed to LLM
                "prompt_char_count":      int,   # total prompt length
                "raw_output_preview":     str,   # first 500 chars of final raw output
                "content_language":       str,
                "question_language":      str,
            }
    """
    if not unit_content or not unit_content.strip():
        raise ValueError("unit_content must not be empty.")
    if mcq_count < 1:
        raise ValueError("mcq_count must be >= 1.")
    if answers_per_question < 2:
        raise ValueError("answers_per_question must be >= 2.")

    _provider = provider or _default_provider
    prompt = _build_prompt(
        unit_content, mcq_count, answers_per_question, difficulty,
        content_language=content_language,
        question_language=question_language,
    )

    model_name = getattr(_provider, "model", type(_provider).__name__)
    last_error: Exception | None = None
    last_raw: str = ""
    total_attempts = max_retries + 1

    for attempt in range(1, total_attempts + 1):
        logger.info(
            "MCQ generation attempt %d/%d — model=%s mcq_count=%d difficulty=%s "
            "content_lang=%s question_lang=%s",
            attempt, total_attempts, model_name, mcq_count, difficulty,
            content_language, question_language,
        )

        last_raw = await _provider.agenerate(prompt)

        if attempt == 1:
            logger.debug("Raw LLM output (attempt %d):\n%.800s", attempt, last_raw)

        try:
            json_text = _extract_json_array(last_raw)
            questions: list[Any] = json.loads(json_text)
            questions = _repair_questions(questions, answers_per_question)
            _validate(questions, mcq_count, answers_per_question)
            logger.info(
                "MCQ generation succeeded on attempt %d/%d — %d questions validated.",
                attempt, total_attempts, len(questions),
            )
            metadata = {
                "generation_model":    model_name,
                "generation_attempts": attempt,
                "content_char_count":  len(unit_content),
                "prompt_char_count":   len(prompt),
                "raw_output_preview":  last_raw[:500],
                "content_language":    content_language,
                "question_language":   question_language,
            }
            return questions, metadata  # type: ignore[return-value]

        except (ValueError, json.JSONDecodeError) as exc:
            last_error = exc
            logger.warning(
                "Attempt %d/%d FAILED — %s\nRaw output preview:\n%.600s",
                attempt, total_attempts, exc, last_raw,
            )

    # All retries exhausted — log full raw output for diagnosis
    logger.error(
        "MCQ generation EXHAUSTED all %d attempts.\n"
        "Last error: %s\n"
        "Last raw output (full):\n%s",
        total_attempts, last_error, last_raw,
    )
    raise ValueError(
        f"MCQ generation failed after {total_attempts} attempts. "
        f"Last error: {last_error}"
    ) from last_error


# ── single-question regeneration ──────────────────────────────────────────────

def _build_regen_prompt(
    unit_content: str,
    old_question: dict,
    answers_per_question: int,
    difficulty: str,
    content_language: str = "auto",
    question_language: str = "russian",
) -> str:
    """
    Prompt for replacing ONE specific question.

    The old question is shown so the model knows what to avoid —
    it must not generate the same question or use the same correct answer.
    """
    old_prompt = old_question.get("prompt_rich", "")
    old_correct = ""
    raw_correct = old_question.get("correct_answer", {})
    if isinstance(raw_correct, dict):
        ids = raw_correct.get("correct_option_ids", [])
        # Resolve id → text using stored options
        opts = old_question.get("options", [])
        if ids and opts:
            for opt in opts:
                if isinstance(opt, dict) and opt.get("id") == ids[0]:
                    old_correct = opt.get("text", ids[0])
                    break
        if not old_correct and ids:
            old_correct = ids[0]
    elif isinstance(raw_correct, list) and raw_correct:
        old_correct = raw_correct[0]

    lang_block = ""
    if content_language and content_language != "auto":
        lang_block += f"\n- SOURCE CONTENT is written in {content_language.upper()}."
    if question_language:
        lang_block += f"\n- Write the new question, options, and explanation in {question_language.upper()}."

    example_opts = json.dumps(
        ["первый слог", "второй слог", "третий слог", "четвёртый слог"][:answers_per_question],
        ensure_ascii=False,
    )
    example_correct = json.dumps(["второй слог"], ensure_ascii=False)

    return f"""You are a strict JSON generator for educational quiz questions. Output ONLY a JSON array with exactly 1 object.

TASK
----
Generate ONE new multiple-choice question based on the SOURCE CONTENT below.
This replaces an existing question that the teacher rejected.
{lang_block}

EXISTING QUESTION TO REPLACE (do NOT copy or repeat this)
----------------------------------------------------------
Question: {old_prompt}
Correct answer was: {old_correct}

REQUIREMENTS FOR THE NEW QUESTION
-----------------------------------
1. Must test a DIFFERENT fact or concept from the SOURCE CONTENT than the question above.
2. Must NOT use the same correct answer: {old_correct!r}
3. Must NOT reuse the same question text or close paraphrase of it.
4. All {answers_per_question} options must be plausible, clean phrases — NO labels, NO prefixes.
5. When asking about Italian words/forms, ALL options must be Italian words/forms.
6. Difficulty: {difficulty}

ANTI-HALLUCINATION
------------------
Every fact in the question and correct answer MUST appear in the SOURCE CONTENT below.

OUTPUT RULES
------------
Return ONLY a JSON array with exactly 1 object with these four keys:
  "prompt_rich"      — the question ({question_language})
  "options"          — exactly {answers_per_question} clean option strings
  "correct_answer"   — array with exactly ONE string matching an option verbatim
  "explanation_rich" — one sentence citing the content ({question_language})

SOURCE CONTENT
--------------
\"\"\"{unit_content}\"\"\"

FORMAT EXAMPLE
--------------
[
  {{
    "prompt_rich": "На каком слоге обычно стоит ударение в итальянских словах?",
    "options": {example_opts},
    "correct_answer": {example_correct},
    "explanation_rich": "Согласно тексту, ударение в итальянском обычно падает на второй слог."
  }}
]

Output ONLY the JSON array with 1 object."""


async def regenerate_single_question(
    unit_content: str,
    old_question: dict,
    answers_per_question: int,
    difficulty: str,
    *,
    content_language: str = "auto",
    question_language: str = "russian",
    provider: "AIProvider | None" = None,
    max_retries: int = 2,
) -> tuple[dict, dict]:
    """
    Generate one replacement question that covers a different fact than
    the existing question.

    Parameters
    ----------
    old_question : dict
        The question being replaced. Must have keys:
        prompt_rich, options, correct_answer.
        Used to tell the model what NOT to generate.

    Returns
    -------
    (question_dict, metadata)
        question_dict : dict with prompt_rich, options, correct_answer, explanation_rich
        metadata      : traceability dict (model, attempts, etc.)
    """
    if not unit_content or not unit_content.strip():
        raise ValueError("unit_content must not be empty.")

    _provider = provider or _default_provider
    model_name = getattr(_provider, "model", type(_provider).__name__)

    prompt = _build_regen_prompt(
        unit_content, old_question, answers_per_question, difficulty,
        content_language=content_language,
        question_language=question_language,
    )

    last_error: Exception | None = None
    last_raw: str = ""
    total_attempts = max_retries + 1

    for attempt in range(1, total_attempts + 1):
        logger.info(
            "Regen attempt %d/%d — model=%s difficulty=%s",
            attempt, total_attempts, model_name, difficulty,
        )

        last_raw = await _provider.agenerate(prompt)

        try:
            json_text = _extract_json_array(last_raw)
            questions: list = json.loads(json_text)
            questions = _repair_questions(questions, answers_per_question)
            _validate(questions, mcq_count=1, answers_per_question=answers_per_question)

            q = questions[0]
            logger.info(
                "Regen succeeded on attempt %d — prompt=%.80r correct=%r",
                attempt, q.get("prompt_rich", ""), q.get("correct_answer"),
            )
            metadata = {
                "generation_model":    model_name,
                "generation_attempts": attempt,
                "content_char_count":  len(unit_content),
                "prompt_char_count":   len(prompt),
                "raw_output_preview":  last_raw[:400],
                "content_language":    content_language,
                "question_language":   question_language,
                "replaced_prompt":     old_question.get("prompt_rich", "")[:200],
            }
            return q, metadata

        except (ValueError, json.JSONDecodeError) as exc:
            last_error = exc
            logger.warning(
                "Regen attempt %d/%d FAILED — %s\nRaw: %.400s",
                attempt, total_attempts, exc, last_raw,
            )

    logger.error(
        "Regen EXHAUSTED %d attempts. Last error: %s\nLast raw:\n%s",
        total_attempts, last_error, last_raw,
    )
    raise ValueError(
        f"Question regeneration failed after {total_attempts} attempts. "
        f"Last error: {last_error}"
    ) from last_error