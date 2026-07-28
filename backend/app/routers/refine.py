"""
app/routers/refine.py

"Refine with AI" — conversational, in-place editing of an already-generated
exercise block (or every block in a segment) via a short teacher instruction.

Register in app/api/v1/api.py (NOT main.py — that file only mounts the
aggregated api_router):

    from app.routers.refine import router as refine_router
    api_router.include_router(refine_router, prefix="", tags=["Refine"])

Endpoint
--------
POST /segments/{segment_id}/refine

Design notes
------------
* Ownership check reuses ``_get_segment_or_404`` from ``app.routers.segments``
  (the real ownership-check helper in this codebase — NOT
  ``exercise_generation.py``, which only holds Pydantic schemas).
* Language resolution mirrors the block in
  ``exercise_generation_flow.generate_exercise_for_segment`` (course row via
  unit.course_id → target_language / native_language).
* LLM calls reuse the existing DeepSeek-primary + Groq-fallback chain
  (``get_exercise_deepseek_groq_chain``) — no new provider wiring.
* JSON parsing reuses ``_robust_json_loads`` from ai_exercise_generator.py.
* Validation: a real per-kind validator (``_validate_drag_to_gap``) exists
  today for exactly one kind. It is reused for that kind. Every other kind
  falls back to a generic "shape" check (dict, same id/kind, same top-level
  keys as the original block) — there is currently no unified per-kind
  validator table in this codebase to plug into for the rest, so inventing
  15 bespoke validators was out of scope here. Flagging this explicitly
  rather than silently pretending full per-kind coverage exists.
* Persistence follows the exact refresh → rebuild-list → flag_modified →
  commit → refresh sequence used by ``_append_block`` in
  exercise_generation_flow.py, adapted to replace-in-place.
* Credit consumption reuses ``check_and_consume_teacher_ai_quota`` with the
  existing "exercise_generation" bucket (same one generate_exercise_block
  consumes) — no new quota bucket introduced.
"""

from __future__ import annotations

import copy
import json
import logging
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.core.auth import get_current_teacher
from app.core.database import get_db
from app.core.teacher_tariffs import (
    check_and_consume_teacher_ai_quota,
    _refund_teacher_ai_quota,  # noqa: PLC2701 — same import style as unit_generation.py
)
from app.models.user import User

# Reuse the real ownership-check helper — do not duplicate the logic.
from app.api.v1.endpoints.segments import _get_segment_or_404

# Kind set used to keep non-exercise blocks (image / video / audio / carousel)
# out of segment-scope refine — refining images is explicitly out of scope for v1.
from app.services.media_block_utils import CUSTOM_EXERCISE_KINDS

# Reuse the existing DeepSeek→Groq exercise provider chain + JSON helpers.
from app.services.ai_exercise_generator import (
    get_exercise_deepseek_groq_chain,
    _robust_json_loads,      # noqa: PLC2701 — intentional internal reuse
    _validate_drag_to_gap,   # noqa: PLC2701 — the one real per-kind validator today
)
from app.services.ai.providers.base import AIProviderError

logger = logging.getLogger(__name__)

router = APIRouter()

# Max prior turns forwarded to the LLM for context (see task spec: "last 6 turns max").
_MAX_HISTORY_TURNS = 6


# ── Request / response schemas ─────────────────────────────────────────────────

class RefineHistoryTurn(BaseModel):
    role: str = Field(..., description='"user" or "assistant"')
    content: str


class RefineRequest(BaseModel):
    instruction: str = Field(..., min_length=1, max_length=1000)
    block_id: Optional[str] = Field(
        default=None,
        description="Block to refine. Omit for whole-segment scope.",
    )
    history: Optional[List[RefineHistoryTurn]] = Field(default=None)


class RefineResponse(BaseModel):
    block: Optional[dict] = None
    previous_block: Optional[dict] = None
    blocks: Optional[List[dict]] = None
    previous_blocks: Optional[List[dict]] = None
    summary: str


# ── Helpers ──────────────────────────────────────────────────────────────────

