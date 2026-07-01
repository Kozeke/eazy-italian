"""
LEGACY FILE — grades.py (teacher grades router)

Architecture change: grades.py queried TestAttempt and TaskSubmission —
both are legacy models.

Old model:  TestAttempt (test results)  +  TaskSubmission (task grades)
New model:  UnitHomeworkSubmission — teacher feedback and scores stored per unit

Replaced by:
  - Grade data source:  UnitHomeworkSubmission.teacher_feedback / score fields
  - New grade endpoint: to be implemented when HomeworkSubmission data is ready

This file is fully commented out and kept for reference during migration.
A new /grades endpoint will be added using HomeworkSubmission data.
"""

# LEGACY: from fastapi import APIRouter, Depends, HTTPException
# LEGACY: from sqlalchemy.orm import Session, joinedload
# LEGACY: from app.core.database import get_db
# LEGACY: from app.core.auth import get_current_teacher, get_current_student
# LEGACY: from app.models.test import TestAttempt, Test, TestQuestion, Question, AttemptStatus
# LEGACY: from app.models.task import TaskSubmission, Task
# LEGACY: from app.models.user import User
# LEGACY: from app.models.unit import Unit
# LEGACY: from app.models.course import Course
# LEGACY: from app.models.enrollment import CourseEnrollment
# LEGACY: from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from app.core.database import get_db
from app.core.auth import get_current_teacher
from app.models.user import User
from app.models.course import Course
from app.models.unit import Unit
from app.models.enrollment import CourseEnrollment

router = APIRouter()


# LEGACY: from sqlalchemy import desc, asc, func, case, and_


@router.get("/admin/students/{student_id}/enrollments")
def get_student_enrollments(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher),
):
    """Return enrolled courses for a student, scoped to courses owned by the current teacher.

    Kept at this path for backwards compatibility — the canonical route is
    GET /api/v1/admin/students/{student_id}/enrollments in admin_students.py.
    """
    # Collect only course IDs that this teacher created.
    teacher_course_ids = [
        c.id
        for c in db.query(Course.id).filter(Course.created_by == current_user.id).all()
    ]

    if not teacher_course_ids:
        return []

    # Join enrollments with course data and unit counts, filtered to teacher-owned courses only.
    enrollments = (
        db.query(
            Course.id.label("course_id"),
            Course.title,
            Course.level,
            Course.thumbnail_path,
            CourseEnrollment.created_at.label("enrolled_at"),
            func.count(Unit.id).label("total_units"),
        )
        .join(CourseEnrollment, CourseEnrollment.course_id == Course.id)
        .outerjoin(Unit, Unit.course_id == Course.id)
        .filter(CourseEnrollment.user_id == student_id)
        .filter(Course.id.in_(teacher_course_ids))
        .group_by(
            Course.id,
            Course.title,
            Course.level,
            Course.thumbnail_path,
            CourseEnrollment.created_at,
        )
        .order_by(desc(CourseEnrollment.created_at))
        .all()
    )

    return [
        {
            "course_id": e.course_id,
            "title": e.title,
            "level": e.level,
            "thumbnail_path": e.thumbnail_path,
            "enrolled_at": e.enrolled_at,
            "total_units": e.total_units or 0,
        }
        for e in enrollments
    ]


# LEGACY: @router.get("/admin/grades")
# LEGACY: def get_grades(
# LEGACY:     page: int = 1,
# LEGACY:     page_size: int = 20,
# LEGACY:     sort_by: str = "submitted_at",
# LEGACY:     sort_dir: str = "desc",
# LEGACY:     db: Session = Depends(get_db),
# LEGACY:     current_user: User = Depends(get_current_teacher)
# LEGACY: ):
# LEGACY:     # Allowed sortable fields (SECURITY)
# LEGACY:     sort_fields = {
# LEGACY:         "submitted_at": TestAttempt.submitted_at,
# LEGACY:         "score": TestAttempt.score,
# LEGACY:     }

# LEGACY:     sort_column = sort_fields.get(sort_by, TestAttempt.submitted_at)
# LEGACY:     sort_order = desc(sort_column) if sort_dir == "desc" else asc(sort_column)

# LEGACY:     # Get teacher's course IDs
# LEGACY:     teacher_course_ids = [c.id for c in db.query(Course.id).filter(
# LEGACY:         Course.created_by == current_user.id
# LEGACY:     ).all()]

