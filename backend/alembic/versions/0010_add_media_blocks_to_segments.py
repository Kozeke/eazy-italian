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
    op.drop_column("segments", "media_blocks")
