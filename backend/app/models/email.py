from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, Enum, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum

class CampaignStatus(str, enum.Enum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    SENT = "sent"
    CANCELLED = "cancelled"

class EmailStatus(str, enum.Enum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"
    BOUNCED = "bounced"

class EmailCampaign(Base):
    __tablename__ = "email_campaigns"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    template_type = Column(String, nullable=True)  # homework_reminder, new_unit, results
    subject = Column(String, nullable=False)
    body_rich = Column(Text, nullable=False)
    audience_filter = Column(JSON, default=dict)  # Filter criteria for recipients
    schedule_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(Enum(CampaignStatus), default=CampaignStatus.DRAFT, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    created_by_user = relationship("User", back_populates="email_campaigns")
    email_logs = relationship("EmailLog", back_populates="campaign", cascade="all, delete-orphan")

    @property
    def is_scheduled(self) -> bool:
        return self.status == CampaignStatus.SCHEDULED

    @property
    def is_sent(self) -> bool:
        return self.status == CampaignStatus.SENT

class EmailLog(Base):
    __tablename__ = "email_logs"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("email_campaigns.id"), nullable=False)
    recipient_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    sent_at = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(Enum(EmailStatus), default=EmailStatus.PENDING, nullable=False)
    error_msg = Column(Text, nullable=True)

    # Relationships
    campaign = relationship("EmailCampaign", back_populates="email_logs")
    recipient = relationship("User")

    @property
    def is_successful(self) -> bool:
        return self.status == EmailStatus.SENT
