"""
LEGACY FILE — tests.py (student & teacher test router)

Architecture change: Test / TestAttempt / Question are replaced by
test_without_timer and test_with_timer exercise blocks on Segment.

Old model:  Course → Unit → Test → TestQuestion → Question
            TestAttempt (student answers per attempt)
New model:  Course → Unit → Segment → media_blocks (test_without_timer / test_with_timer blocks)
            UnitHomeworkSubmission.answers JSONB (student answers)

Replaced by:
  - Test authoring:   segment block editor for test_without_timer / test_with_timer
  - Student answers:  UnitHomeworkSubmission.answers JSONB
  - Grading/results:  UnitHomeworkSubmission teacher feedback

This file is fully commented out and kept for reference during migration.
Do NOT re-enable these routes without migrating callers to the new segment API.
"""

# LEGACY: from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
# LEGACY: from sqlalchemy.orm import Session, joinedload
# LEGACY: from sqlalchemy import and_
# LEGACY: from typing import List, Dict, Any, Optional
# LEGACY: from datetime import datetime
# LEGACY: import os
# LEGACY: import uuid
# LEGACY: import logging

# LEGACY: logger = logging.getLogger(__name__)
# LEGACY: from app.core.database import get_db
# LEGACY: from app.core.auth import get_current_user, get_current_teacher
# LEGACY: from app.core.enrollment_guard import check_unit_access
# LEGACY: from app.models.user import User, UserRole
# LEGACY: from app.models.test import Test, TestStatus
# LEGACY: from app.models.unit import Unit
# LEGACY: from app.models.video import Video
# LEGACY: from app.models.task import Task
# LEGACY: from app.schemas.test import TestResponse, TestCreate, TestUpdate
# LEGACY: from app.services.grading_service import grade_question, aggregate_results, GradingResult

from fastapi import APIRouter

router = APIRouter()

# LEGACY: def get_uploads_path():
# LEGACY:     """Get the uploads directory path — delegates to the canonical resolver."""
# LEGACY:     from app.utils.paths import resolve_uploads_path  # noqa: PLC0415
# LEGACY:     return resolve_uploads_path()

# LEGACY: @router.get("", response_model=List[TestResponse])
# LEGACY: @router.get("/", response_model=List[TestResponse])
# LEGACY: def get_tests(
# LEGACY:     unit_id: Optional[int] = None,
# LEGACY:     current_user: User = Depends(get_current_user),
# LEGACY:     db: Session = Depends(get_db),
# LEGACY:     skip: int = 0,
# LEGACY:     limit: int = 100
# LEGACY: ):
# LEGACY:     """Get tests, optionally filtered by unit_id - teachers only see their own tests"""
# LEGACY:     from app.models.test import TestQuestion

# LEGACY:     query = db.query(Test).options(
# LEGACY:         joinedload(Test.unit).joinedload(Unit.course),
# LEGACY:         joinedload(Test.test_questions)
# LEGACY:     )

# LEGACY:     # If user is a teacher, only show their own tests
# LEGACY:     if current_user.role == UserRole.TEACHER:
# LEGACY:         query = query.filter(Test.created_by == current_user.id)

# LEGACY:     if unit_id is not None:
# LEGACY:         query = query.filter(Test.unit_id == unit_id)

# LEGACY:     tests = query.offset(skip).limit(limit).all()

# LEGACY:     # Convert to response format with course information
# LEGACY:     result = []
# LEGACY:     for test in tests:
# LEGACY:         test_dict = {
# LEGACY:             "id": test.id,
# LEGACY:             "title": test.title,
# LEGACY:             "description": test.description,
# LEGACY:             "instructions": test.instructions,
# LEGACY:             "time_limit_minutes": test.time_limit_minutes,
# LEGACY:             "passing_score": test.passing_score,
# LEGACY:             "status": test.status,
# LEGACY:             "publish_at": test.publish_at,
# LEGACY:             "order_index": test.order_index,
# LEGACY:             "settings": test.settings,
# LEGACY:             "unit_id": test.unit_id,
# LEGACY:             "created_by": test.created_by,
# LEGACY:             "created_at": test.created_at,
# LEGACY:             "updated_at": test.updated_at,
# LEGACY:             "course_id": test.unit.course_id if test.unit and test.unit.course else None,
# LEGACY:             "course_title": test.unit.course.title if test.unit and test.unit.course else None,
# LEGACY:             "unit_title": test.unit.title if test.unit else None,
# LEGACY:             "questions_count": len(test.test_questions) if test.test_questions else 0
# LEGACY:         }
# LEGACY:         result.append(TestResponse(**test_dict))

# LEGACY:     return result

# LEGACY: @router.post("/", response_model=TestResponse, status_code=status.HTTP_201_CREATED)
# LEGACY: def create_test(
# LEGACY:     test_data: TestCreate,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Create a new test"""
# LEGACY:     test = Test(
# LEGACY:         unit_id=test_data.unit_id,
# LEGACY:         title=test_data.title,
# LEGACY:         description=test_data.description,
# LEGACY:         instructions=test_data.instructions,
# LEGACY:         time_limit_minutes=test_data.time_limit_minutes,
# LEGACY:         passing_score=test_data.passing_score,
# LEGACY:         status=test_data.status,
# LEGACY:         publish_at=test_data.publish_at,
# LEGACY:         order_index=test_data.order_index,
# LEGACY:         settings=test_data.settings,
# LEGACY:         created_by=current_user.id
# LEGACY:     )

# LEGACY:     db.add(test)
# LEGACY:     db.commit()
# LEGACY:     db.refresh(test)

# LEGACY:     return test

# LEGACY: @router.get("/{test_id}", response_model=TestResponse)
# LEGACY: def get_test(
# LEGACY:     test_id: int,
# LEGACY:     current_user: User = Depends(get_current_user),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Get a specific test - requires enrollment if test belongs to a course (teachers bypass this check)"""
# LEGACY:     query = db.query(Test).options(
# LEGACY:         joinedload(Test.unit).joinedload(Unit.course)
# LEGACY:     ).filter(Test.id == test_id)

# LEGACY:     # If user is a teacher, only show their own tests
# LEGACY:     if current_user.role == UserRole.TEACHER:
# LEGACY:         query = query.filter(Test.created_by == current_user.id)

# LEGACY:     test = query.first()
# LEGACY:     if not test:
# LEGACY:         raise HTTPException(status_code=404, detail="Test not found")

