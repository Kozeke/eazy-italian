from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks, UploadFile, File
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_, desc, asc, func, case
from typing import List, Optional
from datetime import datetime, timedelta
import json
import os
import uuid

from app.core.database import get_db
from app.core.auth import get_current_user, get_current_teacher
from app.models.user import User
from app.models.task import Task, TaskSubmission, TaskType, TaskStatus, AutoTaskType, SubmissionStatus
from app.models.unit import Unit
from app.schemas.task import (
    TaskCreate, TaskUpdate, TaskInDB, TaskList, TaskSubmissionCreate, 
    TaskSubmissionUpdate, TaskSubmissionGrade, TaskSubmissionInDB,
    TaskStatistics, TaskBulkAction, TaskBulkAssign
)
from app.services.user_service import UserService
from app.services.email_service import EmailService
from app.services.notification_service import notify_task_submitted

router = APIRouter()

# Helper functions
def get_task_with_relations(db: Session, task_id: int) -> Optional[Task]:
    """Get task with all related data"""
    return db.query(Task).options(
        joinedload(Task.unit),
        joinedload(Task.created_by_user),
        joinedload(Task.submissions).joinedload(TaskSubmission.student)
    ).filter(Task.id == task_id).first()

def get_course_enrolled_students(db: Session, course_id: int) -> List[int]:
    """Get all student IDs enrolled in a course"""
    from app.models.enrollment import CourseEnrollment
    from app.models.user import UserRole
    
    enrollments = db.query(CourseEnrollment.user_id).join(
        User, User.id == CourseEnrollment.user_id
    ).filter(
        CourseEnrollment.course_id == course_id,
        User.role == UserRole.STUDENT
    ).all()
    
    return [e.user_id for e in enrollments]

def validate_task_assignment(task_data: dict, db: Session = None, unit_id: int = None) -> None:
    """Validate task assignment settings"""
    status_val = task_data.get('status')
    # Handle both enum and string values
    is_published = False
    if isinstance(status_val, TaskStatus):
        is_published = status_val == TaskStatus.PUBLISHED
    elif isinstance(status_val, str):
        is_published = status_val.lower() == 'published'
    elif hasattr(status_val, 'value'):
        is_published = status_val.value == 'published'
    
    if is_published:
        has_assignments = (
            task_data.get('assign_to_all') or 
            (task_data.get('assigned_cohorts') and len(task_data.get('assigned_cohorts', [])) > 0) or 
            (task_data.get('assigned_students') and len(task_data.get('assigned_students', [])) > 0)
        )
        
        if not has_assignments:
            # If task has a unit_id, we can auto-assign to enrolled students
            # So we allow publishing without explicit assignments
            check_unit_id = unit_id or task_data.get('unit_id')
            if check_unit_id and db:
                # Check if unit exists and has a course
                unit = db.query(Unit).filter(Unit.id == check_unit_id).first()
                if unit and unit.course_id:
                    # Unit has a course, we can auto-assign, so allow it
                    return
            
            # No unit_id or can't auto-assign, require explicit assignment
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Задание должно быть назначено хотя бы одной аудитории при публикации"
            )

def auto_grade_task_submission(task: Task, student_answers: dict) -> dict:
    """
    Auto-grade a task submission for listening/reading tasks with questions.
    Returns dict with score, max_score, and question_results.
    """
    if task.type not in [TaskType.LISTENING, TaskType.READING]:
        return None
    
    if not task.questions or len(task.questions) == 0:
        return None
    
    total_score = 0.0
    max_score = 0.0
    question_results = {}
    
    for index, question in enumerate(task.questions):
        question_id = question.get('id') or f"q-{index}"
        question_type = question.get('type', '').lower()
        correct_answer = question.get('correct_answer')
        points = question.get('points', 1.0)
        options = question.get('options', [])
        
        max_score += points
        
        student_answer = student_answers.get(question_id) or student_answers.get(str(index))
        points_earned = 0.0
        is_correct = False
        
        if question_type == 'multiple_choice':
            # For multiple choice, correct_answer is an array
            # Normalize correct_answer to always be a list
            if not isinstance(correct_answer, list):
                correct_answer = [correct_answer]
            
            # Normalize student_answer to always be a list
            if isinstance(student_answer, str):
                student_answer = [student_answer]
            elif not isinstance(student_answer, list):
                student_answer = []
            
            # Compare sets to handle order differences
            correct_set = set(str(c) for c in correct_answer)
            student_set = set(str(s) for s in student_answer)
            
            if correct_set == student_set:
                is_correct = True
                points_earned = points
            else:
                # Partial credit: correct selections / total correct
                correct_selections = len(correct_set & student_set)
                if len(correct_set) > 0:
                    points_earned = points * (correct_selections / len(correct_set))
                else:
                    points_earned = 0.0
        
        elif question_type == 'single_choice' or question_type == 'true_false':
            # For single choice, correct_answer can be a string or array with one element
            if isinstance(correct_answer, list):
                correct_val = correct_answer[0] if len(correct_answer) > 0 else None
            else:
                correct_val = correct_answer
            
            if correct_val is not None and str(student_answer) == str(correct_val):
                is_correct = True
                points_earned = points
        
        elif question_type == 'short_answer':
            # For short answer, check if answer matches (case-insensitive)
            if isinstance(correct_answer, list):
                correct_vals = [str(c).lower().strip() for c in correct_answer]
            else:
                correct_vals = [str(correct_answer).lower().strip()]
            
            student_val = str(student_answer).lower().strip() if student_answer else ""
            if student_val in correct_vals:
                is_correct = True
                points_earned = points
        
        total_score += points_earned
        
        question_results[question_id] = {
            'question': question.get('question', ''),
            'type': question_type,
            'student_answer': student_answer,
            'correct_answer': correct_answer,
            'is_correct': is_correct,
            'points_earned': points_earned,
            'points_possible': points
        }
    
    # Calculate percentage score
    percentage_score = (total_score / max_score * 100) if max_score > 0 else 0.0
    
    return {
        'score': total_score,
        'max_score': max_score,
        'percentage': percentage_score,
        'question_results': question_results
    }

