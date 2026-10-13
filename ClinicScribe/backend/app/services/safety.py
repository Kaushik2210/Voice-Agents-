"""Deterministic safety net for facts a note must never lose.

A small local LLM will sometimes drop an allergy while summarising. These
checks do not rely on the model: any transcript segment that mentions an
allergy is guaranteed to appear in the note's allergy list, verbatim if the
model left it out, and the note is flagged so the clinician sees it was added.
"""

import re

ALLERGY_RE = re.compile(r"\ballerg\w*|\banaphyla\w*|\badverse (?:drug )?reaction", re.IGNORECASE)

# Words that appear in nearly every allergy sentence and say nothing about *what*.
_FILLER = {
    "allergic", "allergy", "allergies", "have", "with", "medicine", "medicines",
    "medication", "medications", "drug", "drugs", "known", "anything", "that",
    "this", "any", "are", "you", "and", "the", "yes", "your", "from", "reaction",
}

MISSING_FLAG = (
    "An allergy was mentioned in the recording but was missing from the draft. "
    "It was added word-for-word; please verify it."
)


def _words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z]{4,}", text.lower()) if w not in _FILLER}


def ensure_allergies(note: dict, segments: list[dict]) -> dict:
    """Guarantee every allergy mention in `segments` is represented in `note`."""
    allergies = note.setdefault("allergies", [])
    flags = note.setdefault("flags", [])
    added = False

    for i, seg in enumerate(segments):
        if not ALLERGY_RE.search(seg["text"]):
            continue

        # A question ("Are you allergic to anything?") is only useful with its
        # answer, which may not repeat the word ("Penicillin."), so keep both.
        unit = [i]
        if seg["text"].rstrip().endswith("?") and i + 1 < len(segments):
            unit.append(i + 1)

        covered = {j for entry in allergies for j in entry["sources"]}
        if covered & set(unit):
            continue

        # The model may have listed the allergy but forgotten the citation.
        unit_text = " ".join(segments[j]["text"] for j in unit)
        unit_words = _words(unit_text)
        match = next(
            (e for e in allergies if unit_words and unit_words & _words(e["text"])), None
        )
        if match is not None:
            match["sources"] = sorted({*match["sources"], *unit})
            continue

        allergies.append({"text": unit_text, "sources": unit, "verbatim": True})
        added = True

    if added and MISSING_FLAG not in flags:
        flags.append(MISSING_FLAG)
    return note
