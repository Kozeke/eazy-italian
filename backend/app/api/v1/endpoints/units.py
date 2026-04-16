from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_, desc, asc, func
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta

from app.core.database import get_db
from app.core.auth import get_current_user, get_current_teacher
from app.models.user import User
from app.models.unit import Unit, UnitLevel, UnitStatus
from app.models.segment import Segment, SegmentStatus          # ✅ NEW
from app.models.video import Video, VideoStatus
from app.models.task import Task, TaskStatus, TaskSubmission, SubmissionStatus
from app.models.test import Test, TestStatus, TestAttempt, AttemptStatus
from app.models.presentation import Presentation               # ✅ NEW
from app.models.video_progress import VideoProgress
from app.models.progress import Progress
from app.models.course import Course
from app.models.task import TaskSubmission, SubmissionStatus
from app.models.test import TestAttempt, AttemptStatus
from app.schemas.unit import (
    UnitResponse, UnitCreate, UnitUpdate, UnitListResponse,
    UnitDetailResponse, UnitReorderRequest, UnitPublishRequest,
    UnitBulkAction, UnitSummaryResponse
)
from app.services.media_block_utils import normalise_media_blocks

router = APIRouter()

# ─── helpers ──────────────────────────────────────────────────────────────────
 
def _create_default_segment(db: Session, unit_id: int, created_by: int) -> Segment:
    """
    Create the first segment for a freshly-created unit.
 
    Name    : "Section 1"
    Status  : published
    Visible : True
 
    Called immediately after unit creation so the teacher can add content
    without having to manually create a segment first.
    """
    seg = Segment(
        unit_id=unit_id,
        title="Section 1",
        order_index=0,
        status=SegmentStatus.PUBLISHED,
        is_visible_to_students=True,
        created_by=created_by,
    )
    db.add(seg)
    db.commit()
    db.refresh(seg)
    return seg
 
 
def _segment_to_dict(seg: Segment) -> dict:
    """Serialise a Segment + its content items for the API response."""
    return {
        "id":                     seg.id,
        "title":                  seg.title,
        "description":            seg.description,
        "order_index":            seg.order_index,
        "status":                 seg.status.value if hasattr(seg.status, "value") else seg.status,
        "is_visible_to_students": seg.is_visible_to_students,
        "publish_at":             seg.publish_at,
        "created_at":             seg.created_at,
        "updated_at":             seg.updated_at,
        "media_blocks":           seg.media_blocks or [],
        "videos": [
            {
                "id":           v.id,
                "title":        v.title,
                "status":       v.status.value if hasattr(v.status, "value") else v.status,
                "order_index":  v.order_index,
                "duration_sec": v.duration_sec,
            }
            for v in sorted(seg.videos or [], key=lambda x: x.order_index)
        ],
        "tasks": [
            {
                "id":          t.id,
                "title":       t.title,
                "status":      t.status.value if hasattr(t.status, "value") else t.status,
                "order_index": t.order_index,
                "type":        t.type.value if hasattr(t.type, "value") else t.type,
            }
            for t in sorted(seg.tasks or [], key=lambda x: x.order_index)
        ],
        "tests": [
            {
                "id":                  te.id,
                "title":               te.title,
                "status":              te.status.value if hasattr(te.status, "value") else te.status,
                "order_index":         te.order_index,
                "time_limit_minutes":  te.time_limit_minutes,
            }
            for te in sorted(seg.tests or [], key=lambda x: x.order_index)
        ],
        "presentations": [
            {
                "id":          p.id,
                "title":       p.title,
                "status":      p.status.value if hasattr(p.status, "value") else p.status,
                "order_index": p.order_index,
                "slide_count": p.slide_count,
            }
            for p in sorted(seg.presentations or [], key=lambda x: x.order_index)
        ],
    }
 
 