# LEGACY:     # Check enrollment if test belongs to a unit with a course
# LEGACY:     # Teachers can access any test for editing purposes
# LEGACY:     if test.unit_id and current_user.role != UserRole.TEACHER:
# LEGACY:         check_unit_access(db, current_user, test.unit_id)

# LEGACY:     # Convert to response format with course information
# LEGACY:     test_dict = {
# LEGACY:         "id": test.id,
# LEGACY:         "title": test.title,
# LEGACY:         "description": test.description,
# LEGACY:         "instructions": test.instructions,
# LEGACY:         "time_limit_minutes": test.time_limit_minutes,
# LEGACY:         "passing_score": test.passing_score,
# LEGACY:         "status": test.status,
# LEGACY:         "publish_at": test.publish_at,
# LEGACY:         "order_index": test.order_index,
# LEGACY:         "settings": test.settings,
# LEGACY:         "unit_id": test.unit_id,
# LEGACY:         "created_by": test.created_by,
# LEGACY:         "created_at": test.created_at,
# LEGACY:         "updated_at": test.updated_at,
# LEGACY:         "course_id": test.unit.course_id if test.unit and test.unit.course else None,
# LEGACY:         "course_title": test.unit.course.title if test.unit and test.unit.course else None
# LEGACY:     }
# LEGACY:     return TestResponse(**test_dict)

# LEGACY: @router.put("/{test_id}", response_model=TestResponse)
# LEGACY: def update_test(
# LEGACY:     test_id: int,
# LEGACY:     test_data: TestUpdate,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Update a test - only if created by current teacher"""
# LEGACY:     test = db.query(Test).filter(
# LEGACY:         Test.id == test_id,
# LEGACY:         Test.created_by == current_user.id
# LEGACY:     ).first()
# LEGACY:     if not test:
# LEGACY:         raise HTTPException(status_code=404, detail="Test not found")

# LEGACY:     # Check if status is being changed to PUBLISHED
# LEGACY:     update_dict = test_data.dict(exclude_unset=True)
# LEGACY:     new_status = update_dict.get('status')
# LEGACY:     if new_status == TestStatus.PUBLISHED:
# LEGACY:         from app.models.test import TestQuestion
# LEGACY:         question_count = db.query(TestQuestion).filter(TestQuestion.test_id == test_id).count()
# LEGACY:         if question_count == 0:
# LEGACY:             raise HTTPException(
# LEGACY:                 status_code=400,
# LEGACY:                 detail="Cannot publish test without questions. Please add at least one question first."
# LEGACY:             )

# LEGACY:     # Update fields
# LEGACY:     for field, value in test_data.dict(exclude_unset=True).items():
# LEGACY:         setattr(test, field, value)

# LEGACY:     db.commit()
# LEGACY:     db.refresh(test)

# LEGACY:     return test

# LEGACY: @router.delete("/{test_id}", status_code=status.HTTP_204_NO_CONTENT)
# LEGACY: def delete_test(
# LEGACY:     test_id: int,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Delete a test - only if created by current teacher"""
# LEGACY:     test = db.query(Test).filter(
# LEGACY:         Test.id == test_id,
# LEGACY:         Test.created_by == current_user.id
# LEGACY:     ).first()
# LEGACY:     if not test:
# LEGACY:         raise HTTPException(status_code=404, detail="Test not found")

# LEGACY:     db.delete(test)
# LEGACY:     db.commit()

# LEGACY:     return None

# LEGACY: # Resource APIs for Test Creation
# LEGACY: @router.get("/resources/units", response_model=List[Dict[str, Any]])
# LEGACY: def get_units_for_test_creation(
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """
# LEGACY:     Get list of units for test creation - only units in teacher's courses
# LEGACY:     Returns: [{ id, title, level, status }]
# LEGACY:     """
# LEGACY:     from app.models.course import Course
# LEGACY:     # Get teacher's course IDs
# LEGACY:     teacher_course_ids = [c.id for c in db.query(Course.id).filter(
# LEGACY:         Course.created_by == current_user.id
# LEGACY:     ).all()]

# LEGACY:     if not teacher_course_ids:
# LEGACY:         return []

# LEGACY:     units = db.query(Unit).filter(Unit.course_id.in_(teacher_course_ids)).all()
# LEGACY:     return [
# LEGACY:         {
# LEGACY:             "id": unit.id,
# LEGACY:             "title": unit.title,
# LEGACY:             "level": unit.level,
# LEGACY:             "status": unit.status.value,
# LEGACY:             "slug": unit.slug
# LEGACY:         }
# LEGACY:         for unit in units
# LEGACY:     ]

# LEGACY: @router.get("/resources/videos", response_model=List[Dict[str, Any]])
# LEGACY: def get_videos_for_test_creation(
# LEGACY:     unit_id: int = None,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """
# LEGACY:     Get list of videos for test creation - only videos created by teacher
# LEGACY:     Optional filter by unit_id
# LEGACY:     Returns: [{ id, title, unit_id, unit_title, status, duration }]
# LEGACY:     """
# LEGACY:     query = db.query(Video).filter(Video.created_by == current_user.id)
# LEGACY:     if unit_id:
# LEGACY:         query = query.filter(Video.unit_id == unit_id)

# LEGACY:     videos = query.all()
# LEGACY:     return [
# LEGACY:         {
# LEGACY:             "id": video.id,
# LEGACY:             "title": video.title,
# LEGACY:             "unit_id": video.unit_id,
# LEGACY:             "unit_title": video.unit.title if video.unit else None,
# LEGACY:             "status": video.status.value,
# LEGACY:             "duration": video.duration_sec,
# LEGACY:             "source_type": video.source_type.value
# LEGACY:         }
# LEGACY:         for video in videos
# LEGACY:     ]

# LEGACY: @router.get("/resources/tasks", response_model=List[Dict[str, Any]])
# LEGACY: def get_tasks_for_test_creation(
# LEGACY:     unit_id: int = None,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """
# LEGACY:     Get list of all tasks for test creation
# LEGACY:     Optional filter by unit_id
# LEGACY:     Returns: [{ id, title, unit_id, unit_title, type, status, max_score }]
# LEGACY:     """
# LEGACY:     query = db.query(Task)
# LEGACY:     if unit_id:
# LEGACY:         query = query.filter(Task.unit_id == unit_id)

