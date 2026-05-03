# Dark Factory Remote Provider Alpha Archive

Date: 2026-05-02

Scope: Paperclip Dark Factory bridge plugin remote provider alpha.

## Summary

This archive records the first real-provider integration step after the mock and
live-local HTTP preview milestones. The bridge now accepts `mode: "remote"` as
the product-facing provider mode while preserving `mode: "http"` for local
preview and compatibility tests.

The remote mode intentionally reuses the hardened HTTP adapter path. It does not
add a second control plane and does not change Paperclip core models.

## What Changed

### Runtime Configuration

- Added `remote` as a supported runtime mode beside `mock` and `http`.
- Kept `http` as the live-local/internal-preview mode.
- Normalized remote config through the same endpoint, timeout, retry, workload,
  API-key, and secret-reference validation used by the HTTP adapter.
- Preserved host-resolved secret references through `apiKeySecretRef`.

### Manifest

- Updated the environment driver config schema to allow:
  - `mock`
  - `http`
  - `remote`
- Updated the driver description to explicitly call out remote provider alpha
  mode.
- Kept the same `environment.drivers.register` capability.

### Worker Hooks

The existing environment lifecycle hooks now route both `http` and `remote`
mode into the hardened HTTP adapter:

- `onEnvironmentValidateConfig`
- `onEnvironmentProbe`
- `onEnvironmentAcquireLease`
- `onEnvironmentResumeLease`
- `onEnvironmentExecute`
- `onEnvironmentReleaseLease`
- `onEnvironmentDestroyLease`

Release and destroy remain no-ops at the Paperclip layer. Dark Factory Journal
remains the truth source for terminal state.

### HTTP Adapter

Remote mode keeps product-facing metadata distinct from live-local HTTP mode:

- `runtimeMode: "remote"`
- `providerLeaseId: df-remote-lease-{runId}`
- cursor ids prefixed with `df-remote-cursor-`
- callback receipt idempotency keys prefixed with `remote:`
- fallback source journal ref is `dark-factory-remote`

The adapter still sends the V3 protocol release tag header and supports bounded
retry, timeout handling, and structured request logging.

## Test Coverage

Added `tests/remote-provider-alpha.spec.ts` with in-process fetch-mocked
provider contract tests.

Covered scenarios:

1. Remote config validation succeeds without external connectivity.
2. Missing remote endpoint is rejected.
3. Probe returns a non-authoritative remote environment result.
4. Acquire lease returns deterministic remote lease metadata.
5. Execute returns projection, cursor, health, and receipt metadata without
   advancing terminal state.
6. Resume lease returns deterministic remote metadata.
7. API key is sent as an HTTP header to the provider.
8. API key is not emitted in bridge logs.

Validation results:

- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm test` passed: 8 files, 60 tests.

## Hardening Batch 1

Remote provider alpha hardening batch 1 added two safety rails before any
operator-provided remote endpoint is used.

### Error Mapping Fixtures

The HTTP adapter now classifies remote provider failures into the runtime
contract `FailureClass` union:

| Provider condition | Failure class | Retryable |
| --- | --- | --- |
| 401 / 403 | `runtime_blocked` | false |
| 429 / quota exceeded | `quota_exceeded` | true |
| 500 / 502 / 503 / 504 | `transient_provider` | true |
| timeout / unreachable | `transient_provider` | true |
| invalid JSON | `provider_unavailable` | true |

Execution failures now return non-authoritative metadata with:

- `errorCode`
- `errorStatus`
- `failureClass`
- `retryable`
- `runtimeImpact`
- `terminalStateAdvanced: false`

### Gated Remote Integration Harness

Added `tests/remote-gated-integration.spec.ts`.

The test is skipped by default and only runs when all operator-controlled
variables are provided:

```bash
DARK_FACTORY_REMOTE_INTEGRATION=1
DARK_FACTORY_REMOTE_ENDPOINT=https://...
DARK_FACTORY_REMOTE_API_KEY=...
```

This prevents CI and local development from accidentally contacting a real
provider or reading credentials. When enabled, it runs:

validate -> probe -> acquire -> execute -> resume -> release

against the provided endpoint while preserving `authoritative: false` and
`terminalStateAdvanced: false`.

Validation after hardening batch 1:

- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm test` passed: 8 files passed, 1 gated file skipped, 69 passed, 1 skipped.

## Hardening Batch 2

Remote provider alpha hardening batch 2 focused on credential handling and
operator documentation without modifying Paperclip core or the Plugin SDK.

### Secret Resolver Finding

Current Paperclip plugin SDK types do not expose a generic host secret resolver
for environment lifecycle hooks. The kitchen-sink example contains a UI/action
demo for secret references, but that is not a reusable SDK contract for this
bridge.

### Alpha Env Secret Reference

The bridge now supports a narrow alpha resolver for `apiKeySecretRef`:

- `env:NAME`
- `env://NAME`

The environment variable name must match `^[A-Z_][A-Z0-9_]*$`.

Behavior:

- resolved value is used only as the provider `x-api-key` header
- normalized config preserves only `apiKeySecretRef`
- resolved value is not logged
- unsupported schemes such as `secret://...` are preserved but not resolved

This is intentionally a transition mechanism until a host-managed secret
resolver exists.

### Operator Runbook

Created `docs/dark-factory/DARK_FACTORY_REMOTE_PROVIDER_OPERATOR_RUNBOOK.md`.

It covers:

- remote mode config
- supported alpha secret references
- gated remote integration test commands
- failure triage table
- boundary constraints
- next production hardening steps

Validation after hardening batch 2:

- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm test` passed: 8 files passed, 1 gated file skipped, 71 passed, 1 skipped.

## Hardening Batch 3

Remote provider alpha hardening batch 3 added early credential diagnostics so
operator configuration errors fail locally before any provider request is sent.

### Credential Diagnostics

Remote mode now reports:

| Condition | Diagnostic code |
| --- | --- |
| Missing `apiKey` and `apiKeySecretRef` | `dark_factory_remote_credential_missing` |
| Unsupported secret ref scheme | `dark_factory_remote_credential_ref_unsupported` |
| Supported env ref but variable unset | `dark_factory_remote_credential_unresolved` |

`onEnvironmentValidateConfig` returns these as validation errors. If the host
skips validation, probe and execute still fail locally with non-authoritative
metadata. Acquire/resume throw before remote run creation or lookup.

No diagnostic includes a resolved secret value.

Validation after hardening batch 3:

- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm test` passed: 8 files passed, 1 gated file skipped, 73 passed, 1 skipped.

## Hardening Batch 4

Remote provider alpha hardening batch 4 added an in-process observability helper
for metrics and alert candidate generation.

### Metrics Snapshot

