from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm, HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from datetime import timedelta, datetime, timezone
from typing import Optional
import random
import string
from app.core.database import get_db
from app.core.security import create_access_token, create_refresh_token, verify_password, get_password_hash, verify_refresh_token, verify_token
from app.core.auth import get_current_user
from app.models.user import User, UserRole
from app.models.email_verification import EmailVerificationCode
from app.schemas.user import (
    UserCreate, UserLogin, Token, UserResponse, RefreshTokenRequest,
    MagicCodeRequest, VerifyEmailRequest, ResendVerificationRequest
)
from app.core.config import settings
from app.core.teacher_tariffs import default_teacher_plan_ends_at
from app.models.subscription import Subscription, SubscriptionName, UserSubscription
from app.services.email_service import EmailService

router = APIRouter()

@router.post("/register", response_model=UserResponse)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    # Check if user already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new user
    hashed_password = get_password_hash(user_data.password)
    db_user = User(
        email=user_data.email,
        first_name=user_data.first_name,
        last_name=user_data.last_name,
        role=user_data.role,
        password_hash=hashed_password,
        locale=user_data.locale
    )
    
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    # 🔥 Attach FREE subscription
    free_sub = db.query(Subscription).filter(
        Subscription.name == SubscriptionName.FREE
    ).first()

    if not free_sub:
        raise HTTPException(500, "Free subscription not found")

    # Stores plan end for teachers: Free tier lasts 30 days then must renew or upgrade.
    free_plan_ends_at = (
        default_teacher_plan_ends_at("free")
        if db_user.role == UserRole.TEACHER
        else None
    )

    db.add(UserSubscription(
        user_id=db_user.id,
        subscription_id=free_sub.id,
        is_active=True,
        ends_at=free_plan_ends_at,
    ))

    db.commit()
    
    # Send email verification code if email is not verified
    if not db_user.email_verified_at:
        code = generate_verification_code()
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
        
        verification_code = EmailVerificationCode(
            email=db_user.email,
            code=code,
            code_type="verification",
            expires_at=expires_at
        )
        db.add(verification_code)
        db.commit()
        
        # Send verification email
        email_service = EmailService(db)
        subject = "Verify Your Email - Eazy Italian"
        body = f"""
        Hello {db_user.first_name},
        
        Welcome to Eazy Italian! Please verify your email address by entering this code: {code}
        
        This code will expire in 30 minutes.
        
        Best regards,
        Eazy Italian Team
        """
        html_body = f"""
        <html>
        <body>
            <h2>Welcome to Eazy Italian!</h2>
            <p>Hello {db_user.first_name},</p>
            <p>Please verify your email address by entering this code:</p>
            <p><strong style="font-size: 24px; letter-spacing: 2px;">{code}</strong></p>
            <p>This code will expire in 30 minutes.</p>
            <p>Best regards,<br>Eazy Italian Team</p>
        </body>
        </html>
        """
        
        email_service.send_email(db_user.email, subject, body, html_body)
    
    return db_user

@router.post("/login", response_model=Token)
def login(user_credentials: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_credentials.email).first()
    if not user or not verify_password(user_credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    
    # Update last_login timestamp
    user.last_login = datetime.now(timezone.utc)
    db.commit()
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)}, expires_delta=access_token_expires
    )

    refresh_token = create_refresh_token(data={"sub": str(user.id)})

    return {"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"}

@router.post("/login-form", response_model=Token)
def login_form(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    
    # Update last_login timestamp
    user.last_login = datetime.now(timezone.utc)
    db.commit()
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)}, expires_delta=access_token_expires
    )

    refresh_token = create_refresh_token(data={"sub": str(user.id)})

    return {"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"}

@router.post("/refresh", response_model=Token)
def refresh(payload: RefreshTokenRequest, db: Session = Depends(get_db)):
    refresh_payload = verify_refresh_token(payload.refresh_token)
    if refresh_payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = refresh_payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)}, expires_delta=access_token_expires
    )
    # For now, we do not rotate refresh tokens (stateless JWT). We return the same one.
    return {"access_token": access_token, "refresh_token": payload.refresh_token, "token_type": "bearer"}

@router.get("/me", response_model=UserResponse)
def get_current_user_info(current_user: User = Depends(get_current_user)):
    return current_user

