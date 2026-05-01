# Dark Factory Bridge Development Archive - 2026-05-02

## 1. Scope

This archive records the completed Dark Factory bridge plugin development cycle on `fork-master-product`.

Primary outcome:

- Product-grade Dark Factory bridge plugin moved to `packages/plugins/integrations/dark-factory-bridge/`.
- Mock-only Plugin-hosted environment driver implemented.
- V3 runtime contract parity and stability tests added.
- Deterministic Journal receipt simulator and in-process smoke harness added.
- Fork rebased onto upstream `origin/master` at `685ee84e`.
- Contribution assessment and upstream discussion draft prepared.

Non-goals preserved:

- No Paperclip core/server/ui model changes for Dark Factory semantics.
- No Task/Issue main model mutation.
- No real Dark Factory connection.
- No credential handling or external service integration.

## 2. Final Branch State

| Ref | Commit | Notes |
| --- | --- | --- |
| `master` / `origin/master` | `685ee84e` | Latest upstream baseline at archive time. |
| `fork-master-product` | `363159b6` | Local branch before this archive commit. |
| `fork/fork-master-product` | `363159b6` | Pushed successfully. |
| `fork/master` | `f53a8f51` | Not force-updated; normal `master:master` push was rejected as non-fast-forward. |

After this archive commit, `fork-master-product` will contain one additional documentation commit on top of `363159b6`.

## 3. Commit Groups

### Baseline Fork Commit

- `3c40f9c9` - Harden Dark Factory bridge projection boundaries

Added the initial projection-only bridge plugin baseline under examples, including runtime contract types, mock runtime adapter, UI, migration, plugin API routes, tests, docs draft, and workspace/workflow integration.

### Productization and V3 Contract Guard

- `2785964b` - docs: add Dark Factory environment adapter design document
- `cc1ec4d5` - refactor: move dark-factory bridge plugin to integrations

Moved the plugin out of examples and into `packages/plugins/integrations/dark-factory-bridge/`. Added the environment adapter design document. The migration reflected product status while keeping the integration isolated from core code.

### Environment Lifecycle Hooks

- `d42d1425` - feat: add environment lifecycle hooks for Dark Factory mock adapter (Step 1-4)
- `518da36d` - feat: add environment lifecycle hooks Step 5-6 (resume/release/destroy + tests)

Implemented:

- `onEnvironmentValidateConfig`
- `onEnvironmentProbe`
- `onEnvironmentAcquireLease`
- `onEnvironmentExecute`
- `onEnvironmentResumeLease`
- `onEnvironmentReleaseLease`
- `onEnvironmentDestroyLease`

All lifecycle output keeps `authoritative: false` and `terminalStateAdvanced: false`.

### Contract, Simulator, and Smoke Harness

- `937b1ea1` - docs: add adapter contract design for Dark Factory request/response mapping
- `0fc85006` - feat: add journal receipt simulator fixtures and tests
- `f0f272fb` - test: add Dark Factory bridge smoke harness

Added:

- Adapter execution/request envelope design.
- Journal receipt simulator fixtures for normal, gap, out-of-order, duplicate, and empty sequences.
- In-process smoke harness connecting plugin API routes, lifecycle hooks, and simulator replay.

### Contribution Planning

- `363159b6` - docs: add Dark Factory contribution assessment

Classified fork commits for upstream contribution discussion. Recommendation: do not open one large PR directly; discuss in upstream `#dev` first and split any accepted contribution into smaller generalized PRs.

## 4. Verification Record

Targeted plugin verification after upstream rebase:

```text
cd packages/plugins/integrations/dark-factory-bridge
pnpm typecheck
pnpm build
pnpm test
```

Result:

- Typecheck: pass
- Build: pass
- Tests: pass, 5 files / 54 tests

Root verification after upstream rebase:

```text
pnpm install
pnpm -r typecheck
pnpm build
timeout 120 pnpm test:run
```

Result:

- `pnpm install`: pass, lockfile up to date
- `pnpm -r typecheck`: pass for server, ui, cli, and all plugins
- `pnpm build`: pass, with upstream UI chunk size warnings
- `pnpm test:run`: fail in upstream/environment-dependent suites, not in Dark Factory bridge code

Root test failures observed:

- `server/src/__tests__/cursor-local-adapter-environment.test.ts`
- `server/src/__tests__/cursor-local-execute.test.ts`
- `server/src/__tests__/environment-live-ssh.test.ts`

Failure class:

- Cursor local remote sandbox commands returned `127` / probe `fail`.
- Live SSH test lacked configured SSH environment.
- Errors are outside `packages/plugins/integrations/dark-factory-bridge/`.

## 5. Files Added or Materially Updated

Dark Factory docs:

- `docs/dark-factory/DARK_FACTORY_ENVIRONMENT_ADAPTER_DESIGN.md`
- `docs/dark-factory/DARK_FACTORY_ADAPTER_CONTRACT_DESIGN.md`
- `docs/dark-factory/DARK_FACTORY_CONTRIBUTION_ASSESSMENT.md`
- `docs/dark-factory/UPSTREAM_DISCUSSION_DRAFT.md`
- `docs/dark-factory/DARK_FACTORY_DEVELOPMENT_ARCHIVE_2026-05-02.md`

Plugin implementation:

- `packages/plugins/integrations/dark-factory-bridge/src/manifest.ts`
- `packages/plugins/integrations/dark-factory-bridge/src/worker.ts`
- `packages/plugins/integrations/dark-factory-bridge/src/runtime-contract.ts`
- `packages/plugins/integrations/dark-factory-bridge/src/mock-runtime-adapter.ts`
- `packages/plugins/integrations/dark-factory-bridge/src/journal-receipt-simulator.ts`

Tests:

- `tests/mock-runtime-adapter.spec.ts`
- `tests/environment-lifecycle.spec.ts`
- `tests/journal-receipt-simulator.spec.ts`
- `tests/smoke-harness.spec.ts`
- `tests/plugin.spec.ts`

## 6. Boundary Decisions

Decisions maintained through the cycle:

- Dark Factory Journal remains truth source.
- Bridge plugin output is projection-only.
- `authoritative` remains `false` on all plugin/simulator/hook outputs.
- `terminalStateAdvanced` remains `false` on all mock outputs.
- Plugin DB remains limited to projection/cache/cursor/receipt/request metadata.
- No Paperclip Task/Issue main model changes.
- No real Dark Factory service connection.
- No credential reading, logging, storing, or committing.
- No upstream push/tag/release.

## 7. Contribution Decision

Current recommendation:

1. Use `UPSTREAM_DISCUSSION_DRAFT.md` to ask maintainers whether a plugin-hosted environment driver reference implementation is wanted.
2. If maintainers are interested, split work into smaller upstream PRs:
   - generalized lifecycle driver docs
   - minimal generic mock environment driver example
   - optional deterministic receipt fixture/smoke harness pattern
3. Keep Dark Factory-specific product semantics in the fork unless upstream explicitly requests them.

## 8. Maintenance Plan

For future fork maintenance:

- Rebase `fork-master-product` onto upstream `master` regularly.
- Keep Dark Factory files isolated under `packages/plugins/integrations/dark-factory-bridge/` and `docs/dark-factory/`.
- Watch Plugin SDK protocol changes in:
  - `packages/plugins/sdk/src/protocol.ts`
  - `packages/plugins/sdk/src/define-plugin.ts`
  - `packages/plugins/sdk/src/types.ts`
- Run targeted bridge verification after every upstream sync.
- Treat root `pnpm test:run` environment failures separately from bridge plugin compatibility.
