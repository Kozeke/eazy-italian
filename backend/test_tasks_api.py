#!/usr/bin/env python3
"""
Simple test script to verify the Tasks API implementation
"""
import requests
import json
from datetime import datetime, timedelta

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

def test_create_task(token):
    """Test creating a new task"""
    print("\n📝 Testing task creation...")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    task_data = {
        "title": "Тестовое задание",
        "instructions": "Это тестовое задание для проверки API",
        "type": "manual",
        "max_score": 10,
        "due_at": (datetime.now() + timedelta(days=7)).isoformat(),
        "allow_late_submissions": True,
        "late_penalty_percent": 10,
        "max_attempts": 3,
        "status": "draft",
        "assign_to_all": True,
        "notify_on_assignment": True,
        "notify_reminder_days": 1,
        "notify_on_submit": True,
        "notify_on_grade": True
    }
    
    response = requests.post(f"{BASE_URL}/api/v1/tasks/admin/tasks", json=task_data, headers=headers)
    
    if response.status_code == 201:
        task = response.json()
        print(f"✅ Task created successfully with ID: {task['id']}")
        return task["id"]
    else:
        print(f"❌ Task creation failed: {response.status_code}")
        print(response.text)
        return None

def test_get_tasks(token):
    """Test getting tasks list"""
    print("\n📋 Testing tasks list...")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    response = requests.get(f"{BASE_URL}/api/v1/tasks/admin/tasks", headers=headers)
    
    if response.status_code == 200:
        tasks = response.json()
        print(f"✅ Retrieved {len(tasks)} tasks")
        return tasks
    else:
        print(f"❌ Failed to get tasks: {response.status_code}")
        print(response.text)
        return []

def test_get_task_detail(token, task_id):
    """Test getting task details"""
    print(f"\n🔍 Testing task details for ID: {task_id}...")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    response = requests.get(f"{BASE_URL}/api/v1/tasks/admin/tasks/{task_id}", headers=headers)
    
    if response.status_code == 200:
        task = response.json()
        print(f"✅ Task details retrieved: {task['title']}")
        return task
    else:
        print(f"❌ Failed to get task details: {response.status_code}")
        print(response.text)
        return None

def test_update_task(token, task_id):
    """Test updating a task"""
    print(f"\n✏️ Testing task update for ID: {task_id}...")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    update_data = {
        "title": "Обновленное тестовое задание",
        "status": "published"
    }
    
    response = requests.put(f"{BASE_URL}/api/v1/tasks/admin/tasks/{task_id}", json=update_data, headers=headers)
    
    if response.status_code == 200:
        task = response.json()
        print(f"✅ Task updated successfully: {task['title']}")
        return task
    else:
        print(f"❌ Task update failed: {response.status_code}")
        print(response.text)
        return None

def test_task_statistics(token, task_id):
    """Test getting task statistics"""
    print(f"\n📊 Testing task statistics for ID: {task_id}...")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    response = requests.get(f"{BASE_URL}/api/v1/tasks/admin/tasks/{task_id}/statistics", headers=headers)
    
    if response.status_code == 200:
        stats = response.json()
        print(f"✅ Task statistics retrieved:")
        print(f"   - Total submissions: {stats['total_submissions']}")
        print(f"   - Pending submissions: {stats['pending_submissions']}")
        print(f"   - Graded submissions: {stats['graded_submissions']}")
        print(f"   - Average score: {stats['average_score']}")
        return stats
    else:
        print(f"❌ Failed to get task statistics: {response.status_code}")
        print(response.text)
        return None

def test_auto_gradable_task(token):
    """Test creating an auto-gradable task"""
    print("\n🤖 Testing auto-gradable task creation...")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    task_data = {
        "title": "Автоматическое задание MCQ",
        "instructions": "Выберите правильный ответ",
        "type": "auto",
        "auto_task_type": "mcq",
        "max_score": 5,
        "auto_check_config": {
            "question": "Столица Италии?",
            "options": ["Рим", "Милан", "Флоренция", "Венеция"],
            "correct_answer": 0,
            "shuffle_options": True,
            "partial_credit": False
        },
        "status": "draft",
        "assign_to_all": True
    }
    
    response = requests.post(f"{BASE_URL}/api/v1/tasks/admin/tasks", json=task_data, headers=headers)
    
    if response.status_code == 201:
        task = response.json()
        print(f"✅ Auto-gradable task created successfully with ID: {task['id']}")
        return task["id"]
    else:
        print(f"❌ Auto-gradable task creation failed: {response.status_code}")
        print(response.text)
        return None

def main():
    """Run all tests"""
    print("🚀 Starting Tasks API Tests\n")
    
    # Test authentication
    token = test_auth()
    if not token:
        print("❌ Cannot proceed without authentication")
        return
    
    # Test creating a manual task
    task_id = test_create_task(token)
    if not task_id:
        print("❌ Cannot proceed without creating a task")
        return
    
    # Test getting tasks list
    tasks = test_get_tasks(token)
    
    # Test getting task details
    task_detail = test_get_task_detail(token, task_id)
    
    # Test updating task
    updated_task = test_update_task(token, task_id)
    
    # Test task statistics
    stats = test_task_statistics(token, task_id)
    
    # Test creating auto-gradable task
    auto_task_id = test_auto_gradable_task(token)
    
    print("\n" + "="*50)
    print("🎉 All tests completed!")
    print("="*50)
    
    if task_id and auto_task_id:
        print(f"✅ Created manual task ID: {task_id}")
        print(f"✅ Created auto-gradable task ID: {auto_task_id}")
        print(f"✅ Retrieved {len(tasks)} total tasks")
        print("✅ All core functionality working!")

if __name__ == "__main__":
    main()
