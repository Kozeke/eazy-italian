#!/usr/bin/env python3
"""
Migration script to update the task_submissions table with missing columns
"""
import os
import sys

# Set the database URL
os.environ['DATABASE_URL'] = "postgresql://eazy_italian_user:sB7Fubbn9THXz4QqfidirXXZIi42PIkC@dpg-d2m7sobe5dus739hach0-a.oregon-postgres.render.com/eazy_italian"

from sqlalchemy import text
from app.core.database import engine

def migrate_task_submissions_table():
    """Add missing columns to the task_submissions table"""
    print("🔄 Starting task_submissions table migration...")
    
    try:
        with engine.connect() as conn:
            # Add missing columns
            migrations = [
                # Add attempt_number column
                "ALTER TABLE task_submissions ADD COLUMN IF NOT EXISTS attempt_number INTEGER DEFAULT 1",
                
                # Add time_spent_minutes column
                "ALTER TABLE task_submissions ADD COLUMN IF NOT EXISTS time_spent_minutes INTEGER DEFAULT 0",
            ]
            
            for migration in migrations:
                print(f"Executing: {migration}")
                conn.execute(text(migration))
                conn.commit()
            
            print("✅ Migration completed successfully!")
            
            # Verify the migration
            result = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'task_submissions' ORDER BY column_name"))
            columns = [row[0] for row in result]
            print(f"✅ Task_submissions table now has {len(columns)} columns:")
            for column in columns:
                print(f"   - {column}")
                
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    return True

if __name__ == "__main__":
    success = migrate_task_submissions_table()
    if success:
        print("\n🎉 Task_submissions table migration completed successfully!")
    else:
        print("\n❌ Task_submissions table migration failed!")
