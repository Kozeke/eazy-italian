"""
app/services/ai_task_generator.py
==================================
Task generation service — provider-agnostic.

Generates structured practice Tasks from unit content using the same
provider wiring, retry loop, repair + validate pattern as ai_test_generator.

The function ``generate_tasks_from_unit_content`` is the public entry point.
It accepts any AIProvider implementation and returns a list of task dicts
that map directly onto the Task model fields (type, title, description,
instructions, content, example_answer, grading_hints).

Parallel usage
--------------
    from app.services.ai_task_generator import generate_tasks_from_unit_content

    tasks, metadata = await generate_tasks_from_unit_content(
        unit_content       = assembled_text,
        task_count         = 3,
        task_language      = "russian",
        difficulty         = "medium",
    )
    # → list of task dicts, ready for create_ai_generated_tasks()

To override the default provider at runtime:

    from app.services.ai.providers.groq_provider import GroqProvider
    tasks, meta = await generate_tasks_from_unit_content(
        ..., provider=GroqProvider()
    )

Task types generated
--------------------
practice  — free-form oral/written practice of a grammar pattern or vocabulary
writing   — structured written composition (paragraph, dialogue, email)
reading   — read a short passage, answer comprehension questions in instructions
listening — transcription, dictation, or summary of described audio content
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

from app.services.ai.providers.base import AIProvider

logger = logging.getLogger(__name__)


# ── default provider (mirrors ai_test_generator) ─────────────────────────────

def _build_default_provider() -> AIProvider:
    """
    Instantiate the default AI provider based on the AI_PROVIDER env-var.

    Supported values
    ----------------
    "groq"   → GroqProvider   — Groq Cloud API (fast hosted inference)
    "ollama" → LocalLlamaProvider — local Ollama server
    (unset)  → LocalLlamaProvider  (backward-compatible default)
    """
    provider_name = os.environ.get("AI_PROVIDER", "ollama").strip().lower()

    if provider_name == "groq":
        from app.services.ai.providers.groq_provider import GroqProvider
        provider = GroqProvider()
        logger.info("AI task provider: GroqProvider (model=%s)", provider.model)
        return provider

    if provider_name == "ollama":
        from app.services.ai.providers.ollama import LocalLlamaProvider
        provider = LocalLlamaProvider()
        logger.info("AI task provider: LocalLlamaProvider (model=%s)", provider.model)
        return provider

    raise ValueError(
        f"Unknown AI_PROVIDER={provider_name!r}. "
        "Valid values: 'groq', 'ollama'."
    )


# Module-level singleton — created once at import time.
_default_provider: AIProvider = _build_default_provider()


# ── prompt builder ────────────────────────────────────────────────────────────

# Valid task types the generator is allowed to produce.
# Excludes "manual" (teacher-only) and "auto" (SCQ/MCQ — handled by ai_test_generator).
_TASK_TYPES = ("practice", "writing", "reading", "listening")


def _build_prompt(
    unit_content: str,
    task_count: int,
    difficulty: str,
    content_language: str = "auto",
    task_language: str = "english",
) -> str:
    """
    Construct the generation prompt for task creation.

    Parameters
    ----------
    unit_content
        Assembled text from unit metadata, RAG chunks, video transcripts,
        and existing tasks (same shape as what ai_test_generator receives).
    task_count
        Exact number of tasks to generate.
    difficulty
        Difficulty hint: "easy", "medium", or "hard".
    content_language
        Language the source document is written in.
    task_language
        Language in which task instructions and example answers are written.
    """
    lang_block = ""
    if content_language and content_language != "auto":
        lang_block += (
            f"\n- The SOURCE CONTENT is written in {content_language.upper()}. "
            "Read and understand it in that language."
        )
    if task_language:
        lang_block += (
            f"\n- Write ALL task instructions and ALL example answers "
            f"in {task_language.upper()}."
        )

    types_str = ", ".join(f'"{t}"' for t in _TASK_TYPES)

    return f"""You are a strict JSON generator for educational practice tasks. Output ONLY a JSON array.

TASK
----
Read the SOURCE CONTENT and generate exactly {task_count} practice tasks that help students
practise and apply the material.
{lang_block}