def validate_auto_config(task_data: dict) -> None:
    """Validate auto-check configuration"""
    if task_data.get('type') == TaskType.AUTO:
        auto_type = task_data.get('auto_task_type')
        auto_config = task_data.get('auto_check_config', {})
        
        if not auto_type:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Для авто-проверки должен быть указан тип задания"
            )
        
        # Validate based on auto task type
        if auto_type == AutoTaskType.SCQ:
            options = auto_config.get('options', [])
            if len(options) < 2:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="SCQ должно иметь минимум 2 варианта ответа"
                )
            if auto_config.get('correct_answer') is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="SCQ должно иметь правильный ответ"
                )
        
        elif auto_type == AutoTaskType.MCQ:
            options = auto_config.get('options', [])
            if len(options) < 2:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="MCQ должно иметь минимум 2 варианта ответа"
                )
            correct_answers = auto_config.get('correct_answers', [])
            if len(correct_answers) < 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="MCQ должно иметь минимум 1 правильный ответ"
                )
        
        elif auto_type == AutoTaskType.GAP_FILL:
            gaps = auto_config.get('gaps', [])
            if len(gaps) < 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Gap-fill должно иметь минимум 1 пропуск"
                )
            for gap in gaps:
                if not gap.get('acceptable_answers'):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Каждый пропуск должен иметь допустимые ответы"
                    )

# Task CRUD endpoints

@router.get("/admin/tasks", response_model=List[TaskList])
def get_admin_tasks(
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    search: Optional[str] = Query(None),
    unit_id: Optional[int] = Query(None),
    type: Optional[TaskType] = Query(None),
    status: Optional[TaskStatus] = Query(None),
    due_before: Optional[datetime] = Query(None),
    due_after: Optional[datetime] = Query(None),
    ungraded_only: bool = Query(False),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc")
):
    """Get tasks for admin with filtering and pagination - only tasks in teacher's courses"""
    from app.models.course import Course
    
    # Get teacher's course IDs
    teacher_course_ids = [c.id for c in db.query(Course.id).filter(
        Course.created_by == current_user.id
    ).all()]
    
    if not teacher_course_ids:
        return []
    
    # Build query - only tasks in units that belong to teacher's courses
    query = db.query(Task).join(Unit).options(
        joinedload(Task.unit),
        joinedload(Task.submissions)
    ).filter(Unit.course_id.in_(teacher_course_ids))
    
    # Apply filters
    if search:
        search_filter = or_(
            Task.title.ilike(f"%{search}%"),
            Task.description.ilike(f"%{search}%"),
            Task.instructions.ilike(f"%{search}%")
        )
        query = query.filter(search_filter)
    
    if unit_id:
        query = query.filter(Task.unit_id == unit_id)
    
    if type:
        query = query.filter(Task.type == type)
    
    if status:
        query = query.filter(Task.status == status)
    
    if due_before:
        query = query.filter(Task.due_at <= due_before)
    
    if due_after:
        query = query.filter(Task.due_at >= due_after)
    
    if ungraded_only:
        # Filter tasks that have ungraded submissions
        query = query.filter(Task.submissions.any(
            and_(TaskSubmission.status == SubmissionStatus.SUBMITTED)
        ))
    
    # Apply sorting
    if sort_by == "title":
        sort_field = Task.title
    elif sort_by == "due_at":
        sort_field = Task.due_at
    elif sort_by == "status":
        sort_field = Task.status
    elif sort_by == "created_at":
        sort_field = Task.created_at
    elif sort_by == "order_index":
        sort_field = Task.order_index
    else:
        sort_field = Task.created_at
    
    if sort_order == "desc":
        query = query.order_by(desc(sort_field))
    else:
        query = query.order_by(asc(sort_field))
    
    # Apply pagination
    total = query.count()
    tasks = query.offset(skip).limit(limit).all()
    
    # Get task IDs for batch querying submissions
    task_ids = [task.id for task in tasks]
    
    # Query submission counts directly from database for accuracy
    if task_ids:
        # Get all submissions for these tasks
        all_submissions = db.query(TaskSubmission).filter(
            TaskSubmission.task_id.in_(task_ids)
        ).all()
        
        # Calculate stats manually for accuracy
        stats_dict = {}
        for task_id in task_ids:
            task_subs = [s for s in all_submissions if s.task_id == task_id]
            total = len(task_subs)
            submitted = len([s for s in task_subs if s.status in [SubmissionStatus.SUBMITTED, SubmissionStatus.GRADED]])
            graded = len([s for s in task_subs if s.status == SubmissionStatus.GRADED])
            stats_dict[task_id] = {
                'total': total,
                'submitted': submitted,
                'graded': graded
            }
    else:
        stats_dict = {}
    
    # Query average scores for graded submissions
    if task_ids:
        avg_scores = db.query(
            TaskSubmission.task_id,
            func.avg(TaskSubmission.score).label('avg_score')
        ).filter(
            and_(
                TaskSubmission.task_id.in_(task_ids),
                TaskSubmission.status == SubmissionStatus.GRADED,
                TaskSubmission.score.isnot(None)
            )
        ).group_by(TaskSubmission.task_id).all()
        
        avg_scores_dict = {task_id: float(avg_score) for task_id, avg_score in avg_scores}
    else:
        avg_scores_dict = {}
    
    # Convert to TaskList objects manually
    result = []
    for task in tasks:
        # Get submission stats from database query
        stats = stats_dict.get(task.id, {'total': 0, 'submitted': 0, 'graded': 0})
        submission_stats = {
            "total": stats['total'],
            "submitted": stats['submitted'],
            "graded": stats['graded'],
            "pending": stats['submitted'] - stats['graded']
        }
        
        task_data = {
            # TaskBase fields
            "title": task.title,
            "description": task.description,
            "instructions": task.instructions,
            "type": task.type,
            "auto_task_type": task.auto_task_type,
            "max_score": task.max_score,
            "due_at": task.due_at,
            "allow_late_submissions": task.allow_late_submissions,
            "late_penalty_percent": task.late_penalty_percent,
            "max_attempts": task.max_attempts,
            "order_index": task.order_index,
            "assign_to_all": task.assign_to_all,
            "assigned_cohorts": task.assigned_cohorts or [],
            "assigned_students": task.assigned_students or [],
            "send_assignment_email": task.send_assignment_email,
            "reminder_days_before": task.reminder_days_before,
            "send_results_email": task.send_results_email,
            "send_teacher_copy": task.send_teacher_copy,
            
            # TaskList specific fields
            "id": task.id,
            "unit_id": task.unit_id,
            "status": task.status,
            "publish_at": task.publish_at,
            "created_at": task.created_at,
            "updated_at": task.updated_at,
            "assigned_student_count": task.assigned_student_count,
            "submission_stats": submission_stats,
            "average_score": avg_scores_dict.get(task.id, 0.0),
            "is_available": task.is_available,
            "is_overdue": task.is_overdue,
            "unit_title": task.unit.title if task.unit else None,
            
            # Additional fields
            "auto_check_config": task.auto_check_config or {},
            "rubric": task.rubric or {},
            "attachments": task.attachments or []
        }
        result.append(TaskList(**task_data))
    
    return result

