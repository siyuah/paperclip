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
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f8fafc;
      color: #111827;
    }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; }
    main { max-width: 1120px; margin: 0 auto; display: grid; gap: 16px; }
    header { display: grid; gap: 6px; }
    h1 { margin: 0; font-size: 24px; line-height: 1.2; }
    .subtitle { color: #475569; font-size: 14px; }
    .panel { background: #fff; border: 1px solid #dbe3ef; border-radius: 8px; padding: 16px; display: grid; gap: 12px; }
    .toolbar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    label { font-weight: 600; }
    select { border: 1px solid #94a3b8; border-radius: 6px; padding: 8px 10px; font: inherit; background: #fff; min-width: 220px; }
    .notice { border: 1px solid #f59e0b; background: #fffbeb; color: #92400e; border-radius: 6px; padding: 8px 10px; }
    .critical { border: 1px solid #fecaca; background: #fef2f2; color: #991b1b; border-radius: 6px; padding: 8px 10px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
    .field { border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; min-width: 0; }
    .field span { display: block; color: #64748b; font-size: 12px; margin-bottom: 4px; }
    .field strong, code { overflow-wrap: anywhere; }
    .guard-list { display: grid; gap: 8px; }
    .guard { border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; display: grid; gap: 4px; }
    .guard.review_required { border-color: #f59e0b; background: #fffbeb; color: #92400e; }
    .guard.blocked { border-color: #fecaca; background: #fef2f2; color: #991b1b; }
    .badges { display: flex; gap: 6px; flex-wrap: wrap; }
    .badge { border: 1px solid #cbd5e1; background: #f8fafc; border-radius: 999px; padding: 3px 8px; font-size: 12px; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>${escapeHtml(title)}</h1>
      <div class="subtitle">生成时间 ${escapeHtml(generatedAt)}。仅本地预览。Dark Factory Journal 仍是唯一事实来源。</div>
    </header>
    <section class="panel" aria-labelledby="preview-title">
      <div class="toolbar">
        <h2 id="preview-title" style="margin:0;font-size:18px;">UI 烟雾预览</h2>
        <label for="scenario">场景</label>
        <select id="scenario" aria-label="场景"></select>
      </div>
      <div id="summary"></div>
      <div id="fields" class="grid"></div>
      <h3 style="margin:0;font-size:16px;">远程 Provider Dry-run 防护</h3>
      <div id="dry-run-guards" class="guard-list" aria-label="远程 Provider dry-run 防护决策"></div>
      <div id="badges" class="badges" aria-label="UI 徽标"></div>
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

    for (const preview of previews) {
      const option = document.createElement("option");
      option.value = preview.scenario;
      option.textContent = labels[preview.scenario] ?? preview.scenario;
      scenarioSelect.append(option);
    }

    function field(label, value) {
      const node = document.createElement("div");
      node.className = "field";
      const labelNode = document.createElement("span");
      labelNode.textContent = label;
      const valueNode = document.createElement("strong");
      valueNode.textContent = value == null ? "无" : String(value);
      node.append(labelNode, valueNode);
      return node;
    }

    function render() {
      const preview = previews.find((item) => item.scenario === scenarioSelect.value) ?? previews[0];
      summary.className = preview.previewStatus === "blocked" ? "critical" : preview.previewStatus === "needs_attention" ? "notice" : "";
      summary.textContent = preview.readiness.summary;
      fields.replaceChildren(
        field("预览状态", preview.previewStatus),
        field("Host 上下文", preview.hostContextId),
        field("就绪状态", preview.readiness.readinessStatus),
        field("下一安全 hook", preview.readiness.nextSafeHook),
        field("熔断器状态", preview.breakerEvaluation.breakerState),
        field("采样观测数", preview.observability.sampledObservationCount),
        field("最大延迟", preview.observability.snapshot.maxLatencyMs + "ms"),
        field("游标滞后", preview.observability.snapshot.cursorLag ?? "未知"),
        field("告警数", preview.observability.alerts.length),
        field("凭据来源", preview.credentialDiagnostics.credentialSource ?? "无"),
        field("执行 dry-run", (preview.dryRunGuards.find((guard) => guard.targetHook === "onEnvironmentExecute") ?? {}).decision ?? "未知"),
        field("Dry-run receipt", (preview.dryRunGuards.find((guard) => guard.targetHook === "onEnvironmentExecute") ?? {}).receiptId ?? "无"),
        field("事实来源", preview.truthSource),
        field("是否权威", preview.authoritative ? "是" : "否"),
        field("是否推进终态", preview.terminalStateAdvanced ? "是" : "否")
      );
      dryRunGuards.replaceChildren(...preview.dryRunGuards.map((guard) => {
        const node = document.createElement("div");
        node.className = "guard " + guard.decision;
        node.textContent = guard.targetHook + ": " + guard.decision
          + " | preflight=" + guard.matchedPreflightStatus
          + " | contactProvider=" + (guard.shouldContactRemoteProvider ? "yes" : "no")
          + " | authorizes=" + (guard.doesAuthorizeRemoteExecution ? "yes" : "no")
          + " | receipt=" + guard.receiptId
          + (guard.blockingCodes.length ? " | blocking=" + guard.blockingCodes.join(",") : "");
        return node;
      }));
      badges.replaceChildren(...preview.uiBadges.map((item) => {
        const node = document.createElement("span");
        node.className = "badge";
        node.textContent = item;
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
