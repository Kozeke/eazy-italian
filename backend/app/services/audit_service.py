from sqlalchemy.orm import Session
from typing import Optional, Dict, Any
from app.models.audit import AuditLog, AuditAction
from fastapi import Request
import json

class AuditService:
    def __init__(self, db: Session):
        self.db = db
    
    def log_action(
        self,
        action: AuditAction,
        entity_type: str,
        entity_id: Optional[int] = None,
        user_id: Optional[int] = None,
        details: Optional[Dict[str, Any]] = None,
        request: Optional[Request] = None
    ) -> AuditLog:
        """Log an action to the audit trail"""
        
        # Extract request information if available
        ip_address = None
        user_agent = None
        metadata = {}
        
        if request:
            # Get client IP
            if "x-forwarded-for" in request.headers:
                ip_address = request.headers["x-forwarded-for"].split(",")[0].strip()
            elif "x-real-ip" in request.headers:
                ip_address = request.headers["x-real-ip"]
            else:
                ip_address = request.client.host if request.client else None
            
            # Get user agent
            user_agent = request.headers.get("user-agent")
            
            # Add request metadata
            metadata = {
                "method": request.method,
                "url": str(request.url),
                "headers": dict(request.headers)
            }
        
        # Create audit log entry
        audit_log = AuditLog(
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            user_id=user_id,
            ip_address=ip_address,
            user_agent=user_agent,
            details=details or {},
            metadata=metadata
        )
        
        self.db.add(audit_log)
        self.db.commit()
        self.db.refresh(audit_log)
        
        return audit_log
    
    def log_task_action(
        self,
        action: AuditAction,
        task_id: int,
        user_id: Optional[int] = None,
        details: Optional[Dict[str, Any]] = None,
        request: Optional[Request] = None
    ) -> AuditLog:
        """Log a task-related action"""
        return self.log_action(
            action=action,
            entity_type="task",
            entity_id=task_id,
            user_id=user_id,
            details=details,
            request=request
        )
    
    def log_submission_action(
        self,
        action: AuditAction,
        submission_id: int,
        user_id: Optional[int] = None,
        details: Optional[Dict[str, Any]] = None,
        request: Optional[Request] = None
    ) -> AuditLog:
        """Log a submission-related action"""
        return self.log_action(
            action=action,
            entity_type="submission",
            entity_id=submission_id,
            user_id=user_id,
            details=details,
            request=request
        )
    
    def log_email_action(
        self,
        action: AuditAction,
        campaign_id: int,
        user_id: Optional[int] = None,
        details: Optional[Dict[str, Any]] = None,
        request: Optional[Request] = None
    ) -> AuditLog:
        """Log an email-related action"""
        return self.log_action(
            action=action,
            entity_type="email_campaign",
            entity_id=campaign_id,
            user_id=user_id,
            details=details,
            request=request
        )
    
    def log_user_action(
        self,
        action: AuditAction,
        user_id: int,
        details: Optional[Dict[str, Any]] = None,
        request: Optional[Request] = None
    ) -> AuditLog:
        """Log a user-related action"""
        return self.log_action(
            action=action,
            entity_type="user",
            entity_id=user_id,
            user_id=user_id,
            details=details,
            request=request
        )
    
    def get_audit_logs(
        self,
        entity_type: Optional[str] = None,
        entity_id: Optional[int] = None,
        user_id: Optional[int] = None,
        action: Optional[AuditAction] = None,
        limit: int = 100,
        offset: int = 0
    ) -> list[AuditLog]:
        """Get audit logs with filtering"""
        query = self.db.query(AuditLog)
        
        if entity_type:
            query = query.filter(AuditLog.entity_type == entity_type)
        
        if entity_id:
            query = query.filter(AuditLog.entity_id == entity_id)
        
        if user_id:
            query = query.filter(AuditLog.user_id == user_id)
        
        if action:
            query = query.filter(AuditLog.action == action)
        
        return query.order_by(AuditLog.timestamp.desc()).offset(offset).limit(limit).all()
    
    def get_task_audit_logs(self, task_id: int, limit: int = 100) -> list[AuditLog]:
        """Get audit logs for a specific task"""
        return self.get_audit_logs(
            entity_type="task",
            entity_id=task_id,
            limit=limit
        )
    
    def get_user_audit_logs(self, user_id: int, limit: int = 100) -> list[AuditLog]:
        """Get audit logs for a specific user"""
        return self.get_audit_logs(
            user_id=user_id,
            limit=limit
        )