def _resolve_course_languages(db: Session, unit: Any) -> tuple[str | None, str | None]:
    """Mirror the language-resolution block in exercise_generation_flow.py."""
    native_language: str | None = None
    target_language: str | None = None
    try:
        from app.models.course import Course  # noqa: PLC0415

        if getattr(unit, "course_id", None):
            course = db.query(Course).filter(Course.id == unit.course_id).first()
            if course is not None:
                native_language = getattr(course, "native_language", None) or None
                target_language = getattr(course, "target_language", None) or None
    except Exception as exc:  # noqa: BLE001 — never block refine on a language lookup failure
        logger.warning("refine: could not resolve course languages: %s", exc)
    return native_language, target_language


def _find_block(media_blocks: list, block_id: str) -> tuple[int, dict] | None:
    for idx, blk in enumerate(media_blocks or []):
        if isinstance(blk, dict) and blk.get("id") == block_id:
            return idx, blk
    return None


def _build_refine_prompt(
    *,
    target_language: str | None,
    native_language: str | None,
    scope_blocks: list[dict],
    instruction: str,
    history: list[RefineHistoryTurn] | None,
    validation_error: str | None = None,
) -> str:
    """
    POSITION-ZERO rules block first, then content, then instruction, then history.
    Smaller/faster models (Groq fallback) ignore instructions buried lower down.
    """
    rules = [
        "Return ONLY valid JSON. No markdown fences, no commentary.",
        "The JSON must match EXACTLY the schema of the input block(s): same "
        "keys, same structure, same `id`, same `kind`. Never change id or kind.",
        f"Content language: {target_language or 'unspecified'}. "
        f"Explanations/instructions language: {native_language or 'unspecified'}. "
        "Do not switch languages.",
    ]
    if validation_error:
        rules.append(
            f"Your previous attempt was rejected for this reason: {validation_error}. "
            "Fix it and return valid JSON matching the schema exactly."
        )

    parts = ["RULES:\n" + "\n".join(f"- {r}" for r in rules)]

    # MUST be real JSON, not a Python repr. An f-string on a dict emits single
    # quotes plus True/None, which contradicts the position-zero "return valid
    # JSON matching the input schema" rule and measurably increases retries —
    # worst on the Groq fallback, the model least able to recover from it.
    if len(scope_blocks) == 1:
        rendered = json.dumps(scope_blocks[0], ensure_ascii=False, indent=2)
        parts.append(f"\nCURRENT BLOCK:\n{rendered}")
    else:
        rendered = json.dumps(scope_blocks, ensure_ascii=False, indent=2)
        parts.append(
            f"\nCURRENT BLOCKS (segment scope — return ALL of them as a JSON array):\n{rendered}"
        )

    if history:
        trimmed = history[-_MAX_HISTORY_TURNS:]
        hist_lines = "\n".join(f"{h.role}: {h.content}" for h in trimmed)
        parts.append(f"\nPRIOR CONVERSATION:\n{hist_lines}")

    parts.append(f"\nTEACHER INSTRUCTION:\n{instruction}")
    parts.append(
        "\nAlso include a top-level `_summary` string field (max ~15 words) "
        "describing the change you made, in addition to the block schema fields."
    )

    return "\n".join(parts)


def _generic_shape_check(original: dict, updated: Any) -> str | None:
    """
    Fallback validator for kinds without a dedicated validator.
    Returns an error string, or None if the shape looks acceptable.
    """
    if not isinstance(updated, dict):
        return f"Expected a JSON object, got {type(updated).__name__}."
    if updated.get("id") != original.get("id"):
        return "The `id` field must not change."
    if updated.get("kind") != original.get("kind"):
        return "The `kind` field must not change."
    expected_keys = set(original.keys())
    got_keys = set(updated.keys()) - {"_summary"}
    if expected_keys and got_keys != expected_keys:
        missing = expected_keys - got_keys
        extra = got_keys - expected_keys
        if missing or extra:
            return (
                f"Block keys must match the original exactly. "
                f"Missing: {sorted(missing)}. Unexpected: {sorted(extra)}."
            )
    return None