@router.post("/admin/tasks", response_model=TaskInDB)
def create_task(
    task_data: TaskCreate,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Create a new task"""
    # Convert task_data to dict and ensure enum values are used (not names)
    # Use model_dump with mode='python' to get Python native types, then convert enums
    task_dict = task_data.dict(exclude_unset=True)
    
    # Validate assignment settings (pass db and unit_id for auto-assignment check)
    validate_task_assignment(task_dict, db=db, unit_id=task_dict.get('unit_id'))
    
    # Validate auto-config if applicable
    validate_auto_config(task_dict)
    
    # Ensure enum values are converted to their string values
    # Pydantic may serialize enums as their names, so we need to convert them explicitly
    from app.models.task import TaskType, AutoTaskType, TaskStatus
    
    # Convert type enum to lowercase string value
    if 'type' in task_dict:
        type_val = task_dict['type']
        if isinstance(type_val, TaskType):
            task_dict['type'] = type_val.value  # Use enum value (e.g., "listening")
        elif isinstance(type_val, str):
            task_dict['type'] = type_val.lower()  # Ensure lowercase
        else:
            # Try to get value attribute
            task_dict['type'] = getattr(type_val, 'value', str(type_val).lower())
    
    # Convert auto_task_type enum to lowercase string value
    if 'auto_task_type' in task_dict and task_dict['auto_task_type'] is not None:
        auto_type_val = task_dict['auto_task_type']
        if isinstance(auto_type_val, AutoTaskType):
            task_dict['auto_task_type'] = auto_type_val.value
        elif isinstance(auto_type_val, str):
            task_dict['auto_task_type'] = auto_type_val.lower()
        else:
            task_dict['auto_task_type'] = getattr(auto_type_val, 'value', str(auto_type_val).lower())
    
    # Convert status enum to lowercase string value
    if 'status' in task_dict:
        status_val = task_dict['status']
        if isinstance(status_val, TaskStatus):
            task_dict['status'] = status_val.value  # Use enum value (e.g., "draft")
        elif isinstance(status_val, str):
            task_dict['status'] = status_val.lower()
        else:
            task_dict['status'] = getattr(status_val, 'value', str(status_val).lower())
    else:
        # If status is not provided, default to DRAFT
        task_dict['status'] = TaskStatus.DRAFT.value
        print(f"[DEBUG] Status not provided in request, defaulting to DRAFT")
    
    # Debug: Print the status value to verify it's set correctly
    print(f"[DEBUG] Task status value: {task_dict.get('status')}, type: {type(task_dict.get('status'))}")
    print(f"[DEBUG] Task type value: {task_dict.get('type')}, type: {type(task_dict.get('type'))}")
    
    # Create task - set enum fields as enum objects, not strings
    # SQLAlchemy will use the enum value when saving to database
    task = Task(
        created_by=current_user.id
    )
    
    # Set all non-enum fields first
    for key, value in task_dict.items():
        if key not in ['type', 'status', 'auto_task_type']:
            setattr(task, key, value)
    
    # Set enum fields as enum objects (SQLAlchemy will use .value for str enums)
    if 'type' in task_dict:
        type_str = task_dict['type']
        # Convert string to enum object
        try:
            task.type = TaskType(type_str)  # This will use the value, e.g., TaskType("listening")
        except ValueError:
            # If direct conversion fails, try by name
            task.type = TaskType[type_str.upper()]
    
    if 'status' in task_dict:
        status_str = task_dict['status']
        try:
            task.status = TaskStatus(status_str)
            print(f"[DEBUG] Set task status to: {task.status.value}")
        except ValueError:
            try:
                task.status = TaskStatus[status_str.upper()]
                print(f"[DEBUG] Set task status to (by name): {task.status.value}")
            except KeyError:
                print(f"[DEBUG] Invalid status value: {status_str}, defaulting to DRAFT")
                task.status = TaskStatus.DRAFT
    else:
        print(f"[DEBUG] Status not in task_dict, using model default (DRAFT)")
        task.status = TaskStatus.DRAFT
    
    # Set publish_at if status is PUBLISHED and publish_at is not already set
    if task.status == TaskStatus.PUBLISHED and not task.publish_at:
        task.publish_at = datetime.utcnow()
        print(f"[DEBUG] Set publish_at to current time for PUBLISHED task")
    
    # Auto-assign to all enrolled students if publishing
    if task.status == TaskStatus.PUBLISHED and task.unit_id:
        # If assign_to_all is True, assign to all enrolled students in the course
        if task.assign_to_all:
            unit = db.query(Unit).filter(Unit.id == task.unit_id).first()
            if unit and unit.course_id:
                # Get all students enrolled in the course
                enrolled_student_ids = get_course_enrolled_students(db, unit.course_id)
                if enrolled_student_ids:
                    task.assigned_students = enrolled_student_ids
                    print(f"[DEBUG] Assigned task to all {len(enrolled_student_ids)} students enrolled in course {unit.course_id}")
                else:
                    print(f"[DEBUG] No students enrolled in course {unit.course_id}")
        # If no assignments are set, auto-assign to all enrolled students
        elif not task.assigned_cohorts and not task.assigned_students:
            # Get the course_id from the unit
            unit = db.query(Unit).filter(Unit.id == task.unit_id).first()
            if unit and unit.course_id:
                # Get all students enrolled in the course
                enrolled_student_ids = get_course_enrolled_students(db, unit.course_id)
                if enrolled_student_ids:
                    task.assigned_students = enrolled_student_ids
                    print(f"[DEBUG] Auto-assigned task to {len(enrolled_student_ids)} students enrolled in course {unit.course_id}")
                else:
                    print(f"[DEBUG] No students enrolled in course {unit.course_id}, task will be published without assignments")
    
    if 'auto_task_type' in task_dict and task_dict['auto_task_type'] is not None:
        auto_type_str = task_dict['auto_task_type']
        try:
            task.auto_task_type = AutoTaskType(auto_type_str)
        except ValueError:
            task.auto_task_type = AutoTaskType[auto_type_str.upper()]
    
    db.add(task)
    db.commit()
    db.refresh(task)
    
    return task

def get_uploads_path():
    """Get the uploads directory path"""
    current_file = os.path.abspath(__file__)
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(current_file)))))
    
    # Check if we're in Docker
    is_docker = (os.name != 'nt' and
                 os.path.exists("/app") and 
                 os.getcwd() == "/app" and 
                 backend_dir == "/app")
    
    if is_docker:
        return "/app/uploads"
    else:
        return os.path.join(backend_dir, "uploads")

@router.post("/admin/tasks/upload-file")
async def upload_task_file(
    files: List[UploadFile] = File(...),
    file_type: str = Query(..., description="Type of file: 'listening' for audio/video, 'reading' for documents"),
    current_user: User = Depends(get_current_teacher)
):
    """Upload one or more files for listening or reading task"""
    
    # Allowed file types for listening (audio/video)
    listening_mime_types = [
        'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav',
        'audio/ogg', 'audio/webm', 'audio/aac', 'audio/flac',
        'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
        'video/x-matroska', 'video/ogg', 'video/x-flv', 'video/3gpp', 'video/x-ms-wmv'
    ]
    listening_extensions = ['.mp3', '.wav', '.ogg', '.webm', '.aac', '.flac',
                            '.mp4', '.webm', '.mov', '.avi', '.mkv', '.ogv', '.flv', '.3gp', '.wmv']
    
    # Allowed file types for reading (documents)
    reading_mime_types = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  # .docx
        'text/plain',
        'text/html',
        'application/rtf'
    ]
    reading_extensions = ['.pdf', '.doc', '.docx', '.txt', '.html', '.rtf']
    
    # Validate file type based on task type
    if file_type == 'listening':
        allowed_mime_types = listening_mime_types
        allowed_extensions = listening_extensions
        subfolder = 'audio'
    elif file_type == 'reading':
        allowed_mime_types = reading_mime_types
        allowed_extensions = reading_extensions
        subfolder = 'documents'
    else:
        raise HTTPException(status_code=400, detail="Invalid file_type. Must be 'listening' or 'reading'")
    
    # Get uploads path
    uploads_path = get_uploads_path()
    files_dir = os.path.join(uploads_path, "tasks", subfolder, str(current_user.id))
    os.makedirs(files_dir, exist_ok=True)
    
    uploaded_files = []
    
    # Process each file
    for file in files:
        # Validate file type
        if not file.content_type:
            if file.filename:
                file_ext = os.path.splitext(file.filename)[1].lower()
                if file_ext not in allowed_extensions:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid file type for {file.filename}. Allowed formats: {', '.join(allowed_extensions)}"
                    )
            else:
                raise HTTPException(status_code=400, detail="File type could not be determined")
        elif file.content_type not in allowed_mime_types:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file type for {file.filename}. Allowed formats: {', '.join(allowed_extensions)}"
            )
        
        # Generate filename
        file_ext = os.path.splitext(file.filename or f'file.{allowed_extensions[0][1:]}')[1] or allowed_extensions[0]
        filename = f"{uuid.uuid4().hex[:16]}{file_ext}"
        file_path = os.path.join(files_dir, filename)
        
        # Save file
        try:
            with open(file_path, "wb") as buffer:
                content = await file.read()
                buffer.write(content)
            
            # Return relative path (relative to uploads directory)
            relative_path = f"tasks/{subfolder}/{current_user.id}/{filename}"
            
            uploaded_files.append({
                "file_path": relative_path,
                "filename": filename,
                "original_filename": file.filename,
                "size": len(content),
                "url": f"/api/v1/static/{relative_path}"  # URL to access the file via static mount
            })
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error uploading file {file.filename}: {str(e)}")
    
    return {
        "message": f"{len(uploaded_files)} file(s) uploaded successfully",
        "files": uploaded_files
    }

@router.get("/admin/tasks/{task_id}", response_model=TaskInDB)
def get_admin_task(
    task_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Get task details for admin"""
    task = get_task_with_relations(db, task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Задание не найдено"
        )
    
    return task

@router.put("/admin/tasks/{task_id}", response_model=TaskInDB)
def update_task(
    task_id: int,
    task_data: TaskUpdate,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Update a task"""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Задание не найдено"
        )
    
    # Validate assignment settings
    update_data = task_data.dict(exclude_unset=True)
    
    # For validation, merge update data with existing task data
    # This ensures validation checks the final state after update would be applied
    validation_data = {
        'status': update_data.get('status', task.status),
        'assign_to_all': update_data.get('assign_to_all', task.assign_to_all),
        'assigned_cohorts': update_data.get('assigned_cohorts', task.assigned_cohorts or []),
        'assigned_students': update_data.get('assigned_students', task.assigned_students or []),
        'unit_id': update_data.get('unit_id', task.unit_id)
    }
    
    validate_task_assignment(validation_data, db=db, unit_id=validation_data.get('unit_id'))
    validate_auto_config(update_data)
    
    # Ensure enum values are converted to their string values
    if 'type' in update_data and hasattr(update_data['type'], 'value'):
        update_data['type'] = update_data['type'].value
    if 'auto_task_type' in update_data and update_data['auto_task_type'] is not None and hasattr(update_data['auto_task_type'], 'value'):
        update_data['auto_task_type'] = update_data['auto_task_type'].value
    if 'status' in update_data and hasattr(update_data['status'], 'value'):
        update_data['status'] = update_data['status'].value
    
    # Update task
    for field, value in update_data.items():
        setattr(task, field, value)
    
    # Check if status is being changed to PUBLISHED
    new_status = update_data.get('status')
    is_being_published = False
    if new_status:
        if isinstance(new_status, TaskStatus):
            is_being_published = new_status == TaskStatus.PUBLISHED
        elif isinstance(new_status, str):
            is_being_published = new_status.lower() == 'published'
        elif hasattr(new_status, 'value'):
            is_being_published = new_status.value == 'published'
    
    # Auto-assign to all enrolled students if publishing
    if is_being_published and task.unit_id:
        # Check final assignment state after update
        final_assign_to_all = update_data.get('assign_to_all', task.assign_to_all)
        final_assigned_cohorts = update_data.get('assigned_cohorts', task.assigned_cohorts or [])
        final_assigned_students = update_data.get('assigned_students', task.assigned_students or [])
        
        # If assign_to_all is True, assign to all enrolled students in the course
        if final_assign_to_all:
            unit = db.query(Unit).filter(Unit.id == task.unit_id).first()
            if unit and unit.course_id:
                # Get all students enrolled in the course
                enrolled_student_ids = get_course_enrolled_students(db, unit.course_id)
                if enrolled_student_ids:
                    task.assigned_students = enrolled_student_ids
                    print(f"[DEBUG] Assigned task to all {len(enrolled_student_ids)} students enrolled in course {unit.course_id}")
                else:
                    print(f"[DEBUG] No students enrolled in course {unit.course_id}")
        # If no assignments are set, auto-assign to all enrolled students
        elif not final_assigned_cohorts and not final_assigned_students:
            # Get the course_id from the unit
            unit = db.query(Unit).filter(Unit.id == task.unit_id).first()
            if unit and unit.course_id:
                # Get all students enrolled in the course
                enrolled_student_ids = get_course_enrolled_students(db, unit.course_id)
                if enrolled_student_ids:
                    task.assigned_students = enrolled_student_ids
                    print(f"[DEBUG] Auto-assigned task to {len(enrolled_student_ids)} students enrolled in course {unit.course_id}")
                else:
                    print(f"[DEBUG] No students enrolled in course {unit.course_id}, task will be published without assignments")
    
    # Set publish_at if status is being changed to PUBLISHED and publish_at is not already set
    if is_being_published and not task.publish_at:
        task.publish_at = datetime.utcnow()
        print(f"[DEBUG] Set publish_at to current time for PUBLISHED task")
    
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    
    return task

@router.delete("/admin/tasks/{task_id}")
def delete_task(
    task_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Delete a task"""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Задание не найдено"
        )
    
    # Check if task has submissions by querying the database directly
    submission_count = db.query(TaskSubmission).filter(TaskSubmission.task_id == task_id).count()
    if submission_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нельзя удалить задание с существующими сдачами"
        )
    
    db.delete(task)
    db.commit()
    
    return {"message": "Задание удалено"}

