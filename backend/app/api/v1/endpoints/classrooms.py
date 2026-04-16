"""
Classrooms endpoints (live session management)
"""
from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Dict, Any
from datetime import datetime
from app.core.database import get_db
from app.core.auth import get_current_user, get_current_teacher
from app.core.enrollment_guard import check_course_access
from app.core.websocket_manager import live_session_manager
from app.models.user import User
from app.models.course import Course
from app.models.live_session import LiveSession

router = APIRouter()


class LiveSessionPayload(BaseModel):
    classroom_id: int
    unit_id: int
    slide_index: int
    section: str  # 'slides' | 'task' | 'test'
    teacher_id: int | str
    timestamp: int


@router.get("/classrooms/{classroom_id}/live/session")
def get_live_session(
    classroom_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get the current live session for a classroom (course).
    Returns 204 No Content if no session is active.
    """
    # Verify course exists and user has access
    course = db.query(Course).filter(Course.id == classroom_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Classroom not found")
    
    # Check enrollment for students, or teacher ownership for teachers
    if current_user.role.value == "student":
        check_course_access(db, current_user, classroom_id)
    elif current_user.role.value in ["teacher", "admin"]:
        # Teachers can access their own courses
        if course.created_by != current_user.id and not current_user.is_superuser:
            raise HTTPException(status_code=403, detail="Not authorized")
    
    # Check if there's an active session in database
    active_session = db.query(LiveSession).filter(
        LiveSession.classroom_id == classroom_id
    ).first()
    
    if not active_session:
        return Response(status_code=204)  # No Content
    
    # Get student count from WebSocket manager
    student_count = live_session_manager.get_student_count(classroom_id)
    
    session_data = {
        "classroom_id": active_session.classroom_id,
        "unit_id": active_session.unit_id,
        "slide_index": active_session.slide_index,
        "section": active_session.section,
        "teacher_id": active_session.teacher_id,
        "timestamp": int(active_session.updated_at.timestamp() * 1000),
        "student_count": student_count
    }
    
    return {"session": session_data}


@router.post("/classrooms/{classroom_id}/live/session")
async def create_or_update_live_session(
    classroom_id: int,
    payload: LiveSessionPayload,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """
    Create or update a live session for a classroom (teacher only).
    """
    # Verify course exists and teacher owns it
    course = db.query(Course).filter(Course.id == classroom_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Classroom not found")
    
    if course.created_by != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not authorized to manage this classroom")
    
    # Validate payload matches classroom_id
    if payload.classroom_id != classroom_id:
        raise HTTPException(status_code=400, detail="classroom_id mismatch")
    
    # Store or update the session in database
    existing_session = db.query(LiveSession).filter(
        LiveSession.classroom_id == classroom_id
    ).first()
    
    if existing_session:
        existing_session.unit_id = payload.unit_id
        existing_session.slide_index = payload.slide_index
        existing_session.section = payload.section
        existing_session.updated_at = datetime.utcnow()
        session = existing_session
    else:
        session = LiveSession(
            classroom_id=payload.classroom_id,
            teacher_id=current_user.id,
            unit_id=payload.unit_id,
            slide_index=payload.slide_index,
            section=payload.section
        )
        db.add(session)
    
    db.commit()
    db.refresh(session)
    
    # Broadcast to WebSocket clients
    student_count = live_session_manager.get_student_count(classroom_id)
    await live_session_manager.broadcast_to_classroom(
        classroom_id,
        "SESSION_STARTED" if not existing_session else "SLIDE_CHANGED",
        {
            "classroom_id": session.classroom_id,
            "unit_id": session.unit_id,
            "slide_index": session.slide_index,
            "section": session.section,
            "teacher_id": session.teacher_id,
            "timestamp": int(session.updated_at.timestamp() * 1000),
            "student_count": student_count
        }
    )
    
    session_data = {
        "classroom_id": session.classroom_id,
        "unit_id": session.unit_id,
        "slide_index": session.slide_index,
        "section": session.section,
        "teacher_id": session.teacher_id,
        "timestamp": int(session.updated_at.timestamp() * 1000),
        "student_count": student_count
    }
    
    return {"session": session_data}


@router.delete("/classrooms/{classroom_id}/live/session")
async def end_live_session(
    classroom_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """
    End a live session for a classroom (teacher only).
    """
    # Verify course exists and teacher owns it
    course = db.query(Course).filter(Course.id == classroom_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Classroom not found")
    
    if course.created_by != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not authorized to manage this classroom")
    
    # Remove the session from database
    session = db.query(LiveSession).filter(
        LiveSession.classroom_id == classroom_id
    ).first()
    
    if session:
        db.delete(session)
        db.commit()
        
        # Broadcast SESSION_ENDED to WebSocket clients
        await live_session_manager.broadcast_to_classroom(
            classroom_id,
            "SESSION_ENDED",
            {"classroom_id": classroom_id}
        )
    
    return Response(status_code=204)  # No Content
