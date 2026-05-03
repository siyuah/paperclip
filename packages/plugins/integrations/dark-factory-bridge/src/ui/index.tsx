import {
  useState,
} from "react";
import {
  usePluginAction,
  usePluginData,
  type PluginDetailTabProps,
  type PluginSettingsPageProps,
  type PluginWidgetProps,
} from "@paperclipai/plugin-sdk/ui";
import type React from "react";

const DISCLAIMER = "仅显示投影 - Dark Factory Journal 仍是唯一事实来源";
const NONE_TEXT = "无";
const UNKNOWN_TEXT = "未知";

function yesNo(value: boolean): string {
  return value ? "是" : "否";
}

function optionalText(value: string | number | null | undefined): string | number {
  return value ?? NONE_TEXT;
}

function optionalUnknownText(value: string | number | null | undefined): string | number {
  return value ?? UNKNOWN_TEXT;
}

function displayValue(value: string | number | null | undefined): string | number {
  if (typeof value !== "string") return optionalText(value);
  const translated = translatedValue(value);
  return translated === value ? value : `${translated} (${value})`;
}

function translatedValue(value: string): string {
  const translations: Record<string, string> = {
    current: "当前",
    degraded: "降级",
    blocked: "已阻断",
    needs_approval: "需要审批",
    stale: "过期",
    observed: "已观测",
    requested: "已请求",
    available: "可用",
    fallback: "已 fallback",
    info: "提示",
    warning: "警告",
    critical: "严重",
    monitor: "监控",
    retry_or_wait_for_provider_recovery: "重试或等待 Provider 恢复",
    pause_external_execution_and_reconcile_journal: "暂停外部执行并对齐 Journal",
    verify_fallback_projection_before_retry: "重试前验证 fallback 投影",
    unchanged: "未改变",
    primary_execution: "主执行 Provider",
    execution_model: "执行模型",
    role_based_runtime_selection: "按运行时角色选择",
    closed: "关闭",
    open: "打开",
    half_open: "半开",
    ready: "就绪",
    needs_attention: "需要处理",
    allowed: "允许",
    review_required: "需要人工复核",
    pass: "通过",
    warn: "警告",
    fail: "失败",
    new: "新建",
    improved: "已改善",
    regressed: "已回退",
    changed: "已变化",
    credentials: "凭据",
    observability: "可观测性",
    breaker: "熔断器",
    journal_boundary: "Journal 边界",
    remote: "远程",
    none: "无",
    transient_provider: "Provider 暂时异常",
    provider_unavailable: "Provider 不可用",
    quota_exceeded: "配额已耗尽",
    runtime_blocked: "运行时已阻断",
    runtime_observation: "运行时观测",
    dark_factory_remote_preflight_validate_config: "远程预检：校验配置",
    dark_factory_remote_preflight_probe: "远程预检：探测 Provider",
    dark_factory_remote_preflight_acquire_lease: "远程预检：获取租约",
    dark_factory_remote_preflight_execute: "远程预检：执行",
    dark_factory_remote_readiness_credentials: "远程就绪：凭据",
    dark_factory_remote_readiness_observability: "远程就绪：可观测性",
    dark_factory_remote_readiness_breaker: "远程就绪：熔断器",
    dark_factory_remote_readiness_journal_boundary: "远程就绪：Journal 边界",
    dark_factory_remote_credential_ready: "远程凭据已就绪",
    dark_factory_remote_credential_config_not_supplied: "未提供远程凭据配置",
    dark_factory_remote_credential_missing: "缺少远程凭据",
    dark_factory_remote_credential_host_secret_ref_ready: "Host 托管 secret 引用已就绪",
    dark_factory_remote_credential_host_secret_ref_pending_runtime_resolution: "Host 托管 secret 引用等待运行时注入",
    dark_factory_remote_credential_ref_unsupported: "不支持的 secret 引用",
    dark_factory_remote_credential_unresolved: "secret 引用未解析",
    dark_factory_remote_no_sampled_observations: "尚无远程 Provider 采样观测",
    dark_factory_remote_observability_clear: "远程 Provider 可观测性正常",
    dark_factory_remote_error_rate_high: "远程 Provider 错误率过高",
    dark_factory_remote_latency_high: "远程 Provider 延迟过高",
    dark_factory_remote_cursor_lag_high: "远程 Provider Journal 游标滞后过高",
    dark_factory_remote_breaker_open: "远程 Provider 熔断器打开",
    dark_factory_remote_breaker_half_open: "远程 Provider 熔断器半开",
    dark_factory_remote_breaker_closed: "远程 Provider 熔断器关闭",
    journal_truth_source: "Journal 是事实来源",
    execute_allowed: "允许执行",
  };
  return translations[value] ?? value;
}

function displayList(values: string[]): string {
  return values.length > 0
    ? values.map((value) => String(displayValue(value))).join(", ")
    : NONE_TEXT;
}

