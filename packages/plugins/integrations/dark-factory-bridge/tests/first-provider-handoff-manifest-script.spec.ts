import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };

describe("first provider handoff manifest script", () => {
  it("is exposed as a package script and references the handoff boundaries", async () => {
    const source = await readFile("scripts/generate-first-provider-handoff-manifest.mjs", "utf8");

    expect(packageJson.scripts["bundle:first-provider"]).toBe("tsx scripts/generate-first-provider-handoff-manifest.mjs");
    expect(source).toContain("dark-factory-first-provider-handoff");
    expect(source).toContain("includeRawCommandOutputTails: false");
    expect(source).toContain("includeResolvedCredentialValues: false");
    expect(source).toContain("doesAuthorizeRemoteExecution: false");
  });

  it("generates a ready handoff manifest from preflight evidence and session packet", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "df-first-provider-handoff-"));
    try {
      const evidence = JSON.stringify(createEvidence(), null, 2);
      const packet = createPacket();
      const evidencePath = join(outDir, "evidence.json");
      const packetPath = join(outDir, "SESSION_PACKET.md");
      const manifestPath = join(outDir, "MANIFEST.json");
      await writeFile(evidencePath, evidence, "utf8");
      await writeFile(packetPath, packet, "utf8");

      const result = await run([
        "pnpm",
        "bundle:first-provider",
        "--",
        "--evidence",
        evidencePath,
        "--packet",
        packetPath,
        "--manifest",
        manifestPath,
      ]);

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

      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      expect(manifest).toMatchObject({
        schemaVersion: 1,
        manifestType: "dark-factory-first-provider-handoff",
        readyForGatedAttempt: true,
        gatedIntegrationDefaultSkip: true,
        operatorHandoff: {
          packetRequired: true,
          endpointHostOnly: true,
          credentialReferenceNameOnly: true,
          includeRawCommandOutputTails: false,
          includeResolvedCredentialValues: false,
          doesAuthorizeRemoteExecution: false,
        },
      });
      expect(manifest.artifacts.evidence.sha256).toBe(sha256(evidence));
      expect(manifest.artifacts.sessionPacket.sha256).toBe(sha256(packet));
      expect(JSON.stringify(manifest)).not.toContain("outputTail");
      expect(JSON.stringify(manifest)).not.toContain("Bearer should-not-appear");
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("marks the manifest not ready if the session packet is not ready", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "df-first-provider-handoff-not-ready-"));
    try {
      const evidencePath = join(outDir, "evidence.json");
      const packetPath = join(outDir, "SESSION_PACKET.md");
      const manifestPath = join(outDir, "MANIFEST.json");
      await writeFile(evidencePath, JSON.stringify(createEvidence(), null, 2), "utf8");
      await writeFile(packetPath, createPacket().replace("ready for gated attempt: yes", "ready for gated attempt: no"), "utf8");

      const result = await run([
        "pnpm",
        "bundle:first-provider",
        "--",
        "--evidence",
        evidencePath,
        "--packet",
        packetPath,
        "--manifest",
        manifestPath,
        "--allow-not-ready",
      ]);

      expect(result.exitCode).toBe(0);
      const summary = parseLastJsonObject(result.stdout);
      expect(summary.readyForGatedAttempt).toBe(false);
      expect(summary.failedReasons).toContain("session packet does not mark the gated attempt ready");
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("redacts secret-like text in manifest source fields", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "df-first-provider-handoff-redact-"));
    try {
      const evidencePath = join(outDir, "evidence.json");
      const packetPath = join(outDir, "SESSION_PACKET.md");
      const manifestPath = join(outDir, "MANIFEST.json");
      await writeFile(evidencePath, JSON.stringify(createEvidence({
        branch: "branch-token=should-not-appear",
      }), null, 2), "utf8");
      await writeFile(packetPath, createPacket(), "utf8");

      const result = await run([
        "pnpm",
        "bundle:first-provider",
        "--",
        "--evidence",
        evidencePath,
        "--packet",
        packetPath,
        "--manifest",
        manifestPath,
      ]);

      expect(result.exitCode).toBe(0);
      const manifest = await readFile(manifestPath, "utf8");
      expect(manifest).toContain("token=<redacted>");
      expect(manifest).not.toContain("should-not-appear");
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

function createPacket() {
  return [
    "# Dark Factory First Provider Operator Session Packet",
    "",
    "- ready for gated attempt: yes",
    "",
    "| authoritative | `false` | `false` |",
    "| terminalStateAdvanced | `false` | `false` |",
    "",
    "Dark Factory Journal remains truth source.",
  ].join("\n");
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
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
