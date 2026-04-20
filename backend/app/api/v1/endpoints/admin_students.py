"""Teacher-admin student management endpoints scoped to teacher-owned students."""

import secrets
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel

from app.core.database import get_db
from app.core.auth import get_current_teacher
from app.core.security import get_password_hash
from app.core.teacher_tariffs import canonicalize_teacher_plan_name
from app.models.user import User, UserRole
from app.models.course import Course
from app.models.enrollment import CourseEnrollment
from app.models.progress import Progress
from app.models.notification import Notification
from app.models.task import Task, TaskSubmission
from app.models.test import TestAttempt
from app.models.audit import AuditLog
from app.models.email import EmailLog
from app.models.subscription import (
    Subscription,
    SubscriptionName,
    UserSubscription
)
from app.schemas.subscription import ChangeSubscriptionRequest
from app.schemas.user import (
    AdminStudentCreateRequest,
    AdminStudentCreateResponse,
    AdminStudentUpdateRequest,
    UserResponse,
)

router = APIRouter()

class StudentEnrollmentRequest(BaseModel):
    course_id: int


# Normalizes student profile metadata to a mutable dict across all endpoint flows.
def _get_student_profile_meta(student: User) -> dict[str, Any]:
    """Return student notification prefs as a mutable metadata map."""
    # Stores raw profile metadata payload loaded from JSON column.
    raw_profile_meta = student.notification_prefs
    if isinstance(raw_profile_meta, dict):
        # Stores copied metadata map so in-place mutations do not affect shared state.
        normalized_profile_meta = dict(raw_profile_meta)
        return normalized_profile_meta
    return {}


# Extracts temporary password from supported metadata keys used across legacy/new flows.
def _extract_temporary_password_from_profile_meta(
    profile_meta: dict[str, Any],
) -> Optional[str]:
    """Extract temporary password value from profile metadata if present."""
    # Stores supported key variants used by different versions of admin student flows.
    supported_temporary_password_keys = (
        "temporary_password",
        "temp_password",
        "temporaryPassword",
    )
    for temporary_password_key in supported_temporary_password_keys:
        # Stores candidate value from the current metadata key.
        candidate_temporary_password = profile_meta.get(temporary_password_key)
        if (
            isinstance(candidate_temporary_password, str)
            and candidate_temporary_password.strip()
        ):
            return candidate_temporary_password.strip()
    return None


# Applies temporary password to student model and profile metadata in one consistent path.
def _apply_temporary_password_to_student(
    student: User,
    profile_meta: dict[str, Any],
    temporary_password: str,
) -> None:
    """Persist temporary password metadata and matching password hash on student."""
    # Stores hashed password value because only hashes should be persisted in database.
    temporary_password_hash = get_password_hash(temporary_password)
    # Stores plain-text temporary password so teacher can retrieve it from the list view.
    profile_meta["temporary_password"] = temporary_password
    student.password_hash = temporary_password_hash
    student.notification_prefs = profile_meta


def _is_student_created_by_teacher(student: User, teacher_id: int) -> bool:
    """Check whether student profile metadata marks current teacher as creator."""
    # Stores profile metadata map where admin-created student ownership is persisted.
    student_profile_meta = _get_student_profile_meta(student)
    # Stores raw teacher identifier saved during student creation flow.
    raw_creator_teacher_id = student_profile_meta.get("created_by_teacher_id")
    try:
        # Stores normalized integer creator identifier to avoid int/str mismatch issues.
        normalized_creator_teacher_id = int(raw_creator_teacher_id)
    except (TypeError, ValueError):
        return False
    return normalized_creator_teacher_id == teacher_id


def _get_teacher_owned_student_or_403(
    db: Session,
    student_id: int,
    teacher_id: int,
) -> User:
    """Fetch student and enforce that current teacher created this account."""
    # Stores the target student entity looked up by request path parameter.
    student = db.query(User).filter(
        User.id == student_id,
        User.role == UserRole.STUDENT
    ).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Stores ownership check result to gate cross-teacher student access.
    student_belongs_to_teacher = _is_student_created_by_teacher(student, teacher_id)
    if not student_belongs_to_teacher:
        raise HTTPException(
            status_code=403,
            detail="Student was not created by current teacher",
        )

    return student


