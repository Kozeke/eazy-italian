#!/usr/bin/env python3
"""
Script to drop all tables from the Render database
"""

import os
import sys

# Add the backend directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

# Set the database URL environment variable
os.environ['DATABASE_URL'] = 'postgresql://eazy_italian_user:sB7Fubbn9THXz4QqfidirXXZIi42PIkC@dpg-d2m7sobe5dus739hach0-a.oregon-postgres.render.com/eazy_italian'

from sqlalchemy import create_engine, text

# Set the database URL directly
DATABASE_URL = 'postgresql://eazy_italian_user:sB7Fubbn9THXz4QqfidirXXZIi42PIkC@dpg-d2m7sobe5dus739hach0-a.oregon-postgres.render.com/eazy_italian'

def drop_all_tables():
    engine = create_engine(DATABASE_URL)
    
    with engine.connect() as connection:
        # Get all table names
        result = connection.execute(text("""
            SELECT tablename FROM pg_tables 
            WHERE schemaname = 'public' 
            AND tablename NOT LIKE 'pg_%' 
            AND tablename NOT LIKE 'sql_%'
        """))
        
        tables = [row[0] for row in result]
        print(f"Found tables: {tables}")
        
        # Drop all tables with CASCADE to handle foreign keys
        for table in tables:
            print(f"Dropping table: {table}")
            connection.execute(text(f"DROP TABLE IF EXISTS {table} CASCADE"))
        
        connection.commit()
        print("All tables dropped successfully!")

if __name__ == "__main__":
    print("Dropping all tables from database...")
    drop_all_tables()
    print("Database cleared!")
