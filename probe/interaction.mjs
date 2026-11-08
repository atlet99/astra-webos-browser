// Mouse/keyboard/session acceptance for Aurora Browser on the G5.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TV = process.env.TV_HOST || '192.168.31.60';
const KEY = path.join(os.homedir(), '.ssh', 'id_ed25519_lgtv_g5');
const KNOWN = path.join(os.homedir(), '.ssh', 'known_hosts_lgtv');
const CDP = 20998;
const HTTP = 17792;
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const RES = path.resolve(ROOT, '..', 'results');
const SSH = ['-i', KEY, '-o', `UserKnownHostsFile=${KNOWN}`, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ssh = (cmd) => execFileSync('ssh', [...SSH, `root@${TV}`, cmd], { encoding: 'utf8', timeout: 30000 });
function tunnel(local, remote) { return spawn('ssh', [...SSH, '-o', 'ExitOnForwardFailure=yes', '-N', '-L', `${local}:127.0.0.1:${remote}`, `root@${TV}`], { stdio: 'ignore' }); }
async function service(method, body) {
  const r = await fetch(`http://127.0.0.1:${HTTP}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-tvb-token': 'tvb-7f3c9a1d5e8b2c4f6a0d9e3b7c1f5a8d' }, body: JSON.stringify(Object.assign({ token: 'tvb-7f3c9a1d5e8b2c4f6a0d9e3b7c1f5a8d' }, body || {})) });
  return r.json();
}

async function targets() {
  for (let i = 0; i < 10; i++) {
    try { return await (await fetch(`http://127.0.0.1:${CDP}/json`)).json(); } catch (e) { await sleep(600); }
  }
  throw new Error('CDP unavailable');
}
async function connect() {
  const ts = await targets();
  const t = ts.find((x) => (x.description || '') === 'com.personal.tvwebbrowser');
  if (!t) throw new Error('no browser target');
  const ws = new WebSocket(t.webSocketDebuggerUrl.replace(':9998', `:${CDP}`));
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const exceptions = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') exceptions.push(JSON.stringify(m.params.exceptionDetails).slice(0, 1200));
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const n = ++id;
    pending.set(n, { res, rej });
    ws.send(JSON.stringify({ id: n, method, params }));
    setTimeout(() => { if (pending.has(n)) { pending.delete(n); rej(new Error(method + ' timeout')); } }, 20000);
  });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) return { __exception: r.exceptionDetails };
    return r.result.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  return { ws, send, ev, target: t, exceptions };
}
async function shot(c, name) {
  let r;
  try { r = await c.send('Page.captureScreenshot', { format: 'png' }); }
  catch (e) { return 0; }
  if (!r || !r.data) return 0;
  fs.mkdirSync(RES, { recursive: true });
  fs.writeFileSync(path.join(RES, name), Buffer.from(r.data, 'base64'));
  return Buffer.from(r.data, 'base64').length;
}
async function key(c, key, code, vk, modifiers = 0, text) {
  const p = { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  if (text !== undefined) { p.text = text; p.unmodifiedText = text; }
  await c.send('Input.dispatchKeyEvent', p);
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers });
}
async function waitUrl(part, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const ts = await targets();
    const t = ts.find((x) => (x.description || '') === 'com.personal.tvwebbrowser');
    if (t && t.url.indexOf(part) >= 0) return t;
    await sleep(500);
  }
  return null;
}
async function waitChrome(c, timeoutMs = 8000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const ok = await c.ev(`!!(window.__TVB_CHROME__ && document.getElementById('tvb-chrome-host'))`);
    if (ok) return true;
    await sleep(400);
  }
  return false;
}
async function restartApp() {
  const ts = await targets();
  for (const t of ts) if ((t.description || '') === 'com.personal.tvwebbrowser') await fetch(`http://127.0.0.1:${CDP}/json/close/${encodeURIComponent(t.id)}`);
  await sleep(800);
  ssh(`luna-send -n 1 luna://com.webos.applicationManager/launch '{"id":"com.personal.tvwebbrowser"}' < /dev/null`);
  await sleep(3500);
}
async function metrics() {
  try {
    const out = ssh(`
      echo MEM; grep -E 'MemTotal|MemAvailable|MemFree|SwapFree' /proc/meminfo
      echo PROC; ps -eo pid,rss,args | grep -E '[W]ebAppMgr --type=renderer|[t]vwebbrowser.service' | sed 's/--disable-quic.*//' | head -8
      echo LOAD; cat /proc/loadavg
    `);
    const m = {};
    const mem = {}; out.split(/\r?\n/).forEach((l) => { const x = /^([A-Za-z]+):\s+(\d+)/.exec(l); if (x) mem[x[1]] = Number(x[2]); });
    m.memKb = mem;
    m.lines = out;
    return m;
  } catch (e) { return { error: String(e) }; }
}

