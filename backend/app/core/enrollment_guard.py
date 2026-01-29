"""
Enrollment authorization guard
Checks if user is enrolled in a course before allowing access to course content
"""
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.user import User, SubscriptionType
from app.models.enrollment import CourseEnrollment
from app.models.course import Course
from app.models.unit import Unit


def is_user_enrolled(db: Session, user_id: int, course_id: int) -> bool:
    """Check if user is enrolled in a course"""
    enrollment = db.query(CourseEnrollment).filter(
        CourseEnrollment.user_id == user_id,
        CourseEnrollment.course_id == course_id
    ).first()
    return enrollment is not None


def check_course_access(db: Session, user: User, course_id: int) -> None:
    """
    Check if user has access to a course.
    Raises HTTPException if access is denied.
    
    Rules:
    - Premium users: always have access
    - Free users: must be enrolled in the course
    """
    if user.is_premium:
        return  # Premium users have unlimited access
    
    if not is_user_enrolled(db, user.id, course_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must be enrolled in this course to access its content. Free users can enroll in one course."
        )


def check_unit_access(db: Session, user: User, unit_id: int) -> None:
    """
    Check if user has access to a unit.
    Raises HTTPException if access is denied.
    """
    from fastapi import HTTPException, status
    
    # Get the unit and its course
    unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not unit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Unit not found"
        )
    
    if not unit.course_id:
        # Unit without course - allow access (legacy units)
        return
    
    # Check course access
    check_course_access(db, user, unit.course_id)


def get_user_enrolled_courses(db: Session, user_id: int) -> list[int]:
    """Get list of course IDs the user is enrolled in"""
    enrollments = db.query(CourseEnrollment).filter(
        CourseEnrollment.user_id == user_id
    ).all()
    return [enrollment.course_id for enrollment in enrollments]


def can_enroll_in_course(db: Session, user: User, course_id: int) -> tuple[bool, str]:
    """
    Check if user can enroll in a course.
    Returns (can_enroll, reason)
    """
    # Check if already enrolled
    if is_user_enrolled(db, user.id, course_id):
        return False, "Already enrolled in this course"
    
    # Premium users can enroll in unlimited courses
    if user.is_premium:
        return True, ""
    
    # Free users can only enroll in 1 course
    enrolled_count = db.query(CourseEnrollment).filter(
        CourseEnrollment.user_id == user.id
    ).count()
    
    if enrolled_count >= 1:
        return False, "Free users can only enroll in one course. Please upgrade to Premium."
    
    return True, ""
