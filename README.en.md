# dsh-chrome-devtools — Chrome DevTools for DeepSeek Harness

[中文](README.md) | English

Give DeepSeek Harness agents control over a real Chrome browser via
[chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp):
navigation, clicking, typing, screenshots, DOM snapshots, console, network
requests, performance traces, and cookies.

This repository **root is itself an official bundle plugin** (`package.json`
declares `dsh.bundle`, `cordis.patch.yml` is the patch layer), installable with
one `dsh plugin` command straight from GitHub — no clone required.

## Features

- **Official plugin form**: one-command `dsh plugin` install; the package is
  reconciled into the profile's patch-layer stack automatically, zero manual
  config.
- **Global by default**: after a host restart every session (including child
  agents) sees the `mcp__chrome-devtools__*` tools.
- **Per-session alternative**: a bundled agent preset enables the tools for
  selected sessions only — no restart, no pnpm.
- **Real browser**: headed or headless Chrome, multiple tabs, cookies, network
  interception, performance traces.
- **Auto-reconnect**: the `dsh-mcp-client` supervisor restarts a crashed server
  with exponential backoff and a failure budget that prevents infinite restarts.
- **Cross-platform**: Windows / macOS / Linux; the installer script is zero-dependency
  (pure Node standard library).

## Installation comparison

| Form | Install command | Tool scope | Takes effect | Requires |
|---|---|---|---|---|
| **bundle plugin** (recommended) | `dsh plugin --profile web add github:yuzi-ska/DSH-Chrome-devtools` | **Global**: every session | Host restart | pnpm |
| **agent preset** (per-session) | `node scripts/install.mjs --preset` | Only sessions on that preset | New session | none |

## Architecture

```
Harness (profile composition)
   │
   │  bundle plugin patch layer (repo-root cordis.patch.yml) or preset rows (presets/chrome-devtools/agent.cordis.yml)
   ▼
@deepseek-ai/dsh-mcp-client row (stdio, shipped with Harness)
   │
   ▼
chrome-devtools-mcp server (npx -y chrome-devtools-mcp@latest, spawned by the host)
   │
   │  Chrome DevTools Protocol
   ▼
One shared Chrome instance (installed Chrome/Chromium/Edge)
```

- Every MCP tool is registered on `ctx.tools` as `mcp__chrome-devtools__<tool>` and
  called like a native tool by the model.
- One profile / one preset mounts one resident server: all sessions in the same
  scope share the same browser.
- If the server crashes, the `dsh-mcp-client` supervisor reconnects with
  exponential backoff; after 10 consecutive failures the tools are unregistered
  (recover by restarting the host or reloading the preset).
- Each tool call may run up to 120 seconds (configurable).

## Quick start

Prerequisites: Node.js 20+ (`npx` on PATH), a local Chrome / Chromium / Edge
install (`--channel` picks the browser), and pnpm for bundle mode.

### Option 1: one-command GitHub install (global, recommended)

```bash
dsh plugin --profile web add github:yuzi-ska/DSH-Chrome-devtools
```

