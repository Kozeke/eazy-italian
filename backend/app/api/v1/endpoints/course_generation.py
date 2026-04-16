"""
app/api/v1/endpoints/course_generation.py
==========================================
Endpoints:

  POST /course-builder/generate-outline
    JSON body — description + level only (no files).
    Returns { title, units: [...] }
    No DB writes.  Fast (~3–6 s).

  POST /course-builder/generate-outline-from-files
    Multipart form — description, level, files[].
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
import time
import uuid
from typing import Any, AsyncIterator

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator

from app.core.auth import get_current_teacher
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter()

# ── Constants ─────────────────────────────────────────────────────────────────

CEFR_LEVELS: set[str] = {"A1", "A2", "B1", "B2", "C1", "C2"}

_MIN_UNITS    = 3
_MAX_UNITS    = 12
_MIN_SECTIONS = 2
_MAX_SECTIONS = 4

_DEFAULT_NUM_SEGMENTS   = 3
_DEFAULT_EXERCISE_TYPES = ["drag_to_gap", "match_pairs", "build_sentence"]

# Content extracted from uploaded files is capped before being sent to the LLM
# (avoids blowing the context window of smaller models).
_MAX_FILE_CONTENT_CHARS = 12_000

# Source-token cache: token → (extracted_text, expiry_unix_ts)
# Tokens expire after 30 minutes.  The stream endpoint pops them on first use
# so they are single-use by design.
_TOKEN_TTL_SECONDS = 1800
_source_cache: dict[str, tuple[str, float]] = {}


# ── Schemas ───────────────────────────────────────────────────────────────────


class OutlineRequest(BaseModel):
    description: str = Field(..., min_length=4, max_length=1000)
    level: str = Field(default="B1")

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


def _build_outline_prompt(description: str, level: str, source_content: str = "") -> str:
    """
    Build the outline-generation prompt.

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

    return f"""You are an expert language-teaching curriculum designer.

A teacher wants to create this course:

  Description : {description}
  CEFR Level  : {level}
{content_block}
Design a complete, pedagogically sound course outline.

Return ONLY a single valid JSON object — no markdown fences, no preamble, no comments.

{{
  "title": "<concise professional course title — max 80 chars>",
  "units": [
    {{
      "title": "<unit title — specific topic, max 60 chars>",
      "description": "<1–2 sentences on what students will learn in this unit>",
      "sections": [
        {{
          "title": "<section title — max 50 chars>",
          "description": "<one sentence on this section's focus>"
        }}
      ]
    }}
  ]
}}

Rules:
- Generate {_MIN_UNITS}–{_MAX_UNITS} units, ordered foundational → advanced.
- Each unit must have {_MIN_SECTIONS}–{_MAX_SECTIONS} sections (distinct teachable sub-topics).
- Titles and descriptions must be in the same language as the description (default: English).
{"- Ground unit topics directly in the reference material above." if source_content else ""}
- Strictly valid JSON: no trailing commas, no comments.

Return ONLY the JSON object."""


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

    data = json.loads(
        text[brace_start:brace_end] if brace_end != -1 else text[brace_start:]
    )

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


