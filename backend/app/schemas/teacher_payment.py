"""Pydantic payloads for teacher payment history APIs."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# Request body when recording a checkout outcome from the admin UI or a webhook adapter.
class TeacherPaymentCreate(BaseModel):
    # Charged amount in major currency units (e.g. 14.9 USD).
    amount: float = Field(..., ge=0)
    # ISO currency code for display and future PSP reconciliation.
    currency: str = Field(default="USD", max_length=8)
    # Payment lifecycle marker persisted with the row.
    status: str = Field(default="succeeded", max_length=24)
    # Tariff bucket label at purchase time (free, standard, pro).
    plan_code: Optional[str] = Field(default=None, max_length=32)
    # Billing cadence key when the charge maps to a subscription term.
    billing_period: Optional[str] = Field(default=None, max_length=8)
    # Optional note shown in the history table.
    description: Optional[str] = Field(default=None, max_length=2000)
    # Optional external provider reference (Stripe id, etc.).
    provider_ref: Optional[str] = Field(default=None, max_length=255)


# Single row returned to the tariffs payment history table.
class TeacherPaymentRead(BaseModel):
    # Primary key for client-side keys and support lookups.
    id: int
    # Charged amount in major currency units.
    amount: float
    # ISO currency code.
    currency: str
    # Payment lifecycle marker.
    status: str
    # Tariff bucket label when set.
    plan_code: Optional[str]
    # Billing cadence when set.
    billing_period: Optional[str]
    # Optional human-readable note.
    description: Optional[str]
    # Optional PSP correlation id.
    provider_ref: Optional[str]
    # Timestamp when the row was created (treated as payment time in UI).
    created_at: datetime

    class Config:
        from_attributes = True
