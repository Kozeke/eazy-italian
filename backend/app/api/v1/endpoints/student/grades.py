"""
Student grades endpoints
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.core.database import get_db
from app.core.auth import get_current_student
from app.models.user import User
from app.models.test import TestAttempt, Test, AttemptStatus
from app.models.task import TaskSubmission, Task, SubmissionStatus
from app.models.unit import Unit
from app.models.course import Course
from app.models.enrollment import CourseEnrollment

router = APIRouter()


@router.get("/grades")
def get_student_grades(
    current_user: User = Depends(get_current_student),
    db: Session = Depends(get_db)
):
    """Get all grades for the current student (tests and tasks)"""
    import json
    
    # Get student's enrolled course IDs
    enrolled_courses = db.query(CourseEnrollment.course_id).filter(
        CourseEnrollment.user_id == current_user.id
    ).all()
    enrolled_course_ids = [c.course_id for c in enrolled_courses]
    
    if not enrolled_course_ids:
        return []
    
    all_grades = []
    
    # Get test attempts for this student
    test_attempts = (
        db.query(
            TestAttempt.id,
            TestAttempt.score,
            TestAttempt.status,
            TestAttempt.submitted_at,
            Test.title,
            Test.max_score,
            Test.id.label("test_id"),
            Course.title.label("course_title"),
        )
        .join(Test, Test.id == TestAttempt.test_id)
        .outerjoin(Unit, Unit.id == Test.unit_id)
        .outerjoin(Course, Course.id == Unit.course_id)
        .filter(TestAttempt.student_id == current_user.id)
        .filter(Course.id.in_(enrolled_course_ids))
        .order_by(desc(TestAttempt.submitted_at))
        .all()
    )
    
    for attempt in test_attempts:
        # Determine status
        if attempt.status == AttemptStatus.COMPLETED:
            if attempt.score is not None:
                status = "graded"
            else:
                status = "submitted"
        else:
            status = "pending"
        
        all_grades.append({
            "id": attempt.test_id,  # Use test_id as the main identifier
            "title": attempt.title,
            "type": "test",
            "status": status,
            "classroom_name": attempt.course_title or "—",
            "course_title": attempt.course_title,
            "score": attempt.score,
            "max_score": attempt.max_score,
            "submitted_at": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
            "teacher_feedback": None,  # Test attempts don't have feedback field in this schema
        })
    
    # Get task submissions for this student
    task_submissions = (
        db.query(
            TaskSubmission.id,
            TaskSubmission.score,
            TaskSubmission.status,
            TaskSubmission.submitted_at,
            TaskSubmission.feedback_rich,
            Task.title,
            Task.max_score,
            Task.id.label("task_id"),
            Course.title.label("course_title"),
        )
        .join(Task, Task.id == TaskSubmission.task_id)
        .outerjoin(Unit, Unit.id == Task.unit_id)
        .outerjoin(Course, Course.id == Unit.course_id)
        .filter(TaskSubmission.student_id == current_user.id)
        .filter(Course.id.in_(enrolled_course_ids))
        .order_by(desc(TaskSubmission.submitted_at))
        .all()
    )
    
    for submission in task_submissions:
        # Determine status
        if submission.status == SubmissionStatus.GRADED:
            status = "graded"
        elif submission.status == SubmissionStatus.SUBMITTED:
            status = "submitted"
        else:
            status = "pending"
        
        # Extract feedback from feedback_rich (could be JSON string or plain text)
        feedback = None
        if submission.feedback_rich:
            try:
                feedback_data = json.loads(submission.feedback_rich) if isinstance(submission.feedback_rich, str) else submission.feedback_rich
                if isinstance(feedback_data, dict):
                    feedback = feedback_data.get("feedback") or feedback_data.get("teacher_feedback") or submission.feedback_rich
                else:
                    feedback = submission.feedback_rich
            except:
                feedback = submission.feedback_rich
        
        all_grades.append({
            "id": submission.task_id,  # Use task_id as the main identifier
            "title": submission.title,
            "type": "task",
            "status": status,
            "classroom_name": submission.course_title or "—",
            "course_title": submission.course_title,
            "score": submission.score,
            "max_score": submission.max_score,
            "submitted_at": submission.submitted_at.isoformat() if submission.submitted_at else None,
            "teacher_feedback": feedback,
        })
    
    # Sort by submitted_at (most recent first)
    all_grades.sort(key=lambda x: x["submitted_at"] or "", reverse=True)
    
    return all_grades
