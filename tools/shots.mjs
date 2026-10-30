import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const ROOT = "H:/webOS-TVbox/tv-browser";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 8944;
const CDP = 9344;
const OUT = path.join(ROOT, "results");

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".json": "application/json" };
const server = http.createServer(async (req, res) => {
  try {
    const u = decodeURIComponent(req.url.split("?")[0]);
    const base = path.resolve(ROOT);
    const f = path.resolve(base, "." + (u === "/" ? "/app/index.html" : u));
    if (!f.toLowerCase().startsWith(base.toLowerCase())) { res.writeHead(403); res.end(); return; }
    const buf = await fsp.readFile(f);
    res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(buf);
  } catch (e) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  }
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const userDir = path.join(os.tmpdir(), "astra-shot-" + Date.now());
const child = spawn(CHROME, [
  "--headless=new", "--remote-debugging-port=" + CDP, "--user-data-dir=" + userDir,
  "--window-size=1920,1080", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check",
  "--disable-extensions", "--force-device-scale-factor=1", "about:blank"
], { stdio: ["ignore", "pipe", "pipe"] });
let errBuf = "";
child.stderr.on("data", (d) => (errBuf += d.toString()));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(p) {
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(`http://127.0.0.1:${CDP}${p}`); if (r.ok) return await r.json(); } catch {}
    await sleep(200);
  }
  throw new Error("devtools unreachable " + errBuf.slice(-300));
}
const targets = await getJson("/json/list");
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = (e) => rej(new Error("ws " + e.message)); });

let id = 0;
const pending = new Map();
const logs = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    return;
  }
  if (m.method === "Runtime.exceptionThrown") logs.push({ t: "exception", text: m.params.exceptionDetails.text + " " + (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || "") });
  if (m.method === "Log.entryAdded" && m.params.entry.level === "error") logs.push({ t: "log", text: m.params.entry.text });
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") logs.push({ t: "console", text: (m.params.args || []).map((a) => a.value || a.description || "").join(" ") });
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const mid = ++id; pending.set(mid, { resolve, reject });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result.value;
};
const shot = async (name) => {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const p = path.join(OUT, name);
  await fsp.writeFile(p, Buffer.from(r.data, "base64"));
  const s = await fsp.stat(p);
  console.log("shot", name, s.size);
};

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });

const now = Date.now();
const state = {
  tabs: [{ id: "t_home", url: "about:home", title: "新标签页", history: [{ url: "about:home", title: "新标签页", at: now }], historyIndex: 0, scrollY: 0 }],
  activeTabId: "t_home",
  bookmarks: [
    { id: "b1", url: "https://www.bilibili.com/", title: "哔哩哔哩 (゜-゜)つロ 干杯~", createdAt: now - 86400000 },
    { id: "b2", url: "https://www.zhihu.com/", title: "知乎 - 有问题，就会有答案", createdAt: now - 3600000 }
  ],
  history: [
    { id: "h1", url: "https://www.baidu.com/s?wd=webos", title: "webos_百度搜索", at: now - 60000 },
    { id: "h2", url: "https://www.baidu.com/s?wd=webos", title: "https://www.baidu.com/s?wd=webos", at: now - 120000 },
    { id: "h3", url: "https://www.bilibili.com/", title: "哔哩哔哩 (゜-゜)つロ 干杯~", at: now - 3600000 },
    { id: "h4", url: "https://www.zhihu.com/hot", title: "热榜 - 知乎", at: now - 7200000 },
    { id: "h5", url: "https://www.douban.com/", title: "豆瓣电影", at: now - 90000000 },
    { id: "h6", url: "https://www.weibo.com/", title: "微博 - 随时随地发现新鲜事", at: now - 90000000 },
    { id: "h7", url: "file:///usr/palm/applications/com.webos.app.webappmanager/wam/loaderror.html?errorCode=-105&hostname=wikipedia.org", title: "Application Error", at: now - 8000000 }
  ],
  settings: { searchEngine: "baidu", restoreSession: true, zoom: 1, homeUrl: "http://127.0.0.1:7792/home", engineFixed: true }
};
const probes = { at: now, map: { "https://www.baidu.com/": "ok", "https://www.bing.com/": "ok", "https://www.bilibili.com/": "ok", "https://www.zhihu.com/": "ok", "https://www.douban.com/": "bad", "https://weibo.com/": "ok" } };

await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `try{localStorage.setItem('tvb_state_v1', ${JSON.stringify(JSON.stringify(state))});localStorage.setItem('astra_probe_v1', ${JSON.stringify(JSON.stringify(probes))});}catch(e){}`
});

await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/app/index.html` });
await sleep(1800);
await shot("astra-start.png");

await ev(`document.querySelector('#menuBtn').click()`);
await sleep(400);
await shot("astra-menu.png");

await ev(`[...document.querySelectorAll('#panelBody .panel-row')].find(n=>n.textContent.indexOf('设置')>=0).click()`);
await sleep(400);
await shot("astra-settings.png");

await ev(`document.querySelector('#panelClose').click()`);
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/app/index.html?v=2#error=wikipedia.org%7C-105` });
await sleep(1600);
await shot("astra-error.png");

await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/probe/chrome-preview.html` });
await sleep(3600);
await shot("astra-chrome.png");

const metrics = await ev(`(() => {
  const g = (s) => document.querySelector(s);
  const box = (s) => { const n = g(s); if (!n) return null; const r = n.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
  return { title: document.title, chrome: box('#chrome'), cmd: box('.cmd'), target: box('.target'), row: box('.row'), targets: document.querySelectorAll('.target').length, rows: document.querySelectorAll('.row').length };
})()`);
console.log(JSON.stringify({ metrics, logs }, null, 2));

ws.close();
child.kill();
server.close();
await sleep(300);
try { await fsp.rm(userDir, { recursive: true, force: true }); } catch {}
process.exit(0);
