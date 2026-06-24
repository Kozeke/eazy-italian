"""
Normalize cache_content_type enum labels to lowercase values.

Revision: 0021_fix_cache_content_type_enum
Down revision: 0020_unit_outline_sections

On some deployments the enum was created by SQLAlchemy create_all using Python
enum member names (IMAGE, SLIDE) instead of values (image, slide).  Application
code and the 0004_ai_cache migration expect lowercase labels.
"""

from alembic import op

revision = "0021_fix_cache_content_type_enum"
down_revision = "0020_unit_outline_sections"
branch_labels = None
depends_on = None

# Rename uppercase labels when present; no-op when already lowercase.
UP_SQL = """
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'cache_content_type'
           AND e.enumlabel = 'IMAGE'
    ) THEN
        ALTER TYPE cache_content_type RENAME VALUE 'IMAGE' TO 'image';
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'cache_content_type'
           AND e.enumlabel = 'SLIDE'
    ) THEN
        ALTER TYPE cache_content_type RENAME VALUE 'SLIDE' TO 'slide';
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
"""

DOWN_SQL = """
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'cache_content_type'
           AND e.enumlabel = 'image'
    ) THEN
        ALTER TYPE cache_content_type RENAME VALUE 'image' TO 'IMAGE';
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'cache_content_type'
           AND e.enumlabel = 'slide'
    ) THEN
        ALTER TYPE cache_content_type RENAME VALUE 'slide' TO 'SLIDE';
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
"""


def upgrade() -> None:
    op.execute(UP_SQL)


def downgrade() -> None:
    op.execute(DOWN_SQL)
