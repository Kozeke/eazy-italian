"""
app/schemas/question.py

Canonical schema module for all question create / update / response logic.

Design
------
* One discriminated-union QuestionCreate type covers all supported types.
* BaseQuestionCreate / BaseQuestionUpdate hold shared fields.
* Per-type subclasses add strict validation so bad payloads are caught at the
  boundary before they ever touch the database.
* QuestionResponse is the single normalised shape returned to clients.
* Legacy "cloze" type is transparently remapped to "cloze_input" on ingest
  so existing rows and API callers keep working without modification.

Correct-answer contracts (what the grader reads)
-------------------------------------------------
  multiple_choice   → {"correct_option_ids": ["opt_1"]}
  true_false        → {"correct_option_ids": ["true"]}  (or "false")
  cloze_input       → {"gaps": [{gap_id, answers, ...}]}
  cloze_drag        → {"gaps": [{gap_id, answers, ...}]}
  matching_pairs    → {"pairs": [{"left_id": "l1", "right_id": "r1"}]}
  ordering_words    → {"order": ["t1", "t2", "t3"]}
  ordering_sentences→ {"order": ["s2", "s1"]}
  open_answer       → {"expected": { <OpenAnswerExpected as dict> }}
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Union
from datetime import datetime

from pydantic import BaseModel, Field, validator

from app.models.test import QuestionType


# ═══════════════════════════════════════════════════════════════════════════════
# Shared sub-schemas
# ═══════════════════════════════════════════════════════════════════════════════

class QuestionOption(BaseModel):
    """One selectable option for choice-style questions."""
    id: str = Field(..., description="Option identifier, e.g. 'A', 'opt_1', 'true'")
    text: str = Field(..., min_length=1)


class KeywordConfig(BaseModel):
    """Single keyword used for open-answer auto-grading."""
    text: str
    weight: float = Field(1.0, ge=0.0, le=1.0)


class OpenAnswerExpected(BaseModel):
    """Expected-answer config for OPEN_ANSWER questions."""
    mode: Literal["keywords", "regex"]
    keywords: Optional[List[KeywordConfig]] = None
    pattern: Optional[str] = None
    case_insensitive: bool = True
    normalize_accents: bool = True
    allow_typos: int = Field(0, ge=0, le=2)

    @validator("keywords", always=True)
    def _require_keywords(cls, v, values):
        if values.get("mode") == "keywords" and not v:
            raise ValueError("keywords mode requires at least one keyword")
        return v

    @validator("pattern", always=True)
    def _require_pattern(cls, v, values):
        if values.get("mode") == "regex" and not v:
            raise ValueError("regex mode requires a pattern")
        return v


class GapConfig(BaseModel):
    """One gap definition for cloze questions."""
    id: str = Field(..., description="Unique gap id, e.g. 'gap_1'")
    answers: List[str] = Field(..., min_items=1, description="Accepted answers (first = canonical)")
    case_sensitive: bool = False
    trim: bool = True
    partial_credit: bool = False
    score: float = Field(1.0, ge=0)


class MatchItem(BaseModel):
    id: str
    text: str


class OrderToken(BaseModel):
    id: str
    text: str


# ═══════════════════════════════════════════════════════════════════════════════
# Base create / update
# ═══════════════════════════════════════════════════════════════════════════════

class BaseQuestionCreate(BaseModel):
    """Fields shared by every question type on creation."""
    type: QuestionType
    prompt: str = Field(..., min_length=1, alias="prompt_rich")
    score: float = Field(1.0, ge=0, alias="points")
    autograde: bool = True
    level: Optional[str] = None
    bank_tags: List[str] = Field(default_factory=list)
    media: List[Any] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict, alias="question_metadata")

    class Config:
        populate_by_name = True


class BaseQuestionUpdate(BaseModel):
    """Partial update — all fields optional."""
    prompt: Optional[str] = Field(None, alias="prompt_rich")
    score: Optional[float] = Field(None, ge=0, alias="points")
    autograde: Optional[bool] = None
    level: Optional[str] = None
    bank_tags: Optional[List[str]] = None
    media: Optional[List[Any]] = None
    metadata: Optional[Dict[str, Any]] = Field(None, alias="question_metadata")

    class Config:
        populate_by_name = True


# ═══════════════════════════════════════════════════════════════════════════════
# Per-type CREATE schemas
# ═══════════════════════════════════════════════════════════════════════════════

class MultipleChoiceQuestionCreate(BaseQuestionCreate):
    type: Literal[QuestionType.MULTIPLE_CHOICE] = QuestionType.MULTIPLE_CHOICE
    options: List[QuestionOption] = Field(..., min_items=2)
    correct_option_ids: List[str] = Field(..., min_items=1)
    shuffle_options: bool = True

    @validator("correct_option_ids")
    def _ids_exist(cls, v, values):
        opts = values.get("options", [])
        valid = {o.id for o in opts}
        bad = [x for x in v if x not in valid]
        if bad:
            raise ValueError(f"correct_option_ids not in options: {bad}")
        return v


class TrueFalseQuestionCreate(BaseQuestionCreate):
    """True/False is a restricted multiple-choice with fixed options."""
    type: Literal[QuestionType.TRUE_FALSE] = QuestionType.TRUE_FALSE
    correct_option_id: Literal["true", "false"]

    # options are always fixed — no need to send them from client
    @property
    def options(self) -> List[QuestionOption]:
        return [
            QuestionOption(id="true", text="True"),
            QuestionOption(id="false", text="False"),
        ]

    @property
    def correct_option_ids(self) -> List[str]:
        return [self.correct_option_id]


class ClozeInputQuestionCreate(BaseQuestionCreate):
    """Typed fill-in-the-blank (student types the answer)."""
    type: Literal[QuestionType.CLOZE_INPUT] = QuestionType.CLOZE_INPUT
    gaps: List[GapConfig] = Field(..., min_items=1)

    @validator("gaps")
    def _unique_gap_ids(cls, v):
        ids = [g.id for g in v]
        if len(ids) != len(set(ids)):
            raise ValueError("gap ids must be unique")
        return v


class ClozeDragQuestionCreate(BaseQuestionCreate):
    """Drag-word fill-in-the-blank. Includes an explicit word_bank."""
    type: Literal[QuestionType.CLOZE_DRAG] = QuestionType.CLOZE_DRAG
    gaps: List[GapConfig] = Field(..., min_items=1)
    word_bank: List[str] = Field(default_factory=list, description="Draggable words shown to student")
    shuffle_word_bank: bool = True

    @validator("gaps")
    def _unique_gap_ids(cls, v):
        ids = [g.id for g in v]
        if len(ids) != len(set(ids)):
            raise ValueError("gap ids must be unique")
        return v


class MatchingPairsQuestionCreate(BaseQuestionCreate):
    """Match left items to right items."""
    type: Literal[QuestionType.MATCHING_PAIRS] = QuestionType.MATCHING_PAIRS
    left_items: List[MatchItem] = Field(..., min_items=1)
    right_items: List[MatchItem] = Field(..., min_items=1)
    pairs: List[Dict[str, str]] = Field(
        ..., min_items=1,
        description='[{"left_id": "l1", "right_id": "r1"}, ...]'
    )
    shuffle_right: bool = True

    @validator("pairs")
    def _pairs_valid(cls, v, values):
        left_ids  = {i.id for i in values.get("left_items", [])}
        right_ids = {i.id for i in values.get("right_items", [])}
        seen_left: set = set()
        for p in v:
            lid, rid = p.get("left_id"), p.get("right_id")
            if not lid or not rid:
                raise ValueError("each pair must have left_id and right_id")
            if lid not in left_ids:
                raise ValueError(f"left_id '{lid}' not in left_items")
            if rid not in right_ids:
                raise ValueError(f"right_id '{rid}' not in right_items")
            if lid in seen_left:
                raise ValueError(f"left_id '{lid}' mapped more than once")
            seen_left.add(lid)
        return v


class OrderingWordsQuestionCreate(BaseQuestionCreate):
    """Arrange scrambled word tokens into the correct sentence."""
    type: Literal[QuestionType.ORDERING_WORDS] = QuestionType.ORDERING_WORDS
    tokens: List[OrderToken] = Field(..., min_items=2)
    correct_order: List[str] = Field(..., min_items=2, description="Token ids in correct order")
    punctuation_mode: str = Field("tokenized", description="'tokenized' or 'free'")

    @validator("correct_order")
    def _order_valid(cls, v, values):
        token_ids = {t.id for t in values.get("tokens", [])}
        if set(v) != token_ids:
            raise ValueError("correct_order must be a full permutation of token ids")
        if len(v) != len(set(v)):
            raise ValueError("correct_order ids must be unique")
        return v


class OrderingSentencesQuestionCreate(BaseQuestionCreate):
    """Arrange scrambled sentences into the correct paragraph order."""
    type: Literal[QuestionType.ORDERING_SENTENCES] = QuestionType.ORDERING_SENTENCES
    items: List[OrderToken] = Field(..., min_items=2)
    correct_order: List[str] = Field(..., min_items=2)

    @validator("correct_order")
    def _order_valid(cls, v, values):
        item_ids = {i.id for i in values.get("items", [])}
        if set(v) != item_ids:
            raise ValueError("correct_order must be a full permutation of item ids")
        if len(v) != len(set(v)):
            raise ValueError("correct_order ids must be unique")
        return v


class OpenAnswerQuestionCreate(BaseQuestionCreate):
    type: Literal[QuestionType.OPEN_ANSWER] = QuestionType.OPEN_ANSWER
    expected: OpenAnswerExpected
    manual_review_if_below: Optional[float] = Field(None, ge=0.0, le=1.0)


# ── Union type used as the endpoint body ──────────────────────────────────────
QuestionCreate = Union[
    MultipleChoiceQuestionCreate,
    TrueFalseQuestionCreate,
    ClozeInputQuestionCreate,
    ClozeDragQuestionCreate,
    MatchingPairsQuestionCreate,
    OrderingWordsQuestionCreate,
    OrderingSentencesQuestionCreate,
    OpenAnswerQuestionCreate,
]

# Backward-compat aliases for legacy imports in older endpoints/modules.
# "cloze" is mapped to "cloze_input" in the current schema model.
ClozeQuestionCreate = ClozeInputQuestionCreate


# ═══════════════════════════════════════════════════════════════════════════════
# Per-type UPDATE schemas
# ═══════════════════════════════════════════════════════════════════════════════

class MultipleChoiceQuestionUpdate(BaseQuestionUpdate):
    options: Optional[List[QuestionOption]] = None
    correct_option_ids: Optional[List[str]] = None
    shuffle_options: Optional[bool] = None

    @validator("correct_option_ids", always=True)
    def _ids_if_options(cls, v, values):
        """Only validate cross-field if both supplied in the same payload."""
        opts = values.get("options")
        if v is not None and opts is not None:
            valid = {o.id for o in opts}
            bad = [x for x in v if x not in valid]
            if bad:
                raise ValueError(f"correct_option_ids not in options: {bad}")
        return v


class TrueFalseQuestionUpdate(BaseQuestionUpdate):
    correct_option_id: Optional[Literal["true", "false"]] = None


class ClozeInputQuestionUpdate(BaseQuestionUpdate):
    gaps: Optional[List[GapConfig]] = None


class ClozeDragQuestionUpdate(BaseQuestionUpdate):
    gaps: Optional[List[GapConfig]] = None
    word_bank: Optional[List[str]] = None
    shuffle_word_bank: Optional[bool] = None


class MatchingPairsQuestionUpdate(BaseQuestionUpdate):
    left_items: Optional[List[MatchItem]] = None
    right_items: Optional[List[MatchItem]] = None
    pairs: Optional[List[Dict[str, str]]] = None
    shuffle_right: Optional[bool] = None


class OrderingWordsQuestionUpdate(BaseQuestionUpdate):
    tokens: Optional[List[OrderToken]] = None
    correct_order: Optional[List[str]] = None
    punctuation_mode: Optional[str] = None


class OrderingSentencesQuestionUpdate(BaseQuestionUpdate):
    items: Optional[List[OrderToken]] = None
    correct_order: Optional[List[str]] = None


class OpenAnswerQuestionUpdate(BaseQuestionUpdate):
    expected: Optional[OpenAnswerExpected] = None
    manual_review_if_below: Optional[float] = Field(None, ge=0.0, le=1.0)


QuestionUpdate = Union[
    MultipleChoiceQuestionUpdate,
    TrueFalseQuestionUpdate,
    ClozeInputQuestionUpdate,
    ClozeDragQuestionUpdate,
    MatchingPairsQuestionUpdate,
    OrderingWordsQuestionUpdate,
    OrderingSentencesQuestionUpdate,
    OpenAnswerQuestionUpdate,
]


# ═══════════════════════════════════════════════════════════════════════════════
# Response schemas
# ═══════════════════════════════════════════════════════════════════════════════

class QuestionResponse(BaseModel):
    """
    Normalised API response for a Question ORM object.

    prompt_rich is the canonical DB column; prompt is a convenience alias
    kept so the admin editor form can bind to either field name.
    """
    id: int
    type: QuestionType
    prompt_rich: Optional[str] = None
    prompt: Optional[str] = None          # synced from prompt_rich in from_orm
    options: List[Dict[str, Any]] = Field(default_factory=list)
    correct_answer: Dict[str, Any] = Field(default_factory=dict)
    explanation_rich: Optional[str] = None
    points: float = 1.0
    shuffle_options: bool = False
    autograde: bool = True
    manual_review_threshold: Optional[float] = None
    expected_answer_config: Dict[str, Any] = Field(default_factory=dict)
    gaps_config: List[Dict[str, Any]] = Field(default_factory=list)
    question_metadata: Dict[str, Any] = Field(default_factory=dict)
    level: Optional[str] = None
    bank_tags: List[Any] = Field(default_factory=list)
    media: List[Any] = Field(default_factory=list)
    created_at: datetime
    updated_at: Optional[datetime] = None

    # ── normalisation validators ───────────────────────────────────────────────
    @validator("options", pre=True, always=True)
    def _norm_options(cls, v):
        """Accept list[str] → convert to [{id, text}]; pass list[dict] through."""
        if not v:
            return []
        out = []
        for i, opt in enumerate(v):
            if isinstance(opt, str):
                out.append({"id": chr(65 + i), "text": opt})
            elif isinstance(opt, dict):
                out.append(opt)
        return out

    @validator("correct_answer", pre=True, always=True)
    def _norm_correct(cls, v):
        return v if isinstance(v, dict) else {}

    @validator("expected_answer_config", "question_metadata", pre=True, always=True)
    def _norm_dict(cls, v):
        return v if isinstance(v, dict) else {}

    @validator("gaps_config", "bank_tags", "media", pre=True, always=True)
    def _norm_list(cls, v):
        return v if isinstance(v, list) else []

    class Config:
        from_attributes = True
        populate_by_name = True

    @classmethod
    def from_orm(cls, obj: Any) -> "QuestionResponse":
        instance = super().from_orm(obj)
        # Keep prompt ↔ prompt_rich in sync so editors bind to either alias.
        if not instance.prompt and instance.prompt_rich:
            instance.prompt = instance.prompt_rich
        elif not instance.prompt_rich and instance.prompt:
            instance.prompt_rich = instance.prompt
        return instance


class TestQuestionResponse(BaseModel):
    id: int
    test_id: int
    question_id: int
    order_index: int
    points: Optional[float] = None
    question: QuestionResponse

    class Config:
        from_attributes = True


class QuestionListResponse(BaseModel):
    test_id: int
    total_questions: int
    total_points: float
    questions: List[TestQuestionResponse]