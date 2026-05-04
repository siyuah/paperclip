import { useEffect, useState, type ReactNode } from "react";
import {
  usePluginAction,
  usePluginData,
  type PluginDetailTabProps,
  type PluginSettingsPageProps,
  type PluginWidgetProps,
} from "@paperclipai/plugin-sdk/ui";
import "./styles.css";

const DISCLAIMER = "仅显示非权威投影，Dark Factory Journal remains truth source。";
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
    fallback: "已切换",
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

function statusTone(value: string | null | undefined): Tone {
  if (!value) return "info";
  if (["available", "ready", "current", "closed", "pass", "allowed"].includes(value)) return "healthy";
  if (["degraded", "needs_attention", "warning", "warn", "half_open", "review_required", "stale"].includes(value)) return "warning";
  if (["blocked", "open", "critical", "fail", "error"].includes(value)) return "blocked";
  return "info";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "未知错误";
}

type Tone = "healthy" | "warning" | "error" | "blocked" | "info";

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
    failureClassCounts: Record<string, number>;
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

function StyleMount() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const styleId = "dark-factory-bridge-ui-style";
    if (document.getElementById(styleId)) return;

    const link = document.createElement("link");
    link.id = styleId;
    link.rel = "stylesheet";
    link.href = "/_plugins/paperclipai.dark-factory-bridge/ui/index.css";
    document.head.append(link);
  }, []);

  return null;
}

function StatusDot({ tone }: { tone: Tone }) {
  return <span className={`df-status-dot ${tone}`} aria-hidden="true" />;
}

function Badge({
  label,
  tone = "info",
  active = true,
  reason,
}: {
  label: string;
  tone?: Tone;
  active?: boolean;
  reason?: string | null;
}) {
  if (!active) return null;
  return (
    <span className={`df-badge ${tone}`}>
      <StatusDot tone={tone} />
      {label}{reason ? `: ${reason}` : ""}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string | number | boolean | null | undefined }) {
  return (
    <div className="df-row">
      <span className="df-row-label">{label}</span>
      <span className="df-row-value">{typeof value === "boolean" ? yesNo(value) : optionalText(value)}</span>
    </div>
  );
}

function Section({
  title,
  tone = "info",
  summary,
  defaultOpen = true,
  children,
}: {
  title: string;
  tone?: Tone;
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="df-section">
      <button
        type="button"
        className="df-section-header"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="df-section-title">
          <StatusDot tone={tone} />
          {title}
        </span>
        {summary ? <span className="df-section-summary">{summary}</span> : null}
        <span className={`df-section-chevron ${open ? "expanded" : ""}`}>›</span>
      </button>
      {open ? <div className="df-section-body">{children}</div> : null}
    </section>
  );
}

function Card({
  title,
  subtitle,
  tone = "info",
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  tone?: Tone;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="df-plugin">
      <StyleMount />
      <article className="df-card">
        <header className="df-header">
          <div>
            <h3 className="df-header-title">
              <StatusDot tone={tone} />
              {title}
            </h3>
            {subtitle ? <p className="df-header-subtitle">{subtitle}</p> : null}
          </div>
          {actions}
        </header>
        <Disclaimer />
        {children}
      </article>
    </div>
  );
}

function Disclaimer() {
  return (
    <div className="df-disclaimer">
      <StatusDot tone="info" />
      {DISCLAIMER}
    </div>
  );
}

function LoadingCard({ title }: { title: string }) {
  return (
    <Card title={title} subtitle="正在加载 Dark Factory 投影数据" tone="info">
      <div className="df-skeleton-stack" aria-busy="true">
        <div className="df-skeleton" />
        <div className="df-skeleton" />
        <div className="df-skeleton" />
      </div>
    </Card>
  );
}

function ErrorCard({ title, message }: { title: string; message: string }) {
  return (
    <Card title={title} tone="error">
      <div role="alert" className="df-alert error">{message}</div>
    </Card>
  );
}

function Metric({ label, value, tone = "info" }: { label: string; value: string | number; tone?: Tone }) {
  return (
    <div className="df-metric">
      <span className="df-metric-label">
        <StatusDot tone={tone} />
        {label}
      </span>
      <strong className="df-metric-value">{value}</strong>
    </div>
  );
}

