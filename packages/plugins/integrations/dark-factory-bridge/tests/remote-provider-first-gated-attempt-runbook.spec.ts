import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(process.cwd(), "../../../..");
const runbookPath = resolve(
  repoRoot,
  "docs/dark-factory/DARK_FACTORY_FIRST_REAL_PROVIDER_GATED_ATTEMPT_RUNBOOK.md",
);
const gatedSpecPath = resolve(process.cwd(), "tests/remote-gated-integration.spec.ts");

describe("first real provider gated attempt runbook", () => {
  it("requires dry-run guard evidence before the gated integration test", async () => {
    const runbook = await readRunbook();

    expect(runbook).toContain("Dry-Run Gate");
    expect(runbook).toContain("dry-run guard receipt id");
    expect(runbook).toContain("pnpm preflight:first-provider");
    expect(runbook).toContain("output/dark-factory-first-provider-preflight/evidence.json");
    expect(runbook).toContain("onEnvironmentExecute");
    expect(runbook).toContain("If the decision is `blocked`, do not run");
    expect(runbook).toContain("Gated Integration Command");
    expect(runbook).toContain("pnpm test -- tests/remote-gated-integration.spec.ts");
  });

  it("keeps the real-provider integration test explicitly operator gated", async () => {
    const spec = await readFile(gatedSpecPath, "utf8");
    const runbook = await readRunbook();

    expect(spec).toContain("DARK_FACTORY_REMOTE_INTEGRATION === \"1\"");
    expect(spec).toContain("describe.skip");
    expect(spec).toContain("DARK_FACTORY_REMOTE_ENDPOINT");
    expect(spec).toContain("DARK_FACTORY_REMOTE_API_KEY_ENV");
    expect(runbook).toContain("The real-provider test is skipped by default");
    expect(runbook).toContain("DARK_FACTORY_REMOTE_INTEGRATION=1");
  });

  it("documents rollback and stop conditions without storing credential values", async () => {
    const runbook = await readRunbook();

    expect(runbook).toContain("Rollback");
    expect(runbook).toContain("unset DARK_FACTORY_REMOTE_INTEGRATION");
    expect(runbook).toContain("Expected rollback state: the gated integration test is skipped.");
    expect(runbook).toContain("Stop Conditions");
    expect(runbook).toContain("Never record a resolved API key, bearer token, password, or connection string.");
    expect(runbook).not.toMatch(/DARK_FACTORY_REMOTE_API_KEY\s*=\s*['"][^'"]+['"]/);
    expect(runbook).not.toMatch(/bearer\s+[a-z0-9._-]{12,}/i);
  });

  it("locks projection boundaries for the first real provider attempt", async () => {
    const runbook = await readRunbook();

    expect(runbook).toContain("Dark Factory Journal remains truth source.");
    expect(runbook).toContain("`authoritative: false`");
    expect(runbook).toContain("`terminalStateAdvanced: false`");
    expect(runbook).toContain("`doesAuthorizeRemoteExecution: false`");
    expect(runbook).toContain("`shouldContactRemoteProvider: false`");
    expect(runbook).toContain("No Paperclip Task/Issue main model changes.");
  });
});

async function readRunbook(): Promise<string> {
  return readFile(runbookPath, "utf8");
}
