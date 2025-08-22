from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_, desc, asc
from typing import List, Optional
import os
import uuid
import json
import re
import requests
from datetime import datetime, timedelta
import mimetypes

from app.core.database import get_db
from app.core.auth import get_current_user, get_current_teacher
from app.models.user import User
from app.models.video import Video, VideoSourceType, VideoStatus
from app.models.unit import Unit
from app.schemas.video import (
    VideoResponse, VideoCreate, VideoUpdate, VideoListResponse,
    VideoUploadInit, VideoUploadPart, VideoUploadComplete,
    OEmbedResponse, VideoBulkAction
)

router = APIRouter()

# In-memory storage for upload sessions (in production, use Redis)
upload_sessions = {}

def validate_youtube_url(url: str) -> bool:
    """Validate YouTube URL format"""
    youtube_patterns = [
        r'(?:https?://)?(?:www\.)?youtube\.com/watch\?v=([a-zA-Z0-9_-]+)',
        r'(?:https?://)?(?:www\.)?youtu\.be/([a-zA-Z0-9_-]+)',
        r'(?:https?://)?(?:www\.)?youtube\.com/embed/([a-zA-Z0-9_-]+)'
    ]
    for pattern in youtube_patterns:
        if re.match(pattern, url):
            return True
    return False

def validate_vimeo_url(url: str) -> bool:
    """Validate Vimeo URL format"""
    vimeo_patterns = [
        r'(?:https?://)?(?:www\.)?vimeo\.com/(\d+)',
        r'(?:https?://)?(?:www\.)?vimeo\.com/embed/(\d+)'
    ]
    for pattern in vimeo_patterns:
        if re.match(pattern, url):
            return True
    return False

def get_video_id_from_url(url: str) -> Optional[str]:
    """Extract video ID from YouTube or Vimeo URL"""
    # YouTube
    youtube_match = re.search(r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([a-zA-Z0-9_-]+)', url)
    if youtube_match:
        return youtube_match.group(1)
    
    # Vimeo
    vimeo_match = re.search(r'vimeo\.com/(\d+)', url)
    if vimeo_match:
        return vimeo_match.group(1)
    
    return None

async def fetch_oembed_data(url: str) -> Optional[OEmbedResponse]:
    """Fetch oEmbed data from YouTube or Vimeo"""
    try:
        video_id = get_video_id_from_url(url)
        if not video_id:
            return None
        
        if 'youtube' in url or 'youtu.be' in url:
            # YouTube oEmbed
            oembed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
            response = requests.get(oembed_url, timeout=10)
            if response.status_code == 200:
                data = response.json()
                return OEmbedResponse(
                    title=data.get('title', ''),
                    duration=None,  # YouTube oEmbed doesn't provide duration
                    thumbnail_url=data.get('thumbnail_url', ''),
                    provider_name='YouTube',
                    provider_url='https://www.youtube.com'
                )
        
        elif 'vimeo' in url:
            # Vimeo oEmbed
            oembed_url = f"https://vimeo.com/api/oembed.json?url=https://vimeo.com/{video_id}"
            response = requests.get(oembed_url, timeout=10)
            if response.status_code == 200:
                data = response.json()
                return OEmbedResponse(
                    title=data.get('title', ''),
                    duration=data.get('duration'),
                    thumbnail_url=data.get('thumbnail_url', ''),
                    provider_name='Vimeo',
                    provider_url='https://vimeo.com'
                )
    
    except Exception as e:
        print(f"Error fetching oEmbed data: {e}")
        return None
    
    return None

@router.get("/admin/videos", response_model=List[VideoListResponse])
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
    """Get paginated list of videos for admin panel"""
    
    # Build query
    query_builder = db.query(Video).join(Unit).options(
        joinedload(Video.unit)
    )
    
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
            created_at=video.created_at,
            updated_at=video.updated_at
        ))
    
    return result