function ProjectionMetrics({ data }: { data: ProjectionSummary }) {
  return (
    <div className="df-summary-grid">
      <Metric label="投影状态" value={displayValue(data.projection.projectionStatus)} tone={statusTone(data.projection.projectionStatus)} />
      <Metric label="Provider 状态" value={displayValue(data.providerHealth.providerState)} tone={statusTone(data.providerHealth.providerState)} />
      <Metric label="熔断器" value={displayValue(data.providerHealth.breakerState)} tone={statusTone(data.providerHealth.breakerState)} />
      <Metric label="最后序号" value={data.projection.lastSequenceNo} tone="info" />
    </div>
  );
}

function ProjectionSection({ data, defaultOpen = true }: { data: ProjectionSummary; defaultOpen?: boolean }) {
  const projection = data.projection;
  return (
    <Section title="运行投影" tone={statusTone(projection.projectionStatus)} summary={String(displayValue(projection.projectionStatus))} defaultOpen={defaultOpen}>
      <Row label="关联 Run ID" value={projection.linkedRunId} />
      <Row label="Journal 游标" value={projection.journalCursorMetadata.journalCursor} />
      <Row label="来源 Journal 引用" value={projection.journalCursorMetadata.sourceJournalRef} />
      <Row label="最后序号" value={projection.lastSequenceNo} />
      <Row label="投影状态" value={displayValue(projection.projectionStatus)} />
      <Row label="回调 receipt" value={projection.callbackReceiptId} />
      <Row label="receipt 状态" value={displayValue(projection.callbackReceipt.status)} />
      <Row label="最后更新" value={projection.lastUpdatedAt} />
      <div className="df-badge-list">
        <Badge label="降级" tone="warning" active={projection.flags.degraded} reason={projection.degradedReason} />
        <Badge label="阻断" tone="blocked" active={projection.flags.blocked} reason={projection.blockedReason} />
        <Badge label="过期" tone="warning" active={projection.flags.stale} reason={projection.staleReason} />
        <Badge label="需要审批" tone="info" active={projection.flags.needsApproval} />
      </div>
    </Section>
  );
}

function ProviderHealthSection({ data, defaultOpen = true }: { data: ProjectionSummary; defaultOpen?: boolean }) {
  return (
    <Section title="Provider 健康" tone={statusTone(data.providerHealth.providerState)} summary={`${displayValue(data.providerHealth.providerState)} / ${displayValue(data.runtimeImpact.severity)}`} defaultOpen={defaultOpen}>
      <Row label="Provider 角色" value={displayValue(data.providerHealth.providerRole)} />
      <Row label="模型角色" value={displayValue(data.providerHealth.modelRole)} />
      <Row label="模型策略" value={displayValue(data.providerHealth.modelSelection.policy)} />
      <Row label="协议必须指定具体模型" value={data.providerHealth.modelSelection.protocolMustSpecifyConcreteModel} />
      <Row label="熔断器状态" value={displayValue(data.providerHealth.breakerState)} />
      <Row label="Provider 状态" value={displayValue(data.providerHealth.providerState)} />
      <Row label="运行时影响" value={`${displayValue(data.runtimeImpact.mode)} / ${displayValue(data.runtimeImpact.severity)}`} />
      <Row label="操作员动作" value={displayValue(data.runtimeImpact.operatorAction)} />
      <Row label="Paperclip 终态" value={displayValue(data.runtimeImpact.paperclipTerminalState)} />
      <Row label="是否推进终态" value={data.runtimeImpact.terminalStateAdvanced} />
      <Row label="最后更新" value={data.providerHealth.lastUpdatedAt} />
      <Row label="最后成功" value={optionalText(data.providerHealth.lastSuccessAt)} />
      <Row label="最后失败" value={optionalText(data.providerHealth.lastFailureAt)} />
      <Row label="打开原因" value={optionalText(data.providerHealth.openReason)} />
      <div className="df-badge-list">
        <Badge label="Provider 降级" tone="warning" active={data.providerHealth.degraded} reason={data.providerHealth.degradedReason} />
        <Badge label="Provider 阻断" tone="blocked" active={data.providerHealth.blocked} reason={data.providerHealth.blockedReason} />
        <Badge label="已触发 fallback" tone="info" active={data.providerHealth.fallbackTriggered} reason={data.providerHealth.fallbackReason} />
      </div>
    </Section>
  );
}

