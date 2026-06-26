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


class StripeWebhookApplyError(Exception):
    """Checkout succeeded in Stripe but the teacher plan could not be persisted."""


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


def _session_field(session: Any, key: str, default: Any = None) -> Any:
    # Reads StripeObject attributes or dict keys uniformly.
    if isinstance(session, dict):
        return session.get(key, default)
    return getattr(session, key, default)


def _apply_plan_from_subscription_metadata(
    db: Session,
    subscription: Any,
    *,
    event_label: str,
) -> None:
    # Shared path for subscription.created / subscription.updated webhooks.
    meta = _metadata_dict(_session_field(subscription, "metadata"))
    ref = meta.get("user_id")
    plan_raw = meta.get("teacher_plan")
    sub_id = _session_field(subscription, "id")
    if not ref or not plan_raw:
        logger.warning(
            "%s: skip sub=%s — missing user_id or teacher_plan metadata=%s",
            event_label,
            sub_id,
            meta,
        )
        return

    sub_status = _session_field(subscription, "status")
    if sub_status not in ("active", "trialing"):
        logger.info(
            "%s: skip sub=%s user_ref=%s status=%s",
            event_label,
            sub_id,
            ref,
            sub_status,
        )
        return

    try:
        user_id = int(ref)
    except (TypeError, ValueError):
        logger.error("%s: invalid user_id %r (sub=%s)", event_label, ref, sub_id)
        return

    target_plan = canonicalize_teacher_plan_name(plan_raw)
    if target_plan == "pro":
        ends_at: Optional[datetime] = None
    elif target_plan == "standard":
        ts = _session_field(subscription, "current_period_end")
        if ts is None:
            logger.warning(
                "%s: skip sub=%s user=%s — standard plan missing current_period_end",
                event_label,
                sub_id,
                user_id,
            )
            return
        ends_at = datetime.fromtimestamp(int(ts), tz=timezone.utc)
    else:
        logger.warning(
            "%s: skip sub=%s user=%s — unsupported plan %r",
            event_label,
            sub_id,
            user_id,
            plan_raw,
        )
        return

    user = apply_teacher_plan_subscription_from_gateway(
        db,
        user_id,
        plan_raw,
        ends_at,
        commit=True,
    )
    if user is None:
        raise StripeWebhookApplyError(
            f"{event_label}: plan apply failed user={user_id} plan={target_plan} sub={sub_id}"
        )

    logger.info(
        "%s: applied user=%s plan=%s sub=%s period_end=%s",
        event_label,
        user_id,
        target_plan,
        sub_id,
        ends_at.isoformat() if ends_at else "open",
    )


def _handle_checkout_session_completed(db: Session, session: Any) -> None:
    # Activates the teacher plan and records a ledger row; idempotent per Checkout Session id.
    session_id = _session_field(session, "id")
    mode = _session_field(session, "mode")
    payment_status = _session_field(session, "payment_status")
    meta = _metadata_dict(_session_field(session, "metadata"))
    client_ref = _session_field(session, "client_reference_id")

    logger.info(
        "checkout.session.completed: session=%s mode=%s payment_status=%s "
        "client_reference_id=%s metadata=%s",
        session_id,
        mode,
        payment_status,
        client_ref,
        meta,
    )

    if mode != "subscription":
        logger.warning(
            "checkout.session.completed: skip session=%s — mode=%r (expected subscription)",
            session_id,
            mode,
        )
        return

    if not session_id:
        logger.error("checkout.session.completed: missing session id")
        return

    existing = (
        db.query(TeacherPayment)
        .filter(TeacherPayment.provider_ref == session_id)
        .first()
    )
    if existing is not None:
        logger.info(
            "checkout.session.completed: already processed session=%s payment_id=%s",
            session_id,
            existing.id,
        )
        return

    plan_raw = meta.get("teacher_plan")
    ref = client_ref or meta.get("user_id")
    if not ref or not plan_raw:
        logger.error(
            "checkout.session.completed: missing client_reference_id/user_id or teacher_plan "
            "(session=%s ref=%r plan=%r)",
            session_id,
            ref,
            plan_raw,
        )
        return

    try:
        user_id = int(ref)
    except (TypeError, ValueError):
        logger.error("checkout.session.completed: invalid user id %r (session=%s)", ref, session_id)
        return

    target_plan = canonicalize_teacher_plan_name(plan_raw)
    if target_plan not in ("standard", "pro"):
        logger.error(
            "checkout.session.completed: unsupported plan %r (session=%s user=%s)",
            plan_raw,
            session_id,
            user_id,
        )
        return

    stripe.api_key = settings.STRIPE_SECRET_KEY
    period_end: Optional[datetime] = None
    sub_id = _session_field(session, "subscription")
    if isinstance(sub_id, dict):
        sub_id = sub_id.get("id")
    if sub_id and target_plan == "standard":
        try:
            sub = stripe.Subscription.retrieve(sub_id)
            period_ts = _session_field(sub, "current_period_end")
            period_end = datetime.fromtimestamp(int(period_ts), tz=timezone.utc)
            logger.info(
                "checkout.session.completed: stripe sub=%s period_end=%s",
                sub_id,
                period_end.isoformat(),
            )
        except Exception as exc:
            # Missing period end falls back to default_teacher_plan_ends_at inside apply().
            logger.warning(
                "checkout.session.completed: could not read Stripe subscription %s period end: %s",
                sub_id,
                exc,
            )

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
        raise StripeWebhookApplyError(
            f"checkout.session.completed: plan apply failed user={user_id} "
            f"plan={target_plan} session={session_id}"
        )

    total = _session_field(session, "amount_total") or 0
    amount = float(total) / 100.0
    currency = (_session_field(session, "currency") or "usd").upper()

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
        "checkout.session.completed: SUCCESS user=%s plan=%s session=%s amount=%s %s",
        user_id,
        target_plan,
        session_id,
        amount,
        currency,
    )


