import { useEffect, useState, type ReactNode } from "react";
import {
  usePluginAction,
  usePluginData,
  type PluginDetailTabProps,
  type PluginSettingsPageProps,
  type PluginWidgetProps,
} from "@paperclipai/plugin-sdk/ui";
import "./styles.css";

const DISCLAIMER = "仅显示非权威投影，Dark Factory 日志仍是事实来源。";
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

function displayMessage(value: string | null | undefined): string {
  if (!value) return NONE_TEXT;
  return value
    .replace(/远程 Provider alpha/g, "远程提供方 alpha")
    .replace(/受控 probe/g, "受控探测")
    .replace(/\bProvider\b/g, "提供方")
    .replace(/\bJournal\b/g, "日志")
    .replace(/\bDry-run\b/g, "试运行")
    .replace(/\bdry-run\b/g, "试运行")
    .replace(/\breceipt\b/g, "回执")
    .replace(/\bfallback\b/g, "回退");
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
    retry_or_wait_for_provider_recovery: "重试或等待提供方恢复",
    pause_external_execution_and_reconcile_journal: "暂停外部执行并对齐日志",
    verify_fallback_projection_before_retry: "重试前验证 fallback 投影",
    unchanged: "未改变",
    primary_execution: "主执行提供方",
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
    journal_boundary: "日志边界",
    remote: "远程",
    none: "无",
    transient_provider: "提供方暂时异常",
    provider_unavailable: "提供方不可用",
    quota_exceeded: "配额已耗尽",
    runtime_blocked: "运行时已阻断",
    runtime_observation: "运行时观测",
    dark_factory_remote_preflight_validate_config: "远程预检：校验配置",
    dark_factory_remote_preflight_probe: "远程预检：探测提供方",
    dark_factory_remote_preflight_acquire_lease: "远程预检：获取租约",
    dark_factory_remote_preflight_execute: "远程预检：执行",
    dark_factory_remote_readiness_credentials: "远程就绪：凭据",
    dark_factory_remote_readiness_observability: "远程就绪：可观测性",
    dark_factory_remote_readiness_breaker: "远程就绪：熔断器",
    dark_factory_remote_readiness_journal_boundary: "远程就绪：日志边界",
    dark_factory_remote_credential_ready: "远程凭据已就绪",
    dark_factory_remote_credential_config_not_supplied: "未提供远程凭据配置",
    dark_factory_remote_credential_missing: "缺少远程凭据",
    dark_factory_remote_credential_host_secret_ref_ready: "Host 托管 secret 引用已就绪",
    dark_factory_remote_credential_host_secret_ref_pending_runtime_resolution: "Host 托管 secret 引用等待运行时注入",
    dark_factory_remote_credential_ref_unsupported: "不支持的 secret 引用",
    dark_factory_remote_credential_unresolved: "secret 引用未解析",
    dark_factory_remote_no_sampled_observations: "尚无远程提供方采样观测",
    dark_factory_remote_observability_clear: "远程提供方可观测性正常",
    dark_factory_remote_error_rate_high: "远程提供方错误率过高",
    dark_factory_remote_latency_high: "远程提供方延迟过高",
    dark_factory_remote_cursor_lag_high: "远程提供方日志游标滞后过高",
    dark_factory_remote_breaker_open: "远程提供方熔断器打开",
    dark_factory_remote_breaker_half_open: "远程提供方熔断器半开",
    dark_factory_remote_breaker_closed: "远程提供方熔断器关闭",
    journal_truth_source: "日志是事实来源",
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
  if (value === "journal-truth-source") return "日志是事实来源 (journal-truth-source)";
  if (value === "execute-allowed") return "允许执行 (execute-allowed)";
  if (value.startsWith("next:")) return `下一安全 hook: ${value.slice(5)} (${value})`;
  if (value.startsWith("breaker:")) return `熔断器: ${displayValue(value.slice(8))} (${value})`;
  if (value.startsWith("alerts:")) return `告警数: ${value.slice(7)} (${value})`;
  return String(displayValue(value));
}

