import { useState } from "react";
import { api, DEMO } from "../api.js";
import { DEMO_UPLOAD_MESSAGE } from "../demo.js";

export default function UploadForm({ onCreated }) {
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

  if (DEMO) {
    // Say why the form is unavailable instead of leaving a dead control.
    return (
      <section className="card demo-card" aria-labelledby="new-consultation">
        <p className="eyebrow">New consultation</p>
        <h2 id="new-consultation">Uploads are off</h2>
        <p className="muted">{DEMO_UPLOAD_MESSAGE}</p>
      </section>
    );
  }

  return (
    <form className="card" onSubmit={submit}>
      <p className="eyebrow">New consultation</p>
      <h2>Record to note</h2>
      <div className="field">
        <label htmlFor="patient-ref">
          Patient reference <span className="muted">(MRN or visit number, not a name)</span>
        </label>
        <input id="patient-ref" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={64} required />
      </div>
      <div className="field">
        <label htmlFor="recording">Recording</label>
        <input id="recording" type="file" accept="audio/*,.webm" onChange={(e) => setFile(e.target.files[0])} required />
      </div>
      <label className="check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>The patient has consented to this consultation being recorded and processed.</span>
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="primary" disabled={busy || !consent || !file || !ref.trim()}>
        {busy ? "Uploading…" : "Create note"}
      </button>
    </form>
  );
}
