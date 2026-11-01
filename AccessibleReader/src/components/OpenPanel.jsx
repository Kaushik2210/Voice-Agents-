import { useRef, useState } from "react";
import { ArrowIcon, AsteriskIcon, PlayIcon } from "./Icons.jsx";

const ACCEPT = ".pdf,.txt,.md,.markdown,text/plain,application/pdf";

const STEPS = [
  ["01", "Open", "A PDF, a text or Markdown file, or just paste some text."],
  ["02", "Listen", "It reads a sentence at a time, and your place stays highlighted."],
  ["03", "Make it yours", "Size, spacing, line length, theme and speed. All remembered."],
];

const TAGS = ["PDF", "Markdown", "Plain text", "Nothing uploaded", "Keyboard friendly", "Works on a phone"];

// A picture of the product, not the product: decorative, so hidden from assistive
// technology. The highlight walks through three sentences unless motion is reduced.
function HeroPreview() {
  return (
    <figure className="preview" aria-hidden="true">
      <span className="preview-star">
        <AsteriskIcon size={54} />
      </span>
      <div className="preview-card">
        <p className="chapter-eyebrow">01 / 03 · about 2 min</p>
        <p className="preview-title">Reading with your ears</p>
        <p className="preview-text">
          <span className="s s1">Accessible Reader reads text aloud, one sentence at a time.</span>{" "}
          <span className="s s2">The sentence being spoken is highlighted, so your eyes can follow along if you want them to.</span>{" "}
          <span className="s s3">You can pause whenever you like.</span>
        </p>
        <div className="preview-dock">
          <span className="pd-play">
            <PlayIcon />
          </span>
          <span className="pd-bar">
            <i />
          </span>
          <span className="pd-speed">1.25×</span>
        </div>
      </div>
    </figure>
  );
}

export default function OpenPanel({ busy, error, onFile, onText, onSample }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const [text, setText] = useState("");

  function drop(e) {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  }

  return (
    <section className="open" aria-labelledby="open-title">
      <div className="open-main">
        <p className="eyebrow">
          <span className="star" aria-hidden="true">
            <AsteriskIcon size={16} />
          </span>
          Read aloud, in your browser
        </p>
        <h2 id="open-title">
          Hear any page.
          <br />
          <em>Read it your way.</em>
        </h2>
        <p className="lede">
          Open a document and listen to it one sentence at a time, with your place always in view.
          Change the size, spacing, colour and speed until it suits you. Your file is read on this
          device and never uploaded.
        </p>

        <div
          className={`drop${over ? " over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={drop}
        >
          <button type="button" className="primary" onClick={() => input.current?.click()} disabled={!!busy}>
            Choose a file <ArrowIcon />
          </button>
          <button type="button" className="outline" onClick={onSample}>
            Try the short sample
          </button>
          <span className="muted drop-hint">or drop a file anywhere in this box</span>
          <input
            ref={input}
            type="file"
            accept={ACCEPT}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) onFile(file);
            }}
          />
        </div>

        {busy && (
          <div className="busy" role="status">
            <label htmlFor="busy-progress">{busy.label}</label>
            <progress id="busy-progress" value={busy.value} max={busy.max} />
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <ul className="tags" aria-label="Good to know">
          {TAGS.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>

        <form
          className="paste"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) onText(text);
          }}
        >
          <label htmlFor="paste-text">Or paste text</label>
          <textarea id="paste-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="An article, an email, a chapter…" />
          <button type="submit" className="outline" disabled={!text.trim() || !!busy}>
            Read this text
          </button>
        </form>
      </div>

      <HeroPreview />

      <ol className="steps" aria-label="How it works">
        {STEPS.map(([n, title, body]) => (
          <li key={n}>
            <span className="num">{n}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
