# ASTRA Browser — LG G5 独立网页浏览器

面向 **LG OLED55G5PCA（webOS 25 / Chromium 120）** 的独立 webOS 网页浏览器。
不依赖 TVBox、JVM、Android WebView 或手机桥；不修改系统分区、系统浏览器或合成器。

- 应用 ID：`com.personal.tvwebbrowser`
- 版本：`0.1.0`
- 安装包：`build/com.personal.tvwebbrowser_0.1.0_all.ipk`
- 已安装并可在电视桌面启动（应用管理器 `launch` 验证）
- 实测报告：[RESULTS.md](RESULTS.md)
- 许可证：[MIT](LICENSE)

![起始页](docs/astra-start.jpg)

| 外部网页上的注入工具栏 | 应用内错误页 |
| --- | --- |
| ![注入工具栏](docs/astra-chrome.jpg) | ![错误页](docs/astra-error.jpg) |

---

## 1. 架构

```text
webOS WebApp (WAM / Chromium 120)
  index.html (file://)  ──唤醒服务──▶  http://127.0.0.1:7792/home
                                         │
 外部网页（Google/Baidu/...）              │  与 WAM 同一 Chromium 进程
   └─ webOSUserScripts/userScript.js       │
        ├─ 注入浏览器工具栏（closed shadow） │
        ├─ 轻 DOM 键盘代理（输入网址）       │
        └─ LS2 / loopback ────────────────▶  com.personal.tvwebbrowser.service
                                                ├─ 标签页 / 每标签历史 / 滚动位置
                                                ├─ 书签 / 全局历史 / 设置
                                                ├─ URL 连通性预检（IPv4 TLS）
                                                └─ 静态 start page 资源
```

关键设计：

1. **网页永远在顶层文档加载**，不放进 iframe。
   X-Frame-Options / CSP `frame-ancestors` 对顶层导航无效；因此不需要维护站点白名单，也不会伪装成只支持少数网站的 iframe 启动器。
2. **启动页改由本机回环服务提供**（`127.0.0.1:7792/home`）。
   webOS 会阻止从外部 HTTPS 页面直接导航到本应用自己的 `file://index.html`；改为回环 HTTP 后，Home / 新标签 / 错误恢复在任何外部页面都能返回浏览器 UI，同时仍然是本机资源、仍然使用同一 WAM Chromium。
3. **工具栏通过 WAM 静态 userScript 注入**，在每次顶层导航后自动重建；页面地址、标题、历史、书签由服务同步。
4. **标签页采用按需挂起（suspended tabs）**：
   服务保存每个标签的 URL、标题、历史栈和滚动位置；同一时刻只保留一个活动渲染文档。切换标签时恢复 URL 与历史。
   这是 2 GB 内存电视上的有意取舍：不需要为每个标签保留独立渲染器，也不会增加第二套 Chromium 内核。
5. **地址栏键盘输入使用轻 DOM 代理 input**。
   closed shadow 内的输入框在 WAM 中无法稳定获得蓝牙键盘/IME 焦点；可见地址栏保持只读，点击后把焦点交给页面轻 DOM 中的透明代理 input，键盘输入再镜像到工具栏。页面只拿得到 URL 文本，不接触服务 token 或系统 API。
6. **状态服务是唯一有状态的组件**：
   `PalmServiceBridge`（LS2）优先，HTTP loopback 回退；token 校验；只监听 `127.0.0.1`。
7. **失败导航不丢浏览器 UI**：
   地址栏/快捷入口先做 IPv4 TLS 连通性预检，DNS 污染/被墙/超时会在 start page 显示应用内错误页；外部链接导致的 WAM 内部 `loaderror.html` 会被立即重定向回 `/home#error=...`，由应用显示错误面板。

### 为什么不用其它路线

- **Android WebView / JVM**：本机没有 Android ART；JVM 兼容层与浏览器无关，本任务不依赖。
- **普通 iframe**：大量真实站点禁止被 iframe 嵌入，无法作为完整浏览器。
- **`webOSSystem.createWebView` / WebView Plus**：WAM 中存在该 API，但对普通 `trustLevel: default` 应用是无效/受限的；`netcast` 应用不注入 `webOSSystem`；`com.webos.app.webviewplus` 是保留系统 ID；弹窗白名单由 emmcd 管理。因此本轮不依赖隐藏 webview。
- **系统 Browser App**：`/mnt/otncabi/.../com.webos.app.browser/chrome` 是未注册的原生 Crow 浏览器；直接执行会启动 LG 系统浏览器，但不是可定制的独立 UI。本应用不调用它、不覆盖它，也不把“调起系统浏览器”当成自研浏览器。
- **另起 Chromium 进程**：会重复 GPU/网络/浏览器开销；本应用复用 WAM 的 Chromium 120。

