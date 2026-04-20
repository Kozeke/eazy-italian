"""
Add unit_id and segment_id scope columns to exercise_field_answer_events.

Revision ID: 0016_add_answer_scope_cols
Revises: 0015_exercise_answer_cols
Create Date: 2026-04-20
"""

from alembic import op
import sqlalchemy as sa


# Stores the unique revision identifier for this migration.
revision = "0016_add_answer_scope_cols"
# Stores the immediately previous revision in the migration chain.
down_revision = "0015_exercise_answer_cols"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Holds the active DB connection used for runtime schema inspection.
    connection = op.get_bind()
    # Provides table, column, and FK metadata for idempotent DDL operations.
    inspector = sa.inspect(connection)
    # Tracks whether the answer events table exists before attempting changes.
    table_exists = inspector.has_table("exercise_field_answer_events")
    if not table_exists:
        return

    # Stores current table columns keyed by name for efficient existence checks.
    columns_by_name = {
        column["name"]: column
        for column in inspector.get_columns("exercise_field_answer_events")
    }

    # Adds optional unit scope for restoring answers by unit context.
    if "unit_id" not in columns_by_name:
        op.add_column(
            "exercise_field_answer_events",
            sa.Column("unit_id", sa.Integer(), nullable=True),
        )

    # Adds optional segment scope for restoring answers by section context.
    if "segment_id" not in columns_by_name:
        op.add_column(
            "exercise_field_answer_events",
            sa.Column("segment_id", sa.Integer(), nullable=True),
        )

    # Refreshes inspector metadata so newly added columns can be detected in FK checks.
    inspector = sa.inspect(connection)
    # Stores all existing FK definitions to avoid duplicate FK creation.
    foreign_keys = inspector.get_foreign_keys("exercise_field_answer_events")
    # Tracks whether unit_id already has a foreign key to units.id.
    has_unit_fk = any(
        fk.get("referred_table") == "units"
        and fk.get("constrained_columns") == ["unit_id"]
        for fk in foreign_keys
    )
    # Tracks whether segment_id already has a foreign key to segments.id.
    has_segment_fk = any(
        fk.get("referred_table") == "segments"
        and fk.get("constrained_columns") == ["segment_id"]
        for fk in foreign_keys
    )

    # Creates the missing unit_id foreign key used by ORM relationship constraints.
    if not has_unit_fk:
        op.create_foreign_key(
            "fk_efae_unit_id_units",
            "exercise_field_answer_events",
            "units",
            ["unit_id"],
            ["id"],
            ondelete="SET NULL",
        )

    # Creates the missing segment_id foreign key used by ORM relationship constraints.
    if not has_segment_fk:
        op.create_foreign_key(
            "fk_efae_segment_id_segments",
            "exercise_field_answer_events",
            "segments",
            ["segment_id"],
            ["id"],
            ondelete="SET NULL",
        )

    # Adds composite index to speed up answer restoration filtered by unit.
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_efae_unit "
        "ON exercise_field_answer_events (classroom_id, student_id, unit_id)"
    )
    # Adds composite index to speed up answer restoration filtered by segment.
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_efae_segment "
        "ON exercise_field_answer_events (classroom_id, student_id, segment_id)"
    )


def downgrade() -> None:
    # Drops the unit scope index created by this migration.
    op.execute("DROP INDEX IF EXISTS ix_efae_unit")
    # Drops the segment scope index created by this migration.
    op.execute("DROP INDEX IF EXISTS ix_efae_segment")

    # Holds the active DB connection used for runtime schema inspection.
    connection = op.get_bind()
    # Provides table and FK metadata for safe rollback.
    inspector = sa.inspect(connection)
    # Tracks whether the answer events table exists at rollback time.
    table_exists = inspector.has_table("exercise_field_answer_events")
    if not table_exists:
        return

    # Stores FK definitions to remove only relevant unit/segment constraints.
    foreign_keys = inspector.get_foreign_keys("exercise_field_answer_events")
    # Stores FK names bound to unit_id for targeted constraint removal.
    unit_fk_names = [
        fk.get("name")
        for fk in foreign_keys
        if fk.get("referred_table") == "units"
        and fk.get("constrained_columns") == ["unit_id"]
        and fk.get("name")
    ]
    # Stores FK names bound to segment_id for targeted constraint removal.
    segment_fk_names = [
        fk.get("name")
        for fk in foreign_keys
        if fk.get("referred_table") == "segments"
        and fk.get("constrained_columns") == ["segment_id"]
        and fk.get("name")
    ]

    # Removes any FK currently attached to unit_id before dropping the column.
    for fk_name in unit_fk_names:
        op.drop_constraint(fk_name, "exercise_field_answer_events", type_="foreignkey")

    # Removes any FK currently attached to segment_id before dropping the column.
    for fk_name in segment_fk_names:
        op.drop_constraint(fk_name, "exercise_field_answer_events", type_="foreignkey")

    # Refreshes column metadata after FK drops.
    inspector = sa.inspect(connection)
    # Stores current table columns keyed by name for existence checks.
    columns_by_name = {
        column["name"]: column
        for column in inspector.get_columns("exercise_field_answer_events")
    }

    # Removes unit_id if present.
    if "unit_id" in columns_by_name:
        op.drop_column("exercise_field_answer_events", "unit_id")
    # Removes segment_id if present.
    if "segment_id" in columns_by_name:
        op.drop_column("exercise_field_answer_events", "segment_id")
