from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_, desc, asc, func
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta

from app.core.database import get_db
from app.core.auth import get_current_user, get_current_teacher
from app.models.user import User
from app.models.unit import Unit, UnitLevel, UnitStatus
from app.models.video import Video, VideoStatus
from app.models.task import Task, TaskStatus
from app.models.test import Test, TestStatus
from app.models.progress import Progress
from app.schemas.unit import (
    UnitResponse, UnitCreate, UnitUpdate, UnitListResponse,
    UnitDetailResponse, UnitReorderRequest, UnitPublishRequest,
    UnitBulkAction, UnitSummaryResponse
)

router = APIRouter()

@router.get("/admin/units", response_model=List[UnitListResponse])
async def get_admin_units(
    query: Optional[str] = Query(None, description="Search by title or description"),
    level: Optional[UnitLevel] = Query(None, description="Filter by level"),
    status: Optional[UnitStatus] = Query(None, description="Filter by status"),
    created_by: Optional[int] = Query(None, description="Filter by creator"),
    has_content: Optional[bool] = Query(None, description="Filter by content availability"),
    from_date: Optional[datetime] = Query(None, description="Filter by creation date from"),
    to_date: Optional[datetime] = Query(None, description="Filter by creation date to"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(25, ge=1, le=100, description="Items per page"),
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Get paginated list of units for admin panel"""
    
    # Build query
    query_builder = db.query(Unit).options(
        joinedload(Unit.created_by_user)
    )
    
    # Apply filters
    if query:
        search_term = f"%{query}%"
        query_builder = query_builder.filter(
            or_(
                Unit.title.ilike(search_term),
                Unit.description.ilike(search_term)
            )
        )
    
    if level:
        query_builder = query_builder.filter(Unit.level == level)
    
    if status:
        query_builder = query_builder.filter(Unit.status == status)
    
    if created_by:
        query_builder = query_builder.filter(Unit.created_by == created_by)
    
    if from_date:
        query_builder = query_builder.filter(Unit.created_at >= from_date)
    
    if to_date:
        query_builder = query_builder.filter(Unit.created_at <= to_date)
    
    # Apply pagination
    offset = (page - 1) * limit
    units = query_builder.order_by(desc(Unit.created_at)).offset(offset).limit(limit).all()
    
    # Convert to response format
    result = []
    for unit in units:
        content_count = unit.content_count
        result.append(UnitListResponse(
            id=unit.id,
            title=unit.title,
            level=unit.level,
            status=unit.status,
            publish_at=unit.publish_at,
            order_index=unit.order_index,
            created_by=unit.created_by,
            created_at=unit.created_at,
            updated_at=unit.updated_at,
            content_count=content_count
        ))
    
    return result

@router.post("/admin/units", response_model=UnitResponse)
async def create_unit(
    unit_data: UnitCreate,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Create a new unit"""
    
    # Generate slug
    slug = unit_data.title.lower().replace(' ', '-')
    
    # Check for duplicate slug
    existing_unit = db.query(Unit).filter(Unit.slug == slug).first()
    if existing_unit:
        counter = 1
        while db.query(Unit).filter(Unit.slug == f"{slug}-{counter}").first():
            counter += 1
        slug = f"{slug}-{counter}"
    
    # Create unit
    unit = Unit(
        **unit_data.dict(),
        created_by=current_user.id,
        slug=slug
    )
    
    db.add(unit)
    db.commit()
    db.refresh(unit)
    
    return unit

@router.get("/admin/units/{unit_id}", response_model=UnitDetailResponse)
async def get_unit(
    unit_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Get unit details with content"""
    
    unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    # Get content items
    videos = db.query(Video).filter(Video.unit_id == unit_id).order_by(Video.order_index).all()
    tasks = db.query(Task).filter(Task.unit_id == unit_id).order_by(Task.order_index).all()
    tests = db.query(Test).filter(Test.unit_id == unit_id).order_by(Test.order_index).all()
    
    # Convert to response format
    video_data = [
        {
            "id": video.id,
            "title": video.title,
            "status": video.status,
            "order_index": video.order_index,
            "duration_sec": video.duration_sec,
            "thumbnail_path": video.thumbnail_path
        }
        for video in videos
    ]
    
    task_data = [
        {
            "id": task.id,
            "title": task.title,
            "status": task.status,
            "order_index": task.order_index,
            "type": task.type
        }
        for task in tasks
    ]
    
    test_data = [
        {
            "id": test.id,
            "title": test.title,
            "status": test.status,
            "order_index": test.order_index,
            "time_limit_minutes": test.time_limit_minutes
        }
        for test in tests
    ]
    
    return UnitDetailResponse(
        **unit.__dict__,
        content_count=unit.content_count,
        videos=video_data,
        tasks=task_data,
        tests=test_data
    )

@router.put("/admin/units/{unit_id}", response_model=UnitResponse)
async def update_unit(
    unit_id: int,
    unit_data: UnitUpdate,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Update unit"""
    
    unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    # Update fields
    update_data = unit_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(unit, field, value)
    
    # Update slug if title changed
    if 'title' in update_data:
        slug = unit.title.lower().replace(' ', '-')
        existing_unit = db.query(Unit).filter(
            and_(Unit.slug == slug, Unit.id != unit_id)
        ).first()
        if existing_unit:
            counter = 1
            while db.query(Unit).filter(
                and_(Unit.slug == f"{slug}-{counter}", Unit.id != unit_id)
            ).first():
                counter += 1
            slug = f"{slug}-{counter}"
        unit.slug = slug
    
    unit.updated_by = current_user.id
    unit.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(unit)
    
    return unit

@router.delete("/admin/units/{unit_id}")
async def delete_unit(
    unit_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Delete unit"""
    
    unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    db.delete(unit)
    db.commit()
    
    return {"message": "Unit deleted successfully"}

@router.post("/admin/units/{unit_id}/reorder")
async def reorder_unit_content(
    unit_id: int,
    reorder_data: UnitReorderRequest,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Reorder content within a unit"""
    
    unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    # Update video order
    for item in reorder_data.videos:
        video = db.query(Video).filter(
            and_(Video.id == item['id'], Video.unit_id == unit_id)
        ).first()
        if video:
            video.order_index = item['order_index']
    
    # Update task order
    for item in reorder_data.tasks:
        task = db.query(Task).filter(
            and_(Task.id == item['id'], Task.unit_id == unit_id)
        ).first()
        if task:
            task.order_index = item['order_index']
    
    # Update test order
    for item in reorder_data.tests:
        test = db.query(Test).filter(
            and_(Test.id == item['id'], Test.unit_id == unit_id)
        ).first()
        if test:
            test.order_index = item['order_index']
    
    db.commit()
    
    return {"message": "Content reordered successfully"}

@router.post("/admin/units/{unit_id}/publish")
async def publish_unit(
    unit_id: int,
    publish_data: UnitPublishRequest,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Publish or schedule a unit"""
    
    unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    # Check if unit can be published
    can_publish, reason = unit.can_publish()
    if not can_publish:
        raise HTTPException(status_code=400, detail=reason)
    
    # Set status and publish date
    if publish_data.publish_at:
        unit.status = UnitStatus.SCHEDULED
        unit.publish_at = publish_data.publish_at
    else:
        unit.status = UnitStatus.PUBLISHED
        unit.publish_at = datetime.utcnow()
    
    # Publish children if requested
    if publish_data.publish_children:
        videos = db.query(Video).filter(Video.unit_id == unit_id).all()
        tasks = db.query(Task).filter(Task.unit_id == unit_id).all()
        tests = db.query(Test).filter(Test.unit_id == unit_id).all()
        
        for video in videos:
            if video.status == VideoStatus.DRAFT:
                video.status = VideoStatus.PUBLISHED
                video.publish_at = datetime.utcnow()
        
        for task in tasks:
            if task.status == TaskStatus.DRAFT:
                task.status = TaskStatus.PUBLISHED
                task.publish_at = datetime.utcnow()
        
        for test in tests:
            if test.status == TestStatus.DRAFT:
                test.status = TestStatus.PUBLISHED
                test.publish_at = datetime.utcnow()
    
    unit.updated_by = current_user.id
    unit.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(unit)
    
    return {"message": f"Unit {unit.status} successfully"}

@router.post("/admin/units/{unit_id}/unpublish")
async def unpublish_unit(
    unit_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Unpublish a unit"""
    
    unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    unit.status = UnitStatus.DRAFT
    unit.publish_at = None
    unit.updated_by = current_user.id
    unit.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(unit)
    
    return {"message": "Unit unpublished successfully"}

@router.post("/admin/units/bulk-action")
async def bulk_action_units(
    action_data: UnitBulkAction,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Perform bulk actions on units"""
    
    units = db.query(Unit).filter(Unit.id.in_(action_data.unit_ids)).all()
    if not units:
        raise HTTPException(status_code=404, detail="No units found")
    
    updated_count = 0
    
    for unit in units:
        if action_data.action == "publish":
            can_publish, reason = unit.can_publish()
            if can_publish:
                unit.status = UnitStatus.PUBLISHED
                unit.publish_at = datetime.utcnow()
                updated_count += 1
        elif action_data.action == "unpublish":
            unit.status = UnitStatus.DRAFT
            unit.publish_at = None
            updated_count += 1
        elif action_data.action == "schedule":
            unit.status = UnitStatus.SCHEDULED
            unit.publish_at = datetime.utcnow() + timedelta(days=7)  # Default to 1 week
            updated_count += 1
        elif action_data.action == "archive":
            unit.status = UnitStatus.ARCHIVED
            updated_count += 1
        elif action_data.action == "delete":
            db.delete(unit)
            continue
        
        unit.updated_by = current_user.id
        unit.updated_at = datetime.utcnow()
    
    db.commit()
    
    return {
        "message": f"Bulk action '{action_data.action}' completed",
        "updated_count": updated_count,
        "deleted_count": len(action_data.unit_ids) - updated_count if action_data.action == "delete" else 0
    }

@router.get("/admin/units/{unit_id}/summary", response_model=UnitSummaryResponse)
async def get_unit_summary(
    unit_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Get unit analytics summary"""
    
    unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    # Get progress data for this unit
    progress_data = db.query(Progress).filter(Progress.unit_id == unit_id).all()
    
    total_enrolled = len(set(p.student_id for p in progress_data))
    started_count = len([p for p in progress_data if p.started_at])
    completed_count = len([p for p in progress_data if p.completed_at])
    
    # Calculate average score
    scores = [p.score for p in progress_data if p.score is not None]
    average_score = sum(scores) / len(scores) if scores else 0.0
    
    # Calculate average time
    times = []
    for p in progress_data:
        if p.started_at and p.completed_at:
            time_diff = p.completed_at - p.started_at
            times.append(time_diff.total_seconds() / 60)  # Convert to minutes
    
    average_time_minutes = sum(times) / len(times) if times else 0.0
    
    # Calculate completion rate
    completion_rate = (completed_count / total_enrolled * 100) if total_enrolled > 0 else 0.0
    
    return UnitSummaryResponse(
        total_enrolled=total_enrolled,
        started_count=started_count,
        completed_count=completed_count,
        average_score=average_score,
        average_time_minutes=average_time_minutes,
        completion_rate=completion_rate
    )

# Keep existing endpoints for backward compatibility
@router.get("/units", response_model=List[UnitResponse])
def get_units(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    units = db.query(Unit).filter(
        and_(
            Unit.is_visible_to_students == True,
            Unit.status == UnitStatus.PUBLISHED
        )
    ).order_by(Unit.order_index).all()
    return units

@router.get("/units/{unit_id}", response_model=UnitResponse)
def get_unit_detail(
    unit_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    unit = db.query(Unit).filter(
        and_(
            Unit.id == unit_id,
            Unit.is_visible_to_students == True,
            Unit.status == UnitStatus.PUBLISHED
        )
    ).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    return unit
