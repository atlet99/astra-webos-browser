# ASTRA 性能审计与缺陷修复

设备：LG OLED55G5PCA · webOS 25 / 10.3.0-1907 · Chromium 120 · 2 GB RAM · 四核 A78 / Mali-G510
基线提交：`e1e2490`（feat: ASTRA — a standalone webOS TV browser）
本轮提交：见文末 SHA

测量工具（均已入库）：

| 工具 | 用途 |
| --- | --- |
| `tools/bench.mjs` | 桌面无头 Chromium + 真实状态服务，测滚轮热路径、渲染抖动、载荷体积、嵌套滚动 |
| `tools/wheelroute.mjs` | 滚轮区域分流验收（标签条 / 面板 / 正文 / 工具栏） |
| `tools/scrolltest.mjs` | 点击工具栏后方向键与滚轮仍能滚动页面（回归） |
| `tools/keycheck.mjs` | 首页方向键空间导航与面板焦点交接 |
| `tools/tvbench.mjs` | 真机：注入滚轮并读取页面内计数器 |
| `tools/tvcheck.mjs` | 真机：CDP 取 DOM 事实 + 截图 |

---

## P0-01 滚轮事件分流（closed Shadow DOM）

**根因**：文档级监听器用 `composedPath()` 找 `.tvb-tabs` / `.tvb-pbody`。closed shadow root 对外部监听器会把路径截断到宿主，这个判断**永远不成立**；同时标签条自身的 `wheel` 处理器与文档处理器会同时消费同一次输入。

**修改**：`app/webOSUserScripts/userScript.js`
- 文档级监听器改为按**重定向后的 `e.target`** 判断：来自阴影的事件 target 就是宿主，直接跳过，交给阴影内的处理器。
- 阴影内新增唯一路由 `ui.chrome` 的 `wheel`：`.tvb-tabsbar` → 只横向滚标签；`.tvb-pbody` → 只滚面板内容；`.tvb-toolbar` → 转发给页面；其余一律 `preventDefault()` 吞掉。
- 删除了标签条上重复的 `wheel` 监听器。

**修复前后**：修复前在标签条/面板上滚轮会**同时**滚页面；修复后不会。

**测试** `tools/wheelroute.mjs`（1280×720，真实鼠标事件）：

```
base 600 → 工具栏 800 → 标签条 800 → 面板 800 → 正文 1040
pageMoved { toolbar: true, tabs: false, panel: false, body: true }  pass: true
```

**结论：PASS**

---

## P0-02 滚轮热路径

**根因**：每个 wheel 事件都从 target 逐级向上调用 `getComputedStyle()`、读 `scrollHeight/clientHeight`，并同步写 `scrollTop`。

**修改**：
- 滚动容器按 target 缓存（`WeakMap`），失效条件：窗口 resize、面板重绘、结构变化。
- 尺寸指标缓存 500ms，只在边界判断需要时刷新。
- 位移累积后用 `requestAnimationFrame` 合并成一次滚动写入；`preventDefault()` 仍在事件回调内同步调用。
- 保留 `deltaMode`（行 ×16、页 ×视口高）与 `deltaX`。

**测量**（`tools/bench.mjs`，同一基准页 30 次滚轮，滚动 3600px）：

| 指标 | 修复前 | 修复后 |
| --- | --- | --- |
| 单次 wheel 处理耗时（桌面） | 0.103 ms | 0.090 ms |
| 单次 wheel 处理耗时（真机 bilibili） | 未测（旧版已覆盖） | **0.437 ms** |
| 帧间隔 p95 | 8.4 ms | 8.5 ms |
| 边界误判（wheelMiss） | — | 0 |

桌面 CPU 上两者差距不大（热路径本来就短），真机 0.437 ms/次 才是实际成本；关键收益来自 P0-03 —— 修复前每 800ms 会因滚动触发一次全量渲染。

**结论：PASS**（桌面差异小，如实记录；真机数据见上）

---

## P0-03 滚动不再触发全量渲染

**根因**：`tabUpdate` 返回 `clone(state)`（整份状态），客户端 `svc()` 收到 `state` 后执行 `normalizeState()` + `persistFallback()` + `render()`，`render()` 又重建标签条与打开中的面板。

**修改**：
- `service/service.js` `tabUpdate()`：只返回 `{ returnValue, id, scrollY, rev }`；滚动值未变化时返回 `unchanged: true` 且不落盘。
- 客户端 `svc()`：`tabUpdate` 不再触发 `render()`；其它方法仅当 `rev` 变化或活动标签变化时才渲染。
- `persistFallback()`（`window.name` 全量 JSON）改为 1s 合并写入。

**测量**：

