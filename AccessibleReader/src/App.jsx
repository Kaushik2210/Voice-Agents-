import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChapterNav from "./components/ChapterNav.jsx";
import DisplayPanel from "./components/DisplayPanel.jsx";
import { DisplayIcon } from "./components/Icons.jsx";
import OpenPanel from "./components/OpenPanel.jsx";
import PlayerBar from "./components/PlayerBar.jsx";
import ReaderPane from "./components/ReaderPane.jsx";
import { fromText, titleFromFileName } from "./lib/document.js";
import { createPlayer } from "./lib/player.js";
import { PRESETS, loadPrefs, savePrefs } from "./lib/prefs.js";
import { clampPosition, loadPosition, savePosition } from "./lib/progress.js";
import { SAMPLE_TEXT, SAMPLE_TITLE } from "./lib/sample.js";
import { browserEngine, loadVoices, sortVoices, speechSupported } from "./lib/speech.js";

const MAX_FILE_MB = 80;
const INTERACTIVE = "input, textarea, select, button, a, summary, [contenteditable='true']";

export default function App() {
  const supported = speechSupported();
  const [prefs, setPrefs] = useState(() => loadPrefs());
  const [doc, setDoc] = useState(null);
  const [chapter, setChapter] = useState(0);
  const [playback, setPlayback] = useState({ index: 0, playing: false, error: null });
  const [voices, setVoices] = useState([]);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [showDisplay, setShowDisplay] = useState(false);
  const [status, setStatus] = useState("");

  // The player outlives renders; callbacks read the latest state through refs.
  const live = useRef({ doc: null, chapter: 0 });
  const startAt = useRef(0);
  const autoplay = useRef(false);
  live.current = { doc, chapter };

  const player = useMemo(
    () =>
      createPlayer({
        speak: browserEngine.speak,
        cancel: browserEngine.cancel,
        onChange: (s) => setPlayback({ index: s.index, playing: s.playing, error: s.error }),
        onFinish: () => {
          const { doc: d, chapter: c } = live.current;
          if (d && c < d.chapters.length - 1) {
            autoplay.current = true;
            setChapter(c + 1);
          } else {
            setStatus("Finished reading.");
          }
        },
      }),
    [],
  );

  // --- load voices once -----------------------------------------------------
  useEffect(() => {
    loadVoices().then((v) => setVoices(sortVoices(v)));
  }, []);

  // --- preferences ----------------------------------------------------------
  useEffect(() => {
    savePrefs(prefs);
    if (prefs.theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", prefs.theme);
  }, [prefs]);
  useEffect(() => player.setRate(prefs.rate), [player, prefs.rate]);
  useEffect(() => {
    player.setVoice(voices.find((v) => v.voiceURI === prefs.voiceURI) ?? null);
  }, [player, voices, prefs.voiceURI]);

  const patchPrefs = useCallback((patch) => setPrefs((p) => ({ ...p, ...patch })), []);
  const applyPreset = useCallback((name) => setPrefs((p) => ({ ...p, ...PRESETS[name], rate: p.rate, voiceURI: p.voiceURI })), []);

  // --- load the current chapter into the player ------------------------------
  useEffect(() => {
    if (!doc) return;
    const sentences = doc.chapters[chapter].flat.map((f) => f.text);
    player.load(sentences, startAt.current);
    startAt.current = 0;
    if (autoplay.current) {
      autoplay.current = false;
      player.play();
    }
  }, [doc, chapter, player]);

  // --- remember the place ---------------------------------------------------
  useEffect(() => {
    if (!doc) return;
    const t = setTimeout(() => savePosition(window.localStorage, doc.id, { chapter, sentence: playback.index }), 400);
    return () => clearTimeout(t);
  }, [doc, chapter, playback.index]);

  // --- opening things -------------------------------------------------------
  const show = useCallback(
    (next) => {
      if (!next.chapters.length) {
        setError("I could not find any text to read in that.");
        return;
      }
      const pos = clampPosition(loadPosition(window.localStorage, next.id), next.chapters);
      player.stop();
      startAt.current = pos.sentence;
      autoplay.current = false;
      setError("");
      setChapter(pos.chapter);
      setDoc(next);
      setStatus(pos.chapter > 0 || pos.sentence > 0 ? `Opened ${next.title}. Picked up where you left off.` : `Opened ${next.title}.`);
    },
    [player],
  );

  const openFile = useCallback(
    async (file) => {
      setError("");
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        setError(`That file is over ${MAX_FILE_MB} MB, which is more than I can read in the browser.`);
        return;
      }
      try {
        if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
          setBusy({ label: "Reading the PDF…", value: 0, max: 1 });
          const { readPdf } = await import("./lib/pdf.js"); // loaded only when a PDF is opened
          const next = await readPdf(file, (value, max) => setBusy({ label: `Reading page ${value} of ${max}…`, value, max }));
          show(next);
        } else {
          show(fromText(await file.text(), titleFromFileName(file.name)));
        }
      } catch (e) {
        setError(e?.name === "NoTextError" ? e.message : "I could not read that file. Is it a valid PDF or text file?");
      } finally {
        setBusy(null);
      }
    },
    [show],
  );

  const openPasted = useCallback((text) => show(fromText(text, "Pasted text")), [show]);
  const openSample = useCallback(() => show(fromText(SAMPLE_TEXT, SAMPLE_TITLE)), [show]);
  const closeDoc = useCallback(() => {
    player.stop();
    setDoc(null);
    setStatus("");
  }, [player]);

  // --- moving around --------------------------------------------------------
  const goChapter = useCallback(
    (i) => {
      const { doc: d } = live.current;
      if (!d || i < 0 || i >= d.chapters.length) return;
      if (i === live.current.chapter) {
        player.seek(0); // choosing the chapter you are in means "from the top"
        return;
      }
      autoplay.current = player.state.playing;
      startAt.current = 0;
      setChapter(i);
      setStatus(`Now in ${d.chapters[i].title}. Chapter ${i + 1} of ${d.chapters.length}.`);
    },
    [player],
  );
  const seekAndPlay = useCallback(
    (i) => {
      player.seek(i);
      player.play();
    },
    [player],
  );

  // --- keyboard -------------------------------------------------------------
  useEffect(() => {
    function onKey(e) {
      if (!live.current.doc || e.ctrlKey || e.metaKey || e.altKey) return;
      const inField = e.target.closest?.("input, textarea, select, [contenteditable='true']");
      if (inField) return;
      const onControl = e.target.closest?.(INTERACTIVE);
      switch (e.key) {
        case " ":
          if (onControl) return; // Space must still press a focused button
          e.preventDefault();
          player.toggle();
          break;
        case "ArrowRight":
          e.preventDefault();
          player.next();
          break;
        case "ArrowLeft":
          e.preventDefault();
          player.prev();
          break;
        case "]":
          goChapter(live.current.chapter + 1);
          break;
        case "[":
          goChapter(live.current.chapter - 1);
          break;
        case "=":
        case "+":
          patchPrefs({ rate: Math.min(3, +(prefs.rate + 0.25).toFixed(2)) });
          break;
        case "-":
          patchPrefs({ rate: Math.max(0.5, +(prefs.rate - 0.25).toFixed(2)) });
          break;
        default:
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [player, goChapter, patchPrefs, prefs.rate]);

  const current = doc?.chapters[chapter];

  return (
    <div className="app">
      <header className="top">
        <h1>
          <a href="./" onClick={(e) => { if (doc) { e.preventDefault(); closeDoc(); } }}>Accessible Reader</a>
        </h1>
        {doc && <p className="doc-title" title={doc.title}>{doc.title}</p>}
        <div className="top-actions">
          {doc && (
            <button type="button" onClick={closeDoc}>
              Open another
            </button>
          )}
          <button type="button" className="with-icon" aria-expanded={showDisplay} aria-controls="display-panel" onClick={() => setShowDisplay((s) => !s)}>
            <DisplayIcon /> Display
          </button>
        </div>
      </header>

      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>

      {showDisplay && <DisplayPanel prefs={prefs} onChange={patchPrefs} onPreset={applyPreset} onClose={() => setShowDisplay(false)} />}

      <main className={doc ? "layout" : "layout single"}>
        {!doc && <OpenPanel busy={busy} error={error} onFile={openFile} onText={openPasted} onSample={openSample} />}

        {doc && current && (
          <>
            <ChapterNav chapters={doc.chapters} current={chapter} onSelect={goChapter} />
            <ReaderPane chapter={current} current={playback.index} playing={playback.playing} prefs={prefs} onSeek={seekAndPlay} />
          </>
        )}
      </main>

      {doc && current && (
        <>
          <details className="help">
            <summary>Keyboard shortcuts and screen readers</summary>
            <ul>
              <li><kbd>Space</kbd> play or pause</li>
              <li><kbd>←</kbd> <kbd>→</kbd> previous or next sentence</li>
              <li><kbd>[</kbd> <kbd>]</kbd> previous or next chapter</li>
              <li><kbd>-</kbd> <kbd>+</kbd> slower or faster</li>
              <li>Click any sentence to start reading from it.</li>
            </ul>
            <p>
              Using a screen reader? Leave read-aloud paused and let your screen reader read the page: two voices at once is confusing.
            </p>
          </details>
          <PlayerBar
            supported={supported}
            playing={playback.playing}
            sentence={playback.index}
            sentenceCount={current.sentenceCount}
            chapter={chapter}
            chapterCount={doc.chapters.length}
            rate={prefs.rate}
            voices={voices}
            voiceURI={prefs.voiceURI}
            error={playback.error}
            onToggle={() => player.toggle()}
            onPrev={() => player.prev()}
            onNext={() => player.next()}
            onPrevChapter={() => goChapter(chapter - 1)}
            onNextChapter={() => goChapter(chapter + 1)}
            onRate={(rate) => patchPrefs({ rate })}
            onVoice={(voiceURI) => patchPrefs({ voiceURI })}
          />
        </>
      )}
    </div>
  );
}
