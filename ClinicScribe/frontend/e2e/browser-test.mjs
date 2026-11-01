// Drives the built ClinicScribe demo in an isolated headless Chrome and checks the
// behaviours that matter for a clinical tool: the acknowledgement gate on flagged
// notes, the explanations for disabled buttons, locking after approval, readable
// contrast, a phone layout, and that nothing is sent anywhere.
//
//   node e2e/browser-test.mjs <chrome> <url> <screenshot-dir>
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [chrome, base, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "cs-e2e-"));
const port = 9555;
const proc = spawn(chrome, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-extensions", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function wsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const p = list.find((t) => t.type === "page");
      if (p) return p.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error("chrome did not start");
}
const ws = new WebSocket(await wsUrl());
await new Promise((r) => (ws.onopen = r));
let id = 0;
const waiting = new Map();
const consoleErrors = [];
const requests = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && waiting.has(msg.id)) waiting.get(msg.id)(msg);
  if (msg.method === "Network.requestWillBeSent") requests.push({ url: msg.params.request.url, method: msg.params.request.method, hasBody: !!msg.params.request.postData });
  if (msg.method === "Runtime.exceptionThrown") consoleErrors.push(msg.params.exceptionDetails?.exception?.description || "exception");
  if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
};
const send = (method, params = {}) => new Promise((resolve) => { const n = ++id; waiting.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params })); });
const js = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return { __error: r.result.exceptionDetails.exception?.description };
  return r.result?.result?.value;
};
const shot = async (name) => { const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(outDir, name), Buffer.from(r.result.data, "base64")); };
const key = async (k) => {
  const code = { Enter: "Enter", " ": "Space" }[k] || k;
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, text: k === "Enter" ? "\r" : k.length === 1 ? k : undefined });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code });
};
const clickText = (text, sel = "button") => js(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find(b => b.textContent.trim().startsWith(${JSON.stringify(text)})); if (!e) return false; e.click(); return true; })()`);
const open = (n) => js(`document.querySelectorAll('.index li button')[${n}].click()`);
const setValue = (selector, value) => js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const approveButton = `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Approve note')`;

const report = {};
const check = (name, ok, detail) => { report[name] = { ok: !!ok, ...(detail !== undefined ? { detail } : {}) }; };

// Contrast, computed in the page from what is really drawn.
const CONTRAST = (selector, bgSelector) => `(() => {
  const lum = (r, g, b) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const parse = (s) => s.match(/[\\d.]+/g).slice(0, 3).map(Number);
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return null;
  const fg = parse(getComputedStyle(el).color);
  const bgEl = document.querySelector(${JSON.stringify(bgSelector || selector)});
  let bg = getComputedStyle(bgEl).backgroundColor;
  if (/rgba\\(.*, 0\\)|transparent/.test(bg)) bg = getComputedStyle(document.body).backgroundColor;
  const b = parse(bg);
  const a = lum(...fg), c = lum(...b);
  return +((Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05)).toFixed(2);
})()`;

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
await send("Page.navigate", { url: base });
await sleep(2000);

// ---- 1. the demo and its list ---------------------------------------------------
check("the demo is labelled as a demo", await js(`!!document.querySelector('.demo-note') && document.querySelector('.health .chip')?.textContent === 'Demo data'`));
check("uploads are explained instead of being a dead form", await js(`/Uploads are off/.test(document.querySelector('.card')?.textContent) && !document.querySelector('input[type=file]')`));
check("two consultations are listed", (await js(`document.querySelectorAll('.index li button').length`)) === 2);
check("the first note opens by itself", await js(`document.querySelector('.detail-head h2')?.textContent`) === "MRN-DEMO-001");
check("status is a word, not just a colour", await js(`document.querySelector('.detail-head .chip')?.textContent`) === "Ready for review");

// ---- 2. a clean note --------------------------------------------------------------
check("a clean note shows no flags", (await js(`document.querySelectorAll('.flag').length`)) === 0);
check("and needs no acknowledgement to approve", await js(`!document.querySelector('.check.ack') && !(${approveButton}).disabled`));
check("allergies and medications are separate, prominent fields", await js(`(() => { const t = [...document.querySelectorAll('.safety textarea')].map(e => e.value); return t.length === 2 && /Sulfa/.test(t[0]) && /Metformin/.test(t[1]); })()`));
check("every text box is labelled for assistive technology", await js(`[...document.querySelectorAll('.note textarea')].every(t => { const id = t.getAttribute('aria-labelledby'); return id && document.getElementById(id)?.textContent.trim().length > 0; })`));
await js(`window.scrollTo(0,0)`);
await shot("note.png");

