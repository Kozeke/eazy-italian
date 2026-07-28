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

# Kinds that may be sent to the LLM for refinement.
#
# Excluded on purpose: SIMPLE_MEDIA_KINDS (image/video/audio), RICH_MEDIA_KINDS
# (carousel_slides) and IMAGE_PLACEHOLDER_KINDS — refining images / triggering
# image generation is out of scope for v1, and round-tripping those blocks
# risks the model rewriting asset URLs (fal.ai paths, upload paths).
#
# TEXT_KINDS *are* included: a `text` block is plain authored prose, normalised
# to the same {id, kind, title, data} shape as an exercise, and "simplify this
# explanation for A1" is a core refine use case. Excluding it was an
# over-correction that made text-only sections un-refinable entirely.
from app.services.media_block_utils import CUSTOM_EXERCISE_KINDS, TEXT_KINDS, VOCABULARY_KINDS

REFINABLE_KINDS: set = CUSTOM_EXERCISE_KINDS | TEXT_KINDS | VOCABULARY_KINDS

# Bump on every edit. Logged on each request so the running build is never in
# doubt — three separate debugging rounds were lost to a stale file that looked
# current because an older error string was mistaken for a newer one.
REFINE_IMPL_VERSION = "6-task-first-prompt+noop-guard"

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
    n = len(scope_blocks)
    rules = [
        # POSITION ZERO = THE TASK. Previously this block opened with five
        # preservation rules and never said "change the content", so the model
        # read "match the schema EXACTLY" as "return it unchanged" and no-op'd
        # with a summary saying it had ignored the instruction. The task must
        # outrank the constraints, not the other way round.
        "TASK: rewrite the block content below so it satisfies the teacher's "
        "instruction. You MUST actually change the content — returning it "
        "unchanged, or refusing, is a failed response.",
        "The schema constraints below restrict STRUCTURE ONLY (which keys "
        "exist, and id/kind). The VALUES — sentences, words, options, answers, "
        "distractors, titles — are exactly what you are expected to change.",
        "If the instruction is vague, apply your best reasonable interpretation. "
        "Never return the input untouched.",
        "Return ONLY valid JSON. No markdown fences, no commentary.",
        # MUST be a top-level OBJECT, never a bare array. The shared
        # _extract_json_object helper greedily matches the first '{' to the last
        # '}', which silently strips the enclosing brackets off an array
        # response and produces a JSONDecodeError('Extra data'). An envelope
        # object is immune to that and gives `summary` one unambiguous home.
        'Return a single JSON object with exactly two keys: "blocks" and "summary".',
        f'"blocks" must be an array of exactly {n} object(s), in the same order '
        "as the input blocks.",
        "Each block must keep the same keys, the same `id` and the same `kind` "
        "as its input block. Never change id or kind.",
        'Never place "summary" inside a block. It belongs only at the top level, '
        "as one short sentence describing what you actually changed.",
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
        "\nRESPOND IN EXACTLY THIS SHAPE:\n"
        '{\n  "blocks": [ ... ' + str(n) + ' block object(s) ... ],\n'
        '  "summary": "one short sentence, max ~15 words, describing what you changed"\n}'
    )

    return "\n".join(parts)


def _merge_over_original(original: dict, updated: Any) -> tuple[dict | None, str | None]:
    """
    Shape-preserving merge. Returns (merged_block, error).

    Rationale: requiring the model to echo back the block's top-level keys
    *exactly* is too brittle — models routinely drop a null/optional key or
    invent an extra one, and in segment scope a single such slip on any one
    block killed the entire batch. Instead we start from the original block and
    overlay the model's values:

      * keys the model omitted  -> backfilled from the original (shape kept)
      * keys the model invented -> dropped (no schema pollution)
      * `id` / `kind`           -> backfilled if omitted; hard error if changed

    The overlay is top-level only. `data` is taken wholesale from the model so
    a refine can legitimately restructure it (e.g. add gaps) without stale
    sub-keys surviving underneath.
    """
    if not isinstance(updated, dict):
        return None, f"Expected a JSON object, got {type(updated).__name__}."

    for immutable in ("id", "kind"):
        if immutable in updated and updated[immutable] != original.get(immutable):
            return None, (
                f"The `{immutable}` field must not change "
                f"(was {original.get(immutable)!r}, got {updated[immutable]!r})."
            )

    merged = copy.deepcopy(original)
    dropped: list[str] = []
    for key, value in updated.items():
        if key in ("_summary", "summary") and key not in original:
            continue  # envelope/stray summary field — never persist it onto a block
        if key in original:
            merged[key] = value
        else:
            dropped.append(key)

    if dropped:
        logger.info(
            "refine: dropped %d unrecognised key(s) from model output for block %r: %s",
            len(dropped), original.get("id"), dropped,
        )

    return merged, None