@router.patch("/me/onboarding-complete")
def complete_onboarding(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    current_user.onboarding_completed = True
    db.commit()
    db.refresh(current_user)
    return {"ok": True}

def generate_verification_code() -> str:
    """Generate a 6-digit verification code"""
    return ''.join(random.choices(string.digits, k=6))

@router.post("/magic-code")
def send_magic_code(request: MagicCodeRequest, db: Session = Depends(get_db)):
    """
    Send a magic code to the user's email for passwordless login.
    The code expires in 10 minutes.
    """
    # Check if user exists
    user = db.query(User).filter(User.email == request.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User account is inactive"
        )
    
    # Generate verification code
    code = generate_verification_code()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    
    # Invalidate any existing unused codes for this email and type
    existing_codes = db.query(EmailVerificationCode).filter(
        EmailVerificationCode.email == request.email,
        EmailVerificationCode.code_type == "magic_login",
        EmailVerificationCode.is_used == False
    ).all()
    
    for existing_code in existing_codes:
        existing_code.is_used = True
    
    # Create new verification code
    verification_code = EmailVerificationCode(
        email=request.email,
        code=code,
        code_type="magic_login",
        expires_at=expires_at
    )
    db.add(verification_code)
    db.commit()
    
    # Send email with magic code
    email_service = EmailService(db)
    subject = "Your Magic Login Code"
    body = f"""
    Hello {user.first_name},
    
    Your magic login code is: {code}
    
    This code will expire in 10 minutes.
    
    If you didn't request this code, please ignore this email.
    
    Best regards,
    Eazy Italian Team
    """
    html_body = f"""
    <html>
    <body>
        <h2>Your Magic Login Code</h2>
        <p>Hello {user.first_name},</p>
        <p>Your magic login code is: <strong style="font-size: 24px; letter-spacing: 2px;">{code}</strong></p>
        <p>This code will expire in 10 minutes.</p>
        <p>If you didn't request this code, please ignore this email.</p>
        <p>Best regards,<br>Eazy Italian Team</p>
    </body>
    </html>
    """
    
    email_service.send_email(request.email, subject, body, html_body)
    
    return {"message": "Magic code sent to your email"}

@router.post("/check-email")
def check_email(request: MagicCodeRequest, db: Session = Depends(get_db)):
    """Return whether an email address is already registered."""
    user = db.query(User).filter(User.email == request.email).first()
    return {"exists": user is not None}

@router.post("/send-registration-code")
def send_registration_code(request: MagicCodeRequest, db: Session = Depends(get_db)):
    """
    Send a 6-digit verification code to a NEW (not yet registered) email.
    Fails with 400 if the email is already in the users table.
    """
    user = db.query(User).filter(User.email == request.email).first()
    if user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    code = generate_verification_code()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)

    # Invalidate any previous unused pre_registration codes for this email
    db.query(EmailVerificationCode).filter(
        EmailVerificationCode.email == request.email,
        EmailVerificationCode.code_type == "pre_registration",
        EmailVerificationCode.is_used == False
    ).update({"is_used": True})

    verification_code = EmailVerificationCode(
        email=request.email,
        code=code,
        code_type="pre_registration",
        expires_at=expires_at
    )
    db.add(verification_code)
    db.commit()

    email_service = EmailService(db)
    subject = "Verify Your Email – Eazy Italian"
    body = (
        f"Your registration verification code is: {code}\n\n"
        "This code expires in 15 minutes."
    )
    html_body = f"""
    <html><body>
        <h2>Verify Your Email</h2>
        <p>Your registration code is:</p>
        <p><strong style="font-size:24px;letter-spacing:2px">{code}</strong></p>
        <p>This code expires in 15 minutes.</p>
        <p>Best regards,<br>Eazy Italian Team</p>
    </body></html>
    """
    email_service.send_email(request.email, subject, body, html_body)

    return {"message": "Registration code sent to your email"}

@router.post("/verify-registration-code")
def verify_registration_code(request: VerifyEmailRequest, db: Session = Depends(get_db)):
    """
    Verify the pre-registration OTP code.
    The user does NOT need to exist yet — this just confirms email ownership.
    Returns a simple success message; the actual account is created later.
    """
    verification_code = db.query(EmailVerificationCode).filter(
        EmailVerificationCode.email == request.email,
        EmailVerificationCode.code == request.code,
        EmailVerificationCode.code_type == "pre_registration",
        EmailVerificationCode.is_used == False
    ).order_by(EmailVerificationCode.created_at.desc()).first()

    if not verification_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or already used verification code"
        )

    if verification_code.is_expired:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code has expired"
        )

    verification_code.is_used = True
    db.commit()

    return {"message": "Email verified successfully"}

