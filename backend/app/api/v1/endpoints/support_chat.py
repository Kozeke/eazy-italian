"""
app/api/v1/endpoints/support_chat.py
======================================
Teacher ↔ Support chat with:
  • PostgreSQL persistence  (table: support_chat_messages)
  • Telegram forwarding     (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID env vars)
  • Real-time polling       (GET /admin/support/messages?after=<id>)

Environment variables required:
  TELEGRAM_BOT_TOKEN   – from @BotFather
  TELEGRAM_CHAT_ID     – numeric id of the @bayarea_k account
                         (start the bot once, then GET /getUpdates to find it)
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import Session, relationship

from app.core.auth import get_current_teacher, get_current_user
from app.core.database import get_db, Base
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()

# ─── Telegram config ──────────────────────────────────────────────────────────

TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID: str   = os.getenv("TELEGRAM_CHAT_ID", "")   # numeric id of @bayarea_k
TELEGRAM_API_BASE       = "https://api.telegram.org/bot"


async def _send_telegram(text: str) -> None:
    """Fire-and-forget Telegram message. Logs errors but never raises."""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        logger.warning("Telegram not configured – skipping notification")
        return
    url = f"{TELEGRAM_API_BASE}{TELEGRAM_BOT_TOKEN}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.post(url, json={
                "chat_id": TELEGRAM_CHAT_ID,
                "text": text,
                "parse_mode": "HTML",
            })
            if resp.status_code != 200:
                logger.error("Telegram send failed: %s %s", resp.status_code, resp.text)
    except Exception as exc:  # noqa: BLE001
        logger.error("Telegram send exception: %s", exc)


# ─── SQLAlchemy model ─────────────────────────────────────────────────────────

class SupportChatMessage(Base):
    """One row per message; sender_role = 'teacher' | 'support'."""
    __tablename__ = "support_chat_messages"

    id          = Column(Integer, primary_key=True, index=True)
    teacher_id  = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    sender_role = Column(String(16), nullable=False)          # 'teacher' | 'support'
    body        = Column(Text, nullable=False)
    is_read     = Column(Boolean, default=False, nullable=False)
    created_at  = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    teacher = relationship("User", foreign_keys=[teacher_id])


# ─── Pydantic schemas ─────────────────────────────────────────────────────────

class MessageOut(BaseModel):
    id:          int
    sender_role: str
    body:        str
    is_read:     bool
    created_at:  datetime

    class Config:
        from_attributes = True


class SendMessageIn(BaseModel):
    body: str


class ReplyIn(BaseModel):
    """Used by the admin/support agent to post a reply."""
    teacher_id: int
    body:       str
    secret:     str   # simple shared-secret guard (set via SUPPORT_REPLY_SECRET env var)


# ─── Helper ───────────────────────────────────────────────────────────────────

def _get_or_404(db: Session, teacher_id: int) -> User:
    user = db.query(User).filter(User.id == teacher_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Teacher not found")
    return user


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get(
    "/admin/support/messages",
    response_model=List[MessageOut],
    summary="Fetch chat history (optionally after a given message id)",
)
def get_messages(
    after: Optional[int] = Query(None, description="Return only messages with id > after"),
    limit: int           = Query(100, ge=1, le=200),
    current_user: User   = Depends(get_current_teacher),
    db: Session          = Depends(get_db),
):
    q = (
        db.query(SupportChatMessage)
        .filter(SupportChatMessage.teacher_id == current_user.id)
        .order_by(SupportChatMessage.id.asc())
    )
    if after is not None:
        q = q.filter(SupportChatMessage.id > after)
    rows = q.limit(limit).all()

    # Mark support replies as read
    unread_ids = [r.id for r in rows if r.sender_role == "support" and not r.is_read]
    if unread_ids:
        (
            db.query(SupportChatMessage)
            .filter(SupportChatMessage.id.in_(unread_ids))
            .update({"is_read": True}, synchronize_session=False)
        )
        db.commit()

    return rows


@router.post(
    "/admin/support/messages",
    response_model=MessageOut,
    status_code=status.HTTP_201_CREATED,
    summary="Teacher sends a support message",
)
async def send_message(
    payload:      SendMessageIn,
    current_user: User    = Depends(get_current_teacher),
    db:           Session = Depends(get_db),
):
    if not payload.body.strip():
        raise HTTPException(status_code=422, detail="Message body cannot be empty")

    msg = SupportChatMessage(
        teacher_id  = current_user.id,
        sender_role = "teacher",
        body        = payload.body.strip(),
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    # Build rich Telegram notification
    full_name = (
        f"{current_user.first_name or ''} {current_user.last_name or ''}".strip()
        or current_user.email
    )
    tg_text = (
        f"💬 <b>New support message</b>\n"
        f"👤 <b>From:</b> {full_name}\n"
        f"📧 <b>Email:</b> {current_user.email}\n"
        f"🆔 <b>Teacher ID:</b> {current_user.id}\n"
        f"🕐 <b>Time:</b> {msg.created_at.strftime('%Y-%m-%d %H:%M UTC')}\n\n"
        f"<b>Message:</b>\n{msg.body}"
    )
    await _send_telegram(tg_text)

    return msg


@router.post(
    "/admin/support/reply",
    response_model=MessageOut,
    status_code=status.HTTP_201_CREATED,
    summary="Support agent posts a reply to a teacher",
)
async def post_reply(
    payload: ReplyIn,
    db:      Session = Depends(get_db),
):
    expected_secret = os.getenv("SUPPORT_REPLY_SECRET", "")
    if not expected_secret or payload.secret != expected_secret:
        raise HTTPException(status_code=403, detail="Invalid secret")

    _get_or_404(db, payload.teacher_id)

    msg = SupportChatMessage(
        teacher_id  = payload.teacher_id,
        sender_role = "support",
        body        = payload.body.strip(),
        is_read     = False,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


@router.get(
    "/admin/support/unread-count",
    summary="Count unread support replies for the current teacher",
)
def unread_count(
    current_user: User   = Depends(get_current_teacher),
    db:           Session = Depends(get_db),
):
    n = (
        db.query(SupportChatMessage)
        .filter(
            SupportChatMessage.teacher_id  == current_user.id,
            SupportChatMessage.sender_role == "support",
            SupportChatMessage.is_read     == False,  # noqa: E712
        )
        .count()
    )
    return {"unread": n}