#!/usr/bin/env python3

import requests
import json

# Test the GET tasks endpoint
def test_get_tasks():
    # First, get authentication token
    login_data = {
        "email": "teacher@eazyitalian.com",
        "password": "password123"
    }
    
    print("🔐 Getting authentication token...")
    login_response = requests.post(
        "http://localhost:8000/api/v1/auth/login",
        json=login_data
    )
    
    if login_response.status_code != 200:
        print(f"❌ Login failed: {login_response.status_code}")
        print(login_response.text)
        return
    
    token = login_response.json()["access_token"]
    print("✅ Authentication successful")
    
    # Test GET tasks endpoint
    headers = {"Authorization": f"Bearer {token}"}
    
    print("🔍 Testing GET /api/v1/tasks/admin/tasks...")
    response = requests.get(
        "http://localhost:8000/api/v1/tasks/admin/tasks?sort_by=created_at&sort_order=desc&skip=0&limit=100",
        headers=headers
    )
    
    print(f"Status Code: {response.status_code}")
    print(f"Response Headers: {dict(response.headers)}")
    
    if response.status_code == 200:
        tasks = response.json()
        print(f"✅ Success! Found {len(tasks)} tasks")
        if tasks:
            print(f"First task: {tasks[0]['title']}")
    else:
        print(f"❌ Error: {response.status_code}")
        print(f"Response: {response.text}")

if __name__ == "__main__":
    test_get_tasks()
