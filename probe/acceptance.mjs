// Real-TV UI acceptance for Aurora Browser.
// Run on the PC with the TV reachable over SSH. Saves screenshots + JSON.
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
const TOKEN = 'tvb-7f3c9a1d5e8b2c4f6a0d9e3b7c1f5a8d';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const RES = path.resolve(ROOT, '..', 'results');
const SSH = ['-i', KEY, '-o', `UserKnownHostsFile=${KNOWN}`, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ssh = (cmd) => execFileSync('ssh', [...SSH, `root@${TV}`, cmd], { encoding: 'utf8', timeout: 30000 });
function tunnel(local, remote) {
  return spawn('ssh', [...SSH, '-o', 'ExitOnForwardFailure=yes', '-N', '-L', `${local}:127.0.0.1:${remote}`, `root@${TV}`], { stdio: 'ignore' });
}
async function cdpTargets() {
  for (let i = 0; i < 10; i++) {
    try { return await (await fetch(`http://127.0.0.1:${CDP}/json`)).json(); } catch (e) { await sleep(600); }
  }
  throw new Error('CDP tunnel unavailable');
}
async function service(method, body) {
  const res = await fetch(`http://127.0.0.1:${HTTP}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tvb-token': TOKEN },
    body: JSON.stringify(Object.assign({ token: TOKEN }, body || {}))
  });
  return res.json();
}
async function connect() {
  const ts = await cdpTargets();
  const t = ts.find((x) => (x.description || '') === 'com.personal.tvwebbrowser');
  if (!t) throw new Error('browser target not found');
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
    } else if (m.method === 'Runtime.exceptionThrown') {
      exceptions.push(JSON.stringify(m.params.exceptionDetails).slice(0, 1200));
    }
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
  return { ws, send, ev, target: t, exceptions };
}
async function shot(c, name) {
  const r = await c.send('Page.captureScreenshot', { format: 'png' });
  if (!r.data) return 0;
  fs.mkdirSync(RES, { recursive: true });
  fs.writeFileSync(path.join(RES, name), Buffer.from(r.data, 'base64'));
  return Buffer.from(r.data, 'base64').length;
}
async function ensureForegroundApp() {
  const ts = await cdpTargets();
  for (const t of ts) {
    if ((t.description || '') === 'com.personal.tvwebbrowser') {
      await fetch(`http://127.0.0.1:${CDP}/json/close/${encodeURIComponent(t.id)}`);
    }
  }
  await sleep(800);
  ssh(`luna-send -n 1 luna://com.webos.applicationManager/launch '{"id":"com.personal.tvwebbrowser"}' < /dev/null`);
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    const list = await cdpTargets();
    if (list.some((x) => (x.description || '') === 'com.personal.tvwebbrowser')) return;
  }
  throw new Error('browser did not launch');
}
async function setHome() {
  const s = await service('getState', {});
  const id = s && s.state && s.state.activeTabId;
  if (id) await service('tabVisit', { id, url: 'about:home', title: '新标签页' });
}

