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
| Audit | Created, viewed, edited, approved, exported, deleted and purged events are logged. Views are logged once per five minutes per note, and never while a note is still processing |
| Network | No outbound internet call is made by this code |

## Clinical safety checks

A small local model sometimes drops facts when it summarises. In the first
end-to-end run it left out a patient's penicillin allergy, so allergies do not
rely on the model alone:

- Allergies and current medications are separate, prominent fields.
- Every transcript segment that mentions an allergy is guaranteed to reach the
  allergy list. If the model left it out, it is added word-for-word (a question
  is kept together with the patient's answer) and the note is flagged.
- A flagged note cannot be approved until the clinician acknowledges the flag.
- Allergy and medication lists are editable; a clinician's correction replaces
  the draft's entries.

This is a backstop for allergies only. The other sections and the medication
list still depend on the model and must be read against the transcript.

**Limits:** redaction is pattern-based and does **not** detect names or
addresses. Treat all stored data as identifiable health information. The
database is not encrypted at rest; use full-disk encryption. There is no user
login yet, only a shared API key.

## Known gaps

- No speaker diarization yet (doctor vs patient are not separated).
- Per-segment timestamps depend on the ASR engine selected in VoiceStudio.
- Long consultations may exceed the LLM context (`OLLAMA_NUM_CTX`); chunking is not implemented.
- Source citations are helpful but not exhaustive: a section may omit a segment it drew from.
- Medications are not backed by a deterministic check the way allergies are.
- Only two end-to-end runs so far, both on synthetic audio (built-in Windows
  voices), so they validate the pipeline rather than real-world accuracy.

## Measured so far

Runs on a CPU-only laptop (Intel Iris Xe, 16 GB RAM, no GPU) with
`faster-whisper-small` via VoiceStudio 0.5.6 and `llama3` 8B via Ollama.
Audio is synthetic speech from the built-in Windows voices.

| Run | Audio | Transcription | Note | Total |
|---|---|---|---|---|
| 1. One speaker, short visit | 46 s | about 25 s | about 70 s | 101 s |
| 2. Two voices, medication and allergy | 84 s | not timed separately | not timed separately | 141 s |

Run 2 had an answer key. Every stated fact reached the note with a citation:
symptoms and duration, the regular medication and dose, the allergy and its
reaction, vitals, assessment, prescription and follow-up rule. The spoken phone
number was masked and the audio file was deleted after transcription.

Accuracy on clean synthetic speech says little about accented, noisy or
overlapping speech. `large-v3` (VoiceStudio's default) is too heavy for this
class of machine; select a small model in VoiceStudio. Real recordings are
still to be measured.

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
