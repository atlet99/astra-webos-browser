import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const ROOT = "H:/webOS-TVbox/tv-browser";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 8955;
const CDP = 9355;
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png" };
const server = http.createServer(async (req, res) => {
  try {
    const u = decodeURIComponent(req.url.split("?")[0]);
    const base = path.resolve(ROOT);
    const f = path.resolve(base, "." + (u === "/" ? "/app/index.html" : u));
    if (!f.toLowerCase().startsWith(base.toLowerCase())) { res.writeHead(403); res.end(); return; }
    const buf = await fsp.readFile(f);
    res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" });
    res.end(buf);
  } catch { res.writeHead(404); res.end("nf"); }
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const userDir = path.join(os.tmpdir(), "astra-key-" + Date.now());
const child = spawn(CHROME, ["--headless=new", "--remote-debugging-port=" + CDP, "--user-data-dir=" + userDir,
  "--window-size=1920,1080", "--no-first-run", "--disable-extensions", "about:blank"], { stdio: ["ignore", "pipe", "pipe"] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(p) {
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(`http://127.0.0.1:${CDP}${p}`); if (r.ok) return await r.json(); } catch {}
    await sleep(200);
  }
  throw new Error("devtools unreachable");
}
const t = (await getJson("/json/list")).find((x) => x.type === "page");
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("ws")); });
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } };
const send = (method, params = {}) => new Promise((resolve, reject) => { const mid = ++id; pending.set(mid, { resolve, reject }); ws.send(JSON.stringify({ id: mid, method, params })); });
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true })).result.value;
const key = async (k, code, keyCode) => {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
  await sleep(180);
};
const active = () => ev(`(() => { const a = document.activeElement; if (!a) return 'none'; const r = a.getBoundingClientRect(); return (a.id || a.className || a.tagName) + ' | ' + (a.textContent || '').trim().slice(0, 12) + ' | ' + Math.round(r.x) + ',' + Math.round(r.y); })()`);

await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
const now = Date.now();
const state = {
  tabs: [{ id: "t_home", url: "about:home", title: "新标签页", history: [{ url: "about:home", title: "新标签页", at: now }], historyIndex: 0, scrollY: 0 }],
  activeTabId: "t_home",
  bookmarks: [{ id: "b1", url: "https://www.bilibili.com/", title: "哔哩哔哩", createdAt: now }],
  history: [{ id: "h1", url: "https://www.baidu.com/s?wd=x", title: "百度搜索", at: now }],
  settings: { searchEngine: "baidu", restoreSession: true, zoom: 1, homeUrl: "http://127.0.0.1:7792/home", engineFixed: true }
};
await send("Page.addScriptToEvaluateOnNewDocument", { source: `try{localStorage.setItem('tvb_state_v1', ${JSON.stringify(JSON.stringify(state))});}catch(e){}` });
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/app/index.html` });
await sleep(1600);

const out = {};
out.start = await active();
await key("ArrowDown", "ArrowDown", 40); out.afterDown1 = await active();
await key("ArrowDown", "ArrowDown", 40); out.afterDown2 = await active();
await key("ArrowRight", "ArrowRight", 39); out.afterRight = await active();
await key("Enter", "Enter", 13); await sleep(400); out.afterEnter = await ev(`location.href`);
await ev(`document.querySelector('#menuBtn').click()`); await sleep(250);
out.panelOpen = await ev(`!document.querySelector('#panel').hidden`);
out.panelFocus = await active();
await key("Escape", "Escape", 27); await sleep(200);
out.panelClosed = await ev(`document.querySelector('#panel').hidden`);
out.focusAfterClose = await active();
out.bookmarksRendered = await ev(`document.querySelectorAll('#bookmarkGrid .row').length`);
out.historyRendered = await ev(`document.querySelectorAll('#historyGrid .row').length`);
out.tabRole = await ev(`document.querySelector('#tabs .tab').getAttribute('role')`);
out.ariaSelected = await ev(`document.querySelector('#tabs .tab').getAttribute('aria-selected')`);
console.log(JSON.stringify(out, null, 2));

ws.close(); child.kill(); server.close(); await sleep(300);
try { await fsp.rm(userDir, { recursive: true, force: true }); } catch {}
process.exit(0);