---

## 2. 功能

- 地址栏：网址或搜索词；搜索引擎可切换（Google/Bing/DuckDuckGo/百度）
- 网页：现代 JavaScript、CSS、滚动、链接跳转、登录 Cookie（WAM 共享 profile）
- 顶层导航，无 iframe 站点白名单
- 前进、后退、刷新、主页
- 多标签：新建、切换、关闭；标签历史与滚动位置恢复（按需挂起）
- 书签、历史记录、上次会话恢复
- 页面缩放（0.75x–1.5x）、全屏/隐藏工具栏
- 鼠标优先 UI，兼容遥控器；桌面浏览器风格 1920×1080 界面
- 错误页/网络不可达提示，不丢失浏览器工具栏
- 连通性预检：IPv4 TLS + 证书主机名校验，避免 DNS 污染站点把 Chromium 卡死

### 快捷键

| 快捷键 | 功能 |
| --- | --- |
| Ctrl+L | 聚焦地址栏 |
| Ctrl+T | 新建标签页（本机 start page） |
| Ctrl+W | 关闭当前标签 |
| Ctrl+Tab / Ctrl+Shift+Tab | 下一个 / 上一个标签 |
| F5 / Ctrl+R | 刷新 |
| Alt+← / Alt+→ | 后退 / 前进 |
| Ctrl+D | 添加/移除书签 |
| Ctrl+H | 历史记录 |
| F11 | 全屏 / 隐藏工具栏 |
| Ctrl++ / Ctrl+- / Ctrl+0 | 放大 / 缩小 / 重置 |

中文标签和按钮均可点击；菜单还提供书签、历史、设置、全屏入口。

---

## 3. 构建与安装

无 npm 依赖（仅使用 TV 自带 Node 16 与 webOS 服务）。

```bash
# 1. 生成 start page 的 service/public 副本并打包 IPK
node tools/build.mjs
# 产物: build/com.personal.tvwebbrowser_0.1.0_all.ipk

# 2. 上传并安装（在 PC 上执行，TV_HOST/SSH key 按实际环境）
scp -i ~/.ssh/id_ed25519_lgtv_g5 \
  build/com.personal.tvwebbrowser_0.1.0_all.ipk \
  root@192.168.31.60:/tmp/astra-browser.ipk

ssh -i ~/.ssh/id_ed25519_lgtv_g5 root@192.168.31.60 \
  "luna-send -i luna://com.webos.appInstallService/dev/install \
  '{\"id\":\"com.personal.tvwebbrowser\",\"ipkUrl\":\"/tmp/astra-browser.ipk\",\"subscribe\":true}'"

# 3. 启动
ssh -i ~/.ssh/id_ed25519_lgtv_g5 root@192.168.31.60 \
  "luna-send -n 1 luna://com.webos.applicationManager/launch \
  '{\"id\":\"com.personal.tvwebbrowser\"}' < /dev/null"
```

首次启动流程：`file://index.html` → 唤醒 `com.personal.tvwebbrowser.service` → 跳转 `http://127.0.0.1:7792/home`。若服务不可用，文件启动页仍可作为降级 UI。

### 测试脚本（PC 端）

```bash
node probe/acceptance.mjs   # blocked-site, Baidu, tabs, bookmarks
node probe/interaction.mjs  # mouse, wheel, keyboard, F11, zoom, tabs, restore
node tools/tvcheck.mjs      # 真机：CDP 取 DOM 事实 + 截图
node tools/tvwheel.mjs      # 真机：注入滚轮，验证滚动增量
node tools/scrolltest.mjs   # 本地：工具栏点击后方向键/滚轮仍能滚动（回归）
node tools/keycheck.mjs     # 本地：方向键空间导航与面板焦点
```

脚本默认 TV `192.168.31.60`、SSH key `~/.ssh/id_ed25519_lgtv_g5`，并建立 CDP `9998→20998` 与 HTTP `7792→17792` 隧道。

---

## 4. 文件结构

