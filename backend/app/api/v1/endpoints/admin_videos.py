"""
LEGACY FILE — admin_videos.py (admin video CRUD router)

Architecture change: Video CRUD is replaced by video_embed exercise blocks
stored as media_blocks JSONB on the Segment model.

Old model:  Course → Unit → Video (separate ORM model with CRUD managed here)
New model:  Course → Unit → Segment → media_blocks (video_embed blocks)

Note on /static/thumbnails: the thumbnail serve route lives in videos.py,
not here. Static file serving is being migrated to the file_storage service.

Replaced by:
  - Video CRUD:        video_embed block editor in the segment UI
  - Video progress:    UnitHomeworkSubmission / segment completion state (VideoProgress removed)

This file is fully commented out and kept for reference during migration.
Do NOT re-enable these routes without migrating callers to the new segment API.
"""

# LEGACY: from datetime import datetime
# LEGACY: import os
# LEGACY: import re
# LEGACY: import uuid
# LEGACY: from fastapi import APIRouter, Depends, Query, HTTPException
# LEGACY: from sqlalchemy.orm import Session, joinedload
# LEGACY: from sqlalchemy import and_, or_, desc
# LEGACY: from typing import List, Optional
# LEGACY:
# LEGACY: from app.core.database import get_db
# LEGACY: from app.core.auth import get_current_teacher
# LEGACY: from app.models.user import User
# LEGACY: from app.models.video import Video, VideoSourceType, VideoStatus    # → video_embed blocks on Segment
# LEGACY: from app.models.unit import Unit
# LEGACY: from app.schemas.video import VideoListResponse, VideoCreate, VideoResponse, VideoUpdate

from fastapi import APIRouter

router = APIRouter()

# LEGACY: def get_uploads_path() -> str:
# LEGACY:     """Get the uploads directory path — delegates to the canonical resolver."""
# LEGACY:     from app.utils.paths import resolve_uploads_path  # noqa: PLC0415
# LEGACY:     return resolve_uploads_path()


# LEGACY: def validate_youtube_url(url: str) -> bool:
# LEGACY:     youtube_patterns = [
# LEGACY:         r"(?:https?://)?(?:www\.)?youtube\.com/watch\?v=([a-zA-Z0-9_-]+)",
# LEGACY:         r"(?:https?://)?(?:www\.)?youtu\.be/([a-zA-Z0-9_-]+)",
# LEGACY:         r"(?:https?://)?(?:www\.)?youtube\.com/embed/([a-zA-Z0-9_-]+)",
# LEGACY:     ]
# LEGACY:     return any(re.match(pattern, url) for pattern in youtube_patterns)


# LEGACY: def validate_vimeo_url(url: str) -> bool:
# LEGACY:     vimeo_patterns = [
# LEGACY:         r"(?:https?://)?(?:www\.)?vimeo\.com/(\d+)",
# LEGACY:         r"(?:https?://)?(?:www\.)?vimeo\.com/embed/(\d+)",
# LEGACY:     ]
# LEGACY:     return any(re.match(pattern, url) for pattern in vimeo_patterns)


