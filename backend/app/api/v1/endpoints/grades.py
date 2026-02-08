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
