#!/usr/bin/env python3
"""
Migration script to update the tasks table with missing columns
"""
import os
import sys

# Set the database URL
os.environ['DATABASE_URL'] = "postgresql://eazy_italian_user:sB7Fubbn9THXz4QqfidirXXZIi42PIkC@dpg-d2m7sobe5dus739hach0-a.oregon-postgres.render.com/eazy_italian"

from sqlalchemy import text
from app.core.database import engine

def migrate_tasks_table():
    """Add missing columns to the tasks table"""
    print("🔄 Starting tasks table migration...")
    
    try:
        with engine.connect() as conn:
            # Add missing columns
            migrations = [
                # Add instructions column
                "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS instructions TEXT",
                
                # Add auto_task_type column
                "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS auto_task_type VARCHAR(50)",
                
                # Add allow_late_submissions column
                "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS allow_late_submissions BOOLEAN DEFAULT FALSE",
                
                # Add late_penalty_percent column
                "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS late_penalty_percent INTEGER DEFAULT 0",
                
                # Add max_attempts column
                "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS max_attempts INTEGER DEFAULT 1",
                
                # Add assigned_cohorts column
                "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_cohorts JSON DEFAULT '[]'",
                
                # Add assigned_students column
                "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_students JSON DEFAULT '[]'",
                
                # Add assign_to_all column
                "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assign_to_all BOOLEAN DEFAULT FALSE",
                
                # Add notification columns
                "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS send_assignment_email BOOLEAN DEFAULT FALSE",
                "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reminder_days_before INTEGER DEFAULT 1",
                "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS send_results_email BOOLEAN DEFAULT FALSE",
                "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS send_teacher_copy BOOLEAN DEFAULT FALSE",
                
                # Add notification preference columns (for backward compatibility)
                "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notify_on_assignment BOOLEAN DEFAULT FALSE",
                "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notify_reminder_days INTEGER DEFAULT 1",
                "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notify_on_submit BOOLEAN DEFAULT FALSE",
                "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notify_on_grade BOOLEAN DEFAULT FALSE",
            ]
            
            for migration in migrations:
                print(f"Executing: {migration}")
                conn.execute(text(migration))
                conn.commit()
            
            print("✅ Migration completed successfully!")
            
            # Verify the migration
            result = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'tasks' ORDER BY column_name"))
            columns = [row[0] for row in result]
            print(f"✅ Tasks table now has {len(columns)} columns:")
            for column in columns:
                print(f"   - {column}")
                
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    return True

if __name__ == "__main__":
    success = migrate_tasks_table()
    if success:
        print("\n🎉 Tasks table migration completed successfully!")
    else:
        print("\n❌ Tasks table migration failed!")
