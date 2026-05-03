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

export type RemoteProviderPreflightStep = ProjectionBoundary & {
  observationSource: typeof RUNTIME_OBSERVATION_SOURCE;
  runtimeMode: "remote";
  hook: Exclude<RemoteProviderNextSafeHook, "none">;
  status: "allowed" | "review_required" | "blocked";
  code: string;
  label: string;
  message: string;
  blockingCodes: string[];
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
  preflightPlan: RemoteProviderPreflightStep[];
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
  const preflightPlan = buildPreflightPlan({
    readinessStatus,
    nextSafeHook,
    signals,
    readinessChecklist,
  });
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
    preflightPlan,
    readinessReceipt,
    readinessTransition,
    terminalStateAdvanced: false,
  };
}

function buildPreflightPlan(input: {
  readinessStatus: RemoteProviderReadinessStatus;
  nextSafeHook: RemoteProviderNextSafeHook;
  signals: RemoteProviderReadinessSignal[];
  readinessChecklist: RemoteProviderReadinessChecklistItem[];
}): RemoteProviderPreflightStep[] {
  const stepDefinitions: Array<{
    hook: RemoteProviderPreflightStep["hook"];
    code: string;
    label: string;
  }> = [
    {
      hook: "onEnvironmentValidateConfig",
      code: "dark_factory_remote_preflight_validate_config",
      label: "校验配置",
    },
    {
      hook: "onEnvironmentProbe",
      code: "dark_factory_remote_preflight_probe",
      label: "探测 Provider",
    },
    {
      hook: "onEnvironmentAcquireLease",
      code: "dark_factory_remote_preflight_acquire_lease",
      label: "获取租约",
    },
    {
      hook: "onEnvironmentExecute",
      code: "dark_factory_remote_preflight_execute",
      label: "执行",
    },
  ];

  return stepDefinitions.map((definition) => {
    const status = preflightStatusFor(definition.hook, input.readinessStatus, input.nextSafeHook);
    return preflightStep({
      ...definition,
      status,
      message: preflightMessageFor(definition.hook, status, input.readinessStatus, input.nextSafeHook),
      blockingCodes: status === "allowed" ? [] : blockingCodesForPreflightStep(definition.hook, input.signals, input.readinessChecklist),
    });
  });
}

function preflightStatusFor(
  hook: RemoteProviderPreflightStep["hook"],
  readinessStatus: RemoteProviderReadinessStatus,
  nextSafeHook: RemoteProviderNextSafeHook,
): RemoteProviderPreflightStep["status"] {
  if (hook === "onEnvironmentValidateConfig") return "allowed";
  const currentScore = hookScore(hook);
  const nextScore = hookScore(nextSafeHook);
  if (nextScore === 0 || currentScore > nextScore) return "blocked";
  if (readinessStatus === "ready" || currentScore < nextScore) return "allowed";
  return "review_required";
}

function preflightMessageFor(
  hook: RemoteProviderPreflightStep["hook"],
  status: RemoteProviderPreflightStep["status"],
  readinessStatus: RemoteProviderReadinessStatus,
  nextSafeHook: RemoteProviderNextSafeHook,
): string {
  if (hook === "onEnvironmentValidateConfig") {
    return "在任何远程 Provider 尝试前先校验远程配置。";
  }
  if (status === "allowed") {
    return `${hook} 处于当前建议安全边界内。`;
  }
  if (status === "review_required") {
    return `${hook} 是当前下一安全 hook，但就绪状态为 ${readinessStatus}；需要操作员复核。`;
  }
  return `${hook} 已超出当前下一安全 hook（${nextSafeHook}）；请先解决就绪阻断项。`;
}

function blockingCodesForPreflightStep(
  hook: RemoteProviderPreflightStep["hook"],
  signals: RemoteProviderReadinessSignal[],
  checklist: RemoteProviderReadinessChecklistItem[],
): string[] {
  const hookBoundary = hookScore(hook);
  const codes = [
    ...signals
      .filter((signal) => signal.severity !== "info")
      .map((signal) => signal.code),
    ...checklist
      .filter((item) => item.status !== "pass" && hookScore(item.requiredBefore) <= hookBoundary)
      .map((item) => item.code),
  ];
  return Array.from(new Set(codes)).sort();
}

