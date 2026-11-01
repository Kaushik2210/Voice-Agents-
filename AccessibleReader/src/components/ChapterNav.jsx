import { useState } from "react";

export default function ChapterNav({ chapters, current, onSelect }) {
  // Open on wide screens, closed on narrow ones so the text comes first.
  const [open, setOpen] = useState(() => typeof window === "undefined" || window.matchMedia("(min-width: 861px)").matches);

  return (
    <nav className="chapters" aria-label="Chapters">
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>
          Chapters <span className="muted">({chapters.length})</span>
        </summary>
        <ol>
          {chapters.map((c, i) => (
            <li key={i}>
              <button type="button" aria-current={i === current ? "true" : undefined} onClick={() => onSelect(i)}>
                <span className="ch-title">{c.title}</span>
              </button>
            </li>
          ))}
        </ol>
      </details>
    </nav>
  );
}
