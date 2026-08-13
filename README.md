# dsh-chrome-devtools — DeepSeek Harness × Chrome DevTools 集成

让 DeepSeek Harness 的 Agent 通过 [chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp)
驱动一个真实 Chrome 浏览器：导航、点击、输入、截图、DOM 快照、控制台、网络请求、性能轨迹、Cookie。

本仓库提供两种互补的安装形态（都是官方机制，不修改 Harness 部署本身）：

| 形态 | 安装方式 | 工具范围 | 生效时机 | 依赖 |
|---|---|---|---|---|
| **bundle 插件**（推荐，默认） | `node scripts/install.mjs` 或 `dsh plugin add` | **全局**：profile 下所有会话/预设 | 重启宿主 | pnpm |
| **agent preset** | `node scripts/install.mjs --preset` | 仅选用该 preset 的新会话 | 新建会话即可 | 无 |

## 架构

```
Harness（profile 组装）
   │
   │  bundle 插件补丁层（仓库根 cordis.patch.yml）或 preset 行（presets/chrome-devtools/agent.cordis.yml）
   ▼
@deepseek-ai/dsh-mcp-client 行（stdio，随 Harness 发布）
   │
   ▼
chrome-devtools-mcp 服务器（npx -y chrome-devtools-mcp@latest，宿主进程 spawn）
   │
   │  Chrome DevTools Protocol
   ▼
一个共享的 Chrome 实例（本机已安装的 Chrome/Chromium/Edge）
```

- 每个 MCP 工具以 `mcp__chrome-devtools__<tool>` 名称注册进 `ctx.tools`，模型当作原生工具调用。
- 一个 profile / 一个 preset 只挂载一份常驻服务器：同一作用域的所有会话共享同一个浏览器。
- 服务器崩溃由 `dsh-mcp-client` 的 supervisor 以指数退避自动重连；连续失败 10 次后工具注销（重启宿主或重载 preset 恢复）。
- 单次工具调用最长 120 秒（可配置）。

## 快速开始

前置要求：Node.js 20+（`npx` 在 PATH 上）、本机装有 Chrome / Chromium / Edge
（`--channel` 可指定具体浏览器）、bundle 模式另需 pnpm。

### 方式一：一键安装 bundle 插件（全局，推荐）

**GitHub 仓库源直接安装**（无需克隆本仓库，dsh 会经 pnpm 拉取）：

```bash
dsh plugin --profile web add github:yuzi-ska/DSH-Chrome-devtools
```

**或使用本仓库的一键脚本**（本地开发迭代，link 语义；`--harness` 指定 dsh 位置）：

```bash
node scripts/install.mjs            # 默认：安装到 web profile
node scripts/install.mjs --check    # 先做环境自检（只读）
```

脚本内部等价于官方命令 `dsh plugin --profile web add <本仓库>`。

安装后**重启宿主**（`dsh web` / 你的启动方式）。重启后所有会话都会出现
`mcp__chrome-devtools__browser_navigate`、`dom_snapshot`、`browser_screenshot`、
`console_list_messages`、`network_get_response_body`、`performance_start_trace`
等工具（以服务器实际声明为准）。

卸载：

```bash
node scripts/install.mjs --uninstall          # 或：dsh plugin --profile web remove dsh-chrome-devtools
```

### 方式二：安装 agent preset（按会话）

```bash
node scripts/install.mjs --preset
```

把 `presets/chrome-devtools/` 复制到 `$DSH_HOME/.agent-presets/chrome-devtools/`，
之后新建会话时选择 **Chrome DevTools Agent** preset（设置 → General 可设为默认）。
无需重启、无需 pnpm。会话内加载的 `chrome-devtools` 技能（SKILL.md）给出各工具族用法。

两种方式可并存（bundle 全局工具 + preset 自带技能）；`dsh-mcp-client` 的
`serverName` 在进程内唯一，重复安装同一行会因重名报错——不要同时用两个不同文件
装出两个 `serverName: chrome-devtools` 的实例。

### 安装脚本选项

```
node scripts/install.mjs [options]
  --preset            安装 agent preset（按会话）而非 bundle 插件（全局）
  --check             环境自检：node/pnpm/dsh/浏览器/DSH_HOME，不写任何文件
  --uninstall         卸载（bundle 模式调 dsh plugin remove；preset 模式删目录）
  --profile <name>    目标 profile（默认 web）
  --dsh-home <path>   覆盖 DSH_HOME（默认 $DSH_HOME 或 ~/.dsh）
  --harness <path>    harness 仓库/安装路径（dsh 不在 PATH 时用 node 直接跑 CLI）
  --plugin-spec <s>   插件源（默认本仓库根目录；可填 npm 包名、git 源或本地路径）
  --package-name <n>  卸载 bundle 时按此包名移除（默认 dsh-chrome-devtools）
  --force             覆盖已存在且内容不同的 preset 目录
  --yes               删除类操作不询问
```

## Harness 插件开发与一键机制

