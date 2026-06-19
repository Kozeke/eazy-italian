"""
LEGACY FILE — test_constructor.py (test construction router)

Architecture change: Test construction is now done via the segment block editor
for test_without_timer and test_with_timer exercise types.

Old model:  Test → TestQuestion → Question (separate ORM models constructed here)
New model:  Segment.media_blocks JSONB with test_without_timer / test_with_timer blocks

Replaced by:
  - Test question construction: segment block editor (exercise block editor UI)
  - Question types:             test_without_timer / test_with_timer block schemas

This file is fully commented out and kept for reference during migration.
Do NOT re-enable these routes without migrating callers to the new segment API.
"""

# LEGACY: from fastapi import APIRouter, Depends, HTTPException, status
# LEGACY: from sqlalchemy.orm import Session
# LEGACY: from typing import List, Dict, Any, Union, Optional
# LEGACY: from pydantic import BaseModel
# LEGACY: from app.core.database import get_db
# LEGACY: from app.core.auth import get_current_teacher
# LEGACY: from app.models.user import User
# LEGACY: from app.models.test import Test, Question, TestQuestion, QuestionType, TestStatus
# LEGACY: from app.schemas.question import (
# LEGACY:     MultipleChoiceQuestionCreate,
# LEGACY:     OpenAnswerQuestionCreate,
# LEGACY:     ClozeQuestionCreate,
# LEGACY:     QuestionResponse,
# LEGACY:     TestQuestionResponse,
# LEGACY:     QuestionListResponse
# LEGACY: )

from fastapi import APIRouter

router = APIRouter()

# LEGACY: @router.post("/tests/{test_id}/questions", response_model=QuestionResponse, status_code=status.HTTP_201_CREATED)
# LEGACY: def add_question_to_test(
# LEGACY:     test_id: int,
# LEGACY:     question_data: Union[MultipleChoiceQuestionCreate, OpenAnswerQuestionCreate, ClozeQuestionCreate],
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """
# LEGACY:     Add a question to a test (test must be in DRAFT status)

# LEGACY:     Supports three question types:
# LEGACY:     1. multiple_choice - MCQ with single or multiple correct answers
# LEGACY:     2. open_answer - Open-ended with keyword/regex auto-check
# LEGACY:     3. cloze - Fill-in-the-blank with gap tokens
# LEGACY:     """
# LEGACY:     # Get test and verify it's in draft status
# LEGACY:     test = db.query(Test).filter(Test.id == test_id).first()
# LEGACY:     if not test:
# LEGACY:         raise HTTPException(status_code=404, detail="Test not found")

# LEGACY:     if test.status != TestStatus.DRAFT:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=400,
# LEGACY:             detail="Questions can only be added to tests in DRAFT status"
# LEGACY:         )

# LEGACY:     # Verify user owns the test
# LEGACY:     if test.created_by != current_user.id:
# LEGACY:         raise HTTPException(status_code=403, detail="Not authorized to modify this test")

# LEGACY:     # Create question based on type
# LEGACY:     question = Question(
# LEGACY:         type=question_data.type,
# LEGACY:         prompt_rich=question_data.prompt,
# LEGACY:         points=question_data.score,
# LEGACY:         autograde=question_data.autograde,
# LEGACY:         question_metadata=question_data.question_metadata,
# LEGACY:         created_by=current_user.id
# LEGACY:     )

# LEGACY:     # Type-specific configuration
# LEGACY:     if question_data.type == QuestionType.MULTIPLE_CHOICE:
# LEGACY:         # Multiple choice question
# LEGACY:         question.options = [opt.dict() for opt in question_data.options]
# LEGACY:         question.correct_answer = {"correct_option_ids": question_data.correct_option_ids}
# LEGACY:         question.shuffle_options = question_data.shuffle_options

# LEGACY:     elif question_data.type == QuestionType.OPEN_ANSWER:
# LEGACY:         # Open answer question
# LEGACY:         question.expected_answer_config = question_data.expected.dict()
# LEGACY:         question.correct_answer = {"expected": question_data.expected.dict()}
# LEGACY:         question.manual_review_threshold = question_data.manual_review_if_below