def _validate_block(kind: str, original: dict, updated: Any) -> tuple[dict | None, str | None]:
    """
    Returns (cleaned_block_without_summary, error). On success error is None.
    """
    if not isinstance(updated, dict):
        return None, f"Expected a JSON object, got {type(updated).__name__}."

    summary = updated.pop("_summary", None)

    if kind == "drag_to_gap":
        # _validate_drag_to_gap validates/mutates its `data` arg in place and
        # returns None; it raises ValueError on a hard failure. gap_count=None
        # is "auto" mode (any 1-15 count accepted) since refine may
        # deliberately change the gap count (e.g. "add two more gaps").
        try:
            data_payload = updated.get("data", updated)
            _validate_drag_to_gap(data_payload, None)
            updated["_summary"] = summary
            return updated, None
        except Exception as exc:  # noqa: BLE001
            return None, str(exc)

    error = _generic_shape_check(original, updated)
    if error:
        return None, error
    updated["_summary"] = summary
    return updated, None


async def _call_llm_with_retry(
    *,
    provider,
    target_language: str | None,
    native_language: str | None,
    scope_blocks: list[dict],
    instruction: str,
    history: list[RefineHistoryTurn] | None,
) -> list[dict]:
    """
    Calls the LLM, validates each returned block, retries once on failure.
    Returns the list of validated/cleaned blocks (same order as scope_blocks),
    each still carrying its own "_summary" key for the caller to pop.
    """
    validation_error: str | None = None
    last_exc: str | None = None

    for attempt in range(2):
        prompt = _build_refine_prompt(
            target_language=target_language,
            native_language=native_language,
            scope_blocks=scope_blocks,
            instruction=instruction,
            history=history,
            validation_error=validation_error,
        )
        try:
            raw = await provider.agenerate(prompt)
        except AIProviderError as exc:
            raise HTTPException(status_code=502, detail=f"AI provider error: {exc}") from exc

        try:
            parsed = _robust_json_loads(raw)
        except Exception as exc:  # noqa: BLE001
            validation_error = f"Response was not valid JSON ({exc})."
            last_exc = validation_error
            continue

        # Normalise to a list aligned with scope_blocks.
        if len(scope_blocks) == 1:
            candidates = [parsed] if isinstance(parsed, dict) else parsed
            if not isinstance(candidates, list):
                candidates = [candidates]
        else:
            candidates = parsed if isinstance(parsed, list) else parsed.get("blocks", [])

        if len(candidates) != len(scope_blocks):
            validation_error = (
                f"Expected {len(scope_blocks)} block(s) back, got "
                f"{len(candidates) if isinstance(candidates, list) else 'non-list'}."
            )
            last_exc = validation_error
            continue

        cleaned_blocks: list[dict] = []
        first_error: str | None = None
        for original, candidate in zip(scope_blocks, candidates):
            cleaned, err = _validate_block(original.get("kind", ""), original, candidate)
            if err:
                first_error = err
                break
            cleaned_blocks.append(cleaned)

        if first_error is None:
            return cleaned_blocks

        validation_error = first_error
        last_exc = first_error

    raise HTTPException(
        status_code=422,
        detail="refine_failed",
    ) from RuntimeError(last_exc or "unknown validation failure")


# ── Endpoint ─────────────────────────────────────────────────────────────────

