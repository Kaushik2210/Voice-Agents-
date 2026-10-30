import test from "node:test";
import assert from "node:assert/strict";
import { createPlayer } from "../src/lib/player.js";
import { clampPosition, documentId, loadPosition, savePosition } from "../src/lib/progress.js";

// A fake speech engine: records what was spoken and lets a test finish or fail it.
function fakeEngine() {
  const spoken = [];
  let handlers = null;
  let cancels = 0;
  return {
    spoken,
    get cancels() {
      return cancels;
    },
    speak: (text, opts, h) => {
      spoken.push({ text, ...opts });
      handlers = h;
    },
    cancel: () => {
      cancels += 1;
    },
    finish: () => handlers.onend(),
    fail: (why) => handlers.onerror(why),
    // The browser fires this for a cancelled utterance, after we have moved on.
    staleHandlers: () => handlers,
  };
}

function setup(sentences = ["One.", "Two.", "Three."]) {
  const e = fakeEngine();
  const events = [];
  let finished = 0;
  const p = createPlayer({ speak: e.speak, cancel: e.cancel, onChange: (s) => events.push(s), onFinish: () => (finished += 1) });
  p.load(sentences);
  return { e, p, events, finishedCount: () => finished };
}

test("plays sentences in order and finishes once", () => {
  const { e, p, finishedCount } = setup();
  p.play();
  e.finish();
  e.finish();
  assert.deepEqual(e.spoken.map((s) => s.text), ["One.", "Two.", "Three."]);
  assert.equal(p.state.index, 2);
  assert.equal(p.state.playing, true);
  e.finish();
  assert.equal(p.state.playing, false);
  assert.equal(finishedCount(), 1);
});

test("pause cancels speech and resume restarts the same sentence", () => {
  const { e, p } = setup();
  p.play();
  e.finish(); // now on "Two."
  p.pause();
  assert.equal(p.state.playing, false);
  p.play();
  assert.deepEqual(e.spoken.map((s) => s.text), ["One.", "Two.", "Two."]);
});

test("a late end event from a cancelled utterance is ignored", () => {
  const { e, p } = setup();
  p.play();
  const stale = e.staleHandlers();
  p.pause();
  stale.onend(); // the browser reporting the cancelled sentence
  assert.equal(p.state.index, 0);
  assert.equal(p.state.playing, false);
  assert.equal(e.spoken.length, 1);
});

test("skipping while playing speaks the new sentence and drops the old callback", () => {
  const { e, p } = setup();
  p.play();
  const stale = e.staleHandlers();
  p.next();
  stale.onend();
  assert.equal(p.state.index, 1);
  assert.deepEqual(e.spoken.map((s) => s.text), ["One.", "Two."]);
});

test("skipping stays inside the list and works while paused", () => {
  const { e, p } = setup();
  p.prev();
  assert.equal(p.state.index, 0);
  p.next();
  p.next();
  p.next();
  assert.equal(p.state.index, 2);
  assert.equal(e.spoken.length, 0, "nothing is spoken while paused");
});

test("changing the rate restarts the current sentence at the new speed, within limits", () => {
  const { e, p } = setup();
  p.play();
  p.setRate(1.5);
  p.setRate(99);
  assert.equal(p.state.rate, 3);
  p.setRate(0.1);
  assert.equal(p.state.rate, 0.5);
  assert.deepEqual(e.spoken.map((s) => s.rate), [1, 1.5, 3, 0.5]);
});

test("a real speech error stops playback and reports it; a cancel does not", () => {
  const { e, p } = setup();
  p.play();
  e.fail("interrupted");
  assert.equal(p.state.playing, true);
  e.fail("synthesis-failed");
  assert.equal(p.state.playing, false);
  assert.equal(p.state.error, "synthesis-failed");
});

test("load starts a fresh list from the requested sentence and silences the old one", () => {
  const { e, p } = setup();
  p.play();
  const before = e.cancels;
  p.load(["A.", "B.", "C."], 2);
  assert.equal(p.state.index, 2);
  assert.equal(p.state.playing, false);
  assert.ok(e.cancels > before);
});

test("nothing happens with an empty list", () => {
  const { e, p } = setup([]);
  p.play();
  assert.equal(p.state.playing, false);
  assert.equal(e.spoken.length, 0);
});

// --- saved position ---------------------------------------------------------

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
};

test("the same text always gets the same id, different text a different one", () => {
  assert.equal(documentId("hello"), documentId("hello"));
  assert.notEqual(documentId("hello"), documentId("hellp"));
});

test("position is saved and loaded per document", () => {
  const s = memoryStorage();
  assert.equal(savePosition(s, "doc", { chapter: 2, sentence: 7 }), true);
  assert.equal(loadPosition(s, "other"), null);
  const p = loadPosition(s, "doc");
  assert.equal(p.chapter, 2);
  assert.equal(p.sentence, 7);
});

test("blocked storage never throws", () => {
  const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.equal(savePosition(broken, "d", { chapter: 0, sentence: 0 }), false);
  assert.equal(loadPosition(broken, "d"), null);
});

test("corrupt saved data is ignored", () => {
  const s = memoryStorage();
  s.setItem("accessible-reader:pos:d", "not json");
  assert.equal(loadPosition(s, "d"), null);
  s.setItem("accessible-reader:pos:d", JSON.stringify({ chapter: -1, sentence: "x" }));
  assert.equal(loadPosition(s, "d"), null);
});

test("a saved position is pulled back inside the document", () => {
  const chapters = [{ sentenceCount: 5 }, { sentenceCount: 3 }];
  assert.deepEqual(clampPosition({ chapter: 1, sentence: 99 }, chapters), { chapter: 1, sentence: 2 });
  assert.deepEqual(clampPosition({ chapter: 9, sentence: 4 }, chapters), { chapter: 1, sentence: 0 });
  assert.deepEqual(clampPosition(null, chapters), { chapter: 0, sentence: 0 });
});
