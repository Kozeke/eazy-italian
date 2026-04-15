"""
app/services/grading_service.py

Service-layer grading for all supported question types.

Design
------
* grade_question() is the single public entry point.
* Returns a GradingResult dataclass — never a bare float.
* Per-type helper functions keep each grader small and testable.
* Unknown / legacy types return a fallback result (used_fallback=True)
  so the router never needs to branch on type.

GradingResult fields
--------------------
  is_correct      bool | None   – None for manual/open-answer
  score           float         – points earned (0 ≤ score ≤ max_score)
  max_score       float         – points possible for this question
  feedback        str | None    – human-readable note (optional)
  normalized_answer Any         – answer after normalization (for logging/storage)
  grading_mode    str           – "auto" | "manual" | "fallback"
  used_fallback   bool          – True when legacy / unknown type was hit
  metadata        dict          – per-type extra data (gap breakdown, etc.)
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from app.models.test import Question, QuestionType

# ── Result dataclass ──────────────────────────────────────────────────────────

@dataclass
class GradingResult:
    is_correct: bool | None
    score: float
    max_score: float
    feedback: str | None = None
    normalized_answer: Any = None
    grading_mode: str = "auto"       # "auto" | "manual" | "fallback"
    used_fallback: bool = False
    metadata: dict = field(default_factory=dict)

    # Convenience ──────────────────────────────────────────────────────────────
    @property
    def is_partial(self) -> bool:
        """True when some but not all points were earned."""
        return self.is_correct is False and self.score > 0

    def to_dict(self) -> dict:
        return {
            "is_correct": self.is_correct,
            "score": self.score,
            "max_score": self.max_score,
            "feedback": self.feedback,
            "normalized_answer": self.normalized_answer,
            "grading_mode": self.grading_mode,
            "used_fallback": self.used_fallback,
            "metadata": self.metadata,
        }


# ── Internal helpers ──────────────────────────────────────────────────────────

def _norm_str(s: str, *, case_sensitive: bool = False) -> str:
    """Normalise a string answer for comparison."""
    return s.strip() if case_sensitive else s.strip().lower()


def _qt(q: Question) -> str:
    """Return the canonical string value of a question's type."""
    return q.type.value if hasattr(q.type, "value") else str(q.type)


def _full_credit(max_score: float, *, normalized_answer: Any = None, metadata: dict | None = None) -> GradingResult:
    return GradingResult(
        is_correct=True,
        score=max_score,
        max_score=max_score,
        normalized_answer=normalized_answer,
        metadata=metadata or {},
    )


def _zero(max_score: float, *, normalized_answer: Any = None, feedback: str | None = None, metadata: dict | None = None) -> GradingResult:
    return GradingResult(
        is_correct=False,
        score=0.0,
        max_score=max_score,
        feedback=feedback,
        normalized_answer=normalized_answer,
        metadata=metadata or {},
    )


# ── Per-type graders ──────────────────────────────────────────────────────────

def grade_multiple_choice(
    q: Question,
    student_answer: Any,
    max_score: float,
) -> GradingResult:
    """
    Grade multiple_choice and true_false questions.

    correct_answer contract: {"correct_option_ids": ["opt_1", ...]}
    student_answer: str (single selection) or list[str]
    """
    ca: dict = q.correct_answer or {}
    correct_ids: list = ca.get("correct_option_ids", [])

    if isinstance(student_answer, str):
        student_ids = [student_answer]
    elif isinstance(student_answer, list):
        student_ids = list(student_answer)
    else:
        student_ids = []

    normalized = student_ids

    if set(student_ids) == set(correct_ids):
        return _full_credit(max_score, normalized_answer=normalized)
    return _zero(max_score, normalized_answer=normalized)


# true_false uses the same logic as multiple_choice
grade_true_false = grade_multiple_choice


