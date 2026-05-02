import {
  DARK_FACTORY_PROJECTION_SOURCE,
  DARK_FACTORY_TRUTH_SOURCE,
  PROJECTION_AUTHORITATIVE,
  RUNTIME_OBSERVATION_SOURCE,
  type FailureClass,
  type ProviderRuntimeImpact,
} from "./runtime-contract.js";

type ProjectionBoundary = {
  source: typeof DARK_FACTORY_PROJECTION_SOURCE;
  authoritative: typeof PROJECTION_AUTHORITATIVE;
  truthSource: typeof DARK_FACTORY_TRUTH_SOURCE;
};

export type RemoteProviderOperation = "probe" | "acquire" | "resume" | "execute" | "release" | "destroy";

export type RemoteProviderObservation = {
  runtimeMode: "remote";
  operation: RemoteProviderOperation;
  status: number | null;
  durationMs: number;
  attempt: number;
  retryable: boolean;
  failureClass: FailureClass;
  errorCode: string | null;
  journalCursor: string | null;
  lastSequenceNo: number | null;
  terminalStateAdvanced: false;
};

export type RemoteProviderMetricsSnapshot = ProjectionBoundary & {
  observationSource: typeof RUNTIME_OBSERVATION_SOURCE;
  runtimeMode: "remote";
  requestCount: number;
  successCount: number;
  failureCount: number;
  retryCount: number;
  retryableFailureCount: number;
  averageLatencyMs: number;
  maxLatencyMs: number;
  failureClassCounts: Record<FailureClass, number>;
  latestErrorCode: string | null;
  latestJournalCursor: string | null;
  latestSequenceNo: number | null;
  cursorLag: number | null;
  terminalStateAdvanced: false;
};

export type RemoteProviderAlertCandidate = ProjectionBoundary & {
  observationSource: typeof RUNTIME_OBSERVATION_SOURCE;
  runtimeMode: "remote";
  severity: "info" | "warning" | "critical";
  code: string;
  message: string;
  failureClass: FailureClass;
  retryable: boolean;
  runtimeImpact: ProviderRuntimeImpact;
  terminalStateAdvanced: false;
};

export function buildRemoteProviderMetricsSnapshot(
  observations: RemoteProviderObservation[],
  options: { expectedSequenceNo?: number | null } = {},
): RemoteProviderMetricsSnapshot {
  const remoteObservations = observations.filter((item) => item.runtimeMode === "remote");
  const requestCount = remoteObservations.length;
  const successCount = remoteObservations.filter((item) => isSuccess(item)).length;
  const failureCount = requestCount - successCount;
  const retryCount = remoteObservations.filter((item) => item.attempt > 0).length;
  const retryableFailureCount = remoteObservations.filter((item) => !isSuccess(item) && item.retryable).length;
  const durations = remoteObservations.map((item) => Math.max(0, Math.round(item.durationMs)));
  const latestError = [...remoteObservations].reverse().find((item) => item.errorCode);
  const latestCursorObservation = [...remoteObservations].reverse().find((item) => item.journalCursor || item.lastSequenceNo !== null);
  const latestSequenceNo = latestCursorObservation?.lastSequenceNo ?? null;
  const expectedSequenceNo = options.expectedSequenceNo ?? null;

  return {
    ...projectionBoundary(),
    observationSource: RUNTIME_OBSERVATION_SOURCE,
    runtimeMode: "remote",
    requestCount,
    successCount,
    failureCount,
    retryCount,
    retryableFailureCount,
    averageLatencyMs: durations.length > 0 ? Math.round(durations.reduce((sum, item) => sum + item, 0) / durations.length) : 0,
    maxLatencyMs: durations.length > 0 ? Math.max(...durations) : 0,
    failureClassCounts: failureClassCounts(remoteObservations),
    latestErrorCode: latestError?.errorCode ?? null,
    latestJournalCursor: latestCursorObservation?.journalCursor ?? null,
    latestSequenceNo,
    cursorLag: expectedSequenceNo !== null && latestSequenceNo !== null ? Math.max(0, expectedSequenceNo - latestSequenceNo) : null,
    terminalStateAdvanced: false,
  };
}