function statusTone(value: string | null | undefined): Color {
  if (!value) return "muted";
  return getStatusColor(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "未知错误";
}

type Color = "green" | "red" | "amber" | "blue" | "purple" | "muted";

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

function getStatusColor(value: string | null | undefined): Color {
  const normalized = String(value ?? "").toLowerCase();
  if (!normalized) return "muted";
  if (normalized === "blocked" || normalized.includes("runtime_blocked")) return "purple";
  if (["ready", "pass", "closed", "allowed", "available", "healthy", "clear", "execute_allowed", "current"].some((item) => normalized.includes(item))) return "green";
  if (["error", "failed", "fail", "open", "critical"].some((item) => normalized.includes(item))) return "red";
  if (["degraded", "warning", "warn", "half_open", "review_required", "stale", "needs_attention"].some((item) => normalized.includes(item))) return "amber";
  if (["info", "observed", "requested", "remote"].some((item) => normalized.includes(item))) return "blue";
  return "muted";
}

function alertClass(color: Color): string {
  if (color === "red") return "df-alert df-alert--error";
  if (color === "amber" || color === "purple") return "df-alert df-alert--warning";
  return "df-alert df-alert--info";
}

function checkStatusFromValue(value: string | boolean | null | undefined): "pass" | "warn" | "fail" {
  if (typeof value === "boolean") return value ? "pass" : "fail";
  const color = getStatusColor(value);
  if (color === "red" || color === "purple") return "fail";
  if (color === "amber") return "warn";
  return "pass";
}

function Dot({ color = "green", pulse = false }: { color?: Color; pulse?: boolean }) {
  return <span className={`df-dot df-dot--${color}${pulse ? " df-dot--pulse" : ""}`} aria-hidden="true" />;
}

function Badge({
  children,
  color = "green",
  active = true,
}: {
  children: ReactNode;
  color?: Color;
  active?: boolean;
}) {
  if (!active) return null;
  return <span className={`df-badge df-badge--${color}`}>{children}</span>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="df-row">
      <span className="df-label">{label}</span>
      <span className="df-value">{children}</span>
    </div>
  );
}

function ValueRow({ label, value }: { label: string; value: string | number | boolean | null | undefined }) {
  return (
    <Row label={label}>
      {typeof value === "boolean" ? yesNo(value) : optionalText(value)}
    </Row>
  );
}

function CheckItem({
  label,
  status,
  statusLabel,
}: {
  label: string;
  status: "pass" | "warn" | "fail";
  statusLabel: string;
}) {
  const icon = status === "pass" ? "✓" : status === "warn" ? "!" : "×";
  const color = status === "pass" ? "green" : status === "warn" ? "amber" : "red";
  return (
    <div className="df-check">
      <span className="df-check-label">
        <span className={`df-check-icon df-check-icon--${status}`}>{icon}</span>
        {label}
      </span>
      <Badge color={color}>{statusLabel}</Badge>
    </div>
  );
}

function Skeleton({ lines = 3 }: { lines?: number }) {
  const widths = ["df-skeleton--w1", "df-skeleton--w2", "df-skeleton--w3", "df-skeleton--w4"];
  return (
    <div className="df-skeleton-stack" aria-busy="true">
      {Array.from({ length: lines }, (_, index) => (
        <div key={index} className={`df-skeleton ${widths[index % widths.length]}`} />
      ))}
    </div>
  );
}

function Root({ children }: { children: ReactNode }) {
  return (
    <div className="df-root">
      <StyleMount />
      {children}
    </div>
  );
}

