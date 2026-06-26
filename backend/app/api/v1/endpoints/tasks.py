"""
app/api/v1/endpoints/tasks.py — task router (partial migration state)

Active endpoints
----------------
- POST /admin/tasks/upload-file  — filesystem-only file upload for unit materials
  (listening audio/video or reading documents). No dependency on the old Task model.

Architecture note
-----------------
The Task / TaskSubmission models were replaced by exercise blocks stored as
media_blocks JSONB on the Segment model:

  Old: Course → Unit → Task / TaskSubmission
  New: Course → Unit → Segment → media_blocks (exercise blocks)

All Task-model routes below are preserved as LEGACY comments for reference
during the migration. Do NOT re-enable them without migrating callers to the
new segment API.

  - Exercise authoring:  segment block editor (Segment.media_blocks JSONB)
  - Student answers:     UnitHomeworkSubmission.answers JSONB
  - Grading:             UnitHomeworkSubmission teacher feedback fields
"""

# LEGACY: from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks, UploadFile, File
# LEGACY: from sqlalchemy.orm import Session, joinedload
# LEGACY: from sqlalchemy import and_, or_, desc, asc, func, case
# LEGACY: from typing import List, Optional
# LEGACY: from datetime import datetime, timedelta
# LEGACY: import json
# LEGACY: import os
# LEGACY: import uuid

# LEGACY: from app.core.database import get_db
# LEGACY: from app.core.auth import get_current_user, get_current_teacher
# LEGACY: from app.models.user import User
# LEGACY: from app.models.task import Task, TaskSubmission, TaskType, TaskStatus, AutoTaskType, SubmissionStatus
# LEGACY: from app.models.unit import Unit
# LEGACY: from app.schemas.task import (
# LEGACY:     TaskCreate, TaskUpdate, TaskInDB, TaskList, TaskSubmissionCreate, 
# LEGACY:     TaskSubmissionUpdate, TaskSubmissionGrade, TaskSubmissionInDB,
# LEGACY:     TaskStatistics, TaskBulkAction, TaskBulkAssign
# LEGACY: )
# LEGACY: from app.services.user_service import UserService
# LEGACY: from app.services.email_service import EmailService
# LEGACY: from app.services.notification_service import notify_task_submitted

import os
import uuid
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile

from app.core.auth import get_current_teacher
from app.models.user import User
from app.utils.paths import resolve_uploads_path

# Router for this module — only the file-upload utility is active.
# All Task-model routes remain commented out below (see LEGACY sections).
router = APIRouter()


# ---------------------------------------------------------------------------
# File upload utility
# ---------------------------------------------------------------------------

def _get_uploads_path() -> str:
    """Delegates to the canonical uploads-path resolver."""
    return resolve_uploads_path()


@router.post("/admin/tasks/upload-file")
async def upload_task_file(
    files: List[UploadFile] = File(...),
    # Distinguishes between audio/video ('listening') and document ('reading') uploads.
    file_type: str = Query(..., description="Type of file: 'listening' for audio/video, 'reading' for documents"),
    current_user: User = Depends(get_current_teacher),
):
    """Upload one or more files for a listening or reading task/unit material."""

    # Accepted MIME types and extensions for audio/video material.
    listening_mime_types = [
        "audio/mpeg", "audio/mp3", "audio/wav", "audio/wave", "audio/x-wav",
        "audio/ogg", "audio/webm", "audio/aac", "audio/flac",
        "video/mp4", "video/webm", "video/quicktime", "video/x-msvideo",
        "video/x-matroska", "video/ogg", "video/x-flv", "video/3gpp", "video/x-ms-wmv",
    ]
    listening_extensions = [
        ".mp3", ".wav", ".ogg", ".webm", ".aac", ".flac",
        ".mp4", ".mov", ".avi", ".mkv", ".ogv", ".flv", ".3gp", ".wmv",
    ]

    # Accepted MIME types and extensions for document material.
    reading_mime_types = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
        "text/html",
        "application/rtf",
    ]
    reading_extensions = [".pdf", ".doc", ".docx", ".txt", ".html", ".rtf"]

    # Resolve allowed types and storage subfolder based on the requested file_type.
    if file_type == "listening":
        allowed_mime_types = listening_mime_types
        allowed_extensions = listening_extensions
        subfolder = "audio"
    elif file_type == "reading":
        allowed_mime_types = reading_mime_types
        allowed_extensions = reading_extensions
        subfolder = "documents"
    else:
        raise HTTPException(
            status_code=400,
            detail="Invalid file_type. Must be 'listening' or 'reading'",
        )

    # Build the per-user destination directory and ensure it exists.
    uploads_path = _get_uploads_path()
    files_dir = os.path.join(uploads_path, "tasks", subfolder, str(current_user.id))
    os.makedirs(files_dir, exist_ok=True)

    uploaded_files = []

    for file in files:
        # Validate content-type; fall back to extension check when MIME is absent.
        if not file.content_type:
            if file.filename:
                file_ext = os.path.splitext(file.filename)[1].lower()
                if file_ext not in allowed_extensions:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid file type for {file.filename}. Allowed: {', '.join(allowed_extensions)}",
                    )
            else:
                raise HTTPException(status_code=400, detail="File type could not be determined")
        elif file.content_type not in allowed_mime_types:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file type for {file.filename}. Allowed: {', '.join(allowed_extensions)}",
            )

        # Derive extension and produce a collision-safe filename.
        file_ext = os.path.splitext(file.filename or f"file{allowed_extensions[0]}")[1] or allowed_extensions[0]
        filename = f"{uuid.uuid4().hex[:16]}{file_ext}"
        file_path = os.path.join(files_dir, filename)

        # Prevent crash on disk/permission errors.
        try:
            content = await file.read()
            with open(file_path, "wb") as buffer:
                buffer.write(content)
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Error uploading file {file.filename}: {exc}",
            ) from exc

        # Relative path used by the static-file mount (/api/v1/static/…).
        relative_path = f"tasks/{subfolder}/{current_user.id}/{filename}"
        uploaded_files.append(
            {
                "file_path": relative_path,
                "filename": filename,
                "original_filename": file.filename,
                "size": len(content),
                "url": f"/api/v1/static/{relative_path}",
            }
        )

    return {
        "message": f"{len(uploaded_files)} file(s) uploaded successfully",
        "files": uploaded_files,
    }

# LEGACY: # Helper functions
# LEGACY: def get_task_with_relations(db: Session, task_id: int) -> Optional[Task]:
# LEGACY:     """Get task with all related data"""
# LEGACY:     return db.query(Task).options(
# LEGACY:         joinedload(Task.unit),
# LEGACY:         joinedload(Task.created_by_user),
# LEGACY:         joinedload(Task.submissions).joinedload(TaskSubmission.student)
# LEGACY:     ).filter(Task.id == task_id).first()

# LEGACY: def get_course_enrolled_students(db: Session, course_id: int) -> List[int]:
# LEGACY:     """Get all student IDs enrolled in a course"""
# LEGACY:     from app.models.enrollment import CourseEnrollment
# LEGACY:     from app.models.user import UserRole

# LEGACY:     enrollments = db.query(CourseEnrollment.user_id).join(
# LEGACY:         User, User.id == CourseEnrollment.user_id
# LEGACY:     ).filter(
# LEGACY:         CourseEnrollment.course_id == course_id,
# LEGACY:         User.role == UserRole.STUDENT
# LEGACY:     ).all()

# LEGACY:     return [e.user_id for e in enrollments]

# LEGACY: def validate_task_assignment(task_data: dict, db: Session = None, unit_id: int = None) -> None:
# LEGACY:     """Validate task assignment settings"""
# LEGACY:     status_val = task_data.get('status')
# LEGACY:     # Handle both enum and string values
# LEGACY:     is_published = False
# LEGACY:     if isinstance(status_val, TaskStatus):
# LEGACY:         is_published = status_val == TaskStatus.PUBLISHED
# LEGACY:     elif isinstance(status_val, str):
# LEGACY:         is_published = status_val.lower() == 'published'
# LEGACY:     elif hasattr(status_val, 'value'):
# LEGACY:         is_published = status_val.value == 'published'

# LEGACY:     if is_published:
# LEGACY:         has_assignments = (
# LEGACY:             task_data.get('assign_to_all') or 
# LEGACY:             (task_data.get('assigned_cohorts') and len(task_data.get('assigned_cohorts', [])) > 0) or 
# LEGACY:             (task_data.get('assigned_students') and len(task_data.get('assigned_students', [])) > 0)
# LEGACY:         )

# LEGACY:         if not has_assignments:
# LEGACY:             # If task has a unit_id, we can auto-assign to enrolled students
# LEGACY:             # So we allow publishing without explicit assignments
# LEGACY:             check_unit_id = unit_id or task_data.get('unit_id')
# LEGACY:             if check_unit_id and db:
# LEGACY:                 # Check if unit exists and has a course
# LEGACY:                 unit = db.query(Unit).filter(Unit.id == check_unit_id).first()
# LEGACY:                 if unit and unit.course_id:
# LEGACY:                     # Unit has a course, we can auto-assign, so allow it
# LEGACY:                     return

# LEGACY:             # No unit_id or can't auto-assign, require explicit assignment
# LEGACY:             raise HTTPException(
# LEGACY:                 status_code=status.HTTP_400_BAD_REQUEST,
# LEGACY:                 detail="Задание должно быть назначено хотя бы одной аудитории при публикации"
# LEGACY:             )

# LEGACY: def auto_grade_task_submission(task: Task, student_answers: dict) -> dict:
# LEGACY:     """
# LEGACY:     Auto-grade a task submission for listening/reading tasks with questions.
# LEGACY:     Returns dict with score, max_score, and question_results.
# LEGACY:     """
# LEGACY:     if task.type not in [TaskType.LISTENING, TaskType.READING]:
# LEGACY:         return None

# LEGACY:     if not task.questions or len(task.questions) == 0:
# LEGACY:         return None

# LEGACY:     total_score = 0.0
# LEGACY:     max_score = 0.0
# LEGACY:     question_results = {}

# LEGACY:     for index, question in enumerate(task.questions):
# LEGACY:         question_id = question.get('id') or f"q-{index}"
# LEGACY:         question_type = question.get('type', '').lower()
# LEGACY:         correct_answer = question.get('correct_answer')
# LEGACY:         points = question.get('points', 1.0)
# LEGACY:         options = question.get('options', [])

# LEGACY:         max_score += points

# LEGACY:         student_answer = student_answers.get(question_id) or student_answers.get(str(index))
# LEGACY:         points_earned = 0.0
# LEGACY:         is_correct = False

