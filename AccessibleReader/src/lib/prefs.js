// How the text looks. Stored in the browser only; nothing is sent anywhere.

const KEY = "accessible-reader:prefs";

export const DEFAULTS = {
  theme: "system", // system | light | dark | cream
  font: "serif", // system | readable | serif
  size: 1.25, // rem
  lineHeight: 1.7,
  letterSpacing: 0, // em
  wordSpacing: 0, // em
  width: 62, // characters per line
  focus: false, // dim everything except the sentence being read
  rate: 1,
  voiceURI: null,
};

// A starting point, not a prescription: what helps varies from person to person,
// so every value stays adjustable.
export const PRESETS = {
  standard: { ...DEFAULTS },
  roomy: {
    theme: "cream",
    font: "readable",
    size: 1.4,
    lineHeight: 1.95,
    letterSpacing: 0.04,
    wordSpacing: 0.14,
    width: 52,
    focus: true,
  },
};

export const FONT_STACKS = {
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  // Wide, open letterforms that are commonly recommended for readability.
  readable: '"Atkinson Hyperlegible", Verdana, Tahoma, "Trebuchet MS", sans-serif',
  serif: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
};

const LIMITS = {
  size: [0.9, 2.6],
  lineHeight: [1.3, 2.4],
  letterSpacing: [0, 0.2],
  wordSpacing: [0, 0.5],
  width: [30, 90],
  rate: [0.5, 3],
};

export function sanitise(raw) {
  const out = { ...DEFAULTS };
  if (!raw || typeof raw !== "object") return out;
  for (const [key, [lo, hi]] of Object.entries(LIMITS)) {
    const n = Number(raw[key]);
    if (Number.isFinite(n)) out[key] = Math.min(hi, Math.max(lo, n));
  }
  if (["system", "light", "dark", "cream"].includes(raw.theme)) out.theme = raw.theme;
  if (raw.font in FONT_STACKS) out.font = raw.font;
  if (typeof raw.focus === "boolean") out.focus = raw.focus;
  if (typeof raw.voiceURI === "string") out.voiceURI = raw.voiceURI;
  return out;
}

export function loadPrefs(storage = globalThis.localStorage) {
  try {
    return sanitise(JSON.parse(storage.getItem(KEY)));
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrefs(prefs, storage = globalThis.localStorage) {
  try {
    storage.setItem(KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}

// CSS custom properties for the reading area.
export function cssVars(p) {
  return {
    "--read-size": `${p.size}rem`,
    "--read-leading": String(p.lineHeight),
    "--read-letter": `${p.letterSpacing}em`,
    "--read-word": `${p.wordSpacing}em`,
    "--read-measure": `${p.width}ch`,
    "--read-font": FONT_STACKS[p.font],
  };
}