Then **restart the host** (`dsh web` / however you launch it). After the restart
every session sees tools such as `mcp__chrome-devtools__browser_navigate`,
`dom_snapshot`, `browser_screenshot`, `console_list_messages`,
`network_get_response_body`, `performance_start_trace` (exact set per the
server's declaration).

Uninstall:

```bash
dsh plugin --profile web remove dsh-chrome-devtools
```

### Option 2: repo installer script (local development)

```bash
git clone https://github.com/yuzi-ska/DSH-Chrome-devtools.git
cd DSH-Chrome-devtools

node scripts/install.mjs            # installs into the web profile (local link; edits take effect after restart)
node scripts/install.mjs --check    # environment check (read-only)
node scripts/install.mjs --uninstall
```

The script is equivalent to `dsh plugin --profile web add <this repo>`.

### Option 3: agent preset (per-session)

```bash
node scripts/install.mjs --preset
```

Copies `presets/chrome-devtools/` to `$DSH_HOME/.agent-presets/chrome-devtools/`.
New sessions can then pick the **Chrome DevTools Agent** preset (Settings →
General can make it the default). No restart, no pnpm. Sessions load the
`chrome-devtools` skill (SKILL.md) with usage guidance for each tool family.

Both forms can coexist (global bundle tools + preset skill); `serverName` must be
unique per process, so do not mount two `serverName: chrome-devtools` instances.

### Installer options

```
node scripts/install.mjs [options]
  --preset            install the agent preset (per-session) instead of the bundle plugin (global)
  --check             environment check: node/pnpm/dsh/browser/DSH_HOME; writes nothing
  --uninstall         uninstall (bundle: dsh plugin remove; preset: delete the directory)
  --profile <name>    target profile (default web)
  --dsh-home <path>   override DSH_HOME (default $DSH_HOME or ~/.dsh)
  --harness <path>    harness repo/install path (runs the CLI via node when dsh is not on PATH)
  --plugin-spec <s>   plugin source (default this repo root; npm name, git source, or local path)
  --package-name <n>  package name used by bundle uninstall (default dsh-chrome-devtools)
  --force             overwrite an existing different preset directory
  --yes               do not ask before delete-type operations
```

## Tool capabilities

Per the server's actual declaration; main tool families:

| Family | Tools (mcp__chrome-devtools__ prefix) |
|---|---|
| Browser | browser_navigate / browser_reload / browser_navigate_history / browser_back / browser_forward |
| Tabs | browser_new_tab / browser_select_tab / browser_close_tab / browser_focus_tab |
| DOM | dom_snapshot / dom_snapshot_meta |
| Interaction | browser_click / browser_type / browser_press_key / browser_hover / browser_scroll / browser_resize |
| Screenshots | browser_screenshot(fullPage, format) |
| Console | console_enable / console_list_messages / console_disable |
| Network | network_enable / network_get_response_body / network_set_extra_http_headers / network_block_urls |
| Performance | performance_start_trace / performance_stop_trace |
| Storage | storage_get_cookies / storage_set_cookie / storage_delete_cookie / storage_clear_cookies |
| Emulation | emulation tools (when the server declares them) |

## Configuration reference

### The MCP row (identical in repo-root cordis.patch.yml and presets/chrome-devtools/agent.cordis.yml)

```yaml
- id: mcp-chrome-devtools
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: chrome-devtools     # tool namespace: mcp__chrome-devtools__*
    transport: stdio
    command: npx
    args: ['-y', 'chrome-devtools-mcp@latest']
    toolCallTimeoutMs: 120000
    failOnStartupError: false
```

| Field | Default | Meaning |
|---|---|---|
| `serverName` | required | `[A-Za-z0-9_-]{1,32}`, unique across live mcp-client instances |
| `command` / `args` | required | stdio launch command; `npx` resolves correctly on Windows via the SDK's cross-spawn |
| `toolCallTimeoutMs` | 60000 | per-tool-call timeout; loosen for page loads / traces |
| `failOnStartupError` | false | true rejects the composition on first-connect failure; false logs and retries with backoff |
| `env` / `cwd` | empty | extra env vars / working directory (defaults to the host's) |
| `reconnect.*` | see docs | backoff budget: initialDelayMs 500 / maxDelayMs 30000 / maxAttempts 10 |

### chrome-devtools-mcp server options (put them in `args`)

| Option | Effect |
|---|---|
| `--headless` | headless mode, no visible window |
| `--channel <name>` | pick the browser: `chrome` (default) / `stable` / `beta` / `dev` / `canary` / `msedge` / executable path |
| `--browserUrl <url>` | attach to an already-running Chrome (e.g. `http://localhost:9222`) |
| `--isolated` | a fresh isolated Chrome profile per server process |
| `--viewport <WxH>` | fixed window/viewport size, e.g. `1280x720` |
| `--proxy-server <url>` | route the browser through a proxy |
| `--user-data-dir <path>` | custom Chrome user-data directory |
| `--keepAlive` | keep the server alive when all MCP connections close (default on) |

See the official [docs/cli.md](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/cli.md) for the full list.

## Session and sharing semantics

- **Bundle plugin (global)**: tools register in the host composition; every
  agent under the profile (including child agents) sees them. All sessions share
  one browser and server process, so browser state (tabs, cookies, console
  buffer) is visible across sessions.
- **Preset (per-session)**: only sessions on that preset share the browser;
  other presets are unaffected.
- To isolate browser contexts: copy the preset and change `serverName` and `args`
  (e.g. `--isolated` or a separate `--user-data-dir`).

## Security notes

- Browser capability is shell-level trust: it can read/write cookies, issue
  arbitrary requests, and reach internal networks. Use it only with trusted sessions.
- Page content (DOM snapshots, console, response bodies) enters the model context
  and session logs — beware sensitive pages.
- In global mode every request carries this tool family's schemas (token cost);
  deployments that do not need browser capability should use preset mode.
- With `failOnStartupError: false`, a server in a crash loop burns the reconnect
  budget and the tools are unregistered — deliberate failure visibility, no
  infinite restarts.

## Troubleshooting

| Symptom | Fix |
|---|---|
| First call/session is slow (30-60s+) | npx first download + Chrome launch; one-time cost, then resident |
| No browser tools appear | Check host logs for `mcp-client(chrome-devtools)`: reconnecting (warn), recovered (info), disabled-loss (error) |
| Chrome missing/not found | Add `--channel` to `args` (e.g. `msedge`), or confirm default Chrome exists |
| npx download fails | Check npm registry connectivity; pin `args: ['-y', 'chrome-devtools-mcp@<version>']` |
| Attach an already-open Chrome | Start Chrome with `--remote-debugging-port=9222`, add `--browserUrl http://localhost:9222` to `args` |
| `dsh plugin` reports missing pnpm | Install pnpm (`npm i -g pnpm` or `corepack enable`); preset mode does not need pnpm |
| Tool call times out | 120s per call; raise `toolCallTimeoutMs` for slow networks or stuck pages |
| serverName conflict after double install | `serverName` must be unique per process; keep one, rename or remove the other |
| EPERM when switching from a local link to a GitHub source | Windows junctions cannot be renamed over by pnpm: `dsh plugin remove` first, then add the new source |
| Tools missing after install | Bundle plugins load at startup — **restart the host**; the profile-layer config hot-reload does not apply new rows |

## Development

```bash
git clone https://github.com/yuzi-ska/DSH-Chrome-devtools.git
cd DSH-Chrome-devtools

# local link install (edits to cordis.patch.yml take effect after restart; no push needed)
node scripts/install.mjs --harness <harness-repo-path>

# verify the composed tree without booting (boot-free)
node <harness>/apps/cli/lib/bin.js --profile web --dump-config | grep -A8 mcp-chrome-devtools
```

- When editing the `mcp-chrome-devtools` row in `cordis.patch.yml`, update the
  identical row in `presets/chrome-devtools/agent.cordis.yml` — the two must stay
  in sync.
- After pushing, remote install: `dsh plugin --profile web add github:yuzi-ska/DSH-Chrome-devtools`.
- Internal development notes live in `docs/development.md` and are excluded from
  the remote repository (see .gitignore).

## References

- [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) (the server; tool list and CLI options per its README / docs/cli.md)
- [deepseek-ai/deepseek-harness — packages/mcp/mcp-client](https://github.com/deepseek-ai/deepseek-harness/tree/main/packages/mcp/mcp-client) (the Harness-side MCP client bridge)
- [deepseek-ai/deepseek-harness — packages/bundle](https://github.com/deepseek-ai/deepseek-harness/tree/main/packages/bundle) (bundle plugin mechanism)
- [deepseek-ai/deepseek-harness — packages/preset/agent-presets](https://github.com/deepseek-ai/deepseek-harness/tree/main/packages/preset/agent-presets) (preset mechanism)
- [deepseek-ai/deepseek-harness — apps/cli/src/plugin.ts](https://github.com/deepseek-ai/deepseek-harness/blob/main/apps/cli/src/plugin.ts) (the `dsh plugin` command)
