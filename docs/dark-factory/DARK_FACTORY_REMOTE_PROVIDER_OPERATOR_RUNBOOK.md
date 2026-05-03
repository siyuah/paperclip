# Dark Factory Remote Provider Operator Runbook

Date: 2026-05-02

Scope: Paperclip Dark Factory bridge plugin remote provider alpha.

## Status

Remote provider mode is an alpha integration path. It is suitable for controlled
operator validation against a trusted Dark Factory HTTP-compatible endpoint. It
is not yet broad production readiness.

## Configuration

Use the bridge environment driver with:

```json
{
  "mode": "remote",
  "endpoint": "https://dark-factory.example.internal",
  "timeoutMs": 5000,
  "retryMaxRetries": 1,
  "retryBaseDelayMs": 50,
  "retryMaxDelayMs": 100,
  "requestedBy": "paperclip-dark-factory-bridge",
  "workloadClass": "code",
  "apiKeySecretRef": "env:DARK_FACTORY_REMOTE_API_KEY"
}
```

Supported alpha secret references:

- `env:NAME`
- `env://NAME`

The environment variable name must match `^[A-Z_][A-Z0-9_]*$`.

Unsupported references such as `secret://...` are preserved as references in
normalized config but are not resolved by the plugin until Paperclip exposes a
host secret resolver. This avoids inventing a private secret store inside the
plugin.

## Credential Diagnostics

Remote mode validates credentials before contacting the provider.

| Condition | Diagnostic code | Message |
| --- | --- | --- |
| No `apiKey` or `apiKeySecretRef` | `dark_factory_remote_credential_missing` | `apiKey or apiKeySecretRef is required for remote mode` |
| Unsupported reference scheme | `dark_factory_remote_credential_ref_unsupported` | `apiKeySecretRef must use env:NAME or env://NAME in remote alpha` |
| Supported env ref but variable is unset | `dark_factory_remote_credential_unresolved` | `apiKeySecretRef environment variable is not set: NAME` |

`onEnvironmentValidateConfig` returns these as validation errors. If the host
skips validation, probe and execute still fail locally before sending a provider
request. Acquire/resume throw the same local error before creating or reading a
remote run.

## Secret Handling

- Prefer `apiKeySecretRef` over inline `apiKey`.
- Do not commit the resolved value.
- Do not put the resolved value in docs, fixtures, or test snapshots.
- The plugin uses the resolved value only to set the provider `x-api-key`
  request header.
- Normalized config keeps only the reference, not the resolved value.
- Bridge request logs do not include request bodies or API-key headers.

## Gated Remote Integration Test

The real-provider integration test is skipped by default.

For the first real provider attempt, use the dedicated gated-attempt checklist:

- `docs/dark-factory/DARK_FACTORY_FIRST_REAL_PROVIDER_GATED_ATTEMPT_RUNBOOK.md`

That checklist requires a dry-run guard receipt before setting
`DARK_FACTORY_REMOTE_INTEGRATION=1`.

Use `pnpm preflight:first-provider` to generate the local operator evidence JSON
before setting real-provider environment variables.

Use `pnpm packet:first-provider` after preflight to generate the Markdown
operator session packet. The packet is the human review artifact for the first
provider attempt and must contain only endpoint host references, credential
reference names, check summaries, and boundary assertions.

Use `pnpm bundle:first-provider` after the packet to generate the handoff
manifest. The manifest binds the evidence JSON and session packet by SHA-256,
records required command order, and restates stop conditions without embedding
raw command output tails.

Use `pnpm verify:first-provider` after the manifest to generate the verification
report. The verifier rechecks artifact hashes, command order, handoff
constraints, and boundary assertions before the operator enables real-provider
environment variables.

Run it only in an operator-controlled environment:

