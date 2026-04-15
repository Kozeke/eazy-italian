"""
migrate_content_to_segments.py
================================
One-time data migration script. Run AFTER the Alembic schema migration.

For each existing Unit:
  1. Creates a default Segment called "Main" (order_index=0).
  2. Assigns all content rows (videos, tasks, tests, presentations)
     that belong to that unit to the new segment.

Run with:
    python migrate_content_to_segments.py

Set DATABASE_URL in your environment before running, e.g.:
    export DATABASE_URL=postgresql://user:pass@localhost/dbname
"""

import os
import sys
from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL env var not set.")
    sys.exit(1)

engine = create_engine(DATABASE_URL)

CONTENT_TABLES = ["videos", "tasks", "tests", "presentations"]


def migrate():
    with engine.begin() as conn:
        # Fetch all units with at least one content item
        units = conn.execute(text("""
            SELECT DISTINCT u.id, u.created_by
            FROM units u
            WHERE u.id IN (
                SELECT unit_id FROM videos
                UNION SELECT unit_id FROM tasks
                UNION SELECT unit_id FROM tests
                UNION SELECT unit_id FROM presentations
            )
            ORDER BY u.id
        """)).fetchall()

        print(f"Found {len(units)} units to migrate.")

        for unit in units:
            unit_id = unit.id
            created_by = unit.created_by

            # Create a default "Main" segment for this unit
            result = conn.execute(text("""
                INSERT INTO segments (unit_id, title, order_index, status, is_visible_to_students, created_by)
                VALUES (:unit_id, 'Main', 0, 'draft', false, :created_by)
                RETURNING id
            """), {"unit_id": unit_id, "created_by": created_by})

            segment_id = result.fetchone().id

            # Assign all content rows to this segment
            for table in CONTENT_TABLES:
                updated = conn.execute(text(f"""
                    UPDATE {table}
                    SET segment_id = :segment_id
                    WHERE unit_id = :unit_id
                    AND segment_id IS NULL
                """), {"segment_id": segment_id, "unit_id": unit_id})
                print(f"  unit {unit_id} → segment {segment_id}: {updated.rowcount} {table} updated")

        print("Migration complete.")


if __name__ == "__main__":
    migrate()