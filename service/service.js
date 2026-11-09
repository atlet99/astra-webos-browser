'use strict';

/*
 * TV Browser state service.
 * Stores tabs, per-tab history, global history, bookmarks and settings.
 * Primary transport: webOS Luna (webos-service). Fallback: 127.0.0.1:7792.
 * No system privileges, no shell, no filesystem access outside its own state file.
 */

var http = require('http');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var net = require('net');
var tls = require('tls');

var SERVICE_ID = 'com.personal.tvwebbrowser.service';
var TOKEN = 'tvb-7f3c9a1d5e8b2c4f6a0d9e3b7c1f5a8d';
var PORT = 7792;
var APP_ID = 'com.personal.tvwebbrowser';
var APP_DIR_CANDIDATES = [
  '/media/developer/apps/usr/palm/applications/' + APP_ID,
  path.resolve(__dirname, '..', '..', 'applications', APP_ID)
];
var APP_DIR = fs.existsSync(path.join(__dirname, 'public', 'index.html'))
  ? path.join(__dirname, 'public')
  : (APP_DIR_CANDIDATES.find(function (d) { try { return fs.existsSync(path.join(d, 'index.html')); } catch (e) { return false; } }) || APP_DIR_CANDIDATES[0]);
var MAX_TABS = 8;
var MAX_BOOKMARKS = 200;
var MAX_HISTORY = 300;
var MAX_TAB_HISTORY = 60;

function now() { return Date.now(); }
function uid(prefix) { return prefix + now().toString(36) + crypto.randomBytes(3).toString('hex'); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }

var LOCALES = ['auto', 'en-US', 'en-GB', 'ru', 'kk', 'uz', 'zh-CN'];
function normalizeLocale(v) {
  if (typeof v !== 'string') return 'auto';
  if (LOCALES.indexOf(v) >= 0) return v;
  var low = v.toLowerCase();
  if (low === 'kz') return 'kk';
  if (low === 'uzb') return 'uz';
  if (low === 'cn') return 'zh-CN';
  for (var i = 0; i < LOCALES.length; i++) { if (LOCALES[i].toLowerCase() === low) return LOCALES[i]; }
  return 'auto';
}

function defaultState() {
  return {
    version: 1,
    tabs: [],
    activeTabId: '',
    bookmarks: [],
    history: [],
    settings: {
      searchEngine: 'google',
      restoreSession: true,
      zoom: 1,
      homeUrl: '',
      locale: 'auto'
    },
    updatedAt: now()
  };
}

function dataDir() {
  var candidates = ['/var/palm/data/' + SERVICE_ID, '/tmp/tv-browser'];
  for (var i = 0; i < candidates.length; i++) {
    try {
      fs.mkdirSync(candidates[i], { recursive: true });
      var probe = path.join(candidates[i], '.write-test');
      fs.writeFileSync(probe, 'ok');
      fs.unlinkSync(probe);
      return candidates[i];
    } catch (e) { /* try next */ }
  }
  return '/tmp';
}

var DATA_DIR = dataDir();
var STATE_FILE = path.join(DATA_DIR, 'state.json');

function normalizeTab(t) {
  return {
    id: String(t.id || uid('t_')),
    url: String(t.url || 'about:home'),
    title: String(t.title || (t.url === 'about:home' ? 'New Tab' : 'Untitled')),
    history: Array.isArray(t.history) ? t.history.filter(function (h) { return h && h.url && String(h.url).indexOf('/wam/loaderror.html') < 0; }).map(function (h) {
      return { url: String(h.url), title: String(h.title || ''), at: Number(h.at || now()) };
    }).slice(-MAX_TAB_HISTORY) : [],
    historyIndex: Number.isInteger(t.historyIndex) ? t.historyIndex : 0,
    scrollY: Number(t.scrollY || 0),
    createdAt: Number(t.createdAt || now()),
    updatedAt: Number(t.updatedAt || now())
  };
}

