import json

import pytest

from app.services.redact import redact
from app.services.safety import MISSING_FLAG, ensure_allergies
from app.services.summarize import parse_note
from app.services.transcribe import normalise

# Real transcript from the end-to-end run in which the model dropped the allergy.
CONSULT = [
    {"text": "Good morning."},
    {"text": "I have had a fever and a sore throat for three days."},
    {"text": "Are you allergic to any medicines?"},
    {"text": "Yes, I am allergic to penicillin."},
    {"text": "I will prescribe paracetamol 500 mg three times a day."},
]


def _empty_note():
    return parse_note("{}", len(CONSULT))


def test_dropped_allergy_is_added_verbatim_and_flagged():
    note = ensure_allergies(_empty_note(), CONSULT)
    # One entry: the clinician's question joined with the patient's answer.
    assert len(note["allergies"]) == 1
    entry = note["allergies"][0]
    assert "allergic to penicillin" in entry["text"] and entry["verbatim"]
    assert entry["sources"] == [2, 3]
    assert MISSING_FLAG in note["flags"]


def test_answer_without_the_word_allergy_is_still_captured():
    segs = [{"text": "Are you allergic to anything?"}, {"text": "Penicillin."}]
    note = ensure_allergies(parse_note("{}", 2), segs)
    assert "Penicillin." in note["allergies"][0]["text"]


def test_cited_allergy_is_not_duplicated_or_flagged():
    note = _empty_note()
    note["allergies"] = [{"text": "Penicillin", "sources": [3]}]
    ensure_allergies(note, CONSULT)
    assert len(note["allergies"]) == 1 and note["flags"] == []


def test_uncited_allergy_gets_its_citation_without_a_flag():
    note = _empty_note()
    note["allergies"] = [{"text": "Allergic to penicillin", "sources": []}]
    ensure_allergies(note, CONSULT)
    assert 3 in note["allergies"][0]["sources"]
    assert len(note["allergies"]) == 1 and note["flags"] == []


def test_no_allergy_mention_adds_nothing():
    note = ensure_allergies(_empty_note(), [{"text": "Fever for two days."}])
    assert note["allergies"] == [] and note["flags"] == []


def test_negative_allergy_statement_is_kept():
    segs = [{"text": "No known drug allergies."}]
    note = ensure_allergies(parse_note("{}", 1), segs)
    assert note["allergies"][0]["text"] == "No known drug allergies."


def test_uncited_none_mentioned_filler_is_dropped_but_cited_statement_kept():
    reply = json.dumps({
        "medications": [{"text": "Currently taking/has taken none mentioned", "sources": []}],
        "allergies": [{"text": "No known drug allergies", "sources": [1]}],
    })
    note = parse_note(reply, len(CONSULT))
    assert note["medications"] == []
    assert note["allergies"][0]["text"] == "No known drug allergies"


def test_parse_note_reads_allergies_and_medications():
    reply = json.dumps({
        "allergies": [{"text": "Penicillin", "sources": [3, 99]}],
        "medications": ["Metformin 500 mg"],
    })
    note = parse_note(reply, len(CONSULT))
    assert note["allergies"] == [{"text": "Penicillin", "sources": [3]}]
    assert note["medications"][0]["text"] == "Metformin 500 mg"
    assert note["flags"] == []


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
