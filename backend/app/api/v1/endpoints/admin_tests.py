from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional

from app.core.database import get_db
from app.core.auth import get_current_teacher
from app.models.user import User, UserRole
from app.models.test import Test, TestStatus, TestQuestion
from app.models.unit import Unit
from app.schemas.test import TestResponse, TestCreate, TestUpdate
from app.models.course import Course

router = APIRouter()

@router.get("/tests", response_model=List[TestResponse])
def get_admin_tests(
    unit_id: Optional[int] = Query(None, description="Filter by unit ID"),
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100)
):
    """Get tests for admin - only tests in teacher's courses, optionally filtered by unit_id"""
    from app.models.test import TestQuestion
    from app.models.course import Course
    
    # Get teacher's course IDs
    teacher_course_ids = [c.id for c in db.query(Course.id).filter(
        Course.created_by == current_user.id
    ).all()]
    
    if not teacher_course_ids:
        return []
    
    # Build query - only tests in units that belong to teacher's courses
    query = db.query(Test).options(
        joinedload(Test.unit).joinedload(Unit.course),
        joinedload(Test.test_questions)
    ).outerjoin(Unit, Test.unit_id == Unit.id).filter(
        Unit.course_id.in_(teacher_course_ids),
        Test.created_by == current_user.id
    )
    
    # Apply unit_id filter if provided
    if unit_id is not None:
        query = query.filter(Test.unit_id == unit_id)
    
    # Apply pagination
    tests = query.order_by(Test.order_index, Test.created_at).offset(skip).limit(limit).all()
    
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
            "segment_id": test.segment_id,
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

def _teacher_course_ids(db: Session, current_user: User) -> List[int]:
    """Helper: list of course ids created by the current teacher."""
    return [
        c.id
        for c in db.query(Course.id).filter(Course.created_by == current_user.id).all()
    ]


def _test_to_response(test: Test) -> TestResponse:
    """Serialize Test -> TestResponse including optional course and questions_count."""
    return TestResponse(
        id=test.id,
        title=test.title,
        description=test.description,
        instructions=test.instructions,
        time_limit_minutes=test.time_limit_minutes,
        passing_score=test.passing_score,
        status=test.status,
        publish_at=test.publish_at,
        order_index=test.order_index,
        settings=test.settings,
        unit_id=test.unit_id,
        segment_id=getattr(test, 'segment_id', None),
        created_by=test.created_by,
        created_at=test.created_at,
        updated_at=test.updated_at,
        course_id=test.unit.course_id if test.unit and test.unit.course else None,
        course_title=test.unit.course.title if test.unit and test.unit.course else None,
        unit_title=test.unit.title if test.unit else None,
        questions_count=len(test.test_questions) if test.test_questions else 0,
    )


@router.post("/tests", response_model=TestResponse, status_code=status.HTTP_201_CREATED)
def create_admin_test(
    test_data: TestCreate,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    """Create a new test (teacher only) under /admin/tests."""
    teacher_course_ids = _teacher_course_ids(db, current_user)

    # If the request binds to a unit, ensure it belongs to teacher's courses.
    if test_data.unit_id is not None:
        unit = db.query(Unit).filter(Unit.id == test_data.unit_id).first()
        if not unit or unit.course_id not in teacher_course_ids:
            raise HTTPException(status_code=403, detail="Not authorized to create test in this unit")

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
        created_by=current_user.id,
    )

    db.add(test)
    db.commit()
    db.refresh(test)

    # Load related objects for response.
    test = (
        db.query(Test)
        .options(
            joinedload(Test.unit).joinedload(Unit.course),
            joinedload(Test.test_questions),
        )
        .filter(Test.id == test.id)
        .first()
    )
    return _test_to_response(test)


@router.get("/tests/{test_id}", response_model=TestResponse)
def get_admin_test(
    test_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    """Get a specific test for admin editor (teacher only)."""
    teacher_course_ids = _teacher_course_ids(db, current_user)

    test = (
        db.query(Test)
        .options(
            joinedload(Test.unit).joinedload(Unit.course),
            joinedload(Test.test_questions),
        )
        .filter(Test.id == test_id, Test.created_by == current_user.id)
        .first()
    )

    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    # If bound to a unit, ensure it belongs to teacher's courses.
    if test.unit_id and test.unit and test.unit.course_id not in teacher_course_ids:
        raise HTTPException(status_code=403, detail="Not authorized to view this test")

    return _test_to_response(test)


@router.put("/tests/{test_id}", response_model=TestResponse)
def update_admin_test(
    test_id: int,
    test_data: TestUpdate,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    """Update test metadata (teacher only) under /admin/tests."""
    teacher_course_ids = _teacher_course_ids(db, current_user)

    test = db.query(Test).filter(Test.id == test_id, Test.created_by == current_user.id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    update_dict = test_data.dict(exclude_unset=True)

    # If binding to a unit is being changed, ensure it belongs to teacher's courses.
    if "unit_id" in update_dict and update_dict["unit_id"] is not None:
        new_unit = db.query(Unit).filter(Unit.id == update_dict["unit_id"]).first()
        if not new_unit or new_unit.course_id not in teacher_course_ids:
            raise HTTPException(status_code=403, detail="Not authorized to move this test to that unit")

    # Check if status is being changed to PUBLISHED
    new_status = update_dict.get("status")
    if new_status == TestStatus.PUBLISHED:
        question_count = db.query(TestQuestion).filter(TestQuestion.test_id == test_id).count()
        # Only hard-block standalone status-only publish requests.
        # During the normal teacher save flow, other fields are also updated
        # alongside status, so question_count will already be > 0 from a
        # preceding POST /tests/{id}/questions call.
        only_status_update = set(update_dict.keys()) == {"status"}
        if question_count == 0 and only_status_update:
            raise HTTPException(
                status_code=400,
                detail="Cannot publish test without questions. Please add at least one question first.",
            )

    # Update fields
    for field, value in test_data.dict(exclude_unset=True).items():
        setattr(test, field, value)

    db.commit()
    db.refresh(test)

    # Load related objects for response.
    test = (
        db.query(Test)
        .options(
            joinedload(Test.unit).joinedload(Unit.course),
            joinedload(Test.test_questions),
        )
        .filter(Test.id == test.id)
        .first()
    )
    return _test_to_response(test)

@router.delete("/tests/{test_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_admin_test(
    test_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Delete a test - only if created by current teacher and belongs to teacher's course"""
    from app.models.course import Course
    
    # Get teacher's course IDs
    teacher_course_ids = [c.id for c in db.query(Course.id).filter(
        Course.created_by == current_user.id
    ).all()]
    
    # Get test and verify it exists and was created by current teacher
    test = db.query(Test).filter(
        Test.id == test_id,
        Test.created_by == current_user.id
    ).first()
    
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    
    # Verify test belongs to a unit in teacher's course (if it has a unit)
    if test.unit_id:
        unit = db.query(Unit).filter(Unit.id == test.unit_id).first()
        if unit and unit.course_id not in teacher_course_ids:
            raise HTTPException(status_code=403, detail="Not authorized to delete this test")
    
    db.delete(test)
    db.commit()
    
    return None