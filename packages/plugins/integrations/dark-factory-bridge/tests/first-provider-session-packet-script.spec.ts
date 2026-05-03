import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };

describe("first provider session packet script", () => {
  it("is exposed as a package script and omits raw command output tails", async () => {
    const source = await readFile("scripts/generate-first-provider-session-packet.mjs", "utf8");

    expect(packageJson.scripts["packet:first-provider"]).toBe("tsx scripts/generate-first-provider-session-packet.mjs");
    expect(source).toContain("Raw command output tails are intentionally omitted");
    expect(source).toContain("doesAuthorizeRemoteExecution");
    expect(source).toContain("shouldContactRemoteProviderDuringDryRun");
    expect(source).toContain("noResolvedCredentialValues");
  });

  it("generates a ready operator packet from passing preflight evidence", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "df-first-provider-session-"));
    try {
      const evidencePath = join(outDir, "evidence.json");
      const packetPath = join(outDir, "SESSION_PACKET.md");
      await writeFile(evidencePath, JSON.stringify(createEvidence(), null, 2), "utf8");

      const result = await run(["pnpm", "packet:first-provider", "--", "--evidence", evidencePath, "--packet", packetPath]);

      expect(result.exitCode).toBe(0);
      const summary = parseLastJsonObject(result.stdout);
      expect(summary).toMatchObject({
        ok: true,
        readyForGatedAttempt: true,
        failedReasons: [],
        boundary: {
          truthSource: "dark-factory-journal",
          authoritative: false,
          terminalStateAdvanced: false,
          doesAuthorizeRemoteExecution: false,
          shouldContactRemoteProviderDuringDryRun: false,
          noResolvedCredentialValues: true,
        },
      });

      const packet = await readFile(packetPath, "utf8");
      expect(packet).toContain("# Dark Factory First Provider Operator Session Packet");
      expect(packet).toContain("ready for gated attempt: yes");
      expect(packet).toContain("| `typecheck` | pass | yes |");
      expect(packet).toContain("provider endpoint host only");
      expect(packet).toContain("Dark Factory Journal remains truth source");
      expect(packet).not.toContain("outputTail");
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("marks the packet not ready when required boundaries drift", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "df-first-provider-session-not-ready-"));
    try {
      const evidencePath = join(outDir, "evidence.json");
      const packetPath = join(outDir, "SESSION_PACKET.md");
      const evidence = createEvidence();
      evidence.boundary.authoritative = true;
      await writeFile(evidencePath, JSON.stringify(evidence, null, 2), "utf8");

      const result = await run([
        "pnpm",
        "packet:first-provider",
        "--",
        "--evidence",
        evidencePath,
        "--packet",
        packetPath,
        "--allow-not-ready",
      ]);

      expect(result.exitCode).toBe(0);
      const summary = parseLastJsonObject(result.stdout);
      expect(summary.readyForGatedAttempt).toBe(false);
      expect(summary.failedReasons).toContain("authoritative boundary is not false");

      const packet = await readFile(packetPath, "utf8");
      expect(packet).toContain("ready for gated attempt: no");
      expect(packet).toContain("authoritative boundary is not false");
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("redacts secret-like values before writing the packet", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "df-first-provider-session-redact-"));
    try {
      const evidencePath = join(outDir, "evidence.json");
      const packetPath = join(outDir, "SESSION_PACKET.md");
      const evidence = createEvidence({
        branch: "branch-with-token=should-not-appear",
      });
      await writeFile(evidencePath, JSON.stringify(evidence, null, 2), "utf8");

      const result = await run(["pnpm", "packet:first-provider", "--", "--evidence", evidencePath, "--packet", packetPath]);

      expect(result.exitCode).toBe(0);
      const packet = await readFile(packetPath, "utf8");
      expect(packet).toContain("token=<redacted>");
      expect(packet).not.toContain("should-not-appear");
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });
});

function createEvidence(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    generatedAt: "2026-05-03T00:00:00.000Z",
    branch: "fork-master-product",
    commit: "0123456789abcdef",
    checks: [
      { id: "typecheck", ok: true, status: "pass" },
      { id: "build", ok: true, status: "pass" },
      { id: "test", ok: true, status: "pass" },
      { id: "ui_browser_smoke", ok: true, status: "pass" },
      { id: "v3_bundle_validation", ok: true, status: "pass" },
      { id: "gated_integration_default_skip", ok: true, status: "pass", skippedByDefault: true },
    ],
    dryRunSummary: {
      available: true,
      ok: true,
      scenarioCount: 4,
      truthSource: "dark-factory-journal",
      authoritative: false,
      terminalStateAdvanced: false,
    },
    gatedIntegrationDefaultSkip: true,
    boundary: {
      truthSource: "dark-factory-journal",
      authoritative: false,
      terminalStateAdvanced: false,
      doesAuthorizeRemoteExecution: false,
      shouldContactRemoteProviderDuringDryRun: false,
      noResolvedCredentialValues: true,
    },
    ...overrides,
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
  const jsonText = start >= 0 ? trimmed.slice(start + 1) : trimmed;
  return JSON.parse(jsonText);
}
