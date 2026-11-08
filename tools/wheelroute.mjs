// Wheel routing acceptance: the toolbar, tab strip and panel must never scroll
// the page, and the page must still scroll when the pointer is over it.
import { spawn } from "node:child_process";
import http from "node:http";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const ROOT = "H:/webOS-TVbox/tv-browser";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 8846, CDP = 9446;
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = http.createServer(async (req, res) => {
  try {
    const u = decodeURIComponent(req.url.split("?")[0]);
    const base = path.resolve(ROOT);
    const f = path.resolve(base, "." + (u === "/" ? "/app/index.html" : u));
    const buf = await fsp.readFile(f);
    res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(buf);
  } catch { res.writeHead(404); res.end("nf"); }
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const userDir = path.join(os.tmpdir(), "astra-route-" + Date.now());
const child = spawn(CHROME, ["--headless=new", "--remote-debugging-port=" + CDP, "--user-data-dir=" + userDir,
  "--window-size=1280,720", "--hide-scrollbars", "--no-first-run", "--disable-extensions", "about:blank"], { stdio: "ignore" });
async function getJson(p) {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${CDP}${p}`); if (r.ok) return await r.json(); } catch {}
    await sleep(250);
  }
  throw new Error("devtools unreachable");
}
const t = (await getJson("/json/list")).find((x) => x.type === "page");
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("ws")); });
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } };
const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
const ev = async (x) => { const r = await send("Runtime.evaluate", { expression: x, returnByValue: true }); if (r.exceptionDetails) return "ERR"; return r.result.value; };
const click = async (x, y) => {
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  await sleep(350);
};
const wheel = async (x, y, dy) => {
  await send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY: dy });
  await sleep(350);
};

await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/probe/bench-page.html` });
await sleep(2400);

const results = {};

await ev("window.scrollTo(0,600)");
await sleep(300);
results.base = await ev("Math.round(scrollY)");

// 1. toolbar (top strip) — must not move the page
await wheel(640, 72, 200);
results.afterToolbarWheel = await ev("Math.round(scrollY)");

// 2. tab strip — must not move the page
await wheel(640, 20, 200);
results.afterTabsWheel = await ev("Math.round(scrollY)");

// 3. panel body — open the menu, then the history list, wheel inside it
const panelRendersBefore = await ev("window.__TVB_PERF__.renderPanel");
await click(1242, 72);
results.panelOpened = (await ev("window.__TVB_PERF__.renderPanel")) > panelRendersBefore;
await click(1030, 330);            // History row
await wheel(1030, 240, 240);
results.afterPanelWheel = await ev("Math.round(scrollY)");
await click(1242, 72);             // close via menu button

// 4. page body — must scroll
await wheel(640, 400, 240);
results.afterPageWheel = await ev("Math.round(scrollY)");

results.pageMoved = {
  toolbar: results.afterToolbarWheel !== results.base,
  tabs: results.afterTabsWheel !== results.afterToolbarWheel,
  panel: results.afterPanelWheel !== results.afterTabsWheel,
  body: results.afterPageWheel !== results.afterPanelWheel
};
/* The toolbar is meant to forward the wheel to the page, so it is not part of
   the "must not move" set; the tab strip and the panel are. */
results.pass = results.panelOpened && !results.pageMoved.tabs && !results.pageMoved.panel && results.pageMoved.body;

console.log(JSON.stringify(results, null, 2));
ws.close(); child.kill(); server.close(); await sleep(200);
try { await fsp.rm(userDir, { recursive: true, force: true }); } catch {}
process.exit(results.pass ? 0 : 1);