# LEGACY:     if not teacher_course_ids:
# LEGACY:         return {
# LEGACY:             "items": [],
# LEGACY:             "total": 0,
# LEGACY:             "page": page,
# LEGACY:             "page_size": page_size,
# LEGACY:             "sort_by": sort_by,
# LEGACY:             "sort_dir": sort_dir,
# LEGACY:         }

# LEGACY:     # Get test attempts
# LEGACY:     test_rows = (
# LEGACY:         db.query(
# LEGACY:             TestAttempt.id.label("attempt_id"),
# LEGACY:             User.first_name,
# LEGACY:             User.last_name,
# LEGACY:             Course.title.label("course"),
# LEGACY:             Test.title.label("test"),
# LEGACY:             Unit.title.label("unit"),
# LEGACY:             TestAttempt.score,
# LEGACY:             Test.passing_score,
# LEGACY:             TestAttempt.status,
# LEGACY:             TestAttempt.submitted_at,
# LEGACY:         )
# LEGACY:         .join(User, User.id == TestAttempt.student_id)
# LEGACY:         .join(Test, Test.id == TestAttempt.test_id)
# LEGACY:         .join(Unit, Unit.id == Test.unit_id)
# LEGACY:         .outerjoin(Course, Course.id == Unit.course_id)
# LEGACY:         .filter(
# LEGACY:             and_(
# LEGACY:                 Test.created_by == current_user.id,
# LEGACY:                 Unit.course_id.in_(teacher_course_ids)
# LEGACY:             )
# LEGACY:         )
# LEGACY:         .all()
# LEGACY:     )

# LEGACY:     # Get task submissions (only graded ones)
# LEGACY:     from app.models.task import SubmissionStatus
# LEGACY:     task_rows = (
# LEGACY:         db.query(
# LEGACY:             TaskSubmission.id.label("attempt_id"),
# LEGACY:             TaskSubmission.task_id,
# LEGACY:             User.first_name,
# LEGACY:             User.last_name,
# LEGACY:             Course.title.label("course"),
# LEGACY:             Task.title.label("test"),
# LEGACY:             Unit.title.label("unit"),
# LEGACY:             TaskSubmission.score,
# LEGACY:             Task.max_score.label("passing_score"),
# LEGACY:             TaskSubmission.status,
# LEGACY:             TaskSubmission.submitted_at,
# LEGACY:         )
# LEGACY:         .join(User, User.id == TaskSubmission.student_id)
# LEGACY:         .join(Task, Task.id == TaskSubmission.task_id)
# LEGACY:         .join(Unit, Unit.id == Task.unit_id)
# LEGACY:         .outerjoin(Course, Course.id == Unit.course_id)
# LEGACY:         .filter(
# LEGACY:             and_(
# LEGACY:                 Task.created_by == current_user.id,
# LEGACY:                 Unit.course_id.in_(teacher_course_ids),
# LEGACY:                 TaskSubmission.status == SubmissionStatus.GRADED  # Only show graded task submissions
# LEGACY:             )
# LEGACY:         )
# LEGACY:         .all()
# LEGACY:     )

# LEGACY:     # Combine and convert to dict format
# LEGACY:     all_items = []

# LEGACY:     for r in test_rows:
# LEGACY:         all_items.append({
# LEGACY:             "attempt_id": r.attempt_id,
# LEGACY:             "student": f"{r.first_name} {r.last_name}",
# LEGACY:             "course": r.course or "—",
# LEGACY:             "test": r.test,
# LEGACY:             "unit": r.unit,
# LEGACY:             "score": r.score,
# LEGACY:             "passing_score": r.passing_score,
# LEGACY:             "passed": r.score >= r.passing_score if r.score is not None else False,
# LEGACY:             "status": r.status.value if hasattr(r.status, 'value') else str(r.status),
# LEGACY:             "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
# LEGACY:             "type": "test",
# LEGACY:         })

# LEGACY:     for r in task_rows:
# LEGACY:         # For tasks, we use max_score as passing_score for display
# LEGACY:         # Tasks don't have a passing threshold, so we'll show score/max_score
# LEGACY:         all_items.append({
# LEGACY:             "attempt_id": r.attempt_id,
# LEGACY:             "task_id": r.task_id,  # Include task_id for navigation
# LEGACY:             "student": f"{r.first_name} {r.last_name}",
# LEGACY:             "course": r.course or "—",
# LEGACY:             "test": r.test,  # Task title
# LEGACY:             "unit": r.unit,
# LEGACY:             "score": r.score,
# LEGACY:             "passing_score": r.passing_score,  # max_score
# LEGACY:             "passed": True,  # Tasks are always "passed" if graded
# LEGACY:             "status": r.status.value if hasattr(r.status, 'value') else str(r.status),
# LEGACY:             "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
# LEGACY:             "type": "task",
# LEGACY:         })