# LEGACY:     tasks = query.all()
# LEGACY:     return [
# LEGACY:         {
# LEGACY:             "id": task.id,
# LEGACY:             "title": task.title,
# LEGACY:             "unit_id": task.unit_id,
# LEGACY:             "unit_title": task.unit.title if task.unit else None,
# LEGACY:             "type": task.type.value,
# LEGACY:             "status": task.status.value,
# LEGACY:             "max_score": task.max_score
# LEGACY:         }
# LEGACY:         for task in tasks
# LEGACY:     ]

# LEGACY: @router.get("/resources/students", response_model=List[Dict[str, Any]])
# LEGACY: def get_students_for_test_assignment(
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """
# LEGACY:     Get list of students for test assignment - only students enrolled in teacher's courses
# LEGACY:     Returns: [{ id, email, first_name, last_name, full_name }]
# LEGACY:     """
# LEGACY:     from app.models.user import UserRole
# LEGACY:     from app.models.course import Course
# LEGACY:     from app.models.enrollment import CourseEnrollment

# LEGACY:     # Get teacher's course IDs
# LEGACY:     teacher_course_ids = [c.id for c in db.query(Course.id).filter(
# LEGACY:         Course.created_by == current_user.id
# LEGACY:     ).all()]

# LEGACY:     if not teacher_course_ids:
# LEGACY:         return []

# LEGACY:     # Get student IDs enrolled in teacher's courses
# LEGACY:     enrolled_student_ids = [e.user_id for e in db.query(CourseEnrollment.user_id).filter(
# LEGACY:         CourseEnrollment.course_id.in_(teacher_course_ids)
# LEGACY:     ).distinct().all()]

# LEGACY:     if not enrolled_student_ids:
# LEGACY:         return []

# LEGACY:     students = db.query(User).filter(
# LEGACY:         and_(
# LEGACY:             User.role == UserRole.STUDENT,
# LEGACY:             User.id.in_(enrolled_student_ids)
# LEGACY:         )
# LEGACY:     ).all()
# LEGACY:     return [
# LEGACY:         {
# LEGACY:             "id": student.id,
# LEGACY:             "email": student.email,
# LEGACY:             "first_name": student.first_name,
# LEGACY:             "last_name": student.last_name,
# LEGACY:             "full_name": f"{student.first_name} {student.last_name}".strip()
# LEGACY:         }
# LEGACY:         for student in students
# LEGACY:     ]

# LEGACY: @router.get("/resources/all", response_model=Dict[str, List[Dict[str, Any]]])
# LEGACY: def get_all_resources_for_test_creation(
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """
# LEGACY:     Get all resources in one request for test creation
# LEGACY:     Returns: { units: [...], videos: [...], tasks: [...], students: [...] }
# LEGACY:     """
# LEGACY:     from app.models.user import UserRole

# LEGACY:     # Get all units
# LEGACY:     units = db.query(Unit).all()
# LEGACY:     units_list = [
# LEGACY:         {
# LEGACY:             "id": unit.id,
# LEGACY:             "title": unit.title,
# LEGACY:             "level": unit.level,
# LEGACY:             "status": unit.status.value,
# LEGACY:             "slug": unit.slug
# LEGACY:         }
# LEGACY:         for unit in units
# LEGACY:     ]

# LEGACY:     # Get all videos
# LEGACY:     videos = db.query(Video).all()
# LEGACY:     videos_list = [
# LEGACY:         {
# LEGACY:             "id": video.id,
# LEGACY:             "title": video.title,
# LEGACY:             "unit_id": video.unit_id,
# LEGACY:             "unit_title": video.unit.title if video.unit else None,
# LEGACY:             "status": video.status.value,
# LEGACY:             "duration": video.duration_sec,
# LEGACY:             "source_type": video.source_type.value
# LEGACY:         }
# LEGACY:         for video in videos
# LEGACY:     ]

# LEGACY:     # Get all tasks
# LEGACY:     tasks = db.query(Task).all()
# LEGACY:     tasks_list = [
# LEGACY:         {
# LEGACY:             "id": task.id,
# LEGACY:             "title": task.title,
# LEGACY:             "unit_id": task.unit_id,
# LEGACY:             "unit_title": task.unit.title if task.unit else None,
# LEGACY:             "type": task.type.value,
# LEGACY:             "status": task.status.value,
# LEGACY:             "max_score": task.max_score
# LEGACY:         }
# LEGACY:         for task in tasks
# LEGACY:     ]

# LEGACY:     # Get all students
# LEGACY:     students = db.query(User).filter(User.role == UserRole.STUDENT).all()
# LEGACY:     students_list = [
# LEGACY:         {
# LEGACY:             "id": student.id,
# LEGACY:             "email": student.email,
# LEGACY:             "first_name": student.first_name,
# LEGACY:             "last_name": student.last_name,
# LEGACY:             "full_name": f"{student.first_name} {student.last_name}".strip()
# LEGACY:         }
# LEGACY:         for student in students
# LEGACY:     ]

# LEGACY:     return {
# LEGACY:         "units": units_list,
# LEGACY:         "videos": videos_list,
# LEGACY:         "tasks": tasks_list,
# LEGACY:         "students": students_list
# LEGACY:     }

# LEGACY: # Question management endpoints
# LEGACY: @router.post("/questions/upload-image")
# LEGACY: async def upload_question_image(
# LEGACY:     file: UploadFile = File(...),
# LEGACY:     current_user: User = Depends(get_current_teacher)
# LEGACY: ):
# LEGACY:     """Upload an image for a visual question"""

# LEGACY:     # Allowed image MIME types
# LEGACY:     allowed_mime_types = [
# LEGACY:         'image/jpeg',
# LEGACY:         'image/jpg',
# LEGACY:         'image/png',
# LEGACY:         'image/gif',
# LEGACY:         'image/webp'
# LEGACY:     ]

# LEGACY:     # Allowed file extensions
# LEGACY:     allowed_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp']

# LEGACY:     # Validate file type
# LEGACY:     if not file.content_type:
# LEGACY:         if file.filename:
# LEGACY:             file_ext = os.path.splitext(file.filename)[1].lower()
# LEGACY:             if file_ext not in allowed_extensions:
# LEGACY:                 raise HTTPException(
# LEGACY:                     status_code=400,
# LEGACY:                     detail=f"Invalid file type. Allowed formats: {', '.join(allowed_extensions)}"
# LEGACY:                 )
# LEGACY:         else:
# LEGACY:             raise HTTPException(status_code=400, detail="File type could not be determined")
# LEGACY:     elif file.content_type not in allowed_mime_types:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=400,
# LEGACY:             detail=f"Invalid file type. Allowed formats: JPEG, PNG, GIF, WebP"
# LEGACY:         )