function Header({
  title = "Dark Factory Bridge",
  subtitle = "仅投影 · 日志为事实来源 · 非权威",
  actions,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="df-header">
      <div className="df-title-block">
        <h3 className="df-title">
          {title}
          <span className="df-online">
            <Dot color="green" pulse />
            在线
          </span>
        </h3>
        <p className="df-subtitle">{subtitle}</p>
      </div>
      {actions ? <div className="df-header-actions">{actions}</div> : null}
    </header>
  );
}

function DataCard({
  title,
  color = "blue",
  badge,
  children,
}: {
  title: string;
  color?: Color;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="df-card">
      <div className="df-card-header">
        <h4 className="df-card-title">
          <Dot color={color} />
          {title}
        </h4>
        {badge}
      </div>
      <div className="df-card-body">{children}</div>
    </div>
  );
}

function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="df-section">
      <button
        type="button"
        className="df-section-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{title}</span>
        <span className={`df-chevron${open ? " df-chevron--open" : ""}`}>▶</span>
      </button>
      {open ? <div className="df-section-body">{children}</div> : null}
    </div>
  );
}

function LoadingCard({ title }: { title: string }) {
  return (
    <Root>
      <DataCard title={title} color="blue">
        <p className="df-disclaimer">正在加载 Dark Factory 投影数据</p>
        <Skeleton lines={4} />
      </DataCard>
    </Root>
  );
}

function ErrorCard({ title, message }: { title: string; message: string }) {
  return (
    <Root>
      <DataCard title={title} color="red">
        <div role="alert" className="df-alert df-alert--error">{message}</div>
      </DataCard>
    </Root>
  );
}

function StatusCard({ title, color, message }: { title: string; color: Color; message: ReactNode }) {
  return (
    <DataCard title={title} color={color}>
      {typeof message === "string" ? <div className={alertClass(color)}>{message}</div> : message}
    </DataCard>
  );
}

function LoadingDataCard({ title }: { title: string }) {
  return <DataCard title={title} color="blue"><Skeleton lines={4} /></DataCard>;
}

function ProjectionCard({ data }: { data: ProjectionSummary }) {
  const projection = data.projection;
  const color = statusTone(projection.projectionStatus);
  return (
    <DataCard
      title="投影状态"
      color={color}
      badge={<Badge color={color}>{displayValue(projection.projectionStatus)}</Badge>}
    >
      <ValueRow label="运行 ID" value={projection.runId} />
      <ValueRow label="关联 Run" value={projection.linkedRunId} />
      <ValueRow label="日志游标" value={projection.journalCursorMetadata.journalCursor} />
      <ValueRow label="序列号" value={projection.lastSequenceNo} />
      <ValueRow label="回调回执" value={projection.callbackReceiptId} />
      <ValueRow label="最后更新" value={projection.lastUpdatedAt} />
      <div className="df-badge-list">
        <Badge color="amber" active={projection.flags.degraded}>降级 {projection.degradedReason ? `· ${projection.degradedReason}` : ""}</Badge>
        <Badge color="purple" active={projection.flags.blocked}>阻断 {projection.blockedReason ? `· ${projection.blockedReason}` : ""}</Badge>
        <Badge color="amber" active={projection.flags.stale}>过期 {projection.staleReason ? `· ${projection.staleReason}` : ""}</Badge>
        <Badge color="blue" active={projection.flags.needsApproval}>需要审批</Badge>
      </div>
    </DataCard>
  );
}