async function main() {
  const out = { startedAt: new Date().toISOString(), checks: {}, screenshots: {} };
  const t1 = tunnel(CDP, 9998);
  const t2 = tunnel(HTTP, 7792);
  let c;
  try {
    await sleep(1800);
    await setHome();
    await ensureForegroundApp();
    c = await connect();
    await c.send('Runtime.enable');
    await c.send('Page.enable');
    out.start = { url: c.target.url, title: c.target.title };
    out.checks.start = (await c.ev(`(()=>({tabs:document.querySelectorAll('.tab').length,quicklinks:document.querySelectorAll('.quicklink').length,service:document.querySelector('#serviceStatus').innerText,title:document.title}))()`));
    out.screenshots.start = await shot(c, 'accept-start.png');

    // blocked site must stay on the start page with an in-app error panel
    await c.ev(`(()=>{document.querySelectorAll('.quicklink')[1].click();return true;})()`);
    await sleep(5000);
    const afterBlocked = await cdpTargets();
    const blockedTarget = afterBlocked.find((x) => (x.description || '') === 'com.personal.tvwebbrowser');
    out.blocked = { url: blockedTarget && blockedTarget.url, title: blockedTarget && blockedTarget.title };
    out.checks.blockedStaysInApp = !!(blockedTarget && blockedTarget.url.indexOf('com.personal.tvwebbrowser/index.html') >= 0) && !(blockedTarget && blockedTarget.url.indexOf('loaderror') >= 0);
    out.checks.blockedPanel = await c.ev(`(()=>({hidden:document.querySelector('#panel').hidden,title:document.querySelector('#panelTitle').innerText,text:document.querySelector('#panelBody').innerText.slice(0,400)}))()`);
    out.screenshots.blocked = await shot(c, 'accept-blocked.png');
    await c.ev(`(()=>{document.querySelector('#panelClose').click();return true;})()`);
    await sleep(400);

    // reachable site must load and retain the injected chrome
    await c.ev(`(()=>{document.querySelectorAll('.quicklink')[4].click();return true;})()`);
    c.ws.close();
    let baidu = null;
    for (let i = 0; i < 25; i++) {
      await sleep(800);
      const ts = await cdpTargets();
      const t = ts.find((x) => (x.description || '') === 'com.personal.tvwebbrowser');
      if (t && t.url.indexOf('baidu.com') >= 0) { baidu = t; break; }
    }
    out.baidu = { loaded: !!baidu, target: baidu ? { url: baidu.url, title: baidu.title } : null };
    if (baidu) {
      c = await connect();
      await c.send('Runtime.enable');
      for (let i = 0; i < 10; i++) {
        const ready = await c.ev(`!!(window.__TVB_CHROME__ && document.getElementById('tvb-chrome-host'))`);
        if (ready) break;
        await sleep(600);
      }
      out.checks.baiduChrome = await c.ev(`(()=>({href:location.href,title:document.title,marker:window.__TVB_CHROME__||null,host:!!document.getElementById('tvb-chrome-host'),bodyPad:document.body?document.body.style.paddingTop:null,bodyZoom:document.body?document.body.style.zoom:null,bridge:typeof window.PalmServiceBridge}))()`);
      out.screenshots.baidu = await shot(c, 'accept-baidu.png');
      // Ctrl+D bookmark
      await c.ev(`(()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'d',code:'KeyD',ctrlKey:true,bubbles:true,cancelable:true}));return true;})()`);
      await sleep(1500);
      const bstate = await service('getState', {});
      out.bookmark = bstate && bstate.state ? bstate.state.bookmarks.map((b) => ({ url: b.url, title: b.title })) : null;
      // Ctrl+T new tab
      await c.ev(`(()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'t',code:'KeyT',ctrlKey:true,bubbles:true,cancelable:true}));return true;})()`);
      c.ws.close();
      await sleep(4000);
      const ts2 = await cdpTargets();
      const nt = ts2.find((x) => (x.description || '') === 'com.personal.tvwebbrowser');
      out.newTab = { url: nt && nt.url, title: nt && nt.title };
      out.checks.newTabIsStartPage = !!(nt && (nt.url.indexOf('com.personal.tvwebbrowser/index.html') >= 0 || nt.url.indexOf('127.0.0.1:7792/home') >= 0));
      if (nt && (nt.url.indexOf('com.personal.tvwebbrowser/index.html') >= 0 || nt.url.indexOf('127.0.0.1:7792/home') >= 0)) {
        c = await connect();
        await c.send('Runtime.enable');
        out.checks.newTabUI = await c.ev(`(()=>({tabs:document.querySelectorAll('.tab').length,active:(document.querySelector('.tab.active')||{}).innerText||'',service:document.querySelector('#serviceStatus').innerText}))()`);
        out.screenshots.newTab = await shot(c, 'accept-newtab.png');
        // Ctrl+Tab should switch back to the Baidu tab (suspended tab model)
        await c.ev(`(()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',code:'Tab',ctrlKey:true,bubbles:true,cancelable:true}));return true;})()`);
        c.ws.close();
        await sleep(3500);
        const ts3 = await cdpTargets();
        const cyc = ts3.find((x) => (x.description || '') === 'com.personal.tvwebbrowser');
        out.tabCycle = { url: cyc && cyc.url, title: cyc && cyc.title };
        out.checks.tabCycleBackToBaidu = !!(cyc && cyc.url.indexOf('baidu.com') >= 0);
      }
    }
    out.exceptions = c ? c.exceptions : [];
  } catch (e) {
    out.error = String(e && e.stack || e);
  } finally {
    out.finishedAt = new Date().toISOString();
    fs.mkdirSync(RES, { recursive: true });
    fs.writeFileSync(path.join(RES, 'acceptance-ui.json'), JSON.stringify(out, null, 2) + '\n');
    console.log('UI_RESULT=' + path.join(RES, 'acceptance-ui.json'));
    console.log(JSON.stringify(out, null, 2).slice(0, 12000));
    try { t1.kill(); } catch {}
    try { t2.kill(); } catch {}
    process.exit(0);
  }
}

main();
