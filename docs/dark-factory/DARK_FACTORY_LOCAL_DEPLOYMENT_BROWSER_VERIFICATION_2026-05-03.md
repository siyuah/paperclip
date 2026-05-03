# Dark Factory Local Deployment Browser Verification - 2026-05-03

Status: pass  
Scope: fork-local Paperclip + Dark Factory bridge deployment on operator machine  
Branch: `fork-master-product`  
Paperclip commit: `c0fd14ed chore: record production cutover result evidence`

## Summary

The local deployment was verified with the supervised LinghuCall provider shim
and the Dark Factory bridge WebUI preview running on the operator machine.

Verified local endpoints:

- WebUI preview: `http://127.0.0.1:4178/`
- WebUI preview health: `http://127.0.0.1:4178/__paperclip__/health`
- Supervised provider shim: `http://127.0.0.1:9791/api/health`

## Service State

The supervised `linghucall-provider-shim.service` systemd user service was
active. The shim health endpoint reported:

- `ok: true`
- `status: ready`
- `protocolReleaseTag: v3.0-agent-control-r1`
- `providerKind: linghucall_openai_compatible`
- `providerCredentialValueRedacted: true`

No credential values were read, printed, or recorded.

## Browser Verification

`browser-harness` opened the local WebUI preview at
`http://127.0.0.1:4178/`.

Observed browser state:

- URL: `http://127.0.0.1:4178/`
- Title: `Dark Factory Bridge WebUI Preview`
- Scenario count: 4
- Visible sections:
  - `Dark Factory Bridge WebUI Preview`
  - `UI Smoke Preview`
  - `Remote Provider Dry-Run Guard`

Scenario checks:

| Scenario | Preview status | Readiness | Next safe hook | Breaker | Execute dry-run |
| --- | --- | --- | --- | --- | --- |
| `healthy` | `ready` | `ready` | `onEnvironmentExecute` | `closed` | `allowed` |
| `warning_latency` | `needs_attention` | `needs_attention` | `onEnvironmentProbe` | `closed` | `blocked` |
| `blocked_failures` | `blocked` | `blocked` | `onEnvironmentProbe` | `open` | `blocked` |
| `stale_readiness` | `needs_attention` | `needs_attention` | `onEnvironmentProbe` | `closed` | `blocked` |

All scenarios preserved:

- `truthSource: dark-factory-journal`
- `Authoritative: no`
- `Terminal advanced: no`

## Automated UI Smoke

`pnpm smoke:ui:browser -- --no-screenshots` passed.

The generated smoke result validated all four scenarios and confirmed:

- `truthSource: dark-factory-journal`
- `authoritative: false`
- `terminalStateAdvanced: false`

## Plugin Verification

Commands run from
`packages/plugins/integrations/dark-factory-bridge`:

- `pnpm typecheck`
- `pnpm build`
- `pnpm test`
- `pnpm install:readiness -- --skip-build`

Results:

- Typecheck: pass
- Build: pass
- Tests: pass, `184 passed`, `1 gated skipped`
- Install readiness:
  - `installableAlphaReady: true`
  - `productionReady: true`
  - `productionBlockers: []`
  - `failedChecks: []`

## Operator-Env Note

A direct tool-process rerun of
`verify_linghucall_provider_shim_supervised.py --include-paperclip-gate`
failed because the Codex tool process did not inherit
`DARK_FACTORY_LINGHUCALL_SHIM_BRIDGE_KEY`.

This was not treated as a product bug because:

- the systemd service health checks passed,
- the credential-bearing file stayed private,
- the previously recorded supervised gate evidence passed,
- the current tool process intentionally did not read bridge key contents.

## Boundary Compliance

- Dark Factory Journal remains truth source: yes
- No Paperclip terminal state was advanced by preview verification: yes
- All UI preview outputs remain non-authoritative: yes
- No credential value was read, printed, stored, or committed: yes
- No Paperclip core/server/ui code was modified: yes
- No V3.0 binding artifact was modified: yes

## Conclusion

The local fork deployment is usable through the browser at
`http://127.0.0.1:4178/` and the provider shim is ready at
`http://127.0.0.1:9791`.

Within the recorded fork-local deployment boundary, the Paperclip Dark Factory
bridge remains production-ready.