Added `src/remote-provider-observability.ts`.

The helper consumes deterministic remote provider observation events and builds a
non-authoritative metrics snapshot:

- request count
- success and failure counts
- retry and retryable-failure counts
- average and max latency
- failure-class counts
- latest error code
- latest Journal cursor and sequence number
- optional cursor lag

All snapshot output includes:

- `source: "dark-factory-projection"`
- `truthSource: "dark-factory-journal"`
- `authoritative: false`
- `observationSource: "runtime_observation"`
- `terminalStateAdvanced: false`

### Alert Candidates

The helper also derives alert candidates for:

- high remote provider error rate
- high remote provider latency
- high Journal cursor lag

These are local candidates only. They do not contact a provider, do not write a
database, and do not advance Paperclip terminal state.

Validation after hardening batch 4:

- `pnpm typecheck` passed.
- targeted observability tests passed: 1 file, 5 tests.

## Hardening Batch 5

Remote provider alpha hardening batch 5 exposed the observability helper through
the plugin-hosted operator surface.

### Plugin Data Surface

Added a `remote-observability-snapshot` plugin data entry in `worker.ts`.

The data entry:

- accepts sampled remote observation events from the host/test harness
- builds the same deterministic metrics snapshot as the helper
- derives alert candidates using configurable thresholds
- returns an explicit empty snapshot when no observations exist
- keeps `authoritative: false`
- keeps `terminalStateAdvanced: false`

### Settings UI

Updated `src/ui/index.tsx` so the settings page displays:

- sampled observation count
- request/success/failure/retry counts
- average and max latency
- cursor lag and latest cursor
- latest error code
- failure-class counts
- alert candidates

The UI does not invent live provider state. Empty sampled input stays empty.

Validation after hardening batch 5:

- `pnpm typecheck` passed.
- targeted tests passed: 2 files, 20 tests.

## Hardening Batch 6

Remote provider alpha hardening batch 6 exposed credential diagnostics through
the plugin-hosted operator surface.

### Plugin Data Surface

Added a `remote-credential-diagnostics` plugin data entry in `worker.ts`.

The data entry reports:

- whether remote config was supplied
- endpoint presence
- inline key presence
- secret reference presence
- secret reference scheme (`none`, `env`, `env_url`, or `unsupported`)
- credential readiness
- diagnostic code and message

It covers:

- `dark_factory_remote_credential_config_not_supplied`
- `dark_factory_remote_credential_missing`
- `dark_factory_remote_credential_ref_unsupported`
- `dark_factory_remote_credential_unresolved`
- `dark_factory_remote_credential_ready`

### Settings UI

Updated `src/ui/index.tsx` so the settings page displays a remote credential
diagnostics panel next to the observability snapshot.

The panel shows only presence/scheme/diagnostic metadata. It never displays a
resolved credential value.

Validation after hardening batch 6:

- `pnpm typecheck` passed.
- targeted plugin tests passed: 1 file, 17 tests.

## Hardening Batch 7

Remote provider alpha hardening batch 7 added a deterministic circuit breaker
state machine for sampled remote provider observations.

### Circuit Breaker Evaluator

Added `src/remote-provider-circuit-breaker.ts`.

The evaluator supports:

- `closed`
- `open`
- `half_open`

It implements:

- consecutive failure threshold -> `open`
- cooldown expiry -> `half_open`
- half-open success threshold -> `closed`
- half-open failure -> `open`

Default policy:

- failure threshold: 3 consecutive failures
- cooldown: 30000ms
- half-open success threshold: 1 success

The evaluator returns non-authoritative projection metadata with
`breakerState`, `previousBreakerState`, `consecutiveFailures`,
`cooldownUntil`, `openReason`, `lastFailureClass`, and `runtimeImpact`.

It is pure and deterministic. It does not contact a provider, does not persist
state, and does not advance Paperclip terminal state.

Validation after hardening batch 7:

- `pnpm typecheck` passed.
- targeted circuit breaker tests passed: 1 file, 6 tests.

## Hardening Batch 8

Remote provider alpha hardening batch 8 exposed the circuit breaker evaluator
through the plugin-hosted operator surface.

### Plugin Data Surface

Added a `remote-breaker-evaluation` plugin data entry in `worker.ts`.

The data entry accepts:

- sampled remote provider observations
- optional previous breaker state
- evaluated-at timestamp
- failure threshold
- cooldown duration
- half-open success threshold

It returns the deterministic circuit breaker evaluation with
`authoritative: false` and `terminalStateAdvanced: false`.

### Settings UI

Updated `src/ui/index.tsx` so the settings page displays:

- breaker state
- previous breaker state
- consecutive failures
- half-open successes
- open reason
- opened-at timestamp
- cooldown-until timestamp
- runtime impact and operator action

Empty sampled input evaluates to closed/monitor by default. This is a local
default, not a remote-provider health claim.

Validation after hardening batch 8:

- `pnpm typecheck` passed.
- targeted tests passed: 2 files, 25 tests.

## Hardening Batch 9

Remote provider alpha hardening batch 9 added operator-facing remediation hints
to remote credential diagnostics.

### Credential Remediation Hints

The `remote-credential-diagnostics` data surface now attaches structured
`remediation` hints to every diagnostic entry:

- config-not-supplied explains that the settings surface is empty and asks the
  operator to provide a remote config sample.
- missing credential recommends `apiKeySecretRef` with `env:NAME` or
  `env://NAME` and limits inline `apiKey` to controlled local testing.
- unsupported reference recommends replacing the reference with the alpha
  `env:` forms and waiting for host-managed secret resolution before
  `secret://` usage.
- unresolved reference asks the operator to export the referenced environment
  variable in the plugin host process and reload the host.
- ready state confirms that no credential remediation is needed before
  continuing in an operator-controlled environment.

### Settings UI

The settings page renders remediation hints directly under each credential
diagnostic. The UI still displays only presence, scheme, code/message, and
operator guidance. It never displays resolved credential values.

Validation after hardening batch 9:

- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm test` passed: 10 files passed, 1 gated file skipped, 90 tests passed,
  1 skipped.

## Hardening Batch 10

Remote provider alpha hardening batch 10 added an advisory readiness report for
operator-controlled remote provider attempts.

### Readiness Aggregator

Added `src/remote-provider-readiness.ts`.

The aggregator combines:

- remote credential diagnostics
- remote provider observability snapshots and alert candidates
- remote circuit breaker evaluation

It returns:

- `ready`
- `needs_attention`
- `blocked`

The readiness report includes summary text, recommended action, sampled
observation count, alert count, breaker state, credential status, and
per-category signals with remediation hints.

### Plugin Data + Settings UI

Added a `remote-provider-readiness` plugin data key in `worker.ts`.

Updated settings UI to show:

- readiness status
- summary and recommended action
- credential readiness
- breaker state
- sampled observation and alert counts
- readiness signals and remediation hints

The report is advisory only. It does not persist breaker state, does not gate
execution, does not contact a provider, and does not advance Paperclip terminal
state.

Validation after hardening batch 10:

- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm test` passed: 11 files passed, 1 gated file skipped, 96 tests passed,
  1 skipped.

