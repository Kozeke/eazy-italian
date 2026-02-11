#!/usr/bin/env python3
"""
Migration script to add questions column to tasks table
"""
import os
import sys

# Add the parent directory to the path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from app.core.database import engine

def migrate():
    """Add questions column to tasks table"""
    print("🔄 Starting migration to add questions column to tasks table...")
    
    try:
        with engine.connect() as conn:
            # Start a transaction
            trans = conn.begin()
            try:
                # Check if column exists
                check_query = text("""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name = 'tasks' 
                    AND column_name = 'questions'
                """)
                result = conn.execute(check_query)
                if result.fetchone() is not None:
                    print("✅ Column 'questions' already exists in tasks table")
                    trans.rollback()
                    return True
                
                # Column doesn't exist, add it
                print("Adding 'questions' column to tasks table...")
                migration_sql = text("""
                    ALTER TABLE tasks 
                    ADD COLUMN IF NOT EXISTS questions JSON DEFAULT '[]'
                """)
                conn.execute(migration_sql)
                trans.commit()
                
                print("✅ Migration completed successfully!")
                
                # Verify the column was added
                print("\nVerifying column...")
                verify_query = text("""
                    SELECT column_name, data_type 
                    FROM information_schema.columns 
                    WHERE table_name = 'tasks' 
                    AND column_name = 'questions'
                """)
                result = conn.execute(verify_query)
                rows = result.fetchall()
                
                if rows:
                    print("\nColumn added successfully:")
                    for row in rows:
                        print(f"  - {row[0]} ({row[1]})")
                else:
                    print("\nWARNING: Column not found - migration may have failed")
                    
            except Exception as e:
                trans.rollback()
                print(f"❌ Error during migration: {e}")
                import traceback
                traceback.print_exc()
                raise
                
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    return True

if __name__ == "__main__":
    success = migrate()
    if success:
        print("\n🎉 Migration completed successfully!")
        sys.exit(0)
    else:
        print("\n❌ Migration failed!")
        sys.exit(1)
