"""Teacher tariff endpoints for plan retrieval and plan switching."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.auth import get_current_teacher
from app.core.database import get_db
from app.core.teacher_tariffs import (
    TeacherTariffName,
    build_teacher_tariff_catalog,
    canonicalize_teacher_plan_name,
    default_teacher_plan_ends_at,
    get_teacher_ai_usage,
    get_teacher_ai_usage_period_key,
    get_teacher_subscription_ends_at,
    get_teacher_tariff_display_state,
    get_teacher_tariff_limits,
    resolve_subscription_row_for_teacher_plan,
)
from app.models.subscription import UserSubscription
from app.models.teacher_payment import TeacherPayment
from app.models.user import User
from app.schemas.teacher_payment import TeacherPaymentCreate, TeacherPaymentRead

router = APIRouter(prefix="/admin/tariffs", tags=["teacher-tariffs"])


# Stores one tariff row returned by the catalog endpoint.
class TeacherTariffRow(BaseModel):
    name: TeacherTariffName
    ai_limits: dict[str, int | None]


# Stores current teacher tariff payload including current-month AI usage counters.
class TeacherTariffStatusResponse(BaseModel):
    plan: TeacherTariffName
    ai_limits: dict[str, int | None]
    ai_usage: dict[str, int]
    period: str
    # ISO end of the current plan window when Free/Standard (30 days from activation by default).
    subscription_ends_at: Optional[datetime] = None
    # True when ends_at is set and already passed (AI generation is blocked until renewal).
    period_expired: bool = False


# Stores request body used to switch the authenticated teacher plan.
class TeacherTariffUpdateRequest(BaseModel):
    plan: str = Field(..., description="Teacher tariff name: free | standard | pro")
    ends_at: datetime | None = Field(
        default=None,
        description="Plan expiry; omit for Free/Standard to default to 30 days from now. Pro omits open-ended.",
    )


@router.get("/payments", response_model=list[TeacherPaymentRead])
def list_my_teacher_payments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher),
    limit: int = 100,
    offset: int = 0,
) -> list[TeacherPaymentRead]:
    # Caps page size so accidental huge requests cannot scan the whole ledger in one shot.
    safe_limit = max(1, min(limit, 200))
    # Skips rows for server-side pagination in the admin payment table.
    safe_offset = max(0, offset)
    # Loads newest teacher payment rows for the signed-in account.
    rows = (
        db.query(TeacherPayment)
        .filter(TeacherPayment.user_id == current_user.id)
        .order_by(TeacherPayment.created_at.desc())
        .offset(safe_offset)
        .limit(safe_limit)
        .all()
    )
    return [TeacherPaymentRead.model_validate(r) for r in rows]


@router.post("/payments", response_model=TeacherPaymentRead, status_code=status.HTTP_201_CREATED)
def create_teacher_payment(
    payload: TeacherPaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher),
) -> TeacherPaymentRead:
    # Persists a ledger entry for a simulated checkout or a future PSP webhook adapter.
    row = TeacherPayment(
        user_id=current_user.id,
        amount=payload.amount,
        currency=(payload.currency or "USD").upper()[:8],
        status=(payload.status or "succeeded")[:24],
        plan_code=payload.plan_code[:32] if payload.plan_code else None,
        billing_period=payload.billing_period[:8] if payload.billing_period else None,
        description=payload.description,
        provider_ref=payload.provider_ref[:255] if payload.provider_ref else None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return TeacherPaymentRead.model_validate(row)


@router.get("", response_model=list[TeacherTariffRow])
def get_teacher_tariffs(
    _: User = Depends(get_current_teacher),
) -> list[TeacherTariffRow]:
    # Stores static tariff rows backed by backend plan configuration.
    catalog_rows = build_teacher_tariff_catalog()
    return [TeacherTariffRow(**row) for row in catalog_rows]


@router.get("/me", response_model=TeacherTariffStatusResponse)
def get_my_teacher_tariff(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher),
) -> TeacherTariffStatusResponse:
    # Stores display plan and whether the current billing window has ended.
    current_plan, period_expired = get_teacher_tariff_display_state(db, current_user)
    # Stores plan-specific AI limits returned to the admin tariffs screen.
    current_plan_limits = get_teacher_tariff_limits(current_plan)
    # Stores month-scoped counters used for teacher quota badges in UI.
    current_plan_usage = get_teacher_ai_usage(db, current_user)
    # Stores usage bucket id (subscription row id for timed plans, or YYYY-MM for Pro/legacy).
    usage_period = get_teacher_ai_usage_period_key(db, current_user)
    return TeacherTariffStatusResponse(
        plan=current_plan,
        ai_limits=current_plan_limits,
        ai_usage=current_plan_usage,
        period=usage_period,
        subscription_ends_at=get_teacher_subscription_ends_at(db, current_user),
        period_expired=period_expired,
    )


@router.put("/me", response_model=TeacherTariffStatusResponse)
def update_my_teacher_tariff(
    payload: TeacherTariffUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_teacher),
) -> TeacherTariffStatusResponse:
    # Stores normalized target plan mapped from legacy aliases.
    target_plan = canonicalize_teacher_plan_name(payload.plan)
    # Stores DB subscription row corresponding to requested plan.
    target_subscription = resolve_subscription_row_for_teacher_plan(db, target_plan)
    if target_subscription is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Subscription row not found for plan '{target_plan}'.",
        )

    # Stores plan end: Free/Standard default to 30 days unless caller passes ends_at; Pro stays open unless set.
    plan_ends_at = payload.ends_at
    if plan_ends_at is None and target_plan in ("free", "standard"):
        plan_ends_at = default_teacher_plan_ends_at(target_plan)

    # Deactivates previous active rows so only one plan remains active.
    db.query(UserSubscription).filter(
        UserSubscription.user_id == current_user.id,
        UserSubscription.is_active == True,  # noqa: E712
    ).update({"is_active": False})

    # Stores newly activated teacher plan row.
    new_teacher_subscription = UserSubscription(
        user_id=current_user.id,
        subscription_id=target_subscription.id,
        ends_at=plan_ends_at,
        is_active=True,
    )
    db.add(new_teacher_subscription)
    db.commit()
    db.refresh(current_user)

    # Stores AI usage counters to return in the update response.
    updated_usage = get_teacher_ai_usage(db, current_user)
    return TeacherTariffStatusResponse(
        plan=target_plan,
        ai_limits=get_teacher_tariff_limits(target_plan),
        ai_usage=updated_usage,
        period=get_teacher_ai_usage_period_key(db, current_user),
        subscription_ends_at=get_teacher_subscription_ends_at(db, current_user),
        period_expired=False,
    )