Harness 官方插件形态是 **bundle 插件**：一个 npm 包，在 `package.json` 声明
`"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`，包内的 `cordis.patch.yml`
作为补丁层插入 profile 组装（参考官方 [`@deepseek-ai/dsh-base`](https://github.com/deepseek-ai/deepseek-harness/tree/main/packages/bundle/base)）。

`dsh plugin` 是官方的一键管理命令（[apps/cli/src/plugin.ts](https://github.com/deepseek-ai/deepseek-harness/blob/main/apps/cli/src/plugin.ts)）：
转发给 pnpm 在 profile 目录执行，并**自动把声明了 `dsh.bundle` 的新依赖加入 profile
补丁层栈**（reconcile），无需手工编辑任何文件。支持：

```bash
dsh plugin --profile web add <npm包名>            # registry
dsh plugin --profile web add <本地目录>            # 本地 link（开发迭代）
dsh plugin --profile web add github:user/repo     # git 源（pnpm ≥10 需在 profile 的 pnpm-workspace.yaml 允许 build）
dsh plugin --profile web remove <npm包名>
dsh plugin --profile web update
```

本仓库**根目录**就是一个可直接 `dsh plugin add` 的 bundle 插件包：`package.json`
声明 `dsh.bundle`，`cordis.patch.yml` 是补丁层（纯补丁、无代码，`dependencies`
为空——桥接能力全部来自随 Harness 发布的 `@deepseek-ai/dsh-mcp-client`）。
GitHub 源安装时 pnpm 克隆整个仓库，仓库根即包根。发布到 npm 后，安装命令简化为：

```bash
dsh plugin --profile web add dsh-chrome-devtools
```

## 配置参考

### mcp 行（仓库根 cordis.patch.yml 与 presets/chrome-devtools/agent.cordis.yml 中的同一配置）

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
| `serverName` | 必填 | `[A-Za-z0-9_-]{1,32}`，进程内所有 mcp-client 实例唯一 |
| `command` / `args` | 必填 | stdio 启动命令；Windows 下 `npx` 由 SDK 的 cross-spawn 正确解析 |
| `toolCallTimeoutMs` | 60000 | 单次工具调用超时；页面加载/轨迹录制建议放宽 |
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

## 会话与共享语义

- **bundle 插件（全局）**：工具注册在 host 组装，profile 下每个 agent（含子 agent）都可见；
  所有会话共享一个浏览器与服务器进程。会话之间的浏览器状态（标签、Cookie、控制台缓冲）
  互相可见。
- **preset（按会话）**：只有选用该 preset 的会话共享浏览器；其它 preset 的会话不受影响。
- 需要互相隔离的浏览器场景：复制 preset 并修改 `serverName` 与 `args`
  （如 `--isolated` 或 `--user-data-dir` 分开）。

## 安全说明

- 浏览器能力与 shell 访问同级信任：可读写 Cookie、发任意请求、访问内网。只给可信会话使用。
- 页面内容（DOM 快照、控制台、响应体）会进入模型上下文与会话日志，注意敏感页面。
- 全局模式下每个请求都会携带该组工具的 schema（token 成本）；不需要浏览器能力的部署
  建议用 preset 模式按需启用。
- `failOnStartupError: false` 下，服务器持续崩溃会消耗重连预算后注销工具——这是
  刻意的失败可见性，不会无限重启。

## 故障排查

| 现象 | 处理 |
|---|---|
| 首次调用/建会话很慢（30-60s+） | npx 首次下载 + Chrome 启动，一次性成本；之后常驻 |
| 无浏览器工具出现 | 看宿主日志的 `mcp-client(chrome-devtools)` 行：reconnecting（warn）、recovered（info）、disabled-loss（error） |
| Chrome 未安装/找不到 | 在 `args` 加 `--channel`（如 `msedge`），或确认默认 Chrome 存在 |
| npx 无法下载 | 检查 npm registry 网络；可改 `args: ['-y', 'chrome-devtools-mcp@<固定版本>']` |
| 想附加已开的 Chrome | Chrome 以 `--remote-debugging-port=9222` 启动后，`args` 加 `--browserUrl http://localhost:9222` |
| `dsh plugin` 报 pnpm 缺失 | 安装 pnpm（`npm i -g pnpm` 或 `corepack enable`）；preset 模式不需要 pnpm |
| 工具调用超时 | 单次 120s；网络差或页面卡死时提高 `toolCallTimeoutMs` |
| 装了两份 mcp 行报 serverName 冲突 | 同一进程内 `serverName` 必须唯一；保留一份，另一份改 `serverName` 或移除 |

## 参考

- [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp)（服务器；工具清单与 CLI 选项以其 README / docs/cli.md 为准）
- [deepseek-ai/deepseek-harness — packages/mcp/mcp-client](https://github.com/deepseek-ai/deepseek-harness/tree/main/packages/mcp/mcp-client)（Harness 侧 MCP 客户端桥接插件）
- [deepseek-ai/deepseek-harness — packages/bundle](https://github.com/deepseek-ai/deepseek-harness/tree/main/packages/bundle)（bundle 插件机制）
- [deepseek-ai/deepseek-harness — packages/preset/agent-presets](https://github.com/deepseek-ai/deepseek-harness/tree/main/packages/preset/agent-presets)（preset 机制）
- [deepseek-ai/deepseek-harness — apps/cli/src/plugin.ts](https://github.com/deepseek-ai/deepseek-harness/blob/main/apps/cli/src/plugin.ts)（`dsh plugin` 命令实现）
