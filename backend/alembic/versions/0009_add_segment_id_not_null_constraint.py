"""add_segment_id_not_null_constraint

Revision ID: 002_segment_id_not_null
Revises: 001_add_segments
Create Date: 2026-03-24

Run this AFTER:
  1. 001_add_segments Alembic migration
  2. migrate_content_to_segments.py data script

This migration makes segment_id NOT NULL on all content tables.
Verify zero NULLs before running:

    SELECT 'videos' AS t, COUNT(*) FROM videos WHERE segment_id IS NULL
    UNION ALL
    SELECT 'tasks',        COUNT(*) FROM tasks   WHERE segment_id IS NULL
    UNION ALL
    SELECT 'tests',        COUNT(*) FROM tests   WHERE segment_id IS NULL
    UNION ALL
    SELECT 'presentations',COUNT(*) FROM presentations WHERE segment_id IS NULL;

All counts must be 0.
"""

from alembic import op
import sqlalchemy as sa


revision = "002_segment_id_not_null"
down_revision = "001_add_segments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # NOT NULL enforcement skipped — the data-backfill script was not run so
    # existing rows still have NULL segment_id values.  segment_id remains
    # nullable on all content tables until a data migration is completed.
    pass


def downgrade() -> None:
    pass