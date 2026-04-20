"""
Replace legacy exercise answer scope check with unit/segment-compatible rule.

Revision ID: 0017_fix_answer_scope_check
Revises: 0016_add_answer_scope_cols
Create Date: 2026-04-20
"""

from alembic import op
import sqlalchemy as sa


# Stores the unique revision identifier for this migration.
revision = "0017_fix_answer_scope_check"
# Stores the immediately previous revision in the migration chain.
down_revision = "0016_add_answer_scope_cols"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Holds the active DB connection used for runtime schema inspection.
    connection = op.get_bind()
    # Provides table metadata for idempotent check-constraint updates.
    inspector = sa.inspect(connection)
    # Tracks whether the answer events table exists before attempting DDL.
    table_exists = inspector.has_table("exercise_field_answer_events")
    if not table_exists:
        return

    # Drops the legacy scope check that conflicts with classroom + unit writes.
    op.execute(
        "ALTER TABLE exercise_field_answer_events "
        "DROP CONSTRAINT IF EXISTS ck_exercise_field_answer_scope"
    )
    # Adds a scope check aligned with current model semantics.
    # Prevents orphan segment scope by requiring unit_id whenever segment_id is present.
    op.execute(
        "ALTER TABLE exercise_field_answer_events "
        "ADD CONSTRAINT ck_exercise_field_answer_scope "
        "CHECK (segment_id IS NULL OR unit_id IS NOT NULL)"
    )


def downgrade() -> None:
    # Holds the active DB connection used for runtime schema inspection.
    connection = op.get_bind()
    # Provides table metadata for idempotent rollback steps.
    inspector = sa.inspect(connection)
    # Tracks whether the answer events table exists at rollback time.
    table_exists = inspector.has_table("exercise_field_answer_events")
    if not table_exists:
        return

    # Removes the unit/segment-aware scope check introduced in upgrade.
    op.execute(
        "ALTER TABLE exercise_field_answer_events "
        "DROP CONSTRAINT IF EXISTS ck_exercise_field_answer_scope"
    )
    # Restores the previous legacy scope check expression.
    op.execute(
        "ALTER TABLE exercise_field_answer_events "
        "ADD CONSTRAINT ck_exercise_field_answer_scope "
        "CHECK ("
        "((classroom_id IS NOT NULL AND unit_id IS NULL) "
        "OR (classroom_id IS NULL AND unit_id IS NOT NULL))"
        ")"
    )
