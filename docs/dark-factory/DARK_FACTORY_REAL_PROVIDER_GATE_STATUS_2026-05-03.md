# Dark Factory Real Provider Gate Status

Date: 2026-05-03

Scope: Paperclip Dark Factory bridge plugin final production gate.

## Summary

All offline, mock, live-local, UI-preview, install-readiness, and operator
handoff work for the Dark Factory bridge plugin is complete and pushed to the
maintained fork branch.

The first operator-gated provider attempt has now passed through the local
Dark Factory external-runs shim backed by LinghuCall `gpt-5.5`. The operator
provided sanitized output showing:

- `pnpm gate:provider-status -- --require-ready` completed with
  `readyForOperatorGatedAttempt: true`.
- `pnpm test -- tests/remote-gated-integration.spec.ts` passed.
- The gated test exercised validate, probe, acquire, execute, resume, and
  release against `http://127.0.0.1:9791`.
- The provider backend was reached through the shim, not by treating
  `api.linghucall.net` as a Dark Factory `/api/*` endpoint.

The bridge must therefore stay in this state:

- `installableAlphaReady: true`
- `productionReady: false`
- remaining blocker: `provider_shim_not_operationalized`

This is intentional. The first gated attempt result is recorded, but the passing
path still depends on a local operator-started shim. Production install must not
be claimed until the provider/shim deployment, monitoring, startup, retention,
and rollback plan are operationalized.

## Safe Environment Check

A non-sensitive environment presence check was run. It printed only boolean
presence, string lengths, and whether the integration flag equaled `1`.

Result:

| Gate input | Present | Length | Notes |
| --- | --- | --- | --- |
| Integration flag | false | 0 | Required to opt in to the gated test. |
| Provider endpoint | false | 0 | Required to identify the operator-controlled provider. |
| Credential value | false | 0 | Required only in the operator shell. |
| Credential reference | false | 0 | Alternative to direct credential value. |

Derived result: `runGated=false`.

No endpoint value, credential value, or credential reference value was printed.

## Verification Snapshot

The current install-readiness report still passes all offline checks and now
recognizes the recorded gated attempt evidence:

- offline readiness command completed successfully
- `installableAlphaReady: true`
- `productionReady: false`
- failed checks: none
- recorded gated attempt evidence: pass
- remaining production blocker: `provider_shim_not_operationalized`

The gated integration test remains skipped by default when the required
operator inputs are absent. This is the expected safe state for ordinary local
test runs.

## Recorded Gated Attempt

Machine-readable evidence:

- `packages/plugins/integrations/dark-factory-bridge/docs/real-provider-gated-attempt-evidence.json`

Sanitized operator result:

| Check | Result |
| --- | --- |
| Gate status command | passed |
| `readyForOperatorGatedAttempt` | true |
| Gated integration spec | passed |
| Test files / tests | 1 / 1 |
| Bridge endpoint kind | local Dark Factory external-runs shim |
| Backend kind | OpenAI-compatible chat completions |
| Model | `gpt-5.5` |
| Credential values committed | no |

Observed non-sensitive request statuses:

| Method | Path | Status |
| --- | --- | --- |
| GET | `/health` | 200 |
| POST | `/external-runs` | 201 |
| GET | `/external-runs/{runId}` | 200 |
| GET | `/external-runs/{runId}/route-decisions` | 200 |
| GET | `/external-runs/{runId}` | 200 |

## Required Operator Action

To complete the final gate, an operator must use the existing runbook:

- `docs/dark-factory/DARK_FACTORY_FIRST_REAL_PROVIDER_GATED_ATTEMPT_RUNBOOK.md`

The required sequence is:

1. Generate the first-provider preflight evidence.
2. Generate the operator session packet.
3. Generate the handoff manifest.
4. Verify the handoff bundle.
5. Enable the gated provider inputs in a short-lived operator shell.
6. Run `pnpm test -- tests/remote-gated-integration.spec.ts`.
7. Archive only non-sensitive evidence.
8. Keep `provider_shim_not_operationalized` active until the shim/provider
   deployment is operationalized.

## Boundary Compliance

- Dark Factory Journal remains truth source.
- All bridge outputs remain `authoritative: false`.
- All bridge outputs keep `terminalStateAdvanced: false`.
- No Paperclip Task/Issue main model change is required.
- A real model backend connection was attempted only through the local
  Dark Factory external-runs shim.
- No credential value was printed, stored, or committed.
- The production blocker remains active until provider/shim operations are
  productionized.

## Decision

Do not claim full production install readiness yet.

The plugin is ready for controlled alpha/internal installation and has passed
the first shim-backed real backend gated attempt. It is not ready for full
production installation until `provider_shim_not_operationalized` is cleared by
an operational provider/shim deployment plan and validation.
