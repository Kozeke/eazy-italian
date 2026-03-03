from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Union, Optional
from pydantic import BaseModel
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


# ── Regenerate single AI question ─────────────────────────────────────────────

class RegenerateQuestionResponse(BaseModel):
    """Response after regenerating one question."""
    question_id:        int
    test_id:            int
    prompt_rich:        str
    options:            List[Dict[str, Any]]
    correct_answer:     Dict[str, Any]
    explanation_rich:   str
    level:              Optional[str]
    regen_count:        int        # how many times this question has been regenerated
    generation_model:   Optional[str]
    message:            str

    class Config:
        from_attributes = True


@router.post(
    "/tests/{test_id}/questions/{question_id}/regenerate",
    response_model=RegenerateQuestionResponse,
    status_code=status.HTTP_200_OK,
    summary="Regenerate a single AI-generated question",
    tags=["AI Test Generation"],
)
async def regenerate_question(
    test_id:     int,
    question_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    """
    Replace one question in an AI-generated DRAFT test with a fresh question
    covering a different fact from the same unit content.

    Guards
    ------
    * Test must be in DRAFT status.
    * Caller must be the test creator.
    * Test must have been AI-generated (settings.generated_by_ai == true).
    * Question must belong to this test.

    The old question's prompt and correct answer are sent to the LLM as
    "do not repeat this" context, so the replacement always covers new ground.

    Regeneration history is appended to question_metadata["regen_history"]
    for full traceability.
    """
    from datetime import datetime, timezone
    from app.services.ai_test_generator import regenerate_single_question
    from app.services.ai.providers.base import AIProviderError
    from app.services.test_generation_flow import (
        _load_unit_with_content,
        _assemble_unit_content,
    )

    # ── 1. Load and guard test ────────────────────────────────────────────────
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found.")

    if test.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this test.")

    if test.status != TestStatus.DRAFT:
        raise HTTPException(
            status_code=400,
            detail="Questions can only be regenerated in DRAFT tests. Unpublish first.",
        )

    settings = test.settings or {}
    if not settings.get("generated_by_ai"):
        raise HTTPException(
            status_code=400,
            detail="Only questions in AI-generated tests can be regenerated.",
        )

    # ── 2. Confirm question belongs to this test ──────────────────────────────
    tq = (
        db.query(TestQuestion)
        .filter(
            TestQuestion.test_id    == test_id,
            TestQuestion.question_id == question_id,
        )
        .first()
    )
    if not tq:
        raise HTTPException(
            status_code=404,
            detail=f"Question {question_id} not found in test {test_id}.",
        )

    question = db.query(Question).filter(Question.id == question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question record not found.")

    # ── 3. Recover generation parameters from test.settings ──────────────────
    answers_per_question  = int(settings.get("answers_per_question", 4))
    difficulty            = settings.get("difficulty", "A1")
    content_language      = settings.get("content_language", "auto")
    question_language     = settings.get("question_language", "russian")

    # ── 4. Load unit content (RAG + metadata) ─────────────────────────────────
    if not test.unit_id:
        raise HTTPException(
            status_code=400,
            detail="This test is not linked to a unit — cannot fetch content for regeneration.",
        )

    unit = _load_unit_with_content(db, test.unit_id)
    unit_content = _assemble_unit_content(unit, db)

    if not unit_content.strip():
        raise HTTPException(
            status_code=400,
            detail=(
                "Unit has no textual content to generate questions from. "
                "Make sure RAG documents are ingested or the unit has a description."
            ),
        )

    # ── 5. Build the "old question" context dict for the prompt ───────────────
    old_question_ctx = {
        "prompt_rich":    question.prompt_rich or "",
        "options":        question.options or [],
        "correct_answer": question.correct_answer or {},
    }

    # ── 6. Call LLM ───────────────────────────────────────────────────────────
    try:
        new_q, regen_meta = await regenerate_single_question(
            unit_content         = unit_content,
            old_question         = old_question_ctx,
            answers_per_question = answers_per_question,
            difficulty           = difficulty,
            content_language     = content_language,
            question_language    = question_language,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except AIProviderError as exc:
        raise HTTPException(status_code=502, detail=f"AI provider error: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Unexpected error during regeneration.") from exc

    # ── 7. Convert options list[str] → [{id, text}] ───────────────────────────
    raw_options: list[str] = new_q["options"]
    options_payload = [
        {"id": chr(65 + i), "text": text}
        for i, text in enumerate(raw_options)
    ]
    correct_payload = {"correct_option_ids": new_q["correct_answer"]}

    # ── 8. Patch question in-place ─────────────────────────────────────────────
    # Preserve regen history so teachers can see every replacement ever made.
    meta: dict = dict(question.question_metadata or {})
    history: list = meta.get("regen_history", [])
    history.append({
        "regenerated_at":   datetime.now(timezone.utc).isoformat(),
        "replaced_prompt":  (question.prompt_rich or "")[:200],
        "model":            regen_meta.get("generation_model"),
        "attempts":         regen_meta.get("generation_attempts"),
    })
    meta["regen_history"]   = history
    meta["regen_count"]     = len(history)
    meta["last_regen_at"]   = datetime.now(timezone.utc).isoformat()
    meta["last_regen_model"]= regen_meta.get("generation_model")
    meta["generated_by_ai"] = True

    question.prompt_rich     = new_q["prompt_rich"]
    question.options         = options_payload
    question.correct_answer  = correct_payload
    question.explanation_rich= new_q.get("explanation_rich", "")
    question.question_metadata = meta

    db.add(question)
    db.commit()
    db.refresh(question)

    regen_count = len(history)
    model_name  = regen_meta.get("generation_model")

    import logging
    logging.getLogger(__name__).info(
        "Question %d in test %d regenerated (regen #%d) by user %d — model=%s",
        question_id, test_id, regen_count, current_user.id, model_name,
    )

    return RegenerateQuestionResponse(
        question_id      = question.id,
        test_id          = test_id,
        prompt_rich      = question.prompt_rich,
        options          = question.options,
        correct_answer   = question.correct_answer,
        explanation_rich = question.explanation_rich or "",
        level            = question.level,
        regen_count      = regen_count,
        generation_model = model_name,
        message          = (
            f"Question regenerated successfully (#{regen_count}). "
            f"New question covers a different topic from the unit content."
        ),
    )