def _handle_subscription_updated(db: Session, subscription: Any) -> None:
    # Keeps Standard billing window in sync on renewals and plan changes (Pro stays open-ended).
    _apply_plan_from_subscription_metadata(
        db,
        subscription,
        event_label="customer.subscription.updated",
    )


def _handle_subscription_created(db: Session, subscription: Any) -> None:
    # Backup activation when checkout.session.completed was skipped or failed earlier.
    _apply_plan_from_subscription_metadata(
        db,
        subscription,
        event_label="customer.subscription.created",
    )


def _handle_subscription_deleted(db: Session, subscription: Any) -> None:
    # Downgrades the teacher to Free when the Stripe subscription ends (cancel at period end).
    meta = _metadata_dict(_session_field(subscription, "metadata"))
    ref = meta.get("user_id")
    sub_id = _session_field(subscription, "id")
    if not ref:
        logger.warning(
            "customer.subscription.deleted: missing user_id in metadata sub=%s meta=%s",
            sub_id,
            meta,
        )
        return
    try:
        user_id = int(ref)
    except (TypeError, ValueError):
        logger.error("customer.subscription.deleted: invalid user_id %r sub=%s", ref, sub_id)
        return

    user = apply_teacher_plan_subscription_from_gateway(
        db,
        user_id,
        "free",
        None,
        commit=True,
    )
    if user:
        logger.info("customer.subscription.deleted: user=%s downgraded to free sub=%s", user_id, sub_id)
    else:
        logger.error(
            "customer.subscription.deleted: downgrade failed user=%s sub=%s",
            user_id,
            sub_id,
        )


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
    event_id = event.get("id")
    data_object = event["data"]["object"]
    logger.info("Stripe webhook received event_id=%s type=%s", event_id, event_type)

    try:
        if event_type == "checkout.session.completed":
            _handle_checkout_session_completed(db, data_object)
        elif event_type == "customer.subscription.created":
            _handle_subscription_created(db, data_object)
        elif event_type == "customer.subscription.updated":
            _handle_subscription_updated(db, data_object)
        elif event_type == "customer.subscription.deleted":
            _handle_subscription_deleted(db, data_object)
        else:
            logger.debug("Stripe webhook ignored event type=%s id=%s", event_type, event_id)
    except StripeWebhookApplyError as exc:
        # Return 500 so Stripe retries after catalog/user fixes are deployed.
        db.rollback()
        logger.error("Stripe webhook plan apply failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        # Return 500 so Stripe retries failed deliveries.
        db.rollback()
        logger.exception("Stripe webhook handler failed for type=%s id=%s", event_type, event_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Webhook handler error.",
        ) from exc

    logger.info("Stripe webhook handled OK event_id=%s type=%s", event_id, event_type)
    return {"received": True}
