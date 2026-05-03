import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };

describe("UI beta install evidence script", () => {
  it("is exposed as a package script", async () => {
    const source = await readFile("scripts/generate-ui-beta-install-evidence.mjs", "utf8");

    expect(packageJson.scripts["evidence:ui-beta"]).toBe("tsx scripts/generate-ui-beta-install-evidence.mjs");
    expect(source).toContain("dark-factory-ui-beta-install-evidence");
    expect(source).toContain("uiInternalBetaReady");
    expect(source).toContain("remote-provider-ui-smoke-preview");
    expect(source).toContain("DARK_FACTORY_UI_SMOKE_CHROMIUM");
  });

  it("writes deterministic boundary-safe UI beta evidence", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "df-ui-beta-evidence-"));
    try {
      const reportPath = join(outDir, "UI_BETA_INSTALL_EVIDENCE.json");
      const result = await run(["pnpm", "evidence:ui-beta", "--", "--report", reportPath]);

      expect(result.exitCode).toBe(0);
      const summary = parseLastJsonObject(result.stdout);
      expect(summary).toMatchObject({
        ok: true,
        uiInternalBetaReady: true,
        failedChecks: [],
      });

      const report = JSON.parse(await readFile(reportPath, "utf8"));
      expect(report).toMatchObject({
        schemaVersion: 1,
        reportType: "dark-factory-ui-beta-install-evidence",
        packageName: "@paperclipai/plugin-dark-factory-bridge",
        manifestId: "paperclipai.dark-factory-bridge",
        uiInternalBetaReady: true,
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
        expect.objectContaining({ id: "ui_slot_dashboard", status: "pass" }),
        expect.objectContaining({ id: "ui_slot_detail", status: "pass" }),
        expect.objectContaining({ id: "ui_slot_settings", status: "pass" }),
        expect.objectContaining({ id: "settings_preview_data_key", status: "pass" }),
        expect.objectContaining({ id: "browser_harness_scenarios", status: "pass" }),
        expect.objectContaining({ id: "preview_boundaries", status: "pass" }),
      ]));
      expect(report.scenarios.map((item: { scenario: string }) => item.scenario)).toEqual([
        "healthy",
        "warning_latency",
        "blocked_failures",
        "stale_readiness",
      ]);
      expect(JSON.stringify(report)).not.toContain("ui-smoke-preview-placeholder-not-a-secret");
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
