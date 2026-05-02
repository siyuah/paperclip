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
export type RemoteProviderNextSafeHook =
  | "onEnvironmentValidateConfig"
  | "onEnvironmentProbe"
  | "onEnvironmentAcquireLease"
  | "onEnvironmentExecute"
  | "none";

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

export type RemoteProviderReadinessChecklistItem = ProjectionBoundary & {
  observationSource: typeof RUNTIME_OBSERVATION_SOURCE;
  runtimeMode: "remote";
  category: "credentials" | "observability" | "breaker" | "journal_boundary";
  status: "pass" | "warn" | "fail";
  code: string;
  label: string;
  message: string;
  requiredBefore: RemoteProviderNextSafeHook;
  terminalStateAdvanced: false;
};

export type RemoteProviderReadinessReceipt = ProjectionBoundary & {
  observationSource: typeof RUNTIME_OBSERVATION_SOURCE;
  runtimeMode: "remote";
  receiptId: string;
  digest: string;
  digestAlgorithm: "fnv1a32";
  checkedAt: string;
  readinessStatus: RemoteProviderReadinessStatus;
  nextSafeHook: RemoteProviderNextSafeHook;
  doesAuthorizeRemoteExecution: false;
  terminalStateAdvanced: false;
  evidence: {
    credentialOk: boolean;
    breakerState: BreakerState;
    sampledObservationCount: number;
    alertCount: number;
    signalCodes: string[];
    checklist: Array<{
      code: string;
      status: RemoteProviderReadinessChecklistItem["status"];
      requiredBefore: RemoteProviderNextSafeHook;
    }>;
  };
};

export type RemoteProviderReadinessTransitionInput = {
  readinessStatus?: RemoteProviderReadinessStatus;
  nextSafeHook?: RemoteProviderNextSafeHook;
  receiptDigest?: string | null;
  receiptId?: string | null;
  checkedAt?: string | null;
} | null;

export type RemoteProviderReadinessTransition = ProjectionBoundary & {
  observationSource: typeof RUNTIME_OBSERVATION_SOURCE;
  runtimeMode: "remote";
  transitionKind: "new" | "unchanged" | "improved" | "regressed" | "changed";
  previousStatus: RemoteProviderReadinessStatus | null;
  currentStatus: RemoteProviderReadinessStatus;
  previousNextSafeHook: RemoteProviderNextSafeHook | null;
  currentNextSafeHook: RemoteProviderNextSafeHook;
  previousReceiptDigest: string | null;
  currentReceiptDigest: string;
  receiptChanged: boolean;
  summary: string;
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
  nextSafeHook: RemoteProviderNextSafeHook;
  credentialOk: boolean;
  breakerState: BreakerState;
  sampledObservationCount: number;
  alertCount: number;
  signals: RemoteProviderReadinessSignal[];
  readinessChecklist: RemoteProviderReadinessChecklistItem[];
  readinessReceipt: RemoteProviderReadinessReceipt;
  readinessTransition: RemoteProviderReadinessTransition;
  terminalStateAdvanced: false;
};

export type RemoteProviderReadinessInput = {
  credentialDiagnostics: RemoteCredentialDiagnosticsForReadiness;
  metricsSnapshot: RemoteProviderMetricsSnapshot;
  alertCandidates: RemoteProviderAlertCandidate[];
  breakerEvaluation: RemoteCircuitBreakerEvaluation;
  sampledObservationCount: number;
  checkedAt: string;
  previousReadiness?: RemoteProviderReadinessTransitionInput;
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
  const readinessChecklist = buildReadinessChecklist(input, signals);
  const nextSafeHook = nextSafeHookFor(readinessStatus, signals);
  const readinessReceipt = buildReadinessReceipt({
    checkedAt,
    readinessStatus,
    nextSafeHook,
    credentialOk: input.credentialDiagnostics.ok,
    breakerState: input.breakerEvaluation.breakerState,
    sampledObservationCount: input.sampledObservationCount,
    alertCount: input.alertCandidates.length,
    signals,
    readinessChecklist,
  });
  const readinessTransition = buildReadinessTransition(input.previousReadiness ?? null, {
    readinessStatus,
    nextSafeHook,
    readinessReceipt,
  });

  return {
    ...projectionBoundary(),
    observationSource: RUNTIME_OBSERVATION_SOURCE,
    runtimeMode: "remote",
    checkedAt,
    readinessStatus,
    ready: readinessStatus === "ready",
    summary: summaryFor(readinessStatus),
    recommendedAction: recommendedActionFor(readinessStatus),
    nextSafeHook,
    credentialOk: input.credentialDiagnostics.ok,
    breakerState: input.breakerEvaluation.breakerState,
    sampledObservationCount: input.sampledObservationCount,
    alertCount: input.alertCandidates.length,
    signals,
    readinessChecklist,
    readinessReceipt,
    readinessTransition,
    terminalStateAdvanced: false,
  };
}

