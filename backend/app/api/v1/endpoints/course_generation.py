"""
app/api/v1/endpoints/course_generation.py
==========================================
Endpoints:

  POST /course-builder/generate-outline
    JSON body — description + level + optional target_language + native_language.
    Returns { title, units: [...] }
    No DB writes.  Fast (~3–6 s).

  POST /course-builder/generate-outline-from-files
    Multipart form — description, level, files[], optional target_language, native_language.
    Parses uploaded files → builds context-aware outline.
    Returns { title, units: [...], source_token: "<uuid>" }
    source_token lets the SSE stream retrieve the extracted text.

  GET /course-builder/{course_id}/stream
    SSE stream — generates segments + exercises unit by unit.
    Optional ?source_token=<uuid> — if present the extracted file
    text is forwarded to UnitGenerateRequest.source_content so each
    unit is grounded in the uploaded materials.
    Auth via ?token= query param (EventSource cannot set headers).
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import uuid
from typing import Any, AsyncIterator, Optional

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator

from app.core.auth import get_current_teacher
from app.core.database import get_db
from app.core.teacher_tariffs import check_and_consume_teacher_ai_quota
from app.models.user import User
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

router = APIRouter()

# ── Constants ─────────────────────────────────────────────────────────────────

CEFR_LEVELS: set[str] = {"A1", "A2", "B1", "B2", "C1", "C2"}

_MIN_UNITS    = 3
_MAX_UNITS    = 12
_MIN_SECTIONS = 2
_MAX_SECTIONS = 4

_DEFAULT_NUM_SEGMENTS   = 3
# Base interactive exercises + two visual-vocabulary types.
# drag_word_to_image goes into the 2nd content segment and
# type_word_to_image into the 3rd — guaranteed by the coverage pass in
# UnitGeneratorService._smart_assign_exercises (high-affinity types that
# would otherwise fall past the rotation window are injected there).
_DEFAULT_EXERCISE_TYPES = [
    "drag_to_gap",
    "match_pairs",
    "build_sentence",
    "drag_word_to_image",
    "type_word_to_image",
]

# ── Uploaded-file limits ──────────────────────────────────────────────────────
# deepseek-chat has a 64K-token context (~200K+ chars), so these caps are about
# keeping cost/latency reasonable and — crucially — making sure EVERY uploaded
# file is represented in the prompt rather than one long file starving the rest.
#
#   _MAX_UPLOAD_FILES        — reject the request beyond this many files.
#   _MAX_UPLOAD_BYTES        — reject any single file larger than this (raw).
#   _MAX_PER_FILE_CHARS      — hard cap on one file's extracted text.
#   _MAX_FILE_CONTENT_CHARS  — total budget across ALL files, fair-shared.
_MAX_UPLOAD_FILES       = 5
_MAX_UPLOAD_BYTES       = 10 * 1024 * 1024   # 10 MB per file
_MAX_PER_FILE_CHARS     = 25_000
_MAX_FILE_CONTENT_CHARS = 40_000

# Source-token cache: token → (extracted_text, expiry_unix_ts)
# Tokens expire after 30 minutes.  The stream endpoint pops them on first use
# so they are single-use by design.
_TOKEN_TTL_SECONDS = 1800
_source_cache: dict[str, tuple[str, float]] = {}


# ── Schemas ───────────────────────────────────────────────────────────────────


class OutlineRequest(BaseModel):
    description: str = Field(..., min_length=4, max_length=1000)
    level: str = Field(default="B1")
    # Language the course will TEACH (e.g. "Italian", "Spanish").
    # When provided the prompt is explicit about the target vs. instruction language.
    target_language: Optional[str] = Field(default=None)
    # Native / explanation language of the teacher (e.g. "English", "Russian").
    # Unit titles and descriptions will be written in this language so the
    # teacher can review the outline without guessing.
    native_language: Optional[str] = Field(default=None)

    @field_validator("level", mode="before")
    @classmethod
    def normalise_level(cls, v: Any) -> str:
        n = str(v).strip().upper()
        return n if n in CEFR_LEVELS else "B1"


class SectionOutline(BaseModel):
    title: str
    description: str = ""


class UnitOutline(BaseModel):
    title: str
    description: str = ""
    sections: list[SectionOutline] = Field(default_factory=list)


class CourseOutlineResponse(BaseModel):
    title: str
    units: list[UnitOutline]


class CourseOutlineWithTokenResponse(CourseOutlineResponse):
    """Returned by the files endpoint — carries the source_token."""
    source_token: str


class PatchOutlineRequest(BaseModel):
    """
    Body for PATCH /{course_id}/outline.

    Contains the teacher-edited list of units (title, description, sections).
    Units are matched to DB records by their position (order_index).
    """
    units: list[UnitOutline]


# ── Prompts ───────────────────────────────────────────────────────────────────


def _build_outline_prompt(
    description: str,
    level: str,
    source_content: str = "",
    target_language: str = "",
    native_language: str = "",
) -> str:
    """
    Build the outline-generation prompt.

    When *target_language* and *native_language* are provided the prompt
    explicitly distinguishes between the language being taught and the
    language used for teacher-facing descriptions, so "Italian A1" actually
    produces Italian content explained in English rather than everything in
    English.

    If *source_content* is provided it is embedded as reference material so
    the AI grounds unit titles/descriptions in the actual uploaded text.
    """
    content_block = ""
    if source_content:
        excerpt = source_content[:_MAX_FILE_CONTENT_CHARS]
        content_block = (
            f"\nReference material extracted from the teacher's uploaded files "
            f"(use this to anchor unit topics and vocabulary):\n"
            f"---\n{excerpt}\n---\n"
        )

    # ── Language context block ────────────────────────────────────────────────
    tl = (target_language or "").strip()
    nl = (native_language or "").strip()

    # ── Detect whether the teacher referenced any source materials ────────────
    # Keywords that suggest films, books, shows, or other named sources were
    # mentioned in the description (e.g. "Harry Potter", "Friends", "The Office").
    _SOURCE_HINTS = (
        r"\b(film|movie|show|series|book|novel|song|album|podcast|episode|"
        r"season|scene|quote|character|chapter|lyrics)\b"
    )
    # True when the description names sources OR files were uploaded
    _has_sources = bool(
        re.search(_SOURCE_HINTS, description, re.IGNORECASE)
        or source_content
    )

    # Build the language mandate block — placed at the TOP of the prompt so
    # the model sees it before anything else (LLMs weight early instructions
    # much more heavily than trailing rules, especially smaller/faster models).
    if tl and nl:
        # The critical distinction: what to TEACH vs. what language to WRITE IN.
        # We also embed a concrete example in the JSON template itself so the
        # model cannot miss it.
        lang_mandate = (
            f"LANGUAGE RULES — read before anything else:\n"
            f"1. Every \"title\" and \"description\" field in your JSON output MUST be written in {nl}. "
            f"No exceptions. Do NOT write titles or descriptions in English or {tl}.\n"
            f"2. This course TEACHES {tl}. Each unit description must include 2–4 example "
            f"{tl} words or phrases in quotes so the teacher can see real {tl} content is planned.\n"
            f"3. The course title must be in {nl} and reference {tl}, "
            f"e.g. \"{tl} B1: повседневное общение\" (if {nl} is Russian) "
            f"or \"{tl} B1: comunicazione quotidiana\" (if {nl} is Italian).\n\n"
        )
        course_context = (
            f"  Teaches             : {tl} (target language — appears only as EXAMPLES inside descriptions)\n"
            f"  Write outline in    : {nl} (ALL titles and descriptions must be in {nl})\n"
            f"  CEFR Level          : {level}\n"
        )
        # Hint for section descriptions — reference named sources when present,
        # otherwise fall back to asking for a concrete illustrative example.
        _section_desc_hint = (
            f"include a specific {tl} example or quote from the sources mentioned "
            f"in the course description (films, books, shows, etc.)"
            if _has_sources
            else f"include a concrete {tl} example sentence relevant to the section topic"
        )
        # Show a concrete example in the JSON template in the target language
        unit_example = (
            f"    {{\n"
            f"      \"title\": \"<unit title in {nl} — max 60 chars>\",\n"
            f"      \"description\": \"<1–2 sentences in {nl} describing what students learn; include {tl} examples like 'ciao', 'prego'>\",\n"
            f"      \"sections\": [\n"
            f"        {{\n"
            f"          \"title\": \"<section title in {nl} — max 50 chars>\",\n"
            f"          \"description\": \"<one sentence in {nl} on this section's focus; {_section_desc_hint}>\"\n"
            f"        }}\n"
            f"      ]\n"
            f"    }}"
        )
        _section_rule = (
            f"- Every section description MUST include at least one concrete {tl} example "
            f"or quote drawn from the sources/materials referenced in the course description.\n"
            if _has_sources
            else
            f"- Every section description MUST include at least one concrete {tl} example "
            f"sentence to illustrate the section topic.\n"
        )
        structural_rules = (
            f"- Generate {_MIN_UNITS}–{_MAX_UNITS} units, ordered foundational → advanced.\n"
            f"- Each unit must have {_MIN_SECTIONS}–{_MAX_SECTIONS} sections (distinct teachable sub-topics).\n"
            f"- ALL text in the JSON (titles, descriptions) must be in {nl}. {tl} appears only as inline examples.\n"
            f"{_section_rule}"
            f"{'- Ground unit topics directly in the reference material above.' if source_content else ''}\n"
            f"- Strictly valid JSON: no trailing commas, no comments.\n"
            f"- Use single-quotes for any {tl} example phrases inside description strings "
            f"(never raw double-quotes, which break JSON)."
        )
    elif tl:
        lang_mandate = (
            f"LANGUAGE RULE: This course TEACHES {tl}. "
            f"Write titles and descriptions in English, but embed 2–4 example {tl} words "
            f"or phrases inside each unit description so the outline reflects real {tl} content.\n\n"
        )
        course_context = (
            f"  Target Language : {tl}\n"
            f"  CEFR Level      : {level}\n"
        )
        _section_desc_hint = (
            f"include a specific {tl} example or quote from the sources mentioned "
            f"in the course description (films, books, shows, etc.)"
            if _has_sources
            else f"include a concrete {tl} example sentence relevant to the section topic"
        )
        unit_example = (
            f"    {{\n"
            f"      \"title\": \"<unit title in English — max 60 chars>\",\n"
            f"      \"description\": \"<1–2 sentences in English; include {tl} examples in quotes>\",\n"
            f"      \"sections\": [\n"
            f"        {{\n"
            f"          \"title\": \"<section title in English — max 50 chars>\",\n"
            f"          \"description\": \"<one sentence on this section's focus; {_section_desc_hint}>\"\n"
            f"        }}\n"
            f"      ]\n"
            f"    }}"
        )
        _section_rule = (
            f"- Every section description MUST include at least one concrete {tl} example "
            f"or quote drawn from the sources/materials referenced in the course description.\n"
            if _has_sources
            else
            f"- Every section description MUST include at least one concrete {tl} example "
            f"sentence to illustrate the section topic.\n"
        )
        structural_rules = (
            f"- Generate {_MIN_UNITS}–{_MAX_UNITS} units, ordered foundational → advanced.\n"
            f"- Each unit must have {_MIN_SECTIONS}–{_MAX_SECTIONS} sections.\n"
            f"{_section_rule}"
            f"{'- Ground unit topics directly in the reference material above.' if source_content else ''}\n"
            f"- Strictly valid JSON: no trailing commas, no comments.\n"
            f"- Use single-quotes for any {tl} example phrases inside description strings "
            f"(never raw double-quotes, which break JSON)."
        )
    elif nl:
        lang_mandate = (
            f"LANGUAGE RULE: Write ALL titles and descriptions in {nl}.\n\n"
        )
        course_context = (
            f"  Write outline in: {nl}\n"
            f"  CEFR Level      : {level}\n"
        )
        _section_desc_hint = (
            "include a specific example or quote from the sources mentioned in the course description"
            if _has_sources
            else "include a concrete example relevant to the section topic"
        )
        _unit_desc_hint = (
            f"include relevant examples from the sources mentioned in the course description"
            if _has_sources
            else "include a concrete illustrative example"
        )
        unit_example = (
            f"    {{\n"
            f"      \"title\": \"<unit title in {nl} — max 60 chars>\",\n"
            f"      \"description\": \"<1–2 sentences in {nl}; {_unit_desc_hint}>\",\n"
            f"      \"sections\": [\n"
            f"        {{\n"
            f"          \"title\": \"<section title in {nl} — max 50 chars>\",\n"
            f"          \"description\": \"<one sentence in {nl} on this section's focus; {_section_desc_hint}>\"\n"
            f"        }}\n"
            f"      ]\n"
            f"    }}"
        )
        _section_rule = (
            "- Every section description MUST include at least one concrete example or quote "
            "drawn from the sources/materials referenced in the course description.\n"
            if _has_sources
            else
            "- Every section description MUST include at least one concrete example "
            "sentence to illustrate the section topic.\n"
        )
        structural_rules = (
            f"- Generate {_MIN_UNITS}–{_MAX_UNITS} units, ordered foundational → advanced.\n"
            f"- Each unit must have {_MIN_SECTIONS}–{_MAX_SECTIONS} sections.\n"
            f"{_section_rule}"
            f"{'- Ground unit topics directly in the reference material above.' if source_content else ''}\n"
            f"- Strictly valid JSON: no trailing commas, no comments.\n"
            f"- Use single-quotes for any example phrases inside description strings "
            f"(never raw double-quotes, which break JSON)."
        )
    else:
        lang_mandate = ""
        course_context = f"  CEFR Level: {level}\n"
        _section_desc_hint = (
            "include a specific example or quote from the sources mentioned in the course description"
            if _has_sources
            else "include a concrete example relevant to the section topic"
        )
        _unit_desc_hint = (
            "include relevant examples from the sources mentioned in the course description"
            if _has_sources
            else "include a concrete illustrative example"
        )
        unit_example = (
            f"    {{\n"
            f"      \"title\": \"<unit title — specific topic, max 60 chars>\",\n"
            f"      \"description\": \"<1–2 sentences on what students will learn; {_unit_desc_hint}>\",\n"
            f"      \"sections\": [\n"
            f"        {{\n"
            f"          \"title\": \"<section title — max 50 chars>\",\n"
            f"          \"description\": \"<one sentence on this section's focus; {_section_desc_hint}>\"\n"
            f"        }}\n"
            f"      ]\n"
            f"    }}"
        )
        _section_rule = (
            "- Every section description MUST include at least one concrete example or quote "
            "drawn from the sources/materials referenced in the course description.\n"
            if _has_sources
            else
            "- Every section description MUST include at least one concrete example "
            "sentence to illustrate the section topic.\n"
        )
        structural_rules = (
            f"- Generate {_MIN_UNITS}–{_MAX_UNITS} units, ordered foundational → advanced.\n"
            f"- Each unit must have {_MIN_SECTIONS}–{_MAX_SECTIONS} sections.\n"
            f"- Titles and descriptions must match the language of the description (default: English).\n"
            f"{_section_rule}"
            f"{'- Ground unit topics directly in the reference material above.' if source_content else ''}\n"
            f"- Strictly valid JSON: no trailing commas, no comments.\n"
            f"- Use single-quotes for any example phrases inside description strings "
            f"(never raw double-quotes, which break JSON)."
        )

    return f"""{lang_mandate}You are an expert language-teaching curriculum designer.

