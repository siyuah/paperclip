import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import packageJson from "../package.json" with { type: "json" };
import {
  buildUiSmokePreviewBrowserHarness,
} from "../src/ui-smoke-preview-browser-harness.js";

describe("UI smoke preview browser harness", () => {
  it("builds a standalone HTML harness with all preview scenarios and boundary fields", () => {
    const html = buildUiSmokePreviewBrowserHarness({
      generatedAt: "2026-05-03T05:40:00.000Z",
    });

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<html lang=\"zh-CN\">");
    expect(html).toContain("UI 烟雾预览");
    expect(html).toContain("id=\"scenario\"");
    expect(html).toContain("healthy");
    expect(html).toContain("warning_latency");
    expect(html).toContain("blocked_failures");
    expect(html).toContain("stale_readiness");
    expect(html).toContain("事实来源");
    expect(html).toContain("是否权威");
    expect(html).toContain("是否推进终态");
    expect(html).toContain("远程 Provider Dry-run 防护");
    expect(html).toContain("执行 dry-run");
    expect(html).toContain("Dry-run 回执");
    expect(html).toContain("是否联系 Provider");
    expect(html).toContain("是否授权执行");
    expect(html).toContain("dark-factory-journal");
    expect(html).toContain("journal-truth-source");
    expect(html).toContain("df-remote-dry-run-");
    expect(html).toContain("Dark Factory Journal remains truth source");
    expect(html).toContain("class=\"df-card\"");
    expect(html).toContain("class=\"df-grid\"");
    expect(html).toContain("class=\"df-guard-list\"");
    expect(html).not.toContain("style=\"margin:0");
    expect(html).not.toContain("contactProvider=");
    expect(html).not.toContain("authorizes=");
    expect(html).not.toContain("preflight=");
    expect(html).not.toContain("blocking=");
    expect(html).not.toContain("ui-smoke-preview-placeholder-not-a-secret");
  });

  it("embeds deterministic preview JSON without exposing resolved credential values", () => {
    const first = buildUiSmokePreviewBrowserHarness();
    const second = buildUiSmokePreviewBrowserHarness();

    expect(second).toBe(first);
    expect(first).not.toMatch(/api[_-]?key["']?\s*[:=]\s*["'][^"']+/i);
    expect(first).not.toContain("password");
    expect(first).not.toContain("connection_string");
  });

  it("ships a repeatable live browser smoke runner that uses local Chromium/CDP", () => {
    const script = readFileSync(
      resolve(process.cwd(), "scripts/run-ui-smoke-preview-browser.mjs"),
      "utf8",
    );

    expect(script).toContain("DARK_FACTORY_UI_SMOKE_CHROMIUM");
    expect(script).toContain("DevToolsActivePort");
    expect(script).toContain("Page.captureScreenshot");
    expect(script).toContain("smoke-result.json");
    expect(script).toContain("dark-factory-journal");
    expect(script).toContain("预览状态");
    expect(script).toContain("是否权威");
    expect(script).not.toContain("ui-smoke-preview-placeholder-not-a-secret");
  });

  it("serves the direct local WebUI preview separately from the host bundle server", () => {
    const script = readFileSync(
      resolve(process.cwd(), "scripts/serve-ui-smoke-preview.mjs"),
      "utf8",
    );

    expect(packageJson.scripts["dev:ui"]).toBe("tsx scripts/serve-ui-smoke-preview.mjs");
    expect(packageJson.scripts["dev:ui:bundle"]).toBe("paperclip-plugin-dev-server --root . --ui-dir dist/ui --port 4178");
    expect(script).toContain("Content-Type\", \"text/html; charset=utf-8");
    expect(script).toContain("Dark Factory bridge UI preview listening");
    expect(script).toContain("For Paperclip host bundle serving, use: pnpm dev:ui:bundle");
    expect(script).toContain("buildUiSmokePreviewBrowserHarness");
  });
});
