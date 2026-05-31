"""
Alembic migration: add outline_sections to units table.

Revision: 0020_add_outline_sections_to_units
Created:  2026-05-31

Why this exists:
- The course-builder PATCH /outline endpoint lets teachers edit section titles
  before content generation, but previously those sections were never persisted
  to the database — they lived only in the API response.
- Without persistence, the SSE stream endpoint had no way to know how many or
  which sections the teacher had defined, so it always fell back to the hardcoded
  _DEFAULT_NUM_SEGMENTS (3) and ignored the teacher-edited outline entirely.
- This column stores the teacher's edited section list (title + description) as
  JSONB so the stream endpoint can read it and generate exactly those segments.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# Stores the unique revision identifier for this migration.
revision = "0020_unit_outline_sections"
# Stores the immediately previous revision in the migration chain.
down_revision = "0019_add_languages_to_courses"
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
    # Holds the active database connection used for idempotency check.
    connection = op.get_bind()

    # Add outline_sections only when the column is not already present.
    if not _column_exists(connection, "units", "outline_sections"):
        op.add_column(
            "units",
            sa.Column(
                "outline_sections",
                JSONB,
                nullable=True,
                server_default=sa.text("'[]'::jsonb"),
                comment=(
                    "Teacher-edited list of outline sections "
                    "[{title, description}, ...] saved by the PATCH /outline endpoint. "
                    "Used by the SSE stream to generate exactly the requested segments."
                ),
            ),
        )


def downgrade() -> None:
    # Guarded with IF EXISTS so the downgrade is safe even when the column
    # was never created (e.g. partially failed upgrade).
    op.execute("ALTER TABLE units DROP COLUMN IF EXISTS outline_sections")
