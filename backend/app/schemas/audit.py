from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime
from app.models.audit import AuditAction

class AuditLogBase(BaseModel):
    action: AuditAction
    entity_type: str
    entity_id: Optional[int] = None
    user_id: Optional[int] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    details: Dict[str, Any] = {}
    metadata: Dict[str, Any] = {}

class AuditLogCreate(AuditLogBase):
    pass

class AuditLogResponse(AuditLogBase):
    id: int
    timestamp: datetime

    class Config:
        from_attributes = True

class AuditLogFilter(BaseModel):
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    user_id: Optional[int] = None
    action: Optional[AuditAction] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    limit: int = 100
    offset: int = 0

class AuditLogListResponse(BaseModel):
    logs: List[AuditLogResponse]
    total: int
    limit: int
    offset: int

