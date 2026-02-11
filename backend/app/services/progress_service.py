# app/services/progress_service.py

from sqlalchemy.orm import Session
from sqlalchemy import func, case
from typing import List, Dict

from app.models.test import Test, TestAttempt, AttemptStatus
from app.models.unit import Unit
from app.models.course import Course
from app.models.subscription import UserSubscription, Subscription
from app.models.user import User
from sqlalchemy import func, case, or_


def calculate_progress_for_students(
    student_ids: List[int],
    db: Session,
    teacher_id: int = None
) -> List[dict]:
    """
    Calculate test-based progress for all students
    If teacher_id is provided, only count tests from that teacher's courses
    """

    # Build query for total published tests
    total_tests_query = db.query(func.count(Test.id)).filter(Test.status == "published")
    
    # If teacher_id is provided, filter by teacher's courses
    if teacher_id is not None:
        total_tests_query = (
            total_tests_query
            .join(Unit, Unit.id == Test.unit_id)
            .join(Course, Course.id == Unit.course_id)
            .filter(Course.created_by == teacher_id)
        )
    
    total_published_tests = total_tests_query.scalar() or 0

    # Get student info with their passed tests count
    query = (
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

            func.count(func.distinct(
                case(
                    (
                        (TestAttempt.status == AttemptStatus.COMPLETED)
                        & (TestAttempt.score >= Test.passing_score),
                        Test.id
                    ),
                    else_=None
                )
            )).label("passed_tests")
        )
        .outerjoin(UserSubscription, UserSubscription.user_id == User.id)
        .outerjoin(Subscription, Subscription.id == UserSubscription.subscription_id)
        .outerjoin(TestAttempt, TestAttempt.student_id == User.id)
        .outerjoin(Test, Test.id == TestAttempt.test_id)
        .filter(User.role == "student")
        .filter(User.id.in_(student_ids))
        .filter(
            (UserSubscription.is_active == True) | (UserSubscription.id == None)
        )
    )
    
    # If teacher_id is provided, filter tests by teacher's courses
    if teacher_id is not None:
        query = (
            query
            .outerjoin(Unit, Unit.id == Test.unit_id)
            .outerjoin(Course, Course.id == Unit.course_id)
            .filter(Course.created_by == teacher_id)
        )
    
    rows = (
        query
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
