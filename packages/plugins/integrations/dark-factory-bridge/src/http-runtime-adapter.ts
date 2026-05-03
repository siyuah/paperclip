import type {
  PluginEnvironmentAcquireLeaseParams,
  PluginEnvironmentExecuteParams,
  PluginEnvironmentLease,
  PluginEnvironmentProbeParams,
  PluginEnvironmentResumeLeaseParams,
} from "@paperclipai/plugin-sdk";
import {
  DARK_FACTORY_PROTOCOL_RELEASE_TAG,
  DARK_FACTORY_PROJECTION_SOURCE,
  DARK_FACTORY_TRUTH_SOURCE,
  PROJECTION_AUTHORITATIVE,
  PROJECTION_DISCLAIMER,
  RUNTIME_OBSERVATION_SOURCE,
  type FailureClass,
  type ProviderRuntimeImpact,
} from "./runtime-contract.js";
import {
  apiKeySecretRefScheme,
  isHostManagedSecretRef,
} from "./remote-provider-host-secret-resolver.js";

type JsonObject = Record<string, unknown>;

type RetryConfig = {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableStatuses: number[];
};

export type DarkFactoryHttpRuntimeMode = "http" | "remote";

type HttpRuntimeConfig = {
  mode: DarkFactoryHttpRuntimeMode;
  endpoint: string;
  timeoutMs: number;
  routePolicyRef?: string;
  requestedBy: string;
  workloadClass: string;
  apiKey?: string;
  apiKeySecretRef?: string;
  retry: RetryConfig;
};

type CredentialValidationResult =
  | {
      ok: true;
      credentialSource: "inline" | "env" | "none";
    }
  | {
      ok: false;
      code: string;
      message: string;
      details: JsonObject;
    };

type RunView = {
  protocolReleaseTag: typeof DARK_FACTORY_PROTOCOL_RELEASE_TAG;
  runId: string;
  runState: string;
  traceId: string;
  activeAttemptId: string;
  blockedBy: string[];
  currentManualGateType?: string | null;
  currentExecutionSuspensionState?: string | null;
  routeDecisionId?: string | null;
  journalCursor?: string;
  lastSequenceNo?: number;
  sourceJournalRef?: string;
};

type RouteDecisionView = {
  protocolReleaseTag: typeof DARK_FACTORY_PROTOCOL_RELEASE_TAG;
  routeDecisionId: string;
  runId: string;
  workloadClass: string;
  selectedExecutorClass: string;
  fallbackDepth: number;
  decisionReason: string;
  routeDecisionState: string;
  attemptId?: string;
  routePolicyRef?: string;
  recordedAt?: string;
};

type HealthView = {
  ok: boolean;
  protocolReleaseTag: typeof DARK_FACTORY_PROTOCOL_RELEASE_TAG;
  journal?: string;
  events?: number;
  projection?: JsonObject;
};

export function parseHttpRuntimeConfig(config: Record<string, unknown>): HttpRuntimeConfig {
  return parseHttpRuntimeConfigInternal(config, true);
}

function parseHttpRuntimeConfigInternal(config: Record<string, unknown>, resolveSecretRefs: boolean): HttpRuntimeConfig {
  const mode = httpRuntimeModeFromConfig(config);
  const endpoint = stringField(config.endpoint);
  if (!endpoint) {
    throw new Error(`endpoint is required for ${mode} mode`);
  }
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch (error) {
    throw new Error(`endpoint must be a valid absolute URL: ${(error as Error).message}`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("endpoint must use http or https");
  }
  const timeoutMs = numberField(config.timeoutMs) ?? 10_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("timeoutMs must be a positive number");
  }
  return {
    mode,
    endpoint: parsed.toString().replace(/\/$/, ""),
    timeoutMs,
    routePolicyRef: stringField(config.routePolicyRef) ?? undefined,
    requestedBy: stringField(config.requestedBy) ?? "paperclip-dark-factory-bridge",
    workloadClass: stringField(config.workloadClass) ?? "code",
    apiKey: stringField(config.apiKey) ?? (resolveSecretRefs ? resolveApiKeySecretRef(stringField(config.apiKeySecretRef)) : null) ?? undefined,
    apiKeySecretRef: stringField(config.apiKeySecretRef) ?? undefined,
    retry: parseRetryConfig(config),
  };
}

