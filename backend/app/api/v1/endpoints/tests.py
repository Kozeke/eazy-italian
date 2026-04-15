from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_
from typing import List, Dict, Any, Optional
from datetime import datetime
import os
import uuid
import logging

logger = logging.getLogger(__name__)
from app.core.database import get_db
from app.core.auth import get_current_user, get_current_teacher
from app.core.enrollment_guard import check_unit_access
from app.models.user import User, UserRole
from app.models.test import Test, TestStatus
from app.models.unit import Unit
from app.models.video import Video
from app.models.task import Task
from app.schemas.test import TestResponse, TestCreate, TestUpdate
from app.services.grading_service import grade_question, aggregate_results, GradingResult

router = APIRouter()

def get_uploads_path():
    """Get the uploads directory path - same logic as main.py"""
    current_file = os.path.abspath(__file__)
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(current_file)))))
    
    # Check if we're in Docker
    is_docker = (os.name != 'nt' and
                 os.path.exists("/app") and 
                 os.getcwd() == "/app" and 
                 backend_dir == "/app")
    
    if is_docker:
        return "/app/uploads"
    else:
        return os.path.join(backend_dir, "uploads")

@router.get("", response_model=List[TestResponse])
@router.get("/", response_model=List[TestResponse])
def get_tests(
    unit_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100
):
    """Get tests, optionally filtered by unit_id - teachers only see their own tests"""
    from app.models.test import TestQuestion
    
    query = db.query(Test).options(
        joinedload(Test.unit).joinedload(Unit.course),
        joinedload(Test.test_questions)
    )
    
    # If user is a teacher, only show their own tests
    if current_user.role == UserRole.TEACHER:
        query = query.filter(Test.created_by == current_user.id)
    
    if unit_id is not None:
        query = query.filter(Test.unit_id == unit_id)
    
    tests = query.offset(skip).limit(limit).all()
    
    # Convert to response format with course information
    result = []
    for test in tests:
        test_dict = {
            "id": test.id,
            "title": test.title,
            "description": test.description,
            "instructions": test.instructions,
            "time_limit_minutes": test.time_limit_minutes,
            "passing_score": test.passing_score,
            "status": test.status,
            "publish_at": test.publish_at,
            "order_index": test.order_index,
            "settings": test.settings,
            "unit_id": test.unit_id,
            "created_by": test.created_by,
            "created_at": test.created_at,
            "updated_at": test.updated_at,
            "course_id": test.unit.course_id if test.unit and test.unit.course else None,
            "course_title": test.unit.course.title if test.unit and test.unit.course else None,
            "unit_title": test.unit.title if test.unit else None,
            "questions_count": len(test.test_questions) if test.test_questions else 0
        }
        result.append(TestResponse(**test_dict))
    
    return result

