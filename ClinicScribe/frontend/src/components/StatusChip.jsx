import { STATUS_LABEL } from "../lib/format.js";

// Status is a word and a glyph as well as a colour, so it survives colour blindness
// and forced-colours modes. The glyph comes from CSS and is decorative.
export default function StatusChip({ status }) {
  return <span className={`chip status-${status}`}>{STATUS_LABEL[status] ?? status}</span>;
}
