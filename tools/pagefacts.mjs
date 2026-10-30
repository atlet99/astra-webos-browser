// Basic document facts + wheel log, for the page ASTRA currently shows.
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
const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
const ev = async (x) => { const r = await send("Runtime.evaluate", { expression: x, returnByValue: true }); if (r.exceptionDetails) return "ERR " + ((r.exceptionDetails.exception || {}).description || "").slice(0, 90); return r.result.value; };

await send("Runtime.enable");
const facts = await ev(`(function () {
  var d = document;
  var out = {
    url: location.href.slice(0, 60),
    ready: d.readyState,
    vis: d.visibilityState,
    hasFocus: d.hasFocus(),
    hasBody: !!d.body,
    nodes: d.querySelectorAll('*').length,
    title: d.title,
    doc: { sh: d.documentElement.scrollHeight, ch: d.documentElement.clientHeight },
    wheel: localStorage.getItem('astra_wheel')
  };
  if (d.body) {
    var b = d.body, r = b.getBoundingClientRect(), cs = getComputedStyle(b);
    out.body = { h: Math.round(r.height), top: Math.round(r.top), pad: b.style.paddingTop, box: cs.boxSizing, overflow: cs.overflowY };
    var sc = [];
    var all = d.querySelectorAll('div,main,section');
    for (var i = 0; i < all.length && sc.length < 5; i++) {
      var n = all[i];
      if (n.clientHeight > 300 && n.scrollHeight > n.clientHeight + 4) {
        var nr = n.getBoundingClientRect();
        sc.push({ tag: n.tagName, id: n.id, cls: String(n.className).slice(0, 24), ch: n.clientHeight, sh: n.scrollHeight, top: Math.round(nr.top), bottom: Math.round(nr.bottom) });
      }
    }
    out.scrollers = sc;
  }
  return out;
})()`);
console.log(JSON.stringify(facts, null, 1));

ws.close(); tun.kill(); await sleep(200);
process.exit(0);
