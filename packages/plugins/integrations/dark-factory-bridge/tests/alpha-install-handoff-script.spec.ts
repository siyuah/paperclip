import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };

describe("alpha install handoff script", () => {
  it("is exposed as a package script and keeps the real provider gate explicit", async () => {
    const source = await readFile("scripts/generate-alpha-install-handoff.mjs", "utf8");

    expect(packageJson.scripts["handoff:alpha-install"]).toBe("tsx scripts/generate-alpha-install-handoff.mjs");
    expect(source).toContain("dark-factory-alpha-install-handoff");
    expect(source).toContain("installableAlphaReady");
    expect(source).toContain("productionReady: false");
    expect(source).toContain("real_provider_gated_attempt_evidence");
    expect(source).toContain("linghucall_shim_operationalization_evidence");
    expect(source).toContain("supervised_shim_gated_attempt_evidence");
    expect(source).toContain("supervised-shim-gated-attempt-evidence.json");
    expect(source).toContain("production_deployment_plan_evidence");
    expect(source).toContain("production-deployment-plan-evidence.json");
    expect(source).toContain("production_cutover_result_evidence");
    expect(source).toContain("production-cutover-result-evidence.json");
    expect(source).toContain("supervised_shim_gated_attempt_not_recorded");
    expect(source).toContain("production_deployment_plan_not_recorded");
    expect(source).toContain("production_cutover_result_not_recorded");
  });

  it("writes deterministic boundary-safe alpha install handoff evidence", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "df-alpha-install-handoff-"));
    try {
      const reportPath = join(outDir, "ALPHA_INSTALL_HANDOFF.json");
      const result = await run(["pnpm", "handoff:alpha-install", "--", "--report", reportPath]);

      expect(result.exitCode).toBe(0);
      const summary = parseLastJsonObject(result.stdout);
      expect(summary).toMatchObject({
        ok: true,
        installableAlphaReady: true,
        productionReady: false,
        failedChecks: [],
      });
      expect(summary.productionBlockers).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "production_cutover_result_not_recorded" }),
      ]));
      expect(summary.productionBlockers).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "supervised_shim_gated_attempt_not_recorded" }),
      ]));

      const report = JSON.parse(await readFile(reportPath, "utf8"));
      expect(report).toMatchObject({
        schemaVersion: 1,
        manifestType: "dark-factory-alpha-install-handoff",
        generatedAt: "2026-05-03T00:00:00.000Z",
        packageName: "@paperclipai/plugin-dark-factory-bridge",
        manifestId: "paperclipai.dark-factory-bridge",
        installableAlphaReady: true,
        productionReady: false,
        installDistribution: {
          distributionMode: "fork-local-workspace",
          packagePrivateExpected: true,
          npmPublish: false,
        },
        uiBetaEvidence: {
          uiInternalBetaReady: true,
          scenarioCount: 4,
        },
        boundary: {
          truthSource: "dark-factory-journal",
          authoritative: false,
          terminalStateAdvanced: false,
          doesAuthorizeRemoteExecution: false,
          shouldContactRemoteProvider: false,
          noResolvedCredentialValues: true,
        },
      });
      expect(report.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "package_name", status: "pass" }),
        expect.objectContaining({ id: "manifest_identity", status: "pass" }),
        expect.objectContaining({ id: "install_distribution_policy", status: "pass" }),
        expect.objectContaining({ id: "ui_beta_evidence", status: "pass" }),
        expect.objectContaining({ id: "final_gate_status", status: "pass" }),
        expect.objectContaining({ id: "real_provider_gated_attempt_evidence", status: "pass" }),
        expect.objectContaining({ id: "linghucall_shim_operationalization_evidence", status: "pass" }),
        expect.objectContaining({ id: "supervised_shim_gated_attempt_evidence", status: "pass" }),
        expect.objectContaining({ id: "production_deployment_plan_evidence", status: "pass" }),
        expect.objectContaining({ id: "production_cutover_result_evidence", status: "pass" }),
      ]));
      expect(report.artifacts.realProviderGatedAttemptEvidence).toBe("packages/plugins/integrations/dark-factory-bridge/docs/real-provider-gated-attempt-evidence.json");
      expect(report.artifacts.linghuCallShimOperationalizationEvidence).toBe("packages/plugins/integrations/dark-factory-bridge/docs/linghucall-shim-operationalization-evidence.json");
      expect(report.artifacts.supervisedShimGatedAttemptEvidence).toBe("packages/plugins/integrations/dark-factory-bridge/docs/supervised-shim-gated-attempt-evidence.json");
      expect(report.artifacts.productionDeploymentPlanEvidence).toBe("packages/plugins/integrations/dark-factory-bridge/docs/production-deployment-plan-evidence.json");
      expect(report.artifacts.productionCutoverResultEvidence).toBe("packages/plugins/integrations/dark-factory-bridge/docs/production-cutover-result-evidence.json");
      expect(report.artifacts.finalRealProviderGateStatus).toBe("docs/dark-factory/DARK_FACTORY_REAL_PROVIDER_GATE_STATUS_2026-05-03.md");
      expect(JSON.stringify(report)).not.toContain("resolved-key");
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  }, 20_000);
});

function run(command: string[]): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolveRun) => {
    const child = spawn(command[0]!, command.slice(1), {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (exitCode) => {
      resolveRun({
        exitCode: exitCode ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

function parseLastJsonObject(output: string): Record<string, unknown> {
  const trimmed = output.trim();
  const start = trimmed.lastIndexOf("\n{");
  const jsonText = start >= 0 ? trimmed.slice(start + 1) : trimmed;
  return JSON.parse(jsonText);
}