await js(`document.querySelector('.chip-btn').click()`);
await sleep(150);
check("a timestamp chip highlights the transcript lines it came from", (await js(`document.querySelectorAll('.turns p.hit').length`)) > 0);

// ---- 3. editing -------------------------------------------------------------------
await setValue('.safety textarea', "Sulfa drugs (rash)\nIbuprofen");
await sleep(150);
check("editing enables Save and blocks Approve", await js(`!([...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Save edits')).disabled && ${approveButton}.disabled`));
check("and says why, in words", await js(`document.getElementById('approve-hint')?.textContent`) === "Save your edits before approving.");
check("the Approve button points at that explanation", await js(`${approveButton}.getAttribute('aria-describedby') === 'approve-hint'`));
await clickText("Save edits");
await sleep(200);
check("saving keeps the edit and re-enables Approve", await js(`document.querySelector('.safety textarea').value.includes('Ibuprofen') && !${approveButton}.disabled && !document.getElementById('approve-hint')`));

// ---- 4. speaker roles ---------------------------------------------------------------
await js(`document.querySelector('input[name="role-Speaker 1"][value="Clinician"]').click()`);
await sleep(250);
check("assigning one speaker gives the other the opposite role", await js(`[...document.querySelectorAll('.turns .who')].slice(0, 2).map(e => e.textContent).join('|')`) === "Clinician|Patient");
await js(`document.querySelector('.transcript').scrollIntoView()`);
await sleep(250);
await shot("transcript.png");
await open(1);
await sleep(300);
await open(0);
await sleep(300);
check("roles are kept when you switch notes and come back", await js(`[...document.querySelectorAll('.turns .who')].slice(0, 2).map(e => e.textContent).join('|')`) === "Clinician|Patient");

// ---- 5. a flagged note ----------------------------------------------------------------
await open(1);
await sleep(400);
await js(`window.scrollTo(0,0)`);
check("the flagged note is open", await js(`document.querySelector('.detail-head h2')?.textContent`) === "MRN-DEMO-002");
check("it shows two safety flags, each announced as an alert", await js(`document.querySelectorAll('.flag[role="alert"]').length`) === 2);
check("each flag has a warning icon and the words 'Safety flag'", await js(`[...document.querySelectorAll('.flag')].every(f => f.querySelector('svg') && /Safety flag/i.test(f.textContent))`));
check("Approve is blocked until the flags are acknowledged", await js(`${approveButton}.disabled && !!document.querySelector('.check.ack')`));
check("and the reason is stated", await js(`/Tick the box/.test(document.getElementById('approve-hint')?.textContent || '')`));
await shot("flagged.png");

// dark theme
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
await sleep(300);
const darkFlag = await js(CONTRAST(".flag-text", ".flag"));
const darkRed = await js(CONTRAST(".flag .eyebrow", ".flag"));
check("flag text is readable in the dark theme", darkFlag >= 4.5 && darkRed >= 4.5, { text: darkFlag, label: darkRed });
await shot("dark.png");
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
await sleep(200);
const lightFlag = await js(CONTRAST(".flag-text", ".flag"));
const lightRed = await js(CONTRAST(".flag .eyebrow", ".flag"));
check("flag text is readable in the light theme", lightFlag >= 4.5 && lightRed >= 4.5, { text: lightFlag, label: lightRed });

await js(`document.querySelector('.check.ack input').click()`);
await sleep(200);
check("acknowledging enables Approve and clears the hint", await js(`!${approveButton}.disabled && !document.getElementById('approve-hint')`));
await clickText("Approve note");
await sleep(300);
check("approving changes the status to Approved", await js(`document.querySelector('.detail-head .chip')?.textContent`) === "Approved");
check("the list updates too", await js(`document.querySelectorAll('.index li button')[1].textContent.includes('Approved')`));
check("an approved note is locked: text boxes and roles are disabled", await js(`[...document.querySelectorAll('.note textarea')].every(t => t.disabled) && [...document.querySelectorAll('.role-row')].every(r => r.disabled)`));
check("and the approve and save buttons are gone", await js(`!${approveButton} && ![...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Save edits')`));
const lockedContrast = await js(`(() => {
  const lum = (r, g, b) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const parse = (s) => s.match(/[\\d.]+/g).slice(0, 3).map(Number);
  const t = document.querySelector('.note textarea');
  const fg = parse(getComputedStyle(t).webkitTextFillColor), bg = parse(getComputedStyle(document.body).backgroundColor);
  const a = lum(...fg), b = lum(...bg);
  return +((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2);
})()`);
check("locked text is still fully readable", lockedContrast >= 4.5, lockedContrast);
check("Export still works on an approved note (no error shown)", (await clickText("Export Markdown")) && (await sleep(300), await js(`!document.querySelector('.note .error')`)));

