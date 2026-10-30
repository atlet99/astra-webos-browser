// Real-device wheel benchmark: dispatch N notches on the TV and read the
// in-page perf counters.
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const TV = process.env.TV_HOST || "192.168.31.60";
const KEY = path.join(os.homedir(), ".ssh", "id_ed25519_lgtv_g5");
const LOCAL = 20998, REMOTE = 9998;
const N = Number(process.argv[2] || 24);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tun = spawn("ssh", ["-i", KEY, "-o", "BatchMode=yes", "-N",
  "-L", `${LOCAL}:127.0.0.1:${REMOTE}`, `root@${TV}`], { stdio: "ignore" });
async function targets() {
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch(`http://127.0.0.1:${LOCAL}/json`, { signal: AbortSignal.timeout(1500) }); if (r.ok) return await r.json(); } catch {}
    await sleep(500);
  }
  throw new Error("tunnel down");
}
const list = await targets();
const page = list.find((t) => (t.description || "") === "com.personal.tvwebbrowser");
if (!page) throw new Error("ASTRA missing");
const ws = new WebSocket(page.webSocketDebuggerUrl.replace(":9998", ":" + LOCAL));
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("ws")); setTimeout(() => rej(new Error("ws timeout")), 5000); });
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } };
const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
const ev = async (x) => { const r = await send("Runtime.evaluate", { expression: x, returnByValue: true }); if (r.exceptionDetails) return "ERR " + ((r.exceptionDetails.exception || {}).description || "").slice(0, 100); return r.result.value; };

await send("Runtime.enable");
const url = await ev("location.href.slice(0,50)");
const docMax = await ev("(document.scrollingElement||document.documentElement).scrollHeight - innerHeight");
console.log("url:", url, "scrollRange:", docMax);

await ev("window.scrollTo(0,0)");
await sleep(500);
const before = await ev("JSON.parse(JSON.stringify(window.__TVB_PERF__ || {}))");

for (let i = 0; i < N; i++) {
  await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 900, y: 600, deltaX: 0, deltaY: 120 });
  await sleep(90);
}
await sleep(1800);
const after = await ev("JSON.parse(JSON.stringify(window.__TVB_PERF__ || {}))");

const d = {};
for (const k of Object.keys(after || {})) d[k] = (after[k] || 0) - ((before || {})[k] || 0);
console.log(JSON.stringify({
  notches: N,
  scrollY: await ev("Math.round(scrollY)"),
  wheel: d.wheel,
  wheelMs: +(d.wheelMs || 0).toFixed(2),
  perWheelMs: d.wheel ? +((d.wheelMs || 0) / d.wheel).toFixed(3) : null,
  wheelFrames: d.wheelFrames,
  wheelMiss: d.wheelMiss,
  renderTabs: d.renderTabs,
  render: d.render,
  svc: d.svc,
  svcStateBytes: d.svcStateBytes
}, null, 2));

ws.close(); tun.kill(); await sleep(200);
process.exit(0);