@router.post("/verify-email", response_model=Token)
def verify_email(request: VerifyEmailRequest, db: Session = Depends(get_db)):
    """
    Verify email with code and return authentication token.
    Works for both email verification and magic code login.
    """
    # Find the verification code
    verification_code = db.query(EmailVerificationCode).filter(
        EmailVerificationCode.email == request.email,
        EmailVerificationCode.code == request.code,
        EmailVerificationCode.is_used == False
    ).order_by(EmailVerificationCode.created_at.desc()).first()
    
    if not verification_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification code"
        )
    
    if verification_code.is_expired:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code has expired"
        )
    
    # Get or create user
    user = db.query(User).filter(User.email == request.email).first()
    
    if verification_code.code_type == "magic_login":
        # Magic code login - user must exist
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User account is inactive"
            )
        
        # Mark code as used
        verification_code.is_used = True
        
        # Update last_login
        user.last_login = datetime.now(timezone.utc)
        db.commit()
        
        # Generate tokens
        access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": str(user.id)}, expires_delta=access_token_expires
        )
        refresh_token = create_refresh_token(data={"sub": str(user.id)})
        
        return {"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"}
    
    else:
        # Email verification - verify the user's email
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Mark code as used
        verification_code.is_used = True
        
        # Mark email as verified
        user.email_verified_at = datetime.now(timezone.utc)
        db.commit()
        
        # Generate tokens
        access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": str(user.id)}, expires_delta=access_token_expires
        )
        refresh_token = create_refresh_token(data={"sub": str(user.id)})
        
        return {"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"}

@router.post("/resend-verification")
def resend_verification(request: ResendVerificationRequest, db: Session = Depends(get_db)):
    """
    Resend email verification code.
    """
    # Check if user exists
    user = db.query(User).filter(User.email == request.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Check if email is already verified
    if user.email_verified_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is already verified"
        )
    
    # Generate verification code
    code = generate_verification_code()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
    
    # Invalidate any existing unused codes for this email and type
    existing_codes = db.query(EmailVerificationCode).filter(
        EmailVerificationCode.email == request.email,
        EmailVerificationCode.code_type == "verification",
        EmailVerificationCode.is_used == False
    ).all()
    
    for existing_code in existing_codes:
        existing_code.is_used = True
    
    # Create new verification code
    verification_code = EmailVerificationCode(
        email=request.email,
        code=code,
        code_type="verification",
        expires_at=expires_at
    )
    db.add(verification_code)
    db.commit()
    
    # Send email with verification code
    email_service = EmailService(db)
    subject = "Verify Your Email - Eazy Italian"
    body = f"""
    Hello {user.first_name},
    
    Please verify your email address by entering this code: {code}
    
    This code will expire in 30 minutes.
    
    If you didn't create an account, please ignore this email.
    
    Best regards,
    Eazy Italian Team
    """
    html_body = f"""
    <html>
    <body>
        <h2>Verify Your Email</h2>
        <p>Hello {user.first_name},</p>
        <p>Please verify your email address by entering this code:</p>
        <p><strong style="font-size: 24px; letter-spacing: 2px;">{code}</strong></p>
        <p>This code will expire in 30 minutes.</p>
        <p>If you didn't create an account, please ignore this email.</p>
        <p>Best regards,<br>Eazy Italian Team</p>
    </body>
    </html>
    """
    
    email_service.send_email(request.email, subject, body, html_body)
    
    return {"message": "Verification code sent to your email"}

@router.post("/logout")
def logout(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False)),
    db: Session = Depends(get_db)
):
    """
    Logout endpoint for logging/auditing purposes.
    Since JWT tokens are stateless, this endpoint doesn't invalidate tokens,
    but it can be used to track logout events.
    Accepts requests with or without valid authentication.
    """
    # Try to get current user if token is provided, but don't fail if it's invalid
    if credentials:
        try:
            token = credentials.credentials
            payload = verify_token(token)
            if payload:
                user_id = payload.get("sub")
                if user_id:
                    user = db.query(User).filter(User.id == int(user_id)).first()
                    if user:
                        # Could log logout event here if needed
                        pass
        except Exception:
            # Ignore authentication errors - logout should work even with invalid/expired tokens
            pass
    
    # Always return success - the client will clear tokens regardless
    return {"message": "Logged out successfully"}
