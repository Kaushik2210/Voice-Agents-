import test from "node:test";
import assert from "node:assert/strict";
import { buildChapters, detectChapters, looksLikeHeading, toParagraphs } from "../src/lib/chapters.js";

test("paragraphs split on blank lines and unwrap hard line breaks", () => {
  assert.deepEqual(toParagraphs("First line\nstill first.\n\nSecond.\r\n\r\n\r\nThird."), [
    "First line still first.",
    "Second.",
    "Third.",
  ]);
});

test("recognises common heading shapes", () => {
  for (const h of ["Chapter 3", "CHAPTER IV", "Part Two", "1. Introduction", "2.3 Method", "# Overview", "THE LONG ROAD HOME", "Prologue"]) {
    assert.ok(looksLikeHeading(h), `${h} should be a heading`);
  }
});

test("does not mistake ordinary sentences or short lines for headings", () => {
  for (const s of ["It was the best of times.", "He said no.", "Chapter and verse were quoted at length during the long meeting held on Friday.", "ok", "I.", "A. B. C. D."]) {
    assert.ok(!looksLikeHeading(s), `${s} should not be a heading`);
  }
});

test("finds chapters and adds a Beginning chapter for text before the first heading", () => {
  const paragraphs = ["A short preface line without a title.", "Chapter 1", "Body one.", "Chapter 2", "Body two."];
  assert.deepEqual(detectChapters(paragraphs), [
    { title: "Beginning", start: 0 },
    { title: "Chapter 1", start: 1 },
    { title: "Chapter 2", start: 3 },
  ]);
});

test("a heading is the chapter title and is not repeated in its body", () => {
  const paragraphs = ["Chapter 1", "Body one.", "More one.", "Chapter 2", "Body two."];
  const built = buildChapters(paragraphs);
  assert.deepEqual(built, [
    { title: "Chapter 1", paragraphs: ["Body one.", "More one."] },
    { title: "Chapter 2", paragraphs: ["Body two."] },
  ]);
});

test("falls back to even sections when there are fewer than two headings", () => {
  const para = Array.from({ length: 400 }, () => "word").join(" ") + ".";
  const paragraphs = Array.from({ length: 10 }, () => para); // 4000 words, no headings
  const chapters = detectChapters(paragraphs);
  assert.ok(chapters.length >= 3);
  assert.equal(chapters[0].title, "Section 1");
  assert.equal(chapters[0].start, 0);
});

test("a short text with no headings is a single chapter", () => {
  assert.deepEqual(detectChapters(["Just a little text."]), [{ title: "Whole text", start: 0 }]);
});

test("no paragraphs, no chapters", () => {
  assert.deepEqual(detectChapters([]), []);
});
