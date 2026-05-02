import { describe, expect, it } from "vitest";

describe("Dark Factory UI smoke preview panel source wiring", () => {
  it("wires settings UI to the remote provider smoke preview data key", async () => {
    const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../src/ui/index.tsx", import.meta.url), "utf8"));

    expect(source).toContain("UI Smoke Preview");
    expect(source).toContain("remote-provider-ui-smoke-preview");
    expect(source).toContain("useState<UiSmokePreviewScenario>(\"healthy\")");
    expect(source).toContain("onScenarioChange={setUiSmokePreviewScenario}");
    expect(source).toContain("Truth source");
    expect(source).toContain("Authoritative");
    expect(source).toContain("Terminal advanced");
    expect(source).toContain("healthy");
    expect(source).toContain("warning_latency");
    expect(source).toContain("blocked_failures");
    expect(source).toContain("stale_readiness");
  });
});
