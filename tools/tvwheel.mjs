// Try to inject a real wheel event on the TV and see whether our handler runs.
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const TV = process.env.TV_HOST || "192.168.31.60";
const KEY = path.join(os.homedir(), ".ssh", "id_ed25519_lgtv_g5");
const LOCAL = 20998, REMOTE = 9998;
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
const send = (method, params = {}, ms = 5000) => new Promise((resolve, reject) => {
  const n = ++id;
  const timer = setTimeout(() => { pending.delete(n); reject(new Error("timeout " + method)); }, ms);
  pending.set(n, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
  ws.send(JSON.stringify({ id: n, method, params }));
});
const ev = async (x) => { const r = await send("Runtime.evaluate", { expression: x, returnByValue: true }); if (r.exceptionDetails) return "ERR"; return r.result.value; };

await send("Runtime.enable");
console.log("before:", JSON.stringify(await ev("({y:Math.round(scrollY),log:localStorage.getItem('astra_wheel')})")));

try {
  await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 900, y: 600, deltaX: 0, deltaY: 400 });
  console.log("wheel dispatched");
} catch (e) {
  console.log("wheel dispatch failed:", e.message);
}
await sleep(800);
console.log("after:", JSON.stringify(await ev("({y:Math.round(scrollY),log:localStorage.getItem('astra_wheel')})")));

ws.close(); tun.kill(); await sleep(200);
process.exit(0);
