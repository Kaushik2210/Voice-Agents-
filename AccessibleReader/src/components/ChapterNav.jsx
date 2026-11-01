import { useState } from "react";
import { formatMinutes, minutesFor } from "../lib/time.js";

const pad = (n) => String(n).padStart(2, "0");

export default function ChapterNav({ chapters, current, onSelect }) {
  // Open on wide screens, closed on narrow ones so the text comes first.
  const [open, setOpen] = useState(() => typeof window === "undefined" || window.matchMedia("(min-width: 861px)").matches);

  return (
    <nav className="chapters" aria-label="Chapters">
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>
          <span>Chapters</span> <span className="count">{chapters.length}</span>
        </summary>
        <ol>
          {chapters.map((c, i) => (
            <li key={i}>
              <button type="button" aria-current={i === current ? "true" : undefined} onClick={() => onSelect(i)}>
                <span className="num" aria-hidden="true">
                  {pad(i + 1)}
                </span>
                <span className="ch-title">{c.title}</span>
                <span className="mins">{formatMinutes(minutesFor(c.words), { short: true })}</span>
              </button>
            </li>
          ))}
        </ol>
      </details>
    </nav>
  );
}