```text
app/
  appinfo.json          # 应用注册、图标、键盘/鼠标设置
  index.html/app.css/app.js/config.js
  webOSUserScripts/userScript.js   # 外部页面注入的工具栏
  icon.png / largeIcon.png
service/
  service.js            # LS2 + loopback 状态服务，静态 /home
  package.json/services.json
  public/               # 由 tools/build.mjs 同步的 start page 资源
tools/
  build.mjs             # 同步 public + 打包 IPK
  pack-ipk.mjs          # 独立 webOS IPK 打包器（含 service）
  gen-backdrop.mjs      # 生成等高线地形图背景（marching squares）
  tvcheck/tvwheel/scrolltest/keycheck/shots.mjs   # 真机与本地验证
probe/
  acceptance.mjs        # 功能验收
  interaction.mjs       # 交互验收
docs/                   # README 截图
results/                # 截图、JSON 实测结果（不入库）
README.md / RESULTS.md / LICENSE
```

服务数据：优先尝试 `/var/palm/data/com.personal.tvwebbrowser.service`，当前安装环境回退到 `/tmp/tv-browser/state.json`；start page 的 `localStorage` 保存一份备份，服务状态为空时用于跨重启恢复。

---

## 5. 安全边界

- 服务只监听 `127.0.0.1:7792`，不暴露到局域网。
- 状态 API 需要 32 字节 token；token 只存在于应用/注入脚本的闭包，不写进 URL。仓库里的 token 是**固定的本机防护值，不是外部凭据**——它只挡住本机其他网页误调 loopback，没有对应的远端账号；部署到自己的电视时按需替换即可（`app/config.js`、`app/webOSUserScripts/userScript.js`、`service/service.js` 三处需一致）。
- 外部网页只能通过 WAM 提供的 `PalmServiceBridge` 尝试调用服务；没有 token 无法读写状态；服务不提供 shell、文件、Root 或通用 Node 接口。
- 注入工具栏使用 closed shadow root；页面无法直接读取工具栏 DOM/服务 token。页面仍可移除宿主节点，MutationObserver 会尝试重新挂载。
- 不修改 `/usr`、系统浏览器、合成器、TVBox、JVM 或系统分辨率。

## 6. 已知限制

- **标签页是挂起模型**，不是多渲染器实时标签；切换标签会重新加载目标 URL，但保留每标签历史/滚动。2 GB 内存下这是有意设计。真正并行的多标签需要可用的受信任 sub-webview / WebView Plus 或多窗口能力，本轮验证不可用。
- **Google / Wikipedia / GitHub 在当前电视网络不可达**：DNS 被污染且 TCP/SNI 超时。应用会给出明确错误页；配置电视/路由器的 VPN 或代理后可访问。Baidu、Bing、example.com 已实测通过。
- **Mouse wheel**：WAM 不会把滚轮输入转成页面滚动（实测：事件能到页面，但原生不滚）。注入脚本在捕获阶段接管滚轮，自己找最内层可滚动祖先并滚动，再 `preventDefault`；实测电视上 400 的 delta 滚 400px，不重复。工具栏与标签条上的滚轮各自有独立处理。
- **物理蓝牙键盘/鼠标**：输入逻辑用 CDP 的 mouse/keyboard 事件和轻 DOM 键盘代理验证；未由代理程序物理按键。请在电视上做一次人工确认（见 RESULTS 的手工验收清单）。
- 页面缩放通过 `body.style.zoom` 实现；少数强制 fixed 布局站点可能显示异常。
- 下载管理、查找页内文字、密码管理、扩展尚未实现。
- 部分严格 CSP 站点可能阻止 loopback HTTP；状态同步优先走 LS2，核心导航不受影响。

## 7. 手工验收清单

1. 从电视桌面点击 **ASTRA Browser** 图标，确认启动页出现。
2. 用蓝牙鼠标点击百度快捷入口；页面加载后确认顶部工具栏仍可见。
3. 点击地址栏，用蓝牙键盘输入 `https://www.baidu.com/s?wd=webos` 并回车。
4. 滚轮滚动结果页；点击工具栏后退/前进、刷新、主页。
5. Ctrl+T 新建标签，切换、Ctrl+W 关闭；确认标签条变化。
6. Ctrl+D 收藏当前页，菜单→书签确认；菜单→历史确认。
7. F11 隐藏/恢复工具栏；Ctrl++/Ctrl+-/Ctrl+0 验证缩放。
8. 关闭浏览器，确认其他电视 App（TVBox/直播）不受影响。
9. 若需要 Google/Wikipedia/GitHub：先在电视/路由器启用可用的 VPN/代理，再重试地址栏。

---

## 8. 许可证

[MIT](LICENSE) © 2026 Yukikaze1945

界面配色参考了 Bethesda《Starfield》官方站点使用的红 / 锈橙 / 金 / 藏青四色与等高线视觉语言；代码与实现均为本项目独立完成，与 Bethesda 无关，不使用其任何素材。
