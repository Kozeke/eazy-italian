"""
LEGACY FILE — admin_tasks.py (admin task CRUD router)

Architecture change: Task CRUD and TaskSubmission grading are now handled
through the segment block editor and UnitHomeworkSubmission respectively.

Old model:  Task (ORM model) — CRUD managed here
            TaskSubmission — grading managed here
New model:  Segment.media_blocks JSONB (exercise blocks, edited via segment editor)
            UnitHomeworkSubmission.answers / teacher feedback

Replaced by:
  - Task authoring & CRUD:   segment block editor (segments.py / admin segment routes)
  - Submission grading:      UnitHomeworkSubmission teacher feedback fields

This file is fully commented out and kept for reference during migration.
Do NOT re-enable these routes without migrating callers to the new segment API.
"""

# LEGACY: from fastapi import APIRouter, Depends, Query, HTTPException, status
# LEGACY: from sqlalchemy.orm import Session, joinedload
# LEGACY: from sqlalchemy import and_, or_, desc, asc, func
# LEGACY: from typing import List, Optional
# LEGACY: from datetime import datetime

# LEGACY: from app.core.database import get_db
# LEGACY: from app.core.auth import get_current_teacher
# LEGACY: from app.models.user import User
# LEGACY: from app.models.task import Task, TaskSubmission, TaskType, TaskStatus, AutoTaskType, SubmissionStatus
# LEGACY: from app.models.unit import Unit
# LEGACY: from app.models.course import Course
# LEGACY: from app.schemas.task import TaskList, TaskCreate, TaskUpdate, TaskInDB

from fastapi import APIRouter

router = APIRouter()

# LEGACY: @router.get("/tasks", response_model=List[TaskList])
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
# LEGACY:             from fastapi import HTTPException, status
# LEGACY:             raise HTTPException(
# LEGACY:                 status_code=status.HTTP_400_BAD_REQUEST,
# LEGACY:                 detail="Задание должно быть назначено хотя бы одной аудитории при публикации"
# LEGACY:             )

# LEGACY: def validate_auto_config(task_data: dict) -> None:
# LEGACY:     """Validate auto-check configuration"""
# LEGACY:     if task_data.get('type') == TaskType.AUTO:
# LEGACY:         auto_type = task_data.get('auto_task_type')
# LEGACY:         if not auto_type:
# LEGACY:             from fastapi import HTTPException, status
# LEGACY:             raise HTTPException(
# LEGACY:                 status_code=status.HTTP_400_BAD_REQUEST,
# LEGACY:                 detail="auto_task_type is required for AUTO type tasks"
# LEGACY:             )

# LEGACY: @router.post("/tasks", response_model=TaskInDB)
# LEGACY: def create_task(
# LEGACY:     task_data: TaskCreate,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Create a new task"""
# LEGACY:     from fastapi import HTTPException, status

# LEGACY:     # Convert task_data to dict and ensure enum values are used (not names)
# LEGACY:     task_dict = task_data.dict(exclude_unset=True)

# LEGACY:     # Validate unit_id is provided
# LEGACY:     if not task_dict.get('unit_id'):
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_400_BAD_REQUEST,
# LEGACY:             detail="unit_id is required"
# LEGACY:         )

# LEGACY:     # Verify unit exists and belongs to teacher's course
# LEGACY:     unit = db.query(Unit).filter(Unit.id == task_dict['unit_id']).first()
# LEGACY:     if not unit:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_404_NOT_FOUND,
# LEGACY:             detail="Unit not found"
# LEGACY:         )

# LEGACY:     # Check if unit belongs to teacher's course
# LEGACY:     if unit.course_id:
# LEGACY:         course = db.query(Course).filter(Course.id == unit.course_id).first()
# LEGACY:         if course and course.created_by != current_user.id:
# LEGACY:             raise HTTPException(
# LEGACY:                 status_code=status.HTTP_403_FORBIDDEN,
# LEGACY:                 detail="You don't have permission to create tasks in this unit"
# LEGACY:             )

