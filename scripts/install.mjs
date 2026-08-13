#!/usr/bin/env node
/**
 * dsh-chrome-devtools 一键安装脚本（Windows / macOS / Linux，零第三方依赖）。
 *
 * 唯一安装方式：官方 bundle 插件——把本仓库以 `dsh plugin` 机制装进目标 profile
 * （宿主重启后全局工具 mcp__chrome-devtools__* 生效）。mcp 行由插件自带，
 * 无需任何手动配置。
 *
 * 用法：
 *   node scripts/install.mjs                     # 安装到 web profile
 *   node scripts/install.mjs --check             # 环境自检（不写任何文件）
 *   node scripts/install.mjs --uninstall         # 卸载
 *   node scripts/install.mjs --profile tui       # 指定 profile
 *   node scripts/install.mjs --harness <path>    # 指定 harness 仓库（本机开发，dsh 不在 PATH 时）
 *   node scripts/install.mjs --plugin-spec <s>   # 覆盖插件源（默认本仓库根目录）
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_PLUGIN_SOURCE = REPO_ROOT
const DEFAULT_PACKAGE_NAME = 'dsh-chrome-devtools'
const MIN_NODE_MAJOR = 20

// ---- 参数解析 ---------------------------------------------------------------

const args = process.argv.slice(2)
const opts = {
  action: 'install', // install | check | uninstall
  profile: 'web',
  dshHome: process.env.DSH_HOME ?? join(process.env.HOME ?? process.env.USERPROFILE ?? '', '.dsh'),
  harness: process.env.DSH_BIN ?? '',
  pluginSpec: '',
  packageName: DEFAULT_PACKAGE_NAME,
  quiet: false,
}

function usage() {
  console.log(`dsh-chrome-devtools installer

用法:
  node scripts/install.mjs [options]

选项:
  --check             环境自检：node/pnpm/dsh/浏览器/DSH_HOME，不写任何文件
  --uninstall         卸载（dsh plugin remove）
  --profile <name>    目标 profile（默认 web）
  --dsh-home <path>   覆盖 DSH_HOME（默认 $DSH_HOME 或 ~/.dsh）
  --harness <path>    harness 仓库/安装路径（dsh 不在 PATH 时用 node 直接跑 CLI）
  --plugin-spec <s>   插件源（默认本仓库根目录；可填 npm 包名、git 源或本地路径）
  --package-name <n>  卸载时按此包名移除（默认 ${DEFAULT_PACKAGE_NAME}）
  -h, --help          显示本帮助`)
}

for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  const next = () => args[++i]
  switch (arg) {
    case '-h': case '--help': usage(); process.exit(0); break
    case '--check': opts.action = 'check'; break
    case '--uninstall': opts.action = 'uninstall'; break
    case '--profile': opts.profile = next() ?? ''; break
    case '--dsh-home': opts.dshHome = next() ?? ''; break
    case '--harness': opts.harness = next() ?? ''; break
    case '--plugin-spec': opts.pluginSpec = next() ?? ''; break
    case '--package-name': opts.packageName = next() ?? ''; break
    default:
      console.error(`未知参数: ${arg}\n`)
      usage()
      process.exit(2)
  }
}

if (opts.profile === '' || opts.dshHome === '') {
  console.error('--profile / --dsh-home 不能为空')
  process.exit(2)
}

// ---- 基础工具 ---------------------------------------------------------------

/** cmd 参数引号：含空白或 cmd 元字符时用双引号包裹，内部引号翻倍。 */
function cmdQuote(value) {
  return /[\s"&|<>^%]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** 跨平台运行一个命令并返回结果。Windows 下命令多为 .cmd shim
 *  （pnpm/npx/dsh），Node 因 CVE-2024-27980 加固不再直接 spawn .cmd；
 *  官方 `dsh plugin` 用 shell:true（Node 25 会报 DEP0190 拼接警告），
 *  这里改用 cmd.exe /c + 手动引号，行为相同且参数显式可控。 */
function run(command, cmdArgs, options = {}) {
  if (process.platform === 'win32') {
    const cmdLine = [cmdQuote(command), ...cmdArgs.map(cmdQuote)].join(' ')
    return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', cmdLine], {
      encoding: 'utf8',
      ...options,
    })
  }
  return spawnSync(command, cmdArgs, { encoding: 'utf8', ...options })
}

function log(step, message) {
  if (!opts.quiet) console.log(`[${step}] ${message}`)
}

// ---- 环境定位 ---------------------------------------------------------------

/** 定位 dsh 可执行文件：DSH_BIN → PATH → --harness（node 直接跑 CLI）。 */
function resolveDshInvocation() {
  if (opts.harness !== '') {
    const bin = join(opts.harness, 'apps', 'cli', 'lib', 'bin.js')
    if (!existsSync(bin)) {
      return { error: `--harness 下找不到已构建的 CLI: ${bin}（先在 harness 仓库执行 pnpm build）` }
    }
    return { command: process.execPath, args: [bin] }
  }
  const probe = run('dsh', ['--version'])
  if (probe.error === undefined) return { command: 'dsh', args: [] }
  return { error: 'PATH 上找不到 dsh。安装 @deepseek-ai/dsh（npm i -g），或传 --harness <harness仓库路径>' }
}

