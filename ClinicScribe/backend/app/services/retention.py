from datetime import timedelta
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import AuditEvent, Consultation, utcnow


def delete_audio(path: str | None) -> None:
    if path:
        Path(path).unlink(missing_ok=True)


def purge_expired(db: Session) -> int:
    """Delete consultations (and any leftover audio) past the retention window."""
    if settings.retention_days <= 0:
        return 0
    cutoff = utcnow() - timedelta(days=settings.retention_days)
    expired = db.scalars(select(Consultation).where(Consultation.created_at < cutoff)).all()
    for c in expired:
        delete_audio(c.audio_path)
        db.add(AuditEvent(action="purge", consultation_id=c.id, detail="retention"))
        db.delete(c)
    db.commit()
    return len(expired)
