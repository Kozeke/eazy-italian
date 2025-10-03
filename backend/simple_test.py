#!/usr/bin/env python3
"""
Simple test to debug task creation
"""
import requests
import json

# Configuration
BASE_URL = "http://localhost:8000"
ADMIN_EMAIL = "teacher@eazyitalian.com"
ADMIN_PASSWORD = "password123"

def test_auth():
    """Test authentication and get admin token"""
    print("🔐 Testing authentication...")
    
    login_data = {
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    }
    
    response = requests.post(f"{BASE_URL}/api/v1/auth/login", json=login_data)
    
    if response.status_code == 200:
        token = response.json()["access_token"]
        print("✅ Authentication successful")
        return token
    else:
        print(f"❌ Authentication failed: {response.status_code}")
        print(response.text)
        return None

def test_simple_task_creation(token):
    """Test creating a simple task"""
    print("\n📝 Testing simple task creation...")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Minimal task data
    task_data = {
        "title": "Простое тестовое задание",
        "instructions": "Это простое задание для тестирования",
        "type": "manual",
        "max_score": 10,
        "status": "draft"
    }
    
    print(f"Sending request to: {BASE_URL}/api/v1/tasks/admin/tasks")
    print(f"Task data: {json.dumps(task_data, indent=2)}")
    
    response = requests.post(f"{BASE_URL}/api/v1/tasks/admin/tasks", json=task_data, headers=headers)
    
    print(f"Response status: {response.status_code}")
    print(f"Response headers: {dict(response.headers)}")
    print(f"Response body: {response.text}")
    
    if response.status_code == 201:
        task = response.json()
        print(f"✅ Task created successfully with ID: {task['id']}")
        return task["id"]
    else:
        print(f"❌ Task creation failed: {response.status_code}")
        return None

def main():
    """Run simple test"""
    print("🚀 Starting Simple Task Creation Test\n")
    
    # Test authentication
    token = test_auth()
    if not token:
        print("❌ Cannot proceed without authentication")
        return
    
    # Test simple task creation
    task_id = test_simple_task_creation(token)
    
    if task_id:
        print(f"\n✅ Success! Created task with ID: {task_id}")
    else:
        print("\n❌ Failed to create task")

if __name__ == "__main__":
    main()
