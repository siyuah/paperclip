import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };

describe("supervised shim gated attempt evidence script", () => {
  it("is exposed as a package script and keeps production readiness explicit", async () => {
    const source = await readFile("scripts/generate-supervised-shim-gated-attempt-evidence.mjs", "utf8");

    expect(packageJson.scripts["evidence:supervised-shim-gate"]).toBe("tsx scripts/generate-supervised-shim-gated-attempt-evidence.mjs");
    expect(source).toContain("linghucall-supervised-shim-gated-attempt-evidence");
    expect(source).toContain("production_deployment_plan_not_recorded");
    expect(source).toContain("noResolvedCredentialValues: true");
    expect(source).toContain("credentialValuesRedacted: true");
  });

  it("writes boundary-safe evidence from a sanitized passing supervised verifier report", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "df-supervised-shim-evidence-"));
    try {
      const inputPath = join(outDir, "SUPERVISED_VERIFIER.json");
      const reportPath = join(outDir, "SUPERVISED_SHIM_EVIDENCE.json");
      await writeFile(inputPath, `${JSON.stringify(buildPassingVerifierReport(), null, 2)}\n`, "utf8");

      const result = await run(["pnpm", "evidence:supervised-shim-gate", "--", "--input", inputPath, "--report", reportPath]);

      expect(result.exitCode).toBe(0);
      const summary = parseLastJsonObject(result.stdout);
      expect(summary).toMatchObject({
        ok: true,
        supervisedShimGatedAttemptRecorded: true,
        productionReady: false,
      });
      expect(summary.productionBlockers).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "production_deployment_plan_not_recorded" }),
      ]));

      const evidence = JSON.parse(await readFile(reportPath, "utf8"));
      expect(evidence).toMatchObject({
        schemaVersion: 1,
        reportType: "linghucall-supervised-shim-gated-attempt-evidence",
        packageName: "@paperclipai/plugin-dark-factory-bridge",
        supervisedService: {
          serviceName: "linghucall-provider-shim.service",
          active: true,
          operatorEnvFilePrivate: true,
          bridgeKeyFilePrivate: true,
        },
        healthcheck: {
          ok: true,
          endpointHost: "127.0.0.1:9791",
          status: "ready",
          providerCredentialValueRedacted: true,
        },
        paperclipGate: {
          attempted: true,
          providerStatusPassed: true,
          remoteGatedIntegrationPassed: true,
        },
        productionDecision: {
          supervisedShimGatedAttemptRecorded: true,
          supervisedShimGatedAttemptPassed: true,
          productionReady: false,
        },
        boundary: {
          truthSource: "dark-factory-journal",
          authoritative: false,
          terminalStateAdvanced: false,
          noResolvedCredentialValues: true,
          credentialValuesRedacted: true,
          sourceVerifierNoCredentialValuesRead: true,
          sourceVerifierNoCredentialValuesPrinted: true,
        },
      });
      expect(JSON.stringify(evidence)).not.toContain("resolved-key");
      expect(JSON.stringify(evidence)).not.toContain("provider-key");
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  }, 20_000);

  it("fails closed when the supervised verifier report did not run the Paperclip gate", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "df-supervised-shim-fail-"));
    try {
      const inputPath = join(outDir, "SUPERVISED_VERIFIER.json");
      const reportPath = join(outDir, "SUPERVISED_SHIM_EVIDENCE.json");
      const report = buildPassingVerifierReport();
      report.paperclipGateAttempted = false;
      report.checks = report.checks.filter((item) => !item.id.startsWith("paperclip_"));
      await writeFile(inputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

      const result = await run(["pnpm", "evidence:supervised-shim-gate", "--", "--input", inputPath, "--report", reportPath]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("paperclip gate must be attempted");
      expect(result.stderr).toContain("paperclip_provider_status_gate_passed must pass");
      expect(result.stderr).toContain("paperclip_remote_gated_test_passed must pass");
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  }, 20_000);
});

function buildPassingVerifierReport() {
  return {
    schemaVersion: 1,
    reportType: "linghucall-provider-shim-supervised-attempt",
    checkedAt: "2026-05-03T12:39:11Z",
    ok: true,
    status: "pass",
    endpoint: "http://127.0.0.1:9791",
    serviceName: "linghucall-provider-shim.service",
    paperclipGateAttempted: true,
    checks: [
      pass("systemd_user_service_active", { serviceName: "linghucall-provider-shim.service", systemctlStatus: "active" }),
      pass("operator_env_file_private", { exists: true, mode: "0o600" }),
      pass("bridge_key_file_private", { exists: true, mode: "0o600" }),
      pass("shim_health_ready", {
        endpointHost: "127.0.0.1:9791",
        status: "ready",
        protocolReleaseTag: "v3.0-agent-control-r1",
        providerKind: "linghucall_openai_compatible",
        providerCredentialValueRedacted: true,
      }),
      pass("paperclip_provider_status_gate_passed", { returnCode: 0 }),
      pass("paperclip_remote_gated_test_passed", { returnCode: 0 }),
    ],
    boundary: {
      truthSource: "dark-factory-journal",
      authoritative: false,
      terminalStateAdvanced: false,
      noCredentialValuesRead: true,
      noCredentialValuesPrinted: true,
      doesInstallService: false,
      contactsProviderViaShimOnly: true,
    },
  };
}

function pass(id: string, details: Record<string, unknown>) {
  return {
    id,
    ok: true,
    status: "pass",
    message: `${id} passed`,
    details,
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