# LEGACY:     elif question_data.type == QuestionType.CLOZE:
# LEGACY:         # Cloze question
# LEGACY:         question.gaps_config = [gap.dict() for gap in question_data.gaps]
# LEGACY:         question.correct_answer = {"gaps": [gap.dict() for gap in question_data.gaps]}

# LEGACY:     # Save question
# LEGACY:     db.add(question)
# LEGACY:     db.flush()

# LEGACY:     # Link question to test
# LEGACY:     # Get current max order_index
# LEGACY:     max_order = db.query(TestQuestion).filter(
# LEGACY:         TestQuestion.test_id == test_id
# LEGACY:     ).count()

# LEGACY:     test_question = TestQuestion(
# LEGACY:         test_id=test_id,
# LEGACY:         question_id=question.id,
# LEGACY:         order_index=max_order,
# LEGACY:         points=question_data.score
# LEGACY:     )

# LEGACY:     db.add(test_question)
# LEGACY:     db.commit()
# LEGACY:     db.refresh(question)

# LEGACY:     return question

# LEGACY: @router.get("/tests/{test_id}/questions", response_model=QuestionListResponse)
# LEGACY: def get_test_questions(
# LEGACY:     test_id: int,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """
# LEGACY:     Get all questions for a test with ordering
# LEGACY:     """
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
# LEGACY:         "questions": test_questions
# LEGACY:     }

# LEGACY: @router.delete("/tests/{test_id}/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
# LEGACY: def remove_question_from_test(
# LEGACY:     test_id: int,
# LEGACY:     question_id: int,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """
# LEGACY:     Remove a question from a test (test must be in DRAFT status)
# LEGACY:     """
# LEGACY:     # Get test and verify
# LEGACY:     test = db.query(Test).filter(Test.id == test_id).first()
# LEGACY:     if not test:
# LEGACY:         raise HTTPException(status_code=404, detail="Test not found")

# LEGACY:     if test.created_by != current_user.id:
# LEGACY:         raise HTTPException(status_code=403, detail="Not authorized to modify this test")

# LEGACY:     # Find and delete the test-question link
# LEGACY:     test_question = db.query(TestQuestion).filter(
# LEGACY:         TestQuestion.test_id == test_id,
# LEGACY:         TestQuestion.question_id == question_id
# LEGACY:     ).first()

# LEGACY:     if not test_question:
# LEGACY:         raise HTTPException(status_code=404, detail="Question not found in this test")

# LEGACY:     db.delete(test_question)
# LEGACY:     db.commit()

# LEGACY:     return None

# LEGACY: @router.patch("/tests/{test_id}/questions/{question_id}/order", response_model=Dict[str, Any])
# LEGACY: def reorder_test_question(
# LEGACY:     test_id: int,
# LEGACY:     question_id: int,
# LEGACY:     new_order_index: int,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """
# LEGACY:     Change the order of a question in a test
# LEGACY:     """
# LEGACY:     # Get test and verify
# LEGACY:     test = db.query(Test).filter(Test.id == test_id).first()
# LEGACY:     if not test:
# LEGACY:         raise HTTPException(status_code=404, detail="Test not found")

# LEGACY:     if test.created_by != current_user.id:
# LEGACY:         raise HTTPException(status_code=403, detail="Not authorized to modify this test")

# LEGACY:     # Get the test question
# LEGACY:     test_question = db.query(TestQuestion).filter(
# LEGACY:         TestQuestion.test_id == test_id,
# LEGACY:         TestQuestion.question_id == question_id
# LEGACY:     ).first()

# LEGACY:     if not test_question:
# LEGACY:         raise HTTPException(status_code=404, detail="Question not found in this test")

# LEGACY:     old_order = test_question.order_index
# LEGACY:     test_question.order_index = new_order_index

# LEGACY:     db.commit()

# LEGACY:     return {
# LEGACY:         "test_id": test_id,
# LEGACY:         "question_id": question_id,
# LEGACY:         "old_order_index": old_order,
# LEGACY:         "new_order_index": new_order_index
# LEGACY:     }

