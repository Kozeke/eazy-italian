from .user import User, UserRole, SubscriptionType
from .course import Course
from .unit import Unit
# LEGACY: from .video import Video                                   # → video_embed blocks on Segment
# LEGACY: from .video_progress import VideoProgress                  # → UnitHomeworkSubmission / segment completion
# LEGACY: from .task import Task, TaskSubmission                     # → exercise blocks on Segment + UnitHomeworkSubmission
# LEGACY: from .test import Test, TestQuestion, TestAttempt, Question  # → test_without_timer / test_with_timer blocks
# LEGACY: from .progress import Progress                             # → UnitHomeworkSubmission
from .segment import Segment, SegmentStatus
from .email import EmailCampaign, EmailLog
from .email_verification import EmailVerificationCode
from .subscription import Subscription, SubscriptionLevel, UserSubscription
from .enrollment import CourseEnrollment
from .notification import Notification, NotificationType
from .lesson_chunk import LessonChunk
from .presentation import Presentation, PresentationSlide
from .live_session import LiveSession
from .homework_submission import UnitHomeworkSubmission, HomeworkSubmissionStatus
from .teacher_payment import TeacherPayment, TeacherPaymentStatus
from .teacher_ai_usage import TeacherAIUsage

__all__ = [
    "User",
    "UserRole",
    "SubscriptionType",
    "Course",
    "Unit",
    # LEGACY: "Video",           # → video_embed blocks on Segment
    # LEGACY: "VideoProgress",   # → UnitHomeworkSubmission / segment completion
    # LEGACY: "Task",            # → exercise blocks on Segment
    # LEGACY: "TaskSubmission",  # → UnitHomeworkSubmission.answers JSONB
    # LEGACY: "Test",            # → test_without_timer / test_with_timer blocks
    # LEGACY: "TestQuestion",    # → test block questions in Segment.media_blocks JSONB
    # LEGACY: "TestAttempt",     # → UnitHomeworkSubmission.answers JSONB
    # LEGACY: "Question",        # → individual question entries in test block JSONB
    # LEGACY: "Progress",        # → UnitHomeworkSubmission
    "Segment",
    "SegmentStatus",
    "EmailCampaign",
    "EmailLog",
    "EmailVerificationCode",
    "Subscription",
    "SubscriptionLevel",
    "UserSubscription",
    "CourseEnrollment",
    "Notification",
    "NotificationType",
    "LessonChunk",
    "Presentation",
    "PresentationSlide",
    "LiveSession",
    "UnitHomeworkSubmission",
    "HomeworkSubmissionStatus",
    "TeacherPayment",
    "TeacherPaymentStatus",
    "TeacherAIUsage",
]
