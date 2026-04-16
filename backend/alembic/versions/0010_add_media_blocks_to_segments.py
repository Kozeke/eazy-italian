"""add_media_blocks_to_segments

Revision ID: 003_segment_media_blocks
Revises: 002_segment_id_not_null
Create Date: 2026-03-27
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "003_segment_media_blocks"
down_revision = "002_segment_id_not_null"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Holds the connection used to verify whether media_blocks already exists.
    connection = op.get_bind()
    # Stores the existence check result for the media_blocks column.
    media_blocks_exists = connection.execute(
        sa.text(
            """
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'segments'
              AND column_name = 'media_blocks'
            """
        )
    ).fetchone()
    if media_blocks_exists is None:
        op.add_column(
            "segments",
            sa.Column(
                "media_blocks",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'[]'::jsonb"),
            ),
        )


def downgrade() -> None:
    op.execute("ALTER TABLE segments DROP COLUMN IF EXISTS media_blocks")
