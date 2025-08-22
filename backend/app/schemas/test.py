from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
from app.models.test import TestStatus

class TestBase(BaseModel):
    title: str
    description: Optional[str] = None
    settings: Dict[str, Any] = {}
    pass_threshold: float = 70.0
    status: TestStatus = TestStatus.DRAFT

class TestCreate(TestBase):
    unit_id: Optional[int] = None

class TestUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None
    pass_threshold: Optional[float] = None
    status: Optional[TestStatus] = None

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