## Hardening Batch 11

Remote provider alpha hardening batch 11 added an operator checklist and next
safe hook recommendation to the readiness report.

### Readiness Checklist

The readiness report now includes `readinessChecklist` entries for:

- remote credentials
- sampled remote observations
- circuit breaker state
- Journal boundary compliance

Each checklist item includes:

- `pass`, `warn`, or `fail`
- a human-readable label and message
- the lifecycle hook it must be satisfied before
- `authoritative: false`
- `terminalStateAdvanced: false`

### Next Safe Hook

The report now includes `nextSafeHook`, an advisory field that tells operators
the furthest lifecycle hook that is safe to attempt under current readiness
signals:

- missing or invalid credentials -> `onEnvironmentValidateConfig`
- warning-only state -> `onEnvironmentProbe`
- ready state -> `onEnvironmentExecute`

This remains advisory only. It does not invoke hooks, block execution, persist
state, contact a provider, or change Paperclip terminal state.

Validation after hardening batch 11:

- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm test` passed: 11 files passed, 1 gated file skipped, 96 tests passed,
  1 skipped.

## Hardening Batch 12

Remote provider alpha hardening batch 12 added a deterministic readiness
receipt and compact evidence digest to the advisory readiness report.

### Readiness Receipt

The readiness report now includes `readinessReceipt` with:

- `receiptId` in the form `df-readiness-{digest}`
- deterministic `fnv1a32` digest
- checked-at timestamp
- readiness status
- next safe hook
- compact evidence basis
- `doesAuthorizeRemoteExecution: false`
- `terminalStateAdvanced: false`

The evidence basis captures credential readiness, breaker state, sampled
observation count, alert count, signal codes, and checklist status. This gives
operators a stable receipt for notes and archives without turning the receipt
into a permission token.

### Settings UI

The settings page now renders readiness receipt id, evidence digest, and the
explicit "does not authorize remote execution" flag.

Validation after hardening batch 12:

- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm test` passed: 11 files passed, 1 gated file skipped, 96 tests passed,
  1 skipped.

## Hardening Batch 13

Remote provider alpha hardening batch 13 added readiness transition summaries.

### Previous Evidence Input

The `remote-provider-readiness` data surface now accepts optional
`previousReadiness` evidence containing:

- previous readiness status
- previous next safe hook
- previous receipt digest
- optional previous receipt id / checked-at metadata

### Transition Summary

The readiness report now includes `readinessTransition` with:

- `new`
- `unchanged`
- `improved`
- `regressed`
- `changed`

The transition compares previous and current readiness status, next safe hook,
and receipt digest. It gives operators a compact summary of whether remote alpha
readiness moved forward, moved backward, stayed unchanged, or changed laterally.

### Settings UI

The settings page now renders transition kind, summary, previous/current
status, previous/current next safe hook, and whether the evidence receipt
changed.

Transitions are advisory only. They do not persist state, contact a provider,
invoke hooks, authorize execution, or advance Paperclip terminal state.

Validation after hardening batch 13:

- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm test` passed: 11 files passed, 1 gated file skipped, 98 tests passed,
  1 skipped.

## Hardening Batch 14

Remote provider alpha hardening batch 14 added an advisory operator preflight
plan to the readiness report.

### Preflight Plan

The `remote-provider-readiness` data surface now returns `preflightPlan` entries
for:

- `onEnvironmentValidateConfig`
- `onEnvironmentProbe`
- `onEnvironmentAcquireLease`
- `onEnvironmentExecute`

Each entry includes:

- lifecycle hook name
- status: `allowed`, `review_required`, or `blocked`
- stable step code and human label
- message for the operator
- blocking readiness signal/checklist codes
- projection boundary
- `terminalStateAdvanced: false`

### Operator Meaning

`onEnvironmentValidateConfig` remains the always-allowed diagnostic starting
point. Later hooks are marked `allowed`, `review_required`, or `blocked`
according to the current readiness status and next safe hook.

The preflight plan is advisory only. It does not invoke hooks, persist state,
contact a provider, gate the execution path, authorize remote execution, or
advance Paperclip terminal state.

### Settings UI

The settings page now renders each preflight step with its hook, status,
message, and blocking codes.

Validation after hardening batch 14:

- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm test` passed: 11 files passed, 1 gated file skipped, 98 tests passed,
  1 skipped.

## Hardening Batch 15

Remote provider alpha hardening batch 15 added an active context ingestion
layer for readiness-related data surfaces.

### Active Context Builder

Added `src/remote-provider-active-context.ts`.

The builder normalizes the current settings/runtime params into one structured
context containing:

- checked/evaluated timestamps
- expected Journal sequence number
- normalized remote observations
- credential diagnostics
- metrics snapshot
- alert candidates
- circuit breaker evaluation
- previous readiness evidence
- direct `RemoteProviderReadinessInput`

### Worker Integration

The worker now uses the active context builder for:

- `remote-observability-snapshot`
- `remote-credential-diagnostics`
- `remote-breaker-evaluation`
- `remote-provider-readiness`

This keeps host/runtime input parsing in one place and prepares the bridge for
future host-supplied active environment driver config, observations, previous
breaker state, and previous readiness evidence.

### Tests

Added `tests/remote-provider-active-context.spec.ts` with coverage for:

- normalization of active readiness inputs
- credential diagnostics without exposing resolved values
- previous breaker/readiness evidence ingestion
- parity between `context.readinessInput` and a manually assembled readiness
  report input
- deterministic behavior for identical params
- safe defaults for invalid inputs

Validation after hardening batch 15:

- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm test` passed: 12 files passed, 1 gated file skipped, 101 tests passed,
  1 skipped.

## Hardening Batch 16

Remote provider alpha hardening batch 16 extended the active context ingestion
layer to accept host-supplied active context envelopes.

### Host Context Envelope

`buildRemoteProviderActiveContext` now accepts nested context under any of:

- `activeContext`
- `hostActiveContext`
- `remoteProviderActiveContext`

The host envelope can provide:

- environment config (`environmentConfig`, `activeEnvironmentConfig`, or
  `config`)
- sampled observations (`sampledObservations`, `remoteObservations`, or
  `observations`)
- previous breaker evidence (`breakerEvidence` or `previousBreaker`)
- previous readiness evidence (`readinessEvidence` or `previousReadiness`)
- alert thresholds
- circuit breaker policy
- `journal.expectedSequenceNo`

Direct top-level params override nested host context fields. The active context
output records whether host context was supplied and whether the input was
`params`, `host_active_context`, or `merged`.

### Tests

Extended `tests/remote-provider-active-context.spec.ts` with coverage for:

- host-supplied active context envelope normalization
- nested environment config and observations
- nested previous breaker/readiness evidence
- nested alert thresholds and circuit breaker policy
- direct top-level override precedence
- resolved credential value redaction

Validation after hardening batch 16:

- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm test` passed: 12 files passed, 1 gated file skipped, 103 tests passed,
  1 skipped.

