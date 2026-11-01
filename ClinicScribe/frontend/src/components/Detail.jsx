import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { fmt, formatDate } from "../lib/format.js";
import { WarnIcon } from "./Icons.jsx";
import SpeakerRoles, { ROLES } from "./SpeakerRoles.jsx";
import StatusChip from "./StatusChip.jsx";

const SECTIONS = ["subjective", "objective", "assessment", "plan"];
const SAFETY = [
  ["allergies", "Allergies"],
  ["medications", "Current medications"],
];

// Timestamp chips that jump to the transcript lines a statement came from.
function Sources({ indices, segments, onPick }) {
  if (!indices.length) return null;
  return (
    <div className="sources" aria-label="Where this came from in the transcript">
      {indices.map((i) => (
        <button key={i} type="button" className="chip-btn" onClick={() => onPick(indices)}>
          {fmt(segments[i]?.start) || `#${i}`}
        </button>
      ))}
    </div>
  );
}

export default function Detail({ id, onDeleted, onStatus }) {
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
    setError("");
    load();
  }, [load]);

  // Keep the sidebar in step when this note finishes processing or is approved.
  useEffect(() => {
    if (c?.status) onStatus?.();
  }, [c?.status, onStatus]);

  // Poll while the pipeline is still working.
  useEffect(() => {
    if (c?.status !== "processing") return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [c?.status, load]);

  if (!c) {
    return error ? (
      <p className="error" role="alert">
        {error}
      </p>
    ) : (
      <p className="muted" role="status">
        Loading…
      </p>
    );
  }

  const editable = c.status === "ready";
  const dirty = Object.keys(drafts).length > 0 || Object.keys(lists).length > 0;
  const flags = c.note?.flags || [];
  const needsAck = flags.length > 0;
  const listText = (key) => lists[key] ?? (c.note?.[key] || []).map((e) => e.text).join("\n");
  const toLines = (value) => value.split("\n").map((s) => s.trim()).filter(Boolean);
  const speakers = [...new Set(c.segments.map((s) => s.speaker).filter(Boolean))];
  const roles = c.note?.speaker_roles || {};

  // Why Approve is unavailable, said in words rather than left as a greyed-out button.
  const approveHint = !editable
    ? ""
    : dirty
      ? "Save your edits before approving."
      : needsAck && !ack
        ? "Tick the box above to confirm you have checked the flagged items."
        : "";

  async function run(fn) {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    }
  }

  // With exactly two speakers, choosing one role gives the other speaker the opposite.
  const setRole = (speaker, role) => {
    const next = { ...roles, [speaker]: role };
    if (speakers.length === 2) {
      const other = speakers.find((s) => s !== speaker);
      next[other] = ROLES.find((r) => r !== role);
    }
    run(async () => setC(await api.edit(id, { speaker_roles: next })));
  };

  const save = () =>
    run(async () => {
      const changes = { sections: drafts };
      for (const key of Object.keys(lists)) changes[key] = toLines(lists[key]);
      setC(await api.edit(id, changes));
      setDrafts({});
      setLists({});
    });
  const approve = () => run(async () => setC(await api.approve(id, ack)));
  const remove = () =>
    run(async () => {
      if (!window.confirm("Delete this consultation permanently?")) return;
      await api.remove(id);
      onDeleted();
    });
  const download = () =>
    run(async () => {
      const md = await api.exportMarkdown(id);
      const url = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: `${c.patient_ref}.md` });
      a.click();
      URL.revokeObjectURL(url);
    });

  return (
    <div className="detail">
      <header className="detail-head">
        <div>
          <p className="eyebrow">Consultation · {formatDate(c.created_at)}</p>
          <h2>{c.patient_ref}</h2>
        </div>
        <StatusChip status={c.status} />
      </header>

      {c.status === "processing" && (
        <div className="processing" role="status">
          <label htmlFor="processing-progress">Transcribing and drafting the note. This can take a few minutes.</label>
          <progress id="processing-progress" />
        </div>
      )}
      {c.status === "failed" && (
        <p className="error" role="alert">
          {c.error}
        </p>
      )}

      {c.note && (
        <section className="note" aria-label="Drafted note">
          <p className="disclaimer">{c.note.disclaimer}</p>

          {flags.length > 0 && (
            <div className="flags">
              {flags.map((flag) => (
                <div key={flag} className="flag" role="alert">
                  <span className="flag-icon">
                    <WarnIcon />
                  </span>
                  <div>
                    <p className="eyebrow">Safety flag</p>
                    <p className="flag-text">{flag}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <section className="safety" aria-label="Allergies and current medications">
            <p className="eyebrow">Safety essentials</p>
            <div className="safety-grid">
              {SAFETY.map(([key, label]) => (
                <div key={key} className="block">
                  <h3 id={`label-${key}`}>
                    {label} <span className="hint-inline">one per line</span>
                  </h3>
                  <textarea
                    aria-labelledby={`label-${key}`}
                    disabled={!editable}
                    value={listText(key)}
                    placeholder="None stated"
                    onChange={(e) => setLists({ ...lists, [key]: e.target.value })}
                    rows={3}
                  />
                  <Sources indices={[...new Set((c.note[key] || []).flatMap((e) => e.sources))]} segments={c.segments} onPick={(list) => setActive(new Set(list))} />
                </div>
              ))}
            </div>
          </section>

          <div className="soap">
            {SECTIONS.map((name) => {
              const sec = c.note.sections[name];
              return (
                <div key={name} className="row">
                  <h3 id={`label-${name}`} className="row-label">
                    {name}
                  </h3>
                  <div className="row-body">
                    <textarea
                      aria-labelledby={`label-${name}`}
                      disabled={!editable}
                      value={drafts[name] ?? sec.text}
                      onChange={(e) => setDrafts({ ...drafts, [name]: e.target.value })}
                      rows={3}
                    />
                    <Sources indices={sec.sources} segments={c.segments} onPick={(list) => setActive(new Set(list))} />
                  </div>
                </div>
              );
            })}
          </div>

          {c.note.action_items.length > 0 && (
            <section className="actions-list" aria-label="Action items">
              <p className="eyebrow">Action items</p>
              <ol>
                {c.note.action_items.map((item, k) => (
                  <li key={k}>
                    <button type="button" className="item-btn" onClick={() => setActive(new Set(item.sources))}>
                      <span className="num" aria-hidden="true">
                        {String(k + 1).padStart(2, "0")}
                      </span>
                      <span>{item.text}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {editable && needsAck && (
            <label className="check ack">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              <span>I have checked the flagged items above against the transcript.</span>
            </label>
          )}

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          <div className="actions" role="group" aria-label="Note actions">
            <div className="actions-row">
              {editable && (
                <button type="button" className="outline" onClick={save} disabled={!dirty}>
                  Save edits
                </button>
              )}
              {editable && (
                <button type="button" className="primary" onClick={approve} disabled={dirty || (needsAck && !ack)} aria-describedby={approveHint ? "approve-hint" : undefined}>
                  Approve note
                </button>
              )}
              <button type="button" className="outline" onClick={download}>
                Export Markdown
              </button>
              <button type="button" className="danger" onClick={remove}>
                Delete
              </button>
            </div>
            {approveHint && (
              <p id="approve-hint" className="hint">
                {approveHint}
              </p>
            )}
          </div>
        </section>
      )}

      {c.segments.length > 0 && (
        <section className="transcript" aria-label="Transcript">
          <div className="transcript-head">
            <h3>Transcript</h3>
            {c.redactions > 0 && <span className="hint-inline">{c.redactions} identifier{c.redactions === 1 ? "" : "s"} masked</span>}
          </div>
          {speakers.length > 0 && <SpeakerRoles speakers={speakers} roles={roles} disabled={!editable} onChange={setRole} />}
          <div className="turns">
            {c.segments.map((s, i) => {
              const turnStart = s.speaker && s.speaker !== c.segments[i - 1]?.speaker;
              const side = speakers.indexOf(s.speaker) % 2 === 1 ? "b" : "a";
              return (
                <p key={i} className={active.has(i) ? "hit" : ""} data-side={s.speaker ? side : undefined}>
                  {turnStart && <span className="who">{roles[s.speaker] || s.speaker}</span>}
                  <span className="ts">{fmt(s.start) || `#${i}`}</span> {s.text}
                </p>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
