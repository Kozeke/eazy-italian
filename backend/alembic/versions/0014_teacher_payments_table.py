"""
Create teacher_payments ledger for admin tariff checkout history.

Revision ID: 0014_teacher_payments
Revises: 0013_ensure_courses_join_code
Create Date: 2026-04-19
"""

from alembic import op
import sqlalchemy as sa


# Stores the unique revision identifier for this migration.
revision = "0014_teacher_payments"
# Stores the immediately previous revision in the migration chain.
down_revision = "0013_ensure_courses_join_code"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Holds the connection used to inspect table existence before DDL operations.
    connection = op.get_bind()
    # Provides schema metadata for idempotent table creation.
    inspector = sa.inspect(connection)
    # Tracks whether the teacher payments table already exists.
    table_exists = inspector.has_table("teacher_payments")
    if not table_exists:
        op.create_table(
            "teacher_payments",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("amount", sa.Float(), nullable=False),
            sa.Column("currency", sa.String(length=8), server_default="USD", nullable=False),
            sa.Column("status", sa.String(length=24), server_default="succeeded", nullable=False),
            sa.Column("plan_code", sa.String(length=32), nullable=True),
            sa.Column("billing_period", sa.String(length=8), nullable=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("provider_ref", sa.String(length=255), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_teacher_payments_user_id ON teacher_payments (user_id)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_teacher_payments_user_id")
    op.execute("DROP TABLE IF EXISTS teacher_payments")