# LEGACY:         if question_type == 'multiple_choice':
# LEGACY:             # For multiple choice, correct_answer is an array
# LEGACY:             # Normalize correct_answer to always be a list
# LEGACY:             if not isinstance(correct_answer, list):
# LEGACY:                 correct_answer = [correct_answer]

# LEGACY:             # Normalize student_answer to always be a list
# LEGACY:             if isinstance(student_answer, str):
# LEGACY:                 student_answer = [student_answer]
# LEGACY:             elif not isinstance(student_answer, list):
# LEGACY:                 student_answer = []

# LEGACY:             # Compare sets to handle order differences
# LEGACY:             correct_set = set(str(c) for c in correct_answer)
# LEGACY:             student_set = set(str(s) for s in student_answer)

# LEGACY:             if correct_set == student_set:
# LEGACY:                 is_correct = True
# LEGACY:                 points_earned = points
# LEGACY:             else:
# LEGACY:                 # Partial credit: correct selections / total correct
# LEGACY:                 correct_selections = len(correct_set & student_set)
# LEGACY:                 if len(correct_set) > 0:
# LEGACY:                     points_earned = points * (correct_selections / len(correct_set))
# LEGACY:                 else:
# LEGACY:                     points_earned = 0.0

# LEGACY:         elif question_type == 'single_choice' or question_type == 'true_false':
# LEGACY:             # For single choice, correct_answer can be a string or array with one element
# LEGACY:             if isinstance(correct_answer, list):
# LEGACY:                 correct_val = correct_answer[0] if len(correct_answer) > 0 else None
# LEGACY:             else:
# LEGACY:                 correct_val = correct_answer

# LEGACY:             if correct_val is not None and str(student_answer) == str(correct_val):
# LEGACY:                 is_correct = True
# LEGACY:                 points_earned = points

# LEGACY:         elif question_type == 'short_answer':
# LEGACY:             # For short answer, check if answer matches (case-insensitive)
# LEGACY:             if isinstance(correct_answer, list):
# LEGACY:                 correct_vals = [str(c).lower().strip() for c in correct_answer]
# LEGACY:             else:
# LEGACY:                 correct_vals = [str(correct_answer).lower().strip()]

# LEGACY:             student_val = str(student_answer).lower().strip() if student_answer else ""
# LEGACY:             if student_val in correct_vals:
# LEGACY:                 is_correct = True
# LEGACY:                 points_earned = points

# LEGACY:         total_score += points_earned

# LEGACY:         question_results[question_id] = {
# LEGACY:             'question': question.get('question', ''),
# LEGACY:             'type': question_type,
# LEGACY:             'student_answer': student_answer,
# LEGACY:             'correct_answer': correct_answer,
# LEGACY:             'is_correct': is_correct,
# LEGACY:             'points_earned': points_earned,
# LEGACY:             'points_possible': points
# LEGACY:         }

# LEGACY:     # Calculate percentage score
# LEGACY:     percentage_score = (total_score / max_score * 100) if max_score > 0 else 0.0

# LEGACY:     return {
# LEGACY:         'score': total_score,
# LEGACY:         'max_score': max_score,
# LEGACY:         'percentage': percentage_score,
# LEGACY:         'question_results': question_results
# LEGACY:     }

# LEGACY: def validate_auto_config(task_data: dict) -> None:
# LEGACY:     """Validate auto-check configuration"""
# LEGACY:     if task_data.get('type') == TaskType.AUTO:
# LEGACY:         auto_type = task_data.get('auto_task_type')
# LEGACY:         auto_config = task_data.get('auto_check_config', {})

# LEGACY:         if not auto_type:
# LEGACY:             raise HTTPException(
# LEGACY:                 status_code=status.HTTP_400_BAD_REQUEST,
# LEGACY:                 detail="Для авто-проверки должен быть указан тип задания"
# LEGACY:             )

# LEGACY:         # Validate based on auto task type
# LEGACY:         if auto_type == AutoTaskType.SCQ:
# LEGACY:             options = auto_config.get('options', [])
# LEGACY:             if len(options) < 2:
# LEGACY:                 raise HTTPException(
# LEGACY:                     status_code=status.HTTP_400_BAD_REQUEST,
# LEGACY:                     detail="SCQ должно иметь минимум 2 варианта ответа"
# LEGACY:                 )
# LEGACY:             if auto_config.get('correct_answer') is None:
# LEGACY:                 raise HTTPException(
# LEGACY:                     status_code=status.HTTP_400_BAD_REQUEST,
# LEGACY:                     detail="SCQ должно иметь правильный ответ"
# LEGACY:                 )

# LEGACY:         elif auto_type == AutoTaskType.MCQ:
# LEGACY:             options = auto_config.get('options', [])
# LEGACY:             if len(options) < 2:
# LEGACY:                 raise HTTPException(
# LEGACY:                     status_code=status.HTTP_400_BAD_REQUEST,
# LEGACY:                     detail="MCQ должно иметь минимум 2 варианта ответа"
# LEGACY:                 )
# LEGACY:             correct_answers = auto_config.get('correct_answers', [])
# LEGACY:             if len(correct_answers) < 1:
# LEGACY:                 raise HTTPException(
# LEGACY:                     status_code=status.HTTP_400_BAD_REQUEST,
# LEGACY:                     detail="MCQ должно иметь минимум 1 правильный ответ"
# LEGACY:                 )

# LEGACY:         elif auto_type == AutoTaskType.GAP_FILL:
# LEGACY:             gaps = auto_config.get('gaps', [])
# LEGACY:             if len(gaps) < 1:
# LEGACY:                 raise HTTPException(
# LEGACY:                     status_code=status.HTTP_400_BAD_REQUEST,
# LEGACY:                     detail="Gap-fill должно иметь минимум 1 пропуск"
# LEGACY:                 )
# LEGACY:             for gap in gaps:
# LEGACY:                 if not gap.get('acceptable_answers'):
# LEGACY:                     raise HTTPException(
# LEGACY:                         status_code=status.HTTP_400_BAD_REQUEST,
# LEGACY:                         detail="Каждый пропуск должен иметь допустимые ответы"
# LEGACY:                     )

# LEGACY: # Task CRUD endpoints

# LEGACY: @router.get("/admin/tasks", response_model=List[TaskList])
# LEGACY: def get_admin_tasks(
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db),
# LEGACY:     skip: int = Query(0, ge=0),
# LEGACY:     limit: int = Query(25, ge=1, le=100),
# LEGACY:     search: Optional[str] = Query(None),
# LEGACY:     unit_id: Optional[int] = Query(None),
# LEGACY:     type: Optional[TaskType] = Query(None),
# LEGACY:     status: Optional[TaskStatus] = Query(None),
# LEGACY:     due_before: Optional[datetime] = Query(None),
# LEGACY:     due_after: Optional[datetime] = Query(None),
# LEGACY:     ungraded_only: bool = Query(False),
# LEGACY:     sort_by: str = Query("created_at"),
# LEGACY:     sort_order: str = Query("desc")
# LEGACY: ):
# LEGACY:     """Get tasks for admin with filtering and pagination - only tasks in teacher's courses"""
# LEGACY:     from app.models.course import Course

# LEGACY:     # Get teacher's course IDs
# LEGACY:     teacher_course_ids = [c.id for c in db.query(Course.id).filter(
# LEGACY:         Course.created_by == current_user.id
# LEGACY:     ).all()]

# LEGACY:     if not teacher_course_ids:
# LEGACY:         return []

# LEGACY:     # Build query - only tasks in units that belong to teacher's courses
# LEGACY:     query = db.query(Task).join(Unit).options(
# LEGACY:         joinedload(Task.unit),
# LEGACY:         joinedload(Task.submissions)
# LEGACY:     ).filter(Unit.course_id.in_(teacher_course_ids))

# LEGACY:     # Apply filters
# LEGACY:     if search:
# LEGACY:         search_filter = or_(
# LEGACY:             Task.title.ilike(f"%{search}%"),
# LEGACY:             Task.description.ilike(f"%{search}%"),
# LEGACY:             Task.instructions.ilike(f"%{search}%")
# LEGACY:         )
# LEGACY:         query = query.filter(search_filter)

# LEGACY:     if unit_id:
# LEGACY:         query = query.filter(Task.unit_id == unit_id)

# LEGACY:     if type:
# LEGACY:         query = query.filter(Task.type == type)

# LEGACY:     if status:
# LEGACY:         query = query.filter(Task.status == status)

# LEGACY:     if due_before:
# LEGACY:         query = query.filter(Task.due_at <= due_before)

# LEGACY:     if due_after:
# LEGACY:         query = query.filter(Task.due_at >= due_after)

# LEGACY:     if ungraded_only:
# LEGACY:         # Filter tasks that have ungraded submissions
# LEGACY:         query = query.filter(Task.submissions.any(
# LEGACY:             and_(TaskSubmission.status == SubmissionStatus.SUBMITTED)
# LEGACY:         ))

# LEGACY:     # Apply sorting
# LEGACY:     if sort_by == "title":
# LEGACY:         sort_field = Task.title
# LEGACY:     elif sort_by == "due_at":
# LEGACY:         sort_field = Task.due_at
# LEGACY:     elif sort_by == "status":
# LEGACY:         sort_field = Task.status
# LEGACY:     elif sort_by == "created_at":
# LEGACY:         sort_field = Task.created_at
# LEGACY:     elif sort_by == "order_index":
# LEGACY:         sort_field = Task.order_index
# LEGACY:     else:
# LEGACY:         sort_field = Task.created_at

# LEGACY:     if sort_order == "desc":
# LEGACY:         query = query.order_by(desc(sort_field))
# LEGACY:     else:
# LEGACY:         query = query.order_by(asc(sort_field))

# LEGACY:     # Apply pagination
# LEGACY:     total = query.count()
# LEGACY:     tasks = query.offset(skip).limit(limit).all()

# LEGACY:     # Get task IDs for batch querying submissions
# LEGACY:     task_ids = [task.id for task in tasks]

# LEGACY:     # Query submission counts directly from database for accuracy
# LEGACY:     if task_ids:
# LEGACY:         # Get all submissions for these tasks
# LEGACY:         all_submissions = db.query(TaskSubmission).filter(
# LEGACY:             TaskSubmission.task_id.in_(task_ids)
# LEGACY:         ).all()

