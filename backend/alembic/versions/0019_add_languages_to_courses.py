"""
Alembic migration: add target_language and native_language to courses.

Revision: 0019_add_languages_to_courses
Created:  2026-05-09

Why this exists:
- The course AI-generation flow already accepts ``target_language`` (the
  language being taught, e.g. "Italian") and ``native_language`` (the
  explanation language, e.g. "Russian") as transient parameters.
- We now want to persist them on the course itself so unit/exercise
  generation, content rendering, and admin filtering can rely on them
  without re-asking the teacher each time.
- The migration is written to be idempotent so it is safe to run on
  databases that may already have one or both columns from a partial
  hand-applied schema change.
"""

from alembic import op
import sqlalchemy as sa


# Stores the unique revision identifier for this migration.
revision = "0019_add_languages_to_courses"
# Stores the immediately previous revision in the migration chain.
down_revision = "0018_teacher_ai_usage"
branch_labels = None
depends_on = None


def _column_exists(connection, table_name: str, column_name: str) -> bool:
    """Return True if *column_name* already exists on *table_name* in the public schema.

    Performed via information_schema so the check works on any Postgres
    version without relying on SQLAlchemy reflection caches.
    """
    # Holds the lookup result row (or None when the column is missing).
    row = connection.execute(
        sa.text(
            """
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = :table_name
              AND column_name = :column_name
            """
        ),
        {"table_name": table_name, "column_name": column_name},
    ).fetchone()
    return row is not None


def upgrade() -> None:
    # Holds the active database connection used for idempotency probes.
    connection = op.get_bind()

    # Add target_language only when the column is not already present.
    if not _column_exists(connection, "courses", "target_language"):
        op.add_column(
            "courses",
            sa.Column("target_language", sa.String(length=64), nullable=True),
        )

    # Add native_language only when the column is not already present.
    if not _column_exists(connection, "courses", "native_language"):
        op.add_column(
            "courses",
            sa.Column("native_language", sa.String(length=64), nullable=True),
        )


def downgrade() -> None:
    # Drops are guarded with IF EXISTS so the downgrade is safe even when the
    # columns were never created (e.g. partially failed upgrade).
    op.execute("ALTER TABLE courses DROP COLUMN IF EXISTS native_language")
    op.execute("ALTER TABLE courses DROP COLUMN IF EXISTS target_language")
