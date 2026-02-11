from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.core.auth import get_current_user, get_current_teacher
from app.models.user import User
from app.models.progress import Progress
from app.schemas.progress import ProgressResponse

router = APIRouter()

# @router.get("/", response_model=List[ProgressResponse])
# def get_progress(
#     current_user: User = Depends(get_current_user),
#     db: Session = Depends(get_db)
# ):
#     progress = db.query(Progress).filter(Progress.student_id == current_user.id).all()
#     return progress

from app.services.progress_service import calculate_progress_for_students
from app.models.user import User, UserRole
from app.models.course import Course
from app.models.enrollment import CourseEnrollment

@router.get("/students")
def get_students_progress(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher)
):
    """Get students progress - only for students enrolled in teacher's courses"""
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
    
    # Calculate progress only for enrolled students, filtered by teacher's courses
    return calculate_progress_for_students(
        student_ids=enrolled_student_ids,
        db=db,
        teacher_id=current_user.id
    )

