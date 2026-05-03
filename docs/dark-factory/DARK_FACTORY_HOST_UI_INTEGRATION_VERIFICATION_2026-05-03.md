# Dark Factory Host UI Integration Verification - 2026-05-03

## Summary

This archive records the local Paperclip host UI verification for the Dark
Factory bridge plugin after the standalone WebUI preview had already passed.
The goal was to prove that the bridge can be installed into the real Paperclip
host at `http://127.0.0.1:3100`, load its worker, expose UI slot
contributions, and render inside Paperclip's own settings, dashboard, and issue
detail surfaces.

Result: pass after one plugin migration compatibility fix.

## Environment

- Repository: `/home/siyuah/workspace/paperclip_upstream`
- Branch: `fork-master-product`
- Paperclip host: `http://127.0.0.1:3100`
- Deployment mode: `local_trusted`
- Database: embedded PostgreSQL
- Dark Factory bridge plugin path:
  `packages/plugins/integrations/dark-factory-bridge`
- Provider shim remained available at `http://127.0.0.1:9791`
- Standalone preview remained available at `http://127.0.0.1:4178`

## Host Install Bug Found

The first real host install attempt found a plugin database migration
compatibility issue:

```text
Plugin migration objects must use fully qualified schema names
```

The plugin was discovered and registered, but activation failed during
Paperclip host migration validation. The active migration had been written
against the raw namespace slug `dark_factory_bridge`, while the Paperclip host
derives the runtime plugin schema from the plugin key and namespace slug:

```text
plugin_dark_factory_bridge_a197d0c9b7
```

A second validator issue was also exposed: standalone `CREATE UNIQUE INDEX`
statements are not accepted by the current Phase 1 plugin migration validator
because it only recognizes DDL object references such as `CREATE TABLE`.

## Fix

Changed only the bridge plugin migration and plugin tests:

- Updated active migration table targets from `dark_factory_bridge.*` to
  `plugin_dark_factory_bridge_a197d0c9b7.*`.
- Removed plugin-owned `CREATE SCHEMA`; the Paperclip host creates the derived
  plugin schema before applying plugin migrations.
- Replaced standalone unique indexes with table-level `UNIQUE` constraints.
- Added a plugin test that imports Paperclip host
  `validatePluginMigrationStatement` and `derivePluginDatabaseNamespace` so
  host install compatibility is checked before browser testing.

No Paperclip core, server, UI, SDK, or runtime contract files were changed.

## Host Install Verification

After the fix:

- Previous failed plugin record was purged through the Paperclip plugin API.
- Local plugin was installed from:
  `/home/siyuah/workspace/paperclip_upstream/packages/plugins/integrations/dark-factory-bridge`
- Install returned status `200`.
- Plugin status became `ready`.
- `lastError` became `null`.
- Worker started successfully.
- Server log recorded:

```text
plugin-loader: plugin installed successfully
plugin lifecycle: installed -> ready
plugin-loader: activating plugin
starting plugin worker
worker process started and initialized
plugin-loader: plugin activated successfully
POST /plugins/install 200
```

`/api/plugins/ui-contributions` returned one contribution with three slots:

- `dashboardWidget: Dark Factory Provider Health`
- `taskDetailView: Dark Factory Projection`
- `settingsPage: Dark Factory Bridge`

The plugin UI bundle also loaded from:

```text
/_plugins/7d594372-ed20-4095-8daa-5655aee816b3/ui/index.js
```

with `Content-Type: application/javascript`.

## Browser Harness Verification

Browser harness verified the real Paperclip host UI, not the standalone
`4178` preview.

### Plugin Settings

Opened:

```text
http://127.0.0.1:3100/instance/settings/plugins/7d594372-ed20-4095-8daa-5655aee816b3
```

Verified visible content:

- `Dark Factory Bridge`
- `ready`
- `v0.1.0`
- `Dark Factory Bridge Settings`
- `Projection only - Dark Factory Journal remains truth source`
- `Authoritative: no`
- `Terminal advanced: no`
- Remote provider readiness and dry-run guard panels

### Dashboard Widget

Opened:

```text
http://127.0.0.1:3100/DAR/dashboard
```

Verified visible content:

- `Dark Factory Bridge Projection`
- `Projection only - Dark Factory Journal remains truth source`
- `Journal cursor`
- `Provider state`
- `Paperclip terminal state: unchanged`
- `Terminal advanced: no`

The dashboard widget calls:

```text
POST /api/plugins/7d594372-ed20-4095-8daa-5655aee816b3/data/projection-summary
```

and receives `200`.

### Issue Detail Tab

Created a local verification issue:

```text
DAR-1 - Dark Factory host UI verification issue
```

Opened:

```text
http://127.0.0.1:3100/DAR/issues/DAR-1
```

Verified visible content:

- `Dark Factory Projection`
- `Request rehydrate (receipt only)`
- `Projection only - Dark Factory Journal remains truth source`
- `Request Rehydrate only submits an intention/receipt`
- `Paperclip terminal state: unchanged`
- `Terminal advanced: no`

The plugin API route returned `200` with:

- `truthSource: "dark-factory-journal"`
- `authoritative: false`
- projection and journal cursor metadata

## Validation

From:

```text
/home/siyuah/workspace/paperclip_upstream/packages/plugins/integrations/dark-factory-bridge
```

Validation results:

- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm test` passed.
- Test result: 185 passed, 1 gated remote test skipped.

The skipped remote gated test remains operator-gated by design.

## Boundary Compliance

- Dark Factory Journal remains truth source: yes.
- `authoritative: false` on projection and lifecycle outputs: yes.
- `terminalStateAdvanced: false` on projection and UI outputs: yes.
- No real Dark Factory provider connection was made by browser verification.
- No credential value was read, printed, stored, or committed.
- No Paperclip core/server/ui/SDK change was made.
- No V3.0 binding artifact was modified.

## Current Product State

The Dark Factory bridge is now verified in both UI modes:

- Standalone bridge WebUI preview at `http://127.0.0.1:4178`
- Real Paperclip host UI at `http://127.0.0.1:3100`

This closes the previous UI mismatch: `4178` is only a plugin-owned smoke
preview, while `3100` is the actual Paperclip host UI.

## Remaining Work

The local fork is installable and host-UI verified. Remaining work for a wider
rollout is operational rather than core plugin development:

- Decide packaging/distribution policy for non-local environments.
- Repeat host install verification on a clean operator machine or staging
  instance.
- Keep provider-shim supervision, monitoring, rollback, and retention evidence
  current.
- Move from controlled local/staging rollout to broader internal beta only after
  operator acceptance.
