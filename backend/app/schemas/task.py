from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any, Union
from datetime import datetime
from enum import Enum

from app.models.task import TaskType, TaskStatus, AutoTaskType, SubmissionStatus

# Base schemas
class TaskBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200, description="Название задания")
    description: Optional[str] = Field(None, max_length=1000, description="Описание")
    instructions: Optional[str] = Field(None, description="Инструкции (rich text)")
    type: TaskType = Field(TaskType.MANUAL, description="Тип задания")
    auto_task_type: Optional[AutoTaskType] = Field(None, description="Тип авто-проверки")
    max_score: float = Field(100.0, ge=0, le=1000, description="Максимальный балл")
    due_at: Optional[datetime] = Field(None, description="Срок сдачи")
    allow_late_submissions: bool = Field(False, description="Разрешить опоздания")
    late_penalty_percent: float = Field(0.0, ge=0, le=100, description="Штраф за опоздание (%)")
    max_attempts: Optional[int] = Field(None, ge=1, description="Максимум попыток")
    order_index: int = Field(0, ge=0, description="Порядок в юните")
    
    # Assignment settings
    assign_to_all: bool = Field(False, description="Назначить всем студентам")
    assigned_cohorts: List[int] = Field(default_factory=list, description="Назначенные когорты")
    assigned_students: List[int] = Field(default_factory=list, description="Назначенные студенты")
    
    # Notification settings
    send_assignment_email: bool = Field(False, description="Отправить email при назначении")
    reminder_days_before: Optional[int] = Field(None, ge=1, le=30, description="Напоминание за X дней")
    send_results_email: bool = Field(False, description="Отправить результаты студенту")
    send_teacher_copy: bool = Field(False, description="Отправить копию учителю при сдаче")

    @validator('due_at', pre=True)
    def validate_due_at(cls, v):
        """Convert empty string to None for due_at"""
        if v == "" or v is None:
            return None
        return v

    @validator('max_attempts', pre=True)
    def validate_max_attempts(cls, v):
        """Convert empty string to None for max_attempts"""
        if v == "" or v is None:
            return None
        return v

    @validator('reminder_days_before', pre=True)
    def validate_reminder_days_before(cls, v):
        """Convert empty string to None for reminder_days_before"""
        if v == "" or v is None:
            return None
        return v

class TaskCreate(TaskBase):
    unit_id: Optional[int] = Field(None, description="ID юнита (опционально)")
    auto_check_config: Dict[str, Any] = Field(default_factory=dict, description="Конфигурация авто-проверки")
    rubric: Dict[str, Any] = Field(default_factory=dict, description="Критерии оценки")
    attachments: List[str] = Field(default_factory=list, description="Прикрепленные файлы")

    @validator('unit_id', pre=True)
    def validate_unit_id(cls, v):
        """Convert empty string to None for unit_id"""
        if v == "" or v is None:
            return None
        return v

    @validator('due_at', pre=True)
    def validate_due_at(cls, v):
        """Convert empty string to None for due_at"""
        if v == "" or v is None:
            return None
        return v

    @validator('max_attempts', pre=True)
    def validate_max_attempts(cls, v):
        """Convert empty string to None for max_attempts"""
        if v == "" or v is None:
            return None
        return v

    @validator('reminder_days_before', pre=True)
    def validate_reminder_days_before(cls, v):
        """Convert empty string to None for reminder_days_before"""
        if v == "" or v is None:
            return None
        return v

    @validator('unit_id', 'assigned_cohorts', 'assigned_students')
    def validate_assignment(cls, v, values):
        """Validate that task is assigned to at least one audience if published"""
        if values.get('status') == TaskStatus.PUBLISHED:
            if not values.get('assign_to_all') and not values.get('assigned_cohorts') and not values.get('assigned_students'):
                raise ValueError("Задание должно быть назначено хотя бы одной аудитории")
        return v

    @validator('auto_check_config')
    def validate_auto_config(cls, v, values):
        """Validate auto-check configuration for auto-gradable tasks"""
        if values.get('type') == TaskType.AUTO:
            auto_type = values.get('auto_task_type')
            if not auto_type:
                raise ValueError("Для авто-проверки должен быть указан тип задания")
            
            # Validate based on auto task type
            if auto_type == AutoTaskType.SCQ:
                if not v.get('options') or len(v.get('options', [])) < 2:
                    raise ValueError("SCQ должно иметь минимум 2 варианта ответа")
                if not v.get('correct_answer'):
                    raise ValueError("SCQ должно иметь правильный ответ")
            
            elif auto_type == AutoTaskType.MCQ:
                if not v.get('options') or len(v.get('options', [])) < 2:
                    raise ValueError("MCQ должно иметь минимум 2 варианта ответа")
                if not v.get('correct_answers') or len(v.get('correct_answers', [])) < 1:
                    raise ValueError("MCQ должно иметь минимум 1 правильный ответ")
            
            elif auto_type == AutoTaskType.GAP_FILL:
                if not v.get('gaps') or len(v.get('gaps', [])) < 1:
                    raise ValueError("Gap-fill должно иметь минимум 1 пропуск")
                for gap in v.get('gaps', []):
                    if not gap.get('acceptable_answers'):
                        raise ValueError("Каждый пропуск должен иметь допустимые ответы")
        
        return v

