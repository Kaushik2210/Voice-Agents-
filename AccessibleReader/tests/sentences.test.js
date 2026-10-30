import test from "node:test";
import assert from "node:assert/strict";
import { splitSentences } from "../src/lib/sentences.js";

test("splits plain sentences", () => {
  assert.deepEqual(splitSentences("It was late. We left! Did you see it?"), [
    "It was late.",
    "We left!",
    "Did you see it?",
  ]);
});

test("does not split after titles and initials", () => {
  assert.deepEqual(splitSentences("Dr. Smith met J. K. Rowling. They talked."), [
    "Dr. Smith met J. K. Rowling.",
    "They talked.",
  ]);
});

test("does not split inside decimals or abbreviations like e.g.", () => {
  assert.deepEqual(splitSentences("Take 3.5 mg daily, e.g. with food. Stop if ill."), [
    "Take 3.5 mg daily, e.g. with food.",
    "Stop if ill.",
  ]);
});

test("keeps closing quotes with their sentence", () => {
  assert.deepEqual(splitSentences('She said, "Go home." He went.'), [
    'She said, "Go home."',
    "He went.",
  ]);
});

test("a full stop before a lowercase word is not a break", () => {
  assert.deepEqual(splitSentences("The file is notes.txt and it is small."), [
    "The file is notes.txt and it is small.",
  ]);
});

test("collapses whitespace and line breaks", () => {
  assert.deepEqual(splitSentences("One\n  line   here.\nNext one."), ["One line here.", "Next one."]);
});

test("text without end punctuation is one sentence", () => {
  assert.deepEqual(splitSentences("No ending here"), ["No ending here"]);
});

test("empty and blank input give nothing", () => {
  assert.deepEqual(splitSentences(""), []);
  assert.deepEqual(splitSentences("   \n "), []);
  assert.deepEqual(splitSentences(null), []);
});

test("very long sentences are cut at commas so speech engines do not stall", () => {
  const long = Array.from({ length: 60 }, (_, i) => `clause number ${i}`).join(", ") + ".";
  const parts = splitSentences(long);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => p.length <= 300), "every piece is short enough to speak");
  assert.equal(parts.join(" ").replace(/\s+/g, " ").replace(/,\s/g, ", "), long);
});