# Bulk operations
@router.post("/admin/tasks/bulk-action")
def bulk_action_tasks(
    bulk_action: TaskBulkAction,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Perform bulk actions on tasks"""
    tasks = db.query(Task).filter(Task.id.in_(bulk_action.task_ids)).all()
    
    if len(tasks) != len(bulk_action.task_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Некоторые задания не найдены"
        )
    
    updated_count = 0
    
    for task in tasks:
        if bulk_action.action == "publish":
            task.status = TaskStatus.PUBLISHED
            task.publish_at = datetime.utcnow()
        elif bulk_action.action == "unpublish":
            task.status = TaskStatus.DRAFT
            task.publish_at = None
        elif bulk_action.action == "archive":
            task.status = TaskStatus.ARCHIVED
        elif bulk_action.action == "duplicate":
            # Create a copy of the task
            new_task = Task(
                title=f"{task.title} (копия)",
                description=task.description,
                instructions=task.instructions,
                type=task.type,
                auto_task_type=task.auto_task_type,
                max_score=task.max_score,
                due_at=task.due_at,
                allow_late_submissions=task.allow_late_submissions,
                late_penalty_percent=task.late_penalty_percent,
                max_attempts=task.max_attempts,
                order_index=task.order_index,
                attachments=task.attachments.copy() if task.attachments else [],
                rubric=task.rubric.copy() if task.rubric else {},
                auto_check_config=task.auto_check_config.copy() if task.auto_check_config else {},
                assign_to_all=task.assign_to_all,
                assigned_cohorts=task.assigned_cohorts.copy() if task.assigned_cohorts else [],
                assigned_students=task.assigned_students.copy() if task.assigned_students else [],
                send_assignment_email=task.send_assignment_email,
                reminder_days_before=task.reminder_days_before,
                send_results_email=task.send_results_email,
                send_teacher_copy=task.send_teacher_copy,
                status=TaskStatus.DRAFT,
                unit_id=task.unit_id,
                created_by=current_user.id
            )
            db.add(new_task)
            updated_count += 1
            continue
        
        updated_count += 1
    
    db.commit()
    
    return {
        "message": f"Обновлено {updated_count} заданий",
        "updated_count": updated_count
    }

@router.post("/admin/tasks/bulk-assign")
def bulk_assign_tasks(
    bulk_assign: TaskBulkAssign,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Bulk assign tasks to students/cohorts"""
    tasks = db.query(Task).filter(Task.id.in_(bulk_assign.task_ids)).all()
    
    if len(tasks) != len(bulk_assign.task_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Некоторые задания не найдены"
        )
    
    for task in tasks:
        task.assign_to_all = bulk_assign.assign_to_all
        task.assigned_cohorts = bulk_assign.cohort_ids
        task.assigned_students = bulk_assign.student_ids
    
    db.commit()
    
    return {
        "message": f"Назначено {len(tasks)} заданий",
        "assigned_count": len(tasks)
    }

# Task submissions management
@router.get("/admin/tasks/{task_id}/submissions", response_model=List[TaskSubmissionInDB])
def get_task_submissions(
    task_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    status: Optional[SubmissionStatus] = Query(None),
    search: Optional[str] = Query(None)
):
    """Get submissions for a task - only if task is created by current teacher"""
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.created_by == current_user.id
    ).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Задание не найдено"
        )
    
    query = db.query(TaskSubmission).options(
        joinedload(TaskSubmission.student),
        joinedload(TaskSubmission.grader)
    ).filter(TaskSubmission.task_id == task_id)
    
    if status:
        query = query.filter(TaskSubmission.status == status)
    
    if search:
        query = query.join(User, TaskSubmission.student_id == User.id).filter(
            or_(
                User.first_name.ilike(f"%{search}%"),
                User.last_name.ilike(f"%{search}%"),
                User.email.ilike(f"%{search}%")
            )
        )
    
    submissions = query.offset(skip).limit(limit).all()
    
    # Computed properties (is_submitted, is_graded, is_late, final_score) 
    # are automatically available via the model's @property decorators
    # Add student_name for response
    for submission in submissions:
        if submission.student:
            submission.student_name = f"{submission.student.first_name} {submission.student.last_name}"
        if submission.grader:
            submission.grader_name = f"{submission.grader.first_name} {submission.grader.last_name}"
    
    return submissions