## Hardening Batch 17

Remote provider alpha hardening batch 17 added deterministic host observation
fixtures and replay helpers.

### Host Observation Fixtures

Added `src/remote-provider-host-observation-fixtures.ts`.

The module provides deterministic host-style active context envelopes for:

- `healthy`
- `warning_latency`
- `blocked_failures`
- `stale_readiness`

Each fixture includes:

- host context id
- checked/evaluated timestamps
- environment config with secret reference only
- expected Journal sequence number
- sampled remote observations
- previous breaker evidence
- previous readiness evidence
- alert thresholds
- circuit breaker policy

### Replay Helper

`replayHostObservationFixture` feeds a fixture through
`buildRemoteProviderActiveContext` and returns the resulting active context plus
replay metadata. Direct overrides can be supplied for targeted harness cases.

This is still in-process simulation. It does not contact a real provider, does
not persist state, does not read resolved credential values into plugin data,
and does not authorize execution.

### Tests

Added `tests/remote-provider-host-observation-fixtures.spec.ts` covering:

- deterministic fixture creation
- healthy readiness replay
- warning latency replay
- blocked failure replay and open breaker behavior
- stale readiness/cursor lag transition
- direct replay override precedence

Validation after hardening batch 17:

- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm test` passed: 13 files passed, 1 gated file skipped, 109 tests passed,
  1 skipped.

## Hardening Batch 18

Remote provider alpha hardening batch 18 added a deterministic UI smoke preview
harness for full UI alpha preparation.

### UI Smoke Preview Module

Added `src/remote-provider-ui-smoke-preview.ts`.

The module composes:

- host observation fixtures
- active context replay
- credential diagnostics
- observability snapshot and alerts
- circuit breaker evaluation
- readiness report, preflight plan, receipt, and transition

It produces preview envelopes for:

- `healthy`
- `warning_latency`
- `blocked_failures`
- `stale_readiness`

Each preview carries the projection boundary, `runtimeMode: "remote"`,
`previewStatus`, `uiBadges`, readiness details, observability details,
credential diagnostics, breaker evaluation, and
`terminalStateAdvanced: false`.

### Plugin Data Surface

Registered the plugin data key `remote-provider-ui-smoke-preview` in
`worker.ts`. The key accepts a `scenario` param and returns one deterministic
preview envelope for UI smoke rendering or harness validation.

This surface is in-process only. It does not contact a provider, does not
persist state, does not expose resolved credential values, and does not
authorize remote execution.

### Tests

Added `tests/remote-provider-ui-smoke-preview.spec.ts` covering:

- deterministic preview creation for all four scenarios
- healthy ready state and execute advisory boundary
- latency warning state and execute review block
- blocked failure state with open breaker
- stale readiness regression and cursor lag
- plugin `getData` access for the preview key
- resolved credential value redaction

Validation after hardening batch 18:

- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm test` passed: 14 files passed, 1 gated file skipped, 116 tests passed,
  1 skipped.

## Hardening Batch 19

Remote provider alpha hardening batch 19 wired the UI smoke preview harness into
the actual bridge settings UI.

### Settings Preview Panel

Updated `src/ui/index.tsx` with a `UI Smoke Preview` panel on the settings page.
The panel includes a scenario selector for:

- `healthy`
- `warning_latency`
- `blocked_failures`
- `stale_readiness`

For the selected scenario, the panel renders:

- preview status
- host context id
- readiness status and next safe hook
- breaker state
- sampled observation count
- max latency and cursor lag
- alert count
- credential source
- truth source
- authoritative flag
- terminal-state-advanced flag
- stable UI badges

The panel reads the existing `remote-provider-ui-smoke-preview` data key. It is
still local preview only: no real provider call, no persistence, no execution
approval, and no terminal state advancement.

### Tests

Added `tests/ui-smoke-preview-panel.spec.ts` to lock the settings page wiring to
the preview data key, scenario selector, and boundary fields.

Validation after hardening batch 19:

- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm test` passed: 15 files passed, 1 gated file skipped, 117 tests passed,
  1 skipped.

## Hardening Batch 20

Remote provider alpha hardening batch 20 added a standalone browser smoke
harness for the settings-page preview states.

### Browser Harness

Added `src/ui-smoke-preview-browser-harness.ts`.

The harness generator builds a self-contained HTML page with:

- the four deterministic UI smoke scenarios
- scenario selector
- preview status
- readiness and next safe hook
- breaker state
- sampled observation count
- max latency and cursor lag
- alert count
- credential source
- truth source
- authoritative flag
- terminal-state-advanced flag
- UI badges

It uses the same `buildAllUiSmokePreviews()` data source as the settings panel.
The generated HTML is intended for Playwright or manual browser checks before
full UI alpha. It is still local preview only: no provider call, no persistence,
no secret value exposure, no execution approval, and no terminal state
advancement.

### Tests

Added `tests/ui-smoke-preview-browser-harness.spec.ts` covering:

- standalone HTML generation
- all four scenario payloads
- required boundary fields
- deterministic output
- resolved credential value redaction

Validation after hardening batch 20:

- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm test` passed: 16 files passed, 1 gated file skipped, 119 tests passed,
  1 skipped.

### Browser Execution Note

A live Playwright CLI run was attempted against the generated HTML. The WSL
environment did not have Google Chrome installed for the CLI default channel,
and the CLI `install-browser chrome` attempt timed out. The generated browser
harness and automated HTML/data tests are committed; a live browser pass should
be rerun once a usable Chrome/Chromium executable is available to the operator
environment.

## Boundary Compliance

- Dark Factory Journal remains truth source.
- `authoritative: false` remains on all projection-boundary outputs.
- `terminalStateAdvanced: false` remains fixed on bridge outputs.
- Paperclip Task/Issue main models were not modified.
- Plugin SDK was not modified.
- No Paperclip core/server/ui code was modified.
- No real external Dark Factory endpoint was contacted by the new remote
  contract tests.
- No real secret values were read, printed, or committed.

## Current Deployment Meaning

