// Small formatting helpers shared by the interface.

// 75.2 seconds -> "1:15". Segments without timing show nothing.
export function fmt(seconds) {
  if (seconds == null) return "";
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// "14 Oct 2026, 2:00 pm" in the reader's own locale and time zone.
export function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export const STATUS_LABEL = {
  processing: "Processing",
  ready: "Ready for review",
  approved: "Approved",
  failed: "Failed",
};