```bash
cd /home/siyuah/workspace/paperclip_upstream/packages/plugins/integrations/dark-factory-bridge
export DARK_FACTORY_REMOTE_INTEGRATION=1
export DARK_FACTORY_REMOTE_ENDPOINT=https://dark-factory.example.internal
export DARK_FACTORY_REMOTE_API_KEY_ENV=DARK_FACTORY_REMOTE_API_KEY
export DARK_FACTORY_REMOTE_API_KEY=...
pnpm test -- tests/remote-gated-integration.spec.ts
```

`DARK_FACTORY_REMOTE_API_KEY_ENV` tells the plugin which environment variable to
resolve through `apiKeySecretRef`. The example sets `DARK_FACTORY_REMOTE_API_KEY`
only in the operator shell and never commits it.

The gated test validates:

1. config validation
2. probe
3. acquire lease
4. execute
5. resume lease
6. release lease

All outputs must remain non-authoritative and must not advance Paperclip
terminal state.

## Failure Triage

| Symptom | Likely cause | Expected mapping |
| --- | --- | --- |
| local credential diagnostic | missing, unsupported, or unresolved credential | `runtime_blocked` for execution |
| 401 / 403 | missing or invalid provider credential | `runtime_blocked` |
| 429 | provider quota/rate limit | `quota_exceeded` |
| 500 / 502 / 503 / 504 | transient provider failure | `transient_provider` |
| timeout / unreachable | network or provider outage | `transient_provider` |
| invalid JSON | incompatible provider response | `provider_unavailable` |

Paperclip terminal state remains unchanged for all failures. The operator should
inspect Dark Factory Journal and provider logs before retrying or escalating.

## Observability Snapshot

The bridge now includes a pure in-process observability helper for remote alpha
operations. It consumes local observation events and produces:

- request, success, failure, retry, and retryable-failure counts
- average and max request latency
- failure-class counts
- latest error code
- latest journal cursor and sequence number
- optional cursor lag against an expected Journal sequence
- alert candidates for high error rate, high latency, and cursor lag

The helper does not contact a provider, does not store secrets, and does not
advance terminal state. It is a deterministic foundation for later UI panels,
metrics exporters, or alert rules.

The bridge exposes this snapshot through the plugin data key
`remote-observability-snapshot`. The settings page renders the current snapshot,
failure-class counts, and alert candidates. When no sampled observations are
available yet, the snapshot stays empty instead of inventing provider health.

## Credential Diagnostics UI

The bridge settings page also reads the plugin data key
`remote-credential-diagnostics`.

The diagnostics surface reports:

- whether a remote config was supplied to the settings surface
- whether an endpoint is present
- whether an inline key is present
- whether a secret reference is present
- the secret reference scheme (`none`, `env`, `env_url`, or `unsupported`)
- credential status (`ready` or `needs attention`)
- diagnostic code and message

Supported diagnostic codes:

| Code | Meaning |
| --- | --- |
| `dark_factory_remote_credential_config_not_supplied` | Settings UI has no remote config sample yet. |
| `dark_factory_remote_credential_missing` | Remote mode has no inline key or secret reference. |
| `dark_factory_remote_credential_ref_unsupported` | Secret reference is not `env:NAME` or `env://NAME`. |
| `dark_factory_remote_credential_unresolved` | Env reference is supported but the variable is unset. |
| `dark_factory_remote_credential_ready` | Credential check passed. |

The UI never shows a resolved credential value. It only shows presence,
reference scheme, and diagnostic metadata.

Remediation hints are returned with each diagnostic and rendered in settings:

| Code | Remediation hints |
| --- | --- |
| `dark_factory_remote_credential_config_not_supplied` | Provide a remote config sample in environment driver settings; treat the state as an empty settings surface, not a provider failure. |
| `dark_factory_remote_credential_missing` | Set `apiKeySecretRef` to `env:NAME` or `env://NAME`; use inline `apiKey` only for controlled local testing. |
| `dark_factory_remote_credential_ref_unsupported` | Replace the unsupported reference with `env:NAME` or `env://NAME`; wait for a host-managed secret resolver before using `secret://` references. |
| `dark_factory_remote_credential_unresolved` | Create or export the referenced environment variable in the plugin host process; restart or reload the host after updating it. |
| `dark_factory_remote_credential_ready` | No credential remediation is needed; continue with probe or acquire only in an operator-controlled environment. |