# LEGACY: @router.patch("/tests/{test_id}/publish", response_model=Dict[str, Any])
# LEGACY: def publish_test(
# LEGACY:     test_id: int,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """
# LEGACY:     Publish a test (change status from DRAFT to PUBLISHED)
# LEGACY:     """
# LEGACY:     # Get test and verify
# LEGACY:     test = db.query(Test).filter(Test.id == test_id).first()
# LEGACY:     if not test:
# LEGACY:         raise HTTPException(status_code=404, detail="Test not found")

# LEGACY:     if test.created_by != current_user.id:
# LEGACY:         raise HTTPException(status_code=403, detail="Not authorized to modify this test")

# LEGACY:     # Verify test has questions
# LEGACY:     question_count = db.query(TestQuestion).filter(
# LEGACY:         TestQuestion.test_id == test_id
# LEGACY:     ).count()

# LEGACY:     if question_count == 0:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=400,
# LEGACY:             detail="Cannot publish test without questions"
# LEGACY:         )

# LEGACY:     # Update status
# LEGACY:     test.status = TestStatus.PUBLISHED
# LEGACY:     db.commit()
# LEGACY:     db.refresh(test)

# LEGACY:     return {
# LEGACY:         "test_id": test_id,
# LEGACY:         "status": test.status.value,
# LEGACY:         "question_count": question_count,
# LEGACY:         "message": "Test published successfully"
# LEGACY:     }

# LEGACY: @router.patch("/tests/{test_id}/unpublish", response_model=Dict[str, Any])
# LEGACY: def unpublish_test(
# LEGACY:     test_id: int,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db)
# LEGACY: ):
# LEGACY:     """
# LEGACY:     Unpublish a test (change status from PUBLISHED back to DRAFT)
# LEGACY:     """
# LEGACY:     # Get test and verify
# LEGACY:     test = db.query(Test).filter(Test.id == test_id).first()
# LEGACY:     if not test:
# LEGACY:         raise HTTPException(status_code=404, detail="Test not found")

# LEGACY:     if test.created_by != current_user.id:
# LEGACY:         raise HTTPException(status_code=403, detail="Not authorized to modify this test")

# LEGACY:     # Update status
# LEGACY:     test.status = TestStatus.DRAFT
# LEGACY:     db.commit()
# LEGACY:     db.refresh(test)

# LEGACY:     return {
# LEGACY:         "test_id": test_id,
# LEGACY:         "status": test.status.value,
# LEGACY:         "message": "Test unpublished successfully"
# LEGACY:     }


# LEGACY: # ── Regenerate single AI question ─────────────────────────────────────────────

# LEGACY: class RegenerateQuestionResponse(BaseModel):
# LEGACY:     """Response after regenerating one question."""
# LEGACY:     question_id:        int
# LEGACY:     test_id:            int
# LEGACY:     prompt_rich:        str
# LEGACY:     options:            List[Dict[str, Any]]
# LEGACY:     correct_answer:     Dict[str, Any]
# LEGACY:     explanation_rich:   str
# LEGACY:     level:              Optional[str]
# LEGACY:     regen_count:        int        # how many times this question has been regenerated
# LEGACY:     generation_model:   Optional[str]
# LEGACY:     message:            str

# LEGACY:     class Config:
# LEGACY:         from_attributes = True


# LEGACY: @router.post(
# LEGACY:     "/tests/{test_id}/questions/{question_id}/regenerate",
# LEGACY:     response_model=RegenerateQuestionResponse,
# LEGACY:     status_code=status.HTTP_200_OK,
# LEGACY:     summary="Regenerate a single AI-generated question",
# LEGACY:     tags=["AI Test Generation"],
# LEGACY: )
# LEGACY: async def regenerate_question(
# LEGACY:     test_id:     int,
# LEGACY:     question_id: int,
# LEGACY:     current_user: User = Depends(get_current_teacher),
# LEGACY:     db: Session = Depends(get_db),
# LEGACY: ):
# LEGACY:     """
# LEGACY:     Replace one question in an AI-generated DRAFT test with a fresh question
# LEGACY:     covering a different fact from the same unit content.

