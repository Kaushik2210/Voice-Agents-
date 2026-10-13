from fastapi.testclient import TestClient

from app import pipeline
from app.main import app


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
