from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_, func

from app.core.database import get_db
from app.core.auth import get_current_teacher
from app.models.user import User, UserRole
from app.models.course import Course
from app.models.enrollment import CourseEnrollment
from app.models.subscription import (
    Subscription,
    UserSubscription
)
from app.schemas.subscription import ChangeSubscriptionRequest
from app.schemas.user import UserResponse, UserUpdate
from app.services.user_service import UserService

router = APIRouter()


@router.get("", response_model=list[UserResponse])
def get_students(
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100
):
    """Get students - only students enrolled in current teacher's courses with subscription info"""
    # Get teacher's course IDs
    teacher_course_ids = [c.id for c in db.query(Course.id).filter(
        Course.created_by == current_user.id
    ).all()]
    
    if not teacher_course_ids:
        return []
    
    # Get student IDs enrolled in teacher's courses
    enrolled_student_ids = [e.user_id for e in db.query(CourseEnrollment.user_id).filter(
        CourseEnrollment.course_id.in_(teacher_course_ids)
    ).distinct().all()]
    
    if not enrolled_student_ids:
        return []
    
    # Query students with enrolled courses count and active subscription
    students_query = (
        db.query(
            User,
            func.count(CourseEnrollment.id).label('enrolled_courses_count')
        )
        .outerjoin(CourseEnrollment, CourseEnrollment.user_id == User.id)
        .filter(
            and_(
                User.role == UserRole.STUDENT,
                User.id.in_(enrolled_student_ids)
            )
        )
        .group_by(User.id)
        .offset(skip)
        .limit(limit)
    )
    
    results = students_query.all()
    
    # Convert to response format with enrolled_courses_count
    students_with_count = []
    for student, enrolled_count in results:
        # Get active subscription if exists
        active_user_sub = (
            db.query(UserSubscription)
            .filter(
                UserSubscription.user_id == student.id,
                UserSubscription.is_active == True
            )
            .first()
        )
        
        subscription_name = None
        subscription_ends_at = None
        
        if active_user_sub:
            subscription_name = active_user_sub.subscription.name.value if active_user_sub.subscription else "free"
            subscription_ends_at = active_user_sub.ends_at
        else:
            # Fallback to subscription_type column
            subscription_name = student.subscription_type.value if student.subscription_type else "free"
        
        student_dict = {
            "id": student.id,
            "email": student.email,
            "first_name": student.first_name,
            "last_name": student.last_name,
            "role": student.role,
            "is_active": student.is_active,
            "created_at": student.created_at,
            "last_login": student.last_login,
            "email_verified_at": student.email_verified_at,
            "notification_prefs": student.notification_prefs or {},
            "updated_at": student.updated_at,
            "subscription": subscription_name,
            "subscription_ends_at": subscription_ends_at,
            "enrolled_courses_count": enrolled_count
        }
        students_with_count.append(UserResponse(**student_dict))
    
    return students_with_count


@router.put("/{student_id}/subscription")
def change_student_subscription(
    student_id: int,
    payload: ChangeSubscriptionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher),
):
    """Change student subscription - only for students enrolled in teacher's courses"""
    # Get teacher's course IDs
    teacher_course_ids = [c.id for c in db.query(Course.id).filter(
        Course.created_by == current_user.id
    ).all()]
    
    if not teacher_course_ids:
        raise HTTPException(
            status_code=403, 
            detail="Student is not enrolled in any of your courses"
        )
    
    # Check if student is enrolled in teacher's courses
    is_enrolled = db.query(CourseEnrollment).filter(
        and_(
            CourseEnrollment.user_id == student_id,
            CourseEnrollment.course_id.in_(teacher_course_ids)
        )
    ).first()
    
    if not is_enrolled:
        raise HTTPException(
            status_code=403, 
            detail="Student is not enrolled in any of your courses"
        )
    
    # 1️⃣ Ensure student exists
    student = db.query(User).filter(
        User.id == student_id,
        User.role == UserRole.STUDENT
    ).first()

    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # 2️⃣ Find target subscription
    subscription = db.query(Subscription).filter(
        Subscription.name == payload.subscription,
        Subscription.is_active == True
    ).first()

    if not subscription:
        raise HTTPException(status_code=404, detail="Subscription not found")

    # 3️⃣ Deactivate current subscription(s)
    db.query(UserSubscription).filter(
        UserSubscription.user_id == student_id,
        UserSubscription.is_active == True
    ).update({"is_active": False})

    # 4️⃣ Assign new subscription
    new_sub = UserSubscription(
        user_id=student_id,
        subscription_id=subscription.id,
        ends_at=payload.ends_at,
        is_active=True
    )

    db.add(new_sub)
    db.commit()

    return {
        "student_id": student_id,
        "subscription": subscription.name,
        "ends_at": payload.ends_at
    }

