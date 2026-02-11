"""
Helper service for creating notifications
"""
from sqlalchemy.orm import Session
from app.models.notification import Notification, NotificationType


def create_notification(
    db: Session,
    notification_type: NotificationType,
    title: str,
    message: str,
    student_id: int,
    related_id: int = None,
    related_type: str = None
):
    """Create a new notification"""
    notification = Notification(
        type=notification_type,
        title=title,
        message=message,
        student_id=student_id,
        related_id=related_id,
        related_type=related_type,
        is_read=False
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return notification


def notify_course_enrollment(db: Session, student_id: int, course_id: int, course_title: str):
    """Create notification when student enrolls in a course"""
    return create_notification(
        db=db,
        notification_type=NotificationType.COURSE_ENROLLMENT,
        title="Новая запись на курс",
        message=f"Студент записался на курс: {course_title}",
        student_id=student_id,
        related_id=course_id,
        related_type="course"
    )


def notify_test_completed(db: Session, student_id: int, test_id: int, test_title: str, score: float, passed: bool):
    """Create notification when student completes a test"""
    notification_type = NotificationType.TEST_PASSED if passed else NotificationType.TEST_FAILED
    title = "Тест пройден" if passed else "Тест не пройден"
    message = f"Студент завершил тест '{test_title}' с результатом {score:.1f}%"
    
    return create_notification(
        db=db,
        notification_type=notification_type,
        title=title,
        message=message,
        student_id=student_id,
        related_id=test_id,
        related_type="test"
    )


def notify_task_submitted(db: Session, student_id: int, task_id: int, task_title: str):
    """Create notification when student submits a task (for teacher)"""
    return create_notification(
        db=db,
        notification_type=NotificationType.TASK_SUBMITTED,
        title="Новая сдача задания",
        message=f"Студент отправил задание: {task_title}",
        student_id=student_id,
        related_id=task_id,
        related_type="task"
    )