function buildReadinessTransition(
  previous: RemoteProviderReadinessTransitionInput,
  current: {
    readinessStatus: RemoteProviderReadinessStatus;
    nextSafeHook: RemoteProviderNextSafeHook;
    readinessReceipt: RemoteProviderReadinessReceipt;
  },
): RemoteProviderReadinessTransition {
  const previousStatus = previous?.readinessStatus ?? null;
  const previousNextSafeHook = previous?.nextSafeHook ?? null;
  const previousReceiptDigest = previous?.receiptDigest ?? null;
  const receiptChanged = previousReceiptDigest !== null && previousReceiptDigest !== current.readinessReceipt.digest;
  const transitionKind = transitionKindFor(previousStatus, current.readinessStatus, previousNextSafeHook, current.nextSafeHook);

  return {
    ...projectionBoundary(),
    observationSource: RUNTIME_OBSERVATION_SOURCE,
    runtimeMode: "remote",
    transitionKind,
    previousStatus,
    currentStatus: current.readinessStatus,
    previousNextSafeHook,
    currentNextSafeHook: current.nextSafeHook,
    previousReceiptDigest,
    currentReceiptDigest: current.readinessReceipt.digest,
    receiptChanged,
    summary: transitionSummary(transitionKind, previousStatus, current.readinessStatus, previousNextSafeHook, current.nextSafeHook),
    terminalStateAdvanced: false,
  };
}

function buildReadinessReceipt(input: {
  checkedAt: string;
  readinessStatus: RemoteProviderReadinessStatus;
  nextSafeHook: RemoteProviderNextSafeHook;
  credentialOk: boolean;
  breakerState: BreakerState;
  sampledObservationCount: number;
  alertCount: number;
  signals: RemoteProviderReadinessSignal[];
  readinessChecklist: RemoteProviderReadinessChecklistItem[];
}): RemoteProviderReadinessReceipt {
  const evidence = {
    credentialOk: input.credentialOk,
    breakerState: input.breakerState,
    sampledObservationCount: input.sampledObservationCount,
    alertCount: input.alertCount,
    signalCodes: input.signals.map((signal) => signal.code).sort(),
    checklist: input.readinessChecklist.map((item) => ({
      code: item.code,
      status: item.status,
      requiredBefore: item.requiredBefore,
    })),
  };
  const payload = stableStringify({
    checkedAt: input.checkedAt,
    readinessStatus: input.readinessStatus,
    nextSafeHook: input.nextSafeHook,
    evidence,
  });
  const digest = fnv1a32(payload);

  return {
    ...projectionBoundary(),
    observationSource: RUNTIME_OBSERVATION_SOURCE,
    runtimeMode: "remote",
    receiptId: `df-readiness-${digest}`,
    digest,
    digestAlgorithm: "fnv1a32",
    checkedAt: input.checkedAt,
    readinessStatus: input.readinessStatus,
    nextSafeHook: input.nextSafeHook,
    doesAuthorizeRemoteExecution: false,
    terminalStateAdvanced: false,
    evidence,
  };
}

