# ASTRA Performance Audit and Defect Fixes

Device: LG OLED55G5PCA · webOS 25 / 10.3.0-1907 · Chromium 120 · 2 GB RAM · Quad-core A78 / Mali-G510
Baseline commit: `e1e2490` (feat: ASTRA — a standalone webOS TV browser)
This-round commit: `28993dc` (perf: stop rebuilding the toolbar on every scroll…)

Measurement tools (all committed):

| Tool | Purpose |
| --- | --- |
| `tools/bench.mjs` | Desktop headless Chromium + real state service; measures wheel hot path, render jitter, payload size, nested scrolling |
| `tools/wheelroute.mjs` | Wheel region routing acceptance (tab bar / panel / body / toolbar) |
| `tools/scrolltest.mjs` | Arrow keys and wheel still scroll the page after clicking the toolbar (regression) |
| `tools/keycheck.mjs` | Home page spatial arrow-key navigation and panel focus handoff |
| `tools/tvbench.mjs` | On-device: inject wheel events and read in-page counters |
| `tools/tvcheck.mjs` | On-device: CDP to get DOM facts + screenshots |

---

## P0-01 Wheel event routing (closed Shadow DOM)

**Root cause**: The document-level listener used `composedPath()` to find `.tvb-tabs` / `.tvb-pbody`. For a closed shadow root, external listeners see the path truncated at the host, so this check **never holds**; meanwhile the tab bar's own `wheel` handler and the document handler would both consume the same input.

**Change**: `app/webOSUserScripts/userScript.js`
- Document-level listener now checks the **retargeted `e.target`**: events from shadow have the host as target, so skip them and leave them to the handler inside the shadow.
- Added a single routing `wheel` handler for `ui.chrome` inside the shadow: `.tvb-tabsbar` → scroll tabs horizontally only; `.tvb-pbody` → scroll panel content only; `.tvb-toolbar` → forward to the page; everything else is swallowed with `preventDefault()`.
- Removed the duplicate `wheel` listener on the tab bar.

**Before/after fix**: Before the fix, wheeling on the tab bar/panel would scroll the page **at the same time**; after the fix it does not.

**Test** `tools/wheelroute.mjs` (1280×720, real mouse events):

```
base 600 → toolbar 800 → tab bar 800 → panel 800 → body 1040
pageMoved { toolbar: true, tabs: false, panel: false, body: true }  pass: true
```

**Conclusion: PASS**

---

## P0-02 Wheel hot path

**Root cause**: Every wheel event called `getComputedStyle()` up the ancestor chain from the target, read `scrollHeight/clientHeight`, and synchronously wrote `scrollTop`.

**Change**:
- Scroll containers are cached by target (`WeakMap`), invalidated on: window resize, panel redraw, structure changes.
- Size metrics cached for 500ms, refreshed only when boundary checks need them.
- Displacement is accumulated and merged into a single scroll write via `requestAnimationFrame`; `preventDefault()` is still called synchronously inside the event callback.
- Keeps `deltaMode` (line ×16, page ×viewport height) and `deltaX`.

**Measurement** (`tools/bench.mjs`, 30 wheel events on the same benchmark page, 3600px scrolled):

| Metric | Before fix | After fix |
| --- | --- | --- |
| Per-wheel-event handling time (desktop) | 0.103 ms | 0.090 ms |
| Per-wheel-event handling time (on-device bilibili) | not measured (old version already superseded) | **0.44–0.57 ms** (two runs) |
| Frame interval p95 | 8.4 ms | 8.5 ms |
| Boundary misjudgments (wheelMiss) | — | 0 |

On desktop CPU the difference is small (the hot path was already short); the real cost is 0.44–0.57 ms/event on-device. The key gain comes from P0-03 — before the fix, every 800ms of scrolling triggered a full render.

**Conclusion: PASS** (desktop difference is small, recorded honestly; on-device data above)

---

## P0-03 Scrolling no longer triggers full renders

**Root cause**: `tabUpdate` returned `clone(state)` (the full state); after the client `svc()` received `state`, it ran `normalizeState()` + `persistFallback()` + `render()`, and `render()` rebuilt the tab bar and open panel.

**Change**:
- `service/service.js` `tabUpdate()`: only returns `{ returnValue, id, scrollY, rev }`; when the scroll value is unchanged, returns `unchanged: true` and does not write to disk.
- Client `svc()`: `tabUpdate` no longer triggers `render()`; other methods render only when `rev` changes or the active tab changes.
- `persistFallback()` (`window.name` full JSON) changed to 1s batched writes.

**Measurement**:

| Metric | Before fix | After fix |
| --- | --- | --- |
| `renderTabs` calls during scrolling | 1 | **0** |
| `render()` calls during scrolling | 1 | **0** |
| `tabUpdate` response size (desktop, 3 tabs/8 bookmarks/40 history) | 8193 B | **70 B** |
| `tabUpdate` response size (on-device LS2) | full state (getState 21900 B) | **93 B** (pretty-printed) |