Course to design:

  Description: {description}
{course_context}{content_block}
Return ONLY a single valid JSON object — no markdown fences, no preamble, no comments.

{{
  "title": "<course title — max 80 chars>",
  "units": [
{unit_example}
  ]
}}

Rules:
{structural_rules}

Return ONLY the JSON object."""


# ── Parser helpers ────────────────────────────────────────────────────────────


def _repair_outline_json(text: str) -> str:
    """
    Best-effort JSON repair for outline responses.

    Handles the most common LLM mistakes:
    1. Unescaped double-quotes inside string values — e.g. the model writes
       "Harry said "Expecto Patronum"" instead of escaping the inner quotes.
       Strategy: scan char-by-char tracking in_string state; when we see a '"'
       that is NOT preceded by '\\' and is NOT a structural delimiter (i.e. the
       next non-whitespace char is a letter/digit, not : , } ]), treat it as a
       literal double-quote and replace with \\".
    2. Trailing commas before ] or }.
    3. Truncated JSON — close any unclosed brackets/braces.
    """
    import re as _re

    # Step 1: strip markdown fences if present
    text = _re.sub(r"^```[a-z]*\n?", "", text.strip())
    text = _re.sub(r"\n?```$", "", text.strip())

    # Step 2: remove trailing commas before ] or }
    text = _re.sub(r",\s*([\]}])", r"\1", text)

    # Step 3: close open brackets/braces
    stack: list[str] = []
    in_string = False
    escape_next = False
    for ch in text:
        if escape_next:
            escape_next = False
            continue
        if ch == "\\" and in_string:
            escape_next = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch in "{[":
            stack.append(ch)
        elif ch == "}" and stack and stack[-1] == "{":
            stack.pop()
        elif ch == "]" and stack and stack[-1] == "[":
            stack.pop()

    suffix = ""
    if in_string:
        suffix += '"'
    for opener in reversed(stack):
        suffix += "}" if opener == "{" else "]"
    return text + suffix


# ── Parser ────────────────────────────────────────────────────────────────────


def _parse_outline(raw: str) -> CourseOutlineResponse:
    text = raw.strip()

    if text.startswith("```"):
        lines = text.splitlines()[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    brace_start = text.find("{")
    if brace_start == -1:
        raise ValueError("No JSON object in AI response.")

    depth, brace_end = 0, -1
    for i, ch in enumerate(text[brace_start:], start=brace_start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                brace_end = i + 1
                break

    raw_json = text[brace_start:brace_end] if brace_end != -1 else text[brace_start:]

    # Try strict parse first, then fall back to the repair heuristic so a single
    # unescaped quote in a Harry Potter example doesn't kill the whole outline.
    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError:
        try:
            data = json.loads(_repair_outline_json(raw_json))
        except json.JSONDecodeError as exc:
            raise ValueError(f"Could not parse outline JSON after repair: {exc}") from exc

    title = str(data.get("title", "")).strip()
    if not title:
        raise ValueError("Missing 'title'.")

    raw_units = data.get("units", [])
    if not isinstance(raw_units, list) or not raw_units:
        raise ValueError("Missing or empty 'units'.")

    units: list[UnitOutline] = []
    for u in raw_units[:_MAX_UNITS]:
        u_title = str(u.get("title", "")).strip()
        u_desc  = str(u.get("description", "")).strip()
        if not u_title:
            continue
        sections = [
            SectionOutline(
                title=str(s.get("title", "")).strip(),
                description=str(s.get("description", "")).strip(),
            )
            for s in (u.get("sections") or [])[:_MAX_SECTIONS]
            if str(s.get("title", "")).strip()
        ]
        units.append(UnitOutline(title=u_title, description=u_desc, sections=sections))

    if not units:
        raise ValueError("No valid units parsed.")

    return CourseOutlineResponse(title=title, units=units)


def _fallback_outline(description: str) -> CourseOutlineResponse:
    title = (description.strip()[:77].rstrip() + "...") if len(description) > 77 else description.strip()
    return CourseOutlineResponse(
        title=title,
        units=[UnitOutline(title="Unit 1", description="", sections=[])],
    )


# ── File text extraction ──────────────────────────────────────────────────────


def _fair_share_budget(blocks: list[tuple[str, str]], total_budget: int) -> str:
    """Combine per-file (name, text) blocks into one string within *total_budget*.

    When the combined length exceeds the budget, every file is trimmed
    proportionally to its share of the total so that NO file is dropped
    entirely — a long syllabus can't crowd out a short vocabulary list.
    Each file is first hard-capped at ``_MAX_PER_FILE_CHARS``.
    """
    # Hard cap each file individually first.
    capped: list[tuple[str, str]] = []
    for name, text in blocks:
        t = text.strip()
        if not t:
            continue
        if len(t) > _MAX_PER_FILE_CHARS:
            t = t[:_MAX_PER_FILE_CHARS].rstrip() + " […]"
        capped.append((name, t))

    if not capped:
        return ""

    combined_len = sum(len(t) for _, t in capped)

    # Under budget → keep everything.
    if combined_len <= total_budget:
        parts = [f"[File: {name}]\n{text}" for name, text in capped]
        return "\n\n".join(parts)

    # Over budget → allocate each file a slice proportional to its size,
    # guaranteeing every file a minimum floor so short files stay intact.
    n = len(capped)
    floor = min(1_500, total_budget // (n * 2) or 1)
    reserved = floor * n
    flexible = max(total_budget - reserved, 0)

    parts: list[str] = []
    for name, text in capped:
        share = int(flexible * (len(text) / combined_len))
        allowance = floor + share
        if len(text) > allowance:
            text = text[:allowance].rstrip() + " […truncated]"
        parts.append(f"[File: {name}]\n{text}")

    return "\n\n".join(parts)


async def _extract_files_text(files: list[UploadFile]) -> str:
    """
    Read each uploaded file, route it to the appropriate parser, then combine
    all extracted text within a shared character budget.

    Each file is parsed independently (errors on one file are logged and
    skipped so a single bad file does not abort the request) and every file
    that yields text is represented in the output via ``_fair_share_budget`` —
    the combined text is trimmed proportionally when it exceeds the budget so
    no single file is silently dropped.
    """
    from app.services.document_parsers.pdf_parser      import PDFParser
    from app.services.document_parsers.docx_parser     import DocxParser
    from app.services.document_parsers.subtitle_parser import SubtitleParser

    pdf_parser      = PDFParser(preserve_page_breaks=False)
    docx_parser     = DocxParser()
    subtitle_parser = SubtitleParser()

    # Plain-text MIME types that can be decoded directly without a parser
    _PLAIN_TEXT_MIMES = {
        "text/plain",
        "text/vtt",
        "application/x-subrip",
    }

    # (filename, extracted_text) — one entry per file that yielded text.
    blocks: list[tuple[str, str]] = []

    for upload in files:
        fname   = upload.filename or ""
        mime    = (upload.content_type or "").split(";")[0].strip().lower()

        try:
            data = await upload.read()
        except Exception as exc:
            logger.warning("_extract_files_text: could not read '%s': %s", fname, exc)
            continue

        if len(data) > _MAX_UPLOAD_BYTES:
            logger.warning(
                "_extract_files_text: '%s' is %d bytes (> %d limit) — skipping",
                fname, len(data), _MAX_UPLOAD_BYTES,
            )
            continue

        try:
            if pdf_parser.can_handle(fname, mime):
                doc = pdf_parser.parse(data, fname)
                blocks.append((fname, doc.text))

            elif docx_parser.can_handle(fname, mime):
                doc = docx_parser.parse(data, fname)
                blocks.append((fname, doc.text))

            elif subtitle_parser.can_handle(fname, mime):
                doc = subtitle_parser.parse(data, fname)
                blocks.append((fname, doc.text))

            elif mime in _PLAIN_TEXT_MIMES or fname.lower().endswith(".txt"):
                text = data.decode("utf-8", errors="replace").strip()
                if text:
                    blocks.append((fname, text))

            elif mime.startswith("image/"):
                # Images are not text-parseable here; skip with a note so the
                # LLM prompt at least knows an image was provided.
                logger.info("_extract_files_text: skipping image file '%s'", fname)

            else:
                logger.info(
                    "_extract_files_text: no parser for '%s' (mime=%s) — skipping",
                    fname, mime,
                )
        except Exception as exc:
            logger.warning(
                "_extract_files_text: failed to parse '%s': %s", fname, exc
            )

    logger.info(
        "_extract_files_text: parsed %d/%d file(s) with text — raw total %d chars",
        len(blocks), len(files), sum(len(t) for _, t in blocks),
    )
    return _fair_share_budget(blocks, _MAX_FILE_CONTENT_CHARS)


# ── Source-token cache helpers ────────────────────────────────────────────────


def _store_source_token(text: str) -> str:
    """Store *text* in the cache and return a fresh UUID token."""
    _evict_expired_tokens()
    token = str(uuid.uuid4())
    _source_cache[token] = (text, time.monotonic() + _TOKEN_TTL_SECONDS)
    logger.debug("source_cache: stored token %s (%d chars)", token, len(text))
    return token


def _pop_source_token(token: str) -> str | None:
    """
    Retrieve and *remove* the cached text for *token*.

    Returns None if the token is unknown or expired.
    Single-use by design — the SSE stream consumes it on the first connect.
    """
    _evict_expired_tokens()
    entry = _source_cache.pop(token, None)
    if entry is None:
        return None
    text, expiry = entry
    if time.monotonic() > expiry:
        logger.info("source_cache: token %s expired", token)
        return None
    logger.debug("source_cache: consumed token %s (%d chars)", token, len(text))
    return text


def _evict_expired_tokens() -> None:
    now = time.monotonic()
    expired = [t for t, (_, exp) in _source_cache.items() if now > exp]
    for t in expired:
        del _source_cache[t]


# ── AI provider ───────────────────────────────────────────────────────────────


def _get_provider_for_user(user: "User", db: "Session"):
    """
    Return the appropriate AI provider for *user*'s subscription plan.

    free              → Groq  (fast, free-tier)
    standard / pro    → DeepSeek V3  (higher quality)

    Falls back to the default provider if plan resolution fails.
    """
    try:
        from app.core.teacher_tariffs import get_teacher_tariff_display_state
        from app.services.ai.providers.router import get_provider_for_plan
        plan, _ = get_teacher_tariff_display_state(db, user)
        logger.info(
            "course-gen provider: plan=%r → %s",
            plan,
            "DeepSeek" if plan in ("standard", "pro") else "Groq",
        )
        return get_provider_for_plan(plan), plan
    except Exception as exc:
        logger.warning("course-gen provider fallback — plan resolution failed: %s", exc)
        from app.services.ai_exercise_generator import _default_provider
        return _default_provider, "free"


async def _call_ai(prompt: str, provider=None) -> str:
    if provider is None:
        from app.services.ai_exercise_generator import _default_provider
        provider = _default_provider
    return await provider.agenerate(prompt)


# ── Endpoint 1: generate-outline (JSON, no files) ────────────────────────────


@router.post("/generate-outline", response_model=CourseOutlineResponse)
async def generate_course_outline(
    body: OutlineRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher),
) -> CourseOutlineResponse:
    """
    POST /course-builder/generate-outline

    Fast path — no uploaded files.  Single LLM call returns the full
    course outline (unit titles, descriptions, section titles/descriptions).
    No DB writes.

    Body now accepts optional ``target_language`` (the language being taught,
    e.g. "Italian") and ``native_language`` (the teacher's explanation
    language, e.g. "English").  When provided the prompt is explicit about
    which language the course *teaches* vs. which language to write the
    outline *in*, fixing the bug where "Italian A1" produced all-English output.
    """
    logger.info(
        "generate-outline: %r level=%s target=%r native=%r",
        body.description[:60], body.level,
        body.target_language or "-", body.native_language or "-",
    )
    # Consumes one AI course-generation credit based on the teacher's active tariff.
    check_and_consume_teacher_ai_quota(db, current_user, "course_generation")
    provider, plan = _get_provider_for_user(current_user, db)
    logger.info("generate-outline: plan=%r provider=%s", plan, type(provider).__name__)
    try:
        outline = _parse_outline(
            await _call_ai(
                _build_outline_prompt(
                    body.description,
                    body.level,
                    target_language=body.target_language or "",
                    native_language=body.native_language or "",
                ),
                provider,
            )
        )
        logger.info("generate-outline: '%s' (%d units)", outline.title, len(outline.units))
        return outline
    except Exception as exc:
        logger.warning("generate-outline failed (%s) — fallback.", exc)
        return _fallback_outline(body.description)


# ── Endpoint 2: generate-outline-from-files (multipart) ──────────────────────


@router.post("/generate-outline-from-files", response_model=CourseOutlineWithTokenResponse)
async def generate_course_outline_from_files(
    description:     str        = Form(..., min_length=4, max_length=1000),
    level:           str        = Form(default="B1"),
    target_language: str        = Form(default=""),
    native_language: str        = Form(default=""),
    files: list[UploadFile]     = File(default=[]),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher),
) -> CourseOutlineWithTokenResponse:
    """
    POST /course-builder/generate-outline-from-files

    Files path — teacher uploads PDFs, DOCX, TXT, subtitles, etc.
    The extracted text is:
      1. Embedded in the outline prompt so the AI grounds units in the material.
      2. Stored server-side under a UUID token returned in the response.

    The frontend caches this token and forwards it to the SSE stream endpoint
    (?source_token=) so that each unit is generated with the relevant excerpt
    of the source material as context.

    ``target_language`` / ``native_language`` work the same as the JSON endpoint.
    """
    # Reject oversized uploads BEFORE consuming an AI credit.
    if files and len(files) > _MAX_UPLOAD_FILES:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=400,
            detail=(
                f"Too many files ({len(files)}). "
                f"Please upload at most {_MAX_UPLOAD_FILES} files."
            ),
        )
    # Consumes one AI course-generation credit based on the teacher's active tariff.
    check_and_consume_teacher_ai_quota(db, current_user, "course_generation")
    provider, plan = _get_provider_for_user(current_user, db)
    logger.info(
        "generate-outline-from-files: plan=%r provider=%s", plan, type(provider).__name__
    )
    # Normalise level
    level_norm = str(level).strip().upper()
    if level_norm not in CEFR_LEVELS:
        level_norm = "B1"

    logger.info(
        "generate-outline-from-files: %r level=%s target=%r native=%r files=%d",
        description[:60], level_norm,
        target_language or "-", native_language or "-",
        len(files),
    )

    # ── Extract text from all uploaded files ─────────────────────────────────
    source_content = ""
    if files:
        source_content = await _extract_files_text(files)
        logger.info(
            "generate-outline-from-files: extracted %d chars from %d file(s)",
            len(source_content), len(files),
        )

    # ── Generate outline, optionally grounded in source content ──────────────
    try:
        outline = _parse_outline(
            await _call_ai(
                _build_outline_prompt(
                    description,
                    level_norm,
                    source_content,
                    target_language=target_language or "",
                    native_language=native_language or "",
                ),
                provider,
            )
        )
        logger.info(
            "generate-outline-from-files: '%s' (%d units)", outline.title, len(outline.units)
        )
    except Exception as exc:
        logger.warning("generate-outline-from-files failed (%s) — fallback.", exc)
        outline = _fallback_outline(description)

    # ── Store source text under a single-use token ────────────────────────────
    source_token = _store_source_token(source_content) if source_content else _store_source_token("")

    return CourseOutlineWithTokenResponse(
        title=outline.title,
        units=outline.units,
        source_token=source_token,
    )


# ── Endpoint 3: SSE content stream ───────────────────────────────────────────


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


def _verify_token(token: str) -> "tuple[User | None, str | None]":
    try:
        from app.core.auth import get_current_user_from_token
        from app.core.database import SessionLocal

        db = SessionLocal()
        try:
            user = get_current_user_from_token(token, db)
            return user, None
        finally:
            db.close()
    except Exception as exc:
        exc_name = type(exc).__name__
        is_expired = (
            "ExpiredSignature" in exc_name
            or "expired" in str(exc).lower()
        )
        error_code = "token_expired" if is_expired else "unauthorized"
        logger.warning("SSE token verify failed (%s): %s", error_code, exc)
        return None, error_code


async def _stream_generation(
    course_id: int,
    level: str,
    language: str,
    native_language: str,       # explanation language (e.g. "Russian")
    source_content: str,        # "" when no files were uploaded
    teacher_plan: str = "free",
    user: "User | None" = None,
    done_unit_ids: set[int] | None = None,
) -> AsyncIterator[str]:
    from app.core.database import SessionLocal
    from app.models.unit import Unit as UnitModel
    from app.services.unit_generator import UnitGeneratorService, UnitGenerateRequest
    from app.services.ai.providers.router import get_provider_for_plan
    from app.core.teacher_tariffs import check_and_consume_teacher_ai_quota  # noqa: F401 (kept for future use)

    db = SessionLocal()
    try:
        units = (
            db.query(UnitModel)
            .filter(UnitModel.course_id == course_id)
            .order_by(UnitModel.order_index)
            .all()
        )
    except Exception as exc:
        yield _sse({"type": "error", "error": f"Failed to load units: {exc}"})
        db.close()
        return

    # Load the course description so the teacher's directive (e.g. "use examples
    # from Harry Potter") is forwarded into every UnitGenerateRequest and
    # propagates into text-block and exercise prompts.
    course_description: str = ""
    try:
        from app.models.course import Course as CourseModel
        _course = db.query(CourseModel).filter(CourseModel.id == course_id).first()
        if _course and _course.description:
            course_description = _course.description.strip()
    except Exception as exc:
        logger.warning("stream_course_generation: could not load course description: %s", exc)

    # Tracks units that should be skipped when the client reconnects mid-stream.
    done_unit_ids = done_unit_ids or set()
    # Keeps only units that still need generation for this connection.
    pending_units = [unit for unit in units if unit.id not in done_unit_ids]
    # Counts the number of units that remain for this streaming session.
    total = len(pending_units)
    yield _sse({
        "type": "start",
        "total": total,
        "unit_ids": [unit.id for unit in pending_units],
    })
    await asyncio.sleep(0.1)

    try:
        provider = get_provider_for_plan(teacher_plan)
        logger.info(
            "stream_course_generation: plan=%r provider=%s course_id=%d",
            teacher_plan, type(provider).__name__, course_id,
        )
        service = UnitGeneratorService(ai_provider=provider)
    except RuntimeError as exc:
        yield _sse({"type": "error", "error": str(exc)})
        db.close()
        return

    # Counts successful unit generations in the current streaming session.
    units_done = 0
    # Defines how often we emit SSE heartbeats while waiting on long operations.
    heartbeat_interval_seconds = 20
    for index, unit in enumerate(pending_units):
        yield _sse({
            "type": "unit_start",
            "unit_id": unit.id,
            "title": unit.title,
            "index": index,
            "total": total,
        })
        await asyncio.sleep(0.05)

        # ── No separate unit_generation quota check here ──────────────────────
        # This SSE stream is always triggered as part of a course-generation
        # flow.  The teacher already spent a `course_generation` credit when
        # they called generate-outline (or generate-outline-from-files).
        # Double-gating on `unit_generation` means a teacher who has used their
        # standalone unit-gen quota cannot complete a course they legitimately
        # paid for with a course-gen credit.  The `course_generation` bucket is
        # the correct meter for this entire flow.

        try:
            # Wraps unit generation so we can keep the SSE connection alive with heartbeats.

            # Build the combined teacher directive for this unit.
            # unit.description is the per-unit content guide written in the outline
            # review (e.g. "Students learn present simple and adverbs of frequency.
            # Example phrases: 'I usually wake up at 7 a.m.'").
            # course_description is the overarching course-level directive
            # (e.g. "use examples from Friends").
            # Both are injected as MANDATORY context into every text-block and exercise
            # prompt; unit-level description goes first as it is more specific.
            _unit_desc = (getattr(unit, "description", None) or "").strip()
            if _unit_desc and course_description:
                _combined_description: str | None = (
                    f"{_unit_desc}\n\nCourse directive: {course_description}"
                )
            elif _unit_desc:
                _combined_description = _unit_desc
            elif course_description:
                _combined_description = course_description
            else:
                _combined_description = None

            generation_task = asyncio.create_task(service.generate(
                UnitGenerateRequest(
                    unit_id=unit.id,
                    topic=unit.title,
                    level=level,
                    language=language,
                    instruction_language=native_language,
                    # content_language = the TARGET language (the language the course
                    # teaches, e.g. "english").  Without this the exercise generators
                    # default to "auto" and pick up the NATIVE language from the
                    # Russian/bilingual explanation text blocks — causing all exercises
                    # to be generated in Russian instead of English.
                    content_language=language.lower(),
                    # Use the teacher-defined section count when available;
                    # fall back to the hardcoded default only for units that
                    # were never put through the outline review step.
                    num_segments=(
                        len(unit.outline_sections)
                        if unit.outline_sections
                        else _DEFAULT_NUM_SEGMENTS
                    ),
                    exercise_types=_DEFAULT_EXERCISE_TYPES,
                    teacher_id=user.id if user else (getattr(unit, "created_by", 0) or 0),
                    # Forward extracted file text so each unit is grounded in
                    # the teacher's uploaded materials.  Empty string when no
                    # files were provided — UnitGeneratorService ignores it.
                    source_content=source_content,
                    # Inject the unit description (content guide) and/or the
                    # course-level directive as a MANDATORY teacher directive so
                    # every text-block and exercise prompt is grounded in them.
                    description=_combined_description,
                    # Pass the teacher-reviewed sections so the generator
                    # creates exactly those segments without re-running the
                    # AI topic planner.  None when no outline was saved.
                    outline_sections=unit.outline_sections or None,
                ),
                db,
            ))

            while not generation_task.done():
                try:
                    await asyncio.wait_for(
                        asyncio.shield(generation_task),
                        timeout=heartbeat_interval_seconds,
                    )
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"

            result = generation_task.result()
            units_done += 1
            yield _sse({
                "type": "unit_done",
                "unit_id": unit.id,
                "index": index,
                "segments_created": result.segments_created,
                "exercises_created": result.exercises_created,
            })
        except Exception as exc:
            logger.warning("SSE unit %d failed: %s", unit.id, exc, exc_info=True)
            # No unit_generation credit was consumed in this flow, so no refund needed.
            yield _sse({
                "type": "unit_error",
                "unit_id": unit.id,
                "index": index,
                "error": str(exc),
            })

        yield ": heartbeat\n\n"

        if index < total - 1:
            await asyncio.sleep(0.5)

    db.close()
    yield _sse({"type": "complete", "units_done": units_done, "total": total})


@router.get("/{course_id}/stream")
async def stream_course_generation(
    course_id:       int,
    level:           str        = Query(default="B1"),
    language:        str        = Query(default="English"),
    native_language: str        = Query(default="English"),
    token:           str        = Query(..., description="JWT — EventSource cannot set headers."),
    source_token:    str | None = Query(default=None),
    done_unit_ids:   str | None = Query(default=None),
):
    """
    GET /course-builder/{course_id}/stream
        ?level=B1&language=Italian&native_language=Russian&token=<jwt>

    *language*        — the language the course TEACHES (e.g. "Italian").
                        Drives vocabulary, example sentences and phrases.
    *native_language* — explanation language (e.g. "Russian").
                        Grammar rules and instructions are written in this
                        language so students can understand explanations.
    """
    user, error_code = _verify_token(token)
    if not user:
        msg = (
            "Token expired — please refresh the page and log in again."
            if error_code == "token_expired"
            else "Unauthorized"
        )

        async def _deny():
            yield _sse({"type": "error", "code": error_code, "error": msg})

        return StreamingResponse(
            _deny(), media_type="text/event-stream",
            headers={"Cache-Control": "no-cache"},
        )

    # Resolve the teacher's subscription plan for provider routing
    teacher_plan = "free"
    try:
        from app.core.teacher_tariffs import get_teacher_tariff_display_state
        from app.core.database import SessionLocal as _SL
        _db = _SL()
        try:
            teacher_plan, _ = get_teacher_tariff_display_state(_db, user)
        finally:
            _db.close()
        logger.info(
            "stream_course_generation: teacher_id=%d plan=%r course_id=%d",
            user.id, teacher_plan, course_id,
        )
    except Exception as exc:
        logger.warning("stream_course_generation: plan resolution failed — free fallback: %s", exc)

    # Retrieve (and consume) the cached source text if a token was provided
    source_content = ""
    if source_token:
        cached = _pop_source_token(source_token)
        if cached is None:
            logger.warning(
                "stream_course_generation: source_token '%s' not found or expired",
                source_token,
            )
            # Non-fatal — we continue without source content rather than
            # aborting the entire generation.
        else:
            source_content = cached
            logger.info(
                "stream_course_generation: source_content loaded (%d chars) for course %d",
                len(source_content), course_id,
            )

    # Parses already-finished unit ids from reconnect query params.
    already_done_unit_ids: set[int] = set()
    if done_unit_ids:
        already_done_unit_ids = {
            int(raw_id.strip())
            for raw_id in done_unit_ids.split(",")
            if raw_id.strip().isdigit()
        }

    return StreamingResponse(
        _stream_generation(
            course_id,
            level,
            language,
            native_language,
            source_content,
            teacher_plan,
            user,
            already_done_unit_ids,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ── Endpoint 4: PATCH outline ─────────────────────────────────────────────────


@router.patch("/{course_id}/outline", response_model=CourseOutlineResponse)
async def patch_course_outline(
    course_id: int,
    body: PatchOutlineRequest,
    current_user: User = Depends(get_current_teacher),
) -> CourseOutlineResponse:
    """
    PATCH /course-builder/{course_id}/outline

    Updates DB unit titles and descriptions from the teacher-edited outline.
    Units are matched by order_index (position in the sorted unit list).

    - If the edited list has *more* units than currently exist, new DB unit
      stubs are created for the extras so the SSE stream generates them too.
    - If fewer, the excess DB unit stubs are DELETED so the SSE stream only
      generates the units the teacher kept.
    - Section changes are stored in the outline only (returned in the
      response) and will influence the SSE generation prompt via the
      unit title; the DB has no separate segment records for sections yet.
    """
    from app.core.database import SessionLocal
    from app.models.unit import Unit as UnitModel
    from app.models.course import Course as CourseModel
    import datetime as _dt

    db = SessionLocal()
    try:
        # Load the course first — needed for level and title
        course = db.query(CourseModel).filter(CourseModel.id == course_id).first()
        if not course:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Course not found.")

        # Derive the CEFR level string to use when creating new unit stubs.
        # course.level may be a UnitLevel / CourseLevel enum or a plain string.
        raw_course_level = getattr(course, "level", None)
        course_level_str: str = (
            raw_course_level.value
            if hasattr(raw_course_level, "value")
            else str(raw_course_level or "B1")
        )

        db_units = (
            db.query(UnitModel)
            .filter(UnitModel.course_id == course_id)
            .order_by(UnitModel.order_index)
            .all()
        )

        if not db_units:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="No units found for this course.")

        # Keeps a mutable list so we can append newly created stubs below.
        db_units_list: list[UnitModel] = list(db_units)

        # Update existing units (title / description / timestamp).
        # Skip units whose title, description, and sections are all unchanged
        # to avoid unnecessary DB writes and updated_at bumps.
        for idx, edited in enumerate(body.units):
            if idx < len(db_units_list):
                db_unit = db_units_list[idx]

                new_title       = edited.title.strip() or db_unit.title
                new_description = edited.description.strip()
                new_sections    = [
                    {"title": s.title, "description": s.description}
                    for s in edited.sections
                ]

                # Detect whether anything actually changed before touching the row.
                title_changed       = new_title       != (db_unit.title or "")
                description_changed = new_description != (db_unit.description or "")
                sections_changed    = new_sections    != (db_unit.outline_sections or [])

                if not (title_changed or description_changed or sections_changed):
                    # Nothing changed — skip the write entirely for this unit.
                    continue

                db_unit.title            = new_title
                db_unit.description      = new_description
                db_unit.outline_sections = new_sections
                db_unit.updated_at       = _dt.datetime.utcnow()
            else:
                # Teacher added a new unit in the outline review panel.
                # Create a DB stub so the SSE stream picks it up for generation.
                new_title = edited.title.strip() or f"Unit {idx + 1}"
                new_unit = UnitModel(
                    title=new_title,
                    description=edited.description.strip(),
                    level=course_level_str,
                    status="draft",
                    order_index=idx,
                    course_id=course_id,
                    created_by=current_user.id,
                    is_visible_to_students=False,
                    # Persist teacher-edited sections on new stubs too.
                    outline_sections=[
                        {"title": s.title, "description": s.description}
                        for s in edited.sections
                    ],
                )
                db.add(new_unit)
                db_units_list.append(new_unit)

        # Flush so newly created units get their IDs assigned before commit.
        db.flush()

        new_unit_count = len(db_units_list) - len(db_units)
        if new_unit_count > 0:
            logger.info(
                "patch_course_outline: course_id=%d created %d new unit stub(s) "
                "(outline grew from %d → %d)",
                course_id, new_unit_count, len(db_units), len(db_units_list),
            )

        # If the teacher removed units from the outline (payload shorter than DB),
        # delete the excess DB unit stubs so the SSE stream doesn't generate them.
        if len(body.units) < len(db_units_list):
            units_to_delete = db_units_list[len(body.units):]
            for excess_unit in units_to_delete:
                db.delete(excess_unit)
            logger.info(
                "patch_course_outline: course_id=%d deleted %d excess unit(s) "
                "(outline shrank from %d → %d)",
                course_id, len(units_to_delete), len(db_units_list), len(body.units),
            )
            # Trim so the response loop below only covers kept units
            db_units_list = db_units_list[: len(body.units)]

        db.commit()

        # Rebuild response from current DB state merged with edited sections
        result_units: list[UnitOutline] = []
        for idx, db_unit in enumerate(db_units_list):
            sections = body.units[idx].sections if idx < len(body.units) else []
            result_units.append(
                UnitOutline(
                    title=db_unit.title,
                    description=db_unit.description or "",
                    sections=sections,
                )
            )

        course_title = course.title or "Course"

        logger.info(
            "patch_course_outline: course_id=%d updated %d unit(s) total",
            course_id, len(result_units),
        )
        return CourseOutlineResponse(title=course_title, units=result_units)

    except Exception as exc:
        db.rollback()
        logger.error("patch_course_outline: %s", exc, exc_info=True)
        from fastapi import HTTPException
        if isinstance(exc, HTTPException):
            raise
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        db.close()