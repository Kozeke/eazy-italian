"""
LEGACY FILE — videos.py (student & admin video router)

Architecture change: Video / VideoProgress are replaced by video_embed blocks
on the Segment model.  Static files are now served via file_storage.

Old model:  Course → Unit → Video (separate ORM model)
            VideoProgress (per-user watch tracking table)
New model:  Course → Unit → Segment → media_blocks (video_embed blocks)
            Segment-level completion tracked in UnitHomeworkSubmission

Replaced by:
  - Video content:     video_embed exercise block on Segment
  - Video progress:    UnitHomeworkSubmission / segment completion state
  - Static thumbnails: file_storage service (not served from this router)

This file is fully commented out and kept for reference during migration.
Do NOT re-enable these routes without migrating callers to the new segment API.
"""

# LEGACY: from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query
# LEGACY: from fastapi.responses import StreamingResponse
# LEGACY: from sqlalchemy.orm import Session, joinedload
# LEGACY: from sqlalchemy import and_, or_, desc, asc
# LEGACY: from typing import List, Optional
# LEGACY: import os
# LEGACY: import uuid
# LEGACY: import json
# LEGACY: import re
# LEGACY: import requests
# LEGACY: from datetime import datetime, timedelta
# LEGACY: import mimetypes

# LEGACY: from app.core.database import get_db
# LEGACY: from app.core.auth import get_current_user, get_current_teacher
# LEGACY: from app.core.enrollment_guard import check_unit_access
# LEGACY: from app.models.user import User
# LEGACY: from app.models.video import Video, VideoSourceType, VideoStatus
# LEGACY: from app.models.video_progress import VideoProgress
# LEGACY: from app.models.unit import Unit
# LEGACY: from app.schemas.video import (
# LEGACY:     VideoResponse, VideoCreate, VideoUpdate, VideoListResponse,
# LEGACY:     VideoUploadInit, VideoUploadPart, VideoUploadComplete,
# LEGACY:     OEmbedResponse, VideoBulkAction
# LEGACY: )

from fastapi import APIRouter

router = APIRouter()

# LEGACY: # In-memory storage for upload sessions (in production, use Redis)
# LEGACY: upload_sessions = {}

# LEGACY: def get_uploads_path():
# LEGACY:     """Get the uploads directory path — delegates to the canonical resolver."""
# LEGACY:     from app.utils.paths import resolve_uploads_path  # noqa: PLC0415
# LEGACY:     return resolve_uploads_path()

# LEGACY: def validate_youtube_url(url: str) -> bool:
# LEGACY:     """Validate YouTube URL format"""
# LEGACY:     youtube_patterns = [
# LEGACY:         r'(?:https?://)?(?:www\.)?youtube\.com/watch\?v=([a-zA-Z0-9_-]+)',
# LEGACY:         r'(?:https?://)?(?:www\.)?youtu\.be/([a-zA-Z0-9_-]+)',
# LEGACY:         r'(?:https?://)?(?:www\.)?youtube\.com/embed/([a-zA-Z0-9_-]+)'
# LEGACY:     ]
# LEGACY:     for pattern in youtube_patterns:
# LEGACY:         if re.match(pattern, url):
# LEGACY:             return True
# LEGACY:     return False

# LEGACY: def validate_vimeo_url(url: str) -> bool:
# LEGACY:     """Validate Vimeo URL format"""
# LEGACY:     vimeo_patterns = [
# LEGACY:         r'(?:https?://)?(?:www\.)?vimeo\.com/(\d+)',
# LEGACY:         r'(?:https?://)?(?:www\.)?vimeo\.com/embed/(\d+)'
# LEGACY:     ]
# LEGACY:     for pattern in vimeo_patterns:
# LEGACY:         if re.match(pattern, url):
# LEGACY:             return True
# LEGACY:     return False

# LEGACY: def get_video_id_from_url(url: str) -> Optional[str]:
# LEGACY:     """Extract video ID from YouTube or Vimeo URL"""
# LEGACY:     # YouTube
# LEGACY:     youtube_match = re.search(r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([a-zA-Z0-9_-]+)', url)
# LEGACY:     if youtube_match:
# LEGACY:         return youtube_match.group(1)

# LEGACY:     # Vimeo
# LEGACY:     vimeo_match = re.search(r'vimeo\.com/(\d+)', url)
# LEGACY:     if vimeo_match:
# LEGACY:         return vimeo_match.group(1)

# LEGACY:     return None