@router.post("/segments/{segment_id}/refine", response_model=RefineResponse)
async def refine_segment(
    segment_id: int,
    body: RefineRequest,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
) -> RefineResponse:
    # ── 1. Ownership + load ───────────────────────────────────────────────────
    segment = _get_segment_or_404(db, segment_id, current_user.id)
    unit = segment.unit
    if unit is None:
        raise HTTPException(status_code=404, detail="Segment has no parent unit.")

    media_blocks = list(segment.media_blocks or [])

    # Only text-bearing exercise blocks are refinable. Image / video / audio /
    # carousel blocks are excluded on BOTH scopes: refining images is explicitly
    # out of scope for v1, and round-tripping them through the LLM risks the
    # model rewriting asset URLs (fal.ai paths, uploads paths).
    if body.block_id is not None:
        hit = _find_block(media_blocks, body.block_id)
        if hit is None:
            raise HTTPException(status_code=404, detail="Block not found in segment.")
        _, block = hit
        if block.get("kind") not in CUSTOM_EXERCISE_KINDS:
            raise HTTPException(
                status_code=400,
                detail=f"Block kind {block.get('kind')!r} cannot be refined.",
            )
        scope_blocks = [copy.deepcopy(block)]
    else:
        scope_blocks = [
            copy.deepcopy(b)
            for b in media_blocks
            if isinstance(b, dict) and b.get("kind") in CUSTOM_EXERCISE_KINDS
        ]
        if not scope_blocks:
            raise HTTPException(
                status_code=400,
                detail="Segment has no refinable exercise blocks.",
            )

    # ── 2. Language resolution ────────────────────────────────────────────────
    native_language, target_language = _resolve_course_languages(db, unit)

    # ── 3. Credits — consumed before the LLM call, same bucket as
    #      generate_exercise_block ("exercise_generation"). Raises 402 itself.
    check_and_consume_teacher_ai_quota(db, current_user, "exercise_generation")

    # ── 4. Call LLM (DeepSeek primary, Groq fallback) with one retry ─────────
    # The credit was charged above; refund it if generation fails so the teacher
    # is not penalised for a provider error or an unusable model response.
    # Same contract as _refund_teacher_ai_quota's docstring / unit_generation.py.
    provider = get_exercise_deepseek_groq_chain()
    history = body.history or None
    try:
        cleaned_blocks = await _call_llm_with_retry(
            provider=provider,
            target_language=target_language,
            native_language=native_language,
            scope_blocks=scope_blocks,
            instruction=body.instruction,
            history=history,
        )
    except HTTPException:
        logger.info(
            "refine: generation failed for segment_id=%d teacher_id=%d — refunding quota",
            segment_id, current_user.id,
        )
        _refund_teacher_ai_quota(db, current_user, "exercise_generation")
        raise
    except Exception:
        logger.exception(
            "refine: unexpected failure for segment_id=%d teacher_id=%d — refunding quota",
            segment_id, current_user.id,
        )
        _refund_teacher_ai_quota(db, current_user, "exercise_generation")
        raise

    # Pull the per-call summary off the first block (segment scope: combine).
    summaries = [b.pop("_summary", None) for b in cleaned_blocks]
    summary = next((s for s in summaries if s), "Updated the content.")

    # ── 5. Persist — refresh → rebuild list → flag_modified → commit → refresh,
    #      same sequence as _append_block in exercise_generation_flow.py.
    db.refresh(segment)
    existing = list(segment.media_blocks or [])
    previous_snapshot: list[dict] = []
    new_list: list[dict] = []
    cleaned_by_id = {b.get("id"): b for b in cleaned_blocks}

    for blk in existing:
        if isinstance(blk, dict) and blk.get("id") in cleaned_by_id:
            previous_snapshot.append(copy.deepcopy(blk))
            new_list.append(cleaned_by_id[blk["id"]])
        else:
            new_list.append(blk)

    segment.media_blocks = new_list
    flag_modified(segment, "media_blocks")
    if hasattr(segment, "updated_by"):
        segment.updated_by = current_user.id

    db.add(segment)
    db.commit()
    db.refresh(segment)

    logger.info(
        "refine: segment_id=%d scope=%s block_ids=%s teacher_id=%d",
        segment_id,
        "block" if body.block_id else "segment",
        list(cleaned_by_id.keys()),
        current_user.id,
    )

    if body.block_id is not None:
        return RefineResponse(
            block=cleaned_blocks[0],
            previous_block=previous_snapshot[0] if previous_snapshot else None,
            summary=summary,
        )

    return RefineResponse(
        blocks=cleaned_blocks,
        previous_blocks=previous_snapshot,
        summary=summary,
    )