# Dark Factory + Paperclip Full Chinese Localization Archive

Date: 2026-05-04

Branch: `fork-master-product`

## Summary

This archive records the full Chinese localization pass for the fork-owned Paperclip + Dark Factory integration.

The work has two layers:

1. Paperclip host WebUI zh-CN display layer.
2. Dark Factory bridge plugin visible UI and operator-facing message cleanup.

The localization is intentionally display-only. Protocol identifiers, API field names, enum values, hook names, evidence schema keys, model names, package names, command names, and code/log payloads remain stable and mostly English.

## Scope

### Paperclip Host WebUI

Implemented a fork-only zh-CN localization layer in:

- `ui/src/lib/zhCnLocalization.ts`
- `ui/src/lib/zhCnLocalization.test.ts`
- `ui/src/main.tsx`

The layer:

- Sets `document.documentElement.lang = "zh-CN"`.
- Translates visible text nodes after React render.
- Translates common visible attributes:
  - `aria-label`
  - `title`
  - `placeholder`
  - `alt`
- Uses `MutationObserver` so dialogs, panels, popovers, and dynamically loaded content are localized after insertion.
- Skips `SCRIPT`, `STYLE`, `CODE`, `PRE`, `KBD`, and `TEXTAREA` nodes to avoid corrupting command snippets, code blocks, shortcut keys, and raw payloads.

The centralized dictionary covers common host surfaces:

- Shell navigation: home, inbox, issues, dashboard, settings, profile.
- Auth and onboarding flows.
- Company access, invites, join requests, and instance access.
- Plugin manager, plugin settings, adapter manager, and company environments.
- Issues, documents, revisions, filters, properties, and attachments.
- Agents, routines, runs, runtime logs, and transcript surfaces.
- Costs, budgets, providers, billers, finance ledger, and activity pages.
- Workspace, worktree, source-control, restart, and runtime-control surfaces.

### Dark Factory Bridge Plugin

Cleaned visible plugin-owned text in:

- `packages/plugins/integrations/dark-factory-bridge/src/ui/index.tsx`
- `packages/plugins/integrations/dark-factory-bridge/src/ui-smoke-preview-browser-harness.ts`
- `packages/plugins/integrations/dark-factory-bridge/src/remote-provider-readiness.ts`
- `packages/plugins/integrations/dark-factory-bridge/src/remote-provider-active-context.ts`
- `packages/plugins/integrations/dark-factory-bridge/src/remote-provider-observability.ts`
- `packages/plugins/integrations/dark-factory-bridge/src/manifest.ts`

The plugin UI now displays Chinese labels for:

- Projection summary.
- Provider health.
- Remote credential diagnostics.
- Remote observability alerts.
- Remote circuit breaker.
- Remote readiness report.
- Preflight plan.
- Dry-run guard receipt.
- Browser smoke preview panel.

Machine-readable values are displayed as Chinese label plus original value where useful, for example:

- `就绪 (ready)`
- `Provider 不可用 (provider_unavailable)`
- `远程预检：执行 (dark_factory_remote_preflight_execute)`

This keeps the UI readable for Chinese operators while preserving exact operational vocabulary for debugging.

## Explicit Non-Goals

The localization pass does not:

- Rename package names.
- Rename TypeScript symbols.
- Rename SDK hook names.
- Rename database or evidence schema keys.
- Translate JSON protocol values that external callers depend on.
- Translate command snippets, code blocks, shortcut key names, or raw logs.
- Change behavior of Dark Factory bridge runtime hooks.
- Change real provider connectivity or production-readiness gates.

## Boundary Compliance

The following Dark Factory boundaries remain unchanged:

- Dark Factory Journal remains truth source.
- `authoritative: false` remains the output boundary for projection surfaces.
- `terminalStateAdvanced: false` remains unchanged for bridge plugin outputs.
- No real provider call is added by localization code.
- No credentials or secret values are read, printed, stored, or committed.
- No Plugin SDK code is modified.
- No Paperclip core/server model semantics are changed.

## Verification Plan

Required verification for this pass:

1. Dark Factory bridge plugin:
   - `pnpm typecheck`
   - `pnpm build`
   - `pnpm test`

2. Paperclip UI:
   - `pnpm typecheck`
   - `pnpm exec vitest run --config ./vitest.config.ts src/lib/zhCnLocalization.test.ts`
   - `pnpm build`

3. Browser smoke verification:
   - Open the local Paperclip WebUI with browser-harness.
   - Confirm `document.documentElement.lang === "zh-CN"`.
   - Confirm visible shell text such as Settings/Plugins/Company Environments is localized.
   - Confirm Dark Factory plugin page / preview panel displays Chinese operator labels.
   - Confirm protocol identifiers such as `onEnvironmentExecute` and `dark-factory-journal` remain unchanged where they appear as protocol values.

