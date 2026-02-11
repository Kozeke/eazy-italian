"""
Question formatting helpers - reusable across endpoints
"""
import random
from typing import Dict, Any, List
from app.models.test import Question, QuestionType


# Define question types that have options
TYPES_WITH_OPTIONS = [
    QuestionType.MULTIPLE_CHOICE,
    QuestionType.SINGLE_CHOICE,
    QuestionType.MATCHING,
    QuestionType.ORDERING,
]

TYPES_WITH_GAPS = [
    QuestionType.CLOZE,
    QuestionType.GAP_FILL,
]

TYPES_WITH_MEDIA = [
    QuestionType.LISTENING,
    QuestionType.READING,
    QuestionType.VISUAL,
]


def format_question_for_test(
    question: Question,
    test_settings: Dict[str, Any],
    points_override: float = None,
    include_answers: bool = False
) -> Dict[str, Any]:
    """
    Format a question for test delivery (student view).
    
    Args:
        question: The Question model instance
        test_settings: Test configuration (shuffle options, etc.)
        points_override: Override question points (from TestQuestion)
        include_answers: Whether to include correct answers (for review)
    
    Returns:
        Dictionary with question data formatted for frontend
    """
    question_data = {
        "id": question.id,
        "type": question.type.value,
        "prompt": question.prompt_rich,
        "points": points_override if points_override is not None else question.points,
    }
    
    # Add media if present
    if question.media:
        question_data['media'] = question.media
    
    # Handle questions with options (MCQ, Single Choice, Matching, Ordering)
    if question.type in TYPES_WITH_OPTIONS:
        options = question.options or []
        
        # Shuffle options if configured
        should_shuffle = (
            test_settings.get('shuffle_options', False) and 
            question.shuffle_options
        )
        if should_shuffle:
            options = random.sample(options, len(options))
        
        question_data['options'] = options
    
    # Handle gap-fill questions (Cloze, Gap Fill)
    elif question.type in TYPES_WITH_GAPS:
        question_data['gaps_count'] = len(question.gaps_config or [])
        
        if question.type == QuestionType.GAP_FILL:
            # Include word bank if configured
            if question.expected_answer_config:
                word_bank = question.expected_answer_config.get('word_bank')
                if word_bank:
                    question_data['word_bank'] = word_bank
        
        if question.type == QuestionType.CLOZE:
            # Optionally include gap positions/hints
            question_data['gaps_config'] = question.gaps_config
    
    # Handle open-ended questions
    elif question.type in [QuestionType.OPEN_ANSWER, QuestionType.SHORT_ANSWER]:
        # Include constraints if configured
        if question.expected_answer_config:
            constraints = {}
            if 'max_length' in question.expected_answer_config:
                constraints['max_length'] = question.expected_answer_config['max_length']
            if 'min_words' in question.expected_answer_config:
                constraints['min_words'] = question.expected_answer_config['min_words']
            if constraints:
                question_data['constraints'] = constraints
    
    # Handle media-based questions (Listening, Reading, Visual)
    elif question.type in TYPES_WITH_MEDIA:
        # Media already added above, but ensure it's present
        if not question.media:
            # Log warning - these types should have media
            import logging
            logging.warning(f"Question {question.id} of type {question.type} has no media")
        
        # Some media questions also have options (e.g., visual identification)
        if question.options:
            question_data['options'] = question.options
    
    # Include correct answer if requested (for review mode)
    if include_answers:
        question_data['correct_answer'] = question.correct_answer
        if question.explanation_rich:
            question_data['explanation'] = question.explanation_rich
    
    return question_data


def format_questions_for_test(
    questions_with_points: List[tuple],  # [(Question, points_override), ...]
    test_settings: Dict[str, Any],
    include_answers: bool = False
) -> List[Dict[str, Any]]:
    """
    Format multiple questions for test delivery.
    
    Args:
        questions_with_points: List of (Question, points) tuples
        test_settings: Test configuration
        include_answers: Whether to include correct answers
    
    Returns:
        List of formatted question dictionaries
    """
    return [
        format_question_for_test(
            question=q,
            test_settings=test_settings,
            points_override=points,
            include_answers=include_answers
        )
        for q, points in questions_with_points
    ]