export function normalizeHttpEnvironmentConfig(config: Record<string, unknown>): Record<string, unknown> {
  const parsed = parseHttpRuntimeConfigInternal(config, false);
  return {
    mode: parsed.mode,
    endpoint: parsed.endpoint,
    timeoutMs: parsed.timeoutMs,
    requestedBy: parsed.requestedBy,
    workloadClass: parsed.workloadClass,
    retryMaxRetries: parsed.retry.maxRetries,
    retryBaseDelayMs: parsed.retry.baseDelayMs,
    retryMaxDelayMs: parsed.retry.maxDelayMs,
    retryableStatuses: parsed.retry.retryableStatuses,
    ...(parsed.routePolicyRef ? { routePolicyRef: parsed.routePolicyRef } : {}),
    ...(parsed.apiKey ? { apiKey: parsed.apiKey } : {}),
    ...(parsed.apiKeySecretRef ? { apiKeySecretRef: parsed.apiKeySecretRef } : {}),
  };
}

export function isDarkFactoryHttpRuntimeMode(value: unknown): value is DarkFactoryHttpRuntimeMode {
  return value === "http" || value === "remote";
}

export function httpRuntimeModeFromConfig(config: Record<string, unknown>): DarkFactoryHttpRuntimeMode {
  return config.mode === "remote" ? "remote" : "http";
}

export function validateHttpCredentialConfig(config: Record<string, unknown>): CredentialValidationResult {
  if (httpRuntimeModeFromConfig(config) !== "remote") {
    return { ok: true, credentialSource: stringField(config.apiKey) ? "inline" : "none" };
  }
  if (stringField(config.apiKey)) {
    return { ok: true, credentialSource: "inline" };
  }
  const secretRef = stringField(config.apiKeySecretRef);
  if (!secretRef) {
    return {
      ok: false,
      code: "dark_factory_remote_credential_missing",
      message: "apiKey or apiKeySecretRef is required for remote mode",
      details: { mode: "remote" },
    };
  }
  const envName = envNameFromSecretRef(secretRef);
  if (isHostManagedSecretRef(secretRef)) {
    return {
      ok: false,
      code: "dark_factory_remote_credential_host_secret_ref_pending_runtime_resolution",
      message: "apiKeySecretRef uses a host-managed secret reference; the host must inject a resolved credential before a real provider network call",
      details: { mode: "remote", apiKeySecretRefScheme: apiKeySecretRefScheme(secretRef) },
    };
  }
  if (!envName) {
    return {
      ok: false,
      code: "dark_factory_remote_credential_ref_unsupported",
      message: "apiKeySecretRef must use env:NAME, env://NAME, secret://NAME, or host-secret://NAME",
      details: { mode: "remote", apiKeySecretRef: secretRef },
    };
  }
  const value = process.env[envName];
  if (typeof value !== "string" || value.length === 0) {
    return {
      ok: false,
      code: "dark_factory_remote_credential_unresolved",
      message: `apiKeySecretRef environment variable is not set: ${envName}`,
      details: { mode: "remote", envName },
    };
  }
  return { ok: true, credentialSource: "env" };
}

export class DarkFactoryHttpClient {
  constructor(private readonly config: HttpRuntimeConfig) {}

  async health(): Promise<HealthView> {
    return this.request<HealthView>("GET", "/health");
  }

  async createExternalRun(params: {
    runId: string;
    traceId: string;
    inputRef: string;
    requestedBy?: string;
    workloadClass?: string;
    routePolicyRef?: string;
  }): Promise<RunView> {
    return this.request<RunView>("POST", "/external-runs", {
      protocolReleaseTag: DARK_FACTORY_PROTOCOL_RELEASE_TAG,
      requestedBy: params.requestedBy ?? this.config.requestedBy,
      workloadClass: params.workloadClass ?? this.config.workloadClass,
      inputRef: params.inputRef,
      traceId: params.traceId,
      runId: params.runId,
      attemptId: attemptIdForRun(params.runId),
      correlationId: correlationIdForRun(params.runId),
      routePolicyRef: params.routePolicyRef ?? this.config.routePolicyRef,
    });
  }

