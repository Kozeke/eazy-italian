#!/usr/bin/env python3
"""
Script to recreate the database with tables and demo data
"""

import os
import sys

# Add the backend directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

# Set the database URL environment variable
os.environ['DATABASE_URL'] = 'postgresql://eazy_italian_user:sB7Fubbn9THXz4QqfidirXXZIi42PIkC@dpg-d2m7sobe5dus739hach0-a.oregon-postgres.render.com/eazy_italian'

from backend.app.core.database import engine, Base
from backend.scripts.seed_data import create_demo_data

def recreate_database():
    print("Creating database tables...")
    
    # Create all tables
    Base.metadata.create_all(bind=engine)
    print("Tables created successfully!")
    
    print("Adding demo data...")
    # Add demo data
    create_demo_data()
    print("Demo data added successfully!")

if __name__ == "__main__":
    print("Recreating database with tables and demo data...")
    recreate_database()
    print("Database recreation completed!")
    print("\nDemo Accounts:")
    print("Teacher: teacher@eazyitalian.com / password123")
    print("Student: student@eazyitalian.com / password123")