## Circuit Breaker Evaluation

The bridge includes a deterministic in-process circuit breaker evaluator for
remote alpha observations.

State transitions:

| Current state | Input | Next state | Meaning |
| --- | --- | --- | --- |
| `closed` | success | `closed` | Provider remains available. |
| `closed` | consecutive failures reach threshold | `open` | Provider is blocked locally. |
| `open` | cooldown not expired | `open` | Continue blocking remote execution. |
| `open` | cooldown expired | `half_open` | Allow a controlled probe/retry. |
| `half_open` | success threshold met | `closed` | Provider recovered. |
| `half_open` | failure | `open` | Provider failed recovery probe. |

Default policy:

| Setting | Default |
| --- | --- |
| failure threshold | 3 consecutive failures |
| cooldown | 30000ms |
| half-open success threshold | 1 success |

The evaluator is pure and deterministic. It consumes sampled observations and
returns non-authoritative projection metadata, including `breakerState`,
`cooldownUntil`, `openReason`, and `runtimeImpact`. It does not contact a
provider, does not persist state, and does not advance Paperclip terminal state.

The settings page reads the plugin data key `remote-breaker-evaluation` and
renders the current evaluated breaker state next to credential diagnostics and
observability. Empty sampled input evaluates to a closed/monitor state; this is
an explicit local default, not a claim that a remote provider has been checked.

## Remote Provider Readiness

The bridge exposes a local readiness report through the plugin data key
`remote-provider-readiness`.

The report aggregates:

- `remote-credential-diagnostics`
- `remote-observability-snapshot`
- `remote-breaker-evaluation`

It returns one of three statuses:

| Status | Meaning | Operator action |
| --- | --- | --- |
| `ready` | Credentials are ready, breaker is closed, and sampled observations have no readiness alerts. | Start with probe, then acquire, in an operator-controlled environment. |
| `needs_attention` | A warning exists, such as empty settings-surface config, no sampled observations, cursor lag, high latency, or half-open breaker. | Review warnings before remote execute. |
| `blocked` | A critical signal exists, such as missing credentials or open breaker. | Resolve blocking signals before attempting remote provider execution. |

The readiness report is advisory only. It does not persist breaker state, does
not change execution-path behavior, does not contact a provider, and does not
advance Paperclip terminal state.

The report also includes an operator checklist:

| Checklist item | Pass condition | Required before |
| --- | --- | --- |
| Remote credentials | credential diagnostics are ready | `onEnvironmentProbe` |
| Remote observations | sampled observations exist and no observability readiness alert is active | `onEnvironmentAcquireLease` |
| Circuit breaker | breaker is closed | `onEnvironmentExecute` |
| Journal boundary | Journal remains truth source and Paperclip terminal state is unchanged | `onEnvironmentExecute` |

`nextSafeHook` is derived from the checklist and readiness signals. It is a
human-facing recommendation only:

| Readiness state | Typical `nextSafeHook` |
| --- | --- |
| missing or invalid credentials | `onEnvironmentValidateConfig` |
| warning-only state | `onEnvironmentProbe` |
| ready state | `onEnvironmentExecute` |

Each readiness report also includes a `readinessReceipt`:

| Field | Meaning |
| --- | --- |
| `receiptId` | Stable `df-readiness-{digest}` identifier for the exact readiness evidence. |
| `digest` | Deterministic FNV-1a 32-bit digest of checked-at time, status, next safe hook, signal codes, checklist status, and key counts. |
| `doesAuthorizeRemoteExecution` | Always `false`; the receipt records evidence but never grants permission by itself. |
| `evidence` | Compact basis containing credential status, breaker state, sampled observation count, alert count, signal codes, and checklist statuses. |

