"""Teacher tariff helpers for plan mapping, usage counters, and quota checks."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal, cast

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.subscription import Subscription, SubscriptionName, UserSubscription
from app.models.user import User, UserRole

# Defines all accepted logical teacher plan ids used across API layers.
TeacherTariffName = Literal["free", "standard", "pro"]

# Stores normalized alias mapping so legacy names still resolve to supported plans.
_PLAN_ALIASES: dict[str, TeacherTariffName] = {
    "free": "free",
    "standard": "standard",
    "premium": "standard",
    "pro": "pro",
}

# Stores canonical AI operation keys used in usage and limits payloads.
_AI_QUOTA_KEYS: tuple[str, ...] = (
    "course_generation",
    "unit_generation",
    "exercise_generation",
    "task_generation",
    "test_generation",
)

# Stores plan-level hard caps for each AI action (None means unlimited).
_TARIFF_LIMITS: dict[TeacherTariffName, dict[str, int | None]] = {
    "free": {
        "course_generation": 1,
        "unit_generation": 10,
        "exercise_generation": 5,
        "task_generation": 5,
        "test_generation": 5,
    },
    "standard": {
        "course_generation": 5,
        "unit_generation": 10,
        "exercise_generation": 50,
        "task_generation": 50,
        "test_generation": 50,
    },
    "pro": {
        "course_generation": None,
        "unit_generation": None,
        "exercise_generation": None,
        "task_generation": None,
        "test_generation": None,
    },
}

# Stores metadata key where teacher usage counters are persisted on user.notification_prefs.
_USAGE_META_KEY = "teacher_ai_usage"


# Returns canonical teacher tariff name from user input or legacy aliases.
def canonicalize_teacher_plan_name(raw_plan_name: str | None) -> TeacherTariffName:
    # Stores lower-cased value so matching is case-insensitive.
    normalized_plan_name = (raw_plan_name or "free").strip().lower()
    # Stores canonical plan for API responses and quota calculations.
    canonical_plan_name = _PLAN_ALIASES.get(normalized_plan_name)
    if canonical_plan_name is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported teacher plan '{raw_plan_name}'.",
        )
    return canonical_plan_name


# Returns default end date for time-bound plans and open-ended for Pro.
def default_teacher_plan_ends_at(plan_name: str | TeacherTariffName) -> datetime | None:
    # Stores canonical plan id to keep defaults consistent across all callers.
    canonical_plan_name = canonicalize_teacher_plan_name(str(plan_name))
    if canonical_plan_name == "pro":
        return None
    return datetime.now(timezone.utc) + timedelta(days=30)


# Returns tariff limits object for the requested plan.
def get_teacher_tariff_limits(plan_name: str | TeacherTariffName) -> dict[str, int | None]:
    # Stores canonical plan before reading static limits map.
    canonical_plan_name = canonicalize_teacher_plan_name(str(plan_name))
    # Stores a copy so callers cannot mutate global settings.
    limits_snapshot = dict(_TARIFF_LIMITS[canonical_plan_name])
    return limits_snapshot


# Returns tariff cards payload consumed by teacher tariffs UI.
def build_teacher_tariff_catalog() -> list[dict[str, object]]:
    # Stores static card rows in UI order.
    tariff_catalog_rows = [
        {"name": "free", "ai_limits": get_teacher_tariff_limits("free")},
        {"name": "standard", "ai_limits": get_teacher_tariff_limits("standard")},
        {"name": "pro", "ai_limits": get_teacher_tariff_limits("pro")},
    ]
    return tariff_catalog_rows


# Loads DB subscription row corresponding to a canonical teacher plan.
def resolve_subscription_row_for_teacher_plan(
    db: Session,
    plan_name: str | TeacherTariffName,
) -> Subscription | None:
    # Stores canonical plan id before DB enum mapping.
    canonical_plan_name = canonicalize_teacher_plan_name(str(plan_name))
    # Stores acceptable enum names for canonical plan lookup.
    allowed_subscription_names = (
        [SubscriptionName.STANDARD, SubscriptionName.PREMIUM]
        if canonical_plan_name == "standard"
        else [SubscriptionName(canonical_plan_name)]
    )
    # Stores active subscription row used for new UserSubscription insert.
    subscription_row = (
        db.query(Subscription)
        .filter(
            Subscription.name.in_(allowed_subscription_names),
            Subscription.is_active == True,  # noqa: E712
        )
        .first()
    )
    return subscription_row


# Returns currently active user subscription row, if present.
def _get_active_user_subscription(db: Session, user: User) -> UserSubscription | None:
    # Stores active subscription row used by plan and expiry helper functions.
    active_user_subscription = (
        db.query(UserSubscription)
        .filter(
            UserSubscription.user_id == user.id,
            UserSubscription.is_active == True,  # noqa: E712
        )
        .order_by(UserSubscription.starts_at.desc())
        .first()
    )
    return active_user_subscription


# Returns canonical plan derived from active subscription row and user role defaults.
def _get_teacher_plan_from_active_subscription(
    db: Session,
    user: User,
) -> TeacherTariffName:
    # Stores active row to infer plan and expiry.
    active_user_subscription = _get_active_user_subscription(db, user)
    if active_user_subscription and active_user_subscription.subscription:
        # Stores DB enum value for canonical plan conversion.
        raw_subscription_name = active_user_subscription.subscription.name.value
        return canonicalize_teacher_plan_name(raw_subscription_name)
    # Non-teachers are always treated as free for quota checks.
    if user.role != UserRole.TEACHER:
        return "free"
    # Teachers without explicit row default to free tier.
    return "free"


# Returns plan expiry datetime for the currently active teacher subscription.
def get_teacher_subscription_ends_at(db: Session, user: User) -> datetime | None:
    # Stores active row to expose end date in tariff status response.
    active_user_subscription = _get_active_user_subscription(db, user)
    return active_user_subscription.ends_at if active_user_subscription else None


# Returns current teacher plan and whether the time-bound period already expired.
def get_teacher_tariff_display_state(db: Session, user: User) -> tuple[TeacherTariffName, bool]:
    # Stores active plan for status endpoint and quota checks.
    current_plan_name = _get_teacher_plan_from_active_subscription(db, user)
    # Stores current plan end date to compute expired flag.
    current_plan_ends_at = get_teacher_subscription_ends_at(db, user)
    # Stores timezone-aware now for robust timestamp comparison.
    current_time_utc = datetime.now(timezone.utc)
    # Stores period-expired state used by frontend warning banners.
    period_expired = (
        current_plan_name in ("free", "standard")
        and current_plan_ends_at is not None
        and current_plan_ends_at <= current_time_utc
    )
    return current_plan_name, period_expired


# Returns usage period key; monthly for Pro, subscription-bound for timed plans.
def get_teacher_ai_usage_period_key(db: Session, user: User) -> str:
    # Stores active plan used to choose period semantics.
    current_plan_name = _get_teacher_plan_from_active_subscription(db, user)
    if current_plan_name == "pro":
        # Stores month key so Pro counters roll over monthly.
        return datetime.now(timezone.utc).strftime("%Y-%m")
    # Stores active subscription row to scope quota to current paid period.
    active_user_subscription = _get_active_user_subscription(db, user)
    if active_user_subscription is None:
        return datetime.now(timezone.utc).strftime("%Y-%m")
    return f"sub:{active_user_subscription.id}"


# Returns normalized mutable usage metadata stored on user.notification_prefs.
def _get_or_init_usage_meta(user: User, period_key: str) -> tuple[dict[str, object], dict[str, int]]:
    # Stores user profile metadata map where quota counters are persisted.
    profile_meta = dict(user.notification_prefs or {})
    # Stores usage object with period + counters in a stable shape.
    usage_meta = dict(profile_meta.get(_USAGE_META_KEY) or {})
    # Stores period currently persisted in metadata.
    stored_period_key = str(usage_meta.get("period") or "")
    if stored_period_key != period_key:
        # Period boundary reset keeps counters from leaking across billing windows.
        usage_meta = {"period": period_key, "counts": {}}
    # Stores counter map used for reads and increments.
    usage_counts = cast(dict[str, int], dict(usage_meta.get("counts") or {}))
    for quota_key in _AI_QUOTA_KEYS:
        # Ensures all known keys are always present in API responses.
        usage_counts[quota_key] = int(usage_counts.get(quota_key, 0) or 0)
    usage_meta["period"] = period_key
    usage_meta["counts"] = usage_counts
    profile_meta[_USAGE_META_KEY] = usage_meta
    return profile_meta, usage_counts


# Returns current teacher AI usage counters for the active quota period.
def get_teacher_ai_usage(db: Session, user: User) -> dict[str, int]:
    # Stores usage period id to select/reset counters.
    usage_period_key = get_teacher_ai_usage_period_key(db, user)
    # Stores normalized metadata and counter snapshot.
    profile_meta, usage_counts = _get_or_init_usage_meta(user, usage_period_key)
    # Saves normalization/reset only when metadata actually changed.
    if profile_meta != (user.notification_prefs or {}):
        user.notification_prefs = profile_meta
        db.add(user)
        db.commit()
        db.refresh(user)
    # Stores detached counters to avoid accidental in-place mutation by callers.
    usage_snapshot = {key: int(usage_counts.get(key, 0)) for key in _AI_QUOTA_KEYS}
    return usage_snapshot


# Checks quota for one AI action and consumes one credit when allowed.
def check_and_consume_teacher_ai_quota(db: Session, user: User, quota_key: str) -> None:
    # Stores normalized quota key to avoid case-sensitive mismatches.
    normalized_quota_key = (quota_key or "").strip().lower()
    if not normalized_quota_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Quota key is required.",
        )
    if normalized_quota_key not in _AI_QUOTA_KEYS:
        # Unknown actions are intentionally ignored to stay forward-compatible.
        return

    # Stores current plan and expiry status before enforcing hard limits.
    current_plan_name, period_expired = get_teacher_tariff_display_state(db, user)
    if period_expired:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                "Your current plan period has expired. "
                "Renew your plan or switch tariff to continue AI generation."
            ),
        )

    # Stores limit value for this action in the current plan.
    action_limit = get_teacher_tariff_limits(current_plan_name).get(normalized_quota_key)
    if action_limit is None:
        return

    # Stores current usage counters before increment.
    current_usage = get_teacher_ai_usage(db, user)
    # Stores consumed count for current action.
    consumed_count = int(current_usage.get(normalized_quota_key, 0))
    if consumed_count >= action_limit:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                f"Quota exceeded for '{normalized_quota_key}'. "
                f"Plan '{current_plan_name}' allows {action_limit} requests per period."
            ),
        )

    # Stores period key for in-place counter increment.
    usage_period_key = get_teacher_ai_usage_period_key(db, user)
    # Stores mutable metadata map and fresh counters for write-back.
    profile_meta, usage_counts = _get_or_init_usage_meta(user, usage_period_key)
    usage_counts[normalized_quota_key] = consumed_count + 1
    # Persists incremented counters so subsequent checks observe latest usage.
    user.notification_prefs = profile_meta
    db.add(user)
    db.commit()
    db.refresh(user)