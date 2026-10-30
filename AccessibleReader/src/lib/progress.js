// Remember where the reader stopped, per document, in the browser only.
//
// Storage is injected so this can be tested, and so a blocked or full
// localStorage (private windows, strict settings) never breaks reading.

const PREFIX = "accessible-reader:pos:";

// FNV-1a over the text, so the same document gets the same id every time.
export function documentId(text) {
  let h = 0x811c9dc5;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16).padStart(8, "0")}-${s.length}`;
}

export function savePosition(storage, id, position) {
  try {
    storage.setItem(PREFIX + id, JSON.stringify({ ...position, savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function loadPosition(storage, id) {
  try {
    const raw = storage.getItem(PREFIX + id);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return Number.isInteger(p.chapter) && Number.isInteger(p.sentence) && p.chapter >= 0 && p.sentence >= 0 ? p : null;
  } catch {
    return null;
  }
}

// Keep a saved position only if it still points inside the document.
export function clampPosition(position, chapters) {
  if (!position || chapters.length === 0) return { chapter: 0, sentence: 0 };
  const chapter = Math.min(position.chapter, chapters.length - 1);
  const count = chapters[chapter].sentenceCount;
  return { chapter, sentence: position.chapter > chapters.length - 1 ? 0 : Math.min(position.sentence, Math.max(0, count - 1)) };
}
