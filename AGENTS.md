# AGENTS.md

本仓库为 DeepSeek Harness 提供 Chrome DevTools 浏览器能力集成（bundle 插件 + agent
preset 双形态），供在本仓库工作的 AI Agent 与人类开发者遵循。

## 项目定位

- 交付物：一个官方 bundle 插件包（**仓库根**，`dsh plugin` 一键安装、全局工具）、
  一个可移植 agent preset（`presets/chrome-devtools/`，按会话）、跨平台安装脚本
  （`scripts/install.mjs`）与文档。
- 集成不修改 Harness 部署：两处 mcp 行都引用随 Harness 发布的
  `@deepseek-ai/dsh-mcp-client`，包名由宿主的组装基址解析；本仓库不包含也不需要
  任何 Harness 源码改动。
- **禁止**编辑 `F:\github\deepseek-harness`（部署 checkout）或部署随附的
  `apps/cli/config/agent-presets/`（升级会覆盖，且损坏 `cordis` preset 会禁用
  Harness 的自修改模式）。需要改动随附 preset 行为时，先复制到 `$DSH_HOME/.agent-presets/` 再改副本。

## 目录结构

- **仓库根 = 官方 bundle 插件包**（GitHub 源 / `dsh plugin add` 直接安装时，pnpm 克隆整个仓库、根即包根）：
  - `package.json` — `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` 声明
  - `cordis.patch.yml` — host 平面补丁：insert `mcp-chrome-devtools` 行（全局工具）
- `presets/chrome-devtools/` — 按会话的 agent preset：
  - `agent.cordis.yml` — 组装文件（复制自随附 `standard` preset + 同一 mcp 行 + 自带技能挂载）
  - `preset.yml` — 展示用元信息（id = 目录名，此处不可写）
  - `skills/chrome-devtools/SKILL.md` — 随 preset 分发的浏览器使用技能
- `scripts/install.mjs` — 跨平台一键安装（Windows/macOS/Linux，零依赖，Node ≥20）
- `docs/development.md` — 内部开发文档，**不允许上传至远程**（已在 .gitignore 中排除）
- `README.md` / `README.en.md` — 中英文使用者文档（互链；改安装方式、配置或故障排查时两版同步）

## 修改的规则

1. **两处 mcp 行必须保持一致**：仓库根 `cordis.patch.yml` 与
   `presets/chrome-devtools/agent.cordis.yml` 里的 `mcp-chrome-devtools` 行（serverName/
   command/args/超时）是同一份桥接配置的两个载体，改动一处必须同步另一处，否则文档的
   "两种形态等价"承诺失效。
2. `agent.cordis.yml` 保持"具名插件行组成的顶层列表"；服务行必须放进带 `isolate`
   realm 的 group；只消费服务、不发布服务的行（mcp 行、工具行）不需要 realm。
   bundle patch 是 host 平面，行进入 global 层——只放确需全局的能力。
3. `serverName` 在进程内所有 mcp-client 实例间唯一；`mcp__chrome-devtools__*`
   的公开名由 `(serverName, rawName)` 确定性生成，改名会改变模型看到的工具名。
4. `scripts/install.mjs` 保持零第三方依赖、纯 Node 标准库；新增平台分支时在
   Windows（含 .cmd 解析）与 POSIX 两侧都要验证。
5. 同步更新 `preset.yml`、SKILL.md、README.md 与 docs/development.md。

## 验证清单（改动后）

- [ ] `node scripts/install.mjs --check` 输出符合当前环境。
- [ ] bundle 安装：`node scripts/install.mjs --harness <harness路径>` 成功后，
      `node <harness>/apps/cli/lib/bin.js --profile web --dump-config` 输出含
      `mcp-chrome-devtools` 行；profile manifest 的 `dsh.profile.bundles` 含包名。
- [ ] preset 安装：`node scripts/install.mjs --preset` 幂等（重复执行输出"无需操作"）；
      roster 发现健康（临时动态插件查 `ctx.agentPresets.list()`，`broken` 为空）。
- [ ] 新会话（preset 模式）或宿主重启（bundle 模式）后出现 `mcp__chrome-devtools__*` 工具。
- [ ] `npx -y chrome-devtools-mcp@latest --help` 输出的选项与 README 表格一致（版本漂移时更新）。
- [ ] 未触碰部署目录与随附 preset；无遗留测试进程（chrome-devtools-mcp 服务器由宿主管理，属正常常驻）。

## 环境事实（本机）

- 部署：Harness checkout 在 `F:\github\deepseek-harness`，Web 服务运行于 127.0.0.1:32310，
  宿主 PID 117204；CLI 入口 `apps/cli/lib/bin.js`（已构建）。
- `$DSH_HOME = C:\Users\yuzia\.dsh`；用户 preset 根目录 `.agent-presets/`；
  web profile 目录 `profiles/web/`（bundles 栈：dsh-base、dsh-web-app）。
- Node v25.2.1 / npm 11.6.2 / pnpm 11.7.0（PATH 上）；Chrome 位于
  `C:\Program Files\Google\Chrome\Application\chrome.exe`。
- 会话沙箱（workspace-write）外写文件（如 `$DSH_HOME`）需要授权；网络直连
  GitHub/registry 常被策略阻止，需要文档事实时优先用官方仓库的已知稳定信息并标注来源。