@router.get("/admin/tasks/{task_id}/submissions/{submission_id}", response_model=TaskSubmissionInDB)
def get_task_submission(
    task_id: int,
    submission_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Get task submission - only if task is created by current teacher"""
    # First verify the task belongs to the teacher
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.created_by == current_user.id
    ).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Задание не найдено"
        )
    
    submission = db.query(TaskSubmission).options(
        joinedload(TaskSubmission.student),
        joinedload(TaskSubmission.grader),
        joinedload(TaskSubmission.task)
    ).filter(
        and_(
            TaskSubmission.id == submission_id,
            TaskSubmission.task_id == task_id
        )
    ).first()
    
    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Сдача не найдена"
        )
    
    # Computed properties (is_submitted, is_graded, is_late, final_score) 
    # are automatically available via the model's @property decorators
    # Add student_name for response
    if submission.student:
        submission.student_name = f"{submission.student.first_name} {submission.student.last_name}"
    if submission.grader:
        submission.grader_name = f"{submission.grader.first_name} {submission.grader.last_name}"
    
    return submission

@router.post("/admin/tasks/{task_id}/submissions/{submission_id}/grade", response_model=TaskSubmissionInDB)
def grade_submission(
    task_id: int,
    submission_id: int,
    grade_data: TaskSubmissionGrade,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Grade a submission"""
    submission = db.query(TaskSubmission).filter(
        and_(
            TaskSubmission.id == submission_id,
            TaskSubmission.task_id == task_id
        )
    ).first()
    
    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Сдача не найдена"
        )
    
    if submission.status != SubmissionStatus.SUBMITTED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Можно оценивать только отправленные сдачи"
        )
    
    # Update submission
    submission.score = grade_data.score
    submission.feedback_rich = grade_data.feedback_rich
    submission.status = SubmissionStatus.GRADED
    submission.graded_at = datetime.utcnow()
    submission.grader_id = current_user.id
    
    db.commit()
    db.refresh(submission)
    
    # Note: Student notifications for grading can be added here if needed
    # For now, we'll skip email notifications as per user's request
    
    # Computed properties (is_submitted, is_graded, is_late, final_score) 
    # are automatically available via the model's @property decorators
    
    return submission

