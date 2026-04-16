"""add_segments_table_and_segment_id_fks

Revision ID: 001_add_segments
Revises: <your_previous_revision_id>
Create Date: 2026-03-24

What this migration does
------------------------
1. Creates the `segments` table.
2. Adds `segment_id` (nullable) to videos, tasks, tests, presentations.
3. Adds indexes on segment_id in each content table.

Data migration (separate script — see migrate_content_to_segments.py):
- For every existing unit, a default segment named "Main" is created.
- All existing content rows for that unit are assigned to that segment.
- Once verified, segment_id can be made NOT NULL in a follow-up migration.

Rollback:
- Drops segment_id from content tables.
- Drops the segments table.

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# ── Revision identifiers ──────────────────────────────────────────────────────

revision = "001_add_segments"
down_revision = "001_question_types_first_wave"
branch_labels = None
depends_on = None


# ── upgrade ───────────────────────────────────────────────────────────────────

def upgrade() -> None:

    # 1. Create segment_status enum
    segment_status = sa.Enum(
        "draft", "scheduled", "published", "archived",
        name="segmentstatus",
    )
    segment_status.create(op.get_bind(), checkfirst=True)

    # 2. Create segments table
    op.create_table(
        "segments",
        sa.Column("id",          sa.Integer(), primary_key=True),
        sa.Column("unit_id",     sa.Integer(), sa.ForeignKey("units.id",  ondelete="CASCADE"), nullable=False),
        sa.Column("title",       sa.String(255), nullable=False),
        sa.Column("description", sa.Text(),      nullable=True),
        sa.Column("order_index", sa.Integer(),   nullable=False, server_default="0"),
        sa.Column(
            "status",
            postgresql.ENUM(
                "draft",
                "scheduled",
                "published",
                "archived",
                name="segmentstatus",
                create_type=False,
            ),
            nullable=False,
            server_default="draft",
        ),
        sa.Column("publish_at",             sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_visible_to_students", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_by",  sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("updated_by",  sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at",  sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at",  sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_segments_unit_id", "segments", ["unit_id"])

    # 3. Add segment_id to content tables (nullable during migration)
    for table in ("videos", "tasks", "tests", "presentations"):
        op.add_column(
            table,
            sa.Column(
                "segment_id",
                sa.Integer(),
                sa.ForeignKey("segments.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
        op.create_index(f"ix_{table}_segment_id", table, ["segment_id"])


# ── downgrade ─────────────────────────────────────────────────────────────────

def downgrade() -> None:
    # Remove segment_id from content tables
    for table in ("videos", "tasks", "tests", "presentations"):
        op.drop_index(f"ix_{table}_segment_id", table_name=table)
        op.drop_column(table, "segment_id")

    # Drop segments table and enum
    op.drop_index("ix_segments_unit_id", table_name="segments")
    op.drop_table("segments")
    sa.Enum(name="segmentstatus").drop(op.get_bind(), checkfirst=True)