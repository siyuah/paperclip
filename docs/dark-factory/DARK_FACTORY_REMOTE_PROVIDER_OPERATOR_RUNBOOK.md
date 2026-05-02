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
2. Add metrics for request latency, retry count, failure class, and cursor lag.
3. Add alerting for remote provider unavailability and repeated execution
   failures.
4. Implement a real circuit breaker before broad production traffic.