class TaskUpdate(TaskBase):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    type: Optional[TaskType] = None
    auto_task_type: Optional[AutoTaskType] = None
    max_score: Optional[float] = Field(None, ge=0, le=1000)
    due_at: Optional[datetime] = None
    allow_late_submissions: Optional[bool] = None
    late_penalty_percent: Optional[float] = Field(None, ge=0, le=100)
    max_attempts: Optional[int] = Field(None, ge=1)
    order_index: Optional[int] = Field(None, ge=0)
    assign_to_all: Optional[bool] = None
    assigned_cohorts: Optional[List[int]] = None
    assigned_students: Optional[List[int]] = None
    send_assignment_email: Optional[bool] = None
    reminder_days_before: Optional[int] = Field(None, ge=1, le=30)
    send_results_email: Optional[bool] = None
    send_teacher_copy: Optional[bool] = None
    auto_check_config: Optional[Dict[str, Any]] = None
    rubric: Optional[Dict[str, Any]] = None
    attachments: Optional[List[str]] = None

class TaskInDB(TaskBase):
    id: int
    unit_id: Optional[int]
    status: TaskStatus
    publish_at: Optional[datetime]
    auto_check_config: Dict[str, Any]
    rubric: Dict[str, Any]
    attachments: List[str]
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime]
    
    # Computed properties
    assigned_student_count: int
    submission_stats: Dict[str, int]
    average_score: float
    is_available: bool
    is_overdue: bool

    class Config:
        from_attributes = True

class TaskList(TaskBase):
    id: int
    unit_id: Optional[int]
    status: TaskStatus
    publish_at: Optional[datetime]
    created_at: datetime
    updated_at: Optional[datetime]
    
    # Computed properties
    assigned_student_count: int
    submission_stats: Dict[str, int]
    average_score: float
    is_available: bool
    is_overdue: bool
    
    # Unit info
    unit_title: Optional[str] = None

    class Config:
        from_attributes = True

# Submission schemas
class TaskSubmissionBase(BaseModel):
    answers: Dict[str, Any] = Field(default_factory=dict, description="Ответы студента")
    attachments: List[str] = Field(default_factory=list, description="Прикрепленные файлы")

class TaskSubmissionCreate(TaskSubmissionBase):
    task_id: int
    student_id: int

class TaskSubmissionUpdate(TaskSubmissionBase):
    answers: Optional[Dict[str, Any]] = None
    attachments: Optional[List[str]] = None

class TaskSubmissionGrade(BaseModel):
    score: float = Field(..., ge=0, description="Балл")
    feedback_rich: Optional[str] = Field(None, description="Обратная связь (rich text)")

class TaskSubmissionInDB(TaskSubmissionBase):
    id: int
    task_id: int
    student_id: int
    submitted_at: Optional[datetime]
    graded_at: Optional[datetime]
    grader_id: Optional[int]
    score: Optional[float]
    feedback_rich: Optional[str]
    status: SubmissionStatus
    attempt_number: int
    time_spent_minutes: Optional[int]
    
    # Computed properties
    is_submitted: bool
    is_graded: bool
    is_late: bool
    final_score: float
    
    # Related data
    student_name: Optional[str] = None
    grader_name: Optional[str] = None

    class Config:
        from_attributes = True

# Auto-check configuration schemas
class SCQConfig(BaseModel):
    options: List[str] = Field(..., min_items=2, description="Варианты ответов")
    correct_answer: int = Field(..., ge=0, description="Индекс правильного ответа")
    shuffle_options: bool = Field(True, description="Перемешивать варианты")
    partial_credit: bool = Field(False, description="Частичный балл")

class MCQConfig(BaseModel):
    options: List[str] = Field(..., min_items=2, description="Варианты ответов")
    correct_answers: List[int] = Field(..., min_items=1, description="Индексы правильных ответов")
    shuffle_options: bool = Field(True, description="Перемешивать варианты")
    partial_credit: bool = Field(True, description="Частичный балл")

class MatchingConfig(BaseModel):
    pairs: List[Dict[str, str]] = Field(..., min_items=1, description="Пары для сопоставления")
    scoring_rule: str = Field("all_or_nothing", description="Правило оценки")

class OrderingConfig(BaseModel):
    items: List[str] = Field(..., min_items=2, description="Элементы для упорядочивания")
    correct_order: List[int] = Field(..., description="Правильный порядок")
    scoring_rule: str = Field("exact", description="Правило оценки")

class GapFillConfig(BaseModel):
    text: str = Field(..., description="Текст с пропусками")
    gaps: List[Dict[str, Any]] = Field(..., min_items=1, description="Пропуски")

class ShortAnswerConfig(BaseModel):
    acceptable_answers: List[str] = Field(..., min_items=1, description="Допустимые ответы")
    case_sensitive: bool = Field(False, description="Учитывать регистр")
    use_regex: bool = Field(False, description="Использовать регулярные выражения")

class NumericConfig(BaseModel):
    acceptable_answers: List[float] = Field(..., min_items=1, description="Допустимые ответы")
    tolerance: float = Field(0.0, ge=0, description="Допустимая погрешность")

# Task statistics
class TaskStatistics(BaseModel):
    total_submissions: int
    submitted_count: int
    graded_count: int
    pending_count: int
    average_score: float
    completion_rate: float
    average_time_minutes: Optional[float]
    score_distribution: Dict[str, int]  # Score ranges and counts

# Bulk operations
class TaskBulkAction(BaseModel):
    task_ids: List[int] = Field(..., min_items=1, description="ID заданий")
    action: str = Field(..., description="Действие: publish, unpublish, archive, assign")

class TaskBulkAssign(BaseModel):
    task_ids: List[int] = Field(..., min_items=1, description="ID заданий")
    assign_to_all: bool = Field(False, description="Назначить всем")
    cohort_ids: List[int] = Field(default_factory=list, description="ID когорт")
    student_ids: List[int] = Field(default_factory=list, description="ID студентов")
