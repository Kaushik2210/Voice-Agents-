// Rebuild readable paragraphs from the positioned text pieces a PDF provides.
//
// A PDF stores text as fragments with coordinates, not as paragraphs. These
// pure functions group fragments into lines, drop page numbers and repeated
// headers and footers, join paragraphs that run across a page break, and undo
// end-of-line hyphenation. The pdf.js call that produces the fragments lives in
// pdf.js; keeping this part free of it makes it testable.

// items: [{ str, x, y, h }] for one page. PDF y grows upward, so higher y is higher on the page.
export function itemsToLines(items) {
  const usable = items.filter((it) => it.str && it.str.trim() !== "");
  const sorted = [...usable].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of sorted) {
    const tol = Math.max(2, (it.h || 10) * 0.4);
    const line = lines.find((l) => Math.abs(l.y - it.y) <= tol);
    if (line) {
      line.parts.push(it);
      line.h = Math.max(line.h, it.h || 0);
    } else {
      lines.push({ y: it.y, h: it.h || 10, parts: [it] });
    }
  }
  return lines
    .sort((a, b) => b.y - a.y)
    .map((l) => ({
      y: l.y,
      h: l.h,
      text: l.parts.sort((a, b) => a.x - b.x).map((p) => p.str).join(" ").replace(/\s+/g, " ").trim(),
    }));
}

const normalise = (t) => t.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();

// How many lines at the top and bottom of a page can be a header or footer.
const EDGE_LINES = 2;
const atEdge = (lines, i) => i < EDGE_LINES || i >= lines.length - EDGE_LINES;

// pages: [[{ text, y, h }]]. Removes bare page numbers, and lines that repeat on
// at least 40% of the pages (running headers and footers) when there are 3+ pages.
// Only the first and last couple of lines of a page are ever candidates, so body
// text that happens to repeat, or differs only by a number, is never deleted.
export function removeRunningHeads(pages) {
  const counts = new Map();
  for (const lines of pages) {
    const keys = new Set(lines.filter((_, i) => atEdge(lines, i)).map((l) => normalise(l.text)));
    for (const key of keys) counts.set(key, (counts.get(key) || 0) + 1);
  }
  const repeated = (key) => pages.length >= 3 && key.length > 0 && counts.get(key) >= Math.max(2, pages.length * 0.4);
  const pageNumber = (text) => /^(?:page\s+)?\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?$/i.test(text.trim()) || /^[-–—]\s*\d{1,4}\s*[-–—]$/.test(text.trim());
  return pages.map((lines) =>
    lines.filter((l, i) => !(atEdge(lines, i) && (pageNumber(l.text) || repeated(normalise(l.text))))),
  );
}

function median(values) {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// One page of lines -> paragraphs. A gap clearly larger than the usual line
// spacing starts a new paragraph.
export function linesToParagraphs(lines) {
  if (lines.length === 0) return [];
  const gaps = [];
  for (let i = 1; i < lines.length; i++) gaps.push(lines[i - 1].y - lines[i].y);
  const usual = median(gaps.filter((g) => g > 0)) || lines[0].h * 1.2;
  const paragraphs = [];
  let current = [lines[0].text];
  for (let i = 1; i < lines.length; i++) {
    const gap = lines[i - 1].y - lines[i].y;
    if (gap > usual * 1.5) {
      paragraphs.push(current.join(" "));
      current = [];
    }
    current.push(lines[i].text);
  }
  paragraphs.push(current.join(" "));
  return paragraphs;
}

export function dehyphenate(text) {
  // "informa- tion" at a line end becomes "information"; real hyphens before a capital are kept.
  return text.replace(/([a-z])-\s+([a-z])/g, "$1$2");
}

// All pages -> one list of paragraphs, merging a paragraph that continues onto the next page.
export function buildDocumentParagraphs(pages) {
  const cleaned = removeRunningHeads(pages);
  const out = [];
  let carry = null;
  cleaned.forEach((lines) => {
    const paragraphs = linesToParagraphs(lines);
    if (carry !== null && paragraphs.length) {
      const first = paragraphs[0];
      const unfinished = !/[.!?:"”’)]$/.test(carry);
      if (unfinished && /^[a-z]/.test(first)) {
        paragraphs[0] = `${carry} ${first}`;
      } else {
        out.push(carry);
      }
    } else if (carry !== null) {
      out.push(carry);
    }
    carry = paragraphs.length ? paragraphs.pop() : null;
    out.push(...paragraphs);
  });
  if (carry !== null) out.push(carry);
  return out.map((p) => dehyphenate(p).replace(/\s+/g, " ").trim()).filter(Boolean);
}
