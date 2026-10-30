// Deterministic benchmark for the injected chrome + state service.
// Runs headless Chrome against probe/chrome-preview.html with the real service
// on 127.0.0.1:7792, so the scroll → tabUpdate → render path is measured end
// to end. Usage: node tools/bench.mjs [label]
import { spawn } from "node:child_process";
import http from "node:http";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const ROOT = "H:/webOS-TVbox/tv-browser";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 8842, CDP = 9442;
const TOKEN = "tvb-7f3c9a1d5e8b2c4f6a0d9e3b7c1f5a8d";
const LABEL = process.argv[2] || "run";
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- seed state: 3 tabs x 10 history entries, 8 bookmarks, 40 history ---- */
const now = Date.now();
const mkTab = (i, url, title) => ({
  id: "t_seed" + i,
  url, title,
  history: Array.from({ length: 10 }, (_, k) => ({ url: url + "?p=" + k, title: title + " #" + k, at: now - k * 60000 })),
  historyIndex: 9,
  scrollY: 0
});
const seed = {
  version: 1,
  tabs: [
    mkTab(1, "https://www.bing.com/search?q=webos", "webos - 搜索"),
    mkTab(2, "https://www.bilibili.com/video/BV1", "哔哩哔哩"),
    mkTab(3, "https://www.zhihu.com/hot", "热榜 - 知乎")
  ],
  activeTabId: "t_seed1",
  bookmarks: Array.from({ length: 8 }, (_, i) => ({ id: "b" + i, url: "https://example.com/" + i, title: "书签 " + i, createdAt: now - i * 1000 })),
  history: Array.from({ length: 40 }, (_, i) => ({ id: "h" + i, url: "https://site" + i + ".example.com/page", title: "历史记录条目 " + i, at: now - i * 60000 })),
  settings: { searchEngine: "baidu", restoreSession: true, zoom: 1, homeUrl: "http://127.0.0.1:7792/home" },
  updatedAt: now
};

async function post(method, body) {
  const r = await fetch(`http://127.0.0.1:7792/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-tvb-token": TOKEN },
    body: JSON.stringify(Object.assign({ token: TOKEN }, body || {}))
  });
  return r.json();
}

/* ---- service ---- */
const svc = spawn(process.execPath, [path.join(ROOT, "service/service.js")], { stdio: ["ignore", "pipe", "pipe"] });
let svcErr = ""; svc.stderr.on("data", d => svcErr += d);
let svcUp = false;
for (let i = 0; i < 40; i++) {
  try { await post("getState", {}); svcUp = true; break; } catch { await sleep(250); }
}
if (!svcUp) { svc.kill(); throw new Error("state service did not start"); }
await post("importState", { state: seed });

/* ---- static server ---- */
const server = http.createServer(async (req, res) => {
  try {
    const u = decodeURIComponent(req.url.split("?")[0]);
    const base = path.resolve(ROOT);
    const f = path.resolve(base, "." + (u === "/" ? "/app/index.html" : u));
    if (!f.toLowerCase().startsWith(base.toLowerCase())) { res.writeHead(403); res.end(); return; }
    const buf = await fsp.readFile(f);
    res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(buf);
  } catch { res.writeHead(404); res.end("nf"); }
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const userDir = path.join(os.tmpdir(), "astra-bench-" + Date.now());
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
const errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.method === "Runtime.exceptionThrown") {
    const d = m.params.exceptionDetails;
    errors.push(String((d.exception && d.exception.description) || d.text || "").slice(0, 200));
  }
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
};
const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
const ev = async (x) => { const r = await send("Runtime.evaluate", { expression: x, returnByValue: true }); if (r.exceptionDetails) return { error: String((r.exceptionDetails.exception || {}).description || "").slice(0, 120) }; return r.result.value; };

await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });

await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/probe/bench-page.html` });
await sleep(2600);

const out = { label: LABEL, at: new Date().toISOString() };
out.diag = await ev(`window.__TVB_CHROME__ ? window.__TVB_CHROME__.diag() : null`);
await ev(`(() => { window.__frames = []; let last = performance.now();
  function tick(n){ window.__frames.push(n-last); last=n; if(window.__frames.length<600) requestAnimationFrame(tick); }
  requestAnimationFrame(tick); })()`);

/* Start from the top: a restored session scroll would otherwise put the page
   at the bottom, and every notch would be a boundary no-op. */
await ev("window.scrollTo(0,0)");
await sleep(400);
out.startY = await ev("Math.round(window.scrollY)");
const before = await ev(`JSON.parse(JSON.stringify(window.__TVB_PERF__ || {}))`);

const t0 = Date.now();
for (let i = 0; i < 30; i++) {
  await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 640, y: 400, deltaX: 0, deltaY: 120 });
  await sleep(60);
}
const wallMs = Date.now() - t0;
await sleep(2200);

const after = await ev(`JSON.parse(JSON.stringify(window.__TVB_PERF__ || {}))`);
const scroll = await ev(`({ y: Math.round(window.scrollY), h: document.documentElement.scrollHeight })`);
const frames = await ev(`window.__frames.slice(0, 400)`);


const d = {};
for (const k of Object.keys(after || {})) d[k] = (after[k] || 0) - ((before || {})[k] || 0);
const sorted = (frames || []).slice().sort((a, b) => a - b);
const pct = (q) => sorted.length ? +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))].toFixed(1) : 0;

out.wallMs = wallMs;
out.scrollY = scroll && scroll.y;
out.delta = d;
out.perWheelMs = d.wheel ? +(d.wheelMs / d.wheel).toFixed(3) : null;
out.frames = { p50: pct(0.5), p95: pct(0.95), max: sorted.length ? +sorted[sorted.length - 1].toFixed(1) : 0 };
out.budget = {
  renderTabsDuringScroll: d.renderTabs || 0,
  renderPanelDuringScroll: d.renderPanel || 0,
  svcDuringScroll: d.svc || 0
};
out.errors = errors;
out.trace = after && after.wheelTrace;
out.miss = after && after.wheelMiss;
out.svc = { code: svc.exitCode, err: svcErr.slice(-200) };



/* nested scroller: wheel over #inner must move the container, not the page */
await ev('document.getElementById("last").scrollIntoView();document.getElementById("inner").scrollTop=0');
await sleep(300);
const innerRect = await ev('(function(){var r=document.getElementById("inner").getBoundingClientRect();' +
  'var y=Math.min(r.bottom, innerHeight)-40; if(y<r.top+20) y=r.top+20;' +
  'return {x:Math.round(r.left+r.width/2),y:Math.round(y)};})()');
const nestedBefore = await ev('({page:Math.round(scrollY),inner:Math.round(document.getElementById("inner").scrollTop)})');
await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: innerRect.x, y: innerRect.y, deltaX: 0, deltaY: 200 });
await sleep(400);
const nestedAfter = await ev('({page:Math.round(scrollY),inner:Math.round(document.getElementById("inner").scrollTop)})');
out.nested = { at: innerRect, before: nestedBefore, after: nestedAfter };

console.log(JSON.stringify(out, null, 2));
ws.close(); child.kill(); server.close(); svc.kill(); await sleep(200);
try { await fsp.rm(userDir, { recursive: true, force: true }); } catch {}
process.exit(0);
