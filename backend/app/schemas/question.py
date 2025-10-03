from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any, Union, Literal
from datetime import datetime
from app.models.test import QuestionType

# Base schemas
class QuestionOption(BaseModel):
    """Option for multiple choice questions"""
    id: str = Field(..., description="Option ID (A, B, C, etc.)")
    text: str = Field(..., min_length=1, description="Option text")

class KeywordConfig(BaseModel):
    """Keyword configuration for open answer auto-grading"""
    text: str = Field(..., description="Keyword to match")
    weight: float = Field(1.0, ge=0, le=1, description="Weight of this keyword")

class OpenAnswerExpected(BaseModel):
    """Expected answer configuration for open_answer questions"""
    mode: str = Field(..., description="keywords or regex")
    keywords: Optional[List[KeywordConfig]] = Field(None, description="List of keywords (for mode=keywords)")
    pattern: Optional[str] = Field(None, description="Regex pattern (for mode=regex)")
    case_insensitive: bool = Field(True, description="Ignore case")
    normalize_accents: bool = Field(True, description="Normalize accents/diacritics")
    allow_typos: int = Field(0, ge=0, le=2, description="Allow N typos (Levenshtein distance)")

class GapConfig(BaseModel):
    """Gap configuration for cloze questions"""
    id: str = Field(..., description="Gap identifier (gap_1, gap_2, etc.)")
    answer: str = Field(..., description="Correct answer")
    variants: Optional[List[str]] = Field(None, description="Alternative acceptable answers")
    case_insensitive: bool = Field(True, description="Ignore case")
    trim: bool = Field(True, description="Trim whitespace")
    partial_credit: bool = Field(False, description="Allow partial credit")
    score: float = Field(1.0, ge=0, description="Score for this gap")

# Question creation schemas
class QuestionBase(BaseModel):
    """Base schema for all question types"""
    type: QuestionType = Field(..., description="Question type")
    prompt: str = Field(..., min_length=1, description="Question prompt/text")
    score: float = Field(1.0, ge=0, description="Score/points for this question")
    autograde: bool = Field(True, description="Enable auto-grading")
    question_metadata: Dict[str, Any] = Field(default_factory=dict, description="Difficulty, tags, etc.", alias="metadata")
    
    class Config:
        populate_by_name = True

class MultipleChoiceQuestionCreate(QuestionBase):
    """Create multiple choice question"""
    type: Literal[QuestionType.MULTIPLE_CHOICE] = Field(QuestionType.MULTIPLE_CHOICE, description="Question type")
    options: List[QuestionOption] = Field(..., min_items=2, description="Answer options")
    correct_option_ids: List[str] = Field(..., min_items=1, description="IDs of correct options")
    shuffle_options: bool = Field(True, description="Shuffle options for each student")

    @validator('correct_option_ids')
    def validate_correct_options(cls, v, values):
        """Validate that correct_option_ids exist in options"""
        if 'options' in values:
            option_ids = [opt.id for opt in values['options']]
            for correct_id in v:
                if correct_id not in option_ids:
                    raise ValueError(f"correct_option_id '{correct_id}' not found in options")
        return v

class OpenAnswerQuestionCreate(QuestionBase):
    """Create open answer question with auto-check"""
    type: Literal[QuestionType.OPEN_ANSWER] = Field(QuestionType.OPEN_ANSWER, description="Question type")
    expected: OpenAnswerExpected = Field(..., description="Expected answer configuration")
    manual_review_if_below: Optional[float] = Field(None, ge=0, le=1, description="Manual review threshold")

    @validator('expected')
    def validate_expected(cls, v):
        """Validate expected answer configuration"""
        if v.mode == "keywords" and not v.keywords:
            raise ValueError("keywords mode requires at least one keyword")
        if v.mode == "regex" and not v.pattern:
            raise ValueError("regex mode requires a pattern")
        return v

class ClozeQuestionCreate(QuestionBase):
    """Create cloze (fill-in-the-blank) question"""
    type: Literal[QuestionType.CLOZE] = Field(QuestionType.CLOZE, description="Question type")
    prompt: str = Field(..., description="Text with gaps using {{gap_1}}, {{gap_2}} tokens")
    gaps: List[GapConfig] = Field(..., min_items=1, description="Gap definitions")

    @validator('prompt')
    def validate_prompt_has_gaps(cls, v, values):
        """Validate that prompt contains gap tokens"""
        if 'gaps' in values:
            for gap in values['gaps']:
                gap_token = f"{{{{{gap.id}}}}}"
                if gap_token not in v:
                    raise ValueError(f"Gap token '{gap_token}' not found in prompt")
        return v

# Union type for creating any question
QuestionCreate = Union[
    MultipleChoiceQuestionCreate,
    OpenAnswerQuestionCreate,
    ClozeQuestionCreate
]

# Response schemas
class QuestionResponse(BaseModel):
    """Question response schema"""
    id: int
    type: QuestionType
    prompt: str
    options: List[Dict[str, Any]]
    correct_answer: Dict[str, Any]
    points: float
    shuffle_options: bool
    autograde: bool
    manual_review_threshold: Optional[float]
    expected_answer_config: Dict[str, Any]
    gaps_config: List[Dict[str, Any]]
    question_metadata: Dict[str, Any]
    level: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True
        populate_by_name = True

class TestQuestionResponse(BaseModel):
    """Test question with ordering"""
    id: int
    test_id: int
    question_id: int
    order_index: int
    points: Optional[float]
    question: QuestionResponse

    class Config:
        from_attributes = True

class QuestionListResponse(BaseModel):
    """List of questions for a test"""
    test_id: int
    total_questions: int
    total_points: float
    questions: List[TestQuestionResponse]