function RemoteObservabilitySection({ data }: { data: RemoteObservabilitySnapshot }) {
  const snapshot = data.snapshot;
  const tone = data.alerts.some((alert) => alert.severity === "critical") ? "blocked" : data.alerts.length > 0 ? "warning" : "healthy";
  return (
    <Section title="远程 Provider 可观测性" tone={tone} summary={`${data.sampledObservationCount} 条采样，${data.alerts.length} 个告警`} defaultOpen={false}>
      <Row label="采样观测数" value={data.sampledObservationCount} />
      <Row label="请求数" value={snapshot.requestCount} />
      <Row label="成功 / 失败" value={`${snapshot.successCount} / ${snapshot.failureCount}`} />
      <Row label="重试 / 可重试失败" value={`${snapshot.retryCount} / ${snapshot.retryableFailureCount}`} />
      <Row label="平均延迟" value={`${snapshot.averageLatencyMs}ms`} />
      <Row label="最大延迟" value={`${snapshot.maxLatencyMs}ms`} />
      <Row label="最新序号" value={optionalUnknownText(snapshot.latestSequenceNo)} />
      <Row label="游标滞后" value={optionalUnknownText(snapshot.cursorLag)} />
      <Row label="最新 Journal 游标" value={optionalText(snapshot.latestJournalCursor)} />
      <Row label="最新错误" value={optionalText(snapshot.latestErrorCode)} />
      <Row label="失败分类" value={Object.entries(snapshot.failureClassCounts).map(([key, value]) => `${displayValue(key)}:${value}`).join(" ")} />
      {data.alerts.length > 0 ? data.alerts.map((alert) => (
        <div key={alert.code} role="status" className={`df-alert ${alert.severity === "critical" ? "error" : "warning"}`}>
          {displayValue(alert.code)}：{alert.message}；分类：{displayValue(alert.failureClass)}；级别：{displayValue(alert.severity)}
        </div>
      )) : (
        <div className="df-alert info">当前采样窗口内没有远程 Provider 告警候选。</div>
      )}
      <Row label="是否推进终态" value={snapshot.terminalStateAdvanced} />
    </Section>
  );
}

function RemoteCredentialDiagnosticsSection({ data }: { data: RemoteCredentialDiagnostics }) {
  return (
    <Section title="远程凭据诊断" tone={data.ok ? "healthy" : "warning"} summary={data.ok ? "就绪" : "需要处理"} defaultOpen={false}>
      <Row label="状态" value={data.ok ? "就绪" : "需要处理"} />
      <Row label="凭据来源" value={optionalText(data.credentialSource)} />
      <Row label="已提供配置" value={data.checkedConfig.configSupplied} />
      <Row label="已配置 endpoint" value={data.checkedConfig.endpointPresent} />
      <Row label="已配置内联 key" value={data.checkedConfig.apiKeyPresent} />
      <Row label="已配置 secret 引用" value={data.checkedConfig.apiKeySecretRefPresent} />
      <Row label="secret 引用 scheme" value={data.checkedConfig.apiKeySecretRefScheme} />
      {data.diagnostics.map((diagnostic) => (
        <div key={diagnostic.code} role="status" className={`df-alert ${diagnostic.severity === "error" ? "error" : diagnostic.severity === "warning" ? "warning" : "info"}`}>
          <div>{displayValue(diagnostic.code)}：{diagnostic.message}</div>
          {diagnostic.remediation.length > 0 ? (
            <ul className="df-list">
              {diagnostic.remediation.map((hint) => <li key={hint}>{hint}</li>)}
            </ul>
          ) : null}
        </div>
      ))}
      <Row label="是否推进终态" value={data.terminalStateAdvanced} />
    </Section>
  );
}