# LEGACY:     # Sort combined results
# LEGACY:     if sort_by == "submitted_at":
# LEGACY:         reverse = sort_dir == "desc"
# LEGACY:         all_items.sort(key=lambda x: x["submitted_at"] or "", reverse=reverse)
# LEGACY:     elif sort_by == "score":
# LEGACY:         reverse = sort_dir == "desc"
# LEGACY:         all_items.sort(key=lambda x: x["score"] or 0, reverse=reverse)

# LEGACY:     total = len(all_items)

# LEGACY:     # Apply pagination
# LEGACY:     start = (page - 1) * page_size
# LEGACY:     end = start + page_size
# LEGACY:     paginated_items = all_items[start:end]

# LEGACY:     return {
# LEGACY:         "items": paginated_items,
# LEGACY:         "total": total,
# LEGACY:         "page": page,
# LEGACY:         "page_size": page_size,
# LEGACY:         "sort_by": sort_by,
# LEGACY:         "sort_dir": sort_dir,
# LEGACY:     }




# LEGACY: @router.get("/admin/grades/{attempt_id}")
# LEGACY: def get_grade_detail(
# LEGACY:     attempt_id: int,
# LEGACY:     db: Session = Depends(get_db),
# LEGACY:     current_user: User = Depends(get_current_teacher)
# LEGACY: ):
# LEGACY:     """Get grade detail - only if test is created by current teacher"""
# LEGACY:     attempt = db.query(TestAttempt).join(Test).filter(
# LEGACY:         and_(
# LEGACY:             TestAttempt.id == attempt_id,
# LEGACY:             Test.created_by == current_user.id
# LEGACY:         )
# LEGACY:     ).first()

# LEGACY:     if not attempt:
# LEGACY:         from fastapi import HTTPException
# LEGACY:         raise HTTPException(status_code=404, detail="Grade not found")

# LEGACY:     if not attempt:
# LEGACY:         raise HTTPException(status_code=404, detail="Attempt not found")

# LEGACY:     # Build a map of all question IDs that appear in the attempt detail
# LEGACY:     question_ids_in_attempt = set()
# LEGACY:     for key, detail in (attempt.detail or {}).items():
# LEGACY:         question_id = detail.get("question_id") or int(key)
# LEGACY:         question_ids_in_attempt.add(question_id)

# LEGACY:     # Fetch questions directly by their IDs (not through TestQuestion)
# LEGACY:     questions = db.query(Question).filter(Question.id.in_(question_ids_in_attempt)).all()
# LEGACY:     question_map = {q.id: q for q in questions}

# LEGACY:     details = []
# LEGACY:     for key, detail in (attempt.detail or {}).items():
# LEGACY:         question_id = detail.get("question_id") or int(key)
# LEGACY:         question = question_map.get(question_id)
# LEGACY:         details.append({
# LEGACY:             "question_id": question_id,
# LEGACY:             "prompt": question.prompt_rich if question else None,
# LEGACY:             "type": question.type.value if question else None,
# LEGACY:             "options": question.options if question else None,
# LEGACY:             "correct_answer": question.correct_answer if question else None,
# LEGACY:             "student_answer": detail.get("student_answer"),
# LEGACY:             "is_correct": detail.get("is_correct"),
# LEGACY:             "points_earned": detail.get("points_earned"),
# LEGACY:             "points_possible": detail.get("points_possible"),
# LEGACY:         })

# LEGACY:     time_taken_seconds = None
# LEGACY:     if attempt.started_at and attempt.submitted_at:
# LEGACY:         time_taken_seconds = int((attempt.submitted_at - attempt.started_at).total_seconds())

# LEGACY:     return {
# LEGACY:         "attempt_id": attempt.id,
# LEGACY:         "score": attempt.score,
# LEGACY:         "detail": details,
# LEGACY:         "started_at": attempt.started_at,
# LEGACY:         "submitted_at": attempt.submitted_at,
# LEGACY:         "time_taken_seconds": time_taken_seconds
# LEGACY:     }


