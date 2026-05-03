import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };

describe("production deployment plan evidence script", () => {
  it("is exposed as a package script and keeps production cutover explicit", async () => {
    const source = await readFile("scripts/generate-production-deployment-plan-evidence.mjs", "utf8");

    expect(packageJson.scripts["evidence:production-plan"]).toBe("tsx scripts/generate-production-deployment-plan-evidence.mjs");
    expect(source).toContain("dark-factory-production-deployment-plan-evidence");
    expect(source).toContain("production_cutover_result_not_recorded");
    expect(source).toContain("doesInstallService: false");
    expect(source).toContain("doesStartService: false");
  });

  it("writes deterministic boundary-safe production deployment plan evidence", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "df-production-plan-"));
    try {
      const reportPath = join(outDir, "PRODUCTION_PLAN.json");
      const result = await run(["pnpm", "evidence:production-plan", "--", "--report", reportPath]);

      expect(result.exitCode).toBe(0);
      const summary = parseLastJsonObject(result.stdout);
      expect(summary).toMatchObject({
        ok: true,
        planStatus: "ready-for-supervised-cutover",
        productionReady: false,
        nextProductionBlocker: {
          code: "production_cutover_result_not_recorded",
        },
      });

      const evidence = JSON.parse(await readFile(reportPath, "utf8"));
      expect(evidence).toMatchObject({
        schemaVersion: 1,
        reportType: "dark-factory-production-deployment-plan-evidence",
        packageName: "@paperclipai/plugin-dark-factory-bridge",
        planStatus: "ready-for-supervised-cutover",
        deploymentTargets: {
          providerShim: {
            serviceName: "linghucall-provider-shim.service",
          },
        },
        monitoringPlan: {
          expectedProviderStatus: "ready",
          credentialLoggingPolicy: "redacted_presence_only",
        },
        rollbackPlan: {
          journalReconciliationRequired: true,
          terminalStateAdvancedDuringRollback: false,
        },
        retentionPlan: {
          truthSource: "dark-factory-journal",
        },
        productionDecision: {
          productionDeploymentPlanRecorded: true,
          productionReady: false,
          nextProductionBlocker: {
            code: "production_cutover_result_not_recorded",
          },
        },
        boundary: {
          truthSource: "dark-factory-journal",
          authoritative: false,
          terminalStateAdvanced: false,
          doesAuthorizeRemoteExecution: false,
          noResolvedCredentialValues: true,
          credentialValuesRedacted: true,
          doesInstallService: false,
          doesStartService: false,
        },
      });
      expect(JSON.stringify(evidence)).not.toContain("resolved-key");
      expect(JSON.stringify(evidence)).not.toContain("provider-key");
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
  const candidate = start >= 0 ? trimmed.slice(start + 1) : trimmed;
  const end = candidate.lastIndexOf("}");
  const jsonText = end >= 0 ? candidate.slice(0, end + 1) : candidate;
  return JSON.parse(jsonText);
}
