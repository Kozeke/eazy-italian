"""
LEGACY FILE (partial) — admin_tests.py (admin test CRUD router)

Architecture change: Test / TestAttempt / Question CRUD is replaced by
test_without_timer and test_with_timer exercise blocks on Segment.

Old model:  Course → Unit → Test → TestQuestion → Question
            TestAttempt / AttemptStatus (student attempt tracking)
New model:  Course → Unit → Segment → media_blocks (test_without_timer / test_with_timer blocks)
            UnitHomeworkSubmission.answers JSONB (student answers)

WHY THIS FILE IS KEPT ALIVE:
  segment_id is referenced in TestResponse schema for backwards compatibility
  with existing API consumers that still read test metadata.  Once all callers
  are migrated the imports can be removed entirely.

All test CRUD routes and TestAttempt / AttemptStatus routes are commented out.
The router is kept live (returns empty) so the import in api/v1/api.py does not break.

Replaced by:
  - Test authoring:   segment block editor for test_without_timer / test_with_timer
  - Student attempts: UnitHomeworkSubmission.answers JSONB
"""

# LEGACY: from fastapi import APIRouter, Depends, Query, HTTPException, status
# LEGACY: from sqlalchemy.orm import Session, joinedload
# LEGACY: from typing import List, Optional
# LEGACY:
# LEGACY: from app.core.database import get_db
# LEGACY: from app.core.auth import get_current_teacher
# LEGACY: from app.models.user import User, UserRole
# LEGACY: from app.models.test import Test, TestStatus, TestQuestion       # → test_without_timer / test_with_timer blocks
# LEGACY: from app.models.unit import Unit
# LEGACY: from app.schemas.test import TestResponse, TestCreate, TestUpdate  # TestResponse kept for segment_id compat
# LEGACY: from app.models.course import Course

# ── Active imports — kept for backwards compat (TestResponse.segment_id) ──────
from fastapi import APIRouter

router = APIRouter()

# ── LEGACY: helper — list course IDs for current teacher ──────────────────────
# Replaced by: teacher ownership check in segment editor (segments.py)
# LEGACY: def _teacher_course_ids(db: Session, current_user: User) -> List[int]:
# LEGACY:     """Helper: list of course ids created by the current teacher."""
# LEGACY:     return [
# LEGACY:         c.id
# LEGACY:         for c in db.query(Course.id).filter(Course.created_by == current_user.id).all()
# LEGACY:     ]


# LEGACY: def _test_to_response(test: Test) -> TestResponse:
# LEGACY:     """Serialize Test -> TestResponse including optional course and questions_count."""
# LEGACY:     return TestResponse(
# LEGACY:         id=test.id,
# LEGACY:         title=test.title,
# LEGACY:         description=test.description,
# LEGACY:         instructions=test.instructions,
# LEGACY:         time_limit_minutes=test.time_limit_minutes,
# LEGACY:         passing_score=test.passing_score,
# LEGACY:         status=test.status,
# LEGACY:         publish_at=test.publish_at,
# LEGACY:         order_index=test.order_index,
# LEGACY:         settings=test.settings,
# LEGACY:         unit_id=test.unit_id,
# LEGACY:         segment_id=getattr(test, 'segment_id', None),
# LEGACY:         created_by=test.created_by,
# LEGACY:         created_at=test.created_at,
# LEGACY:         updated_at=test.updated_at,
# LEGACY:         course_id=test.unit.course_id if test.unit and test.unit.course else None,
# LEGACY:         course_title=test.unit.course.title if test.unit and test.unit.course else None,
# LEGACY:         unit_title=test.unit.title if test.unit else None,
# LEGACY:         questions_count=len(test.test_questions) if test.test_questions else 0,
# LEGACY:     )


