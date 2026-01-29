"""
Course model - represents a course that contains multiple units
Courses are the top-level container in the content hierarchy
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, Enum, ForeignKey, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum
from datetime import datetime

class CourseLevel(str, enum.Enum):
    """Course difficulty levels"""
    A1 = "A1"
    A2 = "A2"
    B1 = "B1"
    B2 = "B2"
    C1 = "C1"
    C2 = "C2"
    MIXED = "mixed"  # Course contains units from multiple levels

class CourseStatus(str, enum.Enum):
    """Course publication status"""
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    PUBLISHED = "published"
    ARCHIVED = "archived"

class Course(Base):
    """Course model - top-level container for units"""
    __tablename__ = "courses"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    level = Column(Enum(CourseLevel), nullable=False)
    status = Column(Enum(CourseStatus), default=CourseStatus.DRAFT, nullable=False)
    publish_at = Column(DateTime(timezone=True), nullable=True)
    order_index = Column(Integer, default=0, nullable=False)
    
    # Course metadata
    thumbnail_url = Column(String(500), nullable=True)  # Course thumbnail image (legacy, use thumbnail_path)
    thumbnail_path = Column(String(500), nullable=True)  # Course thumbnail path (relative to uploads/)
    duration_hours = Column(Integer, nullable=True)  # Estimated total duration in hours
    tags = Column(JSON, default=list, nullable=True)  # Course tags for categorization
    
    # SEO and visibility
    slug = Column(String(255), nullable=True, unique=True)
    meta_title = Column(String(255), nullable=True)
    meta_description = Column(Text, nullable=True)
    is_visible_to_students = Column(Boolean, default=False, nullable=False)
    
    # Course settings
    settings = Column(JSON, default=dict, nullable=True)  # Additional course settings
    
    # Audit fields
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    created_by_user = relationship("User", foreign_keys=[created_by], back_populates="created_courses")
    updated_by_user = relationship("User", foreign_keys=[updated_by])
    units = relationship("Unit", back_populates="course", cascade="all, delete-orphan", order_by="Unit.order_index")
    enrollments = relationship("CourseEnrollment", back_populates="course", cascade="all, delete-orphan")

    @property
    def is_published(self) -> bool:
        """Check if course is published"""
        return self.status == CourseStatus.PUBLISHED

    @property
    def is_scheduled(self) -> bool:
        """Check if course is scheduled"""
        return self.status == CourseStatus.SCHEDULED

    @property
    def is_draft(self) -> bool:
        """Check if course is in draft status"""
        return self.status == CourseStatus.DRAFT

    @property
    def is_archived(self) -> bool:
        """Check if course is archived"""
        return self.status == CourseStatus.ARCHIVED

    @property
    def is_available(self) -> bool:
        """Check if course is available to students"""
        if not self.is_visible_to_students:
            return False
        if self.is_draft or self.is_archived:
            return False
        if self.is_scheduled and self.publish_at:
            return datetime.utcnow() >= self.publish_at
        return self.is_published

    @property
    def units_count(self) -> int:
        """Get total number of units in course"""
        return len(self.units)

    @property
    def published_units_count(self) -> int:
        """Get number of published units"""
        return len([u for u in self.units if u.is_available])

    @property
    def has_content(self) -> bool:
        """Check if course has at least one published unit"""
        return self.published_units_count > 0

    @property
    def content_summary(self) -> dict:
        """Get summary of all content in course"""
        total_videos = sum(len(unit.videos) for unit in self.units)
        total_tasks = sum(len(unit.tasks) for unit in self.units)
        total_tests = sum(len(unit.tests) for unit in self.units)
        
        published_videos = sum(
            len([v for v in unit.videos if v.is_available]) 
            for unit in self.units
        )
        published_tasks = sum(
            len([t for t in unit.tasks if t.is_available]) 
            for unit in self.units
        )
        published_tests = sum(
            len([t for t in unit.tests if t.is_available]) 
            for unit in self.units
        )
        
        return {
            'units': self.units_count,
            'published_units': self.published_units_count,
            'videos': total_videos,
            'published_videos': published_videos,
            'tasks': total_tasks,
            'published_tasks': published_tasks,
            'tests': total_tests,
            'published_tests': published_tests
        }

    def generate_slug(self) -> str:
        """Generate a URL-friendly slug from the title"""
        import re
        slug = re.sub(r'[^\w\s-]', '', self.title.lower())
        slug = re.sub(r'[-\s]+', '-', slug)
        return slug.strip('-')

    def can_publish(self) -> tuple[bool, str]:
        """Check if course can be published and return reason if not"""
        if not self.has_content:
            return False, "Course must have at least one published unit"
        if self.is_scheduled and self.publish_at and self.publish_at <= datetime.utcnow():
            return False, "Scheduled publish date must be in the future"
        return True, ""

    def __repr__(self):
        return f"<Course(id={self.id}, title='{self.title}', status='{self.status}')>"
