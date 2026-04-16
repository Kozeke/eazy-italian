"""
Pydantic payloads for unit homework submissions (student writes + teacher review).
"""

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class HomeworkSubmissionStudentWrite(BaseModel):
    """Student upsert: merge answers and optionally advance workflow."""

    answers: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Logical live keys (e.g. hwu/{unitId}/ex/{blockId}/…) → JSON value",
    )
    action: Literal["save_draft", "submit_for_review"]


class HomeworkSubmissionTeacherReview(BaseModel):
    """Teacher marks homework after reviewing a submission."""

    status: Literal["awaiting_student", "completed"]
    teacher_feedback: Optional[str] = None


class HomeworkSubmissionResponse(BaseModel):
    """Single submission returned to student or teacher."""

    unit_id: int
    student_id: int
    status: str
    answers: Dict[str, Any]
    teacher_feedback: Optional[str]
    submitted_for_review_at: Optional[datetime]
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class HomeworkSubmissionListItem(BaseModel):
    """Row in the teacher roster without full answers payload."""

    student_id: int
    student_name: str
    status: str
    submitted_for_review_at: Optional[datetime]
    updated_at: Optional[datetime]


class HomeworkSubmissionListResponse(BaseModel):
    """Teacher roster for one unit's homework."""

    submissions: List[HomeworkSubmissionListItem]
