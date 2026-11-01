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

export function buildDocument({ title, chapters }) {
  const built = chapters
    .map((c) => {
      const paragraphs = c.paragraphs.map(splitSentences).filter((s) => s.length > 0);
      const flat = [];
      paragraphs.forEach((sentences, p) => sentences.forEach((text, s) => flat.push({ p, s, text })));
      return { title: c.title, paragraphs, flat, sentenceCount: flat.length };
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
