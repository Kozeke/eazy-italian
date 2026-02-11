from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, Enum, ForeignKey, Float, Boolean, TypeDecorator
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum

class TaskType(str, enum.Enum):
    MANUAL = "manual"
    AUTO = "auto"
    PRACTICE = "practice"
    WRITING = "writing"
    LISTENING = "listening"
    READING = "reading"

class AutoTaskType(str, enum.Enum):
    SCQ = "single_choice"  # Single Choice Question
    MCQ = "multiple_choice"  # Multiple Choice Question
    MATCHING = "matching"
    ORDERING = "ordering"
    GAP_FILL = "gap_fill"
    SHORT_ANSWER = "short_answer"
    NUMERIC = "numeric"

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
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=True)  # Allow no unit
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    content = Column(Text, nullable=True)
    instructions = Column(Text, nullable=True)  # Rich text instructions
    # Use native_enum=False to store as VARCHAR, but we'll use enum values
    # This ensures we use lowercase values like "listening" instead of enum names like "LISTENING"
    type = Column(Enum(TaskType, native_enum=False, values_callable=lambda x: [e.value for e in TaskType]), default=TaskType.MANUAL, nullable=False)
    auto_task_type = Column(Enum(AutoTaskType, native_enum=False, values_callable=lambda x: [e.value for e in AutoTaskType]), nullable=True)
    status = Column(Enum(TaskStatus, native_enum=False, values_callable=lambda x: [e.value for e in TaskStatus]), default=TaskStatus.DRAFT, nullable=False)
    publish_at = Column(DateTime(timezone=True), nullable=True)
    order_index = Column(Integer, default=0, nullable=False)
    max_score = Column(Float, default=100.0, nullable=False)
    due_at = Column(DateTime(timezone=True), nullable=True)
    allow_late_submissions = Column(Boolean, default=False)
    late_penalty_percent = Column(Float, default=0.0)  # Percentage penalty for late submissions
    max_attempts = Column(Integer, nullable=True)  # null = unlimited
    attachments = Column(JSON, default=list)  # List of file paths
    rubric = Column(JSON, default=dict)  # Grading rubric
    auto_check_config = Column(JSON, default=dict)  # For auto-gradable tasks
    questions = Column(JSON, default=list)  # Questions about the content (for listening/reading tasks)
    
    # Assignment settings
    assigned_cohorts = Column(JSON, default=list)  # List of cohort IDs
    assigned_students = Column(JSON, default=list)  # List of student IDs
    assign_to_all = Column(Boolean, default=False)  # Assign to all students
    
    # Notification settings
    send_assignment_email = Column(Boolean, default=False)
    reminder_days_before = Column(Integer, nullable=True)
    send_results_email = Column(Boolean, default=False)
    send_teacher_copy = Column(Boolean, default=False)
    
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
            from datetime import datetime, timezone
            now = datetime.now(timezone.utc)
            return now >= self.publish_at
        return self.is_published

    @property
    def is_overdue(self) -> bool:
        if not self.due_at:
            return False
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        return now > self.due_at

    @property
    def assigned_student_count(self) -> int:
        """Get the number of students assigned to this task"""
        if self.assign_to_all:
            # This would need to be calculated based on total students
            return 0  # Placeholder
        if not self.assigned_students:
            return 0
        return len(self.assigned_students)

    @property
    def submission_stats(self) -> dict:
        """Get submission statistics"""
        if not self.submissions:
            return {
                "total": 0,
                "submitted": 0,
                "graded": 0,
                "pending": 0
            }
        total = len(self.submissions)
        submitted = len([s for s in self.submissions if s.is_submitted])
        graded = len([s for s in self.submissions if s.is_graded])
        
        return {
            "total": total,
            "submitted": submitted,
            "graded": graded,
            "pending": submitted - graded
        }

    @property
    def average_score(self) -> float:
        """Calculate average score for graded submissions"""
        if not self.submissions:
            return 0.0
        graded_submissions = [s for s in self.submissions if s.is_graded and s.score is not None]
        if not graded_submissions:
            return 0.0
        return sum(s.score for s in graded_submissions) / len(graded_submissions)

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
    attempt_number = Column(Integer, default=1)  # Track attempt number
    time_spent_minutes = Column(Integer, nullable=True)  # Time spent on task

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

    @property
    def final_score(self) -> float:
        """Calculate final score with late penalty if applicable"""
        if not self.score:
            return 0.0
        
        if self.is_late and self.task.allow_late_submissions and self.task.late_penalty_percent > 0:
            penalty = self.score * (self.task.late_penalty_percent / 100)
            return max(0, self.score - penalty)
        
        return self.score
