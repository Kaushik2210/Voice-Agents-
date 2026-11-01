import { useEffect, useMemo, useRef } from "react";
import { cssVars } from "../lib/prefs.js";

// Index of each sentence within the chapter's flat list, per paragraph.
function offsets(paragraphs) {
  const out = [];
  let n = 0;
  for (const sentences of paragraphs) {
    out.push(n);
    n += sentences.length;
  }
  return out;
}

const pad = (n) => String(n).padStart(2, "0");

export default function ReaderPane({ chapter, number, total, readTime, current, playing, prefs, onSeek }) {
  const starts = useMemo(() => offsets(chapter.paragraphs), [chapter]);
  const currentRef = useRef(null);
  const top = useRef(null);

  // New chapter: start at its heading.
  useEffect(() => {
    top.current?.scrollIntoView({ block: "start" });
  }, [chapter]);

  // Keep the sentence being read in view, but only move the page when it has left the screen.
  useEffect(() => {
    const el = currentRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 120;
    const hidden = r.top < margin || r.bottom > window.innerHeight - 140;
    if (!hidden) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [current, chapter]);

  return (
    <article className="reader" style={cssVars(prefs)} data-focus={prefs.focus ? "on" : "off"} data-playing={playing ? "yes" : "no"}>
      <p className="chapter-eyebrow">
        {pad(number)} <span aria-hidden="true">/</span> {pad(total)} <span className="dot" aria-hidden="true">·</span> {readTime}
      </p>
      <h2 ref={top} tabIndex={-1}>
        {chapter.title}
      </h2>
      {chapter.paragraphs.map((sentences, p) => (
        <p key={p}>
          {sentences.map((text, s) => {
            const i = starts[p] + s;
            const isCurrent = i === current;
            return (
              <span
                key={s}
                ref={isCurrent ? currentRef : undefined}
                className={isCurrent ? "sentence current" : "sentence"}
                data-i={i}
                onClick={() => onSeek(i)}
              >
                {text}{" "}
              </span>
            );
          })}
        </p>
      ))}
    </article>
  );
}