# LEGACY:         # Calculate stats manually for accuracy
# LEGACY:         stats_dict = {}
# LEGACY:         for task_id in task_ids:
# LEGACY:             task_subs = [s for s in all_submissions if s.task_id == task_id]
# LEGACY:             total = len(task_subs)
# LEGACY:             submitted = len([s for s in task_subs if s.status in [SubmissionStatus.SUBMITTED, SubmissionStatus.GRADED]])
# LEGACY:             graded = len([s for s in task_subs if s.status == SubmissionStatus.GRADED])
# LEGACY:             stats_dict[task_id] = {
# LEGACY:                 'total': total,
# LEGACY:                 'submitted': submitted,
# LEGACY:                 'graded': graded
# LEGACY:             }
# LEGACY:     else:
# LEGACY:         stats_dict = {}

# LEGACY:     # Query average scores for graded submissions
# LEGACY:     if task_ids:
# LEGACY:         avg_scores = db.query(
# LEGACY:             TaskSubmission.task_id,
# LEGACY:             func.avg(TaskSubmission.score).label('avg_score')
# LEGACY:         ).filter(
# LEGACY:             and_(
# LEGACY:                 TaskSubmission.task_id.in_(task_ids),
# LEGACY:                 TaskSubmission.status == SubmissionStatus.GRADED,
# LEGACY:                 TaskSubmission.score.isnot(None)
# LEGACY:             )
# LEGACY:         ).group_by(TaskSubmission.task_id).all()

# LEGACY:         avg_scores_dict = {task_id: float(avg_score) for task_id, avg_score in avg_scores}
# LEGACY:     else:
# LEGACY:         avg_scores_dict = {}

# LEGACY:     # Convert to TaskList objects manually
# LEGACY:     result = []
# LEGACY:     for task in tasks:
# LEGACY:         # Get submission stats from database query
# LEGACY:         stats = stats_dict.get(task.id, {'total': 0, 'submitted': 0, 'graded': 0})
# LEGACY:         submission_stats = {
# LEGACY:             "total": stats['total'],
# LEGACY:             "submitted": stats['submitted'],
# LEGACY:             "graded": stats['graded'],
# LEGACY:             "pending": stats['submitted'] - stats['graded']
# LEGACY:         }

# LEGACY:         task_data = {
# LEGACY:             # TaskBase fields
# LEGACY:             "title": task.title,
# LEGACY:             "description": task.description,
# LEGACY:             "instructions": task.instructions,
# LEGACY:             "type": task.type,
# LEGACY:             "auto_task_type": task.auto_task_type,
# LEGACY:             "max_score": task.max_score,
# LEGACY:             "due_at": task.due_at,
# LEGACY:             "allow_late_submissions": task.allow_late_submissions,
# LEGACY:             "late_penalty_percent": task.late_penalty_percent,
# LEGACY:             "max_attempts": task.max_attempts,
# LEGACY:             "order_index": task.order_index,
# LEGACY:             "assign_to_all": task.assign_to_all,
# LEGACY:             "assigned_cohorts": task.assigned_cohorts or [],
# LEGACY:             "assigned_students": task.assigned_students or [],
# LEGACY:             "send_assignment_email": task.send_assignment_email,
# LEGACY:             "reminder_days_before": task.reminder_days_before,
# LEGACY:             "send_results_email": task.send_results_email,
# LEGACY:             "send_teacher_copy": task.send_teacher_copy,

# LEGACY:             # TaskList specific fields
# LEGACY:             "id": task.id,
# LEGACY:             "unit_id": task.unit_id,
# LEGACY:             "status": task.status,
# LEGACY:             "publish_at": task.publish_at,
# LEGACY:             "created_at": task.created_at,
# LEGACY:             "updated_at": task.updated_at,
# LEGACY:             "assigned_student_count": task.assigned_student_count,
# LEGACY:             "submission_stats": submission_stats,
# LEGACY:             "average_score": avg_scores_dict.get(task.id, 0.0),
# LEGACY:             "is_available": task.is_available,
# LEGACY:             "is_overdue": task.is_overdue,
# LEGACY:             "unit_title": task.unit.title if task.unit else None,

# LEGACY:             # Additional fields
# LEGACY:             "auto_check_config": task.auto_check_config or {},
# LEGACY:             "rubric": task.rubric or {},
# LEGACY:             "attachments": task.attachments or []
# LEGACY:         }
# LEGACY:         result.append(TaskList(**task_data))

# LEGACY:     return result

# LEGACY: @router.post("/admin/tasks", response_model=TaskInDB)
# LEGACY: def create_task(
# LEGACY:     task_data: TaskCreate,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Create a new task"""
# LEGACY:     # Convert task_data to dict and ensure enum values are used (not names)
# LEGACY:     # Use model_dump with mode='python' to get Python native types, then convert enums
# LEGACY:     task_dict = task_data.dict(exclude_unset=True)

# LEGACY:     # Validate assignment settings (pass db and unit_id for auto-assignment check)
# LEGACY:     validate_task_assignment(task_dict, db=db, unit_id=task_dict.get('unit_id'))

# LEGACY:     # Validate auto-config if applicable
# LEGACY:     validate_auto_config(task_dict)

# LEGACY:     # Ensure enum values are converted to their string values
# LEGACY:     # Pydantic may serialize enums as their names, so we need to convert them explicitly
# LEGACY:     from app.models.task import TaskType, AutoTaskType, TaskStatus

# LEGACY:     # Convert type enum to lowercase string value
# LEGACY:     if 'type' in task_dict:
# LEGACY:         type_val = task_dict['type']
# LEGACY:         if isinstance(type_val, TaskType):
# LEGACY:             task_dict['type'] = type_val.value  # Use enum value (e.g., "listening")
# LEGACY:         elif isinstance(type_val, str):
# LEGACY:             task_dict['type'] = type_val.lower()  # Ensure lowercase
# LEGACY:         else:
# LEGACY:             # Try to get value attribute
# LEGACY:             task_dict['type'] = getattr(type_val, 'value', str(type_val).lower())

# LEGACY:     # Convert auto_task_type enum to lowercase string value
# LEGACY:     if 'auto_task_type' in task_dict and task_dict['auto_task_type'] is not None:
# LEGACY:         auto_type_val = task_dict['auto_task_type']
# LEGACY:         if isinstance(auto_type_val, AutoTaskType):
# LEGACY:             task_dict['auto_task_type'] = auto_type_val.value
# LEGACY:         elif isinstance(auto_type_val, str):
# LEGACY:             task_dict['auto_task_type'] = auto_type_val.lower()
# LEGACY:         else:
# LEGACY:             task_dict['auto_task_type'] = getattr(auto_type_val, 'value', str(auto_type_val).lower())

# LEGACY:     # Convert status enum to lowercase string value
# LEGACY:     if 'status' in task_dict:
# LEGACY:         status_val = task_dict['status']
# LEGACY:         if isinstance(status_val, TaskStatus):
# LEGACY:             task_dict['status'] = status_val.value  # Use enum value (e.g., "draft")
# LEGACY:         elif isinstance(status_val, str):
# LEGACY:             task_dict['status'] = status_val.lower()
# LEGACY:         else:
# LEGACY:             task_dict['status'] = getattr(status_val, 'value', str(status_val).lower())
# LEGACY:     else:
# LEGACY:         # If status is not provided, default to DRAFT
# LEGACY:         task_dict['status'] = TaskStatus.DRAFT.value
# LEGACY:         print(f"[DEBUG] Status not provided in request, defaulting to DRAFT")

# LEGACY:     # Debug: Print the status value to verify it's set correctly
# LEGACY:     print(f"[DEBUG] Task status value: {task_dict.get('status')}, type: {type(task_dict.get('status'))}")
# LEGACY:     print(f"[DEBUG] Task type value: {task_dict.get('type')}, type: {type(task_dict.get('type'))}")

# LEGACY:     # Create task - set enum fields as enum objects, not strings
# LEGACY:     # SQLAlchemy will use the enum value when saving to database
# LEGACY:     task = Task(
# LEGACY:         created_by=current_user.id
# LEGACY:     )

# LEGACY:     # Set all non-enum fields first
# LEGACY:     for key, value in task_dict.items():
# LEGACY:         if key not in ['type', 'status', 'auto_task_type']:
# LEGACY:             setattr(task, key, value)

# LEGACY:     # Set enum fields as enum objects (SQLAlchemy will use .value for str enums)
# LEGACY:     if 'type' in task_dict:
# LEGACY:         type_str = task_dict['type']
# LEGACY:         # Convert string to enum object
# LEGACY:         try:
# LEGACY:             task.type = TaskType(type_str)  # This will use the value, e.g., TaskType("listening")
# LEGACY:         except ValueError:
# LEGACY:             # If direct conversion fails, try by name
# LEGACY:             task.type = TaskType[type_str.upper()]

# LEGACY:     if 'status' in task_dict:
# LEGACY:         status_str = task_dict['status']
# LEGACY:         try:
# LEGACY:             task.status = TaskStatus(status_str)
# LEGACY:             print(f"[DEBUG] Set task status to: {task.status.value}")
# LEGACY:         except ValueError:
# LEGACY:             try:
# LEGACY:                 task.status = TaskStatus[status_str.upper()]
# LEGACY:                 print(f"[DEBUG] Set task status to (by name): {task.status.value}")
# LEGACY:             except KeyError:
# LEGACY:                 print(f"[DEBUG] Invalid status value: {status_str}, defaulting to DRAFT")
# LEGACY:                 task.status = TaskStatus.DRAFT
# LEGACY:     else:
# LEGACY:         print(f"[DEBUG] Status not in task_dict, using model default (DRAFT)")
# LEGACY:         task.status = TaskStatus.DRAFT

# LEGACY:     # Set publish_at if status is PUBLISHED and publish_at is not already set
# LEGACY:     if task.status == TaskStatus.PUBLISHED and not task.publish_at:
# LEGACY:         task.publish_at = datetime.utcnow()
# LEGACY:         print(f"[DEBUG] Set publish_at to current time for PUBLISHED task")

