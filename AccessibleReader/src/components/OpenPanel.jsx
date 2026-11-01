import { useRef, useState } from "react";

const ACCEPT = ".pdf,.txt,.md,.markdown,text/plain,application/pdf";

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
      <h2 id="open-title">Open something to read</h2>
      <p className="lede">
        Choose a PDF, text or Markdown file, or paste some text. It is read in your browser and
        never uploaded.
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
          Choose a file
        </button>
        <span className="muted">or drop one here</span>
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

      <form
        className="paste"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) onText(text);
        }}
      >
        <label htmlFor="paste-text">Paste text</label>
        <textarea id="paste-text" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste an article, an email or a chapter…" />
        <button type="submit" disabled={!text.trim() || !!busy}>
          Read this text
        </button>
      </form>

      <p className="muted sample-line">
        Just looking? <button type="button" className="link" onClick={onSample}>Try the short sample</button>
      </p>
    </section>
  );
}