# LEGACY:     # Extract assign_to_all from assignment_settings if provided
# LEGACY:     if 'assignment_settings' in task_dict and isinstance(task_dict.get('assignment_settings'), dict):
# LEGACY:         assignment_settings = task_dict.pop('assignment_settings')
# LEGACY:         if 'assign_to_all' in assignment_settings and 'assign_to_all' not in task_dict:
# LEGACY:             task_dict['assign_to_all'] = assignment_settings.get('assign_to_all')

# LEGACY:     # Validate assignment settings (pass db and unit_id for auto-assignment check)
# LEGACY:     validate_task_assignment(task_dict, db=db, unit_id=task_dict.get('unit_id'))

# LEGACY:     # Validate auto-config if applicable
# LEGACY:     validate_auto_config(task_dict)

# LEGACY:     # Ensure enum values are converted to their string values
# LEGACY:     # Convert type enum to lowercase string value
# LEGACY:     if 'type' in task_dict:
# LEGACY:         type_val = task_dict['type']
# LEGACY:         if isinstance(type_val, TaskType):
# LEGACY:             task_dict['type'] = type_val.value
# LEGACY:         elif isinstance(type_val, str):
# LEGACY:             task_dict['type'] = type_val.lower()
# LEGACY:         else:
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
# LEGACY:             task_dict['status'] = status_val.value
# LEGACY:         elif isinstance(status_val, str):
# LEGACY:             task_dict['status'] = status_val.lower()
# LEGACY:         else:
# LEGACY:             task_dict['status'] = getattr(status_val, 'value', str(status_val).lower())
# LEGACY:     else:
# LEGACY:         # If status is not provided, default to DRAFT
# LEGACY:         task_dict['status'] = TaskStatus.DRAFT.value

# LEGACY:     # Create task - set enum fields as enum objects, not strings
# LEGACY:     task = Task(
# LEGACY:         created_by=current_user.id
# LEGACY:     )

# LEGACY:     # Set all non-enum fields first
# LEGACY:     for key, value in task_dict.items():
# LEGACY:         if key not in ['type', 'status', 'auto_task_type']:
# LEGACY:             setattr(task, key, value)

# LEGACY:     # Set enum fields as enum objects
# LEGACY:     if 'type' in task_dict:
# LEGACY:         type_str = task_dict['type']
# LEGACY:         try:
# LEGACY:             task.type = TaskType(type_str)
# LEGACY:         except ValueError:
# LEGACY:             task.type = TaskType[type_str.upper()]

# LEGACY:     if 'status' in task_dict:
# LEGACY:         status_str = task_dict['status']
# LEGACY:         try:
# LEGACY:             task.status = TaskStatus(status_str)
# LEGACY:         except ValueError:
# LEGACY:             try:
# LEGACY:                 task.status = TaskStatus[status_str.upper()]
# LEGACY:             except KeyError:
# LEGACY:                 task.status = TaskStatus.DRAFT
# LEGACY:     else:
# LEGACY:         task.status = TaskStatus.DRAFT

# LEGACY:     # Set publish_at if status is PUBLISHED and publish_at is not already set
# LEGACY:     if task.status == TaskStatus.PUBLISHED and not task.publish_at:
# LEGACY:         task.publish_at = datetime.utcnow()

# LEGACY:     # Auto-assign to all enrolled students if publishing
# LEGACY:     if task.status == TaskStatus.PUBLISHED and task.unit_id:
# LEGACY:         # If assign_to_all is True, assign to all enrolled students in the course
# LEGACY:         if task.assign_to_all:
# LEGACY:             unit = db.query(Unit).filter(Unit.id == task.unit_id).first()
# LEGACY:             if unit and unit.course_id:
# LEGACY:                 enrolled_student_ids = get_course_enrolled_students(db, unit.course_id)
# LEGACY:                 if enrolled_student_ids:
# LEGACY:                     task.assigned_students = enrolled_student_ids
# LEGACY:         # If no assignments are set, auto-assign to all enrolled students
# LEGACY:         elif not task.assigned_cohorts and not task.assigned_students:
# LEGACY:             unit = db.query(Unit).filter(Unit.id == task.unit_id).first()
# LEGACY:             if unit and unit.course_id:
# LEGACY:                 enrolled_student_ids = get_course_enrolled_students(db, unit.course_id)
# LEGACY:                 if enrolled_student_ids:
# LEGACY:                     task.assigned_students = enrolled_student_ids

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