  async getExternalRun(runId: string): Promise<RunView> {
    return this.request<RunView>("GET", `/external-runs/${encodeURIComponent(runId)}`);
  }

  async parkRun(params: { runId: string; traceId: string; reason: string; rehydrationTokenId: string }): Promise<RunView> {
    return this.request<RunView>("POST", `/external-runs/${encodeURIComponent(params.runId)}:park`, {
      protocolReleaseTag: DARK_FACTORY_PROTOCOL_RELEASE_TAG,
      manualGateType: "manual_approval_required",
      parkReasonCode: params.reason,
      traceId: params.traceId,
      rehydrationTokenId: params.rehydrationTokenId,
      correlationId: correlationIdForRun(params.runId),
    });
  }

  async rehydrateRun(params: { runId: string; previousAttemptId?: string | null; traceId: string; rehydrationTokenId: string }): Promise<RunView> {
    return this.request<RunView>("POST", `/external-runs/${encodeURIComponent(params.runId)}:rehydrate`, {
      protocolReleaseTag: DARK_FACTORY_PROTOCOL_RELEASE_TAG,
      rehydrationTokenId: params.rehydrationTokenId,
      previousAttemptId: params.previousAttemptId ?? undefined,
      newAttemptId: `${attemptIdForRun(params.runId)}-rehydrated`,
      traceId: params.traceId,
      correlationId: correlationIdForRun(params.runId),
    });
  }

  async routeDecisions(runId: string): Promise<RouteDecisionView[]> {
    return this.request<RouteDecisionView[]>("GET", `/external-runs/${encodeURIComponent(runId)}/route-decisions`);
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: JsonObject): Promise<T> {
    const url = `${this.config.endpoint}/api${path}`;
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.config.retry.maxRetries; attempt += 1) {
      const startedAt = Date.now();
      let loggedHttpResponseError = false;
      try {
        const response = await this.fetchOnce(url, method, body);
        const durationMs = Date.now() - startedAt;
        const payload = await readJson(response);
        if (!response.ok) {
          const errorPayload = record(payload);
          const message = stringField(errorPayload.message) ?? response.statusText;
          const code = stringField(errorPayload.errorCode) ?? `http_${response.status}`;
          const error = new DarkFactoryHttpError(code, message, response.status, errorPayload);
          logHttpRequest({
            endpoint: this.config.endpoint,
            method,
            path,
            status: response.status,
            durationMs,
            attempt,
            errorType: error.name,
            errorMessage: error.message,
          });
          loggedHttpResponseError = true;
          if (this.shouldRetryStatus(response.status, attempt)) {
            lastError = error;
            await delay(this.retryDelay(attempt));
            continue;
          }
          throw error;
        }
        logHttpRequest({
          endpoint: this.config.endpoint,
          method,
          path,
          status: response.status,
          durationMs,
          attempt,
        });
        return payload as T;
      } catch (error) {
        if (error instanceof DarkFactoryHttpError && loggedHttpResponseError) {
          throw error;
        }
        const mapped = mapFetchError(error, this.config.timeoutMs);
        const durationMs = Date.now() - startedAt;
        logHttpRequest({
          endpoint: this.config.endpoint,
          method,
          path,
          status: mapped.status,
          durationMs,
          attempt,
          errorType: mapped.name,
          errorMessage: mapped.message,
        });
        if (error instanceof DarkFactoryHttpError && !this.shouldRetryStatus(error.status, attempt)) {
          throw error;
        }
        if (!(error instanceof DarkFactoryHttpError) && !this.shouldRetryStatus(mapped.status, attempt)) {
          throw mapped;
        }
        lastError = error instanceof DarkFactoryHttpError ? error : mapped;
        await delay(this.retryDelay(attempt));
      }
    }
    if (lastError instanceof DarkFactoryHttpError) throw lastError;
    throw mapFetchError(lastError, this.config.timeoutMs);
  }

  private async fetchOnce(url: string, method: "GET" | "POST", body?: JsonObject): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const headers: Record<string, string> = {
      "accept": "application/json",
      "content-type": "application/json",
      "x-protocol-release-tag": DARK_FACTORY_PROTOCOL_RELEASE_TAG,
    };
    if (this.config.apiKey) {
      headers["x-api-key"] = this.config.apiKey;
    }
    try {
      return await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private shouldRetryStatus(status: number, attempt: number): boolean {
    return attempt < this.config.retry.maxRetries && this.config.retry.retryableStatuses.includes(status);
  }

  private retryDelay(attempt: number): number {
    const rawDelay = this.config.retry.baseDelayMs * 2 ** attempt;
    return Math.min(rawDelay, this.config.retry.maxDelayMs);
  }
}