# LEGACY:     # Get uploads path
# LEGACY:     uploads_path = get_uploads_path()
# LEGACY:     questions_dir = os.path.join(uploads_path, "questions", str(current_user.id))
# LEGACY:     os.makedirs(questions_dir, exist_ok=True)

# LEGACY:     # Generate filename
# LEGACY:     file_ext = os.path.splitext(file.filename or 'image.jpg')[1] or '.jpg'
# LEGACY:     filename = f"{uuid.uuid4().hex[:16]}{file_ext}"
# LEGACY:     file_path = os.path.join(questions_dir, filename)

# LEGACY:     # Save file
# LEGACY:     try:
# LEGACY:         with open(file_path, "wb") as buffer:
# LEGACY:             content = await file.read()
# LEGACY:             buffer.write(content)

# LEGACY:         # Return relative path for storage in database
# LEGACY:         # Path will be: questions/{user_id}/{filename}
# LEGACY:         relative_path = f"questions/{current_user.id}/{filename}"

# LEGACY:         return {
# LEGACY:             "message": "Image uploaded successfully",
# LEGACY:             "path": relative_path,
# LEGACY:             "url": f"/api/v1/static/{relative_path}"
# LEGACY:         }
# LEGACY:     except Exception as e:
# LEGACY:         raise HTTPException(status_code=500, detail=f"Error uploading image: {str(e)}")

# LEGACY: @router.post("/{test_id}/questions", status_code=status.HTTP_201_CREATED)
# LEGACY: @router.post("/{test_id}/questions", status_code=status.HTTP_201_CREATED)
# LEGACY: def add_question_to_test(
# LEGACY:     test_id: int,
# LEGACY:     question_data: Dict[str, Any],
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db),
# LEGACY: ):
# LEGACY:     """
# LEGACY:     Add a question to a test (test must belong to current teacher).

# LEGACY:     Accepted question types (first wave):
# LEGACY:       multiple_choice, true_false, cloze_input, cloze_drag,
# LEGACY:       matching_pairs, ordering_words, ordering_sentences, open_answer

# LEGACY:     Legacy types still accepted: cloze, visual
# LEGACY:     (cloze is silently remapped to cloze_input)
# LEGACY:     """
# LEGACY:     from app.models.test import Question, TestQuestion, QuestionType
# LEGACY:     from app.services.question_service import (
# LEGACY:         build_question_from_schema,
# LEGACY:         normalise_type,
# LEGACY:     )
# LEGACY:     from app.schemas.question import (
# LEGACY:         MultipleChoiceQuestionCreate,
# LEGACY:         TrueFalseQuestionCreate,
# LEGACY:         ClozeInputQuestionCreate,
# LEGACY:         ClozeDragQuestionCreate,
# LEGACY:         MatchingPairsQuestionCreate,
# LEGACY:         OrderingWordsQuestionCreate,
# LEGACY:         OrderingSentencesQuestionCreate,
# LEGACY:         OpenAnswerQuestionCreate,
# LEGACY:     )

# LEGACY:     # ── 1. Authorise ──────────────────────────────────────────────────────────
# LEGACY:     test = db.query(Test).filter(Test.id == test_id).first()
# LEGACY:     if not test:
# LEGACY:         raise HTTPException(status_code=404, detail="Test not found")
# LEGACY:     if test.created_by != current_user.id:
# LEGACY:         raise HTTPException(status_code=403, detail="Not authorized to modify this test")

# LEGACY:     # ── 2. Resolve level ─────────────────────────────────────────────────────
# LEGACY:     level = question_data.get("level")
# LEGACY:     if not level and test.unit_id:
# LEGACY:         unit = db.query(Unit).filter(Unit.id == test.unit_id).first()
# LEGACY:         if unit and unit.level:
# LEGACY:             level = unit.level.value if hasattr(unit.level, "value") else unit.level
# LEGACY:     if not level:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=400,
# LEGACY:             detail="Question level is required. Provide 'level' or ensure the test has a unit with a level.",
# LEGACY:         )

# LEGACY:     # ── 3. Normalise type string ──────────────────────────────────────────────
# LEGACY:     raw_type = question_data.get("type", "")
# LEGACY:     canonical_type = normalise_type(raw_type)

# LEGACY:     # Inject canonical type + prompt_rich alias so schemas validate cleanly
# LEGACY:     payload = dict(question_data)
# LEGACY:     payload["type"] = canonical_type
# LEGACY:     payload["level"] = level
# LEGACY:     # Support both "prompt" and "prompt_rich" as input keys
# LEGACY:     if "prompt" in payload and "prompt_rich" not in payload:
# LEGACY:         payload["prompt_rich"] = payload["prompt"]

# LEGACY:     # ── 4. Typed-schema path (first-wave types) ───────────────────────────────
# LEGACY:     _TYPED_SCHEMA_MAP = {
# LEGACY:         "multiple_choice":    MultipleChoiceQuestionCreate,
# LEGACY:         "true_false":         TrueFalseQuestionCreate,
# LEGACY:         "cloze_input":        ClozeInputQuestionCreate,
# LEGACY:         "cloze_drag":         ClozeDragQuestionCreate,
# LEGACY:         "matching_pairs":     MatchingPairsQuestionCreate,
# LEGACY:         "ordering_words":     OrderingWordsQuestionCreate,
# LEGACY:         "ordering_sentences": OrderingSentencesQuestionCreate,
# LEGACY:         "open_answer":        OpenAnswerQuestionCreate,
# LEGACY:     }

# LEGACY:     schema_cls = _TYPED_SCHEMA_MAP.get(canonical_type)

# LEGACY:     if schema_cls is not None:
# LEGACY:         try:
# LEGACY:             schema = schema_cls(**payload)
# LEGACY:         except Exception as exc:
# LEGACY:             raise HTTPException(status_code=422, detail=str(exc))
# LEGACY:         question = build_question_from_schema(schema, current_user.id, level_fallback=level)

# LEGACY:     else:
# LEGACY:         # ── 5. Legacy path (visual, matching, ordering, etc.) ─────────────────
# LEGACY:         try:
# LEGACY:             question_type_enum = QuestionType(canonical_type)
# LEGACY:         except ValueError:
# LEGACY:             raise HTTPException(
# LEGACY:                 status_code=400,
# LEGACY:                 detail=f"Invalid question type: {raw_type}. Valid types: {[e.value for e in QuestionType]}",
# LEGACY:             )

