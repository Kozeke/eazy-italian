from pydantic import BaseModel, validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from app.models.unit import UnitLevel, UnitStatus

class AttachmentSchema(BaseModel):
    name: str
    path: str
    type: str

class UnitBase(BaseModel):
    title: str
    level: UnitLevel
    description: Optional[str] = None
    goals: Optional[str] = None
    tags: Optional[List[str]] = None
    status: UnitStatus = UnitStatus.DRAFT
    publish_at: Optional[datetime] = None
    order_index: int = 0
    attachments: Optional[List[AttachmentSchema]] = None
    is_visible_to_students: bool = False
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None

class UnitCreate(UnitBase):
    @validator('publish_at')
    def validate_publish_at(cls, v, values):
        if values.get('status') == UnitStatus.SCHEDULED and not v:
            raise ValueError('Publish date is required when status is scheduled')
        if v and v <= datetime.utcnow():
            raise ValueError('Publish date must be in the future')
        return v

class UnitUpdate(BaseModel):
    title: Optional[str] = None
    level: Optional[UnitLevel] = None
    description: Optional[str] = None
    goals: Optional[str] = None
    tags: Optional[List[str]] = None
    status: Optional[UnitStatus] = None
    publish_at: Optional[datetime] = None
    order_index: Optional[int] = None
    attachments: Optional[List[AttachmentSchema]] = None
    is_visible_to_students: Optional[bool] = None
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None

    @validator('publish_at')
    def validate_publish_at(cls, v, values):
        if values.get('status') == UnitStatus.SCHEDULED and not v:
            raise ValueError('Publish date is required when status is scheduled')
        if v and v <= datetime.utcnow():
            raise ValueError('Publish date must be in the future')
        return v

class UnitResponse(UnitBase):
    id: int
    slug: Optional[str] = None
    created_by: int
    updated_by: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class UnitListResponse(BaseModel):
    id: int
    title: str
    level: UnitLevel
    status: UnitStatus
    publish_at: Optional[datetime] = None
    order_index: int
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    content_count: Dict[str, int]

    class Config:
        from_attributes = True

class UnitDetailResponse(UnitResponse):
    content_count: Dict[str, int]
    videos: List[Dict[str, Any]] = []
    tasks: List[Dict[str, Any]] = []
    tests: List[Dict[str, Any]] = []

    class Config:
        from_attributes = True

class UnitReorderRequest(BaseModel):
    videos: List[Dict[str, Any]] = []  # [{id: int, order_index: int}]
    tasks: List[Dict[str, Any]] = []   # [{id: int, order_index: int}]
    tests: List[Dict[str, Any]] = []   # [{id: int, order_index: int}]

class UnitPublishRequest(BaseModel):
    publish_at: Optional[datetime] = None
    publish_children: bool = False

class UnitBulkAction(BaseModel):
    unit_ids: List[int]
    action: str  # publish, unpublish, schedule, archive, delete

class UnitSummaryResponse(BaseModel):
    total_enrolled: int
    started_count: int
    completed_count: int
    average_score: float
    average_time_minutes: float
    completion_rate: float

    class Config:
        from_attributes = True
