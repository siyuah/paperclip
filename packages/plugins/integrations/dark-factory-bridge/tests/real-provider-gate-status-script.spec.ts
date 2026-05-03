import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };

describe("real provider gate status script", () => {
  it("is exposed as a package script and does not authorize remote execution", async () => {
    const source = await readFile("scripts/generate-real-provider-gate-status.mjs", "utf8");

    expect(packageJson.scripts["gate:provider-status"]).toBe("tsx scripts/generate-real-provider-gate-status.mjs");
    expect(source).toContain("dark-factory-real-provider-gate-status");
    expect(source).toContain("gatedTestWillRun");
    expect(source).toContain("doesAuthorizeRemoteExecution: false");
    expect(source).toContain("noResolvedCredentialValues: true");
    expect(source).toContain("real-provider-gated-attempt-evidence.json");
    expect(source).toContain("provider_shim_not_operationalized");
  });

  it("reports default skip when operator gate inputs are absent", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "df-provider-gate-status-"));
    try {
      const reportPath = join(outDir, "GATE_STATUS.json");
      const result = await run(["pnpm", "gate:provider-status", "--", "--report", reportPath], {
        DARK_FACTORY_REMOTE_INTEGRATION: undefined,
        DARK_FACTORY_REMOTE_ENDPOINT: undefined,
        DARK_FACTORY_REMOTE_API_KEY: undefined,
        DARK_FACTORY_REMOTE_API_KEY_ENV: undefined,
      });

      expect(result.exitCode).toBe(0);
      const summary = parseLastJsonObject(result.stdout);
      expect(summary).toMatchObject({
        ok: true,
        gatedTestWillRun: false,
        defaultSkipExpected: true,
        readyForOperatorGatedAttempt: false,
        productionReady: false,
      });

      const report = JSON.parse(await readFile(reportPath, "utf8"));
      expect(report).toMatchObject({
        schemaVersion: 1,
        reportType: "dark-factory-real-provider-gate-status",
        packageName: "@paperclipai/plugin-dark-factory-bridge",
        decisions: {
          gatedTestWillRun: false,
          defaultSkipExpected: true,
          readyForOperatorGatedAttempt: false,
          shouldContactRemoteProviderIfGatedTestRuns: false,
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
      expect(report.decisions).toMatchObject({
        realProviderGatedAttemptResultRecorded: true,
        realProviderGatedAttemptPassed: true,
      });
      expect(report.recordedGatedAttempt).toMatchObject({
        recorded: true,
        passed: true,
        evidence: {
          attemptKind: "linghucall-shim-backed",
          providerBackendKind: "openai-compatible-chat-completions",
          bridgeEndpointKind: "local-dark-factory-external-runs-shim",
          credentialValuesRedacted: true,
        },
      });
      expect(report.productionBlockers).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "provider_shim_not_operationalized" }),
      ]));
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  }, 20_000);

  it("reports that the gated test will run without printing endpoint or credential values", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "df-provider-gate-ready-"));
    const endpoint = "https://provider.example.internal";
    const credential = "super-secret-provider-key";
    try {
      const reportPath = join(outDir, "GATE_STATUS.json");
      const result = await run(["pnpm", "gate:provider-status", "--", "--report", reportPath], {
        DARK_FACTORY_REMOTE_INTEGRATION: "1",
        DARK_FACTORY_REMOTE_ENDPOINT: endpoint,
        DARK_FACTORY_REMOTE_API_KEY: credential,
        DARK_FACTORY_REMOTE_API_KEY_ENV: undefined,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain(endpoint);
      expect(result.stdout).not.toContain(credential);

      const reportText = await readFile(reportPath, "utf8");
      expect(reportText).not.toContain(endpoint);
      expect(reportText).not.toContain(credential);
      const report = JSON.parse(reportText);
      expect(report.decisions).toMatchObject({
        gatedTestWillRun: true,
        defaultSkipExpected: false,
        readyForOperatorGatedAttempt: true,
        shouldContactRemoteProviderIfGatedTestRuns: true,
      });
      expect(report.inputSignals.endpoint).toMatchObject({
        present: true,
        length: endpoint.length,
        valueRedacted: true,
      });
      expect(report.inputSignals.directCredential).toMatchObject({
        present: true,
        valueRedacted: true,
      });
      expect(report.inputSignals.directCredential).not.toHaveProperty("length");
      expect(report.decisions).toMatchObject({
        realProviderGatedAttemptResultRecorded: true,
        realProviderGatedAttemptPassed: true,
      });
      expect(report.productionBlockers).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "provider_shim_not_operationalized" }),
      ]));
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  }, 20_000);

  it("can fail closed when --require-ready is used without gate inputs", async () => {
    const result = await run(["pnpm", "gate:provider-status", "--", "--require-ready"], {
      DARK_FACTORY_REMOTE_INTEGRATION: undefined,
      DARK_FACTORY_REMOTE_ENDPOINT: undefined,
      DARK_FACTORY_REMOTE_API_KEY: undefined,
      DARK_FACTORY_REMOTE_API_KEY_ENV: undefined,
    });

    expect(result.exitCode).toBe(2);
    const summary = parseLastJsonObject(result.stdout);
    expect(summary.readyForOperatorGatedAttempt).toBe(false);
  }, 20_000);
});

function run(command: string[], envOverrides: Record<string, string | undefined> = {}): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolveRun) => {
    const env = { ...process.env };
    for (const [key, value] of Object.entries(envOverrides)) {
      if (value === undefined) {
        delete env[key];
      } else {
        env[key] = value;
      }
    }
    const child = spawn(command[0]!, command.slice(1), {
      cwd: process.cwd(),
      env,
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
