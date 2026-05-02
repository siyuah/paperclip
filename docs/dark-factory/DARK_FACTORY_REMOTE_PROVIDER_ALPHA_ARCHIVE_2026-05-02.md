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

1. Connect `apiKeySecretRef` to the host secret resolver once the Paperclip host
   exposes that resolution hook.
2. Add metrics and alerting for remote request latency, error rate, retry count,
   stale projection rate, and journal cursor lag.
3. Design the real circuit breaker state machine before allowing provider
   outages to influence operator-facing health beyond projection metadata.
4. Add remote integration documentation for the exact operator-controlled
   environment variables and failure triage flow.
