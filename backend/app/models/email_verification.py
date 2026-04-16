"""
Email Verification Code model
Stores verification codes for email verification and magic code login
"""
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
from datetime import datetime, timedelta, timezone

class EmailVerificationCode(Base):
    """Email verification code for email verification and magic code login"""
    __tablename__ = "email_verification_codes"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, nullable=False, index=True)
    code = Column(String(6), nullable=False)  # 6-digit code
    code_type = Column(String(20), nullable=False, default="verification")  # "verification" or "magic_login"
    is_used = Column(Boolean, default=False, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def __repr__(self):
        return f"<EmailVerificationCode(email={self.email}, code_type={self.code_type}, is_used={self.is_used})>"

    @property
    def is_expired(self) -> bool:
        """Check if the code has expired"""
        return datetime.now(timezone.utc) > self.expires_at

    @property
    def is_valid(self) -> bool:
        """Check if the code is still valid (not used and not expired)"""
        return not self.is_used and not self.is_expired
