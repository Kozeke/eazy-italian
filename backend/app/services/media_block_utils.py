"""
app/services/media_block_utils.py
===================================
Shared constants and normalisation helpers for media-block JSONB columns
(Segment.media_blocks, Unit.homework_blocks, etc.).

Previously private helpers in app/routers/segments.py — extracted here so any
router or service can import them without a circular-import risk.
"""

from typing import Any, Dict, List
import uuid

# ─── Kind registries ──────────────────────────────────────────────────────────

SIMPLE_MEDIA_KINDS: set = {"image", "video", "audio"}
RICH_MEDIA_KINDS: set = {"carousel_slides"}
# Rich-text content blocks authored in the lesson editor
TEXT_KINDS: set = {"text"}
CUSTOM_EXERCISE_KINDS: set = {
    "image_stacked",
    "drag_to_gap",
    "drag_to_image",
    "type_word_to_image",
    "select_form_to_image",
    "type_word_in_gap",
    "select_word_form",
    "build_sentence",
    "sort_into_columns",
    "match_pairs",
    "order_paragraphs",
    "drag_word_to_image",
    "test_without_timer",
    "test_with_timer",
    "true_false",
}
ALLOWED_KINDS: set = SIMPLE_MEDIA_KINDS | RICH_MEDIA_KINDS | TEXT_KINDS | CUSTOM_EXERCISE_KINDS


# ─── Carousel slides ──────────────────────────────────────────────────────────

def normalise_carousel_slides(raw_slides: Any) -> List[Dict[str, Any]]:
    """Validate and normalise a raw list of carousel slide dicts."""
    if not isinstance(raw_slides, list):
        return []

    normalised: List[Dict[str, Any]] = []
    for item in raw_slides:
        if not isinstance(item, dict):
            continue

        slide_id = str(item.get("id") or "").strip()
        if not slide_id:
            slide_id = uuid.uuid4().hex[:10]

        normalised.append({
            "id": slide_id,
            "url": str(item.get("url") or ""),
            "caption": str(item.get("caption") or ""),
        })

    return normalised


# ─── Media-block list ─────────────────────────────────────────────────────────

def normalise_media_blocks(raw_media_blocks: Any) -> List[Dict[str, Any]]:
    """
    Validate and normalise a raw list of media block dicts.
    Recognised kinds: simple media (image/video/audio), carousel_slides,
    text, and all CUSTOM_EXERCISE_KINDS.  Unknown kinds are silently dropped.
    Missing ids are generated via uuid4().
    """
    if not isinstance(raw_media_blocks, list):
        return []

    normalised: List[Dict[str, Any]] = []
    for item in raw_media_blocks:
        if not isinstance(item, dict):
            continue

        kind = str(item.get("kind") or "").strip().lower()
        if kind not in ALLOWED_KINDS:
            continue

        block_id = str(item.get("id") or "").strip()
        if not block_id:
            block_id = uuid.uuid4().hex[:10]

        if kind in SIMPLE_MEDIA_KINDS:
            block_dict: Dict[str, Any] = {
                "id": block_id,
                "kind": kind,
                "url": str(item.get("url") or ""),
                "caption": str(item.get("caption") or ""),
            }
            # Preserve optional title (present on image blocks authored in the editor)
            if item.get("title"):
                block_dict["title"] = str(item["title"])
            # Preserve optional data payload (e.g. base64 src on image blocks).
            # Without this, data.src is silently stripped on every PUT and the
            # image disappears from the lesson until the page is hard-refreshed
            # from a separate upload endpoint.
            data = item.get("data")
            if isinstance(data, dict) and data:
                block_dict["data"] = data
            normalised.append(block_dict)
        elif kind == "carousel_slides":
            slides = normalise_carousel_slides(item.get("slides"))
            normalised.append({
                "id": block_id,
                "kind": kind,
                "slides": slides,
            })
        elif kind in TEXT_KINDS:
            # Preserve rich-text content authored in the lesson editor
            data = item.get("data")
            normalised.append({
                "id": block_id,
                "kind": kind,
                "title": str(item.get("title") or ""),
                "data": data if isinstance(data, dict) else {},
            })
        elif kind in CUSTOM_EXERCISE_KINDS:
            data = item.get("data")
            normalised.append({
                "id": block_id,
                "kind": kind,
                "title": str(item.get("title") or ""),
                "data": data if isinstance(data, dict) else {},
            })

    return normalised


# ─── Carousel extraction / merge ──────────────────────────────────────────────

def extract_carousel_slides(media_blocks: Any) -> List[Dict[str, Any]]:
    """Return the slides list from the first carousel_slides block, or []."""
    for block in normalise_media_blocks(media_blocks):
        if block.get("kind") == "carousel_slides":
            return normalise_carousel_slides(block.get("slides"))
    return []


def merge_carousel_slides_into_media_blocks(
    raw_media_blocks: Any,
    raw_carousel_slides: Any,
    existing_db_media_blocks: Any = None,
) -> List[Dict[str, Any]]:
    """
    Merge a standalone carousel-slides list into the flat media_blocks list.
    Preserves any existing carousel block id (from request payload or DB).
    """
    media_blocks = normalise_media_blocks(raw_media_blocks)
    carousel_slides = normalise_carousel_slides(raw_carousel_slides)

    existing_carousel_block = next(
        (block for block in media_blocks if block.get("kind") == "carousel_slides"),
        None,
    )
    if existing_carousel_block is None and existing_db_media_blocks:
        db_blocks = normalise_media_blocks(existing_db_media_blocks)
        existing_carousel_block = next(
            (block for block in db_blocks if block.get("kind") == "carousel_slides"),
            None,
        )

    merged_blocks = [
        block for block in media_blocks if block.get("kind") != "carousel_slides"
    ]

    if carousel_slides:
        carousel_id = (
            str(existing_carousel_block.get("id") or "").strip()
            if existing_carousel_block
            else ""
        )
        merged_blocks.append({
            "id": carousel_id or uuid.uuid4().hex[:10],
            "kind": "carousel_slides",
            "slides": carousel_slides,
        })

    return merged_blocks