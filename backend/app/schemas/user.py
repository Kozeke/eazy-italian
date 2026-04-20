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


class AdminStudentCreateRequest(BaseModel):
    email: EmailStr
    first_name: str
    phone: Optional[str] = None
    native_language: Optional[str] = None
    timezone: Optional[str] = None
    # Stores teacher id sent by admin UI to explicitly mark student ownership.
    teacher_id: Optional[int] = None

# Stores editable fields for updating an existing student profile from admin UI.
class AdminStudentUpdateRequest(BaseModel):
    email: Optional[EmailStr] = None
    first_name: Optional[str] = None
    phone: Optional[str] = None
    native_language: Optional[str] = None
    timezone: Optional[str] = None

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
    refresh_token: Optional[str] = None
    token_type: str = "bearer"

class RefreshTokenRequest(BaseModel):
    refresh_token: str

class MagicCodeRequest(BaseModel):
    email: EmailStr

class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str

class ResendVerificationRequest(BaseModel):
    email: EmailStr

class UserResponse(UserBase):
    id: int
    role: UserRole
    # Stores profile avatar URL resolved from notification_prefs metadata.
    avatar_url: Optional[str] = None
    email_verified_at: Optional[datetime] = None
    notification_prefs: Dict[str, Any] = {}
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    last_login: Optional[datetime] = None
    subscription: Optional[str] = None
    subscription_ends_at: Optional[datetime] = None
    enrolled_courses_count: int = 0
    onboarding_completed: bool = False
    # Stores the plain-text temporary password created at student registration;
    # None once the student has set their own password.
    temporary_password: Optional[str] = None

    class Config:
        from_attributes = True


# Stores response payload returned after admin creates a student account.
class AdminStudentCreateResponse(UserResponse):
    temporary_password: str
    login_url: str