# LEGACY:     # Auto-assign to all enrolled students if publishing
# LEGACY:     if task.status == TaskStatus.PUBLISHED and task.unit_id:
# LEGACY:         # If assign_to_all is True, assign to all enrolled students in the course
# LEGACY:         if task.assign_to_all:
# LEGACY:             unit = db.query(Unit).filter(Unit.id == task.unit_id).first()
# LEGACY:             if unit and unit.course_id:
# LEGACY:                 # Get all students enrolled in the course
# LEGACY:                 enrolled_student_ids = get_course_enrolled_students(db, unit.course_id)
# LEGACY:                 if enrolled_student_ids:
# LEGACY:                     task.assigned_students = enrolled_student_ids
# LEGACY:                     print(f"[DEBUG] Assigned task to all {len(enrolled_student_ids)} students enrolled in course {unit.course_id}")
# LEGACY:                 else:
# LEGACY:                     print(f"[DEBUG] No students enrolled in course {unit.course_id}")
# LEGACY:         # If no assignments are set, auto-assign to all enrolled students
# LEGACY:         elif not task.assigned_cohorts and not task.assigned_students:
# LEGACY:             # Get the course_id from the unit
# LEGACY:             unit = db.query(Unit).filter(Unit.id == task.unit_id).first()
# LEGACY:             if unit and unit.course_id:
# LEGACY:                 # Get all students enrolled in the course
# LEGACY:                 enrolled_student_ids = get_course_enrolled_students(db, unit.course_id)
# LEGACY:                 if enrolled_student_ids:
# LEGACY:                     task.assigned_students = enrolled_student_ids
# LEGACY:                     print(f"[DEBUG] Auto-assigned task to {len(enrolled_student_ids)} students enrolled in course {unit.course_id}")
# LEGACY:                 else:
# LEGACY:                     print(f"[DEBUG] No students enrolled in course {unit.course_id}, task will be published without assignments")

# LEGACY:     if 'auto_task_type' in task_dict and task_dict['auto_task_type'] is not None:
# LEGACY:         auto_type_str = task_dict['auto_task_type']
# LEGACY:         try:
# LEGACY:             task.auto_task_type = AutoTaskType(auto_type_str)
# LEGACY:         except ValueError:
# LEGACY:             task.auto_task_type = AutoTaskType[auto_type_str.upper()]

# LEGACY:     db.add(task)
# LEGACY:     db.commit()
# LEGACY:     db.refresh(task)

# LEGACY:     return task

# LEGACY: def get_uploads_path():
# LEGACY:     """Get the uploads directory path — delegates to the canonical resolver."""
# LEGACY:     from app.utils.paths import resolve_uploads_path  # noqa: PLC0415
# LEGACY:     return resolve_uploads_path()

# LEGACY: @router.post("/admin/tasks/upload-file")
# LEGACY: async def upload_task_file(
# LEGACY:     files: List[UploadFile] = File(...),
# LEGACY:     file_type: str = Query(..., description="Type of file: 'listening' for audio/video, 'reading' for documents"),
# LEGACY:     current_user: User = Depends(get_current_teacher)
# LEGACY: ):
# LEGACY:     """Upload one or more files for listening or reading task"""

# LEGACY:     # Allowed file types for listening (audio/video)
# LEGACY:     listening_mime_types = [
# LEGACY:         'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav',
# LEGACY:         'audio/ogg', 'audio/webm', 'audio/aac', 'audio/flac',
# LEGACY:         'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
# LEGACY:         'video/x-matroska', 'video/ogg', 'video/x-flv', 'video/3gpp', 'video/x-ms-wmv'
# LEGACY:     ]
# LEGACY:     listening_extensions = ['.mp3', '.wav', '.ogg', '.webm', '.aac', '.flac',
# LEGACY:                             '.mp4', '.webm', '.mov', '.avi', '.mkv', '.ogv', '.flv', '.3gp', '.wmv']

# LEGACY:     # Allowed file types for reading (documents)
# LEGACY:     reading_mime_types = [
# LEGACY:         'application/pdf',
# LEGACY:         'application/msword',
# LEGACY:         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  # .docx
# LEGACY:         'text/plain',
# LEGACY:         'text/html',
# LEGACY:         'application/rtf'
# LEGACY:     ]
# LEGACY:     reading_extensions = ['.pdf', '.doc', '.docx', '.txt', '.html', '.rtf']

# LEGACY:     # Validate file type based on task type
# LEGACY:     if file_type == 'listening':
# LEGACY:         allowed_mime_types = listening_mime_types
# LEGACY:         allowed_extensions = listening_extensions
# LEGACY:         subfolder = 'audio'
# LEGACY:     elif file_type == 'reading':
# LEGACY:         allowed_mime_types = reading_mime_types
# LEGACY:         allowed_extensions = reading_extensions
# LEGACY:         subfolder = 'documents'
# LEGACY:     else:
# LEGACY:         raise HTTPException(status_code=400, detail="Invalid file_type. Must be 'listening' or 'reading'")

# LEGACY:     # Get uploads path
# LEGACY:     uploads_path = get_uploads_path()
# LEGACY:     files_dir = os.path.join(uploads_path, "tasks", subfolder, str(current_user.id))
# LEGACY:     os.makedirs(files_dir, exist_ok=True)

# LEGACY:     uploaded_files = []

# LEGACY:     # Process each file
# LEGACY:     for file in files:
# LEGACY:         # Validate file type
# LEGACY:         if not file.content_type:
# LEGACY:             if file.filename:
# LEGACY:                 file_ext = os.path.splitext(file.filename)[1].lower()
# LEGACY:                 if file_ext not in allowed_extensions:
# LEGACY:                     raise HTTPException(
# LEGACY:                         status_code=400,
# LEGACY:                         detail=f"Invalid file type for {file.filename}. Allowed formats: {', '.join(allowed_extensions)}"
# LEGACY:                     )
# LEGACY:             else:
# LEGACY:                 raise HTTPException(status_code=400, detail="File type could not be determined")
# LEGACY:         elif file.content_type not in allowed_mime_types:
# LEGACY:             raise HTTPException(
# LEGACY:                 status_code=400,
# LEGACY:                 detail=f"Invalid file type for {file.filename}. Allowed formats: {', '.join(allowed_extensions)}"
# LEGACY:             )

# LEGACY:         # Generate filename
# LEGACY:         file_ext = os.path.splitext(file.filename or f'file.{allowed_extensions[0][1:]}')[1] or allowed_extensions[0]
# LEGACY:         filename = f"{uuid.uuid4().hex[:16]}{file_ext}"
# LEGACY:         file_path = os.path.join(files_dir, filename)

# LEGACY:         # Save file
# LEGACY:         try:
# LEGACY:             with open(file_path, "wb") as buffer:
# LEGACY:                 content = await file.read()
# LEGACY:                 buffer.write(content)

# LEGACY:             # Return relative path (relative to uploads directory)
# LEGACY:             relative_path = f"tasks/{subfolder}/{current_user.id}/{filename}"

# LEGACY:             uploaded_files.append({
# LEGACY:                 "file_path": relative_path,
# LEGACY:                 "filename": filename,
# LEGACY:                 "original_filename": file.filename,
# LEGACY:                 "size": len(content),
# LEGACY:                 "url": f"/api/v1/static/{relative_path}"  # URL to access the file via static mount
# LEGACY:             })
# LEGACY:         except Exception as e:
# LEGACY:             raise HTTPException(status_code=500, detail=f"Error uploading file {file.filename}: {str(e)}")

# LEGACY:     return {
# LEGACY:         "message": f"{len(uploaded_files)} file(s) uploaded successfully",
# LEGACY:         "files": uploaded_files
# LEGACY:     }

# LEGACY: @router.get("/admin/tasks/{task_id}", response_model=TaskInDB)
# LEGACY: def get_admin_task(
# LEGACY:     task_id: int,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Get task details for admin"""
# LEGACY:     task = get_task_with_relations(db, task_id)
# LEGACY:     if not task:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_404_NOT_FOUND,
# LEGACY:             detail="Задание не найдено"
# LEGACY:         )

# LEGACY:     return task

# LEGACY: @router.put("/admin/tasks/{task_id}", response_model=TaskInDB)
# LEGACY: def update_task(
# LEGACY:     task_id: int,
# LEGACY:     task_data: TaskUpdate,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Update a task"""
# LEGACY:     task = db.query(Task).filter(Task.id == task_id).first()
# LEGACY:     if not task:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_404_NOT_FOUND,
# LEGACY:             detail="Задание не найдено"
# LEGACY:         )

# LEGACY:     # Validate assignment settings
# LEGACY:     update_data = task_data.dict(exclude_unset=True)

# LEGACY:     # For validation, merge update data with existing task data
# LEGACY:     # This ensures validation checks the final state after update would be applied
# LEGACY:     validation_data = {
# LEGACY:         'status': update_data.get('status', task.status),
# LEGACY:         'assign_to_all': update_data.get('assign_to_all', task.assign_to_all),
# LEGACY:         'assigned_cohorts': update_data.get('assigned_cohorts', task.assigned_cohorts or []),
# LEGACY:         'assigned_students': update_data.get('assigned_students', task.assigned_students or []),
# LEGACY:         'unit_id': update_data.get('unit_id', task.unit_id)
# LEGACY:     }

# LEGACY:     validate_task_assignment(validation_data, db=db, unit_id=validation_data.get('unit_id'))
# LEGACY:     validate_auto_config(update_data)

# LEGACY:     # Ensure enum values are converted to their string values
# LEGACY:     if 'type' in update_data and hasattr(update_data['type'], 'value'):
# LEGACY:         update_data['type'] = update_data['type'].value
# LEGACY:     if 'auto_task_type' in update_data and update_data['auto_task_type'] is not None and hasattr(update_data['auto_task_type'], 'value'):
# LEGACY:         update_data['auto_task_type'] = update_data['auto_task_type'].value
# LEGACY:     if 'status' in update_data and hasattr(update_data['status'], 'value'):
# LEGACY:         update_data['status'] = update_data['status'].value

# LEGACY:     # Update task
# LEGACY:     for field, value in update_data.items():
# LEGACY:         setattr(task, field, value)

# LEGACY:     # Check if status is being changed to PUBLISHED
# LEGACY:     new_status = update_data.get('status')
# LEGACY:     is_being_published = False
# LEGACY:     if new_status:
# LEGACY:         if isinstance(new_status, TaskStatus):
# LEGACY:             is_being_published = new_status == TaskStatus.PUBLISHED
# LEGACY:         elif isinstance(new_status, str):
# LEGACY:             is_being_published = new_status.lower() == 'published'
# LEGACY:         elif hasattr(new_status, 'value'):
# LEGACY:             is_being_published = new_status.value == 'published'

# LEGACY:     # Auto-assign to all enrolled students if publishing
# LEGACY:     if is_being_published and task.unit_id:
# LEGACY:         # Check final assignment state after update
# LEGACY:         final_assign_to_all = update_data.get('assign_to_all', task.assign_to_all)
# LEGACY:         final_assigned_cohorts = update_data.get('assigned_cohorts', task.assigned_cohorts or [])
# LEGACY:         final_assigned_students = update_data.get('assigned_students', task.assigned_students or [])

