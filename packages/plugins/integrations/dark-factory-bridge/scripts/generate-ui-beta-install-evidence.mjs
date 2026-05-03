#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildAllUiSmokePreviews } from "../src/remote-provider-ui-smoke-preview.ts";
import { buildUiSmokePreviewBrowserHarness } from "../src/ui-smoke-preview-browser-harness.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(scriptDir, "..");
const repoRoot = resolve(pluginRoot, "../../../..");
const defaultOutDir = join(repoRoot, "output/dark-factory-ui-beta-install-evidence");

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outDir = resolve(options.outDir ?? defaultOutDir);
  const reportPath = options.reportPath
    ? resolve(options.reportPath)
    : join(outDir, "UI_BETA_INSTALL_EVIDENCE.json");
  await mkdir(dirname(reportPath), { recursive: true });

  const packageJson = JSON.parse(await readFile(join(pluginRoot, "package.json"), "utf8"));
  const manifestModule = await import(`${pathToFileURL(resolve(pluginRoot, packageJson.paperclipPlugin?.manifest ?? "")).href}?t=${Date.now()}`);
  const manifest = manifestModule.default;
  const uiSource = await readFile(join(pluginRoot, "src/ui/index.tsx"), "utf8");
  const browserRunner = await readFile(join(pluginRoot, "scripts/run-ui-smoke-preview-browser.mjs"), "utf8");
  const harnessHtml = buildUiSmokePreviewBrowserHarness({
    generatedAt: "2026-05-03T00:00:00.000Z",
  });
  const previews = buildAllUiSmokePreviews({
    checkedAt: "2026-05-03T00:00:00.000Z",
  });

  const checks = [
    check("ui_slot_dashboard", hasUiSlot(manifest, "dashboardWidget", "dark-factory-provider-health"), "dashboard widget slot is declared"),
    check("ui_slot_detail", hasUiSlot(manifest, "taskDetailView", "dark-factory-projection"), "issue detail tab slot is declared"),
    check("ui_slot_settings", hasUiSlot(manifest, "settingsPage", "settings"), "settings page slot is declared"),
    check("settings_preview_data_key", uiSource.includes("remote-provider-ui-smoke-preview"), "settings UI reads smoke preview data"),
    check("settings_scenario_selector", uiSource.includes("onScenarioChange={setUiSmokePreviewScenario}"), "settings UI exposes scenario selector"),
    check("settings_boundary_fields", [
      "事实来源",
      "是否权威",
      "是否推进终态",
      "doesAuthorizeRemoteExecution",
      "shouldContactRemoteProvider",
    ].every((needle) => uiSource.includes(needle)), "settings UI renders boundary fields"),
    check("browser_harness_scenarios", [
      "healthy",
      "warning_latency",
      "blocked_failures",
      "stale_readiness",
    ].every((needle) => harnessHtml.includes(needle)), "standalone browser harness includes all scenarios"),
    check("browser_runner_cdp", [
      "DARK_FACTORY_UI_SMOKE_CHROMIUM",
      "DevToolsActivePort",
      "Page.captureScreenshot",
      "smoke-result.json",
    ].every((needle) => browserRunner.includes(needle)), "live browser runner is available for Chromium/CDP smoke"),
    check("preview_boundaries", previews.every((preview) =>
      preview.truthSource === "dark-factory-journal"
      && preview.authoritative === false
      && preview.terminalStateAdvanced === false
      && preview.dryRunGuards.every((guard) =>
        guard.shouldContactRemoteProvider === false
        && guard.doesAuthorizeRemoteExecution === false
        && guard.terminalStateAdvanced === false
      )
    ), "preview payloads preserve non-authoritative Journal boundary"),
    check("preview_scenarios", previews.map((preview) => preview.scenario).join(",") === "healthy,warning_latency,blocked_failures,stale_readiness", "preview scenarios are deterministic and complete"),
  ];

  const report = {
    schemaVersion: 1,
    reportType: "dark-factory-ui-beta-install-evidence",
    generatedAt: "2026-05-03T00:00:00.000Z",
    packageName: packageJson.name,
    manifestId: manifest.id,
    uiInternalBetaReady: checks.every((item) => item.ok),
    checks,
    scenarios: previews.map((preview) => ({
      scenario: preview.scenario,
      previewStatus: preview.previewStatus,
      readinessStatus: preview.readiness.readinessStatus,
      nextSafeHook: preview.readiness.nextSafeHook,
      dryRunGuardDecisions: Object.fromEntries(preview.dryRunGuards.map((guard) => [guard.targetHook, guard.decision])),
      truthSource: preview.truthSource,
      authoritative: preview.authoritative,
      terminalStateAdvanced: preview.terminalStateAdvanced,
    })),
    artifacts: {
      uiSource: "src/ui/index.tsx",
      browserHarness: "src/ui-smoke-preview-browser-harness.ts",
      browserRunner: "scripts/run-ui-smoke-preview-browser.mjs",
    },
    boundary: {
      truthSource: "dark-factory-journal",
      authoritative: false,
      terminalStateAdvanced: false,
      doesAuthorizeRemoteExecution: false,
      shouldContactRemoteProvider: false,
      noResolvedCredentialValues: true,
    },
  };

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    ok: report.uiInternalBetaReady,
    reportPath,
    uiInternalBetaReady: report.uiInternalBetaReady,
    failedChecks: checks.filter((item) => !item.ok).map((item) => item.id),
  }, null, 2));

  if (!report.uiInternalBetaReady && !options.allowNotReady) {
    process.exit(2);
  }
}

function parseArgs(args) {
  const parsed = {
    allowNotReady: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--out") {
      parsed.outDir = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--report") {
      parsed.reportPath = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--allow-not-ready") {
      parsed.allowNotReady = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: pnpm evidence:ui-beta [--out DIR] [--report PATH] [--allow-not-ready]");
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function hasUiSlot(manifest, type, id) {
  return Array.isArray(manifest.ui?.slots)
    && manifest.ui.slots.some((slot) => slot.type === type && slot.id === id);
}

function check(id, ok, message) {
  return {
    id,
    ok,
    status: ok ? "pass" : "fail",
    message,
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
