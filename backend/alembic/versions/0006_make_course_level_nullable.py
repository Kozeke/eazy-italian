"""
Alembic migration: make courses.level nullable.

Revision: 0006_course_level_nullable
Created:  2026-03-16

Allows creating placeholder courses with only a title.
"""

from alembic import op
import sqlalchemy as sa


revision = "0006_course_level_nullable"
down_revision = "0005_live_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    result = connection.execute(sa.text("""
        SELECT is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'courses'
          AND column_name = 'level'
    """))
    row = result.fetchone()
    if row and row[0] == "NO":
        op.alter_column("courses", "level", existing_type=sa.Enum(name="courselevel"), nullable=True)


def downgrade() -> None:
    connection = op.get_bind()
    result = connection.execute(sa.text("""
        SELECT COUNT(*)
        FROM courses
        WHERE level IS NULL
    """))
    null_count = result.scalar() or 0
    if null_count:
        raise RuntimeError("Cannot make courses.level NOT NULL while rows with NULL level exist.")

    op.alter_column("courses", "level", existing_type=sa.Enum(name="courselevel"), nullable=False)
