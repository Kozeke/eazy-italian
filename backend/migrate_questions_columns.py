#!/usr/bin/env python3
"""
Migration script to add all missing columns to questions table
This script can be run on Render or locally
Uses DATABASE_URL from environment variables
"""
import os
import sys

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.core.database import engine

def migrate_questions_columns():
    """Add all missing columns to questions table"""
    print("🔄 Starting migration for questions table columns...")
    
    # List of columns to add with their definitions
    columns_to_add = [
        ("shuffle_options", "BOOLEAN DEFAULT FALSE", "Shuffle answer options for each student"),
        ("autograde", "BOOLEAN DEFAULT TRUE", "Enable auto-grading"),
        ("manual_review_threshold", "DOUBLE PRECISION", "Review if score below threshold"),
        ("expected_answer_config", "JSON DEFAULT '{}'", "Configuration for open answers"),
        ("gaps_config", "JSON DEFAULT '[]'", "Configuration for cloze questions"),
        ("question_metadata", "JSON DEFAULT '{}'", "Difficulty, tags, etc."),
    ]
    
    try:
        with engine.connect() as conn:
            added_count = 0
            skipped_count = 0
            
            for column_name, column_def, description in columns_to_add:
                # Check if column already exists
                check_query = text("""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name = 'questions' 
                    AND column_name = :column_name
                """)
                result = conn.execute(check_query, {"column_name": column_name})
                exists = result.fetchone() is not None
                
                if exists:
                    print(f"⏭️  Column '{column_name}' already exists. Skipping.")
                    skipped_count += 1
                    continue
                
                # Add the column
                migration_sql = text(f"""
                    ALTER TABLE questions 
                    ADD COLUMN {column_name} {column_def}
                """)
                
                print(f"➕ Adding column '{column_name}' ({description})...")
                try:
                    conn.execute(migration_sql)
                    conn.commit()
                    print(f"   ✅ Successfully added '{column_name}'")
                    added_count += 1
                except Exception as e:
                    print(f"   ❌ Failed to add '{column_name}': {e}")
                    # Continue with other columns
                    continue
            
            print(f"\n📊 Migration Summary:")
            print(f"   ✅ Added: {added_count} columns")
            print(f"   ⏭️  Skipped (already exist): {skipped_count} columns")
            
            # Verify all columns exist
            print(f"\n🔍 Verifying columns...")
            verify_query = text("""
                SELECT column_name, data_type, column_default
                FROM information_schema.columns 
                WHERE table_name = 'questions' 
                AND column_name IN ('shuffle_options', 'autograde', 'manual_review_threshold', 
                                   'expected_answer_config', 'gaps_config', 'question_metadata')
                ORDER BY column_name
            """)
            result = conn.execute(verify_query)
            rows = result.fetchall()
            
            if rows:
                print("✅ Verified columns:")
                for row in rows:
                    print(f"   - {row[0]} ({row[1]}, default: {row[2]})")
            else:
                print("⚠️  Warning: No columns found after migration")
                return False
            
            if added_count > 0:
                print(f"\n✅ Migration completed successfully! Added {added_count} new column(s).")
            else:
                print(f"\n✅ All columns already exist. No migration needed.")
            
            return True
                
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = migrate_questions_columns()
    sys.exit(0 if success else 1)
