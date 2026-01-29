"""
Migration to add last_login column to users table
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
        
        print("Adding last_login column to users table...")
        
            try:
                query = "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE;"
                print(f"  Adding last_login...", end=" ")
                cursor.execute(query)
                print("OK")
            except Exception as e:
                print(f"ERROR: {e}")
        
        print("\nMigration completed!")
        print("\nVerifying column...")
        cursor.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            AND column_name = 'last_login';
        """)
        
        results = cursor.fetchall()
        if results:
            print("\nColumn added:")
            for row in results:
                print(f"  - {row[0]} ({row[1]})")
        else:
            print("\nWARNING: Column not found - migration may have failed")
        
        cursor.close()
        conn.close()
        
    except psycopg2.Error as e:
        print(f"\nDatabase error: {e}")
        print("\nTrying alternate password...")
        # Try with empty password
        DB_CONFIG['password'] = ''
        try:
            conn = psycopg2.connect(**DB_CONFIG)
            print("Connected with empty password")
            # Repeat migration with this connection
            conn.autocommit = True
            cursor = conn.cursor()
            try:
                query = "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE;"
                cursor.execute(query)
                print(f"  Added last_login")
            except Exception as e:
                print(f"  last_login: {e}")
            cursor.close()
            conn.close()
            print("\nMigration completed!")
        except Exception as e2:
            print(f"Also failed: {e2}")
            print("\nPlease run migrations manually using your database tool")
            print("\nSQL command to run:")
            print("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE;")

if __name__ == "__main__":
    migrate()