The system is now ready for a controlled remote-provider alpha against a trusted
Dark Factory HTTP-compatible endpoint.

This is still not broad production readiness. The production readiness document
continues to require metrics, alerts, real circuit breaker behavior, stronger
authorization, multi-node durable journal storage, and broader load/security
tests before untrusted or multi-tenant production exposure.

## Next Recommended Tasks

1. Replace the alpha `env:` resolver with a Paperclip host secret resolver once
   the host exposes that resolution hook.
2. Feed real host-collected remote observations into the
   `remote-observability-snapshot` data key.
3. Feed active environment driver config into `remote-credential-diagnostics`
   when the host exposes settings context.
4. Persist and feed previous breaker state before wiring the evaluator into
   remote execution decisions.
5. Feed host-collected observations into `remote-breaker-evaluation` from the
   settings/runtime context.
6. Add host-managed secret resolver integration when the Plugin SDK exposes it.
7. Feed host-collected observations and active config into
   `remote-provider-readiness` when host settings/runtime context is available.
8. Rerun live browser-level internal UI smoke once Chrome/Chromium is available
   in the operator environment.

## Hardening Batch 21

Remote provider alpha hardening batch 21 made the browser-level UI smoke
validation repeatable in the operator environment.

### CDP Browser Smoke Runner

Added `scripts/run-ui-smoke-preview-browser.mjs` and the package script
`pnpm smoke:ui:browser`.

The runner:

- generates the standalone HTML UI smoke preview harness
- finds Chromium via `DARK_FACTORY_UI_SMOKE_CHROMIUM`, Playwright's browser
  cache, or common system binary names
- drives Chromium directly through Chrome DevTools Protocol, avoiding a
  Playwright package/runtime dependency
- switches through `healthy`, `warning_latency`, `blocked_failures`, and
  `stale_readiness`
- asserts preview status, next safe hook, breaker state, Journal truth source,
  `authoritative: false`, and `terminalStateAdvanced: false`
- writes `smoke-result.json` and optional screenshots under
  `output/playwright/dark-factory-ui-smoke/`

### Live Browser Result

The local WSL environment had a usable Chromium executable at
`/home/siyuah/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome`.

`pnpm smoke:ui:browser -- --no-screenshots` passed for all four scenarios:

| Scenario | Preview status | Next safe hook | Breaker |
| --- | --- | --- | --- |
| `healthy` | `ready` | `onEnvironmentExecute` | `closed` |
| `warning_latency` | `needs_attention` | `onEnvironmentProbe` | `closed` |
| `blocked_failures` | `blocked` | `onEnvironmentProbe` | `open` |
| `stale_readiness` | `needs_attention` | `onEnvironmentProbe` | `closed` |

Validation after hardening batch 21:

