"""
app/schemas/test.py

Schemas for the Test container and TestAttempt only.

Question create/update/response schemas have been moved to
app/schemas/question.py — import from there.
"""

from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
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
    segment_id: Optional[int] = None


class TestUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    instructions: Optional[str] = None
    time_limit_minutes: Optional[int] = Field(None, ge=1, le=300)
    passing_score: Optional[float] = Field(None, ge=0, le=100)
    settings: Optional[Dict[str, Any]] = None
    status: Optional[TestStatus] = None
    order_index: Optional[int] = Field(None, ge=0)
    unit_id: Optional[int] = Field(None, description="ID of the unit to associate")
    segment_id: Optional[int] = None


class TestResponse(TestBase):
    id: int
    unit_id: Optional[int] = None
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    course_id: Optional[int] = None
    course_title: Optional[str] = None
    unit_title: Optional[str] = None
    questions_count: int = 0

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