function translatedBadge(value: string): string {
  if (value === "journal-truth-source") return "Journal 是事实来源 (journal-truth-source)";
  if (value === "execute-allowed") return "允许执行 (execute-allowed)";
  if (value.startsWith("next:")) return `下一安全 hook: ${value.slice(5)} (${value})`;
  if (value.startsWith("breaker:")) return `熔断器: ${displayValue(value.slice(8))} (${value})`;
  if (value.startsWith("alerts:")) return `告警数: ${value.slice(7)} (${value})`;
  return String(displayValue(value));
}

type ProjectionSummary = {
  source: "dark-factory-projection";
  truthSource: "dark-factory-journal";
  authoritative: false;
  disclaimer: string;
  journalCursor: JournalCursor;
  lastSequenceNo: number;
  projectionStatus: string;
  callbackReceiptId: string;
  staleReason: string | null;
  degradedReason: string | null;
  blockedReason: string | null;
  projection: {
    runId: string;
    linkedRunId: string;
    projectionStatus: string;
    journalCursor: JournalCursor;
    journalCursorMetadata: JournalCursor;
    lastSequenceNo: number;
    callbackReceiptId: string;
    staleReason: string | null;
    degradedReason: string | null;
    blockedReason: string | null;
    callbackReceipt: {
      receiptId: string;
      status: string;
      terminalStateAdvanced: boolean;
    };
    flags: {
      degraded: boolean;
      blocked: boolean;
      needsApproval: boolean;
      stale: boolean;
    };
    lastUpdatedAt: string;
  };
  runtimeImpact: {
    mode: string;
    severity: string;
    operatorAction: string;
    paperclipTerminalState: "unchanged";
    terminalStateAdvanced: false;
    reason: string | null;
  };
  providerHealth: {
    providerRole: string;
    modelRole: string;
    modelSelection: {
      policy: string;
      protocolMustSpecifyConcreteModel: boolean;
      configuredModelName: string | null;
    };
    providerState: string;
    degraded: boolean;
    blocked: boolean;
    fallbackTriggered: boolean;
    degradedReason: string | null;
    blockedReason: string | null;
    fallbackReason: string | null;
    breakerState: string;
    lastUpdatedAt: string;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    openReason: string | null;
    cooldownUntil: string | null;
  };
};

type JournalCursor = {
  cursorId: string;
  runId: string;
  journalCursor: string;
  lastSequenceNo: number;
  lastJournalSequenceNo: number;
  journalRef: string;
  sourceJournalRef: string;
  monotonic: boolean;
  gapDetected: boolean;
};

type RemoteObservabilitySnapshot = {
  source: "dark-factory-projection";
  truthSource: "dark-factory-journal";
  authoritative: false;
  observationSource: "runtime_observation";
  runtimeMode: "remote";
  sampledObservationCount: number;
  terminalStateAdvanced: false;
  snapshot: {
    requestCount: number;
    successCount: number;
    failureCount: number;
    retryCount: number;
    retryableFailureCount: number;
    averageLatencyMs: number;
    maxLatencyMs: number;
    latestErrorCode: string | null;
    latestJournalCursor: string | null;
    latestSequenceNo: number | null;
    cursorLag: number | null;
    terminalStateAdvanced: false;
    failureClassCounts: {
      none: number;
      transient_provider: number;
      provider_unavailable: number;
      quota_exceeded: number;
      runtime_blocked: number;
    };
  };
  alerts: Array<{
    severity: string;
    code: string;
    message: string;
    failureClass: string;
    retryable: boolean;
    terminalStateAdvanced: false;
  }>;
};

type RemoteCredentialDiagnostics = {
  source: "dark-factory-projection";
  truthSource: "dark-factory-journal";
  authoritative: false;
  observationSource: "runtime_observation";
  runtimeMode: "remote";
  ok: boolean;
  credentialSource: string | null;
  terminalStateAdvanced: false;
  checkedConfig: {
    configSupplied: boolean;
    mode: "remote";
    endpointPresent: boolean;
    apiKeyPresent: boolean;
    apiKeySecretRefPresent: boolean;
    apiKeySecretRefScheme: string;
  };
  diagnostics: Array<{
    severity: string;
    code: string;
    message: string;
    details?: Record<string, unknown>;
    remediation: string[];
  }>;
};

type RemoteBreakerEvaluation = {
  source: "dark-factory-projection";
  truthSource: "dark-factory-journal";
  authoritative: false;
  observationSource: "runtime_observation";
  runtimeMode: "remote";
  breakerState: string;
  previousBreakerState: string;
  consecutiveFailures: number;
  consecutiveHalfOpenSuccesses: number;
  openedAt: string | null;
  cooldownUntil: string | null;
  openReason: string | null;
  lastFailureClass: string;
  terminalStateAdvanced: false;
  runtimeImpact: {
    mode: string;
    severity: string;
    operatorAction: string;
    paperclipTerminalState: "unchanged";
    terminalStateAdvanced: false;
    reason: string | null;
  };
};