async def _extract_files_text(files: list[UploadFile]) -> str:
    """
    Read each uploaded file and route it to the appropriate parser.

    Returns a single combined string (one block per file, separated by
    double newlines).  Errors on individual files are logged and skipped
    so one bad file does not abort the whole request.
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

    blocks: list[str] = []

    for upload in files:
        fname   = upload.filename or ""
        mime    = (upload.content_type or "").split(";")[0].strip().lower()

        try:
            data = await upload.read()
        except Exception as exc:
            logger.warning("_extract_files_text: could not read '%s': %s", fname, exc)
            continue

        try:
            if pdf_parser.can_handle(fname, mime):
                doc = pdf_parser.parse(data, fname)
                blocks.append(f"[File: {fname}]\n{doc.text}")

            elif docx_parser.can_handle(fname, mime):
                doc = docx_parser.parse(data, fname)
                blocks.append(f"[File: {fname}]\n{doc.text}")

            elif subtitle_parser.can_handle(fname, mime):
                doc = subtitle_parser.parse(data, fname)
                blocks.append(f"[File: {fname}]\n{doc.text}")

            elif mime in _PLAIN_TEXT_MIMES or fname.lower().endswith(".txt"):
                text = data.decode("utf-8", errors="replace").strip()
                if text:
                    blocks.append(f"[File: {fname}]\n{text}")

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

    return "\n\n".join(blocks)


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


def _get_provider():
    from app.services.ai_exercise_generator import _default_provider
    return _default_provider


async def _call_ai(prompt: str) -> str:
    return await _get_provider().agenerate(prompt)


# ── Endpoint 1: generate-outline (JSON, no files) ────────────────────────────


@router.post("/generate-outline", response_model=CourseOutlineResponse)
async def generate_course_outline(
    body: OutlineRequest,
    _: User = Depends(get_current_teacher),
) -> CourseOutlineResponse:
    """
    POST /course-builder/generate-outline

    Fast path — no uploaded files.  Single LLM call returns the full
    course outline (unit titles, descriptions, section titles/descriptions).
    No DB writes.
    """
    logger.info("generate-outline: %r level=%s", body.description[:60], body.level)
    try:
        outline = _parse_outline(
            await _call_ai(_build_outline_prompt(body.description, body.level))
        )
        logger.info("generate-outline: '%s' (%d units)", outline.title, len(outline.units))
        return outline
    except Exception as exc:
        logger.warning("generate-outline failed (%s) — fallback.", exc)
        return _fallback_outline(body.description)


# ── Endpoint 2: generate-outline-from-files (multipart) ──────────────────────


@router.post("/generate-outline-from-files", response_model=CourseOutlineWithTokenResponse)
async def generate_course_outline_from_files(
    description: str        = Form(..., min_length=4, max_length=1000),
    level:       str        = Form(default="B1"),
    files: list[UploadFile] = File(default=[]),
    _: User = Depends(get_current_teacher),
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
    """
    # Normalise level
    level_norm = str(level).strip().upper()
    if level_norm not in CEFR_LEVELS:
        level_norm = "B1"

    logger.info(
        "generate-outline-from-files: %r level=%s files=%d",
        description[:60], level_norm, len(files),
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
                _build_outline_prompt(description, level_norm, source_content)
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
    source_content: str,        # "" when no files were uploaded
) -> AsyncIterator[str]:
    from app.core.database import SessionLocal
    from app.models.unit import Unit as UnitModel
    from app.services.unit_generator import UnitGeneratorService, UnitGenerateRequest

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

    total = len(units)
    yield _sse({"type": "start", "total": total})
    await asyncio.sleep(0.1)

    try:
        service = UnitGeneratorService(ai_provider=_get_provider())
    except RuntimeError as exc:
        yield _sse({"type": "error", "error": str(exc)})
        db.close()
        return

    units_done = 0
    for index, unit in enumerate(units):
        yield _sse({
            "type": "unit_start",
            "unit_id": unit.id,
            "title": unit.title,
            "index": index,
            "total": total,
        })
        await asyncio.sleep(0.05)

        try:
            result = await service.generate(
                UnitGenerateRequest(
                    unit_id=unit.id,
                    topic=unit.title,
                    level=level,
                    language=language,
                    num_segments=_DEFAULT_NUM_SEGMENTS,
                    exercise_types=_DEFAULT_EXERCISE_TYPES,
                    teacher_id=getattr(unit, "created_by", 0) or 0,
                    # Forward extracted file text so each unit is grounded in
                    # the teacher's uploaded materials.  Empty string when no
                    # files were provided — UnitGeneratorService ignores it.
                    source_content=source_content or None,
                ),
                db,
            )
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
            yield _sse({
                "type": "unit_error",
                "unit_id": unit.id,
                "index": index,
                "error": str(exc),
            })

        if index < total - 1:
            await asyncio.sleep(0.5)

    db.close()
    yield _sse({"type": "complete", "units_done": units_done, "total": total})


@router.get("/{course_id}/stream")
async def stream_course_generation(
    course_id:    int,
    level:        str          = Query(default="B1"),
    language:     str          = Query(default="English"),
    token:        str          = Query(..., description="JWT — EventSource cannot set headers."),
    source_token: str | None   = Query(default=None, description="UUID from generate-outline-from-files."),
):
    """
    GET /course-builder/{course_id}/stream?level=B2&token=<jwt>[&source_token=<uuid>]

    SSE stream triggered by the teacher clicking "Generate Course Content".

    If *source_token* is supplied the server pops the cached extracted file
    text and forwards it to each unit-generation call as source_content.
    The token is single-use and expires after 30 minutes.
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

    return StreamingResponse(
        _stream_generation(course_id, level, language, source_content),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
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

    - If the edited list has *more* units than currently exist, the extras
      are ignored (no new units are created here).
    - If fewer, only the existing ones up to the payload length are updated.
    - Section changes are stored in the outline only (returned in the
      response) and will influence the SSE generation prompt via the
      unit title; the DB has no separate segment records for sections yet.
    """
    from app.core.database import SessionLocal
    from app.models.unit import Unit as UnitModel

    db = SessionLocal()
    try:
        db_units = (
            db.query(UnitModel)
            .filter(UnitModel.course_id == course_id)
            .order_by(UnitModel.order_index)
            .all()
        )

        if not db_units:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="No units found for this course.")

        # Verify the course belongs to the requesting teacher via the first unit
        import datetime as _dt
        for idx, edited in enumerate(body.units):
            if idx >= len(db_units):
                break                          # more edits than DB units → skip extras
            db_unit = db_units[idx]
            db_unit.title       = edited.title.strip() or db_unit.title
            db_unit.description = edited.description.strip()
            db_unit.updated_at  = _dt.datetime.utcnow()

        db.commit()

        # Rebuild response from current DB state merged with edited sections
        result_units: list[UnitOutline] = []
        for idx, db_unit in enumerate(db_units):
            if idx < len(body.units):
                sections = body.units[idx].sections
            else:
                sections = []
            result_units.append(
                UnitOutline(
                    title=db_unit.title,
                    description=db_unit.description or "",
                    sections=sections,
                )
            )

        # Derive course title from the DB course record
        from app.models.course import Course as CourseModel
        course = db.query(CourseModel).filter(CourseModel.id == course_id).first()
        course_title = course.title if course else "Course"

        logger.info(
            "patch_course_outline: course_id=%d updated %d unit(s)",
            course_id, min(len(body.units), len(db_units)),
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