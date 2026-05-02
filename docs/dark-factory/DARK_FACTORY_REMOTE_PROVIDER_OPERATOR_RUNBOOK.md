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
4. Wire the circuit breaker evaluator into the remote execution path after host
   persistence for breaker state is available.
5. Feed sampled observations and previous breaker state into
   `remote-breaker-evaluation` from host settings/runtime context.
6. Wire the snapshot into a metrics exporter and host alert rules for remote
   provider unavailability and repeated
   execution failures.