function ProviderCard({ data }: { data: ProjectionSummary }) {
  const provider = data.providerHealth;
  const color = statusTone(provider.providerState);
  return (
    <DataCard
      title="提供方"
      color={color}
      badge={<Badge color={color}>{displayValue(provider.providerState)}</Badge>}
    >
      <ValueRow label="提供方角色" value={displayValue(provider.providerRole)} />
      <ValueRow label="模型角色" value={displayValue(provider.modelRole)} />
      <ValueRow label="模型策略" value={displayValue(provider.modelSelection.policy)} />
      <ValueRow label="熔断器" value={displayValue(provider.breakerState)} />
      <ValueRow label="最后成功" value={optionalText(provider.lastSuccessAt)} />
      <ValueRow label="最后失败" value={optionalText(provider.lastFailureAt)} />
      <ValueRow label="终态推进" value={data.runtimeImpact.terminalStateAdvanced} />
      <div className="df-badge-list">
        <Badge color="amber" active={provider.degraded}>降级 {provider.degradedReason ? `· ${provider.degradedReason}` : ""}</Badge>
        <Badge color="purple" active={provider.blocked}>阻断 {provider.blockedReason ? `· ${provider.blockedReason}` : ""}</Badge>
        <Badge color="blue" active={provider.fallbackTriggered}>回退 {provider.fallbackReason ? `· ${displayMessage(provider.fallbackReason)}` : ""}</Badge>
      </div>
    </DataCard>
  );
}

function ReadinessCard({ data }: { data: RemoteProviderReadiness | null | undefined }) {
  if (!data) {
    return (
      <DataCard title="就绪检查" color="muted" badge={<Badge color="muted">暂无</Badge>}>
        <Skeleton lines={4} />
      </DataCard>
    );
  }
  return (
    <DataCard
      title="就绪检查"
      color={statusTone(data.readinessStatus)}
      badge={<Badge color={statusTone(data.readinessStatus)}>{displayValue(data.readinessStatus)}</Badge>}
    >
      <CheckItem label="凭据就绪" status={checkStatusFromValue(data.credentialOk)} statusLabel={data.credentialOk ? "通过" : "失败"} />
      <CheckItem label="熔断器" status={checkStatusFromValue(data.breakerState)} statusLabel={String(displayValue(data.breakerState))} />
      <CheckItem label="观测告警" status={data.alertCount === 0 ? "pass" : "warn"} statusLabel={`${data.alertCount} 个`} />
      <CheckItem label="下一安全 hook" status={checkStatusFromValue(data.nextSafeHook)} statusLabel={data.nextSafeHook} />
      <Section title="就绪详情">
      <div className={alertClass(statusTone(data.readinessStatus))}>{displayMessage(data.summary)}</div>
        <ValueRow label="建议动作" value={displayValue(data.recommendedAction)} />
        <ValueRow label="检查时间" value={data.checkedAt} />
        <ValueRow label="就绪 receipt" value={data.readinessReceipt.receiptId} />
        <ValueRow label="授权远程执行" value={data.readinessReceipt.doesAuthorizeRemoteExecution} />
      </Section>
    </DataCard>
  );
}

function GuardCard({ data }: { data: UiSmokePreview | null | undefined }) {
  const guards = data?.dryRunGuards ?? [];
  const executeGuard = guards.find((guard) => guard.targetHook === "onEnvironmentExecute");
  return (
    <DataCard
      title="防护门禁"
      color={statusTone(executeGuard?.decision)}
      badge={<Badge color={statusTone(executeGuard?.decision)}>{displayValue(executeGuard?.decision)}</Badge>}
    >
      {(guards.length > 0 ? guards.slice(0, 4) : []).map((guard) => (
        <CheckItem
          key={guard.targetHook}
          label={guard.targetHook}
          status={checkStatusFromValue(guard.decision)}
          statusLabel={String(displayValue(guard.decision))}
        />
      ))}
      {guards.length === 0 ? <Skeleton lines={4} /> : null}
      <Section title="远程提供方试运行防护">
        {guards.map((guard) => (
          <div key={guard.targetHook} className={alertClass(statusTone(guard.decision))}>
            <ValueRow label={guard.targetHook} value={displayValue(guard.decision)} />
            <ValueRow label="预检状态" value={displayValue(guard.matchedPreflightStatus)} />
            <ValueRow label="shouldContactRemoteProvider" value={guard.shouldContactRemoteProvider} />
            <ValueRow label="doesAuthorizeRemoteExecution" value={guard.doesAuthorizeRemoteExecution} />
            <ValueRow label="试运行回执" value={guard.receiptId} />
            {guard.blockingCodes.length > 0 ? <div>阻断代码 <span className="df-code">{displayList(guard.blockingCodes)}</span></div> : null}
          </div>
        ))}
      </Section>
    </DataCard>
  );
}

