"""
Alembic migration: add onboarding_completed column to users.

Revision: 0003_add_onboarding_completed_to_users
Created:  2025-01-XX

Adds onboarding completion tracking for teachers:
- onboarding_completed: BOOLEAN DEFAULT FALSE - tracks if teacher completed onboarding

Run with:
    alembic upgrade head
"""

from alembic import op
import sqlalchemy as sa

# ── identifiers ────────────────────────────────────────────────────────────────
revision      = "0003_onboarding"
down_revision = "0002_slide_images"  # Chain after the existing migration
branch_labels = None
depends_on    = None


def upgrade() -> None:
    """
    Add onboarding_completed column to users table.
    
    Defaults to False for existing users (they haven't completed onboarding yet).
    Uses IF NOT EXISTS check to make the migration idempotent.
    """
    # Check if column exists before adding (idempotent migration)
    connection = op.get_bind()
    
    result = connection.execute(sa.text("""
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'onboarding_completed'
    """))
    if result.fetchone() is None:
        op.add_column(
            "users",
            sa.Column("onboarding_completed", sa.Boolean(), nullable=False, server_default=sa.false())
        )


def downgrade() -> None:
    """
    Remove onboarding_completed column from users table.
    Checks if column exists before dropping (safe downgrade).
    """
    connection = op.get_bind()
    
    result = connection.execute(sa.text("""
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'onboarding_completed'
    """))
    if result.fetchone() is not None:
        op.drop_column("users", "onboarding_completed")