def _validate_block(kind: str, original: dict, updated: Any) -> tuple[dict | None, str | None]:
    """
    Returns (merged_block, error). On success error is None.
    The summary is NOT carried on the block — it lives in the response envelope.

    Order matters: merge FIRST so the block always has its original shape, then
    run per-kind validation on the merged result. Validating the raw model
    output instead would reject blocks that the merge would have repaired.
    """
    if not isinstance(updated, dict):
        return None, f"Expected a JSON object, got {type(updated).__name__}."

    merged, error = _merge_over_original(original, updated)
    if error:
        return None, error
    assert merged is not None

    if kind == "drag_to_gap":
        # _validate_drag_to_gap validates/mutates its `data` arg in place and
        # returns None; it raises ValueError on a hard failure. gap_count=None
        # is "auto" mode (any 1-15 count accepted) since refine may
        # deliberately change the gap count (e.g. "add two more gaps").
        # Note: this validator expects `title` inside `data` — which is where
        # DragToGapBlock.tsx reads it from too, so the persisted shape matches.
        try:
            _validate_drag_to_gap(merged.get("data", merged), None)
        except Exception as exc:  # noqa: BLE001
            return None, f"drag_to_gap validation failed: {exc}"

    return merged, None


async def _call_llm_with_retry(
    *,
    provider,
    target_language: str | None,
    native_language: str | None,
    scope_blocks: list[dict],
    instruction: str,
    history: list[RefineHistoryTurn] | None,
) -> tuple[list[dict], str | None]:
    """
    Calls the LLM, validates each returned block, retries once on failure.
    Returns (validated_blocks_in_scope_order, summary_or_None).
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
            logger.warning(
                "refine: attempt %d/2 — unparseable JSON (%s). Raw length=%d, tail=%r",
                attempt + 1, exc, len(raw or ""), (raw or "")[-200:],
            )
            continue

        # Expected: {"blocks": [...], "summary": "..."}. Tolerate a few shapes
        # the model may still emit rather than burning the retry on a reshape.
        envelope_summary: str | None = None
        if isinstance(parsed, dict) and isinstance(parsed.get("blocks"), list):
            candidates = parsed["blocks"]
            raw_summary = parsed.get("summary")
            envelope_summary = raw_summary if isinstance(raw_summary, str) else None
        elif isinstance(parsed, list):
            # Bare array — only reachable if the model wrapped it in fences that
            # kept the brackets intact. Accept it; summary is then unavailable.
            candidates = parsed
        elif isinstance(parsed, dict) and len(scope_blocks) == 1:
            # Single-scope bare block object.
            candidates = [parsed]
            raw_summary = parsed.get("summary") or parsed.get("_summary")
            envelope_summary = raw_summary if isinstance(raw_summary, str) else None
        else:
            validation_error = (
                'Response must be a JSON object with a "blocks" array. '
                f"Got a {type(parsed).__name__}."
            )
            last_exc = validation_error
            logger.warning("refine: attempt %d/2 — %s", attempt + 1, validation_error)
            continue

        if len(candidates) != len(scope_blocks):
            validation_error = (
                f"Expected {len(scope_blocks)} block(s) back, got "
                f"{len(candidates) if isinstance(candidates, list) else 'non-list'}."
            )
            last_exc = validation_error
            logger.warning("refine: attempt %d/2 — %s", attempt + 1, validation_error)
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
            # A response that changed nothing is a failed refine, not a success:
            # the teacher burns a credit and sees "updated" with identical
            # content. Retry once with an explicit corrective instruction.
            if all(
                merged == original
                for merged, original in zip(cleaned_blocks, scope_blocks)
            ):
                validation_error = (
                    "You returned the content completely unchanged. Apply the "
                    "teacher's instruction and actually modify the block values."
                )
                last_exc = validation_error
                logger.warning(
                    "refine: attempt %d/2 — model returned all %d block(s) unchanged "
                    "(model summary: %r)",
                    attempt + 1, len(scope_blocks), envelope_summary,
                )
                continue

            return cleaned_blocks, envelope_summary

        validation_error = first_error
        last_exc = first_error
        logger.warning(
            "refine: attempt %d/2 rejected by validation — %s", attempt + 1, first_error,
        )

    logger.warning(
        "refine: giving up after 2 attempts. scope=%d block(s), kinds=%s, last error: %s",
        len(scope_blocks),
        [b.get("kind") for b in scope_blocks],
        last_exc,
    )
    raise HTTPException(
        status_code=422,
        detail="refine_failed",
    )


# ── Endpoint ─────────────────────────────────────────────────────────────────

@router.post("/segments/{segment_id}/refine", response_model=RefineResponse)
async def refine_segment(
    segment_id: int,
    body: RefineRequest,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
) -> RefineResponse:
    logger.info(
        "refine: impl=%s segment_id=%s scope=%s",
        REFINE_IMPL_VERSION,
        segment_id,
        f"block:{body.block_id}" if body.block_id else "segment",
    )
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
        if block.get("kind") not in REFINABLE_KINDS:
            raise HTTPException(
                status_code=400,
                detail=f"Block kind {block.get('kind')!r} cannot be refined.",
            )
        scope_blocks = [copy.deepcopy(block)]
    else:
        scope_blocks = [
            copy.deepcopy(b)
            for b in media_blocks
            if isinstance(b, dict) and b.get("kind") in REFINABLE_KINDS
        ]
        if not scope_blocks:
            present = sorted({
                str(b.get("kind")) for b in media_blocks if isinstance(b, dict)
            })
            logger.info(
                "refine: segment_id=%d has no refinable blocks; kinds present=%s",
                segment_id, present,
            )
            raise HTTPException(
                status_code=400,
                detail=(
                    "This section has no text or exercise content to refine "
                    "(media blocks can't be refined)."
                ),
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
        cleaned_blocks, model_summary = await _call_llm_with_retry(
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

    summary = (model_summary or "").strip() or "Updated the content."

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