def grade_cloze_input(
    q: Question,
    student_answer: Any,
    max_score: float,
) -> GradingResult:
    """
    Grade cloze_input questions (typed fill-in-the-blank).

    correct_answer contract: {"gaps": [{id, answers, case_sensitive, score, ...}]}
    student_answer: dict mapping gap_id → submitted string
    """
    ca: dict = q.correct_answer or {}
    gaps: list[dict] = ca.get("gaps") or q.gaps_config or []

    if not gaps or not isinstance(student_answer, dict):
        return _zero(max_score, normalized_answer=student_answer,
                     feedback="Invalid or missing answer payload for cloze question.")

    total_gap_score = sum(g.get("score", 1.0) for g in gaps)
    earned_gap_score = 0.0
    gap_breakdown: list[dict] = []

    for gap in gaps:
        gid = gap.get("id") or gap.get("gap_id")
        accepted: list[str] = gap.get("answers") or (
            [gap["answer"]] + (gap.get("variants") or [])
            if "answer" in gap else []
        )
        cs: bool = gap.get("case_sensitive", False)
        gap_max = gap.get("score", 1.0)
        student_val = str(student_answer.get(gid, "")).strip()
        norm_student = _norm_str(student_val, case_sensitive=cs)

        gap_earned = 0.0
        gap_correct = False

        if any(_norm_str(a, case_sensitive=cs) == norm_student for a in accepted):
            gap_earned = gap_max
            gap_correct = True
        elif gap.get("partial_credit"):
            # Simple containment-based partial: 50 % if student answer is
            # contained in the correct answer or vice-versa.
            for a in accepted:
                norm_a = _norm_str(a, case_sensitive=cs)
                if norm_a and norm_student and (norm_a in norm_student or norm_student in norm_a):
                    gap_earned = gap_max * 0.5
                    break

        earned_gap_score += gap_earned
        gap_breakdown.append({
            "gap_id": gid,
            "submitted": student_val,
            "correct": gap_correct,
            "earned": gap_earned,
            "max": gap_max,
        })

    if total_gap_score == 0:
        return _zero(max_score, normalized_answer=student_answer)

    ratio = earned_gap_score / total_gap_score
    earned = round(ratio * max_score, 4)
    is_correct = ratio >= 1.0

    return GradingResult(
        is_correct=is_correct,
        score=earned,
        max_score=max_score,
        normalized_answer=student_answer,
        metadata={"gap_breakdown": gap_breakdown, "ratio": ratio},
    )


def grade_cloze_drag(
    q: Question,
    student_answer: Any,
    max_score: float,
) -> GradingResult:
    """
    Grade cloze_drag (drag-word fill-in-the-blank).

    The word-bank payload from the frontend resolves to the same gap_id →
    selected_word mapping as cloze_input, so we reuse the same core grader.
    """
    # Backward-compat: frontend may send {"answers": {gap_id: word}}
    # or a bare {gap_id: word} dict — normalise here.
    if isinstance(student_answer, dict) and "answers" in student_answer:
        student_answer = student_answer["answers"]

    return grade_cloze_input(q, student_answer, max_score)


def grade_matching_pairs(
    q: Question,
    student_answer: Any,
    max_score: float,
) -> GradingResult:
    """
    Grade matching_pairs with partial credit.

    correct_answer contract: {"pairs": [{"left_id": "l1", "right_id": "r1"}]}
    student_answer: list of {"left_id": ..., "right_id": ...} dicts
    """
    ca: dict = q.correct_answer or {}
    correct_pairs: list[dict] = ca.get("pairs", [])

    if not correct_pairs or not isinstance(student_answer, list):
        return _zero(max_score, normalized_answer=student_answer,
                     feedback="Invalid answer format for matching_pairs.")

    correct_set = {(p["left_id"], p["right_id"]) for p in correct_pairs}
    student_set = {
        (p.get("left_id"), p.get("right_id"))
        for p in student_answer
        if isinstance(p, dict)
    }

    if not correct_set:
        return _zero(max_score, normalized_answer=student_answer)

    matched = len(correct_set & student_set)
    ratio = matched / len(correct_set)
    earned = round(ratio * max_score, 4)
    is_correct = ratio >= 1.0

    return GradingResult(
        is_correct=is_correct,
        score=earned,
        max_score=max_score,
        normalized_answer=list(student_set),
        metadata={"matched": matched, "total": len(correct_set), "ratio": ratio},
    )