# LEGACY: async def fetch_oembed_data(url: str) -> Optional[OEmbedResponse]:
# LEGACY:     """Fetch oEmbed data from YouTube or Vimeo"""
# LEGACY:     try:
# LEGACY:         video_id = get_video_id_from_url(url)
# LEGACY:         if not video_id:
# LEGACY:             return None

# LEGACY:         if 'youtube' in url or 'youtu.be' in url:
# LEGACY:             # YouTube oEmbed
# LEGACY:             oembed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
# LEGACY:             response = requests.get(oembed_url, timeout=10)
# LEGACY:             if response.status_code == 200:
# LEGACY:                 data = response.json()
# LEGACY:                 return OEmbedResponse(
# LEGACY:                     title=data.get('title', ''),
# LEGACY:                     duration=None,  # YouTube oEmbed doesn't provide duration
# LEGACY:                     thumbnail_url=data.get('thumbnail_url', ''),
# LEGACY:                     provider_name='YouTube',
# LEGACY:                     provider_url='https://www.youtube.com'
# LEGACY:                 )

# LEGACY:         elif 'vimeo' in url:
# LEGACY:             # Vimeo oEmbed
# LEGACY:             oembed_url = f"https://vimeo.com/api/oembed.json?url=https://vimeo.com/{video_id}"
# LEGACY:             response = requests.get(oembed_url, timeout=10)
# LEGACY:             if response.status_code == 200:
# LEGACY:                 data = response.json()
# LEGACY:                 return OEmbedResponse(
# LEGACY:                     title=data.get('title', ''),
# LEGACY:                     duration=data.get('duration'),
# LEGACY:                     thumbnail_url=data.get('thumbnail_url', ''),
# LEGACY:                     provider_name='Vimeo',
# LEGACY:                     provider_url='https://vimeo.com'
# LEGACY:                 )

# LEGACY:     except Exception as e:
# LEGACY:         print(f"Error fetching oEmbed data: {e}")
# LEGACY:         return None

# LEGACY:     return None

