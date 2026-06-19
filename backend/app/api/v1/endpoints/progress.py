"""
Progress router — partially active during migration.

Architecture change:
  Old model: Progress ORM table + calculate_progress_for_students() service
             that aggregated TaskSubmission and TestAttempt results.
  New model: UnitHomeworkSubmission — per-unit homework tracking with teacher feedback.

WHAT IS COMMENTED OUT:
  - GET /students route  (used calculate_progress_for_students, which reads legacy
    TaskSubmission / TestAttempt; replaced by HomeworkSubmission-based endpoint)
  - import of calculate_progress_for_students  (reads legacy models)

WHAT IS KEPT ALIVE:
  - router = APIRouter()  (import in api.py must not break)
  - A new /students endpoint will be added here once HomeworkSubmission data is stable.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.core.auth import get_current_user, get_current_teacher
from app.models.user import User

# LEGACY: from app.models.progress import Progress                  # → UnitHomeworkSubmission
# LEGACY: from app.schemas.progress import ProgressResponse         # → HomeworkSubmission schema (TBD)

router = APIRouter()

# LEGACY: # Commented-out GET / endpoint (filtered per student — no longer used)
# LEGACY: # @router.get("/", response_model=List[ProgressResponse])
# LEGACY: # def get_progress(
# LEGACY: #     current_user: User = Depends(get_current_user),
# LEGACY: #     db: Session = Depends(get_db)
# LEGACY: # ):
# LEGACY: #     progress = db.query(Progress).filter(Progress.student_id == current_user.id).all()
# LEGACY: #     return progress

# LEGACY: from app.services.progress_service import calculate_progress_for_students  # → HomeworkSubmission-based service (TBD)
from app.models.user import UserRole
from app.models.course import Course
from app.models.enrollment import CourseEnrollment

# ── LEGACY: GET /students ──────────────────────────────────────────────────────
# Replaced by: a new /students endpoint using UnitHomeworkSubmission data.
# This route called calculate_progress_for_students() which read legacy
# TaskSubmission and TestAttempt tables — both are now replaced.
# LEGACY: @router.get("/students")
# LEGACY: def get_students_progress(
# LEGACY:     db: Session = Depends(get_db),
# LEGACY:     current_user: User = Depends(get_current_teacher)
# LEGACY: ):
# LEGACY:     """Get students progress - only for students enrolled in teacher's courses"""
# LEGACY:     # Get teacher's course IDs
# LEGACY:     teacher_course_ids = [c.id for c in db.query(Course.id).filter(
# LEGACY:         Course.created_by == current_user.id
# LEGACY:     ).all()]
# LEGACY:
# LEGACY:     if not teacher_course_ids:
# LEGACY:         return []
# LEGACY:
# LEGACY:     # Get student IDs enrolled in teacher's courses
# LEGACY:     enrolled_student_ids = [e.user_id for e in db.query(CourseEnrollment.user_id).filter(
# LEGACY:         CourseEnrollment.course_id.in_(teacher_course_ids)
# LEGACY:     ).distinct().all()]
# LEGACY:
# LEGACY:     if not enrolled_student_ids:
# LEGACY:         return []
# LEGACY:
# LEGACY:     # Calculate progress only for enrolled students, filtered by teacher's courses
# LEGACY:     return calculate_progress_for_students(
# LEGACY:         student_ids=enrolled_student_ids,
# LEGACY:         db=db,
# LEGACY:         teacher_id=current_user.id
# LEGACY:     )

# TODO: Add new GET /students endpoint here using UnitHomeworkSubmission data
#       once the HomeworkSubmission-based progress calculation service is ready.
