# ASTRA Browser — LG G5 真机验收报告

- 日期：2026-10-30
- 设备：LG OLED55G5PCA，webOS 25 / 10.3.0，Chromium 120.0.6099.270，root SSH
- 应用：`com.personal.tvwebbrowser` v0.1.0
- IPK：`tv-browser/build/com.personal.tvwebbrowser_0.1.0_all.ipk`
- 约束：未修改系统分区、系统浏览器、合成器、TVBox 或 JVM

## 1. 安装与启动

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| IPK 安装 | 通过 | `appInstallService/dev/install` 返回 `installed`；应用目录/服务目录存在 |
| 桌面注册 | 通过 | `getAppInfo` 返回 `title: ASTRA Browser`、`icon/largeIcon`、`visible:true` |
| 启动 | 通过 | `applicationManager/launch` 返回 true，前台为 `com.personal.tvwebbrowser` |
| 启动页 | 通过 | `http://127.0.0.1:7792/home`，1 个标签、6 个快捷入口、状态服务已连接 |
| 应用图标 | 已打包/注册 | [icon.png](app/icon.png)、[largeIcon.png](app/largeIcon.png)；桌面图标未用摄像头单独取证 |

最终安装后冷启动到回环 start page，服务状态为：

```json
{"returnValue":true,"service":"com.personal.tvwebbrowser.service","port":7792,"tabs":1}
```

## 2. 功能实测

| 功能 | 结果 | 实测/证据 |
| --- | --- | --- |
| 地址栏输入（应用页） | 通过 | 鼠标点击 → `Input.insertText` → `rawKeyDown Enter`，导航到 `https://cn.bing.com/`（[input-typed.png](results/input-typed.png)） |
| 地址栏输入（外部页） | 通过 | 轻 DOM 键盘代理：点击工具栏 → 活动元素 `tvb-keyboard-proxy` → 输入 `https://www.baidu.com/s?wd=webos` → 回车成功 |
| 鼠标点击 | 通过 | CDP 真实 mousePressed/Released 点击百度快捷入口，加载 `https://www.baidu.com/`（[interaction-baidu.png](results/interaction-baidu.png)） |
| 鼠标滚轮 | **未自动验证** | WAM CDP 不实现 `Input.dispatchMouseWheel`；`Input.dispatchMouseEvent` 的 mouseWheel 注入超时。页面内 `window.scrollTo` 可滚动；真实蓝牙鼠标滚轮请按清单人工确认 |
| 蓝牙键盘 | **逻辑通过，硬件待人工** | 轻 DOM 代理 + CDP 键盘事件可输入/回车；未由代理程序物理按键。请人工确认一次 |
| 顶层页面加载 | 通过 | 百度、Bing、example.com 均成功加载（非 iframe，无 X-Frame-Options 白名单） |
| 百度真实页面 | 通过 | 首页、`/s?wd=webos` 搜索页；JS 渲染正常（[accept-baidu.png](results/accept-baidu.png)） |
| Bing 真实页面 | 通过 | `https://cn.bing.com/` 首页、标题“搜索 - Microsoft 必应” |
| JS / DOM / 样式 | 通过 | 百度动态首页、搜索页正常渲染；注入工具栏与页面共存 |
| 链接跳转 | 通过 | 快捷入口、页面内链接由顶层导航；注入脚本随新文档重建 |
| 后退 | 部分通过 | 服务历史索引从 2 回到 1，页面最终回到 `https://www.baidu.com/`；自动等待断言曾因导航提交时序误判为失败，建议复测 |
| 前进 | 未单独测试 | 使用同一 `historyForward` 路径，逻辑已实现 |
| 刷新 / 主页 | 主页通过；刷新未单独记录 | Home 经 `http://127.0.0.1:7792/home` 返回；刷新调用页面 reload |
| 新标签（Ctrl+T） | 通过 | `acceptance-ui.json`: `newTabIsStartPage:true`；服务创建新标签并打开 `/home#tab=...` |
| 标签切换 | 通过 | `acceptance-ui.json`: `tabCycleBackToBaidu:true` |
| 关闭标签（Ctrl+W） | 通过（脚本级） | 代理/交互测试中关闭新标签后回到 `https://cn.bing.com/` |
| 书签 | 通过 | Ctrl+D 写入/移除服务书签；`acceptance-ui.json`/状态查询可见 `https://www.baidu.com/` |
| 历史记录 | 通过 | 服务 `/state` 中按访问顺序记录 URL/时间；WAM loaderror 已过滤 |
| 会话恢复 | 通过 | 关闭应用前在百度页，重开应用后恢复百度并重新注入工具栏（[interaction-restored.png](results/interaction-restored.png)） |
| 缩放 | 通过 | Ctrl++ 后 `document.body.style.zoom = 1.1`，截图 [proxy-zoom.png](results/proxy-zoom.png) |
| 全屏 / 隐藏工具栏 | 通过 | 应用页 F11：`body.fullscreen=true`、`#chrome display:none`；再次 F11 恢复；外部页 F11 同时恢复页面顶部 padding |
| 网络失败处理 | 通过 | 点击 Wikipedia：不离开 start page，显示“无法访问此网站 / DNS 污染、地区限制…”错误面板（[accept-blocked.png](results/accept-blocked.png)） |
| 关闭浏览器不影响其它 App | 通过 | `Page.close` 后浏览器 target 消失，TVBox target 仍存在（`interaction.json`: `tvboxTargetAlive:true`） |

