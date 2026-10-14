"""Deterministic checks of a drafted note against the transcript it came from.

A small local model can rewrite a fact wrongly while sounding confident. Two
failures are caught here without asking the model again:

* quantities: every dose, duration, vital or other number in the note must
  also be present in the transcript (number words are normalised, so "six
  fifty" and "650" are the same);
* conditionals: when the note says "X if C", the transcript's own
  "if C, A. Otherwise B" is used to check that X really belongs to C and not
  to the other branch. An inverted follow-up rule is the case that motivated
  this.

These checks are conservative and only add flags. A flag makes the clinician
acknowledge the note before approval; it never edits the note. They do not
prove a note correct: a rewording they cannot parse passes unchecked.
"""

import re
from decimal import Decimal, InvalidOperation

# --- number words -----------------------------------------------------------

_ONES = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
    "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12,
    "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16,
    "seventeen": 17, "eighteen": 18, "nineteen": 19,
}
_TENS = {"twenty": 20, "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60,
         "seventy": 70, "eighty": 80, "ninety": 90}
_SCALE = {"hundred": 100, "thousand": 1000}

_NUM_WORD = "|".join(sorted([*_ONES, *_TENS, *_SCALE], key=len, reverse=True))
_RUN = re.compile(
    rf"\b(?:{_NUM_WORD})\b(?:[\s-]+(?:and[\s-]+)?(?:(?:{_NUM_WORD})|point)\b)*",
    re.IGNORECASE,
)


def _parse_ints(tokens: list[str]) -> str | None:
    if not tokens:
        return None
    # "nine eight seven six": a run of single digits is a digit string.
    if len(tokens) >= 2 and all(t in _ONES and _ONES[t] < 10 for t in tokens):
        return "".join(str(_ONES[t]) for t in tokens)
    total = current = 0
    prev = ""
    for t in tokens:
        if t in _ONES:
            v = _ONES[t]
            if prev == "unit" and v >= 10 and 0 < current < 10:
                current = current * 100 + v  # "one thirteen" style
            else:
                current += v
            prev = "unit" if v < 10 else "teen"
        elif t in _TENS:
            v = _TENS[t]
            if prev == "unit" and 0 < current < 10:
                current = current * 100 + v  # spoken "one thirty" = 130, "six fifty" = 650
            else:
                current += v
            prev = "tens"
        elif t in _SCALE:
            if _SCALE[t] == 100:
                current = (current or 1) * 100
            else:
                total += (current or 1) * _SCALE[t]
                current = 0
            prev = "scale"
        else:
            return None
    return str(total + current)


def _parse_run(run: str) -> str | None:
    tokens = [t for t in re.split(r"[\s-]+", run.lower()) if t and t != "and"]
    if "point" in tokens:
        i = tokens.index("point")
        whole, frac = _parse_ints(tokens[:i]), tokens[i + 1:]
        if whole is None or not frac or any(t not in _ONES or _ONES[t] > 9 for t in frac):
            return None
        return f"{whole}." + "".join(str(_ONES[t]) for t in frac)
    return _parse_ints(tokens)


def words_to_digits(text: str) -> str:
    """Replace spoken numbers with digits: 'one hundred and one point two' -> '101.2'."""
    text = re.sub(r"\btwice\b", "2 times", text, flags=re.IGNORECASE)
    text = re.sub(r"\bthrice\b", "3 times", text, flags=re.IGNORECASE)
    text = re.sub(r"\bonce\b", "1 time", text, flags=re.IGNORECASE)

    def sub(m: re.Match) -> str:
        parsed = _parse_run(m.group(0))
        return parsed if parsed is not None else m.group(0)

    return _RUN.sub(sub, text)


# --- quantities -------------------------------------------------------------

_UNITS = {
    "mg": "mg", "milligram": "mg", "milligrams": "mg",
    "mcg": "mcg", "microgram": "mcg", "micrograms": "mcg", "µg": "mcg",
    "g": "g", "gm": "g", "gram": "g", "grams": "g",
    "ml": "ml", "milliliter": "ml", "milliliters": "ml", "millilitre": "ml", "millilitres": "ml",
    "kg": "kg", "iu": "iu", "unit": "unit", "units": "unit",
    "day": "day", "days": "day", "week": "week", "weeks": "week",
    "month": "month", "months": "month", "hour": "hour", "hours": "hour",
    "hr": "hour", "hrs": "hour", "minute": "minute", "minutes": "minute", "min": "minute",
    "mins": "minute", "time": "time", "times": "time", "percent": "%", "%": "%",
    "fahrenheit": "f", "°f": "f", "f": "f", "celsius": "c", "°c": "c",
    "bpm": "bpm", "mmhg": "mmhg",
}