function RemoteBreakerSection({ data }: { data: RemoteBreakerEvaluation }) {
  return (
    <Section title="远程熔断器" tone={statusTone(data.breakerState)} summary={String(displayValue(data.breakerState))} defaultOpen={false}>
      <Row label="当前状态" value={displayValue(data.breakerState)} />
      <Row label="上一状态" value={displayValue(data.previousBreakerState)} />
      <Row label="连续失败" value={data.consecutiveFailures} />
      <Row label="半开成功" value={data.consecutiveHalfOpenSuccesses} />
      <Row label="最后失败分类" value={displayValue(data.lastFailureClass)} />
      <Row label="打开原因" value={optionalText(data.openReason)} />
      <Row label="打开时间" value={optionalText(data.openedAt)} />
      <Row label="冷却到" value={optionalText(data.cooldownUntil)} />
      <Row label="运行时影响" value={`${displayValue(data.runtimeImpact.mode)} / ${displayValue(data.runtimeImpact.severity)}`} />
      <Row label="操作员动作" value={displayValue(data.runtimeImpact.operatorAction)} />
      <Row label="是否推进终态" value={data.terminalStateAdvanced} />
    </Section>
  );
}

function RemoteReadinessSection({ data }: { data: RemoteProviderReadiness }) {
  return (
    <Section title="远程 Provider 就绪状态" tone={statusTone(data.readinessStatus)} summary={String(displayValue(data.readinessStatus))}>
      <div className={`df-alert ${data.readinessStatus === "blocked" ? "error" : data.readinessStatus === "needs_attention" ? "warning" : "info"}`}>
        {data.summary}
      </div>
      <Row label="状态" value={displayValue(data.readinessStatus)} />
      <Row label="凭据正常" value={data.credentialOk} />
      <Row label="熔断器状态" value={displayValue(data.breakerState)} />
      <Row label="采样观测数" value={data.sampledObservationCount} />
      <Row label="告警数" value={data.alertCount} />
      <Row label="建议动作" value={displayValue(data.recommendedAction)} />
      <Row label="下一安全 hook" value={data.nextSafeHook} />
      <Row label="检查时间" value={data.checkedAt} />
      <Row label="就绪 receipt" value={data.readinessReceipt.receiptId} />
      <Row label="证据 digest" value={`${data.readinessReceipt.digestAlgorithm}:${data.readinessReceipt.digest}`} />
      <Row label="授权远程执行" value={data.readinessReceipt.doesAuthorizeRemoteExecution} />
      <Row label="状态转换" value={displayValue(data.readinessTransition.transitionKind)} />
      <Row label="转换摘要" value={data.readinessTransition.summary} />
      <Row label="上一状态" value={displayValue(data.readinessTransition.previousStatus)} />
      <Row label="当前状态" value={displayValue(data.readinessTransition.currentStatus)} />
      <Row label="上一 hook" value={optionalText(data.readinessTransition.previousNextSafeHook)} />
      <Row label="当前 hook" value={data.readinessTransition.currentNextSafeHook} />
      <Row label="receipt 已变化" value={data.readinessTransition.receiptChanged} />
      <Section title="预检计划" tone="info" summary={`${data.preflightPlan.length} 个 hook`} defaultOpen={false}>
        {data.preflightPlan.map((step) => (
          <div key={step.code} role="status" className={`df-alert ${step.status === "blocked" ? "error" : step.status === "review_required" ? "warning" : "info"}`}>
            <div>{step.label}: {displayValue(step.status)}</div>
            <Row label="Hook" value={step.hook} />
            <div>{step.message}</div>
            {step.blockingCodes.length > 0 ? <div>阻断代码 <span className="df-code">{displayList(step.blockingCodes)}</span></div> : null}
          </div>
        ))}
      </Section>
      <Section title="就绪清单" tone="info" summary={`${data.readinessChecklist.length} 项`} defaultOpen={false}>
        {data.readinessChecklist.map((item) => (
          <div key={item.code} role="status" className={`df-alert ${item.status === "fail" ? "error" : item.status === "warn" ? "warning" : "info"}`}>
            <div>{item.label}: {displayValue(item.status)}</div>
            <div>{item.message}</div>
            <div>要求早于 <span className="df-code">{item.requiredBefore}</span></div>
          </div>
        ))}
      </Section>
      <Section title="信号" tone="info" summary={`${data.signals.length} 条`} defaultOpen={false}>
        {data.signals.map((signal) => (
          <div key={`${signal.category}:${signal.code}`} role="status" className={`df-alert ${signal.severity === "critical" ? "error" : signal.severity === "warning" ? "warning" : "info"}`}>
            <div>{displayValue(signal.category)} / {displayValue(signal.code)}：{signal.message}</div>
            {signal.remediation.length > 0 ? (
              <ul className="df-list">
                {signal.remediation.map((hint) => <li key={hint}>{hint}</li>)}
              </ul>
            ) : null}
          </div>
        ))}
      </Section>
      <Row label="是否推进终态" value={data.terminalStateAdvanced} />
    </Section>
  );
}