@router.get("/admin/units", response_model=List[UnitListResponse])
async def get_admin_units(
    query: Optional[str] = Query(None),
    level: Optional[UnitLevel] = Query(None),
    status: Optional[UnitStatus] = Query(None),
    created_by: Optional[int] = Query(None),
    has_content: Optional[bool] = Query(None),
    from_date: Optional[datetime] = Query(None),
    to_date: Optional[datetime] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Get paginated list of units for admin panel."""
    teacher_course_ids = [c.id for c in db.query(Course.id).filter(
        Course.created_by == current_user.id
    ).all()]
 
    if not teacher_course_ids:
        return []
 
    q = db.query(Unit).options(
        joinedload(Unit.created_by_user),
        joinedload(Unit.course),
    ).filter(Unit.course_id.in_(teacher_course_ids))
 
    if query:
        t = f"%{query}%"
        q = q.filter(or_(Unit.title.ilike(t), Unit.description.ilike(t)))
    if level:
        q = q.filter(Unit.level == level)
    if status:
        q = q.filter(Unit.status == status)
    if created_by:
        q = q.filter(Unit.created_by == created_by)
    if from_date:
        q = q.filter(Unit.created_at >= from_date)
    if to_date:
        q = q.filter(Unit.created_at <= to_date)
 
    offset = (page - 1) * limit
    units  = q.order_by(desc(Unit.created_at)).offset(offset).limit(limit).all()
 
    return [
        UnitListResponse(
            id=u.id,
            title=u.title,
            level=u.level,
            status=u.status,
            publish_at=u.publish_at,
            order_index=u.order_index,
            created_by=u.created_by,
            created_at=u.created_at,
            updated_at=u.updated_at,
            content_count=u.content_count,
            course_id=u.course_id,
            course_title=u.course.title if u.course else None,
        )
        for u in units
    ]
 

@router.post("/admin/units", response_model=UnitResponse)
async def create_unit(
    unit_data: UnitCreate,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """
    Create a new unit.
 
    ✅ v19: Also creates a default Segment ("Section 1", published,
    visible to students) so the teacher can add content immediately.
    """
 
    # Validate course_id if provided
    if unit_data.course_id is not None:
        course = db.query(Course).filter(Course.id == unit_data.course_id).first()
        if not course:
            raise HTTPException(
                status_code=404,
                detail=f"Course with id {unit_data.course_id} not found"
            )
        # Optional: Verify course belongs to current user (teacher)
        if course.created_by != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="You can only add units to courses you created"
            )
 
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
 
    # ✅ Auto-create the first segment so content can be added immediately
    _create_default_segment(db, unit_id=unit.id, created_by=current_user.id)
 
    return unit
 

@router.get("/admin/units/{unit_id}", response_model=UnitDetailResponse)
async def get_unit(
    unit_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """
    Get unit details with content.
 
    ✅ v19: Response now includes `segments[]` with nested content so the
    frontend side panel can render segments and their items directly.
    """
 
    # Get teacher's course IDs
    teacher_course_ids = [c.id for c in db.query(Course.id).filter(
        Course.created_by == current_user.id
    ).all()]
 
    if not teacher_course_ids:
        raise HTTPException(status_code=404, detail="Unit not found")
 
    unit = db.query(Unit).options(
        # ✅ Eager-load segments with all four content relations
        joinedload(Unit.segments).joinedload(Segment.videos),
        joinedload(Unit.segments).joinedload(Segment.tasks),
        joinedload(Unit.segments).joinedload(Segment.tests),
        joinedload(Unit.segments).joinedload(Segment.presentations),
    ).filter(
        Unit.id == unit_id,
        Unit.course_id.in_(teacher_course_ids)
    ).first()
 
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
 
    # Flat content lists — kept for backward compat with existing consumers
    videos = db.query(Video).filter(Video.unit_id == unit_id).order_by(Video.order_index).all()
    tasks  = db.query(Task).filter(Task.unit_id  == unit_id).order_by(Task.order_index).all()
    tests  = db.query(Test).filter(Test.unit_id  == unit_id).order_by(Test.order_index).all()
 
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
 
    # ✅ v19: segment-aware data — ordered, with nested content
    sorted_segments = sorted(unit.segments or [], key=lambda s: s.order_index)
    segments_data   = [_segment_to_dict(s) for s in sorted_segments]

    # Avoid duplicate `segments` kwarg: eager-loaded Unit.segments is in unit.__dict__
    unit_payload = {
        key: value
        for key, value in unit.__dict__.items()
        if key not in {"_sa_instance_state", "segments", "homework_blocks", "attachments"}
    }

    # Normalised homework list for teacher UI and for students (read-only) in the classroom
    homework_blocks_normalised = normalise_media_blocks(unit.homework_blocks or [])

    # Ensures unit-level materials are always present in the response payload.
    attachments_for_admin = unit.attachments or []

    return UnitDetailResponse(
        **unit_payload,
        attachments=attachments_for_admin,
        content_count=unit.content_count,
        videos=video_data,
        tasks=task_data,
        tests=test_data,
        segments=segments_data,
        homework_blocks=homework_blocks_normalised,
    )
 
 
 
# ─── update / delete / reorder / publish  (unchanged) ────────────────────────
 
@router.put("/admin/units/{unit_id}", response_model=UnitResponse)
async def update_unit(
    unit_id: int,
    unit_data: UnitUpdate,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
 
    for field, value in unit_data.dict(exclude_unset=True).items():
        setattr(unit, field, value)
 
    unit.updated_by = current_user.id
    db.commit()
    db.refresh(unit)
    return unit
 
 
@router.delete("/admin/units/{unit_id}")
async def delete_unit(
    unit_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
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

# Student endpoints with enrollment authorization
from app.core.enrollment_guard import check_unit_access

@router.get("", response_model=List[UnitListResponse])
async def get_units_by_course(
    course_id: Optional[int] = Query(None, description="Filter by course ID"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get units - optionally filtered by course_id"""
    
    query_builder = db.query(Unit).options(
        joinedload(Unit.created_by_user),
        joinedload(Unit.course)
    )
    
    # Filter by course_id if provided
    if course_id is not None:
        # Verify course exists
        course = db.query(Course).filter(Course.id == course_id).first()
        if not course:
            raise HTTPException(status_code=404, detail=f"Course with id {course_id} not found")
        
        # Filter units by course_id
        query_builder = query_builder.filter(Unit.course_id == course_id)
        
        # For students, only show published and visible units
        # Teachers/admins can see all units (for course management)
        if current_user.role.value == "student":
            query_builder = query_builder.filter(
                and_(
                    # Unit.is_visible_to_students == True,
                    # Unit.status == UnitStatus.PUBLISHED
                )
            )
    else:
        # If no course_id provided, only return published units for students
        # Teachers/admins can see all units if no course_id filter
        if current_user.role.value == "student":
            query_builder = query_builder.filter(
                and_(
                    # Unit.is_visible_to_students == True,
                    # Unit.status == UnitStatus.PUBLISHED
                )
            )
    
    units = query_builder.order_by(Unit.order_index).all()
    
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
            content_count=content_count,
            course_id=unit.course_id,
            course_title=unit.course.title if unit.course else None
        ))
    
    return result

