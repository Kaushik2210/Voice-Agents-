import logging
from pathlib import Path

import httpx

from .config import settings
from .db import SessionLocal
from .models import AuditEvent, Consultation
from .services.redact import redact_segments
from .services.retention import delete_audio
from .services.summarize import summarize
from .services.transcribe import transcribe

log = logging.getLogger("clinicscribe.pipeline")


def _fail(db, consultation: Consultation, message: str) -> None:
    consultation.status = "failed"
    consultation.error = message
    db.add(AuditEvent(action="failed", consultation_id=consultation.id, detail=message))
    db.commit()


async def process(consultation_id: str) -> None:
    """Transcribe, redact, summarise. Runs as a background task."""
    with SessionLocal() as db:
        c = db.get(Consultation, consultation_id)
        if c is None or not c.audio_path:
            return
        audio = Path(c.audio_path)

        try:
            segments = await transcribe(audio, c.language)
            if not segments:
                return _fail(db, c, "No speech was detected in the recording.")

            redactions = 0
            if settings.redact_identifiers:
                segments, redactions = redact_segments(segments)
            c.segments, c.redactions = segments, redactions
            db.commit()

            c.note = await summarize(segments)
            c.status = "ready"
            db.add(AuditEvent(action="processed", consultation_id=c.id,
                              detail=f"{len(segments)} segments, {redactions} redactions"))
            db.commit()
        except httpx.ConnectError as exc:
            log.warning("service unreachable: %s", exc)
            _fail(db, c, "A local service (VoiceStudio or Ollama) is not reachable.")
        except Exception:
            log.exception("pipeline failed for %s", consultation_id)
            _fail(db, c, "Processing failed. Check the server log.")
        finally:
            if not settings.keep_audio:
                delete_audio(c.audio_path)
                c.audio_path = None
                db.commit()