ANTI-HALLUCINATION RULES
-------------------------
1. Every task MUST target a specific concept, vocabulary set, or grammar point
   present in the SOURCE CONTENT.
2. Do NOT invent facts, vocabulary, or grammar rules not present in the content.
3. "content" (the passage / model text shown to the student) MUST be derived
   from or inspired by the SOURCE CONTENT — do not copy verbatim.

TASK TYPE RULES
---------------
You must generate a variety of types. Allowed types: {types_str}

- "practice"  → A free-form activity: fill the gap, translate a sentence,
                transform a form, match words, conjugate a verb, etc.
                content: the target sentences / words to work with.
- "writing"   → A structured composition task: write a paragraph, short email,
                mini-dialogue, or description using the target language pattern.
                content: the prompt or model text to react to.
- "reading"   → Read a short passage and answer comprehension questions
                that are embedded inside the instructions.
                content: the reading passage (3–6 sentences).
- "listening" → A dictation, transcription, or listen-and-summarise activity.
                content: the script or the description of what students will hear.

FIELD RULES
-----------
- "type"           : one of {types_str}
- "title"          : concise task name, max 10 words
- "description"    : one sentence explaining the pedagogical goal
- "instructions"   : full student-facing instructions (2–4 sentences);
                     for "reading" tasks embed 2–3 comprehension questions here
- "content"        : the actual text/passage/sentences the student works with
                     (may be empty string "" for pure speaking practice)
- "example_answer" : a correct, complete sample answer (1–4 sentences);
                     for open tasks write ONE good example response
- "grading_hints"  : brief teacher note on what to look for when marking
                     (1–2 sentences)
- difficulty target: {difficulty}

OUTPUT RULES
------------
1. Return ONLY a valid JSON array. No markdown, no prose, no code fences.
2. Exactly {task_count} objects, each with ALL seven keys:
   "type", "title", "description", "instructions",
   "content", "example_answer", "grading_hints"
3. Every string value must be non-empty (except "content" for pure speaking tasks).
4. Do NOT number the titles (no "Task 1:", "Exercise 1:" etc.).

SOURCE CONTENT
--------------
\"\"\"{unit_content}\"\"\"

