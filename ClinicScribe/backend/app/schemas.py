from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class Segment(BaseModel):
    start: float | None = None
    end: float | None = None
    text: str
    # "Speaker 1", "Speaker 2", ... by first appearance; None when not diarized.
    speaker: str | None = None


class ConsultationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    patient_ref: str
    language: str
    template: str
    status: str
    error: str | None
    segments: list[Segment]
    note: dict | None
    redactions: int
    approved_at: datetime | None


class ConsultationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    patient_ref: str
    status: str


class NoteUpdate(BaseModel):
    # Clinician edits: section name -> replacement text. Sources are kept.
    sections: dict[str, str] = Field(default_factory=dict)
    # Full replacement lists, one string per entry. None leaves the list untouched.
    allergies: list[str] | None = None
    medications: list[str] | None = None


class AuditOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    at: datetime
    action: str
    consultation_id: str
    detail: str
