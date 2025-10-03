"""
Migration script to add new columns to questions table
"""
import sys
import os

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import engine
from sqlalchemy import text

def migrate_questions_table():
    """Add new columns to questions table"""
    print("Starting migration for questions table...")
    
    with engine.connect() as conn:
        # Add new columns one by one
        migrations = [
            "ALTER TABLE questions ADD COLUMN IF NOT EXISTS shuffle_options BOOLEAN DEFAULT FALSE;",
            "ALTER TABLE questions ADD COLUMN IF NOT EXISTS autograde BOOLEAN DEFAULT TRUE;",
            "ALTER TABLE questions ADD COLUMN IF NOT EXISTS manual_review_threshold DOUBLE PRECISION;",
            "ALTER TABLE questions ADD COLUMN IF NOT EXISTS expected_answer_config JSON DEFAULT '{}';",
            "ALTER TABLE questions ADD COLUMN IF NOT EXISTS gaps_config JSON DEFAULT '[]';",
            "ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_metadata JSON DEFAULT '{}';"
        ]
        
        for migration_sql in migrations:
            try:
                print(f"Executing: {migration_sql}")
                conn.execute(text(migration_sql))
                conn.commit()
                print("✓ Success")
            except Exception as e:
                print(f"✗ Error: {e}")
                # Continue with other migrations
        
        print("\nMigration completed!")
        print("New columns added to questions table:")
        print("  - shuffle_options (BOOLEAN)")
        print("  - autograde (BOOLEAN)")
        print("  - manual_review_threshold (FLOAT)")
        print("  - expected_answer_config (JSON)")
        print("  - gaps_config (JSON)")
        print("  - question_metadata (JSON)")

if __name__ == "__main__":
    migrate_questions_table()

