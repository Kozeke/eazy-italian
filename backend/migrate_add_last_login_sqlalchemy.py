"""
Migration to add last_login column to users table using SQLAlchemy
Uses the same database connection as the app
"""
import sys
import os

# Add the parent directory to the path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from app.core.database import engine

def migrate():
    print("Connecting to database using SQLAlchemy...")
    
    try:
        with engine.connect() as conn:
            # Start a transaction
            trans = conn.begin()
            try:
                print("Adding last_login column to users table...")
                
                # Add the column
                query = text("""
                    ALTER TABLE users 
                    ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE;
                """)
                conn.execute(query)
                trans.commit()
                
                print("Migration completed!")
                
                # Verify the column was added
                print("\nVerifying column...")
                verify_query = text("""
                    SELECT column_name, data_type 
                    FROM information_schema.columns 
                    WHERE table_name = 'users' 
                    AND column_name = 'last_login';
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
                print(f"Error during migration: {e}")
                raise
                
    except Exception as e:
        print(f"\nDatabase error: {e}")
        print("\nPlease make sure:")
        print("1. Your database server is running")
        print("2. Your DATABASE_URL in .env is correct")
        print("\nYou can also run this SQL manually:")
        print("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE;")

if __name__ == "__main__":
    migrate()
