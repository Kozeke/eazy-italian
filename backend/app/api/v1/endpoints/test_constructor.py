from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Union
from app.core.database import get_db
from app.core.auth import get_current_teacher
from app.models.user import User
from app.models.test import Test, Question, TestQuestion, QuestionType, TestStatus
from app.schemas.question import (
    MultipleChoiceQuestionCreate,
    OpenAnswerQuestionCreate,
    ClozeQuestionCreate,
    QuestionResponse,
    TestQuestionResponse,
    QuestionListResponse
)

router = APIRouter()

@router.post("/tests/{test_id}/questions", response_model=QuestionResponse, status_code=status.HTTP_201_CREATED)
def add_question_to_test(
    test_id: int,
    question_data: Union[MultipleChoiceQuestionCreate, OpenAnswerQuestionCreate, ClozeQuestionCreate],
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """
    Add a question to a test (test must be in DRAFT status)
    
    Supports three question types:
    1. multiple_choice - MCQ with single or multiple correct answers
    2. open_answer - Open-ended with keyword/regex auto-check
    3. cloze - Fill-in-the-blank with gap tokens
    """
    # Get test and verify it's in draft status
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    
    if test.status != TestStatus.DRAFT:
        raise HTTPException(
            status_code=400,
            detail="Questions can only be added to tests in DRAFT status"
        )
    
    # Verify user owns the test
    if test.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this test")
    
    # Create question based on type
    question = Question(
        type=question_data.type,
        prompt_rich=question_data.prompt,
        points=question_data.score,
        autograde=question_data.autograde,
        question_metadata=question_data.question_metadata,
        created_by=current_user.id
    )
    
    # Type-specific configuration
    if question_data.type == QuestionType.MULTIPLE_CHOICE:
        # Multiple choice question
        question.options = [opt.dict() for opt in question_data.options]
        question.correct_answer = {"correct_option_ids": question_data.correct_option_ids}
        question.shuffle_options = question_data.shuffle_options
    
    elif question_data.type == QuestionType.OPEN_ANSWER:
        # Open answer question
        question.expected_answer_config = question_data.expected.dict()
        question.correct_answer = {"expected": question_data.expected.dict()}
        question.manual_review_threshold = question_data.manual_review_if_below
    
    elif question_data.type == QuestionType.CLOZE:
        # Cloze question
        question.gaps_config = [gap.dict() for gap in question_data.gaps]
        question.correct_answer = {"gaps": [gap.dict() for gap in question_data.gaps]}
    
    # Save question
    db.add(question)
    db.flush()
    
    # Link question to test
    # Get current max order_index
    max_order = db.query(TestQuestion).filter(
        TestQuestion.test_id == test_id
    ).count()
    
    test_question = TestQuestion(
        test_id=test_id,
        question_id=question.id,
        order_index=max_order,
        points=question_data.score
    )
    
    db.add(test_question)
    db.commit()
    db.refresh(question)
    
    return question

@router.get("/tests/{test_id}/questions", response_model=QuestionListResponse)
def get_test_questions(
    test_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """
    Get all questions for a test with ordering
    """
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
        "questions": test_questions
    }

@router.delete("/tests/{test_id}/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_question_from_test(
    test_id: int,
    question_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """
    Remove a question from a test (test must be in DRAFT status)
    """
    # Get test and verify
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    
    if test.status != TestStatus.DRAFT:
        raise HTTPException(
            status_code=400,
            detail="Questions can only be removed from tests in DRAFT status"
        )
    
    if test.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this test")
    
    # Find and delete the test-question link
    test_question = db.query(TestQuestion).filter(
        TestQuestion.test_id == test_id,
        TestQuestion.question_id == question_id
    ).first()
    
    if not test_question:
        raise HTTPException(status_code=404, detail="Question not found in this test")
    
    db.delete(test_question)
    db.commit()
    
    return None

@router.patch("/tests/{test_id}/questions/{question_id}/order", response_model=Dict[str, Any])
def reorder_test_question(
    test_id: int,
    question_id: int,
    new_order_index: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """
    Change the order of a question in a test
    """
    # Get test and verify
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    
    if test.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this test")
    
    # Get the test question
    test_question = db.query(TestQuestion).filter(
        TestQuestion.test_id == test_id,
        TestQuestion.question_id == question_id
    ).first()
    
    if not test_question:
        raise HTTPException(status_code=404, detail="Question not found in this test")
    
    old_order = test_question.order_index
    test_question.order_index = new_order_index
    
    db.commit()
    
    return {
        "test_id": test_id,
        "question_id": question_id,
        "old_order_index": old_order,
        "new_order_index": new_order_index
    }

@router.patch("/tests/{test_id}/publish", response_model=Dict[str, Any])
def publish_test(
    test_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """
    Publish a test (change status from DRAFT to PUBLISHED)
    """
    # Get test and verify
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    
    if test.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this test")
    
    # Verify test has questions
    question_count = db.query(TestQuestion).filter(
        TestQuestion.test_id == test_id
    ).count()
    
    if question_count == 0:
        raise HTTPException(
            status_code=400,
            detail="Cannot publish test without questions"
        )
    
    # Update status
    test.status = TestStatus.PUBLISHED
    db.commit()
    db.refresh(test)
    
    return {
        "test_id": test_id,
        "status": test.status.value,
        "question_count": question_count,
        "message": "Test published successfully"
    }

@router.patch("/tests/{test_id}/unpublish", response_model=Dict[str, Any])
def unpublish_test(
    test_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """
    Unpublish a test (change status from PUBLISHED back to DRAFT)
    """
    # Get test and verify
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    
    if test.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this test")
    
    # Update status
    test.status = TestStatus.DRAFT
    db.commit()
    db.refresh(test)
    
    return {
        "test_id": test_id,
        "status": test.status.value,
        "message": "Test unpublished successfully"
    }

