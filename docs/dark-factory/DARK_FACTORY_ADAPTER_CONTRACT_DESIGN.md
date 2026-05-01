# Dark Factory Adapter Contract Design

## 1. 目标

This document defines the contract between Paperclip execution inputs and a Dark Factory request/response envelope. It is the fork-internal mapping that lets the Dark Factory bridge plugin environment lifecycle hooks translate Paperclip run execution requests into Dark Factory-shaped requests. In the current phase the translation is mock-only and deterministic; it does not connect to a real Dark Factory service.

The contract covers two Paperclip execution surfaces:

- `PluginEnvironmentExecuteParams` from `packages/plugins/sdk/src/protocol.ts`, re-exported by `@paperclipai/plugin-sdk`.
- `AdapterExecutionContext` and `AdapterExecutionResult` from `packages/adapter-utils/src/types.ts`.

The environment lifecycle hooks already provide the plugin-hosted driver path. This document describes the field-level request envelope used by that path and the allocation rules for response data when the same semantics later need to be expressed through adapter-utils.

## 2. AdapterExecutionContext 字段映射

The SDK source of truth for plugin-hosted execution is `PluginEnvironmentExecuteParams`:

```ts
interface PluginEnvironmentExecuteParams extends PluginEnvironmentDriverBaseParams {
  driverKey: string;
  companyId: string;
  environmentId: string;
  config: Record<string, unknown>;
  lease: PluginEnvironmentLease;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  stdin?: string;
  timeoutMs?: number;
}
```

The adapter-utils source of truth for adapter execution is `AdapterExecutionContext`:

```ts
interface AdapterExecutionContext {
  runId: string;
  agent: AdapterAgent;
  runtime: AdapterRuntime;
  config: Record<string, unknown>;
  context: Record<string, unknown>;
  executionTarget?: AdapterExecutionTarget | null;
  executionTransport?: { remoteExecution?: Record<string, unknown> | null };
  onLog: (stream: "stdout" | "stderr", chunk: string) => Promise<void>;
  onMeta?: (meta: AdapterInvocationMeta) => Promise<void>;
  onSpawn?: (meta: { pid: number; processGroupId: number | null; startedAt: string }) => Promise<void>;
  authToken?: string;
}
```

### PluginEnvironmentExecuteParams mapping

| Paperclip field | Dark Factory mapping | Mapping mode | Notes |
| --- | --- | --- | --- |
| `driverKey` | `driver.driverKey` | direct | Expected value is `dark-factory-mock` during mock phase. |
| `companyId` | `paperclip.companyId` | direct | Correlation only; not a Dark Factory truth field. |
| `environmentId` | `paperclip.environmentId` | direct | Used to scope plugin-hosted environment diagnostics. |
| `config.mode` | `runtime.mode` | normalized | Only `mock` is accepted by current hooks. |
| `config` | `runtime.configSnapshot` | redacted snapshot | Store non-sensitive mock config only. Real connector fields require separate review. |
| `lease.providerLeaseId` | `lease.providerLeaseId` | direct | Stable mock ID such as `df-lease-{runId}`. |
| `lease.metadata.runId` | `journalRunRef` | preferred direct | Current worker uses this first to recover the mock run context. |
| `lease.metadata.journalCursor` | `cursor.before` | projection metadata | Cursor is a projection/cache pointer, not Journal authority. |
| `lease.metadata.providerHealth` | `provider.healthBefore` | projection metadata | Used for runtime policy visibility. |
| `lease.metadata.runtimeImpact` | `provider.runtimeImpactBefore` | projection metadata | Keeps Paperclip terminal state unchanged. |
| `command` | `requestPayload.command` | passthrough (mock) | Mock phase treats it as metadata, not a Dark Factory DSL. |
| `args` | `requestPayload.args` | passthrough (mock) | Empty array when omitted. |
| `cwd` | `requestPayload.cwd` | passthrough (optional) | Workspace path metadata only. |
| `env` | `requestPayload.envKeys` | key-only summary | Values must not be copied into the envelope or logs. |
| `stdin` | `requestPayload.stdinDigest` | digest/length only | Raw stdin may contain user data and should not be persisted in mock metadata. |
| `timeoutMs` | `runtime.timeoutMs` | direct | Used as execution policy metadata. |