# LEGACY: @router.put("/tasks/{task_id}", response_model=TaskInDB)
# LEGACY: def update_task(
# LEGACY:     task_id: int,
# LEGACY:     task_data: TaskUpdate,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Update a task - only if it belongs to teacher's courses"""
# LEGACY:     from fastapi import HTTPException, status

# LEGACY:     task = db.query(Task).filter(Task.id == task_id).first()
# LEGACY:     if not task:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_404_NOT_FOUND,
# LEGACY:             detail="Task not found"
# LEGACY:         )

# LEGACY:     # Check if task belongs to a unit in one of the teacher's courses
# LEGACY:     if task.unit_id:
# LEGACY:         unit = db.query(Unit).filter(Unit.id == task.unit_id).first()
# LEGACY:         if unit and unit.course_id:
# LEGACY:             course = db.query(Course).filter(Course.id == unit.course_id).first()
# LEGACY:             if course and course.created_by != current_user.id:
# LEGACY:                 raise HTTPException(
# LEGACY:                     status_code=status.HTTP_403_FORBIDDEN,
# LEGACY:                     detail="You don't have permission to update this task"
# LEGACY:                 )
# LEGACY:     elif task.created_by != current_user.id:
# LEGACY:         # If task has no unit, check if it was created by the current user
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_403_FORBIDDEN,
# LEGACY:             detail="You don't have permission to update this task"
# LEGACY:         )

# LEGACY:     # Validate assignment settings
# LEGACY:     update_data = task_data.dict(exclude_unset=True)

# LEGACY:     # Validate unit_id - must be provided if task doesn't have one, or verify new one is valid
# LEGACY:     final_unit_id = update_data.get('unit_id', task.unit_id)
# LEGACY:     if not final_unit_id:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_400_BAD_REQUEST,
# LEGACY:             detail="unit_id is required"
# LEGACY:         )

# LEGACY:     # If unit_id is being updated, verify the new unit exists and belongs to teacher's course
# LEGACY:     if 'unit_id' in update_data:
# LEGACY:         unit = db.query(Unit).filter(Unit.id == update_data['unit_id']).first()
# LEGACY:         if not unit:
# LEGACY:             raise HTTPException(
# LEGACY:                 status_code=status.HTTP_404_NOT_FOUND,
# LEGACY:                 detail="Unit not found"
# LEGACY:             )
# LEGACY:         # Check if unit belongs to teacher's course
# LEGACY:         if unit.course_id:
# LEGACY:             course = db.query(Course).filter(Course.id == unit.course_id).first()
# LEGACY:             if course and course.created_by != current_user.id:
# LEGACY:                 raise HTTPException(
# LEGACY:                     status_code=status.HTTP_403_FORBIDDEN,
# LEGACY:                     detail="You don't have permission to assign tasks to this unit"
# LEGACY:                 )

# LEGACY:     # Extract assign_to_all from assignment_settings if provided
# LEGACY:     if 'assignment_settings' in update_data and isinstance(update_data.get('assignment_settings'), dict):
# LEGACY:         assignment_settings = update_data.pop('assignment_settings')
# LEGACY:         if 'assign_to_all' in assignment_settings and 'assign_to_all' not in update_data:
# LEGACY:             update_data['assign_to_all'] = assignment_settings.get('assign_to_all')

# LEGACY:     # For validation, merge update data with existing task data
# LEGACY:     validation_data = {
# LEGACY:         'status': update_data.get('status', task.status),
# LEGACY:         'assign_to_all': update_data.get('assign_to_all', task.assign_to_all),
# LEGACY:         'assigned_cohorts': update_data.get('assigned_cohorts', task.assigned_cohorts or []),
# LEGACY:         'assigned_students': update_data.get('assigned_students', task.assigned_students or []),
# LEGACY:         'unit_id': final_unit_id
# LEGACY:     }

