// How long reading takes, for the "about 3 min left" hints.

// A comfortable speaking pace at normal speed. Speech engines vary, so this is an
// estimate and the interface says "about".
export const WORDS_PER_MINUTE = 160;

export const countWords = (text) => (String(text ?? "").match(/\S+/g) || []).length;

export function minutesFor(words, rate = 1) {
  const speed = Number.isFinite(rate) && rate > 0 ? rate : 1;
  return Math.max(0, words) / (WORDS_PER_MINUTE * speed);
}

// "under a minute", "3 min", "1 h 10 min". Rounds up: better to finish early.
// With { short: true } the first becomes "<1 min", for tight spaces like a list.
export function formatMinutes(minutes, { short = false } = {}) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "done";
  if (minutes <= 1) return short ? "<1 min" : "under a minute";
  const total = Math.ceil(minutes);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// "about 3 min", but never "about under a minute".
export function lengthLabel(minutes) {
  const f = formatMinutes(minutes);
  return f === "done" || f.startsWith("under") ? f : `about ${f}`;
}

// "about 3 min left", "under a minute left", "finished".
export function leftLabel(minutes) {
  const f = formatMinutes(minutes);
  if (f === "done") return "finished";
  return f.startsWith("under") ? `${f} left` : `about ${f} left`;
}