Now output the JSON array with {task_count} tasks. ONLY the JSON array."""


# ── raw-output cleaner (mirrors ai_test_generator._extract_json_array) ────────

def _extract_json_array(raw: str) -> str:
    """
    Sanitise the raw model output and extract the first JSON array found.

    Handles common LLaMA / Mistral quirks:
    * Markdown code fences (```json … ``` or ``` … ```)
    * Extra prose before/after the JSON
    * Stray trailing commas before ] or }
    """
    # 1. Strip markdown code fences
    cleaned = re.sub(r"```(?:json)?", "", raw, flags=re.IGNORECASE).strip()

    # 2. Extract the outermost JSON array
    match = re.search(r"\[.*\]", cleaned, re.DOTALL)
    if not match:
        logger.error("No JSON array found in task model output:\n%s", raw[:500])
        raise ValueError(
            "Model did not return a JSON array. "
            f"Raw output (first 500 chars): {raw[:500]!r}"
        )

    json_text = match.group(0)

    # 3. Best-effort: remove trailing commas before ] or } (common LLaMA bug)
    json_text = re.sub(r",\s*(\])", r"\1", json_text)
    json_text = re.sub(r",\s*(\})", r"\1", json_text)

    return json_text


# ── repair (normalise common LLM deviations) ─────────────────────────────────

_REQUIRED_KEYS: frozenset[str] = frozenset(
    {"type", "title", "description", "instructions",
     "content", "example_answer", "grading_hints"}
)


def _repair_tasks(tasks: list[Any]) -> list[Any]:
    """
    Best-effort normalisation of common LLM output mistakes before strict
    validation.  Never raises — leaves unfixable items for the validator.

    Handles
    -------
    * type value is capitalised or prefixed  ("Writing" → "writing")
    * title has a number prefix               ("Task 1: ..." → "...")
    * missing optional string keys            → empty string ""
    * non-string field values                 → str() coercion
    * invalid type value                      → "practice" fallback (logged)
    """
    repaired = []
    for item in tasks:
        if not isinstance(item, dict):
            repaired.append(item)
            continue

        item = dict(item)  # shallow copy

        # ── Normalise type ─────────────────────────────────────────────────────
        raw_type = str(item.get("type", "")).strip().lower()
        # Strip common prefixes / extra words ("type: writing" → "writing")
        raw_type = re.sub(r"^(type[:\s]+)", "", raw_type).strip()
        if raw_type not in _TASK_TYPES:
            logger.debug(
                "Repair: unknown type %r → defaulting to 'practice'", raw_type
            )
            raw_type = "practice"
        item["type"] = raw_type

        # ── Normalise title ────────────────────────────────────────────────────
        title = str(item.get("title", "")).strip()
        # Remove "Task N:" / "Exercise N:" prefixes
        title = re.sub(r"^(task|exercise|activity|задание|упражнение)\s*\d*[.:\-]\s*",
                       "", title, flags=re.IGNORECASE).strip()
        item["title"] = title

        # ── Ensure all string keys are present and are strings ─────────────────
        for key in _REQUIRED_KEYS:
            val = item.get(key)
            if val is None:
                item[key] = ""
                logger.debug("Repair: filled missing key %r with empty string", key)
            elif not isinstance(val, str):
                item[key] = str(val)
                logger.debug("Repair: coerced key %r from %s to str", key, type(val).__name__)

        repaired.append(item)
    return repaired


# ── validator ─────────────────────────────────────────────────────────────────

def _validate(tasks: list[Any], task_count: int) -> None:
    """
    Validate the parsed task list.  Raises ValueError with a structured
    message on the first problem found.

    Rules
    -----
    * Exactly task_count items.
    * Each item is a dict with all required keys.
    * type must be one of _TASK_TYPES.
    * title, description, instructions, example_answer, grading_hints
      must be non-empty strings.
    * content may be empty (valid for pure speaking practice tasks).
    * No duplicate titles.
    """
    if not isinstance(tasks, list):
        msg = f"Expected a JSON array, got {type(tasks).__name__}."
        logger.warning("TASK VALIDATION FAIL — %s", msg)
        raise ValueError(msg)

    if len(tasks) != task_count:
        msg = f"Expected {task_count} tasks, got {len(tasks)}."
        logger.warning("TASK VALIDATION FAIL — %s", msg)
        raise ValueError(msg)

    seen_titles: set[str] = set()

    for idx, item in enumerate(tasks, start=1):
        prefix = f"T{idx}"

        if not isinstance(item, dict):
            msg = f"{prefix}: expected an object, got {type(item).__name__}."
            logger.warning("TASK VALIDATION FAIL — %s", msg)
            raise ValueError(msg)

        missing = _REQUIRED_KEYS - item.keys()
        if missing:
            msg = f"{prefix}: missing keys {missing}."
            logger.warning("TASK VALIDATION FAIL — %s | item=%s", msg, str(item)[:200])
            raise ValueError(msg)

        # ── type ──────────────────────────────────────────────────────────────
        task_type = item.get("type", "")
        if task_type not in _TASK_TYPES:
            msg = (
                f"{prefix}: 'type' must be one of {_TASK_TYPES}, "
                f"got {task_type!r}"
            )
            logger.warning("TASK VALIDATION FAIL — %s", msg)
            raise ValueError(msg)

        # ── required non-empty string fields ──────────────────────────────────
        for key in ("title", "description", "instructions", "example_answer", "grading_hints"):
            val = item.get(key, "")
            if not isinstance(val, str) or not val.strip():
                msg = f"{prefix}: '{key}' must be a non-empty string, got {val!r}."
                logger.warning("TASK VALIDATION FAIL — %s", msg)
                raise ValueError(msg)

        # ── duplicate title check ──────────────────────────────────────────────
        normalised_title = item["title"].strip().lower()
        if normalised_title in seen_titles:
            msg = f"{prefix}: duplicate task title: {item['title']!r}"
            logger.warning("TASK VALIDATION FAIL — %s", msg)
            raise ValueError(msg)
        seen_titles.add(normalised_title)

        logger.debug(
            "%s OK — type=%r title=%r",
            prefix, task_type, item["title"][:60],
        )

    logger.info("Task validation passed — %d/%d tasks OK.", len(tasks), task_count)


# ── public API ────────────────────────────────────────────────────────────────

async def generate_tasks_from_unit_content(
    unit_content: str,
    task_count: int,
    difficulty: str,
    *,
    content_language: str = "auto",
    task_language: str = "english",
    provider: AIProvider | None = None,
    max_retries: int = 2,
) -> tuple[list[dict], dict]:
    """
    Generate *task_count* practice tasks from *unit_content*.

    Parameters
    ----------
    unit_content
        Assembled text from the unit (metadata + RAG chunks + transcripts).
        Same format as passed to generate_mcq_from_unit_content.
    task_count
        Number of tasks to generate.  Must be >= 1.
    difficulty
        Difficulty hint for the LLM: "easy", "medium", or "hard".
    content_language
        Language the source content is written in ("auto" = let the LLM infer).
    task_language
        Language for task instructions and example answers.
    provider
        Override the module-level default provider.
    max_retries
        How many additional attempts to make on parse/validate failure.

    Returns
    -------
    (tasks, metadata)
        tasks : list[dict]
            Each dict has all seven keys:
            type, title, description, instructions,
            content, example_answer, grading_hints.
        metadata : dict
            Traceability info (mirrors ai_test_generator format):
            {
                "generation_model":       str,
                "generation_attempts":    int,
                "content_char_count":     int,
                "prompt_char_count":      int,
                "raw_output_preview":     str,
                "content_language":       str,
                "task_language":          str,
            }

    Raises
    ------
    ValueError
        If generation fails after all retries (parse or validation error).
    AIProviderError
        If the underlying LLM provider is unreachable.
    """
    if not unit_content or not unit_content.strip():
        raise ValueError("unit_content must not be empty.")
    if task_count < 1:
        raise ValueError("task_count must be >= 1.")

    _provider = provider or _default_provider
    prompt = _build_prompt(
        unit_content, task_count, difficulty,
        content_language=content_language,
        task_language=task_language,
    )

    model_name = getattr(_provider, "model", type(_provider).__name__)
    last_error: Exception | None = None
    last_raw: str = ""
    total_attempts = max_retries + 1

    for attempt in range(1, total_attempts + 1):
        logger.info(
            "Task generation attempt %d/%d — model=%s task_count=%d difficulty=%s "
            "content_lang=%s task_lang=%s",
            attempt, total_attempts, model_name, task_count, difficulty,
            content_language, task_language,
        )

        last_raw = await _provider.agenerate(prompt)

        if attempt == 1:
            logger.debug("Raw LLM output (attempt %d):\n%.800s", attempt, last_raw)

        try:
            json_text = _extract_json_array(last_raw)
            tasks: list[Any] = json.loads(json_text)
            tasks = _repair_tasks(tasks)
            _validate(tasks, task_count)
            logger.info(
                "Task generation succeeded on attempt %d/%d — %d tasks validated.",
                attempt, total_attempts, len(tasks),
            )
            metadata = {
                "generation_model":    model_name,
                "generation_attempts": attempt,
                "content_char_count":  len(unit_content),
                "prompt_char_count":   len(prompt),
                "raw_output_preview":  last_raw[:500],
                "content_language":    content_language,
                "task_language":       task_language,
            }
            return tasks, metadata

        except (ValueError, json.JSONDecodeError) as exc:
            last_error = exc
            logger.warning(
                "Attempt %d/%d FAILED — %s\nRaw output preview:\n%.600s",
                attempt, total_attempts, exc, last_raw,
            )

    logger.error(
        "Task generation EXHAUSTED all %d attempts.\n"
        "Last error: %s\n"
        "Last raw output (full):\n%s",
        total_attempts, last_error, last_raw,
    )
    raise ValueError(
        f"Task generation failed after {total_attempts} attempts. "
        f"Last error: {last_error}"
    ) from last_error


# ── single-task regeneration ──────────────────────────────────────────────────

def _build_regen_prompt(
    unit_content: str,
    old_task: dict,
    difficulty: str,
    content_language: str = "auto",
    task_language: str = "english",
) -> str:
    """
    Prompt for replacing ONE specific task the teacher rejected.
    The old task is shown so the model knows what to avoid.
    """
    old_title = old_task.get("title", "")
    old_type  = old_task.get("type", "")

    lang_block = ""
    if content_language and content_language != "auto":
        lang_block += f"\n- SOURCE CONTENT is written in {content_language.upper()}."
    if task_language:
        lang_block += (
            f"\n- Write the new task instructions and example answer "
            f"in {task_language.upper()}."
        )

    types_str = ", ".join(f'"{t}"' for t in _TASK_TYPES)

    return f"""You are a strict JSON generator for educational practice tasks. Output ONLY a JSON array with exactly 1 object.

