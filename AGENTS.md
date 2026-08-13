# AGENTS.md

本仓库为 DeepSeek Harness 提供 Chrome DevTools 浏览器能力集成（**唯一形态：官方
bundle 插件**），供在本仓库工作的 AI Agent 与人类开发者遵循。

## 项目定位

- 交付物：一个官方 bundle 插件包（**仓库根** = 包根，`dsh plugin add github:...`
  一键安装、全局工具、开箱即用）、跨平台安装脚本（`scripts/install.mjs`）与文档。
- 安装后用户**不需要**安装附加组件或自行配置 MCP：mcp 行（`serverName`/stdio/npx/
  超时/重连）全部内置于 `cordis.patch.yml`；首次使用 npx 自动下载服务器、自动启动
  本机 Chrome。
- 集成不修改 Harness 部署：mcp 行引用随 Harness 发布的 `@deepseek-ai/dsh-mcp-client`，
  包名由宿主的组装基址解析；本仓库不包含也不需要任何 Harness 源码改动。
- **禁止**编辑 `F:\github\deepseek-harness`（部署 checkout）或部署随附的
  `apps/cli/config/agent-presets/`（升级会覆盖，且损坏 `cordis` preset 会禁用
  Harness 的自修改模式）。

## 目录结构

- **仓库根 = 官方 bundle 插件包**（`dsh plugin add github:yuzi-ska/DSH-Chrome-devtools`
  安装时，pnpm 克隆整个仓库、根即包根）：
  - `package.json` — `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` 声明
  - `cordis.patch.yml` — host 平面补丁：insert `mcp-chrome-devtools` 行（全局工具，
    配置完整、开箱即用）
- `scripts/install.mjs` — 跨平台一键脚本（Windows/macOS/Linux，零依赖，Node ≥20；
  仅支持 bundle 安装/自检/卸载）
- `docs/development.md` — 内部开发文档，**不允许上传至远程**（已在 .gitignore 中排除）
- `README.md` / `README.en.md` — 中英文使用者文档（互链；改安装方式、配置或故障排查时两版同步）

## 修改的规则

1. `cordis.patch.yml` 是唯一的能力载体：任何行为/配置变更（serverName、args、
   超时、重连）都改这里；保持"开箱即用"承诺——默认配置必须完整可用，不要求用户
   写任何 MCP 配置。
2. bundle patch 是 host 平面，行进入 global 层——只放确需全局的能力。
3. `serverName` 在进程内所有 mcp-client 实例间唯一；`mcp__chrome-devtools__*`
   的公开名由 `(serverName, rawName)` 确定性生成，改名会改变模型看到的工具名。
4. `scripts/install.mjs` 保持零第三方依赖、纯 Node 标准库；新增平台分支时在
   Windows（含 .cmd 解析）与 POSIX 两侧都要验证。
5. 同步更新 `README.md` 与 `README.en.md`、`docs/development.md`。

## 验证清单（改动后）

- [ ] `node scripts/install.mjs --check` 输出符合当前环境。
- [ ] 安装：`node scripts/install.mjs --harness <harness路径>` 成功后，
      `node <harness>/apps/cli/lib/bin.js --profile web --dump-config` 输出含
      `mcp-chrome-devtools` 行；profile manifest 的 `dsh.profile.bundles` 含包名。
- [ ] 宿主重启后出现 `mcp__chrome-devtools__*` 工具（无需任何手动配置）。
- [ ] `npx -y chrome-devtools-mcp@latest --help` 输出的选项与 README 表格一致（版本漂移时更新）。
- [ ] 未触碰部署目录与随附 preset；无遗留测试进程（chrome-devtools-mcp 服务器由宿主管理，属正常常驻）。

## 环境事实（本机）

- 部署：Harness checkout 在 `F:\github\deepseek-harness`，Web 服务运行于 127.0.0.1:32310，
  宿主 PID 117204；CLI 入口 `apps/cli/lib/bin.js`（已构建）。
- `$DSH_HOME = C:\Users\yuzia\.dsh`；web profile 目录 `profiles/web/`
  （bundles 栈：dsh-base、dsh-web-app、dsh-chrome-devtools，后者源为
  `github:yuzi-ska/DSH-Chrome-devtools`）。
- Node v25.2.1 / npm 11.6.2 / pnpm 11.7.0（PATH 上）；Chrome 位于
  `C:\Program Files\Google\Chrome\Application\chrome.exe`。
- 会话沙箱（workspace-write）外写文件（如 `$DSH_HOME`）需要授权；网络直连
  GitHub/registry 常被策略阻止，需要文档事实时优先用官方仓库的已知稳定信息并标注来源。
