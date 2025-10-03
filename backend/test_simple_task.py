#!/usr/bin/env python3
"""
Simple test to debug task creation with minimal data
"""
import os
import sys
import requests
import json

# Configuration
BASE_URL = "http://localhost:8000"
ADMIN_EMAIL = "teacher@eazyitalian.com"
ADMIN_PASSWORD = "password123"

def test_simple_task_creation():
    """Test task creation with minimal data"""
    print("🔍 Testing simple task creation...")
    
    # First, get authentication token
    try:
        login_data = {
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        }
        
        response = requests.post(f"{BASE_URL}/api/v1/auth/login", json=login_data, timeout=10)
        
        if response.status_code != 200:
            print(f"❌ Authentication failed: {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        token = response.json()["access_token"]
        print("✅ Authentication successful")
        
    except Exception as e:
        print(f"❌ Authentication error: {e}")
        return False
    
    # Test task creation with minimal data
    headers = {"Authorization": f"Bearer {token}"}
    
    # Minimal task data - only required fields
    task_data = {
        "title": "Simple Test Task",
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
            return True
        else:
            print(f"❌ Task creation failed: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Task creation error: {e}")
        return False

if __name__ == "__main__":
    success = test_simple_task_creation()
    if success:
        print("\n🎉 Simple task creation test passed!")
    else:
        print("\n❌ Simple task creation test failed!")