# ── LEGACY: GET /admin/tests ───────────────────────────────────────────────────
# Replaced by: segment list endpoint in segments.py filtered by exercise type
# LEGACY: @router.get("/tests", response_model=List[TestResponse])
# LEGACY: def get_admin_tests(
# LEGACY:     unit_id: Optional[int] = Query(None, description="Filter by unit ID"),
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db),
# LEGACY:     skip: int = Query(0, ge=0),
# LEGACY:     limit: int = Query(50, ge=1, le=100)
# LEGACY: ):
# LEGACY:     """Get tests for admin - only tests in teacher's courses, optionally filtered by unit_id"""
# LEGACY:     from app.models.test import TestQuestion
# LEGACY:     from app.models.course import Course
# LEGACY:
# LEGACY:     # Get teacher's course IDs
# LEGACY:     teacher_course_ids = [c.id for c in db.query(Course.id).filter(
# LEGACY:         Course.created_by == current_user.id
# LEGACY:     ).all()]
# LEGACY:
# LEGACY:     if not teacher_course_ids:
# LEGACY:         return []
# LEGACY:
# LEGACY:     # Build query - only tests in units that belong to teacher's courses
# LEGACY:     query = db.query(Test).options(
# LEGACY:         joinedload(Test.unit).joinedload(Unit.course),
# LEGACY:         joinedload(Test.test_questions)
# LEGACY:     ).outerjoin(Unit, Test.unit_id == Unit.id).filter(
# LEGACY:         Unit.course_id.in_(teacher_course_ids),
# LEGACY:         Test.created_by == current_user.id
# LEGACY:     )
# LEGACY:
# LEGACY:     # Apply unit_id filter if provided
# LEGACY:     if unit_id is not None:
# LEGACY:         query = query.filter(Test.unit_id == unit_id)
# LEGACY:
# LEGACY:     # Apply pagination
# LEGACY:     tests = query.order_by(Test.order_index, Test.created_at).offset(skip).limit(limit).all()
# LEGACY:
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
# LEGACY:             "segment_id": test.segment_id,
# LEGACY:             "created_by": test.created_by,
# LEGACY:             "created_at": test.created_at,
# LEGACY:             "updated_at": test.updated_at,
# LEGACY:             "course_id": test.unit.course_id if test.unit and test.unit.course else None,
# LEGACY:             "course_title": test.unit.course.title if test.unit and test.unit.course else None,
# LEGACY:             "unit_title": test.unit.title if test.unit else None,
# LEGACY:             "questions_count": len(test.test_questions) if test.test_questions else 0
# LEGACY:         }
# LEGACY:         result.append(TestResponse(**test_dict))
# LEGACY:
# LEGACY:     return result


# ── LEGACY: POST /admin/tests ──────────────────────────────────────────────────
# Replaced by: creating a test_without_timer or test_with_timer block in the segment editor
# LEGACY: @router.post("/tests", response_model=TestResponse, status_code=status.HTTP_201_CREATED)
# LEGACY: def create_admin_test(
# LEGACY:     test_data: TestCreate,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db),
# LEGACY: ):
# LEGACY:     """Create a new test (teacher only) under /admin/tests."""
# LEGACY:     teacher_course_ids = _teacher_course_ids(db, current_user)
# LEGACY:
# LEGACY:     if test_data.unit_id is not None:
# LEGACY:         unit = db.query(Unit).filter(Unit.id == test_data.unit_id).first()
# LEGACY:         if not unit or unit.course_id not in teacher_course_ids:
# LEGACY:             raise HTTPException(status_code=403, detail="Not authorized to create test in this unit")
# LEGACY:
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
# LEGACY:         created_by=current_user.id,
# LEGACY:     )
# LEGACY:
# LEGACY:     db.add(test)
# LEGACY:     db.commit()
# LEGACY:     db.refresh(test)
# LEGACY:
# LEGACY:     test = (
# LEGACY:         db.query(Test)
# LEGACY:         .options(
# LEGACY:             joinedload(Test.unit).joinedload(Unit.course),
# LEGACY:             joinedload(Test.test_questions),
# LEGACY:         )
# LEGACY:         .filter(Test.id == test.id)
# LEGACY:         .first()
# LEGACY:     )
# LEGACY:     return _test_to_response(test)


# ── LEGACY: GET /admin/tests/{test_id} ────────────────────────────────────────
# Replaced by: reading the test_without_timer / test_with_timer block from Segment.media_blocks
# LEGACY: @router.get("/tests/{test_id}", response_model=TestResponse)
# LEGACY: def get_admin_test(
# LEGACY:     test_id: int,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db),
# LEGACY: ):
# LEGACY:     """Get a specific test for admin editor (teacher only)."""
# LEGACY:     teacher_course_ids = _teacher_course_ids(db, current_user)
# LEGACY:
# LEGACY:     test = (
# LEGACY:         db.query(Test)
# LEGACY:         .options(
# LEGACY:             joinedload(Test.unit).joinedload(Unit.course),
# LEGACY:             joinedload(Test.test_questions),
# LEGACY:         )
# LEGACY:         .filter(Test.id == test_id, Test.created_by == current_user.id)
# LEGACY:         .first()
# LEGACY:     )
# LEGACY:
# LEGACY:     if not test:
# LEGACY:         raise HTTPException(status_code=404, detail="Test not found")
# LEGACY:
# LEGACY:     if test.unit_id and test.unit and test.unit.course_id not in teacher_course_ids:
# LEGACY:         raise HTTPException(status_code=403, detail="Not authorized to view this test")
# LEGACY:
# LEGACY:     return _test_to_response(test)


