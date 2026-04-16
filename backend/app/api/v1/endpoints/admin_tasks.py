from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_, desc, asc, func
from typing import List, Optional
from datetime import datetime

from app.core.database import get_db
from app.core.auth import get_current_teacher
from app.models.user import User
from app.models.task import Task, TaskSubmission, TaskType, TaskStatus, AutoTaskType, SubmissionStatus
from app.models.unit import Unit
from app.models.course import Course
from app.schemas.task import TaskList, TaskCreate, TaskUpdate, TaskInDB

router = APIRouter()

@router.get("/tasks", response_model=List[TaskList])
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
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Задание должно быть назначено хотя бы одной аудитории при публикации"
            )

def validate_auto_config(task_data: dict) -> None:
    """Validate auto-check configuration"""
    if task_data.get('type') == TaskType.AUTO:
        auto_type = task_data.get('auto_task_type')
        if not auto_type:
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="auto_task_type is required for AUTO type tasks"
            )

@router.post("/tasks", response_model=TaskInDB)
def create_task(
    task_data: TaskCreate,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Create a new task"""
    from fastapi import HTTPException, status
    
    # Convert task_data to dict and ensure enum values are used (not names)
    task_dict = task_data.dict(exclude_unset=True)
    
    # Validate unit_id is provided
    if not task_dict.get('unit_id'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="unit_id is required"
        )
    
    # Verify unit exists and belongs to teacher's course
    unit = db.query(Unit).filter(Unit.id == task_dict['unit_id']).first()
    if not unit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Unit not found"
        )
    
    # Check if unit belongs to teacher's course
    if unit.course_id:
        course = db.query(Course).filter(Course.id == unit.course_id).first()
        if course and course.created_by != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to create tasks in this unit"
            )
    
    # Extract assign_to_all from assignment_settings if provided
    if 'assignment_settings' in task_dict and isinstance(task_dict.get('assignment_settings'), dict):
        assignment_settings = task_dict.pop('assignment_settings')
        if 'assign_to_all' in assignment_settings and 'assign_to_all' not in task_dict:
            task_dict['assign_to_all'] = assignment_settings.get('assign_to_all')
    
    # Validate assignment settings (pass db and unit_id for auto-assignment check)
    validate_task_assignment(task_dict, db=db, unit_id=task_dict.get('unit_id'))
    
    # Validate auto-config if applicable
    validate_auto_config(task_dict)
    
    # Ensure enum values are converted to their string values
    # Convert type enum to lowercase string value
    if 'type' in task_dict:
        type_val = task_dict['type']
        if isinstance(type_val, TaskType):
            task_dict['type'] = type_val.value
        elif isinstance(type_val, str):
            task_dict['type'] = type_val.lower()
        else:
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
            task_dict['status'] = status_val.value
        elif isinstance(status_val, str):
            task_dict['status'] = status_val.lower()
        else:
            task_dict['status'] = getattr(status_val, 'value', str(status_val).lower())
    else:
        # If status is not provided, default to DRAFT
        task_dict['status'] = TaskStatus.DRAFT.value
    
    # Create task - set enum fields as enum objects, not strings
    task = Task(
        created_by=current_user.id
    )
    
    # Set all non-enum fields first
    for key, value in task_dict.items():
        if key not in ['type', 'status', 'auto_task_type']:
            setattr(task, key, value)
    
    # Set enum fields as enum objects
    if 'type' in task_dict:
        type_str = task_dict['type']
        try:
            task.type = TaskType(type_str)
        except ValueError:
            task.type = TaskType[type_str.upper()]
    
    if 'status' in task_dict:
        status_str = task_dict['status']
        try:
            task.status = TaskStatus(status_str)
        except ValueError:
            try:
                task.status = TaskStatus[status_str.upper()]
            except KeyError:
                task.status = TaskStatus.DRAFT
    else:
        task.status = TaskStatus.DRAFT
    
    # Set publish_at if status is PUBLISHED and publish_at is not already set
    if task.status == TaskStatus.PUBLISHED and not task.publish_at:
        task.publish_at = datetime.utcnow()
    
    # Auto-assign to all enrolled students if publishing
    if task.status == TaskStatus.PUBLISHED and task.unit_id:
        # If assign_to_all is True, assign to all enrolled students in the course
        if task.assign_to_all:
            unit = db.query(Unit).filter(Unit.id == task.unit_id).first()
            if unit and unit.course_id:
                enrolled_student_ids = get_course_enrolled_students(db, unit.course_id)
                if enrolled_student_ids:
                    task.assigned_students = enrolled_student_ids
        # If no assignments are set, auto-assign to all enrolled students
        elif not task.assigned_cohorts and not task.assigned_students:
            unit = db.query(Unit).filter(Unit.id == task.unit_id).first()
            if unit and unit.course_id:
                enrolled_student_ids = get_course_enrolled_students(db, unit.course_id)
                if enrolled_student_ids:
                    task.assigned_students = enrolled_student_ids
    
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

@router.put("/tasks/{task_id}", response_model=TaskInDB)
def update_task(
    task_id: int,
    task_data: TaskUpdate,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Update a task - only if it belongs to teacher's courses"""
    from fastapi import HTTPException, status
    
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    # Check if task belongs to a unit in one of the teacher's courses
    if task.unit_id:
        unit = db.query(Unit).filter(Unit.id == task.unit_id).first()
        if unit and unit.course_id:
            course = db.query(Course).filter(Course.id == unit.course_id).first()
            if course and course.created_by != current_user.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You don't have permission to update this task"
                )
    elif task.created_by != current_user.id:
        # If task has no unit, check if it was created by the current user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to update this task"
        )
    
    # Validate assignment settings
    update_data = task_data.dict(exclude_unset=True)
    
    # Validate unit_id - must be provided if task doesn't have one, or verify new one is valid
    final_unit_id = update_data.get('unit_id', task.unit_id)
    if not final_unit_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="unit_id is required"
        )
    
    # If unit_id is being updated, verify the new unit exists and belongs to teacher's course
    if 'unit_id' in update_data:
        unit = db.query(Unit).filter(Unit.id == update_data['unit_id']).first()
        if not unit:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Unit not found"
            )
        # Check if unit belongs to teacher's course
        if unit.course_id:
            course = db.query(Course).filter(Course.id == unit.course_id).first()
            if course and course.created_by != current_user.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You don't have permission to assign tasks to this unit"
                )
    
    # Extract assign_to_all from assignment_settings if provided
    if 'assignment_settings' in update_data and isinstance(update_data.get('assignment_settings'), dict):
        assignment_settings = update_data.pop('assignment_settings')
        if 'assign_to_all' in assignment_settings and 'assign_to_all' not in update_data:
            update_data['assign_to_all'] = assignment_settings.get('assign_to_all')
    
    # For validation, merge update data with existing task data
    validation_data = {
        'status': update_data.get('status', task.status),
        'assign_to_all': update_data.get('assign_to_all', task.assign_to_all),
        'assigned_cohorts': update_data.get('assigned_cohorts', task.assigned_cohorts or []),
        'assigned_students': update_data.get('assigned_students', task.assigned_students or []),
        'unit_id': final_unit_id
    }
    
    validate_task_assignment(validation_data, db=db, unit_id=validation_data.get('unit_id'))
    validate_auto_config(update_data)
    
    # Ensure enum values are converted to their string values
    if 'type' in update_data:
        type_val = update_data['type']
        if isinstance(type_val, TaskType):
            update_data['type'] = type_val.value
        elif isinstance(type_val, str):
            update_data['type'] = type_val.lower()
        elif hasattr(type_val, 'value'):
            update_data['type'] = type_val.value
    
    if 'auto_task_type' in update_data and update_data['auto_task_type'] is not None:
        auto_type_val = update_data['auto_task_type']
        if isinstance(auto_type_val, AutoTaskType):
            update_data['auto_task_type'] = auto_type_val.value
        elif isinstance(auto_type_val, str):
            update_data['auto_task_type'] = auto_type_val.lower()
        elif hasattr(auto_type_val, 'value'):
            update_data['auto_task_type'] = auto_type_val.value
    
    if 'status' in update_data:
        status_val = update_data['status']
        if isinstance(status_val, TaskStatus):
            update_data['status'] = status_val.value
        elif isinstance(status_val, str):
            update_data['status'] = status_val.lower()
        elif hasattr(status_val, 'value'):
            update_data['status'] = status_val.value
    
    # Update task
    for field, value in update_data.items():
        if field not in ['type', 'status', 'auto_task_type']:
            setattr(task, field, value)
    
    # Set enum fields as enum objects
    if 'type' in update_data:
        type_str = update_data['type']
        try:
            task.type = TaskType(type_str)
        except ValueError:
            try:
                task.type = TaskType[type_str.upper()]
            except KeyError:
                pass  # Keep existing type if invalid
    
    if 'status' in update_data:
        status_str = update_data['status']
        try:
            task.status = TaskStatus(status_str)
        except ValueError:
            try:
                task.status = TaskStatus[status_str.upper()]
            except KeyError:
                pass  # Keep existing status if invalid
    
    if 'auto_task_type' in update_data and update_data['auto_task_type'] is not None:
        auto_type_str = update_data['auto_task_type']
        try:
            task.auto_task_type = AutoTaskType(auto_type_str)
        except ValueError:
            try:
                task.auto_task_type = AutoTaskType[auto_type_str.upper()]
            except KeyError:
                pass  # Keep existing auto_task_type if invalid
    
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
                enrolled_student_ids = get_course_enrolled_students(db, unit.course_id)
                if enrolled_student_ids:
                    task.assigned_students = enrolled_student_ids
        # If no assignments are set, auto-assign to all enrolled students
        elif not final_assigned_cohorts and not final_assigned_students:
            unit = db.query(Unit).filter(Unit.id == task.unit_id).first()
            if unit and unit.course_id:
                enrolled_student_ids = get_course_enrolled_students(db, unit.course_id)
                if enrolled_student_ids:
                    task.assigned_students = enrolled_student_ids
    
    # Set publish_at if status is being changed to PUBLISHED and publish_at is not already set
    if is_being_published and not task.publish_at:
        task.publish_at = datetime.utcnow()
    
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    
    return task

