import { describe, expect, it } from "vitest";

describe("Dark Factory UI smoke preview panel source wiring", () => {
  it("wires settings UI to the remote provider smoke preview data key", async () => {
    const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../src/ui/index.tsx", import.meta.url), "utf8"));

    expect(source).toContain("UI 烟雾预览");
    expect(source).toContain("remote-provider-ui-smoke-preview");
    expect(source).toContain("useState<UiSmokePreviewScenario>(\"healthy\")");
    expect(source).toContain("onScenarioChange={setUiSmokePreviewScenario}");
    expect(source).toContain("事实来源");
    expect(source).toContain("是否权威");
    expect(source).toContain("是否推进终态");
    expect(source).toContain("远程 Provider Dry-run 防护");
    expect(source).toContain("Dry-run guard receipt");
    expect(source).toContain("shouldContactRemoteProvider");
    expect(source).toContain("doesAuthorizeRemoteExecution");
    expect(source).toContain("healthy");
    expect(source).toContain("warning_latency");
    expect(source).toContain("blocked_failures");
    expect(source).toContain("stale_readiness");
  });
});
