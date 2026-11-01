import { useCallback, useEffect, useState } from "react";
import { DEMO, api } from "./api.js";
import Detail from "./components/Detail.jsx";
import Health from "./components/Health.jsx";
import { AsteriskIcon } from "./components/Icons.jsx";
import StatusChip from "./components/StatusChip.jsx";
import UploadForm from "./components/UploadForm.jsx";
import { formatDate } from "./lib/format.js";

export default function App() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  // The list is open on wide screens and folded away on phones, so the note comes first.
  const [listOpen, setListOpen] = useState(() => typeof window === "undefined" || window.matchMedia("(min-width: 861px)").matches);

  const refresh = useCallback(() => api.list().then(setItems).catch(() => {}), []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  // The demo has a clean note and a flagged one; open the first straight away.
  useEffect(() => {
    if (DEMO && items.length > 0 && selected === null) setSelected(items[0].id);
  }, [items, selected]);

  return (
    <div className="app">
      <header className="top">
        <h1 className="brand">
          <span className="brand-star" aria-hidden="true">
            <AsteriskIcon size={18} />
          </span>
          <span>
            Clinic<em>Scribe</em>
          </span>
        </h1>
        <Health />
      </header>

      {DEMO && (
        <aside className="demo-note" role="note">
          <p className="eyebrow">Demo</p>
          <p>
            Synthetic data: a computer voice reading a script, so no patients are involved. Open{" "}
            <strong>MRN-DEMO-002</strong> to see the app flag a wrong follow-up rule. Edits reset when you reload.
            Uploads are off; the real app runs on a clinic&apos;s own computer, so recordings never leave it.
          </p>
        </aside>
      )}

      <div className="layout">
        <aside className="index">
          <UploadForm
            onCreated={(id) => {
              refresh();
              setSelected(id);
            }}
          />
          <nav aria-label="Consultations">
            <details open={listOpen} onToggle={(e) => setListOpen(e.currentTarget.open)}>
              <summary>
                <span>Consultations</span> <span className="count">{items.length}</span>
              </summary>
              {items.length === 0 ? (
                <p className="empty">No consultations yet.</p>
              ) : (
                <ol>
                  {items.map((i) => (
                    <li key={i.id}>
                      <button type="button" aria-current={i.id === selected ? "true" : undefined} onClick={() => setSelected(i.id)}>
                        <span className="ref">{i.patient_ref}</span>
                        <StatusChip status={i.status} />
                        <span className="when">{formatDate(i.created_at)}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </details>
          </nav>
        </aside>

        <main>
          {selected ? (
            <Detail
              id={selected}
              onStatus={refresh}
              onDeleted={() => {
                setSelected(null);
                refresh();
              }}
            />
          ) : (
            <p className="empty">Select a consultation{DEMO ? "" : " or create a new one"}.</p>
          )}
        </main>
      </div>
    </div>
  );
}