TASK
----
Generate ONE new practice task based on the SOURCE CONTENT below.
This replaces a task the teacher rejected.
{lang_block}

EXISTING TASK TO REPLACE (do NOT copy or repeat)
-------------------------------------------------
Title: {old_title}
Type:  {old_type}

REQUIREMENTS FOR THE NEW TASK
------------------------------
1. Must practise a DIFFERENT concept or vocabulary set than the task above.
2. Must NOT reuse the same title or close paraphrase of it.
3. Should use a different "type" if possible (allowed: {types_str}).
4. Difficulty target: {difficulty}

ANTI-HALLUCINATION
------------------
Every concept in the task MUST appear in the SOURCE CONTENT.

OUTPUT RULES
------------
Return ONLY a JSON array with exactly 1 object with these seven keys:
  "type"           — one of {types_str}
  "title"          — concise task name, max 10 words
  "description"    — one sentence explaining the pedagogical goal
  "instructions"   — full student-facing instructions (2–4 sentences)
  "content"        — text/passage the student works with (may be "")
  "example_answer" — a correct, complete sample answer
  "grading_hints"  — brief teacher marking note (1–2 sentences)

SOURCE CONTENT
--------------
\"\"\"{unit_content}\"\"\"

Output ONLY the JSON array with 1 object."""


async def regenerate_single_task(
    unit_content: str,
    old_task: dict,
    difficulty: str,
    *,
    content_language: str = "auto",
    task_language: str = "english",
    provider: "AIProvider | None" = None,
    max_retries: int = 2,
) -> tuple[dict, dict]:
    """
    Generate one replacement task that covers a different concept than
    the existing task.

    Parameters
    ----------
    old_task : dict
        The task being replaced.  Must have at least "title" and "type".
        Used to tell the model what NOT to generate.

    Returns
    -------
    (task_dict, metadata)
        task_dict : dict with all seven required task keys
        metadata  : traceability dict
    """
    if not unit_content or not unit_content.strip():
        raise ValueError("unit_content must not be empty.")

    _provider = provider or _default_provider
    model_name = getattr(_provider, "model", type(_provider).__name__)

    prompt = _build_regen_prompt(
        unit_content, old_task, difficulty,
        content_language=content_language,
        task_language=task_language,
    )

    last_error: Exception | None = None
    last_raw: str = ""
    total_attempts = max_retries + 1

    for attempt in range(1, total_attempts + 1):
        logger.info(
            "Task regen attempt %d/%d — model=%s difficulty=%s",
            attempt, total_attempts, model_name, difficulty,
        )

        last_raw = await _provider.agenerate(prompt)

        try:
            json_text = _extract_json_array(last_raw)
            tasks: list = json.loads(json_text)
            tasks = _repair_tasks(tasks)
            _validate(tasks, task_count=1)

            t = tasks[0]
            logger.info(
                "Task regen succeeded on attempt %d — type=%r title=%r",
                attempt, t.get("type", ""), t.get("title", "")[:60],
            )
            metadata = {
                "generation_model":    model_name,
                "generation_attempts": attempt,
                "content_char_count":  len(unit_content),
                "prompt_char_count":   len(prompt),
                "raw_output_preview":  last_raw[:400],
                "content_language":    content_language,
                "task_language":       task_language,
                "replaced_title":      old_task.get("title", "")[:200],
            }
            return t, metadata

        except (ValueError, json.JSONDecodeError) as exc:
            last_error = exc
            logger.warning(
                "Task regen attempt %d/%d FAILED — %s\nRaw: %.400s",
                attempt, total_attempts, exc, last_raw,
            )

    logger.error(
        "Task regen EXHAUSTED %d attempts. Last error: %s\nLast raw:\n%s",
        total_attempts, last_error, last_raw,
    )
    raise ValueError(
        f"Task regeneration failed after {total_attempts} attempts. "
        f"Last error: {last_error}"
    ) from last_error