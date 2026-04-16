"""
app/api/v1/endpoints/homework.py
========================
Homework-block management endpoints for Unit.homework_blocks (JSONB).

Register in api.py:
    from app.routers.homework import router as homework_router
    api_router.include_router(homework_router, prefix="", tags=["Homework"])

Endpoints
---------
GET    /admin/units/{unit_id}/homework
POST   /admin/units/{unit_id}/homework/blocks
GET    /admin/units/{unit_id}/homework/blocks/{block_id}
PUT    /admin/units/{unit_id}/homework/blocks/{block_id}
DELETE /admin/units/{unit_id}/homework/blocks/{block_id}
POST   /admin/units/{unit_id}/homework/blocks/reorder
"""

from typing import Any, Dict, List
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.core.database import get_db
from app.core.auth import get_current_teacher, get_current_user
from app.core.enrollment_guard import check_unit_access
from app.models.user import User
from app.models.unit import Unit
from app.models.course import Course
from app.models.progress import Progress
from app.models.enrollment import CourseEnrollment
from app.models.homework_submission import UnitHomeworkSubmission, HomeworkSubmissionStatus
from app.schemas.homework_submission import (
    HomeworkSubmissionListItem,
    HomeworkSubmissionListResponse,
    HomeworkSubmissionResponse,
    HomeworkSubmissionStudentWrite,
    HomeworkSubmissionTeacherReview,
)
from app.services.media_block_utils import (
    ALLOWED_KINDS,
    SIMPLE_MEDIA_KINDS,
    CUSTOM_EXERCISE_KINDS,
    normalise_media_blocks,
    normalise_carousel_slides,
)

router = APIRouter()


# ─── Private helpers ──────────────────────────────────────────────────────────

def _get_unit_or_404(db: Session, unit_id: int, teacher_id: int) -> Unit:
    """Fetch unit, raise 404 if missing, 403 if not owned by this teacher."""
    unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")

    course = db.query(Course).filter(Course.id == unit.course_id).first()
    if not course or course.created_by != teacher_id:
        raise HTTPException(status_code=403, detail="Access denied")

    return unit


def _find_block(blocks: List[Dict], block_id: str) -> Dict | None:
    return next((b for b in blocks if str(b.get("id")) == block_id), None)


def _deep_merge_data(existing: Dict, incoming: Dict) -> Dict:
    """Merge incoming dict into existing, preserving keys not present in incoming."""
    merged = dict(existing)
    merged.update(incoming)
    return merged


def _merge_block_update(existing_block: Dict, updates: Dict) -> Dict:
    """
    Apply a partial update to a homework block.

    - For exercise blocks: deep-merge the `data` field so unchanged sub-keys survive.
    - For simple-media blocks: replace url/caption outright.
    - kind and title are replaced if present in updates.
    """
    merged = dict(existing_block)

    if "kind" in updates:
        merged["kind"] = updates["kind"]
    if "title" in updates:
        merged["title"] = str(updates["title"] or "")
    if "url" in updates:
        merged["url"] = str(updates["url"] or "")
    if "caption" in updates:
        merged["caption"] = str(updates["caption"] or "")

    # Carousel slides: replace list fully
    if "slides" in updates:
        merged["slides"] = normalise_carousel_slides(updates["slides"])

    # Exercise data: deep-merge so unmodified sub-keys survive
    if "data" in updates and isinstance(updates["data"], dict):
        existing_data = existing_block.get("data") or {}
        merged["data"] = _deep_merge_data(
            existing_data if isinstance(existing_data, dict) else {},
            updates["data"],
        )

    return merged


# ─── GET /admin/units/{unit_id}/homework ─────────────────────────────────────

