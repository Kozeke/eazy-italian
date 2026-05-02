"""
ORM rows for teacher AI quota usage (per billing period and action slug).

Counters are incremented by check_and_consume_teacher_ai_quota and read by
GET /admin/tariffs/me via get_teacher_ai_usage.
"""

from sqlalchemy import Column, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from app.core.database import Base


class TeacherAIUsage(Base):
    """One aggregated usage counter for a user, period bucket, and action (e.g. exercise_generation)."""

    __tablename__ = "teacher_ai_usage"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "period_key",
            "action",
            name="uq_teacher_ai_usage_user_period_action",
        ),
    )

    # Surrogate primary key for ORM identity.
    id = Column(Integer, primary_key=True, autoincrement=True)
    # Teacher account this counter belongs to.
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # Opaque period id from get_teacher_ai_usage_period_key (subscription row or YYYY-MM).
    period_key = Column(String(64), nullable=False, index=True)
    # Quota bucket slug matching check_and_consume_teacher_ai_quota (e.g. exercise_generation).
    action = Column(String(64), nullable=False)
    # Number of consumptions recorded this period for this action.
    count = Column(Integer, nullable=False, default=0, server_default="0")

    user = relationship("User", back_populates="teacher_ai_usage_rows")
