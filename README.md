# dsh-chrome-devtools — DeepSeek Harness × Chrome DevTools 集成

[English](README.en.md) | 中文

让 DeepSeek Harness 的 Agent 通过 [chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp)
驱动一个真实 Chrome 浏览器：导航、点击、输入、截图、DOM 快照、控制台、网络请求、性能轨迹、Cookie。

**唯一安装方式：官方 `dsh plugin` 一键安装**（GitHub 源，无需克隆本仓库）。
本仓库根目录就是官方 bundle 插件包（`package.json` 声明 `dsh.bundle`，
`cordis.patch.yml` 是补丁层）：MCP 服务器行由插件自带，安装后**开箱即用**，
不需要安装任何附加组件、不需要自己配置 MCP。

## 特性

- **一键安装**：`dsh plugin add github:...` 一条命令，自动进入 profile 补丁层栈，零手工配置
- **开箱即用**：mcp 行、工具命名空间、超时与重连策略全部由插件内置；首次使用时
  npx 自动下载服务器、自动启动本机 Chrome，之后常驻
- **全局可用**：宿主重启后，所有会话（含子 agent）都能用 `mcp__chrome-devtools__*` 工具
- **真实浏览器**：有头或无头 Chrome、多标签、Cookie、网络拦截、性能轨迹，一应俱全
- **自动重连**：服务器崩溃由 `dsh-mcp-client` 指数退避重启，失败预算防无限重启
- **跨平台**：Windows / macOS / Linux；仓库自带零依赖安装脚本（纯 Node 标准库）

## 环境要求

| 依赖 | 说明 |
|---|---|
| DeepSeek Harness | 随官方发布，自带 `@deepseek-ai/dsh-mcp-client` 桥接插件 |
| Node.js ≥ 20 | `npx` 在 PATH 上 |
| pnpm | `dsh plugin` 的底层包管理器（`npm i -g pnpm` 或 `corepack enable`） |
| Chrome / Chromium / Edge | 本机安装；可在插件 `args` 用 `--channel` 指定 |

## 安装

```bash
dsh plugin --profile web add github:yuzi-ska/DSH-Chrome-devtools
```

（非 web 界面可把 `web` 换成你的 profile 名，如 `tui` / `headless`。）

安装后**重启宿主**（`dsh web` / 你的启动方式）。重启后所有会话都会出现
`mcp__chrome-devtools__browser_navigate`、`dom_snapshot`、`browser_screenshot`、
`console_list_messages`、`network_get_response_body`、`performance_start_trace`
等工具（以服务器实际声明为准），无需任何额外配置。

卸载：

```bash
dsh plugin --profile web remove dsh-chrome-devtools
```

### 仓库一键脚本（开发/本机场景）

```bash
git clone https://github.com/yuzi-ska/DSH-Chrome-devtools.git
cd DSH-Chrome-devtools

node scripts/install.mjs            # 安装到 web profile（本地 link，改代码重启即生效）
node scripts/install.mjs --check    # 环境自检（只读）
node scripts/install.mjs --uninstall
```

```
node scripts/install.mjs [options]
  --check             环境自检：node/pnpm/dsh/浏览器/DSH_HOME，不写任何文件
  --uninstall         卸载（dsh plugin remove）
  --profile <name>    目标 profile（默认 web）
  --dsh-home <path>   覆盖 DSH_HOME（默认 $DSH_HOME 或 ~/.dsh）
  --harness <path>    harness 仓库/安装路径（dsh 不在 PATH 时用 node 直接跑 CLI）
  --plugin-spec <s>   插件源（默认本仓库根目录；可填 npm 包名、git 源或本地路径）
  --package-name <n>  卸载时按此包名移除（默认 dsh-chrome-devtools）
```

## 架构

