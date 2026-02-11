"""
Script to drop tests and questions tables
This will also drop dependent tables: test_questions and test_attempts
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

def drop_tables():
    """Drop tests and questions tables and their dependencies"""
    with engine.connect() as conn:
        # Start a transaction
        trans = conn.begin()
        try:
            print("\n" + "=" * 60)
            print("Dropping Tests and Questions Tables")
            print("=" * 60)
            
            # Drop dependent tables first
            print("\n1. Dropping test_attempts table...")
            conn.execute(text("DROP TABLE IF EXISTS test_attempts CASCADE;"))
            print("   ✅ test_attempts dropped")
            
            print("\n2. Dropping test_questions table...")
            conn.execute(text("DROP TABLE IF EXISTS test_questions CASCADE;"))
            print("   ✅ test_questions dropped")
            
            # Drop main tables
            print("\n3. Dropping tests table...")
            conn.execute(text("DROP TABLE IF EXISTS tests CASCADE;"))
            print("   ✅ tests dropped")
            
            print("\n4. Dropping questions table...")
            conn.execute(text("DROP TABLE IF EXISTS questions CASCADE;"))
            print("   ✅ questions dropped")
            
            # Commit the transaction
            trans.commit()
            
            print("\n" + "=" * 60)
            print("All tables dropped successfully!")
            print("=" * 60)
            
        except Exception as e:
            trans.rollback()
            print(f"\n❌ Error occurred: {e}")
            print("Transaction rolled back.")
            raise

if __name__ == "__main__":
    drop_tables()