# LEGACY: @router.post("/admin/videos/{video_id}/thumbnail")
# LEGACY: async def upload_thumbnail(
# LEGACY:     video_id: int,
# LEGACY:     file: UploadFile = File(...),
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Upload a thumbnail for a video - only if created by current teacher"""

# LEGACY:     video = db.query(Video).filter(
# LEGACY:         Video.id == video_id,
# LEGACY:         Video.created_by == current_user.id
# LEGACY:     ).first()
# LEGACY:     if not video:
# LEGACY:         raise HTTPException(status_code=404, detail="Video not found")

# LEGACY:     # Validate file type
# LEGACY:     if not file.content_type or not file.content_type.startswith('image/'):
# LEGACY:         raise HTTPException(status_code=400, detail="File must be an image")

# LEGACY:     # Get uploads path using helper function
# LEGACY:     uploads_path = get_uploads_path()
# LEGACY:     upload_dir = os.path.join(uploads_path, "thumbnails")
# LEGACY:     os.makedirs(upload_dir, exist_ok=True)

# LEGACY:     # Generate filename
# LEGACY:     file_ext = os.path.splitext(file.filename or '')[1] or '.jpg'
# LEGACY:     filename = f"video_{video_id}_{uuid.uuid4().hex[:8]}{file_ext}"
# LEGACY:     file_path = os.path.join(upload_dir, filename)

# LEGACY:     # Save file
# LEGACY:     try:
# LEGACY:         with open(file_path, "wb") as buffer:
# LEGACY:             content = await file.read()
# LEGACY:             buffer.write(content)

# LEGACY:         # Update video thumbnail path
# LEGACY:         video.thumbnail_path = f"thumbnails/{filename}"
# LEGACY:         video.updated_by = current_user.id
# LEGACY:         video.updated_at = datetime.utcnow()
# LEGACY:         db.commit()
# LEGACY:         db.refresh(video)

# LEGACY:         return {
# LEGACY:             "message": "Thumbnail uploaded successfully",
# LEGACY:             "thumbnail_path": video.thumbnail_path
# LEGACY:         }
# LEGACY:     except Exception as e:
# LEGACY:         raise HTTPException(status_code=500, detail=f"Error uploading thumbnail: {str(e)}")

# LEGACY: @router.post("/admin/videos/upload")
# LEGACY: async def upload_video_file(
# LEGACY:     file: UploadFile = File(...),
# LEGACY:     current_user: User = Depends(get_current_teacher)
# LEGACY: ):
# LEGACY:     """Upload a video file directly"""

# LEGACY:     # Allowed video MIME types
# LEGACY:     allowed_mime_types = [
# LEGACY:         'video/mp4',
# LEGACY:         'video/webm',
# LEGACY:         'video/quicktime',  # mov
# LEGACY:         'video/x-msvideo',  # avi
# LEGACY:         'video/x-matroska',  # mkv
# LEGACY:         'video/ogg',
# LEGACY:         'video/x-flv',
# LEGACY:         'video/3gpp',
# LEGACY:         'video/x-ms-wmv'
# LEGACY:     ]

# LEGACY:     # Allowed file extensions
# LEGACY:     allowed_extensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.ogv', '.flv', '.3gp', '.wmv']

# LEGACY:     # Validate file type
# LEGACY:     if not file.content_type:
# LEGACY:         # Try to determine from filename
# LEGACY:         if file.filename:
# LEGACY:             file_ext = os.path.splitext(file.filename)[1].lower()
# LEGACY:             if file_ext not in allowed_extensions:
# LEGACY:                 raise HTTPException(
# LEGACY:                     status_code=400, 
# LEGACY:                     detail=f"Invalid file type. Allowed formats: {', '.join(allowed_extensions)}"
# LEGACY:                 )
# LEGACY:         else:
# LEGACY:             raise HTTPException(status_code=400, detail="File type could not be determined")
# LEGACY:     elif file.content_type not in allowed_mime_types:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=400, 
# LEGACY:             detail=f"Invalid file type. Allowed formats: MP4, WebM, MOV, AVI, MKV, OGV, FLV, 3GP, WMV"
# LEGACY:         )

# LEGACY:     # Get uploads path using helper function
# LEGACY:     uploads_path = get_uploads_path()
# LEGACY:     videos_dir = os.path.join(uploads_path, "videos", str(current_user.id))
# LEGACY:     os.makedirs(videos_dir, exist_ok=True)

# LEGACY:     # Generate filename
# LEGACY:     file_ext = os.path.splitext(file.filename or 'video.mp4')[1] or '.mp4'
# LEGACY:     filename = f"{uuid.uuid4().hex[:16]}{file_ext}"
# LEGACY:     file_path = os.path.join(videos_dir, filename)

# LEGACY:     # Save file
# LEGACY:     try:
# LEGACY:         with open(file_path, "wb") as buffer:
# LEGACY:             content = await file.read()
# LEGACY:             buffer.write(content)

# LEGACY:         # Return relative path (relative to uploads directory)
# LEGACY:         relative_path = f"videos/{current_user.id}/{filename}"

# LEGACY:         return {
# LEGACY:             "message": "Video uploaded successfully",
# LEGACY:             "file_path": relative_path,
# LEGACY:             "filename": filename,
# LEGACY:             "size": len(content)
# LEGACY:         }
# LEGACY:     except Exception as e:
# LEGACY:         raise HTTPException(status_code=500, detail=f"Error uploading video: {str(e)}")

# LEGACY: @router.post("/admin/videos/{video_id}/generate-thumbnail")
# LEGACY: async def generate_thumbnail(
# LEGACY:     video_id: int,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Generate a default thumbnail for a video - only if created by current teacher"""

# LEGACY:     video = db.query(Video).join(Unit).filter(
# LEGACY:         Video.id == video_id,
# LEGACY:         Video.created_by == current_user.id
# LEGACY:     ).first()
# LEGACY:     if not video:
# LEGACY:         raise HTTPException(status_code=404, detail="Video not found")

# LEGACY:     if not video.unit or not video.unit.level:
# LEGACY:         raise HTTPException(status_code=400, detail="Video must be associated with a unit that has a level")

# LEGACY:     try:
# LEGACY:         from app.utils.thumbnail_generator import generate_default_thumbnail, get_thumbnail_path
# LEGACY:         thumbnail_path = get_thumbnail_path(video.id, video.unit.level)
# LEGACY:         # Use the same get_uploads_path helper to ensure consistency
# LEGACY:         uploads_path = get_uploads_path()
# LEGACY:         full_path = os.path.join(uploads_path, thumbnail_path)
# LEGACY:         generate_default_thumbnail(video.unit.level, full_path, title=video.title)

# LEGACY:         video.thumbnail_path = thumbnail_path
# LEGACY:         video.updated_by = current_user.id
# LEGACY:         video.updated_at = datetime.utcnow()
# LEGACY:         db.commit()
# LEGACY:         db.refresh(video)

