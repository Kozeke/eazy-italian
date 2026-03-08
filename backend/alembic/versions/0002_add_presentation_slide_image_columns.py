"""
Alembic migration: add image_url and image_alt columns to presentation_slides.

Revision: 0002_add_presentation_slide_image_columns
Created:  2025-01-XX

Adds image storage support for presentation slides:
- image_url: VARCHAR(1000) - URL to the slide image (MinIO or external)
- image_alt: VARCHAR(500) - Alt text for accessibility

Run with:
    alembic upgrade head
"""

from alembic import op
import sqlalchemy as sa

# ── identifiers ────────────────────────────────────────────────────────────────
revision      = "0002_slide_images"
down_revision = "0001_lesson_chunks"  # Chain after the existing migration
branch_labels = None
depends_on    = None


def upgrade() -> None:
    """
    Add image_url and image_alt columns to presentation_slides table.
    
    These columns are nullable to support slides without images.
    Uses IF NOT EXISTS check to make the migration idempotent.
    """
    # Check if columns exist before adding (idempotent migration)
    connection = op.get_bind()
    
    # Check for image_url
    result = connection.execute(sa.text("""
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'presentation_slides'
          AND column_name = 'image_url'
    """))
    if result.fetchone() is None:
        op.add_column(
            "presentation_slides",
            sa.Column("image_url", sa.String(1000), nullable=True)
        )
    
    # Check for image_alt
    result = connection.execute(sa.text("""
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'presentation_slides'
          AND column_name = 'image_alt'
    """))
    if result.fetchone() is None:
        op.add_column(
            "presentation_slides",
            sa.Column("image_alt", sa.String(500), nullable=True)
        )


def downgrade() -> None:
    """
    Remove image_url and image_alt columns from presentation_slides table.
    Checks if columns exist before dropping (safe downgrade).
    """
    connection = op.get_bind()
    
    # Check for image_alt before dropping
    result = connection.execute(sa.text("""
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'presentation_slides'
          AND column_name = 'image_alt'
    """))
    if result.fetchone() is not None:
        op.drop_column("presentation_slides", "image_alt")
    
    # Check for image_url before dropping
    result = connection.execute(sa.text("""
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'presentation_slides'
          AND column_name = 'image_url'
    """))
    if result.fetchone() is not None:
        op.drop_column("presentation_slides", "image_url")