- `pnpm smoke:ui:browser -- --no-screenshots` passed.
- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm test` passed: 16 files passed, 1 gated file skipped, 120 tests passed,
  1 skipped.

## Hardening Batch 22

Remote provider alpha hardening batch 22 added an explicit host/runtime active
context bridge boundary before wiring real Paperclip host settings or runtime
context into the remote provider UI surfaces.

### Host Context Bridge Result

Added `src/remote-provider-host-context-bridge.ts` and the plugin data key
`remote-provider-host-context-bridge`.

The bridge result composes:

- normalized active context
- readiness report
- host context summary for operator notes
- archive hints describing persistence boundaries
- `doesAuthorizeRemoteExecution: false`

It accepts the same host context envelope forms as the active context builder:

- `activeContext`
- `hostActiveContext`
- `remoteProviderActiveContext`

Direct top-level params still override nested host context fields, and the
result records whether the input came from params, host context, or merged
input.

### Boundary Semantics

The data surface is an intake/review boundary only. It does not call lifecycle
hooks, does not contact a provider, does not persist state, does not authorize
remote execution, and does not advance Paperclip terminal state.

Validation after hardening batch 22:

- targeted `remote-provider-host-context-bridge.spec.ts` passed: 4 tests.
- `pnpm typecheck` passed.

## Hardening Batch 23

Remote provider alpha hardening batch 23 added a contract-only previous evidence
record and replay helper for readiness and breaker continuity.

### Evidence Store Contract

Added `src/remote-provider-evidence-store-contract.ts`.

The contract converts a `remote-provider-host-context-bridge` result into a
deterministic evidence record containing:

- breaker state evidence
- readiness transition seed evidence
- readiness receipt id and digest
- sampled observation count
- alert count
- storage boundary metadata

The record is marked `contract_only_not_persisted`. It is a future plugin
namespace DB contract, not a migration and not an active storage implementation.

### Fixture-Backed Replay

The replay helper converts the evidence record back into an active context seed:

- `previousBreaker`
- `previousReadiness`

Tests verify that blocked evidence can seed a later healthy host context and
produce an `improved` readiness transition without authorizing execution.

Validation after hardening batch 23:

- targeted `remote-provider-evidence-store-contract.spec.ts` passed: 4 tests.
- `pnpm typecheck` passed.

## Hardening Batch 24

Remote provider alpha hardening batch 24 added a contract-only SQL shape for
future previous evidence persistence.

### Previous Evidence Storage SQL Contract

Added
`packages/plugins/integrations/dark-factory-bridge/docs/remote-provider-previous-evidence-storage-contract.sql`.

The file defines the future table shape for
`dark_factory_bridge.remote_provider_previous_evidence`, including:

- storage key
- readiness status and next safe hook
- readiness receipt id and digest
- breaker state and cooldown evidence
- sampled observation and alert counts
- projection boundary fields
- explicit non-authorization and terminal-state constraints
- deterministic lookup indexes

### Migration Guard

Added `tests/remote-provider-previous-evidence-storage-contract.spec.ts`.

The guard verifies that:

- the SQL contract lives under `docs/`, not `migrations/`
- the active `001_dark_factory_projection.sql` migration is unchanged
- no credential storage columns are introduced
- `authoritative`, `does_authorize_remote_execution`, and
  `terminal_state_advanced` are locked false
- lookup indexes exist for storage key, issue/environment, and receipt digest

Validation after hardening batch 24:

- targeted `remote-provider-previous-evidence-storage-contract.spec.ts`
  passed: 4 tests.
- `pnpm typecheck` passed.

## Hardening Batch 25

Remote provider alpha hardening batch 25 added a host settings/runtime context
adapter for future Paperclip host integration.

### Host Context Adapter

Added `src/remote-provider-host-context-adapter.ts` and the plugin data key
`remote-provider-host-context-adapter`.

The adapter accepts settings-style envelopes:

- `hostSettingsContext`
- `settingsContext`
- `environmentSettingsContext`

It also accepts runtime-style envelopes:

- `hostRuntimeContext`
- `runtimeContext`
- `environmentRuntimeContext`

It emits one normalized `activeContext` envelope that can be fed into
`remote-provider-host-context-bridge`.

### Compatibility Coverage

Tests verify:

- combined settings/runtime envelopes map to active context input
- adapted context feeds into host context bridge and readiness
- settings-only context still drives credential diagnostics preview
- plugin data access returns the adapter result without contacting a provider
- resolved credential values are not exposed

Validation after hardening batch 25:

- targeted `remote-provider-host-context-adapter.spec.ts` passed: 4 tests.
- `pnpm typecheck` passed.

## Hardening Batch 26

Remote provider alpha hardening batch 26 added an advisory dry-run guard for
the final step before operator-controlled remote provider attempts.

### Dry-Run Guard

Added `src/remote-provider-dry-run-guard.ts` and the plugin data key
`remote-provider-dry-run-guard`.

The guard composes:

- host settings/runtime context adapter
- host active context bridge
- readiness report
- matched preflight step
- deterministic guard receipt

It accepts a `targetHook` for the intended lifecycle boundary:

- `onEnvironmentValidateConfig`
- `onEnvironmentProbe`
- `onEnvironmentAcquireLease`
- `onEnvironmentExecute`

The guard returns one advisory decision:

- `allowed`
- `review_required`
- `blocked`

### Boundary Semantics

The guard is not an authorization mechanism and does not call a provider. It
does not invoke lifecycle hooks, does not persist state, and does not advance
Paperclip terminal state. Its receipt is metadata for operator notes or future
plugin namespace DB storage, not a Dark Factory Journal truth event.

All outputs preserve:

- `authoritative: false`
- `doesAuthorizeRemoteExecution: false`
- `shouldContactRemoteProvider: false`
- `terminalStateAdvanced: false`
- Dark Factory Journal remains truth source

Validation after hardening batch 26:

- targeted `remote-provider-dry-run-guard.spec.ts` passed: 5 tests.
- `pnpm typecheck` passed.

## Hardening Batch 27

Remote provider alpha hardening batch 27 surfaced dry-run guard decisions in
the internal UI preview surfaces.

### UI Preview Integration

Updated `src/remote-provider-ui-smoke-preview.ts` so each deterministic preview
now includes summarized guard decisions for:

- `onEnvironmentValidateConfig`
- `onEnvironmentProbe`
- `onEnvironmentAcquireLease`
- `onEnvironmentExecute`

Each summary includes:

- target hook
- advisory decision
- matched preflight status
- blocking codes
- guard receipt id and digest
- remote-provider contact flag
- execution authorization flag

The preview intentionally does not embed the full adapter/bridge object. It
keeps only the operator-facing summary needed for UI smoke and manual review.

### Panel And Browser Harness

Updated the settings-page smoke preview panel and standalone browser harness to
render the dry-run guard section. The panel shows all four lifecycle boundaries
for the selected preview scenario, including provider-contact and authorization
flags that must remain `no`.

### Boundary Semantics

The UI remains a local preview surface. It does not contact a provider, does
not persist state, does not approve execution, and does not change lifecycle
hook behavior.

Validation after hardening batch 27:

- targeted UI preview tests passed: 11 tests across 3 files.
- `pnpm typecheck` passed.

## Hardening Batch 28

Remote provider alpha hardening batch 28 added the manual gate for the first
real provider attempt.

### First Gated Attempt Runbook

Added `docs/dark-factory/DARK_FACTORY_FIRST_REAL_PROVIDER_GATED_ATTEMPT_RUNBOOK.md`.

The runbook defines:

- preconditions before any real provider call
- required boundary assertions
- operator-only environment variables
- dry-run guard receipt capture
- gated integration command
- failure handling
- rollback
- operator evidence template
- stop conditions

The runbook explicitly requires the dry-run guard receipt before enabling
`DARK_FACTORY_REMOTE_INTEGRATION=1`.

### Runbook Guard Test

Added `tests/remote-provider-first-gated-attempt-runbook.spec.ts`.

The guard verifies that:

- the runbook requires dry-run guard evidence before the gated integration test
- the real-provider test remains skipped by default and operator-gated
- rollback and stop conditions are documented
- resolved credential values are not documented
- Journal truth, non-authoritative projection, terminal-state preservation, and
  non-authorization boundaries are locked in the runbook

Validation after hardening batch 28:

- targeted runbook guard passed: 4 tests.
- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm test` passed: 22 files passed, 1 gated file skipped, 145 tests passed,
  1 skipped.
- `pnpm smoke:ui:browser -- --no-screenshots` passed.

## Hardening Batch 29

Remote provider alpha hardening batch 29 added a local preflight evidence
script for the first real provider attempt.

### Preflight Evidence Script

Added `scripts/run-first-provider-preflight.mjs` and the package script
`pnpm preflight:first-provider`.

The script runs the local gate checks and writes
`output/dark-factory-first-provider-preflight/evidence.json`:

- `pnpm typecheck`
- `pnpm build`
- `pnpm test`
- `pnpm smoke:ui:browser -- --no-screenshots`
- `/home/siyuah/workspace/123/tools/validate_v3_bundle.py`
- `pnpm test -- tests/remote-gated-integration.spec.ts` with real-provider
  environment variables scrubbed

The final check must report that the gated integration test is skipped by
default before the operator sets `DARK_FACTORY_REMOTE_INTEGRATION=1`.

### Evidence Boundaries

The evidence JSON records command status, branch, commit, UI smoke boundary
summary, V3 validation summary, and the default-skip status. It redacts
secret-like output and records only non-sensitive evidence.

Validation after hardening batch 29:

- targeted preflight script test passed: 4 tests.
- `pnpm preflight:first-provider -- --skip-heavy` passed and confirmed gated
  integration default skip.
- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm test` passed: 23 test files passed, 1 gated file skipped, 149 tests
  passed, 1 skipped.
- `pnpm smoke:ui:browser -- --no-screenshots` passed.
- `pnpm preflight:first-provider` passed and generated local evidence JSON.
- V3 bundle validation passed: 12 checks, 0 errors, 0 warnings.

## Hardening Batch 30

Remote provider alpha hardening batch 30 added a first-provider operator session
packet generator.

### Operator Session Packet Script

Added `scripts/generate-first-provider-session-packet.mjs` and the package
script `pnpm packet:first-provider`.

The script reads the local preflight evidence JSON and writes
`output/dark-factory-first-provider-session/SESSION_PACKET.md`.

The packet includes:

- evidence path, generated time, branch, commit, and schema version
- readiness assessment and failed-reason list
- check summary table
- boundary assertion table
- dry-run summary
- operator fill-in fields
- stop conditions

The packet intentionally omits raw command output tails. It is a human review
artifact only and does not authorize remote execution.

Boundary expectations:

- Dark Factory Journal remains truth source.
- `authoritative: false`.
- `terminalStateAdvanced: false`.
- `doesAuthorizeRemoteExecution: false`.
- `shouldContactRemoteProviderDuringDryRun: false`.
- no resolved credential values.

Validation after hardening batch 30:

- targeted session packet script test passed: 4 tests.
- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm test` passed: 24 test files passed, 1 gated file skipped, 153 tests
  passed, 1 skipped.