# LEGACY:         qt = question_type_enum.value
# LEGACY:         question = Question(
# LEGACY:             type=question_type_enum,
# LEGACY:             prompt_rich=question_data.get("prompt") or question_data.get("prompt_rich", ""),
# LEGACY:             points=question_data.get("score", 1.0),
# LEGACY:             autograde=question_data.get("autograde", True),
# LEGACY:             question_metadata=question_data.get("metadata", {}),
# LEGACY:             level=level,
# LEGACY:             created_by=current_user.id,
# LEGACY:         )

# LEGACY:         if qt == "visual":
# LEGACY:             answer_type = question_data.get("answer_type", "multiple_choice")
# LEGACY:             meta = dict(question_data.get("metadata", {}))
# LEGACY:             meta["answer_type"] = answer_type
# LEGACY:             question.question_metadata = meta
# LEGACY:             question.media = question_data.get("media", [])
# LEGACY:             if answer_type in ("multiple_choice", "single_choice"):
# LEGACY:                 question.options = question_data.get("options", [])
# LEGACY:                 question.correct_answer = {"correct_option_ids": question_data.get("correct_option_ids", [])}
# LEGACY:                 question.shuffle_options = question_data.get("shuffle_options", True)
# LEGACY:             elif answer_type == "open_answer":
# LEGACY:                 question.expected_answer_config = question_data.get("expected", {})
# LEGACY:                 question.correct_answer = {"expected": question_data.get("expected", {})}
# LEGACY:             elif answer_type == "true_false":
# LEGACY:                 question.options = [{"id": "true", "text": "True"}, {"id": "false", "text": "False"}]
# LEGACY:                 question.correct_answer = {"correct_option_ids": question_data.get("correct_option_ids", [])}
# LEGACY:         else:
# LEGACY:             # Absolute fallback — store raw correct_answer if provided
# LEGACY:             question.correct_answer = question_data.get("correct_answer", {})

# LEGACY:     # ── 6. Persist ────────────────────────────────────────────────────────────
# LEGACY:     db.add(question)
# LEGACY:     db.flush()

# LEGACY:     max_order = db.query(TestQuestion).filter(TestQuestion.test_id == test_id).count()
# LEGACY:     test_question = TestQuestion(
# LEGACY:         test_id=test_id,
# LEGACY:         question_id=question.id,
# LEGACY:         order_index=max_order,
# LEGACY:         points=question_data.get("score", 1.0),
# LEGACY:     )
# LEGACY:     db.add(test_question)
# LEGACY:     db.commit()
# LEGACY:     db.refresh(question)

# LEGACY:     return {"id": question.id, "message": "Question added successfully"}

# LEGACY: @router.get("/{test_id}/questions")
# LEGACY: def get_test_questions(
# LEGACY:     test_id: int,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Get all questions for a test with ordering"""
# LEGACY:     from app.models.test import TestQuestion

# LEGACY:     # Get test and verify access
# LEGACY:     test = db.query(Test).filter(Test.id == test_id).first()
# LEGACY:     if not test:
# LEGACY:         raise HTTPException(status_code=404, detail="Test not found")

# LEGACY:     if test.created_by != current_user.id:
# LEGACY:         raise HTTPException(status_code=403, detail="Not authorized to view this test")

# LEGACY:     # Get test questions with ordering
# LEGACY:     test_questions = db.query(TestQuestion).filter(
# LEGACY:         TestQuestion.test_id == test_id
# LEGACY:     ).order_by(TestQuestion.order_index).all()

# LEGACY:     total_points = sum(tq.points or tq.question.points for tq in test_questions)

# LEGACY:     return {
# LEGACY:         "test_id": test_id,
# LEGACY:         "total_questions": len(test_questions),
# LEGACY:         "total_points": total_points,
# LEGACY:         "questions": [
# LEGACY:             {
# LEGACY:                 "id": tq.id,
# LEGACY:                 "test_id": tq.test_id,
# LEGACY:                 "question_id": tq.question_id,
# LEGACY:                 "order_index": tq.order_index,
# LEGACY:                 "points": tq.points,
# LEGACY:                 "question": {
# LEGACY:                     "id": tq.question.id,
# LEGACY:                     "type": tq.question.type.value,
# LEGACY:                     "prompt_rich": tq.question.prompt_rich,
# LEGACY:                     "options": tq.question.options,
# LEGACY:                     "correct_answer": tq.question.correct_answer,
# LEGACY:                     "points": tq.question.points,
# LEGACY:                     "shuffle_options": tq.question.shuffle_options,
# LEGACY:                     "autograde": tq.question.autograde,
# LEGACY:                     "manual_review_threshold": tq.question.manual_review_threshold,
# LEGACY:                     "expected_answer_config": tq.question.expected_answer_config,
# LEGACY:                     "gaps_config": tq.question.gaps_config,
# LEGACY:                     "question_metadata": tq.question.question_metadata,
# LEGACY:                     "level": tq.question.level,
# LEGACY:                     "created_at": tq.question.created_at.isoformat() if tq.question.created_at else None,
# LEGACY:                     "updated_at": tq.question.updated_at.isoformat() if tq.question.updated_at else None,
# LEGACY:                 }
# LEGACY:             }
# LEGACY:             for tq in test_questions
# LEGACY:         ]
# LEGACY:     }

# LEGACY: @router.patch("/{test_id}/publish")
# LEGACY: def publish_test_endpoint(
# LEGACY:     test_id: int,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Publish a test (change status from DRAFT to PUBLISHED)"""
# LEGACY:     test = db.query(Test).filter(Test.id == test_id).first()
# LEGACY:     if not test:
# LEGACY:         raise HTTPException(status_code=404, detail="Test not found")

# LEGACY:     if test.created_by != current_user.id:
# LEGACY:         raise HTTPException(status_code=403, detail="Not authorized to modify this test")

# LEGACY:     from app.models.test import TestQuestion
# LEGACY:     question_count = db.query(TestQuestion).filter(TestQuestion.test_id == test_id).count()

# LEGACY:     if question_count == 0:
# LEGACY:         raise HTTPException(status_code=400, detail="Cannot publish test without questions")

