from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_
from typing import List, Dict, Any, Optional
from datetime import datetime
from app.core.database import get_db
from app.core.auth import get_current_user, get_current_teacher
from app.models.user import User
from app.models.test import Test, TestStatus
from app.models.unit import Unit
from app.models.video import Video
from app.models.task import Task
from app.schemas.test import TestResponse, TestCreate, TestUpdate

router = APIRouter()

@router.get("/", response_model=List[TestResponse])
def get_tests(
    unit_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100
):
    """Get tests, optionally filtered by unit_id"""
    query = db.query(Test)
    
    if unit_id is not None:
        query = query.filter(Test.unit_id == unit_id)
    
    tests = query.offset(skip).limit(limit).all()
    return tests

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
    """Get a specific test"""
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    return test

@router.put("/{test_id}", response_model=TestResponse)
def update_test(
    test_id: int,
    test_data: TestUpdate,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Update a test"""
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    
    if test.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this test")
    
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
    """Delete a test"""
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    
    if test.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this test")
    
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
    Get list of all units for test creation dropdown/selection
    Returns: [{ id, title, level, status }]
    """
    units = db.query(Unit).all()
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
    Get list of all videos for test creation
    Optional filter by unit_id
    Returns: [{ id, title, unit_id, unit_title, status, duration }]
    """
    query = db.query(Video)
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
    Get list of all students for test assignment
    Returns: [{ id, email, first_name, last_name, full_name }]
    """
    from app.models.user import UserRole
    
    students = db.query(User).filter(User.role == UserRole.STUDENT).all()
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
@router.post("/{test_id}/questions", status_code=status.HTTP_201_CREATED)
def add_question_to_test(
    test_id: int,
    question_data: Dict[str, Any],
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """Add a question to a test (test must be in DRAFT status)"""
    from app.models.test import Question, TestQuestion, QuestionType
    
    # Get test and verify it's in draft status
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    
    if test.status != TestStatus.DRAFT:
        raise HTTPException(
            status_code=400,
            detail="Questions can only be added to tests in DRAFT status"
        )
    
    if test.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this test")
    
    # Create question
    question_type = question_data.get('type')
    question = Question(
        type=QuestionType(question_type),
        prompt_rich=question_data.get('prompt', ''),
        points=question_data.get('score', 1.0),
        autograde=question_data.get('autograde', True),
        question_metadata=question_data.get('metadata', {}),
        created_by=current_user.id
    )
    
    # Type-specific configuration
    if question_type == 'multiple_choice':
        question.options = question_data.get('options', [])
        question.correct_answer = {"correct_option_ids": question_data.get('correct_option_ids', [])}
        question.shuffle_options = question_data.get('shuffle_options', True)
    elif question_type == 'open_answer':
        question.expected_answer_config = question_data.get('expected', {})
        question.correct_answer = {"expected": question_data.get('expected', {})}
        question.manual_review_threshold = question_data.get('manual_review_if_below')
    elif question_type == 'cloze':
        question.gaps_config = question_data.get('gaps', [])
        question.correct_answer = {"gaps": question_data.get('gaps', [])}
    
    db.add(question)
    db.flush()
    
    # Link question to test
    max_order = db.query(TestQuestion).filter(TestQuestion.test_id == test_id).count()
    test_question = TestQuestion(
        test_id=test_id,
        question_id=question.id,
        order_index=max_order,
        points=question_data.get('score', 1.0)
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
    """Start a test attempt for a student"""
    from app.models.test import TestAttempt, AttemptStatus, TestQuestion
    
    # Get test and verify it exists and is published
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    
    if test.status != TestStatus.PUBLISHED:
        raise HTTPException(status_code=400, detail="Test is not published")
    
    # Check max attempts
    if test.settings and test.settings.get('max_attempts'):
        attempts_count = db.query(TestAttempt).filter(
            and_(
                TestAttempt.test_id == test_id,
                TestAttempt.student_id == current_user.id
            )
        ).count()
        
        if attempts_count >= test.settings['max_attempts']:
            raise HTTPException(
                status_code=400, 
                detail=f"Maximum attempts ({test.settings['max_attempts']}) reached"
            )
    
    # Create new attempt
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
    questions_data = []
    for tq in questions_list:
        q = tq.question
        question_data = {
            "id": q.id,
            "type": q.type.value,
            "prompt": q.prompt_rich,
            "score": tq.points,
        }
        
        if q.type.value == 'multiple_choice':
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
    answers: Dict[str, Any],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Submit test answers and calculate score"""
    from app.models.test import TestAttempt, AttemptStatus, TestQuestion
    
    # Get the active attempt
    attempt = db.query(TestAttempt).filter(
        and_(
            TestAttempt.test_id == test_id,
            TestAttempt.student_id == current_user.id,
            TestAttempt.status == AttemptStatus.IN_PROGRESS
        )
    ).order_by(TestAttempt.started_at.desc()).first()
    
    if not attempt:
        raise HTTPException(status_code=404, detail="No active test attempt found")
    
    # Get test
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    
    # Get all questions with their correct answers
    test_questions = db.query(TestQuestion).options(
        joinedload(TestQuestion.question)
    ).filter(TestQuestion.test_id == test_id).all()
    
    # Grade the test
    total_score = 0
    max_score = 0
    results_detail = {}
    
    # Debug: print the incoming answers
    print(f"DEBUG: Incoming answers payload: {answers}")
    
    # Try to get answers from the payload
    # Frontend sends {"answers": {"answers": {question_id: answer}}}
    # Need to unwrap the double nesting
    if isinstance(answers, dict):
        submitted_answers = answers.get('answers', {})
        # If there's another 'answers' key inside, unwrap it
        if isinstance(submitted_answers, dict) and 'answers' in submitted_answers:
            submitted_answers = submitted_answers['answers']
    else:
        submitted_answers = {}
    
    print(f"DEBUG: Extracted submitted_answers: {submitted_answers}")
    
    for tq in test_questions:
        q = tq.question
        question_id = str(q.id)
        max_score += tq.points
        
        student_answer = submitted_answers.get(question_id)
        is_correct = False
        points_earned = 0
        
        # Debug logging
        print(f"DEBUG Question {question_id}: type={q.type.value}, autograde={q.autograde}")
        print(f"DEBUG Question {question_id}: correct_answer={q.correct_answer}")
        print(f"DEBUG Question {question_id}: student_answer={student_answer}")
        
        if q.autograde:
            # Auto-grade based on question type
            if q.type.value == 'multiple_choice':
                correct_ids = q.correct_answer.get('correct_option_ids', [])
                # Normalize student_answer to a list for comparison
                # Frontend sends single selection as a string, multiple as an array
                if isinstance(student_answer, str):
                    student_answer_list = [student_answer]
                elif isinstance(student_answer, list):
                    student_answer_list = student_answer
                else:
                    student_answer_list = []
                
                # Compare sets to handle order differences
                if set(student_answer_list) == set(correct_ids):
                    is_correct = True
                    points_earned = tq.points
            
            elif q.type.value == 'open_answer':
                # Simple keyword matching for now
                expected_config = q.expected_answer_config or {}
                if expected_config.get('mode') == 'keywords':
                    keywords = expected_config.get('keywords', [])
                    if student_answer and isinstance(student_answer, str):
                        answer_lower = student_answer.lower()
                        matched = sum(1 for kw in keywords if kw.get('text', '').lower() in answer_lower)
                        if matched >= len(keywords) * 0.6:  # 60% keyword match
                            is_correct = True
                            points_earned = tq.points
            
            elif q.type.value == 'cloze':
                # Check gaps
                gaps_config = q.gaps_config or []
                if isinstance(student_answer, dict):
                    correct_gaps = 0
                    for gap in gaps_config:
                        gap_id = gap.get('id')
                        correct_answer = gap.get('answer', '').strip().lower()
                        student_gap_answer = student_answer.get(gap_id, '').strip().lower()
                        if correct_answer == student_gap_answer:
                            correct_gaps += 1
                    
                    if correct_gaps == len(gaps_config):
                        is_correct = True
                        points_earned = tq.points
                    elif gap.get('partial_credit') and correct_gaps > 0:
                        points_earned = (correct_gaps / len(gaps_config)) * tq.points
        
        total_score += points_earned
        
        results_detail[question_id] = {
            "question_id": q.id,
            "student_answer": student_answer,
            "is_correct": is_correct,
            "points_earned": points_earned,
            "points_possible": tq.points
        }
    
    # Calculate percentage
    percentage = (total_score / max_score * 100) if max_score > 0 else 0
    
    # Update attempt
    attempt.submitted_at = datetime.utcnow()
    attempt.score = percentage
    attempt.detail = results_detail
    attempt.status = AttemptStatus.COMPLETED
    
    db.commit()
    db.refresh(attempt)
    
    # Check if passed
    passed = percentage >= test.passing_score
    
    return {
        "attempt_id": attempt.id,
        "score": percentage,
        "passed": passed,
        "points_earned": total_score,
        "points_possible": max_score,
        "results": results_detail if test.settings.get('show_results_immediately', True) else None,
        "submitted_at": attempt.submitted_at
    }

@router.get("/{test_id}/attempts")
def get_test_attempts(
    test_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all attempts for a test by the current student"""
    from app.models.test import TestAttempt
    
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
        "attempts_remaining": test.settings.get('max_attempts', 999) - len(attempts) if test.settings.get('max_attempts') else None,
        "best_score": max((a.score for a in attempts if a.score is not None), default=None)
    }