function StaticGuardCard({ data }: { data: ProjectionSummary }) {
  return (
    <DataCard title="防护门禁" color={statusTone(data.runtimeImpact.operatorAction)} badge={<Badge color={statusTone(data.runtimeImpact.operatorAction)}>{displayValue(data.runtimeImpact.operatorAction)}</Badge>}>
      <CheckItem label="日志事实来源" status="pass" statusLabel="通过" />
      <CheckItem label="投影非权威" status={data.authoritative ? "fail" : "pass"} statusLabel={data.authoritative ? "失败" : "通过"} />
      <CheckItem label="终态不推进" status={data.runtimeImpact.terminalStateAdvanced ? "fail" : "pass"} statusLabel={yesNo(data.runtimeImpact.terminalStateAdvanced)} />
      <CheckItem label="提供方动作" status={checkStatusFromValue(data.runtimeImpact.operatorAction)} statusLabel={String(displayValue(data.runtimeImpact.operatorAction))} />
    </DataCard>
  );
}

function CredentialCard({ data }: { data: RemoteCredentialDiagnostics }) {
  return (
    <DataCard
      title="凭据诊断"
      color={data.ok ? "green" : "amber"}
      badge={<Badge color={data.ok ? "green" : "amber"}>{data.ok ? "就绪" : "需要处理"}</Badge>}
    >
      <ValueRow label="凭据来源" value={optionalText(data.credentialSource)} />
      <ValueRow label="已提供配置" value={data.checkedConfig.configSupplied} />
      <ValueRow label="已配置 endpoint" value={data.checkedConfig.endpointPresent} />
      <ValueRow label="已配置 secret 引用" value={data.checkedConfig.apiKeySecretRefPresent} />
      <ValueRow label="secret 引用 scheme" value={data.checkedConfig.apiKeySecretRefScheme} />
      <ValueRow label="是否推进终态" value={data.terminalStateAdvanced} />
      <Section title="诊断建议">
        {data.diagnostics.length > 0 ? data.diagnostics.map((diagnostic) => (
          <div key={diagnostic.code} className={alertClass(getStatusColor(diagnostic.severity))}>
            <div>{displayValue(diagnostic.code)}：{diagnostic.message}</div>
            {diagnostic.remediation.length > 0 ? (
              <ul className="df-list">
                {diagnostic.remediation.map((hint) => <li key={hint}>{hint}</li>)}
              </ul>
            ) : null}
          </div>
        )) : <div className="df-alert df-alert--info">当前没有凭据诊断提示。</div>}
      </Section>
    </DataCard>
  );
}

function BreakerCard({ data }: { data: RemoteBreakerEvaluation }) {
  const color = statusTone(data.breakerState);
  return (
    <DataCard title="熔断器" color={color} badge={<Badge color={color}>{displayValue(data.breakerState)}</Badge>}>
      <ValueRow label="上一状态" value={displayValue(data.previousBreakerState)} />
      <ValueRow label="连续失败" value={data.consecutiveFailures} />
      <ValueRow label="半开成功" value={data.consecutiveHalfOpenSuccesses} />
      <ValueRow label="最后失败分类" value={displayValue(data.lastFailureClass)} />
      <ValueRow label="打开原因" value={optionalText(data.openReason)} />
      <ValueRow label="冷却到" value={optionalText(data.cooldownUntil)} />
      <ValueRow label="是否推进终态" value={data.terminalStateAdvanced} />
    </DataCard>
  );
}