function findPnpm() {
  const probe = run('pnpm', ['--version'])
  if (probe.error === undefined) return probe.stdout.trim() || '可用'
  // 受限环境（如文件沙箱）下管道捕获输出会被拒：改用 stdio:'ignore'
  // 只探测命令存在性（spawn 的 inherit/ignore 不受此限制）。
  const probeIgnore = run('pnpm', ['--version'], { stdio: 'ignore' })
  return probeIgnore.error === undefined ? '可用（版本未知，受限环境）' : ''
}

/** 常见 Chrome/Chromium/Edge 安装位置（提示性检测，chrome-devtools-mcp 自带查找逻辑）。 */
function findBrowser() {
  const candidates =
    process.platform === 'win32'
      ? [
          join(process.env.ProgramFiles ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
          join(process.env['ProgramFiles(x86)'] ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
          join(process.env.ProgramFiles ?? '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
          join(process.env['ProgramFiles(x86)'] ?? '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        ]
      : process.platform === 'darwin'
        ? [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
          ]
        : []
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  if (process.platform === 'linux') {
    for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) {
      const probe = run(name, ['--version'])
      if (probe.error === undefined) return `${name} (PATH)`
    }
  }
  return ''
}

const profileDir = () => join(opts.dshHome, 'profiles', opts.profile)
const pluginSpec = () => (opts.pluginSpec !== '' ? opts.pluginSpec : resolve(DEFAULT_PLUGIN_SOURCE))

// ---- 子命令：check ----------------------------------------------------------

function cmdCheck() {
  console.log('环境自检：')
  console.log(`  node        v${process.versions.node}（需要 >= ${MIN_NODE_MAJOR}）`)
  const pnpm = findPnpm()
  console.log(`  pnpm        ${pnpm !== '' ? pnpm : '未找到（dsh plugin 依赖 pnpm）'}`)
  const browser = findBrowser()
  console.log(`  浏览器      ${browser !== '' ? browser : '未检测到 Chrome/Chromium/Edge（可在插件 args 加 --channel 指定）'}`)
  console.log(`  DSH_HOME    ${opts.dshHome}${existsSync(opts.dshHome) ? '' : '（目录不存在）'}`)
  console.log(`  profile     ${opts.profile} @ ${profileDir()}${existsSync(profileDir()) ? '' : '（尚未初始化，dsh plugin 首次使用会自动创建）'}`)
  const dsh = resolveDshInvocation()
  if (dsh.error) console.log(`  dsh         ${dsh.error}`)
  else console.log(`  dsh         ${dsh.command} ${dsh.args.join(' ')}`.trimEnd())
  const manifest = bundleInstalledManifest()
  const installed = manifest && (manifest.dependencies ?? {})[opts.packageName]
  console.log(`  插件        ${installed ? `已安装（${installed}）` : '未安装'}`)
}

// ---- 子命令：安装/卸载 -------------------------------------------------------

function bundleInstalledManifest() {
  const manifestPath = join(profileDir(), 'package.json')
  if (!existsSync(manifestPath)) return null
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch {
    return null
  }
}

function cmdBundleInstall() {
  const pnpm = findPnpm()
  if (pnpm === '') {
    console.error('[install] 未找到 pnpm（dsh plugin 依赖 pnpm 管理 profile 依赖）。')
    console.error('  安装 pnpm：npm i -g pnpm（或 corepack enable），再重试')
    process.exit(1)
  }
  const dsh = resolveDshInvocation()
  if (dsh.error) {
    console.error(`[install] ${dsh.error}`)
    process.exit(1)
  }
  const spec = pluginSpec()
  if (!/^[a-zA-Z@]|^file:|^link:|^git\+|^github:|\.git(?:#|$)/.test(spec) && !existsSync(spec)) {
    console.error(`[install] 插件源无效: ${spec}`)
    process.exit(1)
  }
  log('install', `dsh plugin --profile ${opts.profile} add ${spec}`)
  const result = run(dsh.command, [...dsh.args, 'plugin', '--profile', opts.profile, 'add', spec], { stdio: 'inherit' })
  if (result.status !== 0) {
    console.error(`[install] dsh plugin 失败（exit ${result.status ?? 'null'}）。检查上面的输出。`)
    process.exit(1)
  }
  log('install', '安装完成。')
  console.log('  重启 dsh 后生效：所有会话将出现 mcp__chrome-devtools__* 工具（无需任何额外配置）。')
  console.log('  卸载：node scripts/install.mjs --uninstall')
}

function cmdBundleUninstall() {
  const dsh = resolveDshInvocation()
  if (dsh.error) {
    console.error(`[uninstall] ${dsh.error}`)
    process.exit(1)
  }
  const manifest = bundleInstalledManifest()
  if (!manifest || !(manifest.dependencies ?? {})[opts.packageName]) {
    console.log(`[uninstall] ${opts.packageName} 未安装在 profile ${opts.profile}，无需卸载。`)
    return
  }
  log('uninstall', `dsh plugin --profile ${opts.profile} remove ${opts.packageName}`)
  const result = run(dsh.command, [...dsh.args, 'plugin', '--profile', opts.profile, 'remove', opts.packageName], { stdio: 'inherit' })
  if (result.status !== 0) process.exit(1)
  console.log('  已卸载。重启 dsh 后工具移除。')
}

// ---- 主流程 ---------------------------------------------------------------

if (opts.action === 'check') {
  cmdCheck()
} else if (opts.action === 'uninstall') {
  cmdBundleUninstall()
} else {
  cmdBundleInstall()
}