def validate_question_answer(
    question: Question,
    student_answer: Any
) -> Dict[str, Any]:
    """
    Validate and score a student's answer to a question.
    
    Args:
        question: The Question model instance
        student_answer: The student's submitted answer
    
    Returns:
        Dictionary with validation results:
        {
            'is_correct': bool,
            'score': float,
            'feedback': str (optional)
        }
    """
    result = {
        'is_correct': False,
        'score': 0.0,
    }
    
    # Multiple Choice - check if all correct options selected
    if question.type == QuestionType.MULTIPLE_CHOICE:
        correct = set(question.correct_answer)
        submitted = set(student_answer) if isinstance(student_answer, list) else set()
        
        if correct == submitted:
            result['is_correct'] = True
            result['score'] = question.points
        else:
            # Partial credit: (correct selections - incorrect selections) / total correct
            correct_selections = len(correct & submitted)
            incorrect_selections = len(submitted - correct)
            partial_score = max(0, correct_selections - incorrect_selections) / len(correct)
            result['score'] = question.points * partial_score
    
    # Single Choice - exact match
    elif question.type == QuestionType.SINGLE_CHOICE:
        if student_answer == question.correct_answer:
            result['is_correct'] = True
            result['score'] = question.points
    
    # Open Answer - keyword/regex matching (if autograde enabled)
    elif question.type in [QuestionType.OPEN_ANSWER, QuestionType.SHORT_ANSWER]:
        if question.autograde and question.expected_answer_config:
            keywords = question.expected_answer_config.get('keywords', [])
            if keywords:
                answer_lower = str(student_answer).lower()
                matches = sum(1 for kw in keywords if kw.lower() in answer_lower)
                if matches >= len(keywords) * 0.7:  # 70% keyword match
                    result['is_correct'] = True
                    result['score'] = question.points
                else:
                    result['score'] = question.points * (matches / len(keywords))
        else:
            # Manual grading required
            result['requires_manual_review'] = True
    
    # Cloze - check each gap
    elif question.type == QuestionType.CLOZE:
        if isinstance(student_answer, dict):
            gaps = question.gaps_config or []
            correct_count = 0
            for i, gap in enumerate(gaps):
                gap_answer = student_answer.get(str(i))
                if gap_answer and gap_answer.lower().strip() == gap['answer'].lower().strip():
                    correct_count += 1
            
            if correct_count == len(gaps):
                result['is_correct'] = True
                result['score'] = question.points
            else:
                result['score'] = question.points * (correct_count / len(gaps))
    
    # Matching - check pairs
    elif question.type == QuestionType.MATCHING:
        if isinstance(student_answer, dict):
            correct_pairs = question.correct_answer
            correct_count = sum(
                1 for key, value in student_answer.items()
                if correct_pairs.get(key) == value
            )
            
            if correct_count == len(correct_pairs):
                result['is_correct'] = True
                result['score'] = question.points
            else:
                result['score'] = question.points * (correct_count / len(correct_pairs))
    
    # Ordering - check sequence
    elif question.type == QuestionType.ORDERING:
        if isinstance(student_answer, list):
            if student_answer == question.correct_answer:
                result['is_correct'] = True
                result['score'] = question.points
            else:
                # Partial credit based on position accuracy
                correct_positions = sum(
                    1 for i, item in enumerate(student_answer)
                    if i < len(question.correct_answer) and item == question.correct_answer[i]
                )
                result['score'] = question.points * (correct_positions / len(question.correct_answer))
    
    # Gap Fill - check filled gaps
    elif question.type == QuestionType.GAP_FILL:
        if isinstance(student_answer, dict):
            gaps = question.gaps_config or []
            correct_count = sum(
                1 for i, gap in enumerate(gaps)
                if student_answer.get(str(i), '').lower().strip() == gap['answer'].lower().strip()
            )
            
            if correct_count == len(gaps):
                result['is_correct'] = True
                result['score'] = question.points
            else:
                result['score'] = question.points * (correct_count / len(gaps))
    
    # Add explanation if question has one
    if result.get('is_correct') or question.explanation_rich:
        result['explanation'] = question.explanation_rich
    
    return result


def get_question_type_label(question_type: QuestionType) -> str:
    """
    Get human-readable label for question type.
    
    Args:
        question_type: QuestionType enum member
    
    Returns:
        Human-readable string
    """
    labels = {
        QuestionType.MULTIPLE_CHOICE: "Multiple Choice",
        QuestionType.SINGLE_CHOICE: "Single Choice",
        QuestionType.OPEN_ANSWER: "Open Answer",
        QuestionType.SHORT_ANSWER: "Short Answer",
        QuestionType.CLOZE: "Fill in the Blanks",
        QuestionType.GAP_FILL: "Gap Fill",
        QuestionType.MATCHING: "Matching",
        QuestionType.ORDERING: "Ordering",
        QuestionType.LISTENING: "Listening",
        QuestionType.READING: "Reading",
        QuestionType.VISUAL: "Visual",
    }
    return labels.get(question_type, question_type.value)