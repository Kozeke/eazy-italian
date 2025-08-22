#!/usr/bin/env python3
"""
Development script to run the Eazy Italian application
"""

import os
import sys
import subprocess
import time
from pathlib import Path

def run_command(command, cwd=None, shell=True):
    """Run a command and return the result"""
    print(f"Running: {command}")
    result = subprocess.run(command, cwd=cwd, shell=shell, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error running command: {command}")
        print(f"Error: {result.stderr}")
        return False
    print(f"Success: {result.stdout}")
    return True

def setup_backend():
    """Setup the backend"""
    print("Setting up backend...")
    
    # Install dependencies
    if not run_command("pip install -r backend/requirements.txt"):
        return False
    
    # Create .env file if it doesn't exist
    env_file = Path("backend/.env")
    if not env_file.exists():
        env_content = """DATABASE_URL=postgresql://postgres:postgres@localhost:5432/eazy_italian
REDIS_URL=redis://localhost:6379
SECRET_KEY=dev-secret-key-change-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123
MINIO_BUCKET_NAME=eazy-italian
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
DEBUG=True
ENVIRONMENT=development
API_V1_STR=/api/v1
PROJECT_NAME=Eazy Italian
"""
        with open(env_file, "w") as f:
            f.write(env_content)
        print("Created backend/.env file")
    
    return True

def setup_frontend():
    """Setup the frontend"""
    print("Setting up frontend...")
    
    # Install dependencies
    if not run_command("npm install", cwd="frontend"):
        return False
    
    return True

def start_services():
    """Start the required services using Docker"""
    print("Starting services with Docker...")
    
    # Check if Docker is running
    if not run_command("docker --version"):
        print("Docker is not installed or not running")
        return False
    
    # Start services
    if not run_command("docker-compose up -d postgres redis minio"):
        return False
    
    # Wait for services to be ready
    print("Waiting for services to be ready...")
    time.sleep(10)
    
    return True

def run_backend():
    """Run the backend server"""
    print("Starting backend server...")
    
    # Change to backend directory
    os.chdir("backend")
    
    # Run the server
    try:
        subprocess.run([
            "uvicorn", "main:app", 
            "--host", "0.0.0.0", 
            "--port", "8000", 
            "--reload"
        ])
    except KeyboardInterrupt:
        print("\nBackend server stopped")

def run_frontend():
    """Run the frontend development server"""
    print("Starting frontend development server...")
    
    # Change to frontend directory
    os.chdir("frontend")
    
    # Run the development server
    try:
        subprocess.run(["npm", "run", "dev"])
    except KeyboardInterrupt:
        print("\nFrontend server stopped")

def main():
    """Main function"""
    print("Eazy Italian Development Setup")
    print("=" * 40)
    
    # Check if we're in the right directory
    if not Path("backend").exists() or not Path("frontend").exists():
        print("Error: Please run this script from the project root directory")
        sys.exit(1)
    
    # Setup backend
    if not setup_backend():
        print("Failed to setup backend")
        sys.exit(1)
    
    # Setup frontend
    if not setup_frontend():
        print("Failed to setup frontend")
        sys.exit(1)
    
    # Start services
    if not start_services():
        print("Failed to start services")
        sys.exit(1)
    
    print("\nSetup complete!")
    print("\nTo run the application:")
    print("1. Backend: cd backend && uvicorn main:app --reload")
    print("2. Frontend: cd frontend && npm run dev")
    print("\nOr use Docker Compose:")
    print("docker-compose up")
    
    # Ask if user wants to run the servers
    response = input("\nDo you want to run the servers now? (y/n): ")
    if response.lower() == 'y':
        print("\nStarting servers...")
        print("Backend will be available at: http://localhost:8000")
        print("Frontend will be available at: http://localhost:3000")
        print("API docs will be available at: http://localhost:8000/docs")
        print("\nPress Ctrl+C to stop the servers")
        
        # Start backend in a separate process
        import threading
        backend_thread = threading.Thread(target=run_backend)
        backend_thread.daemon = True
        backend_thread.start()
        
        # Wait a bit for backend to start
        time.sleep(3)
        
        # Start frontend
        run_frontend()

if __name__ == "__main__":
    main()
