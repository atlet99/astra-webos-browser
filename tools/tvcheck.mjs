// Verify the freshly installed ASTRA build on the real TV: screenshot + DOM facts.
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const TV = process.env.TV_HOST || "192.168.31.60";
const KEY = path.join(os.homedir(), ".ssh", "id_ed25519_lgtv_g5");
const LOCAL = 20998;
const REMOTE = 9998;
const OUT = "H:/webOS-TVbox/tv-browser/results/astra-tv.png";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Bring the app to the foreground before asking the debugger about it. */
if (!process.env.NO_LAUNCH) {
  try {
    execFileSync("ssh", ["-i", KEY, "-o", "BatchMode=yes", `root@${TV}`,
      `luna-send -n 1 luna://com.webos.applicationManager/launch '{"id":"com.personal.tvwebbrowser"}'`],
      { encoding: "utf8", timeout: 30000 });
    console.log("launched");
    await sleep(3000);
  } catch (e) {
    console.log("launch failed:", String(e.message).slice(0, 120));
  }
}

let tun = spawn("ssh", ["-i", KEY, "-o", "BatchMode=yes", "-N",
  "-L", `${LOCAL}:127.0.0.1:${REMOTE}`, `root@${TV}`], { stdio: "ignore" });
async function targets() {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${LOCAL}/json`, { signal: AbortSignal.timeout(1500) });
      if (r.ok) return await r.json();
    } catch { /* tunnel still warming up */ }
    await sleep(500);
  }
  throw new Error("CDP tunnel unavailable");
}

const list = await targets();
console.log("targets:", JSON.stringify(list.map((t) => [t.type, t.description, t.url])));
const page = list.find((t) => (t.description || "") === "com.personal.tvwebbrowser");
if (!page) throw new Error("ASTRA target not present — refusing to touch another app");
console.log("target:", page.description, page.url);

let ws = null;
for (let i = 0; i < 5 && !ws; i++) {
  const cand = new WebSocket(page.webSocketDebuggerUrl.replace(":9998", ":" + LOCAL));
  try {
    await new Promise((res, rej) => {
      cand.onopen = res;
      cand.onerror = () => rej(new Error("ws fail"));
      setTimeout(() => rej(new Error("ws timeout")), 4000);
    });
    ws = cand;
  } catch {
    await sleep(700);
  }
}
if (!ws) throw new Error("could not attach to ASTRA target");
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } };
const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true })).result.value;

await send("Page.enable"); await send("Runtime.enable");
const where = async () => String(await ev("location.href"));
/* Click the real Home button in the injected toolbar (closed shadow root,
   so a real mouse event is the only honest way to reach it). */
const click = async (x, y) => {
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
};
if (!process.env.NO_CLICK && !(await where()).includes("7792/home")) {
  console.log("not on home, clicking Home:", await where());
  await click(176, 72);
  await sleep(5000);
  console.log("after click:", await where());
}
await sleep(2500);

const facts = await ev(`(() => {
  const q = (s) => document.querySelector(s);
  const r = (s) => { const n = q(s); if (!n) return null; const b = n.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), x: Math.round(b.x), y: Math.round(b.y) }; };
  return {
    title: document.title,
    url: location.href,
    wordmark: q('.wordmark') ? q('.wordmark').textContent : null,
    chrome: r('#chrome'),
    targets: document.querySelectorAll('.target').length,
    targetStates: [...document.querySelectorAll('.target')].map(n => (n.querySelector('.tname')||{}).textContent + ':' + (n.querySelector('.tstate')||{}).textContent),
    bookmarks: document.querySelectorAll('#bookmarkGrid .row').length,
    history: document.querySelectorAll('#historyGrid .row').length,
    telemetry: q('#tNet') ? [q('#tNet').textContent, q('#tTabs').textContent, q('#tSvc').textContent] : null,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    scrollH: document.documentElement.scrollHeight,
    innerH: window.innerHeight,
    overflow: document.documentElement.scrollHeight - window.innerHeight
  };
})()`);
console.log(JSON.stringify(facts, null, 2));

let shot;
try {
  shot = await Promise.race([
    send("Page.captureScreenshot", { format: "png" }),
    new Promise((_, rej) => setTimeout(() => rej(new Error("capture timeout")), 15000))
  ]);
} catch (e) {
  console.log("capture failed:", e.message);
  if (tun) tun.kill();
  process.exit(2);
}
await fs.writeFile(OUT, Buffer.from(shot.data, "base64"));
const st = await fs.stat(OUT);
console.log("screenshot:", OUT, st.size);

ws.close();
if (tun) tun.kill();
await sleep(300);
process.exit(0);
