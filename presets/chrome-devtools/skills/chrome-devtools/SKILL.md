# Chrome DevTools 浏览器操控

本 preset 通过 [`chrome-devtools-mcp`](https://github.com/ChromeDevTools/chrome-devtools-mcp)
把真实 Chrome 的操控能力暴露为 `mcp__chrome-devtools__*` 工具。每个工具调用都作用于
**同一个共享浏览器实例**：标签页、历史、Cookie、控制台消息在调用之间持续存在。

## 核心工作流

1. **导航**：`browser_navigate(url)` 打开或跳转页面。
2. **观察**：`dom_snapshot()` 拿结构和文本（事实来源）；`browser_screenshot()` 拿视觉证据。
3. **操作**：`browser_click(selector)`、`browser_type(text, selector?)`、`browser_press_key(key, selector?)`、`browser_hover(selector)`。
4. **验证**：再次 `dom_snapshot()` / `browser_screenshot()`，或查 `console_list_messages()`。

导航后页面可能仍在加载：先重新快照再操作，不要依赖上一次快照的 DOM。

## 工具族速查

| 族 | 工具 | 用途 |
|---|---|---|
| 浏览器 | browser_navigate / navigate_history / reload / back / forward | 页面与历史 |
| 标签页 | browser_new_tab / select_tab / close_tab / focus_tab | 多标签管理，标签状态各自独立 |
| DOM | dom_snapshot / dom_snapshot_meta | 页面结构与文本；meta 给出标签页总览 |
| 交互 | browser_click / type / press_key / hover / scroll / resize | 用户操作 |
| 截图 | browser_screenshot(fullPage, format) | 视觉事实来源；长页先滚动或 fullPage |
| 控制台 | console_enable / console_list_messages / console_disable | 页面错误与日志；**只收集 enable 之后的消息** |
| 网络 | network_enable / get_response_body / set_extra_http_headers / block_urls | 请求拦截与响应体；**同样只覆盖 enable 之后** |
| 性能 | performance_start_trace / stop_trace | 录制性能轨迹 |
| 存储 | storage_get_cookies / set_cookie / delete_cookie / clear_cookies | Cookie 管理 |
| 模拟 | emulation 相关工具（若服务器声明） | 设备/视口模拟 |

具体工具与参数以服务器实际声明为准（工具描述即 schema）。

## 实用要点

- **选择器**：优先从 `dom_snapshot` 结果里挑唯一、稳定的 CSS 选择器（`id`、`data-*`、稳定 class），不要猜。
- **输入前先聚焦**：`browser_click(selector)` 聚焦后 `browser_type(text)`，避免输入丢失。
- **截图是视觉真相**：布局、样式、遮挡问题只能靠截图确认；`browser_screenshot` 返回图像。
- **调试前端**：复现问题 → `console_list_messages` 看报错 → `network_get_response_body` 看请求响应 → 修复 → 刷新验证。
- **性能分析**：`performance_start_trace` → 复现操作 → `performance_stop_trace`，分析轨迹。
- **调用超时**：单次调用最长 120 秒；慢页面加载时工具可能等待较久，属正常。
- **出错时先快照**：工具报错或结果异常，先 `dom_snapshot`/`browser_screenshot` 看页面实际状态，再决定下一步。
- **隐私与安全**：浏览器与 shell 同级信任，可读 Cookie、可发任意请求、可访问内网。只在用户明确授权的工作范围内使用。

## 常见坑

- 控制台/网络工具只返回 `*_enable` 之后的数据；排查加载期错误要在 `navigate` **之前** enable。
- 页面重定向或 SPA 路由变化后，旧快照失效，需重新快照。
- 无头模式（`--headless`）下工具行为一致，只是没有可见窗口。
- 服务器与浏览器由宿主进程管理：崩溃会自动重连（指数退避）；连续失败 10 次后工具被注销，需重启宿主或重载 preset。
