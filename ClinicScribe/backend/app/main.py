import asyncio
import hmac
import logging
from contextlib import asynccontextmanager
from datetime import timedelta, timezone
from pathlib import Path
from uuid import uuid4

import httpx
from fastapi import (BackgroundTasks, Depends, FastAPI, File, Form, Header,
                     HTTPException, UploadFile)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import pipeline
from .config import settings
from .db import Base, SessionLocal, engine, get_db
from .models import AuditEvent, Consultation, utcnow
from .schemas import AuditOut, ConsultationOut, ConsultationSummary, NoteUpdate
from .services.retention import delete_audio, purge_expired
from .services.summarize import SECTIONS

log = logging.getLogger("clinicscribe")

ALLOWED_EXT = {".wav", ".mp3", ".m4a", ".ogg", ".webm", ".flac"}


async def _retention_loop() -> None:
    while True:
        try:
            with SessionLocal() as db:
                purged = purge_expired(db)
            if purged:
                log.info("retention purged %d consultations", purged)
        except Exception:
            log.exception("retention sweep failed")
        await asyncio.sleep(3600)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    task = asyncio.create_task(_retention_loop())
    yield
    task.cancel()


app = FastAPI(title="ClinicScribe", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)


def require_key(x_api_key: str = Header(default="")) -> None:
    if settings.api_key and not hmac.compare_digest(x_api_key, settings.api_key):
        raise HTTPException(401, "Missing or invalid API key")


def _audit(db: Session, action: str, consultation_id: str, detail: str = "") -> None:
    db.add(AuditEvent(action=action, consultation_id=consultation_id, detail=detail))


VIEW_DEDUPE = timedelta(minutes=5)


def _audit_view(db: Session, c: Consultation) -> None:
    """Record that a note was opened, without letting status polling flood the log.

    Nothing is logged while the note is still processing, and a view directly
    after another view of the same note within VIEW_DEDUPE is not repeated.
    """
    if c.status == "processing":
        return
    last = db.scalars(
        select(AuditEvent)
        .where(AuditEvent.consultation_id == c.id)
        .order_by(AuditEvent.id.desc())
        .limit(1)
    ).first()
    if last is not None and last.action == "viewed":
        at = last.at if last.at.tzinfo else last.at.replace(tzinfo=timezone.utc)
        if utcnow() - at < VIEW_DEDUPE:
            return
    _audit(db, "viewed", c.id)


def _get(db: Session, consultation_id: str) -> Consultation:
    c = db.get(Consultation, consultation_id)
    if c is None:
        raise HTTPException(404, "Consultation not found")
    return c


@app.get("/health")
async def health() -> dict:
    async def reachable(url: str) -> bool:
        try:
            async with httpx.AsyncClient(timeout=3) as client:
                await client.get(url)
            return True
        except httpx.HTTPError:
            return False

    return {
        "api": True,
        "voicestudio": await reachable(settings.voicestudio_url),
        "ollama": await reachable(settings.ollama_url),
    }


@app.post("/api/consultations", status_code=202, response_model=ConsultationOut,
          dependencies=[Depends(require_key)])
