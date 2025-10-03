from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, Enum, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum

class AuditAction(str, enum.Enum):
    # Task actions
    TASK_CREATED = "task_created"
    TASK_UPDATED = "task_updated"
    TASK_DELETED = "task_deleted"
    TASK_PUBLISHED = "task_published"
    TASK_SCHEDULED = "task_scheduled"
    TASK_ASSIGNED = "task_assigned"
    TASK_UNASSIGNED = "task_unassigned"
    
    # Submission actions
    SUBMISSION_CREATED = "submission_created"
    SUBMISSION_SUBMITTED = "submission_submitted"
    SUBMISSION_GRADED = "submission_graded"
    SUBMISSION_RETAKE_ALLOWED = "submission_retake_allowed"
    
    # Email actions
    EMAIL_SENT = "email_sent"
    EMAIL_FAILED = "email_failed"
    EMAIL_SCHEDULED = "email_scheduled"
    
    # User actions
    USER_LOGIN = "user_login"
    USER_LOGOUT = "user_logout"
    USER_CREATED = "user_created"
    USER_UPDATED = "user_updated"
    
    # System actions
    SYSTEM_BACKUP = "system_backup"
    SYSTEM_MAINTENANCE = "system_maintenance"

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    action = Column(Enum(AuditAction), nullable=False)
    entity_type = Column(String, nullable=False)  # "task", "submission", "user", etc.
    entity_id = Column(Integer, nullable=True)  # ID of the affected entity
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # User who performed the action
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    details = Column(JSON, default=dict)  # Additional details about the action
    metadata = Column(JSON, default=dict)  # System metadata

    # Relationships
    user = relationship("User")

    @property
    def is_system_action(self) -> bool:
        """Check if this is a system-level action"""
        return self.action in [
            AuditAction.SYSTEM_BACKUP,
            AuditAction.SYSTEM_MAINTENANCE
        ]

    @property
    def is_user_action(self) -> bool:
        """Check if this is a user-level action"""
        return not self.is_system_action

    def to_dict(self) -> dict:
        """Convert audit log to dictionary"""
        return {
            "id": self.id,
            "action": self.action.value,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "user_id": self.user_id,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "details": self.details,
            "metadata": self.metadata
        }