# LEGACY:     Guards
# LEGACY:     ------
# LEGACY:     * Test must be in DRAFT status.
# LEGACY:     * Caller must be the test creator.
# LEGACY:     * Test must have been AI-generated (settings.generated_by_ai == true).
# LEGACY:     * Question must belong to this test.

# LEGACY:     The old question's prompt and correct answer are sent to the LLM as
# LEGACY:     "do not repeat this" context, so the replacement always covers new ground.

# LEGACY:     Regeneration history is appended to question_metadata["regen_history"]
# LEGACY:     for full traceability.
# LEGACY:     """
# LEGACY:     from datetime import datetime, timezone
# LEGACY:     # Temporarily disable legacy single-question regeneration until module is restored.
# LEGACY:     raise HTTPException(
# LEGACY:         status_code=503,
# LEGACY:         detail="AI question regeneration is temporarily disabled in this build.",
# LEGACY:     )
# LEGACY:     from app.services.ai.providers.base import AIProviderError
# LEGACY:     from app.services.test_generation_flow import (
# LEGACY:         _load_unit_with_content,
# LEGACY:         _assemble_unit_content,
# LEGACY:     )

# LEGACY:     # ── 1. Load and guard test ────────────────────────────────────────────────
# LEGACY:     test = db.query(Test).filter(Test.id == test_id).first()
# LEGACY:     if not test:
# LEGACY:         raise HTTPException(status_code=404, detail="Test not found.")

# LEGACY:     if test.created_by != current_user.id:
# LEGACY:         raise HTTPException(status_code=403, detail="Not authorized to modify this test.")

# LEGACY:     if test.status != TestStatus.DRAFT:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=400,
# LEGACY:             detail="Questions can only be regenerated in DRAFT tests. Unpublish first.",
# LEGACY:         )

# LEGACY:     settings = test.settings or {}
# LEGACY:     if not settings.get("generated_by_ai"):
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=400,
# LEGACY:             detail="Only questions in AI-generated tests can be regenerated.",
# LEGACY:         )

# LEGACY:     # ── 2. Confirm question belongs to this test ──────────────────────────────
# LEGACY:     tq = (
# LEGACY:         db.query(TestQuestion)
# LEGACY:         .filter(
# LEGACY:             TestQuestion.test_id    == test_id,
# LEGACY:             TestQuestion.question_id == question_id,
# LEGACY:         )
# LEGACY:         .first()
# LEGACY:     )
# LEGACY:     if not tq:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=404,
# LEGACY:             detail=f"Question {question_id} not found in test {test_id}.",
# LEGACY:         )

# LEGACY:     question = db.query(Question).filter(Question.id == question_id).first()
# LEGACY:     if not question:
# LEGACY:         raise HTTPException(status_code=404, detail="Question record not found.")

# LEGACY:     # ── 3. Recover generation parameters from test.settings ──────────────────
# LEGACY:     answers_per_question  = int(settings.get("answers_per_question", 4))
# LEGACY:     difficulty            = settings.get("difficulty", "A1")
# LEGACY:     content_language      = settings.get("content_language", "auto")
# LEGACY:     question_language     = settings.get("question_language", "russian")

# LEGACY:     # ── 4. Load unit content (RAG + metadata) ─────────────────────────────────
# LEGACY:     if not test.unit_id:
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=400,
# LEGACY:             detail="This test is not linked to a unit — cannot fetch content for regeneration.",
# LEGACY:         )

# LEGACY:     unit = _load_unit_with_content(db, test.unit_id)
# LEGACY:     unit_content = _assemble_unit_content(unit, db)

# LEGACY:     if not unit_content.strip():
# LEGACY:         raise HTTPException(
# LEGACY:             status_code=400,
# LEGACY:             detail=(
# LEGACY:                 "Unit has no textual content to generate questions from. "
# LEGACY:                 "Make sure RAG documents are ingested or the unit has a description."
# LEGACY:             ),
# LEGACY:         )

# LEGACY:     # ── 5. Build the "old question" context dict for the prompt ───────────────
# LEGACY:     old_question_ctx = {
# LEGACY:         "prompt_rich":    question.prompt_rich or "",
# LEGACY:         "options":        question.options or [],
# LEGACY:         "correct_answer": question.correct_answer or {},
# LEGACY:     }

