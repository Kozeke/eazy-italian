import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.database import get_db, Base
from app.main import app
from app.core.security import get_password_hash
from app.models.user import User, UserRole

# Test database
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

client = TestClient(app)

@pytest.fixture(scope="function")
def setup_database():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def db_session():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

def test_register_user(setup_database, db_session):
    user_data = {
        "email": "test@example.com",
        "password": "testpassword123",
        "first_name": "Test",
        "last_name": "User",
        "role": "student"
    }
    
    response = client.post("/api/v1/auth/register", json=user_data)
    assert response.status_code == 200
    
    data = response.json()
    assert data["email"] == user_data["email"]
    assert data["first_name"] == user_data["first_name"]
    assert data["last_name"] == user_data["last_name"]
    assert data["role"] == user_data["role"]

def test_login_user(setup_database, db_session):
    # Create a test user
    hashed_password = get_password_hash("testpassword123")
    user = User(
        email="test@example.com",
        first_name="Test",
        last_name="User",
        role=UserRole.STUDENT,
        password_hash=hashed_password,
        locale="ru"
    )
    db_session.add(user)
    db_session.commit()
    
    login_data = {
        "email": "test@example.com",
        "password": "testpassword123"
    }
    
    response = client.post("/api/v1/auth/login", json=login_data)
    assert response.status_code == 200
    
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
