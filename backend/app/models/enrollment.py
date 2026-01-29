"""
Course Enrollment model
Tracks which students are enrolled in which courses
"""
from sqlalchemy import Column, Integer, ForeignKey, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base

class CourseEnrollment(Base):
    """Course enrollment - tracks student enrollments in courses"""
    __tablename__ = "course_enrollments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    user = relationship("User", back_populates="course_enrollments")
    course = relationship("Course", back_populates="enrollments")

    def __repr__(self):
        return f"<CourseEnrollment(user_id={self.user_id}, course_id={self.course_id})>"
