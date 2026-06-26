"""
One-off script: set a teacher's active tariff to Pro in user_subscriptions.

Pro is open-ended (ends_at NULL), unlimited AI quotas per teacher_tariffs.

Run inside the backend container (recommended):

  docker compose exec backend python set_teacher_pro_tariff.py

Optional:

  python set_teacher_pro_tariff.py --email other@example.com
"""
from __future__ import annotations

import argparse
import os
import sys

# Allows `python set_teacher_pro_tariff.py` when cwd is backend/
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from datetime import datetime, timezone

from app.core.database import SessionLocal
from app.core.teacher_tariffs import resolve_subscription_row_for_teacher_plan
from app.models.subscription import UserSubscription
from app.models.user import User, UserRole, SubscriptionType

# Default demo teacher email used across seed scripts and LOCAL_DEVELOPMENT.md.
DEFAULT_TEACHER_EMAIL = "teacher@eazyitalian.com"


def set_teacher_pro_tariff(teacher_email: str) -> None:
    """Apply Pro tariff to the teacher identified by email."""
    db = SessionLocal()
    try:
        # Catalog row for SubscriptionName.PRO; required for UserSubscription.subscription_id.
        target_sub = resolve_subscription_row_for_teacher_plan(db, "pro")
        if target_sub is None:
            print(
                "Error: no PRO subscription catalog row. Run seed_subscriptions.py first."
            )
            return

        # Account row to upgrade (must exist).
        user = db.query(User).filter(User.email == teacher_email).first()
        if user is None:
            print(f"Error: no user with email {teacher_email!r}")
            return

        if user.role != UserRole.TEACHER:
            print(
                f"Error: user {teacher_email!r} has role {user.role!r}, expected teacher"
            )
            return

        # Closes out any active plan so exactly one active UserSubscription remains.
        now = datetime.now(timezone.utc)
        for sub in (
            db.query(UserSubscription)
            .filter(
                UserSubscription.user_id == user.id,
                UserSubscription.is_active.is_(True),
            )
            .all()
        ):
            sub.is_active = False
            sub.ends_at = now

        # Aligns legacy users.subscription_type column with the Pro catalog row.
        user.subscription_type = SubscriptionType.PRO

        db.add(
            UserSubscription(
                user_id=user.id,
                subscription_id=target_sub.id,
                ends_at=None,
                is_active=True,
            )
        )

        db.commit()
        print(
            f"OK: {teacher_email} is now on Pro "
            f"(subscription catalog id={target_sub.id}, open-ended)."
        )
    except Exception as exc:
        db.rollback()
        print(f"Error: {exc}")
        raise
    finally:
        db.close()


def main() -> None:
    """Parse CLI args and run the Pro tariff update."""
    # CLI definition for optional teacher email override.
    parser = argparse.ArgumentParser(
        description="Set a teacher's tariff to Pro in the database.",
    )
    parser.add_argument(
        "--email",
        default=DEFAULT_TEACHER_EMAIL,
        help=f"Teacher email (default: {DEFAULT_TEACHER_EMAIL})",
    )
    # Parsed shell arguments (normalized email).
    args = parser.parse_args()
    set_teacher_pro_tariff(args.email.strip().lower())


if __name__ == "__main__":
    main()
