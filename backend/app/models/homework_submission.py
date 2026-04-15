"""
homework_submission.py
======================
Persists per-student homework exercise state (patch-shaped answers) and workflow
status for a unit's homework_blocks (see Unit.homework_blocks).
"""

import enum
from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.core.database import Base


class HomeworkSubmissionStatus(str, enum.Enum):
    """Lifecycle for a student's homework in a unit."""

    # Teacher assigned homework; student may be editing (draft answers allowed)
    ASSIGNED = "assigned"
    # Student submitted for teacher review
    PENDING_REVIEW = "pending_review"
    # Teacher left feedback / requested follow-up; student should respond
    AWAITING_STUDENT = "awaiting_student"
    # Teacher accepted the work
    COMPLETED = "completed"


class UnitHomeworkSubmission(Base):
    """
    One row per (unit, student): stores JSON answers keyed like the live layer
    (e.g. hwu/{unitId}/ex/{blockId}/d2g) without the WebSocket student prefix.
    """

    __tablename__ = "unit_homework_submissions"
    __table_args__ = (UniqueConstraint("unit_id", "student_id", name="uq_unit_homework_student"),)

    id = Column(Integer, primary_key=True, index=True)
    unit_id = Column(Integer, ForeignKey("units.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # Stored as VARCHAR for simpler Alembic migrations (native_enum=False)
    status = Column(
        Enum(HomeworkSubmissionStatus, native_enum=False, values_callable=lambda x: [i.value for i in x]),
        nullable=False,
        default=HomeworkSubmissionStatus.ASSIGNED,
    )
    answers = Column(JSONB, nullable=False, server_default="{}")
    teacher_feedback = Column(Text, nullable=True)
    submitted_for_review_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    unit = relationship("Unit", back_populates="homework_submissions")
    student = relationship("User", foreign_keys=[student_id])