function UiSmokePreviewSection({
  data,
  scenario,
  onScenarioChange,
}: {
  data: UiSmokePreview;
  scenario: UiSmokePreviewScenario;
  onScenarioChange: (scenario: UiSmokePreviewScenario) => void;
}) {
  const executeGuard = data.dryRunGuards.find((guard) => guard.targetHook === "onEnvironmentExecute");
  return (
    <Section title="UI 烟雾预览" tone={statusTone(data.previewStatus)} summary={String(displayValue(data.previewStatus))}>
      <div className="df-pill-tabs" role="tablist" aria-label="UI 烟雾预览场景">
        {uiSmokePreviewScenarios.map((item) => (
          <button
            key={item.value}
            type="button"
            className={`df-pill-tab ${scenario === item.value ? "active" : ""}`}
            onClick={() => onScenarioChange(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className={`df-alert ${data.previewStatus === "blocked" ? "error" : data.previewStatus === "needs_attention" ? "warning" : "info"}`}>
        {data.readiness.summary}
      </div>
      <Row label="预览状态" value={displayValue(data.previewStatus)} />
      <Row label="Host 上下文" value={data.hostContextId} />
      <Row label="就绪状态" value={displayValue(data.readiness.readinessStatus)} />
      <Row label="下一安全 hook" value={data.readiness.nextSafeHook} />
      <Row label="熔断器状态" value={displayValue(data.breakerEvaluation.breakerState)} />
      <Row label="采样观测数" value={data.observability.sampledObservationCount} />
      <Row label="最大延迟" value={`${data.observability.snapshot.maxLatencyMs}ms`} />
      <Row label="游标滞后" value={optionalUnknownText(data.observability.snapshot.cursorLag)} />
      <Row label="告警数" value={data.observability.alerts.length} />
      <Row label="凭据来源" value={optionalText(data.credentialDiagnostics.credentialSource)} />
      <Row label="执行 dry-run" value={displayValue(executeGuard?.decision)} />
      <Row label="Dry-run 回执" value={optionalText(executeGuard?.receiptId)} />
      <Row label="事实来源" value={data.truthSource} />
      <Row label="是否权威" value={data.authoritative} />
      <Row label="是否推进终态" value={data.terminalStateAdvanced} />
      <Section title="远程 Provider Dry-run 防护" tone={statusTone(executeGuard?.decision)} summary="shouldContactRemoteProvider / doesAuthorizeRemoteExecution 固定 false" defaultOpen={false}>
        {data.dryRunGuards.map((guard) => (
          <div key={guard.targetHook} role="status" className={`df-alert ${guard.decision === "blocked" ? "error" : guard.decision === "review_required" ? "warning" : "info"}`}>
            <Row label={guard.targetHook} value={displayValue(guard.decision)} />
            <Row label="预检状态" value={displayValue(guard.matchedPreflightStatus)} />
            <Row label="shouldContactRemoteProvider" value={guard.shouldContactRemoteProvider} />
            <Row label="doesAuthorizeRemoteExecution" value={guard.doesAuthorizeRemoteExecution} />
            <Row label="Receipt" value={guard.receiptId} />
            {guard.blockingCodes.length > 0 ? <div>阻断代码 <span className="df-code">{displayList(guard.blockingCodes)}</span></div> : null}
          </div>
        ))}
      </Section>
      <div className="df-badge-list">
        {data.uiBadges.map((badge) => <Badge key={badge} label={translatedBadge(badge)} tone={statusTone(badge)} />)}
      </div>
    </Section>
  );
}

export function DashboardWidget({ context }: PluginWidgetProps) {
  const { data, loading, error } = usePluginData<ProjectionSummary>("projection-summary", {
    companyId: context.companyId,
  });

  if (loading) return <LoadingCard title="Dark Factory Bridge 投影" />;
  if (error) return <ErrorCard title="Dark Factory Bridge 错误" message={error.message} />;
  if (!data) return null;

  return (
    <Card title="Dark Factory Bridge 投影" subtitle="Provider 健康与 Journal 游标的非权威摘要" tone={statusTone(data.providerHealth.providerState)}>
      <ProjectionMetrics data={data} />
      <ProjectionSection data={data} defaultOpen={false} />
      <ProviderHealthSection data={data} defaultOpen={false} />
    </Card>
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

  if (loading) return <LoadingCard title="Dark Factory 投影" />;
  if (error) return <ErrorCard title="Dark Factory Bridge 错误" message={error.message} />;
  if (!data) return null;

  return (
    <Card
      title="Dark Factory 投影"
      subtitle="任务详情页中的 Journal-backed projection 视图"
      tone={statusTone(data.projection.projectionStatus)}
      actions={(
        <button
          type="button"
          className="df-btn df-btn-primary"
          title="只提交 receipt 级重放意图，不代表终态成功。"
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
          {rehydratePending ? "请求中..." : "请求重新水合"}
        </button>
      )}
    >
      <div className="df-alert info">重新水合请求只提交一个意图 receipt；不会推进终态成功，也不会让该投影变成权威记录。</div>
      {rehydrateError ? <div role="alert" className="df-alert error">重新水合请求失败：{rehydrateError}</div> : null}
      <ProjectionMetrics data={data} />
      <ProjectionSection data={data} />
      <ProviderHealthSection data={data} />
    </Card>
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

  if (loading) return <LoadingCard title="Dark Factory Bridge 设置" />;
  if (error) return <ErrorCard title="Dark Factory Bridge 设置错误" message={error.message} />;
  if (!data) return null;

  return (
    <Card title="Dark Factory Bridge 设置" subtitle="Mock、HTTP 与远程 Provider alpha 状态面板" tone={statusTone(remoteReadiness?.readinessStatus ?? data.providerHealth.providerState)}>
      <div className="df-alert info">Mock 投影模式不会保存 token 或 secret。远程模式只显示凭据引用和诊断结果，不展示凭据值。</div>
      <ProjectionMetrics data={data} />
      <div className="df-settings-grid">
        <div>
          <ProjectionSection data={data} defaultOpen={false} />
          <ProviderHealthSection data={data} defaultOpen={false} />
        </div>
        <div>
          {uiSmokePreviewLoading ? <div className="df-alert info">正在加载 UI 烟雾预览...</div> : null}
          {uiSmokePreviewError ? <div className="df-alert error">UI 烟雾预览错误：{uiSmokePreviewError.message}</div> : null}
          {uiSmokePreview ? (
            <UiSmokePreviewSection
              data={uiSmokePreview}
              scenario={uiSmokePreviewScenario}
              onScenarioChange={setUiSmokePreviewScenario}
            />
          ) : null}
        </div>
        <div>
          {remoteReadinessLoading ? <div className="df-alert info">正在加载远程 Provider 就绪状态...</div> : null}
          {remoteReadinessError ? <div className="df-alert error">远程 Provider 就绪状态错误：{remoteReadinessError.message}</div> : null}
          {remoteReadiness ? <RemoteReadinessSection data={remoteReadiness} /> : null}
        </div>
        <div>
          {remoteCredentialDiagnosticsLoading ? <div className="df-alert info">正在加载远程凭据诊断...</div> : null}
          {remoteCredentialDiagnosticsError ? <div className="df-alert error">远程凭据诊断错误：{remoteCredentialDiagnosticsError.message}</div> : null}
          {remoteCredentialDiagnostics ? <RemoteCredentialDiagnosticsSection data={remoteCredentialDiagnostics} /> : null}
          {remoteBreakerLoading ? <div className="df-alert info">正在加载远程熔断器...</div> : null}
          {remoteBreakerError ? <div className="df-alert error">远程熔断器错误：{remoteBreakerError.message}</div> : null}
          {remoteBreaker ? <RemoteBreakerSection data={remoteBreaker} /> : null}
          {remoteObservabilityLoading ? <div className="df-alert info">正在加载远程 Provider 可观测性...</div> : null}
          {remoteObservabilityError ? <div className="df-alert error">远程可观测性错误：{remoteObservabilityError.message}</div> : null}
          {remoteObservability ? <RemoteObservabilitySection data={remoteObservability} /> : null}
        </div>
      </div>
    </Card>
  );
}
