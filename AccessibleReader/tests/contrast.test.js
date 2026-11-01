import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Reads the real colour tokens from the stylesheet, so changing a colour there
// without checking contrast fails here.
const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

function block(selector) {
  const start = css.indexOf(selector);
  assert.ok(start >= 0, `selector not found: ${selector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  const tokens = {};
  for (const m of css.slice(open + 1, close).matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)) tokens[m[1]] = m[2];
  return tokens;
}

const THEMES = {
  light: block(":root {"),
  dark: block(':root[data-theme="dark"]'),
  cream: block(':root[data-theme="cream"]'),
};

const channel = (hex, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex) => 0.2126 * lin(channel(hex, 0)) + 0.7152 * lin(channel(hex, 1)) + 0.0722 * lin(channel(hex, 2));
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Every text colour on every surface it is drawn on.
const PAIRS = [
  ["ink", "paper"], ["ink", "paper-2"],
  ["muted", "paper"], ["muted", "paper-2"],
  ["accent", "paper"], ["accent", "paper-2"],
  ["accent-ink", "accent"],
  ["danger", "paper"],
];

for (const [name, tokens] of Object.entries(THEMES)) {
  test(`${name} theme defines every token`, () => {
    for (const key of ["paper", "paper-2", "ink", "muted", "accent", "accent-ink", "danger", "line"]) {
      assert.ok(tokens[key], `${name} is missing --${key}`);
    }
  });

  test(`${name} theme: every text and background pair is at least 4.5:1`, () => {
    for (const [fg, bg] of PAIRS) {
      const r = ratio(tokens[fg], tokens[bg]);
      assert.ok(r >= 4.5, `${name}: ${fg} ${tokens[fg]} on ${bg} ${tokens[bg]} is only ${r.toFixed(2)}:1`);
    }
  });
}

test("the automatic dark theme uses the same colours as the chosen dark theme", () => {
  const auto = block(":root:not([data-theme])");
  for (const key of Object.keys(THEMES.dark)) {
    if (key in auto) assert.equal(auto[key], THEMES.dark[key], `--${key} differs between auto-dark and dark`);
  }
});

test("dimmed text in focus mode stays readable: 70% ink over paper is at least 4.5:1", () => {
  for (const [name, t] of Object.entries(THEMES)) {
    const mix = (a, b, w) => `#${[0, 1, 2].map((i) => Math.round((channel(a, i) * w + channel(b, i) * (1 - w)) * 255).toString(16).padStart(2, "0")).join("")}`;
    const dimmed = mix(t.ink, t.paper, 0.7);
    const r = ratio(dimmed, t.paper);
    assert.ok(r >= 4.5, `${name}: dimmed text is only ${r.toFixed(2)}:1`);
  }
});
