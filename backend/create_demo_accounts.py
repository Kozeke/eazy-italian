#!/usr/bin/env python3
"""
Script to create demo accounts in the Render database
"""

import os
import sys

# Add the backend directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

# Set the database URL environment variable
os.environ['DATABASE_URL'] = 'postgresql://eazy_italian_user:sB7Fubbn9THXz4QqfidirXXZIi42PIkC@dpg-d2m7sobe5dus739hach0-a.oregon-postgres.render.com/eazy_italian'

# Import and run the seed data script
from backend.scripts.seed_data import create_demo_data

if __name__ == "__main__":
    print("Creating demo accounts...")
    create_demo_data()
    print("Demo accounts created successfully!")
    print("\nDemo Accounts:")
    print("Teacher: teacher@eazyitalian.com / password123")
    print("Student: student@eazyitalian.com / password123")