@router.post("/tasks/{task_id}/publish")
def publish_task(
    task_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Publish a task - only if it belongs to teacher's courses"""
    from fastapi import HTTPException, status
    from app.services.email_service import EmailService
    
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    # Check if task belongs to a unit in one of the teacher's courses
    if task.unit_id:
        unit = db.query(Unit).filter(Unit.id == task.unit_id).first()
        if unit and unit.course_id:
            course = db.query(Course).filter(Course.id == unit.course_id).first()
            if course and course.created_by != current_user.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You don't have permission to publish this task"
                )
    elif task.created_by != current_user.id:
        # If task has no unit, check if it was created by the current user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to publish this task"
        )
    
    if task.status == TaskStatus.PUBLISHED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Task is already published"
        )
    
    # Validate assignment - check if task has assignments or can auto-assign
    has_assignments = (
        task.assign_to_all or 
        (task.assigned_cohorts and len(task.assigned_cohorts) > 0) or 
        (task.assigned_students and len(task.assigned_students) > 0)
    )
    
    if not has_assignments:
        # If task has a unit_id, we can auto-assign to enrolled students
        if task.unit_id:
            unit = db.query(Unit).filter(Unit.id == task.unit_id).first()
            if unit and unit.course_id:
                # Unit has a course, we can auto-assign, so allow it
                enrolled_student_ids = get_course_enrolled_students(db, unit.course_id)
                if enrolled_student_ids:
                    task.assigned_students = enrolled_student_ids
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Task must be assigned to at least one audience when publishing"
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Task must be assigned to at least one audience when publishing"
            )
    
    # Publish task
    task.status = TaskStatus.PUBLISHED
    if not task.publish_at:
        task.publish_at = datetime.utcnow()
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    
    # Send notification if requested
    if task.send_assignment_email:
        email_service = EmailService(db)
        student_ids = task.assigned_students or []
        if task.assign_to_all:
            from app.models.user import UserRole
            students = db.query(User).filter(User.role == UserRole.STUDENT).all()
            student_ids = [s.id for s in students]
        
        if student_ids:
            email_service.send_task_assignment_notification(task, student_ids)
    
    return {
        "message": "Task published successfully",
        "status": task.status.value,
        "publish_at": task.publish_at
    }