# Task statistics
@router.get("/admin/tasks/{task_id}/statistics", response_model=TaskStatistics)
def get_task_statistics(
    task_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Get task statistics"""
    task = db.query(Task).options(
        joinedload(Task.submissions)
    ).filter(Task.id == task_id).first()
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Задание не найдено"
        )
    
    submissions = task.submissions
    total_submissions = len(submissions)
    submitted_count = len([s for s in submissions if s.status == SubmissionStatus.SUBMITTED])
    graded_count = len([s for s in submissions if s.status == SubmissionStatus.GRADED])
    pending_count = submitted_count - graded_count
    
    # Calculate average score
    graded_submissions = [s for s in submissions if s.status == SubmissionStatus.GRADED and s.score is not None]
    average_score = sum(s.score for s in graded_submissions) / len(graded_submissions) if graded_submissions else 0
    
    # Calculate completion rate
    completion_rate = (submitted_count / total_submissions * 100) if total_submissions > 0 else 0
    
    # Calculate average time
    time_spent_submissions = [s for s in submissions if s.time_spent_minutes is not None]
    average_time_minutes = sum(s.time_spent_minutes for s in time_spent_submissions) / len(time_spent_submissions) if time_spent_submissions else None
    
    # Score distribution
    score_distribution = {
        "0-20": 0,
        "21-40": 0,
        "41-60": 0,
        "61-80": 0,
        "81-100": 0
    }
    
    for submission in graded_submissions:
        if submission.score is not None:
            if submission.score <= 20:
                score_distribution["0-20"] += 1
            elif submission.score <= 40:
                score_distribution["21-40"] += 1
            elif submission.score <= 60:
                score_distribution["41-60"] += 1
            elif submission.score <= 80:
                score_distribution["61-80"] += 1
            else:
                score_distribution["81-100"] += 1
    
    return TaskStatistics(
        total_submissions=total_submissions,
        submitted_count=submitted_count,
        graded_count=graded_count,
        pending_count=pending_count,
        average_score=average_score,
        completion_rate=completion_rate,
        average_time_minutes=average_time_minutes,
        score_distribution=score_distribution
    )

# Student-facing endpoints
@router.get("", response_model=List[TaskList])
def get_student_tasks(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    unit_id: Optional[int] = Query(None)
):
    """Get tasks available to the current student - only from enrolled courses"""
    from app.models.course import Course
    from app.models.enrollment import CourseEnrollment
    from app.core.enrollment_guard import get_user_enrolled_courses
    
    # Get enrolled course IDs for the student
    enrolled_course_ids = get_user_enrolled_courses(db, current_user.id)
    
    print(f"[DEBUG] Student {current_user.id} enrolled in courses: {enrolled_course_ids}")
    
    if not enrolled_course_ids:
        # Student is not enrolled in any courses, return empty list
        print(f"[DEBUG] Student {current_user.id} is not enrolled in any courses")
        return []
    
    # Build query: tasks from units that belong to enrolled courses
    # Include PUBLISHED tasks and SCHEDULED tasks where publish_at has passed
    # Exclude DRAFT and ARCHIVED tasks
    from app.models.course import Course
    from datetime import timezone
    now = datetime.now(timezone.utc)
    query = db.query(Task).join(Unit).options(
        joinedload(Task.unit).joinedload(Unit.course)
    ).filter(
        and_(
            or_(
                Task.status == TaskStatus.PUBLISHED,
                and_(
                    Task.status == TaskStatus.SCHEDULED,
                    Task.publish_at <= now
                )
            ),
            Task.status != TaskStatus.DRAFT,
            Task.status != TaskStatus.ARCHIVED,
            Unit.course_id.in_(enrolled_course_ids)
        )
    )
    
    if unit_id:
        query = query.filter(Task.unit_id == unit_id)
    
    tasks = query.all()
    
    print(f"[DEBUG] Found {len(tasks)} tasks for student {current_user.id} from enrolled courses")
    if tasks:
        print(f"[DEBUG] Task statuses: {[t.status for t in tasks]}")
        print(f"[DEBUG] Task IDs: {[t.id for t in tasks]}")
    
    # Filter by availability and assignment
    # Tasks with assign_to_all=True are available to all students in the course
    # Tasks with assigned_students list should include current_user.id
    # If no assignment restrictions, include it for all enrolled students
    filtered_tasks = []
    for task in tasks:
        # Only include tasks that are available (using the is_available property)
        if not task.is_available:
            print(f"[DEBUG] Task {task.id} is not available (status: {task.status}, publish_at: {task.publish_at})")
            continue
        # If task is assigned to all students in the course, include it
        if task.assign_to_all:
            filtered_tasks.append(task)
        # If task has specific student assignments, check if current user is assigned
        elif task.assigned_students and len(task.assigned_students) > 0:
            if current_user.id in task.assigned_students:
                filtered_tasks.append(task)
        # If no assignment restrictions (assign_to_all=False and no assigned_students),
        # include it for all students in the course (default behavior)
        else:
            filtered_tasks.append(task)
    
    print(f"[DEBUG] After filtering, {len(filtered_tasks)} tasks available for student {current_user.id}")
    
    # Get student's submissions for all tasks in one query
    task_ids = [task.id for task in filtered_tasks]
    student_submissions = {}
    if task_ids:
        submissions = db.query(TaskSubmission).filter(
            and_(
                TaskSubmission.task_id.in_(task_ids),
                TaskSubmission.student_id == current_user.id
            )
        ).all()
        for submission in submissions:
            if submission.task_id not in student_submissions:
                student_submissions[submission.task_id] = []
            student_submissions[submission.task_id].append(submission)
    
    # Convert to TaskList objects manually (similar to get_admin_tasks)
    result = []
    for task in filtered_tasks:
        # Get student's latest submission for this task
        student_task_submissions = student_submissions.get(task.id, [])
        latest_submission = None
        if student_task_submissions:
            # Get the latest submission (highest attempt_number or most recent)
            latest_submission = max(student_task_submissions, key=lambda s: (s.attempt_number, s.submitted_at or datetime.min))
        
        # Get course info
        course_title = None
        if task.unit and task.unit.course:
            course_title = task.unit.course.title
        
        task_data = {
            # TaskBase fields
            "title": task.title,
            "description": task.description,
            "instructions": task.instructions,
            "type": task.type,
            "auto_task_type": task.auto_task_type,
            "max_score": task.max_score,
            "due_at": task.due_at,
            "allow_late_submissions": task.allow_late_submissions,
            "late_penalty_percent": task.late_penalty_percent,
            "max_attempts": task.max_attempts,
            "order_index": task.order_index,
            "assign_to_all": task.assign_to_all,
            "assigned_cohorts": task.assigned_cohorts or [],
            "assigned_students": task.assigned_students or [],
            "send_assignment_email": task.send_assignment_email,
            "reminder_days_before": task.reminder_days_before,
            "send_results_email": task.send_results_email,
            "send_teacher_copy": task.send_teacher_copy,
            # TaskList specific fields
            "id": task.id,
            "unit_id": task.unit_id,
            "status": task.status,
            "publish_at": task.publish_at,
            "created_at": task.created_at,
            "updated_at": task.updated_at,
            # Computed properties
            "assigned_student_count": len(task.assigned_students) if task.assigned_students else 0,
            "submission_stats": {
                "total": 0,
                "submitted": 0,
                "graded": 0,
                "pending": 0
            },
            "average_score": 0.0,
            "is_available": task.is_available if hasattr(task, 'is_available') else True,
            "is_overdue": task.is_overdue if hasattr(task, 'is_overdue') else False,
            "unit_title": task.unit.title if task.unit else None,
            "course_title": course_title,
            "content": task.content,
            "questions": task.questions or [],
            # Student-specific submission data
            "student_submission": {
                "id": latest_submission.id if latest_submission else None,
                "status": latest_submission.status.value if latest_submission else None,
                "score": latest_submission.score if latest_submission else None,
                "final_score": latest_submission.final_score if latest_submission else None,
                "is_submitted": latest_submission.is_submitted if latest_submission else False,
                "is_graded": latest_submission.is_graded if latest_submission else False,
                "submitted_at": latest_submission.submitted_at.isoformat() if latest_submission and latest_submission.submitted_at else None,
                "graded_at": latest_submission.graded_at.isoformat() if latest_submission and latest_submission.graded_at else None,
                "feedback_rich": latest_submission.feedback_rich if latest_submission else None,
                "attempt_number": latest_submission.attempt_number if latest_submission else 0
            } if latest_submission else None
        }
        result.append(TaskList(**task_data))
    
    return result

@router.get("/{task_id}", response_model=TaskInDB)
def get_student_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get task details for student - requires enrollment if task belongs to a course"""
    from app.core.enrollment_guard import check_unit_access
    
    task = get_task_with_relations(db, task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Задание не найдено"
        )
    
    # Check enrollment if task belongs to a unit with a course
    if task.unit_id:
        check_unit_access(db, current_user, task.unit_id)
    
    # Check if student is assigned to this task
    if not task.assign_to_all and current_user.id not in (task.assigned_students or []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="У вас нет доступа к этому заданию"
        )
    
    return task

@router.post("/{task_id}/submit", response_model=TaskSubmissionInDB)
def submit_task(
    task_id: int,
    submission_data: TaskSubmissionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Submit a task - requires enrollment if task belongs to a course"""
    from app.core.enrollment_guard import check_unit_access
    
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Задание не найдено"
        )
    
    # Check enrollment if task belongs to a unit with a course
    if task.unit_id:
        check_unit_access(db, current_user, task.unit_id)
    
    # Check if student is assigned to this task
    if not task.assign_to_all and current_user.id not in (task.assigned_students or []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="У вас нет доступа к этому заданию"
        )
    
    # Check if task is available
    if not task.is_available:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Задание недоступно для сдачи"
        )
    
    # Check if due date has passed
    if task.due_at and datetime.utcnow() > task.due_at and not task.allow_late_submissions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Срок сдачи истек"
        )
    
    # Check attempt limits
    existing_submissions = db.query(TaskSubmission).filter(
        and_(
            TaskSubmission.task_id == task_id,
            TaskSubmission.student_id == current_user.id
        )
    ).all()
    
    if task.max_attempts and len(existing_submissions) >= task.max_attempts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Превышен лимит попыток"
        )
    
    # Create submission
    submission = TaskSubmission(
        task_id=task_id,
        student_id=current_user.id,
        answers=submission_data.answers,
        attachments=submission_data.attachments,
        submitted_at=datetime.utcnow(),
        status=SubmissionStatus.SUBMITTED,
        attempt_number=len(existing_submissions) + 1
    )
    
    db.add(submission)
    db.commit()
    db.refresh(submission)
    
    # Auto-grade if task is listening or reading with questions and grading type is automatic
    grading_type = task.auto_check_config.get('grading_type', 'manual') if task.auto_check_config else 'manual'
    if (task.type in [TaskType.LISTENING, TaskType.READING] and 
        task.questions and 
        grading_type == 'automatic'):
        grading_result = auto_grade_task_submission(task, submission_data.answers)
        
        if grading_result:
            # Update submission with auto-graded score
            submission.score = grading_result['percentage']  # Store as percentage
            submission.status = SubmissionStatus.GRADED
            submission.graded_at = datetime.utcnow()
            # Store detailed results in feedback_rich as JSON string
            import json
            submission.feedback_rich = json.dumps({
                'auto_graded': True,
                'total_score': grading_result['score'],
                'max_score': grading_result['max_score'],
                'percentage': grading_result['percentage'],
                'question_results': grading_result['question_results']
            }, ensure_ascii=False)
            
            db.commit()
            db.refresh(submission)
    
    # Create notification for teacher about task submission
    try:
        notify_task_submitted(db, current_user.id, task_id, task.title)
    except Exception as e:
        # Don't fail submission if notification fails
        print(f"Failed to create task submission notification: {e}")
    
    # Computed properties (is_submitted, is_graded, is_late, final_score) 
    # are automatically available via the model's @property decorators
    
    return submission

# Email and scheduling endpoints
@router.post("/admin/tasks/{task_id}/notify-assignment")
def notify_task_assignment(
    task_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Send assignment notification emails to assigned students"""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Задание не найдено"
        )
    
    # Get assigned student IDs
    student_ids = []
    if task.assign_to_all:
        # Get all students
        students = db.query(User).filter(User.role == "student").all()
        student_ids = [s.id for s in students]
    else:
        student_ids = task.assigned_students or []
    
    if not student_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нет назначенных студентов для уведомления"
        )
    
    # Send emails
    email_service = EmailService(db)
    success = email_service.send_task_assignment_notification(task, student_ids)
    
    return {
        "message": "Уведомления отправлены" if success else "Ошибка при отправке уведомлений",
        "recipients_count": len(student_ids),
        "success": success
    }

