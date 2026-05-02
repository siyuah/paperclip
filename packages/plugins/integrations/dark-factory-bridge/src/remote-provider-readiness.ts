import {
  DARK_FACTORY_PROJECTION_SOURCE,
  DARK_FACTORY_TRUTH_SOURCE,
  PROJECTION_AUTHORITATIVE,
  RUNTIME_OBSERVATION_SOURCE,
  type BreakerState,
} from "./runtime-contract.js";
import type {
  RemoteProviderAlertCandidate,
  RemoteProviderMetricsSnapshot,
} from "./remote-provider-observability.js";
import type { RemoteCircuitBreakerEvaluation } from "./remote-provider-circuit-breaker.js";

type ProjectionBoundary = {
  source: typeof DARK_FACTORY_PROJECTION_SOURCE;
  authoritative: typeof PROJECTION_AUTHORITATIVE;
  truthSource: typeof DARK_FACTORY_TRUTH_SOURCE;
};

export type RemoteCredentialDiagnosticForReadiness = {
  severity: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  remediation?: string[];
};

export type RemoteCredentialDiagnosticsForReadiness = ProjectionBoundary & {
  observationSource: typeof RUNTIME_OBSERVATION_SOURCE;
  runtimeMode: "remote";
  ok: boolean;
  diagnostics: RemoteCredentialDiagnosticForReadiness[];
  terminalStateAdvanced: false;
};

export type RemoteProviderReadinessStatus = "ready" | "needs_attention" | "blocked";

export type RemoteProviderReadinessSignal = ProjectionBoundary & {
  observationSource: typeof RUNTIME_OBSERVATION_SOURCE;
  runtimeMode: "remote";
  category: "credentials" | "observability" | "breaker";
  severity: "info" | "warning" | "critical";
  code: string;
  message: string;
  remediation: string[];
  terminalStateAdvanced: false;
};

export type RemoteProviderReadinessReport = ProjectionBoundary & {
  observationSource: typeof RUNTIME_OBSERVATION_SOURCE;
  runtimeMode: "remote";
  checkedAt: string;
  readinessStatus: RemoteProviderReadinessStatus;
  ready: boolean;
  summary: string;
  recommendedAction: string;
  credentialOk: boolean;
  breakerState: BreakerState;
  sampledObservationCount: number;
  alertCount: number;
  signals: RemoteProviderReadinessSignal[];
  terminalStateAdvanced: false;
};

export type RemoteProviderReadinessInput = {
  credentialDiagnostics: RemoteCredentialDiagnosticsForReadiness;
  metricsSnapshot: RemoteProviderMetricsSnapshot;
  alertCandidates: RemoteProviderAlertCandidate[];
  breakerEvaluation: RemoteCircuitBreakerEvaluation;
  sampledObservationCount: number;
  checkedAt: string;
};

export function buildRemoteProviderReadinessReport(input: RemoteProviderReadinessInput): RemoteProviderReadinessReport {
  const checkedAt = normalizeIsoTimestamp(input.checkedAt);
  const signals = [
    ...credentialSignals(input.credentialDiagnostics),
    ...observabilitySignals(input.metricsSnapshot, input.alertCandidates, input.sampledObservationCount),
    breakerSignal(input.breakerEvaluation),
  ];
  const hasCritical = signals.some((signal) => signal.severity === "critical");
  const hasWarning = signals.some((signal) => signal.severity === "warning");
  const readinessStatus: RemoteProviderReadinessStatus = hasCritical ? "blocked" : hasWarning ? "needs_attention" : "ready";

  return {
    ...projectionBoundary(),
    observationSource: RUNTIME_OBSERVATION_SOURCE,
    runtimeMode: "remote",
    checkedAt,
    readinessStatus,
    ready: readinessStatus === "ready",
    summary: summaryFor(readinessStatus),
    recommendedAction: recommendedActionFor(readinessStatus),
    credentialOk: input.credentialDiagnostics.ok,
    breakerState: input.breakerEvaluation.breakerState,
    sampledObservationCount: input.sampledObservationCount,
    alertCount: input.alertCandidates.length,
    signals,
    terminalStateAdvanced: false,
  };
}

function credentialSignals(diagnostics: RemoteCredentialDiagnosticsForReadiness): RemoteProviderReadinessSignal[] {
  if (diagnostics.diagnostics.length === 0) {
    return [signal({
      category: "credentials",
      severity: diagnostics.ok ? "info" : "critical",
      code: "dark_factory_remote_credential_diagnostic_missing",
      message: diagnostics.ok
        ? "Credential diagnostics are ready but no detail entries were supplied"
        : "Credential diagnostics are missing detail entries",
      remediation: diagnostics.ok ? ["Continue with a controlled probe."] : ["Run remote credential diagnostics before attempting remote provider execution."],
    })];
  }

  return diagnostics.diagnostics.map((diagnostic) => signal({
    category: "credentials",
    severity: credentialSeverity(diagnostic),
    code: diagnostic.code,
    message: diagnostic.message,
    remediation: diagnostic.remediation ?? [],
  }));
}

