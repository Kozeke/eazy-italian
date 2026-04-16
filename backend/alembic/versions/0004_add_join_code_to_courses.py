"""
Alembic migration: add join_code column to courses.

Revision: 0004_add_join_code_to_courses
Created:  2025-01-XX

Adds join code support for courses:
- join_code: VARCHAR(10) NULLABLE UNIQUE INDEXED - Code for students to join the course

Run with:
    alembic upgrade head
"""

from alembic import op
import sqlalchemy as sa

# ── identifiers ────────────────────────────────────────────────────────────────
revision      = "0004_join_code"
down_revision = "0003_onboarding"  # Chain after the existing migration
branch_labels = None
depends_on    = None


def upgrade() -> None:
    """
    Add join_code column to courses table.
    
    The column is nullable to support existing courses without join codes.
    Uses IF NOT EXISTS check to make the migration idempotent.
    """
    # Check if column exists before adding (idempotent migration)
    connection = op.get_bind()
    
    result = connection.execute(sa.text("""
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'courses'
          AND column_name = 'join_code'
    """))
    # Tracks whether join_code already exists on courses.
    join_code_exists = result.fetchone() is not None
    if not join_code_exists:
        # Add the column
        op.add_column(
            "courses",
            sa.Column("join_code", sa.String(10), nullable=True)
        )

    # Create unique index on join_code when missing.
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_courses_join_code ON courses (join_code)")


def downgrade() -> None:
    """
    Remove join_code column and index from courses table.
    Checks if column exists before dropping (safe downgrade).
    """
    connection = op.get_bind()
    
    # Drop index first
    result = connection.execute(sa.text("""
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'courses'
          AND indexname = 'ix_courses_join_code'
    """))
    if result.fetchone() is not None:
        op.drop_index("ix_courses_join_code", table_name="courses")
    
    # Drop column
    result = connection.execute(sa.text("""
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'courses'
          AND column_name = 'join_code'
    """))
    if result.fetchone() is not None:
        op.drop_column("courses", "join_code")
