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
from app.core.enrollment_guard import check_unit_access
from app.models.user import User
from app.models.video import Video, VideoSourceType, VideoStatus
from app.models.video_progress import VideoProgress
from app.models.unit import Unit
from app.schemas.video import (
    VideoResponse, VideoCreate, VideoUpdate, VideoListResponse,
    VideoUploadInit, VideoUploadPart, VideoUploadComplete,
    OEmbedResponse, VideoBulkAction
)

router = APIRouter()

# In-memory storage for upload sessions (in production, use Redis)
upload_sessions = {}

def get_uploads_path():
    """Get the uploads directory path - same logic as main.py"""
    # __file__ is backend/app/api/v1/endpoints/videos.py
    # Go up 5 levels: endpoints -> v1 -> api -> app -> backend
    current_file = os.path.abspath(__file__)
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(current_file)))))
    
    # Check if we're in Docker
    is_docker = (os.name != 'nt' and
                 os.path.exists("/app") and 
                 os.getcwd() == "/app" and 
                 backend_dir == "/app")
    
    if is_docker:
        return "/app/uploads"
    else:
        # Local development - uploads is inside backend directory
        return os.path.join(backend_dir, "uploads")

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

@router.post("/admin/videos/{video_id}/thumbnail")
async def upload_thumbnail(
    video_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Upload a thumbnail for a video - only if created by current teacher"""
    
    video = db.query(Video).filter(
        Video.id == video_id,
        Video.created_by == current_user.id
    ).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    # Validate file type
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    # Get uploads path using helper function
    uploads_path = get_uploads_path()
    upload_dir = os.path.join(uploads_path, "thumbnails")
    os.makedirs(upload_dir, exist_ok=True)
    
    # Generate filename
    file_ext = os.path.splitext(file.filename or '')[1] or '.jpg'
    filename = f"video_{video_id}_{uuid.uuid4().hex[:8]}{file_ext}"
    file_path = os.path.join(upload_dir, filename)
    
    # Save file
    try:
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Update video thumbnail path
        video.thumbnail_path = f"thumbnails/{filename}"
        video.updated_by = current_user.id
        video.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(video)
        
        return {
            "message": "Thumbnail uploaded successfully",
            "thumbnail_path": video.thumbnail_path
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uploading thumbnail: {str(e)}")

@router.post("/admin/videos/upload")
async def upload_video_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_teacher)
):
    """Upload a video file directly"""
    
    # Allowed video MIME types
    allowed_mime_types = [
        'video/mp4',
        'video/webm',
        'video/quicktime',  # mov
        'video/x-msvideo',  # avi
        'video/x-matroska',  # mkv
        'video/ogg',
        'video/x-flv',
        'video/3gpp',
        'video/x-ms-wmv'
    ]
    
    # Allowed file extensions
    allowed_extensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.ogv', '.flv', '.3gp', '.wmv']
    
    # Validate file type
    if not file.content_type:
        # Try to determine from filename
        if file.filename:
            file_ext = os.path.splitext(file.filename)[1].lower()
            if file_ext not in allowed_extensions:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Invalid file type. Allowed formats: {', '.join(allowed_extensions)}"
                )
        else:
            raise HTTPException(status_code=400, detail="File type could not be determined")
    elif file.content_type not in allowed_mime_types:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid file type. Allowed formats: MP4, WebM, MOV, AVI, MKV, OGV, FLV, 3GP, WMV"
        )
    
    # Get uploads path using helper function
    uploads_path = get_uploads_path()
    videos_dir = os.path.join(uploads_path, "videos", str(current_user.id))
    os.makedirs(videos_dir, exist_ok=True)
    
    # Generate filename
    file_ext = os.path.splitext(file.filename or 'video.mp4')[1] or '.mp4'
    filename = f"{uuid.uuid4().hex[:16]}{file_ext}"
    file_path = os.path.join(videos_dir, filename)
    
    # Save file
    try:
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Return relative path (relative to uploads directory)
        relative_path = f"videos/{current_user.id}/{filename}"
        
        return {
            "message": "Video uploaded successfully",
            "file_path": relative_path,
            "filename": filename,
            "size": len(content)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uploading video: {str(e)}")

@router.post("/admin/videos/{video_id}/generate-thumbnail")
async def generate_thumbnail(
    video_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Generate a default thumbnail for a video - only if created by current teacher"""
    
    video = db.query(Video).join(Unit).filter(
        Video.id == video_id,
        Video.created_by == current_user.id
    ).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    if not video.unit or not video.unit.level:
        raise HTTPException(status_code=400, detail="Video must be associated with a unit that has a level")
    
    try:
        from app.utils.thumbnail_generator import generate_default_thumbnail, get_thumbnail_path
        thumbnail_path = get_thumbnail_path(video.id, video.unit.level)
        # Use the same get_uploads_path helper to ensure consistency
        uploads_path = get_uploads_path()
        full_path = os.path.join(uploads_path, thumbnail_path)
        generate_default_thumbnail(video.unit.level, full_path, title=video.title)
        
        video.thumbnail_path = thumbnail_path
        video.updated_by = current_user.id
        video.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(video)
        
        return {
            "message": "Thumbnail generated successfully",
            "thumbnail_path": video.thumbnail_path
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating thumbnail: {str(e)}")

@router.delete("/admin/videos/{video_id}")
async def delete_video(
    video_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Delete video - only if created by current teacher"""
    
    video = db.query(Video).filter(
        Video.id == video_id,
        Video.created_by == current_user.id
    ).first()
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

# Student endpoints with enrollment authorization
@router.get("/units/{unit_id}/videos", response_model=List[VideoResponse])
def get_unit_videos(
    unit_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get videos for a unit - requires enrollment if unit belongs to a course"""
    # Check enrollment authorization
    check_unit_access(db, current_user, unit_id)
    
    videos = db.query(Video).filter(
        Video.unit_id == unit_id,
        Video.is_visible_to_students == True,
        Video.status == VideoStatus.PUBLISHED
    ).all()
    return videos

@router.post("/{video_id}/progress")
async def update_video_progress(
    video_id: int,
    last_position_sec: float = Form(0.0),
    watched_percentage: float = Form(0.0),
    completed: bool = Form(False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update video watch progress for a student"""
    # Check if video exists and is accessible
    video = db.query(Video).filter(
        Video.id == video_id,
        Video.is_visible_to_students == True,
        Video.status == VideoStatus.PUBLISHED
    ).first()
    
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    # Check enrollment if video belongs to a unit in a course
    if video.unit_id:
        check_unit_access(db, current_user, video.unit_id)
    
    # Get or create video progress
    video_progress = db.query(VideoProgress).filter(
        VideoProgress.user_id == current_user.id,
        VideoProgress.video_id == video_id
    ).first()
    
    if not video_progress:
        # For new progress, watch_time_sec is the same as last_position_sec initially
        video_progress = VideoProgress(
            user_id=current_user.id,
            video_id=video_id,
            last_position_sec=last_position_sec,
            watched_percentage=watched_percentage,
            progress_percent=watched_percentage,  # Set to same value as watched_percentage
            watch_time_sec=last_position_sec,  # Set initial watch time
            completed=completed,
            is_completed=completed  # Set to same value as completed
        )
        if completed:
            video_progress.completed_at = datetime.utcnow()
        db.add(video_progress)
    else:
        # Calculate incremental watch time (difference from last position)
        # If user seeks backward, don't add negative time
        time_diff = max(0, last_position_sec - video_progress.last_position_sec)
        video_progress.watch_time_sec += time_diff
        
        video_progress.last_position_sec = last_position_sec
        video_progress.watched_percentage = watched_percentage
        video_progress.progress_percent = watched_percentage  # Keep in sync with watched_percentage
        video_progress.completed = completed
        video_progress.is_completed = completed  # Keep in sync with completed
        if completed and not video_progress.completed_at:
            video_progress.completed_at = datetime.utcnow()
        elif not completed:
            video_progress.completed_at = None
    
    db.commit()
    db.refresh(video_progress)
    
    return {
        "video_id": video_id,
        "last_position_sec": video_progress.last_position_sec,
        "watched_percentage": video_progress.watched_percentage,
        "completed": video_progress.completed,
        "completed_at": video_progress.completed_at.isoformat() if video_progress.completed_at else None
    }

# Add these endpoints to your videos.py file

from pydantic import BaseModel
from datetime import datetime

# Add this schema class
class VideoProgressUpdate(BaseModel):
    watched_percentage: float
    last_position_sec: float
    completed: bool = False

class VideoProgressResponse(BaseModel):
    video_id: int
    watched_percentage: float
    last_position_sec: float
    completed: bool
    last_watched_at: datetime
    
    class Config:
        from_attributes = True

# Add these endpoints to your router

@router.get("/{video_id}/progress")
async def get_video_progress_alt(
    video_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's progress on a video"""
    from app.models.video_progress import VideoProgress
    
    # Check if video exists and user has access
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    # Check enrollment if video is in a unit that's part of a course
    if video.unit_id:
        check_unit_access(db, current_user, video.unit_id)
    
    # Get progress record
    progress = db.query(VideoProgress).filter(
        VideoProgress.user_id == current_user.id,
        VideoProgress.video_id == video_id
    ).first()
    
    if not progress:
        return {
            "video_id": video_id,
            "last_position_sec": 0.0,
            "watched_percentage": 0.0,
            "completed": False,
            "completed_at": None
        }
    
    return {
        "video_id": video_id,
        "last_position_sec": progress.last_position_sec,
        "watched_percentage": progress.watched_percentage,
        "completed": progress.completed,
        "completed_at": progress.completed_at.isoformat() if progress.completed_at else None
    }

# Duplicate endpoint removed - using the Form-based one above

@router.delete("/{video_id}/progress")
async def reset_video_progress(
    video_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Reset user's progress on a video"""
    from app.models.video_progress import VideoProgress
    
    progress = db.query(VideoProgress).filter(
        VideoProgress.user_id == current_user.id,
        VideoProgress.video_id == video_id
    ).first()
    
    if progress:
        db.delete(progress)
        db.commit()
    
    return {"message": "Progress reset successfully"}

@router.get("/static/thumbnails/{filename}")
async def get_thumbnail(
    filename: str
):
    """Serve thumbnail files - no auth required for static assets"""
    from fastapi.responses import FileResponse
    import os
    
    # Get uploads path using helper function
    uploads_path = get_uploads_path()
    
    file_path = os.path.join(uploads_path, "thumbnails", filename)
    
    print(f"[DEBUG] Thumbnail request: filename={filename}")
    print(f"[DEBUG] Uploads path: {uploads_path}")
    print(f"[DEBUG] File path: {file_path}")
    print(f"[DEBUG] File exists: {os.path.exists(file_path)}")
    
    if os.path.exists(file_path):
        # Detect media type based on file extension
        if filename.lower().endswith('.jpg') or filename.lower().endswith('.jpeg'):
            media_type = "image/jpeg"
        elif filename.lower().endswith('.png'):
            media_type = "image/png"
        else:
            media_type = "image/jpeg"  # Default
        return FileResponse(file_path, media_type=media_type)
    else:
        # List files in thumbnails directory for debugging
        thumbnails_dir = os.path.join(uploads_path, "thumbnails")
        if os.path.exists(thumbnails_dir):
            files = os.listdir(thumbnails_dir)
            print(f"[DEBUG] Files in thumbnails directory: {files}")
        raise HTTPException(status_code=404, detail=f"Thumbnail not found: {file_path}")

@router.get("/{video_id}/{filename}")
async def serve_video_file(
    video_id: int,
    filename: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Serve video file by video_id and filename - handles direct file access like /videos/1/file.mp4"""
    from fastapi.responses import FileResponse
    import os
    
    # Only match if filename has a video extension (to avoid conflicts with other routes)
    video_extensions = ['.mp4', '.webm', '.ogg', '.ogv', '.mov', '.avi', '.mkv', '.flv', '.3gp', '.wmv']
    if not any(filename.lower().endswith(ext) for ext in video_extensions):
        raise HTTPException(status_code=404, detail="Not a video file")
    
    # Get video from database
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    # Check if video is accessible
    if not video.is_visible_to_students or video.status != VideoStatus.PUBLISHED:
        raise HTTPException(status_code=403, detail="Video not accessible")
    
    # Check enrollment if video belongs to a unit in a course
    if video.unit_id:
        check_unit_access(db, current_user, video.unit_id)
    
    # Only serve file-based videos
    if video.source_type != VideoSourceType.FILE or not video.file_path:
        raise HTTPException(status_code=400, detail="Video is not a file-based video")
    
    # Get uploads path using helper function
    uploads_path = get_uploads_path()
    
    # Try multiple possible file locations
    possible_paths = [
        os.path.join(uploads_path, video.file_path),  # Full path from database
        os.path.join(uploads_path, "videos", str(video.id), filename),  # videos/{id}/{filename}
        os.path.join(uploads_path, "videos", filename),  # videos/{filename}
    ]
    
    file_path = None
    for path in possible_paths:
        if os.path.exists(path):
            file_path = path
            break
    
    if not file_path:
        raise HTTPException(
            status_code=404, 
            detail=f"Video file not found. Tried: {', '.join(possible_paths)}"
        )
    
    # Determine content type
    ext = os.path.splitext(file_path)[1].lower()
    content_type_map = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.ogg': 'video/ogg',
        '.ogv': 'video/ogg',
        '.mov': 'video/quicktime',
        '.avi': 'video/x-msvideo',
        '.mkv': 'video/x-matroska',
        '.flv': 'video/x-flv',
        '.3gp': 'video/3gpp',
        '.wmv': 'video/x-ms-wmv'
    }
    content_type = content_type_map.get(ext, 'video/mp4')
    
    return FileResponse(file_path, media_type=content_type, headers={
        "Accept-Ranges": "bytes",
    })

@router.get("/stream/{video_id}")
async def stream_video(
    video_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Stream video file with range request support for proper seeking"""
    from fastapi.responses import StreamingResponse
    from fastapi import Request
    import os
    
    # Get video from database
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    # Check if video is accessible
    if not video.is_visible_to_students or video.status != VideoStatus.PUBLISHED:
        raise HTTPException(status_code=403, detail="Video not accessible")
    
    # Check enrollment if video belongs to a unit in a course
    if video.unit_id:
        check_unit_access(db, current_user, video.unit_id)
    
    # Only stream file-based videos
    if video.source_type != VideoSourceType.FILE or not video.file_path:
        raise HTTPException(status_code=400, detail="Video is not a file-based video")
    
    # Get uploads path using helper function
    uploads_path = get_uploads_path()
    
    file_path = os.path.join(uploads_path, video.file_path)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"Video file not found: {file_path}")
    
    # Determine content type
    ext = os.path.splitext(file_path)[1].lower()
    content_type_map = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.ogg': 'video/ogg',
        '.ogv': 'video/ogg',
        '.mov': 'video/quicktime',
        '.avi': 'video/x-msvideo',
        '.mkv': 'video/x-matroska',
        '.flv': 'video/x-flv',
        '.3gp': 'video/3gpp',
        '.wmv': 'video/x-ms-wmv'
    }
    content_type = content_type_map.get(ext, 'video/mp4')
    
    # Support range requests for video seeking
    file_size = os.path.getsize(file_path)
    
    def generate():
        with open(file_path, "rb") as video_file:
            yield from video_file
    
    return StreamingResponse(
        generate(),
        media_type=content_type,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
        }
    )
