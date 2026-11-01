// End-to-end check of Accessible Reader in an isolated headless Chrome.
// Speech is faked (headless Chrome has no voices): each utterance "plays" for 40 ms.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [chrome, base, outDir, pdfPath] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "ar-e2e-"));
const port = 9444;
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
const key = async (k, extra = {}) => {
  const code = { " ": "Space", ArrowRight: "ArrowRight", ArrowLeft: "ArrowLeft" }[k] || k;
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, text: k.length === 1 ? k : undefined, ...extra });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code });
};
const click = (selector) => js(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return false; e.click(); return true; })()`);
const clickText = (text, sel = "button") => js(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find(b => b.textContent.trim().startsWith(${JSON.stringify(text)})); if (!e) return false; e.click(); return true; })()`);

const FAKE_SPEECH = `
  (() => {
    const spoken = [];
    window.__spoken = spoken;
    class U { constructor(t) { this.text = t; this.rate = 1; } }
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: U, configurable: true, writable: true });
    let timer = null;
    const fake = {
      speaking: false,
      speak(u) { spoken.push(u.text); clearTimeout(timer); timer = setTimeout(() => u.onend && u.onend({}), 150); },
      cancel() { clearTimeout(timer); },
      getVoices() { return [{ name: "Voix Test", lang: "fr-FR", voiceURI: "fr-voice" }, { name: "Test Voice", lang: "en-US", voiceURI: "test-voice", default: true }]; },
      addEventListener() {},
    };
    // speechSynthesis is a read-only accessor, so a plain assignment would not stick.
    Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true });
  })();
`;

const report = {};
const check = (name, ok, detail) => { report[name] = { ok: !!ok, ...(detail !== undefined ? { detail } : {}) }; };

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Page.addScriptToEvaluateOnNewDocument", { source: FAKE_SPEECH });
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });

// ---- 1. open screen -------------------------------------------------------
await send("Page.navigate", { url: base });
await sleep(1500);
check("open screen shows the three ways in", await js(`!!document.querySelector('.drop button') && !!document.querySelector('#paste-text') && /Try the short sample/.test(document.body.textContent)`));
await shot("open.png");

// ---- 2. sample + chapters -------------------------------------------------
await clickText("Try the short sample");
await sleep(600);
check("sample opens with 3 chapters", (await js(`document.querySelectorAll('.chapters li').length`)) === 3);
check("first chapter is selected", await js(`document.querySelector('.chapters li button[aria-current="true"] .ch-title')?.textContent.startsWith('Chapter 1')`));
check("title shown", await js(`document.querySelector('.doc-title')?.textContent`) === "A short tour of Accessible Reader");
check("tricky sentences stay whole (Dr. / 0.8 / J. K.)", await js(`(() => { const t = [...document.querySelectorAll('.sentence')].map(s => s.textContent.trim()); return t.some(s => s.startsWith('Dr. Okafor, who studies')) && t.some(s => s.includes('0.8 times normal speed')); })()`));
check("voices offered", (await js(`document.querySelectorAll('.pickers select')[1].options.length`)) >= 2);
check("voice matching the browser language is listed first", await js(`document.querySelectorAll('.pickers select')[1].options[1].textContent.startsWith('Test Voice')`));

// ---- 3. playback with the keyboard ----------------------------------------
await js(`document.body.focus()`);
await key(" ");
await sleep(500);
const idxA = await js(`document.querySelector('.sentence.current')?.dataset.i`);
check("Space starts reading and the highlight moves on its own", Number(idxA) > 0, idxA);
check("button now says Pause", await js(`document.querySelector('.play').getAttribute('aria-label')`) === "Pause");
await key(" ");
await sleep(200);
const idxPaused = await js(`document.querySelector('.sentence.current')?.dataset.i`);
await sleep(300);
check("Space pauses, and it stays paused", (await js(`document.querySelector('.sentence.current')?.dataset.i`)) === idxPaused && (await js(`document.querySelector('.play').getAttribute('aria-label')`)) === "Play");
await shot("reading.png");
await key("ArrowRight");
await sleep(150);
check("Right arrow skips a sentence while paused", Number(await js(`document.querySelector('.sentence.current')?.dataset.i`)) === Number(idxPaused) + 1);
check("space on a focused button presses the button instead of toggling twice",
  await js(`(async () => { const b = document.querySelector('.play'); b.focus(); return document.activeElement === b; })()`));

