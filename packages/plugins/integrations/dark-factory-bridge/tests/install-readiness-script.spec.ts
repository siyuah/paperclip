import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };

describe("install readiness script", () => {
  it("is exposed as a package script and distinguishes alpha readiness from production readiness", async () => {
    const source = await readFile("scripts/run-install-readiness.mjs", "utf8");

    expect(packageJson.scripts["install:readiness"]).toBe("tsx scripts/run-install-readiness.mjs");
    expect(source).toContain("installableAlphaReady");
    expect(source).toContain("productionReady");
    expect(source).toContain("productionBlockers");
    expect(source).toContain("manifest_identity_contains_example");
    expect(source).toContain("install_distribution_policy");
    expect(source).toContain("host_secret_resolver_contract");
    expect(source).toContain("ui_beta_install_evidence");
    expect(source).toContain("alpha_install_handoff_manifest");
    expect(source).toContain("real_provider_gated_attempt_evidence");
    expect(source).toContain("linghucall_shim_operationalization_evidence");
    expect(source).toContain("supervised_shim_gated_attempt_evidence");
    expect(source).toContain("supervised_shim_gated_attempt_not_recorded");
    expect(source).toContain("production_deployment_plan_not_recorded");
  });

  it("writes an alpha-ready report while preserving production blockers", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "df-install-readiness-"));
    try {
      const reportPath = join(outDir, "INSTALL_READINESS.json");
      const result = await run(["pnpm", "install:readiness", "--", "--report", reportPath]);

      expect(result.exitCode).toBe(0);
      const summary = parseLastJsonObject(result.stdout);
      expect(summary).toMatchObject({
        ok: true,
        installableAlphaReady: true,
        productionReady: false,
      });
      expect(summary.productionBlockers).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "supervised_shim_gated_attempt_not_recorded" }),
      ]));
      expect(summary.productionBlockers).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "provider_shim_not_operationalized" }),
      ]));
      expect(summary.productionBlockers).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "real_provider_gated_attempt_not_completed" }),
      ]));
      expect(summary.productionBlockers).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "database_namespace_contains_poc" }),
      ]));
      expect(summary.productionBlockers).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "manifest_identity_contains_example" }),
      ]));
      expect(summary.productionBlockers).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "package_private_publish_policy_pending" }),
      ]));
      expect(summary.productionBlockers).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "host_secret_resolver_pending" }),
      ]));
      expect(summary.productionBlockers).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "ui_full_internal_beta_not_completed" }),
      ]));

      const report = JSON.parse(await readFile(reportPath, "utf8"));
      expect(report).toMatchObject({
        schemaVersion: 1,
        reportType: "dark-factory-install-readiness",
        packageName: "@paperclipai/plugin-dark-factory-bridge",
        manifestId: "paperclipai.dark-factory-bridge",
        installableAlphaReady: true,
        productionReady: false,
        installDistributionPolicy: {
          distributionMode: "fork-local-workspace",
          packagePrivateExpected: true,
          npmPublish: false,
        },
        boundary: {
          truthSource: "dark-factory-journal",
          authoritative: false,
          terminalStateAdvanced: false,
          doesAuthorizeRemoteExecution: false,
          noResolvedCredentialValues: true,
        },
      });
      expect(report.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "manifest_schema", status: "pass" }),
        expect.objectContaining({ id: "worker_pointer", status: "pass" }),
        expect.objectContaining({ id: "ui_pointer", status: "pass" }),
        expect.objectContaining({ id: "mock_driver", status: "pass" }),
        expect.objectContaining({ id: "install_distribution_policy", status: "pass" }),
        expect.objectContaining({ id: "host_secret_resolver_contract", status: "pass" }),
        expect.objectContaining({ id: "ui_beta_install_evidence", status: "pass" }),
        expect.objectContaining({ id: "alpha_install_handoff_manifest", status: "pass" }),
        expect.objectContaining({ id: "real_provider_gated_attempt_evidence", status: "pass" }),
        expect.objectContaining({ id: "linghucall_shim_operationalization_evidence", status: "pass" }),
        expect.objectContaining({ id: "supervised_shim_gated_attempt_evidence", status: "pass" }),
      ]));
      expect(report.artifacts.realProviderGatedAttemptEvidence).toBe("docs/real-provider-gated-attempt-evidence.json");
      expect(report.artifacts.linghuCallShimOperationalizationEvidence).toBe("docs/linghucall-shim-operationalization-evidence.json");
      expect(report.artifacts.supervisedShimGatedAttemptEvidence).toBe("docs/supervised-shim-gated-attempt-evidence.json");
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
