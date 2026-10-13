import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";

const SECTIONS = ["subjective", "objective", "assessment", "plan"];

function fmt(seconds) {
  if (seconds == null) return "";
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function Health() {
  const [h, setH] = useState(null);
  useEffect(() => {
    api.health().then(setH).catch(() => setH({ api: false }));
  }, []);
  if (!h) return null;
  const dot = (ok, label) => (
    <span className={`pill ${ok ? "ok" : "bad"}`}>{label}</span>
  );
  return (
    <div className="health">
      {dot(h.api, "API")}
      {dot(h.voicestudio, "VoiceStudio")}
      {dot(h.ollama, "Ollama")}
    </div>
  );
}

function UploadForm({ onCreated }) {
  const [file, setFile] = useState(null);
  const [ref, setRef] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("audio", file);
      form.append("patient_ref", ref);
      form.append("consent", String(consent));
      const created = await api.create(form);
      setFile(null);
      setRef("");
      setConsent(false);
      onCreated(created.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>New consultation</h2>
      <label>
        Patient reference <small>(MRN or visit number, not a name)</small>
        <input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={64} required />
      </label>
      <label>
        Recording
        <input type="file" accept="audio/*,.webm" onChange={(e) => setFile(e.target.files[0])} required />
      </label>
      <label className="check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        The patient has consented to this consultation being recorded and processed.
      </label>
      {error && <p className="error">{error}</p>}
      <button disabled={busy || !consent || !file || !ref.trim()}>
        {busy ? "Uploading…" : "Create note"}
      </button>
    </form>
  );
}

function Detail({ id, onDeleted }) {
  const [c, setC] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [active, setActive] = useState(new Set());
  const [lists, setLists] = useState({}); // edited allergies / medications, one entry per line
  const [ack, setAck] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => api.get(id).then(setC).catch((e) => setError(e.message)), [id]);

  useEffect(() => {
    setC(null);
    setDrafts({});
    setLists({});
    setAck(false);
    setActive(new Set());
    load();
  }, [load]);

  // Poll while the pipeline is still working.
  useEffect(() => {
    if (c?.status !== "processing") return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [c?.status, load]);

  if (error) return <p className="error">{error}</p>;
  if (!c) return <p>Loading…</p>;

  const editable = c.status === "ready";
  const dirty = Object.keys(drafts).length > 0 || Object.keys(lists).length > 0;
  const flags = c.note?.flags || [];
  const needsAck = flags.length > 0;
  const listText = (key) => lists[key] ?? (c.note?.[key] || []).map((e) => e.text).join("\n");
  const toLines = (value) => value.split("\n").map((s) => s.trim()).filter(Boolean);

  async function run(fn) {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    }
  }

  const save = () => run(async () => {
    const changes = { sections: drafts };
    for (const key of Object.keys(lists)) changes[key] = toLines(lists[key]);
    setC(await api.edit(id, changes));
    setDrafts({});
    setLists({});
  });
  const approve = () => run(async () => setC(await api.approve(id, ack)));
  const remove = () => run(async () => {
    if (!window.confirm("Delete this consultation permanently?")) return;
    await api.remove(id);
    onDeleted();
  });
  const download = () => run(async () => {
    const md = await api.exportMarkdown(id);
    const url = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${c.patient_ref}.md` });
    a.click();
    URL.revokeObjectURL(url);
  });

  return (
    <div className="detail">
      <header>
        <h2>{c.patient_ref}</h2>
        <span className={`pill status-${c.status}`}>{c.status}</span>
      </header>

      {c.status === "processing" && <p>Transcribing and drafting the note. This can take a few minutes…</p>}
      {c.status === "failed" && <p className="error">{c.error}</p>}

      {c.note && (
        <section className="note">
          <p className="disclaimer">{c.note.disclaimer}</p>
          {flags.map((flag) => (
            <p key={flag} className="flag" role="alert">{flag}</p>
          ))}
          <div className="safety">
            {[
              ["allergies", "Allergies"],
              ["medications", "Current medications"],
            ].map(([key, label]) => (
              <div key={key} className="section">
                <h3>{label} <small>(one per line)</small></h3>
                <textarea
                  disabled={!editable}
                  value={listText(key)}
                  placeholder="None stated"
                  onChange={(e) => setLists({ ...lists, [key]: e.target.value })}
                  rows={2}
                />
                <div className="sources">
                  {[...new Set((c.note[key] || []).flatMap((e) => e.sources))].map((i) => (
                    <button key={i} type="button" className="chip" onClick={() => setActive(new Set([i]))}>
                      {fmt(c.segments[i]?.start) || `#${i}`}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {SECTIONS.map((name) => {
            const sec = c.note.sections[name];
            return (
              <div key={name} className="section">
                <h3>{name}</h3>
                <textarea
                  disabled={!editable}
                  value={drafts[name] ?? sec.text}
                  onChange={(e) => setDrafts({ ...drafts, [name]: e.target.value })}
                  rows={3}
                />
                <div className="sources">
                  {sec.sources.map((i) => (
                    <button key={i} type="button" className="chip" onClick={() => setActive(new Set(sec.sources))}>
                      {fmt(c.segments[i]?.start) || `#${i}`}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {editable && needsAck && (
            <label className="check">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              I have checked the flagged items above against the transcript.
            </label>
          )}
          {c.note.action_items.length > 0 && (
            <div className="section">
              <h3>Action items</h3>
              <ul>
                {c.note.action_items.map((item, k) => (
                  <li key={k} onClick={() => setActive(new Set(item.sources))}>{item.text}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="actions">
            {editable && <button onClick={save} disabled={!dirty}>Save edits</button>}
            {editable && (
              <button className="primary" onClick={approve} disabled={dirty || (needsAck && !ack)}>
                Approve note
              </button>
            )}
            <button onClick={download}>Export Markdown</button>
            <button className="danger" onClick={remove}>Delete</button>
          </div>
        </section>
      )}

      {c.segments.length > 0 && (
        <section className="transcript">
          <h3>Transcript {c.redactions > 0 && <small>({c.redactions} identifiers masked)</small>}</h3>
          {c.segments.map((s, i) => (
            <p key={i} className={active.has(i) ? "hit" : ""}>
              <span className="ts">{fmt(s.start) || `#${i}`}</span> {s.text}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}

export default function App() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);

  const refresh = useCallback(() => api.list().then(setItems).catch(() => {}), []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="app">
      <header className="top">
        <h1>ClinicScribe</h1>
        <Health />
      </header>
      <div className="layout">
        <aside>
          <UploadForm
            onCreated={(id) => {
              refresh();
              setSelected(id);
            }}
          />
          <ul className="list">
            {items.map((i) => (
              <li key={i.id} className={i.id === selected ? "sel" : ""} onClick={() => setSelected(i.id)}>
                <strong>{i.patient_ref}</strong>
                <span className={`pill status-${i.status}`}>{i.status}</span>
                <small>{new Date(i.created_at).toLocaleString()}</small>
              </li>
            ))}
            {items.length === 0 && <li className="empty">No consultations yet.</li>}
          </ul>
        </aside>
        <main>
          {selected ? (
            <Detail
              id={selected}
              onDeleted={() => {
                setSelected(null);
                refresh();
              }}
            />
          ) : (
            <p className="empty">Select a consultation or create a new one.</p>
          )}
        </main>
      </div>
    </div>
  );
}
