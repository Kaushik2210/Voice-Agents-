// Turn plain text into paragraphs and find the chapters in it.
//
// Chapters come from the PDF's own outline when it has one (see pdf.js). For
// plain text we look for headings: "Chapter 3", "PART II", "1.2 Methods",
// Markdown "#" lines, and short all-capitals lines. If fewer than two are found
// the text is cut into evenly sized sections so there is always something to
// jump between.

const WORD_NUMBERS = "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve";
const KEYWORD = new RegExp(
  `^(chapter|part|book|section|appendix|prologue|epilogue|introduction|preface|conclusion)\\b(?:\\s+([ivxlcdm]+|\\d+|${WORD_NUMBERS})\\b)?`,
  "i",
);
const NUMBERED = /^\d+(?:\.\d+){0,2}[.)]?\s+\S/;
const MARKDOWN = /^#{1,3}\s+\S/;

const SECTION_WORDS = 1200;

export function toParagraphs(text) {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function headingText(paragraph) {
  return paragraph.replace(/^#{1,3}\s+/, "").trim();
}

export function looksLikeHeading(paragraph) {
  const p = paragraph.trim();
  if (!p || p.length > 80) return false;
  if (MARKDOWN.test(p)) return true;
  if (/[.!?]["')\]]?$/.test(p) && !NUMBERED.test(p)) return false; // a sentence, not a title
  if (KEYWORD.test(p) && p.split(/\s+/).length <= 8) return true;
  if (NUMBERED.test(p) && p.length <= 60 && !/[.!?]$/.test(p)) return true;
  const letters = p.replace(/[^A-Za-z]/g, "");
  return letters.length >= 4 && p.length <= 60 && letters === letters.toUpperCase() && /[A-Z]{3}/.test(letters);
}

function fixedSections(paragraphs) {
  const chapters = [];
  let words = 0;
  let from = 0;
  paragraphs.forEach((p, i) => {
    words += p.split(/\s+/).length;
    if (words >= SECTION_WORDS && i < paragraphs.length - 1) {
      chapters.push({ title: `Section ${chapters.length + 1}`, start: from });
      from = i + 1;
      words = 0;
    }
  });
  chapters.push({ title: `Section ${chapters.length + 1}`, start: from });
  return chapters.length === 1 ? [{ title: "Whole text", start: 0 }] : chapters;
}

// Returns [{ title, start }] where `start` is a paragraph index.
export function detectChapters(paragraphs) {
  if (paragraphs.length === 0) return [];
  const found = [];
  paragraphs.forEach((p, i) => {
    if (looksLikeHeading(p)) found.push({ title: headingText(p), start: i });
  });
  if (found.length < 2) return fixedSections(paragraphs);
  if (found[0].start > 0) found.unshift({ title: "Beginning", start: 0 });
  return found;
}

// Split paragraphs into per-chapter objects: { title, paragraphs }.
// A heading paragraph is the chapter's title and is not repeated in its body.
export function buildChapters(paragraphs, chapters = detectChapters(paragraphs)) {
  return chapters.map((c, i) => {
    const stop = i + 1 < chapters.length ? chapters[i + 1].start : paragraphs.length;
    let body = paragraphs.slice(c.start, stop);
    if (body.length && looksLikeHeading(body[0]) && headingText(body[0]) === c.title) body = body.slice(1);
    return { title: c.title, paragraphs: body };
  });
}
