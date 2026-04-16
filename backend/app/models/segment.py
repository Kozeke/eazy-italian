"""
app/models/segment.py
======================
Segment model — sits between Unit and content items.

Hierarchy:
    Course → Unit → Segment → {Video, Task, Test, Presentation}

All four content models point back here via segment_id FK.
Deleting a Segment sets segment_id = NULL on its content rows
(SET NULL cascade) so content is not lost — just un-grouped.
Teachers can then reassign orphaned content to another segment.

To hard-delete content alongside the segment, switch ondelete to
"CASCADE" in each content model's segment_id FK definition and
change the relationships here to cascade="all, delete-orphan".
"""

from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


# ── Enums ──────────────────────────────────────────────────────────────────────

class SegmentStatus(str, enum.Enum):
    DRAFT     = "draft"
    SCHEDULED = "scheduled"
    PUBLISHED = "published"
    ARCHIVED  = "archived"


# ── Model ──────────────────────────────────────────────────────────────────────

class Segment(Base):
    __tablename__ = "segments"

    id         = Column(Integer, primary_key=True, index=True)
    unit_id    = Column(
        Integer,
        ForeignKey("units.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    title       = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    order_index            = Column(Integer, default=0, nullable=False)
    status                 = Column(
        Enum(
            SegmentStatus,
            name="segmentstatus",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        default=SegmentStatus.DRAFT,
        nullable=False,
    )
    publish_at             = Column(DateTime(timezone=True), nullable=True)
    is_visible_to_students = Column(Boolean, default=False, nullable=False)
    media_blocks           = Column(
        JSONB,
        nullable=False,
        server_default=text("'[]'::jsonb"),
    )

    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # ── Relationships ─────────────────────────────────────────────────────────
    unit            = relationship("Unit", back_populates="segments")
    created_by_user = relationship("User", foreign_keys=[created_by])
    updated_by_user = relationship("User", foreign_keys=[updated_by])

    # All four content types — SET NULL on segment delete keeps content alive
    videos        = relationship("Video",        back_populates="segment", foreign_keys="Video.segment_id")
    tasks         = relationship("Task",         back_populates="segment", foreign_keys="Task.segment_id")
    tests         = relationship("Test",         back_populates="segment", foreign_keys="Test.segment_id")
    presentations = relationship("Presentation", back_populates="segment", foreign_keys="Presentation.segment_id")

    # ── Helpers ───────────────────────────────────────────────────────────────
    @property
    def is_published(self) -> bool:
        return self.status == SegmentStatus.PUBLISHED

    @property
    def is_available(self) -> bool:
        if not self.is_visible_to_students:
            return False
        if self.status in (SegmentStatus.DRAFT, SegmentStatus.ARCHIVED):
            return False
        if self.status == SegmentStatus.SCHEDULED and self.publish_at:
            return datetime.utcnow() >= self.publish_at
        return True

    @property
    def content_count(self) -> int:
        return (
            len(self.videos          or [])
            + len(self.tasks         or [])
            + len(self.tests         or [])
            + len(self.presentations or [])
        )

    def __repr__(self) -> str:
        return f"<Segment id={self.id} unit_id={self.unit_id} title={self.title!r}>"