### AdapterExecutionContext mapping

| Paperclip field | Dark Factory mapping | Mapping mode | Notes |
| --- | --- | --- | --- |
| `runId` | `journalRunRef` | direct | Primary Paperclip run correlation ID. |
| `agent.id` | `paperclip.agentId` | direct | Correlates the request to the Paperclip agent. |
| `agent.companyId` | `paperclip.companyId` | direct | Company correlation. |
| `agent.name` | `paperclip.agentName` | direct | Display/audit metadata. |
| `agent.adapterType` | `paperclip.adapterType` | direct | May be `null`; does not change Dark Factory truth. |
| `agent.adapterConfig` | `runtime.adapterConfigSnapshot` | redacted snapshot | Only non-sensitive values or references may be persisted. |
| `runtime.sessionId` | `paperclip.legacySessionId` | direct | Legacy view; prefer session params when present. |
| `runtime.sessionParams` | `paperclip.sessionParams` | passthrough after redaction | JSON metadata; do not include sensitive values. |
| `runtime.sessionDisplayId` | `paperclip.sessionDisplayId` | direct | Operator-facing correlation. |
| `runtime.taskKey` | `paperclip.taskKey` | direct | Task correlation only. |
| `config` | `runtime.configSnapshot` | redacted snapshot | Mock phase accepts only mock-safe config. |
| `context` | `requestPayload.context` | passthrough after redaction | Product context, not Journal authority. |
| `executionTarget` | `runtime.executionTarget` | provider-neutral copy | Future real connector may use it for placement. |
| `executionTransport.remoteExecution` | `runtime.legacyRemoteExecution` | compatibility copy | Legacy remote transport view. |
| `onLog` | `paperclipCallbacks.onLog` | callback reference | Not serialized into Dark Factory envelope. |
| `onMeta` | `paperclipCallbacks.onMeta` | callback reference | Used to emit invocation metadata; not persisted as data. |
| `onSpawn` | `paperclipCallbacks.onSpawn` | callback reference | Local process callback; mock path should not spawn. |
| `authToken` | not mapped | excluded | Must never be copied into envelope, stdout, stderr, metadata, or fixtures. |

## 3. Dark Factory Request Envelope 结构

The mock request envelope is intentionally small and non-authoritative. It is a stable shape for the mock bridge and a future handoff point for a real connector.

```ts
type DarkFactoryMockRequestEnvelope = {
  source: "dark-factory-projection";
  authoritative: false;
  truthSource: "dark-factory-journal";
  requestId: string;
  idempotencyKey: string;
  journalRunRef: string;
  runtime: {
    mode: "mock";
    driverKey?: string;
    environmentId?: string;
    timeoutMs?: number;
    configSnapshot?: Record<string, unknown>;
    executionTarget?: unknown;
    legacyRemoteExecution?: Record<string, unknown> | null;
  };
  paperclip: {
    runId: string;
    companyId?: string;
    agentId?: string;
    agentName?: string;
    adapterType?: string | null;
    taskKey?: string | null;
    sessionDisplayId?: string | null;
  };
  lease?: {
    providerLeaseId: string | null;
    metadata?: Record<string, unknown>;
  };
  requestPayload: {
    command?: string;
    args?: string[];
    cwd?: string;
    envKeys?: string[];
    stdinDigest?: string;
    context?: Record<string, unknown>;
  };
  cursor?: {
    before?: Record<string, unknown>;
  };
};
```

Rules:

- `source`, `authoritative`, and `truthSource` are mandatory on every envelope.
- `authoritative` is always `false`; the envelope is an execution request/projection wrapper, not Journal truth.
- `idempotencyKey` is derived from stable request identity. In plugin-hosted execution the current mock key is based on run, command, and args; a future adapter may include an explicit host-supplied key.
- Environment variables and raw stdin are not stored as values. Use key summaries and bounded digests only.

