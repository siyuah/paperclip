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
} from "./runtime-contract.js";

type JsonObject = Record<string, unknown>;

type HttpRuntimeConfig = {
  mode: "http";
  endpoint: string;
  timeoutMs: number;
  routePolicyRef?: string;
  requestedBy: string;
  workloadClass: string;
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
  const endpoint = stringField(config.endpoint);
  if (!endpoint) {
    throw new Error("endpoint is required for http mode");
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
    mode: "http",
    endpoint: parsed.toString().replace(/\/$/, ""),
    timeoutMs,
    routePolicyRef: stringField(config.routePolicyRef) ?? undefined,
    requestedBy: stringField(config.requestedBy) ?? "paperclip-dark-factory-bridge",
    workloadClass: stringField(config.workloadClass) ?? "code",
  };
}

export function normalizeHttpEnvironmentConfig(config: Record<string, unknown>): Record<string, unknown> {
  const parsed = parseHttpRuntimeConfig(config);
  return {
    mode: "http",
    endpoint: parsed.endpoint,
    timeoutMs: parsed.timeoutMs,
    requestedBy: parsed.requestedBy,
    workloadClass: parsed.workloadClass,
    ...(parsed.routePolicyRef ? { routePolicyRef: parsed.routePolicyRef } : {}),
  };
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await fetch(`${this.config.endpoint}/api${path}`, {
        method,
        headers: {
          "accept": "application/json",
          "content-type": "application/json",
          "x-protocol-release-tag": DARK_FACTORY_PROTOCOL_RELEASE_TAG,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const payload = await readJson(response);
      if (!response.ok) {
        const errorPayload = record(payload);
        const message = stringField(errorPayload.message) ?? response.statusText;
        const code = stringField(errorPayload.errorCode) ?? `http_${response.status}`;
        throw new DarkFactoryHttpError(code, message, response.status, errorPayload);
      }
      return payload as T;
    } catch (error) {
      if (error instanceof DarkFactoryHttpError) throw error;
      if ((error as Error).name === "AbortError") {
        throw new DarkFactoryHttpError("dark_factory_http_timeout", `Dark Factory HTTP request timed out after ${this.config.timeoutMs}ms`, 504);
      }
      throw new DarkFactoryHttpError("dark_factory_http_unreachable", (error as Error).message, 503);
    } finally {
      clearTimeout(timeout);
    }
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
  return new DarkFactoryHttpClient(parseHttpRuntimeConfig(config));
}

export async function buildHttpProjectionSummary(issueId: string, config: Record<string, unknown>): Promise<JsonObject> {
  const client = httpClientFromConfig(config);
  const run = await ensureRun(client, issueId, "projection-summary");
  const routeDecisions = await client.routeDecisions(run.runId);
  return {
    ...projectionBoundary(),
    disclaimer: PROJECTION_DISCLAIMER,
    runtimeMode: "http",
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
    projection: httpRuntimeProjection(issueId, run, routeDecisions),
    providerHealth: httpProviderHealth(run),
    runtimeImpact: httpRuntimeImpact(run),
    runAttemptMetadata: httpRunAttemptMetadata(run),
  };
}

export async function probeHttpEnvironment(params: PluginEnvironmentProbeParams): Promise<{ ok: boolean; summary: string; metadata: JsonObject; diagnostics?: Array<{ severity: "info" | "warning" | "error"; message: string; code?: string; details?: JsonObject }> }> {
  try {
    const health = await httpClientFromConfig(params.config).health();
    return {
      ok: true,
      summary: "Dark Factory HTTP environment ready",
      metadata: {
        ...projectionBoundary(),
        observationSource: RUNTIME_OBSERVATION_SOURCE,
        driverKey: params.driverKey,
        environmentId: params.environmentId,
        runtimeMode: "http",
        health,
        terminalStateAdvanced: false,
      },
    };
  } catch (error) {
    const mapped = mapHttpError(error);
    return {
      ok: false,
      summary: "Dark Factory HTTP environment unavailable",
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
        runtimeMode: "http",
        terminalStateAdvanced: false,
      },
    };
  }
}

export async function acquireHttpLease(params: PluginEnvironmentAcquireLeaseParams): Promise<PluginEnvironmentLease> {
  const client = httpClientFromConfig(params.config);
  const traceId = traceIdForRun(params.runId, "lease");
  const run = await client.createExternalRun({
    runId: params.runId,
    traceId,
    inputRef: `paperclip://runs/${encodeURIComponent(params.runId)}`,
  });
  return leaseFromRun(run, params, { acquiredLease: true });
}

export async function resumeHttpLease(params: PluginEnvironmentResumeLeaseParams): Promise<PluginEnvironmentLease> {
  const runId = runIdFromLease(params.providerLeaseId, params.leaseMetadata);
  const run = await httpClientFromConfig(params.config).getExternalRun(runId);
  return leaseFromRun(run, params, { resumedLease: true });
}

export async function executeHttpEnvironment(params: PluginEnvironmentExecuteParams) {
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
    runtimeMode: "http",
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
      runtimeMode: "http",
      terminalStateAdvanced: false,
      disclaimer: PROJECTION_DISCLAIMER,
      projection: httpRuntimeProjection(runId, after, routeDecisions),
      runBefore: before,
      runAfter: after,
      routeDecisions,
      providerHealth: httpProviderHealth(after),
      runtimeImpact: httpRuntimeImpact(after),
      runAttemptMetadata: httpRunAttemptMetadata(after),
      cursor: httpJournalCursor(after),
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

function projectionBoundary() {
  return {
    source: DARK_FACTORY_PROJECTION_SOURCE,
    authoritative: PROJECTION_AUTHORITATIVE,
    truthSource: DARK_FACTORY_TRUTH_SOURCE,
  } as const;
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

function httpRuntimeProjection(issueId: string, run: RunView, routeDecisions: RouteDecisionView[]): JsonObject {
  const status = projectionStatusForRun(run);
  return {
    ...projectionBoundary(),
    disclaimer: PROJECTION_DISCLAIMER,
    issueId,
    runId: run.runId,
    linkedRunId: run.runId,
    journalCursor: run.journalCursor ?? journalCursorFallback(run),
    journalCursorMetadata: httpJournalCursor(run),
    lastSequenceNo: run.lastSequenceNo ?? 0,
    projectionStatus: status,
    callbackReceiptId: `df-http-${run.runId}`,
    staleReason: null,
    degradedReason: null,
    blockedReason: run.blockedBy.length > 0 ? run.blockedBy.join(",") : null,
    fallbackTriggered: false,
    terminalStateAdvanced: false,
    projectionId: `df-http-projection-${run.runId}`,
    sourceJournalRef: run.sourceJournalRef ?? "dark-factory-http",
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
      idempotencyKey: `http:${run.runId}:${run.lastSequenceNo ?? 0}`,
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

function httpJournalCursor(run: RunView): JsonObject {
  const lastSequenceNo = run.lastSequenceNo ?? 0;
  const cursor = run.journalCursor ?? journalCursorFallback(run);
  return {
    ...projectionBoundary(),
    cursorId: `df-http-cursor-${run.runId}`,
    runId: run.runId,
    journalCursor: cursor,
    lastSequenceNo,
    lastJournalSequenceNo: lastSequenceNo,
    journalRef: cursor,
    sourceJournalRef: run.sourceJournalRef ?? "dark-factory-http",
    monotonic: true,
    gapDetected: false,
    cursorMonotonicity: {
      previousSequenceNo: Math.max(0, lastSequenceNo - 1),
      currentSequenceNo: lastSequenceNo,
      direction: "non_decreasing",
    },
  };
}

function httpProviderHealth(run: RunView): JsonObject {
  const blocked = run.blockedBy.length > 0;
  return {
    ...projectionBoundary(),
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

function httpRuntimeImpact(run: RunView): JsonObject {
  const blocked = run.blockedBy.length > 0;
  return {
    mode: blocked ? "blocked" : "available",
    severity: blocked ? "critical" : "info",
    operatorAction: blocked ? "pause_external_execution_and_reconcile_journal" : "monitor",
    paperclipTerminalState: "unchanged",
    terminalStateAdvanced: false,
    reason: blocked ? run.blockedBy.join(",") : null,
  };
}

function httpRunAttemptMetadata(run: RunView): JsonObject {
  return {
    ...projectionBoundary(),
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
): PluginEnvironmentLease {
  return {
    providerLeaseId: leaseIdForRun(run.runId),
    expiresAt: null,
    metadata: {
      ...projectionBoundary(),
      ...extra,
      driverKey: params.driverKey,
      environmentId: params.environmentId,
      runId: run.runId,
      runtimeMode: "http",
      run,
      journalCursor: httpJournalCursor(run),
      providerHealth: httpProviderHealth(run),
      runtimeImpact: httpRuntimeImpact(run),
      terminalStateAdvanced: false,
    },
  };
}

function leaseIdForRun(runId: string): string {
  return `df-http-lease-${runId.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
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
  const leaseRunId = stringField(providerLeaseId)?.replace(/^df-http-lease-/, "");
  if (leaseRunId) return leaseRunId;
  throw new Error("runId is required to resume an HTTP Dark Factory lease");
}

function journalCursorFallback(run: RunView): string {
  return `dark-factory://journal/${run.runId}#${run.lastSequenceNo ?? 0}`;
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
