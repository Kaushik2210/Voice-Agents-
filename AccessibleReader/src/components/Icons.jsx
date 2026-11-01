// A small, consistent icon set: 24px grid, 2px rounded strokes. Each icon is
// decorative; the button that holds it carries the accessible name.

const base = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
  focusable: "false",
};

export const PlayIcon = () => (
  <svg {...base}>
    <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
  </svg>
);
export const PauseIcon = () => (
  <svg {...base}>
    <path d="M8 5v14M16 5v14" strokeWidth="3.5" />
  </svg>
);
export const PrevSentenceIcon = () => (
  <svg {...base}>
    <path d="M15 6l-6 6 6 6" />
  </svg>
);
export const NextSentenceIcon = () => (
  <svg {...base}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);
export const PrevChapterIcon = () => (
  <svg {...base}>
    <path d="M6 5v14M18 6l-8 6 8 6z" />
  </svg>
);
export const NextChapterIcon = () => (
  <svg {...base}>
    <path d="M18 5v14M6 6l8 6-8 6z" />
  </svg>
);
// Eight-armed asterisk: the brand's small ornament.
export const AsteriskIcon = ({ size = 28 }) => (
  <svg {...base} width={size} height={size} strokeWidth="3.2">
    <path d="M12 2.5v19M2.5 12h19M5.3 5.3l13.4 13.4M18.7 5.3L5.3 18.7" />
  </svg>
);
export const ArrowIcon = () => (
  <svg {...base} width={16} height={16} strokeWidth="2.4">
    <path d="M7 17L17 7M8 7h9v9" />
  </svg>
);
export const DisplayIcon = () => (
  <svg {...base}>
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="8" cy="17" r="2" />
  </svg>
);
