from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Consultation(Base):
    __tablename__ = "consultations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # A pseudonymous reference (MRN / visit number), never the patient's name.
    patient_ref: Mapped[str] = mapped_column(String(64))
    language: Mapped[str] = mapped_column(String(16), default="")
    template: Mapped[str] = mapped_column(String(16), default="soap")
    # processing | ready | approved | failed
    status: Mapped[str] = mapped_column(String(16), default="processing")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    consent_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    audio_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    segments: Mapped[list] = mapped_column(JSON, default=list)
    note: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    redactions: Mapped[int] = mapped_column(Integer, default=0)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AuditEvent(Base):
    """Append-only trail of who did what to which consultation."""

    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    action: Mapped[str] = mapped_column(String(32))
    consultation_id: Mapped[str] = mapped_column(String(32), index=True)
    detail: Mapped[str] = mapped_column(Text, default="")
