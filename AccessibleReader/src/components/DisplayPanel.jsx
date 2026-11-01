import { useId } from "react";
import { DEFAULTS } from "../lib/prefs.js";

const THEMES = [
  ["system", "Auto"],
  ["light", "Light"],
  ["dark", "Dark"],
  ["cream", "Cream"],
];

function Slider({ label, value, min, max, step, format, onChange }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="slider">
        <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        <output htmlFor={id}>{format(value)}</output>
      </div>
    </div>
  );
}

export default function DisplayPanel({ prefs, onChange, onPreset, onClose }) {
  return (
    <aside id="display-panel" className="display-panel" aria-label="Display settings">
      <div className="panel-head">
        <h2>Display</h2>
        <button type="button" onClick={onClose}>
          Done
        </button>
      </div>

      <p className="muted small">
        What helps differs from person to person, so every setting is yours to change. They are kept on this device only.
      </p>

      <div className="presets">
        <button type="button" onClick={() => onPreset("standard")}>
          Standard
        </button>
        <button type="button" onClick={() => onPreset("roomy")}>
          Roomy and calm
        </button>
      </div>

      <fieldset className="field">
        <legend>Theme <span className="muted">(Auto follows your device)</span></legend>
        <div className="segmented four">
          {THEMES.map(([value, label]) => (
            <label key={value}>
              <input type="radio" name="theme" value={value} checked={prefs.theme === value} onChange={() => onChange({ theme: value })} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="font-select">Typeface</label>
        <select id="font-select" value={prefs.font} onChange={(e) => onChange({ font: e.target.value })}>
          <option value="system">System</option>
          <option value="readable">Wide and open</option>
          <option value="serif">Serif</option>
        </select>
      </div>

      <Slider label="Text size" value={prefs.size} min={0.9} max={2.6} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(size) => onChange({ size })} />
      <Slider label="Line spacing" value={prefs.lineHeight} min={1.3} max={2.4} step={0.05} format={(v) => v.toFixed(2)} onChange={(lineHeight) => onChange({ lineHeight })} />
      <Slider label="Letter spacing" value={prefs.letterSpacing} min={0} max={0.2} step={0.01} format={(v) => `${v.toFixed(2)} em`} onChange={(letterSpacing) => onChange({ letterSpacing })} />
      <Slider label="Word spacing" value={prefs.wordSpacing} min={0} max={0.5} step={0.02} format={(v) => `${v.toFixed(2)} em`} onChange={(wordSpacing) => onChange({ wordSpacing })} />
      <Slider label="Line length" value={prefs.width} min={30} max={90} step={1} format={(v) => `${v} characters`} onChange={(width) => onChange({ width })} />

      <label className="check">
        <input type="checkbox" checked={prefs.focus} onChange={(e) => onChange({ focus: e.target.checked })} />
        <span>
          Dim everything except the sentence being read
          <small className="muted"> Helps some people keep their place.</small>
        </span>
      </label>

      <button type="button" className="reset" onClick={() => onPreset("standard")} disabled={JSON.stringify({ ...prefs, rate: 0, voiceURI: 0 }) === JSON.stringify({ ...DEFAULTS, rate: 0, voiceURI: 0 })}>
        Reset display settings
      </button>
    </aside>
  );
}
