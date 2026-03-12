from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional

from app.core.database import get_db
from app.core.auth import get_current_teacher
from app.models.user import User, UserRole
from app.models.test import Test, TestStatus
from app.models.unit import Unit
from app.schemas.test import TestResponse

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
    ).join(Unit).filter(
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