# LEGACY:         return {
# LEGACY:             "message": "Thumbnail generated successfully",
# LEGACY:             "thumbnail_path": video.thumbnail_path
# LEGACY:         }
# LEGACY:     except Exception as e:
# LEGACY:         raise HTTPException(status_code=500, detail=f"Error generating thumbnail: {str(e)}")

# LEGACY: @router.delete("/admin/videos/{video_id}")
# LEGACY: async def delete_video(
# LEGACY:     video_id: int,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Delete video - only if created by current teacher"""

# LEGACY:     video = db.query(Video).filter(
# LEGACY:         Video.id == video_id,
# LEGACY:         Video.created_by == current_user.id
# LEGACY:     ).first()
# LEGACY:     if not video:
# LEGACY:         raise HTTPException(status_code=404, detail="Video not found")

# LEGACY:     db.delete(video)
# LEGACY:     db.commit()

# LEGACY:     return {"message": "Video deleted successfully"}

# LEGACY: @router.post("/admin/videos/bulk-action")
# LEGACY: async def bulk_action_videos(
# LEGACY:     action_data: VideoBulkAction,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Perform bulk actions on videos"""

# LEGACY:     videos = db.query(Video).filter(Video.id.in_(action_data.video_ids)).all()
# LEGACY:     if not videos:
# LEGACY:         raise HTTPException(status_code=404, detail="No videos found")

# LEGACY:     updated_count = 0

# LEGACY:     for video in videos:
# LEGACY:         if action_data.action == "publish":
# LEGACY:             video.status = VideoStatus.PUBLISHED
# LEGACY:             video.publish_at = datetime.utcnow()
# LEGACY:         elif action_data.action == "unpublish":
# LEGACY:             video.status = VideoStatus.DRAFT
# LEGACY:             video.publish_at = None
# LEGACY:         elif action_data.action == "archive":
# LEGACY:             video.status = VideoStatus.ARCHIVED
# LEGACY:         elif action_data.action == "delete":
# LEGACY:             db.delete(video)
# LEGACY:             continue

# LEGACY:         video.updated_by = current_user.id
# LEGACY:         video.updated_at = datetime.utcnow()
# LEGACY:         updated_count += 1

# LEGACY:     db.commit()

# LEGACY:     return {
# LEGACY:         "message": f"Bulk action '{action_data.action}' completed",
# LEGACY:         "updated_count": updated_count,
# LEGACY:         "deleted_count": len(action_data.video_ids) - updated_count if action_data.action == "delete" else 0
# LEGACY:     }

# LEGACY: @router.post("/admin/videos/resolve-oembed", response_model=OEmbedResponse)
# LEGACY: async def resolve_oembed(
# LEGACY:     url: str = Form(...),
# LEGACY:     current_user: User = Depends(get_current_teacher)
# LEGACY: ):
# LEGACY:     """Resolve oEmbed data from YouTube or Vimeo URL"""

# LEGACY:     if not (validate_youtube_url(url) or validate_vimeo_url(url)):
# LEGACY:         raise HTTPException(status_code=400, detail="Invalid YouTube or Vimeo URL")

# LEGACY:     oembed_data = await fetch_oembed_data(url)
# LEGACY:     if not oembed_data:
# LEGACY:         raise HTTPException(status_code=400, detail="Could not fetch video metadata")

# LEGACY:     return oembed_data

# LEGACY: @router.post("/admin/uploads/init")
# LEGACY: async def init_upload(
# LEGACY:     upload_data: VideoUploadInit,
# LEGACY:     current_user: User = Depends(get_current_teacher)
# LEGACY: ):
# LEGACY:     """Initialize file upload session"""

# LEGACY:     # Validate file type
# LEGACY:     if not upload_data.content_type.startswith('video/'):
# LEGACY:         raise HTTPException(status_code=400, detail="Only video files are allowed")

# LEGACY:     # Generate upload session
# LEGACY:     upload_id = str(uuid.uuid4())
# LEGACY:     upload_sessions[upload_id] = {
# LEGACY:         "filename": upload_data.filename,
# LEGACY:         "content_type": upload_data.content_type,
# LEGACY:         "size": upload_data.size,
# LEGACY:         "parts": {},
# LEGACY:         "created_at": datetime.utcnow(),
# LEGACY:         "user_id": current_user.id
# LEGACY:     }

# LEGACY:     return {
# LEGACY:         "upload_id": upload_id,
# LEGACY:         "part_size": 5 * 1024 * 1024,  # 5MB chunks
# LEGACY:         "upload_url": f"/api/v1/admin/uploads/{upload_id}/part"
# LEGACY:     }