# LEGACY: @router.get("/admin/students/{student_id}/stats")
# LEGACY: def get_student_stats(
# LEGACY:     student_id: int,
# LEGACY:     db: Session = Depends(get_db),
# LEGACY:     current_user: User = Depends(get_current_teacher)
# LEGACY: ):
# LEGACY:     """Get student statistics including average grade and test history - only for teacher's courses"""
# LEGACY:     from app.models.enrollment import CourseEnrollment

# LEGACY:     # Get teacher's course IDs
# LEGACY:     teacher_course_ids = [c.id for c in db.query(Course.id).filter(
# LEGACY:         Course.created_by == current_user.id
# LEGACY:     ).all()]

# LEGACY:     if not teacher_course_ids:
# LEGACY:         return {
# LEGACY:             "student_id": student_id,
# LEGACY:             "total_attempts": 0,
# LEGACY:             "average_score": 0,
# LEGACY:             "attempts": []
# LEGACY:         }

# LEGACY:     # Verify student is enrolled in at least one of teacher's courses
# LEGACY:     student_enrolled = db.query(CourseEnrollment).filter(
# LEGACY:         CourseEnrollment.user_id == student_id,
# LEGACY:         CourseEnrollment.course_id.in_(teacher_course_ids)
# LEGACY:     ).first()

# LEGACY:     if not student_enrolled:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=403,
# LEGACY:             detail="Student is not enrolled in any of your courses"
# LEGACY:         )

# LEGACY:     # Get test attempts for this student, but only for tests in teacher's courses
# LEGACY:     attempts = (
# LEGACY:         db.query(
# LEGACY:             TestAttempt.id.label("attempt_id"),
# LEGACY:             TestAttempt.score,
# LEGACY:             TestAttempt.status,
# LEGACY:             TestAttempt.submitted_at,
# LEGACY:             TestAttempt.started_at,
# LEGACY:             Test.title.label("test_title"),
# LEGACY:             Test.id.label("test_id"),
# LEGACY:             Test.passing_score,
# LEGACY:             Unit.title.label("unit_title"),
# LEGACY:             Course.title.label("course_title")
# LEGACY:         )
# LEGACY:         .join(Test, Test.id == TestAttempt.test_id)
# LEGACY:         .outerjoin(Unit, Unit.id == Test.unit_id)
# LEGACY:         .outerjoin(Course, Course.id == Unit.course_id)
# LEGACY:         .filter(TestAttempt.student_id == student_id)
# LEGACY:         .filter(TestAttempt.status == "completed")
# LEGACY:         .filter(Course.created_by == current_user.id)  # Only tests from teacher's courses
# LEGACY:         .order_by(desc(TestAttempt.submitted_at))
# LEGACY:         .all()
# LEGACY:     )

# LEGACY:     # Calculate average score
# LEGACY:     scores = [a.score for a in attempts if a.score is not None]
# LEGACY:     average_score = round(sum(scores) / len(scores), 2) if scores else 0

# LEGACY:     # Format attempts for response
# LEGACY:     attempts_list = [
# LEGACY:         {
# LEGACY:             "attempt_id": a.attempt_id,
# LEGACY:             "test_id": a.test_id,
# LEGACY:             "test_title": a.test_title,
# LEGACY:             "unit_title": a.unit_title or "—",
# LEGACY:             "course_title": a.course_title or "—",
# LEGACY:             "score": round(a.score, 2) if a.score else 0,
# LEGACY:             "passing_score": a.passing_score,
# LEGACY:             "passed": a.score >= a.passing_score if a.score else False,
# LEGACY:             "submitted_at": a.submitted_at,
# LEGACY:             "time_taken_seconds": int((a.submitted_at - a.started_at).total_seconds()) if a.submitted_at and a.started_at else None
# LEGACY:         }
# LEGACY:         for a in attempts
# LEGACY:     ]

# LEGACY:     return {
# LEGACY:         "student_id": student_id,
# LEGACY:         "total_attempts": len(attempts_list),
# LEGACY:         "average_score": average_score,
# LEGACY:         "attempts": attempts_list
# LEGACY:     }