The receipt is suitable for operator notes and progress logs. It is not a
security token, not a capability grant, and not a substitute for reviewing Dark
Factory Journal.

When a previous readiness receipt is supplied as `previousReadiness`, the report
also returns `readinessTransition`:

| Field | Meaning |
| --- | --- |
| `transitionKind` | `new`, `unchanged`, `improved`, `regressed`, or `changed`. |
| `previousStatus` / `currentStatus` | Readiness state comparison. |
| `previousNextSafeHook` / `currentNextSafeHook` | Whether the safe lifecycle boundary moved forward or backward. |
| `receiptChanged` | Whether the evidence digest changed. |
| `summary` | Human-readable transition summary for operator notes. |

Transitions are computed locally from supplied previous evidence. They do not
persist state, do not prove remote health, and do not authorize execution.

The report also includes a `preflightPlan` for operator review:

| Step | Meaning |
| --- | --- |
| `onEnvironmentValidateConfig` | Always allowed as the local diagnostic starting point. |
| `onEnvironmentProbe` | Allowed, review-required, or blocked according to credential and breaker signals. |
| `onEnvironmentAcquireLease` | Allowed only when current readiness permits moving beyond probe. |
| `onEnvironmentExecute` | Allowed only when the readiness state reaches the execute boundary. |

Each preflight step includes a status (`allowed`, `review_required`, or
`blocked`), a message, blocking signal/checklist codes, the projection boundary,
and `terminalStateAdvanced: false`. The plan is advisory operator guidance. It
does not call hooks, does not persist state, does not connect to a provider, and
does not grant execution permission.

The readiness data surfaces are assembled through an active context ingestion
layer. That layer normalizes the currently supplied params into:

- remote config diagnostics
- sampled remote observations
- metrics snapshot and alert candidates
- previous breaker evidence
- previous readiness evidence
- readiness report input

The active context is in-process only. It is intended as the future host/runtime
context boundary, but it does not persist state, does not resolve host-managed
secrets, does not contact a provider, and does not expose resolved credential
values in plugin data.

Host/runtime callers may supply this context as `activeContext`,
`hostActiveContext`, or `remoteProviderActiveContext`. The bridge maps supported
nested fields into the same readiness input shape:

- `environmentConfig` / `activeEnvironmentConfig` / `config`
- `sampledObservations` / `remoteObservations` / `observations`
- `breakerEvidence` / `previousBreaker`
- `readinessEvidence` / `previousReadiness`
- `alertThresholds`
- `circuitBreakerPolicy`
- `journal.expectedSequenceNo`

Direct top-level params override nested host context fields. This lets test
harnesses and future host adapters override one field without rebuilding the
entire context envelope.

When Paperclip host settings and runtime context arrive separately, use the
`remote-provider-host-context-adapter` data surface first. It accepts
settings-style input (`hostSettingsContext`, `settingsContext`, or
`environmentSettingsContext`) and runtime-style input (`hostRuntimeContext`,
`runtimeContext`, or `environmentRuntimeContext`) and emits a single
`activeContext` envelope suitable for `remote-provider-host-context-bridge`.

The adapter is compatibility glue only. It does not call environment lifecycle
hooks, does not contact a provider, does not resolve or expose credential
values, and does not authorize remote execution.

The bridge also exposes the assembled host/runtime context through the plugin
data key `remote-provider-host-context-bridge`. This data surface returns:

- the normalized active context
- the derived readiness report
- a compact host context summary for archives and operator notes
- archive hints that state the result should not be persisted as a new control
  plane and may only inform projection/cache/cursor/receipt/request metadata
- `doesAuthorizeRemoteExecution: false`

The bridge result is an intake and review boundary, not an execution trigger. It
does not call lifecycle hooks, does not contact a provider, does not persist
state, and does not grant permission to execute.