@router.get("/{unit_id}", response_model=UnitDetailResponse)  # Changed to UnitDetailResponse
def get_unit_detail(
    unit_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get unit detail - requires enrollment if unit belongs to a course.

    ✅ Returns `segments[]` with nested content (media_blocks, videos, tasks,
    tests, presentations) ordered by order_index — matching the admin endpoint.
    """
    unit = db.query(Unit).options(
        # Eager-load segments with all four content relations
        joinedload(Unit.segments).joinedload(Segment.videos),
        joinedload(Unit.segments).joinedload(Segment.tasks),
        joinedload(Unit.segments).joinedload(Segment.tests),
        joinedload(Unit.segments).joinedload(Segment.presentations),
    ).filter(
        Unit.id == unit_id,
        # Unit.is_visible_to_students == True,  # commented out — return unit regardless of visibility flag
        # Unit.status == UnitStatus.PUBLISHED    # commented out — return unit regardless of publish status
    ).first()

    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")

    # Check enrollment authorization
    check_unit_access(db, current_user, unit_id)

    # ── Flat content lists (kept for backward compatibility) ──────────────────
    videos = db.query(Video).filter(
        Video.unit_id == unit_id,
        Video.is_visible_to_students == True,
        Video.status == VideoStatus.PUBLISHED
    ).order_by(Video.order_index).all()

    tasks = db.query(Task).filter(
        Task.unit_id == unit_id,
        Task.status == TaskStatus.PUBLISHED
    ).order_by(Task.order_index).all()

    tests = db.query(Test).filter(
        Test.unit_id == unit_id,
        Test.status == TestStatus.PUBLISHED
    ).order_by(Test.order_index).all()

    # Convert flat lists to response dicts
    video_data = [
        {
            "id": v.id,
            "title": v.title,
            "description": v.description,
            "status": v.status.value if v.status else None,
            "order_index": v.order_index,
            "duration_sec": v.duration_sec,
            "thumbnail_path": v.thumbnail_path,
            "source_type": v.source_type.value if v.source_type else None,
            "external_url": v.external_url,
            "file_path": v.file_path,
            "attachments": v.attachments if v.attachments else [],
        }
        for v in videos
    ]

    task_data = [
        {
            "id": t.id,
            "title": t.title,
            "status": t.status.value if t.status else None,
            "order_index": t.order_index,
            "type": t.type.value if t.type else None,
        }
        for t in tasks
    ]

    test_data = [
        {
            "id": t.id,
            "title": t.title,
            "status": t.status.value if t.status else None,
            "order_index": t.order_index,
            "time_limit_minutes": t.time_limit_minutes,
        }
        for t in tests
    ]

    # ── Progress data for the current student ────────────────────────────────
    student_id = current_user.id

    completed_video_ids: set = set()
    if videos:
        vp_records = db.query(VideoProgress).filter(
            VideoProgress.user_id == student_id,
            VideoProgress.video_id.in_([v.id for v in videos]),
            VideoProgress.completed == True,
        ).all()
        completed_video_ids = {vp.video_id for vp in vp_records}

    db.query(Progress).filter(
        Progress.student_id == student_id,
        Progress.unit_id == unit_id,
    ).first()

    completed_task_ids: set = set()
    if tasks:
        subs = db.query(TaskSubmission).filter(
            TaskSubmission.student_id == student_id,
            TaskSubmission.task_id.in_([t.id for t in tasks]),
            TaskSubmission.status == SubmissionStatus.SUBMITTED,
        ).all()
        completed_task_ids = {s.task_id for s in subs}

    passed_test_ids: set = set()
    if tests:
        attempts = db.query(TestAttempt).filter(
            TestAttempt.student_id == student_id,
            TestAttempt.test_id.in_([t.id for t in tests]),
            TestAttempt.status == AttemptStatus.COMPLETED,
            TestAttempt.score.isnot(None),
        ).all()
        for attempt in attempts:
            test = next((t for t in tests if t.id == attempt.test_id), None)
            if test and attempt.score is not None and attempt.score >= test.passing_score:
                passed_test_ids.add(attempt.test_id)

    # Annotate flat lists with completion status
    for v in video_data:
        v["completed"] = v["id"] in completed_video_ids
    for t in task_data:
        t["completed"] = t["id"] in completed_task_ids
    for t in test_data:
        t["passed"] = t["id"] in passed_test_ids

    # ── Segments (primary structure — mirrors admin endpoint) ─────────────────
    sorted_segments = sorted(unit.segments or [], key=lambda s: s.order_index)
    segments_data = [_segment_to_dict(s) for s in sorted_segments]

    # Strip eager-loaded `segments` from unit.__dict__ to avoid duplicate kwarg
    unit_payload = {
        key: value
        for key, value in unit.__dict__.items()
        if key not in {"_sa_instance_state", "segments", "homework_blocks", "attachments"}
    }

    # Same ordered homework blocks as the admin homework endpoint (students have no /admin access)
    homework_blocks_normalised = normalise_media_blocks(unit.homework_blocks or [])

    # Ensures students receive downloadable unit materials instead of null attachments.
    attachments_for_student = unit.attachments or []

    return UnitDetailResponse(
        **unit_payload,
        attachments=attachments_for_student,
        content_count=unit.content_count,
        videos=video_data,
        tasks=task_data,
        tests=test_data,
        segments=segments_data,
        homework_blocks=homework_blocks_normalised,
    )