# Builds a unified response object for both new and existing student create flows.
def _build_admin_student_create_response(
    student: User,
    temporary_password: str,
) -> AdminStudentCreateResponse:
    """Build create-student response payload shared by create and attach flows."""
    # Stores payload fields reused from ORM object and appends credential-sharing fields.
    student_response_payload = {
        "id": student.id,
        "email": student.email,
        "first_name": student.first_name,
        "last_name": student.last_name,
        "role": student.role,
        "is_active": student.is_active,
        "created_at": student.created_at,
        "updated_at": student.updated_at,
        "last_login": student.last_login,
        "email_verified_at": student.email_verified_at,
        "notification_prefs": student.notification_prefs or {},
        "subscription": None,
        "subscription_ends_at": None,
        "enrolled_courses_count": 0,
        "onboarding_completed": False,
        "locale": student.locale,
    }
    return AdminStudentCreateResponse(
        **student_response_payload,
        temporary_password=temporary_password,
        login_url="/login",
    )


def _delete_student_related_rows(db: Session, student_id: int) -> None:
    """Delete or detach records that still reference a student before hard delete."""
    # Clears direct enrollment links that keep the student attached to classrooms.
    db.query(CourseEnrollment).filter(
        CourseEnrollment.user_id == student_id
    ).delete(synchronize_session=False)
    # Clears subscription rows so plan history does not block the user delete.
    db.query(UserSubscription).filter(
        UserSubscription.user_id == student_id
    ).delete(synchronize_session=False)
    # Clears unit progress rows that still point at the student account.
    db.query(Progress).filter(
        Progress.student_id == student_id
    ).delete(synchronize_session=False)
    # Clears in-app notifications owned by the student.
    db.query(Notification).filter(
        Notification.student_id == student_id
    ).delete(synchronize_session=False)
    # Clears task submissions authored by the student.
    db.query(TaskSubmission).filter(
        TaskSubmission.student_id == student_id
    ).delete(synchronize_session=False)
    # Clears test attempts authored by the student.
    db.query(TestAttempt).filter(
        TestAttempt.student_id == student_id
    ).delete(synchronize_session=False)
    # Clears email delivery logs for the student recipient.
    db.query(EmailLog).filter(
        EmailLog.recipient_id == student_id
    ).delete(synchronize_session=False)
    # Preserves audit history while detaching the deleted account reference.
    db.query(AuditLog).filter(
        AuditLog.user_id == student_id
    ).update({AuditLog.user_id: None}, synchronize_session=False)
    # Clears any accidental grader references if a student id was stored there.
    db.query(TaskSubmission).filter(
        TaskSubmission.grader_id == student_id
    ).update({TaskSubmission.grader_id: None}, synchronize_session=False)

    # Stores tasks that list the student inside JSON assignment arrays.
    tasks_with_student_assignment = db.query(Task).filter(
        Task.assigned_students.isnot(None)
    ).all()
    for task in tasks_with_student_assignment:
        # Stores normalized assignment ids so mixed string/int payloads are handled consistently.
        normalized_assigned_student_ids = [
            str(assigned_student_id)
            for assigned_student_id in (task.assigned_students or [])
        ]
        if str(student_id) not in normalized_assigned_student_ids:
            continue
        # Stores filtered assignments without the deleted student id.
        remaining_assigned_student_ids = [
            assigned_student_id
            for assigned_student_id in (task.assigned_students or [])
            if str(assigned_student_id) != str(student_id)
        ]
        task.assigned_students = remaining_assigned_student_ids