def grade_ordering_words(
    q: Question,
    student_answer: Any,
    max_score: float,
) -> GradingResult:
    """
    Grade ordering_words — exact full-credit grading.

    correct_answer contract: {"order": ["t1", "t2", "t3"]}
    student_answer: list of token ids in submitted order
    """
    ca: dict = q.correct_answer or {}
    correct_order: list = ca.get("order", [])

    if not correct_order:
        return _zero(max_score, normalized_answer=student_answer)

    if isinstance(student_answer, list) and list(student_answer) == correct_order:
        return _full_credit(max_score, normalized_answer=student_answer)

    return _zero(
        max_score,
        normalized_answer=student_answer,
        metadata={"correct_order": correct_order},
    )


def grade_ordering_sentences(
    q: Question,
    student_answer: Any,
    max_score: float,
) -> GradingResult:
    """
    Grade ordering_sentences — exact full-credit grading.

    Reuses ordering_words logic; different type kept distinct for clarity.
    """
    return grade_ordering_words(q, student_answer, max_score)


def grade_open_answer(
    q: Question,
    student_answer: Any,
    max_score: float,
) -> GradingResult:
    """
    Grade open_answer questions.

    Auto-grading is attempted when correct_answer.expected.mode is set
    ("keywords" or "regex").  Otherwise (or when autograde=False) the result
    is explicitly marked manual so callers can surface it for teacher review.

    correct_answer contract:
      {"expected": {"mode": "keywords"|"regex", "keywords": [...], ...}}
    """
    ca: dict = q.correct_answer or {}
    expected: dict = ca.get("expected") or q.expected_answer_config or {}
    mode = expected.get("mode")

    # Not auto-gradable — mark as manual review required.
    if not mode or not q.autograde:
        return GradingResult(
            is_correct=None,
            score=0.0,
            max_score=max_score,
            feedback="Requires manual review by teacher.",
            normalized_answer=student_answer,
            grading_mode="manual",
            metadata={"requires_manual_review": True},
        )

    if not isinstance(student_answer, str):
        return _zero(max_score, normalized_answer=student_answer,
                     feedback="Open answer must be a text string.")

    text = student_answer
    case_insensitive: bool = expected.get("case_insensitive", True)
    if case_insensitive:
        text = text.lower()

    if mode == "keywords":
        keywords: list[dict] = expected.get("keywords", [])
        if not keywords:
            return GradingResult(
                is_correct=None,
                score=0.0,
                max_score=max_score,
                feedback="No keywords configured — requires manual review.",
                normalized_answer=student_answer,
                grading_mode="manual",
                metadata={"requires_manual_review": True},
            )
        total_weight = sum(k.get("weight", 1.0) for k in keywords)
        matched_weight = sum(
            k.get("weight", 1.0)
            for k in keywords
            if k.get("text", "").lower() in text
        )
        ratio = matched_weight / total_weight if total_weight else 0.0
        earned = round(ratio * max_score, 4)
        return GradingResult(
            is_correct=ratio >= 1.0,
            score=earned,
            max_score=max_score,
            normalized_answer=student_answer,
            metadata={"keyword_ratio": ratio, "matched_weight": matched_weight},
        )

    if mode == "regex":
        pattern: str = expected.get("pattern", "")
        flags = re.IGNORECASE if case_insensitive else 0
        try:
            if pattern and re.search(pattern, student_answer, flags):
                return _full_credit(max_score, normalized_answer=student_answer)
        except re.error:
            pass
        return _zero(max_score, normalized_answer=student_answer)

    # Unknown mode — fall back to manual.
    return GradingResult(
        is_correct=None,
        score=0.0,
        max_score=max_score,
        feedback=f"Unknown grading mode '{mode}' — requires manual review.",
        normalized_answer=student_answer,
        grading_mode="manual",
        metadata={"requires_manual_review": True},
    )


# ── Fallback grader ───────────────────────────────────────────────────────────

