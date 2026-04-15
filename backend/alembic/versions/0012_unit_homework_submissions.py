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
    op.create_index(
        op.f("ix_unit_homework_submissions_unit_id"),
        "unit_homework_submissions",
        ["unit_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_unit_homework_submissions_student_id"),
        "unit_homework_submissions",
        ["student_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_unit_homework_submissions_student_id"), table_name="unit_homework_submissions")
    op.drop_index(op.f("ix_unit_homework_submissions_unit_id"), table_name="unit_homework_submissions")
    op.drop_table("unit_homework_submissions")
