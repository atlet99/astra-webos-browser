# ASTRA Browser — LG G5 on-device acceptance report

- Date: 2026-10-30
- Device: LG OLED55G5PCA, webOS 25 / 10.3.0, Chromium 120.0.6099.270, root SSH
- App: `com.personal.tvwebbrowser` v0.1.0
- IPK: `build/com.personal.tvwebbrowser_0.1.0_all.ipk`
- Constraints: system partition, system browser, compositor, TVBox, and JVM were not modified

## 0. Performance fix round (evening of 2026-10-30)

This round made four changes targeting jank: wheel hot path, scroll sync, incremental rendering, and navigation precheck. Per-item conclusions and measurements are in [PERFORMANCE_AUDIT.md](PERFORMANCE_AUDIT.md). Key on-device data:

| Metric | Before fix | After fix |
| --- | --- | --- |
| Tab bar rebuilds during scrolling | 1 | 0 |
| `tabUpdate` response size (on-device LS2) | full state (getState 21900 B) | 93 B |
| Per-wheel-event processing time (on-device) | not measured | 0.44–0.57 ms |
| Second probe of same host | 0.34 s | 0.02 s (cache hit) |
| Home page 6 entries | some stuck at "Checking..." | 6/6 reachable |

New regression tools: `tools/bench.mjs`, `tools/wheelroute.mjs`, `tools/tvbench.mjs`.

## 1. Installation and launch

| Item | Result | Evidence |
| --- | --- | --- |
| IPK installation | Pass | `appInstallService/dev/install` returned `installed`; app/service directories exist |
| Home screen registration | Pass | `getAppInfo` returned `title: ASTRA Browser`, `icon/largeIcon`, `visible:true` |
| Launch | Pass | `applicationManager/launch` returned true; foreground is `com.personal.tvwebbrowser` |
| Start page | Pass | `http://127.0.0.1:7792/home`, 1 tab, 6 shortcut entries, state service connected |
| App icon | Packaged/registered | [icon.png](app/icon.png), [largeIcon.png](app/largeIcon.png); home screen icon was not separately photographed |

After final installation, cold boot to loopback start page, service status was:

```json
{"returnValue":true,"service":"com.personal.tvwebbrowser.service","port":7792,"tabs":1}
```

## 2. Functional measurements