Previous readiness and breaker evidence can be represented with the
`remote-provider-evidence-store-contract` helpers. The contract converts a host
context bridge result into a deterministic evidence record containing:

- breaker state evidence
- readiness transition seed evidence
- readiness receipt id and digest
- sampled observation and alert counts
- storage boundary metadata

The evidence record is explicitly `contract_only_not_persisted`. It may seed a
future active context as `previousBreaker` and `previousReadiness`, but it does
not itself write plugin DB rows, store resolved credential values, authorize
remote execution, or advance terminal state.

The future SQL shape is documented in the contract-only file
`packages/plugins/integrations/dark-factory-bridge/docs/remote-provider-previous-evidence-storage-contract.sql`.
This file is intentionally outside `migrations/`; it is not applied by the
plugin host. Guard tests lock the table shape, lookup indexes, and constraints
before any persistence implementation is approved.

The bridge also ships deterministic host observation fixtures for local replay.
These fixtures are not a storage layer and do not contact a provider. They
produce host-style active context envelopes for:

- `healthy`
- `warning_latency`
- `blocked_failures`
- `stale_readiness`

Each fixture can be replayed through the active context builder and readiness
report to verify UI states, preflight behavior, breaker behavior, cursor lag,
and readiness transitions before wiring real host-collected observations.

## UI Smoke Preview Harness

The bridge exposes deterministic UI preview states through the plugin data key
`remote-provider-ui-smoke-preview`.

Supported scenarios:

| Scenario | Preview status | Expected UI meaning |
| --- | --- | --- |
| `healthy` | `ready` | credentials ready, observations clean, breaker closed, execute boundary allowed by advisory preflight |
| `warning_latency` | `needs_attention` | latency warning present; execute preflight is blocked until operator review |
| `blocked_failures` | `blocked` | repeated provider failures open the breaker and require operator intervention |
| `stale_readiness` | `needs_attention` | Journal cursor lag regresses readiness from the previous ready evidence |

The preview harness composes host observation fixtures, active context
ingestion, observability snapshots, circuit breaker evaluation, credential
diagnostics, and readiness reports. It is intended for UI/data smoke tests
before full UI alpha. It does not contact a provider, does not persist state,
does not expose resolved credential values, and does not authorize remote
execution.

The settings page renders the same preview through a scenario selector. Use it
to smoke-check the internal UI before wiring real host-collected observations:

1. open the Dark Factory Bridge settings page
2. select a scenario
3. verify preview status, next safe hook, breaker state, sampled observation
   count, cursor lag, alert count, truth source, authoritative flag, and
   terminal-state flag

The selector is still a local preview surface. It is not an operator approval
control and does not change lifecycle hook behavior.

The preview panel now also renders the dry-run guard result for each lifecycle
boundary:

- `onEnvironmentValidateConfig`
- `onEnvironmentProbe`
- `onEnvironmentAcquireLease`
- `onEnvironmentExecute`

For each hook, the panel shows the advisory decision, matched preflight status,
blocking codes, dry-run receipt id, whether the guard would contact the remote
provider, and whether it authorizes execution. The provider contact and
authorization flags must remain `no`; the panel is evidence for operator
review, not an approval control.

For browser-level smoke without a full Paperclip host, generate a standalone
HTML harness from `buildUiSmokePreviewBrowserHarness`. The harness embeds the
same deterministic preview envelopes, exposes the same scenario selector, and
renders the boundary fields that must remain visible before full UI alpha:

- truth source
- authoritative flag
- terminal-state-advanced flag
- next safe hook
- breaker state
- cursor lag and alert count
- dry-run guard decisions and receipts for all lifecycle hooks

This harness is suitable for Playwright or manual browser checks. It remains a
local preview artifact and does not connect to a provider.

For repeatable headless browser validation, run the CDP-based smoke runner:

```bash
cd /home/siyuah/workspace/paperclip_upstream/packages/plugins/integrations/dark-factory-bridge
pnpm smoke:ui:browser
```

