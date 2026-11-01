// Read a PDF in the browser with pdf.js. The file is never uploaded anywhere.
//
// Chapters come from the PDF's outline (its bookmarks) when it has one; each
// top-level entry runs until the next. Without an outline the text is read as a
// whole and chapters are guessed from headings. A PDF that is only scanned
// pictures has no text to read; that is reported instead of returning nothing.

import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { buildChapters, detectChapters } from "./chapters.js";
import { buildDocument, titleFromFileName } from "./document.js";
import { itemsToLines, joinPages, removeRunningHeads } from "./layout.js";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export class NoTextError extends Error {
  constructor() {
    super("This PDF has no text I can read. It is probably scanned pictures of pages, which needs OCR.");
    this.name = "NoTextError";
  }
}

async function outlineStarts(doc) {
  let outline;
  try {
    outline = await doc.getOutline();
  } catch {
    return [];
  }
  if (!outline?.length) return [];
  const starts = [];
  for (const entry of outline) {
    try {
      const dest = typeof entry.dest === "string" ? await doc.getDestination(entry.dest) : entry.dest;
      if (!dest) continue;
      const page = await doc.getPageIndex(dest[0]);
      starts.push({ title: entry.title.trim(), page });
    } catch {
      /* an outline entry that points nowhere is skipped */
    }
  }
  // Keep entries in page order and drop two entries that land on the same page.
  return starts
    .sort((a, b) => a.page - b.page)
    .filter((s, i, all) => s.title && (i === 0 || s.page !== all[i - 1].page));
}

export async function readPdf(file, onProgress = () => {}) {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;

  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items = content.items
      .filter((it) => "str" in it)
      .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], h: it.height || Math.hypot(it.transform[2], it.transform[3]) }));
    pages.push(itemsToLines(items));
    onProgress(i, doc.numPages);
  }

  const cleaned = removeRunningHeads(pages);
  if (!cleaned.some((lines) => lines.length > 0)) throw new NoTextError();

  const title = titleFromFileName(file.name);
  const starts = await outlineStarts(doc);

  if (starts.length >= 2) {
    const chapters = starts.map((s, i) => {
      const end = i + 1 < starts.length ? starts[i + 1].page : cleaned.length;
      return { title: s.title, paragraphs: joinPages(cleaned.slice(s.page, end)) };
    });
    if (starts[0].page > 0) chapters.unshift({ title: "Beginning", paragraphs: joinPages(cleaned.slice(0, starts[0].page)) });
    return buildDocument({ title, chapters });
  }

  const paragraphs = joinPages(cleaned);
  return buildDocument({ title, chapters: buildChapters(paragraphs, detectChapters(paragraphs)) });
}
