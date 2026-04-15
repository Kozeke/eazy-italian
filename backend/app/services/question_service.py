"""
app/services/question_service.py

Maps typed QuestionCreate schemas → Question ORM instances, and provides
the grading logic for all supported question types.

Grading contract (what `grade_question` reads from correct_answer)
------------------------------------------------------------------
  multiple_choice    {"correct_option_ids": ["opt_1"]}
  true_false         {"correct_option_ids": ["true"]}
  cloze_input        {"gaps": [{gap_id, answers, case_sensitive, ...}]}
  cloze_drag         {"gaps": [...]}            (same as cloze_input)
  matching_pairs     {"pairs": [{"left_id": "l1", "right_id": "r1"}]}
  ordering_words     {"order": ["t1", "t2", "t3"]}
  ordering_sentences {"order": ["s2", "s1"]}
  open_answer        {"expected": { <OpenAnswerExpected dict> }}

Legacy types (cloze / visual) are handled by the pre-existing inline
logic in tests.py and are NOT graded here — they fall through to the
caller's existing code path.
"""

from __future__ import annotations

import re
from typing import Any

from app.models.test import Question, QuestionType
from app.schemas.question import (
    MultipleChoiceQuestionCreate,
    TrueFalseQuestionCreate,
    ClozeInputQuestionCreate,
    ClozeDragQuestionCreate,
    MatchingPairsQuestionCreate,
    OrderingWordsQuestionCreate,
    OrderingSentencesQuestionCreate,
    OpenAnswerQuestionCreate,
    QuestionCreate,
)

# ── Normalisation helper ───────────────────────────────────────────────────────

# Maps incoming type strings to canonical QuestionType enum values.
# Keeps legacy aliases working without DB changes.
_TYPE_ALIASES: dict[str, str] = {
    # legacy → new canonical
    "cloze":          "cloze_input",
    "gap_fill":       "cloze_input",
    "single_choice":  "multiple_choice",
    "short_answer":   "open_answer",
    # new canonical (identity, for completeness)
    "multiple_choice":    "multiple_choice",
    "true_false":         "true_false",
    "cloze_input":        "cloze_input",
    "cloze_drag":         "cloze_drag",
    "matching_pairs":     "matching_pairs",
    "ordering_words":     "ordering_words",
    "ordering_sentences": "ordering_sentences",
    "open_answer":        "open_answer",
    # non-migratable legacy types stay as-is
    "visual":    "visual",
    "matching":  "matching",
    "ordering":  "ordering",
    "listening": "listening",
    "reading":   "reading",
}


def normalise_type(raw: str) -> str:
    """Return canonical QuestionType value string for *raw* input."""
    return _TYPE_ALIASES.get(raw.lower().strip(), raw.lower().strip())


# ── ORM builder ───────────────────────────────────────────────────────────────

def build_question_from_schema(
    schema: QuestionCreate,
    created_by: int,
    *,
    level_fallback: str | None = None,
) -> Question:
    """
    Construct a Question ORM instance from a validated typed schema.

    Does NOT add/flush/commit — caller owns the session lifecycle.
    """
    level = getattr(schema, "level", None) or level_fallback

    base_kwargs: dict[str, Any] = dict(
        type=schema.type,
        prompt_rich=schema.prompt,
        points=schema.score,
        autograde=schema.autograde,
        level=level,
        bank_tags=getattr(schema, "bank_tags", []),
        media=getattr(schema, "media", []),
        question_metadata=getattr(schema, "metadata", {}),
        created_by=created_by,
        # sensible defaults
        explanation_rich=None,
        shuffle_options=False,
        manual_review_threshold=None,
        expected_answer_config={},
        gaps_config=[],
        options=[],
        correct_answer={},
    )

    if isinstance(schema, MultipleChoiceQuestionCreate):
        base_kwargs.update(
            options=[o.dict() for o in schema.options],
            correct_answer={"correct_option_ids": schema.correct_option_ids},
            shuffle_options=schema.shuffle_options,
        )

    elif isinstance(schema, TrueFalseQuestionCreate):
        base_kwargs.update(
            options=[o.dict() for o in schema.options],
            correct_answer={"correct_option_ids": schema.correct_option_ids},
        )

    elif isinstance(schema, ClozeInputQuestionCreate):
        gaps = [g.dict() for g in schema.gaps]
        base_kwargs.update(
            gaps_config=gaps,
            correct_answer={"gaps": gaps},
        )

    elif isinstance(schema, ClozeDragQuestionCreate):
        gaps = [g.dict() for g in schema.gaps]
        meta: dict = dict(base_kwargs["question_metadata"])
        meta.update(
            word_bank=schema.word_bank,
            shuffle_word_bank=schema.shuffle_word_bank,
        )
        base_kwargs.update(
            gaps_config=gaps,
            correct_answer={"gaps": gaps},
            question_metadata=meta,
        )

    elif isinstance(schema, MatchingPairsQuestionCreate):
        meta = dict(base_kwargs["question_metadata"])
        meta.update(
            left_items=[i.dict() for i in schema.left_items],
            right_items=[i.dict() for i in schema.right_items],
            shuffle_right=schema.shuffle_right,
        )
        base_kwargs.update(
            question_metadata=meta,
            correct_answer={"pairs": schema.pairs},
        )

    elif isinstance(schema, OrderingWordsQuestionCreate):
        meta = dict(base_kwargs["question_metadata"])
        meta.update(
            tokens=[t.dict() for t in schema.tokens],
            punctuation_mode=schema.punctuation_mode,
        )
        base_kwargs.update(
            question_metadata=meta,
            correct_answer={"order": schema.correct_order},
        )

    elif isinstance(schema, OrderingSentencesQuestionCreate):
        meta = dict(base_kwargs["question_metadata"])
        meta.update(items=[i.dict() for i in schema.items])
        base_kwargs.update(
            question_metadata=meta,
            correct_answer={"order": schema.correct_order},
        )

    elif isinstance(schema, OpenAnswerQuestionCreate):
        expected_dict = schema.expected.dict()
        base_kwargs.update(
            expected_answer_config=expected_dict,
            correct_answer={"expected": expected_dict},
            manual_review_threshold=schema.manual_review_if_below,
        )

    else:
        raise ValueError(f"Unhandled schema type: {type(schema)}")

    return Question(**base_kwargs)


