"""
app/core/teacher_tariffs.py

Core business logic for teacher subscription plans, AI quota management,
and plan-display helpers consumed by the tariff API endpoints.

Expiry contract
---------------
When a teacher's billing window has lapsed (period_expired=True):
  • ALL AI-generation actions are blocked immediately — before quota is checked.
  • A 402 with a clear renewal message is raised.
  • NO existing course visibility is changed — published courses remain
    accessible to students independently of the teacher's subscription state.
  • The teacher must explicitly call PATCH /courses/{id}/unpublish to hide
    content; plan expiry never triggers that action automatically.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.subscription import Subscription, SubscriptionName, UserSubscription
from app.models.user import User, UserRole

logger = logging.getLogger(__name__)

# ── Plan aliases ──────────────────────────────────────────────────────────────

# Public plan tag visible in the UI and stored in the tariff response.
TeacherTariffName = str   # "free" | "standard" | "pro"

# Legacy DB plan aliases that map to the canonical names.
_PLAN_ALIASES: dict[str, str] = {
    "premium": "standard",
    "basic":   "free",
}

# ── Plan limits catalog ───────────────────────────────────────────────────────
# None = unlimited (Pro plan).

_PLAN_LIMITS: dict[str, dict[str, int | None]] = {
    "free": {
        "exercise_generation":  10,
        "unit_generation":       3,
        "course_generation":     1,
        "course_publish":        0,   # 0 = blocked on free
    },
    "standard": {
        "exercise_generation":  100,
        "unit_generation":       20,
        "course_generation":      5,
        "course_publish":        None,  # unlimited
    },
    "pro": {
        "exercise_generation":  None,
        "unit_generation":      None,
        "course_generation":    None,
        "course_publish":       None,
    },
}

# Quota counter key names stored in Redis / usage table, keyed by action slug.
_ACTION_USAGE_KEYS: dict[str, str] = {
    "exercise_generation": "exercise_generations",
    "unit_generation":     "unit_generations",
    "course_generation":   "course_generations",
    "task_generation":     "exercise_generations",   # mapped to same bucket
}

# ── Helpers ───────────────────────────────────────────────────────────────────

def canonicalize_teacher_plan_name(plan: str) -> TeacherTariffName:
    """Normalise raw plan strings (including legacy aliases) to canonical names."""
    normalised = plan.strip().lower()
    return _PLAN_ALIASES.get(normalised, normalised)


def default_teacher_plan_ends_at(plan: TeacherTariffName) -> datetime:
    """
    Return the default expiry for new Free/Standard subscriptions.

    Free  → 30 days (trial window — after which generation is blocked).
    Standard → 30 days (monthly billing cycle default).
    Pro   → no expiry; callers should not call this for Pro.
    """
    return datetime.now(timezone.utc) + timedelta(days=30)


def get_teacher_tariff_limits(plan: TeacherTariffName) -> dict[str, int | None]:
    """Return the AI quota limits for the given plan name."""
    return _PLAN_LIMITS.get(plan, _PLAN_LIMITS["free"])


def build_teacher_tariff_catalog() -> list[dict]:
    """Return the static catalog rows for the tariff list endpoint."""
    return [
        {"name": name, "ai_limits": limits}
        for name, limits in _PLAN_LIMITS.items()
    ]


def resolve_subscription_row_for_teacher_plan(
    db: Session, plan: TeacherTariffName
) -> Optional[Subscription]:
    """Fetch the Subscription row whose name matches the given plan."""
    # Map canonical plan name to the SubscriptionName enum variant.
    try:
        sub_name = SubscriptionName(plan)
    except ValueError:
        # Legacy alias: try "premium" for "standard"
        try:
            sub_name = SubscriptionName("premium" if plan == "standard" else plan)
        except ValueError:
            return None

    return db.query(Subscription).filter(Subscription.name == sub_name).first()


# ── Subscription resolution ───────────────────────────────────────────────────

def _get_active_user_subscription(db: Session, user: User) -> Optional[UserSubscription]:
    """Return the most recent active UserSubscription row for this teacher."""
    return (
        db.query(UserSubscription)
        .filter(
            UserSubscription.user_id == user.id,
            UserSubscription.is_active == True,  # noqa: E712
        )
        .order_by(UserSubscription.starts_at.desc())
        .first()
    )


def get_teacher_subscription_ends_at(db: Session, user: User) -> Optional[datetime]:
    """Return the plan expiry datetime for this teacher, or None for Pro/open-ended."""
    row = _get_active_user_subscription(db, user)
    return row.ends_at if row else None


def _is_period_expired(ends_at: Optional[datetime]) -> bool:
    """Return True when ends_at is set and already passed."""
    if ends_at is None:
        return False
    now = datetime.now(timezone.utc)
    # Normalise naive datetimes from older rows.
    if ends_at.tzinfo is None:
        ends_at = ends_at.replace(tzinfo=timezone.utc)
    return now > ends_at


def get_teacher_tariff_display_state(
    db: Session, user: User
) -> tuple[TeacherTariffName, bool]:
    """
    Resolve the teacher's current plan name and expiry flag.

    Returns
    -------
    (plan_name, period_expired)
        plan_name      — canonical plan string ("free" | "standard" | "pro")
        period_expired — True when the billing window has lapsed
    """
    row = _get_active_user_subscription(db, user)
    if row is None:
        return "free", False

    # Resolve the plan name from the subscription row.
    raw_name = row.subscription.name.value if row.subscription else "free"
    plan = canonicalize_teacher_plan_name(raw_name)
    expired = _is_period_expired(row.ends_at)

    return plan, expired


# ── Usage tracking ────────────────────────────────────────────────────────────

def get_teacher_ai_usage_period_key(db: Session, user: User) -> str:
    """
    Return an opaque string key that identifies the current usage bucket.

    For timed plans this is the UserSubscription row ID (so usage resets on
    renewal).  For open-ended Pro it falls back to YYYY-MM.
    """
    row = _get_active_user_subscription(db, user)
    if row and row.ends_at:
        return f"sub_{row.id}"
    now = datetime.now(timezone.utc)
    return now.strftime("%Y-%m")


def get_teacher_ai_usage(db: Session, user: User) -> dict[str, int]:
    """
    Return per-action usage counters for the teacher's current billing period.

    This implementation reads from the TeacherAIUsage table (or equivalent).
    Falls back to zero-filled dict if the table does not exist yet so the
    endpoint never crashes on fresh deployments.
    """
    try:
        from app.models.teacher_ai_usage import TeacherAIUsage  # type: ignore

        period_key = get_teacher_ai_usage_period_key(db, user)
        rows = (
            db.query(TeacherAIUsage)
            .filter(
                TeacherAIUsage.user_id == user.id,
                TeacherAIUsage.period_key == period_key,
            )
            .all()
        )
        usage: dict[str, int] = {}
        for row in rows:
            usage[row.action] = row.count
        # Normalise keys to the public-facing names.
        return {
            "exercise_generations": usage.get("exercise_generation", 0),
            "unit_generations":     usage.get("unit_generation", 0),
            "course_generations":   usage.get("course_generation", 0),
        }
    except Exception:
        # Model not yet migrated — return zeroes so the UI still renders.
        return {
            "exercise_generations": 0,
            "unit_generations":     0,
            "course_generations":   0,
        }


def _increment_usage(db: Session, user: User, action: str) -> None:
    """
    Atomically increment the teacher's usage counter for the given action.

    Silently swallows errors so a usage-tracking failure never blocks the
    teacher's actual generation request.
    """
    try:
        from app.models.teacher_ai_usage import TeacherAIUsage  # type: ignore

        period_key = get_teacher_ai_usage_period_key(db, user)
        row = (
            db.query(TeacherAIUsage)
            .filter(
                TeacherAIUsage.user_id == user.id,
                TeacherAIUsage.period_key == period_key,
                TeacherAIUsage.action == action,
            )
            .first()
        )
        if row:
            row.count = (row.count or 0) + 1
        else:
            db.add(
                TeacherAIUsage(
                    user_id=user.id,
                    period_key=period_key,
                    action=action,
                    count=1,
                )
            )
        db.commit()
    except Exception as exc:
        logger.warning("Usage increment failed (non-fatal): %s", exc)
        db.rollback()


# ── Quota enforcement — the critical gate ─────────────────────────────────────

def check_and_consume_teacher_ai_quota(
    db: Session,
    user: User,
    action: str,
) -> None:
    """
    Gate every AI generation action behind plan limits.

    Call order is intentional — expiry is checked **before** quota so that an
    expired teacher with quota remaining still cannot generate.

    Parameters
    ----------
    db     : active SQLAlchemy session
    user   : the authenticated teacher
    action : quota bucket slug — one of:
             "exercise_generation", "unit_generation", "course_generation",
             "course_publish", "task_generation"

    Raises
    ------
    HTTPException 402
        • When the teacher's billing period has expired (checked first).
        • When the teacher has exhausted their quota for this action.
    HTTPException 403
        • When the action is explicitly blocked on the teacher's plan (e.g.
          course_publish on the free tier).
    """

    # ── Step 1: expiry gate (MUST be the first check) ────────────────────────
    #
    # A lapsed subscription blocks ALL new AI actions regardless of quota.
    # This does NOT affect existing published courses — those remain accessible
    # to students (visibility is set at publish-time and persists independently).
    plan, period_expired = get_teacher_tariff_display_state(db, user)

    if period_expired:
        logger.info(
            "AI action '%s' blocked for user %s — plan '%s' has expired.",
            action, user.id, plan,
        )
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                "Your subscription has expired. "
                "Renew your plan to continue generating content. "
                "Your existing published courses remain accessible to students."
            ),
        )

    # ── Step 2: plan-level block (e.g. course_publish on free) ───────────────
    limits = get_teacher_tariff_limits(plan)
    action_limit = limits.get(action)

    if action_limit == 0:
        # Explicitly blocked — not a quota issue, a plan-tier restriction.
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                f"The '{action}' action is not available on the {plan.capitalize()} plan. "
                "Upgrade to Standard or Pro to unlock this feature."
            ),
        )

    # ── Step 3: quota check ───────────────────────────────────────────────────
    if action_limit is None:
        # Unlimited plan (Pro) — skip counting entirely.
        logger.debug("Unlimited quota for action '%s' (plan: %s).", action, plan)
        return

    # Read current usage for this period.
    usage_map = get_teacher_ai_usage(db, user)
    # Map the action slug to the public usage key.
    usage_key = _ACTION_USAGE_KEYS.get(action, action)
    current_usage = usage_map.get(usage_key, 0)

    if current_usage >= action_limit:
        logger.info(
            "Quota exhausted for user %s: action='%s' used=%d limit=%d plan='%s'",
            user.id, action, current_usage, action_limit, plan,
        )
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                f"You have used all {action_limit} {action.replace('_', ' ')}(s) "
                f"available on the {plan.capitalize()} plan this period. "
                "Upgrade your plan or wait for the next billing cycle."
            ),
        )

    # ── Step 4: consume one unit of quota ────────────────────────────────────
    _increment_usage(db, user, action)
    logger.debug(
        "Quota consumed: user=%s action='%s' used=%d/%d plan='%s'",
        user.id, action, current_usage + 1, action_limit, plan,
    )


def apply_teacher_plan_subscription_from_gateway(
    db: Session,
    user_id: int,
    plan: str,
    ends_at: Optional[datetime],
    *,
    commit: bool = True,
) -> Optional[User]:
    """
    Deactivates prior active UserSubscription rows and inserts the new plan for a teacher.

    Used by Stripe webhooks (authoritative activation) and keeps behaviour aligned with
    PUT /admin/tariffs/me: Pro uses open-ended ends_at; Free/Standard get defaults when
    ends_at is omitted.
    """
    # Loads the account Stripe correlated via client_reference_id / metadata.
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        logger.warning("Gateway plan apply skipped: no user id=%s", user_id)
        return None
    if user.role != UserRole.TEACHER:
        logger.warning("Gateway plan apply skipped: user id=%s is not a teacher", user_id)
        return None

    target_plan = canonicalize_teacher_plan_name(plan)
    if target_plan not in ("free", "standard", "pro"):
        logger.warning("Gateway plan apply skipped: invalid plan %r", plan)
        return None

    target_subscription = resolve_subscription_row_for_teacher_plan(db, target_plan)
    if target_subscription is None:
        logger.error("Gateway plan apply: missing Subscription catalog row for %s", target_plan)
        return None

    # Pro is always open-ended in the teacher tariff model; Standard/Free use Stripe or defaults.
    plan_ends_at: Optional[datetime] = None
    if target_plan == "pro":
        plan_ends_at = None
    else:
        plan_ends_at = ends_at
        if plan_ends_at is None and target_plan in ("free", "standard"):
            plan_ends_at = default_teacher_plan_ends_at(target_plan)

    db.query(UserSubscription).filter(
        UserSubscription.user_id == user.id,
        UserSubscription.is_active == True,  # noqa: E712
    ).update({"is_active": False})

    db.add(
        UserSubscription(
            user_id=user.id,
            subscription_id=target_subscription.id,
            ends_at=plan_ends_at,
            is_active=True,
        )
    )
    if commit:
        db.commit()
        db.refresh(user)
    return user