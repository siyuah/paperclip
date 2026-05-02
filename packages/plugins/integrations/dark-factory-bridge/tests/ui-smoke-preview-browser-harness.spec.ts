import { describe, expect, it } from "vitest";
import {
  buildUiSmokePreviewBrowserHarness,
} from "../src/ui-smoke-preview-browser-harness.js";

describe("UI smoke preview browser harness", () => {
  it("builds a standalone HTML harness with all preview scenarios and boundary fields", () => {
    const html = buildUiSmokePreviewBrowserHarness({
      generatedAt: "2026-05-03T05:40:00.000Z",
    });

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("UI Smoke Preview");
    expect(html).toContain("id=\"scenario\"");
    expect(html).toContain("healthy");
    expect(html).toContain("warning_latency");
    expect(html).toContain("blocked_failures");
    expect(html).toContain("stale_readiness");
    expect(html).toContain("Truth source");
    expect(html).toContain("Authoritative");
    expect(html).toContain("Terminal advanced");
    expect(html).toContain("dark-factory-journal");
    expect(html).toContain("journal-truth-source");
    expect(html).toContain("Dark Factory Journal remains truth source");
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
});