def get_task_with_relations(db: Session, task_id: int) -> Optional[Task]:
    """Get task with all related data"""
    return db.query(Task).options(
        joinedload(Task.unit),
        joinedload(Task.created_by_user),
        joinedload(Task.submissions).joinedload(TaskSubmission.student)
    ).filter(Task.id == task_id).first()

@router.get("/tasks/{task_id}", response_model=TaskInDB)
def get_admin_task(
    task_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Get a single task by ID - only if it belongs to teacher's courses"""
    from fastapi import HTTPException, status
    
    task = get_task_with_relations(db, task_id)
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    # Check if task belongs to a unit in one of the teacher's courses
    if task.unit_id:
        unit = db.query(Unit).filter(Unit.id == task.unit_id).first()
        if unit and unit.course_id:
            course = db.query(Course).filter(Course.id == unit.course_id).first()
            if course and course.created_by != current_user.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You don't have permission to access this task"
                )
    elif task.created_by != current_user.id:
        # If task has no unit, check if it was created by the current user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this task"
        )
    
    return task

@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Delete a task - only if it belongs to teacher's courses"""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    # Check if task belongs to a unit in one of the teacher's courses
    if task.unit_id:
        unit = db.query(Unit).filter(Unit.id == task.unit_id).first()
        if unit and unit.course_id:
            course = db.query(Course).filter(Course.id == unit.course_id).first()
            if course and course.created_by != current_user.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You don't have permission to delete this task"
                )
    elif task.created_by != current_user.id:
        # If task has no unit, check if it was created by the current user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to delete this task"
        )
    
    # Check if task has submissions
    submission_count = db.query(TaskSubmission).filter(TaskSubmission.task_id == task_id).count()
    if submission_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete task with existing submissions"
        )
    
    db.delete(task)
    db.commit()
    
    return None
