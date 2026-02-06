"""
Course management endpoints for admin and student views
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_, desc, asc, func
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta, timezone
import os

from app.core.database import get_db
from app.core.auth import get_current_user, get_current_teacher
from app.core.enrollment_guard import (
    is_user_enrolled, check_course_access, check_unit_access,
    get_user_enrolled_courses, can_enroll_in_course
)
from app.models.user import User, UserRole, SubscriptionType
from app.models.course import Course, CourseLevel, CourseStatus
from app.models.subscription import Subscription, UserSubscription, SubscriptionName
from app.models.unit import Unit, UnitStatus
from app.models.video import Video, VideoStatus
from app.models.test import Test, TestStatus, TestAttempt, AttemptStatus
from app.models.progress import Progress
from app.models.task import Task, TaskSubmission, SubmissionStatus, TaskStatus
from app.models.enrollment import CourseEnrollment
from app.models.video_progress import VideoProgress
from app.schemas.course import (
    CourseResponse, CourseCreate, CourseUpdate, CourseListResponse,
    CourseDetailResponse, CourseReorderRequest, CoursePublishRequest,
    CourseBulkAction, DashboardStatistics, StudentDashboardStats,
    EnrolledCourseResponse
)

router = APIRouter()

# Test endpoint to verify router is working
@router.get("/admin/test")
async def test_admin_route():
    """Test endpoint to verify admin routes are registered"""
    return {"message": "Admin routes are working!", "status": "ok"}

# Questions endpoint (moved here because courses router is mounted at root)
@router.put("/admin/questions/{question_id}")
async def update_question(
    question_id: int,
    question_data: Dict[str, Any],
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Update a question"""
    from app.models.test import Question, TestQuestion
    
    # Get question
    question = db.query(Question).filter(Question.id == question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    
    # Verify user owns the question (through test)
    test_question = db.query(TestQuestion).filter(TestQuestion.question_id == question_id).first()
    if test_question:
        test = db.query(Test).filter(Test.id == test_question.test_id).first()
        if test and test.created_by != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to modify this question")
    
    # Update question fields
    if 'prompt' in question_data:
        question.prompt_rich = question_data.get('prompt', '')
    if 'score' in question_data or 'points' in question_data:
        question.points = question_data.get('score') or question_data.get('points', question.points)
    if 'metadata' in question_data:
        question.question_metadata = question_data.get('metadata', {})
    
    # Type-specific updates
    question_type = question.type.value if hasattr(question.type, 'value') else str(question.type)
    
    if question_type == 'multiple_choice':
        if 'options' in question_data:
            question.options = question_data.get('options', [])
        if 'correct_option_ids' in question_data:
            question.correct_answer = {"correct_option_ids": question_data.get('correct_option_ids', [])}
        if 'shuffle_options' in question_data:
            question.shuffle_options = question_data.get('shuffle_options', True)
    elif question_type == 'open_answer':
        if 'expected' in question_data:
            question.expected_answer_config = question_data.get('expected', {})
            question.correct_answer = {"expected": question_data.get('expected', {})}
    elif question_type == 'cloze':
        if 'gaps' in question_data:
            question.gaps_config = question_data.get('gaps', [])
            question.correct_answer = {"gaps": question_data.get('gaps', [])}
    
    # Update TestQuestion points if score changed
    if 'score' in question_data or 'points' in question_data:
        new_score = question_data.get('score') or question_data.get('points')
        if test_question and new_score:
            test_question.points = new_score
    
    db.commit()
    db.refresh(question)
    
    return {
        "id": question.id,
        "type": question.type.value,
        "prompt_rich": question.prompt_rich,
        "points": question.points,
        "message": "Question updated successfully"
    }

@router.get("/admin/courses", response_model=List[CourseListResponse])
async def get_admin_courses(
    query: Optional[str] = Query(None, description="Search by title or description"),
    level: Optional[CourseLevel] = Query(None, description="Filter by level"),
    status: Optional[CourseStatus] = Query(None, description="Filter by status"),
    created_by: Optional[int] = Query(None, description="Filter by creator"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(25, ge=1, le=100, description="Items per page"),
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Get paginated list of courses for admin panel"""
    
    # Build query
    query_builder = db.query(Course).options(
        joinedload(Course.created_by_user)
    )
    
    # Apply filters
    if query:
        search_term = f"%{query}%"
        query_builder = query_builder.filter(
            or_(
                Course.title.ilike(search_term),
                Course.description.ilike(search_term)
            )
        )
    
    if level:
        query_builder = query_builder.filter(Course.level == level)
    
    if status:
        query_builder = query_builder.filter(Course.status == status)
    
    if created_by:
        query_builder = query_builder.filter(Course.created_by == created_by)
    
    # Apply pagination
    offset = (page - 1) * limit
    courses = query_builder.order_by(asc(Course.order_index), desc(Course.created_at)).offset(offset).limit(limit).all()
    
    # Convert to response format
    result = []
    for course in courses:
        # Handle thumbnail_path gracefully in case column doesn't exist yet
        thumbnail_path = getattr(course, 'thumbnail_path', None)
        result.append(CourseListResponse(
            id=course.id,
            title=course.title,
            description=course.description,
            level=course.level,
            status=course.status,
            publish_at=course.publish_at,
            order_index=course.order_index,
            thumbnail_url=course.thumbnail_url,
            thumbnail_path=thumbnail_path,
            created_by=course.created_by,
            created_at=course.created_at,
            updated_at=course.updated_at,
            units_count=course.units_count,
            published_units_count=course.published_units_count
        ))
    
    return result

@router.post("/admin/courses", response_model=CourseResponse)
async def create_course(
    course_data: CourseCreate,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Create a new course"""
    
    # Generate slug if not provided
    slug = course_data.slug if hasattr(course_data, 'slug') and course_data.slug else None
    if not slug:
        # Generate from title
        import re
        slug = re.sub(r'[^\w\s-]', '', course_data.title.lower())
        slug = re.sub(r'[-\s]+', '-', slug)
        slug = slug.strip('-')
    
    # Check if slug already exists
    existing = db.query(Course).filter(Course.slug == slug).first()
    if existing:
        slug = f"{slug}-{datetime.utcnow().timestamp()}"
    
    # Create course
    course = Course(
        title=course_data.title,
        description=course_data.description,
        level=course_data.level,
        status=course_data.status,
        publish_at=course_data.publish_at,
        order_index=course_data.order_index,
        thumbnail_url=course_data.thumbnail_url,
        duration_hours=course_data.duration_hours,
        tags=course_data.tags or [],
        meta_title=course_data.meta_title,
        meta_description=course_data.meta_description,
        is_visible_to_students=course_data.is_visible_to_students,
        settings=course_data.settings or {},
        slug=slug,
        created_by=current_user.id
    )
    
    db.add(course)
    db.commit()
    db.refresh(course)
    
    return CourseResponse(
        id=course.id,
        title=course.title,
        description=course.description,
        level=course.level,
        status=course.status,
        publish_at=course.publish_at,
        order_index=course.order_index,
        thumbnail_url=course.thumbnail_url,
        thumbnail_path=getattr(course, 'thumbnail_path', None),
        duration_hours=course.duration_hours,
        tags=course.tags,
        meta_title=course.meta_title,
        meta_description=course.meta_description,
        is_visible_to_students=course.is_visible_to_students,
        settings=course.settings,
        slug=course.slug,
        created_by=course.created_by,
        updated_by=course.updated_by,
        created_at=course.created_at,
        updated_at=course.updated_at,
        units_count=course.units_count,
        published_units_count=course.published_units_count,
        content_summary=course.content_summary
    )

@router.get("/admin/courses/{course_id}", response_model=CourseDetailResponse)
async def get_admin_course(
    course_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Get a specific course with its units"""
    
    course = db.query(Course).options(
        joinedload(Course.units)
    ).filter(Course.id == course_id).first()
    
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Get units for this course
    units = db.query(Unit).filter(Unit.course_id == course_id).order_by(Unit.order_index).all()
    
    units_data = []
    for unit in units:
        units_data.append({
            "id": unit.id,
            "title": unit.title,
            "level": unit.level.value,
            "status": unit.status.value,
            "order_index": unit.order_index,
            "content_count": unit.content_count
        })
    
    return CourseDetailResponse(
        id=course.id,
        title=course.title,
        description=course.description,
        level=course.level,
        status=course.status,
        publish_at=course.publish_at,
        order_index=course.order_index,
        thumbnail_url=course.thumbnail_url,
        thumbnail_path=getattr(course, 'thumbnail_path', None),
        duration_hours=course.duration_hours,
        tags=course.tags,
        meta_title=course.meta_title,
        meta_description=course.meta_description,
        is_visible_to_students=course.is_visible_to_students,
        settings=course.settings,
        slug=course.slug,
        created_by=course.created_by,
        updated_by=course.updated_by,
        created_at=course.created_at,
        updated_at=course.updated_at,
        units_count=course.units_count,
        published_units_count=course.published_units_count,
        content_summary=course.content_summary,
        units=units_data
    )

@router.put("/admin/courses/{course_id}", response_model=CourseResponse)
async def update_course(
    course_id: int,
    course_data: CourseUpdate,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Update a course"""
    
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Check permissions
    if course.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this course")
    
    # Update fields
    update_data = course_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(course, field, value)
    
    course.updated_by = current_user.id
    db.commit()
    db.refresh(course)
    
    return CourseResponse(
        id=course.id,
        title=course.title,
        description=course.description,
        level=course.level,
        status=course.status,
        publish_at=course.publish_at,
        order_index=course.order_index,
        thumbnail_url=course.thumbnail_url,
        thumbnail_path=getattr(course, 'thumbnail_path', None),
        duration_hours=course.duration_hours,
        tags=course.tags,
        meta_title=course.meta_title,
        meta_description=course.meta_description,
        is_visible_to_students=course.is_visible_to_students,
        settings=course.settings,
        slug=course.slug,
        created_by=course.created_by,
        updated_by=course.updated_by,
        created_at=course.created_at,
        updated_at=course.updated_at,
        units_count=course.units_count,
        published_units_count=course.published_units_count,
        content_summary=course.content_summary
    )

@router.post("/admin/courses/{course_id}/generate-thumbnail")
async def generate_course_thumbnail(
    course_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Generate a thumbnail for a course"""
    
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    if course.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this course")
    
    try:
        from app.utils.thumbnail_generator import generate_course_thumbnail, get_course_thumbnail_path
        
        # Get level - handle mixed level
        level = course.level.value if hasattr(course.level, 'value') else str(course.level)
        if level == 'mixed':
            level = 'A1'  # Default for mixed
        
        thumbnail_path = get_course_thumbnail_path(course.id, level)
        
        # Get backend directory and use backend/uploads
        # __file__ is backend/app/api/v1/endpoints/courses.py
        # Go up 5 levels: endpoints -> v1 -> api -> app -> backend
        current_file = os.path.abspath(__file__)
        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(current_file)))))
        full_path = os.path.join(backend_dir, "uploads", thumbnail_path)
        
        # Generate subtitle from description if available
        subtitle = course.description[:50] if course.description else ""
        
        generate_course_thumbnail(
            level=level,
            output_path=full_path,
            title=course.title,
            subtitle=subtitle
        )
        
        # Update course thumbnail_path
        course.thumbnail_path = thumbnail_path
        course.updated_by = current_user.id
        course.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(course)
        
        return {
            "message": "Thumbnail generated successfully",
            "thumbnail_path": course.thumbnail_path
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating thumbnail: {str(e)}")

@router.delete("/admin/courses/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_course(
    course_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Delete a course"""
    
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Check permissions
    if course.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this course")
    
    db.delete(course)
    db.commit()
    
    return None

@router.patch("/admin/courses/{course_id}/publish", response_model=CourseResponse)
async def publish_course(
    course_id: int,
    publish_data: CoursePublishRequest,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Publish a course"""
    
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    if course.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to publish this course")
    
    can_publish, reason = course.can_publish()
    if not can_publish:
        raise HTTPException(status_code=400, detail=reason)
    
    course.status = CourseStatus.PUBLISHED
    if publish_data.publish_at:
        course.publish_at = publish_data.publish_at
    else:
        course.publish_at = datetime.utcnow()
    
    course.updated_by = current_user.id
    db.commit()
    db.refresh(course)
    
    return CourseResponse(
        id=course.id,
        title=course.title,
        description=course.description,
        level=course.level,
        status=course.status,
        publish_at=course.publish_at,
        order_index=course.order_index,
        thumbnail_url=course.thumbnail_url,
        thumbnail_path=getattr(course, 'thumbnail_path', None),
        duration_hours=course.duration_hours,
        tags=course.tags,
        meta_title=course.meta_title,
        meta_description=course.meta_description,
        is_visible_to_students=course.is_visible_to_students,
        settings=course.settings,
        slug=course.slug,
        created_by=course.created_by,
        updated_by=course.updated_by,
        created_at=course.created_at,
        updated_at=course.updated_at,
        units_count=course.units_count,
        published_units_count=course.published_units_count,
        content_summary=course.content_summary
    )

@router.post("/admin/courses/reorder", response_model=Dict[str, str])
async def reorder_courses(
    reorder_data: CourseReorderRequest,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Reorder courses"""
    
    for index, course_id in enumerate(reorder_data.course_ids):
        course = db.query(Course).filter(Course.id == course_id).first()
        if course:
            course.order_index = index
            course.updated_by = current_user.id
    
    db.commit()
    
    return {"message": "Courses reordered successfully"}

# Helper function to get subscription name
def get_user_subscription_name(db: Session, user: User) -> str:
    """Get user's subscription name, checking both subscription_type and UserSubscription"""
    # Check subscription_type column first
    if user.subscription_type == SubscriptionType.PREMIUM:
        return "premium"
    
    # Check UserSubscription for PRO accounts
    active_sub = db.query(UserSubscription).join(
        Subscription, UserSubscription.subscription_id == Subscription.id
    ).filter(
        UserSubscription.user_id == user.id,
        UserSubscription.is_active == True
    ).first()
    
    if active_sub and active_sub.subscription:
        sub_name = active_sub.subscription.name
        if sub_name in [SubscriptionName.PREMIUM, SubscriptionName.PRO]:
            return sub_name.value
    
    return "free"

# Student endpoints
@router.get("/courses", response_model=List[CourseListResponse])
async def get_courses(
    level: Optional[CourseLevel] = Query(None, description="Filter by level"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get published courses available to students"""
    
    query_builder = db.query(Course).filter(
        and_(
            Course.is_visible_to_students == True,
            Course.status == CourseStatus.PUBLISHED
        )
    )
    
    if level:
        query_builder = query_builder.filter(Course.level == level)
    
    courses = query_builder.order_by(asc(Course.order_index)).all()
    
    # Filter to only show courses that are available (published and past publish date)
    available_courses = [c for c in courses if c.is_available]
    
    # Get user's subscription type
    subscription_name = get_user_subscription_name(db, current_user)
    
    # Get enrolled courses from enrollment table
    enrolled_course_ids = get_user_enrolled_courses(db, current_user.id)
    enrolled_courses_count = len(enrolled_course_ids)
    
    result = []
    for course in available_courses:
        # Handle thumbnail_path gracefully in case column doesn't exist yet
        thumbnail_path = getattr(course, 'thumbnail_path', None)
        is_enrolled = course.id in enrolled_course_ids
        
        result.append(CourseListResponse(
            id=course.id,
            title=course.title,
            description=course.description,
            level=course.level,
            status=course.status,
            publish_at=course.publish_at,
            order_index=course.order_index,
            thumbnail_url=course.thumbnail_url,
            thumbnail_path=thumbnail_path,
            created_by=course.created_by,
            created_at=course.created_at,
            updated_at=course.updated_at,
            units_count=course.units_count,
            published_units_count=course.published_units_count,
            is_enrolled=is_enrolled,
            user_subscription=subscription_name,
            enrolled_courses_count=enrolled_courses_count
        ))
    
    return result

@router.get("/courses/{course_id}", response_model=CourseDetailResponse)
async def get_course(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific course with its units for students"""
    
    course = db.query(Course).options(
        joinedload(Course.created_by_user)
    ).filter(Course.id == course_id).first()
    
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    if not course.is_available:
        raise HTTPException(status_code=403, detail="Course is not available")
    
    # Get instructor info
    instructor = db.query(User).filter(User.id == course.created_by).first()
    instructor_name = instructor.full_name if instructor else None
    
    # Get user's subscription type
    subscription_name = get_user_subscription_name(db, current_user)
    
    # Check if user is enrolled using enrollment table
    is_enrolled = is_user_enrolled(db, current_user.id, course_id)
    enrolled_courses_count = db.query(CourseEnrollment).filter(
        CourseEnrollment.user_id == current_user.id
    ).count()
    
    # Get learning outcomes from course settings or unit goals
    learning_outcomes = None
    if course.settings and isinstance(course.settings, dict) and 'learning_outcomes' in course.settings:
        learning_outcomes = course.settings.get('learning_outcomes')
    else:
        # Fallback: get from first unit's goals if available
        first_unit = db.query(Unit).filter(
            Unit.course_id == course_id,
            Unit.status == UnitStatus.PUBLISHED
        ).order_by(Unit.order_index).first()
        if first_unit and first_unit.goals:
            # Try to parse goals as a list or use as single string
            learning_outcomes = [first_unit.goals] if isinstance(first_unit.goals, str) else first_unit.goals
    
    # Get published units for this course
    units = db.query(Unit).filter(
        and_(
            Unit.course_id == course_id,
            Unit.is_visible_to_students == True,
            Unit.status == UnitStatus.PUBLISHED
        )
    ).order_by(Unit.order_index).all()
    
    units_data = []
    for unit in units:
        if unit.is_available:
            units_data.append({
                "id": unit.id,
                "title": unit.title,
                "level": unit.level.value,
                "status": unit.status.value,
                "order_index": unit.order_index,
                "content_count": unit.content_count
            })
    
    return CourseDetailResponse(
        id=course.id,
        title=course.title,
        description=course.description,
        level=course.level,
        status=course.status,
        publish_at=course.publish_at,
        order_index=course.order_index,
        thumbnail_url=course.thumbnail_url,
        thumbnail_path=getattr(course, 'thumbnail_path', None),
        duration_hours=course.duration_hours,
        tags=course.tags,
        meta_title=course.meta_title,
        meta_description=course.meta_description,
        is_visible_to_students=course.is_visible_to_students,
        settings=course.settings,
        slug=course.slug,
        created_by=course.created_by,
        updated_by=course.updated_by,
        created_at=course.created_at,
        updated_at=course.updated_at,
        units_count=course.units_count,
        published_units_count=course.published_units_count,
        content_summary=course.content_summary,
        units=units_data,
        instructor_name=instructor_name,
        is_enrolled=is_enrolled,
        user_subscription=subscription_name,
        enrolled_courses_count=enrolled_courses_count,
        learning_outcomes=learning_outcomes
    )

@router.get("/courses/{course_id}/units")
async def get_course_units(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get units for a specific course - requires enrollment"""
    
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    if not course.is_available:
        raise HTTPException(status_code=403, detail="Course is not available")
    
    # Check enrollment - authorization guard
    check_course_access(db, current_user, course_id)
    
    # Get published units for this course
    units = db.query(Unit).filter(
        and_(
            Unit.course_id == course_id,
            Unit.is_visible_to_students == True,
            Unit.status == UnitStatus.PUBLISHED
        )
    ).order_by(Unit.order_index).all()
    
    units_data = []
    for unit in units:
        if unit.is_available:
            units_data.append({
                "id": unit.id,
                "title": unit.title,
                "level": unit.level.value,
                "status": unit.status.value,
                "order_index": unit.order_index,
                "content_count": unit.content_count
            })
    
    return {
        "course_id": course_id,
        "course_title": course.title,
        "units": units_data
    }

@router.post("/courses/{course_id}/enroll")
async def enroll_in_course(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Enroll a student in a course"""
    
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    if not course.is_available:
        raise HTTPException(status_code=403, detail="Course is not available")
    
    # Check if user can enroll
    can_enroll, reason = can_enroll_in_course(db, current_user, course_id)
    if not can_enroll:
        raise HTTPException(status_code=403, detail=reason)
    
    # Create enrollment record
    enrollment = CourseEnrollment(
        user_id=current_user.id,
        course_id=course_id
    )
    db.add(enrollment)
    
    # Create progress record for first unit
    first_unit = db.query(Unit).filter(
        Unit.course_id == course_id,
        Unit.status == UnitStatus.PUBLISHED,
        Unit.is_visible_to_students == True
    ).order_by(Unit.order_index).first()
    
    if first_unit:
        # Check if progress already exists
        existing_progress = db.query(Progress).filter(
            Progress.student_id == current_user.id,
            Progress.unit_id == first_unit.id
        ).first()
        
        if not existing_progress:
            progress = Progress(
                student_id=current_user.id,
                unit_id=first_unit.id,
                completion_pct=0.0,
                total_points=0.0,
                earned_points=0.0
            )
            db.add(progress)
    
    db.commit()
    
    return {"message": "Successfully enrolled in course", "enrolled": True}

@router.get("/me/courses", response_model=List[EnrolledCourseResponse])
async def get_my_courses(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all courses the student is enrolled in with progress"""
    student_id = current_user.id
    
    # Get enrolled courses from enrollment table
    enrolled_course_ids = get_user_enrolled_courses(db, student_id)
    
    if not enrolled_course_ids:
        return []
    
    # Get course details
    courses = db.query(Course).filter(Course.id.in_(enrolled_course_ids)).all()
    
    result = []
    for course in courses:
        # Get all published units for this course
        course_units = db.query(Unit).filter(
            and_(
                Unit.course_id == course.id,
                Unit.status == UnitStatus.PUBLISHED,
                Unit.is_visible_to_students == True
            )
        ).all()
        
        # Calculate progress
        completed_units = 0
        total_units = len(course_units)
        last_accessed = None
        
        for unit in course_units:
            # Check if unit is completed using comprehensive logic (videos, tasks, tests)
            unit_progress = db.query(Progress).filter(
                Progress.student_id == student_id,
                Progress.unit_id == unit.id
            ).first()
            
            # Update last accessed from progress
            if unit_progress and unit_progress.started_at:
                if not last_accessed or unit_progress.started_at > last_accessed:
                    last_accessed = unit_progress.started_at
            
            # Check if unit is completed by checking all components
            unit_videos = db.query(Video).filter(
                Video.unit_id == unit.id,
                Video.status == VideoStatus.PUBLISHED
            ).all()
            
            unit_tasks = db.query(Task).filter(
                Task.unit_id == unit.id,
                Task.status == TaskStatus.PUBLISHED
            ).all()
            
            unit_tests = db.query(Test).filter(
                Test.unit_id == unit.id,
                Test.status == TestStatus.PUBLISHED
            ).all()
            
            # Check if all videos are completed
            all_videos_completed = True
            if unit_videos:
                for video in unit_videos:
                    video_progress = db.query(VideoProgress).filter(
                        VideoProgress.user_id == student_id,
                        VideoProgress.video_id == video.id,
                        VideoProgress.completed == True
                    ).first()
                    if not video_progress:
                        all_videos_completed = False
                        break
                    # Update last accessed from video progress
                    if video_progress.last_watched_at:
                        if not last_accessed or video_progress.last_watched_at > last_accessed:
                            last_accessed = video_progress.last_watched_at
            else:
                all_videos_completed = True  # No videos means this check passes
            
            # Check if all tasks are submitted
            all_tasks_completed = True
            if unit_tasks:
                for task in unit_tasks:
                    task_submission = db.query(TaskSubmission).filter(
                        TaskSubmission.student_id == student_id,
                        TaskSubmission.task_id == task.id,
                        TaskSubmission.status == SubmissionStatus.SUBMITTED
                    ).first()
                    if not task_submission:
                        all_tasks_completed = False
                        break
                    # Update last accessed from task submission
                    if task_submission.submitted_at:
                        if not last_accessed or task_submission.submitted_at > last_accessed:
                            last_accessed = task_submission.submitted_at
            else:
                all_tasks_completed = True  # No tasks means this check passes
            
            # Check if all tests are passed
            all_tests_passed = True
            if unit_tests:
                for test in unit_tests:
                    attempts = db.query(TestAttempt).filter(
                        TestAttempt.test_id == test.id,
                        TestAttempt.student_id == student_id,
                        TestAttempt.status == AttemptStatus.COMPLETED
                    ).all()
                    if not attempts:
                        all_tests_passed = False
                        break
                    # Check if any attempt passed
                    passed = any(
                        att.score is not None and att.score >= test.passing_score
                        for att in attempts
                    )
                    if not passed:
                        all_tests_passed = False
                        break
                    # Update last accessed from test attempt
                    for attempt in attempts:
                        if attempt.submitted_at:
                            if not last_accessed or attempt.submitted_at > last_accessed:
                                last_accessed = attempt.submitted_at
            else:
                all_tests_passed = True  # No tests means this check passes
            
            # Also check progress table for completion
            is_progress_completed = unit_progress and unit_progress.is_completed
            
            # Unit is completed if all components are completed OR progress table says it's completed
            if (all_videos_completed and all_tasks_completed and all_tests_passed and (unit_videos or unit_tasks or unit_tests)) or is_progress_completed:
                completed_units += 1
        
        progress_percent = (completed_units / total_units * 100) if total_units > 0 else 0.0
        
        thumbnail_path = getattr(course, 'thumbnail_path', None)
        
        result.append(EnrolledCourseResponse(
            id=course.id,
            title=course.title,
            description=course.description,
            level=course.level,
            thumbnail_url=course.thumbnail_url,
            thumbnail_path=thumbnail_path,
            units_count=course.units_count,
            published_units_count=total_units,
            progress_percent=round(progress_percent, 1),
            completed_units=completed_units,
            last_accessed_at=last_accessed
        ))
    
    # Sort by last accessed (most recent first), then by title
    min_datetime = datetime(1970, 1, 1, tzinfo=timezone.utc)
    result.sort(key=lambda x: (x.last_accessed_at if x.last_accessed_at else min_datetime, x.title), reverse=True)
    
    return result

@router.get("/admin/dashboard/statistics", response_model=DashboardStatistics)
async def get_dashboard_statistics(
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Get dashboard statistics for admin panel"""
    
    # Get current month start date (timezone-aware)
    now = datetime.now(timezone.utc)
    month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    
    # Count courses
    courses_count = db.query(func.count(Course.id)).scalar() or 0
    
    # Count courses created this month
    courses_this_month = db.query(func.count(Course.id)).filter(
        Course.created_at >= month_start
    ).scalar() or 0
    
    # Count units
    units_count = db.query(func.count(Unit.id)).scalar() or 0
    
    # Count units created this month
    units_this_month = db.query(func.count(Unit.id)).filter(
        Unit.created_at >= month_start
    ).scalar() or 0
    
    # Count videos
    videos_count = db.query(func.count(Video.id)).scalar() or 0
    
    # Count videos created this month
    videos_this_month = db.query(func.count(Video.id)).filter(
        Video.created_at >= month_start
    ).scalar() or 0
    
    # Count tests
    tests_count = db.query(func.count(Test.id)).scalar() or 0
    
    # Count tests created this month
    tests_this_month = db.query(func.count(Test.id)).filter(
        Test.created_at >= month_start
    ).scalar() or 0
    
    # Count students
    students_count = db.query(func.count(User.id)).filter(
        User.role == UserRole.STUDENT
    ).scalar() or 0
    
    # Count students created this month
    students_this_month = db.query(func.count(User.id)).filter(
        and_(
            User.role == UserRole.STUDENT,
            User.created_at >= month_start
        )
    ).scalar() or 0
    
    # COURSE-LEVEL AGGREGATED PROGRESS (Overview, not details)
    # Get all courses with their units
    all_courses = db.query(Course).filter(Course.status == 'published').all()
    
    course_progress = []
    at_risk_students = []
    drop_off_points = []
    
    for course in all_courses:
        # Get units in this course
        course_units = db.query(Unit).filter(
            Unit.course_id == course.id,
            Unit.status == 'published'
        ).order_by(Unit.order_index).all()
        
        # Get tasks in this course
        course_tasks = db.query(Task).join(Unit).filter(
            Unit.course_id == course.id,
            Task.status == 'published'
        ).all()
        
        # Get tests in this course
        course_tests = db.query(Test).join(Unit).filter(
            Unit.course_id == course.id,
            Test.status == 'published'
        ).all()
        
        # Count students enrolled (have progress or submissions)
        enrolled_students = set()
        
        # From task submissions
        task_submissions = db.query(TaskSubmission.student_id).join(Task).join(Unit).filter(
            Unit.course_id == course.id,
            TaskSubmission.status == SubmissionStatus.GRADED
        ).distinct().all()
        for sub in task_submissions:
            enrolled_students.add(sub.student_id)
        
        # From test attempts
        test_attempts = db.query(TestAttempt.student_id).join(Test).join(Unit).filter(
            Unit.course_id == course.id,
            TestAttempt.status == AttemptStatus.COMPLETED
        ).distinct().all()
        for att in test_attempts:
            enrolled_students.add(att.student_id)
        
        total_enrolled = len(enrolled_students)
        
        # Calculate course completion (students who completed all tasks)
        total_tasks = len(course_tasks)
        completed_by_student = {}
        
        for task in course_tasks:
            graded_submissions = db.query(TaskSubmission).filter(
                TaskSubmission.task_id == task.id,
                TaskSubmission.status == SubmissionStatus.GRADED
            ).all()
            for sub in graded_submissions:
                if sub.student_id not in completed_by_student:
                    completed_by_student[sub.student_id] = 0
                completed_by_student[sub.student_id] += 1
        
        # Count fully completed students
        fully_completed = sum(1 for student_id, count in completed_by_student.items() 
                            if count == total_tasks and total_tasks > 0)
        
        completion_rate = (fully_completed / total_enrolled * 100) if total_enrolled > 0 else 0.0
        
        # Calculate average test score per course
        test_scores = []
        for test in course_tests:
            completed_attempts = db.query(TestAttempt).filter(
                TestAttempt.test_id == test.id,
                TestAttempt.status == AttemptStatus.COMPLETED,
                TestAttempt.score.isnot(None)
            ).all()
            for attempt in completed_attempts:
                test_scores.append(attempt.score)
        
        avg_test_score = (sum(test_scores) / len(test_scores)) if test_scores else 0.0
        
        # Find drop-off points (units with low completion)
        unit_drop_offs = []
        for unit in course_units:
            unit_tasks = [t for t in course_tasks if t.unit_id == unit.id]
            if not unit_tasks:
                continue
            
            unit_started = set()
            unit_completed = set()
            
            for task in unit_tasks:
                submissions = db.query(TaskSubmission).filter(
                    TaskSubmission.task_id == task.id
                ).all()
                for sub in submissions:
                    unit_started.add(sub.student_id)
                    if sub.status == SubmissionStatus.GRADED:
                        unit_completed.add(sub.student_id)
            
            if len(unit_started) > 0:
                completion_pct = (len(unit_completed) / len(unit_started)) * 100
                if completion_pct < 50:  # Drop-off threshold
                    unit_drop_offs.append({
                        "unit_id": unit.id,
                        "unit_title": unit.title,
                        "unit_order": unit.order_index,
                        "completion_rate": round(completion_pct, 1),
                        "started": len(unit_started),
                        "completed": len(unit_completed)
                    })
        
        # Sort drop-offs by order
        unit_drop_offs.sort(key=lambda x: x["unit_order"])
        
        course_progress.append({
            "course_id": course.id,
            "course_title": course.title,
            "completion_rate": round(completion_rate, 1),
            "avg_test_score": round(avg_test_score, 1),
            "total_enrolled": total_enrolled,
            "fully_completed": fully_completed,
            "total_tasks": total_tasks,
            "total_tests": len(course_tests),
            "total_units": len(course_units)
        })
        
        # Add drop-off points for this course
        for drop_off in unit_drop_offs:
            drop_off_points.append({
                "course_id": course.id,
                "course_title": course.title,
                **drop_off
            })
    
    # STUDENT-LEVEL AGGREGATED PROGRESS (Overview - who is doing well / who is stuck)
    all_students = db.query(User.id, User.first_name, User.last_name).filter(
        User.role == UserRole.STUDENT
    ).all()
    
    students_progress = []
    
    for student in all_students:
        student_id = student.id
        
        # Get student's courses (from task submissions and test attempts)
        student_courses = set()
        
        # From task submissions
        student_task_submissions = db.query(TaskSubmission.task_id).join(Task).join(Unit).filter(
            TaskSubmission.student_id == student_id,
            TaskSubmission.status == SubmissionStatus.GRADED
        ).all()
        for sub in student_task_submissions:
            # Get course for this task
            task = db.query(Task).join(Unit).filter(Task.id == sub.task_id).first()
            if task and task.unit and task.unit.course_id:
                student_courses.add(task.unit.course_id)
        
        # From test attempts
        student_test_ids = db.query(TestAttempt.test_id).join(Test).join(Unit).filter(
            TestAttempt.student_id == student_id,
            TestAttempt.status == AttemptStatus.COMPLETED
        ).all()
        for att in student_test_ids:
            test = db.query(Test).join(Unit).filter(Test.id == att.test_id).first()
            if test and test.unit and test.unit.course_id:
                student_courses.add(test.unit.course_id)
        
        courses_enrolled = len(student_courses)
        
        # Get student's overall task completion
        student_completed_tasks = db.query(TaskSubmission).filter(
            TaskSubmission.student_id == student_id,
            TaskSubmission.status == SubmissionStatus.GRADED
        ).count()
        
        # Get total tasks in enrolled courses
        total_tasks_in_courses = 0
        if student_courses:
            total_tasks_in_courses = db.query(Task).join(Unit).filter(
                Unit.course_id.in_(list(student_courses)),
                Task.status == 'published'
            ).count()
        
        # Calculate overall progress %
        overall_progress = (student_completed_tasks / total_tasks_in_courses * 100) if total_tasks_in_courses > 0 else 0.0
        
        # Get average test score
        student_test_attempts = db.query(TestAttempt).filter(
            TestAttempt.student_id == student_id,
            TestAttempt.status == AttemptStatus.COMPLETED,
            TestAttempt.score.isnot(None)
        ).all()
        
        avg_test_score = (sum(a.score for a in student_test_attempts) / len(student_test_attempts)) if student_test_attempts else 0.0
        
        # Get course details (for expandable view)
        course_details = []
        for course_id in student_courses:
            course = db.query(Course).filter(Course.id == course_id).first()
            if course:
                # Count tasks in this course
                course_tasks = db.query(Task).join(Unit).filter(
                    Unit.course_id == course_id,
                    Task.status == 'published'
                ).count()
                
                # Count completed tasks in this course
                completed_in_course = db.query(TaskSubmission).join(Task).join(Unit).filter(
                    TaskSubmission.student_id == student_id,
                    TaskSubmission.status == SubmissionStatus.GRADED,
                    Unit.course_id == course_id
                ).count()
                
                course_progress_pct = (completed_in_course / course_tasks * 100) if course_tasks > 0 else 0.0
                
                course_details.append({
                    "course_id": course_id,
                    "course_title": course.title,
                    "completed_tasks": completed_in_course,
                    "total_tasks": course_tasks,
                    "progress": round(course_progress_pct, 1)
                })
        
        students_progress.append({
            "student_id": student_id,
            "student_name": f"{student.first_name} {student.last_name}",
            "courses_enrolled": courses_enrolled,
            "overall_progress": round(overall_progress, 1),
            "avg_score": round(avg_test_score, 1),
            "course_details": course_details  # For expandable view
        })
        
        # At risk if completion < 30% or avg score < 60%
        if overall_progress < 30 or (avg_test_score > 0 and avg_test_score < 60):
            at_risk_students.append({
                "student_id": student_id,
                "student_name": f"{student.first_name} {student.last_name}",
                "completion_rate": round(overall_progress, 1),
                "avg_test_score": round(avg_test_score, 1),
                "risk_reason": "Низкая завершенность" if overall_progress < 30 else "Низкий средний балл"
            })
    
    # Get recent activity (simplified - can be enhanced later)
    recent_activity = []
    
    return DashboardStatistics(
        courses_count=courses_count,
        units_count=units_count,
        videos_count=videos_count,
        tests_count=tests_count,
        students_count=students_count,
        courses_this_month=courses_this_month,
        units_this_month=units_this_month,
        videos_this_month=videos_this_month,
        tests_this_month=tests_this_month,
        students_this_month=students_this_month,
        course_progress=course_progress,
        students_progress=students_progress,
        at_risk_students=at_risk_students[:10],  # Limit to top 10
        drop_off_points=drop_off_points[:10],  # Limit to top 10
        recent_activity=recent_activity
    )

@router.get("/student/dashboard", response_model=StudentDashboardStats)
async def get_student_dashboard(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get dashboard statistics for the current student"""
    student_id = current_user.id
    
    # Get enrolled courses from enrollment table (actual enrollments)
    enrolled_course_ids = get_user_enrolled_courses(db, student_id)
    my_courses_count = len(enrolled_course_ids)
    
    # Also get courses the student has interacted with (for recommended courses logic)
    student_courses = set(enrolled_course_ids)
    
    # From task submissions
    task_submissions = db.query(TaskSubmission).filter(
        TaskSubmission.student_id == student_id
    ).all()
    for submission in task_submissions:
        task = db.query(Task).filter(Task.id == submission.task_id).first()
        if task and task.unit and task.unit.course_id:
            student_courses.add(task.unit.course_id)
    
    # From test attempts
    test_attempts = db.query(TestAttempt).filter(
        TestAttempt.student_id == student_id
    ).all()
    for attempt in test_attempts:
        test = db.query(Test).filter(Test.id == attempt.test_id).first()
        if test and test.unit and test.unit.course_id:
            student_courses.add(test.unit.course_id)
    
    # From progress
    progress_records = db.query(Progress).filter(
        Progress.student_id == student_id
    ).all()
    for progress in progress_records:
        unit = db.query(Unit).filter(Unit.id == progress.unit_id).first()
        if unit and unit.course_id:
            student_courses.add(unit.course_id)
    
    # Count completed units (units with completed progress, all videos watched, all tests passed, or all tasks completed)
    completed_units = 0
    student_units = set()
    
    # Get units from progress
    for progress in progress_records:
        if progress.is_completed:
            student_units.add(progress.unit_id)
            completed_units += 1
    
    # Check units for completion based on videos, tasks, and tests
    for course_id in enrolled_course_ids:  # Only check enrolled courses
        course = db.query(Course).filter(Course.id == course_id).first()
        if not course:
            continue
        units = db.query(Unit).filter(
            Unit.course_id == course_id,
            Unit.status == UnitStatus.PUBLISHED
        ).all()
        for unit in units:
            if unit.id in student_units:
                continue
            
            # Check if unit is completed by checking all components
            unit_videos = db.query(Video).filter(
                Video.unit_id == unit.id,
                Video.status == VideoStatus.PUBLISHED
            ).all()
            
            unit_tasks = db.query(Task).filter(
                Task.unit_id == unit.id,
                Task.status == TaskStatus.PUBLISHED
            ).all()
            
            unit_tests = db.query(Test).filter(
                Test.unit_id == unit.id,
                Test.status == TestStatus.PUBLISHED
            ).all()
            
            # Check if all videos are completed
            all_videos_completed = True
            if unit_videos:
                for video in unit_videos:
                    video_progress = db.query(VideoProgress).filter(
                        VideoProgress.user_id == student_id,
                        VideoProgress.video_id == video.id,
                        VideoProgress.completed == True
                    ).first()
                    if not video_progress:
                        all_videos_completed = False
                        break
            else:
                all_videos_completed = True  # No videos means this check passes
            
            # Check if all tasks are submitted
            all_tasks_completed = True
            if unit_tasks:
                for task in unit_tasks:
                    task_submission = db.query(TaskSubmission).filter(
                        TaskSubmission.student_id == student_id,
                        TaskSubmission.task_id == task.id,
                        TaskSubmission.status == SubmissionStatus.SUBMITTED
                    ).first()
                    if not task_submission:
                        all_tasks_completed = False
                        break
            else:
                all_tasks_completed = True  # No tasks means this check passes
            
            # Check if all tests are passed
            all_tests_passed = True
            if unit_tests:
                for test in unit_tests:
                    attempts = db.query(TestAttempt).filter(
                        TestAttempt.test_id == test.id,
                        TestAttempt.student_id == student_id,
                        TestAttempt.status == AttemptStatus.COMPLETED
                    ).all()
                    if not attempts:
                        all_tests_passed = False
                        break
                    # Check if any attempt passed
                    passed = any(
                        att.score is not None and att.score >= test.passing_score
                        for att in attempts
                    )
                    if not passed:
                        all_tests_passed = False
                        break
            else:
                all_tests_passed = True  # No tests means this check passes
            
            # Unit is completed if all components are completed
            if all_videos_completed and all_tasks_completed and all_tests_passed and (unit_videos or unit_tasks or unit_tests):
                completed_units += 1
                student_units.add(unit.id)
    
    # Calculate average score from test attempts
    all_test_attempts = db.query(TestAttempt).filter(
        TestAttempt.student_id == student_id,
        TestAttempt.status == AttemptStatus.COMPLETED,
        TestAttempt.score.isnot(None)
    ).all()
    
    average_score = 0.0
    if all_test_attempts:
        total_score = sum(att.score for att in all_test_attempts if att.score is not None)
        average_score = round(total_score / len(all_test_attempts), 1)
    
    # Calculate time spent (from progress, test attempts, and video watch time)
    time_spent_hours = 0.0
    
    # From progress
    for progress in progress_records:
        if progress.completed_at:
            time_spent_hours += progress.duration_hours
    
    # From test attempts (estimate 30 minutes per test attempt)
    time_spent_hours += len(all_test_attempts) * 0.5
    
    # From video watch time (convert seconds to hours)
    video_progress_records = db.query(VideoProgress).filter(
        VideoProgress.user_id == student_id
    ).all()
    total_video_watch_time_seconds = sum(vp.watch_time_sec for vp in video_progress_records if vp.watch_time_sec)
    time_spent_hours += total_video_watch_time_seconds / 3600.0
    
    # Recent activity (last 10 activities)
    recent_activity = []
    
    # From video watching (most recent video progress)
    recent_video_progress = db.query(VideoProgress).filter(
        VideoProgress.user_id == student_id
    ).order_by(desc(VideoProgress.last_watched_at)).limit(5).all()
    
    for vp in recent_video_progress:
        video = db.query(Video).filter(Video.id == vp.video_id).first()
        if video:
            unit = db.query(Unit).filter(Unit.id == video.unit_id).first() if video.unit_id else None
            if unit:
                status_text = "завершено" if vp.completed else f"просмотрено {int(vp.watched_percentage)}%"
                recent_activity.append({
                    "type": "video_watched",
                    "title": video.title,
                    "description": f"Просмотрено видео «{video.title}»",
                    "unit_title": unit.title if unit else "Unknown Unit",
                    "date": vp.last_watched_at if vp.last_watched_at else vp.first_watched_at,
                    "status": status_text
                })
    
    # From task submissions
    recent_submissions = db.query(TaskSubmission).filter(
        TaskSubmission.student_id == student_id
    ).order_by(desc(TaskSubmission.submitted_at)).limit(5).all()
    
    for submission in recent_submissions:
        task = db.query(Task).filter(Task.id == submission.task_id).first()
        if task:
            unit = db.query(Unit).filter(Unit.id == task.unit_id).first()
            activity_type = "task_submitted" if submission.is_submitted else "task_draft"
            status_text = "оценивание ожидается" if submission.is_submitted and not submission.is_graded else "оценено"
            if submission.is_graded and submission.score is not None:
                status_text = f"оценено: {submission.score}%"
            
            recent_activity.append({
                "type": activity_type,
                "title": task.title,
                "description": f"Задание «{task.title}»",
                "unit_title": unit.title if unit else "Unknown Unit",
                "date": submission.submitted_at or submission.task.created_at,
                "status": status_text
            })
    
    # From test attempts
    recent_test_attempts = db.query(TestAttempt).filter(
        TestAttempt.student_id == student_id
    ).order_by(desc(TestAttempt.submitted_at)).limit(5).all()
    
    for attempt in recent_test_attempts:
        test = db.query(Test).filter(Test.id == attempt.test_id).first()
        if test:
            unit = db.query(Unit).filter(Unit.id == test.unit_id).first()
            score_text = f"результат {attempt.score}%" if attempt.score is not None else "в процессе"
            recent_activity.append({
                "type": "test_completed",
                "title": test.title,
                "description": f"Пройден тест «{test.title}»",
                "unit_title": unit.title if unit else "Unknown Unit",
                "date": attempt.submitted_at or attempt.started_at,
                "status": score_text
            })
    
    # Sort by date and take most recent 10
    recent_activity.sort(key=lambda x: x["date"] if x["date"] else datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    recent_activity = recent_activity[:10]
    
    # Upcoming deadlines (tasks and tests with due dates in the next 7 days)
    upcoming_deadlines = []
    now = datetime.now(timezone.utc)
    week_from_now = now + timedelta(days=7)
    
    # Get tasks assigned to student with upcoming deadlines
    all_tasks = db.query(Task).filter(
        Task.status == TaskStatus.PUBLISHED,
        Task.due_at.isnot(None),
        Task.due_at > now,
        Task.due_at <= week_from_now
    ).all()
    
    for task in all_tasks:
        # Check if task is assigned to this student
        if task.assigned_students and student_id in task.assigned_students:
            unit = db.query(Unit).filter(Unit.id == task.unit_id).first()
            course = db.query(Course).filter(Course.id == unit.course_id).first() if unit else None
            
            days_until = (task.due_at - now).days
            deadline_text = f"Через {days_until} {'день' if days_until == 1 else 'дня' if days_until < 5 else 'дней'}"
            
            upcoming_deadlines.append({
                "type": "task",
                "title": task.title,
                "unit_title": unit.title if unit else "Unknown Unit",
                "course_title": course.title if course else "Unknown Course",
                "due_at": task.due_at,
                "days_until": days_until,
                "deadline_text": deadline_text
            })
    
    # Get tests with deadlines in settings (published tests)
    all_tests = db.query(Test).filter(
        Test.status == TestStatus.PUBLISHED
    ).all()
    
    for test in all_tests:
        # Check if test has a deadline in settings
        if test.settings and isinstance(test.settings, dict) and test.settings.get('deadline'):
            try:
                # Parse deadline from settings (datetime-local format: YYYY-MM-DDTHH:mm)
                deadline_str = test.settings.get('deadline')
                if isinstance(deadline_str, str) and deadline_str.strip():
                    deadline_dt = None
                    
                    # Parse datetime-local format (YYYY-MM-DDTHH:mm)
                    if 'T' in deadline_str:
                        # Remove timezone if present
                        deadline_str_clean = deadline_str.split('+')[0].split('Z')[0].split('.')[0]
                        try:
                            deadline_dt = datetime.fromisoformat(deadline_str_clean)
                        except ValueError:
                            # Try parsing with different format
                            deadline_dt = datetime.strptime(deadline_str_clean, '%Y-%m-%dT%H:%M')
                        
                        # If no timezone info, assume it's in UTC
                        if deadline_dt.tzinfo is None:
                            deadline_dt = deadline_dt.replace(tzinfo=timezone.utc)
                        else:
                            # Convert to UTC if it has timezone
                            deadline_dt = deadline_dt.astimezone(timezone.utc)
                    else:
                        # Date only format, assume end of day UTC
                        deadline_dt = datetime.strptime(deadline_str, '%Y-%m-%d')
                        deadline_dt = deadline_dt.replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
                    
                    # Check if deadline is in the next 7 days
                    if deadline_dt and now < deadline_dt <= week_from_now:
                        unit = db.query(Unit).filter(Unit.id == test.unit_id).first()
                        course = db.query(Course).filter(Course.id == unit.course_id).first() if unit else None
                        
                        days_until = (deadline_dt - now).days
                        deadline_text = f"Через {days_until} {'день' if days_until == 1 else 'дня' if days_until < 5 else 'дней'}"
                        
                        upcoming_deadlines.append({
                            "type": "test",
                            "title": test.title,
                            "unit_title": unit.title if unit else "Unknown Unit",
                            "course_title": course.title if course else "Unknown Course",
                            "due_at": deadline_dt.isoformat(),
                            "days_until": days_until,
                            "deadline_text": deadline_text
                        })
            except (ValueError, TypeError, AttributeError) as e:
                # Skip if deadline format is invalid
                import traceback
                print(f"Error parsing test deadline for test {test.id}: {e}")
                print(f"Deadline string: {test.settings.get('deadline')}")
                print(traceback.format_exc())
                continue
    
    # Sort by due date
    upcoming_deadlines.sort(key=lambda x: datetime.fromisoformat(x["due_at"].replace('Z', '+00:00')) if isinstance(x["due_at"], str) else x["due_at"])
    
    # Recommended courses (published courses not yet started)
    all_published_courses = db.query(Course).filter(
        Course.status == CourseStatus.PUBLISHED,
        Course.is_visible_to_students == True
    ).all()
    
    recommended_courses = []
    for course in all_published_courses:
        if course.id not in student_courses:
            recommended_courses.append({
                "id": course.id,
                "title": course.title,
                "description": course.description,
                "level": course.level.value if hasattr(course.level, 'value') else str(course.level),
                "thumbnail_url": course.thumbnail_url,
                "thumbnail_path": getattr(course, 'thumbnail_path', None),
                "units_count": course.published_units_count
            })
    
    # Sort by order_index and take top 2
    recommended_courses.sort(key=lambda x: x.get("order_index", 999))
    recommended_courses = recommended_courses[:2]
    
    # Last activity
    last_activity = None
    if recent_activity:
        last_act = recent_activity[0]
        last_activity = {
            "type": last_act["type"],
            "title": last_act.get("unit_title", "Unknown"),
            "description": last_act.get("description", ""),
            "date": last_act["date"]
        }
    
    # Latest video watched - get the most recently watched video
    latest_video_watched = None
    latest_video_progress = db.query(VideoProgress).filter(
        VideoProgress.user_id == student_id
    ).order_by(desc(VideoProgress.last_watched_at)).first()
    
    if latest_video_progress:
        video = db.query(Video).filter(Video.id == latest_video_progress.video_id).first()
        if video and video.unit_id:
            unit = db.query(Unit).filter(Unit.id == video.unit_id).first()
            if unit:
                course = db.query(Course).filter(Course.id == unit.course_id).first()
                latest_video_watched = {
                    "video_id": video.id,
                    "video_title": video.title,
                    "unit_id": unit.id,
                    "unit_title": unit.title,
                    "course_id": course.id if course else None,
                    "course_title": course.title if course else None,
                    "last_watched_at": latest_video_progress.last_watched_at.isoformat() if latest_video_progress.last_watched_at else None,
                    "watched_percentage": latest_video_progress.watched_percentage,
                    "completed": latest_video_progress.completed
                }
    
    # Active course progress - get progress for the most recently accessed course
    active_course_progress = None
    
    # Get enrolled courses
    enrolled_courses = db.query(CourseEnrollment).filter(
        CourseEnrollment.user_id == student_id
    ).all()
    
    if enrolled_courses:
        # Find the most recently accessed course (by latest video watched or enrollment date)
        most_recent_course_id = None
        most_recent_time = None
        
        # Check from latest video watched
        if latest_video_watched and latest_video_watched.get("course_id"):
            most_recent_course_id = latest_video_watched["course_id"]
            if latest_video_watched.get("last_watched_at"):
                try:
                    most_recent_time = datetime.fromisoformat(latest_video_watched["last_watched_at"].replace('Z', '+00:00'))
                except:
                    pass
        
        # If no video watched, use enrollment date
        if not most_recent_course_id and enrolled_courses:
            most_recent_enrollment = max(enrolled_courses, key=lambda e: e.created_at if e.created_at else datetime.min.replace(tzinfo=timezone.utc))
            most_recent_course_id = most_recent_enrollment.course_id
        
        if most_recent_course_id:
            course = db.query(Course).filter(Course.id == most_recent_course_id).first()
            if course:
                # Get all units in the course
                course_units = db.query(Unit).filter(
                    Unit.course_id == course.id,
                    Unit.status == UnitStatus.PUBLISHED
                ).order_by(Unit.order_index).all()
                
                if course_units:
                    # Get the unit from latest video watched if available, otherwise use first unit
                    active_unit = None
                    if latest_video_watched and latest_video_watched.get("unit_id"):
                        # Check if the unit from latest video is in this course
                        unit_from_video = db.query(Unit).filter(
                            Unit.id == latest_video_watched["unit_id"],
                            Unit.course_id == course.id
                        ).first()
                        if unit_from_video:
                            active_unit = unit_from_video
                    
                    # If no unit from latest video, use first unit
                    if not active_unit:
                        active_unit = course_units[0]
                    
                    # Count completed videos in this unit
                    unit_videos = db.query(Video).filter(
                        Video.unit_id == active_unit.id,
                        Video.status == VideoStatus.PUBLISHED
                    ).all()
                    
                    completed_videos_count = 0
                    if unit_videos:
                        video_progresses = db.query(VideoProgress).filter(
                            VideoProgress.user_id == student_id,
                            VideoProgress.video_id.in_([v.id for v in unit_videos]),
                            VideoProgress.completed == True
                        ).count()
                        completed_videos_count = video_progresses
                    
                    # Count completed tasks in this unit
                    unit_tasks = db.query(Task).filter(
                        Task.unit_id == active_unit.id,
                        Task.status == TaskStatus.PUBLISHED
                    ).all()
                    
                    completed_tasks_count = 0
                    if unit_tasks:
                        task_submissions = db.query(TaskSubmission).filter(
                            TaskSubmission.student_id == student_id,
                            TaskSubmission.task_id.in_([t.id for t in unit_tasks]),
                            TaskSubmission.status == SubmissionStatus.SUBMITTED
                        ).count()
                        completed_tasks_count = task_submissions
                    
                    # Count passed tests in this unit
                    unit_tests = db.query(Test).filter(
                        Test.unit_id == active_unit.id,
                        Test.status == TestStatus.PUBLISHED
                    ).all()
                    
                    passed_tests_count = 0
                    if unit_tests:
                        for test in unit_tests:
                            attempts = db.query(TestAttempt).filter(
                                TestAttempt.test_id == test.id,
                                TestAttempt.student_id == student_id,
                                TestAttempt.status == AttemptStatus.COMPLETED
                            ).all()
                            if attempts:
                                passed = any(
                                    att.score is not None and att.score >= test.passing_score
                                    for att in attempts
                                )
                                if passed:
                                    passed_tests_count += 1
                    
                    # Calculate total items and completed items
                    total_videos = len(unit_videos)
                    total_tasks = len(unit_tasks)
                    total_tests = len(unit_tests)
                    total_items = total_videos + total_tasks + total_tests
                    completed_items = completed_videos_count + completed_tasks_count + passed_tests_count
                    
                    progress_percent = 0.0
                    if total_items > 0:
                        progress_percent = round((completed_items / total_items) * 100, 1)
                    
                    active_course_progress = {
                        "course_id": course.id,
                        "course_title": course.title,
                        "unit_id": active_unit.id,
                        "unit_title": active_unit.title,
                        "progress_percent": progress_percent,
                        "completed_videos": completed_videos_count,
                        "total_videos": total_videos,
                        "completed_tasks": completed_tasks_count,
                        "total_tasks": total_tasks,
                        "passed_tests": passed_tests_count,
                        "total_tests": total_tests
                    }
    
    return StudentDashboardStats(
        my_courses_count=my_courses_count,
        completed_units=completed_units,
        average_score=average_score,
        time_spent_hours=round(time_spent_hours, 1),
        recent_activity=recent_activity,
        upcoming_deadlines=upcoming_deadlines,
        recommended_courses=recommended_courses,
        last_activity=last_activity,
        latest_video_watched=latest_video_watched,
        active_course_progress=active_course_progress
    )