@router.post("/admin/tasks/{task_id}/schedule-reminder")
def schedule_task_reminder(
    task_id: int,
    reminder_data: dict,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Schedule a reminder email for a task"""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Задание не найдено"
        )
    
    if not task.due_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Задание не имеет срока сдачи"
        )
    
    reminder_offset = reminder_data.get("offset")
    if not reminder_offset:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Не указано время напоминания"
        )
    
    # Schedule reminder
    email_service = EmailService(db)
    success = email_service.schedule_reminder(task, reminder_offset)
    
    return {
        "message": "Напоминание запланировано" if success else "Ошибка при планировании напоминания",
        "success": success
    }

@router.post("/admin/submissions/{submission_id}/email-result")
def email_submission_result(
    submission_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Send grade notification email to student"""
    submission = db.query(TaskSubmission).options(
        joinedload(TaskSubmission.student),
        joinedload(TaskSubmission.task)
    ).filter(TaskSubmission.id == submission_id).first()
    
    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Сдача не найдена"
        )
    
    if submission.status != SubmissionStatus.GRADED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Сдача еще не оценена"
        )
    
    # Send email
    email_service = EmailService(db)
    success = email_service.send_grade_notification_to_student(submission)
    
    return {
        "message": "Уведомление отправлено" if success else "Ошибка при отправке уведомления",
        "success": success
    }

