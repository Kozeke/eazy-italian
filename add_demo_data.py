#!/usr/bin/env python3
"""
Simple script to add demo data to the database
"""

import os
import sys

# Add the backend directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

# Set the database URL environment variable
os.environ['DATABASE_URL'] = 'postgresql://eazy_italian_user:sB7Fubbn9THXz4QqfidirXXZIi42PIkC@dpg-d2m7sobe5dus739hach0-a.oregon-postgres.render.com/eazy_italian'

from backend.scripts.seed_data import create_demo_data

if __name__ == "__main__":
    print("Adding demo data to database...")
    try:
        create_demo_data()
        print("Demo data added successfully!")
        print("\nDemo Accounts:")
        print("Teacher: teacher@eazyitalian.com / password123")
        print("Student: student@eazyitalian.com / password123")
    except Exception as e:
        print(f"Error: {e}")
        print("Make sure the backend has started and created the tables first.")