type RemoteProviderReadiness = {
  source: "dark-factory-projection";
  truthSource: "dark-factory-journal";
  authoritative: false;
  observationSource: "runtime_observation";
  runtimeMode: "remote";
  checkedAt: string;
  readinessStatus: "ready" | "needs_attention" | "blocked";
  ready: boolean;
  summary: string;
  recommendedAction: string;
  nextSafeHook: string;
  credentialOk: boolean;
  breakerState: string;
  sampledObservationCount: number;
  alertCount: number;
  terminalStateAdvanced: false;
  signals: Array<{
    category: string;
    severity: string;
    code: string;
    message: string;
    remediation: string[];
    terminalStateAdvanced: false;
  }>;
  readinessChecklist: Array<{
    category: string;
    status: string;
    code: string;
    label: string;
    message: string;
    requiredBefore: string;
    terminalStateAdvanced: false;
  }>;
  preflightPlan: Array<{
    hook: string;
    status: string;
    code: string;
    label: string;
    message: string;
    blockingCodes: string[];
    terminalStateAdvanced: false;
  }>;
  readinessReceipt: {
    receiptId: string;
    digest: string;
    digestAlgorithm: string;
    doesAuthorizeRemoteExecution: false;
    terminalStateAdvanced: false;
  };
  readinessTransition: {
    transitionKind: string;
    previousStatus: string | null;
    currentStatus: string;
    previousNextSafeHook: string | null;
    currentNextSafeHook: string;
    previousReceiptDigest: string | null;
    currentReceiptDigest: string;
    receiptChanged: boolean;
    summary: string;
    terminalStateAdvanced: false;
  };
};

type UiSmokePreviewScenario =
  | "healthy"
  | "warning_latency"
  | "blocked_failures"
  | "stale_readiness";

type UiSmokePreview = {
  source: "dark-factory-projection";
  truthSource: "dark-factory-journal";
  authoritative: false;
  observationSource: "runtime_observation";
  runtimeMode: "remote";
  scenario: UiSmokePreviewScenario;
  hostContextId: string;
  previewStatus: "ready" | "needs_attention" | "blocked";
  uiBadges: string[];
  readiness: RemoteProviderReadiness;
  observability: Pick<RemoteObservabilitySnapshot, "sampledObservationCount" | "snapshot" | "alerts" | "terminalStateAdvanced">;
  credentialDiagnostics: RemoteCredentialDiagnostics;
  breakerEvaluation: RemoteBreakerEvaluation;
  dryRunGuards: Array<{
    source: "dark-factory-projection";
    truthSource: "dark-factory-journal";
    authoritative: false;
    observationSource: "runtime_observation";
    runtimeMode: "remote";
    targetHook: string;
    decision: "allowed" | "review_required" | "blocked";
    dryRunOnly: true;
    shouldContactRemoteProvider: false;
    doesAuthorizeRemoteExecution: false;
    matchedPreflightStatus: string;
    blockingCodes: string[];
    receiptId: string;
    digest: string;
    terminalStateAdvanced: false;
  }>;
  terminalStateAdvanced: false;
};

const uiSmokePreviewScenarios: Array<{ value: UiSmokePreviewScenario; label: string }> = [
  { value: "healthy", label: "健康" },
  { value: "warning_latency", label: "延迟告警" },
  { value: "blocked_failures", label: "失败阻断" },
  { value: "stale_readiness", label: "就绪状态过期" },
];

const panelStyle = {
  display: "grid",
  gap: 10,
  fontSize: 13,
  lineHeight: 1.45,
} satisfies React.CSSProperties;

const rowStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
} satisfies React.CSSProperties;

const noticeStyle = {
  border: "1px solid #f59e0b",
  background: "#fffbeb",
  color: "#92400e",
  borderRadius: 6,
  padding: "6px 8px",
} satisfies React.CSSProperties;

const badgeStyle = {
  border: "1px solid #cbd5e1",
  background: "#f8fafc",
  borderRadius: 999,
  padding: "2px 8px",
  fontSize: 12,
} satisfies React.CSSProperties;

const buttonStyle = {
  border: "1px solid #1f2937",
  background: "#111827",
  color: "#fff",
  borderRadius: 6,
  padding: "6px 10px",
  font: "inherit",
  cursor: "pointer",
} satisfies React.CSSProperties;

const selectStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  padding: "6px 8px",
  font: "inherit",
  background: "#fff",
} satisfies React.CSSProperties;

const errorStyle = {
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#991b1b",
  borderRadius: 6,
  padding: "6px 8px",
} satisfies React.CSSProperties;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "未知错误";
}

