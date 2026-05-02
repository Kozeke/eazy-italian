"""
Create teacher_ai_usage for per-period AI quota counters.

Revision ID: 0018_teacher_ai_usage
Revises: 0017_fix_answer_scope_check
Create Date: 2026-05-02
"""

from alembic import op
import sqlalchemy as sa


# Stores the unique revision identifier for this migration.
revision = "0018_teacher_ai_usage"
# Stores the immediately previous revision in the migration chain.
down_revision = "0017_fix_answer_scope_check"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Holds the connection used to inspect table existence before DDL operations.
    connection = op.get_bind()
    # Provides schema metadata for idempotent table creation.
    inspector = sa.inspect(connection)
    # Tracks whether the usage table already exists.
    table_exists = inspector.has_table("teacher_ai_usage")
    if not table_exists:
        op.create_table(
            "teacher_ai_usage",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("period_key", sa.String(length=64), nullable=False),
            sa.Column("action", sa.String(length=64), nullable=False),
            sa.Column("count", sa.Integer(), server_default="0", nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "user_id",
                "period_key",
                "action",
                name="uq_teacher_ai_usage_user_period_action",
            ),
        )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_teacher_ai_usage_user_id ON teacher_ai_usage (user_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_teacher_ai_usage_period_key ON teacher_ai_usage (period_key)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_teacher_ai_usage_period_key")
    op.execute("DROP INDEX IF EXISTS ix_teacher_ai_usage_user_id")
    op.execute("DROP TABLE IF EXISTS teacher_ai_usage")
