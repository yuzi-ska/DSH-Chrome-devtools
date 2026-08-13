# dsh-chrome-devtools — Chrome DevTools for DeepSeek Harness

[中文](README.md) | English

Give DeepSeek Harness agents control over a real Chrome browser via
[chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp):
navigation, clicking, typing, screenshots, DOM snapshots, console, network
requests, performance traces, and cookies.

**The only install path is the official `dsh plugin` one-command install**
(GitHub source; no clone required). This repository **root is itself an
official bundle plugin** (`package.json` declares `dsh.bundle`,
`cordis.patch.yml` is the patch layer): the MCP server row is built into the
plugin, so it is **ready to use right after install** — no extra components to
install, no MCP configuration to write.

## Features

- **One-command install**: `dsh plugin add github:...`; the package is reconciled
  into the profile's patch-layer stack automatically, zero manual config.
- **Ready to use**: the MCP row, tool namespace, timeouts, and reconnect policy
  are all built in. On first use npx downloads the server automatically and
  Chrome launches automatically; afterwards it stays resident.
- **Global**: after a host restart every session (including child agents) sees
  the `mcp__chrome-devtools__*` tools.
- **Real browser**: headed or headless Chrome, multiple tabs, cookies, network
  interception, performance traces.
- **Auto-reconnect**: the `dsh-mcp-client` supervisor restarts a crashed server
  with exponential backoff and a failure budget that prevents infinite restarts.
- **Cross-platform**: Windows / macOS / Linux; the bundled installer script is
  zero-dependency (pure Node standard library).

## Requirements

| Dependency | Notes |
|---|---|
| DeepSeek Harness | ships `@deepseek-ai/dsh-mcp-client`, the bridge plugin |
| Node.js ≥ 20 | `npx` on PATH |
| pnpm | package manager behind `dsh plugin` (`npm i -g pnpm` or `corepack enable`) |
| Chrome / Chromium / Edge | installed locally; pick one via `--channel` in the plugin `args` |

## Install

```bash
dsh plugin --profile web add github:yuzi-ska/DSH-Chrome-devtools
```

(Replace `web` with your profile name — `tui`, `headless`, etc.)