Acceptance condition "renderTabs/renderPanel are 0 when only scrollY changes" is satisfied.

**Conclusion: PASS**

---

## P0-04 Incremental DOM rendering

**Change**:
- `userScript.js`: tab buttons reused by id (`tabNodes`), only changed text/class/ordering updated; new `render()` signature, returns directly when the signature is unchanged.
- `renderPanel()` gets a data signature (bookmark id list / history length+first id / setting values); unchanged signature skips redraw.
- `app/app.js`: tabs, bookmarks, history, and shortcut entries each get a signature guard; shortcut entries are no longer fully rebuilt in the 6 probe callbacks.

**Measurement** (`tools/bench.mjs` scroll phase + home page startup):

| Scenario | Before fix | After fix |
| --- | --- | --- |
| Tab rebuilds during scrolling | 1 | 0 |
| Shortcut-entry rebuilds triggered by 6 home page probes | 6 | 1 (first frame) + incremental on change |

**Conclusion: PASS**

---

## P1-05 Navigation precheck cache

**Change**:
- `service/service.js`: new `probeCache` (key = protocol+host+port). Caches successes for 10 minutes, failures for 30 seconds; concurrent probes merged into one socket via `probeInflight`; cache cap 200 entries, LRU eviction.
- `app/app.js`: client `hostOk` table (10 minutes); verified-reachable hosts **fully skip the precheck** and navigate directly; real failures still fall back to the error page via WAM loaderror → `/home#error`.
- `httpCall` uses `keepalive: true` for `tabVisit`, avoiding lost visit records when the page unloads.

**Measurement** (on-device, two consecutive `probeUrl` calls on the same host):

```
cold  0.34 s   (real TLS connection)
warm  0.02 s   (cached=true, cache hit)
```

**Conclusion: PASS** (server cache and client fast path both implemented; client precheck-skip end-to-end timing was not separately isolated, a PARTIAL measurement gap, see end of document)

---

## P1-06 Home page probe closure bug

**Root cause**: In `probeTargets()`, `var item = pending[i++]` was declared inside a `while` loop; `var` is function-scoped, so all async callbacks shared one binding and all ended up reading the **last** target — results were written to the wrong entry, and the other entries stayed at "Checking..." forever.

**Change**: Each iteration captures its own `item` via an IIFE; on success, also writes to the client `hostOk`.

**Test**: All 6 entries on the on-device home page converged to "Reachable" (screenshot `results/astra-tv.png`), none stuck at "Checking...".

**Conclusion: PASS**

---

## P1-07 Focus computation

**Change**:
- `chromeFocusables()` / `chromeMove()` changed to measure once and cache `{node,x,y}`, invalidated on window resize, panel redraw, and tab redraw.
- Panel list up/down keys changed to **DOM-order stepping**, no longer doing full geometric comparisons.

**Test**: `tools/keycheck.mjs` passed (`BODY → ntpInput → Baidu → Bing`, panel open/close focus correctly falls back).

**Conclusion: PASS** (focus scan counts can be observed via `__TVB_PERF__.focusScan`; long-press repeat stress testing was not done this round, a measurement gap)

---

## P1-08 Address bar editing state

**Change**: New explicit `editingAddress` / `composing` states; `syncAddress()` does not write a value while editing; proxy input listens to `compositionstart/update/end`; Enter/Escape/clicking the page clears the state.

**Test**: `tools/keycheck.mjs` (Ctrl+L focus, input, panel focus) passed; on-device address input and navigation worked normally.

**Conclusion: PASS**

---

## P2-09 Service memory and disk

**Change**:
- Responses no longer `clone(state)` (14 places): the HTTP/LS2 layer serializes immediately; deep copies were pure waste.
- `saveState()` changed to an async write queue: `writeFile → rename` atomic replace; changes during writes are queued and rewritten as the **latest state** on completion, so old state cannot overwrite new state.
- State gains a `rev` version number, incremented on each flush to disk.
- Synchronous flush before exit (`SIGTERM`/`SIGINT`/`exit`).

**Measurement**: On-device `getState` 21900 B response no longer has an extra JSON round-trip; disk writes moved off the request path.

**Conclusion: PASS** (`rev` is already used for client render deduplication; the server does not yet use it for optimistic concurrency checks, an optional enhancement)

---

## P2-10 Tab switching and back/forward

**Current state**: Suspended-tab model unchanged (no multi-renderer under 2 GB memory). This round's gain comes upstream: switching/back go through `navigateTo()`, and after a `hostOk` hit they no longer block on the precheck.