| 指标 | 修复前 | 修复后 |
| --- | --- | --- |
| 滚动期间 `renderTabs` 调用 | 1 | **0** |
| 滚动期间 `render()` 调用 | 1 | **0** |
| `tabUpdate` 响应体积（桌面，3 标签/8 书签/40 历史） | 8193 B | **70 B** |
| `tabUpdate` 响应体积（真机 LS2） | 整份状态（getState 21900 B） | **93 B**（美化输出） |

验收条件「只改 scrollY 时 renderTabs/renderPanel 为 0」已满足。

**结论：PASS**

---

## P0-04 增量 DOM 渲染

**修改**：
- `userScript.js`：标签按钮按 id 复用（`tabNodes`），只改变化的文本/类名/顺序；新增 `render()` 签名，签名不变直接返回。
- `renderPanel()` 增加数据签名（书签 id 列表 / 历史长度+首 id / 设置值），签名不变不重绘。
- `app/app.js`：标签、书签、历史、快捷入口各自加签名守卫；快捷入口在 6 次探测回调里不再整块重建。

**测量**（`tools/bench.mjs` 滚动阶段 + 首页启动）：

| 场景 | 修复前 | 修复后 |
| --- | --- | --- |
| 滚动期间标签重建 | 1 次 | 0 次 |
| 首页 6 次探测触发的快捷入口重建 | 6 次 | 1 次（首帧）+ 变化时增量 |

**结论：PASS**

---

## P1-05 导航预检缓存

**修改**：
- `service/service.js`：新增 `probeCache`（键 = 协议+主机+端口）。成功缓存 10 分钟，失败 30 秒；并发探测用 `probeInflight` 合并成一次 socket；缓存上限 200 条，LRU 淘汰。
- `app/app.js`：客户端 `hostOk` 表（10 分钟），已验证可达的主机**完全跳过预检**直接导航；真实失败仍由 WAM loaderror → `/home#error` 兜底到错误页。
- `httpCall` 对 `tabVisit` 使用 `keepalive: true`，避免卸载页面时丢失访问记录。

**测量**（真机，同一主机连续两次 `probeUrl`）：

```
cold  0.34 s   （真实 TLS 连接）
warm  0.02 s   （cached=true，命中缓存）
```

**结论：PASS**（服务端缓存与客户端快路径均已实现；客户端跳过预检的端到端计时未单独隔离，属 PARTIAL 的测量缺口，见文末）

---

## P1-06 首页探测闭包错误

**根因**：`probeTargets()` 里 `var item = pending[i++]` 在 `while` 循环中声明，`var` 是函数作用域，所有异步回调共享同一个绑定，最终都读到**最后一个**目标 —— 结果被写到错误的入口，其余入口永远停在「检测中」。

**修改**：每次迭代用 IIFE 捕获自己的 `item`；成功后同时写入客户端 `hostOk`。

**测试**：真机首页 6 个入口全部收敛为「可达」（截图 `results/astra-tv.png`），无一个停在「检测中」。

**结论：PASS**

---

## P1-07 焦点计算

**修改**：
- `chromeFocusables()` / `chromeMove()` 改为一次测量、缓存 `{node,x,y}`，窗口 resize、面板重绘、标签重绘时失效。
- 面板列表的上下键改为 **DOM 顺序步进**，不再做全量几何比较。

**测试**：`tools/keycheck.mjs` 通过（`BODY → ntpInput → 百度 → Bing`，面板开合焦点正确回落）。

**结论：PASS**（焦点扫描次数已可从 `__TVB_PERF__.focusScan` 观测；本轮未做长按连发的压测，属测量缺口）

---

## P1-08 地址栏编辑态

**修改**：新增 `editingAddress` / `composing` 显式状态；`syncAddress()` 在编辑期间不写值；代理输入框监听 `compositionstart/update/end`；Enter/Escape/点击页面都会清状态。

**测试**：`tools/keycheck.mjs`（Ctrl+L 聚焦、输入、面板焦点）通过；真机输入地址跳转正常。

**结论：PASS**

---

## P2-09 服务内存与磁盘

**修改**：
- 响应不再 `clone(state)`（14 处）：HTTP/LS2 层立即序列化，深拷贝纯属浪费。
- `saveState()` 改为异步写队列：`writeFile → rename` 原子替换，写期间的变更排队并在完成后以**最新状态**重写，旧状态不会覆盖新状态。
- 状态增加 `rev` 版本号，随每次落盘自增。
- 退出前同步 flush（`SIGTERM`/`SIGINT`/`exit`）。

**测量**：真机 `getState` 21900 B 响应不再多一次 JSON 往返；落盘从请求路径移出。

**结论：PASS**（`rev` 已用于客户端渲染判重；服务端尚未用它做乐观并发校验，属可选增强）

---

## P2-10 标签切换与前后退

**现状**：挂起式标签模型不变（2 GB 内存下不引入多渲染器）。本轮收益来自上游：切换/后退走 `navigateTo()`，命中 `hostOk` 后不再阻塞预检。