# LEGACY:     test.status = TestStatus.PUBLISHED
# LEGACY:     db.commit()
# LEGACY:     db.refresh(test)

# LEGACY:     return {
# LEGACY:         "test_id": test_id,
# LEGACY:         "status": test.status.value,
# LEGACY:         "question_count": question_count,
# LEGACY:         "message": "Test published successfully"
# LEGACY:     }

# LEGACY: # Student Test Endpoints

# LEGACY: @router.post("/{test_id}/start")
# LEGACY: def start_test(
# LEGACY:     test_id: int,
# LEGACY:     current_user: User = Depends(get_current_user),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Start a test attempt for a student - requires enrollment if test belongs to a course"""
# LEGACY:     from app.models.test import TestAttempt, AttemptStatus, TestQuestion

# LEGACY:     # Get test and verify it exists and is published
# LEGACY:     test = db.query(Test).filter(Test.id == test_id).first()
# LEGACY:     if not test:
# LEGACY:         raise HTTPException(status_code=404, detail="Test not found")

# LEGACY:     if test.status != TestStatus.PUBLISHED:
# LEGACY:         raise HTTPException(status_code=400, detail="Test is not published")

# LEGACY:     # Check enrollment if test belongs to a unit with a course
# LEGACY:     if test.unit_id:
# LEGACY:         check_unit_access(db, current_user, test.unit_id)

# LEGACY:     # Check for existing active attempt
# LEGACY:     active_attempt = db.query(TestAttempt).filter(
# LEGACY:         and_(
# LEGACY:             TestAttempt.test_id == test_id,
# LEGACY:             TestAttempt.student_id == current_user.id,
# LEGACY:             TestAttempt.status == AttemptStatus.IN_PROGRESS
# LEGACY:         )
# LEGACY:     ).first()

# LEGACY:     if active_attempt:
# LEGACY:         # Return existing active attempt instead of creating a new one
# LEGACY:         attempt = active_attempt
# LEGACY:     else:
# LEGACY:         # Check max attempts (only count completed attempts)
# LEGACY:         if test.settings and test.settings.get('max_attempts'):
# LEGACY:             attempts_count = db.query(TestAttempt).filter(
# LEGACY:                 and_(
# LEGACY:                     TestAttempt.test_id == test_id,
# LEGACY:                     TestAttempt.student_id == current_user.id,
# LEGACY:                     TestAttempt.status == AttemptStatus.COMPLETED
# LEGACY:                 )
# LEGACY:             ).count()

# LEGACY:             if attempts_count >= test.settings['max_attempts']:
# LEGACY:                 raise HTTPException(
# LEGACY:                     status_code=400, 
# LEGACY:                     detail=f"Maximum attempts ({test.settings['max_attempts']}) reached"
# LEGACY:                 )

# LEGACY:         # Create new attempt only if no active attempt exists
# LEGACY:         attempt = TestAttempt(
# LEGACY:             test_id=test_id,
# LEGACY:             student_id=current_user.id,
# LEGACY:             status=AttemptStatus.IN_PROGRESS
# LEGACY:         )
# LEGACY:         db.add(attempt)
# LEGACY:         db.commit()
# LEGACY:         db.refresh(attempt)

# LEGACY:     # Get questions for this test
# LEGACY:     test_questions = db.query(TestQuestion).options(
# LEGACY:         joinedload(TestQuestion.question)
# LEGACY:     ).filter(TestQuestion.test_id == test_id).order_by(TestQuestion.order_index).all()

# LEGACY:     # Shuffle questions if needed
# LEGACY:     questions_list = test_questions
# LEGACY:     if test.settings and test.settings.get('shuffle_questions'):
# LEGACY:         import random
# LEGACY:         questions_list = random.sample(test_questions, len(test_questions))

# LEGACY:     # Format questions for frontend
# LEGACY:     logger.info(f"[DEBUG] Formatting {len(questions_list)} questions for test {test_id}")
# LEGACY:     questions_data = []
# LEGACY:     for tq in questions_list:
# LEGACY:         q = tq.question
# LEGACY:         question_data = {
# LEGACY:             "id": q.id,
# LEGACY:             "type": q.type.value,
# LEGACY:             "prompt": q.prompt_rich,
# LEGACY:             "score": tq.points,
# LEGACY:         }

# LEGACY:         # Include media (images, audio) if present
# LEGACY:         # For visual questions, always include media field (even if empty)
# LEGACY:         is_visual = q.type.value == "visual" or q.type.name == "VISUAL"
# LEGACY:         logger.info(f"[DEBUG] Question {q.id}: type = {q.type}, type.value = {q.type.value}, type.name = {q.type.name}, is_visual = {is_visual}")
# LEGACY:         if is_visual:
# LEGACY:             logger.info(f"[DEBUG] Visual question {q.id}: media = {q.media}, type = {type(q.media)}, has media = {bool(q.media)}, len = {len(q.media) if q.media else 0}")
# LEGACY:         if is_visual:
# LEGACY:             # Always include media for visual questions
# LEGACY:             media_data = q.media if q.media is not None else []
# LEGACY:             if isinstance(media_data, list) and len(media_data) > 0:
# LEGACY:                 # Convert media paths to full URLs
# LEGACY:                 media_list = []
# LEGACY:                 for media_item in media_data:
# LEGACY:                     if isinstance(media_item, dict):
# LEGACY:                         media_dict = media_item.copy()
# LEGACY:                         # If URL is a relative path, convert to full URL
# LEGACY:                         if media_dict.get("url") and not media_dict["url"].startswith("http"):
# LEGACY:                             # Ensure it starts with /api/v1/static
# LEGACY:                             if not media_dict["url"].startswith("/api/v1/static"):
# LEGACY:                                 media_dict["url"] = f"/api/v1/static/{media_dict.get('path', media_dict.get('url', ''))}"
# LEGACY:                         elif media_dict.get("path") and not media_dict.get("url"):
# LEGACY:                             # If only path is provided, construct URL
# LEGACY:                             media_dict["url"] = f"/api/v1/static/{media_dict['path']}"
# LEGACY:                         media_list.append(media_dict)
# LEGACY:                     else:
# LEGACY:                         # Handle case where media is stored as a simple string/path
# LEGACY:                         media_list.append({
# LEGACY:                             "type": "image",
# LEGACY:                             "path": str(media_item),
# LEGACY:                             "url": f"/api/v1/static/{media_item}"
# LEGACY:                         })
# LEGACY:                 question_data["media"] = media_list
# LEGACY:             else:
# LEGACY:                 # For visual questions without media, include empty array
# LEGACY:                 question_data["media"] = []

