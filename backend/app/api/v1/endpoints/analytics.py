"""
app/api/v1/endpoints/analytics.py
===================================
Teacher analytics — mines TestAttempt.detail JSON to surface:

  GET /admin/analytics/course/{course_id}/overview   → headline numbers
  GET /admin/analytics/course/{course_id}/questions  → most-failed questions
  GET /admin/analytics/course/{course_id}/units      → avg score per unit
  GET /admin/analytics/student/{student_id}          → student weak areas

All endpoints are scoped to the requesting teacher's own courses.
"""

from __future__ import annotations

from collections import defaultdict, Counter
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, and_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.auth import get_current_teacher
from app.models.user import User
from app.models.course import Course
from app.models.unit import Unit
from app.models.test import Test, TestAttempt, AttemptStatus, Question

router = APIRouter(prefix="/admin/analytics", tags=["Analytics"])


# ─────────────────────────────────────────────────────────────────────────────
# Shared helper
# ─────────────────────────────────────────────────────────────────────────────

def _assert_course_owner(db: Session, course_id: int, teacher: User) -> Course:
    """Raise 404 if course doesn't exist or 403 if teacher doesn't own it."""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if course.created_by != teacher.id:
        raise HTTPException(status_code=403, detail="Not your course")
    return course


def _completed_attempts_for_course(db: Session, course_id: int):
    """Return all COMPLETED TestAttempts for every test inside this course."""
    return (
        db.query(TestAttempt)
        .join(Test, Test.id == TestAttempt.test_id)
        .join(Unit, Unit.id == Test.unit_id)
        .filter(
            Unit.course_id == course_id,
            TestAttempt.status == AttemptStatus.COMPLETED,
        )
        .all()
    )