# LEGACY:     validate_task_assignment(validation_data, db=db, unit_id=validation_data.get('unit_id'))
# LEGACY:     validate_auto_config(update_data)

# LEGACY:     # Ensure enum values are converted to their string values
# LEGACY:     if 'type' in update_data:
# LEGACY:         type_val = update_data['type']
# LEGACY:         if isinstance(type_val, TaskType):
# LEGACY:             update_data['type'] = type_val.value
# LEGACY:         elif isinstance(type_val, str):
# LEGACY:             update_data['type'] = type_val.lower()
# LEGACY:         elif hasattr(type_val, 'value'):
# LEGACY:             update_data['type'] = type_val.value

# LEGACY:     if 'auto_task_type' in update_data and update_data['auto_task_type'] is not None:
# LEGACY:         auto_type_val = update_data['auto_task_type']
# LEGACY:         if isinstance(auto_type_val, AutoTaskType):
# LEGACY:             update_data['auto_task_type'] = auto_type_val.value
# LEGACY:         elif isinstance(auto_type_val, str):
# LEGACY:             update_data['auto_task_type'] = auto_type_val.lower()
# LEGACY:         elif hasattr(auto_type_val, 'value'):
# LEGACY:             update_data['auto_task_type'] = auto_type_val.value

# LEGACY:     if 'status' in update_data:
# LEGACY:         status_val = update_data['status']
# LEGACY:         if isinstance(status_val, TaskStatus):
# LEGACY:             update_data['status'] = status_val.value
# LEGACY:         elif isinstance(status_val, str):
# LEGACY:             update_data['status'] = status_val.lower()
# LEGACY:         elif hasattr(status_val, 'value'):
# LEGACY:             update_data['status'] = status_val.value

# LEGACY:     # Update task
# LEGACY:     for field, value in update_data.items():
# LEGACY:         if field not in ['type', 'status', 'auto_task_type']:
# LEGACY:             setattr(task, field, value)

# LEGACY:     # Set enum fields as enum objects
# LEGACY:     if 'type' in update_data:
# LEGACY:         type_str = update_data['type']
# LEGACY:         try:
# LEGACY:             task.type = TaskType(type_str)
# LEGACY:         except ValueError:
# LEGACY:             try:
# LEGACY:                 task.type = TaskType[type_str.upper()]
# LEGACY:             except KeyError:
# LEGACY:                 pass  # Keep existing type if invalid

# LEGACY:     if 'status' in update_data:
# LEGACY:         status_str = update_data['status']
# LEGACY:         try:
# LEGACY:             task.status = TaskStatus(status_str)
# LEGACY:         except ValueError:
# LEGACY:             try:
# LEGACY:                 task.status = TaskStatus[status_str.upper()]
# LEGACY:             except KeyError:
# LEGACY:                 pass  # Keep existing status if invalid

# LEGACY:     if 'auto_task_type' in update_data and update_data['auto_task_type'] is not None:
# LEGACY:         auto_type_str = update_data['auto_task_type']
# LEGACY:         try:
# LEGACY:             task.auto_task_type = AutoTaskType(auto_type_str)
# LEGACY:         except ValueError:
# LEGACY:             try:
# LEGACY:                 task.auto_task_type = AutoTaskType[auto_type_str.upper()]
# LEGACY:             except KeyError:
# LEGACY:                 pass  # Keep existing auto_task_type if invalid

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
# LEGACY:                 enrolled_student_ids = get_course_enrolled_students(db, unit.course_id)
# LEGACY:                 if enrolled_student_ids:
# LEGACY:                     task.assigned_students = enrolled_student_ids
# LEGACY:         # If no assignments are set, auto-assign to all enrolled students
# LEGACY:         elif not final_assigned_cohorts and not final_assigned_students:
# LEGACY:             unit = db.query(Unit).filter(Unit.id == task.unit_id).first()
# LEGACY:             if unit and unit.course_id:
# LEGACY:                 enrolled_student_ids = get_course_enrolled_students(db, unit.course_id)
# LEGACY:                 if enrolled_student_ids:
# LEGACY:                     task.assigned_students = enrolled_student_ids

