// Decorative icons: the control or heading that holds one carries the accessible name.
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

// The brand's small ornament. Static here: a clinical tool should not fidget.
export const AsteriskIcon = ({ size = 18 }) => (
  <svg {...base} width={size} height={size} strokeWidth="3.2">
    <path d="M12 2.5v19M2.5 12h19M5.3 5.3l13.4 13.4M18.7 5.3L5.3 18.7" />
  </svg>
);

export const WarnIcon = () => (
  <svg {...base} width={26} height={26} strokeWidth="2.2">
    <path d="M12 3.5l9.5 16.5h-19z" />
    <path d="M12 10v4.5M12 17.4v.1" strokeWidth="2.6" />
  </svg>
);