# LEGACY: @router.put("/admin/uploads/{upload_id}/part/{part_number}")
# LEGACY: async def upload_part(
# LEGACY:     upload_id: str,
# LEGACY:     part_number: int,
# LEGACY:     file: UploadFile = File(...),
# LEGACY:     current_user: User = Depends(get_current_teacher)
# LEGACY: ):
# LEGACY:     """Upload a file part"""

# LEGACY:     if upload_id not in upload_sessions:
# LEGACY:         raise HTTPException(status_code=404, detail="Upload session not found")

# LEGACY:     session = upload_sessions[upload_id]
# LEGACY:     if session["user_id"] != current_user.id:
# LEGACY:         raise HTTPException(status_code=403, detail="Access denied")

# LEGACY:     # Store part data (in production, save to temporary storage)
# LEGACY:     content = await file.read()
# LEGACY:     session["parts"][part_number] = content

# LEGACY:     return {"message": f"Part {part_number} uploaded successfully"}

# LEGACY: @router.post("/admin/uploads/{upload_id}/complete")
# LEGACY: async def complete_upload(
# LEGACY:     upload_id: str,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Complete file upload and process video"""

# LEGACY:     if upload_id not in upload_sessions:
# LEGACY:         raise HTTPException(status_code=404, detail="Upload session not found")

# LEGACY:     session = upload_sessions[upload_id]
# LEGACY:     if session["user_id"] != current_user.id:
# LEGACY:         raise HTTPException(status_code=403, detail="Access denied")

# LEGACY:     # Combine parts (in production, this would be done on the storage service)
# LEGACY:     # For now, we'll just simulate the process

# LEGACY:     # Generate file path
# LEGACY:     filename = f"videos/{current_user.id}/{upload_id}_{session['filename']}"

# LEGACY:     # Clean up session
# LEGACY:     del upload_sessions[upload_id]

# LEGACY:     return {
# LEGACY:         "file_path": filename,
# LEGACY:         "duration": None,  # Would be extracted from video file
# LEGACY:         "thumbnail": None  # Would be generated from video file
# LEGACY:     }

# LEGACY: # Student endpoints with enrollment authorization
# LEGACY: @router.get("/units/{unit_id}/videos", response_model=List[VideoResponse])
# LEGACY: def get_unit_videos(
# LEGACY:     unit_id: int,
# LEGACY:     current_user: User = Depends(get_current_user),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Get videos for a unit - requires enrollment if unit belongs to a course"""
# LEGACY:     # Check enrollment authorization
# LEGACY:     check_unit_access(db, current_user, unit_id)

# LEGACY:     videos = db.query(Video).filter(
# LEGACY:         Video.unit_id == unit_id,
# LEGACY:         Video.is_visible_to_students == True,
# LEGACY:         Video.status == VideoStatus.PUBLISHED
# LEGACY:     ).all()
# LEGACY:     return videos

# LEGACY: @router.post("/{video_id}/progress")
# LEGACY: async def update_video_progress(
# LEGACY:     video_id: int,
# LEGACY:     last_position_sec: float = Form(0.0),
# LEGACY:     watched_percentage: float = Form(0.0),
# LEGACY:     completed: bool = Form(False),
# LEGACY:     current_user: User = Depends(get_current_user),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Update video watch progress for a student"""
# LEGACY:     # Check if video exists and is accessible
# LEGACY:     video = db.query(Video).filter(
# LEGACY:         Video.id == video_id,
# LEGACY:         Video.is_visible_to_students == True,
# LEGACY:         Video.status == VideoStatus.PUBLISHED
# LEGACY:     ).first()

# LEGACY:     if not video:
# LEGACY:         raise HTTPException(status_code=404, detail="Video not found")

# LEGACY:     # Check enrollment if video belongs to a unit in a course
# LEGACY:     if video.unit_id:
# LEGACY:         check_unit_access(db, current_user, video.unit_id)

# LEGACY:     # Get or create video progress
# LEGACY:     video_progress = db.query(VideoProgress).filter(
# LEGACY:         VideoProgress.user_id == current_user.id,
# LEGACY:         VideoProgress.video_id == video_id
# LEGACY:     ).first()