# Task assignment endpoints
@router.post("/admin/tasks/{task_id}/assign")
def assign_task(
    task_id: int,
    assignment_data: dict,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Assign task to students/cohorts"""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Задание не найдено"
        )
    
    # Update assignment
    if "cohorts" in assignment_data:
        task.assigned_cohorts = assignment_data["cohorts"]
    if "students" in assignment_data:
        task.assigned_students = assignment_data["students"]
    if "assign_to_all" in assignment_data:
        task.assign_to_all = assignment_data["assign_to_all"]
    
    db.commit()
    
    # Send notification if requested
    if assignment_data.get("send_notification", False):
        email_service = EmailService(db)
        student_ids = task.assigned_students or []
        if task.assign_to_all:
            students = db.query(User).filter(User.role == "student").all()
            student_ids = [s.id for s in students]
        
        if student_ids:
            email_service.send_task_assignment_notification(task, student_ids)
    
    return {
        "message": "Задание назначено",
        "assigned_cohorts": task.assigned_cohorts,
        "assigned_students": task.assigned_students,
        "assign_to_all": task.assign_to_all
    }

@router.post("/admin/tasks/{task_id}/unassign")
def unassign_task(
    task_id: int,
    unassignment_data: dict,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Unassign task from students/cohorts"""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Задание не найдено"
        )
    
    # Update assignment
    if "cohorts" in unassignment_data:
        task.assigned_cohorts = [c for c in task.assigned_cohorts if c not in unassignment_data["cohorts"]]
    if "students" in unassignment_data:
        task.assigned_students = [s for s in task.assigned_students if s not in unassignment_data["students"]]
    if unassignment_data.get("unassign_all", False):
        task.assign_to_all = False
        task.assigned_cohorts = []
        task.assigned_students = []
    
    db.commit()
    
    return {
        "message": "Задание отменено",
        "assigned_cohorts": task.assigned_cohorts,
        "assigned_students": task.assigned_students,
        "assign_to_all": task.assign_to_all
    }

# Task publishing endpoint
@router.post("/admin/tasks/{task_id}/publish")
def publish_task(
    task_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Publish a task"""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Задание не найдено"
        )
    
    if task.status == TaskStatus.PUBLISHED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Задание уже опубликовано"
        )
    
    # Validate assignment
    if not task.assign_to_all and not task.assigned_cohorts and not task.assigned_students:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Задание должно быть назначено хотя бы одной аудитории"
        )
    
    # Publish task
    task.status = TaskStatus.PUBLISHED
    task.publish_at = datetime.utcnow()
    db.commit()
    
    # Send notification if requested
    if task.send_assignment_email:
        email_service = EmailService(db)
        student_ids = task.assigned_students or []
        if task.assign_to_all:
            students = db.query(User).filter(User.role == "student").all()
            student_ids = [s.id for s in students]
        
        if student_ids:
            email_service.send_task_assignment_notification(task, student_ids)
    
    return {
        "message": "Задание опубликовано",
        "status": task.status,
        "publish_at": task.publish_at
    }

# Task scheduling endpoint
@router.post("/admin/tasks/{task_id}/schedule")
def schedule_task(
    task_id: int,
    schedule_data: dict,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Schedule a task for future publication"""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Задание не найдено"
        )
    
    publish_at = schedule_data.get("publish_at")
    if not publish_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Не указана дата публикации"
        )
    
    try:
        publish_at = datetime.fromisoformat(publish_at.replace('Z', '+00:00'))
    except:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Неверный формат даты"
        )
    
    # Schedule task
    task.status = TaskStatus.SCHEDULED
    task.publish_at = publish_at
    db.commit()
    
    return {
        "message": "Задание запланировано",
        "status": task.status,
        "publish_at": task.publish_at
    }

# Allow retake endpoint
@router.post("/admin/submissions/{submission_id}/allow-retake")
def allow_submission_retake(
    submission_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Allow student to retake a task"""
    submission = db.query(TaskSubmission).options(
        joinedload(TaskSubmission.student),
        joinedload(TaskSubmission.task)
    ).filter(TaskSubmission.id == submission_id).first()
    
    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Сдача не найдена"
        )
    
    # Create new submission for retake
    new_submission = TaskSubmission(
        task_id=submission.task_id,
        student_id=submission.student_id,
        attempt_number=submission.attempt_number + 1,
        status=SubmissionStatus.DRAFT
    )
    
    db.add(new_submission)
    db.commit()
    
    return {
        "message": "Пересдача разрешена",
        "new_submission_id": new_submission.id,
        "attempt_number": new_submission.attempt_number
    }