# LEGACY:     # Set publish_at if status is being changed to PUBLISHED and publish_at is not already set
# LEGACY:     if is_being_published and not task.publish_at:
# LEGACY:         task.publish_at = datetime.utcnow()

# LEGACY:     task.updated_at = datetime.utcnow()
# LEGACY:     db.commit()
# LEGACY:     db.refresh(task)

# LEGACY:     return task

# LEGACY: @router.post("/tasks/{task_id}/publish")
# LEGACY: def publish_task(
# LEGACY:     task_id: int,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Publish a task - only if it belongs to teacher's courses"""
# LEGACY:     from fastapi import HTTPException, status
# LEGACY:     from app.services.email_service import EmailService

# LEGACY:     task = db.query(Task).filter(Task.id == task_id).first()
# LEGACY:     if not task:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_404_NOT_FOUND,
# LEGACY:             detail="Task not found"
# LEGACY:         )

# LEGACY:     # Check if task belongs to a unit in one of the teacher's courses
# LEGACY:     if task.unit_id:
# LEGACY:         unit = db.query(Unit).filter(Unit.id == task.unit_id).first()
# LEGACY:         if unit and unit.course_id:
# LEGACY:             course = db.query(Course).filter(Course.id == unit.course_id).first()
# LEGACY:             if course and course.created_by != current_user.id:
# LEGACY:                 raise HTTPException(
# LEGACY:                     status_code=status.HTTP_403_FORBIDDEN,
# LEGACY:                     detail="You don't have permission to publish this task"
# LEGACY:                 )
# LEGACY:     elif task.created_by != current_user.id:
# LEGACY:         # If task has no unit, check if it was created by the current user
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_403_FORBIDDEN,
# LEGACY:             detail="You don't have permission to publish this task"
# LEGACY:         )

# LEGACY:     if task.status == TaskStatus.PUBLISHED:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_400_BAD_REQUEST,
# LEGACY:             detail="Task is already published"
# LEGACY:         )

# LEGACY:     # Validate assignment - check if task has assignments or can auto-assign
# LEGACY:     has_assignments = (
# LEGACY:         task.assign_to_all or 
# LEGACY:         (task.assigned_cohorts and len(task.assigned_cohorts) > 0) or 
# LEGACY:         (task.assigned_students and len(task.assigned_students) > 0)
# LEGACY:     )

# LEGACY:     if not has_assignments:
# LEGACY:         # If task has a unit_id, we can auto-assign to enrolled students
# LEGACY:         if task.unit_id:
# LEGACY:             unit = db.query(Unit).filter(Unit.id == task.unit_id).first()
# LEGACY:             if unit and unit.course_id:
# LEGACY:                 # Unit has a course, we can auto-assign, so allow it
# LEGACY:                 enrolled_student_ids = get_course_enrolled_students(db, unit.course_id)
# LEGACY:                 if enrolled_student_ids:
# LEGACY:                     task.assigned_students = enrolled_student_ids
# LEGACY:             else:
# LEGACY:                 raise HTTPException(
# LEGACY:                     status_code=status.HTTP_400_BAD_REQUEST,
# LEGACY:                     detail="Task must be assigned to at least one audience when publishing"
# LEGACY:                 )
# LEGACY:         else:
# LEGACY:             raise HTTPException(
# LEGACY:                 status_code=status.HTTP_400_BAD_REQUEST,
# LEGACY:                 detail="Task must be assigned to at least one audience when publishing"
# LEGACY:             )

# LEGACY:     # Publish task
# LEGACY:     task.status = TaskStatus.PUBLISHED
# LEGACY:     if not task.publish_at:
# LEGACY:         task.publish_at = datetime.utcnow()
# LEGACY:     task.updated_at = datetime.utcnow()
# LEGACY:     db.commit()
# LEGACY:     db.refresh(task)

