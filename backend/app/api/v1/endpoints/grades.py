from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from app.core.database import get_db
from app.core.auth import get_current_teacher
from app.models.test import TestAttempt, Test, TestQuestion, Question
from app.models.user import User
from app.models.unit import Unit
from app.models.course import Course

router = APIRouter()


from sqlalchemy import desc, asc

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

    base_query = (
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
    )

    total = base_query.count()

    rows = (
        base_query
        .order_by(sort_order)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "items": [
            {
                "attempt_id": r.attempt_id,
                "student": f"{r.first_name} {r.last_name}",
                "course": r.course or "—",  # Show "—" if course is None
                "test": r.test,
                "unit": r.unit,
                "score": r.score,
                "passing_score": r.passing_score,
                "passed": r.score >= r.passing_score if r.score is not None else False,
                "status": r.status,
                "submitted_at": r.submitted_at,
            }
            for r in rows
        ],
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
    attempt = db.query(TestAttempt).filter(
        TestAttempt.id == attempt_id
    ).first()

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
    """Get student statistics including average grade and test history"""
    
    # Get all test attempts for this student
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
    """Get student's enrolled courses"""
    from app.models.enrollment import CourseEnrollment
    
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
