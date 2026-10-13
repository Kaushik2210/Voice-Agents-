import json

import pytest

from app.services.redact import redact
from app.services.summarize import parse_note
from app.services.transcribe import normalise


def test_redact_masks_structured_identifiers():
    text, n = redact("Call me on +91 98765 43210 or mail a.b@clinic.in, ID 1234 5678 9012.")
    assert "98765" not in text and "a.b@clinic.in" not in text and "1234 5678" not in text
    assert n == 3


def test_redact_leaves_clinical_numbers_alone():
    text, n = redact("Blood pressure 140 over 90, take 500 mg twice a day for 7 days.")
    assert n == 0 and text.startswith("Blood pressure 140")


def test_normalise_prefers_segments():
    body = {"text": "hi there", "segments": [{"start": 0, "end": 1.5, "text": " hi there "}]}
    assert normalise(body) == [{"start": 0, "end": 1.5, "text": "hi there"}]


def test_normalise_falls_back_to_plain_text():
    assert normalise({"text": "hello"}) == [{"start": None, "end": None, "text": "hello"}]
    assert normalise({"text": "  "}) == []


def test_parse_note_clamps_sources_and_strips_fences():
    reply = "```json\n" + json.dumps({
        "subjective": {"text": "Fever for 3 days", "sources": [0, 99, "x"]},
        "plan": "Paracetamol",
        "action_items": [{"text": "Review in 3 days", "sources": [1]}, {"text": ""}],
    }) + "\n```"
    note = parse_note(reply, n_segments=2)
    assert note["sections"]["subjective"]["sources"] == [0]
    assert note["sections"]["objective"]["text"] == "Not discussed"
    assert note["sections"]["plan"]["text"] == "Paracetamol"
    assert [i["text"] for i in note["action_items"]] == ["Review in 3 days"]
    assert "reviewed" in note["disclaimer"]


def test_prompt_example_has_no_placeholder_text():
    # Small models copy example text into the note, so the example must be empty.
    from app.services.summarize import SCHEMA_HINT, build_user_prompt

    for name, value in SCHEMA_HINT.items():
        entries = value if isinstance(value, list) else [value]
        assert all(e["text"] == "" and e["sources"] == [] for e in entries), name
    prompt = build_user_prompt([{"text": "hello"}])
    assert "[0] hello" in prompt and "subjective: what the patient reports" in prompt


def test_parse_note_rejects_non_object():
    with pytest.raises(ValueError):
        parse_note("[1, 2]", 1)
