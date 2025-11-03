from pydantic import BaseModel, validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from app.models.video import VideoSourceType, VideoStatus

class SubtitleSchema(BaseModel):
    lang: str
    vtt_path: str

class AttachmentSchema(BaseModel):
    name: str
    path: str
    type: str

class VideoBase(BaseModel):
    title: str
    description: Optional[str] = None
    source_type: VideoSourceType
    file_path: Optional[str] = None
    external_url: Optional[str] = None
    duration_sec: Optional[int] = None
    thumbnail_path: Optional[str] = None
    subtitles: Optional[List[SubtitleSchema]] = None
    transcript: Optional[str] = None
    status: VideoStatus = VideoStatus.DRAFT
    publish_at: Optional[datetime] = None
    order_index: int = 0
    attachments: Optional[List[AttachmentSchema]] = None
    is_visible_to_students: bool = True
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None

class VideoCreate(VideoBase):
    unit_id: int

    @validator('external_url')
    def validate_external_url(cls, v, values):
        if values.get('source_type') == VideoSourceType.URL and not v:
            raise ValueError('External URL is required when source type is URL')
        if values.get('source_type') == VideoSourceType.FILE and v:
            raise ValueError('External URL should not be provided when source type is FILE')
        return v

    @validator('file_path')
    def validate_file_path(cls, v, values):
        if values.get('source_type') == VideoSourceType.FILE and not v:
            raise ValueError('File path is required when source type is FILE')
        if values.get('source_type') == VideoSourceType.URL and v:
            raise ValueError('File path should not be provided when source type is URL')
        return v

class VideoUpdate(BaseModel):
    unit_id: Optional[int] = None
    title: Optional[str] = None
    description: Optional[str] = None
    source_type: Optional[VideoSourceType] = None
    file_path: Optional[str] = None
    external_url: Optional[str] = None
    duration_sec: Optional[int] = None
    thumbnail_path: Optional[str] = None
    subtitles: Optional[List[SubtitleSchema]] = None
    transcript: Optional[str] = None
    status: Optional[VideoStatus] = None
    publish_at: Optional[datetime] = None
    order_index: Optional[int] = None
    attachments: Optional[List[AttachmentSchema]] = None
    is_visible_to_students: Optional[bool] = None
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None

class VideoResponse(VideoBase):
    id: int
    unit_id: int
    slug: Optional[str] = None
    created_by: int
    updated_by: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class VideoListResponse(BaseModel):
    id: int
    title: str
    unit_id: int
    unit_title: str
    source_type: VideoSourceType
    duration_sec: Optional[int] = None
    status: VideoStatus
    publish_at: Optional[datetime] = None
    thumbnail_path: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class VideoUploadInit(BaseModel):
    filename: str
    content_type: str
    size: int

class VideoUploadPart(BaseModel):
    upload_id: str
    part_number: int
    data: bytes

class VideoUploadComplete(BaseModel):
    upload_id: str
    parts: List[int]

class OEmbedResponse(BaseModel):
    title: str
    duration: Optional[int] = None
    thumbnail_url: Optional[str] = None
    provider_name: str
    provider_url: str

class VideoBulkAction(BaseModel):
    video_ids: List[int]
    action: str  # publish, unpublish, archive, delete
