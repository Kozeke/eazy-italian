from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from app.models.test import TestStatus

class TestBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    instructions: Optional[str] = None
    time_limit_minutes: int = Field(30, ge=1, le=300)
    passing_score: float = Field(70.0, ge=0, le=100)
    status: TestStatus = TestStatus.DRAFT
    publish_at: Optional[datetime] = None
    order_index: int = Field(0, ge=0)
    settings: Dict[str, Any] = Field(default_factory=dict)

class TestCreate(TestBase):
    unit_id: Optional[int] = None

class TestUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    instructions: Optional[str] = None
    time_limit_minutes: Optional[int] = Field(None, ge=1, le=300)
    passing_score: Optional[float] = Field(None, ge=0, le=100)
    settings: Optional[Dict[str, Any]] = None
    status: Optional[TestStatus] = None
    order_index: Optional[int] = Field(None, ge=0)
    # Allow updating unit association
    unit_id: Optional[int] = Field(None, description="ID юнита")

class TestResponse(TestBase):
    id: int
    unit_id: Optional[int] = None
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class QuestionBase(BaseModel):
    bank_tags: List[str] = []
    level: str
    type: str
    prompt_rich: str
    media: List[str] = []
    options: List[str] = []
    correct_answer: List[str]
    explanation_rich: Optional[str] = None
    points: float = 1.0

class QuestionCreate(QuestionBase):
    pass

class QuestionUpdate(BaseModel):
    bank_tags: Optional[List[str]] = None
    level: Optional[str] = None
    type: Optional[str] = None
    prompt_rich: Optional[str] = None
    media: Optional[List[str]] = None
    options: Optional[List[str]] = None
    correct_answer: Optional[List[str]] = None
    explanation_rich: Optional[str] = None
    points: Optional[float] = None

class QuestionResponse(QuestionBase):
    id: int
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class TestAttemptBase(BaseModel):
    answers: Dict[str, Any] = {}

class TestAttemptCreate(TestAttemptBase):
    pass

class TestAttemptResponse(TestAttemptBase):
    id: int
    test_id: int
    student_id: int
    started_at: datetime
    submitted_at: Optional[datetime] = None
    score: Optional[float] = None
    detail: Dict[str, Any] = {}
    status: str

    class Config:
        from_attributes = True