function normalizeState(raw) {
  var s = Object.assign(defaultState(), raw || {});
  s.tabs = Array.isArray(s.tabs) ? s.tabs.slice(0, MAX_TABS).map(normalizeTab) : [];
  s.bookmarks = Array.isArray(s.bookmarks) ? s.bookmarks.filter(function (b) { return b && b.url; }).map(function (b) {
    return { id: String(b.id || uid('b_')), url: String(b.url), title: String(b.title || b.url), createdAt: Number(b.createdAt || now()) };
  }).slice(0, MAX_BOOKMARKS) : [];
  s.history = Array.isArray(s.history) ? s.history.filter(function (h) { return h && h.url && String(h.url).indexOf('/wam/loaderror.html') < 0; }).map(function (h) {
    return { id: String(h.id || uid('h_')), url: String(h.url), title: String(h.title || h.url), at: Number(h.at || now()) };
  }).slice(0, MAX_HISTORY) : [];
  s.settings = Object.assign({ searchEngine: 'google', restoreSession: true, zoom: 1, homeUrl: '', locale: 'auto' }, s.settings || {});
  s.settings.zoom = Math.max(0.5, Math.min(2, Number(s.settings.zoom) || 1));
  s.settings.locale = normalizeLocale(s.settings.locale);
  if (!s.tabs.length) {
    var t = normalizeTab({ url: 'about:home', title: 'New Tab' });
    t.history = [{ url: 'about:home', title: 'New Tab', at: now() }];
    t.historyIndex = 0;
    s.tabs.push(t);
  }
  if (!s.activeTabId || !s.tabs.some(function (t) { return t.id === s.activeTabId; })) {
    s.activeTabId = s.tabs[0].id;
  }
  s.tabs.forEach(function (t) {
    if (t.historyIndex < 0) t.historyIndex = 0;
    if (t.historyIndex >= t.history.length) t.historyIndex = Math.max(0, t.history.length - 1);
    if (t.history.length && !t.history[t.historyIndex]) t.url = t.history[t.historyIndex].url;
  });
  s.updatedAt = Number(s.updatedAt || now());
  return s;
}

function loadState() {
  try {
    var raw = fs.readFileSync(STATE_FILE, 'utf8');
    return normalizeState(JSON.parse(raw));
  } catch (e) {
    return normalizeState(defaultState());
  }
}

var state = loadState();
/* Persistence: debounce, then serialise off the request path with an async
   write queue. Because the snapshot is taken at flush time, a queued write can
   never publish an older state over a newer one. */
var saveTimer = null;
var writing = false;
var writeQueued = false;
var dirty = false;

function saveState() {
  state.updatedAt = now();
  state.rev = (state.rev || 0) + 1;
  dirty = true;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushState, 250);
}

function flushState() {
  if (!dirty) return;
  if (writing) { writeQueued = true; return; }
  writing = true;
  dirty = false;
  var snap;
  try { snap = JSON.stringify(state); } catch (e) { writing = false; return; }
  var tmp = STATE_FILE + '.tmp';
  fs.writeFile(tmp, snap, function () {
    fs.rename(tmp, STATE_FILE, function (err) {
      writing = false;
      if (err) { dirty = true; }
      if (writeQueued) { writeQueued = false; flushState(); }
    });
  });
}

/* Best effort flush on shutdown; the debounce window is 250 ms so this rarely
   has anything to do. */
function flushSync() {
  if (!dirty || writing) return;
  try {
    var tmp = STATE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, STATE_FILE);
    dirty = false;
  } catch (e) { /* ignore */ }
}
['SIGTERM', 'SIGINT'].forEach(function (sig) {
  try { process.on(sig, function () { flushSync(); process.exit(0); }); } catch (e) { /* ignore */ }
});
try { process.on('exit', flushSync); } catch (e) { /* ignore */ }

function tabById(id) {
  return state.tabs.find(function (t) { return t.id === id; }) || null;
}