| Feature | Result | Measurement/evidence |
| --- | --- | --- |
| Address bar input (app page) | Pass | Mouse click → `Input.insertText` → `rawKeyDown Enter`, navigated to `https://cn.bing.com/` ([input-typed.png](results/input-typed.png)) |
| Address bar input (external page) | Pass | Light DOM keyboard proxy: click toolbar → active element `tvb-keyboard-proxy` → enter `https://www.baidu.com/s?wd=webos` → Enter succeeded |
| Mouse click | Pass | Real CDP mousePressed/Released clicks on Baidu shortcut entry, loaded `https://www.baidu.com/` ([interaction-baidu.png](results/interaction-baidu.png)) |
| Mouse wheel | **Not auto-verified** | WAM CDP does not implement `Input.dispatchMouseWheel`; mouseWheel injection via `Input.dispatchMouseEvent` times out. `window.scrollTo` inside the page can scroll; please manually confirm a real Bluetooth mouse wheel per the checklist |
| Bluetooth keyboard | **Logic passed, hardware pending manual check** | Light DOM proxy + CDP keyboard events can type/press Enter; no physical key presses were made by the proxy. Please confirm manually once |
| Top-level page load | Pass | Baidu, Bing, example.com all loaded successfully (not iframe, no X-Frame-Options allowlist) |
| Real Baidu pages | Pass | Home page, `/s?wd=webos` search page; JS rendering normal ([accept-baidu.png](results/accept-baidu.png)) |
| Real Bing pages | Pass | `https://cn.bing.com/` home page, title "Search - Microsoft Bing" |
| JS / DOM / styles | Pass | Baidu dynamic home and search pages render normally; injected toolbar coexists with pages |
| Link navigation | Pass | Shortcut entries and in-page links use top-level navigation; injected script rebuilds with new documents |
| Back | Partially passed | Service history index went from 2 back to 1, page finally returned to `https://www.baidu.com/`; the automated wait assertion once misjudged as failed due to navigation commit timing, retest recommended |
| Forward | Not separately tested | Uses the same `historyForward` path; logic is implemented |
| Refresh / home | Home passed; refresh not separately recorded | Home returns via `http://127.0.0.1:7792/home`; refresh calls page reload |
| New tab (Ctrl+T) | Pass | `acceptance-ui.json`: `newTabIsStartPage:true`; service creates a new tab and opens `/home#tab=...` |
| Tab switching | Pass | `acceptance-ui.json`: `tabCycleBackToBaidu:true` |
| Close tab (Ctrl+W) | Pass (script-level) | After closing the new tab in proxy/interaction tests, returned to `https://cn.bing.com/` |
| Bookmarks | Pass | Ctrl+D writes/removes service bookmarks; `acceptance-ui.json`/state queries show `https://www.baidu.com/` |
| History | Pass | Service `/state` records URL/time in visit order; WAM loaderror filtered |
| Session restore | Pass | Was on Baidu page before closing the app; after reopening, Baidu was restored and toolbar re-injected ([interaction-restored.png](results/interaction-restored.png)) |
| Zoom | Pass | After Ctrl++, `document.body.style.zoom = 1.1`, screenshot [proxy-zoom.png](results/proxy-zoom.png) |
| Fullscreen / hide toolbar | Pass | App page F11: `body.fullscreen=true`, `#chrome display:none`; press F11 again to restore; on external pages F11 also restores page top padding |
| Network failure handling | Pass | Clicking Wikipedia: stays on start page, shows "Unable to access this site / DNS poisoning, regional restrictions..." error panel ([accept-blocked.png](results/accept-blocked.png)) |
| Closing browser does not affect other apps | Pass | After `Page.close`, browser target disappears, TVBox target still exists (`interaction.json`: `tvboxTargetAlive:true`) |

## 3. Real sites and network limitations

Currently reachable on the TV network:

- `https://www.baidu.com/` — success
- `https://www.bing.com/` / `https://cn.bing.com/` — success
- `https://example.com/` — success

Currently unreachable on the TV network (not a browser code error):

| Site | TV test | Notes |
| --- | --- | --- |
| Google | `wget` timeout | System DNS returns poisoned addresses (e.g. `69.171.235.22`), TCP/TLS unreachable |
| Wikipedia | `wget` timeout | System DNS returns poisoned addresses (e.g. `31.13.88.26`), addresses returned by AliDNS are also blocked over TCP |
| GitHub | `wget` timeout | DNS is correct (`20.205.243.166`) but TCP/TLS times out |

The app has a built-in `probeUrl` (IPv4 + TLS handshake + certificate hostname verification):
unreachable sites show an in-app error page on the start page, instead of navigating WAM to internal `loaderror.html` and hanging/losing the toolbar.

**Alternative**: after configuring a working VPN/proxy on the TV or router, visit directly in the address bar; the app itself does not depend on Android WebView and is not subject to site iframe restrictions.

## 4. Resource usage

One sample of a Baidu page + injected toolbar (`interaction.json`):

| Process | RSS |
| --- | --- |
| WAM browser main process | ~77 MB (system-resident) |
| TVBox renderer (for comparison, unaffected) | ~61 MB |
| ASTRA Browser renderer | ~74.7 MB |
| `com.personal.tvwebbrowser.service` | ~23.0 MB |

- `MemAvailable`: ~**450 MB** while browsing; ~**533 MB** after closing the browser
- No second Chromium kernel started; no extra browser process
- ~83 MB freed after closing (while renderer + service still resident)
- TV loadavg long-term ~17–21 (system background/other research effects), so load was not used as an app performance conclusion

## 5. Stability and known issues

