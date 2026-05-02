"""
Stripe webhook endpoint: verifies signed events and applies teacher plans after payment.

The success URL is only UX; Stripe delivers checkout.session.completed (and related events)
as the source of truth for activating Standard / Pro.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.teacher_tariffs import (
    apply_teacher_plan_subscription_from_gateway,
    canonicalize_teacher_plan_name,
)
from app.models.teacher_payment import TeacherPayment

logger = logging.getLogger(__name__)

router = APIRouter()


def _metadata_dict(meta: Any) -> dict[str, str]:
    # Normalizes Stripe metadata objects to plain strings for lookups.
    if not meta:
        return {}
    if isinstance(meta, dict):
        return {str(k): str(v) for k, v in meta.items() if v is not None}
    try:
        return dict(meta)
    except Exception:
        return {}


def _handle_checkout_session_completed(db: Session, session: Any) -> None:
    # Activates the teacher plan and records a ledger row; idempotent per Checkout Session id.
    mode = getattr(session, "mode", None)
    if mode != "subscription":
        return

    session_id = getattr(session, "id", None)
    if not session_id:
        logger.warning("checkout.session.completed: missing session id")
        return

    existing = (
        db.query(TeacherPayment)
        .filter(TeacherPayment.provider_ref == session_id)
        .first()
    )
    if existing is not None:
        logger.info("checkout.session.completed: already processed session=%s", session_id)
        return

    meta = _metadata_dict(getattr(session, "metadata", None))
    plan_raw = meta.get("teacher_plan")
    ref = getattr(session, "client_reference_id", None) or meta.get("user_id")
    if not ref or not plan_raw:
        logger.error(
            "checkout.session.completed: missing client_reference_id/user_id or teacher_plan (session=%s)",
            session_id,
        )
        return

    try:
        user_id = int(ref)
    except (TypeError, ValueError):
        logger.error("checkout.session.completed: invalid user id %r", ref)
        return

    target_plan = canonicalize_teacher_plan_name(plan_raw)
    if target_plan not in ("standard", "pro"):
        logger.error("checkout.session.completed: unsupported plan %r", plan_raw)
        return

    stripe.api_key = settings.STRIPE_SECRET_KEY
    period_end: Optional[datetime] = None
    sub_id = getattr(session, "subscription", None)
    if isinstance(sub_id, dict):
        sub_id = sub_id.get("id")
    if sub_id and target_plan == "standard":
        try:
            sub = stripe.Subscription.retrieve(sub_id)
            period_ts = getattr(sub, "current_period_end", None) or sub["current_period_end"]
            period_end = datetime.fromtimestamp(int(period_ts), tz=timezone.utc)
        except Exception as exc:
            # Missing period end falls back to default_teacher_plan_ends_at inside apply().
            logger.warning("Could not read Stripe subscription period end: %s", exc)

    ends_at: Optional[datetime] = period_end if target_plan == "standard" else None

    user = apply_teacher_plan_subscription_from_gateway(
        db,
        user_id,
        plan_raw,
        ends_at,
        commit=False,
    )
    if user is None:
        db.rollback()
        return

    total = getattr(session, "amount_total", None) or 0
    amount = float(total) / 100.0
    currency = (getattr(session, "currency", None) or "usd").upper()

    db.add(
        TeacherPayment(
            user_id=user.id,
            amount=amount,
            currency=currency[:8],
            status="succeeded",
            plan_code=target_plan,
            description=f"Stripe Checkout subscription ({session_id})",
            provider_ref=session_id,
        )
    )
    db.commit()
    logger.info(
        "checkout.session.completed: user=%s plan=%s session=%s",
        user_id,
        target_plan,
        session_id,
    )


def _handle_subscription_updated(db: Session, subscription: Any) -> None:
    # Keeps Standard billing window in sync on renewals and plan changes (Pro stays open-ended).
    meta = _metadata_dict(getattr(subscription, "metadata", None))
    ref = meta.get("user_id")
    plan_raw = meta.get("teacher_plan")
    if not ref or not plan_raw:
        return
    sub_status = getattr(subscription, "status", None)
    if sub_status is None and isinstance(subscription, dict):
        sub_status = subscription.get("status")
    if sub_status not in ("active", "trialing"):
        return
    try:
        user_id = int(ref)
    except (TypeError, ValueError):
        logger.error("customer.subscription.updated: invalid user_id %r", ref)
        return

    target_plan = canonicalize_teacher_plan_name(plan_raw)
    if target_plan == "pro":
        ends_at: Optional[datetime] = None
    elif target_plan == "standard":
        ts = getattr(subscription, "current_period_end", None)
        if ts is None and isinstance(subscription, dict):
            ts = subscription.get("current_period_end")
        if ts is None:
            return
        ends_at = datetime.fromtimestamp(int(ts), tz=timezone.utc)
    else:
        return

    user = apply_teacher_plan_subscription_from_gateway(
        db,
        user_id,
        plan_raw,
        ends_at,
        commit=True,
    )
    if user:
        logger.info(
            "customer.subscription.updated: user=%s plan=%s period_end=%s",
            user_id,
            target_plan,
            ends_at.isoformat() if ends_at else "open",
        )


def _handle_subscription_deleted(db: Session, subscription: Any) -> None:
    # Downgrades the teacher to Free when the Stripe subscription ends (cancel at period end).
    meta = _metadata_dict(getattr(subscription, "metadata", None))
    ref = meta.get("user_id")
    if not ref:
        logger.warning("customer.subscription.deleted: missing user_id in metadata")
        return
    try:
        user_id = int(ref)
    except (TypeError, ValueError):
        logger.error("customer.subscription.deleted: invalid user_id %r", ref)
        return

    user = apply_teacher_plan_subscription_from_gateway(
        db,
        user_id,
        "free",
        None,
        commit=True,
    )
    if user:
        logger.info("customer.subscription.deleted: user=%s downgraded to free", user_id)


@router.post("/webhooks/stripe")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)) -> dict[str, bool]:
    # Rejects traffic when webhook signing is not configured (Stripe would fail verify anyway).
    if not settings.STRIPE_WEBHOOK_SECRET.strip():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="STRIPE_WEBHOOK_SECRET is not configured.",
        )
    if not settings.STRIPE_SECRET_KEY.strip():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="STRIPE_SECRET_KEY is not configured.",
        )

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    if not sig_header:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing Stripe-Signature header.",
        )

    try:
        event = stripe.Webhook.construct_event(
            payload,
            sig_header,
            settings.STRIPE_WEBHOOK_SECRET,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid webhook payload.",
        ) from exc
    except stripe.SignatureVerificationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid Stripe signature: {exc}",
        ) from exc

    # StripeObject and dict-shaped events both support keyed access.
    event_type = event["type"]
    data_object = event["data"]["object"]

    try:
        if event_type == "checkout.session.completed":
            _handle_checkout_session_completed(db, data_object)
        elif event_type == "customer.subscription.updated":
            _handle_subscription_updated(db, data_object)
        elif event_type == "customer.subscription.deleted":
            _handle_subscription_deleted(db, data_object)
        else:
            logger.debug("Stripe webhook ignored event type=%s", event_type)
    except Exception as exc:
        # Return 500 so Stripe retries failed deliveries.
        db.rollback()
        logger.exception("Stripe webhook handler failed for type=%s", event_type)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Webhook handler error.",
        ) from exc

    return {"received": True}

