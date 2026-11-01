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

// Two edge lines count as the same running line when they sit at the same height on
// the page and their text is nearly identical. "Nearly" matters: a long footer such
// as a file path is truncated to fit, and a wider page number can cut it one
// character sooner, so the text differs slightly from page to page.
const Y_TOLERANCE = 3;

function levenshtein(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

// Strict on purpose. The variation seen in practice is a character or two, so at
// most two edits are allowed, and none for short lines. Anything looser starts to
// match body lines that merely follow the same template ("The alpha section ...").
function similarText(a, b) {
  if (a === b) return true;
  const longest = Math.max(a.length, b.length);
  if (longest < 20) return false;
  const allowed = Math.min(2, Math.floor(longest * 0.05));
  if (Math.abs(a.length - b.length) > allowed) return false;
  return levenshtein(a, b) <= allowed;
}

// pages: [[{ text, y, h }]]. Removes bare page numbers, and lines that repeat on
// at least 40% of the pages (running headers and footers) when there are 3+ pages.
// Only the first and last couple of lines of a page are ever candidates, and a
// repeat must be at the same height with near-identical text, so body text that
// happens to repeat, or differs only by a number, is never deleted.
export function removeRunningHeads(pages) {
  const clusters = [];
  const membership = pages.map((lines, pageIndex) => {
    const byLine = new Map();
    lines.forEach((l, i) => {
      if (!atEdge(lines, i)) return;
      const key = normalise(l.text);
      if (!key) return;
      let cluster = clusters.find((c) => Math.abs(c.y - l.y) <= Y_TOLERANCE && similarText(c.key, key));
      if (!cluster) {
        cluster = { key, y: l.y, pages: new Set() };
        clusters.push(cluster);
      }
      cluster.pages.add(pageIndex);
      byLine.set(i, cluster);
    });
    return byLine;
  });

  const needed = Math.max(2, pages.length * 0.4);
  const repeated = (cluster) => pages.length >= 3 && cluster.pages.size >= needed;
  const pageNumber = (text) => /^(?:page\s+)?\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?$/i.test(text.trim()) || /^[-–—]\s*\d{1,4}\s*[-–—]$/.test(text.trim());

  return pages.map((lines, pageIndex) =>
    lines.filter((l, i) => {
      if (!atEdge(lines, i)) return true;
      if (pageNumber(l.text)) return false;
      const cluster = membership[pageIndex].get(i);
      return !(cluster && repeated(cluster));
    }),
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

// Pages already cleaned by removeRunningHeads -> one list of paragraphs, merging a
// paragraph that continues onto the next page.
export function joinPages(cleaned) {
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

// All pages -> one list of paragraphs.
export function buildDocumentParagraphs(pages) {
  return joinPages(removeRunningHeads(pages));
}