# LEGACY:     if not video_progress:
# LEGACY:         # For new progress, watch_time_sec is the same as last_position_sec initially
# LEGACY:         video_progress = VideoProgress(
# LEGACY:             user_id=current_user.id,
# LEGACY:             video_id=video_id,
# LEGACY:             last_position_sec=last_position_sec,
# LEGACY:             watched_percentage=watched_percentage,
# LEGACY:             progress_percent=watched_percentage,  # Set to same value as watched_percentage
# LEGACY:             watch_time_sec=last_position_sec,  # Set initial watch time
# LEGACY:             completed=completed,
# LEGACY:             is_completed=completed  # Set to same value as completed
# LEGACY:         )
# LEGACY:         if completed:
# LEGACY:             video_progress.completed_at = datetime.utcnow()
# LEGACY:         db.add(video_progress)
# LEGACY:     else:
# LEGACY:         # Calculate incremental watch time (difference from last position)
# LEGACY:         # If user seeks backward, don't add negative time
# LEGACY:         time_diff = max(0, last_position_sec - video_progress.last_position_sec)
# LEGACY:         video_progress.watch_time_sec += time_diff

# LEGACY:         video_progress.last_position_sec = last_position_sec
# LEGACY:         video_progress.watched_percentage = watched_percentage
# LEGACY:         video_progress.progress_percent = watched_percentage  # Keep in sync with watched_percentage
# LEGACY:         video_progress.completed = completed
# LEGACY:         video_progress.is_completed = completed  # Keep in sync with completed
# LEGACY:         if completed and not video_progress.completed_at:
# LEGACY:             video_progress.completed_at = datetime.utcnow()
# LEGACY:         elif not completed:
# LEGACY:             video_progress.completed_at = None

# LEGACY:     db.commit()
# LEGACY:     db.refresh(video_progress)

# LEGACY:     return {
# LEGACY:         "video_id": video_id,
# LEGACY:         "last_position_sec": video_progress.last_position_sec,
# LEGACY:         "watched_percentage": video_progress.watched_percentage,
# LEGACY:         "completed": video_progress.completed,
# LEGACY:         "completed_at": video_progress.completed_at.isoformat() if video_progress.completed_at else None
# LEGACY:     }

# LEGACY: # Add these endpoints to your videos.py file

# LEGACY: from pydantic import BaseModel
# LEGACY: from datetime import datetime

# LEGACY: # Add this schema class
# LEGACY: class VideoProgressUpdate(BaseModel):
# LEGACY:     watched_percentage: float
# LEGACY:     last_position_sec: float
# LEGACY:     completed: bool = False

# LEGACY: class VideoProgressResponse(BaseModel):
# LEGACY:     video_id: int
# LEGACY:     watched_percentage: float
# LEGACY:     last_position_sec: float
# LEGACY:     completed: bool
# LEGACY:     last_watched_at: datetime

# LEGACY:     class Config:
# LEGACY:         from_attributes = True

# LEGACY: # Add these endpoints to your router

# LEGACY: @router.get("/{video_id}/progress")
# LEGACY: async def get_video_progress_alt(
# LEGACY:     video_id: int,
# LEGACY:     current_user: User = Depends(get_current_user),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Get user's progress on a video"""
# LEGACY:     from app.models.video_progress import VideoProgress

# LEGACY:     # Check if video exists and user has access
# LEGACY:     video = db.query(Video).filter(Video.id == video_id).first()
# LEGACY:     if not video:
# LEGACY:         raise HTTPException(status_code=404, detail="Video not found")

# LEGACY:     # Check enrollment if video is in a unit that's part of a course
# LEGACY:     if video.unit_id:
# LEGACY:         check_unit_access(db, current_user, video.unit_id)

# LEGACY:     # Get progress record
# LEGACY:     progress = db.query(VideoProgress).filter(
# LEGACY:         VideoProgress.user_id == current_user.id,
# LEGACY:         VideoProgress.video_id == video_id
# LEGACY:     ).first()

# LEGACY:     if not progress:
# LEGACY:         return {
# LEGACY:             "video_id": video_id,
# LEGACY:             "last_position_sec": 0.0,
# LEGACY:             "watched_percentage": 0.0,
# LEGACY:             "completed": False,
# LEGACY:             "completed_at": None
# LEGACY:         }

# LEGACY:     return {
# LEGACY:         "video_id": video_id,
# LEGACY:         "last_position_sec": progress.last_position_sec,
# LEGACY:         "watched_percentage": progress.watched_percentage,
# LEGACY:         "completed": progress.completed,
# LEGACY:         "completed_at": progress.completed_at.isoformat() if progress.completed_at else None
# LEGACY:     }

# LEGACY: # Duplicate endpoint removed - using the Form-based one above

# LEGACY: @router.delete("/{video_id}/progress")
# LEGACY: async def reset_video_progress(
# LEGACY:     video_id: int,
# LEGACY:     current_user: User = Depends(get_current_user),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Reset user's progress on a video"""
# LEGACY:     from app.models.video_progress import VideoProgress

