# ClinicScribe

Private consultation notes for clinics. Record a visit, get a draft SOAP note
with every line linked back to what was said. Speech recognition and the
language model both run on the clinic's own machine, so audio never leaves it.

> **Status: early scaffold (v0.1).** Not a medical device, not validated in a
> clinical setting. Output is a draft that a clinician must review and approve.

**Live demo: https://clinicscribe-demo.vercel.app**

The demo is the real interface showing one note that the real pipeline produced
from a synthetic recording (a computer voice reading a script, so no patient
data). You can assign speakers, edit sections and approve the note; reloading
resets it. Uploads are turned off on purpose: processing needs a local speech
model and a local language model, and recordings are meant never to leave the
clinic's machine, so the pipeline is not hosted. See [Hosting the demo](#hosting-the-demo).

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
3. Optionally, each segment is labelled with its speaker.
4. Structured identifiers are masked.
5. A local LLM drafts Subjective / Objective / Assessment / Plan plus action
   items. Each section lists the transcript segments it came from.
6. The clinician assigns speaker roles, edits, approves and exports.

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

### Hosting the demo

Only the web interface is hosted, built in demo mode so it needs no backend:

```bash
cd frontend
npm run build:demo     # same as: vite build --mode demo  (sets VITE_DEMO=true)
npx vercel --prod      # root directory: ClinicScribe/frontend
```

In demo mode the interface reads one fixture (`src/demoData.js`) through
`src/demo.js` instead of calling the API. State is held in memory only and
nothing is sent anywhere. `vercel.json` also sets `nosniff`, no-referrer and
frame-deny headers. Do not host the backend publicly with real recordings.

### Speaker labels (optional)

The transcript can label who is speaking ("Speaker 1", "Speaker 2"). It runs
on the CPU with [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) and two
small, ungated models. Without them everything still works; the transcript is
simply unlabelled and the audit log says why.

1. Install ffmpeg and put it on `PATH` (or set `FFMPEG_PATH`).
2. `pip install -r backend/requirements-diarization.txt`
3. Download these two files from the sherpa-onnx releases into `models/`
   (about 32 MB in total) and unpack the first:
   - `sherpa-onnx-pyannote-segmentation-3-0.tar.bz2`, from release `speaker-segmentation-models`
   - `wespeaker_en_voxceleb_resnet34.onnx`, from release `speaker-recongition-models`

Speakers are numbered by first appearance. The clinician says who is who with
the Clinician / Patient control above the transcript. `NUM_SPEAKERS` defaults
to 2; set it to 0 to detect the number, which is less reliable on short clips.
The embedding model is trained on English speakers.

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

### Numbers and conditionals

Two more deterministic checks run on every drafted note and add flags (which
must be acknowledged before approval). They never edit the note.

- **Quantities.** Every dose, duration and vital in the note must also appear in
  the transcript. Spoken numbers are normalised ("six fifty milligrams" is
  650 mg, "twice a day" is 2 times). A dose is tied to its drug, so a dose
  borrowed from another medicine is caught: paracetamol 500 mg is flagged when
  500 mg was only said for metformin.
- **Conditionals.** When the note says "X if C", the transcript's own
  "if C, A. Otherwise B" is used to check that X belongs to C and not to the
  other branch. A flipped comparator is handled: "if less than three days" is
  correct when the doctor said "more than three days ... otherwise X".

This is a safety net, not a proof. It only checks what it can parse: an
outcome reworded without an "if", a condition without a comma in the
transcript, or a drug named differently in the note and the recording passes
unchecked.

Everything else in the note still depends on the model and must be read against
the transcript.

**Limits:** redaction is pattern-based and does **not** detect names or
addresses. Treat all stored data as identifiable health information. The
database is not encrypted at rest; use full-disk encryption. There is no user
login yet, only a shared API key.

## Known gaps

- Speaker labels are acoustic and numbered, not named: the clinician assigns
  Clinician and Patient. Overlapping speech, more than two voices and non-English
  voices have not been measured. Verified on one synthetic two-voice clip only.
- Note content differs between runs of the same audio, and the model got a
  follow-up rule backwards on a clip it had right before. Doses, numbers and
  "if / otherwise" rules are now checked against the transcript (see above),
  but wording the checks cannot parse still needs the clinician's eyes.
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
| 3. Same audio as run 2, with speaker labels | 84 s | not timed separately | not timed separately | 250 s |

Runs 2 and 3 used the same audio and had an answer key.

- **Run 2:** every stated fact reached the note with a citation: symptoms and
  duration, the regular medication and dose, the allergy and its reaction,
  vitals, assessment, prescription and follow-up rule. The spoken phone number
  was masked and the audio file was deleted after transcription.
- **Run 3:** speaker labels were correct on 12 of 12 segments, and the
  allergy, medication, vitals and prescription were again right. The model
  **inverted the follow-up rule**, writing that follow-up is in one week "if
  the fever lasts more than three days", when the doctor said more than three
  days means come back for a blood test. The note content varies between runs
  of identical audio, so every note needs a clinician's read against the
  transcript.
- **Diarization cost:** 30 to 49 s for 84 s of audio on this CPU, measured on
  its own. The 250 s total includes noisy timing from other load on the
  machine and should not be read as the cost of diarization.

The two voices were very different (one male, one female), which is the easy
case for speaker separation.

**Checking the follow-up rule (same transcript, real model, 6 runs).** With the
original prompt the model wrote the rule backwards in 3 of 3 runs, and the
conditional check flagged all 3. After adding an explicit rule to keep
if / otherwise branches (and every number) exact, it got the rule right in 2 of
3 runs, in two different wordings, and the check flagged the one that was wrong.
No run raised a false alarm. That is six runs of one transcript, so read it as
"the check works on the failure we saw", not as a measured error rate.

Accuracy on clean synthetic speech says little about accented, noisy or
overlapping speech. `large-v3` (VoiceStudio's default) is too heavy for this
class of machine; select a small model in VoiceStudio. Real recordings are
still to be measured.

## Roadmap

- [x] Speaker diarization (sherpa-onnx, CPU) with clinician-assigned roles
- [ ] Measure diarization on real, overlapping and Hinglish speech
- [x] Check conditionals and numbers in the note against the transcript automatically
- [ ] Measure the checks on many more real notes (false alarms and misses), not six runs of one clip
- [ ] Benchmarks: word error rate on labelled accented / noisy audio, processing time on CPU vs GPU
- [ ] Per-user login with roles, encrypted storage
- [ ] Note templates per specialty, Hinglish and regional-language evaluation
- [ ] Browser microphone recording and live transcription over VoiceStudio's WebSocket

## Licence

VoiceStudio is AGPL-3.0 and is used here as an unmodified separate service.
Check the licence of every speech and language model you deploy.
Recording consultations requires patient consent under the rules that apply
where you practise.