## Validation Results

The implementation was validated locally before archive completion:

- Dark Factory bridge plugin `pnpm typecheck`: pass.
- Dark Factory bridge plugin `pnpm build`: pass.
- Dark Factory bridge plugin `pnpm test`: pass.
- Paperclip UI `pnpm typecheck`: pass.
- Paperclip UI localization unit test: pass.
- Paperclip UI `pnpm build`: pass.

Browser-harness validation:

- Paperclip host WebUI URL: `http://127.0.0.1:3100/instance/settings/plugins`
- Host WebUI DOM language: `zh-CN`
- Confirmed Chinese text:
  - `插件功能仍处于 alpha 阶段。`
  - `插件运行时和 API 面仍在变化。该能力稳定前可能出现破坏性变更。`
  - `已安装插件`
  - `就绪`
  - `配置`
  - `命令面板`
  - `搜索要运行的命令...`
- Confirmed no observed half-localized text for:
  - `插件 are alpha`
  - `搜索 for a command`

Dark Factory standalone smoke preview browser-harness validation:

- Preview URL used for verification: `http://127.0.0.1:4179/`
- Preview DOM language: `zh-CN`
- Page title: `Dark Factory Bridge WebUI 预览`
- Confirmed Chinese text:
  - `UI 烟雾预览`
  - `生成时间`
  - `远程 Provider alpha 已准备好进行受控 probe。`
  - `预览状态`
  - `就绪 (ready)`
  - `事实来源`
  - `是否权威`
  - `是否推进终态`
  - `远程 Provider Dry-run 防护`

The standalone preview was verified with a temporary port `4179` so the test could start and stop the preview server in one controlled browser-harness command without leaving a background process behind.

## Maintenance Strategy

This is a fork-only display layer. It is intentionally centralized so upstream rebases do not require editing hundreds of UI components.

When new Paperclip pages or plugin surfaces are added:

1. Add common operator-visible text to `EXACT_TRANSLATIONS`.
2. Add sentence-level dynamic text to `PHRASE_TRANSLATIONS`.
3. Add a focused unit assertion for common high-traffic phrases.
4. Verify in browser-harness after rebuild or dev-server restart.

If upstream later adds native i18n, this display layer should be replaced with the upstream mechanism rather than expanded indefinitely.

## Browser-Harness Full-Page Final Pass

Date: 2026-05-04

This final pass used browser-harness against the live local Paperclip WebUI at
`http://127.0.0.1:3100` after the fork-only zh-CN display layer was expanded.

Coverage:

- Full audit seed/discovery run: 76 routes earlier in the pass, then final
  stable run over 67 reachable routes after reconnecting browser-harness.
- Targeted final route sweep: 16 high-traffic and previously problematic routes:
  dashboard, live runs, company settings, environments, access, invites,
  agent creation, routines, costs, activity, issue detail, profile, general
  settings, instance access, plugin manager, and adapters.
- DOM language confirmed as `zh-CN` on all targeted pages.

Browser-harness fixes completed in this pass:

- Main shell and route navigation: dashboard, inbox, work, projects, agents,
  company, org, skills, costs, activity, settings, board.
- Dashboard and live-run copy: no-agent state, run counters, issue status,
  active/recent section, priority/status charts, success rate, and run activity.
- Company settings: appearance, hiring, company packages, import/export move
  notice, danger zone, access grants/actions, invite roles, and join-request
  queue copy.
- Agent creation: model labels, low-cost profile description, runtime policy,
  environment variables, optional company skills, and CEO helper text.
- Routines: empty state, new routine controls, recent runs, routine count, and
  recurring workflow explanation.
- Costs: period controls, inference spend, budget, usage, debit/credit/net,
  provider/biller tabs, finance ledger, and empty states.
- Activity and issue detail: event action labels, relative time labels, issue
  conversation empty state, related-work labels, reviewer/approver labels, and
  Dark Factory projection label cleanup.
- Instance settings: profile, general preferences, backup retention, feedback
  sharing, access, heartbeats, plugins, and adapters.

Final browser-harness targeted result:

- 16/16 targeted high-traffic routes opened successfully.
- All targeted routes reported `document.documentElement.lang === "zh-CN"`.
- No targeted ordinary UI label remained in the tracked bad-string list after
  the final fixes. The tracked list included `WORK`, `PROJECTS`, `COMPANY
  PACKAGES`, `公司 PACKAGES`, `最近 TASKS`, `主色 MODEL`, `活跃 / RECENT`,
  `1 open, 0`, `created company`, `plugin installed`, `Enable Environments in
  instance`, `启用环境 in instance`, and `No routines yet. Use`.

Allowed remaining English categories:

- Product and provider names: Paperclip, Dark Factory, OpenClaw, Claude,
  OpenAI-compatible names, built-in adapter IDs.