function ObservabilityCard({ data }: { data: RemoteObservabilitySnapshot }) {
  const snapshot = data.snapshot;
  const color = data.alerts.some((alert) => alert.severity === "critical") ? "red" : data.alerts.length > 0 ? "amber" : "green";
  return (
    <DataCard title="可观测性" color={color} badge={<Badge color={color}>{data.alerts.length} 告警</Badge>}>
      <ValueRow label="采样观测" value={data.sampledObservationCount} />
      <ValueRow label="成功 / 失败" value={`${snapshot.successCount} / ${snapshot.failureCount}`} />
      <ValueRow label="重试" value={snapshot.retryCount} />
      <ValueRow label="平均延迟" value={`${snapshot.averageLatencyMs}ms`} />
      <ValueRow label="最大延迟" value={`${snapshot.maxLatencyMs}ms`} />
      <ValueRow label="游标滞后" value={optionalUnknownText(snapshot.cursorLag)} />
      <ValueRow label="是否推进终态" value={snapshot.terminalStateAdvanced} />
      <Section title="告警">
        {data.alerts.length > 0 ? data.alerts.map((alert) => (
          <div key={alert.code} className={alertClass(getStatusColor(alert.severity))}>
            {displayValue(alert.code)}：{alert.message}；分类：{displayValue(alert.failureClass)}
          </div>
        )) : <div className="df-alert df-alert--info">当前采样窗口内没有远程提供方告警候选。</div>}
      </Section>
    </DataCard>
  );
}

