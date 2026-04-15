"""
app/models/unit.py  (updated — added segments relationship)

Change summary
--------------
+ import Segment model (lazy string ref avoids circular import)
+ segments relationship added with cascade="all, delete-orphan"
+ content_count property updated to include segment count

Everything else is unchanged from the original.
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, Enum, ForeignKey, JSON, ARRAY, text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum
from datetime import datetime
from sqlalchemy.dialects.postgresql import JSONB

class UnitLevel(str, enum.Enum):
    A1 = "A1"
    A2 = "A2"
    B1 = "B1"
    B2 = "B2"
    C1 = "C1"
    C2 = "C2"


class UnitStatus(str, enum.Enum):
    DRAFT     = "draft"
    SCHEDULED = "scheduled"
    PUBLISHED = "published"
    ARCHIVED  = "archived"


class Unit(Base):
    __tablename__ = "units"

    id          = Column(Integer, primary_key=True, index=True)
    title       = Column(String(255), nullable=False)
    level       = Column(Enum(UnitLevel), nullable=False)
    description = Column(Text, nullable=True)
    goals       = Column(Text, nullable=True)
    tags        = Column(ARRAY(String), default=[], nullable=True)
    status      = Column(Enum(UnitStatus), default=UnitStatus.DRAFT, nullable=False)
    publish_at  = Column(DateTime(timezone=True), nullable=True)
    order_index = Column(Integer, default=0, nullable=False)
    attachments = Column(JSON, default=list, nullable=True)
    is_visible_to_students = Column(Boolean, default=False, nullable=False)
    slug             = Column(String(255), nullable=True, unique=True)
    meta_title       = Column(String(255), nullable=True)
    meta_description = Column(Text, nullable=True)
    course_id        = Column(Integer, ForeignKey("courses.id"), nullable=True)
    created_by       = Column(Integer, ForeignKey("users.id"), nullable=False)
    updated_by       = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at       = Column(DateTime(timezone=True), server_default=func.now())
    updated_at       = Column(DateTime(timezone=True), onupdate=func.now())

    # ── Relationships ─────────────────────────────────────────────────────────
    course           = relationship("Course", back_populates="units")
    created_by_user  = relationship("User", foreign_keys=[created_by], back_populates="created_units")
    updated_by_user  = relationship("User", foreign_keys=[updated_by])

    # ✅ NEW — segments are the primary children now
    segments         = relationship("Segment", back_populates="unit", cascade="all, delete-orphan", order_by="Segment.order_index")

    # kept for direct access / backward compat during migration
    videos           = relationship("Video",        back_populates="unit", cascade="all, delete-orphan")
    tasks            = relationship("Task",         back_populates="unit", cascade="all, delete-orphan")
    tests            = relationship("Test",         back_populates="unit", cascade="all, delete-orphan")
    presentations    = relationship("Presentation", back_populates="unit", cascade="all, delete-orphan")
    progress         = relationship("Progress",     back_populates="unit", cascade="all, delete-orphan")

    # Per-student persisted homework answers + workflow status
    homework_submissions = relationship(
        "UnitHomeworkSubmission",
        back_populates="unit",
        cascade="all, delete-orphan",
    )

    homework_blocks = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))


    # ── Helpers ───────────────────────────────────────────────────────────────
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
        return True

    @property
    def segment_count(self) -> int:
        return len(self.segments or [])

    @property
    def content_count(self) -> dict:
        # ── Direct content (legacy flat model) ───────────────────────────────
        direct_videos = self.videos or []
        direct_tasks  = self.tasks  or []
        direct_tests  = self.tests  or []

        # ── Segment-level ORM content ─────────────────────────────────────────
        # Content rows that carry both unit_id and segment_id end up in the
        # unit's direct collections above, so we de-duplicate by id.
        direct_video_ids = {v.id for v in direct_videos}
        direct_task_ids  = {t.id for t in direct_tasks}
        direct_test_ids  = {t.id for t in direct_tests}

        seg_videos = [
            v for seg in (self.segments or [])
            for v in (seg.videos or [])
            if v.id not in direct_video_ids
        ]
        seg_tasks = [
            t for seg in (self.segments or [])
            for t in (seg.tasks or [])
            if t.id not in direct_task_ids
        ]
        seg_tests = [
            t for seg in (self.segments or [])
            for t in (seg.tests or [])
            if t.id not in direct_test_ids
        ]

        all_videos = direct_videos + seg_videos
        all_tasks  = direct_tasks  + seg_tasks
        all_tests  = direct_tests  + seg_tests

        # ── Media-block exercises (JSONB, not ORM rows) ───────────────────────
        # Blocks stored inside segment.media_blocks are exercises generated by
        # the AI pipeline. They don't appear in any ORM collection, so we count
        # them separately so the frontend can show a non-zero exercise count.
        media_block_count = sum(
            len(seg.media_blocks or [])
            for seg in (self.segments or [])
        )

        return {
            "videos":           len(all_videos),
            "published_videos": len([v for v in all_videos if v.is_available]),
            "tasks":            len(all_tasks),
            "published_tasks":  len([t for t in all_tasks  if t.is_available]),
            "tests":            len(all_tests),
            "published_tests":  len([t for t in all_tests  if t.is_available]),
            "segments":         self.segment_count,
            "media_blocks":     media_block_count,
        }

    def can_publish(self):
        if not self.title:
            return False, "Unit must have a title"
        return True, None