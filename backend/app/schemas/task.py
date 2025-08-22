from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
from app.models.task import TaskType

class TaskBase(BaseModel):
    title: str
    instructions_rich: Optional[str] = None
    attachments: List[str] = []
    type: TaskType = TaskType.MANUAL
    due_at: Optional[datetime] = None
    max_points: float = 100.0
    rubric: Dict[str, Any] = {}
    auto_check_config: Dict[str, Any] = {}

class TaskCreate(TaskBase):
    unit_id: int

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    instructions_rich: Optional[str] = None
    attachments: Optional[List[str]] = None
    type: Optional[TaskType] = None
    due_at: Optional[datetime] = None
    max_points: Optional[float] = None
    rubric: Optional[Dict[str, Any]] = None
    auto_check_config: Optional[Dict[str, Any]] = None

class TaskResponse(TaskBase):
    id: int
    unit_id: int
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class TaskSubmissionBase(BaseModel):
    answers: Dict[str, Any] = {}
    attachments: List[str] = []

class TaskSubmissionCreate(TaskSubmissionBase):
    pass

class TaskSubmissionResponse(TaskSubmissionBase):
    id: int
    task_id: int
    student_id: int
    submitted_at: Optional[datetime] = None
    graded_at: Optional[datetime] = None
    grader_id: Optional[int] = None
    score: Optional[float] = None
    feedback_rich: Optional[str] = None
    status: str

    class Config:
        from_attributes = True