## 4. Dark Factory Response Envelope -> AdapterExecutionResult 映射

Current plugin-hosted execution returns `PluginEnvironmentExecuteResult`:

```ts
interface PluginEnvironmentExecuteResult {
  exitCode: number | null;
  signal?: string | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  metadata?: Record<string, unknown>;
}
```

The adapter-utils execution result has a wider shape:

```ts
interface AdapterExecutionResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  errorMessage?: string | null;
  errorCode?: string | null;
  errorFamily?: "transient_upstream" | null;
  retryNotBefore?: string | null;
  errorMeta?: Record<string, unknown>;
  usage?: UsageSummary;
  sessionId?: string | null;
  sessionParams?: Record<string, unknown> | null;
  sessionDisplayId?: string | null;
  provider?: string | null;
  biller?: string | null;
  model?: string | null;
  billingType?: AdapterBillingType | null;
  costUsd?: number | null;
  resultJson?: Record<string, unknown> | null;
  runtimeServices?: AdapterRuntimeServiceReport[];
  summary?: string | null;
  clearSession?: boolean;
  question?: { prompt: string; choices: Array<{ key: string; label: string; description?: string }> } | null;
}
```

Response allocation:

| Dark Factory response field | PluginEnvironmentExecuteResult | AdapterExecutionResult | Notes |
| --- | --- | --- | --- |
| `exitCode` | `exitCode` | `exitCode` | Mock success returns `0`; failures may return `null` with error fields in adapter-utils. |
| `signal` | `signal` | `signal` | Optional in plugin hook, required nullable in adapter-utils. |
| `timedOut` | `timedOut` | `timedOut` | Direct. |
| Projection summary | `stdout` JSON string | `summary` or compact stdout equivalent | Must include non-authoritative boundary if serialized. |
| Human error text | `stderr` | `errorMessage` and stderr/log callback | Keep mock success stderr empty. |
| `projection` | `metadata.projection` | `resultJson.projection` | Derived projection only. |
| `cursor` | `metadata.cursor` | `resultJson.cursor` | Journal cursor projection/cache pointer. |
| `receipt` | `metadata.receipt` | `resultJson.receipt` | Receipt does not claim terminal success. |
| `replay` | `metadata.replay` | `resultJson.replay` | Replay diagnostics and stale reason. |
| Runtime mode | `metadata.runtimeMode` | `resultJson.runtimeMode` | `mock` in current phase. |
| Provider health | `metadata.providerHealth` | `resultJson.providerHealth` | Runtime policy projection. |
| Runtime impact | `metadata.runtimeImpact` | `resultJson.runtimeImpact` | Must keep Paperclip terminal state unchanged. |
| Attempt metadata | `metadata.runAttemptMetadata` | `resultJson.runAttemptMetadata` | Contains `failureClass` when relevant. |
| Boundary tuple | top-level metadata | top-level `resultJson` | Always include source/authoritative/truthSource. |
| Request envelope | optional metadata summary | run event metadata | Store only redacted request metadata, not raw sensitive fields. |

Run event metadata should receive bounded correlation fields: `driverKey`, `environmentId`, `providerLeaseId`, `runId`, `requestId`, `idempotencyKey`, `cursorBefore`, `cursorAfter`, `receiptId`, `projectionSource`, `truthSource`, and `authoritative`.

Plugin namespace DB should be limited to projection cache, cursor cache, receipt cache, replay/reconciliation diagnostics, and request metadata. Paperclip Task/Issue main model fields and core run terminal transitions require separate architecture review.

## 5. Idempotency Contract

The request-response loop is idempotent by construction:

