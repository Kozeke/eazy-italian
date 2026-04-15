from datetime import datetime
import os
import re
import uuid
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_, desc
from typing import List, Optional

from app.core.database import get_db
from app.core.auth import get_current_teacher
from app.models.user import User
from app.models.video import Video, VideoSourceType, VideoStatus
from app.models.unit import Unit
from app.schemas.video import VideoListResponse, VideoCreate, VideoResponse, VideoUpdate

router = APIRouter()


def get_uploads_path() -> str:
    """Get the uploads directory path - same logic as videos.py."""
    current_file = os.path.abspath(__file__)
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(current_file)))))

    is_docker = (
        os.name != "nt"
        and os.path.exists("/app")
        and os.getcwd() == "/app"
        and backend_dir == "/app"
    )
    if is_docker:
        return "/app/uploads"
    return os.path.join(backend_dir, "uploads")


def validate_youtube_url(url: str) -> bool:
    youtube_patterns = [
        r"(?:https?://)?(?:www\.)?youtube\.com/watch\?v=([a-zA-Z0-9_-]+)",
        r"(?:https?://)?(?:www\.)?youtu\.be/([a-zA-Z0-9_-]+)",
        r"(?:https?://)?(?:www\.)?youtube\.com/embed/([a-zA-Z0-9_-]+)",
    ]
    return any(re.match(pattern, url) for pattern in youtube_patterns)


def validate_vimeo_url(url: str) -> bool:
    vimeo_patterns = [
        r"(?:https?://)?(?:www\.)?vimeo\.com/(\d+)",
        r"(?:https?://)?(?:www\.)?vimeo\.com/embed/(\d+)",
    ]
    return any(re.match(pattern, url) for pattern in vimeo_patterns)

@router.get("/videos", response_model=List[VideoListResponse])
async def get_admin_videos(
    query: Optional[str] = Query(None, description="Search by title or description"),
    unit_id: Optional[int] = Query(None, description="Filter by unit ID"),
    status: Optional[VideoStatus] = Query(None, description="Filter by status"),
    source_type: Optional[VideoSourceType] = Query(None, description="Filter by source type"),
    level: Optional[str] = Query(None, description="Filter by unit level (A1-C2)"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(25, ge=1, le=100, description="Items per page"),
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Get paginated list of videos for admin panel - only videos created by current teacher"""
    
    # Build query - only videos created by current teacher
    query_builder = db.query(Video).join(Unit).options(
        joinedload(Video.unit)
    ).filter(Video.created_by == current_user.id)
    
    # Apply filters
    if query:
        search_term = f"%{query}%"
        query_builder = query_builder.filter(
            or_(
                Video.title.ilike(search_term),
                Video.description.ilike(search_term)
            )
        )
    
    if unit_id:
        query_builder = query_builder.filter(Video.unit_id == unit_id)
    
    if status:
        query_builder = query_builder.filter(Video.status == status)
    
    if source_type:
        query_builder = query_builder.filter(Video.source_type == source_type)
    
    if level:
        query_builder = query_builder.filter(Unit.level == level)
    
    # Apply pagination
    offset = (page - 1) * limit
    videos = query_builder.order_by(desc(Video.created_at)).offset(offset).limit(limit).all()
    
    # Convert to response format
    result = []
    for video in videos:
        result.append(VideoListResponse(
            id=video.id,
            title=video.title,
            unit_id=video.unit_id,
            unit_title=video.unit.title,
            source_type=video.source_type,
            duration_sec=video.duration_sec,
            status=video.status,
            publish_at=video.publish_at,
            thumbnail_path=video.thumbnail_path,
            is_visible_to_students=video.is_visible_to_students,
            order_index=video.order_index or 0,
            created_at=video.created_at,
            updated_at=video.updated_at
        ))
    
    return result


@router.post("/videos", response_model=VideoResponse)
async def create_video(
    video_data: VideoCreate,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    """Create a new video in admin scope."""
    unit = db.query(Unit).filter(Unit.id == video_data.unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")

    if video_data.source_type == VideoSourceType.URL:
        if not video_data.external_url:
            raise HTTPException(status_code=400, detail="External URL is required for URL source type")
        if not (validate_youtube_url(video_data.external_url) or validate_vimeo_url(video_data.external_url)):
            raise HTTPException(status_code=400, detail="Invalid YouTube or Vimeo URL")

    base_slug = video_data.title.lower().replace(" ", "-")
    base_slug = re.sub(r"[^\w\-а-яё]", "", base_slug, flags=re.IGNORECASE)
    slug = base_slug

    counter = 1
    while db.query(Video).filter(Video.slug == slug).first():
        slug = f"{base_slug}-{counter}"
        counter += 1
        if counter > 1000:
            slug = f"{base_slug}-{uuid.uuid4().hex[:8]}"
            break

    video = Video(
        **video_data.dict(),
        created_by=current_user.id,
        slug=slug,
    )
    try:
        db.add(video)
        db.commit()
        db.refresh(video)
    except Exception as e:
        db.rollback()
        if "unique" in str(e).lower() or "duplicate" in str(e).lower() or "slug" in str(e).lower():
            slug = f"{base_slug}-{uuid.uuid4().hex[:8]}"
            video.slug = slug
            db.add(video)
            db.commit()
            db.refresh(video)
        else:
            raise HTTPException(status_code=500, detail=f"Error creating video: {str(e)}")

    if not video.thumbnail_path and unit.level:
        try:
            from app.utils.thumbnail_generator import generate_default_thumbnail, get_thumbnail_path

            thumbnail_path = get_thumbnail_path(video.id, unit.level)
            uploads_path = get_uploads_path()
            full_path = os.path.join(uploads_path, thumbnail_path)
            generate_default_thumbnail(unit.level, full_path, title=video.title)
            video.thumbnail_path = thumbnail_path
            db.commit()
            db.refresh(video)
        except Exception:
            # Do not fail create flow if thumbnail generation fails.
            pass

    return video


@router.get("/videos/{video_id}", response_model=VideoResponse)
async def get_video(
    video_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    """Get video details in admin scope."""
    video = db.query(Video).filter(
        Video.id == video_id,
        Video.created_by == current_user.id,
    ).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    return video


@router.put("/videos/{video_id}", response_model=VideoResponse)
async def update_video(
    video_id: int,
    video_data: VideoUpdate,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    """Update video in admin scope."""
    video = db.query(Video).filter(
        Video.id == video_id,
        Video.created_by == current_user.id,
    ).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    if video_data.external_url:
        if not (validate_youtube_url(video_data.external_url) or validate_vimeo_url(video_data.external_url)):
            raise HTTPException(status_code=400, detail="Invalid YouTube or Vimeo URL")

    update_data = video_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(video, field, value)

    video.updated_by = current_user.id
    video.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(video)
    return video


@router.delete("/videos/{video_id}")
async def delete_video(
    video_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    """Delete video in admin scope."""
    video = db.query(Video).filter(
        Video.id == video_id,
        Video.created_by == current_user.id,
    ).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    db.delete(video)
    db.commit()
    return {"message": "Video deleted successfully"}