export class DarkFactoryHttpError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: JsonObject,
  ) {
    super(message);
    this.name = "DarkFactoryHttpError";
  }
}

export function httpClientFromConfig(config: Record<string, unknown>): DarkFactoryHttpClient {
  assertHttpCredentialConfig(config);
  return new DarkFactoryHttpClient(parseHttpRuntimeConfig(config));
}

export async function buildHttpProjectionSummary(issueId: string, config: Record<string, unknown>): Promise<JsonObject> {
  const runtimeMode = httpRuntimeModeFromConfig(config);
  const client = httpClientFromConfig(config);
  const run = await ensureRun(client, issueId, "projection-summary");
  const routeDecisions = await client.routeDecisions(run.runId);
  return {
    ...projectionBoundary(),
    disclaimer: PROJECTION_DISCLAIMER,
    runtimeMode,
    projectionStatus: projectionStatusForRun(run),
    issueId,
    runId: run.runId,
    linkedRunId: run.runId,
    journalCursor: run.journalCursor ?? journalCursorFallback(run),
    lastSequenceNo: run.lastSequenceNo ?? 0,
    callbackReceiptId: `df-http-${run.runId}`,
    staleReason: null,
    degradedReason: null,
    blockedReason: run.blockedBy.length > 0 ? run.blockedBy.join(",") : null,
    projection: httpRuntimeProjection(issueId, run, routeDecisions, runtimeMode),
    providerHealth: httpProviderHealth(run, runtimeMode),
    runtimeImpact: httpRuntimeImpact(run, runtimeMode),
    runAttemptMetadata: httpRunAttemptMetadata(run, runtimeMode),
  };
}

export async function probeHttpEnvironment(params: PluginEnvironmentProbeParams): Promise<{ ok: boolean; summary: string; metadata: JsonObject; diagnostics?: Array<{ severity: "info" | "warning" | "error"; message: string; code?: string; details?: JsonObject }> }> {
  const runtimeMode = httpRuntimeModeFromConfig(params.config);
  try {
    const health = await httpClientFromConfig(params.config).health();
    return {
      ok: true,
      summary: runtimeMode === "remote" ? "Dark Factory remote environment ready" : "Dark Factory HTTP environment ready",
      metadata: {
        ...projectionBoundary(),
        observationSource: RUNTIME_OBSERVATION_SOURCE,
        driverKey: params.driverKey,
        environmentId: params.environmentId,
        runtimeMode,
        health,
        terminalStateAdvanced: false,
      },
    };
  } catch (error) {
    const mapped = mapHttpError(error);
    return {
      ok: false,
      summary: runtimeMode === "remote" ? "Dark Factory remote environment unavailable" : "Dark Factory HTTP environment unavailable",
      diagnostics: [
        {
          severity: "error",
          message: mapped.message,
          code: mapped.code,
          details: mapped.details,
        },
      ],
      metadata: {
        ...projectionBoundary(),
        observationSource: RUNTIME_OBSERVATION_SOURCE,
        driverKey: params.driverKey,
        environmentId: params.environmentId,
        runtimeMode,
        terminalStateAdvanced: false,
      },
    };
  }
}

export async function acquireHttpLease(params: PluginEnvironmentAcquireLeaseParams): Promise<PluginEnvironmentLease> {
  const runtimeMode = httpRuntimeModeFromConfig(params.config);
  const client = httpClientFromConfig(params.config);
  const traceId = traceIdForRun(params.runId, "lease");
  const run = await client.createExternalRun({
    runId: params.runId,
    traceId,
    inputRef: `paperclip://runs/${encodeURIComponent(params.runId)}`,
  });
  return leaseFromRun(run, params, { acquiredLease: true }, runtimeMode);
}

