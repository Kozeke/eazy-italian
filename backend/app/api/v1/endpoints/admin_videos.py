from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_, desc
from typing import List, Optional

from app.core.database import get_db
from app.core.auth import get_current_teacher
from app.models.user import User
from app.models.video import Video, VideoSourceType, VideoStatus
from app.models.unit import Unit
from app.schemas.video import VideoListResponse

router = APIRouter()

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
