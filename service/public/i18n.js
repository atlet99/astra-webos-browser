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
