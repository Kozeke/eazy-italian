"""unit homework submissions (answers + status)

Revision ID: 0012_hw_submissions
Revises: a1b2c3d4e5f6
Create Date: 2026-04-12

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0012_hw_submissions"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Holds the connection used to inspect table existence before DDL operations.
    connection = op.get_bind()
    # Provides schema metadata for idempotent table creation.
    inspector = sa.inspect(connection)
    # Tracks whether the submissions table already exists.
    submissions_table_exists = inspector.has_table("unit_homework_submissions")
    if not submissions_table_exists:
        op.create_table(
            "unit_homework_submissions",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("unit_id", sa.Integer(), nullable=False),
            sa.Column("student_id", sa.Integer(), nullable=False),
            sa.Column(
                "status",
                sa.String(length=32),
                nullable=False,
                server_default="assigned",
            ),
            sa.Column("answers", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column("teacher_feedback", sa.Text(), nullable=True),
            sa.Column("submitted_for_review_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.ForeignKeyConstraint(["student_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["unit_id"], ["units.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("unit_id", "student_id", name="uq_unit_homework_student"),
        )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_unit_homework_submissions_unit_id ON unit_homework_submissions (unit_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_unit_homework_submissions_student_id ON unit_homework_submissions (student_id)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_unit_homework_submissions_student_id")
    op.execute("DROP INDEX IF EXISTS ix_unit_homework_submissions_unit_id")
    op.execute("DROP TABLE IF EXISTS unit_homework_submissions")