# LEGACY: @router.get("/admin/students/{student_id}/enrollments")
# LEGACY: def get_student_enrollments(
# LEGACY:     student_id: int,
# LEGACY:     db: Session = Depends(get_db),
# LEGACY:     current_user: User = Depends(get_current_teacher)
# LEGACY: ):
# LEGACY:     """Get student's enrolled courses - only courses owned by the teacher"""
# LEGACY:     from app.models.enrollment import CourseEnrollment

# LEGACY:     # Get teacher's course IDs
# LEGACY:     teacher_course_ids = [c.id for c in db.query(Course.id).filter(
# LEGACY:         Course.created_by == current_user.id
# LEGACY:     ).all()]

# LEGACY:     if not teacher_course_ids:
# LEGACY:         return []

# LEGACY:     # Get enrollments only for courses owned by the teacher
# LEGACY:     enrollments = (
# LEGACY:         db.query(
# LEGACY:             Course.id.label("course_id"),
# LEGACY:             Course.title,
# LEGACY:             Course.level,
# LEGACY:             Course.thumbnail_path,
# LEGACY:             CourseEnrollment.created_at.label("enrolled_at"),
# LEGACY:             func.count(Unit.id).label("total_units"),
# LEGACY:         )
# LEGACY:         .join(CourseEnrollment, CourseEnrollment.course_id == Course.id)
# LEGACY:         .outerjoin(Unit, Unit.course_id == Course.id)
# LEGACY:         .filter(CourseEnrollment.user_id == student_id)
# LEGACY:         .filter(Course.id.in_(teacher_course_ids))  # Only teacher's courses
# LEGACY:         .group_by(
# LEGACY:             Course.id,
# LEGACY:             Course.title,
# LEGACY:             Course.level,
# LEGACY:             Course.thumbnail_path,
# LEGACY:             CourseEnrollment.created_at
# LEGACY:         )
# LEGACY:         .order_by(desc(CourseEnrollment.created_at))
# LEGACY:         .all()
# LEGACY:     )

# LEGACY:     return [
# LEGACY:         {
# LEGACY:             "course_id": e.course_id,
# LEGACY:             "title": e.title,
# LEGACY:             "level": e.level,
# LEGACY:             "thumbnail_path": e.thumbnail_path,
# LEGACY:             "enrolled_at": e.enrolled_at,
# LEGACY:             "total_units": e.total_units or 0,
# LEGACY:         }
# LEGACY:         for e in enrollments
# LEGACY:     ]


# LEGACY: @router.get("/admin/tests/statistics")
# LEGACY: def get_tests_statistics(
# LEGACY:     db: Session = Depends(get_db),
# LEGACY:     current_user: User = Depends(get_current_teacher)
# LEGACY: ):
# LEGACY:     """Get statistics for all tests including attempts and average scores"""
# LEGACY:     from app.models.test import AttemptStatus

# LEGACY:     tests_stats = (
# LEGACY:         db.query(
# LEGACY:             Test.id,
# LEGACY:             Test.title,
# LEGACY:             func.count(TestAttempt.id).label("total_attempts"),
# LEGACY:             func.count(func.distinct(TestAttempt.student_id)).label("unique_students"),
# LEGACY:             func.avg(TestAttempt.score).label("average_score"),
# LEGACY:             func.sum(
# LEGACY:                 case(
# LEGACY:                     (TestAttempt.score >= Test.passing_score, 1),
# LEGACY:                     else_=0
# LEGACY:                 )
# LEGACY:             ).label("passed_attempts"),
# LEGACY:         )
# LEGACY:         .outerjoin(TestAttempt, 
# LEGACY:             (TestAttempt.test_id == Test.id) & 
# LEGACY:             (TestAttempt.status == AttemptStatus.COMPLETED)
# LEGACY:         )
# LEGACY:         .group_by(Test.id, Test.title)
# LEGACY:         .all()
# LEGACY:     )

# LEGACY:     return {
# LEGACY:         str(stat.id): {
# LEGACY:             "test_id": stat.id,
# LEGACY:             "test_title": stat.title,
# LEGACY:             "total_attempts": stat.total_attempts or 0,
# LEGACY:             "unique_students": stat.unique_students or 0,
# LEGACY:             "average_score": round(stat.average_score, 2) if stat.average_score else 0,
# LEGACY:             "passed_attempts": stat.passed_attempts or 0,
# LEGACY:             "pass_rate": round((stat.passed_attempts / stat.total_attempts * 100), 2) if stat.total_attempts > 0 else 0
# LEGACY:         }
# LEGACY:         for stat in tests_stats
# LEGACY:     }