function preflightStep(params: {
  hook: RemoteProviderPreflightStep["hook"];
  status: RemoteProviderPreflightStep["status"];
  code: string;
  label: string;
  message: string;
  blockingCodes: string[];
}): RemoteProviderPreflightStep {
  return {
    ...projectionBoundary(),
    observationSource: RUNTIME_OBSERVATION_SOURCE,
    runtimeMode: "remote",
    hook: params.hook,
    status: params.status,
    code: params.code,
    label: params.label,
    message: params.message,
    blockingCodes: params.blockingCodes,
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
      label: "远程凭据",
      message: input.credentialDiagnostics.ok
        ? "远程凭据诊断已就绪"
        : "远程凭据诊断需要操作员处理",
      requiredBefore: "onEnvironmentProbe",
    }),
    checklistItem({
      category: "observability",
      status: observabilityChecklistStatus(input.alertCandidates, input.sampledObservationCount),
      code: "dark_factory_remote_readiness_observability",
      label: "远程观测",
      message: input.sampledObservationCount > 0
        ? "已有远程 Provider 观测可用于就绪评估"
        : "尚未采样到远程 Provider 观测",
      requiredBefore: "onEnvironmentAcquireLease",
    }),
    checklistItem({
      category: "breaker",
      status: breakerChecklistStatus(input.breakerEvaluation.breakerState),
      code: "dark_factory_remote_readiness_breaker",
      label: "熔断器",
      message: `远程 Provider 熔断器状态为 ${input.breakerEvaluation.breakerState}`,
      requiredBefore: "onEnvironmentExecute",
    }),
    checklistItem({
      category: "journal_boundary",
      status: "pass",
      code: "dark_factory_remote_readiness_journal_boundary",
      label: "Journal 边界",
      message: "Dark Factory Journal 仍是事实来源，Paperclip 终态保持不变",
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
        ? "凭据诊断已就绪，但没有提供明细条目"
        : "凭据诊断缺少明细条目",
      remediation: diagnostics.ok ? ["继续执行受控 probe。"] : ["尝试远程 Provider 执行前先运行远程凭据诊断。"],
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
      message: "尚未采样到远程 Provider 观测",
      remediation: ["在操作员受控环境中先从 probe 开始，再进入 acquire 或 execute。"],
    })];
  }

  return [signal({
    category: "observability",
    severity: "info",
    code: "dark_factory_remote_observability_clear",
    message: "远程 Provider 采样观测没有就绪告警",
    remediation: ["继续监控请求失败、延迟和 Journal 游标滞后。"],
  })];
}

function breakerSignal(evaluation: RemoteCircuitBreakerEvaluation): RemoteProviderReadinessSignal {
  if (evaluation.breakerState === "open") {
    return signal({
      category: "breaker",
      severity: "critical",
      code: "dark_factory_remote_breaker_open",
      message: "远程 Provider 熔断器已打开",
      remediation: ["暂停远程执行，并在重试前对齐 Dark Factory Journal。"],
    });
  }
  if (evaluation.breakerState === "half_open") {
    return signal({
      category: "breaker",
      severity: "warning",
      code: "dark_factory_remote_breaker_half_open",
      message: "远程 Provider 熔断器处于半开状态",
      remediation: ["执行受控 probe，并在 execute 前验证投影新鲜度。"],
    });
  }
  return signal({
    category: "breaker",
    severity: "info",
    code: "dark_factory_remote_breaker_closed",
    message: "远程 Provider 熔断器已关闭",
    remediation: ["远程 alpha 运行期间继续监控熔断器状态。"],
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
      return ["重试远程执行前检查 Provider 健康和 Dark Factory Journal。"];
    case "dark_factory_remote_latency_high":
      return ["增加工作负载前检查 Provider 或网络延迟以及重试压力。"];
    case "dark_factory_remote_cursor_lag_high":
      return ["信任投影输出前先对齐 Journal 游标新鲜度。"];
    default:
      return ["继续前检查采样到的远程 Provider 观测窗口。"];
  }
}

function summaryFor(status: RemoteProviderReadinessStatus): string {
  if (status === "ready") return "远程 Provider alpha 已准备好进行受控 probe。";
  if (status === "needs_attention") return "远程 Provider alpha 在 execute 前需要操作员处理。";
  return "远程 Provider alpha 已阻断，需先解决严重就绪信号。";
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
  if (kind === "new") return `初始就绪报告为 ${currentStatus}；下一安全 hook 是 ${currentNextSafeHook}。`;
  if (kind === "unchanged") return `就绪状态保持 ${currentStatus}；下一安全 hook 保持 ${currentNextSafeHook}。`;
  if (kind === "improved") return `就绪状态从 ${previousStatus} 改善为 ${currentStatus}；下一安全 hook 是 ${currentNextSafeHook}。`;
  if (kind === "regressed") return `就绪状态从 ${previousStatus} 回退为 ${currentStatus}；下一安全 hook 从 ${previousNextSafeHook ?? "none"} 变为 ${currentNextSafeHook}。`;
  return `就绪状态从 ${previousStatus} 变为 ${currentStatus}；下一安全 hook 从 ${previousNextSafeHook ?? "none"} 变为 ${currentNextSafeHook}。`;
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