@router.post("/", response_model=TestResponse, status_code=status.HTTP_201_CREATED)
def create_test(
    test_data: TestCreate,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Create a new test"""
    test = Test(
        unit_id=test_data.unit_id,
        title=test_data.title,
        description=test_data.description,
        instructions=test_data.instructions,
        time_limit_minutes=test_data.time_limit_minutes,
        passing_score=test_data.passing_score,
        status=test_data.status,
        publish_at=test_data.publish_at,
        order_index=test_data.order_index,
        settings=test_data.settings,
        created_by=current_user.id
    )
    
    db.add(test)
    db.commit()
    db.refresh(test)
    
    return test

@router.get("/{test_id}", response_model=TestResponse)
def get_test(
    test_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific test - requires enrollment if test belongs to a course (teachers bypass this check)"""
    query = db.query(Test).options(
        joinedload(Test.unit).joinedload(Unit.course)
    ).filter(Test.id == test_id)
    
    # If user is a teacher, only show their own tests
    if current_user.role == UserRole.TEACHER:
        query = query.filter(Test.created_by == current_user.id)
    
    test = query.first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    
    # Check enrollment if test belongs to a unit with a course
    # Teachers can access any test for editing purposes
    if test.unit_id and current_user.role != UserRole.TEACHER:
        check_unit_access(db, current_user, test.unit_id)
    
    # Convert to response format with course information
    test_dict = {
        "id": test.id,
        "title": test.title,
        "description": test.description,
        "instructions": test.instructions,
        "time_limit_minutes": test.time_limit_minutes,
        "passing_score": test.passing_score,
        "status": test.status,
        "publish_at": test.publish_at,
        "order_index": test.order_index,
        "settings": test.settings,
        "unit_id": test.unit_id,
        "created_by": test.created_by,
        "created_at": test.created_at,
        "updated_at": test.updated_at,
        "course_id": test.unit.course_id if test.unit and test.unit.course else None,
        "course_title": test.unit.course.title if test.unit and test.unit.course else None
    }
    return TestResponse(**test_dict)

@router.put("/{test_id}", response_model=TestResponse)
def update_test(
    test_id: int,
    test_data: TestUpdate,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Update a test - only if created by current teacher"""
    test = db.query(Test).filter(
        Test.id == test_id,
        Test.created_by == current_user.id
    ).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    
    # Check if status is being changed to PUBLISHED
    update_dict = test_data.dict(exclude_unset=True)
    new_status = update_dict.get('status')
    if new_status == TestStatus.PUBLISHED:
        from app.models.test import TestQuestion
        question_count = db.query(TestQuestion).filter(TestQuestion.test_id == test_id).count()
        if question_count == 0:
            raise HTTPException(
                status_code=400,
                detail="Cannot publish test without questions. Please add at least one question first."
            )
    
    # Update fields
    for field, value in test_data.dict(exclude_unset=True).items():
        setattr(test, field, value)
    
    db.commit()
    db.refresh(test)
    
    return test

@router.delete("/{test_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_test(
    test_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Delete a test - only if created by current teacher"""
    test = db.query(Test).filter(
        Test.id == test_id,
        Test.created_by == current_user.id
    ).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    
    db.delete(test)
    db.commit()
    
    return None

# Resource APIs for Test Creation
@router.get("/resources/units", response_model=List[Dict[str, Any]])
def get_units_for_test_creation(
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """
    Get list of units for test creation - only units in teacher's courses
    Returns: [{ id, title, level, status }]
    """
    from app.models.course import Course
    # Get teacher's course IDs
    teacher_course_ids = [c.id for c in db.query(Course.id).filter(
        Course.created_by == current_user.id
    ).all()]
    
    if not teacher_course_ids:
        return []
    
    units = db.query(Unit).filter(Unit.course_id.in_(teacher_course_ids)).all()
    return [
        {
            "id": unit.id,
            "title": unit.title,
            "level": unit.level,
            "status": unit.status.value,
            "slug": unit.slug
        }
        for unit in units
    ]

@router.get("/resources/videos", response_model=List[Dict[str, Any]])
def get_videos_for_test_creation(
    unit_id: int = None,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """
    Get list of videos for test creation - only videos created by teacher
    Optional filter by unit_id
    Returns: [{ id, title, unit_id, unit_title, status, duration }]
    """
    query = db.query(Video).filter(Video.created_by == current_user.id)
    if unit_id:
        query = query.filter(Video.unit_id == unit_id)
    
    videos = query.all()
    return [
        {
            "id": video.id,
            "title": video.title,
            "unit_id": video.unit_id,
            "unit_title": video.unit.title if video.unit else None,
            "status": video.status.value,
            "duration": video.duration_sec,
            "source_type": video.source_type.value
        }
        for video in videos
    ]

@router.get("/resources/tasks", response_model=List[Dict[str, Any]])
def get_tasks_for_test_creation(
    unit_id: int = None,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """
    Get list of all tasks for test creation
    Optional filter by unit_id
    Returns: [{ id, title, unit_id, unit_title, type, status, max_score }]
    """
    query = db.query(Task)
    if unit_id:
        query = query.filter(Task.unit_id == unit_id)
    
    tasks = query.all()
    return [
        {
            "id": task.id,
            "title": task.title,
            "unit_id": task.unit_id,
            "unit_title": task.unit.title if task.unit else None,
            "type": task.type.value,
            "status": task.status.value,
            "max_score": task.max_score
        }
        for task in tasks
    ]

@router.get("/resources/students", response_model=List[Dict[str, Any]])
def get_students_for_test_assignment(
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """
    Get list of students for test assignment - only students enrolled in teacher's courses
    Returns: [{ id, email, first_name, last_name, full_name }]
    """
    from app.models.user import UserRole
    from app.models.course import Course
    from app.models.enrollment import CourseEnrollment
    
    # Get teacher's course IDs
    teacher_course_ids = [c.id for c in db.query(Course.id).filter(
        Course.created_by == current_user.id
    ).all()]
    
    if not teacher_course_ids:
        return []
    
    # Get student IDs enrolled in teacher's courses
    enrolled_student_ids = [e.user_id for e in db.query(CourseEnrollment.user_id).filter(
        CourseEnrollment.course_id.in_(teacher_course_ids)
    ).distinct().all()]
    
    if not enrolled_student_ids:
        return []
    
    students = db.query(User).filter(
        and_(
            User.role == UserRole.STUDENT,
            User.id.in_(enrolled_student_ids)
        )
    ).all()
    return [
        {
            "id": student.id,
            "email": student.email,
            "first_name": student.first_name,
            "last_name": student.last_name,
            "full_name": f"{student.first_name} {student.last_name}".strip()
        }
        for student in students
    ]

@router.get("/resources/all", response_model=Dict[str, List[Dict[str, Any]]])
def get_all_resources_for_test_creation(
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """
    Get all resources in one request for test creation
    Returns: { units: [...], videos: [...], tasks: [...], students: [...] }
    """
    from app.models.user import UserRole
    
    # Get all units
    units = db.query(Unit).all()
    units_list = [
        {
            "id": unit.id,
            "title": unit.title,
            "level": unit.level,
            "status": unit.status.value,
            "slug": unit.slug
        }
        for unit in units
    ]
    
    # Get all videos
    videos = db.query(Video).all()
    videos_list = [
        {
            "id": video.id,
            "title": video.title,
            "unit_id": video.unit_id,
            "unit_title": video.unit.title if video.unit else None,
            "status": video.status.value,
            "duration": video.duration_sec,
            "source_type": video.source_type.value
        }
        for video in videos
    ]
    
    # Get all tasks
    tasks = db.query(Task).all()
    tasks_list = [
        {
            "id": task.id,
            "title": task.title,
            "unit_id": task.unit_id,
            "unit_title": task.unit.title if task.unit else None,
            "type": task.type.value,
            "status": task.status.value,
            "max_score": task.max_score
        }
        for task in tasks
    ]
    
    # Get all students
    students = db.query(User).filter(User.role == UserRole.STUDENT).all()
    students_list = [
        {
            "id": student.id,
            "email": student.email,
            "first_name": student.first_name,
            "last_name": student.last_name,
            "full_name": f"{student.first_name} {student.last_name}".strip()
        }
        for student in students
    ]
    
    return {
        "units": units_list,
        "videos": videos_list,
        "tasks": tasks_list,
        "students": students_list
    }

# Question management endpoints
@router.post("/questions/upload-image")
async def upload_question_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_teacher)
):
    """Upload an image for a visual question"""
    
    # Allowed image MIME types
    allowed_mime_types = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp'
    ]
    
    # Allowed file extensions
    allowed_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
    
    # Validate file type
    if not file.content_type:
        if file.filename:
            file_ext = os.path.splitext(file.filename)[1].lower()
            if file_ext not in allowed_extensions:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid file type. Allowed formats: {', '.join(allowed_extensions)}"
                )
        else:
            raise HTTPException(status_code=400, detail="File type could not be determined")
    elif file.content_type not in allowed_mime_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed formats: JPEG, PNG, GIF, WebP"
        )
    
    # Get uploads path
    uploads_path = get_uploads_path()
    questions_dir = os.path.join(uploads_path, "questions", str(current_user.id))
    os.makedirs(questions_dir, exist_ok=True)
    
    # Generate filename
    file_ext = os.path.splitext(file.filename or 'image.jpg')[1] or '.jpg'
    filename = f"{uuid.uuid4().hex[:16]}{file_ext}"
    file_path = os.path.join(questions_dir, filename)
    
    # Save file
    try:
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Return relative path for storage in database
        # Path will be: questions/{user_id}/{filename}
        relative_path = f"questions/{current_user.id}/{filename}"
        
        return {
            "message": "Image uploaded successfully",
            "path": relative_path,
            "url": f"/api/v1/static/{relative_path}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uploading image: {str(e)}")

@router.post("/{test_id}/questions", status_code=status.HTTP_201_CREATED)
@router.post("/{test_id}/questions", status_code=status.HTTP_201_CREATED)
def add_question_to_test(
    test_id: int,
    question_data: Dict[str, Any],
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    """
    Add a question to a test (test must belong to current teacher).
 
    Accepted question types (first wave):
      multiple_choice, true_false, cloze_input, cloze_drag,
      matching_pairs, ordering_words, ordering_sentences, open_answer
 
    Legacy types still accepted: cloze, visual
    (cloze is silently remapped to cloze_input)
    """
    from app.models.test import Question, TestQuestion, QuestionType
    from app.services.question_service import (
        build_question_from_schema,
        normalise_type,
    )
    from app.schemas.question import (
        MultipleChoiceQuestionCreate,
        TrueFalseQuestionCreate,
        ClozeInputQuestionCreate,
        ClozeDragQuestionCreate,
        MatchingPairsQuestionCreate,
        OrderingWordsQuestionCreate,
        OrderingSentencesQuestionCreate,
        OpenAnswerQuestionCreate,
    )
 
    # ── 1. Authorise ──────────────────────────────────────────────────────────
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    if test.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this test")
 
    # ── 2. Resolve level ─────────────────────────────────────────────────────
    level = question_data.get("level")
    if not level and test.unit_id:
        unit = db.query(Unit).filter(Unit.id == test.unit_id).first()
        if unit and unit.level:
            level = unit.level.value if hasattr(unit.level, "value") else unit.level
    if not level:
        raise HTTPException(
            status_code=400,
            detail="Question level is required. Provide 'level' or ensure the test has a unit with a level.",
        )
 
    # ── 3. Normalise type string ──────────────────────────────────────────────
    raw_type = question_data.get("type", "")
    canonical_type = normalise_type(raw_type)
 
    # Inject canonical type + prompt_rich alias so schemas validate cleanly
    payload = dict(question_data)
    payload["type"] = canonical_type
    payload["level"] = level
    # Support both "prompt" and "prompt_rich" as input keys
    if "prompt" in payload and "prompt_rich" not in payload:
        payload["prompt_rich"] = payload["prompt"]
 
    # ── 4. Typed-schema path (first-wave types) ───────────────────────────────
    _TYPED_SCHEMA_MAP = {
        "multiple_choice":    MultipleChoiceQuestionCreate,
        "true_false":         TrueFalseQuestionCreate,
        "cloze_input":        ClozeInputQuestionCreate,
        "cloze_drag":         ClozeDragQuestionCreate,
        "matching_pairs":     MatchingPairsQuestionCreate,
        "ordering_words":     OrderingWordsQuestionCreate,
        "ordering_sentences": OrderingSentencesQuestionCreate,
        "open_answer":        OpenAnswerQuestionCreate,
    }
 
    schema_cls = _TYPED_SCHEMA_MAP.get(canonical_type)
 
    if schema_cls is not None:
        try:
            schema = schema_cls(**payload)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        question = build_question_from_schema(schema, current_user.id, level_fallback=level)
 
    else:
        # ── 5. Legacy path (visual, matching, ordering, etc.) ─────────────────
        try:
            question_type_enum = QuestionType(canonical_type)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid question type: {raw_type}. Valid types: {[e.value for e in QuestionType]}",
            )
 
        qt = question_type_enum.value
        question = Question(
            type=question_type_enum,
            prompt_rich=question_data.get("prompt") or question_data.get("prompt_rich", ""),
            points=question_data.get("score", 1.0),
            autograde=question_data.get("autograde", True),
            question_metadata=question_data.get("metadata", {}),
            level=level,
            created_by=current_user.id,
        )
 
        if qt == "visual":
            answer_type = question_data.get("answer_type", "multiple_choice")
            meta = dict(question_data.get("metadata", {}))
            meta["answer_type"] = answer_type
            question.question_metadata = meta
            question.media = question_data.get("media", [])
            if answer_type in ("multiple_choice", "single_choice"):
                question.options = question_data.get("options", [])
                question.correct_answer = {"correct_option_ids": question_data.get("correct_option_ids", [])}
                question.shuffle_options = question_data.get("shuffle_options", True)
            elif answer_type == "open_answer":
                question.expected_answer_config = question_data.get("expected", {})
                question.correct_answer = {"expected": question_data.get("expected", {})}
            elif answer_type == "true_false":
                question.options = [{"id": "true", "text": "True"}, {"id": "false", "text": "False"}]
                question.correct_answer = {"correct_option_ids": question_data.get("correct_option_ids", [])}
        else:
            # Absolute fallback — store raw correct_answer if provided
            question.correct_answer = question_data.get("correct_answer", {})
 
    # ── 6. Persist ────────────────────────────────────────────────────────────
    db.add(question)
    db.flush()
 
    max_order = db.query(TestQuestion).filter(TestQuestion.test_id == test_id).count()
    test_question = TestQuestion(
        test_id=test_id,
        question_id=question.id,
        order_index=max_order,
        points=question_data.get("score", 1.0),
    )
    db.add(test_question)
    db.commit()
    db.refresh(question)
 
    return {"id": question.id, "message": "Question added successfully"}

@router.get("/{test_id}/questions")
def get_test_questions(
    test_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Get all questions for a test with ordering"""
    from app.models.test import TestQuestion
    
    # Get test and verify access
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    
    if test.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this test")
    
    # Get test questions with ordering
    test_questions = db.query(TestQuestion).filter(
        TestQuestion.test_id == test_id
    ).order_by(TestQuestion.order_index).all()
    
    total_points = sum(tq.points or tq.question.points for tq in test_questions)
    
    return {
        "test_id": test_id,
        "total_questions": len(test_questions),
        "total_points": total_points,
        "questions": [
            {
                "id": tq.id,
                "test_id": tq.test_id,
                "question_id": tq.question_id,
                "order_index": tq.order_index,
                "points": tq.points,
                "question": {
                    "id": tq.question.id,
                    "type": tq.question.type.value,
                    "prompt_rich": tq.question.prompt_rich,
                    "options": tq.question.options,
                    "correct_answer": tq.question.correct_answer,
                    "points": tq.question.points,
                    "shuffle_options": tq.question.shuffle_options,
                    "autograde": tq.question.autograde,
                    "manual_review_threshold": tq.question.manual_review_threshold,
                    "expected_answer_config": tq.question.expected_answer_config,
                    "gaps_config": tq.question.gaps_config,
                    "question_metadata": tq.question.question_metadata,
                    "level": tq.question.level,
                    "created_at": tq.question.created_at.isoformat() if tq.question.created_at else None,
                    "updated_at": tq.question.updated_at.isoformat() if tq.question.updated_at else None,
                }
            }
            for tq in test_questions
        ]
    }

@router.patch("/{test_id}/publish")
def publish_test_endpoint(
    test_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Publish a test (change status from DRAFT to PUBLISHED)"""
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    
    if test.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this test")
    
    from app.models.test import TestQuestion
    question_count = db.query(TestQuestion).filter(TestQuestion.test_id == test_id).count()
    
    if question_count == 0:
        raise HTTPException(status_code=400, detail="Cannot publish test without questions")
    
    test.status = TestStatus.PUBLISHED
    db.commit()
    db.refresh(test)
    
    return {
        "test_id": test_id,
        "status": test.status.value,
        "question_count": question_count,
        "message": "Test published successfully"
    }

# Student Test Endpoints

@router.post("/{test_id}/start")
def start_test(
    test_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Start a test attempt for a student - requires enrollment if test belongs to a course"""
    from app.models.test import TestAttempt, AttemptStatus, TestQuestion
    
    # Get test and verify it exists and is published
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    
    if test.status != TestStatus.PUBLISHED:
        raise HTTPException(status_code=400, detail="Test is not published")
    
    # Check enrollment if test belongs to a unit with a course
    if test.unit_id:
        check_unit_access(db, current_user, test.unit_id)
    
    # Check for existing active attempt
    active_attempt = db.query(TestAttempt).filter(
        and_(
            TestAttempt.test_id == test_id,
            TestAttempt.student_id == current_user.id,
            TestAttempt.status == AttemptStatus.IN_PROGRESS
        )
    ).first()
    
    if active_attempt:
        # Return existing active attempt instead of creating a new one
        attempt = active_attempt
    else:
        # Check max attempts (only count completed attempts)
        if test.settings and test.settings.get('max_attempts'):
            attempts_count = db.query(TestAttempt).filter(
                and_(
                    TestAttempt.test_id == test_id,
                    TestAttempt.student_id == current_user.id,
                    TestAttempt.status == AttemptStatus.COMPLETED
                )
            ).count()
            
            if attempts_count >= test.settings['max_attempts']:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Maximum attempts ({test.settings['max_attempts']}) reached"
                )
        
        # Create new attempt only if no active attempt exists
        attempt = TestAttempt(
            test_id=test_id,
            student_id=current_user.id,
            status=AttemptStatus.IN_PROGRESS
        )
        db.add(attempt)
        db.commit()
        db.refresh(attempt)
    
    # Get questions for this test
    test_questions = db.query(TestQuestion).options(
        joinedload(TestQuestion.question)
    ).filter(TestQuestion.test_id == test_id).order_by(TestQuestion.order_index).all()
    
    # Shuffle questions if needed
    questions_list = test_questions
    if test.settings and test.settings.get('shuffle_questions'):
        import random
        questions_list = random.sample(test_questions, len(test_questions))
    
    # Format questions for frontend
    logger.info(f"[DEBUG] Formatting {len(questions_list)} questions for test {test_id}")
    questions_data = []
    for tq in questions_list:
        q = tq.question
        question_data = {
            "id": q.id,
            "type": q.type.value,
            "prompt": q.prompt_rich,
            "score": tq.points,
        }
        
        # Include media (images, audio) if present
        # For visual questions, always include media field (even if empty)
        is_visual = q.type.value == "visual" or q.type.name == "VISUAL"
        logger.info(f"[DEBUG] Question {q.id}: type = {q.type}, type.value = {q.type.value}, type.name = {q.type.name}, is_visual = {is_visual}")
        if is_visual:
            logger.info(f"[DEBUG] Visual question {q.id}: media = {q.media}, type = {type(q.media)}, has media = {bool(q.media)}, len = {len(q.media) if q.media else 0}")
        if is_visual:
            # Always include media for visual questions
            media_data = q.media if q.media is not None else []
            if isinstance(media_data, list) and len(media_data) > 0:
                # Convert media paths to full URLs
                media_list = []
                for media_item in media_data:
                    if isinstance(media_item, dict):
                        media_dict = media_item.copy()
                        # If URL is a relative path, convert to full URL
                        if media_dict.get("url") and not media_dict["url"].startswith("http"):
                            # Ensure it starts with /api/v1/static
                            if not media_dict["url"].startswith("/api/v1/static"):
                                media_dict["url"] = f"/api/v1/static/{media_dict.get('path', media_dict.get('url', ''))}"
                        elif media_dict.get("path") and not media_dict.get("url"):
                            # If only path is provided, construct URL
                            media_dict["url"] = f"/api/v1/static/{media_dict['path']}"
                        media_list.append(media_dict)
                    else:
                        # Handle case where media is stored as a simple string/path
                        media_list.append({
                            "type": "image",
                            "path": str(media_item),
                            "url": f"/api/v1/static/{media_item}"
                        })
                question_data["media"] = media_list
            else:
                # For visual questions without media, include empty array
                question_data["media"] = []
            
            # Visual questions can have different answer types
            answer_type = q.question_metadata.get("answer_type", "multiple_choice") if q.question_metadata else "multiple_choice"
            question_data["answer_type"] = answer_type
            
            if answer_type in ["multiple_choice", "single_choice"]:
                options = q.options or []
                # Shuffle options if needed
                if test.settings and test.settings.get('shuffle_options') and q.shuffle_options:
                    import random
                    options = random.sample(options, len(options))
                question_data['options'] = options
        elif q.type.value == 'multiple_choice':
            options = q.options or []
            # Shuffle options if needed
            if test.settings and test.settings.get('shuffle_options') and q.shuffle_options:
                import random
                options = random.sample(options, len(options))
            question_data['options'] = options
        elif q.type.value == 'cloze':
            # Don't send answers, just the prompt with gaps
            question_data['gaps_count'] = len(q.gaps_config or [])
        
        questions_data.append(question_data)
    
    return {
        "attempt_id": attempt.id,
        "test_id": test_id,
        "test_title": test.title,
        "time_limit_minutes": test.time_limit_minutes,
        "started_at": attempt.started_at,
        "questions": questions_data,
        "total_points": sum(tq.points for tq in test_questions)
    }

@router.post("/{test_id}/submit")
def submit_test(
    test_id: int,
    answers: dict,          # FastAPI injects Dict[str, Any] from JSON body
    current_user,           # User = Depends(get_current_user)
    db,                     # Session = Depends(get_db)
):
    """
    Submit test answers and calculate score.
 
    Router is intentionally thin:
      1. Validate request context (enrollment, active attempt).
      2. Load attempt + questions.
      3. Delegate per-question grading to grading_service.grade_question().
      4. Aggregate totals.
      5. Persist and return response.
    """
    from datetime import timezone
    from app.models.test import TestAttempt, AttemptStatus, TestQuestion
    from sqlalchemy import and_
    from sqlalchemy.orm import joinedload
    from app.services.grading_service import grade_question as svc_grade, aggregate_results
 
    # ── 1. Guard checks ───────────────────────────────────────────────────────
 
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
 
    if test.unit_id:
        check_unit_access(db, current_user, test.unit_id)
 
    attempt = (
        db.query(TestAttempt)
        .filter(
            and_(
                TestAttempt.test_id == test_id,
                TestAttempt.student_id == current_user.id,
                TestAttempt.status == AttemptStatus.IN_PROGRESS,
            )
        )
        .order_by(TestAttempt.started_at.desc())
        .first()
    )
    if not attempt:
        raise HTTPException(status_code=404, detail="No active test attempt found")
 
    # ── 2. Load questions ─────────────────────────────────────────────────────
 
    test_questions = (
        db.query(TestQuestion)
        .options(joinedload(TestQuestion.question))
        .filter(TestQuestion.test_id == test_id)
        .all()
    )
 
    submitted_answers = _extract_answers(answers)
    logger.info(f"[submit_test] test_id={test_id} submitted_answers keys={list(submitted_answers.keys())}")
 
    # ── 3. Grade each question via the service ────────────────────────────────
 
    from app.services.grading_service import GradingResult
 
    results_detail: dict = {}
    grading_results: dict[str, GradingResult] = {}
 
    for tq in test_questions:
        q = tq.question
        question_id = str(q.id)
        max_pts = tq.points
 
        student_answer = submitted_answers.get(question_id)
 
        # Delegate entirely to grading service (handles all types + fallback)
        result: GradingResult = svc_grade(q, student_answer, max_pts)
 
        grading_results[question_id] = result
 
        logger.info(
            f"[submit_test] q={question_id} type={q.type.value} "
            f"mode={result.grading_mode} correct={result.is_correct} "
            f"score={result.score}/{max_pts} fallback={result.used_fallback}"
        )
 
        # Build per-question result payload (backward-compatible shape)
        question_payload = {
            "id": q.id,
            "type": q.type.value,
            "prompt": q.prompt_rich,
            "points": max_pts,
            "options": q.options or [],
            "correct_answer": q.correct_answer,
            "expected_answer_config": q.expected_answer_config,
            "gaps_config": q.gaps_config,
            "explanation": q.explanation_rich,
        }
 
        results_detail[question_id] = {
            "question_id": q.id,
            "student_answer": student_answer,
            "is_correct": result.is_correct,
            "points_earned": result.score,
            "points_possible": max_pts,
            "grading_mode": result.grading_mode,
            "used_fallback": result.used_fallback,
            "question": question_payload,
            # Include rich grading metadata (gap breakdowns, keyword ratios, etc.)
            # so teacher review tools can surface it without re-grading.
            **({"grading_metadata": result.metadata} if result.metadata else {}),
        }
 
    # ── 4. Aggregate ──────────────────────────────────────────────────────────
 
    totals = aggregate_results(grading_results, test.passing_score)
    total_score = totals["total_earned"]
    max_score = totals["total_possible"]
    percentage = totals["percentage"]
    passed = totals["passed"]
 
    # ── 5. Persist ────────────────────────────────────────────────────────────
 
    submitted_at = __import__("datetime").datetime.now(timezone.utc)
    attempt.submitted_at = submitted_at
    attempt.score = percentage
    attempt.detail = results_detail
    attempt.status = AttemptStatus.COMPLETED
 
    # Time taken
    time_taken_seconds = 0
    if attempt.started_at:
        started = (
            attempt.started_at.replace(tzinfo=timezone.utc)
            if attempt.started_at.tzinfo is None
            else attempt.started_at
        )
        time_taken_seconds = int((submitted_at - started).total_seconds())
 
    db.commit()
    db.refresh(attempt)
 
    # Notify (best-effort)
    from app.services.notification_service import notify_test_completed
    try:
        notify_test_completed(db, current_user.id, test_id, test.title, percentage, passed)
    except Exception as exc:
        logger.warning(f"[submit_test] notification failed: {exc}")
 
    # Remaining attempts
    attempts_remaining = None
    if test.settings and test.settings.get("max_attempts"):
        completed_count = db.query(TestAttempt).filter(
            and_(
                TestAttempt.test_id == test_id,
                TestAttempt.student_id == current_user.id,
                TestAttempt.status == AttemptStatus.COMPLETED,
            )
        ).count()
        attempts_remaining = test.settings["max_attempts"] - completed_count
 
    return {
        "attempt_id": attempt.id,
        "score": percentage,
        "passed": passed,
        "points_earned": total_score,
        "points_possible": max_score,
        "results": results_detail if test.settings.get("show_results_immediately", True) else None,
        "submitted_at": attempt.submitted_at,
        "time_taken_seconds": time_taken_seconds,
        "attempts_remaining": attempts_remaining,
        # New: surface whether any questions need teacher review
        "requires_manual_review": totals.get("requires_manual_review", False),
    }

def _extract_answers(raw: dict) -> dict:
    """
    Unwrap the (possibly double-nested) answers payload.
 
    Frontend sends one of:
      {"answers": {question_id: answer}}
      {"answers": {"answers": {question_id: answer}}}   ← double-nested
 
    Returns the innermost {question_id: answer} mapping.
    """
    if not isinstance(raw, dict):
        return {}
    submitted = raw.get("answers", {})
    # Unwrap one more level if still nested
    if isinstance(submitted, dict) and "answers" in submitted:
        submitted = submitted["answers"]
    return submitted if isinstance(submitted, dict) else {}

@router.get("/{test_id}/attempts")
def get_test_attempts(
    test_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all attempts for a test by the current student"""
    from app.models.test import TestAttempt, AttemptStatus
    
    # Verify test exists
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    
    # Get attempts
    attempts = db.query(TestAttempt).filter(
        and_(
            TestAttempt.test_id == test_id,
            TestAttempt.student_id == current_user.id
        )
    ).order_by(TestAttempt.started_at.desc()).all()
    
    # Count only completed attempts for remaining calculation
    completed_attempts = [a for a in attempts if a.status == AttemptStatus.COMPLETED]
    
    return {
        "test_id": test_id,
        "attempts": [
            {
                "id": attempt.id,
                "started_at": attempt.started_at,
                "submitted_at": attempt.submitted_at,
                "score": attempt.score,
                "status": attempt.status.value,
                "duration_minutes": attempt.duration_minutes,
                "passed": attempt.score >= test.passing_score if attempt.score is not None else None
            }
            for attempt in attempts
        ],
        "attempts_remaining": test.settings.get('max_attempts', 999) - len(completed_attempts) if test.settings.get('max_attempts') else None,
        "best_score": max((a.score for a in attempts if a.score is not None), default=None)
    }