export async function resumeHttpLease(params: PluginEnvironmentResumeLeaseParams): Promise<PluginEnvironmentLease> {
  const runtimeMode = httpRuntimeModeFromConfig(params.config);
  const runId = runIdFromLease(params.providerLeaseId, params.leaseMetadata);
  const run = await httpClientFromConfig(params.config).getExternalRun(runId);
  return leaseFromRun(run, params, { resumedLease: true }, runtimeMode);
}

export async function executeHttpEnvironment(params: PluginEnvironmentExecuteParams) {
  const runtimeMode = httpRuntimeModeFromConfig(params.config);
  const runId = stringField(params.lease.metadata?.runId) ?? runIdFromLease(params.lease.providerLeaseId, params.lease.metadata);
  const client = httpClientFromConfig(params.config);
  const before = await client.getExternalRun(runId);
  const traceId = traceIdForRun(runId, "execute");
  let after = before;
  if (params.command === "dark-factory-http-park") {
    after = await client.parkRun({
      runId,
      traceId,
      reason: (params.args ?? [])[0] ?? "operator_requested_http_park",
      rehydrationTokenId: rehydrationTokenForRun(runId),
    });
  } else if (params.command === "dark-factory-http-rehydrate") {
    after = await client.rehydrateRun({
      runId,
      previousAttemptId: before.activeAttemptId,
      traceId,
      rehydrationTokenId: rehydrationTokenForRun(runId),
    });
  }
  const routeDecisions = await client.routeDecisions(runId);
  const summary = {
    ...projectionBoundary(),
    runtimeMode,
    runId,
    command: params.command,
    runState: after.runState,
    journalCursor: after.journalCursor ?? journalCursorFallback(after),
    lastSequenceNo: after.lastSequenceNo ?? 0,
    terminalStateAdvanced: false,
  };
  return {
    exitCode: 0,
    timedOut: false,
    stdout: JSON.stringify(summary),
    stderr: "",
    metadata: {
      ...projectionBoundary(),
      runtimeMode,
      terminalStateAdvanced: false,
      disclaimer: PROJECTION_DISCLAIMER,
      projection: httpRuntimeProjection(runId, after, routeDecisions, runtimeMode),
      runBefore: before,
      runAfter: after,
      routeDecisions,
      providerHealth: httpProviderHealth(after, runtimeMode),
      runtimeImpact: httpRuntimeImpact(after, runtimeMode),
      runAttemptMetadata: httpRunAttemptMetadata(after, runtimeMode),
      cursor: httpJournalCursor(after, runtimeMode),
    },
  };
}

export function mapHttpError(error: unknown): { code: string; message: string; status: number; details: JsonObject } {
  if (error instanceof DarkFactoryHttpError) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
      details: error.details ?? {},
    };
  }
  return {
    code: "dark_factory_http_error",
    message: (error as Error).message,
    status: 500,
    details: {},
  };
}

export function classifyHttpFailure(error: { code: string; status: number }): {
  failureClass: FailureClass;
  retryable: boolean;
  runtimeImpact: ProviderRuntimeImpact;
} {
  const failureClass = failureClassForHttpError(error);
  const retryable = failureClass === "transient_provider" || failureClass === "provider_unavailable" || failureClass === "quota_exceeded";
  return {
    failureClass,
    retryable,
    runtimeImpact: {
      mode: failureClass === "runtime_blocked" ? "blocked" : "degraded",
      severity: failureClass === "runtime_blocked" || failureClass === "provider_unavailable" ? "critical" : "warning",
      operatorAction: operatorActionForFailureClass(failureClass),
      paperclipTerminalState: "unchanged",
      terminalStateAdvanced: false,
      reason: error.code,
    },
  };
}

function projectionBoundary() {
  return {
    source: DARK_FACTORY_PROJECTION_SOURCE,
    authoritative: PROJECTION_AUTHORITATIVE,
    truthSource: DARK_FACTORY_TRUTH_SOURCE,
  } as const;
}

