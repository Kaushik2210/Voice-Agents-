import test from "node:test";
import assert from "node:assert/strict";
import { WORDS_PER_MINUTE, countWords, formatMinutes, leftLabel, lengthLabel, minutesFor } from "../src/lib/time.js";

test("counts words, ignoring extra whitespace", () => {
  assert.equal(countWords("  one   two\nthree "), 3);
  assert.equal(countWords(""), 0);
  assert.equal(countWords(null), 0);
});

test("faster speech means less time", () => {
  assert.equal(minutesFor(WORDS_PER_MINUTE), 1);
  assert.equal(minutesFor(WORDS_PER_MINUTE, 2), 0.5);
  assert.equal(minutesFor(WORDS_PER_MINUTE * 3, 1.5), 2);
});

test("a nonsense speed falls back to normal rather than dividing by zero", () => {
  assert.equal(minutesFor(160, 0), 1);
  assert.equal(minutesFor(160, NaN), 1);
  assert.equal(minutesFor(-50, 1), 0);
});

test("times read naturally and round up", () => {
  assert.equal(formatMinutes(0), "done");
  assert.equal(formatMinutes(0.4), "under a minute");
  assert.equal(formatMinutes(1), "under a minute");
  assert.equal(formatMinutes(1.1), "2 min");
  assert.equal(formatMinutes(59.2), "1 h", "59.2 rounds up to 60 minutes, which is an hour");
  assert.equal(formatMinutes(70), "1 h 10 min");
  assert.equal(formatMinutes(120), "2 h");
  assert.equal(formatMinutes(NaN), "done");
});

test("a short form is available for tight spaces", () => {
  assert.equal(formatMinutes(0.3, { short: true }), "<1 min");
  assert.equal(formatMinutes(3, { short: true }), "3 min");
});

test("labels never say 'about under a minute'", () => {
  assert.equal(lengthLabel(0.4), "under a minute");
  assert.equal(lengthLabel(3), "about 3 min");
  assert.equal(lengthLabel(95), "about 1 h 35 min");
  assert.equal(leftLabel(0.4), "under a minute left");
  assert.equal(leftLabel(3), "about 3 min left");
  assert.equal(leftLabel(0), "finished");
});
