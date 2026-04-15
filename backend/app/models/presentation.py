# app/models/presentation.py
"""
Presentation and PresentationSlide models.

Change summary (segment migration)
------------------------------------
+ segment_id FK → segments.id (SET NULL on delete, nullable during migration)
+ segment relationship added
+ unit_id kept for backward compat / direct unit queries
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
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


# ── Enums ──────────────────────────────────────────────────────────────────────

class PresentationStatus(str, enum.Enum):
    DRAFT     = "draft"
    PUBLISHED = "published"
    ARCHIVED  = "archived"


# ── Models ─────────────────────────────────────────────────────────────────────

class Presentation(Base):
    """
    A slide-deck attached to a Segment (and indirectly to a Unit).

    Hierarchy: Unit → Segment → Presentation
    """
    __tablename__ = "presentations"

    id         = Column(Integer, primary_key=True, index=True)
    unit_id    = Column(Integer, ForeignKey("units.id",    ondelete="CASCADE"), nullable=False, index=True)
    segment_id = Column(Integer, ForeignKey("segments.id", ondelete="SET NULL"), nullable=True,  index=True)  # ✅ NEW

    # ── Core metadata ──────────────────────────────────────────────────────────
    title       = Column(String(255), nullable=False)
    description = Column(Text,        nullable=True)

    # ── Presentation-level AI generation inputs ────────────────────────────────
    topic              = Column(String(500), nullable=True)
    level              = Column(String(50),  nullable=True)
    duration_minutes   = Column(Integer,     nullable=True)
    language           = Column(String(50),  nullable=True)
    learning_goals     = Column(JSON,        nullable=True)
    target_audience    = Column(String(255), nullable=True)

    # ── Publishing ─────────────────────────────────────────────────────────────
    status                 = Column(Enum(PresentationStatus), default=PresentationStatus.DRAFT, nullable=False)
    publish_at             = Column(DateTime(timezone=True), nullable=True)
    is_visible_to_students = Column(Boolean, default=False, nullable=False)
    order_index            = Column(Integer, default=0,     nullable=False)

    # ── SEO / sharing ──────────────────────────────────────────────────────────
    slug             = Column(String(255), nullable=True, unique=True)
    meta_title       = Column(String(255), nullable=True)
    meta_description = Column(Text,        nullable=True)

    # ── Audit ──────────────────────────────────────────────────────────────────
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # ── Relationships ──────────────────────────────────────────────────────────
    unit            = relationship("Unit",    back_populates="presentations")
    segment         = relationship("Segment", back_populates="presentations")   # ✅ NEW
    slides          = relationship(
        "PresentationSlide",
        back_populates="presentation",
        cascade="all, delete-orphan",
        order_by="PresentationSlide.order_index",
    )
    created_by_user = relationship("User", foreign_keys=[created_by])
    updated_by_user = relationship("User", foreign_keys=[updated_by])

    # ── Computed helpers ───────────────────────────────────────────────────────

    @property
    def is_published(self) -> bool:
        return self.status == PresentationStatus.PUBLISHED

    @property
    def is_draft(self) -> bool:
        return self.status == PresentationStatus.DRAFT

    @property
    def is_archived(self) -> bool:
        return self.status == PresentationStatus.ARCHIVED

    @property
    def is_available(self) -> bool:
        if not self.is_visible_to_students:
            return False
        if self.is_draft or self.is_archived:
            return False
        if self.status == PresentationStatus.PUBLISHED and self.publish_at:
            return datetime.utcnow() >= self.publish_at.replace(tzinfo=None)
        return self.is_published

    @property
    def slide_count(self) -> int:
        return len(self.slides) if self.slides else 0

    def generate_slug(self) -> str:
        import re
        slug = re.sub(r"[^\w\s-]", "", self.title.lower())
        slug = re.sub(r"[-\s]+", "-", slug)
        return slug.strip("-")

    def __repr__(self) -> str:
        return f"<Presentation(id={self.id}, title={self.title!r}, status={self.status})>"


class PresentationSlide(Base):
    """
    A single slide inside a Presentation.
    Unchanged from original — no segment relationship needed here
    (slides belong to a Presentation, not directly to a Segment).
    """
    __tablename__ = "presentation_slides"

    id              = Column(Integer, primary_key=True, index=True)
    presentation_id = Column(
        Integer,
        ForeignKey("presentations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    title         = Column(String(500), nullable=False)
    bullet_points = Column(JSON, default=list, nullable=False)
    examples      = Column(JSON, default=list, nullable=True)
    exercise      = Column(Text, nullable=True)
    teacher_notes = Column(Text, nullable=True)
    image_url     = Column(String(1000), nullable=True)
    image_alt     = Column(String(500),  nullable=True)
    order_index   = Column(Integer, default=0, nullable=False)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())
    updated_at    = Column(DateTime(timezone=True), onupdate=func.now())

    presentation  = relationship("Presentation", back_populates="slides")

    def __repr__(self) -> str:
        return (
            f"<PresentationSlide(id={self.id}, "
            f"presentation_id={self.presentation_id}, "
            f"order={self.order_index}, title={self.title!r})>"
        )