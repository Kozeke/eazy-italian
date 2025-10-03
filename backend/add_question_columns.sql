-- Migration: Add new columns to questions table for test constructor
-- Run this with: docker-compose exec postgres psql -U postgres -d eazy_italian -f /path/to/this/file.sql

ALTER TABLE questions ADD COLUMN IF NOT EXISTS shuffle_options BOOLEAN DEFAULT FALSE;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS autograde BOOLEAN DEFAULT TRUE;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS manual_review_threshold DOUBLE PRECISION;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS expected_answer_config JSON DEFAULT '{}';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS gaps_config JSON DEFAULT '[]';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_metadata JSON DEFAULT '{}';

-- Verify columns were added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'questions' 
ORDER BY ordinal_position;

