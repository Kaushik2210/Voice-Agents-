// Split text into sentences for read-aloud and highlighting.
//
// Speech engines cut off long utterances (Chrome stops after roughly fifteen
// seconds), and highlighting needs small units, so the reader speaks one
// sentence at a time. Splitting on every full stop would break "Dr. Smith",
// "3.5 mg" and "J. K. Rowling", so those are recognised and kept whole.

const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "etc", "fig", "figs",
  "no", "nos", "vol", "inc", "ltd", "co", "mt", "approx", "dept", "est", "cf",
  "al", "ed", "eds", "pp", "p", "ch", "sec", "gen", "col", "lt", "capt", "rev",
]);

// Longest sentence we will hand to a speech engine in one piece.
const MAX_CHARS = 300;

function lastWord(text) {
  const m = text.match(/([A-Za-z.]+)$/);
  return m ? m[1] : "";
}

function isAbbreviation(before) {
  const word = lastWord(before).replace(/\.$/, "");
  if (!word) return false;
  if (/^[A-Z]$/.test(word)) return true; // an initial: "J. K. Rowling"
  if (/^(?:[A-Za-z]\.)+[A-Za-z]$/.test(word)) return true; // "e.g", "i.e", "U.S"
  return ABBREVIATIONS.has(word.toLowerCase());
}

// Break an over-long sentence at commas, semicolons or dashes, then at spaces.
function breakLong(sentence) {
  if (sentence.length <= MAX_CHARS) return [sentence];
  const parts = [];
  let rest = sentence;
  while (rest.length > MAX_CHARS) {
    const window = rest.slice(0, MAX_CHARS);
    let cut = Math.max(window.lastIndexOf(", "), window.lastIndexOf("; "), window.lastIndexOf(" — "), window.lastIndexOf(": "));
    if (cut < MAX_CHARS / 3) cut = window.lastIndexOf(" ");
    if (cut <= 0) cut = MAX_CHARS;
    parts.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

export function splitSentences(text) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return [];

  const sentences = [];
  let start = 0;
  const end = /[.!?…]+["'”’)\]]*(?=\s|$)/g;
  let m;
  while ((m = end.exec(clean))) {
    const stop = m.index + m[0].length;
    const before = clean.slice(start, m.index + 1);
    const next = clean.slice(stop).trimStart();
    const endsWithPeriod = m[0].startsWith(".") && !m[0].startsWith("..");

    if (endsWithPeriod && isAbbreviation(before)) continue;
    // A full stop followed by a lowercase letter or a digit is almost never a break.
    if (endsWithPeriod && next && /^[a-z0-9]/.test(next)) continue;

    sentences.push(clean.slice(start, stop).trim());
    start = stop;
  }
  const tail = clean.slice(start).trim();
  if (tail) sentences.push(tail);

  return sentences.flatMap(breakLong).filter(Boolean);
}
