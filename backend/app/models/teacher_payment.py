"""Teacher-facing payment ledger rows (subscription checkouts, renewals, refunds)."""

import enum
from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


# Normalized payment outcome stored on each ledger row.
class TeacherPaymentStatus(str, enum.Enum):
    # Checkout started but not finalized (e.g. redirect in progress).
    PENDING = "pending"
    # Funds captured successfully.
    SUCCEEDED = "succeeded"
    # Charge attempt failed or was voided.
    FAILED = "failed"
    # Money returned to the customer after a prior success.
    REFUNDED = "refunded"


# One saved charge or adjustment for a teacher account (auditing and UI history).
class TeacherPayment(Base):
    __tablename__ = "teacher_payments"

    # Surrogate primary key for API responses and joins.
    id = Column(Integer, primary_key=True, index=True)
    # Owner of the payment row (must be a teacher for these routes).
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # Charged amount in major currency units (e.g. dollars, not cents).
    amount = Column(Float, nullable=False)
    # ISO currency code shown in the admin UI.
    currency = Column(String(8), nullable=False, server_default="USD")
    # Lifecycle state for support and filtering.
    status = Column(String(24), nullable=False, server_default="succeeded")
    # Tariff bucket at purchase time: free | standard | pro (optional for adjustments).
    plan_code = Column(String(32), nullable=True)
    # Billing cadence when applicable: 1m | 3m | 6m | 12m.
    billing_period = Column(String(8), nullable=True)
    # Human-readable note or gateway decline reason.
    description = Column(Text, nullable=True)
    # External PSP reference when integrated (Stripe payment_intent id, etc.).
    provider_ref = Column(String(255), nullable=True)
    # Row creation time (displayed as payment time until a dedicated captured_at exists).
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # ORM navigation back to the owning user profile.
    user = relationship("User", back_populates="teacher_payments")