## 3. 真实站点与网络限制

电视网络当前可达：

- `https://www.baidu.com/` — 成功
- `https://www.bing.com/` / `https://cn.bing.com/` — 成功
- `https://example.com/` — 成功

电视网络当前不可达（非浏览器代码错误）：

| 站点 | TV 测试 | 说明 |
| --- | --- | --- |
| Google | `wget` timeout | 系统 DNS 返回污染地址（如 `69.171.235.22`），TCP/TLS 不可达 |
| Wikipedia | `wget` timeout | 系统 DNS 返回污染地址（如 `31.13.88.26`），AliDNS 返回的地址也被 TCP 阻断 |
| GitHub | `wget` timeout | DNS 正确（`20.205.243.166`）但 TCP/TLS 超时 |

应用已内置 `probeUrl`（IPv4 + TLS 握手 + 证书主机名校验）：
不可达站点会在 start page 显示应用内错误页，不会把 WAM 导航到内部 `loaderror.html` 后卡死/丢工具栏。

**替代路线**：在电视或路由器配置可用的 VPN/代理后，地址栏直接访问；应用本身不依赖 Android WebView，也不受站点 iframe 限制。

## 4. 资源占用

一次百度页面 + 注入工具栏的采样（`interaction.json`）：

| 进程 | RSS |
| --- | --- |
| WAM 浏览器主进程 | ~77 MB（系统常驻） |
| TVBox renderer（对照，未受影响） | ~61 MB |
| ASTRA Browser renderer | ~74.7 MB |
| `com.personal.tvwebbrowser.service` | ~23.0 MB |

- `MemAvailable`：浏览中约 **450 MB**；关闭浏览器后约 **533 MB**
- 未启动第二套 Chromium 内核；没有额外的浏览器进程
- 关闭后释放约 83 MB（renderer + service 仍驻留时）
- 电视 loadavg 长期约 17–21（系统后台/其它研究影响），因此未把负载作为应用性能结论

## 5. 稳定性与已知问题