@router.post("", response_model=AdminStudentCreateResponse, status_code=status.HTTP_201_CREATED)
def create_student(
    payload: AdminStudentCreateRequest,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    """Create a student account from the admin students page."""
    # Stores teacher id from payload when provided, otherwise falls back to auth context.
    requested_teacher_id = payload.teacher_id or current_user.id
    if requested_teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Payload teacher_id must match authenticated teacher",
        )

    # Stores a short temporary password so admin can share student login credentials.
    temporary_password = f"{secrets.randbelow(9000) + 1000}"
    existing_user = db.query(User).filter(User.email == payload.email).first()
    if existing_user:
        if existing_user.role != UserRole.STUDENT:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered by non-student account",
            )

        # Stores cleaned full-name value from single name field.
        normalized_name = payload.first_name.strip()
        if not normalized_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Student name is required",
            )
        # Stores tokenized name chunks used to populate first and last name columns.
        name_parts = normalized_name.split()
        # Stores first token as first name required by the users table.
        parsed_first_name = name_parts[0]
        # Stores remaining tokens as last-name fallback for one-token names.
        parsed_last_name = " ".join(name_parts[1:]).strip() or "—"

        # Stores mutable metadata map to update ownership and profile fields in one write.
        profile_meta = _get_student_profile_meta(existing_user)
        profile_meta["phone"] = (payload.phone or "").strip() or None
        profile_meta["native_language"] = (payload.native_language or "").strip() or None
        profile_meta["timezone"] = (payload.timezone or "").strip() or None
        profile_meta["created_by_teacher_id"] = requested_teacher_id

        existing_user.first_name = parsed_first_name
        existing_user.last_name = parsed_last_name
        existing_user.is_active = True
        # Ensures returned temporary password is exactly the active login password.
        _apply_temporary_password_to_student(
            student=existing_user,
            profile_meta=profile_meta,
            temporary_password=temporary_password,
        )

        # Stores existing active subscription row, if already assigned.
        active_subscription = db.query(UserSubscription).filter(
            UserSubscription.user_id == existing_user.id,
            UserSubscription.is_active == True,
        ).first()
        if not active_subscription:
            # Stores default FREE subscription lookup used when user has no active plan.
            free_subscription = db.query(Subscription).filter(
                Subscription.name == SubscriptionName.FREE,
                Subscription.is_active == True,
            ).first()
            if free_subscription:
                db.add(
                    UserSubscription(
                        user_id=existing_user.id,
                        subscription_id=free_subscription.id,
                        is_active=True,
                    )
                )

        db.commit()
        db.refresh(existing_user)
        return _build_admin_student_create_response(
            student=existing_user,
            temporary_password=temporary_password,
        )

    # Split one "name" input into first/last fields required by the users table.
    normalized_name = payload.first_name.strip()
    if not normalized_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Student name is required",
        )
    name_parts = normalized_name.split()
    parsed_first_name = name_parts[0]
    parsed_last_name = " ".join(name_parts[1:]).strip() or "—"

    # Store teacher-provided profile extras in notification_prefs until dedicated fields exist.
    profile_meta = {
        "phone": (payload.phone or "").strip() or None,
        "native_language": (payload.native_language or "").strip() or None,
        "timezone": (payload.timezone or "").strip() or None,
        "created_by_teacher_id": requested_teacher_id,
    }
    student = User(
        email=payload.email,
        first_name=parsed_first_name,
        last_name=parsed_last_name,
        role=UserRole.STUDENT,
        # Stores placeholder hash value that gets replaced by temporary password helper.
        password_hash="placeholder",
        locale="ru",
        notification_prefs={},
        is_active=True,
    )
    # Ensures returned temporary password is exactly the active login password.
    _apply_temporary_password_to_student(
        student=student,
        profile_meta=profile_meta,
        temporary_password=temporary_password,
    )
    db.add(student)
    db.flush()

    # Attach FREE subscription to keep behavior aligned with normal registration flow.
    free_subscription = db.query(Subscription).filter(
        Subscription.name == SubscriptionName.FREE,
        Subscription.is_active == True,
    ).first()
    if free_subscription:
        db.add(
            UserSubscription(
                user_id=student.id,
                subscription_id=free_subscription.id,
                is_active=True,
            )
        )

    db.commit()
    db.refresh(student)
    return _build_admin_student_create_response(
        student=student,
        temporary_password=temporary_password,
    )


