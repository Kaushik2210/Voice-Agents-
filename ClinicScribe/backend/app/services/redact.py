"""Pattern-based masking of obvious direct identifiers.

This is a safety net, not de-identification. It catches structured identifiers
(phone numbers, emails, 12-digit national IDs). It does NOT find names or
addresses, so recordings must still be treated as identifiable health data.
"""

import re

_PATTERNS = [
    ("EMAIL", re.compile(r"\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b")),
    # 12-digit national ID, optionally grouped 4-4-4
    ("ID", re.compile(r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b")),
    # 10+ digit phone numbers with optional country code and separators
    ("PHONE", re.compile(r"(?<!\d)(?:\+?\d{1,3}[\s-]?)?(?:\d[\s-]?){9,11}\d(?!\d)")),
]


def redact(text: str) -> tuple[str, int]:
    """Return (masked_text, number_of_replacements)."""
    count = 0
    for label, pattern in _PATTERNS:
        text, n = pattern.subn(f"[{label}]", text)
        count += n
    return text, count


def redact_segments(segments: list[dict]) -> tuple[list[dict], int]:
    total = 0
    out = []
    for seg in segments:
        text, n = redact(seg["text"])
        total += n
        out.append({**seg, "text": text})
    return out, total
