# app/services/progress_service.py

from sqlalchemy.orm import Session
from sqlalchemy import func, case
from typing import List, Dict

from app.models.test import Test, TestAttempt, AttemptStatus
from app.models.unit import Unit
from app.models.subscription import UserSubscription, Subscription
from app.models.user import User
from sqlalchemy import func, case, or_


def calculate_progress_for_students(
    student_ids: List[int],
    db: Session
) -> List[dict]:
    """
    Calculate test-based progress for all students
    """

    # First, get count of all published tests
    total_published_tests = (
        db.query(func.count(Test.id))
        .filter(Test.status == "published")
        .scalar()
    ) or 0

    # Get student info with their passed tests count
    rows = (
        db.query(
            User.id.label("id"),
            User.email,
            User.first_name,
            User.last_name,
            User.is_active,
            User.created_at,
            User.last_login,

            Subscription.name.label("subscription"),
            UserSubscription.ends_at.label("subscription_ends_at"),

            func.count(
                case(
                    (
                        (TestAttempt.status == AttemptStatus.COMPLETED)
                        & (TestAttempt.score >= Test.passing_score),
                        1
                    ),
                    else_=None
                )
            ).label("passed_tests")
        )
        .outerjoin(UserSubscription, UserSubscription.user_id == User.id)
        .outerjoin(Subscription, Subscription.id == UserSubscription.subscription_id)
        .outerjoin(TestAttempt, TestAttempt.student_id == User.id)
        .outerjoin(Test, Test.id == TestAttempt.test_id)
        .filter(User.role == "student")
        .filter(
            (UserSubscription.is_active == True) | (UserSubscription.id == None)
        )
        .group_by(
            User.id,
            User.email,
            User.first_name,
            User.last_name,
            User.is_active,
            User.created_at,
            User.last_login,
            Subscription.name,
            UserSubscription.ends_at
        )
        .all()
    )

    result = []

    for r in rows:
        passed = r.passed_tests or 0

        result.append({
            "id": r.id,
            "email": r.email,
            "first_name": r.first_name,
            "last_name": r.last_name,
            "is_active": r.is_active,
            "created_at": r.created_at,
            "last_login": r.last_login,

            "subscription": r.subscription or "free",
            "subscription_ends_at": r.subscription_ends_at,

            "total_tests": total_published_tests,
            "passed_tests": passed,
            "progress_percent": round((passed / total_published_tests) * 100) if total_published_tests > 0 else 0
        })

    return result



def calculate_progress_for_student(
    student_id: int,
    db: Session
) -> dict:
    """
    Calculate progress for a single student.
    """

    rows = (
        db.query(
            func.count(Test.id).label("total_tests"),
            func.sum(
                case(
                    (
                        (TestAttempt.status == AttemptStatus.COMPLETED)
                        & (TestAttempt.score >= Test.passing_score),
                        1
                    ),
                    else_=0
                )
            ).label("passed_tests")
        )
        .join(Test, Test.id == TestAttempt.test_id)
        .join(Unit, Unit.id == Test.unit_id)
        .filter(TestAttempt.student_id == student_id)
        .filter(Test.status == "published")
        .filter(Unit.status == "published")
        .first()
    )

    total_tests = rows.total_tests or 0
    passed_tests = rows.passed_tests or 0

    return {
        "total_tests": total_tests,
        "passed_tests": passed_tests,
        "progress_percent": round((passed_tests / total_tests) * 100)
        if total_tests > 0 else 0
    }