@router.put("/{student_id}", response_model=UserResponse)
def update_student(
    student_id: int,
    payload: AdminStudentUpdateRequest,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    """Update editable student profile fields from admin student view page."""
    # Stores student entity and enforces that current teacher owns this account.
    student = _get_teacher_owned_student_or_403(
        db=db,
        student_id=student_id,
        teacher_id=current_user.id,
    )

    if payload.email is not None:
        # Stores whether a different account already uses the requested email.
        existing_user = db.query(User).filter(
            User.email == payload.email,
            User.id != student_id,
        ).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered",
            )
        student.email = payload.email

    if payload.first_name is not None:
        # Stores cleaned full-name value from the single name field in admin modal.
        normalized_name = payload.first_name.strip()
        if not normalized_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Student name is required",
            )
        # Stores tokenized name parts to split into first/last columns.
        name_parts = normalized_name.split()
        # Stores first token as first name in the users table.
        parsed_first_name = name_parts[0]
        # Stores remaining tokens as last name fallback when present.
        parsed_last_name = " ".join(name_parts[1:]).strip() or "—"
        student.first_name = parsed_first_name
        student.last_name = parsed_last_name

    # Stores profile metadata map currently used for phone/language/timezone fields.
    profile_meta = _get_student_profile_meta(student)
    if payload.phone is not None:
        profile_meta["phone"] = payload.phone.strip() or None
    if payload.native_language is not None:
        profile_meta["native_language"] = payload.native_language.strip() or None
    if payload.timezone is not None:
        profile_meta["timezone"] = payload.timezone.strip() or None
    student.notification_prefs = profile_meta

    db.commit()
    db.refresh(student)
    return student


@router.delete("/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_student(
    student_id: int,
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
):
    """Delete student account from admin student view page."""
    # Stores student entity and enforces that current teacher owns this account.
    student = _get_teacher_owned_student_or_403(
        db=db,
        student_id=student_id,
        teacher_id=current_user.id,
    )

    # Prevent endpoint crash when foreign-key-linked student data blocks deletion.
    try:
        # Removes dependent student rows first because many legacy foreign keys do not cascade.
        _delete_student_related_rows(db=db, student_id=student.id)
        db.delete(student)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Не удалось удалить ученика из-за связанных данных",
        )


@router.get("", response_model=list[UserResponse])
def get_students(
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100
):
    """Get students created by current teacher with subscription info."""
    # Stores full student pool before ownership filtering by metadata.
    all_students = db.query(User).filter(User.role == UserRole.STUDENT).all()
    # Stores students explicitly created by the current teacher account.
    teacher_owned_students = [
        student for student in all_students
        if _is_student_created_by_teacher(student, current_user.id)
    ]
    # Stores slice of teacher-owned students according to requested pagination.
    paginated_students = teacher_owned_students[skip:skip + limit]

    # Stores student IDs used to fetch enrollment counters in one grouped query.
    paginated_student_ids = [student.id for student in paginated_students]
    # Stores enrollment count map to avoid one SQL query per student row.
    enrollments_count_by_student_id = {}
    if paginated_student_ids:
        # Stores grouped enrollment counts for the paginated student set.
        enrollment_rows = (
            db.query(
                CourseEnrollment.user_id,
                func.count(CourseEnrollment.id).label("enrolled_courses_count"),
            )
            .filter(CourseEnrollment.user_id.in_(paginated_student_ids))
            .group_by(CourseEnrollment.user_id)
            .all()
        )
        enrollments_count_by_student_id = {
            user_id: enrolled_courses_count
            for user_id, enrolled_courses_count in enrollment_rows
        }

    # Convert to response format with enrolled_courses_count.
    students_with_count = []
    for student in paginated_students:
        # Stores enrollment count resolved from grouped query map.
        enrolled_count = enrollments_count_by_student_id.get(student.id, 0)
        # Get active subscription if exists.
        active_user_sub = (
            db.query(UserSubscription)
            .filter(
                UserSubscription.user_id == student.id,
                UserSubscription.is_active == True
            )
            .first()
        )
        
        subscription_name = None
        subscription_ends_at = None
        
        if active_user_sub:
            subscription_name = active_user_sub.subscription.name.value if active_user_sub.subscription else "free"
            subscription_ends_at = active_user_sub.ends_at
        else:
            # Fallback to subscription_type column
            subscription_name = student.subscription_type.value if student.subscription_type else "free"
        
        # Stores notification_prefs map used for profile metadata and temporary credential.
        student_notification_prefs = _get_student_profile_meta(student)
        # Extracts plain-text temporary password stored at creation time; None if cleared.
        stored_temporary_password = _extract_temporary_password_from_profile_meta(
            student_notification_prefs
        )

        student_dict = {
            "id": student.id,
            "email": student.email,
            "first_name": student.first_name,
            "last_name": student.last_name,
            "role": student.role,
            "is_active": student.is_active,
            "created_at": student.created_at,
            "last_login": student.last_login,
            "email_verified_at": student.email_verified_at,
            "notification_prefs": student_notification_prefs,
            "updated_at": student.updated_at,
            "subscription": subscription_name,
            "subscription_ends_at": subscription_ends_at,
            "enrolled_courses_count": enrolled_count,
            "temporary_password": stored_temporary_password,
        }
        students_with_count.append(UserResponse(**student_dict))
    
    return students_with_count


