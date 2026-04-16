"""
Live Session model - stores active live classroom sessions
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
from datetime import datetime


class LiveSession(Base):
    """Live session for a classroom (course)"""
    __tablename__ = "live_sessions"

    classroom_id = Column(Integer, ForeignKey("courses.id"), primary_key=True)
    teacher_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=False)
    slide_index = Column(Integer, nullable=False, default=0)
    section = Column(String(20), nullable=False, default="slides")  # 'slides' | 'task' | 'test'
    started_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    classroom = relationship("Course", foreign_keys=[classroom_id])
    teacher = relationship("User", foreign_keys=[teacher_id])
    unit = relationship("Unit", foreign_keys=[unit_id])
