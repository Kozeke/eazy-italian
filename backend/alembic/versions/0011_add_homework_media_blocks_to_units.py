"""add homework_blocks to units

Revision ID: a1b2c3d4e5f6
Revises: <previous_revision_id>
Create Date: 2025-08-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision = "a1b2c3d4e5f6"
down_revision = "003_segment_media_blocks"   # ← replace with your actual head
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "units",
        sa.Column(
            "homework_blocks",
            JSONB,
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("units", "homework_blocks")