"""
Database migration script to update QuestionType enum values from UPPERCASE to lowercase
IMPROVED VERSION - Investigates NULL rows before failing
Run this with: python fix_question_type_enum_v2.py
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

# Mapping of old (UPPERCASE) to new (lowercase) values
ENUM_VALUE_MAPPING = {
    'MULTIPLE_CHOICE': 'multiple_choice',
    'SINGLE_CHOICE': 'single_choice',
    'OPEN_ANSWER': 'open_answer',
    'CLOZE': 'cloze',
    'GAP_FILL': 'gap_fill',
    'MATCHING': 'matching',
    'ORDERING': 'ordering',
    'SHORT_ANSWER': 'short_answer',
    'LISTENING': 'listening',
    'READING': 'reading',
    'VISUAL': 'visual'
}

def investigate_questions():
    """Investigate what type values exist in the questions table"""
    with engine.connect() as conn:
        print("\n=== Investigating Questions Table ===\n")
        
        # Get all unique type values
        result = conn.execute(text("""
            SELECT type, COUNT(*) as count
            FROM questions
            GROUP BY type
            ORDER BY count DESC;
        """))
        
        print("Current question type distribution:")
        all_types = []
        for row in result:
            type_val = row[0]
            count = row[1]
            all_types.append((type_val, count))
            print(f"  - {type_val}: {count} questions")
        
        return all_types

def migrate_enum_values():
    """Migrate QuestionType enum from UPPERCASE to lowercase values"""
    
    with engine.connect() as conn:
        try:
            print("\n=== QuestionType Enum Migration ===\n")
            
            # Step 1: Check current enum values
            print("1. Checking current enum values...")
            enum_check = text("""
                SELECT enumlabel 
                FROM pg_enum 
                WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'questiontype')
                ORDER BY enumlabel;
            """)
            current_values = [row[0] for row in conn.execute(enum_check)]
            print(f"   Current enum values: {current_values}")
            
            # Step 2: Add new lowercase values if they don't exist
            print("\n2. Adding new lowercase enum values...")
            for old_value, new_value in ENUM_VALUE_MAPPING.items():
                if new_value not in current_values:
                    try:
                        add_enum_sql = text(f"""
                            ALTER TYPE questiontype ADD VALUE '{new_value}';
                        """)
                        conn.execute(add_enum_sql)
                        conn.commit()
                        print(f"   ✅ Added '{new_value}'")
                    except Exception as e:
                        print(f"   ⚠️  Could not add '{new_value}': {e}")
                else:
                    print(f"   ℹ️  '{new_value}' already exists")
            
            # Step 3: Update existing questions table to use lowercase values
            print("\n3. Updating questions table...")
            
            # First, add a temporary column
            print("   Adding temporary column...")
            try:
                conn.execute(text("""
                    ALTER TABLE questions 
                    ADD COLUMN type_temp VARCHAR(50);
                """))
                conn.commit()
                print("   ✅ Temporary column added")
            except Exception as e:
                if "already exists" in str(e):
                    print("   ℹ️  Temporary column already exists")
                    # Clear it first
                    conn.execute(text("UPDATE questions SET type_temp = NULL;"))
                    conn.commit()
                else:
                    raise
            
            # Get all question types and update them
            print("   Analyzing current question types...")
            type_check = conn.execute(text("""
                SELECT DISTINCT type 
                FROM questions 
                WHERE type IS NOT NULL
                ORDER BY type;
            """))
            existing_types = [row[0] for row in type_check]
            print(f"   Found types: {existing_types}")
            
            # Update the temp column with lowercase values
            print("   Copying data to temporary column with lowercase values...")
            updated_count = 0
            for db_type in existing_types:
                # Try to find mapping
                new_value = None
                
                # First check if it's already lowercase
                if db_type in ENUM_VALUE_MAPPING.values():
                    new_value = db_type
                    print(f"   ℹ️  Type '{db_type}' is already lowercase, keeping as-is")
                # Check if it's in the uppercase mapping
                elif db_type in ENUM_VALUE_MAPPING:
                    new_value = ENUM_VALUE_MAPPING[db_type]
                    print(f"   🔄 Mapping '{db_type}' → '{new_value}'")
                else:
                    # Try case-insensitive match
                    for old, new in ENUM_VALUE_MAPPING.items():
                        if db_type.upper() == old or db_type.lower() == new:
                            new_value = new
                            print(f"   🔄 Mapping '{db_type}' → '{new_value}' (case-insensitive match)")
                            break
                
                if new_value:
                    update_sql = text(f"""
                        UPDATE questions 
                        SET type_temp = '{new_value}'
                        WHERE type::text = '{db_type}';
                    """)
                    result = conn.execute(update_sql)
                    rows = result.rowcount
                    updated_count += rows
                    if rows > 0:
                        print(f"   ✅ Updated {rows} rows: {db_type} → {new_value}")
                else:
                    print(f"   ❌ ERROR: Unknown type '{db_type}' - cannot map to lowercase")
            
            conn.commit()
            print(f"   Total rows updated: {updated_count}")
            
            # Check if any rows still need updating
            check_null = conn.execute(text("SELECT COUNT(*) FROM questions WHERE type_temp IS NULL;")).scalar()
            if check_null > 0:
                print(f"\n   ⚠️  WARNING: {check_null} rows still have NULL type_temp")
                print("   Investigating NULL rows...")
                null_rows = conn.execute(text("""
                    SELECT id, type, prompt_rich 
                    FROM questions 
                    WHERE type_temp IS NULL
                    LIMIT 10;
                """))
                for row in null_rows:
                    print(f"      - ID {row[0]}: type='{row[1]}', prompt='{row[2][:50]}...'")
                
                response = input("\n   Do you want to DELETE these rows? (yes/no): ")
                if response.lower() == 'yes':
                    conn.execute(text("DELETE FROM questions WHERE type_temp IS NULL;"))
                    conn.commit()
                    print(f"   ✅ Deleted {check_null} rows with NULL type_temp")
                else:
                    print("\n   ❌ Cannot proceed with NULL rows. Aborting.")
                    print("   Please manually fix or delete these rows first.")
                    return
            
            # Drop the old column and rename temp
            print("\n4. Replacing old column with new one...")
            conn.execute(text("ALTER TABLE questions DROP COLUMN type;"))
            conn.commit()
            print("   ✅ Dropped old 'type' column")
            
            conn.execute(text("ALTER TABLE questions RENAME COLUMN type_temp TO type;"))
            conn.commit()
            print("   ✅ Renamed 'type_temp' to 'type'")
            
            # Alter the new column to use enum type
            print("   Converting to enum type...")
            conn.execute(text("""
                ALTER TABLE questions 
                ALTER COLUMN type TYPE questiontype 
                USING type::questiontype;
            """))
            conn.commit()
            print("   ✅ Column converted to questiontype enum")
            
            # Set NOT NULL constraint
            conn.execute(text("""
                ALTER TABLE questions 
                ALTER COLUMN type SET NOT NULL;
            """))
            conn.commit()
            print("   ✅ NOT NULL constraint added")
            
            print("\n=== Migration completed successfully! ===\n")
            
            # Verify the migration
            print("5. Verifying migration...")
            verify_sql = text("""
                SELECT type, COUNT(*) as count
                FROM questions
                GROUP BY type
                ORDER BY type;
            """)
            results = conn.execute(verify_sql)
            print("\n   Current distribution of question types:")
            for row in results:
                print(f"   - {row[0]}: {row[1]} questions")
            
            print("\n✅ All done! Your database now uses lowercase enum values.")
            
        except Exception as e:
            print(f"\n❌ ERROR: Migration failed: {e}")
            print("\nRolling back changes...")
            conn.rollback()
            raise

if __name__ == "__main__":
    print("=" * 60)
    print("QuestionType Enum Migration Script v2")
    print("=" * 60)
    
    # First investigate what we have
    investigate_questions()
    
    print("\n" + "=" * 60)
    print("This script will update your database enum values from")
    print("UPPERCASE (e.g., 'VISUAL') to lowercase (e.g., 'visual')")
    print("=" * 60)
    print("\nPress Ctrl+C to cancel, or Enter to continue...")
    input()
    
    migrate_enum_values()