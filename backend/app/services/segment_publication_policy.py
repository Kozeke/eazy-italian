"""
segment_publication_policy.py

Gates the first student-visible segment in a course against the teacher's
``course_publish`` quota, promotes the parent unit when a segment goes live,
and records per-course settings so unpublish/republish does not re-charge quota.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.core.teacher_tariffs import check_and_consume_teacher_ai_quota
from app.models.course import Course
from app.models.segment import Segment, SegmentStatus
from app.models.unit import Unit, UnitStatus

if TYPE_CHECKING:
    from app.models.user import User

# Stored on ``Course.settings`` after this course has consumed one ``course_publish`` slot.
_SETTINGS_PUBLISH_QUOTA_KEY = "segment_publish_quota_consumed"


def segment_state_is_student_available(
    status: SegmentStatus,
    is_visible_to_students: bool,
    publish_at: datetime | None,
) -> bool:
    """
    Mirror Segment.is_available without loading an ORM row — used before commit.
    """
    if not is_visible_to_students:
        return False
    if status in (SegmentStatus.DRAFT, SegmentStatus.ARCHIVED):
        return False
    if status == SegmentStatus.SCHEDULED:
        if publish_at is None:
            return False
        pa = publish_at.replace(tzinfo=None) if publish_at.tzinfo else publish_at
        return datetime.utcnow() >= pa
    return status == SegmentStatus.PUBLISHED


def course_has_any_student_available_segment_excluding(
    db: Session,
    course_id: int,
    exclude_segment_id: int | None,
) -> bool:
    """
    True if another segment in this course is already visible to students (live).
    """
    q = db.query(Segment).join(Unit, Segment.unit_id == Unit.id).filter(
        Unit.course_id == course_id,
    )
    if exclude_segment_id is not None:
        q = q.filter(Segment.id != exclude_segment_id)
    for seg in q.all():
        if segment_state_is_student_available(
            seg.status, seg.is_visible_to_students, seg.publish_at
        ):
            return True
    return False


def maybe_consume_course_publish_for_new_live_segment(
    db: Session,
    teacher: "User",
    course: Course,
    *,
    exclude_segment_id: int | None,
) -> None:
    """
    When this segment becomes the *first* live segment for the course, consume
    ``course_publish`` once and mark ``Course.settings`` so later republishes
    on the same course stay free of additional quota.
    """
    if course_has_any_student_available_segment_excluding(
        db, course.id, exclude_segment_id
    ):
        return
    settings = dict(course.settings or {})
    if settings.get(_SETTINGS_PUBLISH_QUOTA_KEY):
        return
    check_and_consume_teacher_ai_quota(db, teacher, "course_publish")
    settings[_SETTINGS_PUBLISH_QUOTA_KEY] = True
    course.settings = settings
    flag_modified(course, "settings")


def promote_unit_for_live_segment(db: Session, unit: Unit) -> None:
    """When at least one segment is student-visible, the unit must be too."""
    unit.status = UnitStatus.PUBLISHED
    unit.is_visible_to_students = True