# ── LEGACY: GET /admin/videos ─────────────────────────────────────────────────
# Replaced by: listing segments with video_embed blocks via segment list endpoint
# LEGACY: @router.get("/videos", response_model=List[VideoListResponse])
# LEGACY: async def get_admin_videos(
# LEGACY:     query: Optional[str] = Query(None, description="Search by title or description"),
# LEGACY:     unit_id: Optional[int] = Query(None, description="Filter by unit ID"),
# LEGACY:     status: Optional[VideoStatus] = Query(None, description="Filter by status"),
# LEGACY:     source_type: Optional[VideoSourceType] = Query(None, description="Filter by source type"),
# LEGACY:     level: Optional[str] = Query(None, description="Filter by unit level (A1-C2)"),
# LEGACY:     page: int = Query(1, ge=1, description="Page number"),
# LEGACY:     limit: int = Query(25, ge=1, le=100, description="Items per page"),
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Get paginated list of videos for admin panel - only videos created by current teacher"""
# LEGACY:
# LEGACY:     query_builder = db.query(Video).join(Unit).options(
# LEGACY:         joinedload(Video.unit)
# LEGACY:     ).filter(Video.created_by == current_user.id)
# LEGACY:
# LEGACY:     if query:
# LEGACY:         search_term = f"%{query}%"
# LEGACY:         query_builder = query_builder.filter(
# LEGACY:             or_(
# LEGACY:                 Video.title.ilike(search_term),
# LEGACY:                 Video.description.ilike(search_term)
# LEGACY:             )
# LEGACY:         )
# LEGACY:
# LEGACY:     if unit_id:
# LEGACY:         query_builder = query_builder.filter(Video.unit_id == unit_id)
# LEGACY:
# LEGACY:     if status:
# LEGACY:         query_builder = query_builder.filter(Video.status == status)
# LEGACY:
# LEGACY:     if source_type:
# LEGACY:         query_builder = query_builder.filter(Video.source_type == source_type)
# LEGACY:
# LEGACY:     if level:
# LEGACY:         query_builder = query_builder.filter(Unit.level == level)
# LEGACY:
# LEGACY:     offset = (page - 1) * limit
# LEGACY:     videos = query_builder.order_by(desc(Video.created_at)).offset(offset).limit(limit).all()
# LEGACY:
# LEGACY:     result = []
# LEGACY:     for video in videos:
# LEGACY:         result.append(VideoListResponse(
# LEGACY:             id=video.id,
# LEGACY:             title=video.title,
# LEGACY:             unit_id=video.unit_id,
# LEGACY:             unit_title=video.unit.title,
# LEGACY:             source_type=video.source_type,
# LEGACY:             duration_sec=video.duration_sec,
# LEGACY:             status=video.status,
# LEGACY:             publish_at=video.publish_at,
# LEGACY:             thumbnail_path=video.thumbnail_path,
# LEGACY:             is_visible_to_students=video.is_visible_to_students,
# LEGACY:             order_index=video.order_index or 0,
# LEGACY:             created_at=video.created_at,
# LEGACY:             updated_at=video.updated_at
# LEGACY:         ))
# LEGACY:
# LEGACY:     return result


# ── LEGACY: POST /admin/videos ────────────────────────────────────────────────
# Replaced by: creating a video_embed block in the segment editor
# LEGACY: @router.post("/videos", response_model=VideoResponse)
# LEGACY: async def create_video(
# LEGACY:     video_data: VideoCreate,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db),
# LEGACY: ):
# LEGACY:     """Create a new video in admin scope."""
# LEGACY:     unit = db.query(Unit).filter(Unit.id == video_data.unit_id).first()
# LEGACY:     if not unit:
# LEGACY:         raise HTTPException(status_code=404, detail="Unit not found")
# LEGACY:
# LEGACY:     if video_data.source_type == VideoSourceType.URL:
# LEGACY:         if not video_data.external_url:
# LEGACY:             raise HTTPException(status_code=400, detail="External URL is required for URL source type")
# LEGACY:         if not (validate_youtube_url(video_data.external_url) or validate_vimeo_url(video_data.external_url)):
# LEGACY:             raise HTTPException(status_code=400, detail="Invalid YouTube or Vimeo URL")
# LEGACY:
# LEGACY:     base_slug = video_data.title.lower().replace(" ", "-")
# LEGACY:     base_slug = re.sub(r"[^\w\-а-яё]", "", base_slug, flags=re.IGNORECASE)
# LEGACY:     slug = base_slug
# LEGACY:
# LEGACY:     counter = 1
# LEGACY:     while db.query(Video).filter(Video.slug == slug).first():
# LEGACY:         slug = f"{base_slug}-{counter}"
# LEGACY:         counter += 1
# LEGACY:         if counter > 1000:
# LEGACY:             slug = f"{base_slug}-{uuid.uuid4().hex[:8]}"
# LEGACY:             break
# LEGACY:
# LEGACY:     video = Video(
# LEGACY:         **video_data.dict(),
# LEGACY:         created_by=current_user.id,
# LEGACY:         slug=slug,
# LEGACY:     )
# LEGACY:     try:
# LEGACY:         db.add(video)
# LEGACY:         db.commit()
# LEGACY:         db.refresh(video)
# LEGACY:     except Exception as e:
# LEGACY:         db.rollback()
# LEGACY:         if "unique" in str(e).lower() or "duplicate" in str(e).lower() or "slug" in str(e).lower():
# LEGACY:             slug = f"{base_slug}-{uuid.uuid4().hex[:8]}"
# LEGACY:             video.slug = slug
# LEGACY:             db.add(video)
# LEGACY:             db.commit()
# LEGACY:             db.refresh(video)
# LEGACY:         else:
# LEGACY:             raise HTTPException(status_code=500, detail=f"Error creating video: {str(e)}")
# LEGACY:
# LEGACY:     if not video.thumbnail_path and unit.level:
# LEGACY:         try:
# LEGACY:             from app.utils.thumbnail_generator import generate_default_thumbnail, get_thumbnail_path
# LEGACY:
# LEGACY:             thumbnail_path = get_thumbnail_path(video.id, unit.level)
# LEGACY:             uploads_path = get_uploads_path()
# LEGACY:             full_path = os.path.join(uploads_path, thumbnail_path)
# LEGACY:             generate_default_thumbnail(unit.level, full_path, title=video.title)
# LEGACY:             video.thumbnail_path = thumbnail_path
# LEGACY:             db.commit()
# LEGACY:             db.refresh(video)
# LEGACY:         except Exception:
# LEGACY:             pass
# LEGACY:
# LEGACY:     return video


# ── LEGACY: GET /admin/videos/{video_id} ──────────────────────────────────────
# Replaced by: reading the video_embed block from Segment.media_blocks
# LEGACY: @router.get("/videos/{video_id}", response_model=VideoResponse)
# LEGACY: async def get_video(
# LEGACY:     video_id: int,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db),
# LEGACY: ):
# LEGACY:     """Get video details in admin scope."""
# LEGACY:     video = db.query(Video).filter(
# LEGACY:         Video.id == video_id,
# LEGACY:         Video.created_by == current_user.id,
# LEGACY:     ).first()
# LEGACY:     if not video:
# LEGACY:         raise HTTPException(status_code=404, detail="Video not found")
# LEGACY:     return video


# ── LEGACY: PUT /admin/videos/{video_id} ──────────────────────────────────────
# Replaced by: editing the video_embed block in the segment editor
# LEGACY: @router.put("/videos/{video_id}", response_model=VideoResponse)
# LEGACY: async def update_video(
# LEGACY:     video_id: int,
# LEGACY:     video_data: VideoUpdate,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db),
# LEGACY: ):
# LEGACY:     """Update video in admin scope."""
# LEGACY:     video = db.query(Video).filter(
# LEGACY:         Video.id == video_id,
# LEGACY:         Video.created_by == current_user.id,
# LEGACY:     ).first()
# LEGACY:     if not video:
# LEGACY:         raise HTTPException(status_code=404, detail="Video not found")
# LEGACY:
# LEGACY:     if video_data.external_url:
# LEGACY:         if not (validate_youtube_url(video_data.external_url) or validate_vimeo_url(video_data.external_url)):
# LEGACY:             raise HTTPException(status_code=400, detail="Invalid YouTube or Vimeo URL")
# LEGACY:
# LEGACY:     update_data = video_data.dict(exclude_unset=True)
# LEGACY:     for field, value in update_data.items():
# LEGACY:         setattr(video, field, value)
# LEGACY:
# LEGACY:     video.updated_by = current_user.id
# LEGACY:     video.updated_at = datetime.utcnow()
# LEGACY:     db.commit()
# LEGACY:     db.refresh(video)
# LEGACY:     return video


# ── LEGACY: DELETE /admin/videos/{video_id} ───────────────────────────────────
# Replaced by: removing the video_embed block from Segment.media_blocks
# LEGACY: @router.delete("/videos/{video_id}")
# LEGACY: async def delete_video(
# LEGACY:     video_id: int,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db),
# LEGACY: ):
# LEGACY:     """Delete video in admin scope."""
# LEGACY:     video = db.query(Video).filter(
# LEGACY:         Video.id == video_id,
# LEGACY:         Video.created_by == current_user.id,
# LEGACY:     ).first()
# LEGACY:     if not video:
# LEGACY:         raise HTTPException(status_code=404, detail="Video not found")
# LEGACY:
# LEGACY:     db.delete(video)
# LEGACY:     db.commit()
# LEGACY:     return {"message": "Video deleted successfully"}