Then **restart the host** (`dsh web` / however you launch it). After the restart
every session sees tools such as `mcp__chrome-devtools__navigate_page`,
`take_snapshot`, `take_screenshot`, `list_console_messages`,
`get_network_request`, `performance_start_trace` (exact set per the
server's declaration). No further configuration is needed.

Uninstall:

```bash
dsh plugin --profile web remove dsh-chrome-devtools
```

### Repo installer script (development / local setups)

```bash
git clone https://github.com/yuzi-ska/DSH-Chrome-devtools.git
cd DSH-Chrome-devtools

node scripts/install.mjs            # installs into the web profile (local link; edits take effect after restart)
node scripts/install.mjs --check    # environment check (read-only)
node scripts/install.mjs --uninstall
```

```
node scripts/install.mjs [options]
  --check             environment check: node/pnpm/dsh/browser/DSH_HOME; writes nothing
  --uninstall         uninstall (dsh plugin remove)
  --profile <name>    target profile (default web)
  --dsh-home <path>   override DSH_HOME (default $DSH_HOME or ~/.dsh)
  --harness <path>    harness repo/install path (runs the CLI via node when dsh is not on PATH)
  --plugin-spec <s>   plugin source (default this repo root; npm name, git source, or local path)
  --package-name <n>  package name used by uninstall (default dsh-chrome-devtools)
```

## Architecture

```
Harness (profile composition)
   │
   │  bundle plugin patch layer (this repo's cordis.patch.yml)
   ▼
@deepseek-ai/dsh-mcp-client row (stdio, shipped with Harness; config built into the plugin)
   │
   ▼
chrome-devtools-mcp server (npx -y chrome-devtools-mcp@latest, spawned by the host; first-run auto download)
   │
   │  Chrome DevTools Protocol
   ▼
One shared Chrome instance (auto-launches the locally installed Chrome/Chromium/Edge)
```

- Every MCP tool is registered on `ctx.tools` as `mcp__chrome-devtools__<tool>` and
  called like a native tool by the model.
- One profile mounts one resident server: all sessions share the same browser.
- If the server crashes, the `dsh-mcp-client` supervisor reconnects with
  exponential backoff; after 10 consecutive failures the tools are unregistered
  (recover by restarting the host).
- Each tool call may run up to 120 seconds (configurable).

## Tool capabilities

Per the server's actual declaration (28 tools in the current version):

| Family | Tools (mcp__chrome-devtools__ prefix) |
|---|---|
| Pages | navigate_page / new_page / close_page / select_page / list_pages / resize_page |
| Snapshots | take_snapshot (DOM/accessibility tree) / take_screenshot |
| Interaction | click / fill / fill_form / type_text / press_key / hover / drag |
| Scripting | evaluate_script (run JS in the page, returns JSON) |
| Emulation | emulate (viewport/network/UA/geolocation/color scheme) |
| Console | list_console_messages / get_console_message |
| Network | list_network_requests / get_network_request (with request/response bodies) |
| Performance | performance_start_trace / performance_stop_trace / performance_analyze_insight |
| Auditing | lighthouse_audit |
| Other | handle_dialog / upload_file / wait_for |

## Configuration reference

The defaults work out of the box; the following are optional (restart the host
after editing `cordis.patch.yml`).

### The MCP row (built into the plugin)

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
| `serverName` | chrome-devtools | `[A-Za-z0-9_-]{1,32}`, unique across live mcp-client instances |
| `command` / `args` | npx ... | stdio launch command; `npx` resolves correctly on Windows via the SDK's cross-spawn |
| `toolCallTimeoutMs` | 120000 | per-tool-call timeout; loosen for page loads / traces |
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

## Sharing semantics

- Tools register in the host composition: every agent under the profile
  (including child agents) sees them.
- All sessions share one browser and server process, so browser state (tabs,
  cookies, console buffer) is visible across sessions.
- To isolate browser contexts: change `serverName` and `args` (e.g. `--isolated`
  or a separate `--user-data-dir`) in another instance.

## Security notes

- Browser capability is shell-level trust: it can read/write cookies, issue
  arbitrary requests, and reach internal networks. Use it only with trusted sessions.
- Page content (DOM snapshots, console, response bodies) enters the model context
  and session logs — beware sensitive pages.
- In global mode every request carries this tool family's schemas (token cost).
- With `failOnStartupError: false`, a server in a crash loop burns the reconnect
  budget and the tools are unregistered — deliberate failure visibility, no
  infinite restarts.

## Troubleshooting

| Symptom | Fix |
|---|---|
| First call is slow (30-60s+) | npx first download + Chrome launch; one-time cost, then resident |
| No browser tools appear | Check host logs for `mcp-client(chrome-devtools)`: reconnecting (warn), recovered (info), disabled-loss (error) |
| Tools missing after install | Bundle plugins load at startup — **restart the host**; the profile-layer config hot-reload does not apply new rows |
| Chrome missing/not found | Add `--channel` to `args` (e.g. `msedge`), or confirm default Chrome exists |
| npx download fails | Check npm registry connectivity; pin `args: ['-y', 'chrome-devtools-mcp@<version>']` |
| Attach an already-open Chrome | Start Chrome with `--remote-debugging-port=9222`, add `--browserUrl http://localhost:9222` to `args` |
| `dsh plugin` reports missing pnpm | Install pnpm (`npm i -g pnpm` or `corepack enable`) |
| Tool call times out | 120s per call; raise `toolCallTimeoutMs` for slow networks or stuck pages |
| EPERM when switching from a local link to a GitHub source | Windows junctions cannot be renamed over by pnpm: `dsh plugin remove` first, then add the new source |

## Development

```bash
git clone https://github.com/yuzi-ska/DSH-Chrome-devtools.git
cd DSH-Chrome-devtools

# local link install (edits to cordis.patch.yml take effect after restart; no push needed)
node scripts/install.mjs --harness <harness-repo-path>

# verify the composed tree without booting (boot-free)
node <harness>/apps/cli/lib/bin.js --profile web --dump-config | grep -A8 mcp-chrome-devtools
```

- After pushing, remote install: `dsh plugin --profile web add github:yuzi-ska/DSH-Chrome-devtools`.
- Internal development notes live in `docs/development.md` and are excluded from
  the remote repository (see .gitignore).

## References

- [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) (the server; tool list and CLI options per its README / docs/cli.md)
- [deepseek-ai/deepseek-harness — packages/mcp/mcp-client](https://github.com/deepseek-ai/deepseek-harness/tree/main/packages/mcp/mcp-client) (the Harness-side MCP client bridge)
- [deepseek-ai/deepseek-harness — packages/bundle](https://github.com/deepseek-ai/deepseek-harness/tree/main/packages/bundle) (bundle plugin mechanism)
- [deepseek-ai/deepseek-harness — apps/cli/src/plugin.ts](https://github.com/deepseek-ai/deepseek-harness/blob/main/apps/cli/src/plugin.ts) (the `dsh plugin` command)