async def create_consultation(
    background: BackgroundTasks,
    audio: UploadFile = File(...),
    patient_ref: str = Form(..., max_length=64),
    consent: bool = Form(...),
    language: str = Form("", max_length=16),
    db: Session = Depends(get_db),
):
    if not consent:
        raise HTTPException(400, "Patient consent must be confirmed before processing.")
    if not patient_ref.strip():
        raise HTTPException(400, "patient_ref is required (use an MRN, not a name).")
    ext = Path(audio.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(415, f"Unsupported audio type. Allowed: {sorted(ALLOWED_EXT)}")

    cid = uuid4().hex
    dest = settings.audio_dir / f"{cid}{ext}"
    limit = settings.max_upload_mb * 1024 * 1024
    size, too_big = 0, False
    with dest.open("wb") as out:
        while chunk := await audio.read(1024 * 1024):
            size += len(chunk)
            if size > limit:
                too_big = True
                break
            out.write(chunk)
    if too_big:
        dest.unlink(missing_ok=True)
        raise HTTPException(413, f"Recording exceeds {settings.max_upload_mb} MB.")

    c = Consultation(id=cid, patient_ref=patient_ref.strip(), language=language,
                     consent_confirmed=True, audio_path=str(dest), segments=[])
    db.add(c)
    _audit(db, "created", cid, f"{size} bytes")
    db.commit()
    background.add_task(pipeline.process, cid)
    return c


@app.get("/api/consultations", response_model=list[ConsultationSummary],
         dependencies=[Depends(require_key)])
def list_consultations(db: Session = Depends(get_db)):
    return db.scalars(select(Consultation).order_by(Consultation.created_at.desc())).all()


@app.get("/api/consultations/{cid}", response_model=ConsultationOut,
         dependencies=[Depends(require_key)])
def get_consultation(cid: str, db: Session = Depends(get_db)):
    c = _get(db, cid)
    _audit_view(db, c)
    db.commit()
    return c


@app.patch("/api/consultations/{cid}/note", response_model=ConsultationOut,
           dependencies=[Depends(require_key)])
def edit_note(cid: str, body: NoteUpdate, db: Session = Depends(get_db)):
    c = _get(db, cid)
    if c.note is None or c.status == "approved":
        raise HTTPException(409, "This note cannot be edited.")
    unknown = set(body.sections) - set(SECTIONS)
    if unknown:
        raise HTTPException(422, f"Unknown sections: {sorted(unknown)}")
    note = dict(c.note)
    sections = {k: dict(v) for k, v in note["sections"].items()}
    for name, text in body.sections.items():
        sections[name]["text"] = text
    note["sections"] = sections
    edited = sorted(body.sections)
    # Clinician-corrected lists replace the draft's entries (citations are dropped).
    for key in ("allergies", "medications"):
        values = getattr(body, key)
        if values is not None:
            note[key] = [{"text": v.strip(), "sources": [], "edited": True}
                         for v in values if v.strip()]
            edited.append(key)
    c.note = note  # reassign so SQLAlchemy sees the JSON change
    _audit(db, "edited", cid, ",".join(edited))
    db.commit()
    return c


@app.post("/api/consultations/{cid}/approve", response_model=ConsultationOut,
          dependencies=[Depends(require_key)])
def approve(cid: str, acknowledged: bool = False, db: Session = Depends(get_db)):
    c = _get(db, cid)
    if c.status != "ready":
        raise HTTPException(409, "Only a ready note can be approved.")
    flags = (c.note or {}).get("flags") or []
    if flags and not acknowledged:
        raise HTTPException(409, "This note has safety flags that must be acknowledged.")
    c.status, c.approved_at = "approved", utcnow()
    _audit(db, "approved", cid, f"acknowledged {len(flags)} flag(s)" if flags else "")
    db.commit()
    return c


@app.get("/api/consultations/{cid}/export.md", response_class=PlainTextResponse,
         dependencies=[Depends(require_key)])
def export_markdown(cid: str, db: Session = Depends(get_db)):
    c = _get(db, cid)
    if c.note is None:
        raise HTTPException(409, "Note is not ready.")
    lines = [f"# Consultation note: {c.patient_ref}", "",
             f"Date: {c.created_at:%Y-%m-%d %H:%M} UTC",
             f"Status: {c.status}" + (" (clinician approved)" if c.approved_at else " (DRAFT)"), ""]
    for flag in c.note.get("flags") or []:
        lines += [f"> **Safety flag:** {flag}", ""]
    allergies = c.note.get("allergies") or []
    lines += ["## Allergies"] + ([f"- {a['text']}" for a in allergies] or ["None stated"]) + [""]
    medications = c.note.get("medications") or []
    lines += ["## Current medications"] + ([f"- {m['text']}" for m in medications] or ["None stated"]) + [""]
    for name in SECTIONS:
        lines += [f"## {name.capitalize()}", c.note["sections"][name]["text"], ""]
    if c.note.get("action_items"):
        lines += ["## Action items"] + [f"- {i['text']}" for i in c.note["action_items"]] + [""]
    lines.append(f"> {c.note.get('disclaimer', '')}")
    _audit(db, "exported", cid)
    db.commit()
    return "\n".join(lines)


@app.delete("/api/consultations/{cid}", status_code=204, dependencies=[Depends(require_key)])
def delete_consultation(cid: str, db: Session = Depends(get_db)):
    c = _get(db, cid)
    delete_audio(c.audio_path)
    _audit(db, "deleted", cid)
    db.delete(c)
    db.commit()


@app.get("/api/audit", response_model=list[AuditOut], dependencies=[Depends(require_key)])
def audit_log(limit: int = 200, db: Session = Depends(get_db)):
    q = select(AuditEvent).order_by(AuditEvent.id.desc()).limit(min(limit, 1000))
    return db.scalars(q).all()