# LEGACY:     # ── 6. Call LLM ───────────────────────────────────────────────────────────
# LEGACY:     try:
# LEGACY:         new_q, regen_meta = await regenerate_single_question(
# LEGACY:             unit_content         = unit_content,
# LEGACY:             old_question         = old_question_ctx,
# LEGACY:             answers_per_question = answers_per_question,
# LEGACY:             difficulty           = difficulty,
# LEGACY:             content_language     = content_language,
# LEGACY:             question_language    = question_language,
# LEGACY:         )
# LEGACY:     except ValueError as exc:
# LEGACY:         raise HTTPException(status_code=422, detail=str(exc)) from exc
# LEGACY:     except AIProviderError as exc:
# LEGACY:         raise HTTPException(status_code=502, detail=f"AI provider error: {exc}") from exc
# LEGACY:     except Exception as exc:
# LEGACY:         raise HTTPException(status_code=500, detail="Unexpected error during regeneration.") from exc

# LEGACY:     # ── 7. Convert options list[str] → [{id, text}] ───────────────────────────
# LEGACY:     raw_options: list[str] = new_q["options"]
# LEGACY:     options_payload = [
# LEGACY:         {"id": chr(65 + i), "text": text}
# LEGACY:         for i, text in enumerate(raw_options)
# LEGACY:     ]
# LEGACY:     correct_payload = {"correct_option_ids": new_q["correct_answer"]}

# LEGACY:     # ── 8. Patch question in-place ─────────────────────────────────────────────
# LEGACY:     # Preserve regen history so teachers can see every replacement ever made.
# LEGACY:     meta: dict = dict(question.question_metadata or {})
# LEGACY:     history: list = meta.get("regen_history", [])
# LEGACY:     history.append({
# LEGACY:         "regenerated_at":   datetime.now(timezone.utc).isoformat(),
# LEGACY:         "replaced_prompt":  (question.prompt_rich or "")[:200],
# LEGACY:         "model":            regen_meta.get("generation_model"),
# LEGACY:         "attempts":         regen_meta.get("generation_attempts"),
# LEGACY:     })
# LEGACY:     meta["regen_history"]   = history
# LEGACY:     meta["regen_count"]     = len(history)
# LEGACY:     meta["last_regen_at"]   = datetime.now(timezone.utc).isoformat()
# LEGACY:     meta["last_regen_model"]= regen_meta.get("generation_model")
# LEGACY:     meta["generated_by_ai"] = True

# LEGACY:     question.prompt_rich     = new_q["prompt_rich"]
# LEGACY:     question.options         = options_payload
# LEGACY:     question.correct_answer  = correct_payload
# LEGACY:     question.explanation_rich= new_q.get("explanation_rich", "")
# LEGACY:     question.question_metadata = meta

# LEGACY:     db.add(question)
# LEGACY:     db.commit()
# LEGACY:     db.refresh(question)

# LEGACY:     regen_count = len(history)
# LEGACY:     model_name  = regen_meta.get("generation_model")

# LEGACY:     import logging
# LEGACY:     logging.getLogger(__name__).info(
# LEGACY:         "Question %d in test %d regenerated (regen #%d) by user %d — model=%s",
# LEGACY:         question_id, test_id, regen_count, current_user.id, model_name,
# LEGACY:     )

# LEGACY:     return RegenerateQuestionResponse(
# LEGACY:         question_id      = question.id,
# LEGACY:         test_id          = test_id,
# LEGACY:         prompt_rich      = question.prompt_rich,
# LEGACY:         options          = question.options,
# LEGACY:         correct_answer   = question.correct_answer,
# LEGACY:         explanation_rich = question.explanation_rich or "",
# LEGACY:         level            = question.level,
# LEGACY:         regen_count      = regen_count,
# LEGACY:         generation_model = model_name,
# LEGACY:         message          = (
# LEGACY:             f"Question regenerated successfully (#{regen_count}). "
# LEGACY:             f"New question covers a different topic from the unit content."
# LEGACY:         ),
# LEGACY:     )
