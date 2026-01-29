from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, Enum, ForeignKey, JSON, ARRAY
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum
from datetime import datetime

class UnitLevel(str, enum.Enum):
    A1 = "A1"
    A2 = "A2"
    B1 = "B1"
    B2 = "B2"
    C1 = "C1"
    C2 = "C2"

class UnitStatus(str, enum.Enum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    PUBLISHED = "published"
    ARCHIVED = "archived"

class Unit(Base):
    __tablename__ = "units"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    level = Column(Enum(UnitLevel), nullable=False)
    description = Column(Text, nullable=True)
    goals = Column(Text, nullable=True)  # Key learning objectives
    tags = Column(ARRAY(String), default=[], nullable=True)  # Free-text tags
    status = Column(Enum(UnitStatus), default=UnitStatus.DRAFT, nullable=False)
    publish_at = Column(DateTime(timezone=True), nullable=True)
    order_index = Column(Integer, default=0, nullable=False)
    attachments = Column(JSON, default=list, nullable=True)  # [{name, path, type}]
    is_visible_to_students = Column(Boolean, default=False, nullable=False)
    slug = Column(String(255), nullable=True, unique=True)
    meta_title = Column(String(255), nullable=True)
    meta_description = Column(Text, nullable=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=True)  # Course this unit belongs to
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    course = relationship("Course", back_populates="units")
    created_by_user = relationship("User", foreign_keys=[created_by], back_populates="created_units")
    updated_by_user = relationship("User", foreign_keys=[updated_by])
    videos = relationship("Video", back_populates="unit", cascade="all, delete-orphan")
    tasks = relationship("Task", back_populates="unit", cascade="all, delete-orphan")
    tests = relationship("Test", back_populates="unit", cascade="all, delete-orphan")
    progress = relationship("Progress", back_populates="unit", cascade="all, delete-orphan")

    @property
    def is_published(self) -> bool:
        return self.status == UnitStatus.PUBLISHED

    @property
    def is_scheduled(self) -> bool:
        return self.status == UnitStatus.SCHEDULED

    @property
    def is_draft(self) -> bool:
        return self.status == UnitStatus.DRAFT

    @property
    def is_archived(self) -> bool:
        return self.status == UnitStatus.ARCHIVED

    @property
    def is_available(self) -> bool:
        if not self.is_visible_to_students:
            return False
        if self.is_draft or self.is_archived:
            return False
        if self.is_scheduled and self.publish_at:
            return datetime.utcnow() >= self.publish_at
        return self.is_published

    @property
    def has_content(self) -> bool:
        """Check if unit has at least one visible child item"""
        return (
            any(video.is_available for video in self.videos) or
            any(task.is_available for task in self.tasks) or
            any(test.is_available for test in self.tests)
        )

    @property
    def content_count(self) -> dict:
        """Get counts of child items"""
        return {
            'videos': len(self.videos),
            'tasks': len(self.tasks),
            'tests': len(self.tests),
            'published_videos': len([v for v in self.videos if v.is_published]),
            'published_tasks': len([t for t in self.tasks if t.is_published]),
            'published_tests': len([t for t in self.tests if t.is_published])
        }

    def generate_slug(self) -> str:
        """Generate a URL-friendly slug from the title"""
        import re
        slug = re.sub(r'[^\w\s-]', '', self.title.lower())
        slug = re.sub(r'[-\s]+', '-', slug)
        return slug.strip('-')

    def can_publish(self) -> tuple[bool, str]:
        """Check if unit can be published and return reason if not"""
        if not self.has_content:
            return False, "Unit must have at least one published video, task, or test"
        if self.is_scheduled and self.publish_at and self.publish_at <= datetime.utcnow():
            return False, "Scheduled publish date must be in the future"
        return True, ""

    def __repr__(self):
        return f"<Unit(id={self.id}, title='{self.title}', status='{self.status}')>"