# LEGACY:     progress = db.query(VideoProgress).filter(
# LEGACY:         VideoProgress.user_id == current_user.id,
# LEGACY:         VideoProgress.video_id == video_id
# LEGACY:     ).first()

# LEGACY:     if progress:
# LEGACY:         db.delete(progress)
# LEGACY:         db.commit()

# LEGACY:     return {"message": "Progress reset successfully"}

# LEGACY: @router.get("/static/thumbnails/{filename}")
# LEGACY: async def get_thumbnail(
# LEGACY:     filename: str
# LEGACY: ):
# LEGACY:     """Serve thumbnail files - no auth required for static assets"""
# LEGACY:     from fastapi.responses import FileResponse
# LEGACY:     import os

# LEGACY:     # Get uploads path using helper function
# LEGACY:     uploads_path = get_uploads_path()

# LEGACY:     file_path = os.path.join(uploads_path, "thumbnails", filename)

# LEGACY:     print(f"[DEBUG] Thumbnail request: filename={filename}")
# LEGACY:     print(f"[DEBUG] Uploads path: {uploads_path}")
# LEGACY:     print(f"[DEBUG] File path: {file_path}")
# LEGACY:     print(f"[DEBUG] File exists: {os.path.exists(file_path)}")

# LEGACY:     if os.path.exists(file_path):
# LEGACY:         # Detect media type based on file extension
# LEGACY:         if filename.lower().endswith('.jpg') or filename.lower().endswith('.jpeg'):
# LEGACY:             media_type = "image/jpeg"
# LEGACY:         elif filename.lower().endswith('.png'):
# LEGACY:             media_type = "image/png"
# LEGACY:         else:
# LEGACY:             media_type = "image/jpeg"  # Default
# LEGACY:         return FileResponse(file_path, media_type=media_type)
# LEGACY:     else:
# LEGACY:         # List files in thumbnails directory for debugging
# LEGACY:         thumbnails_dir = os.path.join(uploads_path, "thumbnails")
# LEGACY:         if os.path.exists(thumbnails_dir):
# LEGACY:             files = os.listdir(thumbnails_dir)
# LEGACY:             print(f"[DEBUG] Files in thumbnails directory: {files}")
# LEGACY:         raise HTTPException(status_code=404, detail=f"Thumbnail not found: {file_path}")

# LEGACY: @router.get("/{video_id}/{filename}")
# LEGACY: async def serve_video_file(
# LEGACY:     video_id: int,
# LEGACY:     filename: str,
# LEGACY:     current_user: User = Depends(get_current_user),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Serve video file by video_id and filename - handles direct file access like /videos/1/file.mp4"""
# LEGACY:     from fastapi.responses import FileResponse
# LEGACY:     import os

# LEGACY:     # Only match if filename has a video extension (to avoid conflicts with other routes)
# LEGACY:     video_extensions = ['.mp4', '.webm', '.ogg', '.ogv', '.mov', '.avi', '.mkv', '.flv', '.3gp', '.wmv']
# LEGACY:     if not any(filename.lower().endswith(ext) for ext in video_extensions):
# LEGACY:         raise HTTPException(status_code=404, detail="Not a video file")

# LEGACY:     # Get video from database
# LEGACY:     video = db.query(Video).filter(Video.id == video_id).first()
# LEGACY:     if not video:
# LEGACY:         raise HTTPException(status_code=404, detail="Video not found")

# LEGACY:     # Check if video is accessible
# LEGACY:     if not video.is_visible_to_students or video.status != VideoStatus.PUBLISHED:
# LEGACY:         raise HTTPException(status_code=403, detail="Video not accessible")

# LEGACY:     # Check enrollment if video belongs to a unit in a course
# LEGACY:     if video.unit_id:
# LEGACY:         check_unit_access(db, current_user, video.unit_id)

# LEGACY:     # Only serve file-based videos
# LEGACY:     if video.source_type != VideoSourceType.FILE or not video.file_path:
# LEGACY:         raise HTTPException(status_code=400, detail="Video is not a file-based video")

# LEGACY:     # Get uploads path using helper function
# LEGACY:     uploads_path = get_uploads_path()

# LEGACY:     # Try multiple possible file locations
# LEGACY:     possible_paths = [
# LEGACY:         os.path.join(uploads_path, video.file_path),  # Full path from database
# LEGACY:         os.path.join(uploads_path, "videos", str(video.id), filename),  # videos/{id}/{filename}
# LEGACY:         os.path.join(uploads_path, "videos", filename),  # videos/{filename}
# LEGACY:     ]

