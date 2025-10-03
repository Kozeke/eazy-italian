#!/usr/bin/env python3

import psycopg2
from psycopg2 import OperationalError
import os

def test_db_connection():
    # Get database URL from environment
    database_url = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/eazy_italian')
    
    print(f"🔍 Testing database connection with URL: {database_url}")
    
    try:
        # Connect to the database
        conn = psycopg2.connect(database_url)
        print("✅ Database connection successful!")
        
        # Test a simple query
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM tasks")
        count = cursor.fetchone()[0]
        print(f"✅ Found {count} tasks in database")
        
        cursor.close()
        conn.close()
        return True
        
    except OperationalError as e:
        print(f"❌ Database connection failed: {e}")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False

if __name__ == "__main__":
    success = test_db_connection()
    if success:
        print("\n🎉 Database connection test passed!")
    else:
        print("\n❌ Database connection test failed!")
