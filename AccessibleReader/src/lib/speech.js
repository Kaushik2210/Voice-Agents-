// The browser's speech engine, shaped for createPlayer (see player.js).

export const speechSupported = () => typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

// Voices load asynchronously in Chrome, so wait for the event, but not forever.
export function loadVoices(timeoutMs = 1500) {
  return new Promise((resolve) => {
    if (!speechSupported()) return resolve([]);
    const synth = window.speechSynthesis;
    const done = () => resolve(synth.getVoices());
    if (synth.getVoices().length > 0) return done();
    const timer = setTimeout(done, timeoutMs);
    synth.addEventListener("voiceschanged", () => {
      clearTimeout(timer);
      done();
    }, { once: true });
  });
}

// Voices that match the document's language come first, then the rest by name.
export function sortVoices(voices, language = navigator.language || "en") {
  const lang = language.toLowerCase().split("-")[0];
  const rank = (v) => (v.lang.toLowerCase().startsWith(lang) ? 0 : 1) - (v.default ? 0.5 : 0);
  return [...voices].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

// Chrome drops an utterance that nothing still references, so keep the current one.
let current = null;

export const browserEngine = {
  speak(text, { rate, voice }, { onend, onerror }) {
    try {
      const u = new window.SpeechSynthesisUtterance(text);
      u.rate = rate;
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      }
      u.onend = onend;
      u.onerror = (e) => onerror(e.error);
      current = u;
      window.speechSynthesis.speak(u);
    } catch (e) {
      // A speech engine that throws must not break the page; report it like any other error.
      onerror(e?.message || "speech-unavailable");
    }
  },
  cancel() {
    if (speechSupported()) window.speechSynthesis.cancel();
  },
};
