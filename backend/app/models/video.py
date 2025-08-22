from sqlalchemy import Column, Integer, String, Text, DateTime, Enum, ForeignKey, Boolean, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum
from datetime import datetime

class VideoSourceType(str, enum.Enum):
    FILE = "file"
    URL = "url"

class VideoStatus(str, enum.Enum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    PUBLISHED = "published"
    ARCHIVED = "archived"

class Video(Base):
    __tablename__ = "videos"

    id = Column(Integer, primary_key=True, index=True)
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    source_type = Column(Enum(VideoSourceType), nullable=False)
    file_path = Column(String(500), nullable=True)  # For uploaded files
    external_url = Column(String(500), nullable=True)  # For YouTube/Vimeo links
    duration_sec = Column(Integer, nullable=True)
    thumbnail_path = Column(String(500), nullable=True)
    subtitles = Column(JSON, nullable=True)  # [{lang:'ru', vtt_path}, {lang:'it', vtt_path}]
    transcript = Column(Text, nullable=True)
    status = Column(Enum(VideoStatus), default=VideoStatus.DRAFT, nullable=False)
    publish_at = Column(DateTime(timezone=True), nullable=True)
    order_index = Column(Integer, default=0, nullable=False)
    attachments = Column(JSON, default=list, nullable=True)  # [{name, path, type}]
    is_visible_to_students = Column(Boolean, default=True, nullable=False)
    meta_title = Column(String(255), nullable=True)
    meta_description = Column(Text, nullable=True)
    slug = Column(String(255), nullable=True, unique=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    unit = relationship("Unit", back_populates="videos")
    created_by_user = relationship("User", foreign_keys=[created_by], back_populates="created_videos")
    updated_by_user = relationship("User", foreign_keys=[updated_by])

    @property
    def is_external(self) -> bool:
        return self.source_type == VideoSourceType.URL

    @property
    def is_uploaded(self) -> bool:
        return self.source_type == VideoSourceType.FILE

    @property
    def video_url(self) -> str:
        if self.is_external:
            return self.external_url
        return f"/api/v1/videos/{self.id}/stream"

    @property
    def is_published(self) -> bool:
        return self.status == VideoStatus.PUBLISHED

    @property
    def is_scheduled(self) -> bool:
        return self.status == VideoStatus.SCHEDULED

    @property
    def is_draft(self) -> bool:
        return self.status == VideoStatus.DRAFT

    @property
    def is_archived(self) -> bool:
        return self.status == VideoStatus.ARCHIVED

    @property
    def is_available(self) -> bool:
        if not self.is_visible_to_students:
            return False
        if self.is_draft or self.is_archived:
            return False
        if self.is_scheduled and self.publish_at:
            return datetime.utcnow() >= self.publish_at
        return self.is_published

    def generate_slug(self) -> str:
        """Generate a URL-friendly slug from the title"""
        import re
        slug = re.sub(r'[^\w\s-]', '', self.title.lower())
        slug = re.sub(r'[-\s]+', '-', slug)
        return slug.strip('-')

    def __repr__(self):
        return f"<Video(id={self.id}, title='{self.title}', status='{self.status}')>"