def _grade_legacy_visual(
    q: Question,
    student_answer: Any,
    max_score: float,
) -> GradingResult:
    """
    Fallback grader for legacy 'visual' questions.

    Visual questions store an answer_type inside question_metadata to
    indicate how the student is expected to respond.  We delegate to the
    appropriate grader where possible.
    """
    answer_type: str = (q.question_metadata or {}).get("answer_type", "multiple_choice")

    if answer_type in ("multiple_choice", "single_choice", "true_false"):
        result = grade_multiple_choice(q, student_answer, max_score)
    elif answer_type == "open_answer":
        result = grade_open_answer(q, student_answer, max_score)
    else:
        result = _zero(max_score, normalized_answer=student_answer,
                       feedback=f"Unhandled visual answer_type: {answer_type}")

    # Tag as fallback so callers are aware.
    result.used_fallback = True
    result.grading_mode = "fallback"
    return result


def _grade_fallback(
    q: Question,
    student_answer: Any,
    max_score: float,
) -> GradingResult:
    """
    Generic fallback for legacy / unknown question types.

    Returns a zero-score result with used_fallback=True so the caller can
    choose whether to apply its own ad-hoc logic or just surface the result.
    Old cloze / gap_fill rows that have gaps_config still attempt basic grading.
    """
    qt = _qt(q)

    # Old cloze / gap_fill rows: attempt basic gap grading.
    if qt in ("cloze", "gap_fill"):
        result = grade_cloze_input(q, student_answer, max_score)
        result.used_fallback = True
        result.grading_mode = "fallback"
        return result

    if qt == "visual":
        return _grade_legacy_visual(q, student_answer, max_score)

    # Completely unknown type — cannot grade, mark manual.
    return GradingResult(
        is_correct=None,
        score=0.0,
        max_score=max_score,
        feedback=f"Unknown question type '{qt}' — cannot auto-grade.",
        normalized_answer=student_answer,
        grading_mode="fallback",
        used_fallback=True,
        metadata={"question_type": qt},
    )


# ── Dispatch table ────────────────────────────────────────────────────────────

_GRADERS = {
    "multiple_choice":    grade_multiple_choice,
    "single_choice":      grade_multiple_choice,   # legacy alias
    "true_false":         grade_true_false,
    "cloze_input":        grade_cloze_input,
    "cloze_drag":         grade_cloze_drag,
    "matching_pairs":     grade_matching_pairs,
    "ordering_words":     grade_ordering_words,
    "ordering_sentences": grade_ordering_sentences,
    "open_answer":        grade_open_answer,
    "short_answer":       grade_open_answer,        # legacy alias
}


# ── Public entry point ────────────────────────────────────────────────────────

def grade_question(
    q: Question,
    student_answer: Any,
    max_score: float,
) -> GradingResult:
    """
    Grade a single question and return a structured GradingResult.

    This is the sole public interface for grading.  Callers (routers, tests)
    should never implement per-type grading logic themselves.

    Parameters
    ----------
    q            Question ORM instance with correct_answer / gaps_config etc.
    student_answer  Raw answer value from the submitted payload.
    max_score    Points possible for this question (from TestQuestion.points).

    Returns
    -------
    GradingResult — always a fully populated result; never raises on bad input.
    """
    qt = _qt(q)
    grader = _GRADERS.get(qt)

    if grader is not None:
        return grader(q, student_answer, max_score)

    # Legacy / unknown type — use fallback path.
    return _grade_fallback(q, student_answer, max_score)


# ── Aggregate helper ──────────────────────────────────────────────────────────

def aggregate_results(
    per_question: dict[str, GradingResult],
    passing_score_pct: float,
) -> dict:
    """
    Compute totals from a mapping of question_id → GradingResult.

    Returns a dict suitable for embedding in the attempt's detail field or
    the submit_test HTTP response.
    """
    total_earned = sum(r.score for r in per_question.values())
    total_possible = sum(r.max_score for r in per_question.values())
    pct = (total_earned / total_possible * 100) if total_possible > 0 else 0.0
    passed = pct >= passing_score_pct

    return {
        "total_earned": round(total_earned, 4),
        "total_possible": round(total_possible, 4),
        "percentage": round(pct, 4),
        "passed": passed,
        "requires_manual_review": any(
            r.grading_mode == "manual" for r in per_question.values()
        ),
    }