function failureClassForHttpError(error: { code: string; status: number }): FailureClass {
  if (error.status === 429 || error.code === "quota_exceeded") return "quota_exceeded";
  if (error.status === 401 || error.status === 403 || error.code === "runtime_blocked") return "runtime_blocked";
  if (error.status === 408 || error.status === 500 || error.status === 502 || error.status === 503 || error.status === 504) {
    return "transient_provider";
  }
  if (error.code === "dark_factory_http_unreachable" || error.code === "dark_factory_http_timeout") return "transient_provider";
  if (error.code === "dark_factory_invalid_json") return "provider_unavailable";
  if (error.status >= 500) return "transient_provider";
  return "provider_unavailable";
}

function operatorActionForFailureClass(failureClass: FailureClass): ProviderRuntimeImpact["operatorAction"] {
  if (failureClass === "runtime_blocked") return "pause_external_execution_and_reconcile_journal";
  if (failureClass === "quota_exceeded") return "retry_or_wait_for_provider_recovery";
  if (failureClass === "transient_provider") return "retry_or_wait_for_provider_recovery";
  if (failureClass === "provider_unavailable") return "pause_external_execution_and_reconcile_journal";
  return "monitor";
}

async function ensureRun(client: DarkFactoryHttpClient, runId: string, reason: string): Promise<RunView> {
  try {
    return await client.getExternalRun(runId);
  } catch (error) {
    if (error instanceof DarkFactoryHttpError && error.status === 404) {
      return client.createExternalRun({
        runId,
        traceId: traceIdForRun(runId, reason),
        inputRef: `paperclip://issues/${encodeURIComponent(runId)}`,
      });
    }
    throw error;
  }
}

function httpRuntimeProjection(issueId: string, run: RunView, routeDecisions: RouteDecisionView[], runtimeMode: DarkFactoryHttpRuntimeMode): JsonObject {
  const status = projectionStatusForRun(run);
  return {
    ...projectionBoundary(),
    disclaimer: PROJECTION_DISCLAIMER,
    runtimeMode,
    issueId,
    runId: run.runId,
    linkedRunId: run.runId,
    journalCursor: run.journalCursor ?? journalCursorFallback(run),
    journalCursorMetadata: httpJournalCursor(run, runtimeMode),
    lastSequenceNo: run.lastSequenceNo ?? 0,
    projectionStatus: status,
    callbackReceiptId: `df-http-${run.runId}`,
    staleReason: null,
    degradedReason: null,
    blockedReason: run.blockedBy.length > 0 ? run.blockedBy.join(",") : null,
    fallbackTriggered: false,
    terminalStateAdvanced: false,
    projectionId: `df-http-projection-${run.runId}`,
    sourceJournalRef: run.sourceJournalRef ?? sourceJournalRefFallback(runtimeMode),
    projectionJson: {
      issueId,
      runId: run.runId,
      cursor: run.journalCursor ?? journalCursorFallback(run),
      status,
      runState: run.runState,
    },
    callbackReceipt: {
      receiptId: `df-http-${run.runId}`,
      status: "observed",
      terminalStateAdvanced: false,
      idempotencyKey: `${runtimeMode}:${run.runId}:${run.lastSequenceNo ?? 0}`,
    },
    flags: {
      degraded: false,
      blocked: run.blockedBy.length > 0,
      needsApproval: run.runState === "waiting_approval" || run.runState === "parked_manual",
      stale: false,
    },
    routeDecisions,
    runView: run,
    lastUpdatedAt: new Date().toISOString(),
  };
}

function httpJournalCursor(run: RunView, runtimeMode: DarkFactoryHttpRuntimeMode): JsonObject {
  const lastSequenceNo = run.lastSequenceNo ?? 0;
  const cursor = run.journalCursor ?? journalCursorFallback(run);
  return {
    ...projectionBoundary(),
    runtimeMode,
    cursorId: `df-${runtimeMode}-cursor-${run.runId}`,
    runId: run.runId,
    journalCursor: cursor,
    lastSequenceNo,
    lastJournalSequenceNo: lastSequenceNo,
    journalRef: cursor,
    sourceJournalRef: run.sourceJournalRef ?? sourceJournalRefFallback(runtimeMode),
    monotonic: true,
    gapDetected: false,
    cursorMonotonicity: {
      previousSequenceNo: Math.max(0, lastSequenceNo - 1),
      currentSequenceNo: lastSequenceNo,
      direction: "non_decreasing",
    },
  };
}

