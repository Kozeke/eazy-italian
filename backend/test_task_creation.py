#!/usr/bin/env python3
"""
Simple test to debug task creation
"""
import os
import sys

# Set the database URL
os.environ['DATABASE_URL'] = "postgresql://eazy_italian_user:sB7Fubbn9THXz4QqfidirXXZIi42PIkC@dpg-d2m7sobe5dus739hach0-a.oregon-postgres.render.com/eazy_italian"

from app.core.database import SessionLocal
from app.models.user import User
from app.models.task import Task, TaskType, TaskStatus
from sqlalchemy.orm import Session

def test_task_creation():
    """Test creating a task directly in the database"""
    print("🔍 Testing task creation directly in database...")
    
    try:
        db = SessionLocal()
        
        # Get teacher user
        teacher = db.query(User).filter(User.role == "TEACHER").first()
        if not teacher:
            print("❌ No teacher user found")
            return False
        
        print(f"✅ Found teacher: {teacher.email}")
        
        # Create a simple task
        task = Task(
            title="Test Task",
            instructions="This is a test task",
            type=TaskType.MANUAL,
            max_score=10,
            status=TaskStatus.DRAFT,
            created_by=teacher.id,
            unit_id=1,  # Assuming unit 1 exists
            order_index=1
        )
        
        print("✅ Task object created successfully")
        print(f"Task data: {task.__dict__}")
        
        db.add(task)
        db.commit()
        db.refresh(task)
        
        print(f"✅ Task saved to database with ID: {task.id}")
        
        # Clean up
        db.delete(task)
        db.commit()
        print("✅ Test task cleaned up")
        
        db.close()
        return True
        
    except Exception as e:
        print(f"❌ Task creation failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_task_creation()
    if success:
        print("\n🎉 Task creation test passed!")
    else:
        print("\n❌ Task creation test failed!")
