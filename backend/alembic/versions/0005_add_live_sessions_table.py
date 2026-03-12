"""
Alembic migration: add live_sessions table.

Revision: 0005_live_sessions
Created:  2025-01-XX

Adds live_sessions table for storing active classroom live sessions.

Run with:
    alembic upgrade head
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# ── identifiers ────────────────────────────────────────────────────────────────
revision      = "0005_live_sessions"
down_revision = "0004_join_code"  # Chain after the existing migration
branch_labels = None
depends_on    = None


def upgrade() -> None:
    """
    Create live_sessions table for storing active classroom sessions.
    """
    # Check if table already exists (idempotent migration)
    connection = op.get_bind()
    result = connection.execute(sa.text("""
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'live_sessions'
    """))
    if result.fetchone() is not None:
        # Table already exists, skip creation
        return
    
    op.create_table(
        "live_sessions",
        sa.Column("classroom_id", sa.Integer(), nullable=False),
        sa.Column("teacher_id", sa.Integer(), nullable=False),
        sa.Column("unit_id", sa.Integer(), nullable=False),
        sa.Column("slide_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("section", sa.String(20), nullable=False, server_default="slides"),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["classroom_id"], ["courses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["teacher_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["unit_id"], ["units.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("classroom_id"),
    )
    op.create_index(op.f("ix_live_sessions_teacher_id"), "live_sessions", ["teacher_id"], unique=False)
    op.create_index(op.f("ix_live_sessions_unit_id"), "live_sessions", ["unit_id"], unique=False)


def downgrade() -> None:
    """
    Remove live_sessions table.
    """
    op.drop_index(op.f("ix_live_sessions_unit_id"), table_name="live_sessions")
    op.drop_index(op.f("ix_live_sessions_teacher_id"), table_name="live_sessions")
    op.drop_table("live_sessions")