```
Harness（profile 组装）
   │
   │  bundle 插件补丁层（本仓库 cordis.patch.yml）
   ▼
@deepseek-ai/dsh-mcp-client 行（stdio，随 Harness 发布，配置由插件内置）
   │
   ▼
chrome-devtools-mcp 服务器（npx -y chrome-devtools-mcp@latest，宿主进程 spawn，首次自动下载）
   │
   │  Chrome DevTools Protocol
   ▼
一个共享的 Chrome 实例（自动启动本机已安装的 Chrome/Chromium/Edge）
```

- 每个 MCP 工具以 `mcp__chrome-devtools__<tool>` 名称注册进 `ctx.tools`，模型当作原生工具调用。
- 一个 profile 只挂载一份常驻服务器：所有会话共享同一个浏览器。
- 服务器崩溃由 `dsh-mcp-client` 的 supervisor 以指数退避自动重连；连续失败 10 次后工具注销（重启宿主恢复）。
- 单次工具调用最长 120 秒（可配置）。

## 工具能力

以服务器实际声明为准，主要工具族：

| 族 | 工具（mcp__chrome-devtools__ 前缀） |
|---|---|
| 浏览器 | browser_navigate / browser_reload / browser_navigate_history / browser_back / browser_forward |
| 标签页 | browser_new_tab / browser_select_tab / browser_close_tab / browser_focus_tab |
| DOM | dom_snapshot / dom_snapshot_meta |
| 交互 | browser_click / browser_type / browser_press_key / browser_hover / browser_scroll / browser_resize |
| 截图 | browser_screenshot(fullPage, format) |
| 控制台 | console_enable / console_list_messages / console_disable |
| 网络 | network_enable / network_get_response_body / network_set_extra_http_headers / network_block_urls |
| 性能 | performance_start_trace / performance_stop_trace |
| 存储 | storage_get_cookies / storage_set_cookie / storage_delete_cookie / storage_clear_cookies |
| 模拟 | emulation 相关工具（若服务器声明） |

## 配置参考

默认配置已开箱即用；以下为可选项（改 `cordis.patch.yml` 后需重启宿主）。

### mcp 行（插件内置）

```yaml
- id: mcp-chrome-devtools
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: chrome-devtools     # 工具命名空间：mcp__chrome-devtools__*
    transport: stdio
    command: npx
    args: ['-y', 'chrome-devtools-mcp@latest']
    toolCallTimeoutMs: 120000
    failOnStartupError: false
```

| 字段 | 默认 | 说明 |
|---|---|---|
| `serverName` | chrome-devtools | `[A-Za-z0-9_-]{1,32}`，进程内所有 mcp-client 实例唯一 |
| `command` / `args` | npx ... | stdio 启动命令；Windows 下 `npx` 由 SDK 的 cross-spawn 正确解析 |
| `toolCallTimeoutMs` | 120000 | 单次工具调用超时；页面加载/轨迹录制建议放宽 |
| `failOnStartupError` | false | true 时首连失败直接拒绝所在组装；false 时记日志并按退避重连 |
| `env` / `cwd` | 空 | 附加环境变量 / 工作目录（默认继承宿主） |
| `reconnect.*` | 见文档 | 重连预算：initialDelayMs 500 / maxDelayMs 30000 / maxAttempts 10 |

### chrome-devtools-mcp 服务器选项（放进 `args`）

| 选项 | 作用 |
|---|---|
| `--headless` | 无头模式，不弹窗口 |
| `--channel <name>` | 选择浏览器：`chrome`（默认）/ `stable` / `beta` / `dev` / `canary` / `msedge` / 可执行文件路径 |
| `--browserUrl <url>` | 附加到已在调试端口运行的 Chrome（如 `http://localhost:9222`） |
| `--isolated` | 每个服务器进程使用全新隔离的 Chrome profile |
| `--viewport <WxH>` | 固定窗口/视口尺寸，如 `1280x720` |
| `--proxy-server <url>` | 为浏览器设置代理 |
| `--user-data-dir <path>` | 自定义 Chrome 用户数据目录 |
| `--keepAlive` | 所有 MCP 连接关闭后保持服务器存活（默认开启） |

