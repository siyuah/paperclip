# Dark Factory Bridge Chinese UI Localization - 2026-05-03

## Summary

This archive records the Chinese UI localization pass for the Dark Factory
bridge plugin. The scope is intentionally limited to the plugin-owned UI,
manifest display labels, standalone UI smoke preview, and the evidence scripts
that verify those surfaces.

Result: pass.

## Scope

Localized surfaces:

- Paperclip plugin dashboard widget.
- Paperclip issue detail tab.
- Paperclip plugin settings page.
- Standalone UI smoke preview harness.
- Manifest display names for plugin slots.
- UI beta evidence checks that assert visible boundary labels.

Out of scope:

- Paperclip core/server/ui localization.
- Paperclip global navigation, issue list, settings shell, or auth UI.
- Plugin SDK type changes.
- Runtime contract type changes.
- Dark Factory V3.0 binding artifacts.

## Implementation Notes

The UI is localized at the presentation layer only. Protocol-level values stay
unchanged so operators can still correlate logs, receipts, and contract fields:

- `runId`, `journalCursor`, `truthSource`, `authoritative`, and
  `terminalStateAdvanced` remain unchanged in payloads.
- Runtime enum values such as `ready`, `blocked`, `needs_attention`, `closed`,
  and `open` remain unchanged.
- Hook names such as `onEnvironmentExecute` remain unchanged.
- Evidence JSON schema fields remain unchanged.

User-visible labels were translated to Chinese, including:

- `Dark Factory Bridge 设置`
- `Dark Factory Bridge 投影`
- `Dark Factory 投影`
- `仅显示投影 - Dark Factory Journal 仍是唯一事实来源`
- `是否权威`
- `是否推进终态`
- `事实来源`
- `远程 Provider 就绪状态`
- `远程 Provider 可观测性`
- `远程 Provider Dry-run 防护`
- `请求 rehydrate（仅 receipt）`

## Files Changed

Plugin UI and manifest:

- `packages/plugins/integrations/dark-factory-bridge/src/ui/index.tsx`
- `packages/plugins/integrations/dark-factory-bridge/src/manifest.ts`
- `packages/plugins/integrations/dark-factory-bridge/src/ui-smoke-preview-browser-harness.ts`

Evidence and browser smoke scripts:

- `packages/plugins/integrations/dark-factory-bridge/scripts/generate-ui-beta-install-evidence.mjs`
- `packages/plugins/integrations/dark-factory-bridge/scripts/generate-alpha-install-handoff.mjs`
- `packages/plugins/integrations/dark-factory-bridge/scripts/run-install-readiness.mjs`
- `packages/plugins/integrations/dark-factory-bridge/scripts/run-ui-smoke-preview-browser.mjs`

Tests:

- `packages/plugins/integrations/dark-factory-bridge/tests/ui-smoke-preview-panel.spec.ts`
- `packages/plugins/integrations/dark-factory-bridge/tests/ui-smoke-preview-browser-harness.spec.ts`
- `packages/plugins/integrations/dark-factory-bridge/tests/environment-lifecycle.spec.ts`
- `packages/plugins/integrations/dark-factory-bridge/tests/plugin.spec.ts`

Evidence regenerated:

- `packages/plugins/integrations/dark-factory-bridge/docs/alpha-install-handoff-manifest.json`

## Verification

From:

```text
/home/siyuah/workspace/paperclip_upstream/packages/plugins/integrations/dark-factory-bridge
```

Validation results:

- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm test` passed.
- Test result: 185 passed, 1 operator-gated remote test skipped.
- `pnpm smoke:ui:browser -- --no-screenshots` passed.
- `pnpm evidence:ui-beta` passed.
- `pnpm handoff:alpha-install` passed.
- `pnpm install:readiness -- --skip-build` passed with `productionReady: true`.

## Boundary Compliance

- Dark Factory Journal remains truth source: yes.
- `authoritative: false` boundary preserved: yes.
- `terminalStateAdvanced: false` boundary preserved: yes.
- No real provider connection was introduced by localization: yes.
- No credential value was read, printed, stored, or committed: yes.
- No Paperclip core/server/ui/SDK changes: yes.
- No V3.0 binding artifact changes: yes.

## Product Status

The Dark Factory bridge plugin now has a Chinese operator-facing UI for its own
surfaces. The surrounding Paperclip host UI is still upstream Paperclip UI and
does not currently have a project-wide Chinese localization layer in this fork.

For internal beta, the expected user experience is therefore:

- Paperclip shell/navigation: upstream English UI.
- Dark Factory plugin settings/widget/detail surfaces: Chinese UI.
- Protocol fields and evidence JSON: stable English contract values.

## Next Candidate Work

- Re-run real Paperclip host install verification so the installed plugin bundle
  is visibly Chinese inside `http://127.0.0.1:3100`.
- Capture browser screenshots for Chinese settings, dashboard widget, and issue
  detail tab.
- Decide whether to localize Paperclip host UI globally in a separate fork-only
  workstream.
