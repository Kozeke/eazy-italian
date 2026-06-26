"""
Course management endpoints for admin and student views.

Architecture (current):
  Course → Unit → Segment → exercise blocks (media_blocks JSONB on Segment)
  Exercise types: text, video, audio, image, gif_animation, image_stacked,
                  video_embed, audio_embed, drag_to_gap, drag_word_to_image,
                  type_word_to_image, select_form_to_image, type_word_in_gap,
                  select_word_form, build_sentence, match_pairs, order_paragraphs,
                  sort_into_columns, test_without_timer, test_with_timer, true_false

Legacy models commented out (to be removed once migration is confirmed stable):
  - Task / TaskSubmission / SubmissionStatus / TaskStatus   (→ exercise blocks on Segment)
  - Test / TestAttempt / AttemptStatus / TestStatus         (→ test_without_timer / test_with_timer blocks)
  - Video / VideoStatus / VideoProgress                     (→ video_embed / video blocks on Segment)
  - Progress                                                (→ UnitHomeworkSubmission / segment completion)
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_, desc, asc, func
from typing import List, Optional, Dict, Any, Set
from datetime import datetime, timedelta, timezone
import logging
import os

logger = logging.getLogger(__name__)

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
from app.models.enrollment import CourseEnrollment
# New segment model — exercises live here as media_blocks JSONB
from app.models.segment import Segment, SegmentStatus
# New homework submission — replaces the old Progress / TaskSubmission tracking
from app.models.homework_submission import UnitHomeworkSubmission, HomeworkSubmissionStatus

# ── LEGACY IMPORTS — commented out, kept for reference during migration ────────
# from app.models.video import Video, VideoStatus          # → video_embed blocks on Segment
# from app.models.test import Test, TestStatus, TestAttempt, AttemptStatus  # → test_* blocks
# from app.models.progress import Progress                 # → UnitHomeworkSubmission
# from app.models.task import Task, TaskSubmission, SubmissionStatus, TaskStatus  # → exercise blocks
# from app.models.video_progress import VideoProgress      # → segment/exercise completion state
# ──────────────────────────────────────────────────────────────────────────────

from app.schemas.course import (
    CourseResponse, CourseCreate, CourseUpdate, CourseListResponse,
    CourseDetailResponse, CourseReorderRequest, CourseUnitsReorderRequest,
    CoursePublishRequest,
    CourseBulkAction, DashboardStatistics, StudentDashboardStats,
    EnrolledCourseResponse, CourseAskRequest,
)
from app.services.rag_service import RAGService
from app.services.ai.providers.ollama import LocalLlamaProvider
from app.services.ai.answer_synthesizer import AnswerResponse

router = APIRouter()


def get_rag_service(db: Session = Depends(get_db)) -> RAGService:
    """Dependency: RAG service with DB session and default Ollama provider."""
    return RAGService(db=db, provider=LocalLlamaProvider())


# ── Health check ───────────────────────────────────────────────────────────────

@router.get("/admin/test")
async def test_admin_route():
    """Test endpoint to verify admin routes are registered"""
    return {"message": "Admin routes are working!", "status": "ok"}


# ── LEGACY: question update endpoint ──────────────────────────────────────────
# Questions belonged to the old Test model (test_without_timer / test_with_timer
# blocks on Segment are the new equivalent). Kept live until those editor pages
# are fully migrated.
@router.put("/admin/questions/{question_id}")
async def update_question(
    question_id: int,
    question_data: Dict[str, Any],
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """
    Update a legacy question record.
    LEGACY: Questions were part of the old Test model. New exercises store their
    config directly in Segment.media_blocks JSONB. This endpoint remains until
    all test editor pages are migrated to the segment block editor.
    """
    from app.models.test import Question, TestQuestion, Test  # legacy — local import
    
    question = db.query(Question).filter(Question.id == question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    
    test_question = db.query(TestQuestion).filter(TestQuestion.question_id == question_id).first()
    if test_question:
        test = db.query(Test).filter(Test.id == test_question.test_id).first()
        if test and test.created_by != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to modify this question")
    
    if 'prompt' in question_data:
        question.prompt_rich = question_data.get('prompt', '')
    if 'score' in question_data or 'points' in question_data:
        question.points = question_data.get('score') or question_data.get('points', question.points)
    if 'metadata' in question_data:
        question.question_metadata = question_data.get('metadata', {})
    
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
    
    if 'score' in question_data or 'points' in question_data:
        new_score = question_data.get('score') or question_data.get('points')
        if test_question and new_score:
            test_question.points = new_score
    
    db.commit()
    db.refresh(question)
    
    return {
        "id": question.id,
        "type": question.type if isinstance(question.type, str) else question.type.value,
        "prompt_rich": question.prompt_rich,
        "points": question.points,
        "message": "Question updated successfully"
    }


# ── Admin course CRUD ──────────────────────────────────────────────────────────

@router.get("/admin/courses", response_model=List[CourseListResponse])
async def get_admin_courses(
    query: Optional[str] = Query(None, description="Search by title or description"),
    level: Optional[CourseLevel] = Query(None, description="Filter by level"),
    status: Optional[CourseStatus] = Query(None, description="Filter by status"),
    created_by: Optional[int] = Query(None, description="Filter by creator"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(100, ge=1, le=100, description="Items per page"),
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """
    Lightweight course card list — only fields needed to render the grid.
    Heavy data (units list, enrolled count, content_summary, first_unit_id)
    is NOT fetched here. One SELECT, no joins, sub-100ms on warm connection.
    Call GET /admin/courses/{course_id} when a course card is clicked.
    """
    # Correlated subquery: total units belonging to each course row
    units_count_sq = (
        db.query(func.count(Unit.id))
        .filter(Unit.course_id == Course.id)
        .correlate(Course)
        .scalar_subquery()
        .label("units_count")
    )

    # Correlated subquery: only published units for each course row
    published_units_sq = (
        db.query(func.count(Unit.id))
        .filter(
            Unit.course_id == Course.id,
            Unit.status == UnitStatus.PUBLISHED,
        )
        .correlate(Course)
        .scalar_subquery()
        .label("published_units_count")
    )

    query_builder = db.query(
        Course.id,
        Course.title,
        Course.description,
        Course.level,
        Course.status,
        Course.order_index,
        Course.thumbnail_url,
        Course.thumbnail_path,
        Course.created_by,
        Course.created_at,
        Course.updated_at,
        Course.target_language,
        Course.native_language,
        units_count_sq,
        published_units_sq,
    ).filter(Course.created_by == current_user.id)

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

    offset = (page - 1) * limit
    rows = query_builder.order_by(desc(Course.created_at)).offset(offset).limit(limit).all()

    return [
        CourseListResponse(
            id=row.id,
            title=row.title,
            description=row.description,
            level=row.level,
            status=row.status,
            publish_at=None,
            order_index=row.order_index,
            thumbnail_url=row.thumbnail_url,
            thumbnail_path=row.thumbnail_path,
            created_by=row.created_by,
            created_at=row.created_at,
            updated_at=row.updated_at,
            units_count=row.units_count or 0,
            published_units_count=row.published_units_count or 0,
            content_summary=None,          # loaded on course open
            enrolled_students_count=None,  # loaded on course open
            first_unit_id=None,            # loaded on course open
            target_language=row.target_language,
            native_language=row.native_language,
        )
        for row in rows
    ]


@router.post("/admin/courses", response_model=CourseResponse)
async def create_course(
    course_data: CourseCreate,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Create a new course"""
    status = course_data.status or CourseStatus.DRAFT
    order_index = course_data.order_index if course_data.order_index is not None else 0
    is_visible_to_students = (
        course_data.is_visible_to_students
        if course_data.is_visible_to_students is not None
        else False
    )
    
    slug = course_data.slug if hasattr(course_data, 'slug') and course_data.slug else None
    if not slug:
        import re
        slug = re.sub(r'[^\w\s-]', '', course_data.title.lower())
        slug = re.sub(r'[-\s]+', '-', slug)
        slug = slug.strip('-')
    
    existing = db.query(Course).filter(Course.slug == slug).first()
    if existing:
        slug = f"{slug}-{datetime.utcnow().timestamp()}"
    
    target_language = (course_data.target_language or "").strip() or None
    native_language = (course_data.native_language or "").strip() or None

    course = Course(
        title=course_data.title,
        description=course_data.description,
        level=course_data.level,
        status=status,
        publish_at=course_data.publish_at,
        order_index=order_index,
        thumbnail_url=course_data.thumbnail_url,
        duration_hours=course_data.duration_hours,
        tags=course_data.tags or [],
        meta_title=course_data.meta_title,
        meta_description=course_data.meta_description,
        is_visible_to_students=is_visible_to_students,
        settings=course_data.settings or {},
        slug=slug,
        target_language=target_language,
        native_language=native_language,
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
        target_language=course.target_language,
        native_language=course.native_language,
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
    """Get a specific course with its units - only if created by current teacher"""
    
    course = db.query(Course).options(
        joinedload(Course.units)
    ).filter(
        Course.id == course_id,
        Course.created_by == current_user.id
    ).first()
    
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    units = db.query(Unit).filter(Unit.course_id == course_id).order_by(Unit.order_index).all()
    
    units_data = []
    for unit in units:
        units_data.append({
            "id": unit.id,
            "title": unit.title,
            "level": (unit.level if isinstance(unit.level, str) else unit.level.value) if unit.level else None,
            "status": (unit.status if isinstance(unit.status, str) else unit.status.value) if unit.status else None,
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
        target_language=getattr(course, 'target_language', None),
        native_language=getattr(course, 'native_language', None),
        created_by=course.created_by,
        updated_by=course.updated_by,
        created_at=course.created_at,
        updated_at=course.updated_at,
        units_count=course.units_count,
        published_units_count=course.published_units_count,
        content_summary=course.content_summary,
        units=units_data
    )


@router.get("/admin/courses/{course_id}/enrolled-student-ids")
async def get_admin_course_enrolled_student_ids(
    course_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    """List student user IDs enrolled in this course."""
    course = db.query(Course).filter(
        Course.id == course_id,
        Course.created_by == current_user.id,
    ).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    enrollment_rows = (
        db.query(CourseEnrollment.user_id)
        .join(User, User.id == CourseEnrollment.user_id)
        .filter(
            CourseEnrollment.course_id == course_id,
            User.role == UserRole.STUDENT,
        )
        .all()
    )
    return {"student_ids": [row[0] for row in enrollment_rows]}


@router.put("/admin/courses/{course_id}", response_model=CourseResponse)
async def update_course(
    course_id: int,
    course_data: CourseUpdate,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Update a course - only if created by current teacher"""
    
    course = db.query(Course).filter(
        Course.id == course_id,
        Course.created_by == current_user.id
    ).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
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
        target_language=getattr(course, 'target_language', None),
        native_language=getattr(course, 'native_language', None),
        created_by=course.created_by,
        updated_by=course.updated_by,
        created_at=course.created_at,
        updated_at=course.updated_at,
        units_count=course.units_count,
        published_units_count=course.published_units_count,
        content_summary=course.content_summary
    )


@router.post("/admin/courses/{course_id}/thumbnail")
async def upload_course_thumbnail(
    course_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Upload a thumbnail for a course"""
    
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    import uuid
    content_type_ext = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "image/svg+xml": ".svg",
    }
    file_ext = content_type_ext.get(
        (file.content_type or "").lower().strip(),
        os.path.splitext(file.filename or '')[1] or '.jpg',
    )
    filename = f"course_{course_id}_{uuid.uuid4().hex[:8]}{file_ext}"

    try:
        from app.services.file_storage import save_upload

        content = await file.read()
        object_name = f"thumbnails/{filename}"
        stored_url = save_upload(
            file_data=content,
            object_name=object_name,
            content_type=file.content_type or "image/jpeg",
        )

        if stored_url.startswith("http"):
            thumbnail_path = stored_url
            course.thumbnail_url = stored_url
        else:
            thumbnail_path = object_name

        course.thumbnail_path = thumbnail_path
        course.updated_by = current_user.id
        course.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(course)
        
        return {
            "message": "Thumbnail uploaded successfully",
            "thumbnail_path": thumbnail_path
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload thumbnail: {str(e)}")


from pydantic import BaseModel as _PydanticBase

class ThumbnailPreviewRequest(_PydanticBase):
    title: str
    level: Optional[str] = "B1"
    description: Optional[str] = None
    language: Optional[str] = "English"


@router.post("/admin/courses/generate-thumbnail-preview")
async def generate_thumbnail_preview(
    body: ThumbnailPreviewRequest,
    current_user: User = Depends(get_current_teacher),
):
    """Generate a language-themed thumbnail preview before saving."""
    title    = (body.title or "").strip()[:200]
    level    = (body.level or "B1").strip()
    language = (body.language or "English").strip()

    if not title:
        raise HTTPException(status_code=422, detail="title is required")

    fal_prompt = (
        f"{language} language learning course thumbnail, titled '{title}', "
        f"CEFR level {level}, "
        f"iconic culture and landmarks of {language}-speaking countries, "
        "educational course banner, modern flat design, vibrant bold colors, "
        "wide banner composition"
    )

    fal_key: str = ""
    fal_lora_url: str = ""
    fal_lora_scale: float = 0.8
    try:
        from app.core.config import settings as _settings
        fal_key = getattr(_settings, "FAL_KEY", "") or ""
        fal_lora_url = getattr(_settings, "FAL_LORA_URL", "") or ""
        fal_lora_scale = float(getattr(_settings, "FAL_LORA_SCALE", 0.8) or 0.8)
    except Exception:
        fal_key = os.environ.get("FAL_KEY", "")

    if fal_key:
        try:
            from app.services.ai.image_providers import FalImageProvider
            thumbnail_style_prefix = "vibrant illustrated course banner, rich detailed scene, "
            provider = FalImageProvider(
                api_key=fal_key,
                image_size="landscape_16_9",
                lora_url=fal_lora_url,
                lora_scale=fal_lora_scale,
                style_prefix=thumbnail_style_prefix,
                apply_concept_visuals=False,
            )
            result = provider.generate_image(
                prompt=fal_prompt,
                alt_text=f"{language} course thumbnail",
            )
            data_uri = f"data:image/png;base64,{result.data}"
            return {"data_uri": data_uri, "source": "fal"}
        except Exception as exc:
            logger.warning("fal.ai thumbnail generation failed, falling back to SVG: %s", exc)

    try:
        from app.services.course_thumbnail_svg import build_course_thumbnail_data_uri
        data_uri = build_course_thumbnail_data_uri(title=title, level=level, language=language)
        return {"data_uri": data_uri, "source": "svg"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Thumbnail generation failed: {exc}")


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
        
        level = course.level.value if hasattr(course.level, 'value') else str(course.level)
        if level == 'mixed':
            level = 'A1'
        
        thumbnail_path = get_course_thumbnail_path(course.id, level)
        from app.utils.paths import resolve_uploads_path
        full_path = os.path.join(resolve_uploads_path(), thumbnail_path)
        subtitle = course.description[:50] if course.description else ""
        
        generate_course_thumbnail(
            level=level,
            output_path=full_path,
            title=course.title,
            subtitle=subtitle
        )
        
        course.thumbnail_path = thumbnail_path
        course.updated_by = current_user.id
        course.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(course)
        
        return {"message": "Thumbnail generated successfully", "thumbnail_path": course.thumbnail_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating thumbnail: {str(e)}")


@router.delete("/admin/courses/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_course(
    course_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Delete a course - only if created by current teacher"""
    
    course = db.query(Course).filter(
        Course.id == course_id,
        Course.created_by == current_user.id
    ).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
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
    """Publish a course — only if created by current teacher."""
    course = db.query(Course).filter(
        Course.id == course_id,
        Course.created_by == current_user.id
    ).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    can_publish, reason = course.can_publish()
    if not can_publish:
        raise HTTPException(status_code=400, detail=reason)

    course.status                 = CourseStatus.PUBLISHED
    course.is_visible_to_students = True
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
        target_language=getattr(course, 'target_language', None),
        native_language=getattr(course, 'native_language', None),
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
    """Reorder courses - only courses created by current teacher"""
    for index, course_id in enumerate(reorder_data.course_ids):
        course = db.query(Course).filter(
            Course.id == course_id,
            Course.created_by == current_user.id
        ).first()
        if course:
            course.order_index = index
            course.updated_by = current_user.id
    db.commit()
    return {"message": "Courses reordered successfully"}


@router.post("/admin/courses/{course_id}/units/reorder", response_model=Dict[str, str])
async def reorder_course_units(
    course_id: int,
    body: CourseUnitsReorderRequest,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    """Persist a new order_index sequence for all units in the course."""
    course = db.query(Course).filter(
        Course.id == course_id,
        Course.created_by == current_user.id,
    ).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    units = db.query(Unit).filter(Unit.course_id == course_id).all()
    db_ids = {u.id for u in units}
    payload_ids = list(body.unit_ids)
    if len(payload_ids) != len(db_ids) or set(payload_ids) != db_ids:
        raise HTTPException(
            status_code=400,
            detail="unit_ids must list every unit in this course exactly once",
        )

    id_to_unit = {u.id: u for u in units}
    for index, uid in enumerate(payload_ids):
        id_to_unit[uid].order_index = index
        id_to_unit[uid].updated_by = current_user.id

    db.commit()
    return {"message": "Units reordered successfully"}


# ── Subscription helper ────────────────────────────────────────────────────────

def get_user_subscription_name(db: Session, user: User) -> str:
    """Get user's subscription name."""
    # subscription_type is a native PG enum; guard in case SQLAlchemy returns plain str
    # Compare subscription_type directly — works for Enum instance and plain str
    raw_type = user.subscription_type
    if raw_type in (SubscriptionType.STANDARD, SubscriptionType.PRO):
        return raw_type if isinstance(raw_type, str) else raw_type.value

    active_sub = db.query(UserSubscription).join(
        Subscription, UserSubscription.subscription_id == Subscription.id
    ).filter(
        UserSubscription.user_id == user.id,
        UserSubscription.is_active == True
    ).first()

    if active_sub and active_sub.subscription:
        # subscription.name is Column(String(50)) — always a plain str, never an Enum
        sub_name = active_sub.subscription.name
        if sub_name in (SubscriptionName.STANDARD, SubscriptionName.PRO):
            return sub_name  # already a plain str; calling .value would crash

    return "FREE"


# ── Student catalog ────────────────────────────────────────────────────────────

@router.get("/courses", response_model=List[CourseListResponse])
async def get_courses(
    level: Optional[CourseLevel] = Query(None, description="Filter by level"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get published courses available to students."""
    query_builder = db.query(Course).filter(
        Course.is_visible_to_students == True,  # noqa: E712
        Course.status == CourseStatus.PUBLISHED,
    )

    if level:
        query_builder = query_builder.filter(Course.level == level)

    courses = query_builder.order_by(asc(Course.order_index)).all()
    available_courses = [c for c in courses if c.is_available]

    subscription_name      = get_user_subscription_name(db, current_user)
    enrolled_course_ids    = get_user_enrolled_courses(db, current_user.id)
    enrolled_courses_count = len(enrolled_course_ids)

    result = []
    for course in available_courses:
        thumbnail_path = getattr(course, 'thumbnail_path', None)
        is_enrolled    = course.id in enrolled_course_ids
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
            enrolled_courses_count=enrolled_courses_count,
            target_language=getattr(course, 'target_language', None),
            native_language=getattr(course, 'native_language', None),
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
    
    is_course_owner = (
        current_user.role == UserRole.TEACHER and course.created_by == current_user.id
    )
    if not is_course_owner and not course.is_available:
        raise HTTPException(status_code=403, detail="Course is not available")
    
    instructor = db.query(User).filter(User.id == course.created_by).first()
    instructor_name = instructor.full_name if instructor else None
    
    subscription_name = get_user_subscription_name(db, current_user)
    is_enrolled = is_user_enrolled(db, current_user.id, course_id)
    enrolled_courses_count = db.query(CourseEnrollment).filter(
        CourseEnrollment.user_id == current_user.id
    ).count()
    
    learning_outcomes = None
    if course.settings and isinstance(course.settings, dict) and 'learning_outcomes' in course.settings:
        learning_outcomes = course.settings.get('learning_outcomes')
    else:
        first_unit = db.query(Unit).filter(
            Unit.course_id == course_id,
            Unit.status == UnitStatus.PUBLISHED
        ).order_by(Unit.order_index).first()
        if first_unit and first_unit.goals:
            learning_outcomes = [first_unit.goals] if isinstance(first_unit.goals, str) else first_unit.goals
    
    units = db.query(Unit).filter(
        Unit.course_id == course_id
    ).order_by(Unit.order_index).all()
    
    units_data = []
    for unit in units:
        if unit.is_available:
            units_data.append({
                "id": unit.id,
                "title": unit.title,
                "level": unit.level if isinstance(unit.level, str) else unit.level.value,
                "status": unit.status if isinstance(unit.status, str) else unit.status.value,
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
        target_language=getattr(course, 'target_language', None),
        native_language=getattr(course, 'native_language', None),
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
    
    check_course_access(db, current_user, course_id)
    
    units = db.query(Unit).filter(Unit.course_id == course_id).order_by(Unit.order_index).all()
    
    units_data = []
    for unit in units:
        if unit.is_available:
            units_data.append({
                "id": unit.id,
                "title": unit.title,
                "level": unit.level if isinstance(unit.level, str) else unit.level.value,
                "status": unit.status if isinstance(unit.status, str) else unit.status.value,
                "order_index": unit.order_index,
                "content_count": unit.content_count
            })
    
    return {"course_id": course_id, "course_title": course.title, "units": units_data}


@router.post("/courses/{course_id}/ask", response_model=AnswerResponse)
async def ask_course(
    course_id: int,
    body: CourseAskRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    rag_service: RAGService = Depends(get_rag_service),
):
    """RAG-powered Q&A over course (or unit) content."""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if not course.is_available:
        raise HTTPException(status_code=403, detail="Course is not available")

    check_course_access(db, current_user, course_id)

    lesson_id: Optional[int] = None
    if body.scope == "unit":
        if body.unit_id is None:
            raise HTTPException(status_code=400, detail="unit_id is required when scope is 'unit'")
        unit = db.query(Unit).filter(Unit.id == body.unit_id, Unit.course_id == course_id).first()
        if not unit:
            raise HTTPException(status_code=404, detail="Unit not found or does not belong to this course")
        lesson_id = body.unit_id

    return await rag_service.aanswer(
        question=body.question,
        course_id=course_id,
        lesson_id=lesson_id,
    )


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
    
    can_enroll, reason = can_enroll_in_course(db, current_user, course_id)
    if not can_enroll:
        raise HTTPException(status_code=403, detail=reason)
    
    enrollment = CourseEnrollment(user_id=current_user.id, course_id=course_id)
    db.add(enrollment)
    
    from app.services.notification_service import notify_course_enrollment
    try:
        notify_course_enrollment(db, current_user.id, course_id, course.title)
    except Exception as e:
        print(f"Failed to create enrollment notification: {e}")
    
    # Create an empty homework submission record for the first unit so the
    # student has a draft to start from (replaces the old Progress seed row).
    first_unit = db.query(Unit).filter(Unit.course_id == course_id).order_by(Unit.order_index).first()
    if first_unit:
        existing_hw = db.query(UnitHomeworkSubmission).filter(
            UnitHomeworkSubmission.unit_id == first_unit.id,
            UnitHomeworkSubmission.student_id == current_user.id,
        ).first()
        if not existing_hw:
            hw = UnitHomeworkSubmission(
                unit_id=first_unit.id,
                student_id=current_user.id,
                status=HomeworkSubmissionStatus.NOT_STARTED,
                answers={},
            )
            db.add(hw)

    # ── LEGACY: old Progress seed row ─────────────────────────────────────────
    # from app.models.progress import Progress
    # existing_progress = db.query(Progress).filter(
    #     Progress.student_id == current_user.id,
    #     Progress.unit_id == first_unit.id
    # ).first()
    # if not existing_progress:
    #     progress = Progress(
    #         student_id=current_user.id,
    #         unit_id=first_unit.id,
    #         completion_pct=0.0,
    #         total_points=0.0,
    #         earned_points=0.0
    #     )
    #     db.add(progress)
    # ──────────────────────────────────────────────────────────────────────────

    db.commit()
    return {"message": "Successfully enrolled in course", "enrolled": True}


# ─────────────────────────────────────────────────────────────────────────────
# /me/courses  — uses new Segment / HomeworkSubmission model for progress
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/me/courses", response_model=List[EnrolledCourseResponse])
async def get_my_courses(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all courses the student is enrolled in with progress."""
    student_id = current_user.id

    enrolled_course_ids = get_user_enrolled_courses(db, student_id)
    if not enrolled_course_ids:
        return []

    courses = db.query(Course).filter(Course.id.in_(enrolled_course_ids)).all()

    # ── Batch: all units across enrolled courses ───────────────────────────
    all_units = db.query(Unit).filter(Unit.course_id.in_(enrolled_course_ids)).all()
    unit_ids = [u.id for u in all_units]
    units_by_course: Dict[int, List[Unit]] = {}
    for u in all_units:
        units_by_course.setdefault(u.course_id, []).append(u)

    # ── Batch: all segments for these units ───────────────────────────────
    # Segment count per unit is used as a proxy for total_units content depth.
    segments_by_unit: Dict[int, List[Segment]] = {}
    if unit_ids:
        segs = db.query(Segment).filter(Segment.unit_id.in_(unit_ids)).all()
        for s in segs:
            segments_by_unit.setdefault(s.unit_id, []).append(s)

    # ── Batch: homework submissions (new progress model) ──────────────────
    hw_by_unit: Dict[int, UnitHomeworkSubmission] = {}
    if unit_ids:
        hw_rows = db.query(UnitHomeworkSubmission).filter(
            UnitHomeworkSubmission.student_id == student_id,
            UnitHomeworkSubmission.unit_id.in_(unit_ids),
        ).all()
        for hw in hw_rows:
            hw_by_unit[hw.unit_id] = hw

    # ── LEGACY: old per-video / per-task / per-test completion loops ───────
    # These were replaced by the HomeworkSubmission.status field above.
    #
    # # All published videos in these units
    # videos_by_unit: Dict[int, List[Video]] = {}
    # videos = db.query(Video).filter(Video.unit_id.in_(unit_ids), Video.status == VideoStatus.PUBLISHED).all()
    # ...
    # completed_video_ids: Set[int] = set()
    # vp_rows = db.query(VideoProgress).filter(VideoProgress.user_id == student_id, ...).all()
    # ...
    # tasks_by_unit / submitted_task_ids / tests_by_unit / attempts_by_test
    # ──────────────────────────────────────────────────────────────────────

    result = []
    for course in courses:
        course_units  = units_by_course.get(course.id, [])
        total_units   = len(course_units)
        completed_units = 0
        last_accessed   = None

        for unit in course_units:
            hw = hw_by_unit.get(unit.id)

            # Track last_accessed from homework submission
            if hw and hw.updated_at:
                if not last_accessed or hw.updated_at > last_accessed:
                    last_accessed = hw.updated_at

            # A unit is complete when the teacher marks the homework done
            # OR when the student has submitted all segments (status = completed).
            if hw and hw.status in (
                HomeworkSubmissionStatus.COMPLETED,
                HomeworkSubmissionStatus.AWAITING_STUDENT,  # teacher reviewed → student acts
            ):
                completed_units += 1

        progress_percent = (completed_units / total_units * 100) if total_units > 0 else 0.0

        result.append(EnrolledCourseResponse(
            id=course.id,
            title=course.title,
            description=course.description,
            level=course.level,
            thumbnail_url=course.thumbnail_url,
            thumbnail_path=getattr(course, 'thumbnail_path', None),
            units_count=course.units_count,
            published_units_count=total_units,
            progress_percent=round(progress_percent, 1),
            completed_units=completed_units,
            last_accessed_at=last_accessed
        ))

    min_datetime = datetime(1970, 1, 1, tzinfo=timezone.utc)
    result.sort(
        key=lambda x: (x.last_accessed_at if x.last_accessed_at else min_datetime, x.title),
        reverse=True
    )
    return result


# ─────────────────────────────────────────────────────────────────────────────
# /admin/dashboard/statistics — uses new Segment model; legacy Task/Test/Video
# queries replaced with segment/enrollment counts
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/admin/dashboard/statistics", response_model=DashboardStatistics)
async def get_dashboard_statistics(
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Get dashboard statistics for admin panel (new segment-based architecture)."""
    
    now = datetime.now(timezone.utc)
    month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)

    teacher_course_ids = [c.id for c in db.query(Course.id).filter(
        Course.created_by == current_user.id
    ).all()]

    # ── Scalar counts ──────────────────────────────────────────────────────
    courses_count = db.query(func.count(Course.id)).filter(
        Course.created_by == current_user.id
    ).scalar() or 0

    courses_this_month = db.query(func.count(Course.id)).filter(
        Course.created_by == current_user.id,
        Course.created_at >= month_start,
    ).scalar() or 0

    if teacher_course_ids:
        units_count = db.query(func.count(Unit.id)).filter(
            Unit.course_id.in_(teacher_course_ids)
        ).scalar() or 0

        units_this_month = db.query(func.count(Unit.id)).filter(
            Unit.course_id.in_(teacher_course_ids),
            Unit.created_at >= month_start,
        ).scalar() or 0

        # Segments replace the old Videos + Tasks + Tests counts
        unit_ids_for_stats = [u.id for u in db.query(Unit.id).filter(
            Unit.course_id.in_(teacher_course_ids)
        ).all()]

        segments_count = db.query(func.count(Segment.id)).filter(
            Segment.unit_id.in_(unit_ids_for_stats)
        ).scalar() or 0 if unit_ids_for_stats else 0

        segments_this_month = db.query(func.count(Segment.id)).filter(
            Segment.unit_id.in_(unit_ids_for_stats),
            Segment.created_at >= month_start,
        ).scalar() or 0 if unit_ids_for_stats else 0

        # ── LEGACY: old Video / Test counts ───────────────────────────────
        # videos_count = db.query(func.count(Video.id)).join(Unit).filter(
        #     Unit.course_id.in_(teacher_course_ids)
        # ).scalar() or 0
        # videos_this_month = ...
        # tests_count = db.query(func.count(Test.id)).join(Unit).filter(...).scalar() or 0
        # tests_this_month = ...
        # ──────────────────────────────────────────────────────────────────

        # Map to legacy schema fields so the existing DashboardStatistics
        # response schema keeps working without a breaking frontend change.
        videos_count      = segments_count       # segment count reported as "videos"
        videos_this_month = segments_this_month
        tests_count       = 0
        tests_this_month  = 0
    else:
        units_count = 0
        units_this_month = 0
        videos_count = 0
        videos_this_month = 0
        tests_count = 0
        tests_this_month = 0

    # ── Students enrolled in teacher's courses ─────────────────────────────
    if teacher_course_ids:
        enrolled_student_ids = [e.user_id for e in db.query(CourseEnrollment.user_id).filter(
            CourseEnrollment.course_id.in_(teacher_course_ids)
        ).distinct().all()]

        students_count = db.query(func.count(User.id)).filter(
            User.role == UserRole.STUDENT,
            User.id.in_(enrolled_student_ids) if enrolled_student_ids else []
        ).scalar() or 0

        students_this_month = db.query(func.count(User.id)).filter(
            User.role == UserRole.STUDENT,
            User.id.in_(enrolled_student_ids) if enrolled_student_ids else [],
            User.created_at >= month_start,
        ).scalar() or 0
    else:
        students_count = 0
        students_this_month = 0
        enrolled_student_ids = []

    # ── Course-level progress (new: uses HomeworkSubmission) ───────────────
    course_progress    = []
    at_risk_students   = []
    drop_off_points    = []
    students_progress  = []

    pub_courses = db.query(Course).filter(
        Course.created_by == current_user.id,
        Course.status == 'published',
    ).all()

    if pub_courses:
        pub_course_ids   = [c.id for c in pub_courses]
        pub_units        = db.query(Unit).filter(Unit.course_id.in_(pub_course_ids)).all()
        pub_unit_ids     = [u.id for u in pub_units]
        unit_course_map  = {u.id: u.course_id for u in pub_units}
        units_by_cid: Dict[int, List[Unit]] = {}
        for u in pub_units:
            units_by_cid.setdefault(u.course_id, []).append(u)

        # Batch: all homework submissions for these units
        hw_rows: List[UnitHomeworkSubmission] = []
        if pub_unit_ids:
            hw_rows = db.query(UnitHomeworkSubmission).filter(
                UnitHomeworkSubmission.unit_id.in_(pub_unit_ids)
            ).all()

        # Index: course_id → {student_id → list[HomeworkSubmission]}
        hw_by_course_student: Dict[int, Dict[int, List[UnitHomeworkSubmission]]] = {}
        for hw in hw_rows:
            cid = unit_course_map.get(hw.unit_id)
            if cid:
                hw_by_course_student.setdefault(cid, {}).setdefault(hw.student_id, []).append(hw)

        # ── LEGACY: old TaskSubmission / TestAttempt aggregation ───────────
        # all_pub_tasks = db.query(Task).join(Unit).filter(...).all()
        # graded_submissions = db.query(TaskSubmission).filter(...).all()
        # completed_attempts = db.query(TestAttempt).filter(...).all()
        # ... (all replaced by HomeworkSubmission below)
        # ──────────────────────────────────────────────────────────────────

        for course in pub_courses:
            cid          = course.id
            course_units = units_by_cid.get(cid, [])
            total_units  = len(course_units)
            student_map  = hw_by_course_student.get(cid, {})  # student_id → hw list

            enrolled_students = set(student_map.keys())
            total_enrolled    = len(enrolled_students)

            # "Completion" = student has at least one COMPLETED unit homework
            fully_completed = sum(
                1 for sid, hws in student_map.items()
                if any(hw.status == HomeworkSubmissionStatus.COMPLETED for hw in hws)
            )
            completion_rate = (fully_completed / total_enrolled * 100) if total_enrolled > 0 else 0.0

            # Drop-off: units where most students never started homework
            unit_drop_offs = []
            for unit in course_units:
                unit_hw = [hw for hw in hw_rows if hw.unit_id == unit.id]
                started   = {hw.student_id for hw in unit_hw
                             if hw.status != HomeworkSubmissionStatus.NOT_STARTED}
                completed = {hw.student_id for hw in unit_hw
                             if hw.status == HomeworkSubmissionStatus.COMPLETED}
                if started:
                    pct = len(completed) / len(started) * 100
                    if pct < 50:
                        unit_drop_offs.append({
                            "unit_id":         unit.id,
                            "unit_title":      unit.title,
                            "unit_order":      unit.order_index,
                            "completion_rate": round(pct, 1),
                            "started":         len(started),
                            "completed":       len(completed),
                        })
            unit_drop_offs.sort(key=lambda x: x["unit_order"])

            course_progress.append({
                "course_id":       cid,
                "course_title":    course.title,
                "completion_rate": round(completion_rate, 1),
                "avg_test_score":  0.0,   # no test scores in new model yet
                "total_enrolled":  total_enrolled,
                "fully_completed": fully_completed,
                "total_tasks":     0,
                "total_tests":     0,
                "total_units":     total_units,
            })
            for dp in unit_drop_offs:
                drop_off_points.append({"course_id": cid, "course_title": course.title, **dp})

        # ── Student-level progress ─────────────────────────────────────────
        if enrolled_student_ids:
            all_students = db.query(User.id, User.first_name, User.last_name).filter(
                User.role == UserRole.STUDENT,
                User.id.in_(enrolled_student_ids),
            ).all()
        else:
            all_students = []

        # Batch: all hw for enrolled students across teacher's courses
        all_student_hw: List[UnitHomeworkSubmission] = []
        if pub_unit_ids and enrolled_student_ids:
            all_student_hw = db.query(UnitHomeworkSubmission).filter(
                UnitHomeworkSubmission.unit_id.in_(pub_unit_ids),
                UnitHomeworkSubmission.student_id.in_(enrolled_student_ids),
            ).all()

        hw_by_student: Dict[int, List[UnitHomeworkSubmission]] = {}
        for hw in all_student_hw:
            hw_by_student.setdefault(hw.student_id, []).append(hw)

        units_count_by_course = {c.id: len(units_by_cid.get(c.id, [])) for c in pub_courses}

        for student in all_students:
            sid          = student.id
            student_hw   = hw_by_student.get(sid, [])

            student_course_ids: Set[int] = {
                unit_course_map[hw.unit_id]
                for hw in student_hw
                if hw.unit_id in unit_course_map
            }
            courses_enrolled   = len(student_course_ids)
            completed_count    = sum(1 for hw in student_hw if hw.status == HomeworkSubmissionStatus.COMPLETED)
            total_units_in_courses = sum(units_count_by_course.get(cid, 0) for cid in student_course_ids)
            overall_progress   = (completed_count / total_units_in_courses * 100) if total_units_in_courses > 0 else 0.0

            course_details = []
            for cid in student_course_ids:
                course_obj = next((c for c in pub_courses if c.id == cid), None)
                if course_obj:
                    total_u = units_count_by_course.get(cid, 0)
                    done_u  = sum(
                        1 for hw in student_hw
                        if unit_course_map.get(hw.unit_id) == cid
                        and hw.status == HomeworkSubmissionStatus.COMPLETED
                    )
                    course_details.append({
                        "course_id":       cid,
                        "course_title":    course_obj.title,
                        "completed_tasks": done_u,
                        "total_tasks":     total_u,
                        "progress":        round((done_u / total_u * 100) if total_u else 0, 1),
                    })

            students_progress.append({
                "student_id":       sid,
                "student_name":     f"{student.first_name} {student.last_name}",
                "courses_enrolled": courses_enrolled,
                "overall_progress": round(overall_progress, 1),
                "avg_score":        0.0,
                "course_details":   course_details,
            })

            if overall_progress < 30:
                at_risk_students.append({
                    "student_id":    sid,
                    "student_name":  f"{student.first_name} {student.last_name}",
                    "completion_rate": round(overall_progress, 1),
                    "avg_test_score":  0.0,
                    "risk_reason":   "Низкая завершенность",
                })

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
        at_risk_students=at_risk_students[:10],
        drop_off_points=drop_off_points[:10],
        recent_activity=[],
    )


# ─────────────────────────────────────────────────────────────────────────────
# /student/dashboard — new segment-based architecture
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/student/dashboard", response_model=StudentDashboardStats)
async def get_student_dashboard(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get dashboard statistics for the current student (new segment architecture)."""
    student_id = current_user.id

    enrolled_course_ids = get_user_enrolled_courses(db, student_id)
    my_courses_count    = len(enrolled_course_ids)

    # ── Batch: all units the student can access ────────────────────────────
    all_units: List[Unit] = []
    unit_course_map: Dict[int, int] = {}
    units_by_course: Dict[int, List[Unit]] = {}
    if enrolled_course_ids:
        all_units = db.query(Unit).filter(
            Unit.course_id.in_(enrolled_course_ids),
            Unit.status == UnitStatus.PUBLISHED,
        ).all()
        for u in all_units:
            unit_course_map[u.id] = u.course_id
            units_by_course.setdefault(u.course_id, []).append(u)

    enrolled_unit_ids = [u.id for u in all_units]

    # ── Batch: homework submissions (new progress source) ──────────────────
    hw_rows: List[UnitHomeworkSubmission] = []
    hw_by_unit: Dict[int, UnitHomeworkSubmission] = {}
    if enrolled_unit_ids:
        hw_rows = db.query(UnitHomeworkSubmission).filter(
            UnitHomeworkSubmission.student_id == student_id,
            UnitHomeworkSubmission.unit_id.in_(enrolled_unit_ids),
        ).all()
        for hw in hw_rows:
            hw_by_unit[hw.unit_id] = hw

    # ── LEGACY: old Progress / VideoProgress / TaskSubmission / TestAttempt ─
    # All progress tracking has been moved to UnitHomeworkSubmission.
    #
    # progress_records = db.query(Progress).filter(Progress.student_id == student_id).all()
    # all_task_subs = db.query(TaskSubmission).filter(TaskSubmission.student_id == student_id).all()
    # all_test_attempts_raw = db.query(TestAttempt).filter(TestAttempt.student_id == student_id).all()
    # all_vid_progress = db.query(VideoProgress).filter(VideoProgress.user_id == student_id).all()
    # ... (all N+1 loops that followed)
    # ──────────────────────────────────────────────────────────────────────

    # ── Completed units ────────────────────────────────────────────────────
    completed_units_count = sum(
        1 for hw in hw_rows
        if hw.status in (
            HomeworkSubmissionStatus.COMPLETED,
            HomeworkSubmissionStatus.AWAITING_STUDENT,
        )
    )

    # ── Average score — not yet available in new model ─────────────────────
    # Will be added once graded exercise results are stored on HomeworkSubmission.
    average_score = 0.0

    # ── Time spent — derive from hw updated_at timestamps as a rough proxy ─
    time_spent_hours = 0.0
    for hw in hw_rows:
        if hw.submitted_for_review_at and hw.updated_at:
            delta = hw.updated_at - hw.submitted_for_review_at
            time_spent_hours += max(delta.total_seconds() / 3600.0, 0)

    # ── Recent activity from homework submissions ──────────────────────────
    recent_activity = []
    sorted_hw = sorted(
        hw_rows,
        key=lambda h: h.updated_at or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )[:10]

    if sorted_hw:
        unit_ids_for_activity = [hw.unit_id for hw in sorted_hw]
        units_map = {u.id: u for u in db.query(Unit).filter(Unit.id.in_(unit_ids_for_activity)).all()}
        course_ids_for_activity = list({u.course_id for u in units_map.values() if u.course_id})
        courses_map = {c.id: c for c in db.query(Course).filter(Course.id.in_(course_ids_for_activity)).all()}

        status_label = {
            HomeworkSubmissionStatus.NOT_STARTED:        "не начато",
            HomeworkSubmissionStatus.IN_PROGRESS:        "в процессе",
            HomeworkSubmissionStatus.SUBMITTED_FOR_REVIEW: "на проверке",
            HomeworkSubmissionStatus.AWAITING_STUDENT:   "ожидает студента",
            HomeworkSubmissionStatus.COMPLETED:          "завершено",
        }
        for hw in sorted_hw:
            unit   = units_map.get(hw.unit_id)
            course = courses_map.get(unit.course_id) if unit else None
            recent_activity.append({
                "type":        "homework",
                "title":       unit.title if unit else "Unknown Unit",
                "description": f"Домашнее задание «{unit.title if unit else '?'}»",
                "unit_title":  unit.title if unit else "Unknown Unit",
                "course_title": course.title if course else "Unknown Course",
                "date":        hw.updated_at,
                "status":      status_label.get(hw.status, str(hw.status)),
            })

    # ── Last activity ──────────────────────────────────────────────────────
    last_activity = None
    if recent_activity:
        la = recent_activity[0]
        last_activity = {
            "type":        la["type"],
            "title":       la.get("unit_title", "Unknown"),
            "description": la.get("description", ""),
            "date":        la["date"],
        }

    # ── Upcoming deadlines (unit-level, from Unit.settings if present) ─────
    # Legacy Task/Test deadline queries removed. Units can store a deadline
    # in settings JSONB if needed — not yet implemented in the new editor.
    upcoming_deadlines: List[Dict] = []

    # ── LEGACY: old Task/Test deadline loops ──────────────────────────────
    # upcoming_tasks = db.query(Task).filter(Task.status == TaskStatus.PUBLISHED, ...).all()
    # all_pub_tests_deadline = db.query(Test).filter(Test.status == TestStatus.PUBLISHED).all()
    # ──────────────────────────────────────────────────────────────────────

    # ── Recommended courses ────────────────────────────────────────────────
    student_course_ids = set(enrolled_course_ids)
    all_pub_courses = db.query(Course).filter(
        Course.status == CourseStatus.PUBLISHED,
        Course.is_visible_to_students == True,  # noqa: E712
    ).all()

    recommended_courses = []
    for course in all_pub_courses:
        if course.id not in student_course_ids:
            recommended_courses.append({
                "id":            course.id,
                "title":         course.title,
                "description":   course.description,
                "level":         course.level.value if hasattr(course.level, 'value') else str(course.level),
                "thumbnail_url": course.thumbnail_url,
                "thumbnail_path": getattr(course, 'thumbnail_path', None),
                "units_count":   course.published_units_count,
            })
    recommended_courses.sort(key=lambda x: x.get("order_index", 999))
    recommended_courses = recommended_courses[:2]

    # ── Active course progress ─────────────────────────────────────────────
    active_course_progress = None
    if enrolled_course_ids:
        # Find the most recently touched course via homework submissions
        latest_hw = max(
            hw_rows,
            key=lambda h: h.updated_at or datetime.min.replace(tzinfo=timezone.utc),
            default=None,
        )
        most_recent_course_id = (
            unit_course_map.get(latest_hw.unit_id) if latest_hw else None
        ) or enrolled_course_ids[0]

        course = db.query(Course).filter(Course.id == most_recent_course_id).first()
        if course:
            active_units = units_by_course.get(course.id, [])
            if active_units:
                # Pick the first incomplete unit as the active one
                active_unit = next(
                    (u for u in active_units
                     if hw_by_unit.get(u.id) and
                     hw_by_unit[u.id].status not in (HomeworkSubmissionStatus.COMPLETED,)),
                    active_units[0],
                )
                active_hw   = hw_by_unit.get(active_unit.id)
                unit_segs   = db.query(Segment).filter(
                    Segment.unit_id == active_unit.id
                ).all()
                total_segs  = len(unit_segs)

                # Completion proxy: count media_blocks marked done in hw.answers
                answers      = (active_hw.answers or {}) if active_hw else {}
                done_blocks  = sum(
                    1 for v in answers.values()
                    if isinstance(v, dict) and v.get("completed")
                )
                progress_pct = round((done_blocks / total_segs * 100), 1) if total_segs > 0 else 0.0

                active_course_progress = {
                    "course_id":        course.id,
                    "course_title":     course.title,
                    "unit_id":          active_unit.id,
                    "unit_title":       active_unit.title,
                    "progress_percent": progress_pct,
                    "completed_videos": 0,
                    "total_videos":     total_segs,
                    "completed_tasks":  done_blocks,
                    "total_tasks":      total_segs,
                    "passed_tests":     0,
                    "total_tests":      0,
                }

    # ── LEGACY: latest_video_watched (VideoProgress) ───────────────────────
    # latest_video_watched was populated from VideoProgress model.
    # In the new architecture videos are video_embed blocks inside Segments;
    # watch state is stored in HomeworkSubmission.answers JSONB.
    # Set to None until the new player sends per-block completion events.
    latest_video_watched = None

    # latest_vp = db.query(VideoProgress).filter(VideoProgress.user_id == student_id) ...
    # ──────────────────────────────────────────────────────────────────────

    return StudentDashboardStats(
        my_courses_count=my_courses_count,
        completed_units=completed_units_count,
        average_score=average_score,
        time_spent_hours=round(time_spent_hours, 1),
        recent_activity=recent_activity,
        upcoming_deadlines=upcoming_deadlines,
        recommended_courses=recommended_courses,
        last_activity=last_activity,
        latest_video_watched=latest_video_watched,
        active_course_progress=active_course_progress,
    )