function httpProviderHealth(run: RunView, runtimeMode: DarkFactoryHttpRuntimeMode): JsonObject {
  const blocked = run.blockedBy.length > 0;
  return {
    ...projectionBoundary(),
    runtimeMode,
    observationSource: RUNTIME_OBSERVATION_SOURCE,
    providerRole: "primary_execution",
    modelRole: "execution_model",
    modelSelection: {
      policy: "role_based_runtime_selection",
      protocolMustSpecifyConcreteModel: false,
      configuredModelName: null,
    },
    providerState: blocked ? "blocked" : "available",
    breakerState: blocked ? "open" : "closed",
    degraded: false,
    blocked,
    fallbackTriggered: false,
    degradedReason: null,
    blockedReason: blocked ? run.blockedBy.join(",") : null,
    fallbackReason: null,
    lastUpdatedAt: new Date().toISOString(),
    lastSuccessAt: blocked ? null : new Date().toISOString(),
    lastFailureAt: null,
    openReason: blocked ? run.blockedBy.join(",") : null,
    cooldownUntil: null,
  };
}

function httpRuntimeImpact(run: RunView, runtimeMode: DarkFactoryHttpRuntimeMode): JsonObject {
  const blocked = run.blockedBy.length > 0;
  return {
    runtimeMode,
    mode: blocked ? "blocked" : "available",
    severity: blocked ? "critical" : "info",
    operatorAction: blocked ? "pause_external_execution_and_reconcile_journal" : "monitor",
    paperclipTerminalState: "unchanged",
    terminalStateAdvanced: false,
    reason: blocked ? run.blockedBy.join(",") : null,
  };
}

function httpRunAttemptMetadata(run: RunView, runtimeMode: DarkFactoryHttpRuntimeMode): JsonObject {
  return {
    ...projectionBoundary(),
    runtimeMode,
    providerRole: "primary_execution",
    modelRole: "execution_model",
    failureClass: run.blockedBy.length > 0 ? "runtime_blocked" : "none",
    retryable: run.blockedBy.length === 0,
    fallbackTriggered: false,
    terminalStateAdvanced: false,
    attemptIndex: 0,
    circuitBreakerState: run.blockedBy.length > 0 ? "open" : "closed",
    degradedMode: false,
  };
}

function projectionStatusForRun(run: RunView): "current" | "blocked" | "needs_approval" {
  if (run.runState === "waiting_approval" || run.runState === "parked_manual") return "needs_approval";
  if (run.blockedBy.length > 0) return "blocked";
  return "current";
}

function leaseFromRun(
  run: RunView,
  params: Pick<PluginEnvironmentAcquireLeaseParams | PluginEnvironmentResumeLeaseParams, "driverKey" | "environmentId">,
  extra: JsonObject,
  runtimeMode: DarkFactoryHttpRuntimeMode,
): PluginEnvironmentLease {
  return {
    providerLeaseId: leaseIdForRun(run.runId, runtimeMode),
    expiresAt: null,
    metadata: {
      ...projectionBoundary(),
      ...extra,
      driverKey: params.driverKey,
      environmentId: params.environmentId,
      runId: run.runId,
      runtimeMode,
      run,
      journalCursor: httpJournalCursor(run, runtimeMode),
      providerHealth: httpProviderHealth(run, runtimeMode),
      runtimeImpact: httpRuntimeImpact(run, runtimeMode),
      terminalStateAdvanced: false,
    },
  };
}

