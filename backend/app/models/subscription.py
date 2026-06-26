"""Subscription and user-plan persistence models."""

from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
import enum


class SubscriptionName(str, enum.Enum):
    FREE = "FREE"
    STANDARD = "STANDARD"
    # Keeps backward compatibility for old rows created before standard rename.
    PREMIUM = "PREMIUM"
    PRO = "PRO"


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True)
    # Declared as String so SQLAlchemy reads the raw PG enum label as plain text.
    # The DB column remains of type subscriptionname (PostgreSQL still enforces validity on writes).
    # This avoids LookupError when the PG enum has mixed-case labels (e.g. 'STANDARD' vs 'standard').
    name = Column(String(50), unique=True, nullable=False)
    price = Column(Float, default=0.0)
    is_active = Column(Boolean, default=True)

    levels = relationship(
        "SubscriptionLevel",
        back_populates="subscription",
        cascade="all, delete-orphan"
    )


class SubscriptionLevel(Base):
    __tablename__ = "subscription_levels"

    id = Column(Integer, primary_key=True)
    subscription_id = Column(Integer, ForeignKey("subscriptions.id"), nullable=False)
    level = Column(String, nullable=False)  # "A1", "A2", ...

    subscription = relationship("Subscription", back_populates="levels")


class UserSubscription(Base):
    __tablename__ = "user_subscriptions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    subscription_id = Column(Integer, ForeignKey("subscriptions.id"), nullable=False)

    starts_at = Column(DateTime(timezone=True), server_default=func.now())
    ends_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True)

    subscription = relationship("Subscription")
    user = relationship("User", back_populates="user_subscriptions")