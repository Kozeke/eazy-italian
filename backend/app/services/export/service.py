"""
app/services/export/service.py

Orchestration: walk a unit's segments, dispatch each media block to its
normaliser, assign global sequential question numbers, and render the
self-contained HTML.

This is the only module the endpoint imports from (via the package __init__):
    from app.services.export import render_unit_export, slugify

Adding a new exercise type
--------------------------
1. Add a `normalise_<kind>_block(...)` in normalizers.py returning render-ready
   model objects + writing the answer key into correct_answers.
2. Add the model dataclass(es) in models.py and a `kind` value on QuestionGroup.
3. Add a template partial constant in templates.py, register it in
   _EXPORT_TEMPLATES, and add an `{% elif group.kind == "<kind>" %}` branch in
   the base template's include loop (+ a grader-JS branch if it's a genuinely
   new interaction type).
4. Add an `elif kind == "<kind>":` branch in build_export_context() below.
The numbering loop and answer-key dict need no other changes.
"""

from __future__ import annotations

from typing import Any

from .models import ExportContext, PassageBlock, QuestionGroup
from .normalizers import (
    normalise_audio_block,
    normalise_build_sentence_block,
    normalise_carousel_block,
    normalise_gap_fill_block,
    normalise_gif_block,
    normalise_image_block,
    normalise_match_pairs_block,
    normalise_order_paragraphs_block,
    normalise_sort_into_columns_block,
    normalise_test_block,
    normalise_text_block,
    normalise_true_false_block,
    normalise_video_block,
    normalise_vocabulary_block,
)
from .templates import render_export

# media_block "kind" buckets
_TEXT_MEDIA_BLOCK_KINDS = {"text"}
# drag_to_gap and type_word_in_gap share DragToGapData (segments + gaps).
_GAP_FILL_MEDIA_BLOCK_KINDS = {"type_word_in_gap", "drag_to_gap"}
_TEST_MEDIA_BLOCK_KINDS = {"test_with_timer", "test_without_timer"}

# Tier-2: kind → single-group normaliser (each returns (group_or_None, consumed))
_TIER2_NORMALIZERS = {
    "order_paragraphs": normalise_order_paragraphs_block,
    "build_sentence": normalise_build_sentence_block,
    "sort_into_columns": normalise_sort_into_columns_block,
    "match_pairs": normalise_match_pairs_block,
}


def build_export_context(unit_title: str, segments: list[dict], asset_base_url: str = "") -> ExportContext:
    """
    Walk segments in order_index order and build a flat, sequentially numbered
    ExportContext ready for template rendering. Reads only media_blocks — no
    ORM rows, no DB dependency — so it is trivially unit-testable.

    Numbering: 1..N strictly in segment order_index order, then media_blocks
    list order. Each TF = 1, each gap = 1, each MC = 1; each Tier-2 block
    (match/sort/order/build) = 1 (graded all-or-nothing, mirroring the in-app
    check).
    """
    passage_blocks: list[PassageBlock] = []
    question_groups: list[QuestionGroup] = []
    correct_answers: dict[str, Any] = {}
    next_number = 1

    sorted_segments = sorted(segments, key=lambda s: s.get("order_index", 0))

    for segment in sorted_segments:
        media_blocks = segment.get("media_blocks") or []

        for block in media_blocks:
            if not isinstance(block, dict):
                continue
            kind = block.get("kind")

            if kind in _TEXT_MEDIA_BLOCK_KINDS:
                passage_blocks.append(normalise_text_block(block))

            elif kind == "vocabulary":
                pb = normalise_vocabulary_block(block)
                if pb:
                    passage_blocks.append(pb)

            elif kind == "image":
                # Resolve relative src against the server origin for offline use.
                pb = normalise_image_block(block, asset_base_url)
                if pb:
                    passage_blocks.append(pb)

            elif kind == "gif":
                # Animated GIF — same rendering path as static image.
                pb = normalise_gif_block(block, asset_base_url)
                if pb:
                    passage_blocks.append(pb)

            elif kind == "audio":
                pb = normalise_audio_block(block, asset_base_url)
                if pb:
                    passage_blocks.append(pb)

            elif kind in {"video", "video_embed"}:
                pb = normalise_video_block(block, asset_base_url)
                if pb:
                    passage_blocks.append(pb)

            elif kind == "carousel_slides":
                pb = normalise_carousel_block(block, asset_base_url)
                if pb:
                    passage_blocks.append(pb)

            elif kind == "true_false":
                group, consumed = normalise_true_false_block(block, next_number, correct_answers)
                if consumed > 0:
                    question_groups.append(group)
                    next_number += consumed

            elif kind in _GAP_FILL_MEDIA_BLOCK_KINDS:
                group, consumed = normalise_gap_fill_block(block, next_number, correct_answers)
                if consumed > 0:
                    question_groups.append(group)
                    next_number += consumed

            elif kind in _TEST_MEDIA_BLOCK_KINDS:
                # Questions are stored INLINE at data.questions (NOT the Test
                # ORM). May yield an MC group and/or a TF group.
                for group, consumed in normalise_test_block(block, next_number, correct_answers):
                    if consumed > 0:
                        question_groups.append(group)
                        next_number += consumed

            elif kind in _TIER2_NORMALIZERS:
                group, consumed = _TIER2_NORMALIZERS[kind](block, next_number, correct_answers)
                if consumed > 0 and group is not None:
                    question_groups.append(group)
                    next_number += consumed

            # Unknown / Tier-3 (drag_word_to_image, select_form_to_image, …) skipped.

    return ExportContext(
        unit_title=unit_title,
        passage_blocks=passage_blocks,
        question_groups=question_groups,
        correct_answers=correct_answers,
        total_questions=next_number - 1,
    )


def render_unit_export(unit_title: str, segments: list[dict], asset_base_url: str = "") -> str:
    """
    Build and render a unit's self-contained HTML export. Single public entry
    point for the endpoint. Generated fresh on every call — never cached.

    asset_base_url: absolute server origin (e.g. https://linguai.net) so that
    relative media paths stored in the DB resolve correctly in the exported file.
    """
    # Forward the server origin so media normalizers can make relative URLs absolute.
    ctx = build_export_context(unit_title, segments, asset_base_url=asset_base_url)
    return render_export(ctx)