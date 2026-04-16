"""
Alembic migration: ensure courses.join_code exists for schema recovery.

Revision: 0013_ensure_courses_join_code
Created:  2026-04-16

Why this exists:
- Some environments reached later revisions without the join_code column.
- This repair migration safely adds the missing column/index if absent.
"""

from alembic import op
import sqlalchemy as sa


# Stores the unique revision identifier for this recovery migration.
revision = "0013_ensure_courses_join_code"
# Stores the immediately previous revision in the migration chain.
down_revision = "0012_hw_submissions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Holds the active database connection for idempotency checks.
    connection = op.get_bind()
    # Stores whether courses.join_code already exists.
    join_code_exists = connection.execute(
        sa.text(
            """
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'courses'
              AND column_name = 'join_code'
            """
        )
    ).fetchone()
    if join_code_exists is None:
        op.add_column(
            "courses",
            sa.Column("join_code", sa.String(length=10), nullable=True),
        )

    # Ensures the unique index exists even if the column was already present.
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_courses_join_code ON courses (join_code)")


def downgrade() -> None:
    # Removes the index only when present to keep downgrade safe.
    op.execute("DROP INDEX IF EXISTS ix_courses_join_code")
    # Removes the column only when present to keep downgrade idempotent.
    op.execute("ALTER TABLE courses DROP COLUMN IF EXISTS join_code")
