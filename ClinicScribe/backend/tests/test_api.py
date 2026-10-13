from uuid import uuid4

from fastapi.testclient import TestClient

from app import pipeline
from app.db import Base, SessionLocal, engine
from app.main import app
from app.models import Consultation
from app.services.summarize import parse_note

# Tables are normally created by the app's lifespan; helpers below insert rows first.
Base.metadata.create_all(engine)


def _ready_consultation(flags=None) -> str:
    """Insert a finished consultation directly, bypassing the pipeline."""
    note = parse_note("{}", 0)
    note["allergies"] = [{"text": "Penicillin", "sources": []}]
    note["flags"] = flags or []
    cid = uuid4().hex
    with SessionLocal() as db:
        db.add(Consultation(id=cid, patient_ref="MRN-9", consent_confirmed=True,
                            status="ready", segments=[], note=note))
        db.commit()
    return cid


def _actions(client, cid):
    return [a["action"] for a in client.get("/api/audit").json()
            if a["consultation_id"] == cid]


def test_polling_a_processing_note_is_not_audited():
    cid = uuid4().hex
    with SessionLocal() as db:
        db.add(Consultation(id=cid, patient_ref="MRN-8", consent_confirmed=True,
                            status="processing", segments=[]))
        db.commit()
    with TestClient(app) as client:
        for _ in range(10):
            assert client.get(f"/api/consultations/{cid}").status_code == 200
        assert "viewed" not in _actions(client, cid)


def test_repeated_views_of_a_finished_note_log_once():
    cid = _ready_consultation()
    with TestClient(app) as client:
        for _ in range(5):
            client.get(f"/api/consultations/{cid}")
        assert _actions(client, cid).count("viewed") == 1


def test_flagged_note_needs_acknowledgement_to_approve():
    cid = _ready_consultation(flags=["An allergy was added word-for-word."])
    with TestClient(app) as client:
        assert client.post(f"/api/consultations/{cid}/approve").status_code == 409
        ok = client.post(f"/api/consultations/{cid}/approve?acknowledged=true")
        assert ok.status_code == 200 and ok.json()["status"] == "approved"


def test_unflagged_note_approves_without_acknowledgement():
    cid = _ready_consultation()
    with TestClient(app) as client:
        assert client.post(f"/api/consultations/{cid}/approve").status_code == 200


def test_clinician_can_correct_allergy_list_and_export_shows_it():
    cid = _ready_consultation()
    with TestClient(app) as client:
        r = client.patch(f"/api/consultations/{cid}/note",
                         json={"allergies": ["Penicillin (rash)", "  ", "Sulfa drugs"]})
        assert r.status_code == 200
        assert [a["text"] for a in r.json()["note"]["allergies"]] == [
            "Penicillin (rash)", "Sulfa drugs"]
        md = client.get(f"/api/consultations/{cid}/export.md").text
        assert "## Allergies" in md and "- Sulfa drugs" in md


def _upload(client, **overrides):
    form = {"patient_ref": "MRN-1001", "consent": "true"}
    form.update(overrides)
    return client.post(
        "/api/consultations",
        data=form,
        files={"audio": ("visit.wav", b"RIFF....", "audio/wav")},
    )


def test_rejects_without_consent(monkeypatch):
    async def noop(_):
        pass

    monkeypatch.setattr(pipeline, "process", noop)
    with TestClient(app) as client:
        assert _upload(client, consent="false").status_code == 400


def test_rejects_unsupported_file_type():
    with TestClient(app) as client:
        r = client.post(
            "/api/consultations",
            data={"patient_ref": "MRN-1", "consent": "true"},
            files={"audio": ("notes.exe", b"x", "application/octet-stream")},
        )
        assert r.status_code == 415


def test_create_list_audit_and_delete(monkeypatch):
    async def noop(_):
        pass

    monkeypatch.setattr(pipeline, "process", noop)
    with TestClient(app) as client:
        created = _upload(client)
        assert created.status_code == 202
        cid = created.json()["id"]

        assert any(c["id"] == cid for c in client.get("/api/consultations").json())
        assert client.get(f"/api/consultations/{cid}").json()["status"] == "processing"
        assert client.post(f"/api/consultations/{cid}/approve").status_code == 409

        assert client.delete(f"/api/consultations/{cid}").status_code == 204
        assert client.get(f"/api/consultations/{cid}").status_code == 404

        actions = [a["action"] for a in client.get("/api/audit").json() if a["consultation_id"] == cid]
        assert {"created", "deleted"} <= set(actions)
