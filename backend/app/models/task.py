from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, Enum, ForeignKey, Float
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum

class TaskType(str, enum.Enum):
    MANUAL = "manual"
    AUTO = "auto"
    PRACTICE = "practice"
    WRITING = "writing"

class TaskStatus(str, enum.Enum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    PUBLISHED = "published"
    ARCHIVED = "archived"

class SubmissionStatus(str, enum.Enum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    GRADED = "graded"

class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    content = Column(Text, nullable=True)
    type = Column(Enum(TaskType), default=TaskType.MANUAL, nullable=False)
    status = Column(Enum(TaskStatus), default=TaskStatus.DRAFT, nullable=False)
    publish_at = Column(DateTime(timezone=True), nullable=True)
    order_index = Column(Integer, default=0, nullable=False)
    max_score = Column(Float, default=100.0, nullable=False)
    due_at = Column(DateTime(timezone=True), nullable=True)
    attachments = Column(JSON, default=list)  # List of file paths
    rubric = Column(JSON, default=dict)  # Grading rubric
    auto_check_config = Column(JSON, default=dict)  # For auto-gradable tasks
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    unit = relationship("Unit", back_populates="tasks")
    created_by_user = relationship("User", back_populates="created_tasks")
    submissions = relationship("TaskSubmission", back_populates="task", cascade="all, delete-orphan")

    @property
    def is_auto_gradable(self) -> bool:
        return self.type == TaskType.AUTO

    @property
    def is_published(self) -> bool:
        return self.status == TaskStatus.PUBLISHED

    @property
    def is_scheduled(self) -> bool:
        return self.status == TaskStatus.SCHEDULED

    @property
    def is_draft(self) -> bool:
        return self.status == TaskStatus.DRAFT

    @property
    def is_archived(self) -> bool:
        return self.status == TaskStatus.ARCHIVED

    @property
    def is_available(self) -> bool:
        if self.is_draft or self.is_archived:
            return False
        if self.is_scheduled and self.publish_at:
            from datetime import datetime
            return datetime.utcnow() >= self.publish_at
        return self.is_published

    @property
    def is_overdue(self) -> bool:
        if not self.due_at:
            return False
        from datetime import datetime
        return datetime.utcnow() > self.due_at

class TaskSubmission(Base):
    __tablename__ = "task_submissions"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    answers = Column(JSON, default=dict)  # Student's answers
    attachments = Column(JSON, default=list)  # Submitted files
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    graded_at = Column(DateTime(timezone=True), nullable=True)
    grader_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    score = Column(Float, nullable=True)
    feedback_rich = Column(Text, nullable=True)
    status = Column(Enum(SubmissionStatus), default=SubmissionStatus.DRAFT, nullable=False)

    # Relationships
    task = relationship("Task", back_populates="submissions")
    student = relationship("User", foreign_keys=[student_id], back_populates="task_submissions")
    grader = relationship("User", foreign_keys=[grader_id], back_populates="graded_submissions")

    @property
    def is_submitted(self) -> bool:
        return self.status == SubmissionStatus.SUBMITTED

    @property
    def is_graded(self) -> bool:
        return self.status == SubmissionStatus.GRADED

    @property
    def is_late(self) -> bool:
        if not self.task.due_at or not self.submitted_at:
            return False
        return self.submitted_at > self.task.due_at