# LEGACY:         # If assign_to_all is True, assign to all enrolled students in the course
# LEGACY:         if final_assign_to_all:
# LEGACY:             unit = db.query(Unit).filter(Unit.id == task.unit_id).first()
# LEGACY:             if unit and unit.course_id:
# LEGACY:                 # Get all students enrolled in the course
# LEGACY:                 enrolled_student_ids = get_course_enrolled_students(db, unit.course_id)
# LEGACY:                 if enrolled_student_ids:
# LEGACY:                     task.assigned_students = enrolled_student_ids
# LEGACY:                     print(f"[DEBUG] Assigned task to all {len(enrolled_student_ids)} students enrolled in course {unit.course_id}")
# LEGACY:                 else:
# LEGACY:                     print(f"[DEBUG] No students enrolled in course {unit.course_id}")
# LEGACY:         # If no assignments are set, auto-assign to all enrolled students
# LEGACY:         elif not final_assigned_cohorts and not final_assigned_students:
# LEGACY:             # Get the course_id from the unit
# LEGACY:             unit = db.query(Unit).filter(Unit.id == task.unit_id).first()
# LEGACY:             if unit and unit.course_id:
# LEGACY:                 # Get all students enrolled in the course
# LEGACY:                 enrolled_student_ids = get_course_enrolled_students(db, unit.course_id)
# LEGACY:                 if enrolled_student_ids:
# LEGACY:                     task.assigned_students = enrolled_student_ids
# LEGACY:                     print(f"[DEBUG] Auto-assigned task to {len(enrolled_student_ids)} students enrolled in course {unit.course_id}")
# LEGACY:                 else:
# LEGACY:                     print(f"[DEBUG] No students enrolled in course {unit.course_id}, task will be published without assignments")

# LEGACY:     # Set publish_at if status is being changed to PUBLISHED and publish_at is not already set
# LEGACY:     if is_being_published and not task.publish_at:
# LEGACY:         task.publish_at = datetime.utcnow()
# LEGACY:         print(f"[DEBUG] Set publish_at to current time for PUBLISHED task")

# LEGACY:     task.updated_at = datetime.utcnow()
# LEGACY:     db.commit()
# LEGACY:     db.refresh(task)

# LEGACY:     return task

# LEGACY: @router.delete("/admin/tasks/{task_id}")
# LEGACY: def delete_task(
# LEGACY:     task_id: int,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Delete a task"""
# LEGACY:     task = db.query(Task).filter(Task.id == task_id).first()
# LEGACY:     if not task:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_404_NOT_FOUND,
# LEGACY:             detail="Задание не найдено"
# LEGACY:         )

# LEGACY:     # Check if task has submissions by querying the database directly
# LEGACY:     submission_count = db.query(TaskSubmission).filter(TaskSubmission.task_id == task_id).count()
# LEGACY:     if submission_count > 0:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_400_BAD_REQUEST,
# LEGACY:             detail="Нельзя удалить задание с существующими сдачами"
# LEGACY:         )

# LEGACY:     db.delete(task)
# LEGACY:     db.commit()

# LEGACY:     return {"message": "Задание удалено"}

# LEGACY: # Bulk operations
# LEGACY: @router.post("/admin/tasks/bulk-action")
# LEGACY: def bulk_action_tasks(
# LEGACY:     bulk_action: TaskBulkAction,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Perform bulk actions on tasks"""
# LEGACY:     tasks = db.query(Task).filter(Task.id.in_(bulk_action.task_ids)).all()

# LEGACY:     if len(tasks) != len(bulk_action.task_ids):
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_400_BAD_REQUEST,
# LEGACY:             detail="Некоторые задания не найдены"
# LEGACY:         )

# LEGACY:     updated_count = 0

# LEGACY:     for task in tasks:
# LEGACY:         if bulk_action.action == "publish":
# LEGACY:             task.status = TaskStatus.PUBLISHED
# LEGACY:             task.publish_at = datetime.utcnow()
# LEGACY:         elif bulk_action.action == "unpublish":
# LEGACY:             task.status = TaskStatus.DRAFT
# LEGACY:             task.publish_at = None
# LEGACY:         elif bulk_action.action == "archive":
# LEGACY:             task.status = TaskStatus.ARCHIVED
# LEGACY:         elif bulk_action.action == "duplicate":
# LEGACY:             # Create a copy of the task
# LEGACY:             new_task = Task(
# LEGACY:                 title=f"{task.title} (копия)",
# LEGACY:                 description=task.description,
# LEGACY:                 instructions=task.instructions,
# LEGACY:                 type=task.type,
# LEGACY:                 auto_task_type=task.auto_task_type,
# LEGACY:                 max_score=task.max_score,
# LEGACY:                 due_at=task.due_at,
# LEGACY:                 allow_late_submissions=task.allow_late_submissions,
# LEGACY:                 late_penalty_percent=task.late_penalty_percent,
# LEGACY:                 max_attempts=task.max_attempts,
# LEGACY:                 order_index=task.order_index,
# LEGACY:                 attachments=task.attachments.copy() if task.attachments else [],
# LEGACY:                 rubric=task.rubric.copy() if task.rubric else {},
# LEGACY:                 auto_check_config=task.auto_check_config.copy() if task.auto_check_config else {},
# LEGACY:                 assign_to_all=task.assign_to_all,
# LEGACY:                 assigned_cohorts=task.assigned_cohorts.copy() if task.assigned_cohorts else [],
# LEGACY:                 assigned_students=task.assigned_students.copy() if task.assigned_students else [],
# LEGACY:                 send_assignment_email=task.send_assignment_email,
# LEGACY:                 reminder_days_before=task.reminder_days_before,
# LEGACY:                 send_results_email=task.send_results_email,
# LEGACY:                 send_teacher_copy=task.send_teacher_copy,
# LEGACY:                 status=TaskStatus.DRAFT,
# LEGACY:                 unit_id=task.unit_id,
# LEGACY:                 created_by=current_user.id
# LEGACY:             )
# LEGACY:             db.add(new_task)
# LEGACY:             updated_count += 1
# LEGACY:             continue

# LEGACY:         updated_count += 1

# LEGACY:     db.commit()

# LEGACY:     return {
# LEGACY:         "message": f"Обновлено {updated_count} заданий",
# LEGACY:         "updated_count": updated_count
# LEGACY:     }

# LEGACY: @router.post("/admin/tasks/bulk-assign")
# LEGACY: def bulk_assign_tasks(
# LEGACY:     bulk_assign: TaskBulkAssign,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Bulk assign tasks to students/cohorts"""
# LEGACY:     tasks = db.query(Task).filter(Task.id.in_(bulk_assign.task_ids)).all()

# LEGACY:     if len(tasks) != len(bulk_assign.task_ids):
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_400_BAD_REQUEST,
# LEGACY:             detail="Некоторые задания не найдены"
# LEGACY:         )

# LEGACY:     for task in tasks:
# LEGACY:         task.assign_to_all = bulk_assign.assign_to_all
# LEGACY:         task.assigned_cohorts = bulk_assign.cohort_ids
# LEGACY:         task.assigned_students = bulk_assign.student_ids

# LEGACY:     db.commit()

# LEGACY:     return {
# LEGACY:         "message": f"Назначено {len(tasks)} заданий",
# LEGACY:         "assigned_count": len(tasks)
# LEGACY:     }

# LEGACY: # Task submissions management
# LEGACY: @router.get("/admin/tasks/{task_id}/submissions", response_model=List[TaskSubmissionInDB])
# LEGACY: def get_task_submissions(
# LEGACY:     task_id: int,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db),
# LEGACY:     skip: int = Query(0, ge=0),
# LEGACY:     limit: int = Query(25, ge=1, le=100),
# LEGACY:     status: Optional[SubmissionStatus] = Query(None),
# LEGACY:     search: Optional[str] = Query(None)
# LEGACY: ):
# LEGACY:     """Get submissions for a task - only if task is created by current teacher"""
# LEGACY:     task = db.query(Task).filter(
# LEGACY:         Task.id == task_id,
# LEGACY:         Task.created_by == current_user.id
# LEGACY:     ).first()
# LEGACY:     if not task:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_404_NOT_FOUND,
# LEGACY:             detail="Задание не найдено"
# LEGACY:         )

# LEGACY:     query = db.query(TaskSubmission).options(
# LEGACY:         joinedload(TaskSubmission.student),
# LEGACY:         joinedload(TaskSubmission.grader)
# LEGACY:     ).filter(TaskSubmission.task_id == task_id)

# LEGACY:     if status:
# LEGACY:         query = query.filter(TaskSubmission.status == status)

# LEGACY:     if search:
# LEGACY:         query = query.join(User, TaskSubmission.student_id == User.id).filter(
# LEGACY:             or_(
# LEGACY:                 User.first_name.ilike(f"%{search}%"),
# LEGACY:                 User.last_name.ilike(f"%{search}%"),
# LEGACY:                 User.email.ilike(f"%{search}%")
# LEGACY:             )
# LEGACY:         )

# LEGACY:     submissions = query.offset(skip).limit(limit).all()

# LEGACY:     # Computed properties (is_submitted, is_graded, is_late, final_score) 
# LEGACY:     # are automatically available via the model's @property decorators
# LEGACY:     # Add student_name for response
# LEGACY:     for submission in submissions:
# LEGACY:         if submission.student:
# LEGACY:             submission.student_name = f"{submission.student.first_name} {submission.student.last_name}"
# LEGACY:         if submission.grader:
# LEGACY:             submission.grader_name = f"{submission.grader.first_name} {submission.grader.last_name}"

# LEGACY:     return submissions

# LEGACY: @router.get("/admin/tasks/{task_id}/submissions/{submission_id}", response_model=TaskSubmissionInDB)
# LEGACY: def get_task_submission(
# LEGACY:     task_id: int,
# LEGACY:     submission_id: int,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Get task submission - only if task is created by current teacher"""
# LEGACY:     # First verify the task belongs to the teacher
# LEGACY:     task = db.query(Task).filter(
# LEGACY:         Task.id == task_id,
# LEGACY:         Task.created_by == current_user.id
# LEGACY:     ).first()
# LEGACY:     if not task:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_404_NOT_FOUND,
# LEGACY:             detail="Задание не найдено"
# LEGACY:         )

# LEGACY:     submission = db.query(TaskSubmission).options(
# LEGACY:         joinedload(TaskSubmission.student),
# LEGACY:         joinedload(TaskSubmission.grader),
# LEGACY:         joinedload(TaskSubmission.task)
# LEGACY:     ).filter(
# LEGACY:         and_(
# LEGACY:             TaskSubmission.id == submission_id,
# LEGACY:             TaskSubmission.task_id == task_id
# LEGACY:         )
# LEGACY:     ).first()

