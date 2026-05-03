import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };

describe("first provider handoff verifier script", () => {
  it("is exposed as a package script and verifies hashes, order, and boundaries", async () => {
    const source = await readFile("scripts/verify-first-provider-handoff.mjs", "utf8");

    expect(packageJson.scripts["verify:first-provider"]).toBe("tsx scripts/verify-first-provider-handoff.mjs");
    expect(source).toContain("evidence SHA-256 matches evidence file");
    expect(source).toContain("hasRequiredCommandOrder");
    expect(source).toContain("verifyOperatorHandoff");
    expect(source).toContain("verifyBoundary");
  });

  it("writes a passing verification report for a valid handoff bundle", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "df-first-provider-verify-"));
    try {
      const evidenceText = JSON.stringify(createEvidence(), null, 2);
      const packetText = createPacket();
      const evidencePath = join(outDir, "evidence.json");
      const packetPath = join(outDir, "SESSION_PACKET.md");
      const manifestPath = join(outDir, "MANIFEST.json");
      const reportPath = join(outDir, "VERIFY_REPORT.json");
      await writeFile(evidencePath, evidenceText, "utf8");
      await writeFile(packetPath, packetText, "utf8");
      await writeFile(manifestPath, JSON.stringify(createManifest({
        evidencePath,
        evidenceText,
        packetPath,
        packetText,
      }), null, 2), "utf8");

      const result = await run([
        "pnpm",
        "verify:first-provider",
        "--",
        "--evidence",
        evidencePath,
        "--packet",
        packetPath,
        "--manifest",
        manifestPath,
        "--report",
        reportPath,
      ]);

      expect(result.exitCode).toBe(0);
      const summary = parseLastJsonObject(result.stdout);
      expect(summary).toMatchObject({
        ok: true,
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

      const report = JSON.parse(await readFile(reportPath, "utf8"));
      expect(report.ok).toBe(true);
      expect(report.artifacts.evidence.sha256).toBe(sha256(evidenceText));
      expect(report.artifacts.sessionPacket.sha256).toBe(sha256(packetText));
      expect(report.artifacts.manifest.sha256).toBe(sha256(await readFile(manifestPath, "utf8")));
      expect(report.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "evidence_hash", status: "pass" }),
        expect.objectContaining({ id: "packet_hash", status: "pass" }),
        expect.objectContaining({ id: "required_command_order", status: "pass" }),
        expect.objectContaining({ id: "boundary", status: "pass" }),
      ]));
      expect(JSON.stringify(report)).not.toContain("outputTail");
      expect(JSON.stringify(report)).not.toContain("should-not-appear");
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("fails verification when the packet hash no longer matches the manifest", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "df-first-provider-verify-hash-"));
    try {
      const evidenceText = JSON.stringify(createEvidence(), null, 2);
      const packetText = createPacket();
      const evidencePath = join(outDir, "evidence.json");
      const packetPath = join(outDir, "SESSION_PACKET.md");
      const manifestPath = join(outDir, "MANIFEST.json");
      const reportPath = join(outDir, "VERIFY_REPORT.json");
      await writeFile(evidencePath, evidenceText, "utf8");
      await writeFile(packetPath, `${packetText}\nchanged after manifest\n`, "utf8");
      await writeFile(manifestPath, JSON.stringify(createManifest({
        evidencePath,
        evidenceText,
        packetPath,
        packetText,
      }), null, 2), "utf8");

      const result = await run([
        "pnpm",
        "verify:first-provider",
        "--",
        "--evidence",
        evidencePath,
        "--packet",
        packetPath,
        "--manifest",
        manifestPath,
        "--report",
        reportPath,
        "--allow-not-ready",
      ]);

      expect(result.exitCode).toBe(0);
      const summary = parseLastJsonObject(result.stdout);
      expect(summary.ok).toBe(false);
      expect(summary.failedReasons).toContain("manifest session packet SHA-256 matches packet file");
      const report = JSON.parse(await readFile(reportPath, "utf8"));
      expect(report.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "packet_hash", status: "fail" }),
      ]));
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("fails verification when command order moves remote integration before offline bundle checks", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "df-first-provider-verify-order-"));
    try {
      const evidenceText = JSON.stringify(createEvidence(), null, 2);
      const packetText = createPacket();
      const evidencePath = join(outDir, "evidence.json");
      const packetPath = join(outDir, "SESSION_PACKET.md");
      const manifestPath = join(outDir, "MANIFEST.json");
      await writeFile(evidencePath, evidenceText, "utf8");
      await writeFile(packetPath, packetText, "utf8");
      const manifest = createManifest({ evidencePath, evidenceText, packetPath, packetText });
      manifest.requiredCommandOrder = [
        "export DARK_FACTORY_REMOTE_INTEGRATION=1 only after operator approval",
        "pnpm preflight:first-provider",
        "pnpm packet:first-provider",
        "pnpm bundle:first-provider",
        "pnpm test -- tests/remote-gated-integration.spec.ts",
      ];
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

      const result = await run([
        "pnpm",
        "verify:first-provider",
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
      expect(summary.ok).toBe(false);
      expect(summary.failedReasons).toContain("manifest preserves required offline command order before gated test");
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });
});

function createEvidence() {
  return {
    schemaVersion: 1,
    generatedAt: "2026-05-03T00:00:00.000Z",
    branch: "fork-master-product",
    commit: "0123456789abcdef",
    checks: [
      { id: "typecheck", ok: true, status: "pass", outputTail: "should-not-appear" },
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

function createManifest({ evidencePath, evidenceText, packetPath, packetText }: {
  evidencePath: string;
  evidenceText: string;
  packetPath: string;
  packetText: string;
}) {
  return {
    schemaVersion: 1,
    manifestType: "dark-factory-first-provider-handoff",
    readyForGatedAttempt: true,
    failedReasons: [],
    artifacts: {
      evidence: {
        path: evidencePath,
        sha256: sha256(evidenceText),
      },
      sessionPacket: {
        path: packetPath,
        sha256: sha256(packetText),
      },
    },
    requiredCommandOrder: [
      "pnpm preflight:first-provider",
      "pnpm packet:first-provider",
      "pnpm bundle:first-provider",
      "export DARK_FACTORY_REMOTE_INTEGRATION=1 only after operator approval",
      "pnpm test -- tests/remote-gated-integration.spec.ts",
    ],
    gatedIntegrationDefaultSkip: true,
    operatorHandoff: {
      packetRequired: true,
      endpointHostOnly: true,
      credentialReferenceNameOnly: true,
      includeRawCommandOutputTails: false,
      includeResolvedCredentialValues: false,
      doesAuthorizeRemoteExecution: false,
    },
    boundary: {
      truthSource: "dark-factory-journal",
      authoritative: false,
      terminalStateAdvanced: false,
      doesAuthorizeRemoteExecution: false,
      shouldContactRemoteProviderDuringDryRun: false,
      noResolvedCredentialValues: true,
    },
  };
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
