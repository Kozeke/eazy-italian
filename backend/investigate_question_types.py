"""
Diagnostic script to investigate question types in the database
This script only READS data - it doesn't make any changes
Run this with: python investigate_question_types.py
"""

from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Get database URL from environment
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL not found in environment variables")
    exit(1)

print(f"Connecting to database...")
engine = create_engine(DATABASE_URL)

def investigate():
    """Investigate what type values exist in the questions table"""
    with engine.connect() as conn:
        print("\n" + "=" * 60)
        print("Question Type Investigation")
        print("=" * 60)
        
        # Get all unique type values
        print("\n1. Current question type distribution:")
        result = conn.execute(text("""
            SELECT type, COUNT(*) as count
            FROM questions
            GROUP BY type
            ORDER BY count DESC;
        """))
        
        for row in result:
            type_val = row[0]
            count = row[1]
            print(f"   {type_val:20s} : {count:3d} questions")
        
        # Check for NULL values
        print("\n2. Checking for NULL type values...")
        null_count = conn.execute(text("""
            SELECT COUNT(*) FROM questions WHERE type IS NULL;
        """)).scalar()
        
        if null_count > 0:
            print(f"   ⚠️  WARNING: {null_count} questions have NULL type")
        else:
            print(f"   ✅ No NULL types found")
        
        # Get all questions with their details
        print("\n3. All questions (with type info):")
        all_questions = conn.execute(text("""
            SELECT id, type, prompt_rich, created_at
            FROM questions
            ORDER BY id;
        """))
        
        print(f"\n   {'ID':>4s} | {'Type':20s} | {'Prompt (first 40 chars)':40s}")
        print(f"   {'-'*4:4s}-+-{'-'*20:20s}-+-{'-'*40:40s}")
        
        for row in all_questions:
            q_id = row[0]
            q_type = row[1] if row[1] else "NULL"
            prompt = (row[2] or "")[:40].replace('\n', ' ')
            print(f"   {q_id:4d} | {q_type:20s} | {prompt:40s}")
        
        # Check what enum values exist in PostgreSQL
        print("\n4. PostgreSQL enum values for 'questiontype':")
        enum_values = conn.execute(text("""
            SELECT enumlabel 
            FROM pg_enum 
            WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'questiontype')
            ORDER BY enumlabel;
        """))
        
        values = [row[0] for row in enum_values]
        print(f"   Total: {len(values)} values")
        print(f"   Values: {', '.join(values)}")
        
        # Find questions with types not matching enum
        print("\n5. Questions with non-standard type values:")
        
        # Build a query to find mismatches
        placeholders = ', '.join([f"'{v}'" for v in values])
        mismatch_query = text(f"""
            SELECT id, type, prompt_rich
            FROM questions
            WHERE type::text NOT IN ({placeholders})
            OR type IS NULL
            LIMIT 20;
        """)
        
        mismatches = conn.execute(mismatch_query)
        mismatch_rows = list(mismatches)
        
        if mismatch_rows:
            print(f"   ⚠️  Found {len(mismatch_rows)} questions with non-standard types:")
            for row in mismatch_rows:
                q_id = row[0]
                q_type = row[1] if row[1] else "NULL"
                prompt = (row[2] or "")[:50].replace('\n', ' ')
                print(f"      ID {q_id}: type='{q_type}', prompt='{prompt}...'")
        else:
            print(f"   ✅ All questions have valid enum types")
        
        print("\n" + "=" * 60)
        print("Investigation complete!")
        print("=" * 60)

if __name__ == "__main__":
    investigate()