_QUANTITY = re.compile(r"(?P<num>\d+(?:\.\d+)?)\s*(?P<unit>%|°\s?[fFcC]\b|[A-Za-zµ]+)")
_NUMBER = re.compile(r"\d+(?:\.\d+)?")


def _canon(num: str) -> str | None:
    try:
        return format(Decimal(num).normalize(), "f")
    except InvalidOperation:
        return None


def quantities(text: str) -> set[tuple[str, str]]:
    """(value, unit) pairs found in `text` after number-word normalisation."""
    out = set()
    for m in _QUANTITY.finditer(words_to_digits(text)):
        unit = _UNITS.get(m.group("unit").lower().replace(" ", ""))
        value = _canon(m.group("num"))
        if unit and value:
            out.add((value, unit))
    return out


def numbers(text: str) -> set[str]:
    return {v for v in (_canon(n) for n in _NUMBER.findall(words_to_digits(text))) if v}


_DOSE_UNITS = {"mg", "mcg", "g", "ml", "iu", "unit"}
_NOT_A_DRUG = {
    "dose", "doses", "tablet", "tablets", "capsule", "capsules", "take", "takes", "taking",
    "give", "given", "prescribe", "prescribed", "prescription", "about", "around", "also",
    "only", "and", "with", "twice", "times", "daily", "every", "each", "maximum", "total",
    "continue", "start", "stop", "when", "from", "that", "this", "have", "your",
}


def dose_triples(text: str) -> set[tuple[str, str, str]]:
    """(drug, value, unit) for doses such as 'metformin 500 mg' or '500 mg of metformin'."""
    norm = words_to_digits(text).lower()
    out = set()
    for m in _QUANTITY.finditer(norm):
        unit = _UNITS.get(m.group("unit").lower().replace(" ", ""))
        value = _canon(m.group("num"))
        if unit not in _DOSE_UNITS or not value:
            continue
        before = re.findall(r"[a-z]{4,}", norm[: m.start()])
        drug = next((w for w in reversed(before[-3:]) if w not in _NOT_A_DRUG), None)
        after = re.match(r"\s*(?:tablets?\s+|capsules?\s+)?of\s+([a-z]{4,})", norm[m.end():])
        if after and after.group(1) not in _NOT_A_DRUG:
            drug = after.group(1)
        if drug:
            out.add((drug, value, unit))
    return out


def check_quantities(field: str, text: str, transcript: str) -> list[str]:
    seen_q, seen_n = quantities(transcript), numbers(transcript)
    flags, covered, handled = [], set(), set()

    # Doses are tied to a drug: another drug's dose must not be accepted.
    said = dose_triples(transcript)
    said_for: dict[str, set[tuple[str, str]]] = {}
    for drug, value, unit in said:
        said_for.setdefault(drug, set()).add((value, unit))
    for drug, value, unit in sorted(dose_triples(text)):
        covered.add(value)
        handled.add((value, unit))
        if (drug, value, unit) in said:
            continue
        if drug in said_for:
            others = ", ".join(f"{v} {u}" for v, u in sorted(said_for[drug]))
            flags.append(
                f"Check {field}: the note gives {drug} {value} {unit}, but the "
                f"transcript gives {drug} {others}."
            )
        elif (value, unit) in seen_q:
            flags.append(
                f"Check {field}: the note gives {drug} {value} {unit}, but that dose "
                "was said for a different medicine in the transcript."
            )
        else:
            flags.append(
                f"Check {field}: the note says {drug} {value} {unit}, which is not in "
                "the transcript. Compare it with what was said."
            )

    for value, unit in sorted(quantities(text)):
        covered.add(value)
        if (value, unit) in handled:
            continue
        if (value, unit) not in seen_q:
            flags.append(
                f"Check {field}: the note says {value} {unit}, which is not in the "
                "transcript. Compare it with what was said."
            )
    # Bare numbers only count when written as digits, so a stray "one" is not a number.
    for raw in _NUMBER.findall(text):
        value = _canon(raw)
        if value and value not in covered and value not in seen_n:
            flags.append(
                f"Check {field}: the note contains the number {value}, which is not "
                "in the transcript."
            )
    return flags