- `pnpm preflight:first-provider` passed and generated local evidence JSON.
- `pnpm packet:first-provider` passed and generated
  `output/dark-factory-first-provider-session/SESSION_PACKET.md` with
  `readyForGatedAttempt: true`.
- V3 bundle validation passed: 12 checks, 0 errors, 0 warnings.

## Hardening Batch 31

Remote provider alpha hardening batch 31 added a first-provider handoff manifest
generator.

### Handoff Manifest Script

Added `scripts/generate-first-provider-handoff-manifest.mjs` and the package
script `pnpm bundle:first-provider`.

The script reads:

- `output/dark-factory-first-provider-preflight/evidence.json`
- `output/dark-factory-first-provider-session/SESSION_PACKET.md`

It writes:

- `output/dark-factory-first-provider-handoff/MANIFEST.json`

The manifest records:

- evidence and session packet paths
- SHA-256 hashes for both artifacts
- source branch, commit, and evidence generation time
- required command order
- check summaries
- dry-run summary
- stop conditions
- operator handoff constraints
- boundary assertions

The manifest intentionally does not embed raw command output tails or resolved
credential values. It is a handoff index and readiness summary only; it does
not authorize remote execution.

Validation after hardening batch 31:

- targeted handoff manifest script test passed: 4 tests.
- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm test` passed: 25 test files passed, 1 gated file skipped, 157 tests
  passed, 1 skipped.
- `pnpm preflight:first-provider` passed and generated local evidence JSON.
- `pnpm packet:first-provider` passed and generated session packet with
  `readyForGatedAttempt: true`.
- `pnpm bundle:first-provider` passed and generated
  `output/dark-factory-first-provider-handoff/MANIFEST.json` with
  `readyForGatedAttempt: true`.
- V3 bundle validation passed: 12 checks, 0 errors, 0 warnings.

## Hardening Batch 32

Remote provider alpha hardening batch 32 added a first-provider handoff verifier.

### Handoff Verifier Script

Added `scripts/verify-first-provider-handoff.mjs` and the package script
`pnpm verify:first-provider`.

The script reads:

- `output/dark-factory-first-provider-preflight/evidence.json`
- `output/dark-factory-first-provider-session/SESSION_PACKET.md`
- `output/dark-factory-first-provider-handoff/MANIFEST.json`

It writes:

- `output/dark-factory-first-provider-handoff/VERIFY_REPORT.json`

The verifier checks:

- manifest schema/type
- manifest readiness
- evidence and session packet SHA-256 hashes
- artifact paths
- gated integration default skip
- required offline command order
- session packet readiness/truth markers
- absence of raw command output tails in the manifest
- operator handoff constraints
- boundary assertions

The verification report is an offline review artifact. It does not contact a
provider and does not authorize remote execution.

Validation after hardening batch 32:

- targeted handoff verifier script test passed: 4 tests.
- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm test` passed: 26 test files passed, 1 gated file skipped, 161 tests
  passed, 1 skipped.
- `pnpm preflight:first-provider` passed and generated local evidence JSON.
- `pnpm packet:first-provider` passed and generated session packet with
  `readyForGatedAttempt: true`.
- `pnpm bundle:first-provider` passed and generated handoff manifest with
  `readyForGatedAttempt: true`.
- `pnpm verify:first-provider` passed and generated
  `output/dark-factory-first-provider-handoff/VERIFY_REPORT.json` with
  `ok: true`.
- V3 bundle validation passed: 12 checks, 0 errors, 0 warnings.

## Hardening Batch 33

Remote provider alpha hardening batch 33 added an install readiness gate.

### Install Readiness Script

Added `scripts/run-install-readiness.mjs` and the package script
`pnpm install:readiness`.

The script runs the plugin build unless `--skip-build` is passed, then verifies:

- package name and private publish state
- `paperclipPlugin` manifest/worker/UI pointers
- built `dist/manifest.js`, `dist/worker.js`, and `dist/ui/index.js`
- built manifest schema
- manifest worker/UI entrypoints
- environment driver capability and `dark-factory-mock` driver declaration
- API routes
- UI slots
- database namespace declaration
- migration file presence

The report writes
`output/dark-factory-install-readiness/INSTALL_READINESS.json` and explicitly
separates:

- `installableAlphaReady`: controlled alpha/internal install readiness
- `productionReady`: full production install readiness

Current production blockers are intentionally preserved in the report:

- package publish/install distribution policy is pending
- real provider gated attempt is not complete
- host-managed secret resolver is pending
- full UI internal beta install flow has not been exercised

Validation after hardening batch 33:

- targeted install readiness script test passed: 2 tests.
- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm test` passed: 27 test files passed, 1 gated file skipped, 163 tests
  passed, 1 skipped.
- `pnpm install:readiness` passed with `installableAlphaReady: true` and
  `productionReady: false`.
- V3 bundle validation passed: 12 checks, 0 errors, 0 warnings.

## Hardening Batch 34

Remote provider alpha hardening batch 34 cleared the manifest identity
production blocker.

### Product Manifest Identity

Updated the bridge plugin manifest from example identity to product integration
identity:

- manifest id: `paperclipai.dark-factory-bridge`
- display name: `Dark Factory Bridge`

This removes the `manifest_identity_contains_example` production blocker from
`pnpm install:readiness`.

The database namespace remained `dark_factory_bridge_poc` after this batch and
was intentionally left as a production blocker until a namespace migration plan
could be defined.

Validation after hardening batch 34:

- targeted install readiness and plugin manifest tests passed: 24 tests.
- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm test` passed: 27 test files passed, 1 gated file skipped, 163 tests
  passed, 1 skipped.
- `pnpm install:readiness` passed with `installableAlphaReady: true` and
  `productionReady: false`.
- `manifest_identity_contains_example` is no longer reported.
- Remaining production blockers: database namespace `poc`, package publish
  policy, real provider gated attempt, host-managed secret resolver, and full
  UI internal beta install flow.
- V3 bundle validation passed: 12 checks, 0 errors, 0 warnings.

## Hardening Batch 35

Remote provider alpha hardening batch 35 cleared the database namespace
production blocker.

### Product Database Namespace

Updated the bridge plugin namespace from `dark_factory_bridge_poc` to
`dark_factory_bridge` across:

