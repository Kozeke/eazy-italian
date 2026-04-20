"""
app/models/exercise_field_answer_event.py
==========================================
Persists every exercise field answer that flows through the live WebSocket.

Row written per meaningful patch:
  • Student answers naturally          → written_by_teacher=False, is_broadcast=False
  • Teacher fills for ALL students     → written_by_teacher=True,  is_broadcast=True  (one row per online student)
  • Teacher fills for ONE student      → written_by_teacher=True,  is_broadcast=False

Key anatomy (matches LiveSessionProvider convention):
    exercise_key  = "ex/{blockId}/{fieldKey}"   (logical, no student prefix)
    block_id      = "{blockId}"
    field_key     = "{fieldKey}"                (e.g. "d2g", "gap-0", "answers")

Scope columns:
    unit_id     — which unit the exercise was in when the answer was written (nullable)
    segment_id  — which segment (section) the exercise belongs to (nullable)
    These let the REST endpoint restore a specific unit/segment's answers on classroom load.

Migration note:
    ALTER TABLE exercise_field_answer_events
        ADD COLUMN unit_id    INTEGER REFERENCES units(id)    ON DELETE SET NULL,
        ADD COLUMN segment_id INTEGER REFERENCES segments(id) ON DELETE SET NULL;
    CREATE INDEX ix_efae_unit    ON exercise_field_answer_events (classroom_id, student_id, unit_id);
    CREATE INDEX ix_efae_segment ON exercise_field_answer_events (classroom_id, student_id, segment_id);
"""

from __future__ import annotations

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from app.core.database import Base


class ExerciseFieldAnswerEvent(Base):
    __tablename__ = "exercise_field_answer_events"

    id = Column(Integer, primary_key=True, index=True)

    # Scope
    classroom_id = Column(Integer, ForeignKey("courses.id",   ondelete="CASCADE"),  nullable=False, index=True)
    student_id   = Column(Integer, ForeignKey("users.id",     ondelete="CASCADE"),  nullable=False, index=True)

    # Lesson context — which unit + segment the block lived in when answered.
    # Nullable so rows written before this column existed remain valid.
    unit_id    = Column(Integer, ForeignKey("units.id",    ondelete="SET NULL"), nullable=True,  index=True)
    segment_id = Column(Integer, ForeignKey("segments.id", ondelete="SET NULL"), nullable=True,  index=True)

    # Exercise field identity
    exercise_key = Column(String, nullable=False)   # "ex/{blockId}/{fieldKey}"
    block_id     = Column(String, nullable=False)
    field_key    = Column(String, nullable=False)

    # Payload
    value      = Column(JSONB, nullable=True)
    is_correct = Column(Boolean, nullable=True)   # null = not evaluated

    # Provenance
    written_by_teacher = Column(Boolean, nullable=False, default=False)
    is_broadcast       = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        # Composite indexes for the most common query patterns
        Index("ix_efae_classroom_student",  "classroom_id", "student_id"),
        Index("ix_efae_classroom_block",    "classroom_id", "block_id"),
        Index("ix_efae_student_block",      "student_id",   "block_id"),
        # Unit / segment scoping — used by the REST restore endpoint
        Index("ix_efae_unit",    "classroom_id", "student_id", "unit_id"),
        Index("ix_efae_segment", "classroom_id", "student_id", "segment_id"),
    )

    def __repr__(self) -> str:
        return (
            f"<ExerciseFieldAnswerEvent id={self.id} "
            f"student={self.student_id} key={self.exercise_key!r} "
            f"unit={self.unit_id} segment={self.segment_id} "
            f"teacher={self.written_by_teacher}>"
        )