# --- conditionals -----------------------------------------------------------

_LT = re.compile(
    r"\b(?:no more than|not more than|at most|up to|less than|fewer than|under|below|"
    r"within|shorter than)\b", re.IGNORECASE)
_GT = re.compile(
    r"\b(?:more than|greater than|over|longer than|beyond|exceeds?|above|at least)\b",
    re.IGNORECASE)

_STOP = {
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "of", "to", "in", "on", "at",
    "for", "and", "or", "that", "this", "it", "you", "your", "we", "will", "if", "then",
    "than", "more", "less", "fewer", "over", "under", "below", "above", "within", "beyond",
    "least", "most", "no", "not", "up", "when", "patient", "they", "their", "has", "have",
    "had", "do", "does", "did", "with", "by", "as", "so", "otherwise", "else", "should",
    "can", "may", "if", "after", "about",
}

_IF = re.compile(
    r"\bif\s+(?P<cond>[^,.;?!]+?)\s*,\s*(?:then\s+)?(?P<then>[^.;?!]+)[.;?!]?"
    r"(?:\s*(?:otherwise|else|if not)\s*,?\s*(?P<other>[^.;?!]+))?",
    re.IGNORECASE,
)
_NOTE_AFTER = re.compile(r"^(?P<out>.+?)\s+if\s+(?P<cond>.+)$", re.IGNORECASE)
_NOTE_BEFORE = re.compile(r"^if\s+(?P<cond>[^,]+),\s*(?P<out>.+)$", re.IGNORECASE)


def direction(text: str) -> str | None:
    if _LT.search(text):
        return "lt"
    if _GT.search(text):
        return "gt"
    return None


def content_words(text: str) -> set[str]:
    words = re.findall(r"[a-z0-9.]+", words_to_digits(text).lower())
    return {w[:-1] if len(w) > 3 and w.endswith("s") else w for w in words if w not in _STOP}


def _overlap(a: set[str], b: set[str]) -> float:
    return len(a & b) / len(a) if a else 0.0


def check_conditionals(field: str, text: str, transcript: str) -> list[str]:
    rules = [m.groupdict() for m in _IF.finditer(transcript)]
    if not rules:
        return []

    flags = []
    for clause in re.split(r"[;\n]|(?<=[A-Za-z0-9])\.\s+", text):
        clause = clause.strip()
        m = _NOTE_BEFORE.match(clause) or _NOTE_AFTER.match(clause)
        if not m:
            continue
        cond, outcome = m.group("cond"), m.group("out")
        cond_words, out_words = content_words(cond), content_words(outcome)
        if not cond_words or not out_words:
            continue

        for rule in rules:
            rule_cond = content_words(rule["cond"])
            if len(cond_words & rule_cond) / len(cond_words | rule_cond) < 0.6:
                continue  # a different condition

            same = direction(cond) == direction(rule["cond"]) or None in (
                direction(cond), direction(rule["cond"]))
            then_words = content_words(rule["then"])
            other_words = content_words(rule["other"] or "")
            to_then, to_other = _overlap(out_words, then_words), _overlap(out_words, other_words)

            wrong = (same and to_other > to_then and to_other >= 0.5) or (
                not same and to_then > to_other and to_then >= 0.5)
            if wrong:
                tidy = " .;,"
                flags.append(
                    f"Check {field}: the note links \"{outcome.strip(tidy)}\" to \"if "
                    f"{cond.strip(tidy)}\", but the transcript ties it to the other case. "
                    "Compare the follow-up rule with what the clinician said."
                )
            break
    return flags


# --- entry point ------------------------------------------------------------

def _fields(note: dict) -> list[tuple[str, str]]:
    out = [(name, sec["text"]) for name, sec in note.get("sections", {}).items()]
    for key, label in (("allergies", "allergies"), ("medications", "medications"),
                       ("action_items", "action items")):
        for entry in note.get(key) or []:
            out.append((label, entry["text"]))
    return out


def verify_note(note: dict, segments: list[dict]) -> dict:
    """Append quantity and conditional flags to `note["flags"]` and return the note."""
    transcript = " ".join(s["text"] for s in segments)
    flags = note.setdefault("flags", [])
    for field, text in _fields(note):
        for flag in [*check_quantities(field, text, transcript),
                     *check_conditionals(field, text, transcript)]:
            if flag not in flags:
                flags.append(flag)
    return note
