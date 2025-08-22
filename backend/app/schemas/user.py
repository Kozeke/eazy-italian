from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, Any
from datetime import datetime
from app.models.user import UserRole

class UserBase(BaseModel):
    email: EmailStr
    first_name: str
    last_name: str
    locale: str = "ru"

class UserCreate(UserBase):
    password: str
    role: UserRole = UserRole.STUDENT

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    locale: Optional[str] = None
    notification_prefs: Optional[Dict[str, Any]] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserResponse(UserBase):
    id: int
    role: UserRole
    email_verified_at: Optional[datetime]
    notification_prefs: Dict[str, Any]
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True