function buildReadinessChecklist(
  input: RemoteProviderReadinessInput,
  signals: RemoteProviderReadinessSignal[],
): RemoteProviderReadinessChecklistItem[] {
  return [
    checklistItem({
      category: "credentials",
      status: credentialChecklistStatus(input.credentialDiagnostics, signals),
      code: "dark_factory_remote_readiness_credentials",
      label: "Remote credentials",
      message: input.credentialDiagnostics.ok
        ? "Remote credential diagnostics are ready"
        : "Remote credential diagnostics require operator attention",
      requiredBefore: "onEnvironmentProbe",
    }),
    checklistItem({
      category: "observability",
      status: observabilityChecklistStatus(input.alertCandidates, input.sampledObservationCount),
      code: "dark_factory_remote_readiness_observability",
      label: "Remote observations",
      message: input.sampledObservationCount > 0
        ? "Remote provider observations are available for readiness evaluation"
        : "No remote provider observations have been sampled yet",
      requiredBefore: "onEnvironmentAcquireLease",
    }),
    checklistItem({
      category: "breaker",
      status: breakerChecklistStatus(input.breakerEvaluation.breakerState),
      code: "dark_factory_remote_readiness_breaker",
      label: "Circuit breaker",
      message: `Remote provider circuit breaker is ${input.breakerEvaluation.breakerState}`,
      requiredBefore: "onEnvironmentExecute",
    }),
    checklistItem({
      category: "journal_boundary",
      status: "pass",
      code: "dark_factory_remote_readiness_journal_boundary",
      label: "Journal boundary",
      message: "Dark Factory Journal remains truth source and Paperclip terminal state is unchanged",
      requiredBefore: "onEnvironmentExecute",
    }),
  ];
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

function nextSafeHookFor(
  status: RemoteProviderReadinessStatus,
  signals: RemoteProviderReadinessSignal[],
): RemoteProviderNextSafeHook {
  if (status === "ready") return "onEnvironmentExecute";
  if (signals.some((signal) => signal.category === "credentials" && signal.severity === "critical")) {
    return "onEnvironmentValidateConfig";
  }
  if (signals.some((signal) => signal.category === "breaker" && signal.severity === "critical")) {
    return "onEnvironmentProbe";
  }
  if (status === "needs_attention") return "onEnvironmentProbe";
  return "none";
}

function transitionKindFor(
  previousStatus: RemoteProviderReadinessStatus | null,
  currentStatus: RemoteProviderReadinessStatus,
  previousNextSafeHook: RemoteProviderNextSafeHook | null,
  currentNextSafeHook: RemoteProviderNextSafeHook,
): RemoteProviderReadinessTransition["transitionKind"] {
  if (!previousStatus) return "new";
  const previousScore = readinessScore(previousStatus, previousNextSafeHook);
  const currentScore = readinessScore(currentStatus, currentNextSafeHook);
  if (currentScore > previousScore) return "improved";
  if (currentScore < previousScore) return "regressed";
  if (previousStatus === currentStatus && previousNextSafeHook === currentNextSafeHook) return "unchanged";
  return "changed";
}

function readinessScore(status: RemoteProviderReadinessStatus, nextSafeHook: RemoteProviderNextSafeHook | null): number {
  const statusScore = status === "ready" ? 30 : status === "needs_attention" ? 20 : 10;
  return statusScore + hookScore(nextSafeHook);
}

function hookScore(hook: RemoteProviderNextSafeHook | null): number {
  switch (hook) {
    case "onEnvironmentExecute":
      return 4;
    case "onEnvironmentAcquireLease":
      return 3;
    case "onEnvironmentProbe":
      return 2;
    case "onEnvironmentValidateConfig":
      return 1;
    default:
      return 0;
  }
}

function transitionSummary(
  kind: RemoteProviderReadinessTransition["transitionKind"],
  previousStatus: RemoteProviderReadinessStatus | null,
  currentStatus: RemoteProviderReadinessStatus,
  previousNextSafeHook: RemoteProviderNextSafeHook | null,
  currentNextSafeHook: RemoteProviderNextSafeHook,
): string {
  if (kind === "new") return `Initial readiness report is ${currentStatus}; next safe hook is ${currentNextSafeHook}.`;
  if (kind === "unchanged") return `Readiness remains ${currentStatus}; next safe hook remains ${currentNextSafeHook}.`;
  if (kind === "improved") return `Readiness improved from ${previousStatus} to ${currentStatus}; next safe hook is ${currentNextSafeHook}.`;
  if (kind === "regressed") return `Readiness regressed from ${previousStatus} to ${currentStatus}; next safe hook moved from ${previousNextSafeHook ?? "none"} to ${currentNextSafeHook}.`;
  return `Readiness changed from ${previousStatus} to ${currentStatus}; next safe hook moved from ${previousNextSafeHook ?? "none"} to ${currentNextSafeHook}.`;
}

function credentialChecklistStatus(
  diagnostics: RemoteCredentialDiagnosticsForReadiness,
  signals: RemoteProviderReadinessSignal[],
): RemoteProviderReadinessChecklistItem["status"] {
  if (diagnostics.ok) return "pass";
  return signals.some((signal) => signal.category === "credentials" && signal.severity === "critical") ? "fail" : "warn";
}

function observabilityChecklistStatus(
  alerts: RemoteProviderAlertCandidate[],
  sampledObservationCount: number,
): RemoteProviderReadinessChecklistItem["status"] {
  if (alerts.some((alert) => alert.severity === "critical")) return "fail";
  if (alerts.length > 0 || sampledObservationCount === 0) return "warn";
  return "pass";
}

function breakerChecklistStatus(breakerState: BreakerState): RemoteProviderReadinessChecklistItem["status"] {
  if (breakerState === "open") return "fail";
  if (breakerState === "half_open") return "warn";
  return "pass";
}

function normalizeIsoTimestamp(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? new Date(0).toISOString() : new Date(parsed).toISOString();
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
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

function checklistItem(params: {
  category: RemoteProviderReadinessChecklistItem["category"];
  status: RemoteProviderReadinessChecklistItem["status"];
  code: string;
  label: string;
  message: string;
  requiredBefore: RemoteProviderNextSafeHook;
}): RemoteProviderReadinessChecklistItem {
  return {
    ...projectionBoundary(),
    observationSource: RUNTIME_OBSERVATION_SOURCE,
    runtimeMode: "remote",
    category: params.category,
    status: params.status,
    code: params.code,
    label: params.label,
    message: params.message,
    requiredBefore: params.requiredBefore,
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
