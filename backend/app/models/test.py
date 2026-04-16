"""
app/models/test.py

SQLAlchemy models for tests, questions, and attempts.

QuestionType first-wave additions (2024-Q2 migration):
  - CLOZE_INPUT   replaces legacy CLOZE (stored as "cloze_input")
  - CLOZE_DRAG    drag-word variant  ("cloze_drag")
  - TRUE_FALSE                       ("true_false")
  - MATCHING_PAIRS                   ("matching_pairs")
  - ORDERING_WORDS                   ("ordering_words")
  - ORDERING_SENTENCES               ("ordering_sentences")

Backward-compat:
  - CLOZE ("cloze") is kept so existing rows stay valid.
    The API layer maps it to CLOZE_INPUT when reading new payloads.
  - All legacy values (SINGLE_CHOICE, GAP_FILL, etc.) are preserved.
"""

from sqlalchemy import (
    Column, Integer, String, Text, DateTime,
    JSON, Enum, ForeignKey, Float, Boolean,
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum


# ── Enums ─────────────────────────────────────────────────────────────────────

class QuestionType(str, enum.Enum):
    # ── First-wave interactive (auto-gradable) ────────────────────────────────
    MULTIPLE_CHOICE   = "multiple_choice"
    TRUE_FALSE        = "true_false"
    CLOZE_INPUT       = "cloze_input"      # typed fill-in-the-blank
    CLOZE_DRAG        = "cloze_drag"       # drag-word fill-in-the-blank
    MATCHING_PAIRS    = "matching_pairs"
    ORDERING_WORDS    = "ordering_words"
    ORDERING_SENTENCES = "ordering_sentences"

    # ── Practice / manual-review ──────────────────────────────────────────────
    OPEN_ANSWER       = "open_answer"

    # ── Legacy values kept for backward-compat (do NOT use for new questions) ─
    SINGLE_CHOICE     = "single_choice"
    CLOZE             = "cloze"            # maps → CLOZE_INPUT at schema layer
    GAP_FILL          = "gap_fill"
    MATCHING          = "matching"
    ORDERING          = "ordering"
    SHORT_ANSWER      = "short_answer"
    LISTENING         = "listening"
    READING           = "reading"
    VISUAL            = "visual"


class TestStatus(str, enum.Enum):
    DRAFT     = "draft"
    SCHEDULED = "scheduled"
    PUBLISHED = "published"
    ARCHIVED  = "archived"


class AttemptStatus(str, enum.Enum):
    IN_PROGRESS = "in_progress"
    COMPLETED   = "completed"
    TIMED_OUT   = "timed_out"


# ── Models ─────────────────────────────────────────────────────────────────────

class Question(Base):
    """
    Single reusable question / exercise item.

    All question types share this table. Type-specific runtime data lives in:
      - options             → multiple_choice, true_false
      - gaps_config         → cloze_input, cloze_drag
      - question_metadata   → matching_pairs, ordering_words, ordering_sentences,
                              and any extra editor/AI metadata
      - expected_answer_config → open_answer
      - correct_answer      → canonical grading contract for all types

    See app/schemas/question.py for per-type correct_answer contracts.
    """
    __tablename__ = "questions"

    id                      = Column(Integer, primary_key=True, index=True)
    bank_tags               = Column(JSON, default=list)
    level                   = Column(String, nullable=True)           # A1–C2
    type                    = Column(Enum(QuestionType), nullable=False)
    prompt_rich             = Column(Text, nullable=False)
    media                   = Column(JSON, default=list)
    options                 = Column(JSON, default=list)
    correct_answer          = Column(JSON, nullable=False)
    explanation_rich        = Column(Text, nullable=True)
    points                  = Column(Float, default=1.0, nullable=False)
    shuffle_options         = Column(Boolean, default=False)
    autograde               = Column(Boolean, default=True)
    manual_review_threshold = Column(Float, nullable=True)
    expected_answer_config  = Column(JSON, default=dict)
    gaps_config             = Column(JSON, default=list)
    question_metadata       = Column(JSON, default=dict)
    created_by              = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at              = Column(DateTime(timezone=True), server_default=func.now())
    updated_at              = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    created_by_user = relationship("User")
    test_questions  = relationship("TestQuestion", back_populates="question")


class Test(Base):
    __tablename__ = "tests"

    id                  = Column(Integer, primary_key=True, index=True)
    unit_id             = Column(Integer, ForeignKey("units.id"), nullable=True)
    segment_id          = Column(Integer, ForeignKey("segments.id"), nullable=True)
    title               = Column(String, nullable=False)
    description         = Column(Text, nullable=True)
    instructions        = Column(Text, nullable=True)
    time_limit_minutes  = Column(Integer, default=30, nullable=False)
    passing_score       = Column(Float, default=70.0, nullable=False)
    status              = Column(Enum(TestStatus), default=TestStatus.DRAFT, nullable=False)
    publish_at          = Column(DateTime(timezone=True), nullable=True)
    order_index         = Column(Integer, default=0, nullable=False)
    settings            = Column(JSON, default=dict)
    created_by          = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at          = Column(DateTime(timezone=True), server_default=func.now())
    updated_at          = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    unit            = relationship("Unit", back_populates="tests")
    segment         = relationship("Segment", back_populates="tests", foreign_keys=[segment_id])
    created_by_user = relationship("User", back_populates="created_tests")
    test_questions  = relationship("TestQuestion", back_populates="test", cascade="all, delete-orphan")
    attempts        = relationship("TestAttempt", back_populates="test", cascade="all, delete-orphan")

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

    id           = Column(Integer, primary_key=True, index=True)
    test_id      = Column(Integer, ForeignKey("tests.id"), nullable=False)
    question_id  = Column(Integer, ForeignKey("questions.id"), nullable=False)
    order_index  = Column(Integer, default=0, nullable=False)
    points       = Column(Float, nullable=True)

    test     = relationship("Test", back_populates="test_questions")
    question = relationship("Question", back_populates="test_questions")


class TestAttempt(Base):
    __tablename__ = "test_attempts"

    id           = Column(Integer, primary_key=True, index=True)
    test_id      = Column(Integer, ForeignKey("tests.id"), nullable=False)
    student_id   = Column(Integer, ForeignKey("users.id"), nullable=False)
    started_at   = Column(DateTime(timezone=True), server_default=func.now())
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    score        = Column(Float, nullable=True)
    detail       = Column(JSON, default=dict)
    status       = Column(Enum(AttemptStatus), default=AttemptStatus.IN_PROGRESS, nullable=False)

    test    = relationship("Test", back_populates="attempts")
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
        return self.score >= self.test.passing_score