async function main() {
  const out = { startedAt: new Date().toISOString(), steps: [] };
  const tun = tunnel(CDP, 9998);
  const tunHttp = tunnel(HTTP, 7792);
  let c;
  try {
    await sleep(1800);
    const st = await service('getState', {});
    const sid = st && st.state && st.state.activeTabId;
    if (sid) await service('tabVisit', { id: sid, url: 'about:home', title: 'New Tab' });
    await restartApp();
    c = await connect();
    out.steps.push({ name: 'launch', target: c.target.url });
    // Mouse click the Baidu quick link on the start page.
    const rect = await c.ev(`(()=>{const q=document.querySelectorAll('.target')[4];if(!q)return null;const r=q.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    if (!rect) throw new Error('quicklink missing');
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y });
    await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    let t = await waitUrl('baidu.com', 20000);
    out.steps.push({ name: 'mouse-click-baidu', target: t && t.url });
    if (!t) throw new Error('Baidu did not load');
    c.ws.close(); c = await connect();
    out.chrome = await waitChrome(c);
    out.steps.push({ name: 'chrome-attached', marker: await c.ev(`window.__TVB_CHROME__||null`) });
    out.screenshots = out.screenshots || {};
    out.screenshots.baidu = await shot(c, 'interaction-baidu.png');
    // Mouse wheel scroll.
    const before = await c.ev('scrollY');
    let wheelError = null;
    try { await c.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 960, y: 700, deltaX: 0, deltaY: 700 }); }
    catch (e) { wheelError = String(e.message || e); }
    if (wheelError) await c.ev(`window.scrollTo(0, 700)`);
    await sleep(800);
    const after = await c.ev('scrollY');
    out.steps.push({ name: 'mouse-wheel', before, after, changed: after !== before, cdpWheelError: wheelError });
    // Ctrl+L, type Bing URL, Enter.
    await key(c, 'l', 'KeyL', 76, 2);
    await sleep(250);
    await c.send('Input.insertText', { text: 'https://www.bing.com/' });
    await sleep(250);
    await key(c, 'Enter', 'Enter', 13, 0, '');
    const bing = await waitUrl('bing.com', 20000);
    out.steps.push({ name: 'keyboard-go-bing', target: bing && bing.url });
    if (bing) {
      c.ws.close(); c = await connect();
      await waitChrome(c);
      // Alt+Left back.
      await key(c, 'Alt', 'AltLeft', 18, 1);
      await key(c, 'ArrowLeft', 'ArrowLeft', 37, 1);
      const back = await waitUrl('baidu.com', 15000);
      out.steps.push({ name: 'alt-left-back', target: back && back.url });
      if (back) { c.ws.close(); c = await connect(); await waitChrome(c); }
      // F11 fullscreen and back.
      await key(c, 'F11', 'F11', 122, 0);
      await sleep(700);
      out.steps.push({ name: 'fullscreen-on', padding: await c.ev(`document.body?document.body.style.paddingTop:null`) });
      out.screenshots.fullscreen = await shot(c, 'interaction-fullscreen.png');
      await key(c, 'F11', 'F11', 122, 0);
      await sleep(500);
      // Ctrl+Plus zoom, Ctrl+0 reset.
      await key(c, '+', 'Equal', 187, 2);
      await sleep(800);
      out.steps.push({ name: 'zoom-in', bodyZoom: await c.ev(`document.body?document.body.style.zoom:null`) });
      out.screenshots.zoom = await shot(c, 'interaction-zoom.png');
      await key(c, '0', 'Digit0', 48, 2);
      await sleep(500);
      // Ctrl+T new tab, then Ctrl+W close it.
      await key(c, 't', 'KeyT', 84, 2);
      const nt = await waitUrl('127.0.0.1:7792/home', 15000);
      out.steps.push({ name: 'ctrl-t', target: nt && nt.url });
      if (nt) {
        c.ws.close(); c = await connect();
        await waitChrome(c);
        out.steps.push({ name: 'tab-count-at-newtab', tabs: await c.ev(`document.querySelectorAll('.tab').length`) });
        await key(c, 'w', 'KeyW', 87, 2);
        const backTab = await waitUrl('baidu.com', 15000);
        out.steps.push({ name: 'ctrl-w-close', target: backTab && backTab.url });
      }
    }
    // Session restore: close app on Baidu and relaunch.
    c.ws.close();
    const now = await targets();
    for (const x of now) if ((x.description || '') === 'com.personal.tvwebbrowser') await fetch(`http://127.0.0.1:${CDP}/json/close/${encodeURIComponent(x.id)}`);
    await sleep(1000);
    ssh(`luna-send -n 1 luna://com.webos.applicationManager/launch '{"id":"com.personal.tvwebbrowser"}' < /dev/null`);
    await sleep(5000);
    const restored = await waitUrl('baidu.com', 20000);
    out.steps.push({ name: 'session-restore', target: restored && restored.url });
    if (restored) {
      c = await connect();
      out.steps.push({ name: 'session-restore-chrome', attached: await waitChrome(c) });
      out.screenshots.restored = await shot(c, 'interaction-restored.png');
    }
    out.metrics = await metrics();
    // Close the browser and verify TVBox target survives.
    c.ws.close();
    const beforeClose = await targets();
    for (const x of beforeClose) if ((x.description || '') === 'com.personal.tvwebbrowser') await fetch(`http://127.0.0.1:${CDP}/json/close/${encodeURIComponent(x.id)}`);
    await sleep(1500);
    const afterClose = await targets();
    out.steps.push({
      name: 'close-browser',
      browserTargetGone: !afterClose.some((x) => (x.description || '') === 'com.personal.tvwebbrowser'),
      tvboxTargetAlive: afterClose.some((x) => (x.description || '') === 'com.tvbox.webos')
    });
    out.metricsAfterClose = await metrics();
  } catch (e) {
    out.error = String(e && e.stack || e);
  } finally {
    out.finishedAt = new Date().toISOString();
    fs.mkdirSync(RES, { recursive: true });
    fs.writeFileSync(path.join(RES, 'interaction.json'), JSON.stringify(out, null, 2) + '\n');
    console.log('INTERACTION=' + JSON.stringify(out, null, 2).slice(0, 16000));
    try { tun.kill(); } catch {}
    try { tunHttp.kill(); } catch {}
    process.exit(0);
  }
}

main();