The runner:

- generates `output/playwright/dark-factory-ui-smoke/index.html`
- locates Chromium from `DARK_FACTORY_UI_SMOKE_CHROMIUM`, Playwright's local
  browser cache, or common system browser names
- opens the generated page through Chrome DevTools Protocol
- switches through `healthy`, `warning_latency`, `blocked_failures`, and
  `stale_readiness`
- asserts preview status, truth source, non-authoritative output, terminal
  state preservation, next safe hook, breaker state, and Journal truth badge
- writes `smoke-result.json` and per-scenario screenshots under the output
  directory

Use `--no-screenshots` for a faster assertion-only pass, or `--out DIR` to send
scratch output outside the repository.

## Remote Provider Dry-Run Guard

The bridge exposes a pre-execution dry-run guard through the plugin data key
`remote-provider-dry-run-guard`.

The guard composes:

- host settings/runtime context adapter
- host active context bridge
- credential diagnostics
- observability snapshot
- circuit breaker evaluation
- readiness report and preflight plan

Input can use the same host context envelope names as the adapter:

- `hostSettingsContext`, `settingsContext`, or `environmentSettingsContext`
- `hostRuntimeContext`, `runtimeContext`, or `environmentRuntimeContext`

Set `targetHook` to one of:

- `onEnvironmentValidateConfig`
- `onEnvironmentProbe`
- `onEnvironmentAcquireLease`
- `onEnvironmentExecute`

The guard returns:

- `decision`: `allowed`, `review_required`, or `blocked`
- matched readiness preflight step
- blocking signal/checklist codes
- deterministic `guardReceipt`
- operator summary for UI or runbook notes

In the current UI smoke preview, only a summarized guard payload is rendered:
target hook, decision, preflight status, blocking codes, receipt id, digest,
provider-contact flag, and authorization flag. The full adapter/bridge payload
stays out of the UI preview panel.

The result is advisory only. It never contacts the remote provider, never
invokes lifecycle hooks, never persists state, and never authorizes remote
execution. `doesAuthorizeRemoteExecution` is always `false`, and
`terminalStateAdvanced` is always `false`.

Use this guard immediately before operator-controlled remote alpha attempts to
confirm that the current host settings, sampled observations, previous breaker
evidence, and readiness evidence agree on the next safe hook. The guard receipt
is suitable for run notes or future plugin namespace DB metadata, but it is not
a Dark Factory Journal truth event.

Recommended alpha thresholds:

| Signal | Suggested warning threshold | Operator action |
| --- | --- | --- |
| error rate | 50% over the sampled window | inspect provider health and Journal before retrying |
| max latency | 5000ms | check provider/network latency and retry pressure |
| cursor lag | 5 Journal sequence numbers | reconcile Journal cursor before trusting projection freshness |

## Boundaries

- Dark Factory Journal remains truth source.
- Paperclip receives projection and receipt metadata only.
- The bridge does not modify Paperclip Task/Issue main models.
- The bridge does not become a second control plane.
- The bridge does not store resolved secrets in normalized config or logs.
- Remote mode should stay behind trusted network boundaries until metrics,
  alerts, circuit breaker behavior, and host-managed secret resolution are
  complete.

## Next Steps

1. Replace the alpha `env:` resolver with a Paperclip host secret resolver when
   the SDK exposes one.
2. Feed real host-collected remote observations into the
   `remote-observability-snapshot` data key.
3. Feed the active environment driver config into
   `remote-credential-diagnostics` when the host exposes settings context.
4. Add a runbook-driven manual dry-run checklist for the first gated real
   provider attempt.
5. Wire the circuit breaker evaluator into the remote execution path after host
   persistence for breaker state is available.
6. Feed sampled observations and previous breaker state into
   `remote-breaker-evaluation` from host settings/runtime context.
7. Wire the snapshot into a metrics exporter and host alert rules for remote
   provider unavailability and repeated
   execution failures.