- The same `(runId, command, args, idempotencyKey)` maps to the same mock callback receipt.
- A callback receipt is an observation/request receipt, not a terminal success claim.
- Replaying the same Journal entries returns the same reconciliation classification: current, stale, degraded, or blocked.
- Duplicate callback delivery returns stable receipt identity and must not advance terminal state.
- Cursor movement is monotonic. Regression is represented as `journal_cursor_regression_blocked` or a stale replay result rather than by overwriting truth.

Mock receipt semantics:

```ts
{
  requestSemantics: "receipt_only_not_terminal_success",
  terminalStateAdvanced: false,
  doesClaimTerminalSuccess: false,
  idempotency: {
    duplicate: false,
    stableReceipt: true
  }
}
```

Future real connector behavior must preserve the same external guarantees even if it delegates receipt identity to the real Dark Factory Journal.

## 6. Error Mapping

`FailureClass` currently lives in `runtime-contract.ts` as a runtime-level type:

```ts
type FailureClass =
  | "none"
  | "transient_provider"
  | "provider_unavailable"
  | "quota_exceeded"
  | "runtime_blocked";
```

Adapter-utils currently exposes only one `AdapterExecutionErrorFamily`: `"transient_upstream"`. Therefore the Dark Factory-specific class should be carried in `resultJson.runAttemptMetadata.failureClass` and/or `errorMeta.failureClass`, while `errorFamily` is used only when the error is retryable upstream/provider behavior.

| Dark Factory error code | Runtime `failureClass` | AdapterExecutionResult mapping | Retry posture |
| --- | --- | --- | --- |
| `provider_unavailable` | `provider_unavailable` | `exitCode: null`, `errorCode: "provider_unavailable"`, `errorFamily: "transient_upstream"`, optional `retryNotBefore` | Retryable after provider recovery or fallback verification. |
| `quota_exceeded` | `quota_exceeded` | `exitCode: null`, `errorCode: "quota_exceeded"`, `errorFamily: "transient_upstream"`, `errorMeta.quotaScope` when known | Retryable only after quota window or operator action. |
| `transient_provider` | `transient_provider` | `exitCode: null`, `errorCode: "transient_provider"`, `errorFamily: "transient_upstream"` | Retryable. |
| `runtime_blocked` | `runtime_blocked` | `exitCode: null`, `errorCode: "runtime_blocked"`, `errorFamily: null`, `errorMeta.breakerState` | Not automatically retryable until breaker/policy clears. |

All error responses remain non-authoritative and include `terminalStateAdvanced: false` unless a separately reviewed Journal-backed terminal transition exists.

## 7. 边界约束

- Dark Factory Journal remains truth source.
- Every request, receipt, replay, and projection envelope carries `source`, `authoritative: false`, and `truthSource`.
- Paperclip plugin DB stores only projection/cache/cursor/receipt/request metadata.
- No Paperclip Task/Issue main model mutation is authorized by this design.
- Phoenix Runtime capabilities must not become a second control plane.
- Mock phase does not connect to real Dark Factory.
- Mock phase does not read, print, or store real credentials.
- `authToken`, raw environment values, and raw sensitive stdin must not enter request envelopes, stdout, stderr, run event metadata, or fixtures.
- `terminalStateAdvanced` remains `false` on all mock outputs.
- Real connector work requires a separate review for credential injection, connector transport, and Journal-backed terminal semantics.

## 8. 开放问题

- Should the host provide an explicit idempotency key to `PluginEnvironmentExecuteParams`, or should the plugin continue deriving it from run/command/args?
- Should `PluginEnvironmentExecuteResult.metadata` and `AdapterExecutionResult.resultJson` share a formal JSON Schema before real connector work begins?
- Should adapter-utils add a richer error-family enum, or should Dark Factory classes remain in `errorMeta.failureClass`?
- What is the minimum run event metadata accepted by Paperclip host without changing core run status semantics?
- Should raw `stdin` ever be forwarded to Dark Factory in a real connector, or should it always be stored as an artifact reference outside the envelope?
- Does a future real driver need `onEnvironmentRealizeWorkspace`, or can Dark Factory remain workspace-agnostic for request envelope execution?