function UiSmokePreviewCard({
  data,
  scenario,
  onScenarioChange,
}: {
  data: UiSmokePreview | null | undefined;
  scenario: UiSmokePreviewScenario;
  onScenarioChange: (scenario: UiSmokePreviewScenario) => void;
}) {
  const executeGuard = data?.dryRunGuards.find((guard) => guard.targetHook === "onEnvironmentExecute");
  return (
    <div className="df-card df-card--full">
      <div className="df-card-header">
        <h4 className="df-card-title">
          <Dot color={statusTone(data?.previewStatus)} />
          UI 烟雾预览
        </h4>
        <Badge color={statusTone(data?.previewStatus)}>{displayValue(data?.previewStatus)}</Badge>
      </div>
      <div className="df-card-body">
        <div className="df-pills" role="tablist" aria-label="UI 烟雾预览场景">
          {uiSmokePreviewScenarios.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`df-pill${scenario === item.value ? " df-pill--active" : ""}`}
              onClick={() => onScenarioChange(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {data ? (
          <>
            <div className={alertClass(statusTone(data.previewStatus))}>{displayMessage(data.readiness.summary)}</div>
            <ValueRow label="预览状态" value={displayValue(data.previewStatus)} />
            <ValueRow label="主机上下文" value={data.hostContextId} />
            <ValueRow label="就绪状态" value={displayValue(data.readiness.readinessStatus)} />
            <ValueRow label="下一安全 hook" value={data.readiness.nextSafeHook} />
            <ValueRow label="执行试运行" value={displayValue(executeGuard?.decision)} />
            <ValueRow label="试运行回执" value={optionalText(executeGuard?.receiptId)} />
            <ValueRow label="事实来源" value={data.truthSource} />
            <ValueRow label="是否权威" value={data.authoritative} />
            <ValueRow label="是否推进终态" value={data.terminalStateAdvanced} />
            <div className="df-badge-list">
              {data.uiBadges.map((badge) => <Badge key={badge} color={getStatusColor(badge)}>{translatedBadge(badge)}</Badge>)}
            </div>
          </>
        ) : (
          <Skeleton lines={4} />
        )}
      </div>
    </div>
  );
}

export function DashboardWidget({ context }: PluginWidgetProps) {
  const { data, loading, error } = usePluginData<ProjectionSummary>("projection-summary", {
    companyId: context.companyId,
  });

  if (loading) return <LoadingCard title="Dark Factory Bridge" />;
  if (error) return <ErrorCard title="Dark Factory Bridge 错误" message={error.message} />;
  if (!data) return null;

  return (
    <Root>
      <Header />
      <p className="df-disclaimer">{DISCLAIMER}</p>
      <div className="df-grid">
        <ProjectionCard data={data} />
        <ProviderCard data={data} />
        <ReadinessCard data={null} />
        <StaticGuardCard data={data} />
      </div>
    </Root>
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

  if (loading) return <LoadingCard title="Dark Factory Bridge" />;
  if (error) return <ErrorCard title="Dark Factory Bridge 错误" message={error.message} />;
  if (!data) return null;

  return (
    <Root>
      <Header
        actions={(
          <button
            type="button"
            className="df-btn df-btn--action"
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
            {rehydratePending ? "请求中..." : "重新水合"}
          </button>
        )}
      />
      <p className="df-disclaimer">仅投影 · 日志为事实来源 · 非权威</p>
      <div className="df-alert df-alert--info">重新水合请求只提交一个意图 receipt；不会推进终态成功，也不会让该投影变成权威记录。</div>
      {rehydrateError ? <div role="alert" className="df-alert df-alert--error">重新水合请求失败：{rehydrateError}</div> : null}
      <div className="df-grid">
        <ProjectionCard data={data} />
        <ProviderCard data={data} />
      </div>
    </Root>
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

  if (loading) return <LoadingCard title="Dark Factory Bridge" />;
  if (error) return <ErrorCard title="Dark Factory Bridge 设置错误" message={error.message} />;
  if (!data) return null;

  return (
    <Root>
      <Header actions={<button type="button" className="df-btn" disabled>重新水合</button>} />
      <p className="df-disclaimer">仅投影 · 日志为事实来源 · 非权威</p>
      <div className="df-alert df-alert--info">Mock 投影模式不会保存 token 或 secret。远程模式只显示凭据引用和诊断结果，不展示凭据值。</div>
      <div className="df-settings-grid">
        <ProjectionCard data={data} />
        <ProviderCard data={data} />
        {remoteReadinessLoading ? <LoadingDataCard title="就绪检查" /> : <ReadinessCard data={remoteReadiness} />}
        {uiSmokePreviewLoading ? <LoadingDataCard title="防护门禁" /> : <GuardCard data={uiSmokePreview} />}
        {remoteCredentialDiagnosticsLoading ? <LoadingDataCard title="凭据诊断" /> : null}
        {remoteCredentialDiagnosticsError ? <StatusCard title="凭据诊断" color="red" message={`远程凭据诊断错误：${remoteCredentialDiagnosticsError.message}`} /> : null}
        {remoteCredentialDiagnostics ? <CredentialCard data={remoteCredentialDiagnostics} /> : null}
        {remoteBreakerLoading ? <LoadingDataCard title="熔断器" /> : null}
        {remoteBreakerError ? <StatusCard title="熔断器" color="red" message={`远程熔断器错误：${remoteBreakerError.message}`} /> : null}
        {remoteBreaker ? <BreakerCard data={remoteBreaker} /> : null}
        {remoteObservabilityLoading ? <LoadingDataCard title="可观测性" /> : null}
        {remoteObservabilityError ? <StatusCard title="可观测性" color="red" message={`远程可观测性错误：${remoteObservabilityError.message}`} /> : null}
        {remoteObservability ? <ObservabilityCard data={remoteObservability} /> : null}
        {uiSmokePreviewError ? <div className="df-card df-card--full"><div className="df-alert df-alert--error">UI 烟雾预览错误：{uiSmokePreviewError.message}</div></div> : null}
        <UiSmokePreviewCard
          data={uiSmokePreview}
          scenario={uiSmokePreviewScenario}
          onScenarioChange={setUiSmokePreviewScenario}
        />
        {remoteReadinessError ? <div className="df-card df-card--full"><div className="df-alert df-alert--error">远程提供方就绪状态错误：{remoteReadinessError.message}</div></div> : null}
      </div>
    </Root>
  );
}
