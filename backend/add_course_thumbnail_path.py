#!/usr/bin/env python3
"""
Migration script to add thumbnail_path column to courses table
Run this script to add the thumbnail_path field to existing courses table
"""
import os
import sys

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from app.core.database import SessionLocal, engine

def add_thumbnail_path_column():
    """Add thumbnail_path column to courses table if it doesn't exist"""
    db = SessionLocal()
    
    try:
        # Check if column already exists
        check_column = text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'courses' 
            AND column_name = 'thumbnail_path'
        """)
        result = db.execute(check_column)
        exists = result.fetchone() is not None
        
        if exists:
            print("[INFO] Column thumbnail_path already exists in courses table")
            return
        
        # Add the column
        add_column = text("""
            ALTER TABLE courses 
            ADD COLUMN thumbnail_path VARCHAR(500)
        """)
        db.execute(add_column)
        db.commit()
        
        print("[OK] Successfully added thumbnail_path column to courses table")
        
    except Exception as e:
        print(f"[ERROR] Error adding column: {str(e)}")
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    print("Adding thumbnail_path column to courses table...")
    print("=" * 50)
    add_thumbnail_path_column()
    print("=" * 50)
    print("Done!")
