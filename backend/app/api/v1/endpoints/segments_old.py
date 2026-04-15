"""
app/routers/segments.py
========================
CRUD endpoints for Segments, plus updated content-creation endpoints that
accept segment_id.

Register in api.py:
    from app.routers.segments import router as segments_router
    api_router.include_router(segments_router, prefix="", tags=["Segments"])

Endpoints
---------
GET    /admin/units/{unit_id}/segments              list segments for a unit
POST   /admin/units/{unit_id}/segments              create a new segment
GET    /admin/segments/{segment_id}                 get segment detail
PUT    /admin/segments/{segment_id}                 update segment
DELETE /admin/segments/{segment_id}                 delete segment
POST   /admin/segments/{segment_id}/reorder         reorder segments in unit

Content-creation endpoints that stamp segment_id:
POST   /admin/segments/{segment_id}/presentations   create presentation in segment
POST   /admin/segments/{segment_id}/tests           create test in segment
POST   /admin/segments/{segment_id}/videos          create video in segment
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.orm.attributes import flag_modified
from typing import Any, Dict, List, Optional
from datetime import datetime
import uuid

from app.core.database import get_db
from app.core.auth import get_current_teacher
from app.models.user import User
from app.models.unit import Unit
from app.models.segment import Segment, SegmentStatus
from app.models.presentation import Presentation, PresentationStatus
from app.models.test import Test, TestStatus
from app.models.video import Video, VideoStatus, VideoSourceType
from app.models.segment import Segment, SegmentStatus

router = APIRouter()


SIMPLE_MEDIA_KINDS = {"image", "video", "audio"}
RICH_MEDIA_KINDS = {"carousel_slides"}
CUSTOM_EXERCISE_KINDS = {
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
ALLOWED_KINDS = SIMPLE_MEDIA_KINDS | RICH_MEDIA_KINDS | CUSTOM_EXERCISE_KINDS


def _normalise_carousel_slides(raw_slides: Any) -> List[Dict[str, Any]]:
    if not isinstance(raw_slides, list):
        return []

    normalised: List[Dict[str, Any]] = []
    for item in raw_slides:
        if not isinstance(item, dict):
            continue

        # Preserve the frontend-supplied ID; only generate one if truly absent.
        slide_id = str(item.get("id") or "").strip()
        if not slide_id:
            slide_id = uuid.uuid4().hex[:10]

        normalised.append({
            "id": slide_id,
            "url": str(item.get("url") or ""),
            "caption": str(item.get("caption") or ""),
        })

    return normalised


def _normalise_media_blocks(raw_media_blocks: Any) -> List[Dict[str, Any]]:
    if not isinstance(raw_media_blocks, list):
        return []

    normalised: List[Dict[str, Any]] = []
    for item in raw_media_blocks:
        if not isinstance(item, dict):
            continue

        kind = str(item.get("kind") or "").strip().lower()
        if kind not in ALLOWED_KINDS:
            continue

        # Preserve the frontend-supplied ID; only generate one if truly absent.
        block_id = str(item.get("id") or "").strip()
        if not block_id:
            block_id = uuid.uuid4().hex[:10]

        if kind in SIMPLE_MEDIA_KINDS:
            normalised.append({
                "id": block_id,
                "kind": kind,
                "url": str(item.get("url") or ""),
                "caption": str(item.get("caption") or ""),
            })
        elif kind == "carousel_slides":
            slides = _normalise_carousel_slides(item.get("slides"))
            normalised.append({
                "id": block_id,
                "kind": kind,
                "slides": slides,
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


def _extract_carousel_slides(media_blocks: Any) -> List[Dict[str, Any]]:
    for block in _normalise_media_blocks(media_blocks):
        if block.get("kind") == "carousel_slides":
            return _normalise_carousel_slides(block.get("slides"))
    return []


def _merge_carousel_slides_into_media_blocks(
    raw_media_blocks: Any,
    raw_carousel_slides: Any,
    existing_db_media_blocks: Any = None,
) -> List[Dict[str, Any]]:
    media_blocks = _normalise_media_blocks(raw_media_blocks)
    carousel_slides = _normalise_carousel_slides(raw_carousel_slides)

    # Look for an existing carousel block ID — first in the request payload,
    # then fall back to what is already stored in the DB.
    existing_carousel_block = next(
        (block for block in media_blocks if block.get("kind") == "carousel_slides"),
        None,
    )
    if existing_carousel_block is None and existing_db_media_blocks:
        db_blocks = _normalise_media_blocks(existing_db_media_blocks)
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


# ─── helpers ──────────────────────────────────────────────────────────────────

def _get_segment_or_404(db: Session, segment_id: int, teacher_id: int) -> Segment:
    seg = db.query(Segment).options(
        joinedload(Segment.unit),
    ).filter(Segment.id == segment_id).first()

    if not seg:
        raise HTTPException(status_code=404, detail="Segment not found")

    # Verify the segment's unit belongs to the teacher (via course)
    from app.models.course import Course
    unit = seg.unit
    if unit and unit.course_id:
        course = db.query(Course).filter(Course.id == unit.course_id).first()
        if course and course.created_by != teacher_id:
            raise HTTPException(status_code=403, detail="Access denied")

    return seg


def _segment_detail(seg: Segment) -> Dict[str, Any]:
    media_blocks = _normalise_media_blocks(seg.media_blocks)
    return {
        "id":                     seg.id,
        "unit_id":                seg.unit_id,
        "title":                  seg.title,
        "description":            seg.description,
        "order_index":            seg.order_index,
        "status":                 seg.status.value if hasattr(seg.status, "value") else seg.status,
        "is_visible_to_students": seg.is_visible_to_students,
        "publish_at":             seg.publish_at,
        "created_by":             seg.created_by,
        "created_at":             seg.created_at,
        "updated_at":             seg.updated_at,
        "media_blocks":           media_blocks,
        "carousel_slides":        _extract_carousel_slides(media_blocks),
        "videos": [
            {"id": v.id, "title": v.title, "status": v.status.value if hasattr(v.status, "value") else v.status, "order_index": v.order_index}
            for v in sorted(seg.videos or [], key=lambda x: x.order_index)
        ],
        "tasks": [
            {"id": t.id, "title": t.title, "status": t.status.value if hasattr(t.status, "value") else t.status, "order_index": t.order_index}
            for t in sorted(seg.tasks or [], key=lambda x: x.order_index)
        ],
        "tests": [
            {"id": t.id, "title": t.title, "status": t.status.value if hasattr(t.status, "value") else t.status, "order_index": t.order_index, "time_limit_minutes": t.time_limit_minutes}
            for t in sorted(seg.tests or [], key=lambda x: x.order_index)
        ],
        "presentations": [
            {"id": p.id, "title": p.title, "status": p.status.value if hasattr(p.status, "value") else p.status, "order_index": p.order_index, "slide_count": p.slide_count}
            for p in sorted(seg.presentations or [], key=lambda x: x.order_index)
        ],
    }


# ─── List segments for a unit ─────────────────────────────────────────────────

@router.get("/admin/units/{unit_id}/segments")
async def list_segments(
    unit_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    """Return all segments for a unit, ordered by order_index."""
    unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")

    segments = db.query(Segment).options(
        joinedload(Segment.videos),
        joinedload(Segment.tasks),
        joinedload(Segment.tests),
        joinedload(Segment.presentations),
    ).filter(Segment.unit_id == unit_id).order_by(Segment.order_index).all()

    return [_segment_detail(s) for s in segments]


# ─── Create segment ───────────────────────────────────────────────────────────

@router.post("/admin/units/{unit_id}/segments", status_code=201)
async def create_segment(
    unit_id: int,
    body: Dict[str, Any],
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    """
    Create a new segment inside a unit.
    Called when the teacher presses "Add section" in the side panel.

    Body:
        title           str   (required)
        description     str   (optional)
        order_index     int   (optional, auto-computed if absent)
        status          str   (optional: draft|scheduled|published|archived; default draft)
    """
    unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")

    title = (body.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=422, detail="title is required")

    # Auto order_index: max existing + 1
    max_order = db.query(Segment).filter(Segment.unit_id == unit_id).count()
    order_index = body.get("order_index", max_order)

    status_raw = body.get("status")
    if status_raw is not None:
        try:
            segment_status = SegmentStatus(str(status_raw).lower())
        except ValueError:
            segment_status = SegmentStatus.DRAFT
    else:
        segment_status = SegmentStatus.DRAFT

    media_blocks = _normalise_media_blocks(body.get("media_blocks"))
    if "carousel_slides" in body:
        media_blocks = _merge_carousel_slides_into_media_blocks(
            media_blocks,
            body.get("carousel_slides"),
        )

    seg = Segment(
        unit_id=unit_id,
        title=title,
        description=body.get("description"),
        order_index=order_index,
        status=segment_status,
        is_visible_to_students=body.get("is_visible_to_students", False),
        media_blocks=media_blocks,
        created_by=current_user.id,
    )
    db.add(seg)
    db.commit()
    db.refresh(seg)
    return _segment_detail(seg)


# ─── Get segment presentations WITH slides (single-request batch) ─────────────

@router.get("/admin/segments/{segment_id}/presentations")
async def list_segment_presentations_with_slides(
    segment_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    """
    Return all presentations for a segment, each with their full slides array.
    Single request replaces N individual GET /admin/presentations/:id calls.
    """
    from app.models.presentation import Presentation, PresentationSlide
    from sqlalchemy.orm import joinedload as jl

    _get_segment_or_404(db, segment_id, current_user.id)

    presentations = (
        db.query(Presentation)
        .options(jl(Presentation.slides))
        .filter(Presentation.segment_id == segment_id)
        .order_by(Presentation.order_index)
        .all()
    )

    def _slide(s):
        return {
            "id":            s.id,
            "title":         s.title,
            "bullet_points": s.bullet_points or [],
            "examples":      s.examples      or [],
            "exercise":      s.exercise,
            "image_url":     s.image_url,
            "order_index":   s.order_index,
        }

    def _pres(p):
        sorted_slides = sorted(p.slides or [], key=lambda s: s.order_index)
        return {
            "id":          p.id,
            "title":       p.title,
            "order_index": p.order_index,
            "slides":      [_slide(s) for s in sorted_slides],
        }

    return [_pres(p) for p in presentations]


# ─── Get segment ──────────────────────────────────────────────────────────────

@router.get("/admin/segments/{segment_id}")
async def get_segment(
    segment_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    seg = db.query(Segment).options(
        joinedload(Segment.videos),
        joinedload(Segment.tasks),
        joinedload(Segment.tests),
        joinedload(Segment.presentations),
    ).filter(Segment.id == segment_id).first()

    if not seg:
        raise HTTPException(status_code=404, detail="Segment not found")

    return _segment_detail(seg)


# ─── Update segment ───────────────────────────────────────────────────────────

@router.put("/admin/segments/{segment_id}")
async def update_segment(
    segment_id: int,
    body: Dict[str, Any],
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    seg = _get_segment_or_404(db, segment_id, current_user.id)

    allowed = {"title", "description", "order_index", "status", "is_visible_to_students", "publish_at"}
    for field in allowed:
        if field in body:
            setattr(seg, field, body[field])

    if "media_blocks" in body or "carousel_slides" in body:
        if "carousel_slides" in body:
            media_blocks_source = body["media_blocks"] if "media_blocks" in body else seg.media_blocks
            seg.media_blocks = _merge_carousel_slides_into_media_blocks(
                media_blocks_source,
                body.get("carousel_slides"),
                existing_db_media_blocks=seg.media_blocks,
            )
        else:
            seg.media_blocks = _normalise_media_blocks(body.get("media_blocks"))
        flag_modified(seg, "media_blocks")

    seg.updated_by = current_user.id
    db.commit()
    db.refresh(seg)
    return _segment_detail(seg)


# ─── Delete segment ───────────────────────────────────────────────────────────

@router.delete("/admin/segments/{segment_id}")
async def delete_segment(
    segment_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    """
    Delete a segment.
    Content rows (videos/tasks/tests/presentations) are NOT deleted —
    their segment_id is set to NULL (SET NULL cascade).
    """
    seg = _get_segment_or_404(db, segment_id, current_user.id)
    db.delete(seg)
    db.commit()
    return {"message": "Segment deleted"}


# ─── Reorder segments ─────────────────────────────────────────────────────────

@router.post("/admin/units/{unit_id}/segments/reorder")
async def reorder_segments(
    unit_id: int,
    body: Dict[str, Any],
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    """
    Body: { "segments": [{ "id": 1, "order_index": 0 }, ...] }
    """
    items = body.get("segments", [])
    for item in items:
        seg = db.query(Segment).filter(
            Segment.id == item["id"],
            Segment.unit_id == unit_id,
        ).first()
        if seg:
            seg.order_index = item["order_index"]
    db.commit()
    return {"message": "Reordered"}


# ══════════════════════════════════════════════════════════════════════════════
# Content-creation endpoints that stamp segment_id
# ══════════════════════════════════════════════════════════════════════════════

# ─── Create presentation in a segment ────────────────────────────────────────

@router.post("/admin/segments/{segment_id}/presentations", status_code=201)
async def create_presentation_in_segment(
    segment_id: int,
    body: Dict[str, Any],
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    """
    Create a presentation belonging to this segment.
    Stamps both segment_id and unit_id on the row.
    """
    seg = _get_segment_or_404(db, segment_id, current_user.id)

    max_order = db.query(Presentation).filter(Presentation.segment_id == segment_id).count()

    pres = Presentation(
        unit_id=seg.unit_id,
        segment_id=segment_id,                         # ✅ segment FK
        title=(body.get("title") or "Untitled presentation").strip(),
        description=body.get("description"),
        topic=body.get("topic"),
        level=body.get("level"),
        duration_minutes=body.get("duration_minutes"),
        language=body.get("language", "English"),
        status=PresentationStatus.DRAFT,
        is_visible_to_students=body.get("is_visible_to_students", True),
        order_index=body.get("order_index", max_order),
        created_by=current_user.id,
    )
    db.add(pres)
    db.commit()
    db.refresh(pres)
    return {"id": pres.id, "title": pres.title, "segment_id": pres.segment_id, "unit_id": pres.unit_id, "order_index": pres.order_index}


# ─── Create test in a segment ─────────────────────────────────────────────────

@router.post("/admin/segments/{segment_id}/tests", status_code=201)
async def create_test_in_segment(
    segment_id: int,
    body: Dict[str, Any],
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    """
    Create a test belonging to this segment.
    Used when the teacher clicks "Add Test" while a segment is active.
    """
    seg = _get_segment_or_404(db, segment_id, current_user.id)

    max_order = db.query(Test).filter(Test.segment_id == segment_id).count()

    test = Test(
        unit_id=seg.unit_id,
        segment_id=segment_id,                         # ✅ segment FK
        title=(body.get("title") or "Untitled test").strip(),
        description=body.get("description", ""),
        instructions=body.get("instructions", ""),
        time_limit_minutes=body.get("time_limit_minutes", 10),
        passing_score=body.get("passing_score", 60.0),
        status=TestStatus.DRAFT,
        order_index=body.get("order_index", max_order),
        settings=body.get("settings", {}),
        created_by=current_user.id,
    )
    db.add(test)
    db.commit()
    db.refresh(test)
    return {"id": test.id, "title": test.title, "segment_id": test.segment_id, "unit_id": test.unit_id}


# ─── Create video in a segment ────────────────────────────────────────────────

@router.post("/admin/segments/{segment_id}/videos", status_code=201)
async def create_video_in_segment(
    segment_id: int,
    body: Dict[str, Any],
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    """
    Create a video belonging to this segment.
    """
    seg = _get_segment_or_404(db, segment_id, current_user.id)

    max_order = db.query(Video).filter(Video.segment_id == segment_id).count()

    source_type_str = body.get("source_type", "url")
    try:
        source_type = VideoSourceType(source_type_str)
    except ValueError:
        source_type = VideoSourceType.URL

    video = Video(
        unit_id=seg.unit_id,
        segment_id=segment_id,                         # ✅ segment FK
        title=(body.get("title") or "Untitled video").strip(),
        description=body.get("description"),
        source_type=source_type,
        external_url=body.get("external_url") or body.get("url"),
        file_path=body.get("file_path"),
        status=VideoStatus.DRAFT,
        is_visible_to_students=body.get("is_visible_to_students", True),
        order_index=body.get("order_index", max_order),
        created_by=current_user.id,
    )
    db.add(video)
    db.commit()
    db.refresh(video)
    return {"id": video.id, "title": video.title, "segment_id": video.segment_id, "unit_id": video.unit_id}


# ══════════════════════════════════════════════════════════════════════════════
# Patch existing content-creation endpoints to accept segment_id
# (used when the teacher creates content via the legacy unit-level endpoints
#  but has an active segment selected in the UI)
# ══════════════════════════════════════════════════════════════════════════════

@router.patch("/admin/presentations/{presentation_id}/segment")
async def assign_presentation_to_segment(
    presentation_id: int,
    body: Dict[str, Any],
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    """Move an existing presentation into a segment."""
    pres = db.query(Presentation).filter(Presentation.id == presentation_id).first()
    if not pres:
        raise HTTPException(status_code=404, detail="Presentation not found")
    pres.segment_id = body.get("segment_id")
    db.commit()
    return {"id": pres.id, "segment_id": pres.segment_id}


@router.patch("/admin/tests/{test_id}/segment")
async def assign_test_to_segment(
    test_id: int,
    body: Dict[str, Any],
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    """Move an existing test into a segment."""
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    test.segment_id = body.get("segment_id")
    db.commit()
    return {"id": test.id, "segment_id": test.segment_id}


@router.patch("/admin/videos/{video_id}/segment")
async def assign_video_to_segment(
    video_id: int,
    body: Dict[str, Any],
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    """Move an existing video into a segment."""
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    video.segment_id = body.get("segment_id")
    db.commit()
    return {"id": video.id, "segment_id": video.segment_id}