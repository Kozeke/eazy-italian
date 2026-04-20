"""
Align exercise_field_answer_events table with the live answer event model.

Revision ID: 0015_exercise_answer_cols
Revises: 0014_teacher_payments
Create Date: 2026-04-20
"""

from alembic import op
import sqlalchemy as sa


# Stores the unique revision identifier for this migration.
revision = "0015_exercise_answer_cols"
# Stores the immediately previous revision in the migration chain.
down_revision = "0014_teacher_payments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Holds the active DB connection used for schema inspection.
    connection = op.get_bind()
    # Provides table/column metadata for idempotent migration steps.
    inspector = sa.inspect(connection)
    # Tracks whether the answer events table already exists.
    table_exists = inspector.has_table("exercise_field_answer_events")

    if not table_exists:
        op.create_table(
            "exercise_field_answer_events",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("classroom_id", sa.Integer(), nullable=False),
            sa.Column("student_id", sa.Integer(), nullable=False),
            sa.Column("exercise_key", sa.String(), nullable=False),
            sa.Column("block_id", sa.String(), nullable=False),
            sa.Column("field_key", sa.String(), nullable=False),
            sa.Column("value", sa.JSON(), nullable=True),
            sa.Column("is_correct", sa.Boolean(), nullable=True),
            sa.Column("written_by_teacher", sa.Boolean(), server_default=sa.text("false"), nullable=False),
            sa.Column("is_broadcast", sa.Boolean(), server_default=sa.text("false"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.ForeignKeyConstraint(["classroom_id"], ["courses.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["student_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
    else:
        # Stores current table columns keyed by column name.
        columns_by_name = {column["name"]: column for column in inspector.get_columns("exercise_field_answer_events")}

        # Adds logical key column used by current live sync writes.
        if "exercise_key" not in columns_by_name:
            op.add_column("exercise_field_answer_events", sa.Column("exercise_key", sa.String(), nullable=True))
        # Adds block id column used to index answer events by exercise block.
        if "block_id" not in columns_by_name:
            op.add_column("exercise_field_answer_events", sa.Column("block_id", sa.String(), nullable=True))
        # Adds optional correctness marker for teacher/student answer checks.
        if "is_correct" not in columns_by_name:
            op.add_column("exercise_field_answer_events", sa.Column("is_correct", sa.Boolean(), nullable=True))
        # Adds teacher provenance flag for target/broadcast writes.
        if "written_by_teacher" not in columns_by_name:
            op.add_column(
                "exercise_field_answer_events",
                sa.Column("written_by_teacher", sa.Boolean(), server_default=sa.text("false"), nullable=False),
            )
        # Adds broadcast provenance flag for teacher writes to all students.
        if "is_broadcast" not in columns_by_name:
            op.add_column(
                "exercise_field_answer_events",
                sa.Column("is_broadcast", sa.Boolean(), server_default=sa.text("false"), nullable=False),
            )

        # Backfills legacy rows so required columns can be made non-null safely.
        op.execute(
            """
            UPDATE exercise_field_answer_events
            SET block_id = COALESCE(block_id, 'legacy')
            WHERE block_id IS NULL
            """
        )
        # Builds a deterministic fallback logical key for pre-existing legacy rows.
        op.execute(
            """
            UPDATE exercise_field_answer_events
            SET exercise_key = COALESCE(
                exercise_key,
                'ex/' || COALESCE(block_id, 'legacy') || '/' || COALESCE(field_key, 'legacy')
            )
            WHERE exercise_key IS NULL
            """
        )

        # Enforces required columns expected by the SQLAlchemy model.
        op.alter_column("exercise_field_answer_events", "block_id", nullable=False)
        # Enforces required columns expected by the SQLAlchemy model.
        op.alter_column("exercise_field_answer_events", "exercise_key", nullable=False)

    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_efae_classroom_student "
        "ON exercise_field_answer_events (classroom_id, student_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_efae_classroom_block "
        "ON exercise_field_answer_events (classroom_id, block_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_efae_student_block "
        "ON exercise_field_answer_events (student_id, block_id)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_efae_student_block")
    op.execute("DROP INDEX IF EXISTS ix_efae_classroom_block")
    op.execute("DROP INDEX IF EXISTS ix_efae_classroom_student")

    # Holds the active DB connection used for schema inspection.
    connection = op.get_bind()
    # Provides table/column metadata for idempotent rollback steps.
    inspector = sa.inspect(connection)
    # Tracks whether the answer events table still exists at rollback time.
    table_exists = inspector.has_table("exercise_field_answer_events")
    if not table_exists:
        return

    # Stores current table columns keyed by column name.
    columns_by_name = {column["name"]: column for column in inspector.get_columns("exercise_field_answer_events")}
    # Drops broadcast provenance flag added by this migration.
    if "is_broadcast" in columns_by_name:
        op.drop_column("exercise_field_answer_events", "is_broadcast")
    # Drops teacher provenance flag added by this migration.
    if "written_by_teacher" in columns_by_name:
        op.drop_column("exercise_field_answer_events", "written_by_teacher")
    # Drops correctness flag added by this migration.
    if "is_correct" in columns_by_name:
        op.drop_column("exercise_field_answer_events", "is_correct")
    # Drops block id key added by this migration.
    if "block_id" in columns_by_name:
        op.drop_column("exercise_field_answer_events", "block_id")
    # Drops logical exercise key added by this migration.
    if "exercise_key" in columns_by_name:
        op.drop_column("exercise_field_answer_events", "exercise_key")
