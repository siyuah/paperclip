import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };

describe("production cutover result evidence script", () => {
  it("is exposed as a package script and requires sanitized cutover gates", async () => {
    const source = await readFile("scripts/generate-production-cutover-result-evidence.mjs", "utf8");

    expect(packageJson.scripts["evidence:production-cutover"]).toBe("tsx scripts/generate-production-cutover-result-evidence.mjs");
    expect(source).toContain("dark-factory-production-cutover-result-evidence");
    expect(source).toContain("supervisedShimGatePassed");
    expect(source).toContain("cutoverReportSanitized");
    expect(source).toContain("noResolvedCredentialValues: true");
  });

  it("writes final production-ready evidence from a sanitized passing cutover report", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "df-cutover-result-"));
    try {
      const inputPath = join(outDir, "CUTOVER_RESULT.json");
      const reportPath = join(outDir, "CUTOVER_EVIDENCE.json");
      await writeFile(inputPath, `${JSON.stringify(buildPassingCutoverReport(), null, 2)}\n`, "utf8");

      const result = await run(["pnpm", "evidence:production-cutover", "--", "--input", inputPath, "--report", reportPath]);

      expect(result.exitCode).toBe(0);
      const summary = parseLastJsonObject(result.stdout);
      expect(summary).toMatchObject({
        ok: true,
        productionCutoverResultRecorded: true,
        productionCutoverPassed: true,
        productionReady: true,
      });

      const evidence = JSON.parse(await readFile(reportPath, "utf8"));
      expect(evidence).toMatchObject({
        schemaVersion: 1,
        reportType: "dark-factory-production-cutover-result-evidence",
        packageName: "@paperclipai/plugin-dark-factory-bridge",
        productionDecision: {
          productionCutoverResultRecorded: true,
          productionCutoverPassed: true,
          productionReady: true,
          remainingProductionBlockers: [],
        },
        gates: {
          supervisedShimGatePassed: true,
          productionPlanValidated: true,
          installReadinessPassed: true,
          postCutoverHealthReady: true,
          rollbackPlanVerified: true,
          journalBackupRecorded: true,
        },
        boundary: {
          truthSource: "dark-factory-journal",
          authoritative: false,
          terminalStateAdvanced: false,
          noResolvedCredentialValues: true,
          credentialValuesRedacted: true,
          doesAuthorizeRemoteExecution: false,
          cutoverReportSanitized: true,
        },
      });
      expect(JSON.stringify(evidence)).not.toContain("resolved-key");
      expect(JSON.stringify(evidence)).not.toContain("provider-key");
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  }, 20_000);

  it("fails closed when any required cutover gate is missing", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "df-cutover-result-fail-"));
    try {
      const inputPath = join(outDir, "CUTOVER_RESULT.json");
      const reportPath = join(outDir, "CUTOVER_EVIDENCE.json");
      const report = buildPassingCutoverReport();
      report.gates.postCutoverHealthReady = false;
      await writeFile(inputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

      const result = await run(["pnpm", "evidence:production-cutover", "--", "--input", inputPath, "--report", reportPath]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("postCutoverHealthReady must be true");
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  }, 20_000);
});

function buildPassingCutoverReport() {
  return {
    schemaVersion: 1,
    reportType: "dark-factory-production-cutover-result",
    checkedAt: "2026-05-03T12:39:11Z",
    ok: true,
    status: "pass",
    cutoverId: "cutover-linghucall-supervised-alpha",
    environment: "internal-alpha",
    gates: {
      supervisedShimGatePassed: true,
      productionPlanValidated: true,
      installReadinessPassed: true,
      postCutoverHealthReady: true,
      rollbackPlanVerified: true,
      journalBackupRecorded: true,
    },
    boundary: {
      truthSource: "dark-factory-journal",
      authoritative: false,
      terminalStateAdvanced: false,
      noResolvedCredentialValues: true,
      credentialValuesRedacted: true,
      cutoverReportSanitized: true,
    },
  };
}

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