@router.get("/admin/units/{unit_id}/homework")
async def get_homework(
    unit_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Return the full ordered homework-block list for a unit."""
    unit = _get_unit_or_404(db, unit_id, current_user.id)
    blocks = normalise_media_blocks(unit.homework_blocks)
    return {"blocks": blocks}


# ─── POST /admin/units/{unit_id}/homework/blocks ─────────────────────────────

@router.post("/admin/units/{unit_id}/homework/blocks", status_code=201)
async def add_homework_block(
    unit_id: int,
    body: Dict[str, Any],
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Append one block to the unit's homework_blocks list.
    Body shape mirrors a media_blocks entry (same kind values).
    Generates a block id if not supplied.
    """
    unit = _get_unit_or_404(db, unit_id, current_user.id)

    kind = str(body.get("kind") or "").strip().lower()
    if kind not in ALLOWED_KINDS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid block kind '{kind}'. Allowed: {sorted(ALLOWED_KINDS)}",
        )

    # Ensure id
    block_id = str(body.get("id") or "").strip() or uuid.uuid4().hex[:10]
    body = {**body, "id": block_id, "kind": kind}

    # Normalise through the shared helper (validates shape, fills defaults)
    normalised_list = normalise_media_blocks([body])
    if not normalised_list:
        raise HTTPException(status_code=422, detail="Block failed normalisation.")

    saved_block = normalised_list[0]

    current_blocks: List[Dict] = list(unit.homework_blocks or [])
    current_blocks.append(saved_block)
    unit.homework_blocks = current_blocks
    flag_modified(unit, "homework_blocks")
    db.commit()
    db.refresh(unit)

    return {"block": saved_block}


# ─── GET /admin/units/{unit_id}/homework/blocks/{block_id} ───────────────────