完整清单以官方 [docs/cli.md](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/cli.md) 为准。

## 共享语义

- 工具注册在 host 组装：profile 下每个 agent（含子 agent）都可见。
- 所有会话共享一个浏览器与服务器进程，会话之间的浏览器状态（标签、Cookie、控制台缓冲）互相可见。
- 需要隔离的浏览器场景：修改 `serverName` 与 `args`（如 `--isolated` 或单独 `--user-data-dir`）另装实例。

## 安全说明

- 浏览器能力与 shell 访问同级信任：可读写 Cookie、发任意请求、访问内网。只给可信会话使用。
- 页面内容（DOM 快照、控制台、响应体）会进入模型上下文与会话日志，注意敏感页面。
- 全局模式下每个请求都会携带该组工具的 schema（token 成本）。
- `failOnStartupError: false` 下，服务器持续崩溃会消耗重连预算后注销工具——这是
  刻意的失败可见性，不会无限重启。

## 故障排查

| 现象 | 处理 |
|---|---|
| 首次调用很慢（30-60s+） | npx 首次下载 + Chrome 启动，一次性成本；之后常驻 |
| 无浏览器工具出现 | 看宿主日志的 `mcp-client(chrome-devtools)` 行：reconnecting（warn）、recovered（info）、disabled-loss（error） |
| 安装后工具没出现 | bundle 插件在启动时加载，**必须重启宿主**；profile 补丁层的配置热重载对新增行不生效 |
| Chrome 未安装/找不到 | 在 `args` 加 `--channel`（如 `msedge`），或确认默认 Chrome 存在 |
| npx 无法下载 | 检查 npm registry 网络；可改 `args: ['-y', 'chrome-devtools-mcp@<固定版本>']` |
| 想附加已开的 Chrome | Chrome 以 `--remote-debugging-port=9222` 启动后，`args` 加 `--browserUrl http://localhost:9222` |
| `dsh plugin` 报 pnpm 缺失 | 安装 pnpm（`npm i -g pnpm` 或 `corepack enable`） |
| 工具调用超时 | 单次 120s；网络差或页面卡死时提高 `toolCallTimeoutMs` |
| 从本地 link 切换 GitHub 源报 EPERM | Windows junction 无法被 pnpm rename 覆盖：先 `dsh plugin remove`，再 add 新源 |

## 开发与迭代

```bash
git clone https://github.com/yuzi-ska/DSH-Chrome-devtools.git
cd DSH-Chrome-devtools

# 本地 link 安装（改 cordis.patch.yml 后重启即生效；无需每次推送）
node scripts/install.mjs --harness <harness仓库路径>

# 无重启验证组装树（boot-free）
node <harness>/apps/cli/lib/bin.js --profile web --dump-config | grep -A8 mcp-chrome-devtools
```

- 推送后远程安装：`dsh plugin --profile web add github:yuzi-ska/DSH-Chrome-devtools`。
- 内部开发文档 `docs/development.md` 不上传远程（.gitignore 排除）。

## 参考

- [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp)（服务器；工具清单与 CLI 选项以其 README / docs/cli.md 为准）
- [deepseek-ai/deepseek-harness — packages/mcp/mcp-client](https://github.com/deepseek-ai/deepseek-harness/tree/main/packages/mcp/mcp-client)（Harness 侧 MCP 客户端桥接插件）
- [deepseek-ai/deepseek-harness — packages/bundle](https://github.com/deepseek-ai/deepseek-harness/tree/main/packages/bundle)（bundle 插件机制）
- [deepseek-ai/deepseek-harness — apps/cli/src/plugin.ts](https://github.com/deepseek-ai/deepseek-harness/blob/main/apps/cli/src/plugin.ts)（`dsh plugin` 命令实现）