function Disclaimer() {
  return <div style={noticeStyle}>{DISCLAIMER}</div>;
}

function Badge({ label, active, reason }: { label: string; active: boolean; reason?: string | null }) {
  if (!active) return null;
  return <span style={badgeStyle}>{label}{reason ? `: ${reason}` : ""}</span>;
}

function ProjectionRows({ data }: { data: ProjectionSummary }) {
  const projection = data.projection;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={rowStyle}><span>关联 Run ID</span><code>{projection.linkedRunId}</code></div>
      <div style={rowStyle}><span>Journal 游标</span><code>{projection.journalCursorMetadata.journalCursor}</code></div>
      <div style={rowStyle}><span>来源 Journal 引用</span><code>{projection.journalCursorMetadata.sourceJournalRef}</code></div>
      <div style={rowStyle}><span>最后序号</span><strong>{projection.lastSequenceNo}</strong></div>
      <div style={rowStyle}><span>投影状态</span><strong>{displayValue(projection.projectionStatus)}</strong></div>
      <div style={rowStyle}><span>回调 receipt</span><code>{projection.callbackReceiptId}</code></div>
      <div style={rowStyle}><span>receipt 状态</span><strong>{displayValue(projection.callbackReceipt.status)}</strong></div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <Badge label="降级" active={projection.flags.degraded} reason={projection.degradedReason} />
        <Badge label="阻断" active={projection.flags.blocked} reason={projection.blockedReason} />
        <Badge label="过期" active={projection.flags.stale} reason={projection.staleReason} />
        <Badge label="需要审批" active={projection.flags.needsApproval} />
      </div>
    </div>
  );
}

function ProviderHealthRows({ data }: { data: ProjectionSummary }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={rowStyle}><span>Provider 角色</span><code>{displayValue(data.providerHealth.providerRole)}</code></div>
      <div style={rowStyle}><span>模型角色</span><code>{displayValue(data.providerHealth.modelRole)}</code></div>
      <div style={rowStyle}><span>模型策略</span><code>{displayValue(data.providerHealth.modelSelection.policy)}</code></div>
      <div style={rowStyle}><span>协议必须指定具体模型</span><strong>{yesNo(data.providerHealth.modelSelection.protocolMustSpecifyConcreteModel)}</strong></div>
      <div style={rowStyle}><span>熔断器状态</span><strong>{displayValue(data.providerHealth.breakerState)}</strong></div>
      <div style={rowStyle}><span>Provider 状态</span><strong>{displayValue(data.providerHealth.providerState)}</strong></div>
      <div style={rowStyle}><span>运行时影响</span><strong>{displayValue(data.runtimeImpact.mode)} / {displayValue(data.runtimeImpact.severity)}</strong></div>
      <div style={rowStyle}><span>操作员动作</span><code>{displayValue(data.runtimeImpact.operatorAction)}</code></div>
      <div style={rowStyle}><span>Paperclip 终态</span><strong>{displayValue(data.runtimeImpact.paperclipTerminalState)}</strong></div>
      <div style={rowStyle}><span>是否推进终态</span><strong>{yesNo(data.runtimeImpact.terminalStateAdvanced)}</strong></div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <Badge label="Provider 降级" active={data.providerHealth.degraded} reason={data.providerHealth.degradedReason} />
        <Badge label="Provider 阻断" active={data.providerHealth.blocked} reason={data.providerHealth.blockedReason} />
        <Badge label="已触发 fallback" active={data.providerHealth.fallbackTriggered} reason={data.providerHealth.fallbackReason} />
      </div>
      <div style={rowStyle}><span>最后更新</span><code>{data.providerHealth.lastUpdatedAt}</code></div>
      <div style={rowStyle}><span>最后成功</span><code>{optionalText(data.providerHealth.lastSuccessAt)}</code></div>
      <div style={rowStyle}><span>最后失败</span><code>{optionalText(data.providerHealth.lastFailureAt)}</code></div>
      <div style={rowStyle}><span>打开原因</span><code>{optionalText(data.providerHealth.openReason)}</code></div>
    </div>
  );
}