# LEGACY:     if not submission:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_404_NOT_FOUND,
# LEGACY:             detail="Сдача не найдена"
# LEGACY:         )

# LEGACY:     # Computed properties (is_submitted, is_graded, is_late, final_score) 
# LEGACY:     # are automatically available via the model's @property decorators
# LEGACY:     # Add student_name for response
# LEGACY:     if submission.student:
# LEGACY:         submission.student_name = f"{submission.student.first_name} {submission.student.last_name}"
# LEGACY:     if submission.grader:
# LEGACY:         submission.grader_name = f"{submission.grader.first_name} {submission.grader.last_name}"

# LEGACY:     return submission

# LEGACY: @router.post("/admin/tasks/{task_id}/submissions/{submission_id}/grade", response_model=TaskSubmissionInDB)
# LEGACY: def grade_submission(
# LEGACY:     task_id: int,
# LEGACY:     submission_id: int,
# LEGACY:     grade_data: TaskSubmissionGrade,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Grade a submission"""
# LEGACY:     submission = db.query(TaskSubmission).filter(
# LEGACY:         and_(
# LEGACY:             TaskSubmission.id == submission_id,
# LEGACY:             TaskSubmission.task_id == task_id
# LEGACY:         )
# LEGACY:     ).first()

# LEGACY:     if not submission:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_404_NOT_FOUND,
# LEGACY:             detail="Сдача не найдена"
# LEGACY:         )

# LEGACY:     if submission.status != SubmissionStatus.SUBMITTED:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_400_BAD_REQUEST,
# LEGACY:             detail="Можно оценивать только отправленные сдачи"
# LEGACY:         )

# LEGACY:     # Update submission
# LEGACY:     submission.score = grade_data.score
# LEGACY:     submission.feedback_rich = grade_data.feedback_rich
# LEGACY:     submission.status = SubmissionStatus.GRADED
# LEGACY:     submission.graded_at = datetime.utcnow()
# LEGACY:     submission.grader_id = current_user.id

# LEGACY:     db.commit()
# LEGACY:     db.refresh(submission)

# LEGACY:     # Note: Student notifications for grading can be added here if needed
# LEGACY:     # For now, we'll skip email notifications as per user's request

# LEGACY:     # Computed properties (is_submitted, is_graded, is_late, final_score) 
# LEGACY:     # are automatically available via the model's @property decorators

# LEGACY:     return submission

# LEGACY: # Task statistics
# LEGACY: @router.get("/admin/tasks/{task_id}/statistics", response_model=TaskStatistics)
# LEGACY: def get_task_statistics(
# LEGACY:     task_id: int,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Get task statistics"""
# LEGACY:     task = db.query(Task).options(
# LEGACY:         joinedload(Task.submissions)
# LEGACY:     ).filter(Task.id == task_id).first()

# LEGACY:     if not task:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_404_NOT_FOUND,
# LEGACY:             detail="Задание не найдено"
# LEGACY:         )

# LEGACY:     submissions = task.submissions
# LEGACY:     total_submissions = len(submissions)
# LEGACY:     submitted_count = len([s for s in submissions if s.status == SubmissionStatus.SUBMITTED])
# LEGACY:     graded_count = len([s for s in submissions if s.status == SubmissionStatus.GRADED])
# LEGACY:     pending_count = submitted_count - graded_count

# LEGACY:     # Calculate average score
# LEGACY:     graded_submissions = [s for s in submissions if s.status == SubmissionStatus.GRADED and s.score is not None]
# LEGACY:     average_score = sum(s.score for s in graded_submissions) / len(graded_submissions) if graded_submissions else 0

# LEGACY:     # Calculate completion rate
# LEGACY:     completion_rate = (submitted_count / total_submissions * 100) if total_submissions > 0 else 0

# LEGACY:     # Calculate average time
# LEGACY:     time_spent_submissions = [s for s in submissions if s.time_spent_minutes is not None]
# LEGACY:     average_time_minutes = sum(s.time_spent_minutes for s in time_spent_submissions) / len(time_spent_submissions) if time_spent_submissions else None

# LEGACY:     # Score distribution
# LEGACY:     score_distribution = {
# LEGACY:         "0-20": 0,
# LEGACY:         "21-40": 0,
# LEGACY:         "41-60": 0,
# LEGACY:         "61-80": 0,
# LEGACY:         "81-100": 0
# LEGACY:     }

# LEGACY:     for submission in graded_submissions:
# LEGACY:         if submission.score is not None:
# LEGACY:             if submission.score <= 20:
# LEGACY:                 score_distribution["0-20"] += 1
# LEGACY:             elif submission.score <= 40:
# LEGACY:                 score_distribution["21-40"] += 1
# LEGACY:             elif submission.score <= 60:
# LEGACY:                 score_distribution["41-60"] += 1
# LEGACY:             elif submission.score <= 80:
# LEGACY:                 score_distribution["61-80"] += 1
# LEGACY:             else:
# LEGACY:                 score_distribution["81-100"] += 1

# LEGACY:     return TaskStatistics(
# LEGACY:         total_submissions=total_submissions,
# LEGACY:         submitted_count=submitted_count,
# LEGACY:         graded_count=graded_count,
# LEGACY:         pending_count=pending_count,
# LEGACY:         average_score=average_score,
# LEGACY:         completion_rate=completion_rate,
# LEGACY:         average_time_minutes=average_time_minutes,
# LEGACY:         score_distribution=score_distribution
# LEGACY:     )

# LEGACY: # Student-facing endpoints
# LEGACY: @router.get("", response_model=List[TaskList])
# LEGACY: def get_student_tasks(
# LEGACY:     current_user: User = Depends(get_current_user),
# LEGACY:     db: Session = Depends(get_db),
# LEGACY:     unit_id: Optional[int] = Query(None)
# LEGACY: ):
# LEGACY:     """Get tasks available to the current student - only from enrolled courses"""
# LEGACY:     from app.models.course import Course
# LEGACY:     from app.models.enrollment import CourseEnrollment
# LEGACY:     from app.core.enrollment_guard import get_user_enrolled_courses

# LEGACY:     # Get enrolled course IDs for the student
# LEGACY:     enrolled_course_ids = get_user_enrolled_courses(db, current_user.id)

# LEGACY:     print(f"[DEBUG] Student {current_user.id} enrolled in courses: {enrolled_course_ids}")

# LEGACY:     if not enrolled_course_ids:
# LEGACY:         # Student is not enrolled in any courses, return empty list
# LEGACY:         print(f"[DEBUG] Student {current_user.id} is not enrolled in any courses")
# LEGACY:         return []

# LEGACY:     # Build query: tasks from units that belong to enrolled courses
# LEGACY:     # Include PUBLISHED tasks and SCHEDULED tasks where publish_at has passed
# LEGACY:     # Exclude DRAFT and ARCHIVED tasks
# LEGACY:     from app.models.course import Course
# LEGACY:     from datetime import timezone
# LEGACY:     now = datetime.now(timezone.utc)
# LEGACY:     query = db.query(Task).join(Unit).options(
# LEGACY:         joinedload(Task.unit).joinedload(Unit.course)
# LEGACY:     ).filter(
# LEGACY:         and_(
# LEGACY:             or_(
# LEGACY:                 Task.status == TaskStatus.PUBLISHED,
# LEGACY:                 and_(
# LEGACY:                     Task.status == TaskStatus.SCHEDULED,
# LEGACY:                     Task.publish_at <= now
# LEGACY:                 )
# LEGACY:             ),
# LEGACY:             Task.status != TaskStatus.DRAFT,
# LEGACY:             Task.status != TaskStatus.ARCHIVED,
# LEGACY:             Unit.course_id.in_(enrolled_course_ids)
# LEGACY:         )
# LEGACY:     )

# LEGACY:     if unit_id:
# LEGACY:         query = query.filter(Task.unit_id == unit_id)

# LEGACY:     tasks = query.all()

# LEGACY:     print(f"[DEBUG] Found {len(tasks)} tasks for student {current_user.id} from enrolled courses")
# LEGACY:     if tasks:
# LEGACY:         print(f"[DEBUG] Task statuses: {[t.status for t in tasks]}")
# LEGACY:         print(f"[DEBUG] Task IDs: {[t.id for t in tasks]}")

# LEGACY:     # Filter by availability and assignment
# LEGACY:     # Tasks with assign_to_all=True are available to all students in the course
# LEGACY:     # Tasks with assigned_students list should include current_user.id
# LEGACY:     # If no assignment restrictions, include it for all enrolled students
# LEGACY:     filtered_tasks = []
# LEGACY:     for task in tasks:
# LEGACY:         # Only include tasks that are available (using the is_available property)
# LEGACY:         if not task.is_available:
# LEGACY:             print(f"[DEBUG] Task {task.id} is not available (status: {task.status}, publish_at: {task.publish_at})")
# LEGACY:             continue
# LEGACY:         # If task is assigned to all students in the course, include it
# LEGACY:         if task.assign_to_all:
# LEGACY:             filtered_tasks.append(task)
# LEGACY:         # If task has specific student assignments, check if current user is assigned
# LEGACY:         elif task.assigned_students and len(task.assigned_students) > 0:
# LEGACY:             if current_user.id in task.assigned_students:
# LEGACY:                 filtered_tasks.append(task)
# LEGACY:         # If no assignment restrictions (assign_to_all=False and no assigned_students),
# LEGACY:         # include it for all students in the course (default behavior)
# LEGACY:         else:
# LEGACY:             filtered_tasks.append(task)

# LEGACY:     print(f"[DEBUG] After filtering, {len(filtered_tasks)} tasks available for student {current_user.id}")

# LEGACY:     # Get student's submissions for all tasks in one query
# LEGACY:     task_ids = [task.id for task in filtered_tasks]
# LEGACY:     student_submissions = {}
# LEGACY:     if task_ids:
# LEGACY:         submissions = db.query(TaskSubmission).filter(
# LEGACY:             and_(
# LEGACY:                 TaskSubmission.task_id.in_(task_ids),
# LEGACY:                 TaskSubmission.student_id == current_user.id
# LEGACY:             )
# LEGACY:         ).all()
# LEGACY:         for submission in submissions:
# LEGACY:             if submission.task_id not in student_submissions:
# LEGACY:                 student_submissions[submission.task_id] = []
# LEGACY:             student_submissions[submission.task_id].append(submission)