- 在“原生系统浏览器 ELF 启动”和“F11 后 CDP 截图”两次激进探测后，电视发生过重启；最终 IPK 安装、冷启动、百度访问、工具栏、键盘代理均正常。重启原因未能隔离到应用本身（应用只操作 DOM/阴影 DOM，不修改合成器/系统），但已记录，建议长时间人工复测。
- CDP `Page.captureScreenshot` 在 F11/全屏状态曾挂起；正常页面截图正常。正式 UI 不依赖截图。
- 设备重启（非应用重启）后，服务的 `/tmp` 状态会丢失；start page 的 localStorage 备份在下次启动时用于恢复。跨重启的完整标签恢复仍需一次人工确认。
- 标签页为按需挂起模型：切换标签会重新加载 URL，但保留服务端每标签历史与滚动位置。这是 2 GB 内存下的取舍，不是多渲染器实时标签。
- 地址栏在 closed shadow 中不直接接收 WAM 键盘/IME 焦点，已用轻 DOM 代理解决；物理蓝牙键盘仍需人工按一次。
- 严格 CSP 站点可能限制 loopback HTTP；状态同步优先走 LS2，核心导航不依赖该 HTTP 请求。

## 6. 浏览器内核路线调查结论

1. **WAM / Chromium 120 可复用**：所有 webOS web app 共用同一 WAM 浏览器进程；顶层外部页面、JS、DOM、Cookie、登录态均正常。新 app 只增加一个 renderer。
2. **系统 Browser App**：位于 `/mnt/otncabi/usr/palm/applications/com.webos.app.browser`，`appinfo.type=native_builtin`，**未在应用管理器注册**（`getAppInfo`/`launch` 失败）。直接执行其 `chrome` ELF 会启动 LG Crow 系统浏览器，但不能作为自定义 UI；本应用未使用。
3. **`webOSSystem.createWebView` / WebView Plus**：API 存在，但普通 `default` 应用调用无效；`netcast` 应用没有 `webOSSystem`；`com.webos.app.webviewplus` 是保留系统 ID；弹窗白名单由 emmcd 管理。因此不能依赖隐藏 subwebview 做多标签。
4. **iframe / subWebview**：普通 iframe 受 X-Frame-Options/CSP 限制；`subWebviewUserScript.js` 不注入普通 iframe；`window.open` 在 WAM 中会顶层导航。必须用顶层页面 + 注入 chrome。
5. **file:// 限制**：外部页面不能直接导航回应用 `file://index.html`；改用回环 `/home` 后 Home/新标签/错误恢复可用。
6. **CDP**：`/json`、Runtime.evaluate、Page.navigate、Page.captureScreenshot 可用；`Target.createTarget`、`/json/new`、`Input.dispatchMouseWheel` 不可用；CDP 仅用于开发/验收，不作为正式接口。
7. **结论**：在 2 GB、无 Android WebView、无可用受信任 webview 宿主的条件下，**WAM 顶层页面 + 注入浏览器 chrome + 本机状态服务 + 按需挂起标签** 是实测最稳、最省内存的架构。

## 7. 证据文件

- [acceptance-ui.json](results/acceptance-ui.json) — 启动页、blocked、Baidu、标签切换
- [interaction.json](results/interaction.json) — 鼠标、chrome、会话恢复、关闭、内存
- [final-check.json](results/final-check.json) — F11、鼠标百度、键盘代理、标签
- [proxy.json](results/proxy.json) — 地址栏/缩放/标签部分记录
- 截图：[accept-start.png](results/accept-start.png)、[accept-blocked.png](results/accept-blocked.png)、[accept-baidu.png](results/accept-baidu.png)、[accept-newtab.png](results/accept-newtab.png)、[interaction-restored.png](results/interaction-restored.png)、[proxy-zoom.png](results/proxy-zoom.png)

## 8. 手工验收清单（请用户执行一次）

1. 桌面点击 **ASTRA Browser**，确认图标/启动页。
2. 蓝牙鼠标点击百度快捷入口；确认工具栏仍在。
3. 点击地址栏，用蓝牙键盘输入 `https://www.baidu.com/s?wd=webos` + Enter。
4. 鼠标滚轮滚动、点击链接、后退/前进/刷新/主页。
5. Ctrl+T / 切换标签 / Ctrl+W；Ctrl+D 书签；Ctrl+H 历史。
6. F11 全屏恢复；Ctrl++/Ctrl+- 缩放。
7. 关闭浏览器，确认 TVBox/直播正常。
8. 如可提供 VPN/代理，再测试 Google/Wikipedia/GitHub 并记录。
