from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.core.auth import get_current_teacher
from app.models.user import User
from app.models.email import EmailCampaign
from app.schemas.email import EmailCampaignResponse

router = APIRouter()

@router.get("/", response_model=List[EmailCampaignResponse])
def get_email_campaigns(
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100
):
    campaigns = db.query(EmailCampaign).filter(EmailCampaign.created_by == current_user.id).offset(skip).limit(limit).all()
    return campaigns
