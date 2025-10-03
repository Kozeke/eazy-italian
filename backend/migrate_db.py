"""
Quick migration to add new question columns
Uses the same DB connection as the running app
"""
import psycopg2
from psycopg2 import sql

# Your local database credentials (matching what's in .env or docker-compose)
DB_CONFIG = {
    'host': 'localhost',
    'port': 5432,
    'database': 'eazy_italian',
    'user': 'postgres',
    'password': 'postgres'  # Default from docker-compose
}

def migrate():
    print("Connecting to database...")
    
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        conn.autocommit = True
        cursor = conn.cursor()
        
        print("Adding new columns to questions table...")
        
        migrations = [
            ("shuffle_options", "BOOLEAN DEFAULT FALSE"),
            ("autograde", "BOOLEAN DEFAULT TRUE"),
            ("manual_review_threshold", "DOUBLE PRECISION"),
            ("expected_answer_config", "JSON DEFAULT '{}'"),
            ("gaps_config", "JSON DEFAULT '[]'"),
            ("question_metadata", "JSON DEFAULT '{}'"),
        ]
        
        for column_name, column_def in migrations:
            try:
                query = f"ALTER TABLE questions ADD COLUMN IF NOT EXISTS {column_name} {column_def};"
                print(f"  Adding {column_name}...", end=" ")
                cursor.execute(query)
                print("✓")
            except Exception as e:
                print(f"✗ {e}")
        
        print("\n✅ Migration completed!")
        print("\nVerifying columns...")
        cursor.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'questions' 
            AND column_name IN ('shuffle_options', 'autograde', 'manual_review_threshold', 
                               'expected_answer_config', 'gaps_config', 'question_metadata')
            ORDER BY column_name;
        """)
        
        results = cursor.fetchall()
        if results:
            print("\nNew columns added:")
            for row in results:
                print(f"  - {row[0]} ({row[1]})")
        else:
            print("\n⚠️  No columns found - migration may have failed")
        
        cursor.close()
        conn.close()
        
    except psycopg2.Error as e:
        print(f"\n❌ Database error: {e}")
        print("\nTrying alternate password...")
        # Try with empty password
        DB_CONFIG['password'] = ''
        try:
            conn = psycopg2.connect(**DB_CONFIG)
            print("✓ Connected with empty password")
            # Repeat migration with this connection
            conn.autocommit = True
            cursor = conn.cursor()
            for column_name, column_def in migrations:
                try:
                    query = f"ALTER TABLE questions ADD COLUMN IF NOT EXISTS {column_name} {column_def};"
                    cursor.execute(query)
                    print(f"  Added {column_name} ✓")
                except Exception as e:
                    print(f"  {column_name}: {e}")
            cursor.close()
            conn.close()
            print("\n✅ Migration completed!")
        except Exception as e2:
            print(f"❌ Also failed: {e2}")
            print("\n💡 Please run migrations manually using your database tool")

if __name__ == "__main__":
    migrate()

