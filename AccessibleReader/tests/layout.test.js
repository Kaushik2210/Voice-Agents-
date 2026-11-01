import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDocumentParagraphs,
  dehyphenate,
  itemsToLines,
  linesToParagraphs,
  removeRunningHeads,
} from "../src/lib/layout.js";

const line = (text, y, h = 12) => ({ text, y, h });

test("fragments on the same baseline join into one line, in reading order", () => {
  const lines = itemsToLines([
    { str: "world", x: 60, y: 700, h: 12 },
    { str: "Hello", x: 10, y: 700.5, h: 12 },
    { str: "Next line", x: 10, y: 680, h: 12 },
    { str: "   ", x: 5, y: 650, h: 12 },
  ]);
  assert.deepEqual(lines.map((l) => l.text), ["Hello world", "Next line"]);
});

test("a gap larger than normal line spacing starts a new paragraph", () => {
  const paragraphs = linesToParagraphs([
    line("First paragraph line one", 700),
    line("first paragraph line two.", 686),
    line("Second paragraph begins.", 650),
    line("and continues.", 636),
  ]);
  assert.deepEqual(paragraphs, [
    "First paragraph line one first paragraph line two.",
    "Second paragraph begins. and continues.",
  ]);
});

const WORDS = ["alpha", "beta", "gamma", "delta"];
// Real body lines differ in their words from page to page.
const prose = (n) => [1, 2, 3, 4].map((k) => line(`The ${WORDS[n - 1]} section covers topic ${WORDS[(n + k) % 4]} in detail.`, 700 - k * 14));
// Lines that differ from page to page only by a number.
const body = (n) => [1, 2, 3, 4].map((k) => line(`Body line ${k} of page ${n}.`, 700 - k * 14));

test("page numbers and repeated headers and footers are removed", () => {
  const pages = [1, 2, 3, 4].map((n) => [line("The Annual Report", 780), ...prose(n), line(`Page ${n}`, 40)]);
  const cleaned = removeRunningHeads(pages);
  cleaned.forEach((lines, i) => assert.deepEqual(lines.map((l) => l.text), prose(i + 1).map((l) => l.text)));
});

test("body text that only differs by a number is never mistaken for a header", () => {
  // Same shape on every page, but in the middle of the page, so it must be kept.
  const pages = [1, 2, 3, 4].map((n) => [line("Header", 780), line("Intro", 760), ...body(n), line("Outro", 60), line("Footer", 40)]);
  const cleaned = removeRunningHeads(pages);
  cleaned.forEach((lines, i) => {
    const text = lines.map((l) => l.text);
    assert.ok(body(i + 1).every((l) => text.includes(l.text)), "all body lines survive");
  });
});

test("a footer that is truncated differently on one page is still recognised", () => {
  // Seen in a real Chrome-made PDF: the file path in the footer was cut one character
  // sooner on page 10, where the page number is wider.
  const footer = (n) => (n === 10 ? "file:///c:/users/kaushik/appdata/local/temp/make-pdf… 10/10" : "file:///c:/users/kaushik/appdata/local/temp/make-pdfs… " + n + "/10");
  const pages = Array.from({ length: 10 }, (_, k) => [line("Annual Report", 819), ...prose((k % 4) + 1), line(footer(k + 1), 16)]);
  const cleaned = removeRunningHeads(pages);
  assert.ok(cleaned.every((lines) => lines.every((l) => !l.text.startsWith("file:"))), "every footer removed, including the odd one");
  assert.ok(cleaned.every((lines) => lines.length === 4), "and only the footers and header were removed");
});

test("different text at the same height is not a running header", () => {
  // Every page starts its text at the same height, but with different words.
  const pages = [1, 2, 3, 4].map((n) => [line(`Opening words number ${["alpha", "beta", "gamma", "delta"][n - 1]} appear here`, 767), ...prose(n)]);
  const cleaned = removeRunningHeads(pages);
  assert.ok(cleaned.every((lines, i) => lines[0].text === pages[i][0].text), "the first line of each page survives");
});

test("two short different lines at the same height are not merged", () => {
  const pages = ["A", "B", "C", "D"].map((t) => [line(t, 780), ...prose(1), line("end", 40)]);
  const cleaned = removeRunningHeads(pages);
  assert.ok(cleaned.every((lines, i) => lines[0].text === ["A", "B", "C", "D"][i]));
});

test("a number line in the middle of a page is kept", () => {
  const pages = [1, 2, 3].map(() => [line("A", 780), line("B", 760), line("7", 700), line("C", 680), line("D", 40), line("E", 20)]);
  assert.ok(removeRunningHeads(pages).every((lines) => lines.some((l) => l.text === "7")));
});

test("with only one or two pages nothing is treated as a running header", () => {
  const pages = [[line("Repeated", 700)], [line("Repeated", 700)]];
  assert.deepEqual(removeRunningHeads(pages).map((p) => p.length), [1, 1]);
});

test("end-of-line hyphenation is undone, real hyphens kept", () => {
  assert.equal(dehyphenate("a deci- sion about informa- tion"), "a decision about information");
  assert.equal(dehyphenate("well-known and Anglo- Saxon"), "well-known and Anglo- Saxon");
});

test("a paragraph that runs across a page break is merged", () => {
  const pages = [
    [line("Start of a long", 700), line("sentence that does not end", 686)],
    [line("until the next page. A new idea.", 700)],
  ];
  assert.deepEqual(buildDocumentParagraphs(pages), ["Start of a long sentence that does not end until the next page. A new idea."]);
});

test("a finished paragraph at a page end is not merged with the next page", () => {
  const pages = [[line("Ended properly.", 700)], [line("a lowercase start.", 700)]];
  assert.deepEqual(buildDocumentParagraphs(pages), ["Ended properly.", "a lowercase start."]);
});

test("an empty page in the middle does not lose the carried paragraph", () => {
  const pages = [[line("Open ended", 700)], [], [line("Next page text.", 700)]];
  assert.deepEqual(buildDocumentParagraphs(pages), ["Open ended", "Next page text."]);
});