function leaseIdForRun(runId: string, runtimeMode: DarkFactoryHttpRuntimeMode): string {
  return `df-${runtimeMode}-lease-${runId.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
}

function attemptIdForRun(runId: string): string {
  return `attempt-${runId.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
}

function correlationIdForRun(runId: string): string {
  return `corr-${runId.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
}

function traceIdForRun(runId: string, reason: string): string {
  return `trace-${reason}-${runId.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
}

function rehydrationTokenForRun(runId: string): string {
  return `rt-${runId.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
}

function runIdFromLease(providerLeaseId: string | null | undefined, metadata?: Record<string, unknown>): string {
  const metadataRunId = stringField(metadata?.runId);
  if (metadataRunId) return metadataRunId;
  const leaseRunId = stringField(providerLeaseId)?.replace(/^df-(?:http|remote)-lease-/, "");
  if (leaseRunId) return leaseRunId;
  throw new Error("runId is required to resume an HTTP Dark Factory lease");
}

function journalCursorFallback(run: RunView): string {
  return `dark-factory://journal/${run.runId}#${run.lastSequenceNo ?? 0}`;
}

function sourceJournalRefFallback(runtimeMode: DarkFactoryHttpRuntimeMode): string {
  return runtimeMode === "remote" ? "dark-factory-remote" : "dark-factory-http";
}

function assertHttpCredentialConfig(config: Record<string, unknown>): void {
  const validation = validateHttpCredentialConfig(config);
  if (!validation.ok) {
    throw new DarkFactoryHttpError(validation.code, validation.message, 401, validation.details);
  }
}

function resolveApiKeySecretRef(secretRef: string | null): string | null {
  if (!secretRef) return null;
  const envName = envNameFromSecretRef(secretRef);
  if (!envName) return null;
  const value = process.env[envName];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function envNameFromSecretRef(secretRef: string): string | null {
  const rawName = secretRef.startsWith("env://")
    ? secretRef.slice("env://".length)
    : secretRef.startsWith("env:")
      ? secretRef.slice("env:".length)
      : "";
  if (!rawName) return null;
  return /^[A-Z_][A-Z0-9_]*$/.test(rawName) ? rawName : null;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new DarkFactoryHttpError("dark_factory_invalid_json", `Dark Factory returned invalid JSON: ${(error as Error).message}`, response.status);
  }
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberField(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function record(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function parseRetryConfig(config: Record<string, unknown>): RetryConfig {
  return {
    maxRetries: nonNegativeIntegerField(config.retryMaxRetries) ?? 3,
    baseDelayMs: positiveIntegerField(config.retryBaseDelayMs) ?? 500,
    maxDelayMs: positiveIntegerField(config.retryMaxDelayMs) ?? 5000,
    retryableStatuses: numberListField(config.retryableStatuses) ?? [502, 503, 504],
  };
}

function positiveIntegerField(value: unknown): number | null {
  const parsed = numberField(value);
  return parsed !== null && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function nonNegativeIntegerField(value: unknown): number | null {
  const parsed = numberField(value);
  return parsed !== null && Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function numberListField(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value.map((item) => numberField(item));
  if (parsed.some((item) => item === null || !Number.isInteger(item))) return null;
  return parsed as number[];
}

function mapFetchError(error: unknown, timeoutMs: number): DarkFactoryHttpError {
  if (error instanceof DarkFactoryHttpError) return error;
  if ((error as Error | undefined)?.name === "AbortError") {
    return new DarkFactoryHttpError("dark_factory_http_timeout", `Dark Factory HTTP request timed out after ${timeoutMs}ms`, 504);
  }
  return new DarkFactoryHttpError("dark_factory_http_unreachable", (error as Error).message, 503);
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logHttpRequest(fields: {
  endpoint: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  attempt: number;
  errorType?: string;
  errorMessage?: string;
}): void {
  const payload = {
    component: "dark-factory-http-client",
    endpoint: fields.endpoint,
    method: fields.method,
    path: fields.path,
    status: fields.status,
    duration_ms: fields.durationMs,
    attempt: fields.attempt,
    ...(fields.errorType ? { error_type: fields.errorType } : {}),
    ...(fields.errorMessage ? { error_message: fields.errorMessage } : {}),
  };
  if (fields.errorType || fields.status >= 500) {
    console.warn(JSON.stringify(payload));
  } else {
    console.info(JSON.stringify(payload));
  }
}
