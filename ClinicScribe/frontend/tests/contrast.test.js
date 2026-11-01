import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Reads the real colour tokens from the stylesheet, so changing a colour there
// without checking contrast fails here. This matters more than usual: a safety
// flag that is hard to read is a patient-safety problem, not a cosmetic one.
const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

function block(selector, from = 0) {
  const start = css.indexOf(selector, from);
  assert.ok(start >= 0, `selector not found: ${selector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  const tokens = {};
  for (const m of css.slice(open + 1, close).matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)) tokens[m[1]] = m[2];
  return tokens;
}

const darkStart = css.indexOf("@media (prefers-color-scheme: dark)");
const THEMES = {
  light: block(":root {"),
  dark: block(":root {", darkStart),
};

const channel = (hex, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex) => 0.2126 * lin(channel(hex, 0)) + 0.7152 * lin(channel(hex, 1)) + 0.0722 * lin(channel(hex, 2));
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Every text colour on every surface it is drawn on, including the status colours
// on both the page and the highlighted list row, and flag text on the flag card.
const PAIRS = [
  ["ink", "paper"], ["ink", "paper-2"], ["ink", "flag-bg"],
  ["muted", "paper"], ["muted", "paper-2"],
  ["accent", "paper"], ["accent", "paper-2"], ["accent-ink", "accent"],
  ["danger", "paper"], ["danger", "paper-2"], ["danger", "flag-bg"],
  ["ok", "paper"], ["ok", "paper-2"],
  ["warn", "paper"], ["warn", "paper-2"],
];

for (const [name, tokens] of Object.entries(THEMES)) {
  test(`${name} theme defines every token`, () => {
    for (const key of ["paper", "paper-2", "ink", "muted", "line", "accent", "accent-ink", "danger", "flag-bg", "ok", "warn"]) {
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

test("the dark theme overrides every light token it should", () => {
  for (const key of Object.keys(THEMES.dark)) {
    assert.ok(key in THEMES.light, `--${key} is in dark but not in light`);
  }
  for (const key of ["paper", "paper-2", "ink", "muted", "accent", "danger", "flag-bg", "ok", "warn"]) {
    assert.notEqual(THEMES.dark[key], THEMES.light[key], `--${key} is not actually adapted for dark`);
  }
});