# ── LEGACY: PUT /admin/tests/{test_id} ────────────────────────────────────────
# Replaced by: editing the test block within Segment.media_blocks via segment editor
# LEGACY: @router.put("/tests/{test_id}", response_model=TestResponse)
# LEGACY: def update_admin_test(
# LEGACY:     test_id: int,
# LEGACY:     test_data: TestUpdate,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db),
# LEGACY: ):
# LEGACY:     """Update test metadata (teacher only) under /admin/tests."""
# LEGACY:     teacher_course_ids = _teacher_course_ids(db, current_user)
# LEGACY:
# LEGACY:     test = db.query(Test).filter(Test.id == test_id, Test.created_by == current_user.id).first()
# LEGACY:     if not test:
# LEGACY:         raise HTTPException(status_code=404, detail="Test not found")
# LEGACY:
# LEGACY:     update_dict = test_data.dict(exclude_unset=True)
# LEGACY:
# LEGACY:     if "unit_id" in update_dict and update_dict["unit_id"] is not None:
# LEGACY:         new_unit = db.query(Unit).filter(Unit.id == update_dict["unit_id"]).first()
# LEGACY:         if not new_unit or new_unit.course_id not in teacher_course_ids:
# LEGACY:             raise HTTPException(status_code=403, detail="Not authorized to move this test to that unit")
# LEGACY:
# LEGACY:     new_status = update_dict.get("status")
# LEGACY:     if new_status == TestStatus.PUBLISHED:
# LEGACY:         question_count = db.query(TestQuestion).filter(TestQuestion.test_id == test_id).count()
# LEGACY:         only_status_update = set(update_dict.keys()) == {"status"}
# LEGACY:         if question_count == 0 and only_status_update:
# LEGACY:             raise HTTPException(
# LEGACY:                 status_code=400,
# LEGACY:                 detail="Cannot publish test without questions. Please add at least one question first.",
# LEGACY:             )
# LEGACY:
# LEGACY:     for field, value in test_data.dict(exclude_unset=True).items():
# LEGACY:         setattr(test, field, value)
# LEGACY:
# LEGACY:     db.commit()
# LEGACY:     db.refresh(test)
# LEGACY:
# LEGACY:     test = (
# LEGACY:         db.query(Test)
# LEGACY:         .options(
# LEGACY:             joinedload(Test.unit).joinedload(Unit.course),
# LEGACY:             joinedload(Test.test_questions),
# LEGACY:         )
# LEGACY:         .filter(Test.id == test.id)
# LEGACY:         .first()
# LEGACY:     )
# LEGACY:     return _test_to_response(test)


# ── LEGACY: DELETE /admin/tests/{test_id} ─────────────────────────────────────
# Replaced by: deleting the test block from Segment.media_blocks via segment editor
# LEGACY: @router.delete("/tests/{test_id}", status_code=status.HTTP_204_NO_CONTENT)
# LEGACY: def delete_admin_test(
# LEGACY:     test_id: int,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """Delete a test - only if created by current teacher and belongs to teacher's course"""
# LEGACY:     from app.models.course import Course
# LEGACY:
# LEGACY:     teacher_course_ids = [c.id for c in db.query(Course.id).filter(
# LEGACY:         Course.created_by == current_user.id
# LEGACY:     ).all()]
# LEGACY:
# LEGACY:     test = db.query(Test).filter(
# LEGACY:         Test.id == test_id,
# LEGACY:         Test.created_by == current_user.id
# LEGACY:     ).first()
# LEGACY:
# LEGACY:     if not test:
# LEGACY:         raise HTTPException(status_code=404, detail="Test not found")
# LEGACY:
# LEGACY:     if test.unit_id:
# LEGACY:         unit = db.query(Unit).filter(Unit.id == test.unit_id).first()
# LEGACY:         if unit and unit.course_id not in teacher_course_ids:
# LEGACY:             raise HTTPException(status_code=403, detail="Not authorized to delete this test")
# LEGACY:
# LEGACY:     db.delete(test)
# LEGACY:     db.commit()
# LEGACY:
# LEGACY:     return None
