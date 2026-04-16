"""
Student classroom endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from typing import List, Optional
from app.core.database import get_db
from app.core.auth import get_current_student
from app.core.enrollment_guard import get_user_enrolled_courses
from app.models.user import User
from app.models.course import Course
from app.models.enrollment import CourseEnrollment
from app.models.unit import Unit, UnitStatus
from app.models.progress import Progress

router = APIRouter()

# Import LiveSession model for checking active sessions
from app.models.live_session import LiveSession

class JoinClassroomRequest(BaseModel):
    code: str

class JoinClassroomResponse(BaseModel):
    classroom: dict
    message: str

class ClassroomCardData(BaseModel):
    id: int
    name: str
    teacher_name: Optional[str] = None
    course: Optional[dict] = None
    progress: Optional[int] = None  # 0-100
    live_session_active: Optional[bool] = False
    has_new_task: Optional[bool] = False
    has_test_due: Optional[bool] = False

@router.post("/join-classroom", response_model=JoinClassroomResponse)
def join_classroom(
    request: JoinClassroomRequest,
    current_user: User = Depends(get_current_student),
    db: Session = Depends(get_db)
):
    """
    Join a classroom (course) using a join code.
    """
    # Find course by join code
    course = db.query(Course).filter(Course.join_code == request.code).first()
    
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid join code"
        )
    
    # Check if course is available
    if not course.is_available:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Course is not available for enrollment"
        )
    
    # Check if student is already enrolled
    existing_enrollment = db.query(CourseEnrollment).filter(
        CourseEnrollment.user_id == current_user.id,
        CourseEnrollment.course_id == course.id
    ).first()
    
    if existing_enrollment:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You are already enrolled in this course"
        )
    
    # Create enrollment
    enrollment = CourseEnrollment(
        user_id=current_user.id,
        course_id=course.id
    )
    db.add(enrollment)
    
    # Create progress record for first unit
    first_unit = db.query(Unit).filter(
        Unit.course_id == course.id,
        Unit.status == UnitStatus.PUBLISHED,
        Unit.is_visible_to_students == True
    ).order_by(Unit.order_index).first()
    
    if first_unit:
        # Check if progress already exists
        existing_progress = db.query(Progress).filter(
            Progress.student_id == current_user.id,
            Progress.unit_id == first_unit.id
        ).first()
        
        if not existing_progress:
            progress = Progress(
                student_id=current_user.id,
                unit_id=first_unit.id
            )
            db.add(progress)
    
    db.commit()
    db.refresh(enrollment)
    
    # Return course information
    classroom_data = {
        "id": course.id,
        "name": course.title,
        "description": course.description,
        "level": course.level.value if course.level else None,
        "thumbnail_url": course.thumbnail_url,
        "thumbnail_path": course.thumbnail_path,
    }
    
    return JoinClassroomResponse(
        classroom=classroom_data,
        message="Successfully joined the classroom"
    )

@router.get("/classrooms", response_model=List[ClassroomCardData])
def get_my_classrooms(
    current_user: User = Depends(get_current_student),
    db: Session = Depends(get_db)
):
    """
    Get all classrooms (courses) the student is enrolled in.
    Returns data formatted for ClassroomCard component.
    """
    student_id = current_user.id
    
    # Get enrolled course IDs
    enrolled_course_ids = get_user_enrolled_courses(db, student_id)
    
    if not enrolled_course_ids:
        return []
    
    # Get course details with teacher info
    courses = db.query(Course).options(
        joinedload(Course.created_by_user)
    ).filter(Course.id.in_(enrolled_course_ids)).all()
    
    result = []
    for course in courses:
        # Get teacher name
        teacher_name = None
        if course.created_by_user:
            teacher_name = f"{course.created_by_user.first_name} {course.created_by_user.last_name}".strip()
        
        # Calculate progress (simplified - count completed units)
        course_units = db.query(Unit).filter(
            Unit.course_id == course.id,
            Unit.status == UnitStatus.PUBLISHED,
            Unit.is_visible_to_students == True
        ).all()
        
        total_units = len(course_units)
        completed_units = 0
        
        for unit in course_units:
            unit_progress = db.query(Progress).filter(
                Progress.student_id == student_id,
                Progress.unit_id == unit.id
            ).first()
            
            if unit_progress and unit_progress.completion_pct and unit_progress.completion_pct >= 100:
                completed_units += 1
        
        progress = int((completed_units / total_units * 100)) if total_units > 0 else 0
        
        # Build course info
        course_info = {
            "id": course.id,
            "title": course.title,
            "level": course.level.value if course.level else None,
            "thumbnail_url": course.thumbnail_url
        }
        
        # Check if there's an active live session for this course
        active_session = db.query(LiveSession).filter(
            LiveSession.classroom_id == course.id
        ).first()
        live_session_active = active_session is not None
        
        result.append(ClassroomCardData(
            id=course.id,
            name=course.title,
            teacher_name=teacher_name,
            course=course_info,
            progress=progress,
            live_session_active=live_session_active,
            has_new_task=False,  # TODO: Check for new tasks
            has_test_due=False  # TODO: Check for due tests
        ))
    
    return result