export function buildRemoteProviderAlertCandidates(
  snapshot: RemoteProviderMetricsSnapshot,
  options: {
    errorRateWarningThreshold?: number;
    latencyWarningThresholdMs?: number;
    cursorLagWarningThreshold?: number;
  } = {},
): RemoteProviderAlertCandidate[] {
  const errorRateWarningThreshold = options.errorRateWarningThreshold ?? 0.5;
  const latencyWarningThresholdMs = options.latencyWarningThresholdMs ?? 5_000;
  const cursorLagWarningThreshold = options.cursorLagWarningThreshold ?? 5;
  const alerts: RemoteProviderAlertCandidate[] = [];

  if (snapshot.requestCount === 0) {
    return alerts;
  }

  const errorRate = snapshot.failureCount / snapshot.requestCount;
  if (errorRate >= errorRateWarningThreshold) {
    const failureClass = dominantFailureClass(snapshot.failureClassCounts);
    alerts.push(alertCandidate({
      severity: failureClass === "runtime_blocked" || failureClass === "provider_unavailable" ? "critical" : "warning",
      code: "dark_factory_remote_error_rate_high",
      message: `Remote provider error rate is ${Math.round(errorRate * 100)}%`,
      failureClass,
      retryable: failureClass !== "runtime_blocked",
      reason: snapshot.latestErrorCode ?? failureClass,
    }));
  }

  if (snapshot.maxLatencyMs >= latencyWarningThresholdMs) {
    alerts.push(alertCandidate({
      severity: "warning",
      code: "dark_factory_remote_latency_high",
      message: `Remote provider max latency is ${snapshot.maxLatencyMs}ms`,
      failureClass: "transient_provider",
      retryable: true,
      reason: "remote_latency_high",
    }));
  }

  if (snapshot.cursorLag !== null && snapshot.cursorLag >= cursorLagWarningThreshold) {
    alerts.push(alertCandidate({
      severity: "warning",
      code: "dark_factory_remote_cursor_lag_high",
      message: `Remote provider journal cursor lag is ${snapshot.cursorLag}`,
      failureClass: "provider_unavailable",
      retryable: true,
      reason: "remote_cursor_lag_high",
    }));
  }

  return alerts;
}

function isSuccess(observation: RemoteProviderObservation): boolean {
  return observation.status !== null && observation.status >= 200 && observation.status < 400 && observation.failureClass === "none";
}

function failureClassCounts(observations: RemoteProviderObservation[]): Record<FailureClass, number> {
  return {
    none: observations.filter((item) => item.failureClass === "none").length,
    transient_provider: observations.filter((item) => item.failureClass === "transient_provider").length,
    provider_unavailable: observations.filter((item) => item.failureClass === "provider_unavailable").length,
    quota_exceeded: observations.filter((item) => item.failureClass === "quota_exceeded").length,
    runtime_blocked: observations.filter((item) => item.failureClass === "runtime_blocked").length,
  };
}

function dominantFailureClass(counts: Record<FailureClass, number>): FailureClass {
  const failures: FailureClass[] = ["runtime_blocked", "provider_unavailable", "quota_exceeded", "transient_provider"];
  return failures.reduce((current, candidate) => counts[candidate] > counts[current] ? candidate : current, "transient_provider" as FailureClass);
}

function alertCandidate(params: {
  severity: RemoteProviderAlertCandidate["severity"];
  code: string;
  message: string;
  failureClass: FailureClass;
  retryable: boolean;
  reason: string;
}): RemoteProviderAlertCandidate {
  return {
    ...projectionBoundary(),
    observationSource: RUNTIME_OBSERVATION_SOURCE,
    runtimeMode: "remote",
    severity: params.severity,
    code: params.code,
    message: params.message,
    failureClass: params.failureClass,
    retryable: params.retryable,
    runtimeImpact: {
      mode: params.severity === "critical" ? "blocked" : "degraded",
      severity: params.severity === "critical" ? "critical" : "warning",
      operatorAction: params.retryable ? "retry_or_wait_for_provider_recovery" : "pause_external_execution_and_reconcile_journal",
      paperclipTerminalState: "unchanged",
      terminalStateAdvanced: false,
      reason: params.reason,
    },
    terminalStateAdvanced: false,
  };
}

function projectionBoundary(): ProjectionBoundary {
  return {
    source: DARK_FACTORY_PROJECTION_SOURCE,
    authoritative: PROJECTION_AUTHORITATIVE,
    truthSource: DARK_FACTORY_TRUTH_SOURCE,
  };
}