function RemoteObservabilityRows({ data }: { data: RemoteObservabilitySnapshot }) {
  const snapshot = data.snapshot;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <strong>远程 Provider 可观测性</strong>
      <div style={rowStyle}><span>采样观测数</span><strong>{data.sampledObservationCount}</strong></div>
      <div style={rowStyle}><span>请求数</span><strong>{snapshot.requestCount}</strong></div>
      <div style={rowStyle}><span>成功 / 失败</span><strong>{snapshot.successCount} / {snapshot.failureCount}</strong></div>
      <div style={rowStyle}><span>重试次数</span><strong>{snapshot.retryCount}</strong></div>
      <div style={rowStyle}><span>可重试失败</span><strong>{snapshot.retryableFailureCount}</strong></div>
      <div style={rowStyle}><span>平均延迟</span><strong>{snapshot.averageLatencyMs}ms</strong></div>
      <div style={rowStyle}><span>最大延迟</span><strong>{snapshot.maxLatencyMs}ms</strong></div>
      <div style={rowStyle}><span>游标滞后</span><strong>{optionalUnknownText(snapshot.cursorLag)}</strong></div>
      <div style={rowStyle}><span>最新游标</span><code>{optionalText(snapshot.latestJournalCursor)}</code></div>
      <div style={rowStyle}><span>最新错误</span><code>{optionalText(snapshot.latestErrorCode)}</code></div>
      <div style={rowStyle}><span>失败分类</span><code>{Object.entries(snapshot.failureClassCounts).map(([key, value]) => `${displayValue(key)}:${value}`).join(" ")}</code></div>
      {data.alerts.length > 0 ? (
        <div style={{ display: "grid", gap: 6 }}>
          {data.alerts.map((alert) => (
            <div key={alert.code} role="status" style={alert.severity === "critical" ? errorStyle : noticeStyle}>
              {displayValue(alert.code)}：{alert.message}（分类：{displayValue(alert.failureClass)}；级别：{displayValue(alert.severity)}）
            </div>
          ))}
        </div>
      ) : (
        <div style={noticeStyle}>当前采样窗口内没有远程 Provider 告警候选。</div>
      )}
      <div style={rowStyle}><span>是否推进终态</span><strong>{yesNo(snapshot.terminalStateAdvanced)}</strong></div>
    </div>
  );
}

