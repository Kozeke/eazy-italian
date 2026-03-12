"""
WebSocket endpoints for live sessions
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Query
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.core.websocket_manager import live_session_manager
from app.core.auth import get_current_user_from_token
from app.models.user import User
from app.models.course import Course
from app.core.enrollment_guard import check_course_access
import json
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/v1/classrooms/{classroom_id}/live")
async def websocket_live_session(
    websocket: WebSocket,
    classroom_id: int,
    token: str = Query(...)
):
    """
    WebSocket endpoint for live classroom sessions.
    
    Query params:
        token: JWT token for authentication
    
    Message format (both directions):
        {
            "event": "SLIDE_CHANGED",
            "payload": {
                "classroom_id": 42,
                "unit_id": 7,
                "slide_index": 3,
                "section": "slides",
                "teacher_id": 1,
                "timestamp": 1710000000000,
                "student_count": 14
            }
        }
    """
    db = SessionLocal()
    try:
        # Authenticate user
        user = get_current_user_from_token(token, db)
        if not user:
            await websocket.close(code=1008, reason="Authentication failed")
            return
        
        # Verify classroom exists
        course = db.query(Course).filter(Course.id == classroom_id).first()
        if not course:
            await websocket.close(code=1008, reason="Classroom not found")
            return
        
        # Determine role
        is_teacher = user.role.value in ["teacher", "admin"] and course.created_by == user.id
        role = "teacher" if is_teacher else "student"
        
        # For students, check enrollment
        if role == "student":
            try:
                check_course_access(db, user, classroom_id)
            except HTTPException:
                await websocket.close(code=1008, reason="Not enrolled in this classroom")
                return
        
        # Connect to the session manager
        await live_session_manager.connect(websocket, classroom_id, user.id, role)
        
        # Send current session state if available (from database)
        from app.models.live_session import LiveSession
        active_session = db.query(LiveSession).filter(
            LiveSession.classroom_id == classroom_id
        ).first()
        
        if active_session:
            await websocket.send_text(json.dumps({
                "event": "SESSION_STARTED",
                "payload": {
                    "classroom_id": active_session.classroom_id,
                    "unit_id": active_session.unit_id,
                    "slide_index": active_session.slide_index,
                    "section": active_session.section,
                    "teacher_id": active_session.teacher_id,
                    "timestamp": int(active_session.updated_at.timestamp() * 1000),
                    "student_count": live_session_manager.get_student_count(classroom_id)
                }
            }))
        
        # Listen for messages
        while True:
            try:
                data = await websocket.receive_text()
                message = json.loads(data)
                
                event = message.get("event")
                payload = message.get("payload", {})
                
                # Only teachers can broadcast
                if role != "teacher":
                    await websocket.send_text(json.dumps({
                        "event": "ERROR",
                        "payload": {"message": "Only teachers can broadcast messages"}
                    }))
                    continue
                
                # Validate payload
                if "classroom_id" not in payload:
                    payload["classroom_id"] = classroom_id
                
                if payload.get("classroom_id") != classroom_id:
                    await websocket.send_text(json.dumps({
                        "event": "ERROR",
                        "payload": {"message": "classroom_id mismatch"}
                    }))
                    continue
                
                # Update database if it's a state-changing event
                if event in ["SESSION_STARTED", "UNIT_CHANGED", "SLIDE_CHANGED", "SECTION_CHANGED"]:
                    from app.models.live_session import LiveSession
                    from datetime import datetime
                    
                    session = db.query(LiveSession).filter(
                        LiveSession.classroom_id == classroom_id
                    ).first()
                    
                    if not session:
                        session = LiveSession(
                            classroom_id=classroom_id,
                            teacher_id=user.id,
                            unit_id=payload.get("unit_id", 0),
                            slide_index=payload.get("slide_index", 0),
                            section=payload.get("section", "slides")
                        )
                        db.add(session)
                    else:
                        session.unit_id = payload.get("unit_id", session.unit_id)
                        session.slide_index = payload.get("slide_index", session.slide_index)
                        session.section = payload.get("section", session.section)
                        session.updated_at = datetime.utcnow()
                    
                    db.commit()
                
                # Broadcast to all clients in the classroom
                payload["student_count"] = live_session_manager.get_student_count(classroom_id)
                await live_session_manager.broadcast_to_classroom(classroom_id, event, payload)
                
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({
                    "event": "ERROR",
                    "payload": {"message": "Invalid JSON"}
                }))
            except Exception as e:
                logger.error(f"Error processing WebSocket message: {e}")
                await websocket.send_text(json.dumps({
                    "event": "ERROR",
                    "payload": {"message": str(e)}
                }))
    
    except WebSocketDisconnect:
        live_session_manager.disconnect(websocket)
        # Update student count for remaining clients
        if classroom_id in live_session_manager.classroom_connections:
            await live_session_manager.broadcast_student_count(classroom_id)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        live_session_manager.disconnect(websocket)
        try:
            await websocket.close(code=1011, reason=str(e))
        except:
            pass
    finally:
        db.close()
