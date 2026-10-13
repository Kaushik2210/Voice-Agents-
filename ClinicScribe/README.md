# ClinicScribe

Private consultation notes for clinics. Record a visit, get a draft SOAP note
with every line linked back to what was said. Speech recognition and the
language model both run on the clinic's own machine, so audio never leaves it.

> **Status: early scaffold (v0.1).** Not a medical device, not validated in a
> clinical setting. Output is a draft that a clinician must review and approve.

## How it works

```
React UI ──► FastAPI ──► VoiceStudio  (speech-to-text, localhost:3900)
                │
                ├──► redaction of phone numbers, emails, 12-digit IDs
                └──► Ollama         (SOAP draft with source citations, localhost:11434)
                         │
                      SQLite  (notes, transcript, audit log)
```

1. Upload a recording with a patient reference and a consent confirmation.
2. VoiceStudio's OpenAI-compatible endpoint transcribes it.
3. Structured identifiers are masked.
4. A local LLM drafts Subjective / Objective / Assessment / Plan plus action
   items. Each section lists the transcript segments it came from.
5. The clinician edits, approves and exports.

## Quick start (development)

Prerequisites: [VoiceStudio](https://github.com/debpalash/VoiceStudio) running
locally, [Ollama](https://ollama.com) with a model pulled
(`ollama pull llama3.1:8b`), Python 3.12+, Node 22+.

```bash
cp .env.example .env

# backend
cd backend
python -m venv .venv && .venv/Scripts/activate   # source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# frontend (second terminal)
cd frontend && npm install && npm run dev        # http://localhost:5173
```

Or with Docker (VoiceStudio and Ollama stay on the host): `docker compose up --build`,
then open http://localhost:8080.

Run the tests: `cd backend && python -m pytest`.

## Privacy model

| Concern | Behaviour |
|---|---|
| Audio | Deleted as soon as it is transcribed (`KEEP_AUDIO=false`) |
| Transcripts and notes | Stored in local SQLite, purged after `RETENTION_DAYS` (default 30) |
| Identifiers | Phone, email and 12-digit IDs are masked (`REDACT_IDENTIFIERS`) |
| Consent | Upload is refused unless consent is confirmed |
| Access | Optional `API_KEY`; API port bound to loopback in Docker |
| Audit | Created, viewed, edited, approved, exported, deleted and purged events are logged |
| Network | No outbound internet call is made by this code |

**Limits:** redaction is pattern-based and does **not** detect names or
addresses. Treat all stored data as identifiable health information. The
database is not encrypted at rest; use full-disk encryption. There is no user
login yet, only a shared API key.

## Known gaps

- No speaker diarization yet (doctor vs patient are not separated).
- Per-segment timestamps depend on the ASR engine selected in VoiceStudio.
- Long consultations may exceed the LLM context (`OLLAMA_NUM_CTX`); chunking is not implemented.
- The end-to-end pipeline has been unit-tested with stubs but not yet benchmarked on real recordings.

## Roadmap

- [ ] Diarization (pyannote or similar, local)
- [ ] Benchmarks: word error rate on labelled accented / noisy audio, processing time on CPU vs GPU
- [ ] Per-user login with roles, encrypted storage
- [ ] Note templates per specialty, Hinglish and regional-language evaluation
- [ ] Browser microphone recording and live transcription over VoiceStudio's WebSocket

## Licence

VoiceStudio is AGPL-3.0 and is used here as an unmodified separate service.
Check the licence of every speech and language model you deploy.
Recording consultations requires patient consent under the rules that apply
where you practise.