function RemoteCredentialDiagnosticsRows({ data }: { data: RemoteCredentialDiagnostics }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <strong>远程凭据诊断</strong>
      <div style={rowStyle}><span>状态</span><strong>{data.ok ? "就绪" : "需要处理"}</strong></div>
      <div style={rowStyle}><span>凭据来源</span><code>{optionalText(data.credentialSource)}</code></div>
      <div style={rowStyle}><span>已提供配置</span><strong>{yesNo(data.checkedConfig.configSupplied)}</strong></div>
      <div style={rowStyle}><span>已配置 endpoint</span><strong>{yesNo(data.checkedConfig.endpointPresent)}</strong></div>
      <div style={rowStyle}><span>已配置内联 key</span><strong>{yesNo(data.checkedConfig.apiKeyPresent)}</strong></div>
      <div style={rowStyle}><span>已配置 secret 引用</span><strong>{yesNo(data.checkedConfig.apiKeySecretRefPresent)}</strong></div>
      <div style={rowStyle}><span>secret 引用 scheme</span><code>{data.checkedConfig.apiKeySecretRefScheme}</code></div>
      <div style={{ display: "grid", gap: 6 }}>
        {data.diagnostics.map((diagnostic) => (
          <div key={diagnostic.code} role="status" style={diagnostic.severity === "error" ? errorStyle : noticeStyle}>
            <div>{displayValue(diagnostic.code)}：{diagnostic.message}</div>
            {diagnostic.remediation.length > 0 ? (
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {diagnostic.remediation.map((hint) => (
                  <li key={hint}>{hint}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
      <div style={rowStyle}><span>是否推进终态</span><strong>{yesNo(data.terminalStateAdvanced)}</strong></div>
    </div>
  );
}

function RemoteBreakerRows({ data }: { data: RemoteBreakerEvaluation }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <strong>远程熔断器</strong>
      <div style={rowStyle}><span>当前状态</span><strong>{displayValue(data.breakerState)}</strong></div>
      <div style={rowStyle}><span>上一状态</span><strong>{displayValue(data.previousBreakerState)}</strong></div>
      <div style={rowStyle}><span>连续失败</span><strong>{data.consecutiveFailures}</strong></div>
      <div style={rowStyle}><span>半开成功</span><strong>{data.consecutiveHalfOpenSuccesses}</strong></div>
      <div style={rowStyle}><span>最后失败分类</span><code>{displayValue(data.lastFailureClass)}</code></div>
      <div style={rowStyle}><span>打开原因</span><code>{optionalText(data.openReason)}</code></div>
      <div style={rowStyle}><span>打开时间</span><code>{optionalText(data.openedAt)}</code></div>
      <div style={rowStyle}><span>冷却到</span><code>{optionalText(data.cooldownUntil)}</code></div>
      <div style={rowStyle}><span>运行时影响</span><strong>{displayValue(data.runtimeImpact.mode)} / {displayValue(data.runtimeImpact.severity)}</strong></div>
      <div style={rowStyle}><span>操作员动作</span><code>{displayValue(data.runtimeImpact.operatorAction)}</code></div>
      <div style={rowStyle}><span>是否推进终态</span><strong>{yesNo(data.terminalStateAdvanced)}</strong></div>
    </div>
  );
}

function RemoteReadinessRows({ data }: { data: RemoteProviderReadiness }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <strong>远程 Provider 就绪状态</strong>
      <div style={data.readinessStatus === "blocked" ? errorStyle : data.readinessStatus === "needs_attention" ? noticeStyle : undefined}>
        {data.summary}
      </div>
      <div style={rowStyle}><span>状态</span><strong>{displayValue(data.readinessStatus)}</strong></div>
      <div style={rowStyle}><span>凭据正常</span><strong>{yesNo(data.credentialOk)}</strong></div>
      <div style={rowStyle}><span>熔断器状态</span><strong>{displayValue(data.breakerState)}</strong></div>
      <div style={rowStyle}><span>采样观测数</span><strong>{data.sampledObservationCount}</strong></div>
      <div style={rowStyle}><span>告警数</span><strong>{data.alertCount}</strong></div>
      <div style={rowStyle}><span>建议动作</span><code>{displayValue(data.recommendedAction)}</code></div>
      <div style={rowStyle}><span>下一安全 hook</span><code>{data.nextSafeHook}</code></div>
      <div style={rowStyle}><span>检查时间</span><code>{data.checkedAt}</code></div>
      <div style={rowStyle}><span>就绪 receipt</span><code>{data.readinessReceipt.receiptId}</code></div>
      <div style={rowStyle}><span>证据 digest</span><code>{data.readinessReceipt.digestAlgorithm}:{data.readinessReceipt.digest}</code></div>
      <div style={rowStyle}><span>授权远程执行</span><strong>{yesNo(data.readinessReceipt.doesAuthorizeRemoteExecution)}</strong></div>
      <div style={rowStyle}><span>状态转换</span><strong>{displayValue(data.readinessTransition.transitionKind)}</strong></div>
      <div style={rowStyle}><span>转换摘要</span><code>{data.readinessTransition.summary}</code></div>
      <div style={rowStyle}><span>上一状态</span><code>{displayValue(data.readinessTransition.previousStatus)}</code></div>
      <div style={rowStyle}><span>当前状态</span><code>{displayValue(data.readinessTransition.currentStatus)}</code></div>
      <div style={rowStyle}><span>上一 hook</span><code>{optionalText(data.readinessTransition.previousNextSafeHook)}</code></div>
      <div style={rowStyle}><span>当前 hook</span><code>{data.readinessTransition.currentNextSafeHook}</code></div>
      <div style={rowStyle}><span>receipt 已变化</span><strong>{yesNo(data.readinessTransition.receiptChanged)}</strong></div>
      <div style={{ display: "grid", gap: 6 }}>
        {data.preflightPlan.map((step) => (
          <div key={step.code} role="status" style={step.status === "blocked" ? errorStyle : step.status === "review_required" ? noticeStyle : undefined}>
            <div>{step.label}: {displayValue(step.status)}</div>
            <div><code>{step.hook}</code></div>
            <div>{step.message}</div>
            {step.blockingCodes.length > 0 ? (
              <div>阻断代码 <code>{displayList(step.blockingCodes)}</code></div>
            ) : null}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {data.readinessChecklist.map((item) => (
          <div key={item.code} role="status" style={item.status === "fail" ? errorStyle : item.status === "warn" ? noticeStyle : undefined}>
            <div>{item.label}: {displayValue(item.status)}</div>
            <div>{item.message}</div>
            <div>要求早于 <code>{item.requiredBefore}</code></div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {data.signals.map((signal) => (
          <div key={`${signal.category}:${signal.code}`} role="status" style={signal.severity === "critical" ? errorStyle : signal.severity === "warning" ? noticeStyle : undefined}>
            <div>{displayValue(signal.category)} / {displayValue(signal.code)}：{signal.message}</div>
            {signal.remediation.length > 0 ? (
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {signal.remediation.map((hint) => (
                  <li key={hint}>{hint}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
      <div style={rowStyle}><span>是否推进终态</span><strong>{yesNo(data.terminalStateAdvanced)}</strong></div>
    </div>
  );
}

function UiSmokePreviewRows({
  data,
  scenario,
  onScenarioChange,
}: {
  data: UiSmokePreview;
  scenario: UiSmokePreviewScenario;
  onScenarioChange: (scenario: UiSmokePreviewScenario) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 8, borderTop: "1px solid #e5e7eb", paddingTop: 10 }}>
      <div style={rowStyle}>
        <strong>UI 烟雾预览</strong>
        <label>
          <span style={{ marginRight: 6 }}>场景</span>
          <select
            style={selectStyle}
            value={scenario}
            onChange={(event) => onScenarioChange(event.target.value as UiSmokePreviewScenario)}
          >
            {uiSmokePreviewScenarios.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div style={data.previewStatus === "blocked" ? errorStyle : data.previewStatus === "needs_attention" ? noticeStyle : undefined}>
        {data.readiness.summary}
      </div>
      <div style={rowStyle}><span>预览状态</span><strong>{displayValue(data.previewStatus)}</strong></div>
      <div style={rowStyle}><span>Host 上下文</span><code>{data.hostContextId}</code></div>
      <div style={rowStyle}><span>就绪状态</span><strong>{displayValue(data.readiness.readinessStatus)}</strong></div>
      <div style={rowStyle}><span>下一安全 hook</span><code>{data.readiness.nextSafeHook}</code></div>
      <div style={rowStyle}><span>熔断器状态</span><strong>{displayValue(data.breakerEvaluation.breakerState)}</strong></div>
      <div style={rowStyle}><span>采样观测数</span><strong>{data.observability.sampledObservationCount}</strong></div>
      <div style={rowStyle}><span>最大延迟</span><strong>{data.observability.snapshot.maxLatencyMs}ms</strong></div>
      <div style={rowStyle}><span>游标滞后</span><strong>{optionalUnknownText(data.observability.snapshot.cursorLag)}</strong></div>
      <div style={rowStyle}><span>告警数</span><strong>{data.observability.alerts.length}</strong></div>
      <div style={rowStyle}><span>凭据来源</span><code>{optionalText(data.credentialDiagnostics.credentialSource)}</code></div>
      <div style={rowStyle}><span>Dry-run 防护 receipt</span><code>{optionalText(data.dryRunGuards.find((guard) => guard.targetHook === "onEnvironmentExecute")?.receiptId)}</code></div>
      <div style={rowStyle}><span>事实来源</span><code>{data.truthSource}</code></div>
      <div style={rowStyle}><span>是否权威</span><strong>{yesNo(data.authoritative)}</strong></div>
      <div style={rowStyle}><span>是否推进终态</span><strong>{yesNo(data.terminalStateAdvanced)}</strong></div>
      <div style={{ display: "grid", gap: 6 }}>
        <strong>远程 Provider Dry-run 防护</strong>
        {data.dryRunGuards.map((guard) => (
          <div key={guard.targetHook} role="status" style={guard.decision === "blocked" ? errorStyle : guard.decision === "review_required" ? noticeStyle : undefined}>
            <div style={rowStyle}><span>{guard.targetHook}</span><strong>{displayValue(guard.decision)}</strong></div>
            <div style={rowStyle}><span>预检状态</span><code>{displayValue(guard.matchedPreflightStatus)}</code></div>
            <div style={rowStyle}><span>是否联系 Provider</span><strong>{yesNo(guard.shouldContactRemoteProvider)}</strong></div>
            <div style={rowStyle}><span>是否授权执行</span><strong>{yesNo(guard.doesAuthorizeRemoteExecution)}</strong></div>
            <div style={rowStyle}><span>Receipt</span><code>{guard.receiptId}</code></div>
            {guard.blockingCodes.length > 0 ? (
              <div>阻断代码 <code>{displayList(guard.blockingCodes)}</code></div>
            ) : null}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {data.uiBadges.map((badge) => (
          <span key={badge} style={badgeStyle}>{translatedBadge(badge)}</span>
        ))}
      </div>
    </div>
  );
}

export function DashboardWidget({ context }: PluginWidgetProps) {
  const { data, loading, error } = usePluginData<ProjectionSummary>("projection-summary", {
    companyId: context.companyId,
  });

  if (loading) return <div>正在加载 Dark Factory Provider 健康投影...</div>;
  if (error) return <div>Dark Factory Bridge 错误：{error.message}</div>;
  if (!data) return null;

  return (
    <div style={panelStyle}>
      <strong>Dark Factory Bridge 投影</strong>
      <Disclaimer />
      <ProjectionRows data={data} />
      <ProviderHealthRows data={data} />
    </div>
  );
}

export function IssuePanel({ context }: PluginDetailTabProps) {
  const { data, loading, error, refresh } = usePluginData<ProjectionSummary>("projection-summary", {
    companyId: context.companyId,
    issueId: context.entityId,
  });
  const requestRehydrate = usePluginAction("request-rehydrate");
  const [rehydrateError, setRehydrateError] = useState<string | null>(null);
  const [rehydratePending, setRehydratePending] = useState(false);

  if (loading) return <div>正在加载 Dark Factory 投影...</div>;
  if (error) return <div>Dark Factory Bridge 错误：{error.message}</div>;
  if (!data) return null;

  return (
    <div style={panelStyle}>
      <div style={rowStyle}>
        <strong>Dark Factory 投影</strong>
        <button
          style={buttonStyle}
          title="只提交 receipt 级重新水合意图；不代表终态成功。"
          disabled={rehydratePending}
          onClick={async () => {
            setRehydrateError(null);
            setRehydratePending(true);
            try {
              await requestRehydrate({ companyId: context.companyId, issueId: context.entityId, reason: "operator refresh from task detail tab" });
              refresh();
            } catch (error) {
              setRehydrateError(errorMessage(error));
            } finally {
              setRehydratePending(false);
            }
          }}
        >
          {rehydratePending ? "请求中..." : "请求重新水合（仅 receipt）"}
        </button>
      </div>
      <Disclaimer />
      <div style={noticeStyle}>重新水合请求只提交一个意图/receipt；不会推进终态成功，也不会让该投影变成权威记录。</div>
      {rehydrateError ? <div role="alert" style={errorStyle}>重新水合请求失败：{rehydrateError}</div> : null}
      <ProjectionRows data={data} />
      <ProviderHealthRows data={data} />
    </div>
  );
}

export function SettingsPage({ context }: PluginSettingsPageProps) {
  const [uiSmokePreviewScenario, setUiSmokePreviewScenario] = useState<UiSmokePreviewScenario>("healthy");
  const { data, loading, error } = usePluginData<ProjectionSummary>("projection-summary", {
    companyId: context.companyId,
  });
  const {
    data: uiSmokePreview,
    loading: uiSmokePreviewLoading,
    error: uiSmokePreviewError,
  } = usePluginData<UiSmokePreview>("remote-provider-ui-smoke-preview", {
    companyId: context.companyId,
    scenario: uiSmokePreviewScenario,
  });
  const {
    data: remoteObservability,
    loading: remoteObservabilityLoading,
    error: remoteObservabilityError,
  } = usePluginData<RemoteObservabilitySnapshot>("remote-observability-snapshot", {
    companyId: context.companyId,
  });
  const {
    data: remoteCredentialDiagnostics,
    loading: remoteCredentialDiagnosticsLoading,
    error: remoteCredentialDiagnosticsError,
  } = usePluginData<RemoteCredentialDiagnostics>("remote-credential-diagnostics", {
    companyId: context.companyId,
  });
  const {
    data: remoteBreaker,
    loading: remoteBreakerLoading,
    error: remoteBreakerError,
  } = usePluginData<RemoteBreakerEvaluation>("remote-breaker-evaluation", {
    companyId: context.companyId,
  });
  const {
    data: remoteReadiness,
    loading: remoteReadinessLoading,
    error: remoteReadinessError,
  } = usePluginData<RemoteProviderReadiness>("remote-provider-readiness", {
    companyId: context.companyId,
  });

  if (loading) return <div>正在加载 Dark Factory Bridge 设置...</div>;
  if (error) return <div>Dark Factory Bridge 设置错误：{error.message}</div>;
  if (!data) return null;

  return (
    <div style={panelStyle}>
      <strong>Dark Factory Bridge 设置</strong>
      <Disclaimer />
      <div>Mock 投影模式。当前未配置真实 Dark Factory 连接，也不会保存 token 或 secret。</div>
      <ProjectionRows data={data} />
      <ProviderHealthRows data={data} />
      {uiSmokePreviewLoading ? <div>正在加载 UI 烟雾预览...</div> : null}
      {uiSmokePreviewError ? <div style={errorStyle}>UI 烟雾预览错误：{uiSmokePreviewError.message}</div> : null}
      {uiSmokePreview ? (
        <UiSmokePreviewRows
          data={uiSmokePreview}
          scenario={uiSmokePreviewScenario}
          onScenarioChange={setUiSmokePreviewScenario}
        />
      ) : null}
      {remoteReadinessLoading ? <div>正在加载远程 Provider 就绪状态...</div> : null}
      {remoteReadinessError ? <div style={errorStyle}>远程 Provider 就绪状态错误：{remoteReadinessError.message}</div> : null}
      {remoteReadiness ? <RemoteReadinessRows data={remoteReadiness} /> : null}
      {remoteCredentialDiagnosticsLoading ? <div>正在加载远程凭据诊断...</div> : null}
      {remoteCredentialDiagnosticsError ? <div style={errorStyle}>远程凭据诊断错误：{remoteCredentialDiagnosticsError.message}</div> : null}
      {remoteCredentialDiagnostics ? <RemoteCredentialDiagnosticsRows data={remoteCredentialDiagnostics} /> : null}
      {remoteBreakerLoading ? <div>正在加载远程熔断器...</div> : null}
      {remoteBreakerError ? <div style={errorStyle}>远程熔断器错误：{remoteBreakerError.message}</div> : null}
      {remoteBreaker ? <RemoteBreakerRows data={remoteBreaker} /> : null}
      {remoteObservabilityLoading ? <div>正在加载远程 Provider 可观测性...</div> : null}
      {remoteObservabilityError ? <div style={errorStyle}>远程可观测性错误：{remoteObservabilityError.message}</div> : null}
      {remoteObservability ? <RemoteObservabilityRows data={remoteObservability} /> : null}
    </div>
  );
}
