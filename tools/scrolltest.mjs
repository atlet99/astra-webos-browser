// Regression test for the scroll trap: click a toolbar button, then arrow-scroll.
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const ROOT = "H:/webOS-TVbox/tv-browser";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 8966, CDP = 9366;
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

const userDir = path.join(os.tmpdir(), "astra-scroll-" + Date.now());
const child = spawn(CHROME, ["--headless=new", "--remote-debugging-port=" + CDP, "--user-data-dir=" + userDir,
  "--window-size=1280,720", "--hide-scrollbars", "--no-first-run", "--disable-extensions", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/probe/chrome-preview.html` });
await sleep(2500);

const state = () => ev(`({y:Math.round(scrollY),h:document.documentElement.scrollHeight,vh:innerHeight,active:document.activeElement.tagName})`);
const key = async (k, code, kc) => {
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code, windowsVirtualKeyCode: kc, nativeVirtualKeyCode: kc });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: kc, nativeVirtualKeyCode: kc });
  await sleep(320);
};
const click = async (x, y) => {
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  await sleep(300);
};

console.log("load:", JSON.stringify(await state()));

// Click the reload button in the toolbar (x 108..152, y 40..104 -> 130,72)
await click(130, 72);
console.log("after toolbar click:", JSON.stringify(await state()));

await key("ArrowDown", "ArrowDown", 40);
await key("ArrowDown", "ArrowDown", 40);
console.log("after 2x ArrowDown:", JSON.stringify(await state()));

await key("ArrowDown", "ArrowDown", 40);
console.log("after 3x ArrowDown:", JSON.stringify(await state()));

// Click the page, then arrow again
await click(640, 500);
console.log("after page click:", JSON.stringify(await state()));
await key("ArrowDown", "ArrowDown", 40);
console.log("after page+ArrowDown:", JSON.stringify(await state()));

// Wheel over the toolbar must scroll the page
await ev("window.scrollTo(0,0)");
await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 400, y: 70, deltaX: 0, deltaY: 300 });
await sleep(500);
console.log("after wheel over toolbar:", JSON.stringify(await state()));

// Three wheels on the body: each must add ~300, never double
await ev("window.scrollTo(0,0)");
for (let i = 0; i < 3; i++) {
  await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 640, y: 400, deltaX: 0, deltaY: 300 });
  await sleep(600);
  console.log("body wheel " + (i + 1) + ":", JSON.stringify(await state()));
}

ws.close(); child.kill(); server.close(); await sleep(200);
try { await fsp.rm(userDir, { recursive: true, force: true }); } catch {}
process.exit(0);
