from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_
from typing import Dict, Any
from datetime import datetime

from app.core.database import get_db
from app.core.auth import get_current_student
from app.models.user import User
from app.models.test import (
    Test,
    TestAttempt,
    TestQuestion,
    TestStatus,
    AttemptStatus,
)

router = APIRouter()

# --------------------------------------------------
# List available tests
# --------------------------------------------------

@router.get("")
def list_available_tests(
    current_user: User = Depends(get_current_student),
    db: Session = Depends(get_db)
):
    tests = (
        db.query(Test)
        .filter(Test.status == TestStatus.PUBLISHED)
        .order_by(Test.order_index)
        .all()
    )

    return [
        {
            "id": t.id,
            "title": t.title,
            "description": t.description,
            "time_limit_minutes": t.time_limit_minutes,
            "passing_score": t.passing_score,
            "unit_id": t.unit_id,
        }
        for t in tests
    ]


# --------------------------------------------------
# Start test attempt
# --------------------------------------------------

@router.post("/{test_id}/start")
def start_test(
    test_id: int,
    current_user: User = Depends(get_current_student),
    db: Session = Depends(get_db)
):
    test = db.query(Test).filter(
        Test.id == test_id,
        Test.status == TestStatus.PUBLISHED
    ).first()

    if not test:
        raise HTTPException(404, "Test not available")

    # Prevent parallel attempts
    active_attempt = db.query(TestAttempt).filter(
        TestAttempt.test_id == test_id,
        TestAttempt.student_id == current_user.id,
        TestAttempt.status == AttemptStatus.IN_PROGRESS
    ).first()

    if active_attempt:
        raise HTTPException(400, "You already have an active attempt")

    # Check max attempts
    max_attempts = test.settings.get("max_attempts") if test.settings else None
    if max_attempts:
        attempts_count = db.query(TestAttempt).filter(
            TestAttempt.test_id == test_id,
            TestAttempt.student_id == current_user.id
        ).count()
        if attempts_count >= max_attempts:
            raise HTTPException(400, "Maximum attempts reached")

    attempt = TestAttempt(
        test_id=test_id,
        student_id=current_user.id,
        status=AttemptStatus.IN_PROGRESS
    )

    db.add(attempt)
    db.commit()
    db.refresh(attempt)

    # Load questions
    test_questions = (
        db.query(TestQuestion)
        .options(joinedload(TestQuestion.question))
        .filter(TestQuestion.test_id == test_id)
        .order_by(TestQuestion.order_index)
        .all()
    )

    # Shuffle questions if enabled
    if test.settings.get("shuffle_questions"):
        import random
        random.shuffle(test_questions)

    questions = []
    for tq in test_questions:
        q = tq.question
        payload = {
            "id": q.id,
            "type": q.type.value,
            "prompt": q.prompt_rich,
            "points": tq.points,
        }

        if q.type.value == "multiple_choice":
            options = q.options or []
            if test.settings.get("shuffle_options") and q.shuffle_options:
                import random
                options = random.sample(options, len(options))
            payload["options"] = options

        questions.append(payload)

    return {
        "attempt_id": attempt.id,
        "test_id": test.id,
        "test_title": test.title,
        "time_limit_minutes": test.time_limit_minutes,
        "started_at": attempt.started_at,
        "questions": questions,
        "total_points": sum(tq.points for tq in test_questions)
    }


# --------------------------------------------------
# Submit test
# --------------------------------------------------

@router.post("/{test_id}/submit")
def submit_test(
    test_id: int,
    payload: Dict[str, Any],
    current_user: User = Depends(get_current_student),
    db: Session = Depends(get_db)
):
    attempt = db.query(TestAttempt).filter(
        TestAttempt.test_id == test_id,
        TestAttempt.student_id == current_user.id,
        TestAttempt.status == AttemptStatus.IN_PROGRESS
    ).order_by(TestAttempt.started_at.desc()).first()

    if not attempt:
        raise HTTPException(404, "No active attempt")

    test = db.query(Test).filter(Test.id == test_id).first()

    # Enforce time limit
    elapsed_minutes = (datetime.utcnow() - attempt.started_at).total_seconds() / 60
    if elapsed_minutes > test.time_limit_minutes:
        attempt.status = AttemptStatus.TIMED_OUT
        db.commit()
        raise HTTPException(400, "Time limit exceeded")

    answers = payload.get("answers", {})

    test_questions = (
        db.query(TestQuestion)
        .options(joinedload(TestQuestion.question))
        .filter(TestQuestion.test_id == test_id)
        .all()
    )

    total_score = 0
    max_score = 0
    detail = {}

    for tq in test_questions:
        q = tq.question
        qid = str(q.id)
        max_score += tq.points
        student_answer = answers.get(qid)
        points = 0
        correct = False

        if q.autograde:
            if q.type.value == "multiple_choice":
                correct_ids = q.correct_answer.get("correct_option_ids", [])
                if isinstance(student_answer, str):
                    student_answer = [student_answer]
                if set(student_answer or []) == set(correct_ids):
                    points = tq.points
                    correct = True

            elif q.type.value == "open_answer":
                expected = q.expected_answer_config or {}
                if expected.get("mode") == "keywords":
                    keywords = expected.get("keywords", [])
                    if student_answer:
                        matches = sum(
                            1 for kw in keywords
                            if kw["text"].lower() in student_answer.lower()
                        )
                        if matches >= len(keywords) * 0.6:
                            points = tq.points
                            correct = True

        total_score += points
        detail[qid] = {
            "answer": student_answer,
            "correct": correct,
            "points": points,
            "max_points": tq.points
        }

    percentage = (total_score / max_score * 100) if max_score else 0

    attempt.submitted_at = datetime.utcnow()
    attempt.score = percentage
    attempt.detail = detail
    attempt.status = AttemptStatus.COMPLETED

    db.commit()
    db.refresh(attempt)

    return {
        "attempt_id": attempt.id,
        "score": percentage,
        "passed": percentage >= test.passing_score,
        "points_earned": total_score,
        "points_possible": max_score,
        "submitted_at": attempt.submitted_at,
        "results": detail if test.settings.get("show_results_immediately", True) else None
    }


# --------------------------------------------------
# Get attempts for this student
# --------------------------------------------------

@router.get("/{test_id}/attempts")
def get_my_attempts(
    test_id: int,
    current_user: User = Depends(get_current_student),
    db: Session = Depends(get_db)
):
    attempts = (
        db.query(TestAttempt)
        .filter(
            TestAttempt.test_id == test_id,
            TestAttempt.student_id == current_user.id
        )
        .order_by(TestAttempt.started_at.desc())
        .all()
    )

    return {
        "test_id": test_id,
        "attempts": [
            {
                "id": a.id,
                "started_at": a.started_at,
                "submitted_at": a.submitted_at,
                "score": a.score,
                "status": a.status.value,
                "duration_minutes": a.duration_minutes,
            }
            for a in attempts
        ]
    }
