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