**未做**：同一标签内改用原生 History API。**证据**：现有实现每次导航都是顶层文档跳转，历史由服务按标签维护；WAM 的 `loaderror` 会重定向回 `/home#error`，若改用 `history.pushState` 需要同时改写注入脚本的 URL 跟踪与错误兜底，改动面大于本轮范围。已保留每标签独立历史边界与滚动恢复。

**结论：PARTIAL**（缓存复用已生效；原生 History 未实施，原因与影响面如上）

---

## P2-11 注入脚本生命周期

**核查结果**：
- 顶部有 `if (window.__TVB_CHROME__) return;`，同一文档不会重复初始化。
- 输入代理 `ensureProxy()` 复用已有节点，`MutationObserver` 只在宿主/代理被移除时重挂。
- 状态同步：`syncVisit` 仅在 URL 或标题变化时调用；轮询间隔 900ms 且页面隐藏时跳过。
- 图片 `load` 事件：**未**假设其传播到 `window`，代码中不存在相关监听（核查确认，无需修复）。

**结论：PASS**

---

## P2-12 视觉开销

- 未改动配色与版式；等高线背景仍是一张静态 SVG（`background-size: cover`，不重复、不动画）。
- 无 `filter` / `backdrop-filter` / canvas / WebGL。
- 新增的只有 `rAF` 滚动合并与签名判断，均为短任务。

**结论：PASS**

---

## P3-13 测试脚本修复

- `probe/acceptance.mjs`、`probe/interaction.mjs`：`.quicklink` → `.target`（页面改版后已失效）。
- 新增 `tools/wheelroute.mjs`、`tools/bench.mjs`、`tools/tvbench.mjs`。
- `tools/bench.mjs` 内置真实状态服务与种子状态，滚动链路端到端可复现。
- 明确区分：CDP 注入滚轮在桌面 Chromium 与电视 WAM 上**都可**触发滚动；不能据此推断真实鼠标行为，真机滚轮仍以人机验证为准（本轮已由用户确认修复）。

**结论：PASS**

---

## P3-14 性能基准

| 场景 | 指标 | 修复前 | 修复后 |
| --- | --- | --- | --- |
| 普通网页连续滚动（30 次滚轮 / 3600px） | 单次处理耗时（桌面） | 0.103 ms | 0.090 ms |
| 同上 | 单次处理耗时（真机） | — | 0.437 ms |
| 同上 | 滚动期间标签重建 | 1 | 0 |
| 同上 | 滚动同步载荷 | 8193 B | 70 B |
| 嵌套滚动 | 内层容器滚动 / 页面不动 | 200 / 8758 | 200 / 8758 |
| 标签条、面板滚轮 | 是否误滚正文 | 是 | 否 |
| 重复探测同一主机 | 冷 / 热 | 0.34 s / 0.34 s | 0.34 s / 0.02 s |
| 首页 6 个入口探测 | 收敛状态 | 有入口卡「检测中」 | 6/6 可达 |

采样条件：桌面 = 无头 Chromium 1280×720，同一台 PC；真机 = LG G5 前台运行，页面为 bilibili 视频页（可滚动 2212px），电视负载未做隔离（见缺口）。

**结论：PASS**

---

## P3-15 真机验收

- 构建 + `scp` + `appInstallService/dev/install` → `"state":"installed"`，`launch` 返回 `returnValue: true`。
- 首页：6 个目标全部「可达」，`SVC LINK` / `NET ONLINE`，`scrollHeight == innerHeight`（首屏不滚动）。
- 滚轮：注入 24 次 → 页面滚动 1973px，`renderTabs: 0`、`render: 0`，`wheelFrames: 24`。
- 标签：3 个标签正常切换；历史 6 条；书签空态正常。
- 遥控器方向键：`tools/keycheck.mjs` 在桌面验证导航链路；真机方向键由用户先前确认可用。
- 服务：`getState` 21900 B / `tabUpdate` 93 B；无崩溃日志。
- 未触碰系统分区、系统浏览器、WAM 核心文件。

**结论：PASS**（蓝牙鼠标/键盘的物理按键仍需人工按一次，见缺口）

---

## 尚未解决 / 测量缺口

1. **客户端跳过预检的端到端计时**未隔离：实现已生效（`__ASTRA_PERF__.navSkipped`），但「点击 → 开始导航」的真机毫秒数未单独采样。下一步：在首页对同一目标连续点击两次并记录 `performance.now()` 差值。
2. **真机测量未隔离系统负载**：bilibili 页面自身有视频解码与广告脚本，滚轮耗时 0.437 ms 包含这部分干扰。下一步：用 `probe/bench-page.html` 部署到局域网静态服务器后在电视上复测。
3. **长按方向键连发**未压测：缓存已实现，但未测连续 100 次按键的焦点抖动。
4. **P2-10 原生 History** 未实施，原因见上。

以上四项均未以「平台不支持」为由跳过，均有可执行的下一步。
