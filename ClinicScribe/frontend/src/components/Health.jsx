import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function Health() {
  const [h, setH] = useState(null);
  useEffect(() => {
    api.health().then(setH).catch(() => setH({ api: false }));
  }, []);
  if (!h) return null;
  if (h.demo) {
    return (
      <div className="health">
        <span className="chip neutral">Demo data</span>
      </div>
    );
  }
  const chip = (ok, label) => (
    <span className={`chip ${ok ? "ok" : "bad"}`}>
      {label}
      <span className="sr-only">{ok ? " is running" : " is not reachable"}</span>
    </span>
  );
  return (
    <div className="health" role="group" aria-label="Local services">
      {chip(h.api, "API")}
      {chip(h.voicestudio, "Speech")}
      {chip(h.ollama, "Notes")}
    </div>
  );
}
