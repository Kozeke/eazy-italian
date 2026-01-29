#!/usr/bin/env python3
"""
Migration script to create courses table and add course_id to units table
This script can be run on Render or locally
"""
import os
import sys

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.core.database import engine

def migrate_courses_table():
    """Create courses table and add course_id to units table"""
    print("🔄 Starting migration for courses table...")
    
    try:
        with engine.connect() as conn:
            # Check if courses table already exists
            check_table_query = text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_name = 'courses'
            """)
            result = conn.execute(check_table_query)
            table_exists = result.fetchone() is not None
            
            if not table_exists:
                print("Creating courses table...")
                
                # Create ENUM types for course level and status if they don't exist
                try:
                    # Create course_level enum
                    create_level_enum = text("""
                        DO $$ BEGIN
                            CREATE TYPE courselevel AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'mixed');
                        EXCEPTION
                            WHEN duplicate_object THEN null;
                        END $$;
                    """)
                    conn.execute(create_level_enum)
                    conn.commit()
                    print("✅ Course level enum created")
                except Exception as e:
                    print(f"⚠️  Level enum note: {e}")
                
                try:
                    # Create course_status enum
                    create_status_enum = text("""
                        DO $$ BEGIN
                            CREATE TYPE coursestatus AS ENUM ('draft', 'scheduled', 'published', 'archived');
                        EXCEPTION
                            WHEN duplicate_object THEN null;
                        END $$;
                    """)
                    conn.execute(create_status_enum)
                    conn.commit()
                    print("✅ Course status enum created")
                except Exception as e:
                    print(f"⚠️  Status enum note: {e}")
                
                # Create courses table
                create_table_sql = text("""
                    CREATE TABLE courses (
                        id SERIAL PRIMARY KEY,
                        title VARCHAR(255) NOT NULL,
                        description TEXT,
                        level courselevel NOT NULL,
                        status coursestatus NOT NULL DEFAULT 'draft',
                        publish_at TIMESTAMP WITH TIME ZONE,
                        order_index INTEGER NOT NULL DEFAULT 0,
                        thumbnail_url VARCHAR(500),
                        duration_hours INTEGER,
                        tags JSONB DEFAULT '[]'::jsonb,
                        slug VARCHAR(255) UNIQUE,
                        meta_title VARCHAR(255),
                        meta_description TEXT,
                        is_visible_to_students BOOLEAN NOT NULL DEFAULT FALSE,
                        settings JSONB DEFAULT '{}'::jsonb,
                        created_by INTEGER NOT NULL REFERENCES users(id),
                        updated_by INTEGER REFERENCES users(id),
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP WITH TIME ZONE
                    )
                """)
                conn.execute(create_table_sql)
                conn.commit()
                print("✅ Courses table created successfully!")
            else:
                print("⏭️  Courses table already exists. Skipping creation.")
            
            # Check if course_id column exists in units table
            check_column_query = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'units' 
                AND column_name = 'course_id'
            """)
            result = conn.execute(check_column_query)
            column_exists = result.fetchone() is not None
            
            if not column_exists:
                print("Adding course_id column to units table...")
                # Add course_id foreign key to units table
                add_column_sql = text("""
                    ALTER TABLE units 
                    ADD COLUMN course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL
                """)
                conn.execute(add_column_sql)
                conn.commit()
                print("✅ course_id column added to units table!")
            else:
                print("⏭️  course_id column already exists in units table. Skipping.")
            
            # Create index on course_id for better query performance
            try:
                create_index_sql = text("""
                    CREATE INDEX IF NOT EXISTS idx_units_course_id ON units(course_id)
                """)
                conn.execute(create_index_sql)
                conn.commit()
                print("✅ Index on course_id created!")
            except Exception as e:
                print(f"⚠️  Index creation note: {e}")
            
            # Verify the migration
            print(f"\n🔍 Verifying migration...")
            verify_table_query = text("""
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'courses'
                ORDER BY ordinal_position
            """)
            result = conn.execute(verify_table_query)
            columns = result.fetchall()
            
            if columns:
                print("✅ Courses table columns:")
                for col in columns:
                    print(f"   - {col[0]} ({col[1]})")
            else:
                print("⚠️  Warning: Courses table not found after migration")
                return False
            
            # Verify course_id in units
            verify_column_query = text("""
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'units' 
                AND column_name = 'course_id'
            """)
            result = conn.execute(verify_column_query)
            col = result.fetchone()
            
            if col:
                print(f"✅ Units.course_id column: {col[0]} ({col[1]})")
            else:
                print("⚠️  Warning: course_id column not found in units table")
                return False
            
            print(f"\n✅ Migration completed successfully!")
            return True
                
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = migrate_courses_table()
    sys.exit(0 if success else 1)
