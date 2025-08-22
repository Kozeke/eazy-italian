from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ProgressBase(BaseModel):
    completion_pct: float = 0.0
    total_points: float = 0.0
    earned_points: float = 0.0

class ProgressCreate(ProgressBase):
    unit_id: int

class ProgressUpdate(BaseModel):
    completion_pct: Optional[float] = None
    total_points: Optional[float] = None
    earned_points: Optional[float] = None
    completed_at: Optional[datetime] = None

class ProgressResponse(ProgressBase):
    id: int
    student_id: int
    unit_id: int
    started_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True