function activeTab() {
  return tabById(state.activeTabId) || state.tabs[0];
}

function isHomeUrl(url) {
  return !url || url === 'about:home' ||
    /\/com\.personal\.tvwebbrowser\/index\.html(?:[#?].*)?$/.test(String(url)) ||
    /^http:\/\/127\.0\.0\.1:7792\/home(?:[#?].*)?$/.test(String(url));
}

function cleanUrl(url) {
  var u = String(url || '').trim();
  if (isHomeUrl(u)) return 'about:home';
  return u;
}

function addGlobalHistory(url, title) {
  if (!url || url === 'about:home' || url === 'about:blank' || String(url).indexOf('/wam/loaderror.html') >= 0) return;
  var first = state.history[0];
  if (first && first.url === url && first.title === title) return;
  state.history.unshift({ id: uid('h_'), url: url, title: title || url, at: now() });
  if (state.history.length > MAX_HISTORY) state.history.length = MAX_HISTORY;
}

function visit(p) {
  var rawUrl = String(p.url || '');
  if (rawUrl.indexOf('/wam/loaderror.html') >= 0 || rawUrl === 'about:blank') {
    return { returnValue: true, state: state };
  }
  var url = cleanUrl(p.url);
  var title = String(p.title || (url === 'about:home' ? 'New Tab' : ''));
  var tab = p.id ? tabById(p.id) : null;
  if (!tab) {
    tab = normalizeTab({ id: p.id || uid('t_'), url: url, title: title || 'New Tab' });
    tab.history = [{ url: url, title: tab.title, at: now() }];
    tab.historyIndex = 0;
    state.tabs.push(tab);
    if (state.tabs.length > MAX_TABS) state.tabs.shift();
    state.activeTabId = tab.id;
  } else {
    var current = tab.history[tab.historyIndex];
    var urlChanged = !current || current.url !== url;
    if (urlChanged) {
      tab.history = tab.history.slice(0, tab.historyIndex + 1);
      tab.history.push({ url: url, title: title || url, at: now() });
      if (tab.history.length > MAX_TAB_HISTORY) tab.history.shift();
      tab.historyIndex = tab.history.length - 1;
    } else {
      current.title = title || current.title;
      current.at = now();
    }
    tab.url = url;
    tab.title = title || (url === 'about:home' ? 'New Tab' : url);
    tab.updatedAt = now();
    if (p.scrollY !== undefined && urlChanged) tab.scrollY = Number(p.scrollY) || 0;
    if (p.activate !== false) state.activeTabId = tab.id;
  }
  addGlobalHistory(url, tab.title);
  saveState();
  return { returnValue: true, state: state, tab: clone(tab) };
}

function tabOpen(p) {
  var url = cleanUrl(p.url || 'about:home');
  var t = normalizeTab({ url: url, title: p.title || (url === 'about:home' ? 'New Tab' : url) });
  t.history = [{ url: url, title: t.title, at: now() }];
  t.historyIndex = 0;
  state.tabs.push(t);
  if (state.tabs.length > MAX_TABS) state.tabs.shift();
  if (p.activate !== false) state.activeTabId = t.id;
  addGlobalHistory(url, t.title);
  saveState();
  return { returnValue: true, state: state, tab: clone(t) };
}

function tabActivate(p) {
  var t = tabById(p.id);
  if (!t) return { returnValue: false, error: 'unknown tab' };
  state.activeTabId = t.id;
  saveState();
  return { returnValue: true, state: state, tab: clone(t) };
}

function tabClose(p) {
  var idx = state.tabs.findIndex(function (t) { return t.id === p.id; });
  if (idx < 0) return { returnValue: false, error: 'unknown tab' };
  var wasActive = state.tabs[idx].id === state.activeTabId;
  state.tabs.splice(idx, 1);
  if (!state.tabs.length) {
    var home = normalizeTab({ url: 'about:home', title: 'New Tab' });
    home.history = [{ url: 'about:home', title: 'New Tab', at: now() }];
    home.historyIndex = 0;
    state.tabs.push(home);
    state.activeTabId = home.id;
  } else if (wasActive) {
    state.activeTabId = state.tabs[Math.min(idx, state.tabs.length - 1)].id;
  }
  saveState();
  return { returnValue: true, state: state, activeTab: clone(activeTab()) };
}

function tabUpdate(p) {
  var t = tabById(p.id);
  if (!t) return { returnValue: false, error: 'unknown tab' };
  var changed = false;
  if (p.title !== undefined && t.title !== String(p.title || '')) { t.title = String(p.title || ''); changed = true; }
  if (p.scrollY !== undefined) {
    var y = Number(p.scrollY) || 0;
    if (t.scrollY !== y) { t.scrollY = y; changed = true; }
  }
  if (!changed) return { returnValue: true, id: t.id, scrollY: t.scrollY, unchanged: true };
  t.updatedAt = now();
  saveState();
  /* Scroll ticks are the hottest call in the app: acknowledge with the two
     fields the caller already knows instead of shipping the whole state. */
  return { returnValue: true, id: t.id, scrollY: t.scrollY, rev: state.rev };
}

function historyMove(p, delta) {
  var t = tabById(p.id);
  if (!t) return { returnValue: false, error: 'unknown tab' };
  var next = t.historyIndex + delta;
  if (next < 0 || next >= t.history.length) return { returnValue: false, error: 'no more history', state: state };
  t.historyIndex = next;
  var entry = t.history[next];
  t.url = entry.url;
  t.title = entry.title || t.title;
  t.updatedAt = now();
  state.activeTabId = t.id;
  saveState();
  return { returnValue: true, state: state, url: entry.url, title: entry.title || '' };
}

function bookmarkToggle(p) {
  var url = cleanUrl(p.url);
  if (url === 'about:home') return { returnValue: false, error: 'cannot bookmark home' };
  var idx = state.bookmarks.findIndex(function (b) { return b.url === url; });
  if (idx >= 0) state.bookmarks.splice(idx, 1);
  else {
    state.bookmarks.unshift({ id: uid('b_'), url: url, title: String(p.title || url), createdAt: now() });
    if (state.bookmarks.length > MAX_BOOKMARKS) state.bookmarks.length = MAX_BOOKMARKS;
  }
  saveState();
  return { returnValue: true, state: state };
}

function historyDelete(p) {
  state.history = state.history.filter(function (h) { return h.id !== p.id; });
  saveState();
  return { returnValue: true, state: state };
}

function clearBrowsingData() {
  state.history = []; persist();
  try { var fs = require('fs'); fs.writeFileSync('/tmp/tv-browser/cleared', 'cache,cookies'); } catch (e) {}
  try { var d = '/tmp/tv-browser/state.json'; var st = JSON.parse(fsForState(d)); } catch (e) {}
  return { returnValue: true, state: state, cleared: ['history','cache','cookies'] };
  function fsForState(p) { var fs = require('fs'); return fs.readFileSync(p, 'utf8'); }
}
function historyClear() {
  state.history = [];
  saveState();
  return { returnValue: true, state: state };
}

function setSetting(p) {
  var key = String(p.key || '');
  if (['searchEngine', 'restoreSession', 'zoom', 'homeUrl', 'locale'].indexOf(key) < 0) {
    return { returnValue: false, error: 'unknown setting' };
  }
  state.settings[key] = p.value;
  state.settings = normalizeState({ settings: state.settings, tabs: state.tabs, activeTabId: state.activeTabId }).settings;
  saveState();
  return { returnValue: true, state: state };
}

function importState(p) {
  var incoming = normalizeState(p.state || {});
  if (!state.tabs.length || state.tabs.length === 1 && state.tabs[0].url === 'about:home') {
    if (incoming.tabs.length) state.tabs = incoming.tabs;
    state.activeTabId = incoming.activeTabId || state.tabs[0].id;
  }
  var byUrl = {};
  state.bookmarks.forEach(function (b) { byUrl[b.url] = b; });
  incoming.bookmarks.forEach(function (b) { if (!byUrl[b.url]) byUrl[b.url] = b; });
  state.bookmarks = Object.keys(byUrl).map(function (k) { return byUrl[k]; }).slice(0, MAX_BOOKMARKS);
  var hist = {};
  state.history.concat(incoming.history).forEach(function (h) { hist[h.url + '|' + h.at] = h; });
  state.history = Object.keys(hist).map(function (k) { return hist[k]; }).sort(function (a, b) { return b.at - a.at; }).slice(0, MAX_HISTORY);
  state.settings = Object.assign(state.settings, incoming.settings || {});
  saveState();
  return { returnValue: true, state: state };
}


/* Reachability cache. Successes are reused for minutes, failures only briefly,
   and concurrent probes for the same origin share one socket. */
var PROBE_OK_TTL = 10 * 60 * 1000;
var PROBE_FAIL_TTL = 30 * 1000;
var PROBE_MAX_ENTRIES = 200;
var probeCache = Object.create(null);
var probeInflight = Object.create(null);
var probeCacheKeys = 0;

function probeCacheGet(key) {
  var c = probeCache[key];
  if (!c) return null;
  var ttl = c.ok ? PROBE_OK_TTL : PROBE_FAIL_TTL;
  if (now() - c.at > ttl) { delete probeCache[key]; probeCacheKeys--; return null; }
  return c;
}
function probeCacheSet(key, ok, error) {
  if (!probeCache[key]) {
    if (probeCacheKeys >= PROBE_MAX_ENTRIES) {
      var oldest = null, oldestAt = Infinity;
      for (var k in probeCache) { if (probeCache[k].at < oldestAt) { oldestAt = probeCache[k].at; oldest = k; } }
      if (oldest) { delete probeCache[oldest]; probeCacheKeys--; }
    }
    probeCacheKeys++;
  }
  probeCache[key] = { ok: !!ok, error: error || null, at: now() };
}

function doProbe(host, port, isHttps, timeoutMs) {
  return new Promise(function (resolve) {
    var done = false;
    var socket;
    function finish(ok, error) {
      if (done) return;
      done = true;
      try { if (socket) socket.destroy(); } catch (e) { /* ignore */ }
      resolve({ returnValue: true, ok: !!ok, host: host, port: port, error: error || null });
    }
    function onConnect() {
      if (!isHttps) { finish(true); return; }
      var cert;
      try { cert = socket.getPeerCertificate(); } catch (e) { cert = null; }
      if (cert && cert.subjectaltname) {
        var names = String(cert.subjectaltname).split(',').map(function (x) { return x.trim().replace(/^DNS:/, ''); });
        var matched = names.some(function (n) {
          if (n === host) return true;
          if (n.indexOf('*.') === 0 && host.slice(-(n.length - 1)) === n.slice(1)) return true;
          return false;
        });
        if (!matched && !/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) { finish(false, 'certificate host mismatch'); return; }
      }
      finish(true);
    }
    try {
      if (isHttps) socket = tls.connect({ host: host, port: port, servername: host, rejectUnauthorized: false, timeout: timeoutMs, family: 4 }, onConnect);
      else socket = net.connect({ host: host, port: port, family: 4 }, onConnect);
    } catch (e) { finish(false, String(e)); return; }
    socket.setTimeout(timeoutMs, function () { finish(false, 'timeout'); });
    socket.on('error', function (e) { finish(false, String(e && e.message || e)); });
  });
}

function probeUrl(p) {
  var raw = String(p.url || '');
  var u;
  try { u = new URL(raw); } catch (e) { return { returnValue: true, ok: false, error: 'invalid url' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { returnValue: true, ok: true, skipped: true };
  var host = u.hostname;
  var isHttps = u.protocol === 'https:';
  var port = Number(u.port || (isHttps ? 443 : 80));
  var timeoutMs = Math.max(800, Math.min(5000, Number(p.timeoutMs) || 2500));
  var key = u.protocol + '//' + host + ':' + port;

  var hit = probeCacheGet(key);
  if (hit) return { returnValue: true, ok: hit.ok, host: host, port: port, error: hit.error, cached: true };
  if (probeInflight[key]) return probeInflight[key];

  var promise = doProbe(host, port, isHttps, timeoutMs).then(function (r) {
    probeCacheSet(key, r.ok, r.error);
    delete probeInflight[key];
    return r;
  }, function (err) {
    probeCacheSet(key, false, String(err));
    delete probeInflight[key];
    return { returnValue: true, ok: false, host: host, port: port, error: String(err) };
  });
  probeInflight[key] = promise;
  return promise;
}

function tabRollback(p) {
  var t = tabById(p.id) || activeTab();
  if (!t) return { returnValue: false, error: 'unknown tab' };
  if (t.history.length > 1 && t.historyIndex > 0) {
    t.history.splice(t.historyIndex, 1);
    t.historyIndex = Math.max(0, t.historyIndex - 1);
    var entry = t.history[t.historyIndex];
    t.url = entry.url;
    t.title = entry.title || (entry.url === 'about:home' ? 'New Tab' : entry.url);
  } else {
    t.history = [{ url: 'about:home', title: 'New Tab', at: now() }];
    t.historyIndex = 0;
    t.url = 'about:home';
    t.title = 'New Tab';
  }
  t.updatedAt = now();
  saveState();
  return { returnValue: true, state: state, tab: clone(t) };
}

function publicState() {
  /* The transport serialises immediately, so a deep copy here is pure waste. */
  return state;
}

function handle(method, payload) {
  var p = payload || {};
  if (method === 'status') {
    return { returnValue: true, service: SERVICE_ID, port: PORT, dataDir: DATA_DIR, tabs: state.tabs.length };
  }
  if (p.token !== TOKEN) return { returnValue: false, error: 'unauthorized' };
  switch (method) {
    case 'getState': return { returnValue: true, state: publicState() };
    case 'tabOpen': return tabOpen(p);
    case 'tabActivate': return tabActivate(p);
    case 'tabClose': return tabClose(p);
    case 'tabVisit': return visit(p);
    case 'tabUpdate': return tabUpdate(p);
    case 'probeUrl': return probeUrl(p);
    case 'tabRollback': return tabRollback(p);
    case 'historyBack': return historyMove(p, -1);
    case 'historyForward': return historyMove(p, 1);
    case 'bookmarkToggle': return bookmarkToggle(p);
    case 'historyDelete': return historyDelete(p);
    case 'historyClear': return historyClear();
    case 'clearBrowsingData': return clearBrowsingData();
    case 'setSetting': return setSetting(p);
    case 'importState': return importState(p);
    default: return { returnValue: false, error: 'unknown method: ' + method };
  }
}

// --- Luna service -----------------------------------------------------------
var Service = null;
try { Service = require('webos-service'); } catch (e) { Service = null; }
var keepAlive = null;
if (Service) {
  try {
    var service = new Service(SERVICE_ID);
    if (service.activityManager && service.activityManager.create) {
      service.activityManager.create('keepAlive', function (activity) { keepAlive = activity; });
    }
    var METHODS = ['status', 'getState', 'tabOpen', 'tabActivate', 'tabClose', 'tabVisit', 'tabUpdate', 'tabRollback',
      'probeUrl', 'historyBack', 'historyForward', 'bookmarkToggle', 'historyDelete', 'historyClear', 'clearBrowsingData', 'setSetting', 'importState'];
    METHODS.forEach(function (name) {
      service.register(name, function (message) {
        Promise.resolve().then(function () { return handle(name, message.payload || {}); })
          .then(function (r) { message.respond(r); })
          .catch(function (err) { message.respond({ returnValue: false, error: String(err && err.stack || err) }); });
      });
    });
    console.log('[tv-browser] Luna service registered: ' + SERVICE_ID);
  } catch (e) {
    console.error('[tv-browser] Luna registration failed: ' + (e && e.stack || e));
  }
}

// --- Loopback fallback ------------------------------------------------------
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-tvb-token');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}
function send(res, code, obj) {
  cors(res);
  var body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
function readBody(req, cb) {
  var chunks = [], size = 0;
  req.on('data', function (c) { size += c.length; if (size < 1024 * 1024) chunks.push(c); });
  req.on('end', function () {
    var text = Buffer.concat(chunks).toString('utf8');
    try { cb(JSON.parse(text || '{}')); } catch (e) { cb(null); }
  });
}

var STATIC_FILES = {
  '/': 'index.html', '/home': 'index.html', '/index.html': 'index.html',
  '/app.css': 'app.css', '/app.js': 'app.js', '/config.js': 'config.js',
  '/icon.png': 'icon.png', '/largeIcon.png': 'largeIcon.png',
  '/i18n.js': 'i18n.js',
  '/i18n/en-US.js': 'i18n/en-US.js', '/i18n/en-GB.js': 'i18n/en-GB.js',
  '/i18n/ru.js': 'i18n/ru.js', '/i18n/kk.js': 'i18n/kk.js',
  '/i18n/uz.js': 'i18n/uz.js', '/i18n/zh-CN.js': 'i18n/zh-CN.js'
};
function serveStatic(u, res) {
  var rel = STATIC_FILES[u];
  if (!rel) return false;
  var file = path.join(APP_DIR, rel);
  fs.readFile(file, function (err, data) {
    if (err) { send(res, 404, { returnValue: false, error: 'asset not found' }); return; }
    cors(res);
    var type = /\.html$/.test(rel) ? 'text/html; charset=utf-8'
      : /\.css$/.test(rel) ? 'text/css; charset=utf-8'
      : /\.js$/.test(rel) ? 'application/javascript; charset=utf-8'
      : /\.png$/.test(rel) ? 'image/png' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': data.length, 'Cache-Control': 'no-cache' });
    res.end(data);
  });
  return true;
}

var server = http.createServer(function (req, res) {
  var u = req.url.split('?')[0];
  if (req.method === 'GET' && serveStatic(u, res)) return;
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); res.end(); return; }
  var token = req.headers['x-tvb-token'] || '';
  if (u === '/health') { send(res, 200, { ok: true, service: SERVICE_ID, port: PORT }); return; }
  if (req.method === 'GET') {
    if (token !== TOKEN) { send(res, 403, { returnValue: false, error: 'unauthorized' }); return; }
    if (u === '/state') { send(res, 200, handle('getState', { token: TOKEN })); return; }
    send(res, 404, { returnValue: false, error: 'not found' });
    return;
  }
  if (req.method === 'POST') {
    readBody(req, function (body) {
      if (!body) { send(res, 400, { returnValue: false, error: 'invalid json' }); return; }
      body.token = body.token || token;
      var method = u.replace(/^\//, '');
      Promise.resolve().then(function () { return handle(method, body); })
        .then(function (r) { send(res, 200, r); })
        .catch(function (e) { send(res, 500, { returnValue: false, error: String(e && e.stack || e) }); });
    });
    return;
  }
  send(res, 405, { returnValue: false, error: 'method not allowed' });
});
server.on('error', function (e) { console.error('[tv-browser] HTTP error: ' + (e && e.message || e)); });
server.listen(PORT, '127.0.0.1', function () {
  console.log('[tv-browser] loopback state service on http://127.0.0.1:' + PORT + ' data=' + DATA_DIR);
});