# LEGACY:             # Visual questions can have different answer types
# LEGACY:             answer_type = q.question_metadata.get("answer_type", "multiple_choice") if q.question_metadata else "multiple_choice"
# LEGACY:             question_data["answer_type"] = answer_type

# LEGACY:             if answer_type in ["multiple_choice", "single_choice"]:
# LEGACY:                 options = q.options or []
# LEGACY:                 # Shuffle options if needed
# LEGACY:                 if test.settings and test.settings.get('shuffle_options') and q.shuffle_options:
# LEGACY:                     import random
# LEGACY:                     options = random.sample(options, len(options))
# LEGACY:                 question_data['options'] = options
# LEGACY:         elif q.type.value == 'multiple_choice':
# LEGACY:             options = q.options or []
# LEGACY:             # Shuffle options if needed
# LEGACY:             if test.settings and test.settings.get('shuffle_options') and q.shuffle_options:
# LEGACY:                 import random
# LEGACY:                 options = random.sample(options, len(options))
# LEGACY:             question_data['options'] = options
# LEGACY:         elif q.type.value == 'cloze':
# LEGACY:             # Don't send answers, just the prompt with gaps
# LEGACY:             question_data['gaps_count'] = len(q.gaps_config or [])

# LEGACY:         questions_data.append(question_data)

# LEGACY:     return {
# LEGACY:         "attempt_id": attempt.id,
# LEGACY:         "test_id": test_id,
# LEGACY:         "test_title": test.title,
# LEGACY:         "time_limit_minutes": test.time_limit_minutes,
# LEGACY:         "started_at": attempt.started_at,
# LEGACY:         "questions": questions_data,
# LEGACY:         "total_points": sum(tq.points for tq in test_questions)
# LEGACY:     }

# LEGACY: @router.post("/{test_id}/submit")
# LEGACY: def submit_test(
# LEGACY:     test_id: int,
# LEGACY:     answers: dict,          # FastAPI injects Dict[str, Any] from JSON body
# LEGACY:     current_user,           # User = Depends(get_current_user)
# LEGACY:     db,                     # Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """
# LEGACY:     Submit test answers and calculate score.

# LEGACY:     Router is intentionally thin:
# LEGACY:       1. Validate request context (enrollment, active attempt).
# LEGACY:       2. Load attempt + questions.
# LEGACY:       3. Delegate per-question grading to grading_service.grade_question().
# LEGACY:       4. Aggregate totals.
# LEGACY:       5. Persist and return response.
# LEGACY:     """
# LEGACY:     from datetime import timezone
# LEGACY:     from app.models.test import TestAttempt, AttemptStatus, TestQuestion
# LEGACY:     from sqlalchemy import and_
# LEGACY:     from sqlalchemy.orm import joinedload
# LEGACY:     from app.services.grading_service import grade_question as svc_grade, aggregate_results

# LEGACY:     # ── 1. Guard checks ───────────────────────────────────────────────────────

# LEGACY:     test = db.query(Test).filter(Test.id == test_id).first()
# LEGACY:     if not test:
# LEGACY:         raise HTTPException(status_code=404, detail="Test not found")

# LEGACY:     if test.unit_id:
# LEGACY:         check_unit_access(db, current_user, test.unit_id)

# LEGACY:     attempt = (
# LEGACY:         db.query(TestAttempt)
# LEGACY:         .filter(
# LEGACY:             and_(
# LEGACY:                 TestAttempt.test_id == test_id,
# LEGACY:                 TestAttempt.student_id == current_user.id,
# LEGACY:                 TestAttempt.status == AttemptStatus.IN_PROGRESS,
# LEGACY:             )
# LEGACY:         )
# LEGACY:         .order_by(TestAttempt.started_at.desc())
# LEGACY:         .first()
# LEGACY:     )
# LEGACY:     if not attempt:
# LEGACY:         raise HTTPException(status_code=404, detail="No active test attempt found")

# LEGACY:     # ── 2. Load questions ─────────────────────────────────────────────────────

# LEGACY:     test_questions = (
# LEGACY:         db.query(TestQuestion)
# LEGACY:         .options(joinedload(TestQuestion.question))
# LEGACY:         .filter(TestQuestion.test_id == test_id)
# LEGACY:         .all()
# LEGACY:     )

# LEGACY:     submitted_answers = _extract_answers(answers)
# LEGACY:     logger.info(f"[submit_test] test_id={test_id} submitted_answers keys={list(submitted_answers.keys())}")

# LEGACY:     # ── 3. Grade each question via the service ────────────────────────────────

# LEGACY:     from app.services.grading_service import GradingResult

# LEGACY:     results_detail: dict = {}
# LEGACY:     grading_results: dict[str, GradingResult] = {}

# LEGACY:     for tq in test_questions:
# LEGACY:         q = tq.question
# LEGACY:         question_id = str(q.id)
# LEGACY:         max_pts = tq.points

# LEGACY:         student_answer = submitted_answers.get(question_id)

# LEGACY:         # Delegate entirely to grading service (handles all types + fallback)
# LEGACY:         result: GradingResult = svc_grade(q, student_answer, max_pts)

# LEGACY:         grading_results[question_id] = result

# LEGACY:         logger.info(
# LEGACY:             f"[submit_test] q={question_id} type={q.type.value} "
# LEGACY:             f"mode={result.grading_mode} correct={result.is_correct} "
# LEGACY:             f"score={result.score}/{max_pts} fallback={result.used_fallback}"
# LEGACY:         )

# LEGACY:         # Build per-question result payload (backward-compatible shape)
# LEGACY:         question_payload = {
# LEGACY:             "id": q.id,
# LEGACY:             "type": q.type.value,
# LEGACY:             "prompt": q.prompt_rich,
# LEGACY:             "points": max_pts,
# LEGACY:             "options": q.options or [],
# LEGACY:             "correct_answer": q.correct_answer,
# LEGACY:             "expected_answer_config": q.expected_answer_config,
# LEGACY:             "gaps_config": q.gaps_config,
# LEGACY:             "explanation": q.explanation_rich,
# LEGACY:         }