# ── Grader ────────────────────────────────────────────────────────────────────

def _norm_str(s: str, *, case_sensitive: bool = False) -> str:
    return s if case_sensitive else s.strip().lower()


def grade_question(
    q: Question,
    student_answer: Any,
    max_points: float,
) -> float:
    """
    Return points earned (0 ≤ result ≤ max_points) for a single question.

    Handles all first-wave types. Returns 0.0 for unknown / legacy types
    so the caller can apply its own grading logic as a fallback.
    """
    qt = q.type.value if hasattr(q.type, "value") else str(q.type)
    ca: dict = q.correct_answer or {}

    # ── multiple_choice / true_false ─────────────────────────────────────────
    if qt in ("multiple_choice", "true_false", "single_choice"):
        correct_ids: list = ca.get("correct_option_ids", [])
        if isinstance(student_answer, str):
            student_ids = [student_answer]
        elif isinstance(student_answer, list):
            student_ids = student_answer
        else:
            student_ids = []
        return max_points if set(student_ids) == set(correct_ids) else 0.0

    # ── cloze_input / cloze_drag / legacy cloze ──────────────────────────────
    if qt in ("cloze_input", "cloze_drag", "cloze", "gap_fill"):
        gaps: list[dict] = ca.get("gaps") or q.gaps_config or []
        if not gaps or not isinstance(student_answer, dict):
            return 0.0

        total_gap_score = sum(g.get("score", 1.0) for g in gaps)
        earned_gap_score = 0.0

        for gap in gaps:
            gid = gap.get("id") or gap.get("gap_id")
            accepted: list[str] = gap.get("answers") or (
                [gap["answer"]] + (gap.get("variants") or [])
                if "answer" in gap else []
            )
            cs = gap.get("case_sensitive", False)
            student_val = str(student_answer.get(gid, "")).strip()

            if any(
                _norm_str(student_val, case_sensitive=cs)
                == _norm_str(a, case_sensitive=cs)
                for a in accepted
            ):
                earned_gap_score += gap.get("score", 1.0)
            elif gap.get("partial_credit"):
                # Simple levenshtein-free partial: first accepted answer
                for a in accepted:
                    norm_a = _norm_str(a, case_sensitive=cs)
                    norm_s = _norm_str(student_val, case_sensitive=cs)
                    if norm_a and norm_s and norm_a in norm_s or norm_s in norm_a:
                        earned_gap_score += gap.get("score", 1.0) * 0.5
                        break

        if total_gap_score == 0:
            return 0.0
        ratio = earned_gap_score / total_gap_score
        return round(ratio * max_points, 4)

    # ── matching_pairs ────────────────────────────────────────────────────────
    if qt == "matching_pairs":
        correct_pairs: list[dict] = ca.get("pairs", [])
        if not correct_pairs or not isinstance(student_answer, list):
            return 0.0
        correct_set = {(p["left_id"], p["right_id"]) for p in correct_pairs}
        student_set = {
            (p.get("left_id"), p.get("right_id"))
            for p in student_answer
            if isinstance(p, dict)
        }
        if not correct_set:
            return 0.0
        matched = len(correct_set & student_set)
        return round((matched / len(correct_set)) * max_points, 4)

    # ── ordering_words / ordering_sentences ───────────────────────────────────
    if qt in ("ordering_words", "ordering_sentences"):
        correct_order: list[str] = ca.get("order", [])
        if not correct_order:
            return 0.0
        if isinstance(student_answer, list):
            return max_points if list(student_answer) == correct_order else 0.0
        return 0.0

    # ── open_answer ───────────────────────────────────────────────────────────
    if qt == "open_answer":
        expected = ca.get("expected") or q.expected_answer_config or {}
        mode = expected.get("mode")
        if not mode or not isinstance(student_answer, str):
            return 0.0
        text = student_answer
        if expected.get("case_insensitive", True):
            text = text.lower()

        if mode == "keywords":
            keywords: list[dict] = expected.get("keywords", [])
            if not keywords:
                return 0.0
            total_weight = sum(k.get("weight", 1.0) for k in keywords)
            matched_weight = sum(
                k.get("weight", 1.0)
                for k in keywords
                if k.get("text", "").lower() in text
            )
            ratio = matched_weight / total_weight if total_weight else 0
            return round(ratio * max_points, 4)

        if mode == "regex":
            pattern = expected.get("pattern", "")
            flags = re.IGNORECASE if expected.get("case_insensitive", True) else 0
            try:
                if pattern and re.search(pattern, student_answer, flags):
                    return max_points
            except re.error:
                pass
            return 0.0

        return 0.0

    # Unknown / legacy type — caller handles it
    return -1.0  # sentinel: "not handled here"