@router.post("/admin/videos", response_model=VideoResponse)
async def create_video(
    video_data: VideoCreate,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Create a new video"""
    
    # Validate unit exists
    unit = db.query(Unit).filter(Unit.id == video_data.unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    # Validate external URL if provided
    if video_data.source_type == VideoSourceType.URL:
        if not video_data.external_url:
            raise HTTPException(status_code=400, detail="External URL is required for URL source type")
        
        if not (validate_youtube_url(video_data.external_url) or validate_vimeo_url(video_data.external_url)):
            raise HTTPException(status_code=400, detail="Invalid YouTube or Vimeo URL")
    
    # Create video
    video = Video(
        **video_data.dict(),
        created_by=current_user.id,
        slug=video_data.title.lower().replace(' ', '-')  # Simple slug generation
    )
    
    db.add(video)
    db.commit()
    db.refresh(video)
    
    return video

@router.get("/admin/videos/{video_id}", response_model=VideoResponse)
async def get_video(
    video_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Get video details"""
    
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    return video

@router.put("/admin/videos/{video_id}", response_model=VideoResponse)
async def update_video(
    video_id: int,
    video_data: VideoUpdate,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Update video"""
    
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    # Validate external URL if provided
    if video_data.external_url:
        if not (validate_youtube_url(video_data.external_url) or validate_vimeo_url(video_data.external_url)):
            raise HTTPException(status_code=400, detail="Invalid YouTube or Vimeo URL")
    
    # Update fields
    update_data = video_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(video, field, value)
    
    video.updated_by = current_user.id
    video.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(video)
    
    return video

@router.delete("/admin/videos/{video_id}")
async def delete_video(
    video_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Delete video"""
    
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    db.delete(video)
    db.commit()
    
    return {"message": "Video deleted successfully"}

@router.post("/admin/videos/bulk-action")
async def bulk_action_videos(
    action_data: VideoBulkAction,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Perform bulk actions on videos"""
    
    videos = db.query(Video).filter(Video.id.in_(action_data.video_ids)).all()
    if not videos:
        raise HTTPException(status_code=404, detail="No videos found")
    
    updated_count = 0
    
    for video in videos:
        if action_data.action == "publish":
            video.status = VideoStatus.PUBLISHED
            video.publish_at = datetime.utcnow()
        elif action_data.action == "unpublish":
            video.status = VideoStatus.DRAFT
            video.publish_at = None
        elif action_data.action == "archive":
            video.status = VideoStatus.ARCHIVED
        elif action_data.action == "delete":
            db.delete(video)
            continue
        
        video.updated_by = current_user.id
        video.updated_at = datetime.utcnow()
        updated_count += 1
    
    db.commit()
    
    return {
        "message": f"Bulk action '{action_data.action}' completed",
        "updated_count": updated_count,
        "deleted_count": len(action_data.video_ids) - updated_count if action_data.action == "delete" else 0
    }

@router.post("/admin/videos/resolve-oembed", response_model=OEmbedResponse)
async def resolve_oembed(
    url: str = Form(...),
    current_user: User = Depends(get_current_teacher)
):
    """Resolve oEmbed data from YouTube or Vimeo URL"""
    
    if not (validate_youtube_url(url) or validate_vimeo_url(url)):
        raise HTTPException(status_code=400, detail="Invalid YouTube or Vimeo URL")
    
    oembed_data = await fetch_oembed_data(url)
    if not oembed_data:
        raise HTTPException(status_code=400, detail="Could not fetch video metadata")
    
    return oembed_data

@router.post("/admin/uploads/init")
async def init_upload(
    upload_data: VideoUploadInit,
    current_user: User = Depends(get_current_teacher)
):
    """Initialize file upload session"""
    
    # Validate file type
    if not upload_data.content_type.startswith('video/'):
        raise HTTPException(status_code=400, detail="Only video files are allowed")
    
    # Generate upload session
    upload_id = str(uuid.uuid4())
    upload_sessions[upload_id] = {
        "filename": upload_data.filename,
        "content_type": upload_data.content_type,
        "size": upload_data.size,
        "parts": {},
        "created_at": datetime.utcnow(),
        "user_id": current_user.id
    }
    
    return {
        "upload_id": upload_id,
        "part_size": 5 * 1024 * 1024,  # 5MB chunks
        "upload_url": f"/api/v1/admin/uploads/{upload_id}/part"
    }

@router.put("/admin/uploads/{upload_id}/part/{part_number}")
async def upload_part(
    upload_id: str,
    part_number: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_teacher)
):
    """Upload a file part"""
    
    if upload_id not in upload_sessions:
        raise HTTPException(status_code=404, detail="Upload session not found")
    
    session = upload_sessions[upload_id]
    if session["user_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Store part data (in production, save to temporary storage)
    content = await file.read()
    session["parts"][part_number] = content
    
    return {"message": f"Part {part_number} uploaded successfully"}

@router.post("/admin/uploads/{upload_id}/complete")
async def complete_upload(
    upload_id: str,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Complete file upload and process video"""
    
    if upload_id not in upload_sessions:
        raise HTTPException(status_code=404, detail="Upload session not found")
    
    session = upload_sessions[upload_id]
    if session["user_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Combine parts (in production, this would be done on the storage service)
    # For now, we'll just simulate the process
    
    # Generate file path
    filename = f"videos/{current_user.id}/{upload_id}_{session['filename']}"
    
    # Clean up session
    del upload_sessions[upload_id]
    
    return {
        "file_path": filename,
        "duration": None,  # Would be extracted from video file
        "thumbnail": None  # Would be generated from video file
    }

# Keep existing endpoints for backward compatibility
@router.get("/units/{unit_id}/videos", response_model=List[VideoResponse])
def get_unit_videos(
    unit_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    videos = db.query(Video).filter(Video.unit_id == unit_id).all()
    return videos