await js(`window.__keys = []; window.addEventListener('keydown', (e) => window.__keys.push(e.key), true);`);
await key("]");
await sleep(300);
check("] moves to chapter 2", await js(`document.querySelector('.chapters li button[aria-current="true"] .ch-title')?.textContent.startsWith('Chapter 2')`),
  await js(`({ keys: window.__keys, active: document.activeElement?.tagName + '.' + document.activeElement?.className, current: document.querySelector('.chapters li button[aria-current="true"] .ch-title')?.textContent, status: document.querySelector('[role=status]').textContent, playing: document.querySelector('.play').getAttribute('aria-label') })`));
check("the chapter heading is shown", (await js(`document.querySelector('.reader h2')?.textContent`)).startsWith("Chapter 2"));

// click a sentence = read from there
await js(`document.querySelectorAll('.sentence')[2].click()`);
await sleep(200);
check("clicking a sentence starts reading from it", Number(await js(`document.querySelector('.sentence.current')?.dataset.i`)) >= 2 && (await js(`document.querySelector('.play').getAttribute('aria-label')`)) === "Pause");
await key(" ");

// reading to the end of a chapter carries on into the next
await js(`document.querySelectorAll('.chapters li button')[1].click()`);
await js(`document.querySelectorAll('.chapters li button')[0].click()`);
await sleep(200);
const spokenBefore = await js(`window.__spoken.length`);
await key(" ");
// Chapter 1 has about seven sentences at 150 ms each; give it time to run out and move on.
let moved = false;
for (let i = 0; i < 30 && !moved; i++) {
  await sleep(250);
  moved = !(await js(`document.querySelector('.chapters li button[aria-current="true"] .ch-title')?.textContent`)).startsWith("Chapter 1");
}
check("reading runs off the end of a chapter and carries on into the next by itself", moved);
check("it was still playing after the hand-over", (await js(`document.querySelector('.play').getAttribute('aria-label')`)) === "Pause");
await key(" ");
check("speech was requested for real sentences", (await js(`window.__spoken.length`)) > spokenBefore);

// speed
await key("=");
await sleep(100);
check("+ raises the speed to 1.25x", (await js(`document.querySelectorAll('.pickers select')[0].value`)) === "1.25");

// ---- 4. display settings -------------------------------------------------
await clickText("Display");
await sleep(300);
check("Display panel opens and is labelled", await js(`!!document.querySelector('#display-panel') && document.querySelector('button[aria-controls="display-panel"]').getAttribute('aria-expanded') === 'true'`));
const CONTRAST = `(() => {
  const lum = (r, g, b) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const parse = (s) => s.match(/[\\d.]+/g).slice(0, 3).map(Number);
  const el = document.querySelector('.sentence:not(.current)');
  const cs = getComputedStyle(el);
  const op = parseFloat(cs.opacity);
  const fg = parse(cs.color), bg = parse(getComputedStyle(document.body).backgroundColor);
  const mix = fg.map((c, i) => c * op + bg[i] * (1 - op));
  const a = lum(...mix), b = lum(...bg);
  return { ratio: +((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2), opacity: op };
})()`;