# ─────────────────────────────────────────────────────────────────────────────
# 1. Course overview  (headline numbers)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/course/{course_id}/overview")
def course_overview(
    course_id: int,
    db: Session = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    """
    Headline metrics for a course:
      - total_students   enrolled unique students
      - total_attempts   completed test attempts
      - avg_score        mean score across all attempts
      - pass_rate        % of attempts that passed
      - completion_rate  % of enrolled students who finished ≥1 test
    """
    course = _assert_course_owner(db, course_id, teacher)
    attempts = _completed_attempts_for_course(db, course_id)

    if not attempts:
        return {
            "course_id": course_id,
            "course_title": course.title,
            "total_students": 0,
            "total_attempts": 0,
            "avg_score": None,
            "pass_rate": None,
            "completion_rate": None,
        }

    scores = [a.score for a in attempts if a.score is not None]
    unique_students = {a.student_id for a in attempts}

    # enrolled students count
    from app.models.enrollment import CourseEnrollment
    enrolled_count = (
        db.query(func.count(CourseEnrollment.id))
        .filter(CourseEnrollment.course_id == course_id)
        .scalar()
    ) or 0

    # pass_rate: attempt.score >= test.passing_score
    test_map = {t.id: t for t in db.query(Test).join(Unit).filter(Unit.course_id == course_id).all()}
    passed = sum(
        1 for a in attempts
        if a.score is not None
        and a.test_id in test_map
        and a.score >= test_map[a.test_id].passing_score
    )

    return {
        "course_id": course_id,
        "course_title": course.title,
        "total_students": enrolled_count,
        "total_attempts": len(attempts),
        "avg_score": round(sum(scores) / len(scores), 1) if scores else None,
        "pass_rate": round(passed / len(attempts) * 100, 1),
        "completion_rate": round(len(unique_students) / enrolled_count * 100, 1) if enrolled_count else None,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 2. Most-failed questions
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/course/{course_id}/questions")
def failed_questions(
    course_id: int,
    limit: int = 10,
    db: Session = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    """
    Returns questions ranked by failure rate (highest first).

    Each item:
      question_id, prompt (truncated), type,
      attempt_count, correct_count, fail_rate (0-100),
      avg_score_pct
    """
    _assert_course_owner(db, course_id, teacher)
    attempts = _completed_attempts_for_course(db, course_id)

    # Tally per question_id
    tally: dict[int, dict[str, Any]] = defaultdict(
        lambda: {"attempts": 0, "correct": 0, "score_sum": 0.0, "max_sum": 0.0}
    )

    for attempt in attempts:
        for qid_str, detail in (attempt.detail or {}).items():
            try:
                qid = int(qid_str)
            except ValueError:
                continue

            t = tally[qid]
            t["attempts"] += 1

            # Support both `correct` (old) and `is_correct` (new) keys
            is_correct = detail.get("is_correct") or detail.get("correct") or False
            if is_correct:
                t["correct"] += 1

            score = detail.get("score") or detail.get("points") or 0
            max_s = detail.get("max_score") or detail.get("max_points") or 0
            t["score_sum"] += float(score)
            t["max_sum"]   += float(max_s)

    if not tally:
        return {"course_id": course_id, "questions": []}

    # Fetch question metadata in one query
    q_ids = list(tally.keys())
    questions = {q.id: q for q in db.query(Question).filter(Question.id.in_(q_ids)).all()}

    results = []
    for qid, t in tally.items():
        if t["attempts"] == 0:
            continue
        fail_rate = round((1 - t["correct"] / t["attempts"]) * 100, 1)
        avg_score_pct = (
            round(t["score_sum"] / t["max_sum"] * 100, 1) if t["max_sum"] > 0 else None
        )
        q = questions.get(qid)
        results.append({
            "question_id": qid,
            "prompt": _truncate(q.prompt_rich if q else "Unknown question", 120),
            "type": q.type.value if q else "unknown",
            "attempt_count": t["attempts"],
            "correct_count": t["correct"],
            "fail_rate": fail_rate,
            "avg_score_pct": avg_score_pct,
        })

    results.sort(key=lambda x: x["fail_rate"], reverse=True)
    return {
        "course_id": course_id,
        "questions": results[:limit],
    }


# ─────────────────────────────────────────────────────────────────────────────
# 3. Average score per unit
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/course/{course_id}/units")
def unit_scores(
    course_id: int,
    db: Session = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    """
    Per-unit breakdown:
      unit_id, unit_title, test_count,
      avg_score, pass_rate, attempt_count
    Ordered by avg_score ascending (weakest units first — most useful for teachers).
    """
    _assert_course_owner(db, course_id, teacher)

    # Get all units with their tests
    units = (
        db.query(Unit)
        .filter(Unit.course_id == course_id)
        .order_by(Unit.order_index)
        .all()
    )
    unit_map = {u.id: u for u in units}

    # All tests in this course
    tests = (
        db.query(Test)
        .filter(Test.unit_id.in_(unit_map.keys()))
        .all()
    )
    test_to_unit = {t.id: t.unit_id for t in tests}
    test_passing = {t.id: t.passing_score for t in tests}

    # All completed attempts for those tests
    attempts = (
        db.query(TestAttempt)
        .filter(
            TestAttempt.test_id.in_(test_to_unit.keys()),
            TestAttempt.status == AttemptStatus.COMPLETED,
        )
        .all()
    )

    # Aggregate per unit
    unit_stats: dict[int, dict] = defaultdict(
        lambda: {"scores": [], "passed": 0, "total": 0, "test_ids": set()}
    )
    for a in attempts:
        uid = test_to_unit.get(a.test_id)
        if uid is None:
            continue
        s = unit_stats[uid]
        if a.score is not None:
            s["scores"].append(a.score)
        s["total"] += 1
        s["test_ids"].add(a.test_id)
        if a.score is not None and a.score >= test_passing.get(a.test_id, 100):
            s["passed"] += 1

    rows = []
    for unit in units:
        s = unit_stats[unit.id]
        scores = s["scores"]
        rows.append({
            "unit_id": unit.id,
            "unit_title": unit.title,
            "order_index": unit.order_index,
            "test_count": len([t for t in tests if t.unit_id == unit.id]),
            "attempt_count": s["total"],
            "avg_score": round(sum(scores) / len(scores), 1) if scores else None,
            "pass_rate": round(s["passed"] / s["total"] * 100, 1) if s["total"] else None,
        })

    # Sort: units with data, weakest first
    rows.sort(key=lambda x: (x["avg_score"] is None, x["avg_score"] or 0))

    return {"course_id": course_id, "units": rows}


# ─────────────────────────────────────────────────────────────────────────────
# 4. Student weak areas  ← updated: adds score_trend
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/student/{student_id}")
def student_weak_areas(
    student_id: int,
    course_id: int | None = None,
    db: Session = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    course_unit_ids: set[int] | None = None
    if course_id:
        _assert_course_owner(db, course_id, teacher)
        course_unit_ids = {
            u.id for u in db.query(Unit.id).filter(Unit.course_id == course_id)
        }

    student = db.query(User).filter(User.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    q = db.query(TestAttempt).filter(
        TestAttempt.student_id == student_id,
        TestAttempt.status == AttemptStatus.COMPLETED,
    )
    attempts = q.all()

    if course_unit_ids is not None:
        tests_in_course = {
            t.id for t in db.query(Test.id).filter(Test.unit_id.in_(course_unit_ids))
        }
        attempts = [a for a in attempts if a.test_id in tests_in_course]

    if not attempts:
        return {
            "student_id": student_id,
            "student_name": f"{student.first_name} {student.last_name}",
            "message": "No completed attempts found",
            "total_attempts": 0,
            "overall_avg_score": None,
            "score_trend": [],
            "weakest_units": [],
            "weakest_question_types": [],
            "struggle_questions": [],
        }

    # ── Pre-fetch test + unit metadata ────────────────────────────────────────
    test_meta_map = {
        t.id: t
        for t in db.query(Test).filter(Test.id.in_({a.test_id for a in attempts})).all()
    }
    unit_ids_needed = {t.unit_id for t in test_meta_map.values() if t.unit_id}
    unit_meta_map = {
        u.id: u for u in db.query(Unit).filter(Unit.id.in_(unit_ids_needed)).all()
    }

    # ── Score trend — chronological ───────────────────────────────────────────
    score_trend = []
    for attempt in sorted(attempts, key=lambda a: a.submitted_at or a.started_at or ""):
        if attempt.score is None:
            continue
        test = test_meta_map.get(attempt.test_id)
        unit = unit_meta_map.get(test.unit_id) if test else None
        score_trend.append({
            "date": (attempt.submitted_at or attempt.started_at).isoformat()
                    if (attempt.submitted_at or attempt.started_at) else None,
            "score": round(attempt.score, 1),
            "test_title": test.title if test else "Unknown",
            "unit_title": unit.title if unit else None,
            "attempt_id": attempt.id,
        })

    # ── Per-question tally ────────────────────────────────────────────────────
    q_tally: dict[int, dict] = defaultdict(
        lambda: {"attempts": 0, "correct": 0, "score_sum": 0.0, "max_sum": 0.0}
    )
    for attempt in attempts:
        for qid_str, detail in (attempt.detail or {}).items():
            try:
                qid = int(qid_str)
            except ValueError:
                continue
            t = q_tally[qid]
            t["attempts"] += 1
            is_correct = detail.get("is_correct") or detail.get("correct") or False
            if is_correct:
                t["correct"] += 1
            t["score_sum"] += float(detail.get("score") or detail.get("points") or 0)
            t["max_sum"]   += float(detail.get("max_score") or detail.get("max_points") or 0)

    all_qids = list(q_tally.keys())
    questions_meta = {q.id: q for q in db.query(Question).filter(Question.id.in_(all_qids)).all()}

    # ── Weak question types ───────────────────────────────────────────────────
    type_tally: dict[str, dict] = defaultdict(lambda: {"score_sum": 0.0, "max_sum": 0.0, "count": 0})
    struggle_questions = []

    for qid, t in q_tally.items():
        q_meta = questions_meta.get(qid)
        qtype = q_meta.type.value if q_meta else "unknown"
        tt = type_tally[qtype]
        tt["score_sum"] += t["score_sum"]
        tt["max_sum"]   += t["max_sum"]
        tt["count"]     += t["attempts"]
        if t["attempts"] > 0 and (1 - t["correct"] / t["attempts"]) > 0.5:
            struggle_questions.append({
                "question_id": qid,
                "prompt": _truncate(q_meta.prompt_rich if q_meta else "Unknown", 100),
                "type": qtype,
                "fail_rate": round((1 - t["correct"] / t["attempts"]) * 100, 1),
                "attempt_count": t["attempts"],
            })

    weakest_types = [
        {"type": qtype, "avg_score_pct": round(tt["score_sum"] / tt["max_sum"] * 100, 1), "question_count": tt["count"]}
        for qtype, tt in type_tally.items() if tt["max_sum"] > 0
    ]
    weakest_types.sort(key=lambda x: x["avg_score_pct"])

    # ── Weak units ────────────────────────────────────────────────────────────
    unit_score_map: dict[int, list[float]] = defaultdict(list)
    for attempt in attempts:
        test = test_meta_map.get(attempt.test_id)
        if test and test.unit_id and attempt.score is not None:
            unit_score_map[test.unit_id].append(attempt.score)

    weakest_units = []
    for uid, scores in unit_score_map.items():
        unit = unit_meta_map.get(uid)
        weakest_units.append({
            "unit_id": uid,
            "unit_title": unit.title if unit else "Unknown",
            "avg_score": round(sum(scores) / len(scores), 1),
            "attempt_count": len(scores),
        })
    weakest_units.sort(key=lambda x: x["avg_score"])

    overall_scores = [a.score for a in attempts if a.score is not None]
    struggle_questions.sort(key=lambda x: x["fail_rate"], reverse=True)

    return {
        "student_id": student_id,
        "student_name": f"{student.first_name} {student.last_name}",
        "overall_avg_score": round(sum(overall_scores) / len(overall_scores), 1) if overall_scores else None,
        "total_attempts": len(attempts),
        "score_trend": score_trend,                  # ← NEW
        "weakest_units": weakest_units[:5],
        "weakest_question_types": weakest_types[:4],
        "struggle_questions": struggle_questions[:10],
    }


# ─────────────────────────────────────────────────────────────────────────────
# 5. Test-level analytics
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/test/{test_id}")
def test_analytics(
    test_id: int,
    db: Session = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    """
    Deep analytics for a single test:
      - summary         avg_score, min, max, pass_rate, total_attempts, unique_students
      - score_distribution  list of {bucket, count} for 0-10, 10-20 … 90-100
      - questions       per-question: prompt, type, fail_rate, avg_score_pct,
                        attempt_count, correct_count,
                        most_common_wrong_answer (text + frequency)
    """
    # Verify the test exists and belongs to a course owned by this teacher
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    # Ownership check via Unit → Course
    if test.unit_id:
        unit = db.query(Unit).filter(Unit.id == test.unit_id).first()
        if unit:
            course = db.query(Course).filter(Course.id == unit.course_id).first()
            if course and course.created_by != teacher.id:
                raise HTTPException(status_code=403, detail="Not your test")

    # All completed attempts for this test
    attempts = (
        db.query(TestAttempt)
        .filter(
            TestAttempt.test_id == test_id,
            TestAttempt.status == AttemptStatus.COMPLETED,
        )
        .all()
    )

    if not attempts:
        return {
            "test_id": test_id,
            "test_title": test.title,
            "summary": {
                "total_attempts": 0,
                "unique_students": 0,
                "avg_score": None,
                "min_score": None,
                "max_score": None,
                "pass_rate": None,
                "passing_score": test.passing_score,
            },
            "score_distribution": [],
            "questions": [],
        }

    # ── Summary ───────────────────────────────────────────────────────────────
    scores = [a.score for a in attempts if a.score is not None]
    unique_students = len({a.student_id for a in attempts})
    passed = sum(1 for s in scores if s >= test.passing_score)

    summary = {
        "total_attempts": len(attempts),
        "unique_students": unique_students,
        "avg_score": round(sum(scores) / len(scores), 1) if scores else None,
        "min_score": round(min(scores), 1) if scores else None,
        "max_score": round(max(scores), 1) if scores else None,
        "pass_rate": round(passed / len(scores) * 100, 1) if scores else None,
        "passing_score": test.passing_score,
    }

    # ── Score distribution — 10-point buckets ─────────────────────────────────
    buckets: dict[str, int] = {f"{i*10}-{i*10+10}": 0 for i in range(10)}
    for s in scores:
        idx = min(int(s // 10), 9)          # clamp 100 → bucket 9
        key = f"{idx*10}-{idx*10+10}"
        buckets[key] += 1

    score_distribution = [{"bucket": k, "count": v} for k, v in buckets.items()]

    # ── Per-question stats ─────────────────────────────────────────────────────
    # tally[qid] = {attempts, correct, score_sum, max_sum, wrong_answers: Counter}
    q_tally: dict[int, dict] = defaultdict(lambda: {
        "attempts": 0,
        "correct": 0,
        "score_sum": 0.0,
        "max_sum": 0.0,
        "wrong_answers": Counter(),
    })

    for attempt in attempts:
        for qid_str, detail in (attempt.detail or {}).items():
            try:
                qid = int(qid_str)
            except ValueError:
                continue

            t = q_tally[qid]
            t["attempts"] += 1

            is_correct = detail.get("is_correct") or detail.get("correct") or False
            if is_correct:
                t["correct"] += 1
            else:
                # Collect wrong answer — try several possible key names
                wrong = (
                    detail.get("given_answer")
                    or detail.get("student_answer")
                    or detail.get("selected_option")
                    or detail.get("given_option_ids")
                    or detail.get("selected_options")
                    or detail.get("student_text")
                )
                if wrong is not None:
                    # Normalise lists to a hashable string
                    if isinstance(wrong, list):
                        wrong = ", ".join(str(x) for x in sorted(wrong))
                    t["wrong_answers"][str(wrong)] += 1

            t["score_sum"] += float(detail.get("score") or detail.get("points") or 0)
            t["max_sum"]   += float(detail.get("max_score") or detail.get("max_points") or 0)

    # Fetch question metadata
    q_ids = list(q_tally.keys())
    questions_meta = {q.id: q for q in db.query(Question).filter(Question.id.in_(q_ids)).all()}

    # Build per-question rows, preserving test question order
    question_rows = []
    for qid, t in q_tally.items():
        if t["attempts"] == 0:
            continue

        q_meta = questions_meta.get(qid)
        fail_rate = round((1 - t["correct"] / t["attempts"]) * 100, 1)
        avg_score_pct = (
            round(t["score_sum"] / t["max_sum"] * 100, 1) if t["max_sum"] > 0 else None
        )

        # Most common wrong answer
        most_common_wrong = None
        if t["wrong_answers"]:
            answer_text, freq = t["wrong_answers"].most_common(1)[0]
            # Try to resolve option ID → option text for MCQ
            if q_meta and q_meta.type.value == "multiple_choice":
                opts = {o.get("id"): o.get("text") for o in (q_meta.options or [])}
                # answer_text might be "B" or "B, C"
                resolved = ", ".join(
                    opts.get(part.strip(), part.strip())
                    for part in answer_text.split(",")
                )
                answer_text = resolved

            most_common_wrong = {
                "answer": _truncate(answer_text, 100),
                "count": freq,
                "frequency_pct": round(freq / (t["attempts"] - t["correct"]) * 100, 1)
                    if (t["attempts"] - t["correct"]) > 0 else 0,
            }

        question_rows.append({
            "question_id": qid,
            "prompt": _truncate(q_meta.prompt_rich if q_meta else "Unknown", 150),
            "type": q_meta.type.value if q_meta else "unknown",
            "attempt_count": t["attempts"],
            "correct_count": t["correct"],
            "fail_rate": fail_rate,
            "avg_score_pct": avg_score_pct,
            "most_common_wrong_answer": most_common_wrong,
        })

    # Sort by fail_rate descending so hardest questions appear first
    question_rows.sort(key=lambda x: x["fail_rate"], reverse=True)

    return {
        "test_id": test_id,
        "test_title": test.title,
        "summary": summary,
        "score_distribution": score_distribution,
        "questions": question_rows,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Utility
# ─────────────────────────────────────────────────────────────────────────────

def _truncate(text: str | None, length: int) -> str:
    if not text:
        return ""
    # Strip HTML tags quickly
    import re
    clean = re.sub(r"<[^>]+>", "", text or "").strip()
    return clean[:length] + "…" if len(clean) > length else clean