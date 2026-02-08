from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, Enum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum

class NotificationType(str, enum.Enum):
    COURSE_ENROLLMENT = "course_enrollment"
    TEST_COMPLETED = "test_completed"
    TEST_PASSED = "test_passed"
    TEST_FAILED = "test_failed"
    TASK_SUBMITTED = "task_submitted"
    VIDEO_COMPLETED = "video_completed"

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(Enum(NotificationType), nullable=False)
    title = Column(String, nullable=False)
    message = Column(Text, nullable=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    related_id = Column(Integer, nullable=True)  # ID of course, test, task, etc.
    related_type = Column(String, nullable=True)  # "course", "test", "task"
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    student = relationship("User", foreign_keys=[student_id])
