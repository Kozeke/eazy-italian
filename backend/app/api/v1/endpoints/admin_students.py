from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.auth import get_current_teacher
from app.models.user import User
from app.models.subscription import (
    Subscription,
    UserSubscription
)
from app.schemas.subscription import ChangeSubscriptionRequest
from app.schemas.user import UserResponse, UserUpdate

router = APIRouter()


@router.get("/admin/students", response_model=list[UserResponse])
def get_students(
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100
):
    user_service = UserService(db)
    return user_service.get_students(skip=skip, limit=limit)


@router.put("/{student_id}/subscription")
def change_student_subscription(
    student_id: int,
    payload: ChangeSubscriptionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher),
):
    # 1️⃣ Ensure student exists
    student = db.query(User).filter(
        User.id == student_id,
        User.role == "student"
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