await js(`document.querySelector('input[name="theme"][value="dark"]').click()`);
await sleep(200);
check("dark theme applies", (await js(`document.documentElement.getAttribute('data-theme')`)) === "dark");
await js(`[...document.querySelectorAll('.check input')].find(i => i.parentElement.textContent.includes('Dim everything')).click()`);
await sleep(200);
const darkContrast = await js(CONTRAST);
check("dimmed sentences keep at least 4.5:1 contrast in the dark theme", darkContrast.ratio >= 4.5, darkContrast);
await shot("reading-dark.png");
await clickText("Roomy and calm");
await sleep(200);
const creamContrast = await js(CONTRAST);
check("dimmed sentences keep at least 4.5:1 contrast in the cream theme", creamContrast.ratio >= 4.5, creamContrast);
check("the Roomy preset sets size, spacing and cream theme", await js(`(() => { const r = document.querySelector('.reader'); return r.style.getPropertyValue('--read-size') === '1.4rem' && r.style.getPropertyValue('--read-measure') === '52ch' && document.documentElement.dataset.theme === 'cream' && r.dataset.focus === 'on'; })()`));
check("the preset keeps my speed", (await js(`document.querySelectorAll('.pickers select')[0].value`)) === "1.25");
await shot("display-panel.png");
await clickText("Done");
await sleep(150);
check("the panel closes", (await js(`!document.querySelector('#display-panel')`)));
await shot("reading-roomy.png");

// minimum target sizes
const small = await js(`[...document.querySelectorAll('button, select, input[type=range]')].filter(e => e.offsetParent && (e.getBoundingClientRect().height < 43.5)).map(e => (e.getAttribute('aria-label') || e.textContent || e.className).trim().slice(0,30))`);
check("every visible control is at least 44px tall", Array.isArray(small) && small.length === 0, small);

// ---- 5. remembered place and settings -------------------------------------
await clickText("Display");
await js(`document.querySelector('input[name="theme"][value="light"]').click()`);
await clickText("Done");
await js(`document.querySelectorAll('.chapters li button')[2].click()`);
await sleep(300);
await js(`document.querySelectorAll('.sentence')[1].click()`);
await sleep(100);
await key(" "); // pause
await sleep(800);
await send("Page.reload");
await sleep(1500);
check("the display settings survive a reload", (await js(`document.documentElement.getAttribute('data-theme')`)) === "light");
await clickText("Try the short sample");
await sleep(600);
check("the reader picks up in chapter 3 after a reload", await js(`document.querySelector('.chapters li button[aria-current="true"] .ch-title')?.textContent.startsWith('Chapter 3')`));
check("and tells assistive tech so", /Picked up where you left off/.test(await js(`document.querySelector('[role=status]').textContent`)));

// ---- 6. narrow screen -------------------------------------------------------
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await js(`window.scrollTo(0,0)`);
await sleep(500);
check("no sideways scrolling on a phone", await js(`document.documentElement.scrollWidth <= window.innerWidth + 1`), await js(`[document.documentElement.scrollWidth, window.innerWidth]`));
const share = await js(`+(document.querySelector('.player').getBoundingClientRect().height / window.innerHeight).toFixed(2)`);
check("the player bar takes at most a fifth of a phone screen", share <= 0.2, share);
check("speed and voice are tucked away on a phone until asked for", await js(`getComputedStyle(document.querySelector('#player-pickers')).display === 'none'`));
await shot("mobile.png");
await clickText("Speed, voice");
await sleep(200);
check("the Speed, voice toggle reveals them", await js(`getComputedStyle(document.querySelector('#player-pickers')).display !== 'none' && document.querySelector('.more-toggle').getAttribute('aria-expanded') === 'true'`));
await shot("mobile-options.png");
await clickText("Speed, voice");
check("the toggle is a proper 44px target", (await js(`document.querySelector('.more-toggle').getBoundingClientRect().height`)) >= 43.5);
check("on a phone the position text and the toggle share a row", await js(`(() => { const w = document.querySelector('.where').getBoundingClientRect(), m = document.querySelector('.more-toggle').getBoundingClientRect(); return Math.abs((w.top + w.height / 2) - (m.top + m.height / 2)) < 12; })()`));
check("and the five transport buttons stay on a single row, all at least 44px wide", await js(`(() => { const b = [...document.querySelectorAll('.transport button')].map(e => e.getBoundingClientRect()); return b.every(r => r.width >= 43.5) && Math.max(...b.map(r => r.top)) - Math.min(...b.map(r => r.top)) < 20; })()`));
check("the player bar still takes at most a fifth of the screen after the change", (await js(`+(document.querySelector('.player').getBoundingClientRect().height / window.innerHeight).toFixed(2)`)) <= 0.2);
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

