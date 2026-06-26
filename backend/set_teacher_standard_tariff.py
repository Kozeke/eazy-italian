"""
One-off script: set a teacher's active tariff to Standard in user_subscriptions.

Deactivates prior active UserSubscription rows, inserts a new row with the
default Standard billing window, and sets users.subscription_type to STANDARD.

Run inside the backend container (recommended):

  docker compose exec backend python set_teacher_standard_tariff.py

Or from the backend folder with venv / deps:

  python set_teacher_standard_tariff.py

Optional:

  python set_teacher_standard_tariff.py --email other@example.com
"""
from __future__ import annotations

import argparse
import os
import sys

# Allows `python set_teacher_standard_tariff.py` when cwd is backend/
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from datetime import datetime, timezone

from app.core.database import SessionLocal
from app.core.teacher_tariffs import (
    default_teacher_plan_ends_at,
    resolve_subscription_row_for_teacher_plan,
)
from app.models.subscription import UserSubscription
from app.models.user import User, UserRole, SubscriptionType


# Default teacher account to upgrade to Standard (matches project demo emails).
DEFAULT_TEACHER_EMAIL = "teacher@eazyitalian.com"


def set_teacher_standard_tariff(teacher_email: str) -> None:
    """Apply Standard tariff to the teacher identified by email."""
    db = SessionLocal()
    try:
        # Subscription catalog row that backs the teacher Standard plan for this database.
        target_sub = resolve_subscription_row_for_teacher_plan(db, "standard")
        if target_sub is None:
            print(
                "Error: no Standard subscription catalog row. Run seed_subscriptions.py first."
            )
            return

        # Teacher row matched by email (must exist and have role teacher).
        user = db.query(User).filter(User.email == teacher_email).first()
        if user is None:
            print(f"Error: no user with email {teacher_email!r}")
            return

        if user.role != UserRole.TEACHER:
            print(
                f"Error: user {teacher_email!r} has role {user.role!r}, expected teacher"
            )
            return

        # Timestamp used to close out previously active subscription rows.
        now = datetime.now(timezone.utc)

        # Marks prior active plans inactive so the new row is the only active subscription.
        # Each previously active subscription row for this user (typically one).
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

        # Keeps legacy student-facing column aligned where code reads subscription_type.
        user.subscription_type = SubscriptionType.STANDARD

        db.add(
            UserSubscription(
                user_id=user.id,
                subscription_id=target_sub.id,
                ends_at=default_teacher_plan_ends_at("standard"),
                is_active=True,
            )
        )

        db.commit()
        print(
            f"OK: {teacher_email} is now on Standard "
            f"(subscription catalog id={target_sub.id}, user_subscriptions updated)."
        )
    except Exception as exc:
        db.rollback()
        print(f"Error: {exc}")
        raise
    finally:
        db.close()


def main() -> None:
    """Parse CLI args and run the tariff update."""
    # CLI definition for optional teacher email override.
    parser = argparse.ArgumentParser(
        description="Set a teacher's tariff to Standard in the database.",
    )
    parser.add_argument(
        "--email",
        default=DEFAULT_TEACHER_EMAIL,
        help=f"Teacher email (default: {DEFAULT_TEACHER_EMAIL})",
    )
    # Parsed arguments from the shell (email to update).
    args = parser.parse_args()
    set_teacher_standard_tariff(args.email.strip().lower())


if __name__ == "__main__":
    main()
