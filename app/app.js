(function () {
  'use strict';

  var CFG = window.TVBROWSER_CONFIG;
  var LS_KEY = 'tvb_state_v1';
  var I18N = window.ASTRA_I18N || { t: function (k) { return k; }, detect: function () { return 'en-US'; }, setLocale: function () {}, applyStatic: function () {}, current: function () { return 'en-US'; }, fmtClock: function (ts) { var d = new Date(ts); return (d.getMonth() + 1) + '/' + d.getDate(); } };
  function T(key, params) { return I18N.t(key, params); }
  function applyLocale() {
    var setting = (data && data.settings && data.settings.locale) || 'auto';
    I18N.setLocale(I18N.detect(setting));
    I18N.applyStatic(document);
    document.title = 'ASTRA';
  }
  var ICONS = {
    back: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
    forward: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
    reload: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
    home: '<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/></svg>',
    menu: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    arrow: '<svg viewBox="0 0 24 24"><path d="M5 12h13M12 5l7 7-7 7"/></svg>'
  };

  var perf = window.__ASTRA_PERF__ = { renderAll: 0, renderTabs: 0, renderPanel: 0, renderQuickLinks: 0, probe: 0, probeMs: 0, navProbe: 0, navProbeMs: 0, navSkipped: 0 };
  var lastQuickSig = '';
  var lastTabsSig = '';
  var lastBmSig = '';
  var lastHisSig = '';
  var data = null;
  var online = false;
  var transport = null;
  var panelKind = null;
  var toastTimer = null;
  var clockTimer = null;
  var fullscreen = false;
  var lastNetError = null;

  function $(sel) { return document.querySelector(sel); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
  }
  function initialOf(url, title) {
    var h = hostOf(url);
    if (!h) return '·';
    return (h[0] || '·').toUpperCase();
  }
  /* Failed navigations used to land in history with WAM's internal
     loaderror path baked into the title. Drop them and scrub the rest. */
  function isFailedVisit(url, title) {
    var u = String(url || ''), t = String(title || '');
    return /loaderror\.html/i.test(u) || /^application error/i.test(t);
  }
  function cleanTitle(title, url) {
    var s = String(title || '')
      .replace(/file:\/\/\S+/g, '')
      .replace(/application error/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!s || /^https?:\/\//i.test(s) || s === hostOf(url)) return prettyUrl(url) || String(url || '');
    return s.slice(0, 90);
  }
  /* One row per URL, newest wins. History is prepend-ordered, so the first
     hit for a URL is already the most recent visit. */
  function dedupeHistory(list) {
    var seen = Object.create(null), out = [];
    (list || []).forEach(function (h) {
      if (!h || !h.url || isFailedVisit(h.url, h.title)) return;
      var key = String(h.url);
      if (seen[key]) return;
      seen[key] = 1;
      out.push(h);
    });
    return out;
  }
  function prettyUrl(url) {
    if (!url || url === 'about:home') return '';
    try { var u = new URL(url); return u.hostname + (u.pathname === '/' ? '' : u.pathname) + (u.search || ''); }
    catch (e) { return url; }
  }
  function normalizeInput(raw) {
    var s = String(raw || '').trim();
    if (!s) return '';
    if (/^(https?|file|about):/i.test(s)) return s;
    if (/^\/\//.test(s)) return 'https:' + s;
    var domain = /^[\w.-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/i.test(s) || /^localhost(:\d+)?(\/.*)?$/i.test(s) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(s);
    if (domain) return 'https://' + s;
    var engine = CFG.searchEngines[(data && data.settings && data.settings.searchEngine) || 'baidu'] || CFG.searchEngines.baidu;
    return engine.url + encodeURIComponent(s);
  }
  function isHome(url) {
    if (!url || url === 'about:home' || String(url).indexOf(CFG.appPathPrefix) >= 0) return true;
    return /^http:\/\/127\.0\.0\.1:7792\/home(?:[#?].*)?$/.test(String(url));
  }
  function homeBase() {
    var h = data && data.settings ? data.settings.homeUrl : '';
    return h && /^http:\/\/127\.0\.0\.1:7792\/home/.test(h) ? h : CFG.homeUrl;
  }
  function homeUrl(action) { return homeBase() + (action ? '#' + action : ''); }
  function activeTab() {
    if (!data) return null;
    return (data.tabs || []).find(function (t) { return t.id === data.activeTabId; }) || (data.tabs || [])[0] || null;
  }
  function tabById(id) { return (data.tabs || []).find(function (t) { return t.id === id; }); }
  function normalizeState(raw) {
    var s = raw || {};
    s.tabs = Array.isArray(s.tabs) ? s.tabs : [];
    if (!s.tabs.length) {
      s.tabs = [{ id: 't_home', url: 'about:home', title: 'New Tab', history: [{ url: 'about:home', title: 'New Tab', at: Date.now() }], historyIndex: 0, scrollY: 0 }];
    }
    s.tabs.forEach(function (t) {
      t.url = t.url || 'about:home';
      t.title = t.title || (isHome(t.url) ? 'New Tab' : prettyUrl(t.url));
      if (isHome(t.url) && /^(new tab|untitled)$/i.test(String(t.title))) t.title = 'New Tab';
      t.history = Array.isArray(t.history) && t.history.length ? t.history : [{ url: t.url, title: t.title, at: Date.now() }];
      t.historyIndex = Math.max(0, Math.min(Number(t.historyIndex) || 0, t.history.length - 1));
      t.scrollY = Number(t.scrollY) || 0;
    });
    s.activeTabId = s.activeTabId && s.tabs.some(function (t) { return t.id === s.activeTabId; }) ? s.activeTabId : s.tabs[0].id;
    s.bookmarks = Array.isArray(s.bookmarks) ? s.bookmarks : [];
    s.history = Array.isArray(s.history) ? s.history : [];
    s.settings = Object.assign({ searchEngine: 'baidu', restoreSession: true, zoom: 1, homeUrl: CFG.homeUrl, engineFixed: true }, s.settings || {});
    /* One-time migration: every older build shipped Google as the default
       engine, which cannot resolve on this TV network. Move that default to
       Baidu once; a later explicit choice is respected. */
    if (!s.settings.engineFixed) {
      if (!s.settings.searchEngine || s.settings.searchEngine === 'google') s.settings.searchEngine = 'baidu';
      s.settings.engineFixed = true;
    }
    s.updatedAt = Number(s.updatedAt) || Date.now();
    return s;
  }
  function defaultLocalState() { return normalizeState({ tabs: [], activeTabId: '', bookmarks: [], history: [], settings: {} }); }
  function loadLocal() {
    try { var raw = localStorage.getItem(LS_KEY); return raw ? normalizeState(JSON.parse(raw)) : null; } catch (e) { return null; }
  }
  var saveLocalTimer = null;
  function saveLocal() {
    if (!data) return;
    if (saveLocalTimer) clearTimeout(saveLocalTimer);
    saveLocalTimer = setTimeout(function () {
      try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
    }, 350);
  }
  function toast(text, actionLabel, onAction, ms) {
    var t = $('#toast');
    t.innerHTML = '';
    t.appendChild(el('span', '', text));
    if (actionLabel) {
      var b = el('button', '', actionLabel);
      b.type = 'button';
      b.addEventListener('click', function () {
        t.hidden = true;
        if (onAction) onAction();
      });
      t.appendChild(b);
    }
    t.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, ms || (actionLabel ? 6500 : 2400));
  }
  function setIcons() {
    document.querySelectorAll('[data-icon]').forEach(function (n) {
      var name = n.getAttribute('data-icon');
      if (ICONS[name]) n.innerHTML = ICONS[name];
    });
    $('#securityIcon').innerHTML = ICONS.globe;
  }

  // --- state service -------------------------------------------------------
  function bridgeCall(method, payload, timeoutMs) {
    return new Promise(function (resolve, reject) {
      if (!window.PalmServiceBridge) { reject(new Error('no PalmServiceBridge')); return; }
      var bridge;
      try { bridge = new window.PalmServiceBridge(); } catch (e) { reject(e); return; }
      var done = false;
      var timer = setTimeout(function () {
        if (done) return; done = true;
        try { bridge.cancel(); } catch (e) { /* ignore */ }
        reject(new Error('service timeout'));
      }, timeoutMs || 6000);
      bridge.onservicecallback = function (msg) {
        if (done) return; done = true; clearTimeout(timer);
        try { resolve(JSON.parse(msg)); } catch (e) { reject(e); }
        try { bridge.cancel(); } catch (e) { /* ignore */ }
      };
      try {
        bridge.call('luna://' + CFG.serviceId + '/' + method, JSON.stringify(Object.assign({ token: CFG.token }, payload || {})));
      } catch (e) {
        clearTimeout(timer); done = true; reject(e);
      }
    });
  }
  function httpCall(method, payload, timeoutMs) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeoutMs || 6000);
    return fetch('http://127.0.0.1:' + CFG.port + '/' + method, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-tvb-token': CFG.token },
      body: JSON.stringify(Object.assign({ token: CFG.token }, payload || {})),
      signal: ctrl ? ctrl.signal : undefined,
      cache: 'no-store'
    }).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).catch(function (e) { clearTimeout(timer); throw e; });
  }
  function callService(method, payload) {
    if (transport === 'ls2') {
      return bridgeCall(method, payload).catch(function () { transport = null; return callService(method, payload); });
    }
    if (transport === 'http') {
      return httpCall(method, payload).catch(function () { transport = null; return callService(method, payload); });
    }
    var first = window.PalmServiceBridge ? bridgeCall('getState', {}).then(function (r) { transport = 'ls2'; return r; }).catch(function () { return null; }) : Promise.resolve(null);
    return first.then(function (r) {
      if (r) return method === 'getState' ? r : bridgeCall(method, payload);
      return httpCall('getState', {}).then(function (r2) {
        transport = 'http';
        return method === 'getState' ? r2 : httpCall(method, payload);
      });
    });
  }

  function localApply(method, payload) {
    var p = payload || {};
    var now = Date.now();
    if (!data) data = defaultLocalState();
    if (method === 'tabOpen') {
      var t = { id: 't_' + now.toString(36), url: isHome(p.url) ? 'about:home' : p.url, title: isHome(p.url) ? 'New Tab' : (p.title || prettyUrl(p.url)), history: [], historyIndex: 0, scrollY: 0 };
      t.history = [{ url: t.url, title: t.title, at: now }];
      data.tabs.push(t);
      if (data.tabs.length > 8) data.tabs.shift();
      if (p.activate !== false) data.activeTabId = t.id;
      return { returnValue: true, state: data, tab: t };
    }
    if (method === 'tabActivate') {
      if (tabById(p.id)) data.activeTabId = p.id;
      return { returnValue: true, state: data };
    }
    if (method === 'tabClose') {
      var idx = data.tabs.findIndex(function (x) { return x.id === p.id; });
      if (idx >= 0) {
        var was = data.activeTabId === p.id;
        data.tabs.splice(idx, 1);
        if (!data.tabs.length) data = defaultLocalState();
        else if (was) data.activeTabId = data.tabs[Math.min(idx, data.tabs.length - 1)].id;
      }
      return { returnValue: true, state: data, activeTab: activeTab() };
    }
    if (method === 'tabVisit') {
      var tab = tabById(p.id) || activeTab();
      var url = isHome(p.url) ? 'about:home' : p.url;
      var title = p.title || (url === 'about:home' ? 'New Tab' : prettyUrl(url));
      if (!tab) {
        tab = { id: 't_' + now.toString(36), url: url, title: title, history: [], historyIndex: 0, scrollY: 0 };
        data.tabs.push(tab);
        data.activeTabId = tab.id;
      }
      var cur = tab.history[tab.historyIndex];
      if (!cur || cur.url !== url) {
        tab.history = tab.history.slice(0, tab.historyIndex + 1);
        tab.history.push({ url: url, title: title, at: now });
        if (tab.history.length > 60) tab.history.shift();
        tab.historyIndex = tab.history.length - 1;
      } else {
        cur.title = title; cur.at = now;
      }
      tab.url = url; tab.title = title; tab.updatedAt = now;
      if (p.scrollY !== undefined) tab.scrollY = Number(p.scrollY) || 0;
      if (p.activate !== false) data.activeTabId = tab.id;
      if (url !== 'about:home') {
        var first = data.history[0];
        if (!first || first.url !== url || first.title !== title) data.history.unshift({ id: 'h_' + now.toString(36), url: url, title: title, at: now });
        if (data.history.length > 300) data.history.length = 300;
      }
      return { returnValue: true, state: data, tab: tab };
    }
    if (method === 'historyBack' || method === 'historyForward') {
      var tb = tabById(p.id) || activeTab();
      if (tb) {
        var next = tb.historyIndex + (method === 'historyBack' ? -1 : 1);
        if (next >= 0 && next < tb.history.length) {
          tb.historyIndex = next;
          tb.url = tb.history[next].url;
          tb.title = tb.history[next].title || tb.title;
          data.activeTabId = tb.id;
          return { returnValue: true, state: data, url: tb.url, title: tb.title };
        }
      }
      return { returnValue: false, error: 'no more history' };
    }
    if (method === 'bookmarkToggle') {
      var u = isHome(p.url) ? 'about:home' : p.url;
      if (u === 'about:home') return { returnValue: false, error: 'cannot bookmark home' };
      var bi = data.bookmarks.findIndex(function (b) { return b.url === u; });
      if (bi >= 0) data.bookmarks.splice(bi, 1);
      else data.bookmarks.unshift({ id: 'b_' + now.toString(36), url: u, title: p.title || u, createdAt: now });
      return { returnValue: true, state: data };
    }
    if (method === 'tabRollback') {
      var tb = tabById(p.id) || activeTab();
      if (tb) {
        if (tb.history.length > 1 && tb.historyIndex > 0) {
          tb.history.splice(tb.historyIndex, 1);
          tb.historyIndex = Math.max(0, tb.historyIndex - 1);
          tb.url = tb.history[tb.historyIndex].url;
          tb.title = tb.history[tb.historyIndex].title || tb.url;
        } else {
          tb.history = [{ url: 'about:home', title: 'New Tab', at: now }];
          tb.historyIndex = 0; tb.url = 'about:home'; tb.title = 'New Tab';
        }
      }
      return { returnValue: true, state: data };
    }
    if (method === 'historyDelete') {
      data.history = data.history.filter(function (h) { return h.id !== p.id; });
      return { returnValue: true, state: data };
    }
    if (method === 'historyClear') { data.history = []; return { returnValue: true, state: data }; }
    if (method === 'setSetting') {
      if (data.settings) data.settings[p.key] = p.value;
      return { returnValue: true, state: data };
    }
    return { returnValue: false, error: 'offline' };
  }

  function svc(method, payload) {
    return callService(method, payload).then(function (r) {
      if (r && r.returnValue === false) return r;
      if (r && r.state) { data = normalizeState(r.state); online = true; saveLocal(); renderAll(); }
      return r;
    }).catch(function () {
      online = false;
      var r = localApply(method, payload);
      saveLocal();
      renderAll();
      return r;
    });
  }

  // --- rendering -----------------------------------------------------------
  function renderAll() {
    if (!data) return;
    perf.renderAll++;
    var active = activeTab();
    document.title = (active && !isHome(active.url) ? cleanTitle(active.title, active.url) + ' — ' : '') + 'ASTRA';
    renderTabs();
    renderToolbar();
    renderQuickLinks();
    renderBookmarks();
    renderHistory();
    renderTelemetry();
    renderOmniboxMode();
    if (panelKind) renderPanel(panelKind);
  }
  function renderTabs() {
    perf.renderTabs++;
    var wrap = $('#tabs');
    var sig = data.activeTabId + '|' + (data.tabs || []).map(function (t) { return t.id + ':' + (t.title || ''); }).join(',');
    if (sig === lastTabsSig && wrap.children.length) return;
    lastTabsSig = sig;
    wrap.innerHTML = '';
    (data.tabs || []).forEach(function (t) {
      var on = t.id === data.activeTabId;
      var b = el('div', 'tab' + (on ? ' active' : ''));
      b.setAttribute('role', 'tab');
      b.setAttribute('tabindex', '0');
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      var label = cleanTitle(t.title, t.url);
      if (lastNetError && on && isHome(t.url)) label = 'Cannot reach ' + lastNetError.host;
      b.title = label;
      var fav = el('span', 'favicon', initialOf(t.url, t.title));
      var labelNode = el('span', 'label', label);
      var close = el('button', 'close');
      close.type = 'button';
      close.innerHTML = ICONS.close;
      close.setAttribute('aria-label', 'Close ' + label);
      close.addEventListener('click', function (ev) { ev.stopPropagation(); closeTab(t.id); });
      b.appendChild(fav); b.appendChild(labelNode); b.appendChild(close);
      b.addEventListener('click', function () { switchTab(t.id); });
      b.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); switchTab(t.id); }
      });
      wrap.appendChild(b);
    });
  }
  function renderToolbar() {
    var active = activeTab();
    var input = $('#addressInput');
    if (document.activeElement !== input) {
      input.value = active && !isHome(active.url) ? active.url : '';
    }
    var secure = active && /^https:/i.test(active.url || '');
    var sec = $('#securityIcon');
    sec.classList.toggle('secure', !!secure);
    sec.innerHTML = secure ? ICONS.lock : ICONS.globe;
    $('#backBtn').disabled = !active || active.historyIndex <= 0;
    $('#forwardBtn').disabled = !active || active.historyIndex >= (active.history || []).length - 1;
    var star = $('#bookmarkBtn');
    var bookmarked = active && data.bookmarks.some(function (b) { return b.url === active.url; });
    star.classList.toggle('on', !!bookmarked);
    star.disabled = !active || isHome(active.url);
    star.title = bookmarked ? 'Remove bookmark' : 'Add bookmark';
  }
  /* Target reachability. Six TLS probes at once on a 2 GB box is too much,
     so they run three at a time and the result is cached for ten minutes. */
  var probeState = Object.create(null);
  var probeLoaded = false;
  var probePasses = 0;
  var probing = false;
  var PROBE_KEY = 'astra_probe_v1';
  var PROBE_TTL = 10 * 60 * 1000;

  /* A probe that never settles would pin its target at Checking forever, so the
     client owns a hard deadline instead of trusting the transport. */
  function withTimeout(promise, ms) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; resolve(null); } }, ms);
      promise.then(function (v) {
        if (done) return; done = true; clearTimeout(timer); resolve(v);
      }, function () {
        if (done) return; done = true; clearTimeout(timer); resolve(null);
      });
    });
  }

  function loadProbeCache() {
    if (probeLoaded) return;
    probeLoaded = true;
    try {
      var raw = localStorage.getItem(PROBE_KEY);
      if (!raw) return;
      var o = JSON.parse(raw);
      if (!o || !o.map || Date.now() - Number(o.at || 0) > PROBE_TTL) return;
      Object.keys(o.map).forEach(function (k) {
        /* Only settled results are restorable. A cached "busy" would pin a
           target at Checking forever, because pending work is never resumed. */
        if (o.map[k] === 'ok' || o.map[k] === 'bad') probeState[k] = o.map[k];
      });
    } catch (e) { /* ignore */ }
  }
  function saveProbeCache() {
    var map = {};
    Object.keys(probeState).forEach(function (k) {
      if (probeState[k] === 'ok' || probeState[k] === 'bad') map[k] = probeState[k];
    });
    try { localStorage.setItem(PROBE_KEY, JSON.stringify({ at: Date.now(), map: map })); } catch (e) { /* ignore */ }
  }
  function probeTargets(force) {
    loadProbeCache();
    /* Without the state service there is nothing to probe with — say "untested"
       rather than accusing every site of being down. */
    if (!online || probing) { renderQuickLinks(); return; }
    var list = CFG.quickLinks || [];
    var pending = list.filter(function (q) { return force || !probeState[q.url]; });
    if (!pending.length) { renderQuickLinks(); return; }
    probing = true;
    pending.forEach(function (q) { probeState[q.url] = 'busy'; });
    renderQuickLinks();
    var i = 0, running = 0;
    function pump() {
      while (i < pending.length && running < 3) {
        /* Each probe must capture its own target: with a shared `var` every
           callback would read the last item and write its result there. */
        (function (item) {
          running++;
          perf.probe++;
          withTimeout(svc('probeUrl', { url: item.url, timeoutMs: 2500 }), 5000).then(function (r) {
            if (!r || r.returnValue !== true) delete probeState[item.url];
            else {
              probeState[item.url] = r.ok ? 'ok' : 'bad';
              if (r.ok) markHostOk(hostOf(item.url));
            }
          }).then(function () {
            running--;
            renderQuickLinks();
            saveProbeCache();
            if (i < pending.length || running > 0) { pump(); return; }
            probing = false;
            probePasses++;
            var unknown = list.filter(function (q) { return !probeState[q.url]; });
            if (unknown.length && probePasses < 3) {
              setTimeout(function () { probeTargets(false); }, 5000);
            }
          });
        })(pending[i++]);
      }
    }
    pump();
  }
  function probeLabel(st) {
    return st === 'ok' ? 'Reachable' : st === 'bad' ? 'unreachable' : st === 'busy' ? 'Checking' : 'Untested';
  }
  function renderQuickLinks() {
    perf.renderQuickLinks++;
    var wrap = $('#quicklinks');
    if (!wrap) return;
    var list = CFG.quickLinks || [];
    /* Six probes finish one by one; without this guard the whole grid is
       rebuilt six times during start-up for the same markup. */
    var sig = list.map(function (q) { return probeState[q.url] || ''; }).join(',') + '|' + list.length;
    if (sig === lastQuickSig && wrap.children.length === list.length) return;
    lastQuickSig = sig;
    wrap.innerHTML = '';
    var bad = 0, busy = 0;
    list.forEach(function (q) {
      var st = probeState[q.url] || '';
      if (st === 'bad') bad++;
      if (st === 'busy') busy++;
      var b = el('button', 'target' + (st === 'bad' ? ' off' : ''));
      b.type = 'button';
      b.appendChild(el('span', 'led ' + (st || '')));
      b.appendChild(el('span', 'tmono', q.letter || '·'));
      var meta = el('span', 'tmeta');
      meta.appendChild(el('span', 'tname', q.name));
      meta.appendChild(el('span', 'thost', q.host || hostOf(q.url)));
      b.appendChild(meta);
      b.appendChild(el('span', 'tstate ' + (st || ''), probeLabel(st)));
      b.setAttribute('aria-label', q.name + ', ' + probeLabel(st) + ', Open');
      b.addEventListener('click', function () { openTarget(q); });
      wrap.appendChild(b);
    });
    var info = $('#targetsMeta');
    if (info) {
      var txt = list.length + ' targets';
      if (busy) txt += ' · Checking ' + busy;
      else if (bad) txt += ' · <b class="bad">' + bad + ' unreachable</b>';
      else if (list.length) txt += ' · All reachable';
      info.innerHTML = txt;
    }
  }
  function openTarget(q) {
    if (probeState[q.url] === 'bad') {
      showNetError(q.url, 'unreachable', { known: true, name: q.name });
      return;
    }
    navigateTo(q.url);
  }
  function renderBookmarks() {
    var wrap = $('#bookmarkGrid');
    if (!wrap) return;
    var all = data.bookmarks || [];
    var sig = all.map(function (b) { return b.id; }).join(',');
    if (sig === lastBmSig && wrap.children.length) return;
    lastBmSig = sig;
    var list = all.slice(0, 8);
    $('#bookmarkCount').textContent = all.length ? all.length + ' items' : '';
    wrap.innerHTML = '';
    if (!list.length) {
      wrap.appendChild(el('div', 'empty', 'No bookmarks yet. Press Ctrl+D on a page, or click the star on the right of the address bar to save one.'));
      return;
    }
    list.forEach(function (b) {
      var btn = el('button', 'row');
      btn.type = 'button';
      btn.appendChild(el('span', 'rmono', initialOf(b.url, b.title)));
      var meta = el('span', 'rmeta');
      meta.appendChild(el('span', 'rname', cleanTitle(b.title, b.url)));
      meta.appendChild(el('span', 'rhost', hostOf(b.url) || b.url));
      btn.appendChild(meta);
      btn.appendChild(el('span', 'rtime', timeLabel(b.createdAt)));
      btn.setAttribute('aria-label', 'Open bookmark ' + cleanTitle(b.title, b.url));
      btn.addEventListener('click', function () { navigateTo(b.url); });
      wrap.appendChild(btn);
    });
  }
  function timeLabel(ts) {
    var d = new Date(ts || Date.now());
    var now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toTimeString().slice(0, 5);
    return (d.getMonth() + 1) + '/' + d.getDate();
  }
  function renderHistory() {
    var wrap = $('#historyGrid');
    if (!wrap) return;
    var list = dedupeHistory(data.history).filter(function (h) { return !isHome(h.url); }).slice(0, 6);
    var sig = list.map(function (h) { return h.id; }).join(',');
    if (sig === lastHisSig && wrap.children.length) return;
    lastHisSig = sig;
    wrap.innerHTML = '';
    if (!list.length) {
      wrap.appendChild(el('div', 'empty', 'Recent visits will appear here. Open a site and it shows up.'));
      return;
    }
    list.forEach(function (h) {
      var row = el('button', 'row');
      row.type = 'button';
      row.appendChild(el('span', 'rmono', initialOf(h.url, h.title)));
      var meta = el('span', 'rmeta');
      meta.appendChild(el('span', 'rname', cleanTitle(h.title, h.url)));
      meta.appendChild(el('span', 'rhost', hostOf(h.url) || h.url));
      row.appendChild(meta);
      row.appendChild(el('span', 'rtime', timeLabel(h.at)));
      row.setAttribute('aria-label', 'Open ' + cleanTitle(h.title, h.url));
      row.addEventListener('click', function () { navigateTo(h.url); });
      wrap.appendChild(row);
    });
  }
  function renderTelemetry() {
    loadProbeCache();
    var tabs = $('#tTabs');
    if (tabs) tabs.textContent = String((data.tabs || []).length).padStart(2, '0');
    var svc = $('#tSvc');
    if (svc) svc.textContent = online ? 'LINK' : 'LOCAL';
    var net = $('#tNet');
    if (net) {
      var known = (CFG.quickLinks || []).map(function (q) { return probeState[q.url]; });
      var bad = known.filter(function (s) { return s === 'bad'; }).length;
      var ok = known.filter(function (s) { return s === 'ok'; }).length;
      net.textContent = !known.length ? '—' : bad ? 'DEGRADED' : ok ? 'ONLINE' : '—';
    }
    var n = $('#serviceStatus');
    if (!n) return;
    n.innerHTML = '';
    n.appendChild(el('span', 'led ' + (online ? 'ok' : 'bad')));
    n.appendChild(document.createTextNode(online ? 'Browsing state service connected' : 'Offline mode: bookmarks and history are stored on this device only'));
  }
  function renderOmniboxMode() {
    var active = activeTab();
    var home = !active || isHome(active.url);
    var form = $('#omnibox');
    var input = $('#addressInput');
    if (!form || !input) return;
    form.classList.toggle('readout', home);
    input.readOnly = home;
    if (lastNetError) input.placeholder = 'Cannot reach ' + lastNetError.host;
    else input.placeholder = home ? 'New Tab · use the input below' : 'Enter URL or search';
    if (home && document.activeElement !== input) input.value = '';
  }
  function renderPanel(kind) {
    perf.renderPanel++;
    panelKind = kind;
    var titles = { menu: 'Menu', bookmarks: 'Bookmark', history: 'History', settings: 'Settings', help: 'Help' };
    $('#panelTitle').textContent = titles[kind] || 'Menu';
    var head = document.querySelector('.panel-head');
    var back = head.querySelector('.panel-back');
    if (kind !== 'menu') {
      if (!back) {
        back = el('button', 'panel-back');
        back.type = 'button';
        back.innerHTML = ICONS.back;
        back.setAttribute('aria-label', 'Back to menu');
        head.insertBefore(back, head.firstChild);
      }
    } else if (back) {
      back.parentNode.removeChild(back);
      back = null;
    }
    if (back) back.onclick = function () { renderPanel('menu'); };

    var body = $('#panelBody');
    var actions = $('#panelActions');
    body.innerHTML = '';
    actions.innerHTML = '';
    actions.hidden = true;

    if (kind === 'menu') {
      [['new-tab', 'New tab', 'CTRL T'], ['bookmarks', 'Bookmark', ''], ['history', 'History', 'CTRL H'],
       ['settings', 'Settings', ''], ['help', 'Help & shortcuts', ''], ['fullscreen', 'Fullscreen / hide toolbar', 'F11']
      ].forEach(function (it) {
        var row = el('button', 'panel-row');
        row.type = 'button';
        var meta = el('span', 'pmeta');
        meta.appendChild(el('span', 'pname', it[1]));
        row.appendChild(meta);
        if (it[2]) row.appendChild(el('span', 'pkey', it[2]));
        row.addEventListener('click', function () {
          if (it[0] === 'new-tab') { closePanel(); newTab(); }
          else if (it[0] === 'fullscreen') { closePanel(); toggleFullscreen(); }
          else renderPanel(it[0]);
        });
        body.appendChild(row);
      });
      return;
    }

    if (kind === 'bookmarks' || kind === 'history') {
      var list = kind === 'bookmarks' ? (data.bookmarks || []) : dedupeHistory(data.history).filter(function (h) { return !isHome(h.url); });
      if (!list.length) {
        body.appendChild(el('div', 'panel-empty', kind === 'bookmarks' ? 'No bookmarks yet. Press Ctrl+D on a page to save one.' : 'No history yet。'));
      }
      list.slice(0, 120).forEach(function (item) {
        var row = el('div', 'panel-row');
        var open = el('button', 'popen');
        open.type = 'button';
        var meta = el('span', 'pmeta');
        meta.appendChild(el('span', 'pname', cleanTitle(item.title, item.url)));
        meta.appendChild(el('span', 'phost', prettyUrl(item.url)));
        open.appendChild(meta);
        open.addEventListener('click', function () { closePanel(); navigateTo(item.url); });
        var del = el('button', 'pdel');
        del.type = 'button';
        del.innerHTML = ICONS.close;
        del.setAttribute('aria-label', 'Remove ' + cleanTitle(item.title, item.url));
        del.addEventListener('click', function () {
          if (kind === 'bookmarks') svc('bookmarkToggle', { url: item.url, title: item.title }).then(function () { renderPanel('bookmarks'); });
          else svc('historyDelete', { id: item.id }).then(function () { renderPanel('history'); });
        });
        row.appendChild(open);
        row.appendChild(del);
        body.appendChild(row);
      });
      if (kind === 'history' && list.length) {
        actions.hidden = false;
        var clear = el('button', 'danger', 'Clear history');
        clear.type = 'button';
        var armed = false;
        clear.addEventListener('click', function () {
          if (!armed) {
            armed = true;
            clear.textContent = 'Tap again to confirm';
            setTimeout(function () { if (armed) { armed = false; clear.textContent = 'Clear history'; } }, 4000);
            return;
          }
          svc('historyClear', {}).then(function () { renderPanel('history'); toast('History cleared'); });
        });
        actions.appendChild(clear);
      }
      return;
    }

    if (kind === 'settings') {
      var row1 = el('div', 'settings-row');
      var col1 = el('div', 'col');
      col1.appendChild(el('label', '', 'Default search engine'));
      col1.appendChild(el('span', 'hint', 'Google is usually unreachable on this TV network'));
      row1.appendChild(col1);
      var sel = el('select');
      Object.keys(CFG.searchEngines).forEach(function (k) {
        var o = el('option', '', CFG.searchEngines[k].name); o.value = k;
        if ((data.settings.searchEngine || 'baidu') === k) o.selected = true;
        sel.appendChild(o);
      });
      sel.setAttribute('aria-label', 'Default search engine');
      sel.addEventListener('change', function () { svc('setSetting', { key: 'searchEngine', value: sel.value }); toast('Search engine switched to ' + CFG.searchEngines[sel.value].name); });
      row1.appendChild(sel); body.appendChild(row1);

      var row2 = el('div', 'settings-row');
      var col2 = el('div', 'col');
      col2.appendChild(el('label', '', 'Restore last tabs on startup'));
      col2.appendChild(el('span', 'hint', 'Every start opens a new tab'));
      row2.appendChild(col2);
      var tg = el('button', 'toggle' + (data.settings.restoreSession ? ' on' : ''));
      tg.type = 'button';
      tg.setAttribute('role', 'switch');
      tg.setAttribute('aria-checked', data.settings.restoreSession ? 'true' : 'false');
      tg.setAttribute('aria-label', 'Restore last tabs on startup');
      tg.addEventListener('click', function () {
        var v = !data.settings.restoreSession;
        tg.classList.toggle('on', v);
        tg.setAttribute('aria-checked', v ? 'true' : 'false');
        svc('setSetting', { key: 'restoreSession', value: v });
      });
      row2.appendChild(tg); body.appendChild(row2);

      var row3 = el('div', 'settings-row');
      var col3 = el('div', 'col');
      col3.appendChild(el('label', '', 'Page zoom'));
      col3.appendChild(el('span', 'hint', 'Three presets — easy with a remote'));
      row3.appendChild(col3);
      var seg = el('div', 'seg');
      [['100%', 1], ['125%', 1.25], ['150%', 1.5]].forEach(function (p) {
        var cur = Number(data.settings.zoom) || 1;
        var b = el('button', Math.abs(cur - p[1]) < 0.01 ? 'on' : '', p[0]);
        b.type = 'button';
        b.setAttribute('aria-pressed', Math.abs(cur - p[1]) < 0.01 ? 'true' : 'false');
        b.addEventListener('click', function () {
          svc('setSetting', { key: 'zoom', value: p[1] }).then(function () { applyZoom(); renderPanel('settings'); });
        });
        seg.appendChild(b);
      });
      row3.appendChild(seg); body.appendChild(row3);

      var row4 = el('div', 'settings-row');
      var col4 = el('div', 'col');
      col4.appendChild(el('label', '', 'Browsing data'));
      col4.appendChild(el('span', 'hint', 'Clears local records only — your web sign-ins are kept'));
      row4.appendChild(col4);
      var clr = el('button', 'mini danger', 'Clear history');
      clr.type = 'button';
      var armed2 = false;
      clr.addEventListener('click', function () {
        if (!armed2) {
          armed2 = true; clr.textContent = 'Tap again to confirm';
          setTimeout(function () { if (armed2) { armed2 = false; clr.textContent = 'Clear history'; } }, 4000);
          return;
        }
        svc('historyClear', {}).then(function () { toast('History cleared'); renderPanel('settings'); });
      });
      row4.appendChild(clr); body.appendChild(row4);
      return;
    }

    if (kind === 'help') {
      var list = el('div', 'help-list');
      [['Ctrl L', 'Focus address bar'], ['Ctrl T', 'New tab'], ['Ctrl W', 'Close tab'],
       ['Ctrl Tab', 'Switch tab'], ['Ctrl D', 'Bookmark this page'], ['Ctrl H', 'History'],
       ['Alt ← / →', 'Back / Forward'], ['F5', 'Reload'], ['F11', 'Fullscreen'], ['Esc', 'Close panel']
      ].forEach(function (it) {
        var d = el('div');
        d.appendChild(el('span', '', it[1]));
        d.appendChild(el('kbd', '', it[0]));
        list.appendChild(d);
      });
      body.appendChild(list);
      body.appendChild(el('div', 'help-note', 'Remote: direction keys move focus, OK confirms, Back exits the current panel or steps back. Tabs are suspended — switching tabs reloads the page but keeps each tab history and scroll position.'));
      return;
    }
  }
  function openPanel(kind) {
    panelKind = kind;
    $('#panel').hidden = false;
    renderPanel(kind);
    var first = $('#panel').querySelector('.panel-back, .panel-row, .panel-body button');
    if (first) first.focus();
  }
  function closePanel() {
    panelKind = null;
    $('#panel').hidden = true;
    var menu = $('#menuBtn');
    if (menu && document.body.contains(menu)) menu.focus();
  }
  function toggleFullscreen() {
    fullscreen = !fullscreen;
    document.body.classList.toggle('fullscreen', fullscreen);
    toast(fullscreen ? 'Toolbar hidden — press F11 or Esc to restore' : 'Toolbar shown');
  }

  // --- navigation/tabs ----------------------------------------------------
  function goHome() {
    var active = activeTab();
    if (!active) return;
    svc('tabVisit', { id: active.id, url: 'about:home', title: 'New Tab' }).then(function () {
      location.href = homeUrl('home');
    });
  }
  /* Hosts already proven reachable skip the blocking TLS pre-flight entirely:
     a repeat visit navigates immediately, and a real failure still lands on the
     error page because WAM redirects its own loaderror back to /home#error. */
  var hostOk = Object.create(null);
  var HOST_OK_TTL = 10 * 60 * 1000;
  function markHostOk(host) { if (host) hostOk[host] = Date.now(); }
  function hostKnownOk(host) {
    var at = hostOk[host];
    if (!at) return false;
    if (Date.now() - at > HOST_OK_TTL) { delete hostOk[host]; return false; }
    return true;
  }
  function commitNavigation(url) {
    var active = activeTab();
    if (active) svc('tabVisit', { id: active.id, url: url, title: '' });
    location.assign(url);
  }
  function navigateTo(url) {
    if (!url) return;
    if (isHome(url)) { goHome(); return; }
    var host = hostOf(url) || url;
    if (hostKnownOk(host)) {
      perf.navSkipped++;
      commitNavigation(url);
      return;
    }
    toast('Connecting to ' + host + ' …');
    var t0 = performance.now();
    svc('probeUrl', { url: url, timeoutMs: 2500 }).then(function (r) {
      perf.navProbeMs += performance.now() - t0;
      perf.navProbe++;
      if (r && r.returnValue === true && r.ok === false) {
        showNetError(url, r.error || 'unreachable');
        return;
      }
      if (r && r.returnValue === true && r.ok) markHostOk(host);
      commitNavigation(url);
    });
  }
  /* A failed navigation is a page state, not a popover: it owns the content
     area, names the host, and offers a way forward instead of a dead retry. */
  function showNetError(url, code, opts) {
    opts = opts || {};
    var host = hostOf(url) || String(url || 'Unknown site');
    lastNetError = { url: url, host: host, code: code || '', known: !!opts.known, name: opts.name || host };
    renderState();
  }
  function hideState() {
    lastNetError = null;
    var s = $('#state');
    if (s) { s.hidden = true; s.innerHTML = ''; }
    var w = document.querySelector('.ntp-wrap');
    if (w) w.hidden = false;
    renderTabs();
    renderOmniboxMode();
  }
  function renderState() {
    var s = $('#state');
    var w = document.querySelector('.ntp-wrap');
    if (!s || !lastNetError) return;
    var e = lastNetError;
    if (w) w.hidden = true;
    s.hidden = false;
    s.innerHTML = '';

    var codeLine = el('div', 'state-code');
    codeLine.appendChild(el('span', 'tick'));
    codeLine.appendChild(el('span', '', 'ERR ' + (e.code || 'UNREACHABLE')));
    s.appendChild(codeLine);

    var h = el('h1', 'state-title');
    h.appendChild(document.createTextNode('Cannot connect to '));
    h.appendChild(el('em', '', e.host));
    s.appendChild(h);

    var engine = CFG.searchEngines[(data.settings && data.settings.searchEngine) || 'baidu'] || CFG.searchEngines.baidu;
    var grid = el('div', 'state-grid');

    var main = el('div', 'state-main');
    main.appendChild(el('p', 'state-desc', e.known
      ? 'This site failed its most recent check. It may be DNS filtering, a regional block, or a site timeout.'
      : 'This TV could not connect to that site. It may be DNS filtering, a regional block, a site timeout, or a missing proxy.'));

    var actions = el('div', 'state-actions');
    var retry = el('button', 'primary', 'Retry check');
    retry.type = 'button';
    retry.addEventListener('click', function () { hideState(); navigateTo(e.url); });
    var search = el('button', '', 'Search ' + engine.name + ' for ' + e.host);
    search.type = 'button';
    search.addEventListener('click', function () {
      hideState();
      navigateTo(engine.url + encodeURIComponent(e.host));
    });
    var home = el('button', '', 'Back to Home');
    home.type = 'button';
    home.addEventListener('click', function () { hideState(); goHome(); });
    actions.appendChild(retry); actions.appendChild(search); actions.appendChild(home);
    main.appendChild(actions);
    grid.appendChild(main);

    /* Diagnostics column: what a person on the phone with support would ask. */
    var diag = el('div', 'state-diag');
    diag.appendChild(el('h2', '', 'Diagnostics'));
    [['Host', e.host],
     ['Error code', e.code || 'UNREACHABLE'],
     ['Time', new Date().toTimeString().slice(0, 5)],
     ['Search engine', engine.name]
    ].forEach(function (row) {
      var d = el('div', 'diag-row');
      d.appendChild(el('span', 'dk', row[0]));
      d.appendChild(el('span', 'dv', row[1]));
      diag.appendChild(d);
    });
    grid.appendChild(diag);
    s.appendChild(grid);

    var good = (CFG.quickLinks || []).filter(function (q) { return probeState[q.url] === 'ok'; }).slice(0, 3);
    if (good.length) {
      var alt = el('div', 'state-alt');
      alt.appendChild(el('span', '', 'Known reachable'));
      good.forEach(function (q) {
        var b = el('button', '', q.name);
        b.type = 'button';
        b.addEventListener('click', function () { hideState(); navigateTo(q.url); });
        alt.appendChild(b);
      });
      s.appendChild(alt);
    }

    document.title = 'Cannot reach ' + e.host + ' — ASTRA';
    renderTabs();
    renderOmniboxMode();
    retry.focus();
  }
  function newTab() {
    svc('tabOpen', { url: 'about:home', activate: true }).then(function (r) {
      var id = r && r.tab ? r.tab.id : (r && r.state ? r.state.activeTabId : data.activeTabId);
      saveLocal();
      location.href = homeUrl('tab=' + encodeURIComponent(id));
    });
  }
  function closeTab(id) {
    var wasActive = data.activeTabId === id;
    var target = tabById(id);
    if (target && !isHome(target.url)) {
      try { sessionStorage.setItem('astra_closed', JSON.stringify({ url: target.url, title: target.title })); } catch (e) { /* ignore */ }
    }
    svc('tabClose', { id: id }).then(function (r) {
      var active = r && r.state ? (r.state.tabs.find(function (t) { return t.id === r.state.activeTabId; })) : activeTab();
      if (!wasActive) {
        renderAll();
        toast('Closed ' + cleanTitle(target && target.title, target && target.url), 'Undo', function () {
          var snap = null;
          try { snap = JSON.parse(sessionStorage.getItem('astra_closed') || 'null'); } catch (e) { snap = null; }
          if (snap) svc('tabOpen', { url: snap.url, title: snap.title, activate: false }).then(renderAll);
        });
        return;
      }
      if (active && !isHome(active.url)) location.replace(active.url);
      else location.href = homeUrl('tab=' + encodeURIComponent(active ? active.id : ''));
    });
  }
  function reloadCurrent() {
    var a = activeTab();
    if (a && !isHome(a.url)) navigateTo(a.url);
    else location.reload();
  }
  function switchTab(id) {
    if (id === data.activeTabId) return;
    svc('tabActivate', { id: id }).then(function (r) {
      var t = r && r.tab ? r.tab : tabById(id);
      if (t && !isHome(t.url)) navigateTo(t.url);
      else location.href = homeUrl('tab=' + encodeURIComponent(id));
    });
  }
  function cycleTab(delta) {
    var tabs = data.tabs || [];
    var idx = tabs.findIndex(function (t) { return t.id === data.activeTabId; });
    if (tabs.length < 2) return;
    switchTab(tabs[(idx + delta + tabs.length) % tabs.length].id);
  }
  function back() {
    var active = activeTab();
    if (!active || active.historyIndex <= 0) return;
    svc('historyBack', { id: active.id }).then(function (r) {
      if (!r.returnValue) { toast('No earlier page'); return; }
      if (isHome(r.url)) location.href = homeUrl('home');
      else navigateTo(r.url);
    });
  }
  function forward() {
    var active = activeTab();
    if (!active || active.historyIndex >= (active.history || []).length - 1) return;
    svc('historyForward', { id: active.id }).then(function (r) {
      if (!r.returnValue) { toast('No later page'); return; }
      if (isHome(r.url)) location.href = homeUrl('home');
      else navigateTo(r.url);
    });
  }
  function toggleBookmark() {
    var active = activeTab();
    if (!active || isHome(active.url) || !/^https?:/i.test(active.url)) return;
    svc('bookmarkToggle', { url: active.url, title: active.title || active.url }).then(function (r) {
      if (!r.returnValue) { toast(r.error || 'Bookmark action failed'); return; }
      var has = data.bookmarks.some(function (b) { return b.url === active.url; });
      toast(has ? 'Bookmark added' : 'Bookmark removed');
    });
  }
  function applyZoom() {
    var z = data && data.settings ? Number(data.settings.zoom) || 1 : 1;
    var wrap = document.querySelector('.ntp-wrap');
    if (wrap) wrap.style.zoom = z;
  }

  // --- hash/session -------------------------------------------------------
  function hashAction() {
    var h = location.hash.replace(/^#/, '');
    var m = /^tab=([^&]+)/.exec(h);
    return { raw: h, tabId: m ? decodeURIComponent(m[1]) : '' };
  }
  async function applyHashAndRestore() {
    var h = hashAction();
    var em = /^error=(.*)$/.exec(h.raw);
    if (em) {
      var payloadText = '';
      try { payloadText = decodeURIComponent(em[1]); } catch (e) { payloadText = em[1]; }
      var parts = payloadText.split('|');
      var errHost = parts[0] || 'Unknown site';
      var errCode = parts[1] || '';
      var et = activeTab();
      if (et) {
        svc('tabRollback', { id: et.id }).then(function () {
          svc('tabVisit', { id: et.id, url: 'about:home', title: 'New Tab' });
        });
      }
      showNetError('https://' + errHost + '/', errCode);
      try { history.replaceState(null, '', location.href.split('#')[0]); } catch (e) { /* ignore */ }
      return;
    }
    if (h.tabId) {
      if (tabById(h.tabId) && data.activeTabId !== h.tabId) {
        data.activeTabId = h.tabId;
        if (!data.tabs.some(function (t) { return t.id === h.tabId; })) data.activeTabId = data.tabs[0].id;
      }
      var t = activeTab();
      if (t && !isHome(t.url)) {
        var prTab = await svc('probeUrl', { url: t.url, timeoutMs: 2500 });
        if (!prTab || prTab.returnValue !== true || prTab.ok === false) {
          await svc('tabVisit', { id: t.id, url: 'about:home', title: 'New Tab' });
          if (prTab && prTab.returnValue === true && prTab.ok === false) showNetError(t.url, prTab.error);
          else toast('State service offline — staying on Home');
          return;
        }
        location.replace(t.url); return;
      }
      if (h.raw.indexOf('tab=') === 0) history.replaceState(null, '', '#' + h.raw);
      return;
    }
    if (h.raw === 'home' || h.raw === 'newtab') {
      var a = activeTab();
      if (a && !isHome(a.url)) {
        svc('tabVisit', { id: a.id, url: 'about:home', title: 'New Tab' });
      }
      return;
    }
    var active = activeTab();
    if (active && !isHome(active.url) && data.settings.restoreSession) {
      var pr = await svc('probeUrl', { url: active.url, timeoutMs: 2500 });
      if (!pr || pr.returnValue !== true || pr.ok === false) {
        await svc('tabVisit', { id: active.id, url: 'about:home', title: 'New Tab' });
        if (pr && pr.returnValue === true && pr.ok === false) showNetError(active.url, pr.error);
        else toast('State service offline — staying on Home');
        return;
      }
      saveLocal();
      location.replace(active.url);
      return;
    }
    if (active && !isHome(active.url)) {
      await svc('tabVisit', { id: active.id, url: 'about:home', title: 'New Tab' });
    }
  }

  // --- clock ---------------------------------------------------------------
  function updateClock() {
    var d = new Date();
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    var clock = $('#clock');
    if (clock) clock.textContent = hh + ':' + mm;
    var h = d.getHours();
    var greet = h < 6 ? 'Night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    var g = $('#greeting');
    if (g) g.textContent = 'Star-chart terminal · ' + greet;
  }

  // --- spatial focus for D-pad / arrow keys --------------------------------
  var NAV_SEL = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), [role="tab"]';

  function focusables() {
    var nodes = Array.prototype.slice.call(document.querySelectorAll(NAV_SEL));
    return nodes.filter(function (n) {
      if (n.closest('[hidden]')) return false;
      var r = n.getBoundingClientRect();
      return r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < window.innerHeight;
    });
  }
  function moveFocus(dir) {
    var items = focusables();
    if (!items.length) return false;
    var cur = document.activeElement;
    if (items.indexOf(cur) < 0) { items[0].focus(); return true; }
    var cr = cur.getBoundingClientRect();
    var cx = cr.left + cr.width / 2;
    var cy = cr.top + cr.height / 2;
    var best = null, bestScore = Infinity;
    items.forEach(function (n) {
      if (n === cur) return;
      var r = n.getBoundingClientRect();
      var dx = (r.left + r.width / 2) - cx;
      var dy = (r.top + r.height / 2) - cy;
      var primary = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
      var secondary = (dir === 'up' || dir === 'down') ? Math.abs(dx) : Math.abs(dy);
      if (primary <= 6) return;
      var score = primary + secondary * 2.5;
      if (score < bestScore) { bestScore = score; best = n; }
    });
    if (!best) return false;
    best.focus();
    if (best.scrollIntoView) best.scrollIntoView({ block: 'nearest' });
    return true;
  }

  // --- events --------------------------------------------------------------
  function bindEvents() {
    $('#omnibox').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = $('#addressInput').value.trim();
      if (v) navigateTo(normalizeInput(v));
      $('#addressInput').blur();
    });
    /* On the start page the omnibox is a readout, not a second search box:
       it hands focus to the one real input. */
    $('#omnibox').addEventListener('mousedown', function (e) {
      if (!$('#omnibox').classList.contains('readout')) return;
      e.preventDefault();
      var ntp = $('#ntpInput');
      if (ntp) ntp.focus();
    });
    $('#addressInput').addEventListener('focus', function () {
      if ($('#omnibox').classList.contains('readout')) {
        this.blur();
        var ntp = $('#ntpInput');
        if (ntp) ntp.focus();
      }
    });
    $('#ntpSearch').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = $('#ntpInput').value.trim();
      if (v) navigateTo(normalizeInput(v));
    });
    $('#backBtn').addEventListener('click', back);
    $('#forwardBtn').addEventListener('click', forward);
    $('#reloadBtn').addEventListener('click', reloadCurrent);
    $('#homeBtn').addEventListener('click', function () { hideState(); goHome(); });
    $('#newTabBtn').addEventListener('click', newTab);
    $('#bookmarkBtn').addEventListener('click', toggleBookmark);
    $('#menuBtn').addEventListener('click', function () { openPanel('menu'); });
    $('#panelClose').addEventListener('click', closePanel);
    $('#allHistoryBtn').addEventListener('click', function () { openPanel('history'); });
    $('#tabs').addEventListener('wheel', function (e) {
      if (e.deltaY) { e.currentTarget.scrollLeft += e.deltaY; e.preventDefault(); }
    }, { passive: false });
    document.addEventListener('click', function (e) {
      var p = $('#panel');
      if (p.hidden) return;
      /* A row that opens a sub-panel re-renders the body during this same
         click, which detaches the target — that is not an outside click. */
      if (!e.target.isConnected) return;
      if (p.contains(e.target)) return;
      if (e.target === $('#menuBtn') || $('#menuBtn').contains(e.target)) return;
      closePanel();
    });
    document.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) || '';
      var editing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      var ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        var ntp = $('#ntpInput');
        if (ntp && $('#omnibox').classList.contains('readout')) ntp.focus();
        else { $('#addressInput').focus(); $('#addressInput').select(); }
        return;
      }
      if (ctrl && (e.key === 't' || e.key === 'T')) { e.preventDefault(); newTab(); return; }
      if (ctrl && (e.key === 'w' || e.key === 'W')) { e.preventDefault(); if (data.activeTabId) closeTab(data.activeTabId); return; }
      if (ctrl && e.key === 'Tab') { e.preventDefault(); cycleTab(e.shiftKey ? -1 : 1); return; }
      if (ctrl && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); toggleBookmark(); return; }
      if (ctrl && (e.key === 'h' || e.key === 'H')) { e.preventDefault(); openPanel('history'); return; }
      if (e.key === 'F5' || (ctrl && (e.key === 'r' || e.key === 'R'))) { e.preventDefault(); reloadCurrent(); return; }
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); back(); return; }
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); forward(); return; }
      if (e.key === 'F11') { e.preventDefault(); toggleFullscreen(); return; }
      if (e.key === 'Escape') {
        if (panelKind) { closePanel(); e.preventDefault(); return; }
        if (lastNetError) { hideState(); goHome(); e.preventDefault(); return; }
        if (document.activeElement === $('#addressInput') || document.activeElement === $('#ntpInput')) {
          document.activeElement.blur(); e.preventDefault(); return;
        }
      }
      if (e.keyCode === 461) {
        if (panelKind) closePanel();
        else if (lastNetError) { hideState(); goHome(); }
        else back();
        e.preventDefault(); return;
      }
      if (ctrl && (e.key === '+' || e.key === '=')) { e.preventDefault(); changeZoom(0.1); return; }
      if (ctrl && e.key === '-') { e.preventDefault(); changeZoom(-0.1); return; }
      if (ctrl && e.key === '0') { e.preventDefault(); changeZoom(0, true); return; }
      /* Arrow keys drive a spatial focus ring — the D-pad path. A single-line
         field has no vertical caret movement, so up/down still escape it;
         left/right stay native so the caret can be placed. */
      if (!ctrl && !e.altKey && /^Arrow(Up|Down|Left|Right)$/.test(e.key)) {
        var dir = e.key.replace('Arrow', '').toLowerCase();
        var singleLine = editing && tag === 'INPUT' && /^(text|search|url)$/i.test(e.target.type || 'text');
        if (editing && !singleLine) return;
        if (singleLine && dir !== 'up' && dir !== 'down') return;
        /* Down out of the command field goes to the first target, not to
           whichever row happens to sit under the field's centre. */
        if (singleLine && dir === 'down') {
          var firstTarget = document.querySelector('.target');
          if (firstTarget) { firstTarget.focus(); e.preventDefault(); return; }
        }
        if (document.activeElement === document.body || document.activeElement === document.documentElement) {
          var start = $('#ntpInput') || focusables()[0];
          if (start) { start.focus(); e.preventDefault(); return; }
        }
        if (moveFocus(dir)) e.preventDefault();
      }
    });
  }
  function changeZoom(delta, reset) {
    var cur = Number(data.settings.zoom) || 1;
    var next = reset ? 1 : Math.max(0.75, Math.min(1.5, Math.round((cur + delta) * 100) / 100));
    svc('setSetting', { key: 'zoom', value: next }).then(function () { applyZoom(); toast('Zoom ' + Math.round(next * 100) + '%'); });
  }

  async function init() {
    if (location.protocol === 'file:') {
      try {
        await callService('getState', {});
        location.replace(CFG.homeUrl + (location.hash || ''));
        return;
      } catch (e) { /* service unavailable: keep local launcher UI */ }
    }
    setIcons();
    bindEvents();
    updateClock();
    clockTimer = setInterval(updateClock, 15000);
    var local = loadLocal();
    data = local || defaultLocalState();
    renderAll();
    applyZoom();
    try {
      var r = await callService('getState', {});
      if (r && r.state) {
        data = normalizeState(r.state);
        online = true;
      }
    } catch (e) { /* offline */ }
    if (!data) { data = local || defaultLocalState(); online = false; }
    if (local && local.tabs && local.tabs.some(function (t) { return !isHome(t.url); }) &&
        data.tabs.length === 1 && isHome(data.tabs[0].url)) {
      try {
        var ir = await callService('importState', { state: local });
        if (ir && ir.state) data = normalizeState(ir.state);
      } catch (e) { /* ignore */ }
    }
    if (data.settings.homeUrl !== CFG.homeUrl) {
      try { var sr = await callService('setSetting', { key: 'homeUrl', value: CFG.homeUrl }); if (sr && sr.state) data = normalizeState(sr.state); else data.settings.homeUrl = CFG.homeUrl; } catch (e) { data.settings.homeUrl = CFG.homeUrl; }
    }
    saveLocal();
    await applyHashAndRestore();
    renderAll();
    applyZoom();
    probeTargets(false);
    /* If the state service was still linking when the first pass ran, the
       targets stayed untested. One retry covers that race. */
    setTimeout(function () { probeTargets(false); }, 2500);
    offerUndoClose();
    window.addEventListener('beforeunload', saveLocal);
    window.addEventListener('pagehide', saveLocal);
  }
  /* Closing the active tab navigates away, so the undo offer is picked up
     on the next start-page paint instead of vanishing with the old document. */
  function offerUndoClose() {
    var snap = null;
    try {
      snap = JSON.parse(sessionStorage.getItem('astra_closed') || 'null');
      sessionStorage.removeItem('astra_closed');
    } catch (e) { return; }
    if (!snap || !snap.url || isHome(snap.url)) return;
    if (data.tabs.some(function (t) { return t.url === snap.url; })) return;
    toast('Closed ' + cleanTitle(snap.title, snap.url), 'Undo', function () {
      svc('tabOpen', { url: snap.url, title: snap.title, activate: true }).then(function () {
        navigateTo(snap.url);
      });
    });
  }

  init();
})();