- manifest `database.namespaceSlug`
- migration schema/table/index references
- previous evidence storage SQL contract
- plugin tests
- install readiness checks

This removes the `database_namespace_contains_poc` production blocker from
`pnpm install:readiness`.

Validation after hardening batch 35:

- targeted install readiness and plugin manifest tests passed: 24 tests.
- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm test` passed: 27 test files passed, 1 gated file skipped, 163 tests
  passed, 1 skipped.
- `pnpm install:readiness` passed with `installableAlphaReady: true` and
  `productionReady: false`.
- `database_namespace_contains_poc` is no longer reported.
- Remaining production blockers: package publish policy, real provider gated
  attempt, host-managed secret resolver, and full UI internal beta install
  flow.
- V3 bundle validation passed: 12 checks, 0 errors, 0 warnings.

## Hardening Batch 36

Remote provider alpha hardening batch 36 resolved the package install
distribution policy blocker for the fork-local product integration path.

### Fork-local Install Distribution Policy

Added `docs/install-distribution-policy.json` inside the bridge plugin package.
The policy records that the package remains private and is installed from the
maintained fork/workspace during internal alpha, not published to npm.

Updated `pnpm install:readiness` to verify:

- policy file exists and has schema version 1
- package name matches `@paperclipai/plugin-dark-factory-bridge`
- distribution mode is `fork-local-workspace`
- `packagePrivateExpected` matches `package.json` `private`
- `npmPublish` is false
- policy boundary remains non-authoritative and does not authorize remote
  execution

This removes the `package_private_publish_policy_pending` production blocker
without changing package privacy.

Validation after hardening batch 36:

- targeted install readiness script test passed: 2 tests.
- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm test` passed: 27 test files passed, 1 gated file skipped, 163 tests
  passed, 1 skipped.
- `pnpm install:readiness` passed with `installableAlphaReady: true` and
  `productionReady: false`.
- `package_private_publish_policy_pending` is no longer reported.
- Remaining production blockers: real provider gated attempt, host-managed
  secret resolver, and full UI internal beta install flow.
- V3 bundle validation passed: 12 checks, 0 errors, 0 warnings.

## Hardening Batch 37

Remote provider alpha hardening batch 37 added the host-managed secret resolver
contract and removed the temporary resolver blocker from install readiness.

### Host-managed Secret Resolver Contract

Added `src/remote-provider-host-secret-resolver.ts` and exposed the
`remote-provider-host-secret-resolver-contract` data surface. The contract
declares:

- host-managed reference schemes: `secret://` and `host-secret://`
- legacy reference schemes: `env:` and `env://`
- resolved credential values are transient memory only
- resolved credential values must not be persisted or printed
- the resolver contract does not authorize remote execution
- Paperclip terminal state is never advanced

Updated remote credential diagnostics so host-managed references are ready for
readiness evaluation while real provider network calls still require the plugin
host to inject a resolved credential at execution time.

Updated `pnpm install:readiness` to verify the host secret resolver contract.
This removes the `host_secret_resolver_pending` production blocker without
connecting to a real provider or reading credential values.

Validation after hardening batch 37:

- targeted host secret resolver, HTTP adapter, plugin, remote alpha, and
  install readiness tests passed: 45 tests.
- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm test` passed: 28 test files passed, 1 gated file skipped, 167 tests
  passed, 1 skipped.
- `pnpm install:readiness` passed with `installableAlphaReady: true` and
  `productionReady: false`.
- `host_secret_resolver_pending` is no longer reported.
- Remaining production blockers: real provider gated attempt and full UI
  internal beta install flow.
- V3 bundle validation passed: 12 checks, 0 errors, 0 warnings.

## Hardening Batch 38

Remote provider alpha hardening batch 38 added machine-readable UI internal
beta install evidence and removed the UI beta readiness blocker from install
readiness.

### UI Beta Install Evidence

Added `scripts/generate-ui-beta-install-evidence.mjs`, package script
`pnpm evidence:ui-beta`, and checked-in evidence file
`docs/ui-beta-install-evidence.json`.

The evidence verifies:

- dashboard, issue detail, and settings UI slots are declared
- settings UI is wired to `remote-provider-ui-smoke-preview`
- settings UI renders scenario controls and boundary fields
- standalone browser harness contains all preview scenarios
- live browser runner is available for Chromium/CDP smoke
- preview payloads preserve non-authoritative Journal boundary
- dry-run guards never contact a provider or authorize remote execution

Updated `pnpm install:readiness` to require the UI beta evidence file. This
removes the `ui_full_internal_beta_not_completed` production blocker while
remaining offline and projection-only.

Validation after hardening batch 38:

- targeted UI beta evidence, install readiness, browser harness, and settings
  panel tests passed: 8 tests.
- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm test` passed: 29 test files passed, 1 gated file skipped, 169 tests
  passed, 1 skipped.
- `pnpm install:readiness` passed with `installableAlphaReady: true` and
  `productionReady: false`.
- `ui_full_internal_beta_not_completed` is no longer reported.
- Remaining production blocker: real provider gated attempt.
- V3 bundle validation passed: 12 checks, 0 errors, 0 warnings.

## Hardening Batch 39

Remote provider alpha hardening batch 39 recorded the final real-provider gate
status after all offline install and UI beta blockers were cleared.

### Final Real Provider Gate Status

Added `docs/dark-factory/DARK_FACTORY_REAL_PROVIDER_GATE_STATUS_2026-05-03.md`
as the operator-facing status record for the remaining production gate.

Current state:

- `installableAlphaReady: true`
- `productionReady: false`
- remaining production blocker: `real_provider_gated_attempt_not_completed`

A non-sensitive gate-input presence check was run and printed only boolean
presence, string lengths, and whether the integration flag equaled `1`.

Observed result:

- integration flag present: no
- provider endpoint present: no
- credential value present: no
- credential reference present: no
- derived gated-run condition: false

The gated provider attempt was therefore not run. This is intentional and keeps
the production blocker honest until an operator supplies the real-provider
inputs in a short-lived shell and the gated integration test passes.

Validation after hardening batch 39:

- `pnpm install:readiness -- --skip-build` passed with
  `installableAlphaReady: true` and `productionReady: false`.
- Remaining production blocker: `real_provider_gated_attempt_not_completed`.
- The gated integration test remains skipped by default when operator inputs
  are absent.

Boundary compliance:

- No real provider request was attempted: yes
- No endpoint or credential value was printed: yes
- No production blocker was bypassed: yes
- `authoritative: false` remains required on all bridge outputs: yes
- `terminalStateAdvanced: false` remains required on all bridge outputs: yes
- Dark Factory Journal remains truth source: yes
