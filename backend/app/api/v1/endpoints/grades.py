from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from app.core.database import get_db
from app.core.auth import get_current_teacher
from app.models.test import TestAttempt, Test, TestQuestion, Question
from app.models.task import TaskSubmission, Task
from app.models.user import User
from app.models.unit import Unit
from app.models.course import Course
from datetime import datetime

router = APIRouter()


from sqlalchemy import desc, asc, func, case, and_

@router.get("/admin/grades")
def get_grades(
    page: int = 1,
    page_size: int = 20,
    sort_by: str = "submitted_at",
    sort_dir: str = "desc",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher)
):
    # Allowed sortable fields (SECURITY)
    sort_fields = {
        "submitted_at": TestAttempt.submitted_at,
        "score": TestAttempt.score,
    }

    sort_column = sort_fields.get(sort_by, TestAttempt.submitted_at)
    sort_order = desc(sort_column) if sort_dir == "desc" else asc(sort_column)

    # Get teacher's course IDs
    teacher_course_ids = [c.id for c in db.query(Course.id).filter(
        Course.created_by == current_user.id
    ).all()]
    
    if not teacher_course_ids:
        return {
            "items": [],
            "total": 0,
            "page": page,
            "page_size": page_size,
            "sort_by": sort_by,
            "sort_dir": sort_dir,
        }
    
    # Get test attempts
    test_rows = (
        db.query(
            TestAttempt.id.label("attempt_id"),
            User.first_name,
            User.last_name,
            Course.title.label("course"),
            Test.title.label("test"),
            Unit.title.label("unit"),
            TestAttempt.score,
            Test.passing_score,
            TestAttempt.status,
            TestAttempt.submitted_at,
        )
        .join(User, User.id == TestAttempt.student_id)
        .join(Test, Test.id == TestAttempt.test_id)
        .join(Unit, Unit.id == Test.unit_id)
        .outerjoin(Course, Course.id == Unit.course_id)
        .filter(
            and_(
                Test.created_by == current_user.id,
                Unit.course_id.in_(teacher_course_ids)
            )
        )
        .all()
    )

    # Get task submissions (only graded ones)
    from app.models.task import SubmissionStatus
    task_rows = (
        db.query(
            TaskSubmission.id.label("attempt_id"),
            TaskSubmission.task_id,
            User.first_name,
            User.last_name,
            Course.title.label("course"),
            Task.title.label("test"),
            Unit.title.label("unit"),
            TaskSubmission.score,
            Task.max_score.label("passing_score"),
            TaskSubmission.status,
            TaskSubmission.submitted_at,
        )
        .join(User, User.id == TaskSubmission.student_id)
        .join(Task, Task.id == TaskSubmission.task_id)
        .join(Unit, Unit.id == Task.unit_id)
        .outerjoin(Course, Course.id == Unit.course_id)
        .filter(
            and_(
                Task.created_by == current_user.id,
                Unit.course_id.in_(teacher_course_ids),
                TaskSubmission.status == SubmissionStatus.GRADED  # Only show graded task submissions
            )
        )
        .all()
    )
    
    # Combine and convert to dict format
    all_items = []
    
    for r in test_rows:
        all_items.append({
            "attempt_id": r.attempt_id,
            "student": f"{r.first_name} {r.last_name}",
            "course": r.course or "—",
            "test": r.test,
            "unit": r.unit,
            "score": r.score,
            "passing_score": r.passing_score,
            "passed": r.score >= r.passing_score if r.score is not None else False,
            "status": r.status.value if hasattr(r.status, 'value') else str(r.status),
            "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
            "type": "test",
        })
    
    for r in task_rows:
        # For tasks, we use max_score as passing_score for display
        # Tasks don't have a passing threshold, so we'll show score/max_score
        all_items.append({
            "attempt_id": r.attempt_id,
            "task_id": r.task_id,  # Include task_id for navigation
            "student": f"{r.first_name} {r.last_name}",
            "course": r.course or "—",
            "test": r.test,  # Task title
            "unit": r.unit,
            "score": r.score,
            "passing_score": r.passing_score,  # max_score
            "passed": True,  # Tasks are always "passed" if graded
            "status": r.status.value if hasattr(r.status, 'value') else str(r.status),
            "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
            "type": "task",
        })
    
    # Sort combined results
    if sort_by == "submitted_at":
        reverse = sort_dir == "desc"
        all_items.sort(key=lambda x: x["submitted_at"] or "", reverse=reverse)
    elif sort_by == "score":
        reverse = sort_dir == "desc"
        all_items.sort(key=lambda x: x["score"] or 0, reverse=reverse)
    
    total = len(all_items)
    
    # Apply pagination
    start = (page - 1) * page_size
    end = start + page_size
    paginated_items = all_items[start:end]

    return {
        "items": paginated_items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "sort_by": sort_by,
        "sort_dir": sort_dir,
    }