# LEGACY:     # Convert to TaskList objects manually (similar to get_admin_tasks)
# LEGACY:     result = []
# LEGACY:     for task in filtered_tasks:
# LEGACY:         # Get student's latest submission for this task
# LEGACY:         student_task_submissions = student_submissions.get(task.id, [])
# LEGACY:         latest_submission = None
# LEGACY:         if student_task_submissions:
# LEGACY:             # Get the latest submission (highest attempt_number or most recent)
# LEGACY:             latest_submission = max(student_task_submissions, key=lambda s: (s.attempt_number, s.submitted_at or datetime.min))

# LEGACY:         # Get course info
# LEGACY:         course_title = None
# LEGACY:         if task.unit and task.unit.course:
# LEGACY:             course_title = task.unit.course.title

# LEGACY:         task_data = {
# LEGACY:             # TaskBase fields
# LEGACY:             "title": task.title,
# LEGACY:             "description": task.description,
# LEGACY:             "instructions": task.instructions,
# LEGACY:             "type": task.type,
# LEGACY:             "auto_task_type": task.auto_task_type,
# LEGACY:             "max_score": task.max_score,
# LEGACY:             "due_at": task.due_at,
# LEGACY:             "allow_late_submissions": task.allow_late_submissions,
# LEGACY:             "late_penalty_percent": task.late_penalty_percent,
# LEGACY:             "max_attempts": task.max_attempts,
# LEGACY:             "order_index": task.order_index,
# LEGACY:             "assign_to_all": task.assign_to_all,
# LEGACY:             "assigned_cohorts": task.assigned_cohorts or [],
# LEGACY:             "assigned_students": task.assigned_students or [],
# LEGACY:             "send_assignment_email": task.send_assignment_email,
# LEGACY:             "reminder_days_before": task.reminder_days_before,
# LEGACY:             "send_results_email": task.send_results_email,
# LEGACY:             "send_teacher_copy": task.send_teacher_copy,
# LEGACY:             # TaskList specific fields
# LEGACY:             "id": task.id,
# LEGACY:             "unit_id": task.unit_id,
# LEGACY:             "status": task.status,
# LEGACY:             "publish_at": task.publish_at,
# LEGACY:             "created_at": task.created_at,
# LEGACY:             "updated_at": task.updated_at,
# LEGACY:             # Computed properties
# LEGACY:             "assigned_student_count": len(task.assigned_students) if task.assigned_students else 0,
# LEGACY:             "submission_stats": {
# LEGACY:                 "total": 0,
# LEGACY:                 "submitted": 0,
# LEGACY:                 "graded": 0,
# LEGACY:                 "pending": 0
# LEGACY:             },
# LEGACY:             "average_score": 0.0,
# LEGACY:             "is_available": task.is_available if hasattr(task, 'is_available') else True,
# LEGACY:             "is_overdue": task.is_overdue if hasattr(task, 'is_overdue') else False,
# LEGACY:             "unit_title": task.unit.title if task.unit else None,
# LEGACY:             "course_title": course_title,
# LEGACY:             "content": task.content,
# LEGACY:             "questions": task.questions or [],
# LEGACY:             # Student-specific submission data
# LEGACY:             "student_submission": {
# LEGACY:                 "id": latest_submission.id if latest_submission else None,
# LEGACY:                 "status": latest_submission.status.value if latest_submission else None,
# LEGACY:                 "score": latest_submission.score if latest_submission else None,
# LEGACY:                 "final_score": latest_submission.final_score if latest_submission else None,
# LEGACY:                 "is_submitted": latest_submission.is_submitted if latest_submission else False,
# LEGACY:                 "is_graded": latest_submission.is_graded if latest_submission else False,
# LEGACY:                 "submitted_at": latest_submission.submitted_at.isoformat() if latest_submission and latest_submission.submitted_at else None,
# LEGACY:                 "graded_at": latest_submission.graded_at.isoformat() if latest_submission and latest_submission.graded_at else None,
# LEGACY:                 "feedback_rich": latest_submission.feedback_rich if latest_submission else None,
# LEGACY:                 "attempt_number": latest_submission.attempt_number if latest_submission else 0
# LEGACY:             } if latest_submission else None
# LEGACY:         }
# LEGACY:         result.append(TaskList(**task_data))

# LEGACY:     return result

# LEGACY: @router.get("/{task_id}", response_model=TaskInDB)
# LEGACY: def get_student_task(
# LEGACY:     task_id: int,
# LEGACY:     current_user: User = Depends(get_current_user),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Get task details for student - requires enrollment if task belongs to a course"""
# LEGACY:     from app.core.enrollment_guard import check_unit_access

# LEGACY:     task = get_task_with_relations(db, task_id)
# LEGACY:     if not task:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_404_NOT_FOUND,
# LEGACY:             detail="Задание не найдено"
# LEGACY:         )

# LEGACY:     # Check enrollment if task belongs to a unit with a course
# LEGACY:     if task.unit_id:
# LEGACY:         check_unit_access(db, current_user, task.unit_id)

# LEGACY:     # Check if student is assigned to this task
# LEGACY:     if not task.assign_to_all and current_user.id not in (task.assigned_students or []):
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_403_FORBIDDEN,
# LEGACY:             detail="У вас нет доступа к этому заданию"
# LEGACY:         )

# LEGACY:     return task

# LEGACY: @router.post("/{task_id}/submit", response_model=TaskSubmissionInDB)
# LEGACY: def submit_task(
# LEGACY:     task_id: int,
# LEGACY:     submission_data: TaskSubmissionCreate,
# LEGACY:     current_user: User = Depends(get_current_user),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Submit a task - requires enrollment if task belongs to a course"""
# LEGACY:     from app.core.enrollment_guard import check_unit_access

# LEGACY:     task = db.query(Task).filter(Task.id == task_id).first()
# LEGACY:     if not task:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_404_NOT_FOUND,
# LEGACY:             detail="Задание не найдено"
# LEGACY:         )

# LEGACY:     # Check enrollment if task belongs to a unit with a course
# LEGACY:     if task.unit_id:
# LEGACY:         check_unit_access(db, current_user, task.unit_id)

# LEGACY:     # Check if student is assigned to this task
# LEGACY:     if not task.assign_to_all and current_user.id not in (task.assigned_students or []):
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_403_FORBIDDEN,
# LEGACY:             detail="У вас нет доступа к этому заданию"
# LEGACY:         )

# LEGACY:     # Check if task is available
# LEGACY:     if not task.is_available:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_400_BAD_REQUEST,
# LEGACY:             detail="Задание недоступно для сдачи"
# LEGACY:         )

# LEGACY:     # Check if due date has passed
# LEGACY:     if task.due_at and datetime.utcnow() > task.due_at and not task.allow_late_submissions:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_400_BAD_REQUEST,
# LEGACY:             detail="Срок сдачи истек"
# LEGACY:         )

# LEGACY:     # Check attempt limits
# LEGACY:     existing_submissions = db.query(TaskSubmission).filter(
# LEGACY:         and_(
# LEGACY:             TaskSubmission.task_id == task_id,
# LEGACY:             TaskSubmission.student_id == current_user.id
# LEGACY:         )
# LEGACY:     ).all()

# LEGACY:     if task.max_attempts and len(existing_submissions) >= task.max_attempts:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_400_BAD_REQUEST,
# LEGACY:             detail="Превышен лимит попыток"
# LEGACY:         )

# LEGACY:     # Create submission
# LEGACY:     submission = TaskSubmission(
# LEGACY:         task_id=task_id,
# LEGACY:         student_id=current_user.id,
# LEGACY:         answers=submission_data.answers,
# LEGACY:         attachments=submission_data.attachments,
# LEGACY:         submitted_at=datetime.utcnow(),
# LEGACY:         status=SubmissionStatus.SUBMITTED,
# LEGACY:         attempt_number=len(existing_submissions) + 1
# LEGACY:     )

# LEGACY:     db.add(submission)
# LEGACY:     db.commit()
# LEGACY:     db.refresh(submission)

# LEGACY:     # Auto-grade if task is listening or reading with questions and grading type is automatic
# LEGACY:     grading_type = task.auto_check_config.get('grading_type', 'manual') if task.auto_check_config else 'manual'
# LEGACY:     if (task.type in [TaskType.LISTENING, TaskType.READING] and 
# LEGACY:         task.questions and 
# LEGACY:         grading_type == 'automatic'):
# LEGACY:         grading_result = auto_grade_task_submission(task, submission_data.answers)

# LEGACY:         if grading_result:
# LEGACY:             # Update submission with auto-graded score
# LEGACY:             submission.score = grading_result['percentage']  # Store as percentage
# LEGACY:             submission.status = SubmissionStatus.GRADED
# LEGACY:             submission.graded_at = datetime.utcnow()
# LEGACY:             # Store detailed results in feedback_rich as JSON string
# LEGACY:             import json
# LEGACY:             submission.feedback_rich = json.dumps({
# LEGACY:                 'auto_graded': True,
# LEGACY:                 'total_score': grading_result['score'],
# LEGACY:                 'max_score': grading_result['max_score'],
# LEGACY:                 'percentage': grading_result['percentage'],
# LEGACY:                 'question_results': grading_result['question_results']
# LEGACY:             }, ensure_ascii=False)

# LEGACY:             db.commit()
# LEGACY:             db.refresh(submission)

# LEGACY:     # Create notification for teacher about task submission
# LEGACY:     try:
# LEGACY:         notify_task_submitted(db, current_user.id, task_id, task.title)
# LEGACY:     except Exception as e:
# LEGACY:         # Don't fail submission if notification fails
# LEGACY:         print(f"Failed to create task submission notification: {e}")

# LEGACY:     # Computed properties (is_submitted, is_graded, is_late, final_score) 
# LEGACY:     # are automatically available via the model's @property decorators

# LEGACY:     return submission

# LEGACY: # Email and scheduling endpoints
# LEGACY: @router.post("/admin/tasks/{task_id}/notify-assignment")
# LEGACY: def notify_task_assignment(
# LEGACY:     task_id: int,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Send assignment notification emails to assigned students"""
# LEGACY:     task = db.query(Task).filter(Task.id == task_id).first()
# LEGACY:     if not task:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_404_NOT_FOUND,
# LEGACY:             detail="Задание не найдено"
# LEGACY:         )

# LEGACY:     # Get assigned student IDs
# LEGACY:     student_ids = []
# LEGACY:     if task.assign_to_all:
# LEGACY:         # Get all students
# LEGACY:         students = db.query(User).filter(User.role == "student").all()
# LEGACY:         student_ids = [s.id for s in students]
# LEGACY:     else:
# LEGACY:         student_ids = task.assigned_students or []

