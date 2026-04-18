# app/api/v1/endpoints/presentations.py
"""
CRUD endpoints for Presentations and their Slides.

Route structure
---------------
POST   /admin/units/{unit_id}/presentations          — create presentation
GET    /admin/units/{unit_id}/presentations          — list presentations in a unit
GET    /admin/presentations/{id}                     — get single presentation (with slides)
PUT    /admin/presentations/{id}                     — update presentation metadata
DELETE /admin/presentations/{id}                     — delete presentation + all slides
PATCH  /admin/presentations/{id}/status              — publish / archive / draft
PATCH  /admin/presentations/{id}/reorder             — change order_index within unit

POST   /admin/presentations/{id}/slides              — add slide
GET    /admin/presentations/{id}/slides              — list slides
PUT    /admin/presentations/{id}/slides/{slide_id}   — update slide content
DELETE /admin/presentations/{id}/slides/{slide_id}  — delete slide
PATCH  /admin/presentations/{id}/slides/reorder      — bulk reorder slides

POST   /admin/presentations/{id}/generate            — (re)generate slides via AI
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from app.core.auth import get_current_teacher, get_current_user
from app.core.database import get_db
from app.core.enrollment_guard import check_unit_access
from app.models.course import Course
from app.models.presentation import Presentation, PresentationSlide, PresentationStatus
from app.models.unit import Unit
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()


# ══════════════════════════════════════════════════════════════════════════════
# Pydantic schemas (inline — move to app/schemas/presentation.py if preferred)
# ══════════════════════════════════════════════════════════════════════════════

class SlideBase(BaseModel):
    title:         str
    bullet_points: List[str]             = Field(default_factory=list)
    examples:      Optional[List[str]]   = None
    exercise:      Optional[str]         = None
    teacher_notes: Optional[str]         = None
    image_url:     Optional[str]         = None
    image_alt:     Optional[str]         = None
    order_index:   int                   = 0


class SlideCreate(SlideBase):
    pass


class SlideUpdate(BaseModel):
    title:         Optional[str]         = None
    bullet_points: Optional[List[str]]   = None
    examples:      Optional[List[str]]   = None
    exercise:      Optional[str]         = None
    teacher_notes: Optional[str]         = None
    image_url:     Optional[str]         = None
    image_alt:     Optional[str]         = None
    order_index:   Optional[int]         = None


class SlideResponse(SlideBase):
    id:              int
    presentation_id: int
    created_at:      datetime
    updated_at:      Optional[datetime]

    class Config:
        from_attributes = True


# ── Presentation schemas ───────────────────────────────────────────────────────

class PresentationCreate(BaseModel):
    title:                 str
    description:           Optional[str]        = None
    topic:                 Optional[str]         = None
    level:                 Optional[str]         = None
    duration_minutes:      Optional[int]         = None
    language:              Optional[str]         = None
    learning_goals:        Optional[List[str]]   = None
    target_audience:       Optional[str]         = None
    is_visible_to_students: bool                 = False
    order_index:           int                   = 0
    slug:                  Optional[str]         = None
    meta_title:            Optional[str]         = None
    meta_description:      Optional[str]         = None
    status:                PresentationStatus    = PresentationStatus.DRAFT
    publish_at:            Optional[datetime]    = None


class PresentationUpdate(BaseModel):
    title:                 Optional[str]         = None
    description:           Optional[str]         = None
    topic:                 Optional[str]         = None
    level:                 Optional[str]         = None
    duration_minutes:      Optional[int]         = None
    language:              Optional[str]         = None
    learning_goals:        Optional[List[str]]   = None
    target_audience:       Optional[str]         = None
    is_visible_to_students: Optional[bool]       = None
    order_index:           Optional[int]         = None
    slug:                  Optional[str]         = None
    meta_title:            Optional[str]         = None
    meta_description:      Optional[str]         = None
    status:                Optional[PresentationStatus] = None
    publish_at:            Optional[datetime]    = None


class PresentationStatusUpdate(BaseModel):
    status:     PresentationStatus
    publish_at: Optional[datetime] = None


class PresentationReorderRequest(BaseModel):
    order_index: int


class SlidesReorderRequest(BaseModel):
    """Maps slide_id → new order_index."""
    order: dict[int, int]   # { slide_id: order_index }


class PresentationListItem(BaseModel):
    id:                    int
    unit_id:               int
    title:                 str
    description:           Optional[str]
    status:                PresentationStatus
    is_visible_to_students: bool
    order_index:           int
    slide_count:           int
    created_at:            datetime
    updated_at:            Optional[datetime]

    class Config:
        from_attributes = True


class PresentationResponse(BaseModel):
    id:                    int
    unit_id:               int
    title:                 str
    description:           Optional[str]
    topic:                 Optional[str]
    level:                 Optional[str]
    duration_minutes:      Optional[int]
    language:              Optional[str]
    learning_goals:        Optional[List[str]]
    target_audience:       Optional[str]
    status:                PresentationStatus
    publish_at:            Optional[datetime]
    is_visible_to_students: bool
    order_index:           int
    slug:                  Optional[str]
    meta_title:            Optional[str]
    meta_description:      Optional[str]
    slides:                List[SlideResponse]
    slide_count:           int
    created_at:            datetime
    updated_at:            Optional[datetime]

    class Config:
        from_attributes = True


# AI generate request schema (wraps SlideGenerationRequest fields)
class PresentationGenerateRequest(BaseModel):
    topic:                 str
    level:                 str                  = "B1"
    duration_minutes:      int                  = 30
    language:              str                  = "Italian"
    learning_goals:        Optional[List[str]]  = None
    target_audience:       Optional[str]        = None
    include_exercises:     bool                 = True
    include_teacher_notes: bool                 = True
    generate_images:       bool                 = False
    image_provider:        str                  = "svg"   # "svg" | "huggingface" | "none"


# ══════════════════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════════════════

def _get_presentation_or_404(
    presentation_id: int,
    db: Session,
    current_user: User,
    load_slides: bool = True,
) -> Presentation:
    q = db.query(Presentation)
    if load_slides:
        q = q.options(joinedload(Presentation.slides))
    p = q.filter(Presentation.id == presentation_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Presentation not found")
    # Only the creator (or superuser) may edit
    if p.created_by != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not authorised to access this presentation")
    return p


def resolve_image_url(
    raw_image_url:   str | None,
    presentation_id: int,
    slide_index:     int,
) -> str | None:
    """
    If ``raw_image_url`` is a data URI, upload it to MinIO and return
    the resulting public URL.  Otherwise return it unchanged.

    This is a pure helper — it does not touch the database.

    Parameters
    ----------
    raw_image_url
        Whatever the frontend sent in the ``image_url`` field.
        Could be: None, a real URL, or a "data:image/..." string.
    presentation_id
        Used to build the MinIO object key path.
    slide_index
        0-based position of the slide in the presentation.

    Returns
    -------
    str or None
        A short MinIO URL on successful upload, the original value if it
        was already a URL, or None if the upload fails (logs a warning).
    """
    if not raw_image_url:
        return raw_image_url

    # Not a data URI — already a real URL, pass through unchanged
    if not raw_image_url.startswith("data:"):
        return raw_image_url

    # Data URI detected — upload to MinIO
    from app.services.storage.slide_image_storage import SlideImageStorage

    storage = SlideImageStorage()
    url = storage.upload_from_data_uri(
        data_uri        = raw_image_url,
        presentation_id = presentation_id,
        slide_index     = slide_index,
    )

    if url is None:
        # Upload failed — log but don't crash.  Store None rather than a
        # 25 KB string (the VARCHAR would still reject it).
        logger.warning(
            "MinIO upload failed for presentation=%d slide=%d — image_url will be NULL",
            presentation_id, slide_index,
        )

    return url


def _build_list_item(p: Presentation) -> dict:
    return {
        "id":                    p.id,
        "unit_id":               p.unit_id,
        "title":                 p.title,
        "description":           p.description,
        "status":                p.status,
        "is_visible_to_students": p.is_visible_to_students,
        "order_index":           p.order_index,
        "slide_count":           len(p.slides) if p.slides else 0,
        "created_at":            p.created_at,
        "updated_at":            p.updated_at,
    }


# ══════════════════════════════════════════════════════════════════════════════
# Presentation CRUD
# ══════════════════════════════════════════════════════════════════════════════

@router.post(
    "/admin/units/{unit_id}/presentations",
    response_model=PresentationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an empty presentation in a unit",
)
async def create_presentation(
    unit_id: int,
    body:    PresentationCreate,
    current_user: User    = Depends(get_current_teacher),
    db:      Session      = Depends(get_db),
) -> Any:
    unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")

    # Slug uniqueness guard
    if body.slug:
        existing = db.query(Presentation).filter(Presentation.slug == body.slug).first()
        if existing:
            raise HTTPException(status_code=409, detail="A presentation with this slug already exists")

    p = Presentation(
        unit_id                = unit_id,
        title                  = body.title,
        description            = body.description,
        topic                  = body.topic,
        level                  = body.level,
        duration_minutes       = body.duration_minutes,
        language               = body.language,
        learning_goals         = body.learning_goals,
        target_audience        = body.target_audience,
        status                 = body.status,
        publish_at             = body.publish_at,
        is_visible_to_students = body.is_visible_to_students,
        order_index            = body.order_index,
        slug                   = body.slug,
        meta_title             = body.meta_title,
        meta_description       = body.meta_description,
        created_by             = current_user.id,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    logger.info("Created presentation id=%d unit_id=%d by user=%d", p.id, unit_id, current_user.id)
    return p


# NOTE: Teacher classroom slide hydration uses GET /units/{unit_id}/presentations instead of this
# admin list route (see list_unit_presentations_student + course-owner bypass in check_unit_access).
@router.get(
    "/admin/units/{unit_id}/presentations",
    response_model=List[PresentationListItem],
    summary="List presentations in a unit",
)
async def list_presentations(
    unit_id:      int,
    q:            Optional[str]               = Query(None, description="Search title/description"),
    status_filter: Optional[PresentationStatus] = Query(None, alias="status"),
    page:         int                         = Query(1, ge=1),
    limit:        int                         = Query(25, ge=1, le=100),
    current_user: User                        = Depends(get_current_teacher),
    db:           Session                     = Depends(get_db),
) -> Any:
    unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")

    query_builder = (
        db.query(Presentation)
        .options(joinedload(Presentation.slides))
        .filter(Presentation.unit_id == unit_id)
    )
    if q:
        like = f"%{q}%"
        query_builder = query_builder.filter(
            Presentation.title.ilike(like) | Presentation.description.ilike(like)
        )
    if status_filter:
        query_builder = query_builder.filter(Presentation.status == status_filter)

    total   = query_builder.count()
    items   = query_builder.order_by(Presentation.order_index, Presentation.id).offset((page - 1) * limit).limit(limit).all()
    return [_build_list_item(p) for p in items]


@router.get(
    "/admin/presentations/{presentation_id}",
    response_model=PresentationResponse,
    summary="Get presentation with slides",
)
async def get_presentation(
    presentation_id: int,
    current_user: User    = Depends(get_current_teacher),
    db:           Session = Depends(get_db),
) -> Any:
    p = _get_presentation_or_404(presentation_id, db, current_user)
    return p


@router.patch(
    "/admin/presentations/{presentation_id}",
    response_model=PresentationResponse,
    summary="Partially update presentation metadata",
)
@router.put(
    "/admin/presentations/{presentation_id}",
    response_model=PresentationResponse,
    summary="Update presentation metadata",
)
async def update_presentation(
    presentation_id: int,
    body: PresentationUpdate,
    current_user: User    = Depends(get_current_teacher),
    db:           Session = Depends(get_db),
) -> Any:
    p = _get_presentation_or_404(presentation_id, db, current_user)

    if body.slug and body.slug != p.slug:
        existing = db.query(Presentation).filter(Presentation.slug == body.slug).first()
        if existing:
            raise HTTPException(status_code=409, detail="Slug already taken")

    update_data = body.model_dump(exclude_unset=True)

    requested_status = update_data.get("status")
    if requested_status == PresentationStatus.PUBLISHED and not p.slides:
        raise HTTPException(
            status_code=422,
            detail="Cannot publish a presentation with no slides",
        )
    if requested_status == PresentationStatus.PUBLISHED and "is_visible_to_students" not in update_data:
        update_data["is_visible_to_students"] = True

    for field, value in update_data.items():
        setattr(p, field, value)
    p.updated_by = current_user.id
    db.commit()
    db.refresh(p)
    return p


@router.delete(
    "/admin/presentations/{presentation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Delete presentation and all its slides",
)
async def delete_presentation(
    presentation_id: int,
    current_user: User    = Depends(get_current_teacher),
    db:           Session = Depends(get_db),
) -> Response:
    p = _get_presentation_or_404(presentation_id, db, current_user, load_slides=False)
    db.delete(p)
    db.commit()
    logger.info("Deleted presentation id=%d by user=%d", presentation_id, current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch(
    "/admin/presentations/{presentation_id}/status",
    response_model=PresentationResponse,
    summary="Change publish status (draft / published / archived)",
)
async def update_presentation_status(
    presentation_id: int,
    body: PresentationStatusUpdate,
    current_user: User    = Depends(get_current_teacher),
    db:           Session = Depends(get_db),
) -> Any:
    p = _get_presentation_or_404(presentation_id, db, current_user)

    if body.status == PresentationStatus.PUBLISHED and not p.slides:
        raise HTTPException(
            status_code=422,
            detail="Cannot publish a presentation with no slides",
        )

    p.status     = body.status
    p.publish_at = body.publish_at
    p.updated_by = current_user.id
    if body.status == PresentationStatus.PUBLISHED:
        p.is_visible_to_students = True
    db.commit()
    db.refresh(p)
    return p


@router.patch(
    "/admin/presentations/{presentation_id}/reorder",
    response_model=PresentationListItem,
    summary="Set order_index within the unit",
)
async def reorder_presentation(
    presentation_id: int,
    body: PresentationReorderRequest,
    current_user: User    = Depends(get_current_teacher),
    db:           Session = Depends(get_db),
) -> Any:
    p = _get_presentation_or_404(presentation_id, db, current_user, load_slides=True)
    p.order_index = body.order_index
    p.updated_by  = current_user.id
    db.commit()
    db.refresh(p)
    return _build_list_item(p)


# ══════════════════════════════════════════════════════════════════════════════
# Slide CRUD
# ══════════════════════════════════════════════════════════════════════════════

@router.post(
    "/admin/presentations/{presentation_id}/slides",
    response_model=SlideResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a slide to a presentation",
)
async def create_slide(
    presentation_id: int,
    body:  SlideCreate,
    current_user: User    = Depends(get_current_teacher),
    db:    Session        = Depends(get_db),
) -> Any:
    _get_presentation_or_404(presentation_id, db, current_user, load_slides=False)

    # Resolve image_url: if it's a data URI, upload to MinIO; otherwise use as-is
    image_url = resolve_image_url(
        raw_image_url   = body.image_url,
        presentation_id = presentation_id,
        slide_index     = body.order_index,
    )

    slide = PresentationSlide(
        presentation_id = presentation_id,
        title           = body.title,
        bullet_points   = body.bullet_points,
        examples        = body.examples,
        exercise        = body.exercise,
        teacher_notes   = body.teacher_notes,
        image_url       = image_url,
        image_alt       = body.image_alt,
        order_index     = body.order_index,
    )
    db.add(slide)
    db.commit()
    db.refresh(slide)
    return slide


# NOTE: Teacher classroom uses GET /presentations/{presentation_id}/slides (student route) instead
# of this admin slides list (see get_presentation_slides_student + course-owner bypass).
@router.get(
    "/admin/presentations/{presentation_id}/slides",
    response_model=List[SlideResponse],
    summary="List all slides ordered by order_index",
)
async def list_slides(
    presentation_id: int,
    current_user: User    = Depends(get_current_teacher),
    db:    Session        = Depends(get_db),
) -> Any:
    _get_presentation_or_404(presentation_id, db, current_user, load_slides=False)
    slides = (
        db.query(PresentationSlide)
        .filter(PresentationSlide.presentation_id == presentation_id)
        .order_by(PresentationSlide.order_index)
        .all()
    )
    return slides


@router.put(
    "/admin/presentations/{presentation_id}/slides/{slide_id}",
    response_model=SlideResponse,
    summary="Update slide content",
)
async def update_slide(
    presentation_id: int,
    slide_id:        int,
    body:  SlideUpdate,
    current_user: User    = Depends(get_current_teacher),
    db:    Session        = Depends(get_db),
) -> Any:
    _get_presentation_or_404(presentation_id, db, current_user, load_slides=False)

    slide = (
        db.query(PresentationSlide)
        .filter(
            PresentationSlide.id == slide_id,
            PresentationSlide.presentation_id == presentation_id,
        )
        .first()
    )
    if not slide:
        raise HTTPException(status_code=404, detail="Slide not found")

    update_data = body.model_dump(exclude_unset=True)
    
    # Resolve image_url if it's being updated and is a data URI
    if "image_url" in update_data:
        update_data["image_url"] = resolve_image_url(
            raw_image_url   = update_data["image_url"],
            presentation_id = presentation_id,
            slide_index     = slide.order_index,
        )
    
    for field, value in update_data.items():
        setattr(slide, field, value)
    db.commit()
    db.refresh(slide)
    return slide


@router.delete(
    "/admin/presentations/{presentation_id}/slides/{slide_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Delete a single slide",
)
async def delete_slide(
    presentation_id: int,
    slide_id:        int,
    current_user: User    = Depends(get_current_teacher),
    db:    Session        = Depends(get_db),
) -> Response:
    _get_presentation_or_404(presentation_id, db, current_user, load_slides=False)

    slide = (
        db.query(PresentationSlide)
        .filter(
            PresentationSlide.id == slide_id,
            PresentationSlide.presentation_id == presentation_id,
        )
        .first()
    )
    if not slide:
        raise HTTPException(status_code=404, detail="Slide not found")
    db.delete(slide)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch(
    "/admin/presentations/{presentation_id}/slides/reorder",
    response_model=List[SlideResponse],
    summary="Bulk reorder slides — pass {slide_id: new_order_index}",
)
async def reorder_slides(
    presentation_id: int,
    body: SlidesReorderRequest,
    current_user: User    = Depends(get_current_teacher),
    db:    Session        = Depends(get_db),
) -> Any:
    _get_presentation_or_404(presentation_id, db, current_user, load_slides=False)

    slides = (
        db.query(PresentationSlide)
        .filter(PresentationSlide.presentation_id == presentation_id)
        .all()
    )
    slide_map = {s.id: s for s in slides}

    for slide_id_str, new_index in body.order.items():
        slide_id = int(slide_id_str)
        if slide_id in slide_map:
            slide_map[slide_id].order_index = new_index

    db.commit()
    for slide in slides:
        db.refresh(slide)

    return sorted(slides, key=lambda s: s.order_index)


# ══════════════════════════════════════════════════════════════════════════════
# AI Generation — thin wrapper around SlideGeneratorService
# ══════════════════════════════════════════════════════════════════════════════

@router.post(
    "/admin/presentations/{presentation_id}/generate",
    response_model=PresentationResponse,
    summary="(Re)generate slides from AI for an existing presentation",
)
async def generate_slides_for_presentation(
    presentation_id: int,
    body: PresentationGenerateRequest,
    current_user: User    = Depends(get_current_teacher),
    db:           Session = Depends(get_db),
) -> Any:
    """
    Calls the SlideGeneratorService, wipes existing slides, and persists the new deck.
    The presentation's topic/level/language metadata is updated from the request.
    """
    from app.schemas.slides import SlideGenerationRequest
    from app.services.slide_generator import SlideGeneratorService, SlideGenerationError
    from app.services.ai.providers.base import AIProviderError

    # Lazy import of slide generation route dependencies
    try:
        from app.api.v1.endpoints.slide_generation import get_ai_provider, get_cache_backend, get_cache_service
        ai_provider   = get_ai_provider()
        cache_backend = get_cache_backend(db)
        from app.services.ai.cache.cache_service import CacheService
        import os
        _CACHE_ON = os.environ.get("SLIDE_CACHE_ENABLED", "true").lower() != "false"
        cache_svc     = CacheService(backend=cache_backend, enabled=_CACHE_ON)
        svc           = SlideGeneratorService(ai_provider=ai_provider, cache=cache_svc if _CACHE_ON else None, max_retries=1)
    except Exception as e:
        logger.warning("Could not initialise AI provider: %s — skipping generation", e)
        raise HTTPException(status_code=503, detail=f"AI provider unavailable: {e}")

    p = _get_presentation_or_404(presentation_id, db, current_user)

    gen_request = SlideGenerationRequest(
        topic                  = body.topic,
        level                  = body.level,
        duration_minutes       = body.duration_minutes,
        language               = body.language,
        learning_goals         = body.learning_goals or [],
        target_audience        = body.target_audience,
        include_exercises      = body.include_exercises,
        include_teacher_notes  = body.include_teacher_notes,
    )

    try:
        deck = await svc.agenerate_slides(gen_request)
    except AIProviderError as exc:
        raise HTTPException(status_code=503, detail="AI provider unavailable.") from exc
    except SlideGenerationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    # --- Persist: wipe old slides, insert new ones ---
    db.query(PresentationSlide).filter(
        PresentationSlide.presentation_id == presentation_id
    ).delete()

    for idx, slide in enumerate(deck.slides):
        db.add(PresentationSlide(
            presentation_id = presentation_id,
            title           = slide.title,
            bullet_points   = slide.bullet_points,
            examples        = slide.examples or [],
            exercise        = slide.exercise,
            teacher_notes   = slide.teacher_notes,
            order_index     = idx,
        ))

    # Update presentation metadata from the generation request
    p.topic            = body.topic
    p.level            = body.level
    p.duration_minutes = body.duration_minutes
    p.language         = body.language
    p.learning_goals   = body.learning_goals
    p.target_audience  = body.target_audience
    p.updated_by       = current_user.id

    db.commit()
    db.refresh(p)
    logger.info(
        "Regenerated %d slides for presentation id=%d topic=%r",
        len(deck.slides), presentation_id, body.topic,
    )
    return p


# ══════════════════════════════════════════════════════════════════════════════
# Student endpoints with enrollment authorization
# ══════════════════════════════════════════════════════════════════════════════

@router.get(
    "/units/{unit_id}/presentations",
    response_model=List[PresentationListItem],
    summary="List presentations in a unit (student endpoint)",
)
async def list_unit_presentations_student(
    unit_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    """Get presentations for a unit - requires enrollment if unit belongs to a course"""
    # Check enrollment authorization
    check_unit_access(db, current_user, unit_id)
    
    # Get unit to verify it exists
    unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")

    # True when the current teacher created the course that owns this unit (builder / classroom preview)
    teacher_owns_course = False
    if unit.course_id:
        owning_course = db.query(Course).filter(Course.id == unit.course_id).first()
        teacher_owns_course = bool(
            owning_course
            and current_user.is_teacher
            and owning_course.created_by == current_user.id
        )

    base_query = (
        db.query(Presentation)
        .options(joinedload(Presentation.slides))
        .filter(Presentation.unit_id == unit_id)
    )
    if teacher_owns_course:
        presentations = base_query.order_by(Presentation.order_index, Presentation.id).all()
    else:
        presentations = (
            base_query.filter(
                Presentation.status == PresentationStatus.PUBLISHED,
                Presentation.is_visible_to_students == True,
            )
            .order_by(Presentation.order_index, Presentation.id)
            .all()
        )
    
    return [_build_list_item(p) for p in presentations]


@router.get(
    "/presentations/{presentation_id}/slides",
    response_model=List[SlideResponse],
    summary="Get slides for a presentation (student endpoint)",
)
async def get_presentation_slides_student(
    presentation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    """Get slides for a presentation - requires enrollment if presentation belongs to a unit in a course"""
    # Get presentation
    presentation = (
        db.query(Presentation)
        .options(joinedload(Presentation.slides))
        .filter(Presentation.id == presentation_id)
        .first()
    )
    
    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")

    # Check enrollment authorization via unit
    check_unit_access(db, current_user, presentation.unit_id)

    # True when the current teacher owns the course for this presentation's unit (draft decks in classroom)
    teacher_owns_course = False
    if presentation.unit_id:
        pres_unit = db.query(Unit).filter(Unit.id == presentation.unit_id).first()
        if pres_unit and pres_unit.course_id:
            owning_course = db.query(Course).filter(Course.id == pres_unit.course_id).first()
            teacher_owns_course = bool(
                owning_course
                and current_user.is_teacher
                and owning_course.created_by == current_user.id
            )

    if not teacher_owns_course:
        if presentation.status != PresentationStatus.PUBLISHED:
            raise HTTPException(status_code=404, detail="Presentation not found")
        if not presentation.is_visible_to_students:
            raise HTTPException(status_code=404, detail="Presentation not found")
    
    # Get slides
    slides = (
        db.query(PresentationSlide)
        .filter(PresentationSlide.presentation_id == presentation_id)
        .order_by(PresentationSlide.order_index)
        .all()
    )
    
    return slides