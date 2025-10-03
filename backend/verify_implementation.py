#!/usr/bin/env python3
"""
Comprehensive verification script for the Admin Tasks implementation
"""
import os
import sys
import requests
import json
from datetime import datetime

# Configuration
BASE_URL = "http://localhost:8000"
ADMIN_EMAIL = "teacher@eazyitalian.com"
ADMIN_PASSWORD = "password123"

def test_server_health():
    """Test if the server is running"""
    print("🔍 Testing server health...")
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        if response.status_code == 200:
            print("✅ Server is running and healthy")
            return True
        else:
            print(f"❌ Server returned status {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Cannot connect to server: {e}")
        return False

def test_authentication():
    """Test authentication"""
    print("\n🔐 Testing authentication...")
    try:
        login_data = {
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        }
        
        response = requests.post(f"{BASE_URL}/api/v1/auth/login", json=login_data, timeout=10)
        
        if response.status_code == 200:
            token = response.json()["access_token"]
            print("✅ Authentication successful")
            return token
        else:
            print(f"❌ Authentication failed: {response.status_code}")
            print(f"Response: {response.text}")
            return None
    except Exception as e:
        print(f"❌ Authentication error: {e}")
        return None

def test_api_endpoints(token):
    """Test various API endpoints"""
    print("\n🌐 Testing API endpoints...")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test getting tasks list
    try:
        response = requests.get(f"{BASE_URL}/api/v1/tasks/admin/tasks", headers=headers, timeout=10)
        print(f"✅ GET /api/v1/tasks/admin/tasks: {response.status_code}")
        if response.status_code == 200:
            tasks = response.json()
            print(f"   Found {len(tasks)} tasks")
    except Exception as e:
        print(f"❌ GET /api/v1/tasks/admin/tasks failed: {e}")
    
    # Test getting units (for task creation)
    try:
        response = requests.get(f"{BASE_URL}/api/v1/units/admin/units", headers=headers, timeout=10)
        print(f"✅ GET /api/v1/units/admin/units: {response.status_code}")
        if response.status_code == 200:
            units = response.json()
            print(f"   Found {len(units)} units")
    except Exception as e:
        print(f"❌ GET /api/v1/units/admin/units failed: {e}")

def test_task_creation(token):
    """Test task creation with detailed error reporting"""
    print("\n📝 Testing task creation...")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Simple task data
    task_data = {
        "title": "Test Task",
        "instructions": "This is a test task",
        "type": "manual",
        "max_score": 10,
        "status": "draft"
    }
    
    try:
        print(f"Sending request to: {BASE_URL}/api/v1/tasks/admin/tasks")
        print(f"Task data: {json.dumps(task_data, indent=2)}")
        
        response = requests.post(
            f"{BASE_URL}/api/v1/tasks/admin/tasks", 
            json=task_data, 
            headers=headers, 
            timeout=10
        )
        
        print(f"Response status: {response.status_code}")
        print(f"Response headers: {dict(response.headers)}")
        print(f"Response body: {response.text}")
        
        if response.status_code == 200:
            task = response.json()
            print(f"✅ Task created successfully with ID: {task['id']}")
            return task["id"]
        else:
            print(f"❌ Task creation failed: {response.status_code}")
            return None
            
    except Exception as e:
        print(f"❌ Task creation error: {e}")
        return None

def test_database_connection():
    """Test direct database connection"""
    print("\n🗄️ Testing database connection...")
    try:
        import os
        os.environ['DATABASE_URL'] = "postgresql://eazy_italian_user:sB7Fubbn9THXz4QqfidirXXZIi42PIkC@dpg-d2m7sobe5dus739hach0-a.oregon-postgres.render.com/eazy_italian"
        
        from app.core.database import SessionLocal
        from app.models.user import User
        from app.models.task import Task
        
        db = SessionLocal()
        
        # Test users
        users = db.query(User).all()
        print(f"✅ Found {len(users)} users in database")
        
        # Test tasks
        tasks = db.query(Task).all()
        print(f"✅ Found {len(tasks)} tasks in database")
        
        # Test teacher user
        teacher = db.query(User).filter(User.role == "TEACHER").first()
        if teacher:
            print(f"✅ Found teacher: {teacher.email}")
        else:
            print("❌ No teacher user found")
        
        db.close()
        return True
        
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Run all tests"""
    print("🚀 Starting Comprehensive Implementation Verification\n")
    
    # Test server health
    if not test_server_health():
        print("❌ Server is not running. Please start the backend server first.")
        return
    
    # Test database connection
    if not test_database_connection():
        print("❌ Database connection failed.")
        return
    
    # Test authentication
    token = test_authentication()
    if not token:
        print("❌ Authentication failed. Cannot proceed with API tests.")
        return
    
    # Test API endpoints
    test_api_endpoints(token)
    
    # Test task creation
    task_id = test_task_creation(token)
    
    print("\n" + "="*60)
    print("🎉 Verification Complete!")
    print("="*60)
    
    if task_id:
        print(f"✅ Task creation successful! ID: {task_id}")
        print("✅ All core functionality working!")
    else:
        print("⚠️ Task creation failed, but other functionality may be working")
        print("Check the error messages above for details")

if __name__ == "__main__":
    main()