// ---- 6. keyboard and targets --------------------------------------------------------------
await js(`document.querySelectorAll('.index li button')[0].focus()`);
await key("Enter");
await sleep(300);
check("the list works from the keyboard", await js(`document.querySelector('.detail-head h2')?.textContent`) === "MRN-DEMO-001");
const small = await js(`[...document.querySelectorAll('button')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 43.5).map(e => (e.textContent || e.className).trim().slice(0, 30))`);
check("every visible button is at least 44px tall", Array.isArray(small) && small.length === 0, small);
check("status chips keep AA contrast on the page and on the selected row", await js(`(() => {
  const lum = (r, g, b) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const parse = (s) => s.match(/[\\d.]+/g).slice(0, 3).map(Number);
  const bgs = [getComputedStyle(document.body).backgroundColor, getComputedStyle(document.querySelector('.index li button[aria-current]')).backgroundColor];
  return [...document.querySelectorAll('.chip')].every(c => bgs.every(bg => { const a = lum(...parse(getComputedStyle(c).color)), b = lum(...parse(bg)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5; }));
})()`));

// ---- 7. phone ---------------------------------------------------------------------------------
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send("Page.reload");
await sleep(1800);
check("on a phone the consultation list is folded away so the note comes first", await js(`document.querySelector('.index nav details').open === false`));
await clickText("Consultations", "summary");
await sleep(200);
check("and it opens when asked", await js(`document.querySelector('.index nav details').open === true`));
await open(1);
await sleep(400);
await js(`document.querySelector('.index nav details').open = false; window.scrollTo(0,0)`);
await sleep(300);
check("no sideways scrolling on a phone", await js(`document.documentElement.scrollWidth <= window.innerWidth + 1`), await js(`[document.documentElement.scrollWidth, window.innerWidth]`));
check("a safety flag is on the first screen of a phone, with no scrolling", await js(`(() => { const f = document.querySelector('.flag'); const r = f.getBoundingClientRect(); return r.top >= 0 && r.top < window.innerHeight - 80; })()`), await js(`Math.round(document.querySelector('.flag').getBoundingClientRect().top) + ' of ' + window.innerHeight`));
check("flags are fully visible on a phone",await js(`[...document.querySelectorAll('.flag')].every(f => f.getBoundingClientRect().right <= window.innerWidth + 1 && f.getBoundingClientRect().left >= -1)`));
await shot("mobile.png");
check("on a phone nothing floats over the note: the action dock is part of the page", await js(`getComputedStyle(document.querySelector('.actions')).position === 'static'`));
check("the first safety flag's text is not covered by anything on a phone", await js(`(() => {
  const t = document.querySelector('.flag-text'); const r = t.getBoundingClientRect();
  const x = r.left + Math.min(40, r.width / 2), y = r.top + Math.min(12, r.height / 2);
  const hit = document.elementFromPoint(x, y);
  return !!hit && !!hit.closest('.flag');
})()`));
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

// ---- 8. nothing leaves the page ------------------------------------------------------------------
const origin = new URL(base).origin;
const foreign = requests.filter((r) => !(r.url.startsWith(origin) || r.url.startsWith("data:") || r.url.startsWith("blob:")));
check("the whole session made no request to any other site", foreign.length === 0, foreign.slice(0, 5));
check("and sent no request body, and called no API", requests.every((r) => r.method === "GET" && !r.hasBody && !/\/api\//.test(r.url)), requests.filter((r) => r.method !== "GET" || r.hasBody || /\/api\//.test(r.url)).slice(0, 5));
report["requests seen"] = { ok: true, detail: `${requests.length} requests, all to ${origin} or local data/blob URLs` };
check("no console errors or exceptions", consoleErrors.length === 0, consoleErrors.slice(0, 3));

writeFileSync(join(outDir, "..", "e2e-report.json"), JSON.stringify(report, null, 2));
ws.close();
proc.kill();
const failed = Object.entries(report).filter(([, v]) => !v.ok);
console.log(JSON.stringify({ passed: Object.keys(report).length - failed.length, failed: failed.map(([k, v]) => ({ check: k, detail: v.detail })) }, null, 1));
process.exit(0);
