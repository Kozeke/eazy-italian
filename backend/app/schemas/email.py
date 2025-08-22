from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime
from app.models.email import CampaignStatus

class EmailCampaignBase(BaseModel):
    title: str
    template_type: Optional[str] = None
    subject: str
    body_rich: str
    audience_filter: Dict[str, Any] = {}
    schedule_at: Optional[datetime] = None
    status: CampaignStatus = CampaignStatus.DRAFT

class EmailCampaignCreate(EmailCampaignBase):
    pass

class EmailCampaignUpdate(BaseModel):
    title: Optional[str] = None
    template_type: Optional[str] = None
    subject: Optional[str] = None
    body_rich: Optional[str] = None
    audience_filter: Optional[Dict[str, Any]] = None
    schedule_at: Optional[datetime] = None
    status: Optional[CampaignStatus] = None

class EmailCampaignResponse(EmailCampaignBase):
    id: int
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
