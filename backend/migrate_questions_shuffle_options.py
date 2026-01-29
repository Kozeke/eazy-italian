#!/usr/bin/env python3
"""
Migration script to add shuffle_options column to questions table
This script can be run on Render or locally
"""
import os
import sys

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.core.database import engine

def migrate_questions_shuffle_options():
    """Add shuffle_options column to questions table if it doesn't exist"""
    print("🔄 Starting migration for questions.shuffle_options column...")
    
    try:
        with engine.connect() as conn:
            # Check if column already exists
            check_query = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'questions' 
                AND column_name = 'shuffle_options'
            """)
            result = conn.execute(check_query)
            exists = result.fetchone() is not None
            
            if exists:
                print("✅ Column 'shuffle_options' already exists. Skipping migration.")
                return True
            
            # Add the column
            migration_sql = text("""
                ALTER TABLE questions 
                ADD COLUMN shuffle_options BOOLEAN DEFAULT FALSE
            """)
            
            print("Executing: ALTER TABLE questions ADD COLUMN shuffle_options BOOLEAN DEFAULT FALSE")
            conn.execute(migration_sql)
            conn.commit()
            
            print("✅ Migration completed successfully!")
            
            # Verify the migration
            verify_query = text("""
                SELECT column_name, data_type, column_default, is_nullable
                FROM information_schema.columns 
                WHERE table_name = 'questions' 
                AND column_name = 'shuffle_options'
            """)
            result = conn.execute(verify_query)
            row = result.fetchone()
            
            if row:
                print(f"✅ Verified: {row[0]} ({row[1]}, default: {row[2]}, nullable: {row[3]})")
            else:
                print("⚠️  Warning: Column not found after migration")
                return False
                
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    return True

if __name__ == "__main__":
    success = migrate_questions_shuffle_options()
    sys.exit(0 if success else 1)