- Protocol and machine values: `primary_execution`, `execution_model`,
  `role_based_runtime_selection`, `observed`, `degraded`, `needs_approval`,
  Journal cursors, receipt IDs, run IDs, package names, and hook/field names.
- User or seed data: email addresses such as `local@paperclip.local`, company
  and issue names containing English by design.
- Code-like or documentation content: bundled skill markdown, plugin package
  descriptions, command snippets, JSON field names, and values inside `code`,
  `pre`, `kbd`, `textarea`, or raw log contexts.

Implementation notes:

- The zh-CN layer remains centralized in `ui/src/lib/zhCnLocalization.ts`.
- It now performs delayed post-install rescans and hash/popstate rescans to catch
  React route transitions and lazy-loaded panels.
- The `Alpha` translation was made idempotent (`测试阶段`) to avoid repeated
  `Alpha 阶段 阶段...` expansion across repeated DOM scans.
- The walker still skips code-like nodes to avoid corrupting protocol values,
  command snippets, and logs.

Verification additions:

- `ui/src/lib/zhCnLocalization.test.ts` now covers browser-harness-discovered
  settings, dashboard, costs, adapters, access, company settings, invite flows,
  routines, dynamic mixed Chinese/English sentences, and idempotency cases.
- Latest focused unit verification: 8/8 tests passed.
- Browser-harness targeted final verification was recorded in
  `C:\Users\76914\AppData\Local\Temp\paperclip-localization-targeted-final-3.json`.

Final full-page browser-harness rerun after the last two cleanup fixes:

- 52/52 reachable pages and subpages opened successfully in-process through
  browser-harness.
- 52/52 reported `document.documentElement.lang === "zh-CN"`.
- 0 tracked ordinary UI English/mixed-language residuals remained.
- Fixed final residuals:
  - `最近 Tasks` / `最近 TASKS` on the dashboard.
  - Split-node company settings sentence:
    `导入 and export have moved to dedicated pages accessible from the 组织 Chart header.`
- Final evidence file:
  `C:\Users\76914\AppData\Local\Temp\paperclip-localization-final-full-sweep-20260504-after-fix.json`.

## Single-Tab Browser-Harness Follow-Up Sweep

Date: 2026-05-04

This follow-up was performed after the operator reported that too many Chrome
pages had been left open during inspection. The browser-harness workflow was
changed to a strict single-tab policy:

- Reuse the existing Chrome page target with `ensure_real_tab()` and
  `goto_url(...)`.
- Do not call `new_tab()`.
- Check `/json/list` / `Target.getTargets` during the run.
- Confirm the final `pageTargets` count is `1`.

Additional fixes completed in this follow-up:

- Command palette search, empty state, section headings, actions, and page
  entries are Chinese.
- Agent instruction file editor labels were localized, including `Files`,
  `Create`, `Cancel`, `Delete`, `Copy as markdown`, `Deprecated virtual file`,
  `New file in this bundle`, `File contents`, `virtual file`, and `entry`.
- Import/export pages now use `GitHub 地址`, `本地压缩包`, and
  `Paperclip 压缩包`; generated README copy now describes the package as
  `Paperclip 代理公司包（Agent Company）`.
- Dark Factory bridge plugin metadata now displays `日志游标`, `提供方健康`,
  and `重建回执` instead of mixed English operator text.
- The runtime zh-CN display layer now allows common Chinese punctuation in
  safe text nodes and includes phrase rules for browser-discovered mixed
  Chinese/English fragments.

Single-tab browser-harness route coverage:

- 27/27 main routes opened successfully: dashboard, live dashboard, inbox, join
  requests, issues, projects, agents, org chart, skills, costs, company
  settings, environments, access, invites, company export, company import,
  activity, routines, goals, approvals, profile, general instance settings,
  instance access, heartbeats, experimental settings, plugin manager, and
  adapters.
- All 27 route checks ended with `0` suspicious ordinary UI English candidates
  after filtering known product names, package names, command snippets,
  adapter IDs, file names, and user/seed content.
- The final route sweep reported `pageTargets: 1`.

Single-tab safe functional coverage:

- Opened and closed the command palette.
- Opened the company menu path without creating extra tabs.
- Attempted account/profile menu inspection without changing account state.
- Opened the new issue dialog and closed it without creating an issue.
- Clicked costs tabs: overview, budget, providers, billers, and finance.
- Opened plugin install/configure entry points and closed them.
- Opened adapter install entry point and closed it.
- Rechecked import and export page main content after cleanup.

Latest verification results:

- `pnpm exec vitest run --config ./vitest.config.ts src/lib/zhCnLocalization.test.ts`: pass, 9/9 tests.
- `pnpm typecheck` in `ui/`: pass.
- Browser-harness plugin metadata check:
  - old `Journal 游标`: false
  - new `日志游标`: true
  - old `Provider 健康`: false
  - new `提供方健康`: true
  - old `rehydrate receipt`: false
  - new `重建回执`: true
  - page target count: 1

Allowed English still visible by design:

- Brand/product names: Paperclip, Dark Factory, Agent Company, OpenClaw.
- Technical labels that are clearer as identifiers: GitHub, API, CLI, JSON,
  HTTP, SSH, npm, pnpm, gzip.
- File names and package paths: `COMPANY.md`, `README.md`, `.paperclip.yaml`,
  `@paperclipai/...`.
- Commands and code examples.
- Adapter IDs and model/provider IDs such as `codex_local`, `claude_local`,
  `openclaw_gateway`, `cursor`, `http`, and `process`.
- User/seed content such as issue titles, company names, email addresses, and
  bundled skill markdown.

## Single-Tab Full Route Re-Sweep After Operator Feedback

Date: 2026-05-04

Reason: the operator reported that visible English remained across many pages
and asked for browser-harness plus visual inspection across every page, button,
subpage, and module. The run preserved the stricter browser policy:

- Reused the existing Chrome CDP page target only.
- Did not call `new_tab()`.
- Restarted only the browser-harness daemon when CDP evaluation stalled.
- Rechecked `http://127.0.0.1:9222/json/list`; final state stayed at one
  `type: page` target plus one service worker.

Additional browser-discovered fixes completed:

- Dashboard visible labels and empty states were converted to Chinese at the
  component source: no-agent prompt, agent run empty state, metric labels,
  metric summaries, chart titles, recent activity, recent tasks, and empty
  tasks.
- Join request queue was converted to Chinese for breadcrumbs, loading state,
  empty state, filters, action buttons, toast titles, request detail headings,
  and fallback requester labels.
- Plugin manager was converted to Chinese for the page title, install dialog,
  alpha warning, example plugin section, installed plugin section, empty state,
  actions, uninstall confirmation, and error details dialog.
- Company access and company invite breadcrumbs were converted to Chinese.
- Generic `Loading...`, `Loading...` with Unicode ellipsis, and legacy encoded
  loading fragments now normalize to Chinese.
- The zh-CN runtime display layer gained follow-up rules for join request
  details such as submitted time, source IP, join invite, default role, and
  missing invite metadata.

Final single-tab route coverage:

- 35/35 checked routes completed with zero suspicious ordinary English
  candidates after filtering product names, package names, commands, URLs,
  adapter/model IDs, and user/seed content.
- Routes covered: dashboard, live dashboard, companies, company settings,
  company environments, company access, company invites, company export,
  company import, skills, org chart, agents, new agent, projects, workspaces,
  issues, routines, goals, approvals, costs, activity, inbox, join requests,
  design guide, profile settings, general instance settings, instance access,
  heartbeats, experimental settings, plugin manager, adapter manager, auth
  redirect, onboarding, and global not-found route.

Single-tab functional smoke coverage:

- New agent page rendered Chinese labels and no audited onboarding English.
- Company import page rendered Chinese import/source/target labels.
- Adapter manager rendered Chinese alpha and external adapter copy.
- Plugin manager rendered Chinese alpha warning, install controls, installed
  plugin controls, and Dark Factory plugin metadata.
- Command palette opened with Chinese search/action/page entries and closed
  without creating data.
- Not-found route rendered Chinese missing-company/request-path copy.
- Button, link, input, textarea, `aria-label`, `title`, and `placeholder`
  sweeps across dashboard, new agent, company import, adapter manager, plugin
  manager, and general settings returned zero suspicious ordinary English
  candidates.

Visual evidence:

- `C:\Users\76914\AppData\Local\Temp\paperclip_zhcn_dashboard.png`
- `C:\Users\76914\AppData\Local\Temp\paperclip_zhcn_plugins.png`
- `C:\Users\76914\AppData\Local\Temp\paperclip_zhcn_access.png`
- `C:\Users\76914\AppData\Local\Temp\paperclip_zhcn_design-guide.png`

Final verification results:

- `pnpm exec vitest run --config ./vitest.config.ts src/lib/zhCnLocalization.test.ts`
  in `ui/`: pass, 10/10 tests.
- `pnpm typecheck` in `ui/`: pass.
- `pnpm build` in `ui/`: pass; Vite large chunk warning remains non-blocking
  and pre-existing.
- `pnpm typecheck` in `packages/plugins/integrations/dark-factory-bridge/`:
  pass.
- `pnpm build` in `packages/plugins/integrations/dark-factory-bridge/`: pass.
- `pnpm test` in `packages/plugins/integrations/dark-factory-bridge/`: pass,
  185 passed and 1 skipped operator-gated remote test.