@router.post("/{student_id}/enrollments")
def enroll_student_to_course(
    student_id: int,
    payload: StudentEnrollmentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher),
):
    """Enroll a student into one teacher-owned course."""
    # Stores student entity and enforces that current teacher owns this account.
    _get_teacher_owned_student_or_403(
        db=db,
        student_id=student_id,
        teacher_id=current_user.id,
    )

    course = db.query(Course).filter(
        Course.id == payload.course_id,
        Course.created_by == current_user.id
    ).first()
    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found in your courses"
        )

    existing_enrollment = db.query(CourseEnrollment).filter(
        CourseEnrollment.user_id == student_id,
        CourseEnrollment.course_id == payload.course_id
    ).first()
    if existing_enrollment:
        return {
            "student_id": student_id,
            "course_id": payload.course_id,
            "already_enrolled": True
        }

    db.add(
        CourseEnrollment(
            user_id=student_id,
            course_id=payload.course_id
        )
    )
    db.commit()

    return {
        "student_id": student_id,
        "course_id": payload.course_id,
        "already_enrolled": False
    }


@router.put("/{student_id}/subscription")
def change_student_subscription(
    student_id: int,
    payload: ChangeSubscriptionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher),
):
    """Change student subscription - only for students created by current teacher."""
    # Stores student entity and enforces that current teacher owns this account.
    _get_teacher_owned_student_or_403(
        db=db,
        student_id=student_id,
        teacher_id=current_user.id,
    )

    # 2️⃣ Find target subscription
    # Stores canonical plan so legacy premium and new standard are treated uniformly.
    canonical_subscription_name = canonicalize_teacher_plan_name(payload.subscription)
    # Stores accepted DB enum values for this logical plan.
    allowed_subscription_names = (
        [SubscriptionName.STANDARD, SubscriptionName.PREMIUM]
        if canonical_subscription_name == "standard"
        else [SubscriptionName(canonical_subscription_name)]
    )
    subscription = db.query(Subscription).filter(
        Subscription.name.in_(allowed_subscription_names),
        Subscription.is_active == True
    ).first()

    if not subscription:
        raise HTTPException(status_code=404, detail="Subscription not found")

    # 3️⃣ Deactivate current subscription(s)
    db.query(UserSubscription).filter(
        UserSubscription.user_id == student_id,
        UserSubscription.is_active == True
    ).update({"is_active": False})

    # 4️⃣ Assign new subscription
    new_sub = UserSubscription(
        user_id=student_id,
        subscription_id=subscription.id,
        ends_at=payload.ends_at,
        is_active=True
    )

    db.add(new_sub)
    db.commit()

    return {
        "student_id": student_id,
        "subscription": subscription.name,
        "ends_at": payload.ends_at
    }

