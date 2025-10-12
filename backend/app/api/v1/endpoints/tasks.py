from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_, desc, asc
from typing import List, Optional
from datetime import datetime, timedelta
import json

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

router = APIRouter()

# Helper functions
def get_task_with_relations(db: Session, task_id: int) -> Optional[Task]:
    """Get task with all related data"""
    return db.query(Task).options(
        joinedload(Task.unit),
        joinedload(Task.created_by_user),
        joinedload(Task.submissions).joinedload(TaskSubmission.student)
    ).filter(Task.id == task_id).first()

def validate_task_assignment(task_data: dict) -> None:
    """Validate task assignment settings"""
    if task_data.get('status') == TaskStatus.PUBLISHED:
        if not task_data.get('assign_to_all') and not task_data.get('assigned_cohorts') and not task_data.get('assigned_students'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Задание должно быть назначено хотя бы одной аудитории при публикации"
            )

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
    """Get tasks for admin with filtering and pagination"""
    query = db.query(Task).options(
        joinedload(Task.unit),
        joinedload(Task.submissions)
    )
    
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
    
    # Convert to TaskList objects manually
    result = []
    for task in tasks:
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
            "submission_stats": task.submission_stats,
            "average_score": task.average_score,
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
    # Validate assignment settings
    validate_task_assignment(task_data.dict())
    
    # Validate auto-config if applicable
    validate_auto_config(task_data.dict())
    
    # Create task
    task = Task(
        **task_data.dict(exclude_unset=True),
        created_by=current_user.id
    )
    
    db.add(task)
    db.commit()
    db.refresh(task)
    
    return task

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
    validate_task_assignment(update_data)
    validate_auto_config(update_data)
    
    # Update task
    for field, value in update_data.items():
        setattr(task, field, value)
    
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
    
    # Check if task has submissions
    if task.submissions:
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
    """Get submissions for a task"""
    task = db.query(Task).filter(Task.id == task_id).first()
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
    
    # Add computed properties
    for submission in submissions:
        submission.is_submitted = submission.is_submitted
        submission.is_graded = submission.is_graded
        submission.is_late = submission.is_late
        submission.final_score = submission.final_score
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
    """Get specific submission for grading"""
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
    
    # Add computed properties
    submission.is_submitted = submission.is_submitted
    submission.is_graded = submission.is_graded
    submission.is_late = submission.is_late
    submission.final_score = submission.final_score
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
    
    # Send notification to student if enabled
    if submission.task.notify_student_on_grade:
        email_service = EmailService(db)
        email_service.send_grade_notification_to_student(submission)
    
    # Add computed properties
    submission.is_submitted = submission.is_submitted
    submission.is_graded = submission.is_graded
    submission.is_late = submission.is_late
    submission.final_score = submission.final_score
    
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
@router.get("/", response_model=List[TaskList])
def get_student_tasks(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    unit_id: Optional[int] = Query(None)
):
    """Get tasks available to the current student"""
    # For simplicity, just show all published tasks for now
    # In production, you'd filter by assigned_students properly using JSONB operators
    query = db.query(Task).filter(Task.status == TaskStatus.PUBLISHED)
    
    if unit_id:
        query = query.filter(Task.unit_id == unit_id)
    
    tasks = query.all()
    
    # Add computed properties
    for task in tasks:
        task.assigned_student_count = task.assigned_student_count
        task.submission_stats = task.submission_stats
        task.average_score = task.average_score
        task.is_available = task.is_available
        task.is_overdue = task.is_overdue
        if task.unit:
            task.unit_title = task.unit.title
    
    return tasks

@router.get("/{task_id}", response_model=TaskInDB)
def get_student_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get task details for student"""
    task = get_task_with_relations(db, task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Задание не найдено"
        )
    
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
    """Submit a task"""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Задание не найдено"
        )
    
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
    
    # Send notification to teacher if enabled
    if task.notify_teacher_on_submit:
        email_service = EmailService(db)
        email_service.send_submission_notification_to_teacher(submission)
    
    # Add computed properties
    submission.is_submitted = submission.is_submitted
    submission.is_graded = submission.is_graded
    submission.is_late = submission.is_late
    submission.final_score = submission.final_score
    
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
