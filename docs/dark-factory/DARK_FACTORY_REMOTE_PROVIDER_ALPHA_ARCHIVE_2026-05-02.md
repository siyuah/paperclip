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