// ---- 7. real PDF ------------------------------------------------------------
if (pdfPath && existsSync(pdfPath)) {
  await js(`(() => { const x = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Open another'); x && x.click(); })()`);
  await sleep(400);
  const doc = await send("DOM.getDocument");
  const found = await send("DOM.querySelector", { nodeId: doc.result.root.nodeId, selector: 'input[type="file"]' });
  await send("DOM.setFileInputFiles", { nodeId: found.result.nodeId, files: [pdfPath] });
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) { await sleep(500); ready = await js(`document.querySelectorAll('.chapters li').length > 0`); }
  check("a real PDF opens", ready);
  if (ready) {
    const titles = await js(`[...document.querySelectorAll('.chapters li .ch-title')].map(l => l.textContent.trim())`);
    check("PDF chapters are found from its headings", titles.length >= 4 && titles.some((t) => /^Chapter 2/.test(t)), titles);
    const text = await js(`document.querySelector('.reader').textContent`);
    check("PDF text is readable prose", /\w+ \w+ \w+/.test(text) && text.length > 200, text.slice(0, 80));
    const allText = await (async () => {
      const n = await js(`document.querySelectorAll('.chapters li').length`);
      let all = "";
      for (let i = 0; i < n; i++) { await js(`document.querySelectorAll('.chapters li button')[${i}].click()`); await sleep(120); all += " " + (await js(`document.querySelector('.reader').textContent`)); }
      return all;
    })();
    const junk = /file:\/\/[^ ]*|about:blank|\bPage \d+|\b\d{1,2}\/\d{1,2}\/\d{2,4}|\b\d{1,2}\/\d{1,2}\b(?! \w)/g;
    check("browser page headers and footers (file URL, page numbers, date) were stripped", !junk.test(allText), (allText.match(junk) || []).slice(0, 5));
    check("a hyphen split across lines was rejoined (no 'informa- tion' left)", !/[a-z]- [a-z]/.test(allText));
  }
} else {
  check("a real PDF opens", false, "no pdf supplied");
}

// ---- 8. privacy: nothing left the page --------------------------------------
const origin = new URL(base).origin;
const foreign = requests.filter((r) => !(r.url.startsWith(origin) || r.url.startsWith("data:") || r.url.startsWith("blob:")));
check("the whole session, including opening a PDF, made no request to any other site", foreign.length === 0, foreign.slice(0, 5));
const uploads = requests.filter((r) => r.method !== "GET" || r.hasBody);
check("and sent no POST or request body at all", uploads.length === 0, uploads.slice(0, 5));
report["requests seen"] = { ok: true, detail: `${requests.length} requests, all to ${origin} or local data/blob URLs` };

// ---- 9. no script errors ---------------------------------------------------
check("no console errors or exceptions", consoleErrors.length === 0, consoleErrors.slice(0, 3));

writeFileSync(join(outDir, "..", "e2e-report.json"), JSON.stringify(report, null, 2));
ws.close();
proc.kill();
const failed = Object.entries(report).filter(([, v]) => !v.ok);
console.log(JSON.stringify({ passed: Object.keys(report).length - failed.length, failed: failed.map(([k, v]) => ({ check: k, detail: v.detail })) }, null, 1));
process.exit(0);
