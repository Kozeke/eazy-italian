from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List
from app.core.database import get_db
from app.core.auth import get_current_teacher
from app.models.user import User
from app.models.notification import Notification

router = APIRouter()


@router.get("/admin/notifications")
def get_notifications(
    unread_only: bool = False,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher)
):
    """Get notifications for teacher/admin"""
    query = db.query(Notification)
    
    if unread_only:
        query = query.filter(Notification.is_read == False)
    
    notifications = (
        query.order_by(desc(Notification.created_at))
        .limit(limit)
        .all()
    )
    
    return [
        {
            "id": n.id,
            "type": n.type,
            "title": n.title,
            "message": n.message,
            "student_id": n.student_id,
            "student_name": f"{n.student.first_name} {n.student.last_name}" if n.student else "Unknown",
            "related_id": n.related_id,
            "related_type": n.related_type,
            "is_read": n.is_read,
            "created_at": n.created_at,
        }
        for n in notifications
    ]


@router.post("/admin/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher)
):
    """Mark notification as read"""
    notification = db.query(Notification).filter(Notification.id == notification_id).first()
    
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    notification.is_read = True
    db.commit()
    
    return {"success": True}


@router.post("/admin/notifications/read-all")
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher)
):
    """Mark all notifications as read"""
    db.query(Notification).filter(Notification.is_read == False).update({"is_read": True})
    db.commit()
    
    return {"success": True}


@router.get("/admin/notifications/unread-count")
def get_unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher)
):
    """Get count of unread notifications"""
    count = db.query(Notification).filter(Notification.is_read == False).count()
    return {"count": count}