# LEGACY:     # Send notification if requested
# LEGACY:     if task.send_assignment_email:
# LEGACY:         email_service = EmailService(db)
# LEGACY:         student_ids = task.assigned_students or []
# LEGACY:         if task.assign_to_all:
# LEGACY:             from app.models.user import UserRole
# LEGACY:             students = db.query(User).filter(User.role == UserRole.STUDENT).all()
# LEGACY:             student_ids = [s.id for s in students]

# LEGACY:         if student_ids:
# LEGACY:             email_service.send_task_assignment_notification(task, student_ids)

# LEGACY:     return {
# LEGACY:         "message": "Task published successfully",
# LEGACY:         "status": task.status.value,
# LEGACY:         "publish_at": task.publish_at
# LEGACY:     }

# LEGACY: def get_task_with_relations(db: Session, task_id: int) -> Optional[Task]:
# LEGACY:     """Get task with all related data"""
# LEGACY:     return db.query(Task).options(
# LEGACY:         joinedload(Task.unit),
# LEGACY:         joinedload(Task.created_by_user),
# LEGACY:         joinedload(Task.submissions).joinedload(TaskSubmission.student)
# LEGACY:     ).filter(Task.id == task_id).first()

# LEGACY: @router.get("/tasks/{task_id}", response_model=TaskInDB)
# LEGACY: def get_admin_task(
# LEGACY:     task_id: int,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Get a single task by ID - only if it belongs to teacher's courses"""
# LEGACY:     from fastapi import HTTPException, status

# LEGACY:     task = get_task_with_relations(db, task_id)

# LEGACY:     if not task:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_404_NOT_FOUND,
# LEGACY:             detail="Task not found"
# LEGACY:         )

# LEGACY:     # Check if task belongs to a unit in one of the teacher's courses
# LEGACY:     if task.unit_id:
# LEGACY:         unit = db.query(Unit).filter(Unit.id == task.unit_id).first()
# LEGACY:         if unit and unit.course_id:
# LEGACY:             course = db.query(Course).filter(Course.id == unit.course_id).first()
# LEGACY:             if course and course.created_by != current_user.id:
# LEGACY:                 raise HTTPException(
# LEGACY:                     status_code=status.HTTP_403_FORBIDDEN,
# LEGACY:                     detail="You don't have permission to access this task"
# LEGACY:                 )
# LEGACY:     elif task.created_by != current_user.id:
# LEGACY:         # If task has no unit, check if it was created by the current user
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_403_FORBIDDEN,
# LEGACY:             detail="You don't have permission to access this task"
# LEGACY:         )

# LEGACY:     return task

# LEGACY: @router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
# LEGACY: def delete_task(
# LEGACY:     task_id: int,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Delete a task - only if it belongs to teacher's courses"""
# LEGACY:     task = db.query(Task).filter(Task.id == task_id).first()
# LEGACY:     if not task:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_404_NOT_FOUND,
# LEGACY:             detail="Task not found"
# LEGACY:         )

# LEGACY:     # Check if task belongs to a unit in one of the teacher's courses
# LEGACY:     if task.unit_id:
# LEGACY:         unit = db.query(Unit).filter(Unit.id == task.unit_id).first()
# LEGACY:         if unit and unit.course_id:
# LEGACY:             course = db.query(Course).filter(Course.id == unit.course_id).first()
# LEGACY:             if course and course.created_by != current_user.id:
# LEGACY:                 raise HTTPException(
# LEGACY:                     status_code=status.HTTP_403_FORBIDDEN,
# LEGACY:                     detail="You don't have permission to delete this task"
# LEGACY:                 )
# LEGACY:     elif task.created_by != current_user.id:
# LEGACY:         # If task has no unit, check if it was created by the current user
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_403_FORBIDDEN,
# LEGACY:             detail="You don't have permission to delete this task"
# LEGACY:         )

# LEGACY:     # Check if task has submissions
# LEGACY:     submission_count = db.query(TaskSubmission).filter(TaskSubmission.task_id == task_id).count()
# LEGACY:     if submission_count > 0:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=status.HTTP_400_BAD_REQUEST,
# LEGACY:             detail="Cannot delete task with existing submissions"
# LEGACY:         )

# LEGACY:     db.delete(task)
# LEGACY:     db.commit()

# LEGACY:     return None
