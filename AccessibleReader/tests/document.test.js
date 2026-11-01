import test from "node:test";
import assert from "node:assert/strict";
import { buildDocument, fromText, titleFromFileName } from "../src/lib/document.js";
import { SAMPLE_TEXT, SAMPLE_TITLE } from "../src/lib/sample.js";
import { DEFAULTS, PRESETS, cssVars, loadPrefs, sanitise, savePrefs } from "../src/lib/prefs.js";

test("the bundled sample has three chapters and keeps awkward sentences whole", () => {
  const doc = fromText(SAMPLE_TEXT, SAMPLE_TITLE);
  assert.deepEqual(doc.chapters.map((c) => c.title), [
    "Chapter 1: Reading with your ears",
    "Chapter 2: Making the page comfortable",
    "Chapter 3: Your files stay with you",
  ]);
  const all = doc.chapters.flatMap((c) => c.flat.map((f) => f.text));
  assert.ok(all.some((s) => s.startsWith("Dr. Okafor, who studies reading")), "Dr. does not end a sentence");
  assert.ok(all.some((s) => s.includes("0.8 times normal speed")), "a decimal stays inside its sentence");
  assert.ok(all.some((s) => s.startsWith("J. K. Chen,")), "initials stay together");
});

test("each sentence remembers its paragraph so the highlight can find it", () => {
  const doc = fromText("Chapter 1\n\nOne. Two.\n\nThree.\n\nChapter 2\n\nFour.");
  const ch = doc.chapters[0];
  assert.deepEqual(ch.flat, [
    { p: 0, s: 0, text: "One." },
    { p: 0, s: 1, text: "Two." },
    { p: 1, s: 0, text: "Three." },
  ]);
  assert.equal(ch.sentenceCount, 3);
});

test("chapters with nothing to read are dropped", () => {
  const doc = buildDocument({ title: "t", chapters: [{ title: "Empty", paragraphs: ["   "] }, { title: "Real", paragraphs: ["Hello there."] }] });
  assert.deepEqual(doc.chapters.map((c) => c.title), ["Real"]);
});

test("the same text gives the same document id, edited text a different one", () => {
  assert.equal(fromText("A. B.").id, fromText("A. B.").id);
  assert.notEqual(fromText("A. B.").id, fromText("A. C.").id);
});

test("file names become readable titles", () => {
  assert.equal(titleFromFileName("my_annual-report.final.pdf"), "my annual report.final");
  assert.equal(titleFromFileName(".pdf"), "Untitled");
});

// --- display preferences ----------------------------------------------------

test("preferences are clamped to safe ranges and unknown values are ignored", () => {
  const p = sanitise({ size: 99, lineHeight: -4, theme: "neon", font: "comic", focus: "yes", width: "40" });
  assert.equal(p.size, 2.6);
  assert.equal(p.lineHeight, 1.3);
  assert.equal(p.theme, DEFAULTS.theme);
  assert.equal(p.font, DEFAULTS.font);
  assert.equal(p.focus, false);
  assert.equal(p.width, 40);
});

test("garbage in storage falls back to the defaults", () => {
  const bad = { getItem: () => "{nope" };
  assert.deepEqual(loadPrefs(bad), DEFAULTS);
  const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.deepEqual(loadPrefs(broken), DEFAULTS);
  assert.equal(savePrefs(DEFAULTS, broken), false);
});

test("preferences round-trip through storage", () => {
  const m = new Map();
  const storage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
  savePrefs({ ...DEFAULTS, size: 1.6, theme: "dark", focus: true }, storage);
  const back = loadPrefs(storage);
  assert.equal(back.size, 1.6);
  assert.equal(back.theme, "dark");
  assert.equal(back.focus, true);
});

test("presets are valid and map to CSS variables", () => {
  for (const preset of Object.values(PRESETS)) {
    assert.deepEqual(sanitise(preset), { ...DEFAULTS, ...preset }, "a preset survives sanitising unchanged");
  }
  const vars = cssVars(PRESETS.roomy);
  assert.equal(vars["--read-size"], "1.4rem");
  assert.equal(vars["--read-measure"], "52ch");
  assert.match(vars["--read-font"], /Verdana/);
});
