from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from .config import get_settings


class Base(DeclarativeBase):
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Email(Base):
    __tablename__ = "emails"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_email: Mapped[str] = mapped_column(String(255), index=True)
    recipient: Mapped[str] = mapped_column(String(255))
    subject: Mapped[str] = mapped_column(String(512), default="")
    thread_id: Mapped[Optional[str]] = mapped_column(String(255), default=None)
    gmail_message_id: Mapped[Optional[str]] = mapped_column(String(255), default=None)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    opened_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=None
    )
    open_count: Mapped[int] = mapped_column(Integer, default=0)


class OpenEvent(Base):
    __tablename__ = "open_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email_id: Mapped[int] = mapped_column(ForeignKey("emails.id"), index=True)
    ip: Mapped[Optional[str]] = mapped_column(String(64), default=None)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, default=None)
    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )


class ClickEvent(Base):
    __tablename__ = "click_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email_id: Mapped[int] = mapped_column(ForeignKey("emails.id"), index=True)
    url: Mapped[Optional[str]] = mapped_column(Text, default=None)
    clicked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
