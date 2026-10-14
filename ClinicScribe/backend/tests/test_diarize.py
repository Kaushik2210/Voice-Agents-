import asyncio
from pathlib import Path
from uuid import uuid4

from app import pipeline
from app.config import settings
from app.db import Base, SessionLocal, engine
from app.models import Consultation
from app.services import diarize
from app.services.diarize import assign_speakers, label_speakers
from app.services.redact import redact_segments
from app.services.summarize import build_user_prompt

Base.metadata.create_all(engine)


def seg(start, end, text):
    return {"start": start, "end": end, "text": text}


def test_speakers_are_numbered_by_first_appearance_not_by_cluster_id():
    # Cluster 7 speaks first, so it becomes Speaker 1 regardless of its raw id.
    turns = [(0.0, 5.0, 7), (5.0, 10.0, 2)]
    out = assign_speakers([seg(0, 4, "How are you?"), seg(5, 9, "Fever.")], turns)
    assert [s["speaker"] for s in out] == ["Speaker 1", "Speaker 2"]


def test_segment_takes_the_speaker_with_the_most_overlap():
    turns = [(0.0, 4.0, 0), (4.0, 10.0, 1)]
    out = assign_speakers([seg(3.0, 9.0, "Mostly the second speaker.")], turns)
    assert out[0]["speaker"] == "Speaker 2"


def test_untimed_or_unmatched_segments_get_no_speaker():
    turns = [(0.0, 2.0, 0)]
    out = assign_speakers([seg(None, None, "No timing."), seg(50.0, 55.0, "Far away.")], turns)
    assert [s["speaker"] for s in out] == [None, None]


def test_assignment_does_not_mutate_input_and_keeps_other_fields():
    original = [seg(0, 1, "Hi")]
    out = assign_speakers(original, [(0.0, 1.0, 0)])
    assert "speaker" not in original[0]
    assert out[0]["text"] == "Hi" and out[0]["start"] == 0


def test_missing_models_skip_diarization_with_a_reason(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "speaker_models_dir", tmp_path)
    segments = [seg(0, 1, "Hi")]
    out, reason = asyncio.run(label_speakers(Path("x.wav"), segments))
    assert out == segments
    assert reason and "segmentation model not found" in reason


def test_disabled_flag_skips_cleanly(monkeypatch):
    monkeypatch.setattr(settings, "diarize", False)
    out, reason = asyncio.run(label_speakers(Path("x.wav"), [seg(0, 1, "Hi")]))
    assert reason == "disabled"


def test_prompt_shows_speakers_and_explains_roles_only_when_labelled():
    labelled = [{"text": "Any allergies?", "speaker": "Speaker 1"},
                {"text": "Penicillin.", "speaker": "Speaker 2"}]
    prompt = build_user_prompt(labelled)
    assert "[0] Speaker 1: Any allergies?" in prompt
    assert "The clinician is the speaker who asks" in prompt

    plain = build_user_prompt([{"text": "Any allergies?"}])
    assert "[0] Any allergies?" in plain and "Speakers are numbered" not in plain


def test_redaction_keeps_the_speaker_label():
    out, n = redact_segments([{"text": "Call 98765 43210", "speaker": "Speaker 2"}])
    assert n == 1 and out[0]["speaker"] == "Speaker 2"


def test_pipeline_stores_speaker_labels(monkeypatch, tmp_path):
    audio = tmp_path / "visit.wav"
    audio.write_bytes(b"RIFF")
    cid = uuid4().hex
    with SessionLocal() as db:
        db.add(Consultation(id=cid, patient_ref="MRN-D1", consent_confirmed=True,
                            audio_path=str(audio), segments=[]))
        db.commit()

    async def fake_transcribe(path, language=""):
        return [seg(0, 2, "Any allergies?"), seg(2, 4, "Penicillin.")]

    async def fake_label(path, segments):
        return assign_speakers(segments, [(0.0, 2.0, 0), (2.0, 4.0, 1)]), None

    async def fake_summarize(segments):
        assert segments[1]["speaker"] == "Speaker 2"
        return {"sections": {}, "allergies": [], "medications": [],
                "action_items": [], "flags": [], "disclaimer": ""}

    monkeypatch.setattr(pipeline, "transcribe", fake_transcribe)
    monkeypatch.setattr(pipeline, "label_speakers", fake_label)
    monkeypatch.setattr(pipeline, "summarize", fake_summarize)
    asyncio.run(pipeline.process(cid))

    with SessionLocal() as db:
        c = db.get(Consultation, cid)
        assert c.status == "ready"
        assert [s["speaker"] for s in c.segments] == ["Speaker 1", "Speaker 2"]
