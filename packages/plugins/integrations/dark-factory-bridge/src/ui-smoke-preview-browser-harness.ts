import {
  buildAllUiSmokePreviews,
  type UiSmokePreview,
} from "./remote-provider-ui-smoke-preview.js";

export type UiSmokePreviewBrowserHarnessOptions = {
  title?: string;
  generatedAt?: string;
  previews?: UiSmokePreview[];
};

export function buildUiSmokePreviewBrowserHarness(
  options: UiSmokePreviewBrowserHarnessOptions = {},
): string {
  const title = options.title ?? "Dark Factory Bridge UI 烟雾预览";
  const generatedAt = options.generatedAt ?? "2026-05-03T00:00:00.000Z";
  const previews = options.previews ?? buildAllUiSmokePreviews();
  const previewJson = safeJsonForHtml(previews);

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: dark;
      --df-bg-primary: #111111;
      --df-bg-secondary: #171717;
      --df-bg-card: rgba(26, 26, 26, 0.72);
      --df-bg-card-solid: #1a1a1a;
      --df-border: rgba(255, 255, 255, 0.08);
      --df-border-focus: rgba(255, 255, 255, 0.24);
      --df-text-primary: #e5e5e5;
      --df-text-secondary: #888888;
      --df-status-healthy: #34d399;
      --df-status-healthy-bg: rgba(52, 211, 153, 0.08);
      --df-status-warning: #f59e0b;
      --df-status-warning-bg: rgba(245, 158, 11, 0.08);
      --df-status-error: #ef4444;
      --df-status-error-bg: rgba(239, 68, 68, 0.08);
      --df-status-info: #3b82f6;
      --df-status-info-bg: rgba(59, 130, 246, 0.08);
      --df-status-blocked: #a78bfa;
      --df-status-blocked-bg: rgba(167, 139, 250, 0.08);
      --df-font-mono: "JetBrains Mono", "Fira Code", "Cascadia Code", monospace;
      --df-font-sans: "Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-family: var(--df-font-sans);
      background: var(--df-bg-primary);
      color: var(--df-text-primary);
    }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; min-width: 320px; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
    main { max-width: 1120px; margin: 0 auto; display: grid; gap: 16px; }
    header { display: grid; gap: 6px; }
    h1 { margin: 0; font-size: 24px; line-height: 1.2; letter-spacing: 0; }
    .subtitle { color: var(--df-text-secondary); font-size: 14px; }
    .df-card {
      background: var(--df-bg-card);
      border: 1px solid var(--df-border);
      border-radius: 6px;
      padding: 16px;
      display: grid;
      gap: 12px;
    }
    .df-toolbar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; justify-content: space-between; }
    .df-toolbar-main { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    h2, h3 { margin: 0; line-height: 1.25; letter-spacing: 0; }
    h2 { font-size: 18px; }
    h3 { font-size: 16px; }
    label { font-weight: 600; }
    select {
      border: 1px solid var(--df-border);
      border-radius: 6px;
      padding: 8px 10px;
      font: inherit;
      background: var(--df-bg-secondary);
      color: var(--df-text-primary);
      min-width: 220px;
    }
    select:focus-visible { outline: 1.5px solid var(--df-border-focus); outline-offset: 2px; }
    .df-alert { border-radius: 6px; padding: 8px 10px; font-size: 13px; }
    .df-alert.info { border: 1px solid rgba(59, 130, 246, 0.16); background: var(--df-status-info-bg); color: var(--df-status-info); }
    .df-alert.warning { border: 1px solid rgba(245, 158, 11, 0.18); background: var(--df-status-warning-bg); color: var(--df-status-warning); }
    .df-alert.error { border: 1px solid rgba(239, 68, 68, 0.18); background: var(--df-status-error-bg); color: var(--df-status-error); }
    .df-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
    .df-field { border: 1px solid var(--df-border); border-radius: 6px; padding: 10px; min-width: 0; background: rgba(23, 23, 23, 0.72); }
    .df-field span { display: block; color: var(--df-text-secondary); font-size: 12px; margin-bottom: 4px; }
    .df-field strong, code { overflow-wrap: anywhere; font-family: var(--df-font-mono); }
    .df-section-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .df-guard-list { display: grid; gap: 8px; }
    .df-guard { border: 1px solid var(--df-border); border-radius: 6px; padding: 10px; display: grid; gap: 4px; background: rgba(23, 23, 23, 0.72); font-size: 13px; }
    .df-guard.allowed { border-color: rgba(52, 211, 153, 0.18); background: var(--df-status-healthy-bg); color: var(--df-status-healthy); }
    .df-guard.review_required { border-color: rgba(245, 158, 11, 0.18); background: var(--df-status-warning-bg); color: var(--df-status-warning); }
    .df-guard.blocked { border-color: rgba(239, 68, 68, 0.18); background: var(--df-status-error-bg); color: var(--df-status-error); }
    .df-badges { display: flex; gap: 6px; flex-wrap: wrap; }
    .df-badge { border: 1px solid rgba(59, 130, 246, 0.16); background: var(--df-status-info-bg); color: var(--df-status-info); border-radius: 999px; padding: 3px 8px; font-size: 12px; font-weight: 500; }
    .df-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--df-status-info); margin-right: 4px; }
    @media (max-width: 640px) {
      body { padding: 12px; }
      .df-toolbar { align-items: stretch; }
      select { width: 100%; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>${escapeHtml(title)}</h1>
      <div class="subtitle">生成时间 ${escapeHtml(generatedAt)}。仅本地预览。Dark Factory 日志仍是事实来源。</div>
    </header>
    <section class="df-card" aria-labelledby="preview-title">
      <div class="df-toolbar">
        <div class="df-toolbar-main">
          <h2 id="preview-title"><span class="df-dot" aria-hidden="true"></span>UI 烟雾预览</h2>
          <label for="scenario">场景</label>
          <select id="scenario" aria-label="场景"></select>
        </div>
        <span class="df-badge">非权威投影</span>
      </div>
      <div id="summary"></div>
      <div id="fields" class="df-grid"></div>
      <div class="df-section-title">
        <h3>远程提供方试运行防护</h3>
        <span class="df-badge">shouldContactRemoteProvider / doesAuthorizeRemoteExecution 固定 false</span>
      </div>
      <div id="dry-run-guards" class="df-guard-list" aria-label="远程提供方试运行防护决策"></div>
      <div id="badges" class="df-badges" aria-label="UI 徽标"></div>
    </section>
  </main>
  <script type="application/json" id="preview-data">${previewJson}</script>
  <script>
    const previews = JSON.parse(document.getElementById("preview-data").textContent);
    const scenarioSelect = document.getElementById("scenario");
    const summary = document.getElementById("summary");
    const fields = document.getElementById("fields");
    const dryRunGuards = document.getElementById("dry-run-guards");
    const badges = document.getElementById("badges");
    const labels = {
      healthy: "健康",
      warning_latency: "延迟告警",
      blocked_failures: "失败阻断",
      stale_readiness: "就绪状态过期"
    };
    const valueLabels = {
      ready: "就绪",
      needs_attention: "需要处理",
      blocked: "已阻断",
      allowed: "允许",
      review_required: "需要人工复核",
      closed: "关闭",
      open: "打开",
      half_open: "半开",
      pass: "通过",
      warn: "警告",
      fail: "失败"
    };

    function displayValue(value) {
      if (value == null) return "无";
      const raw = String(value);
      return valueLabels[raw] ? valueLabels[raw] + " (" + raw + ")" : raw;
    }

    function displayMessage(value) {
      if (value == null) return "无";
      return String(value)
        .replace(/远程 Provider alpha/g, "远程提供方 alpha")
        .replace(/受控 probe/g, "受控探测")
        .replace(/\\bProvider\\b/g, "提供方")
        .replace(/\\bJournal\\b/g, "日志")
        .replace(/\\bDry-run\\b/g, "试运行")
        .replace(/\\bdry-run\\b/g, "试运行")
        .replace(/\\breceipt\\b/g, "回执");
    }

    function badgeLabel(value) {
      if (value === "journal-truth-source") return "日志是事实来源 (journal-truth-source)";
      if (value === "execute-allowed") return "允许执行 (execute-allowed)";
      if (value.startsWith("next:")) return "下一安全 hook: " + value.slice(5) + " (" + value + ")";
      if (value.startsWith("breaker:")) return "熔断器: " + displayValue(value.slice(8)) + " (" + value + ")";
      if (value.startsWith("alerts:")) return "告警数: " + value.slice(7) + " (" + value + ")";
      return displayValue(value);
    }

    for (const preview of previews) {
      const option = document.createElement("option");
      option.value = preview.scenario;
      option.textContent = labels[preview.scenario] ?? preview.scenario;
      scenarioSelect.append(option);
    }

    function field(label, value) {
      const node = document.createElement("div");
      node.className = "df-field";
      const labelNode = document.createElement("span");
      labelNode.textContent = label;
      const valueNode = document.createElement("strong");
      valueNode.textContent = value == null ? "无" : String(value);
      node.append(labelNode, valueNode);
      return node;
    }

    function render() {
      const preview = previews.find((item) => item.scenario === scenarioSelect.value) ?? previews[0];
      summary.className = preview.previewStatus === "blocked" ? "df-alert error" : preview.previewStatus === "needs_attention" ? "df-alert warning" : "df-alert info";
      summary.textContent = displayMessage(preview.readiness.summary);
      fields.replaceChildren(
        field("预览状态", displayValue(preview.previewStatus)),
        field("主机上下文", preview.hostContextId),
        field("就绪状态", displayValue(preview.readiness.readinessStatus)),
        field("下一安全 hook", preview.readiness.nextSafeHook),
        field("熔断器状态", displayValue(preview.breakerEvaluation.breakerState)),
        field("采样观测数", preview.observability.sampledObservationCount),
        field("最大延迟", preview.observability.snapshot.maxLatencyMs + "ms"),
        field("游标滞后", preview.observability.snapshot.cursorLag ?? "未知"),
        field("告警数", preview.observability.alerts.length),
        field("凭据来源", preview.credentialDiagnostics.credentialSource ?? "无"),
        field("执行试运行", displayValue((preview.dryRunGuards.find((guard) => guard.targetHook === "onEnvironmentExecute") ?? {}).decision ?? "未知")),
        field("试运行回执", (preview.dryRunGuards.find((guard) => guard.targetHook === "onEnvironmentExecute") ?? {}).receiptId ?? "无"),
        field("事实来源", preview.truthSource),
        field("是否权威", preview.authoritative ? "是" : "否"),
        field("是否推进终态", preview.terminalStateAdvanced ? "是" : "否")
      );
      dryRunGuards.replaceChildren(...preview.dryRunGuards.map((guard) => {
        const node = document.createElement("div");
        node.className = "df-guard " + guard.decision;
        node.textContent = guard.targetHook + "：决策 " + displayValue(guard.decision)
          + " | 预检状态 " + displayValue(guard.matchedPreflightStatus)
          + " | 是否联系提供方 " + (guard.shouldContactRemoteProvider ? "是" : "否")
          + " | 是否授权执行 " + (guard.doesAuthorizeRemoteExecution ? "是" : "否")
          + " | 回执 " + guard.receiptId
          + (guard.blockingCodes.length ? " | 阻断代码 " + guard.blockingCodes.map(displayValue).join(", ") : "");
        return node;
      }));
      badges.replaceChildren(...preview.uiBadges.map((item) => {
        const node = document.createElement("span");
        node.className = "df-badge";
        node.textContent = badgeLabel(item);
        return node;
      }));
    }

    scenarioSelect.addEventListener("change", render);
    render();
  </script>
</body>
</html>`;
}

function safeJsonForHtml(value: unknown): string {
  return JSON.stringify(value)
    .replace(/&/g, "\\u0026")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
