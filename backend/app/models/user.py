from sqlalchemy import Column, Integer, String, Boolean, DateTime, JSON, Enum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum

class UserRole(str, enum.Enum):
    STUDENT = "student"
    TEACHER = "teacher"

class SubscriptionType(str, enum.Enum):
    FREE = "free"
    STANDARD = "standard"
    # Keeps backward compatibility for legacy accounts using premium name.
    PREMIUM = "premium"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.STUDENT, nullable=False)
    password_hash = Column(String, nullable=False)
    email_verified_at = Column(DateTime, nullable=True)
    locale = Column(String, default="ru", nullable=False)
    notification_prefs = Column(JSON, default=dict)
    is_active = Column(Boolean, default=True, nullable=False)
    last_login = Column(DateTime(timezone=True), nullable=True)
    subscription_type = Column(Enum(SubscriptionType), default=SubscriptionType.FREE, nullable=False)
    onboarding_completed = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    task_submissions = relationship("TaskSubmission", foreign_keys="TaskSubmission.student_id", back_populates="student")
    test_attempts = relationship("TestAttempt", back_populates="student")
    progress = relationship("Progress", back_populates="student")
    # ✅ CORRECT
    video_progress = relationship("VideoProgress", back_populates="user", cascade="all, delete-orphan") 
    created_units = relationship("Unit", foreign_keys="Unit.created_by", back_populates="created_by_user")
    created_courses = relationship("Course", foreign_keys="Course.created_by", back_populates="created_by_user")
    created_tasks = relationship("Task", back_populates="created_by_user")
    created_tests = relationship("Test", back_populates="created_by_user")
    created_videos = relationship("Video", foreign_keys="Video.created_by", back_populates="created_by_user")
    graded_submissions = relationship("TaskSubmission", foreign_keys="TaskSubmission.grader_id", back_populates="grader")
    email_campaigns = relationship("EmailCampaign", back_populates="created_by_user")
    course_enrollments = relationship("CourseEnrollment", back_populates="user")
    user_subscriptions = relationship("UserSubscription", back_populates="user")
    # Ledger of teacher subscription charges and related adjustments.
    teacher_payments = relationship(
        "TeacherPayment",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"

    @property
    def is_teacher(self) -> bool:
        return self.role == UserRole.TEACHER

    @property
    def is_student(self) -> bool:
        return self.role == UserRole.STUDENT

    @property
    def is_premium(self) -> bool:
        """Check if user has premium or pro subscription"""
        # Check subscription_type column (FREE, STANDARD, or legacy PREMIUM)
        if self.subscription_type in [SubscriptionType.STANDARD, SubscriptionType.PREMIUM]:
            return True
        
        # Also check UserSubscription for PRO accounts
        # PRO users should be treated as premium
        from app.models.subscription import UserSubscription, SubscriptionName
        active_sub = next(
            (sub.subscription.name for sub in self.user_subscriptions if sub.is_active),
            None
        )
        if active_sub and active_sub in [
            SubscriptionName.STANDARD,
            SubscriptionName.PREMIUM,
            SubscriptionName.PRO,
        ]:
            return True
        
        return False

    @property
    def subscription(self):
        """Returns the name of the active subscription plan, or None for free users."""
        active = next(
            (sub for sub in self.user_subscriptions if sub.is_active),
            None
        )
        if active and active.subscription:
            return active.subscription.name.value
        return None

    @property
    def subscription_ends_at(self):
        """Returns the end datetime of the active subscription so the header badge can show days left."""
        active = next(
            (sub for sub in self.user_subscriptions if sub.is_active),
            None
        )
        if active:
            return active.ends_at
        return None

    @property
    def avatar_url(self) -> str | None:
        """Returns persisted profile avatar URL from notification prefs JSON."""
        # Stores profile metadata JSON where avatar URL is persisted by /users/me/avatar.
        prefs = self.notification_prefs if isinstance(self.notification_prefs, dict) else {}
        # Stores normalized avatar URL value expected by frontend and presence payloads.
        avatar_url_value = prefs.get("avatar_url")
        return avatar_url_value if isinstance(avatar_url_value, str) and avatar_url_value.strip() else None