function observabilitySignals(
  snapshot: RemoteProviderMetricsSnapshot,
  alerts: RemoteProviderAlertCandidate[],
  sampledObservationCount: number,
): RemoteProviderReadinessSignal[] {
  if (alerts.length > 0) {
    return alerts.map((alert) => signal({
      category: "observability",
      severity: alert.severity === "critical" ? "critical" : "warning",
      code: alert.code,
      message: alert.message,
      remediation: remediationForAlert(alert.code),
    }));
  }

  if (sampledObservationCount === 0 || snapshot.requestCount === 0) {
    return [signal({
      category: "observability",
      severity: "info",
      code: "dark_factory_remote_no_sampled_observations",
      message: "No remote provider observations have been sampled yet",
      remediation: ["Start with probe before acquire or execute in an operator-controlled environment."],
    })];
  }

  return [signal({
    category: "observability",
    severity: "info",
    code: "dark_factory_remote_observability_clear",
    message: "Remote provider sampled observations have no readiness alerts",
    remediation: ["Continue monitoring request failures, latency, and Journal cursor lag."],
  })];
}

function breakerSignal(evaluation: RemoteCircuitBreakerEvaluation): RemoteProviderReadinessSignal {
  if (evaluation.breakerState === "open") {
    return signal({
      category: "breaker",
      severity: "critical",
      code: "dark_factory_remote_breaker_open",
      message: "Remote provider circuit breaker is open",
      remediation: ["Pause remote execution and reconcile Dark Factory Journal before retrying."],
    });
  }
  if (evaluation.breakerState === "half_open") {
    return signal({
      category: "breaker",
      severity: "warning",
      code: "dark_factory_remote_breaker_half_open",
      message: "Remote provider circuit breaker is half-open",
      remediation: ["Run a controlled probe and verify projection freshness before execute."],
    });
  }
  return signal({
    category: "breaker",
    severity: "info",
    code: "dark_factory_remote_breaker_closed",
    message: "Remote provider circuit breaker is closed",
    remediation: ["Continue monitoring breaker state during remote alpha operations."],
  });
}

function credentialSeverity(diagnostic: RemoteCredentialDiagnosticForReadiness): RemoteProviderReadinessSignal["severity"] {
  if (diagnostic.code === "dark_factory_remote_credential_ready") return "info";
  if (diagnostic.code === "dark_factory_remote_credential_config_not_supplied") return "warning";
  return diagnostic.severity === "error" ? "critical" : "warning";
}

function remediationForAlert(code: string): string[] {
  switch (code) {
    case "dark_factory_remote_error_rate_high":
      return ["Inspect provider health and Dark Factory Journal before retrying remote execution."];
    case "dark_factory_remote_latency_high":
      return ["Check provider or network latency and retry pressure before increasing workload."];
    case "dark_factory_remote_cursor_lag_high":
      return ["Reconcile Journal cursor freshness before trusting projection output."];
    default:
      return ["Inspect the sampled remote provider observation window before continuing."];
  }
}

function summaryFor(status: RemoteProviderReadinessStatus): string {
  if (status === "ready") return "Remote provider alpha is ready for a controlled probe.";
  if (status === "needs_attention") return "Remote provider alpha needs operator attention before execute.";
  return "Remote provider alpha is blocked until critical readiness signals are resolved.";
}

function recommendedActionFor(status: RemoteProviderReadinessStatus): string {
  if (status === "ready") return "start_with_probe_then_acquire_in_operator_controlled_environment";
  if (status === "needs_attention") return "review_warnings_before_remote_provider_attempt";
  return "resolve_blocking_signals_before_remote_provider_attempt";
}

function normalizeIsoTimestamp(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? new Date(0).toISOString() : new Date(parsed).toISOString();
}

function signal(params: {
  category: RemoteProviderReadinessSignal["category"];
  severity: RemoteProviderReadinessSignal["severity"];
  code: string;
  message: string;
  remediation: string[];
}): RemoteProviderReadinessSignal {
  return {
    ...projectionBoundary(),
    observationSource: RUNTIME_OBSERVATION_SOURCE,
    runtimeMode: "remote",
    category: params.category,
    severity: params.severity,
    code: params.code,
    message: params.message,
    remediation: params.remediation,
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