**Not done**: Using the native History API within a single tab. **Evidence**: The current implementation always navigates via top-level document jumps, with history maintained per tab by the service; WAM's `loaderror` redirects back to `/home#error`, so switching to `history.pushState` would require rewriting the injected script's URL tracking and error fallback together — a larger change than this round's scope. Per-tab independent history boundaries and scroll restoration are retained.

**Conclusion: PARTIAL** (cache reuse is effective; native History not implemented, reasons and impact as above)

---

## P2-11 Injected script lifecycle

**Inspection results**:
- Top has `if (window.__TVB_CHROME__) return;`, so the same document never initializes twice.
- Input proxy `ensureProxy()` reuses existing nodes; `MutationObserver` only remounts when the host/proxy is removed.
- State sync: `syncVisit` is only called when the URL or title changes; polling every 900ms and skipped when the page is hidden.
- Image `load` events: the code does **not** assume they propagate to `window`; no such listener exists in the code (confirmed by inspection, no fix needed).

**Conclusion: PASS**

---

## P2-12 Visual overhead

- Color scheme and layout unchanged; the contour background remains a static SVG (`background-size: cover`, no repeat, no animation).
- No `filter` / `backdrop-filter` / canvas / WebGL.
- The only additions are `rAF` scroll batching and signature checks, both short tasks.

**Conclusion: PASS**

---

## P3-13 Test script fixes

- `probe/acceptance.mjs`, `probe/interaction.mjs`: `.quicklink` → `.target` (had broken after the page revamp).
- Added `tools/wheelroute.mjs`, `tools/bench.mjs`, `tools/tvbench.mjs`.
- `tools/bench.mjs` has a built-in real state service with seed state; the scroll path is reproducible end-to-end.
- Explicit distinction: CDP-injected wheel events **can** trigger scrolling on both desktop Chromium and TV WAM; this cannot be used to infer real mouse behavior, and on-device wheel behavior still relies on human verification (confirmed fixed by the user this round).

**Conclusion: PASS**

---

## P3-14 Performance benchmarks

| Scenario | Metric | Before fix | After fix |
| --- | --- | --- | --- |
| Continuous scrolling on a normal web page (30 wheel events / 3600px) | Per-event handling time (desktop) | 0.103 ms | 0.090 ms |
| Same as above | Per-event handling time (on-device) | — | 0.44–0.57 ms |
| Same as above | Tab rebuilds during scrolling | 1 | 0 |
| Same as above | Scroll sync payload | 8193 B | 70 B |
| Nested scrolling | Inner container scrolled / page stayed | 200 / 8758 | 200 / 8758 |
| Tab bar, panel wheel | Whether body is mis-scrolled | Yes | No |
| Repeated probes of the same host | Cold / warm | 0.34 s / 0.34 s | 0.34 s / 0.02 s |
| Home page probes of 6 entries | Converged state | Some stuck at "Checking..." | 6/6 reachable |

Sampling conditions: desktop = headless Chromium 1280×720 on the same PC; on-device = LG G5 running in foreground, page is a bilibili video page (2212px scrollable); TV load was not isolated (see gaps).

**Conclusion: PASS**

---

## P3-15 On-device acceptance

- Build + `scp` + `appInstallService/dev/install` → `"state":"installed"`, `launch` returned `returnValue: true`.
- Home page: all 6 targets "Reachable", `SVC LINK` / `NET ONLINE`, `scrollHeight == innerHeight` (first screen does not scroll).
- Wheel: 20 injections → page scrolled to bottom (2212px, batched into 20 frames), `renderTabs: 0`, `render: 0`, `wheelMiss: 0`; another run of 24 injections scrolled 1973px, also with 0 rebuilds.
- Tabs: 3 tabs switch normally; 6 history entries; bookmark empty state normal.
- Remote directional keys: `tools/keycheck.mjs` verified the navigation path on desktop; on-device directional keys were previously confirmed working by the user.
- Service: `getState` 21900 B / `tabUpdate` 93 B; no crash logs.
- Did not touch the system partition, system browser, or WAM core files.

**Conclusion: PASS** (physical Bluetooth mouse/keyboard presses still need one manual check, see gaps)

---

## Unresolved / measurement gaps

1. **Client precheck-skip end-to-end timing** not isolated: implementation is effective (`__ASTRA_PERF__.navSkipped`), but the on-device millisecond count from "click → navigation starts" was not sampled separately. Next: click the same target twice on the home page and record the `performance.now()` delta.
2. **On-device measurements did not isolate system load**: the bilibili page itself has video decoding and ad scripts, so the 0.437 ms wheel time includes that interference. Next: deploy `probe/bench-page.html` to a LAN static server and retest on the TV.
3. **Long-press directional key repeats** not stress-tested: caching is implemented, but focus jitter over 100 consecutive key presses was not measured.
4. **P2-10 native History** not implemented, reasons as above.

All four items were not skipped on "platform unsupported" grounds; each has an executable next step.