@router.get("/admin/grades/{attempt_id}")
def get_grade_detail(
    attempt_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher)
):
    """Get grade detail - only if test is created by current teacher"""
    attempt = db.query(TestAttempt).join(Test).filter(
        and_(
            TestAttempt.id == attempt_id,
            Test.created_by == current_user.id
        )
    ).first()
    
    if not attempt:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Grade not found")

    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    # Build a map of all question IDs that appear in the attempt detail
    question_ids_in_attempt = set()
    for key, detail in (attempt.detail or {}).items():
        question_id = detail.get("question_id") or int(key)
        question_ids_in_attempt.add(question_id)
    
    # Fetch questions directly by their IDs (not through TestQuestion)
    questions = db.query(Question).filter(Question.id.in_(question_ids_in_attempt)).all()
    question_map = {q.id: q for q in questions}

    details = []
    for key, detail in (attempt.detail or {}).items():
        question_id = detail.get("question_id") or int(key)
        question = question_map.get(question_id)
        details.append({
            "question_id": question_id,
            "prompt": question.prompt_rich if question else None,
            "type": question.type.value if question else None,
            "options": question.options if question else None,
            "correct_answer": question.correct_answer if question else None,
            "student_answer": detail.get("student_answer"),
            "is_correct": detail.get("is_correct"),
            "points_earned": detail.get("points_earned"),
            "points_possible": detail.get("points_possible"),
        })

    time_taken_seconds = None
    if attempt.started_at and attempt.submitted_at:
        time_taken_seconds = int((attempt.submitted_at - attempt.started_at).total_seconds())

    return {
        "attempt_id": attempt.id,
        "score": attempt.score,
        "detail": details,
        "started_at": attempt.started_at,
        "submitted_at": attempt.submitted_at,
        "time_taken_seconds": time_taken_seconds
    }


@router.get("/admin/students/{student_id}/stats")
def get_student_stats(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher)
):
    """Get student statistics including average grade and test history - only for teacher's courses"""
    from app.models.enrollment import CourseEnrollment
    
    # Get teacher's course IDs
    teacher_course_ids = [c.id for c in db.query(Course.id).filter(
        Course.created_by == current_user.id
    ).all()]
    
    if not teacher_course_ids:
        return {
            "student_id": student_id,
            "total_attempts": 0,
            "average_score": 0,
            "attempts": []
        }
    
    # Verify student is enrolled in at least one of teacher's courses
    student_enrolled = db.query(CourseEnrollment).filter(
        CourseEnrollment.user_id == student_id,
        CourseEnrollment.course_id.in_(teacher_course_ids)
    ).first()
    
    if not student_enrolled:
        raise HTTPException(
            status_code=403,
            detail="Student is not enrolled in any of your courses"
        )
    
    # Get test attempts for this student, but only for tests in teacher's courses
    attempts = (
        db.query(
            TestAttempt.id.label("attempt_id"),
            TestAttempt.score,
            TestAttempt.status,
            TestAttempt.submitted_at,
            TestAttempt.started_at,
            Test.title.label("test_title"),
            Test.id.label("test_id"),
            Test.passing_score,
            Unit.title.label("unit_title"),
            Course.title.label("course_title")
        )
        .join(Test, Test.id == TestAttempt.test_id)
        .outerjoin(Unit, Unit.id == Test.unit_id)
        .outerjoin(Course, Course.id == Unit.course_id)
        .filter(TestAttempt.student_id == student_id)
        .filter(TestAttempt.status == "completed")
        .filter(Course.created_by == current_user.id)  # Only tests from teacher's courses
        .order_by(desc(TestAttempt.submitted_at))
        .all()
    )
    
    # Calculate average score
    scores = [a.score for a in attempts if a.score is not None]
    average_score = round(sum(scores) / len(scores), 2) if scores else 0
    
    # Format attempts for response
    attempts_list = [
        {
            "attempt_id": a.attempt_id,
            "test_id": a.test_id,
            "test_title": a.test_title,
            "unit_title": a.unit_title or "—",
            "course_title": a.course_title or "—",
            "score": round(a.score, 2) if a.score else 0,
            "passing_score": a.passing_score,
            "passed": a.score >= a.passing_score if a.score else False,
            "submitted_at": a.submitted_at,
            "time_taken_seconds": int((a.submitted_at - a.started_at).total_seconds()) if a.submitted_at and a.started_at else None
        }
        for a in attempts
    ]
    
    return {
        "student_id": student_id,
        "total_attempts": len(attempts_list),
        "average_score": average_score,
        "attempts": attempts_list
    }


@router.get("/admin/students/{student_id}/enrollments")
def get_student_enrollments(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher)
):
    """Get student's enrolled courses - only courses owned by the teacher"""
    from app.models.enrollment import CourseEnrollment
    
    # Get teacher's course IDs
    teacher_course_ids = [c.id for c in db.query(Course.id).filter(
        Course.created_by == current_user.id
    ).all()]
    
    if not teacher_course_ids:
        return []
    
    # Get enrollments only for courses owned by the teacher
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
        .filter(Course.id.in_(teacher_course_ids))  # Only teacher's courses
        .group_by(
            Course.id,
            Course.title,
            Course.level,
            Course.thumbnail_path,
            CourseEnrollment.created_at
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


@router.get("/admin/tests/statistics")
def get_tests_statistics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher)
):
    """Get statistics for all tests including attempts and average scores"""
    from app.models.test import AttemptStatus
    
    tests_stats = (
        db.query(
            Test.id,
            Test.title,
            func.count(TestAttempt.id).label("total_attempts"),
            func.count(func.distinct(TestAttempt.student_id)).label("unique_students"),
            func.avg(TestAttempt.score).label("average_score"),
            func.sum(
                case(
                    (TestAttempt.score >= Test.passing_score, 1),
                    else_=0
                )
            ).label("passed_attempts"),
        )
        .outerjoin(TestAttempt, 
            (TestAttempt.test_id == Test.id) & 
            (TestAttempt.status == AttemptStatus.COMPLETED)
        )
        .group_by(Test.id, Test.title)
        .all()
    )
    
    return {
        str(stat.id): {
            "test_id": stat.id,
            "test_title": stat.title,
            "total_attempts": stat.total_attempts or 0,
            "unique_students": stat.unique_students or 0,
            "average_score": round(stat.average_score, 2) if stat.average_score else 0,
            "passed_attempts": stat.passed_attempts or 0,
            "pass_rate": round((stat.passed_attempts / stat.total_attempts * 100), 2) if stat.total_attempts > 0 else 0
        }
        for stat in tests_stats
    }
