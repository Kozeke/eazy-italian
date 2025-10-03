from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from app.core.database import get_db
from app.core.auth import get_current_teacher
from app.models.user import User
from app.models.audit import AuditLog, AuditAction
from app.schemas.audit import AuditLogResponse, AuditLogFilter, AuditLogListResponse
from app.services.audit_service import AuditService

router = APIRouter()

@router.get("/", response_model=AuditLogListResponse)
def get_audit_logs(
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[int] = Query(None),
    user_id: Optional[int] = Query(None),
    action: Optional[AuditAction] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0)
):
    """Get audit logs with filtering"""
    audit_service = AuditService(db)
    
    # Get logs
    logs = audit_service.get_audit_logs(
        entity_type=entity_type,
        entity_id=entity_id,
        user_id=user_id,
        action=action,
        limit=limit,
        offset=offset
    )
    
    # Apply date filtering if provided
    if start_date or end_date:
        filtered_logs = []
        for log in logs:
            if start_date and log.timestamp < start_date:
                continue
            if end_date and log.timestamp > end_date:
                continue
            filtered_logs.append(log)
        logs = filtered_logs
    
    # Get total count
    total_query = db.query(AuditLog)
    if entity_type:
        total_query = total_query.filter(AuditLog.entity_type == entity_type)
    if entity_id:
        total_query = total_query.filter(AuditLog.entity_id == entity_id)
    if user_id:
        total_query = total_query.filter(AuditLog.user_id == user_id)
    if action:
        total_query = total_query.filter(AuditLog.action == action)
    
    total = total_query.count()
    
    return AuditLogListResponse(
        logs=logs,
        total=total,
        limit=limit,
        offset=offset
    )

@router.get("/task/{task_id}", response_model=List[AuditLogResponse])
def get_task_audit_logs(
    task_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
    limit: int = Query(100, ge=1, le=1000)
):
    """Get audit logs for a specific task"""
    audit_service = AuditService(db)
    logs = audit_service.get_task_audit_logs(task_id, limit=limit)
    return logs

@router.get("/user/{user_id}", response_model=List[AuditLogResponse])
def get_user_audit_logs(
    user_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
    limit: int = Query(100, ge=1, le=1000)
):
    """Get audit logs for a specific user"""
    audit_service = AuditService(db)
    logs = audit_service.get_user_audit_logs(user_id, limit=limit)
    return logs

@router.get("/actions", response_model=List[str])
def get_available_actions():
    """Get list of available audit actions"""
    return [action.value for action in AuditAction]

@router.get("/entity-types", response_model=List[str])
def get_entity_types(
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Get list of entity types that have audit logs"""
    entity_types = db.query(AuditLog.entity_type).distinct().all()
    return [entity_type[0] for entity_type in entity_types]