# LEGACY:     file_path = None
# LEGACY:     for path in possible_paths:
# LEGACY:         if os.path.exists(path):
# LEGACY:             file_path = path
# LEGACY:             break

# LEGACY:     if not file_path:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=404, 
# LEGACY:             detail=f"Video file not found. Tried: {', '.join(possible_paths)}"
# LEGACY:         )

# LEGACY:     # Determine content type
# LEGACY:     ext = os.path.splitext(file_path)[1].lower()
# LEGACY:     content_type_map = {
# LEGACY:         '.mp4': 'video/mp4',
# LEGACY:         '.webm': 'video/webm',
# LEGACY:         '.ogg': 'video/ogg',
# LEGACY:         '.ogv': 'video/ogg',
# LEGACY:         '.mov': 'video/quicktime',
# LEGACY:         '.avi': 'video/x-msvideo',
# LEGACY:         '.mkv': 'video/x-matroska',
# LEGACY:         '.flv': 'video/x-flv',
# LEGACY:         '.3gp': 'video/3gpp',
# LEGACY:         '.wmv': 'video/x-ms-wmv'
# LEGACY:     }
# LEGACY:     content_type = content_type_map.get(ext, 'video/mp4')

# LEGACY:     return FileResponse(file_path, media_type=content_type, headers={
# LEGACY:         "Accept-Ranges": "bytes",
# LEGACY:     })

# LEGACY: @router.get("/stream/{video_id}")
# LEGACY: async def stream_video(
# LEGACY:     video_id: int,
# LEGACY:     current_user: User = Depends(get_current_user),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Stream video file with range request support for proper seeking"""
# LEGACY:     from fastapi.responses import StreamingResponse
# LEGACY:     from fastapi import Request
# LEGACY:     import os

# LEGACY:     # Get video from database
# LEGACY:     video = db.query(Video).filter(Video.id == video_id).first()
# LEGACY:     if not video:
# LEGACY:         raise HTTPException(status_code=404, detail="Video not found")

# LEGACY:     # Check if video is accessible
# LEGACY:     if not video.is_visible_to_students or video.status != VideoStatus.PUBLISHED:
# LEGACY:         raise HTTPException(status_code=403, detail="Video not accessible")

# LEGACY:     # Check enrollment if video belongs to a unit in a course
# LEGACY:     if video.unit_id:
# LEGACY:         check_unit_access(db, current_user, video.unit_id)

# LEGACY:     # Only stream file-based videos
# LEGACY:     if video.source_type != VideoSourceType.FILE or not video.file_path:
# LEGACY:         raise HTTPException(status_code=400, detail="Video is not a file-based video")

# LEGACY:     # Get uploads path using helper function
# LEGACY:     uploads_path = get_uploads_path()

# LEGACY:     file_path = os.path.join(uploads_path, video.file_path)

# LEGACY:     if not os.path.exists(file_path):
# LEGACY:         raise HTTPException(status_code=404, detail=f"Video file not found: {file_path}")

# LEGACY:     # Determine content type
# LEGACY:     ext = os.path.splitext(file_path)[1].lower()
# LEGACY:     content_type_map = {
# LEGACY:         '.mp4': 'video/mp4',
# LEGACY:         '.webm': 'video/webm',
# LEGACY:         '.ogg': 'video/ogg',
# LEGACY:         '.ogv': 'video/ogg',
# LEGACY:         '.mov': 'video/quicktime',
# LEGACY:         '.avi': 'video/x-msvideo',
# LEGACY:         '.mkv': 'video/x-matroska',
# LEGACY:         '.flv': 'video/x-flv',
# LEGACY:         '.3gp': 'video/3gpp',
# LEGACY:         '.wmv': 'video/x-ms-wmv'
# LEGACY:     }
# LEGACY:     content_type = content_type_map.get(ext, 'video/mp4')

# LEGACY:     # Support range requests for video seeking
# LEGACY:     file_size = os.path.getsize(file_path)

# LEGACY:     def generate():
# LEGACY:         with open(file_path, "rb") as video_file:
# LEGACY:             yield from video_file

# LEGACY:     return StreamingResponse(
# LEGACY:         generate(),
# LEGACY:         media_type=content_type,
# LEGACY:         headers={
# LEGACY:             "Accept-Ranges": "bytes",
# LEGACY:             "Content-Length": str(file_size),
# LEGACY:         }
# LEGACY:     )
