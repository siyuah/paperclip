# Dark Factory First Real Provider Gated Attempt Runbook

Status: operator-gated alpha checklist  
Scope: Paperclip Dark Factory bridge plugin remote provider mode  
Date: 2026-05-03

This runbook is the manual gate for the first real Dark Factory provider
attempt. It is not an automatic deployment plan and it is not an approval
control by itself. The operator must capture the dry-run guard receipt before
running the gated integration test.

## Preconditions

Before any real provider attempt:

1. Confirm the bridge plugin branch is the intended fork branch.
2. Run `pnpm preflight:first-provider` and archive the generated evidence JSON.
3. Confirm the generated evidence says `gatedIntegrationDefaultSkip: true`.
4. Confirm the provider endpoint is trusted and operator-controlled.
5. Confirm the API key is only present in the operator shell environment.
6. Confirm the settings UI dry-run guard shows a receipt for the target hook.

Do not continue if any precondition fails.

## Required Boundary Assertions

Every check and artifact must preserve:

- Dark Factory Journal remains truth source.
- `authoritative: false`.
- `terminalStateAdvanced: false`.
- `doesAuthorizeRemoteExecution: false` for readiness and dry-run receipts.
- `shouldContactRemoteProvider: false` for dry-run guard output.
- No Paperclip Task/Issue main model changes.
- No plugin DB persistence beyond future projection/cache/cursor/receipt/request
  metadata.
- No resolved credential value in docs, test snapshots, logs, Progress Log, or
  committed files.

The dry-run guard receipt is evidence for operator review only. It is not a
security token, not a capability grant, and not a Dark Factory Journal truth
event.

## Environment Variables

Use a short-lived operator shell. Do not write these values into files.

```bash
cd /home/siyuah/workspace/paperclip_upstream/packages/plugins/integrations/dark-factory-bridge

export DARK_FACTORY_REMOTE_INTEGRATION=1
export DARK_FACTORY_REMOTE_ENDPOINT=https://dark-factory.example.internal
export DARK_FACTORY_REMOTE_API_KEY_ENV=DARK_FACTORY_REMOTE_API_KEY
export DARK_FACTORY_REMOTE_API_KEY=<set only in the operator shell>
```

`DARK_FACTORY_REMOTE_API_KEY_ENV` tells the plugin to use
`apiKeySecretRef: env:DARK_FACTORY_REMOTE_API_KEY`. The resolved key must never
be printed or committed.

## Dry-Run Gate

Before enabling `DARK_FACTORY_REMOTE_INTEGRATION=1`, run the local preview and
record the execute dry-run receipt id in the operator notes:

```bash
pnpm preflight:first-provider
```

The command writes `output/dark-factory-first-provider-preflight/evidence.json`.
Archive that file with operator notes after confirming it contains no resolved
credential values.

In the generated evidence and Dark Factory Bridge settings preview, verify:

| Field | Required value |
| --- | --- |
| `targetHook` | `onEnvironmentExecute` |
| `decision` | `allowed` for the chosen provider attempt |
| `shouldContactRemoteProvider` | `false` |
| `doesAuthorizeRemoteExecution` | `false` |
| `truthSource` | `dark-factory-journal` |
| `authoritative` | `false` |
| `terminalStateAdvanced` | `false` |

If the decision is `review_required`, stop and resolve the warning or record a
human approval note before proceeding. If the decision is `blocked`, do not run
the gated integration test.

## Gated Integration Command

The real-provider test is skipped by default. It only runs when
`DARK_FACTORY_REMOTE_INTEGRATION=1` and a provider endpoint plus credential
reference are supplied.

Before setting those variables, `pnpm preflight:first-provider` must report
`gatedIntegrationDefaultSkip: true`.

```bash
pnpm test -- tests/remote-gated-integration.spec.ts
```

The test exercises:

1. `onEnvironmentValidateConfig`
2. `onEnvironmentProbe`
3. `onEnvironmentAcquireLease`
4. `onEnvironmentExecute`
5. `onEnvironmentResumeLease`
6. `onEnvironmentReleaseLease`

Expected pass condition:

- test passes without printing the resolved credential value
- all returned metadata remains non-authoritative
- terminal state remains unchanged
- provider lease id is deterministic for the generated run id

## Failure Handling

If validation fails locally:

- stop before probe
- inspect credential diagnostics
- do not retry execute

If probe fails:

- stop before acquire
- inspect provider endpoint reachability and Dark Factory provider logs
- do not create a remote run

If acquire succeeds but execute fails:

- attempt release once
- capture the failure class and provider lease id
- inspect Dark Factory Journal before retrying

If release fails:

- do not manually mutate Paperclip Task/Issue state
- capture the provider lease id for later cleanup
- escalate with the run id, lease id, failure class, and dry-run receipt id

## Rollback

To return to the default safe state:

```bash
unset DARK_FACTORY_REMOTE_INTEGRATION
unset DARK_FACTORY_REMOTE_ENDPOINT
unset DARK_FACTORY_REMOTE_API_KEY_ENV
unset DARK_FACTORY_REMOTE_API_KEY
```

Then run:

```bash
pnpm test -- tests/remote-gated-integration.spec.ts
```

Expected rollback state: the gated integration test is skipped.

## Operator Evidence Template

Record only references and non-sensitive evidence:

```text
date:
branch:
commit:
provider endpoint host:
dry-run guard receipt id:
readiness receipt id:
target hook:
decision:
gated integration result:
provider lease id:
failure class, if any:
Journal cursor / run ref:
rollback completed: yes/no
```

Never record a resolved API key, bearer token, password, or connection string.

## Stop Conditions

Stop immediately if:

- dry-run guard decision is `blocked`
- `authoritative` is not `false`
- `terminalStateAdvanced` is not `false`
- `shouldContactRemoteProvider` is not `false` on dry-run output
- a resolved credential value appears in stdout, stderr, logs, docs, or test
  snapshots
- Dark Factory Journal and bridge projection disagree about the latest cursor
- the operator cannot confirm which provider endpoint is being used
