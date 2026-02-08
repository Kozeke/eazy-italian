"""
Migration script to add notifications table
Run this script to add notifications functionality
"""
import sys
import os

# Add parent directory to path so we can import from app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text
from app.core.config import settings

def run_migration():
    """Add notifications table to database"""
    engine = create_engine(str(settings.DATABASE_URL))
    
    with engine.connect() as conn:
        # Create enum type for notification_type
        conn.execute(text("""
            DO $$ BEGIN
                CREATE TYPE notificationtype AS ENUM (
                    'course_enrollment',
                    'test_completed',
                    'test_passed',
                    'test_failed',
                    'task_submitted',
                    'video_completed'
                );
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        """))
        conn.commit()
        
        # Create notifications table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                type notificationtype NOT NULL,
                title VARCHAR NOT NULL,
                message TEXT,
                student_id INTEGER NOT NULL REFERENCES users(id),
                related_id INTEGER,
                related_type VARCHAR,
                is_read BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
            );
        """))
        conn.commit()
        
        # Create indexes for better query performance
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_notifications_student_id 
            ON notifications(student_id);
            
            CREATE INDEX IF NOT EXISTS idx_notifications_is_read 
            ON notifications(is_read);
            
            CREATE INDEX IF NOT EXISTS idx_notifications_created_at 
            ON notifications(created_at DESC);
        """))
        conn.commit()
        
        print("✅ Notifications table created successfully!")
        print("✅ Indexes created successfully!")

if __name__ == "__main__":
    try:
        run_migration()
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        sys.exit(1)
