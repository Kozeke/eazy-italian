"""
Fix questions table by adding missing columns
This connects to the same database as the running app
"""
import subprocess
import sys

# SQL commands to add missing columns
sql_commands = """
-- Add missing columns to questions table
ALTER TABLE questions ADD COLUMN IF NOT EXISTS shuffle_options BOOLEAN DEFAULT FALSE;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS autograde BOOLEAN DEFAULT TRUE;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS manual_review_threshold DOUBLE PRECISION;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS expected_answer_config JSON DEFAULT '{}';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS gaps_config JSON DEFAULT '[]';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_metadata JSON DEFAULT '{}';

-- Verify the columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'questions' 
AND column_name IN ('shuffle_options', 'autograde', 'manual_review_threshold', 
                   'expected_answer_config', 'gaps_config', 'question_metadata')
ORDER BY column_name;
"""

print("Running migration on Docker PostgreSQL...")
print("=" * 60)

try:
    result = subprocess.run(
        ['docker-compose', 'exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', 'eazy_italian'],
        input=sql_commands,
        capture_output=True,
        text=True
    )
    
    print("STDOUT:")
    print(result.stdout)
    
    if result.stderr:
        print("\nSTDERR:")
        print(result.stderr)
    
    if result.returncode == 0:
        print("\n✅ Migration completed successfully!")
    else:
        print(f"\n❌ Migration failed with code {result.returncode}")
        sys.exit(1)
        
except Exception as e:
    print(f"❌ Error running migration: {e}")
    sys.exit(1)