@router.get("/admin/units/{unit_id}/homework/blocks/{block_id}")
async def get_homework_block(
    unit_id: int,
    block_id: str,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Return a single homework block by id."""
    unit = _get_unit_or_404(db, unit_id, current_user.id)
    blocks = normalise_media_blocks(unit.homework_blocks)
    block = _find_block(blocks, block_id)
    if block is None:
        raise HTTPException(status_code=404, detail="Block not found")
    return {"block": block}


# ─── PUT /admin/units/{unit_id}/homework/blocks/{block_id} ───────────────────

@router.put("/admin/units/{unit_id}/homework/blocks/{block_id}")
async def update_homework_block(
    unit_id: int,
    block_id: str,
    body: Dict[str, Any],
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Partial-update a homework block.

    For exercise blocks the `data` field is deep-merged so unchanged
    sub-keys (e.g. answer options the editor didn't touch) are preserved.
    For simple-media blocks url/caption are replaced outright.
    """
    unit = _get_unit_or_404(db, unit_id, current_user.id)
    blocks: List[Dict] = list(normalise_media_blocks(unit.homework_blocks))

    idx = next((i for i, b in enumerate(blocks) if str(b.get("id")) == block_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Block not found")

    merged = _merge_block_update(blocks[idx], body)

    # Re-normalise the merged block to guarantee shape correctness
    renormalised = normalise_media_blocks([merged])
    if not renormalised:
        raise HTTPException(status_code=422, detail="Merged block failed normalisation.")

    blocks[idx] = renormalised[0]
    unit.homework_blocks = blocks
    flag_modified(unit, "homework_blocks")
    db.commit()
    db.refresh(unit)

    return {"block": blocks[idx]}


# ─── DELETE /admin/units/{unit_id}/homework/blocks/{block_id} ────────────────

@router.delete("/admin/units/{unit_id}/homework/blocks/{block_id}")
async def delete_homework_block(
    unit_id: int,
    block_id: str,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Remove a homework block from the list."""
    unit = _get_unit_or_404(db, unit_id, current_user.id)
    blocks: List[Dict] = list(normalise_media_blocks(unit.homework_blocks))

    before = len(blocks)
    blocks = [b for b in blocks if str(b.get("id")) != block_id]
    if len(blocks) == before:
        raise HTTPException(status_code=404, detail="Block not found")

    unit.homework_blocks = blocks
    flag_modified(unit, "homework_blocks")
    db.commit()

    return {"message": "Deleted"}


# ─── POST /admin/units/{unit_id}/homework/blocks/reorder ─────────────────────

@router.post("/admin/units/{unit_id}/homework/blocks/reorder")
async def reorder_homework_blocks(
    unit_id: int,
    body: Dict[str, Any],
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Re-sort homework_blocks according to caller-supplied order.

    Body: { "blocks": [{ "id": "abc", "order_index": 0 }, ...] }

    Any blocks whose ids are not mentioned in the body are appended at the end
    in their original relative order (safe default).
    """
    unit = _get_unit_or_404(db, unit_id, current_user.id)
    blocks: List[Dict] = list(normalise_media_blocks(unit.homework_blocks))

    order_items: List[Dict] = body.get("blocks", [])
    order_map: Dict[str, int] = {
        str(item["id"]): int(item["order_index"])
        for item in order_items
        if "id" in item and "order_index" in item
    }

    mentioned = {bid for bid in order_map}
    ordered = sorted(
        [b for b in blocks if str(b.get("id")) in mentioned],
        key=lambda b: order_map[str(b.get("id"))],
    )
    unmentioned = [b for b in blocks if str(b.get("id")) not in mentioned]
    reordered = ordered + unmentioned

    unit.homework_blocks = reordered
    flag_modified(unit, "homework_blocks")
    db.commit()
    db.refresh(unit)

    return {"blocks": reordered}


# ─── Homework submissions (per student, persisted) ───────────────────────────


def _student_ids_for_unit_roster(db: Session, unit: Unit) -> List[int]:
    """Collect student user ids who should appear on the homework roster."""
    if unit.course_id:
        rows = (
            db.query(CourseEnrollment.user_id)
            .filter(CourseEnrollment.course_id == unit.course_id)
            .all()
        )
        return [int(r[0]) for r in rows]
    rows = (
        db.query(Progress.student_id)
        .filter(Progress.unit_id == unit.id)
        .distinct()
        .all()
    )
    return [int(r[0]) for r in rows if r[0] is not None]


def _serialize_submission(row: UnitHomeworkSubmission) -> HomeworkSubmissionResponse:
    """Map ORM row to API model."""
    st = row.status.value if hasattr(row.status, "value") else str(row.status)
    return HomeworkSubmissionResponse(
        unit_id=row.unit_id,
        student_id=row.student_id,
        status=st,
        answers=dict(row.answers or {}),
        teacher_feedback=row.teacher_feedback,
        submitted_for_review_at=row.submitted_for_review_at,
        updated_at=row.updated_at,
    )


def _default_submission_payload(unit_id: int, student_id: int) -> HomeworkSubmissionResponse:
    """Virtual row when the student has never persisted homework yet."""
    return HomeworkSubmissionResponse(
        unit_id=unit_id,
        student_id=student_id,
        status=HomeworkSubmissionStatus.ASSIGNED.value,
        answers={},
        teacher_feedback=None,
        submitted_for_review_at=None,
        updated_at=None,
    )


@router.get("/units/{unit_id}/homework/submission", response_model=HomeworkSubmissionResponse)
async def get_student_homework_submission(
    unit_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> HomeworkSubmissionResponse:
    """Return the current user's homework submission for this unit (defaults if none)."""
    check_unit_access(db, current_user, unit_id)
    row = (
        db.query(UnitHomeworkSubmission)
        .filter(
            UnitHomeworkSubmission.unit_id == unit_id,
            UnitHomeworkSubmission.student_id == current_user.id,
        )
        .first()
    )
    if not row:
        return _default_submission_payload(unit_id, current_user.id)
    return _serialize_submission(row)


@router.put("/units/{unit_id}/homework/submission", response_model=HomeworkSubmissionResponse)
async def upsert_student_homework_submission(
    unit_id: int,
    body: HomeworkSubmissionStudentWrite,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> HomeworkSubmissionResponse:
    """Persist draft answers and/or submit homework for teacher review."""
    check_unit_access(db, current_user, unit_id)

    row = (
        db.query(UnitHomeworkSubmission)
        .filter(
            UnitHomeworkSubmission.unit_id == unit_id,
            UnitHomeworkSubmission.student_id == current_user.id,
        )
        .first()
    )
    if not row:
        row = UnitHomeworkSubmission(
            unit_id=unit_id,
            student_id=current_user.id,
            status=HomeworkSubmissionStatus.ASSIGNED,
            answers={},
        )
        db.add(row)

    if row.status == HomeworkSubmissionStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Homework is already completed")

    if body.answers:
        merged: Dict[str, Any] = dict(row.answers or {})
        merged.update(body.answers)
        row.answers = merged
        flag_modified(row, "answers")

    if body.action == "submit_for_review":
        if row.status not in (
            HomeworkSubmissionStatus.ASSIGNED,
            HomeworkSubmissionStatus.AWAITING_STUDENT,
        ):
            raise HTTPException(
                status_code=400,
                detail="Can only submit for review from assigned or awaiting_student",
            )
        row.status = HomeworkSubmissionStatus.PENDING_REVIEW
        row.submitted_for_review_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(row)
    return _serialize_submission(row)


@router.get(
    "/admin/units/{unit_id}/homework/submissions",
    response_model=HomeworkSubmissionListResponse,
)
async def list_homework_submissions_for_teacher(
    unit_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
) -> HomeworkSubmissionListResponse:
    """Teacher roster: enrolled (or progress) students with homework status."""
    unit = _get_unit_or_404(db, unit_id, current_user.id)
    student_ids = _student_ids_for_unit_roster(db, unit)
    rows = (
        db.query(UnitHomeworkSubmission)
        .filter(UnitHomeworkSubmission.unit_id == unit_id)
        .all()
    )
    by_student = {r.student_id: r for r in rows}

    items: List[HomeworkSubmissionListItem] = []
    for sid in sorted(set(student_ids) | set(by_student.keys())):
        user = db.query(User).filter(User.id == sid).first()
        if not user:
            continue
        r = by_student.get(sid)
        if r is None:
            items.append(
                HomeworkSubmissionListItem(
                    student_id=sid,
                    student_name=user.full_name or f"User {sid}",
                    status=HomeworkSubmissionStatus.ASSIGNED.value,
                    submitted_for_review_at=None,
                    updated_at=None,
                )
            )
        else:
            st = r.status.value if hasattr(r.status, "value") else str(r.status)
            items.append(
                HomeworkSubmissionListItem(
                    student_id=sid,
                    student_name=user.full_name or f"User {sid}",
                    status=st,
                    submitted_for_review_at=r.submitted_for_review_at,
                    updated_at=r.updated_at,
                )
            )

    return HomeworkSubmissionListResponse(submissions=items)


@router.get(
    "/admin/units/{unit_id}/homework/submissions/{student_id}",
    response_model=HomeworkSubmissionResponse,
)
async def get_homework_submission_for_teacher(
    unit_id: int,
    student_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
) -> HomeworkSubmissionResponse:
    """Full answers payload for one student (teacher hydrates the live viewer)."""
    _get_unit_or_404(db, unit_id, current_user.id)
    row = (
        db.query(UnitHomeworkSubmission)
        .filter(
            UnitHomeworkSubmission.unit_id == unit_id,
            UnitHomeworkSubmission.student_id == student_id,
        )
        .first()
    )
    if not row:
        return _default_submission_payload(unit_id, student_id)
    return _serialize_submission(row)


@router.patch(
    "/admin/units/{unit_id}/homework/submissions/{student_id}",
    response_model=HomeworkSubmissionResponse,
)
async def teacher_review_homework_submission(
    unit_id: int,
    student_id: int,
    body: HomeworkSubmissionTeacherReview,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
) -> HomeworkSubmissionResponse:
    """Teacher accepts work or sends it back to the student with feedback."""
    _get_unit_or_404(db, unit_id, current_user.id)

    row = (
        db.query(UnitHomeworkSubmission)
        .filter(
            UnitHomeworkSubmission.unit_id == unit_id,
            UnitHomeworkSubmission.student_id == student_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="No submission to review yet")

    if row.status != HomeworkSubmissionStatus.PENDING_REVIEW:
        raise HTTPException(
            status_code=400,
            detail="Teacher review is only allowed while status is pending_review",
        )

    if body.status == "completed":
        row.status = HomeworkSubmissionStatus.COMPLETED
    elif body.status == "awaiting_student":
        row.status = HomeworkSubmissionStatus.AWAITING_STUDENT
    else:
        raise HTTPException(status_code=422, detail="Invalid status")

    if body.teacher_feedback is not None:
        row.teacher_feedback = body.teacher_feedback

    db.commit()
    db.refresh(row)
    return _serialize_submission(row)