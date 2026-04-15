"""
Alembic migration: add first-wave question types to QuestionType enum.

Revision: 001_question_types_first_wave
Created:  2024-06-01

Notes
-----
PostgreSQL requires ALTER TYPE to add enum labels.
The new values are appended so existing rows are unaffected.
SQLite (used in tests) uses string columns, so no migration is needed there.
"""

from alembic import op
import sqlalchemy as sa


revision = "001_question_types_first_wave"
down_revision = "0006_course_level_nullable"
branch_labels = None
depends_on = None

NEW_VALUES = [
    "true_false",
    "cloze_input",
    "cloze_drag",
    "matching_pairs",
    "ordering_words",
    "ordering_sentences",
]


def upgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name == "postgresql":
        for val in NEW_VALUES:
            op.execute(sa.text(f"ALTER TYPE questiontype ADD VALUE IF NOT EXISTS '{val}'"))


def downgrade() -> None:
    # PostgreSQL does not support removing enum values without recreating the type.
    # Safe approach: do nothing on downgrade.
    pass