- After two aggressive probes (“native system browser ELF launch” and “CDP screenshot after F11”), the TV rebooted once; final IPK install, cold boot, Baidu access, toolbar, and keyboard proxy all worked normally. The reboot cause could not be isolated to the app itself (the app only manipulates DOM/shadow DOM and does not modify the compositor/system), but it is recorded; long-term manual retesting is recommended.
- CDP `Page.captureScreenshot` once hung in F11/fullscreen state; normal page screenshots worked. The production UI does not depend on screenshots.
- After a device reboot (not an app restart), the service's `/tmp` state is lost; the start page's localStorage backup is used for recovery on next launch. Full tab restoration across reboots still needs one manual confirmation.
- Tabs use an on-demand suspension model: switching tabs reloads the URL but preserves server-side per-tab history and scroll positions. This is a tradeoff under 2 GB memory, not multi-renderer live tabs.
- The address bar in closed shadow does not directly receive WAM keyboard/IME focus, already solved with a light DOM proxy; a physical Bluetooth keyboard still needs one manual press.
- Strict CSP sites may restrict loopback HTTP; state sync prefers LS2, and core navigation does not depend on that HTTP request.

## 6. Browser kernel route investigation conclusion

1. **WAM / Chromium 120 is reusable**: All webOS web apps share the same WAM browser process; top-level external pages, JS, DOM, cookies, and login state all work normally. A new app only adds one renderer.
2. **System Browser App**: Located at `/mnt/otncabi/usr/palm/applications/com.webos.app.browser`, `appinfo.type=native_builtin`, **not registered in the app manager** (`getAppInfo`/`launch` fail). Directly executing its `chrome` ELF launches the LG Crow system browser, but it cannot serve as a custom UI; this app does not use it.
3. **`webOSSystem.createWebView` / WebView Plus**: The API exists, but calls from ordinary `default` apps are invalid; `netcast` apps have no `webOSSystem`; `com.webos.app.webviewplus` is a reserved system ID; the popup allowlist is managed by emmcd. Therefore you cannot rely on a hidden subwebview for multi-tab.
4. **iframe / subWebview**: Plain iframes are restricted by X-Frame-Options/CSP; `subWebviewUserScript.js` does not inject into plain iframes; `window.open` navigates at top level in WAM. Top-level pages + injected chrome are required.
5. **file:// restriction**: External pages cannot navigate directly back to the app's `file://index.html`; using loopback `/home` instead makes Home/new tab/error recovery work.
6. **CDP**: `/json`, Runtime.evaluate, Page.navigate, Page.captureScreenshot work; `Target.createTarget`, `/json/new`, `Input.dispatchMouseWheel` do not. CDP is only for development/acceptance, not a production interface.
7. **Conclusion**: Under 2 GB, with no Android WebView and no available trusted webview host, **WAM top-level pages + injected browser chrome + local state service + on-demand suspended tabs** is the most stable and memory-efficient architecture in measurements.

## 7. Evidence files

- [acceptance-ui.json](results/acceptance-ui.json) — start page, blocked, Baidu, tab switching
- [interaction.json](results/interaction.json) — mouse, chrome, session restore, close, memory
- [final-check.json](results/final-check.json) — F11, mouse Baidu, keyboard proxy, tabs
- [proxy.json](results/proxy.json) — address bar/zoom/tab partial records
- Screenshots: [accept-start.png](results/accept-start.png), [accept-blocked.png](results/accept-blocked.png), [accept-baidu.png](results/accept-baidu.png), [accept-newtab.png](results/accept-newtab.png), [interaction-restored.png](results/interaction-restored.png), [proxy-zoom.png](results/proxy-zoom.png)

## 8. Manual acceptance checklist (please run once)

1. Click **ASTRA Browser** on the home screen; confirm icon/start page.
2. Click the Baidu shortcut entry with a Bluetooth mouse; confirm the toolbar is still there.
3. Click the address bar; type `https://www.baidu.com/s?wd=webos` with a Bluetooth keyboard + Enter.
4. Scroll with the mouse wheel, click links, back/forward/refresh/home.
5. Ctrl+T / switch tabs / Ctrl+W; Ctrl+D bookmark; Ctrl+H history.
6. F11 fullscreen restore; Ctrl++/Ctrl+- zoom.
7. Close the browser; confirm TVBox/live streaming works normally.
8. If a VPN/proxy is available, test Google/Wikipedia/GitHub again and record results.
