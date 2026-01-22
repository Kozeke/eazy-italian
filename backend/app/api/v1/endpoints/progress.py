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

@router.get("/students")
def get_students_progress(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher)
):
    return calculate_progress_for_students(
        student_ids=[],  # or ignore if you list all
        db=db
    )

