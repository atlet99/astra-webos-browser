/* ASTRA injected chrome. i18n packs already loaded as 00-i18n-*.js before this file. */
(function () {
  'use strict';
  var PACKS = window.TVB_PACKS || {};
  var FALLBACK = 'en-US';
  var LOCALES = [
    { id: 'auto', label: 'Auto' },
    { id: 'en-US', label: 'English (US)' },
    { id: 'en-GB', label: 'English (UK)' },
    { id: 'ru', label: 'Русский' },
    { id: 'kk', label: 'Қазақша' },
    { id: 'uz', label: 'Oʻzbek' },
    { id: 'zh-CN', label: '中文 (简体)' }
  ];
  function normalizeTag(tag) {
    var t = String(tag || '').toLowerCase();
    if (t === 'kz' || t === 'kk') return 'kk';
    if (t === 'uz' || t === 'uzb') return 'uz';
    if (t === 'cn' || t === 'zh' || t.indexOf('zh') === 0) return 'zh-CN';
    if (t === 'en-gb') return 'en-GB';
    if (t.indexOf('en') === 0) return 'en-US';
    if (t.indexOf('ru') === 0) return 'ru';
    if (t.indexOf('kk') === 0 || t.indexOf('kz') === 0) return 'kk';
    if (t.indexOf('uz') === 0) return 'uz';
    return null;
  }
  function detectLocale(setting, navLang) {
    var s = setting || 'auto';
    if (s !== 'auto') return normalizeTag(s) || s;
    var navs = [navLang || (navigator.language || ''), navigator.userLanguage || ''];
    for (var i = 0; i < navs.length; i++) {
      var hit = normalizeTag(navs[i]);
      if (hit) return hit;
    }
    return FALLBACK;
  }
  var current = FALLBACK;
  var RTL = { 'he': true, 'ar': true, 'fa': true, 'ur': true };
  function setLocale(id) {
    current = normalizeTag(id) || id || FALLBACK;
    if (!PACKS[current]) current = FALLBACK;
    document.documentElement.lang = current;
    var dir = RTL[current] ? 'rtl' : 'ltr';
    try {
      document.documentElement.dir = dir;
      document.body.setAttribute('dir', dir);
    } catch (e) { /* ignore */ }
  }
  function t(key, params) {
    var dict = PACKS[current] || PACKS[FALLBACK] || {};
    var fb = PACKS[FALLBACK] || {};
    var s = dict[key] !== undefined ? dict[key] : fb[key];
    /* PluralRules: key_one / key_few / key_many / key_other via Intl.PluralRules.
       If a suffixed form exists for count, use it instead of the bare key. */
    if (params && typeof params.count === 'number') {
      try {
        var cat = new Intl.PluralRules(current, { type: 'cardinal' }).select(params.count);
        var sufix = '_' + cat, sufs = [sufix, '_other', ''];
        for (var i = 0; i < sufs.length; i++) {
          if (dict[key + sufs[i]] !== undefined) { s = dict[key + sufs[i]]; break; }
          if (fb[key + sufs[i]] !== undefined) { s = fb[key + sufs[i]]; break; }
        }
      } catch (e) { /* Intl unsupported -> keep base */ }
    }
    if (s === undefined) return key;
    if (params && typeof params === 'object') {
      s = String(s).replace(/\{(\w+)\}/g, function (m, k) {
        return params[k] !== undefined ? String(params[k]) : m;
      });
    }
    return s;
  }
  function applyStatic(root) {
    var scope = root || document;
    var list = scope.querySelectorAll('[data-i18n]');
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      el.textContent = t(el.getAttribute('data-i18n'));
    }
    var attrs = scope.querySelectorAll('[data-i18n-attr]');
    for (var j = 0; j < attrs.length; j++) {
      var ae = attrs[j];
      var spec = ae.getAttribute('data-i18n-attr') || '';
      spec.split(';').forEach(function (pair) {
        var kv = pair.split(':');
        if (kv.length === 2) ae.setAttribute(kv[0].trim(), t(kv[1].trim()));
      });
    }
  }
  function fmtTime(d) {
    try { return new Intl.DateTimeFormat(current, { hour: '2-digit', minute: '2-digit' }).format(d); }
    catch (e) { return String(d).slice(0, 5); }
  }
  function fmtRelative(ts) {
    try {
      var rtf = new Intl.RelativeTimeFormat(current, { numeric: 'auto' });
      var diff = (Math.floor(new Date(ts).getTime() / 1000) - Math.floor(Date.now() / 1000));
      if (Math.abs(diff) < 3600) return rtf.format(Math.round(diff / 60), 'minute');
      if (Math.abs(diff) < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
      return rtf.format(Math.round(diff / 86400), 'day');
    } catch (e) { return fmtClock(ts); }
  }
  function fmtClock(ts) {
    var d = new Date(ts || Date.now());
    var now = new Date();
    if (d.toDateString() === now.toDateString()) return fmtTime(d);
    try { return new Intl.DateTimeFormat(current, { month: 'numeric', day: 'numeric' }).format(d); }
    catch (e) { return (d.getMonth() + 1) + '/' + d.getDate(); }
  }
  window.ASTRA_I18N = { fmtRelative: fmtRelative,
    LOCALES: LOCALES,
    PACKS: PACKS,
    current: function () { return current; },
    setLocale: setLocale,
    detect: detectLocale,
    t: t,
    applyStatic: applyStatic,
    fmtClock: fmtClock,
    fmtTime: fmtTime
  };
  setLocale(detectLocale('auto'));
})();
(function () {
  'use strict';
  var CFG = {
    token: 'tvb-7f3c9a1d5e8b2c4f6a0d9e3b7c1f5a8d',
    serviceId: 'com.personal.tvwebbrowser.service',
    port: 7792,
    homeUrl: 'http://127.0.0.1:7792/home',
    fileHomeUrl: 'file:///media/developer/apps/usr/palm/applications/com.personal.tvwebbrowser/index.html',
    searchEngines: {
      google: { name: 'Google', url: 'https://www.google.com/search?q=' },
      bing: { name: 'Bing', url: 'https://www.bing.com/search?q=' },
      duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
      baidu: { name: 'Baidu', url: 'https://www.baidu.com/s?wd=' }
    }
  };
  if (/\/usr\/share\/localization\/wam\/loaderror\.html/.test(location.href)) {
    var eq = new URLSearchParams(location.search);
    var eh = eq.get('hostname') || '';
    var ec = eq.get('errorCode') || '';
    try { location.replace(CFG.homeUrl + '#error=' + encodeURIComponent(eh + '|' + ec)); } catch (e) { /* ignore */ }
    return;
  }
  var CHROME_H = 104;
  /* Instrumentation only: integer counters cost nothing and let the acceptance
     tests prove that a scroll does not rebuild the toolbar. */
  var perf = window.__TVB_PERF__ = {
    render: 0, renderTabs: 0, renderPanel: 0,
    wheel: 0, wheelMs: 0, wheelFrames: 0, wheelMiss: 0,
    svc: 0, svcStateBytes: 0,
    focusScan: 0, focusMs: 0,
    probe: 0
  };
  var ICONS = {
    back: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
    forward: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
    reload: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
    home: '<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/></svg>',
    menu: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    arrow: '<svg viewBox="0 0 24 24"><path d="M5 12h13M12 5l7 7-7 7"/></svg>'
  };
  var CSS = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }
.tvb-chrome {
  position: fixed; inset: 0 0 auto 0; z-index: 2147483647;
  font-family: "LG Display", "Segoe UI", "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif;
  color: #e9e3d6; pointer-events: none; font-size: 24px;
}
.tvb-tabsbar, .tvb-toolbar { pointer-events: auto; background: #0c1828; }
.tvb-tabsbar { height: 52px; display: flex; align-items: flex-end; gap: 6px; padding: 6px min(5vw, 96px) 0; background-color: #08111d; background-image: linear-gradient(90deg, #b32234 0 25%, #c25a30 25% 50%, #c39b5c 50% 75%, #33507b 75% 100%); background-size: 100% 4px; background-repeat: no-repeat; background-position: top left; border-bottom: 1px solid #22334c; }
.tvb-tabs { display: flex; gap: 2px; min-width: 0; overflow-x: auto; scrollbar-width: none; }
.tvb-tabs::-webkit-scrollbar { display: none; }
.tvb-tab { position: relative; height: 56px; min-width: 170px; max-width: 300px; display: flex; align-items: center; gap: 10px; padding: 0 6px 0 12px; border: 0; border-top: 2px solid transparent; background: transparent; color: #9299a3; font: inherit; font-size: 24px; white-space: nowrap; cursor: pointer; }
.tvb-tab:hover { background: #101c2e; color: #c4bfb3; }
.tvb-tab.tvb-active { background: #0c1828; color: #e9e3d6; border-top-color: #a3824a; }
.tvb-fav { width: 18px; height: 18px; flex: 0 0 18px; display: grid; place-items: center; font: 700 10px/1 "DejaVu Sans Mono", Consolas, monospace; color: #c4bfb3; border: 1px solid #3a4d68; }
.tvb-label { flex: 1; overflow: hidden; text-overflow: ellipsis; }
.tvb-x { width: 32px; height: 32px; flex: 0 0 32px; border: 0; border-radius: 2px; background: transparent; color: #9299a3; display: grid; place-items: center; cursor: pointer; padding: 0; }
.tvb-x svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }
.tvb-x:hover { background: rgba(152, 28, 42, .16); color: #d4564f; }
.tvb-plus { width: 56px; height: 56px; flex: 0 0 56px; margin-bottom: 2px; border: 1px solid #3a4d68; border-radius: 2px; background: transparent; color: #c4bfb3; display: grid; place-items: center; cursor: pointer; padding: 0; }
.tvb-plus svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
.tvb-plus:hover { color: #a3824a; border-color: #a3824a; }
.tvb-brand { margin-left: auto; padding: 0 4px 7px 10px; font-size: 24px; letter-spacing: .34em; color: #5c6878; font-weight: 700; white-space: nowrap; }
.tvb-tab:focus-visible, .tvb-ib:focus-visible, .tvb-go:focus-visible, .tvb-plus:focus-visible, .tvb-x:focus-visible, .tvb-px:focus-visible, .tvb-pdel:focus-visible, .tvb-prow:focus-visible, .tvb-popen:focus-visible { outline: 4px solid #fff; outline-offset: 2px; box-shadow: 0 0 8px 2px rgba(77,163,255,.55); background: #1e1e1e; transform: scale(1.06); }
.tvb-ib:active, .tvb-tab:active, .tvb-prow:active, .tvb-popen:active { transform: scale(0.97); }
@media (prefers-reduced-motion: reduce) { .tvb-tab:focus-visible, .tvb-ib:focus-visible, .tvb-go:focus-visible, .tvb-plus:focus-visible, .tvb-x:focus-visible, .tvb-px:focus-visible, .tvb-pdel:focus-visible, .tvb-prow:focus-visible, .tvb-popen:focus-visible { transform: none; transition: none; } }
@media (prefers-reduced-motion: reduce) { .tvb-toggle::after { transition: none; } }
.tvb-findbar { position: fixed; left: 50%; bottom: 40px; transform: translateX(-50%); z-index: 2147483646; display: none; gap: 8px; pointer-events: auto; background: #101c2e; border: 1px solid #3a4d68; padding: 10px 12px; }
.tvb-findbar input { width: 260px; min-height: 44px; }
.tvb-toolbar { height: 64px; display: flex; align-items: center; gap: 8px; padding: 0 min(5vw, 96px); border-bottom: 1px solid #3a4d68; }
.tvb-ib { width: 56px; height: 56px; flex: 0 0 56px; border: 1px solid transparent; border-radius: 2px; background: transparent; color: #c4bfb3; display: grid; place-items: center; cursor: pointer; padding: 0; }
.tvb-ib svg { width: 19px; height: 19px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.tvb-ib:hover { background: #182a44; color: #e9e3d6; border-color: #22334c; outline: 2px solid rgba(255,255,255,.35); }
.tvb-ib:disabled { opacity: .26; cursor: default; background: transparent; border-color: transparent; }
.tvb-ib.tvb-on { color: #d8b877; }
.tvb-ib.tvb-on svg { fill: currentColor; }
.tvb-omni { flex: 1; min-width: 160px; height: 56px; display: flex; align-items: center; gap: 10px; padding: 0 6px 0 14px; border: 1px solid #3a4d68; border-radius: 2px; background: #08111d; }
.tvb-omni:focus-within, .tvb-omni.tvb-focused { border-color: #a3824a; }
.tvb-sec { width: 18px; height: 18px; flex: 0 0 18px; color: #9299a3; display: grid; place-items: center; }
.tvb-sec svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.tvb-sec.tvb-secure { color: #d8b877; }
.tvb-omni input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: #e9e3d6; font: 17px/1 "DejaVu Sans Mono", Consolas, monospace; }
.tvb-omni input::placeholder { color: #9299a3; font-family: "LG Display", "Segoe UI", sans-serif; }
.tvb-go { width: 56px; height: 56px; flex: 0 0 56px; border: 1px solid #a3824a; border-radius: 2px; background: #a3824a; color: #0a1421; display: grid; place-items: center; padding: 0; cursor: pointer; }
.tvb-go svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.tvb-panel { position: fixed; top: 112px; right: 18px; width: 452px; max-height: 70vh; display: flex; flex-direction: column; border: 1px solid #3a4d68; border-radius: 2px; overflow: hidden; background: #122036; box-shadow: 0 22px 44px -18px rgba(0, 0, 0, .95); pointer-events: auto; }
.tvb-panel[hidden] { display: none; }
.tvb-phead { display: flex; align-items: center; height: 58px; padding: 0 10px 0 20px; border-bottom: 1px solid #3a4d68; }
.tvb-phead b { font-size: 16px; font-weight: 600; flex: 1; }
.tvb-px { width: 56px; height: 56px; border: 1px solid transparent; border-radius: 2px; background: transparent; color: #9299a3; display: grid; place-items: center; cursor: pointer; padding: 0; }
.tvb-px svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }
.tvb-px:hover { color: #d4564f; border-color: rgba(152, 28, 42, .4); }
.tvb-pbody { padding: 6px; overflow-y: auto; }
.tvb-prow { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 58px; padding: 0 8px; border: 0; border-radius: 2px; background: transparent; color: inherit; text-align: left; font: inherit; cursor: pointer; }
.tvb-prow { border-bottom: 1px solid #22334c; }
.tvb-prow:last-child { border-bottom: 0; }
.tvb-prow:hover { background: #16263c; }
.tvb-popen { flex: 1; min-width: 0; min-height: 58px; display: flex; align-items: center; padding: 0 0 0 6px; border: 0; background: transparent; text-align: left; color: inherit; font: inherit; cursor: pointer; }
.tvb-pmeta { flex: 1; min-width: 0; }
.tvb-pname { display: block; font-size: 16px; color: #e9e3d6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tvb-phost { display: block; margin-top: 3px; font: 12px/1 "DejaVu Sans Mono", Consolas, monospace; color: #9299a3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tvb-pkey { font: 11px/1 "DejaVu Sans Mono", Consolas, monospace; color: #9299a3; letter-spacing: .1em; padding-right: 6px; }
.tvb-pdel { width: 56px; height: 56px; flex: 0 0 56px; border: 0; border-radius: 2px; background: transparent; color: #9299a3; display: grid; place-items: center; cursor: pointer; padding: 0; }
.tvb-pdel svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }
.tvb-pdel:hover { background: rgba(152, 28, 42, .14); color: #d4564f; }
.tvb-pempty { padding: 34px 18px; color: #9299a3; text-align: center; font-size: 24px; }
.tvb-pactions { display: flex; gap: 8px; padding: 10px 10px 12px; border-top: 1px solid #22334c; }
.tvb-pactions button { flex: 1; min-height: 56px; border: 1px solid #3a4d68; border-radius: 2px; background: transparent; color: #c4bfb3; font: inherit; font-size: 24px; cursor: pointer; }
.tvb-pactions button:hover { color: #e9e3d6; border-color: #9299a3; }
.tvb-set { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 12px; border-bottom: 1px solid #22334c; }
.tvb-set label { color: #c4bfb3; font-size: 16px; }
.tvb-hint { display: block; margin-top: 6px; font: 12px/1.5 "DejaVu Sans Mono", Consolas, monospace; color: #9299a3; }
.tvb-set select { min-height: 56px; background: #182a44; border: 1px solid #3a4d68; color: #e9e3d6; border-radius: 2px; padding: 0 10px; font: inherit; font-size: 24px; }
.tvb-seg { display: flex; gap: 4px; }
.tvb-seg button { min-width: 64px; min-height: 40px; border: 1px solid #3a4d68; border-radius: 2px; background: transparent; color: #c4bfb3; font: 13px/1 "DejaVu Sans Mono", Consolas, monospace; cursor: pointer; }
.tvb-seg button.tvb-on { border-color: #a3824a; color: #a3824a; }
.tvb-toggle { width: 52px; height: 28px; border-radius: 2px; border: 1px solid #3a4d68; background: #101c2e; position: relative; cursor: pointer; padding: 0; }
.tvb-toggle::after { content: ""; position: absolute; top: 4px; left: 4px; width: 18px; height: 18px; background: #9299a3; transition: .15s; }
.tvb-toggle.tvb-on { border-color: #a3824a; }
.tvb-toggle.tvb-on::after { left: 28px; background: #e9e3d6; }
.tvb-neterror { padding: 26px 16px 12px; }
.tvb-ne-code { display: flex; align-items: center; gap: 10px; font: 12px/1 "DejaVu Sans Mono", Consolas, monospace; letter-spacing: .2em; color: #d8b877; margin-bottom: 16px; }
.tvb-ne-code i { display: block; width: 22px; height: 1px; background: #d8b877; }
.tvb-ne-title { font-size: 26px; font-weight: 700; color: #e9e3d6; margin-bottom: 12px; line-height: 1.2; }
.tvb-ne-title em { font-style: normal; color: #a3824a; }
.tvb-ne-desc { font-size: 24px; line-height: 1.5; color: #c4bfb3; }
.tvb-ne-meta { margin-top: 12px; font: 12px/1 "DejaVu Sans Mono", Consolas, monospace; color: #9299a3; }
.tvb-toast { position: fixed; left: 50%; bottom: 40px; transform: translateX(-50%); padding: 13px 18px; border: 1px solid #3a4d68; border-top: 2px solid #a3824a; border-radius: 2px; background: #101c2e; color: #e9e3d6; font-size: 24px; pointer-events: none; box-shadow: 0 18px 38px -16px rgba(0, 0, 0, .9); }
.tvb-toast[hidden] { display: none; }
.tvb-chrome.tvb-hidden .tvb-tabsbar, .tvb-chrome.tvb-hidden .tvb-toolbar, .tvb-chrome.tvb-hidden .tvb-panel { display: none; }
.tvb-quickhome { position: fixed; right: 12px; top: 50%; transform: translateY(-50%); z-index: 2147483646; min-height: 44px; padding: 0 16px; border: 1px solid #a3824a; border-radius: 999px; background: #122036; color: #e9e3d6; font: 15px 'LG Display', 'Segoe UI', sans-serif; cursor: pointer; }
.tvb-fs-exit { position: fixed; pointer-events: auto; top: 12px; right: 12px; z-index: 2147483647; min-height: 44px; padding: 0 16px; border: 1px solid #a3824a; border-radius: 2px; background: #122036; color: #e9e3d6; font: 15px "LG Display", "Segoe UI", sans-serif; cursor: pointer; }
.tvb-fs-exit[hidden] { display: none; }
.tvb-help { margin: 0; padding: 6px 12px 12px; }
.tvb-help div { display: flex; justify-content: space-between; gap: 16px; padding: 9px 0; border-bottom: 1px solid #22334c; font-size: 24px; color: #c4bfb3; }
.tvb-help div:last-child { border-bottom: 0; }
.tvb-help kbd { font: 12px/1 "DejaVu Sans Mono", Consolas, monospace; color: #e9e3d6; border: 1px solid #3a4d68; border-radius: 2px; padding: 4px 6px; }
.tvb-helpnote { padding: 4px 12px 14px; font: 13px/1.7 "DejaVu Sans Mono", Consolas, monospace; color: #9299a3; }
`;
  var HTML = `
<div class="tvb-chrome" id="tvbChrome">
  <div class="tvb-tabsbar"><div class="tvb-tabs" id="tvbTabs" role="tablist" aria-label="Tab"></div><button class="tvb-plus" id="tvbNew" type="button" aria-label="${T('tab.newTab')}" title="${T('tab.newTab')} (Ctrl+T)"></button><div class="tvb-brand">ASTRA</div></div>
  <div class="tvb-toolbar">
    <button class="tvb-ib" id="tvbBack" type="button" title="${T('chrome.back')} (Alt+←)" aria-label="${T('chrome.back')}"></button>
    <button class="tvb-ib" id="tvbForward" type="button" title="${T('chrome.forward')} (Alt+→)" aria-label="${T('chrome.forward')}"></button>
    <button class="tvb-ib" id="tvbReload" type="button" title="${T('chrome.reload')} (F5)" aria-label="${T('chrome.reload')}"></button>
    <button class="tvb-ib" id="tvbHome" type="button" title="${T('chrome.home')}" aria-label="${T('chrome.home')}"></button>
    <form class="tvb-omni" id="tvbOmni" autocomplete="off"><span class="tvb-sec" id="tvbSec" aria-hidden="true"></span><input id="tvbAddr" type="text" readonly tabindex="-1" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="${T('addr.placeholder')}" aria-label="${T('addr.label')}"><button class="tvb-go" id="tvbGo" type="submit" title="${T('chrome.open')}" aria-label="${T('chrome.open')}"></button></form>
    <button class="tvb-ib" id="tvbStar" type="button" title="${T('chrome.bookmark')} (Ctrl+D)" aria-label="${T('chrome.bookmark')}"></button>
    <button class="tvb-ib" id="tvbMenu" type="button" title="${T('chrome.menu')}" aria-label="${T('chrome.menu')}"></button>
  </div>
  <div class="tvb-panel" id="tvbPanel" role="dialog" aria-modal="true" aria-labelledby="tvbPTitle" hidden><div class="tvb-phead"><b id="tvbPTitle">${T('panel.menu')}</b><button class="tvb-px" id="tvbPClose" type="button" aria-label="${T('chrome.close')}"></button></div><div class="tvb-pbody" id="tvbPBody"></div><div class="tvb-pactions" id="tvbPActions" hidden></div></div>
  <div class="tvb-toast" id="tvbToast" role="status" aria-live="polite" hidden></div>
  <div class="tvb-findbar" id="tvb-findbar"><input id="tvb-find-input" type="search"><button id="tvb-find-prev" type="button">↑</button><button id="tvb-find-next" type="button">↓</button><button id="tvb-find-close" type="button">×</button></div>
</div>
<button class="tvb-fs-exit" id="tvbFsExit" type="button" hidden>${T('panel.fullscreen')}</button>
<button class="tvb-quickhome" id="tvbQuickHome" type="button">⌂ Home (Ctrl+0)</button>
`;
  var host = document.createElement('div');
  host.id = 'tvb-chrome-host';
  host.style.cssText = 'all:initial!important;position:fixed!important;top:0!important;left:0!important;width:100%!important;height:0!important;z-index:2147483647!important;pointer-events:none!important;display:block!important;';
  var shadow;
  try { shadow = host.attachShadow({ mode: 'closed' }); } catch (e) { return; }
  try {
    var sheet = new CSSStyleSheet();
    sheet.replaceSync(CSS);
    shadow.adoptedStyleSheets = [sheet];
  } catch (e) {
    var style = document.createElement('style');
    style.textContent = CSS;
    shadow.appendChild(style);
  }
  shadow.innerHTML = HTML;
  var q = function (id) { return shadow.getElementById(id); };
  var ui = {
    chrome: q('tvbChrome'), tabs: q('tvbTabs'), addr: q('tvbAddr'), sec: q('tvbSec'),
    back: q('tvbBack'), forward: q('tvbForward'), star: q('tvbStar'), panel: q('tvbPanel'),
    ptitle: q('tvbPTitle'), pbody: q('tvbPBody'), pactions: q('tvbPActions'),
    toast: q('tvbToast'), fsExit: q('tvbFsExit')
  };
  ui.back.innerHTML = ICONS.back; ui.forward.innerHTML = ICONS.forward;
  q('tvbReload').innerHTML = ICONS.reload; q('tvbHome').innerHTML = ICONS.home;
  ui.star.innerHTML = ICONS.star; q('tvbMenu').innerHTML = ICONS.menu;
  q('tvbNew').innerHTML = ICONS.plus; q('tvbPClose').innerHTML = ICONS.close;
  q('tvbGo').innerHTML = ICONS.arrow;
  ui.sec.innerHTML = ICONS.globe;
  var fi = shadow.getElementById('tvb-find-input'); if (fi) fi.addEventListener('input', function () { _doFindPage(this.value); });
  shadow.getElementById('tvb-find-prev').addEventListener('click', function () { if (_findMarks.length > 0) { var m = _findMarks.shift(); _findMarks.push(m); } });
  shadow.getElementById('tvb-find-close').addEventListener('click', closeFindBar);
  function applyChromeStatics() {
    q('tvbNew').setAttribute('aria-label', T('tab.newTab'));
    q('tvbNew').setAttribute('title', T('tab.newTab') + ' (Ctrl+T)');
    ui.back.setAttribute('aria-label', T('chrome.back'));
    ui.back.setAttribute('title', T('chrome.back') + ' (Alt+←)');
    ui.forward.setAttribute('aria-label', T('chrome.forward'));
    ui.forward.setAttribute('title', T('chrome.forward') + ' (Alt+→)');
    q('tvbReload').setAttribute('aria-label', T('chrome.reload'));
    q('tvbReload').setAttribute('title', T('chrome.reload') + ' (F5)');
    q('tvbHome').setAttribute('aria-label', T('chrome.home'));
    q('tvbHome').setAttribute('title', T('chrome.home'));
    ui.addr.setAttribute('placeholder', T('addr.placeholder'));
    ui.addr.setAttribute('aria-label', T('addr.label'));
    q('tvbGo').setAttribute('aria-label', T('chrome.open'));
    q('tvbGo').setAttribute('title', T('chrome.open'));
    ui.star.setAttribute('aria-label', T('chrome.bookmark'));
    ui.star.setAttribute('title', T('chrome.bookmark') + ' (Ctrl+D)');
    q('tvbMenu').setAttribute('aria-label', T('chrome.menu'));
    q('tvbMenu').setAttribute('title', T('chrome.menu'));
    q('tvbPClose').setAttribute('aria-label', T('chrome.close'));
    ui.fsExit.textContent = T('panel.fullscreen');
  }
  function applyLocale() {
    var setting = (data && data.settings && data.settings.locale) || 'auto';
    I18N.setLocale(I18N.detect(setting));
    applyChromeStatics();
    if (panelKind) renderPanel(panelKind);
  }
  var proxy = null;
  /* Explicit edit state: while true, no async state response may overwrite the
     address field, and IME composition is left alone. */
  var editingAddress = false;
  var composing = false;
  function ensureProxy() {
    if (proxy && proxy.isConnected) return proxy;
    proxy = document.createElement('input');
    proxy.id = 'tvb-keyboard-proxy';
    proxy.type = 'text';
    proxy.autocomplete = 'off';
    proxy.autocapitalize = 'off';
    proxy.spellcheck = false;
    proxy.style.cssText = 'position:fixed!important;top:50px!important;left:330px!important;width:2px!important;height:2px!important;opacity:0!important;border:0!important;padding:0!important;margin:0!important;z-index:2147483647!important;pointer-events:none!important;background:transparent!important;color:transparent!important;';
    proxy.addEventListener('input', function () { if (!composing) ui.addr.value = proxy.value; });
    proxy.addEventListener('compositionstart', function () { composing = true; });
    proxy.addEventListener('compositionupdate', function () { composing = true; });
    proxy.addEventListener('compositionend', function () {
      composing = false;
      ui.addr.value = proxy.value;
    });
    proxy.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault(); e.stopPropagation();
        var v = proxy.value.trim();
        proxy.blur();
        editingAddress = false;
        if (v) navigate(v);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation(); proxy.blur();
        editingAddress = false;
        var at = activeTab();
        ui.addr.value = at && !isHome(at.url) ? location.href : '';
        return;
      }
      e.stopPropagation();
    });
    try { document.documentElement.appendChild(proxy); } catch (e) { /* ignore */ }
    return proxy;
  }
  function focusAddress() {
    var at = activeTab();
    var value = at && !isHome(at.url) ? location.href : '';
    ensureProxy();
    editingAddress = true;
    proxy.value = value;
    ui.addr.value = value;
    ui.chrome.querySelector('.tvb-omni').classList.add('tvb-focused');
    try { proxy.focus(); proxy.select(); } catch (e) { /* ignore */ }
  }
  function blurAddress() {
    editingAddress = false;
    composing = false;
    try { if (proxy) proxy.blur(); } catch (e) { /* ignore */ }
    ui.chrome.querySelector('.tvb-omni').classList.remove('tvb-focused');
  }


  var data = null;
  var online = false;
  var transport = null;
  var panelKind = null;
  var fullscreen = false;
  var toastTimer = null;
  var lastUrl = location.href;
  var lastTitle = document.title;
  var pollTimer = null;
  var scrollTimer = null;
  var suppressVisit = false;
  var origBodyPadding = null;
  var origBodyZoom = null;
  var offlineNotice = false;
  var lastNetError = null;

  function now() { return Date.now(); }
  function isHome(url) {
    if (!url || url === 'about:home' || String(url).indexOf('/com.personal.tvwebbrowser/index.html') >= 0) return true;
    return /^http:\/\/127\.0\.0\.1:7792\/home(?:[#?].*)?$/.test(String(url));
  }
  function homeUrl(action) {
    var h = data && data.settings ? data.settings.homeUrl : '';
    if (!h || !/^http:\/\/127\.0\.0\.1:7792\/home/.test(h)) h = CFG.homeUrl;
    return h + (action ? '#' + action : '');
  }
  function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
  function prettyUrl(url) { try { var u = new URL(url); return u.hostname + (u.pathname === '/' ? '' : u.pathname) + (u.search || ''); } catch (e) { return String(url || ''); } }
  function initialOf(url) { var h = hostOf(url); return h ? h[0].toUpperCase() : '•'; }
  function activeTab() { if (!data) return null; return (data.tabs || []).find(function (t) { return t.id === data.activeTabId; }) || (data.tabs || [])[0] || null; }
  function tabById(id) { return (data.tabs || []).find(function (t) { return t.id === id; }); }
  function normalizeState(raw) {
    var s = raw || {};
    s.tabs = Array.isArray(s.tabs) ? s.tabs : [];
    if (!s.tabs.length) s.tabs = [{ id: 't_' + now().toString(36), url: location.href, title: document.title || prettyUrl(location.href), history: [{ url: location.href, title: document.title || '', at: now() }], historyIndex: 0, scrollY: 0 }];
    s.tabs.forEach(function (t) {
      t.url = t.url || 'about:home';
      t.title = t.title || (isHome(t.url) ? T('tab.newTab') : prettyUrl(t.url));
      if (isHome(t.url) && /^(new tab|untitled)$/i.test(String(t.title))) t.title = T('tab.newTab');
      t.history = Array.isArray(t.history) && t.history.length ? t.history : [{ url: t.url, title: t.title, at: now() }];
      t.historyIndex = Math.max(0, Math.min(Number(t.historyIndex) || 0, t.history.length - 1));
      t.scrollY = Number(t.scrollY) || 0;
    });
    s.activeTabId = s.activeTabId && s.tabs.some(function (t) { return t.id === s.activeTabId; }) ? s.activeTabId : s.tabs[0].id;
    s.bookmarks = Array.isArray(s.bookmarks) ? s.bookmarks : [];
    s.history = Array.isArray(s.history) ? s.history : [];
    s.settings = Object.assign({ searchEngine: 'google', restoreSession: true, zoom: 1, homeUrl: CFG.homeUrl, locale: 'auto' }, s.settings || {});
    s.updatedAt = Number(s.updatedAt) || now();
    return s;
  }
  function normalizeInput(raw) {
    var s = String(raw || '').trim();
    if (!s) return '';
    if (/^(https?|file|about):/i.test(s)) return s;
    if (/^\/\//.test(s)) return 'https:' + s;
    var domain = /^[\w.-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/i.test(s) || /^localhost(:\d+)?(\/.*)?$/i.test(s) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(s);
    if (domain) return 'https://' + s;
    var engine = CFG.searchEngines[(data && data.settings && data.settings.searchEngine) || 'google'] || CFG.searchEngines.google;
    return engine.url + encodeURIComponent(s);
  }
  function toast(text) {
    ui.toast.textContent = text;
    ui.toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { ui.toast.hidden = true; }, 2200);
  }
  var fallbackTimer = null;
  function persistFallback() {
    if (!data) return;
    /* window.name carries a full JSON snapshot across navigations; coalesce
       bursts so a navigation does not serialise the state several times. */
    if (fallbackTimer) return;
    fallbackTimer = setTimeout(function () {
      fallbackTimer = null;
      try { window.name = 'TVB1|' + JSON.stringify(data); } catch (e) { /* ignore */ }
    }, 1000);
  }
  function loadFallback() {
    try {
      if (!window.name || window.name.indexOf('TVB1|') !== 0) return null;
      return normalizeState(JSON.parse(window.name.slice(5)));
    } catch (e) { return null; }
  }

  // --- service transport ---------------------------------------------------
  function bridgeCall(method, payload, timeoutMs) {
    return new Promise(function (resolve, reject) {
      if (!window.PalmServiceBridge) { reject(new Error('no bridge')); return; }
      var bridge;
      try { bridge = new window.PalmServiceBridge(); } catch (e) { reject(e); return; }
      var done = false;
      var timer = setTimeout(function () {
        if (done) return; done = true;
        try { bridge.cancel(); } catch (e) { /* ignore */ }
        reject(new Error('timeout'));
      }, timeoutMs || 3500);
      bridge.onservicecallback = function (msg) {
        if (done) return; done = true; clearTimeout(timer);
        try { resolve(JSON.parse(msg)); } catch (e) { reject(e); }
        try { bridge.cancel(); } catch (e) { /* ignore */ }
      };
      try { bridge.call('luna://' + CFG.serviceId + '/' + method, JSON.stringify(Object.assign({ token: CFG.token }, payload || {}))); }
      catch (e) { clearTimeout(timer); done = true; reject(e); }
    });
  }
  function httpCall(method, payload, timeoutMs) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeoutMs || 3500);
    return fetch('http://127.0.0.1:' + CFG.port + '/' + method, {
      method: 'POST', cache: 'no-store',
      headers: { 'content-type': 'application/json', 'x-tvb-token': CFG.token },
      body: JSON.stringify(Object.assign({ token: CFG.token }, payload || {})),
      signal: ctrl ? ctrl.signal : undefined,
      /* Survives the unload that follows a navigation. */
      keepalive: method === 'tabVisit'
    }).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('http ' + r.status);
      return r.text();
    }).then(function (txt) {
      /* Reading the body as text costs nothing extra (json() does the same)
         and gives the benchmark a real payload-size metric. */
      perf.svcStateBytes += txt.length;
      return JSON.parse(txt);
    }).catch(function (e) { clearTimeout(timer); throw e; });
  }
  function callService(method, payload) {
    if (transport === 'ls2') return bridgeCall(method, payload).catch(function () { transport = null; return callService(method, payload); });
    if (transport === 'http') return httpCall(method, payload).catch(function () { transport = null; return callService(method, payload); });
    var first = window.PalmServiceBridge ? bridgeCall('getState', {}).then(function (r) { transport = 'ls2'; return r; }).catch(function () { return null; }) : Promise.resolve(null);
    return first.then(function (r) {
      if (r) return method === 'getState' ? r : bridgeCall(method, payload);
      return httpCall('getState', {}).then(function (r2) { transport = 'http'; return method === 'getState' ? r2 : httpCall(method, payload); });
    });
  }

  function localApply(method, p) {
    p = p || {};
    if (!data) data = normalizeState({});
    var t = activeTab();
    if (method === 'tabOpen') {
      var nt = { id: 't_' + now().toString(36), url: isHome(p.url) ? 'about:home' : p.url, title: p.title || (isHome(p.url) ? T('tab.newTab') : prettyUrl(p.url)), history: [], historyIndex: 0, scrollY: 0 };
      nt.history = [{ url: nt.url, title: nt.title, at: now() }];
      data.tabs.push(nt);
      if (data.tabs.length > 8) data.tabs.shift();
      if (p.activate !== false) data.activeTabId = nt.id;
      return { returnValue: true, state: data, tab: nt };
    }
    if (method === 'tabActivate') { if (tabById(p.id)) data.activeTabId = p.id; return { returnValue: true, state: data }; }
    if (method === 'tabClose') {
      var idx = data.tabs.findIndex(function (x) { return x.id === p.id; });
      if (idx >= 0) {
        var was = data.activeTabId === p.id;
        data.tabs.splice(idx, 1);
        if (!data.tabs.length) data = normalizeState({});
        else if (was) data.activeTabId = data.tabs[Math.min(idx, data.tabs.length - 1)].id;
      }
      return { returnValue: true, state: data, activeTab: activeTab() };
    }
    if (method === 'tabVisit') {
      var tb = tabById(p.id) || t;
      var url = isHome(p.url) ? 'about:home' : p.url;
      var title = p.title || (url === 'about:home' ? T('tab.newTab') : prettyUrl(url));
      if (!tb) { tb = { id: 't_' + now().toString(36), url: url, title: title, history: [], historyIndex: 0, scrollY: 0 }; data.tabs.push(tb); data.activeTabId = tb.id; }
      var cur = tb.history[tb.historyIndex];
      if (!cur || cur.url !== url) {
        tb.history = tb.history.slice(0, tb.historyIndex + 1);
        tb.history.push({ url: url, title: title, at: now() });
        if (tb.history.length > 60) tb.history.shift();
        tb.historyIndex = tb.history.length - 1;
      } else { cur.title = title; cur.at = now(); }
      tb.url = url; tb.title = title; tb.updatedAt = now();
      if (p.scrollY !== undefined && (!cur || cur.url !== url)) tb.scrollY = Number(p.scrollY) || 0;
      if (p.activate !== false) data.activeTabId = tb.id;
      if (url !== 'about:home') {
        var first = data.history[0];
        if (!first || first.url !== url) data.history.unshift({ id: 'h_' + now().toString(36), url: url, title: title, at: now() });
        if (data.history.length > 300) data.history.length = 300;
      }
      return { returnValue: true, state: data, tab: tb };
    }
    if (method === 'tabUpdate') { if (t) { if (p.title !== undefined) t.title = p.title; if (p.scrollY !== undefined) t.scrollY = Number(p.scrollY) || 0; } return { returnValue: true, state: data }; }
    if (method === 'historyBack' || method === 'historyForward') {
      if (t) {
        var next = t.historyIndex + (method === 'historyBack' ? -1 : 1);
        if (next >= 0 && next < t.history.length) {
          t.historyIndex = next; t.url = t.history[next].url; t.title = t.history[next].title || t.title; data.activeTabId = t.id;
          return { returnValue: true, state: data, url: t.url, title: t.title };
        }
      }
      return { returnValue: false, error: 'no more history' };
    }
    if (method === 'bookmarkToggle') {
      var u = isHome(p.url) ? 'about:home' : p.url;
      if (u === 'about:home') return { returnValue: false, error: 'cannot bookmark home' };
      var bi = data.bookmarks.findIndex(function (b) { return b.url === u; });
      if (bi >= 0) data.bookmarks.splice(bi, 1);
      else data.bookmarks.unshift({ id: 'b_' + now().toString(36), url: u, title: p.title || u, createdAt: now() });
      return { returnValue: true, state: data };
    }
    if (method === 'tabRollback') {
      var rb = tabById(p.id) || activeTab();
      if (rb) {
        if (rb.history.length > 1 && rb.historyIndex > 0) {
          rb.history.splice(rb.historyIndex, 1);
          rb.historyIndex = Math.max(0, rb.historyIndex - 1);
          rb.url = rb.history[rb.historyIndex].url;
          rb.title = rb.history[rb.historyIndex].title || rb.url;
        } else {
          rb.history = [{ url: 'about:home', title: T('tab.newTab'), at: now() }];
          rb.historyIndex = 0; rb.url = 'about:home'; rb.title = T('tab.newTab');
        }
      }
      return { returnValue: true, state: data };
    }
    if (method === 'historyDelete') { data.history = data.history.filter(function (h) { return h.id !== p.id; }); return { returnValue: true, state: data }; }
    if (method === 'historyClear') { data.history = []; return { returnValue: true, state: data }; }
    if (method === 'setSetting') { data.settings[p.key] = p.value; return { returnValue: true, state: data }; }
    return { returnValue: false, error: 'offline' };
  }
  var _svcErrAt = 0;
  function svc(method, payload) {
    perf.svc++;
    /* Throttle svc errors: 5s between offlineNotice toasts at most. */
    var nowErr = Date.now();
    return callService(method, payload).then(function (r) {
      if (r && r.returnValue === false) return r;
      if (r && r.state) {
        var prevRev = data && data.rev;
        var prevActive = data && data.activeTabId;
        data = normalizeState(r.state);
        online = true;
        if (r.state.settings) applyLocale();
        /* A scroll acknowledgement carries no state; a response whose rev did
           not move means the server had nothing new to say. */
        if (method !== 'tabUpdate' || data.rev !== prevRev || data.activeTabId !== prevActive) {
          persistFallback();
          render();
        }
      }
      return r;
    }).catch(function () {
      online = false;
      if (!offlineNotice && nowErr - _svcErrAt > 5000) { offlineNotice = true; _svcErrAt = nowErr; toast(T('toast.unavailable')); }
      var r = localApply(method, payload);
      if (r && r.state && r.state.settings) applyLocale();
      persistFallback();
      if (method !== 'tabUpdate') render();
      return r;
    });
  }

  // --- rendering -----------------------------------------------------------
  /* Tab buttons are reused by id: a title change only rewrites one text node,
     and an unchanged render writes nothing at all. */
  var tabNodes = Object.create(null);

  function createTabNode() {
    var b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    var fav = document.createElement('span'); fav.className = 'tvb-fav';
    var label = document.createElement('span'); label.className = 'tvb-label';
    var x = document.createElement('span'); x.className = 'tvb-x'; x.innerHTML = ICONS.close;
    x.setAttribute('role', 'presentation');
    b.appendChild(fav); b.appendChild(label); b.appendChild(x);
    b.addEventListener('click', function () { if (b.dataset.tabId) switchTab(b.dataset.tabId); });
    x.addEventListener('click', function (e) { e.stopPropagation(); if (b.dataset.tabId) closeTab(b.dataset.tabId); });
    return { btn: b, fav: fav, label: label, title: null, initial: null, on: null };
  }

  function renderTabs() {
    perf.renderTabs++;
    var list = data.tabs || [];
    var seen = Object.create(null);
    var parent = ui.tabs;
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      seen[t.id] = 1;
      var rec = tabNodes[t.id];
      if (!rec) {
        rec = createTabNode();
        rec.btn.dataset.tabId = t.id;
        tabNodes[t.id] = rec;
      }
      var on = t.id === data.activeTabId;
      var title = t.title || (isHome(t.url) ? T('tab.newTab') : prettyUrl(t.url));
      var initial = initialOf(t.url);
      if (rec.title !== title) { rec.label.textContent = title; rec.btn.title = title; rec.title = title; }
      if (rec.initial !== initial) { rec.fav.textContent = initial; rec.initial = initial; }
      if (rec.on !== on) {
        rec.btn.className = 'tvb-tab' + (on ? ' tvb-active' : '');
        rec.btn.setAttribute('aria-selected', on ? 'true' : 'false');
        rec.on = on;
      }
      if (parent.children[i] !== rec.btn) parent.insertBefore(rec.btn, parent.children[i] || null);
    }
    for (var id in tabNodes) {
      if (!seen[id]) {
        var dead = tabNodes[id];
        if (dead.btn.parentNode) dead.btn.parentNode.removeChild(dead.btn);
        delete tabNodes[id];
      }
    }
    invalidateFocus();
  }

  var lastRenderSig = '';
  var lastPanelSig = '';

  function panelSignature(kind) {
    if (!data) return kind;
    var loc = I18N.current ? I18N.current() : 'en-US';
    if (kind === 'bookmarks') return 'b:' + (data.bookmarks || []).map(function (b) { return b.id; }).join(',') + ':' + loc;
    if (kind === 'history') return 'h:' + (data.history || []).length + ':' + (((data.history || [])[0] || {}).id || '') + ':' + loc;
    if (kind === 'settings') {
      var s = data.settings || {};
      return 's:' + s.searchEngine + ':' + s.restoreSession + ':' + s.zoom + ':' + (s.locale || 'auto') + ':' + loc;
    }
    return kind + ':' + loc;
  }

  function syncAddress() {
    if (editingAddress) return;
    var t = activeTab();
    var v = t && !isHome(t.url) ? t.url : '';
    if (ui.addr.value !== v) ui.addr.value = v;
    var secure = /^https:/i.test((t && t.url) || '');
    if (ui.sec.classList.contains('tvb-secure') !== secure) {
      ui.sec.classList.toggle('tvb-secure', secure);
      ui.sec.innerHTML = secure ? ICONS.lock : ICONS.globe;
    }
  }

  function render() {
    if (!data) return;
    perf.render++;
    var t = activeTab();
    /* Cheap signature of everything render() paints. If it did not move,
       touching the DOM would be pure churn. */
    var sig = [
      data.activeTabId,
      (data.tabs || []).length,
      t ? t.url : '',
      t ? (t.title || '') : '',
      t ? t.historyIndex : -1,
      (data.tabs || []).map(function (x) { return x.id; }).join(','),
      (data.bookmarks || []).length,
      t && (data.bookmarks || []).some(function (b) { return b.url === t.url; }) ? 1 : 0,
      I18N.current ? I18N.current() : 'en-US'
    ].join('|');
    if (sig === lastRenderSig) {
      if (panelKind) {
        var ps0 = panelSignature(panelKind);
        if (ps0 !== lastPanelSig) renderPanel(panelKind);
      }
      return;
    }
    lastRenderSig = sig;

    renderTabs();
    syncAddress();
    ui.back.disabled = !t || t.historyIndex <= 0;
    ui.forward.disabled = !t || t.historyIndex >= (t.history || []).length - 1;
    var bm = t && (data.bookmarks || []).some(function (b) { return b.url === t.url; });
    ui.star.classList.toggle('tvb-on', !!bm);
    if (panelKind) {
      var ps = panelSignature(panelKind);
      if (ps !== lastPanelSig) renderPanel(panelKind);
    }
  }
  function mkBtn(cls, label) {
    var b = document.createElement('button');
    b.type = 'button';
    if (cls) b.className = cls;
    if (label !== undefined) b.textContent = label;
    return b;
  }
  function renderPanel(kind) {
    perf.renderPanel++;
    lastPanelSig = panelSignature(kind);
    if (window.__TVB_INVALIDATE_WHEEL__) window.__TVB_INVALIDATE_WHEEL__();
    invalidateFocus();
    panelKind = kind;
    var titles = { menu: T('panel.menu'), bookmarks: T('panel.bookmarks'), history: T('panel.history'), settings: T('panel.settings'), help: T('panel.help'), neterror: T('tab.cannotReach', { host: lastNetError ? lastNetError.host : '' }) };
    ui.ptitle.textContent = titles[kind] || T('panel.menu');
    ui.pbody.innerHTML = '';
    ui.pactions.innerHTML = '';
    ui.pactions.hidden = true;

    if (kind === 'menu') {
      [['new', T('panel.newTab'), 'CTRL T'], ['bookmarks', T('panel.bookmarks'), ''], ['history', T('panel.history'), 'CTRL H'],
       ['settings', T('panel.settings'), ''], ['help', T('panel.helpShortcuts'), ''], ['fullscreen', T('panel.fullscreen'), 'F11']
      ].forEach(function (it) {
        var row = mkBtn('tvb-prow');
        var meta = document.createElement('span'); meta.className = 'tvb-pmeta';
        var n = document.createElement('span'); n.className = 'tvb-pname'; n.textContent = it[1];
        meta.appendChild(n);
        row.appendChild(meta);
        if (it[2]) { var k = document.createElement('span'); k.className = 'tvb-pkey'; k.textContent = it[2]; row.appendChild(k); }
        row.addEventListener('click', function () {
          if (it[0] === 'new') { closePanel(); newTab(); }
          else if (it[0] === 'fullscreen') { closePanel(); toggleFullscreen(); }
          else renderPanel(it[0]);
        });
        ui.pbody.appendChild(row);
      });
      return;
    }

    if (kind === 'bookmarks' || kind === 'history') {
      var list = kind === 'bookmarks' ? (data.bookmarks || []) : (data.history || []).filter(function (h) { return String(h.url).indexOf('loaderror.html') < 0; });
      if (!list.length) ui.pbody.appendChild(emptyNode(kind === 'bookmarks' ? T('panel.noBookmarks') : T('panel.noHistory')));
      list.slice(0, 120).forEach(function (item) {
        var row = document.createElement('div'); row.className = 'tvb-prow';
        var open = mkBtn('tvb-popen');
        var meta = document.createElement('span'); meta.className = 'tvb-pmeta';
        var n = document.createElement('span'); n.className = 'tvb-pname'; n.textContent = item.title || item.url;
        meta.appendChild(n);
        var h = document.createElement('span'); h.className = 'tvb-phost'; h.textContent = item.url;
        meta.appendChild(h);
        open.appendChild(meta);
        open.addEventListener('click', function () { closePanel(); navigate(item.url); });
        var del = mkBtn('tvb-pdel'); del.innerHTML = ICONS.close;
        del.setAttribute('aria-label', T('panel.remove', { title: item.title || item.url }));
        del.addEventListener('click', function () {
          if (kind === 'bookmarks') svc('bookmarkToggle', { url: item.url, title: item.title }).then(function () { renderPanel('bookmarks'); });
          else svc('historyDelete', { id: item.id }).then(function () { renderPanel('history'); });
        });
        row.appendChild(open); row.appendChild(del);
        ui.pbody.appendChild(row);
      });
      if (kind === 'history' && list.length) {
        ui.pactions.hidden = false;
        var clear = mkBtn('', T('panel.clearHistory'));
        clear.addEventListener('click', function () {
          var snapshot = JSON.stringify(data.history || []);
          svc('historyClear', {}).then(function () {
            renderPanel('history');
            toast(T('panel.historyCleared'), T('toast.undo'), function () {
              try {
                var arr = JSON.parse(snapshot);
                svc('importState', { state: { history: arr } }).then(function () { renderPanel('history'); });
              } catch (e) {}
            });
          });
        });
        ui.pactions.appendChild(clear);
      }
      return;
    }

    if (kind === 'neterror') {
      var host = lastNetError ? lastNetError.host : T('err.unknown');
      var code = lastNetError ? lastNetError.code : '';
      var card = document.createElement('div'); card.className = 'tvb-neterror';
      var cl = document.createElement('div'); cl.className = 'tvb-ne-code';
      cl.appendChild(document.createElement('i'));
      var clt = document.createElement('span'); clt.textContent = 'ERR ' + (code || 'UNREACHABLE'); cl.appendChild(clt);
      card.appendChild(cl);
      var t1 = document.createElement('div'); t1.className = 'tvb-ne-title';
      t1.appendChild(document.createTextNode(T('err.cannot') + ' '));
      var em = document.createElement('em'); em.textContent = host; t1.appendChild(em);
      card.appendChild(t1);
      var t3 = document.createElement('div'); t3.className = 'tvb-ne-desc';
      t3.textContent = T('err.descUnknown');
      card.appendChild(t3);
      ui.pbody.appendChild(card);
      ui.pactions.hidden = false;
      var retry = mkBtn('', T('err.retry'));
      retry.addEventListener('click', function () { closePanel(); if (lastNetError) navigate(lastNetError.url); });
      var home = mkBtn('', T('err.home'));
      home.addEventListener('click', function () { closePanel(); goHome(); });
      var close = mkBtn('', T('chrome.close'));
      close.addEventListener('click', closePanel);
      ui.pactions.appendChild(retry); ui.pactions.appendChild(home); ui.pactions.appendChild(close);
      return;
    }

    if (kind === 'settings') {
      var r1 = document.createElement('div'); r1.className = 'tvb-set';
      var c1 = document.createElement('div');
      var l1 = document.createElement('label'); l1.textContent = T('settings.searchEngine'); c1.appendChild(l1);
      var h1 = document.createElement('span'); h1.className = 'tvb-hint'; h1.textContent = T('settings.searchHint'); c1.appendChild(h1);
      r1.appendChild(c1);
      var sel = document.createElement('select');
      Object.keys(CFG.searchEngines).forEach(function (k) {
        var o = document.createElement('option'); o.value = k; o.textContent = CFG.searchEngines[k].name;
        if ((data.settings.searchEngine || 'baidu') === k) o.selected = true;
        sel.appendChild(o);
      });
      sel.setAttribute('aria-label', T('settings.searchEngine'));
      sel.addEventListener('change', function () { svc('setSetting', { key: 'searchEngine', value: sel.value }); });
      r1.appendChild(sel); ui.pbody.appendChild(r1);

      var r2 = document.createElement('div'); r2.className = 'tvb-set';
      var c2 = document.createElement('div');
      var l2 = document.createElement('label'); l2.textContent = T('settings.restore'); c2.appendChild(l2);
      var h2 = document.createElement('span'); h2.className = 'tvb-hint'; h2.textContent = T('settings.restoreHint'); c2.appendChild(h2);
      r2.appendChild(c2);
      var tg = mkBtn('tvb-toggle' + (data.settings.restoreSession ? ' tvb-on' : ''));
      tg.setAttribute('role', 'switch');
      tg.setAttribute('aria-checked', data.settings.restoreSession ? 'true' : 'false');
      tg.setAttribute('aria-label', T('settings.restore'));
      tg.addEventListener('click', function () {
        var v = !data.settings.restoreSession;
        tg.classList.toggle('tvb-on', v);
        tg.setAttribute('aria-checked', v ? 'true' : 'false');
        svc('setSetting', { key: 'restoreSession', value: v });
      });
      r2.appendChild(tg); ui.pbody.appendChild(r2);

      var r3 = document.createElement('div'); r3.className = 'tvb-set';
      var c3 = document.createElement('div');
      var l3 = document.createElement('label'); l3.textContent = T('settings.zoom'); c3.appendChild(l3);
      var h3 = document.createElement('span'); h3.className = 'tvb-hint'; h3.textContent = T('settings.zoomHint'); c3.appendChild(h3);
      r3.appendChild(c3);
      var seg = document.createElement('div'); seg.className = 'tvb-seg';
      [['100%', 1], ['125%', 1.25], ['150%', 1.5]].forEach(function (p) {
        var cur = Number(data.settings.zoom) || 1;
        var b = mkBtn(Math.abs(cur - p[1]) < 0.01 ? 'tvb-on' : '', p[0]);
        b.addEventListener('click', function () {
          svc('setSetting', { key: 'zoom', value: p[1] }).then(function () { applyZoom(); renderPanel('settings'); });
        });
        seg.appendChild(b);
      });
      r3.appendChild(seg); ui.pbody.appendChild(r3);

      var rLang = document.createElement('div'); rLang.className = 'tvb-set';
      var cLang = document.createElement('div');
      var lLang = document.createElement('label'); lLang.textContent = T('settings.language'); cLang.appendChild(lLang);
      var hLang = document.createElement('span'); hLang.className = 'tvb-hint'; hLang.textContent = T('settings.languageHint'); cLang.appendChild(hLang);
      rLang.appendChild(cLang);
      var selL = document.createElement('select');
      (I18N.LOCALES || []).forEach(function (loc) {
        var o = document.createElement('option'); o.value = loc.id; o.textContent = loc.label;
        if ((data.settings.locale || 'auto') === loc.id) o.selected = true;
        selL.appendChild(o);
      });
      selL.setAttribute('aria-label', T('settings.language'));
      selL.addEventListener('change', function () { svc('setSetting', { key: 'locale', value: selL.value }).then(function () { applyLocale(); renderPanel('settings'); }); });
      rLang.appendChild(selL); ui.pbody.appendChild(rLang);
      return;
    }

    if (kind === 'help') {
      var wrap = document.createElement('div'); wrap.className = 'tvb-help';
      [['Ctrl L', T('help.focus')], ['Ctrl T', T('help.newTab')], ['Ctrl W', T('help.closeTab')], ['Ctrl Tab', T('help.switchTab')],
       ['Ctrl D', T('help.bookmark')], ['Ctrl H', T('help.history')], ['Alt ← / →', T('help.backForward')], ['F5', T('help.reload')],
       ['F11', T('help.fullscreen')], ['Esc', T('help.closePanel')]
      ].forEach(function (it) {
        var d = document.createElement('div');
        var s = document.createElement('span'); s.textContent = it[1]; d.appendChild(s);
        var k = document.createElement('kbd'); k.textContent = it[0]; d.appendChild(k);
        wrap.appendChild(d);
      });
      ui.pbody.appendChild(wrap);
      var note = document.createElement('div'); note.className = 'tvb-helpnote';
      note.textContent = T('help.note');
      ui.pbody.appendChild(note);
      return;
    }
  }
  function emptyNode(text) { var d = document.createElement('div'); d.className = 'tvb-pempty'; d.textContent = text; return d; }
  function openPanel(kind) {
    panelKind = kind;
    pauseNavInj();
    ui.panel.hidden = false;
    renderPanel(kind);
    var f = ui.panel.querySelector('.tvb-prow, .tvb-px');
    if (f) f.focus();
  }
  function closePanel() {
    panelKind = null;
    resumeNavInj();
    ui.panel.hidden = true;
    setTimeout(function () { try { var omni2 = ui.chrome.querySelector('.tvb-omni'); if (omni2 && omni2.focus) omni2.focus(); } catch (e) {} }, 300);
    /* Return input to the page, not to the menu button: leaving focus in the
       toolbar is what used to eat every arrow key afterwards. */
    try { if (shadow.activeElement) shadow.activeElement.blur(); } catch (e) { /* ignore */ }
    try { if (proxy) proxy.blur(); } catch (e) { /* ignore */ }
    var omni = ui.chrome.querySelector('.tvb-omni');
    if (omni) omni.classList.remove('tvb-focused');
  }

  /* D-pad support inside the injected chrome. Geometry is measured once and
     reused until the chrome actually changes shape; a panel list navigates in
     DOM order instead of by distance. */
  var focusCache = null;

  function invalidateFocus() { focusCache = null; }

  function buildFocusCache() {
    perf.focusScan++;
    var t0 = performance.now();
    var nodes = shadow.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled])');
    var items = [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.closest('[hidden]')) continue;
      var r = n.getBoundingClientRect();
      if (r.width <= 2 || r.height <= 2) continue;
      if (r.right <= 0 || r.left >= window.innerWidth) continue;
      if (r.bottom <= 0 || r.top >= window.innerHeight) continue;
      items.push({ node: n, x: r.left + r.width / 2, y: r.top + r.height / 2 });
    }
    focusCache = items;
    perf.focusMs += performance.now() - t0;
    return items;
  }

  function chromeFocusables() {
    var items = focusCache || buildFocusCache();
    var out = [];
    for (var i = 0; i < items.length; i++) out.push(items[i].node);
    return out;
  }

  var _lastDir = '', _lastX = 0;
  function chromeTrap(e) {
    var items = chromeFocusables();
    var idx = items.indexOf(shadow.activeElement);
    var next = e.shiftKey ? (idx <= 0 ? items.length - 1 : idx - 1) : (idx === items.length - 1 || idx < 0 ? 0 : idx + 1);
    if (items[next]) items[next].focus();
  }
  var KEY_BACK = 461;
  var ARROW_BY_CODE = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' };
  function dirFromKey(e) {
    if (e.key && /^Arrow(Up|Down|Left|Right)$/.test(e.key)) return e.key.replace('Arrow', '').toLowerCase();
    return ARROW_BY_CODE[e.keyCode] || ARROW_BY_CODE[e.which] || null;
  }
  function isBackKey(e) { return e.key === 'Back' || e.keyCode === KEY_BACK; }
  var _pausedInj = false;
  function pauseNavInj() { _pausedInj = true; }
  function resumeNavInj() { _pausedInj = false; }
  var _throttleInj = { last: 0 };
  function throttledKeyInj(e) { var now = performance.now(); if (now - _throttleInj.last < 16) return true; _throttleInj.last = now; return false; }
  var _findMarks = [], _findMap = [];
  function _findClear() { _findMarks.forEach(function (m) { try { m.replaceWith(document.createTextNode(m.textContent)); } catch (e) {} }); _findMarks = []; }
  function openFindBar() {
    var bar = document.getElementById('tvb-findbar');
    if (!bar) return;
    bar.style.display = 'flex';
    var inp = document.getElementById('tvb-find-input');
    if (inp) { inp.focus(); inp.select(); }
  }
  function _doFindPage(q) {
    _findClear();
    if (!q) return;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    var node, c = 0;
    while ((node = walker.nextNode()) && c < 100) {
      var idx = node.nodeValue.toLowerCase().indexOf(q.toLowerCase());
      if (idx < 0) continue;
      var frag = document.createDocumentFragment(); var last = 0;
      while (idx >= 0 && c < 100) {
        frag.appendChild(document.createTextNode(node.nodeValue.slice(last, idx)));
        var mark = document.createElement('mark'); mark.textContent = node.nodeValue.slice(idx, idx + q.length); mark.className = 'tvb-find-mark'; frag.appendChild(mark); _findMarks.push(mark); c++; last = idx + q.length; idx = node.nodeValue.toLowerCase().indexOf(q.toLowerCase(), last);
      }
      frag.appendChild(document.createTextNode(node.nodeValue.slice(last)));
      node.parentNode.replaceChild(frag, node);
    }
  }
  function closeFindBar() { _findClear(); var bar = document.getElementById('tvb-findbar'); if (bar) bar.style.display = 'none'; }
  function chromeMove(dir) {
    if (_pausedInj) return false;
    var items = focusCache || buildFocusCache();
    if (!items.length) return false;
    var cur = shadow.activeElement;
    var ci = -1;
    for (var i = 0; i < items.length; i++) { if (items[i].node === cur) { ci = i; break; } }
    if (ci < 0) { items[0].node.focus(); return true; }

    /* Panel lists are vertical: step through them in DOM order. */
    if ((dir === 'up' || dir === 'down') && ui.pbody.contains(cur)) {
      var rows = [];
      for (var k = 0; k < items.length; k++) { if (ui.pbody.contains(items[k].node)) rows.push(items[k]); }
      var ri = rows.indexOf(items[ci]);
      var next = rows[ri + (dir === 'down' ? 1 : -1)];
      if (next) { next.node.focus(); return true; }
      return false;
    }

    var c = items[ci];
    var cxUse = (dir === 'up' || dir === 'down') && _lastDir === dir ? _lastX : c.x;
    var best = -1, bestScore = Infinity;
    for (var j = 0; j < items.length; j++) {
      if (j === ci) continue;
      var it = items[j];
      var dx = it.x - cxUse, dy = it.y - c.y;
      var primary = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
      var secondary = (dir === 'up' || dir === 'down') ? Math.abs(dx) : Math.abs(dy);
      if (primary <= 6) continue;
      var MAIN_W = 5, ADJ_W = 5;
      var score = primary * MAIN_W + secondary * ADJ_W;
      if (score < bestScore) { bestScore = score; best = j; }
    }
    if (best < 0) return false;
    items[best].node.focus();
    if (dir === 'up' || dir === 'down') { _lastDir = dir; _lastX = cxUse; }
    return true;
  }

  // --- page inset / zoom ---------------------------------------------------
  function bodyReady() { return document.body || null; }
  function zoomValue() { return (data && data.settings ? Number(data.settings.zoom) : 1) || 1; }
  function applyInset() {
    var b = bodyReady();
    if (!b) return;
    if (origBodyPadding === null) origBodyPadding = b.style.paddingTop || '';
    if (origBodyZoom === null) origBodyZoom = b.style.zoom || '';
    if (fullscreen) { b.style.paddingTop = origBodyPadding; return; }
    var base = origBodyPadding && origBodyPadding !== '0px' ? origBodyPadding : '0px';
    b.style.paddingTop = 'calc(' + base + ' + ' + (CHROME_H / zoomValue()) + 'px)';
  }
  function applyZoom() {
    var b = bodyReady();
    if (!b) return;
    if (origBodyZoom === null) origBodyZoom = b.style.zoom || '';
    b.style.zoom = String(zoomValue());
    applyInset();
  }
  function toggleFullscreen() {
    fullscreen = !fullscreen;
    ui.chrome.classList.toggle('tvb-hidden', fullscreen);
    ui.fsExit.hidden = !fullscreen;
    applyInset();
    if (fullscreen) toast(T('toast.toolbarHide'));
  }

  // --- actions -------------------------------------------------------------
  function navigate(input) {
    var url = normalizeInput(input);
    if (!url) return;
    if (isHome(url)) { goHome(); return; }
    var host = hostOf(url) || url;
    toast(T('toast.connecting', { host: host }));
    svc('probeUrl', { url: url, timeoutMs: 2500 }).then(function (r) {
      if (r && r.returnValue === true && r.ok === false) {
        showNetError(url, r.error || 'unreachable');
        return;
      }
      var t = activeTab();
      if (t) svc('tabVisit', { id: t.id, url: url, title: '' });
      location.assign(url);
    });
  }
  function showNetError(url, code) {
    lastNetError = { url: url, host: hostOf(url) || url || T('err.unknown'), code: code || '' };
    openPanel('neterror');
  }
  function goHome() {
    var t = activeTab();
    if (t) svc('tabVisit', { id: t.id, url: 'about:home', title: T('tab.newTab') });
    location.href = homeUrl('home');
  }
  function newTab() {
    svc('tabOpen', { url: 'about:home', activate: true }).then(function (r) {
      var id = r && r.tab ? r.tab.id : (r && r.state ? r.state.activeTabId : '');
      location.href = homeUrl('tab=' + encodeURIComponent(id));
    });
  }
  function switchTab(id) {
    if (id === data.activeTabId) return;
    svc('tabActivate', { id: id }).then(function (r) {
      var t = r && r.tab ? r.tab : tabById(id);
      if (t && !isHome(t.url)) navigate(t.url);
      else location.href = homeUrl('tab=' + encodeURIComponent(id));
    });
  }
  function closeTab(id) {
    var was = data.activeTabId === id;
    svc('tabClose', { id: id }).then(function (r) {
      var t = r && r.state ? r.state.tabs.find(function (x) { return x.id === r.state.activeTabId; }) : activeTab();
      if (!was) { render(); return; }
      if (t && !isHome(t.url)) location.replace(t.url);
      else location.href = homeUrl('tab=' + encodeURIComponent(t ? t.id : ''));
    });
  }
  function cycleTab(delta) {
    var tabs = data.tabs || [];
    var idx = tabs.findIndex(function (t) { return t.id === data.activeTabId; });
    if (tabs.length < 2) return;
    switchTab(tabs[(idx + delta + tabs.length) % tabs.length].id);
  }
  function back() {
    var t = activeTab();
    if (!t || t.historyIndex <= 0) { if (window.webOS && typeof webOS.platformBack === 'function') { webOS.platformBack(); return; } location.href = homeUrl('home'); return; }
    svc('historyBack', { id: t.id }).then(function (r) {
      if (!r.returnValue) { toast(T('toast.noEarlier')); return; }
      if (isHome(r.url)) location.href = homeUrl('home');
      else navigate(r.url);
    });
  }
  function forward() {
    var t = activeTab();
    if (!t || t.historyIndex >= (t.history || []).length - 1) return;
    svc('historyForward', { id: t.id }).then(function (r) {
      if (!r.returnValue) { toast(T('toast.noLater')); return; }
      if (isHome(r.url)) location.href = homeUrl('home');
      else navigate(r.url);
    });
  }
  function bookmark() {
    if (!/^https?:/i.test(location.href)) { toast(T('toast.cannotBookmark')); return; }
    var t = activeTab();
    if (!t) return;
    svc('bookmarkToggle', { url: location.href, title: document.title || prettyUrl(location.href) }).then(function (r) {
      if (!r.returnValue) { toast(T('toast.bookmarkFailed')); return; }
      var has = data.bookmarks.some(function (b) { return b.url === location.href; });
      toast(has ? T('toast.bookmarkAdded') : T('toast.bookmarkRemoved'));
    });
  }
  function openInNewTab(url) {
    svc('tabOpen', { url: url, activate: true }).then(function () { location.assign(url); });
  }
  function changeZoom(delta, reset) {
    var cur = zoomValue();
    var next = reset ? 1 : Math.max(0.75, Math.min(1.5, Math.round((cur + delta) * 100) / 100));
    svc('setSetting', { key: 'zoom', value: next }).then(function () { applyZoom(); toast(T('toast.zoom', { pct: Math.round(next * 100) })); });
  }

  // --- lifecycle/sync ------------------------------------------------------
  function syncVisit(force) {
    if (!data) return;
    var t = activeTab();
    if (!t) return;
    var u = location.href;
    var title = document.title || prettyUrl(u);
    if (!force && u === lastUrl && title === lastTitle) return;
    lastUrl = u; lastTitle = title;
    if (suppressVisit) { suppressVisit = false; return; }
    var same = t.url === u;
    svc('tabVisit', { id: t.id, url: u, title: title, scrollY: same ? t.scrollY : 0 });
  }
  function restoreScroll() {
    if (!data) return;
    var t = activeTab();
    if (t && t.url === location.href && t.scrollY > 0) {
      setTimeout(function () { try { window.scrollTo(0, t.scrollY); } catch (e) { /* ignore */ } }, 380);
    }
  }
  function wire() {
    q('tvbNew').addEventListener('click', newTab);
    ui.back.addEventListener('click', back);
    ui.forward.addEventListener('click', forward);
    q('tvbReload').addEventListener('click', function () { location.reload(); });
    q('tvbHome').addEventListener('click', goHome);
    ui.star.addEventListener('click', bookmark);
    q('tvbMenu').addEventListener('click', function () { openPanel('menu'); });
    q('tvbPClose').addEventListener('click', closePanel);
    q('tvbOmni').addEventListener('submit', function (e) { e.preventDefault(); var v = (proxy ? proxy.value : ui.addr.value).trim(); if (v) { navigate(v); blurAddress(); } });
    ui.addr.addEventListener('mousedown', function (e) { e.preventDefault(); e.stopPropagation(); focusAddress(); });
    ui.addr.addEventListener('focus', function (e) { e.preventDefault(); focusAddress(); });
    ui.addr.addEventListener('keydown', function (e) { if (e.key === 'Escape') { ui.addr.blur(); e.preventDefault(); } });
    /* Wheel on the tab strip is handled by the chrome router in wire(). */
    /* A pointer click must not park focus in the toolbar. */
    ui.chrome.addEventListener('click', function (e) {
      if (!e.detail || panelKind) return;
      var b = e.target && e.target.closest ? e.target.closest('button') : null;
      if (!b) return;
      setTimeout(function () { try { b.blur(); } catch (err) { /* ignore */ } }, 0);
    });
    /* The address proxy is invisible; leaving it focused kills arrow scrolling. */
    document.addEventListener('mousedown', function () {
      if (proxy && document.activeElement === proxy) {
        try { proxy.blur(); } catch (err) { /* ignore */ }
        var omni = ui.chrome.querySelector('.tvb-omni');
        if (omni) omni.classList.remove('tvb-focused');
      }
    }, true);
    /* ── wheel ────────────────────────────────────────────────────────────
       WAM does not turn wheel input into scrolling, so it is done here. The
       routing is explicit rather than inferred from composedPath(): a closed
       shadow root hides its internals from outside listeners anyway.
         · inside the toolbar   → the shadow handler below decides the region
         · tab strip            → horizontal only
         · panel body           → its own scroll box only
         · anything else        → nearest scrollable ancestor, then the page   */
    var wheel = {
      node: null, max: 0, maxX: 0, at: 0,
      dy: 0, dx: 0, target: null, raf: 0,
      map: typeof WeakMap === 'function' ? new WeakMap() : null
    };

    function wheelDelta(e) {
      var dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;
      else if (e.deltaMode === 2) dy *= window.innerHeight;
      return dy;
    }
    function refreshMetrics(node) {
      wheel.node = node;
      wheel.max = node.scrollHeight - node.clientHeight;
      wheel.maxX = node.scrollWidth - node.clientWidth;
      wheel.at = performance.now();
    }
    function metricsOf(node) {
      if (wheel.node !== node || performance.now() - wheel.at > 500) refreshMetrics(node);
      return wheel;
    }
    function isYScrollable(node) {
      var cs;
      try { cs = getComputedStyle(node); } catch (e) { return false; }
      return /(auto|scroll|overlay)/.test(cs.overflowY) && node.scrollHeight > node.clientHeight + 1;
    }
    function nearestScroller(start) {
      if (!start || start.nodeType !== 1) return null;
      if (wheel.map) {
        var hit = wheel.map.get(start);
        if (hit !== undefined) return hit;
      }
      var n = start, found = null;
      while (n && n.nodeType === 1 && n !== document.documentElement) {
        if (isYScrollable(n)) { found = n; break; }
        n = n.parentElement;
      }
      if (wheel.map) wheel.map.set(start, found);
      return found;
    }
    function canMove(node, dy) {
      if (!dy) return true;
      var m = metricsOf(node);
      return dy > 0 ? node.scrollTop < m.max - 0.5 : node.scrollTop > 0.5;
    }
    function flushWheel() {
      wheel.raf = 0;
      var n = wheel.target, dy = wheel.dy, dx = wheel.dx;
      wheel.dy = 0; wheel.dx = 0;
      if (!n) return;
      if (dy) n.scrollTop += dy;
      if (dx) n.scrollLeft += dx;
      perf.wheelFrames++;
    }
    function queueScroll(node, dy, dx) {
      if (wheel.target && wheel.target !== node) flushWheel();
      wheel.target = node;
      wheel.dy += dy;
      wheel.dx += dx;
      if (!wheel.raf) wheel.raf = requestAnimationFrame(flushWheel);
    }
    function applyWheel(e, dy, dx, node) {
      /* Decide synchronously so preventDefault is legal, apply on the next
         frame so a burst of notches becomes one scroll write. */
      if (!canMove(node, dy)) { perf.wheelMiss++; return false; }
      e.preventDefault();
      queueScroll(node, dy, dx);
      return true;
    }
    function pageWheel(e) {
      if (e.ctrlKey || e.metaKey || e.defaultPrevented) return;
      var dy = wheelDelta(e), dx = e.deltaX || 0;
      if (!dy && !dx) return;
      var sc = nearestScroller(e.target);
      while (sc) {
        if (applyWheel(e, dy, dx, sc)) return;
        sc = sc.parentElement ? nearestScroller(sc.parentElement) : null;
      }
      var doc = document.scrollingElement || document.documentElement;
      if (doc.scrollHeight - doc.clientHeight > 1 || doc.scrollWidth - doc.clientWidth > 1) {
        applyWheel(e, dy, dx, doc);
      }
    }
    function invalidateWheel() {
      wheel.map = typeof WeakMap === 'function' ? new WeakMap() : null;
      wheel.node = null;
      wheel.at = 0;
    }
    window.__TVB_INVALIDATE_WHEEL__ = invalidateWheel;

    document.addEventListener('wheel', function (e) {
      perf.wheel++;
      var t0 = performance.now();
      try {
        /* Anything from inside the closed shadow is retargeted to the host and
           is handled by the chrome listener instead. */
        if (e.target === host || (host.contains && host.contains(e.target))) return;
        pageWheel(e);
      } finally {
        perf.wheelMs += performance.now() - t0;
      }
    }, { passive: false, capture: true });

    ui.chrome.addEventListener('wheel', function (e) {
      if (e.ctrlKey || e.metaKey) return;
      var t = e.target;
      var dy = wheelDelta(e), dx = e.deltaX || 0;
      if (!dy && !dx) return;
      /* The toolbar forwards to the page; pageWheel() does its own
         preventDefault, so it must run before the blanket one below. */
      if (t && t.closest && t.closest('.tvb-toolbar')) { pageWheel(e); return; }
      /* Every other part of the chrome owns the wheel: take the default
         action away first, then decide what to move. Without this, a strip or
         panel with nothing to scroll would let the wheel fall through and
         scroll the page. */
      e.preventDefault();
      if (t && t.closest && t.closest('.tvb-tabsbar')) {
        if (ui.tabs.scrollWidth > ui.tabs.clientWidth + 1) ui.tabs.scrollLeft += dy || dx;
        return;
      }
      if (t && t.closest && t.closest('.tvb-pbody')) {
        var body = ui.pbody;
        if (body.scrollHeight > body.clientHeight + 1) body.scrollTop += dy;
      }
    }, { passive: false });

    window.addEventListener('resize', function () { invalidateWheel(); invalidateFocus(); }, { passive: true });
    ui.fsExit.addEventListener('click', toggleFullscreen);
    var qh = shadow.getElementById('tvbQuickHome'); if (qh) qh.addEventListener('click', goHome);
    document.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); e.stopPropagation(); goHome(); } }, true);
    document.addEventListener('keydown', function (e) {
      var ctrl = e.ctrlKey || e.metaKey;
      var _dir2 = dirFromKey(e);
      if (!ctrl && !e.altKey && _dir2 && throttledKeyInj(e)) { e.preventDefault(); e.stopPropagation(); return; }
      if (!ctrl && !e.altKey && _dir2) {
        var dir = _dir2;
        /* Only consume an arrow when it actually moves focus inside the
           toolbar. Otherwise hand the key straight back to the page — a
           focused toolbar button must never make the page unscrollable. */
        if (shadow.activeElement) {
          if (chromeMove(dir)) { e.preventDefault(); e.stopPropagation(); return; }
          try { shadow.activeElement.blur(); } catch (err) { /* ignore */ }
          return;
        }
      }
      if (ctrl && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); e.stopPropagation(); focusAddress(); return; }
      if (ctrl && (e.key === 't' || e.key === 'T')) { e.preventDefault(); e.stopPropagation(); newTab(); return; }
      if (ctrl && (e.key === 'w' || e.key === 'W')) { e.preventDefault(); e.stopPropagation(); if (data.activeTabId) closeTab(data.activeTabId); return; }
      if (ctrl && e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); cycleTab(e.shiftKey ? -1 : 1); return; }
      if (e.key === 'Tab' && !ctrl && !e.altKey && panelKind) { e.preventDefault(); e.stopPropagation(); chromeTrap(e); return; }
      if (ctrl && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); e.stopPropagation(); bookmark(); return; }
      if (ctrl && (e.key === 'h' || e.key === 'H')) { e.preventDefault(); e.stopPropagation(); openPanel('history'); return; }
      if (ctrl && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); e.stopPropagation(); openFindBar(); return; }
      if (e.key === 'F5' || (ctrl && (e.key === 'r' || e.key === 'R'))) { e.preventDefault(); e.stopPropagation(); location.reload(); return; }
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); back(); return; }
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); forward(); return; }
      if (e.key === 'F11') { e.preventDefault(); e.stopPropagation(); toggleFullscreen(); return; }
      if (e.key === 'Escape') {
        if (panelKind) { closePanel(); e.preventDefault(); e.stopPropagation(); return; }
        if (fullscreen) { toggleFullscreen(); e.preventDefault(); e.stopPropagation(); return; }
        if (shadow.activeElement) {
          try { shadow.activeElement.blur(); } catch (err) { /* ignore */ }
          e.preventDefault(); e.stopPropagation(); return;
        }
        return;
      }
      /* Back on keyup only (skill §7) */
      /* Back handled on keyup only (skill §7); keydown was duplicating it */
      if (isBackKey(e)) {
        var tag2b = (e.target && e.target.tagName) || '';
        if (tag2b === 'INPUT' || tag2b === 'TEXTAREA') { try { e.target.blur(); } catch (err2) {} if (proxy && proxy !== e.target) try { proxy.blur(); } catch (err2) {} e.preventDefault(); e.stopPropagation(); return; }
        if (panelKind) { closePanel(); e.preventDefault(); e.stopPropagation(); return; }
        if (fullscreen) { toggleFullscreen(); e.preventDefault(); e.stopPropagation(); return; }
        if (window.webOS && typeof webOS.platformBack === 'function' && isHome((activeTab() || {}).url || 'about:home')) { webOS.platformBack(); }
        else back();
        e.preventDefault(); e.stopPropagation(); return;
      }
            if (ctrl && (e.key === '+' || e.key === '=')) { e.preventDefault(); e.stopPropagation(); changeZoom(0.1); return; }
      if (ctrl && e.key === '-') { e.preventDefault(); e.stopPropagation(); changeZoom(-0.1); return; }
      if (ctrl && e.key === '0') { e.preventDefault(); e.stopPropagation(); changeZoom(0, true); return; }
    }, true);
    document.addEventListener('keyup', function (e) {
      if (!isBackKey(e)) return;
      var tag2 = (e.target && e.target.tagName) || '';
      if (tag2 === 'INPUT' || tag2 === 'TEXTAREA') { try { e.target.blur(); } catch (err) {} if (proxy && proxy !== e.target) try { proxy.blur(); } catch (err) {} e.preventDefault(); e.stopPropagation(); return; }
      if (panelKind) { closePanel(); e.preventDefault(); e.stopPropagation(); return; }
      if (window.webOS && typeof webOS.platformBack === 'function' && isHome((activeTab() || {}).url || 'about:home')) { webOS.platformBack(); } else back();
      e.preventDefault(); e.stopPropagation();
    }, true);
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a || e.defaultPrevented) return;
      if (a.target === '_blank' || e.ctrlKey || e.metaKey) {
        var href = a.href;
        if (!/^https?:/i.test(href)) return;
        e.preventDefault(); e.stopPropagation();
        openInNewTab(href);
      }
    }, true);
    document.addEventListener('auxclick', function (e) {
      if (e.button !== 1) return;
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      if (!/^https?:/i.test(a.href)) return;
      e.preventDefault(); e.stopPropagation(); openInNewTab(a.href);
    }, true);
    window.addEventListener('scroll', function () {
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(function () {
        var t = activeTab();
        if (t && online) svc('tabUpdate', { id: t.id, scrollY: window.scrollY });
      }, 800);
    }, { passive: true });
    ['pageshow', 'popstate', 'hashchange', 'load'].forEach(function (ev) {
      window.addEventListener(ev, function () { applyInset(); applyZoom(); setTimeout(function () { syncVisit(true); }, 120); }, true);
    });
    document.addEventListener('DOMContentLoaded', function () { applyInset(); applyZoom(); restoreScroll(); syncVisit(true); }, true);
    pollTimer = setInterval(function () {
      if (document.visibilityState === 'hidden') return;
      syncVisit(false);
    }, 900);
    var mo = new MutationObserver(function () {
      if (!host.isConnected) { try { document.documentElement.appendChild(host); } catch (e) {} }
      if (proxy && !proxy.isConnected) { try { document.documentElement.appendChild(proxy); } catch (e) {} }
    });
    mo.observe(document.documentElement, { childList: true });
  }

  function attach() {
    if (!document.documentElement) { setTimeout(attach, 60); return; }
    try { document.documentElement.appendChild(host); } catch (e) { setTimeout(attach, 200); return; }
    window.__TVB_CHROME__ = {
      version: '0.1.0', href: location.href, perf: perf,
      diag: function () { return { online: online, tabs: data ? (data.tabs || []).length : 0, scrollY: Math.round(window.scrollY), docMax: (document.scrollingElement || document.documentElement).scrollHeight - (document.scrollingElement || document.documentElement).clientHeight }; }
    };
    wire();
    data = loadFallback() || normalizeState({});
    applyLocale();
    render();
    applyInset();
    applyZoom();
    callService('getState', {}).then(function (r) {
      if (r && r.state) {
        data = normalizeState(r.state);
        online = true;
        if (r.state.settings) applyLocale();
      }
    }).catch(function () { online = false; }).then(function () {
      var t = activeTab();
      if (!t) return;
      var current = location.href;
      if (current !== t.url || isHome(t.url)) {
        return svc('tabVisit', { id: t.id, url: current, title: document.title || prettyUrl(current), scrollY: 0 });
      }
    }).then(function () {
      lastUrl = location.href; lastTitle = document.title;
      render(); applyInset(); applyZoom(); restoreScroll();
    });
  }
  attach();
})();