# LEGACY:     if not student_ids:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_400_BAD_REQUEST,
# LEGACY:             detail="Нет назначенных студентов для уведомления"
# LEGACY:         )

# LEGACY:     # Send emails
# LEGACY:     email_service = EmailService(db)
# LEGACY:     success = email_service.send_task_assignment_notification(task, student_ids)

# LEGACY:     return {
# LEGACY:         "message": "Уведомления отправлены" if success else "Ошибка при отправке уведомлений",
# LEGACY:         "recipients_count": len(student_ids),
# LEGACY:         "success": success
# LEGACY:     }

# LEGACY: @router.post("/admin/tasks/{task_id}/schedule-reminder")
# LEGACY: def schedule_task_reminder(
# LEGACY:     task_id: int,
# LEGACY:     reminder_data: dict,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Schedule a reminder email for a task"""
# LEGACY:     task = db.query(Task).filter(Task.id == task_id).first()
# LEGACY:     if not task:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_404_NOT_FOUND,
# LEGACY:             detail="Задание не найдено"
# LEGACY:         )

# LEGACY:     if not task.due_at:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_400_BAD_REQUEST,
# LEGACY:             detail="Задание не имеет срока сдачи"
# LEGACY:         )

# LEGACY:     reminder_offset = reminder_data.get("offset")
# LEGACY:     if not reminder_offset:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_400_BAD_REQUEST,
# LEGACY:             detail="Не указано время напоминания"
# LEGACY:         )

# LEGACY:     # Schedule reminder
# LEGACY:     email_service = EmailService(db)
# LEGACY:     success = email_service.schedule_reminder(task, reminder_offset)

# LEGACY:     return {
# LEGACY:         "message": "Напоминание запланировано" if success else "Ошибка при планировании напоминания",
# LEGACY:         "success": success
# LEGACY:     }

# LEGACY: @router.post("/admin/submissions/{submission_id}/email-result")
# LEGACY: def email_submission_result(
# LEGACY:     submission_id: int,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Send grade notification email to student"""
# LEGACY:     submission = db.query(TaskSubmission).options(
# LEGACY:         joinedload(TaskSubmission.student),
# LEGACY:         joinedload(TaskSubmission.task)
# LEGACY:     ).filter(TaskSubmission.id == submission_id).first()

# LEGACY:     if not submission:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_404_NOT_FOUND,
# LEGACY:             detail="Сдача не найдена"
# LEGACY:         )

# LEGACY:     if submission.status != SubmissionStatus.GRADED:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_400_BAD_REQUEST,
# LEGACY:             detail="Сдача еще не оценена"
# LEGACY:         )

# LEGACY:     # Send email
# LEGACY:     email_service = EmailService(db)
# LEGACY:     success = email_service.send_grade_notification_to_student(submission)

# LEGACY:     return {
# LEGACY:         "message": "Уведомление отправлено" if success else "Ошибка при отправке уведомления",
# LEGACY:         "success": success
# LEGACY:     }

# LEGACY: # Task assignment endpoints
# LEGACY: @router.post("/admin/tasks/{task_id}/assign")
# LEGACY: def assign_task(
# LEGACY:     task_id: int,
# LEGACY:     assignment_data: dict,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Assign task to students/cohorts"""
# LEGACY:     task = db.query(Task).filter(Task.id == task_id).first()
# LEGACY:     if not task:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_404_NOT_FOUND,
# LEGACY:             detail="Задание не найдено"
# LEGACY:         )

# LEGACY:     # Update assignment
# LEGACY:     if "cohorts" in assignment_data:
# LEGACY:         task.assigned_cohorts = assignment_data["cohorts"]
# LEGACY:     if "students" in assignment_data:
# LEGACY:         task.assigned_students = assignment_data["students"]
# LEGACY:     if "assign_to_all" in assignment_data:
# LEGACY:         task.assign_to_all = assignment_data["assign_to_all"]

# LEGACY:     db.commit()

# LEGACY:     # Send notification if requested
# LEGACY:     if assignment_data.get("send_notification", False):
# LEGACY:         email_service = EmailService(db)
# LEGACY:         student_ids = task.assigned_students or []
# LEGACY:         if task.assign_to_all:
# LEGACY:             students = db.query(User).filter(User.role == "student").all()
# LEGACY:             student_ids = [s.id for s in students]

# LEGACY:         if student_ids:
# LEGACY:             email_service.send_task_assignment_notification(task, student_ids)

# LEGACY:     return {
# LEGACY:         "message": "Задание назначено",
# LEGACY:         "assigned_cohorts": task.assigned_cohorts,
# LEGACY:         "assigned_students": task.assigned_students,
# LEGACY:         "assign_to_all": task.assign_to_all
# LEGACY:     }

# LEGACY: @router.post("/admin/tasks/{task_id}/unassign")
# LEGACY: def unassign_task(
# LEGACY:     task_id: int,
# LEGACY:     unassignment_data: dict,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Unassign task from students/cohorts"""
# LEGACY:     task = db.query(Task).filter(Task.id == task_id).first()
# LEGACY:     if not task:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_404_NOT_FOUND,
# LEGACY:             detail="Задание не найдено"
# LEGACY:         )

# LEGACY:     # Update assignment
# LEGACY:     if "cohorts" in unassignment_data:
# LEGACY:         task.assigned_cohorts = [c for c in task.assigned_cohorts if c not in unassignment_data["cohorts"]]
# LEGACY:     if "students" in unassignment_data:
# LEGACY:         task.assigned_students = [s for s in task.assigned_students if s not in unassignment_data["students"]]
# LEGACY:     if unassignment_data.get("unassign_all", False):
# LEGACY:         task.assign_to_all = False
# LEGACY:         task.assigned_cohorts = []
# LEGACY:         task.assigned_students = []

# LEGACY:     db.commit()

# LEGACY:     return {
# LEGACY:         "message": "Задание отменено",
# LEGACY:         "assigned_cohorts": task.assigned_cohorts,
# LEGACY:         "assigned_students": task.assigned_students,
# LEGACY:         "assign_to_all": task.assign_to_all
# LEGACY:     }

# LEGACY: # Task publishing endpoint
# LEGACY: @router.post("/admin/tasks/{task_id}/publish")
# LEGACY: def publish_task(
# LEGACY:     task_id: int,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Publish a task"""
# LEGACY:     task = db.query(Task).filter(Task.id == task_id).first()
# LEGACY:     if not task:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_404_NOT_FOUND,
# LEGACY:             detail="Задание не найдено"
# LEGACY:         )

# LEGACY:     if task.status == TaskStatus.PUBLISHED:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_400_BAD_REQUEST,
# LEGACY:             detail="Задание уже опубликовано"
# LEGACY:         )

# LEGACY:     # Validate assignment
# LEGACY:     if not task.assign_to_all and not task.assigned_cohorts and not task.assigned_students:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_400_BAD_REQUEST,
# LEGACY:             detail="Задание должно быть назначено хотя бы одной аудитории"
# LEGACY:         )

# LEGACY:     # Publish task
# LEGACY:     task.status = TaskStatus.PUBLISHED
# LEGACY:     task.publish_at = datetime.utcnow()
# LEGACY:     db.commit()

# LEGACY:     # Send notification if requested
# LEGACY:     if task.send_assignment_email:
# LEGACY:         email_service = EmailService(db)
# LEGACY:         student_ids = task.assigned_students or []
# LEGACY:         if task.assign_to_all:
# LEGACY:             students = db.query(User).filter(User.role == "student").all()
# LEGACY:             student_ids = [s.id for s in students]

# LEGACY:         if student_ids:
# LEGACY:             email_service.send_task_assignment_notification(task, student_ids)

# LEGACY:     return {
# LEGACY:         "message": "Задание опубликовано",
# LEGACY:         "status": task.status,
# LEGACY:         "publish_at": task.publish_at
# LEGACY:     }

# LEGACY: # Task scheduling endpoint
# LEGACY: @router.post("/admin/tasks/{task_id}/schedule")
# LEGACY: def schedule_task(
# LEGACY:     task_id: int,
# LEGACY:     schedule_data: dict,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Schedule a task for future publication"""
# LEGACY:     task = db.query(Task).filter(Task.id == task_id).first()
# LEGACY:     if not task:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_404_NOT_FOUND,
# LEGACY:             detail="Задание не найдено"
# LEGACY:         )

# LEGACY:     publish_at = schedule_data.get("publish_at")
# LEGACY:     if not publish_at:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_400_BAD_REQUEST,
# LEGACY:             detail="Не указана дата публикации"
# LEGACY:         )

# LEGACY:     try:
# LEGACY:         publish_at = datetime.fromisoformat(publish_at.replace('Z', '+00:00'))
# LEGACY:     except:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_400_BAD_REQUEST,
# LEGACY:             detail="Неверный формат даты"
# LEGACY:         )

# LEGACY:     # Schedule task
# LEGACY:     task.status = TaskStatus.SCHEDULED
# LEGACY:     task.publish_at = publish_at
# LEGACY:     db.commit()

# LEGACY:     return {
# LEGACY:         "message": "Задание запланировано",
# LEGACY:         "status": task.status,
# LEGACY:         "publish_at": task.publish_at
# LEGACY:     }

# LEGACY: # Allow retake endpoint
# LEGACY: @router.post("/admin/submissions/{submission_id}/allow-retake")
# LEGACY: def allow_submission_retake(
# LEGACY:     submission_id: int,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Allow student to retake a task"""
# LEGACY:     submission = db.query(TaskSubmission).options(
# LEGACY:         joinedload(TaskSubmission.student),
# LEGACY:         joinedload(TaskSubmission.task)
# LEGACY:     ).filter(TaskSubmission.id == submission_id).first()

# LEGACY:     if not submission:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_404_NOT_FOUND,
# LEGACY:             detail="Сдача не найдена"
# LEGACY:         )

# LEGACY:     # Create new submission for retake
# LEGACY:     new_submission = TaskSubmission(
# LEGACY:         task_id=submission.task_id,
# LEGACY:         student_id=submission.student_id,
# LEGACY:         attempt_number=submission.attempt_number + 1,
# LEGACY:         status=SubmissionStatus.DRAFT
# LEGACY:     )

# LEGACY:     db.add(new_submission)
# LEGACY:     db.commit()

# LEGACY:     return {
# LEGACY:         "message": "Пересдача разрешена",
# LEGACY:         "new_submission_id": new_submission.id,
# LEGACY:         "attempt_number": new_submission.attempt_number
# LEGACY:     }
