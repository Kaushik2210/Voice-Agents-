// The document model the reader works with.
//
//   { id, title, chapters: [{ title, paragraphs: [[sentence, ...], ...],
//                              flat: [{ p, s, text }], sentenceCount }] }
//
// `flat` is the chapter's sentences in reading order, each remembering which
// paragraph and sentence it belongs to, so the player can speak a flat list while
// the screen highlights the right word-group inside a paragraph.

import { buildChapters, detectChapters, toParagraphs } from "./chapters.js";
import { documentId } from "./progress.js";
import { splitSentences } from "./sentences.js";
import { countWords } from "./time.js";

export function buildDocument({ title, chapters }) {
  const built = chapters
    .map((c) => {
      const paragraphs = c.paragraphs.map(splitSentences).filter((s) => s.length > 0);
      const flat = [];
      paragraphs.forEach((sentences, p) => sentences.forEach((text, s) => flat.push({ p, s, text, words: countWords(text) })));
      // wordsFrom[i] is how many words are left from sentence i to the end of the chapter.
      const wordsFrom = new Array(flat.length + 1).fill(0);
      for (let i = flat.length - 1; i >= 0; i--) wordsFrom[i] = wordsFrom[i + 1] + flat[i].words;
      return { title: c.title, paragraphs, flat, sentenceCount: flat.length, words: wordsFrom[0], wordsFrom };
    })
    .filter((c) => c.sentenceCount > 0);

  const fingerprint = built.map((c) => c.title + c.flat.map((f) => f.text).join(" ")).join("\n");
  return { id: documentId(fingerprint), title: title || "Untitled", chapters: built };
}

export function fromText(text, title = "Pasted text") {
  const paragraphs = toParagraphs(text);
  return buildDocument({ title, chapters: buildChapters(paragraphs, detectChapters(paragraphs)) });
}

export function titleFromFileName(name) {
  return name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Untitled";
}
