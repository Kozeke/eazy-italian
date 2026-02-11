from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, Enum, ForeignKey, Float, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum

class QuestionType(str, enum.Enum):
    MULTIPLE_CHOICE = "multiple_choice"
    SINGLE_CHOICE = "single_choice"
    OPEN_ANSWER = "open_answer"  # Added for open-ended answers
    CLOZE = "cloze"  # Added for fill-in-the-blank
    GAP_FILL = "gap_fill"
    MATCHING = "matching"
    ORDERING = "ordering"
    SHORT_ANSWER = "short_answer"
    LISTENING = "listening"
    READING = "reading"
    VISUAL = "visual"  # Visual question with image

class TestStatus(str, enum.Enum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    PUBLISHED = "published"
    ARCHIVED = "archived"

class AttemptStatus(str, enum.Enum):
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    TIMED_OUT = "timed_out"

class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    bank_tags = Column(JSON, default=list)  # List of tags for question bank
    level = Column(String, nullable=True)  # A1, A2, B1, B2, C1, C2
    type = Column(Enum(QuestionType), nullable=False)
    prompt_rich = Column(Text, nullable=False)  # Question prompt/text
    media = Column(JSON, default=list)  # List of media files (audio, images)
    options = Column(JSON, default=list)  # For multiple choice, single choice
    correct_answer = Column(JSON, nullable=False)  # Answer format depends on type
    explanation_rich = Column(Text, nullable=True)
    points = Column(Float, default=1.0, nullable=False)  # Score weight
    shuffle_options = Column(Boolean, default=False)  # Shuffle answer options
    autograde = Column(Boolean, default=True)  # Enable auto-grading
    manual_review_threshold = Column(Float, nullable=True)  # Review if score < threshold
    expected_answer_config = Column(JSON, default=dict)  # For open answers: keywords, regex
    gaps_config = Column(JSON, default=list)  # For cloze: gap definitions
    question_metadata = Column(JSON, default=dict)  # Difficulty, tags, etc.
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    created_by_user = relationship("User")
    test_questions = relationship("TestQuestion", back_populates="question")

class Test(Base):
    __tablename__ = "tests"

    id = Column(Integer, primary_key=True, index=True)
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=True)  # Optional, can be standalone
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    instructions = Column(Text, nullable=True)
    time_limit_minutes = Column(Integer, default=30, nullable=False)
    passing_score = Column(Float, default=70.0, nullable=False)
    status = Column(Enum(TestStatus), default=TestStatus.DRAFT, nullable=False)
    publish_at = Column(DateTime(timezone=True), nullable=True)
    order_index = Column(Integer, default=0, nullable=False)
    settings = Column(JSON, default=dict)  # time_limit, attempts, shuffle, etc.
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    unit = relationship("Unit", back_populates="tests")
    created_by_user = relationship("User", back_populates="created_tests")
    test_questions = relationship("TestQuestion", back_populates="test", cascade="all, delete-orphan")
    attempts = relationship("TestAttempt", back_populates="test", cascade="all, delete-orphan")

    @property
    def is_published(self) -> bool:
        return self.status == TestStatus.PUBLISHED

    @property
    def is_scheduled(self) -> bool:
        return self.status == TestStatus.SCHEDULED

    @property
    def is_draft(self) -> bool:
        return self.status == TestStatus.DRAFT

    @property
    def is_archived(self) -> bool:
        return self.status == TestStatus.ARCHIVED

    @property
    def is_available(self) -> bool:
        if self.is_draft or self.is_archived:
            return False
        if self.is_scheduled and self.publish_at:
            from datetime import datetime
            return datetime.utcnow() >= self.publish_at
        return self.is_published

    @property
    def max_attempts(self) -> int:
        return self.settings.get("max_attempts", 1)

    @property
    def shuffle_questions(self) -> bool:
        return self.settings.get("shuffle_questions", False)

    @property
    def shuffle_options(self) -> bool:
        return self.settings.get("shuffle_options", False)

class TestQuestion(Base):
    __tablename__ = "test_questions"

    id = Column(Integer, primary_key=True, index=True)
    test_id = Column(Integer, ForeignKey("tests.id"), nullable=False)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False)
    order_index = Column(Integer, default=0, nullable=False)
    points = Column(Float, nullable=True)  # Override question points if needed

    # Relationships
    test = relationship("Test", back_populates="test_questions")
    question = relationship("Question", back_populates="test_questions")

class TestAttempt(Base):
    __tablename__ = "test_attempts"

    id = Column(Integer, primary_key=True, index=True)
    test_id = Column(Integer, ForeignKey("tests.id"), nullable=False)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    score = Column(Float, nullable=True)
    detail = Column(JSON, default=dict)  # Per-question results
    status = Column(Enum(AttemptStatus), default=AttemptStatus.IN_PROGRESS, nullable=False)

    # Relationships
    test = relationship("Test", back_populates="attempts")
    student = relationship("User", back_populates="test_attempts")

    @property
    def is_completed(self) -> bool:
        return self.status == AttemptStatus.COMPLETED

    @property
    def duration_minutes(self) -> int:
        if not self.submitted_at:
            return 0
        return int((self.submitted_at - self.started_at).total_seconds() / 60)

    @property
    def is_passed(self) -> bool:
        if not self.score:
            return False
        return self.score >= self.test.pass_threshold