# LEGACY:         results_detail[question_id] = {
# LEGACY:             "question_id": q.id,
# LEGACY:             "student_answer": student_answer,
# LEGACY:             "is_correct": result.is_correct,
# LEGACY:             "points_earned": result.score,
# LEGACY:             "points_possible": max_pts,
# LEGACY:             "grading_mode": result.grading_mode,
# LEGACY:             "used_fallback": result.used_fallback,
# LEGACY:             "question": question_payload,
# LEGACY:             # Include rich grading metadata (gap breakdowns, keyword ratios, etc.)
# LEGACY:             # so teacher review tools can surface it without re-grading.
# LEGACY:             **({"grading_metadata": result.metadata} if result.metadata else {}),
# LEGACY:         }

# LEGACY:     # ── 4. Aggregate ──────────────────────────────────────────────────────────

# LEGACY:     totals = aggregate_results(grading_results, test.passing_score)
# LEGACY:     total_score = totals["total_earned"]
# LEGACY:     max_score = totals["total_possible"]
# LEGACY:     percentage = totals["percentage"]
# LEGACY:     passed = totals["passed"]

# LEGACY:     # ── 5. Persist ────────────────────────────────────────────────────────────

# LEGACY:     submitted_at = __import__("datetime").datetime.now(timezone.utc)
# LEGACY:     attempt.submitted_at = submitted_at
# LEGACY:     attempt.score = percentage
# LEGACY:     attempt.detail = results_detail
# LEGACY:     attempt.status = AttemptStatus.COMPLETED

# LEGACY:     # Time taken
# LEGACY:     time_taken_seconds = 0
# LEGACY:     if attempt.started_at:
# LEGACY:         started = (
# LEGACY:             attempt.started_at.replace(tzinfo=timezone.utc)
# LEGACY:             if attempt.started_at.tzinfo is None
# LEGACY:             else attempt.started_at
# LEGACY:         )
# LEGACY:         time_taken_seconds = int((submitted_at - started).total_seconds())

# LEGACY:     db.commit()
# LEGACY:     db.refresh(attempt)

# LEGACY:     # Notify (best-effort)
# LEGACY:     from app.services.notification_service import notify_test_completed
# LEGACY:     try:
# LEGACY:         notify_test_completed(db, current_user.id, test_id, test.title, percentage, passed)
# LEGACY:     except Exception as exc:
# LEGACY:         logger.warning(f"[submit_test] notification failed: {exc}")

# LEGACY:     # Remaining attempts
# LEGACY:     attempts_remaining = None
# LEGACY:     if test.settings and test.settings.get("max_attempts"):
# LEGACY:         completed_count = db.query(TestAttempt).filter(
# LEGACY:             and_(
# LEGACY:                 TestAttempt.test_id == test_id,
# LEGACY:                 TestAttempt.student_id == current_user.id,
# LEGACY:                 TestAttempt.status == AttemptStatus.COMPLETED,
# LEGACY:             )
# LEGACY:         ).count()
# LEGACY:         attempts_remaining = test.settings["max_attempts"] - completed_count

# LEGACY:     return {
# LEGACY:         "attempt_id": attempt.id,
# LEGACY:         "score": percentage,
# LEGACY:         "passed": passed,
# LEGACY:         "points_earned": total_score,
# LEGACY:         "points_possible": max_score,
# LEGACY:         "results": results_detail if test.settings.get("show_results_immediately", True) else None,
# LEGACY:         "submitted_at": attempt.submitted_at,
# LEGACY:         "time_taken_seconds": time_taken_seconds,
# LEGACY:         "attempts_remaining": attempts_remaining,
# LEGACY:         # New: surface whether any questions need teacher review
# LEGACY:         "requires_manual_review": totals.get("requires_manual_review", False),
# LEGACY:     }

# LEGACY: def _extract_answers(raw: dict) -> dict:
# LEGACY:     """
# LEGACY:     Unwrap the (possibly double-nested) answers payload.

# LEGACY:     Frontend sends one of:
# LEGACY:       {"answers": {question_id: answer}}
# LEGACY:       {"answers": {"answers": {question_id: answer}}}   ← double-nested

# LEGACY:     Returns the innermost {question_id: answer} mapping.
# LEGACY:     """
# LEGACY:     if not isinstance(raw, dict):
# LEGACY:         return {}
# LEGACY:     submitted = raw.get("answers", {})
# LEGACY:     # Unwrap one more level if still nested
# LEGACY:     if isinstance(submitted, dict) and "answers" in submitted:
# LEGACY:         submitted = submitted["answers"]
# LEGACY:     return submitted if isinstance(submitted, dict) else {}

# LEGACY: @router.get("/{test_id}/attempts")
# LEGACY: def get_test_attempts(
# LEGACY:     test_id: int,
# LEGACY:     current_user: User = Depends(get_current_user),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Get all attempts for a test by the current student"""
# LEGACY:     from app.models.test import TestAttempt, AttemptStatus

# LEGACY:     # Verify test exists
# LEGACY:     test = db.query(Test).filter(Test.id == test_id).first()
# LEGACY:     if not test:
# LEGACY:         raise HTTPException(status_code=404, detail="Test not found")

# LEGACY:     # Get attempts
# LEGACY:     attempts = db.query(TestAttempt).filter(
# LEGACY:         and_(
# LEGACY:             TestAttempt.test_id == test_id,
# LEGACY:             TestAttempt.student_id == current_user.id
# LEGACY:         )
# LEGACY:     ).order_by(TestAttempt.started_at.desc()).all()

# LEGACY:     # Count only completed attempts for remaining calculation
# LEGACY:     completed_attempts = [a for a in attempts if a.status == AttemptStatus.COMPLETED]

# LEGACY:     return {
# LEGACY:         "test_id": test_id,
# LEGACY:         "attempts": [
# LEGACY:             {
# LEGACY:                 "id": attempt.id,
# LEGACY:                 "started_at": attempt.started_at,
# LEGACY:                 "submitted_at": attempt.submitted_at,
# LEGACY:                 "score": attempt.score,
# LEGACY:                 "status": attempt.status.value,
# LEGACY:                 "duration_minutes": attempt.duration_minutes,
# LEGACY:                 "passed": attempt.score >= test.passing_score if attempt.score is not None else None
# LEGACY:             }
# LEGACY:             for attempt in attempts
# LEGACY:         ],
# LEGACY:         "attempts_remaining": test.settings.get('max_attempts', 999) - len(completed_attempts) if test.settings.get('max_attempts') else None,
# LEGACY:         "best_score": max((a.score for a in attempts if a.score is not None), default=None)
# LEGACY:     }
