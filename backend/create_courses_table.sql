-- Migration: Create courses table and add course_id to units table
-- This SQL script can be run directly on PostgreSQL database
-- Run with: psql -U postgres -d eazy_italian -f create_courses_table.sql

-- Create ENUM types for course level and status
DO $$ BEGIN
    CREATE TYPE courselevel AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'mixed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE coursestatus AS ENUM ('draft', 'scheduled', 'published', 'archived');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create courses table
CREATE TABLE IF NOT EXISTS courses (
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
);

-- Add course_id column to units table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'units' AND column_name = 'course_id'
    ) THEN
        ALTER TABLE units 
        ADD COLUMN course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Create index on course_id for better query performance
CREATE INDEX IF NOT EXISTS idx_units_course_id ON units(course_id);

-- Create index on courses.created_by for faster queries
CREATE INDEX IF NOT EXISTS idx_courses_created_by ON courses(created_by);

-- Create index on courses.status for filtering
CREATE INDEX IF NOT EXISTS idx_courses_status ON courses(status);

-- Create index on courses.level for filtering
CREATE INDEX IF NOT EXISTS idx_courses_level ON courses(level);

-- Verify the migration
SELECT 
    'Courses table created successfully!' as message,
    COUNT(*) as column_count
FROM information_schema.columns 
WHERE table_name = 'courses';

SELECT 
    'course_id column added to units table!' as message,
    column_name,
    data_type
FROM information_schema.columns 
WHERE table_name = 'units' AND column_name = 'course_id';
