#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(scriptDir, "..");
const repoRoot = resolve(pluginRoot, "../../../..");
const defaultEvidencePath = join(repoRoot, "output/dark-factory-first-provider-preflight/evidence.json");
const defaultPacketPath = join(repoRoot, "output/dark-factory-first-provider-session/SESSION_PACKET.md");
const defaultManifestPath = join(repoRoot, "output/dark-factory-first-provider-handoff/MANIFEST.json");
const defaultOutDir = join(repoRoot, "output/dark-factory-first-provider-handoff");

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const evidencePath = resolve(options.evidencePath ?? defaultEvidencePath);
  const packetPath = resolve(options.packetPath ?? defaultPacketPath);
  const manifestPath = resolve(options.manifestPath ?? defaultManifestPath);
  const outDir = resolve(options.outDir ?? defaultOutDir);
  const reportPath = options.reportPath
    ? resolve(options.reportPath)
    : join(outDir, "VERIFY_REPORT.json");

  const evidenceText = await readFile(evidencePath, "utf8");
  const packetText = await readFile(packetPath, "utf8");
  const manifestText = await readFile(manifestPath, "utf8");
  const evidence = JSON.parse(evidenceText);
  const manifest = JSON.parse(manifestText);

  const report = verifyHandoff({
    evidence,
    evidencePath,
    evidenceText,
    packetPath,
    packetText,
    manifest,
    manifestPath,
    manifestText,
  });

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    ok: report.ok,
    reportPath,
    evidencePath,
    packetPath,
    manifestPath,
    failedReasons: report.failedReasons,
    boundary: report.boundary,
  }, null, 2));

  if (!report.ok && !options.allowNotReady) {
    process.exit(2);
  }
}

function parseArgs(args) {
  const parsed = {
    allowNotReady: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--evidence") {
      parsed.evidencePath = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--packet") {
      parsed.packetPath = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--manifest") {
      parsed.manifestPath = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--out") {
      parsed.outDir = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--report") {
      parsed.reportPath = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--allow-not-ready") {
      parsed.allowNotReady = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: pnpm verify:first-provider [--evidence PATH] [--packet PATH] [--manifest PATH] [--out DIR] [--report PATH] [--allow-not-ready]");
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function verifyHandoff({ evidence, evidencePath, evidenceText, packetPath, packetText, manifest, manifestPath, manifestText }) {
  const checks = [];
  const expectedEvidenceHash = sha256(evidenceText);
  const expectedPacketHash = sha256(packetText);
  const expectedManifestHash = sha256(manifestText);
  const failedReasons = [];

  addCheck(checks, "manifest_schema", manifest.schemaVersion === 1 && manifest.manifestType === "dark-factory-first-provider-handoff", "manifest schema and type match expected handoff contract");
  addCheck(checks, "manifest_ready", manifest.readyForGatedAttempt === true, "manifest marks handoff ready for gated attempt");
  addCheck(checks, "evidence_hash", manifest.artifacts?.evidence?.sha256 === expectedEvidenceHash, "manifest evidence SHA-256 matches evidence file");
  addCheck(checks, "packet_hash", manifest.artifacts?.sessionPacket?.sha256 === expectedPacketHash, "manifest session packet SHA-256 matches packet file");
  addCheck(checks, "artifact_paths", manifest.artifacts?.evidence?.path === evidencePath && manifest.artifacts?.sessionPacket?.path === packetPath, "manifest artifact paths match verifier inputs");
  addCheck(checks, "gated_default_skip", evidence.gatedIntegrationDefaultSkip === true && manifest.gatedIntegrationDefaultSkip === true, "gated integration default skip is confirmed");
  addCheck(checks, "required_command_order", hasRequiredCommandOrder(manifest.requiredCommandOrder), "manifest preserves required offline command order before gated test");
  addCheck(checks, "packet_ready_marker", packetText.includes("ready for gated attempt: yes"), "session packet is marked ready");
  addCheck(checks, "packet_truth_marker", packetText.includes("Dark Factory Journal remains truth source"), "session packet restates Journal truth boundary");
  addCheck(checks, "no_manifest_output_tails", !manifestText.includes("outputTail"), "manifest does not embed raw command output tails");
  addCheck(checks, "handoff_constraints", verifyOperatorHandoff(manifest.operatorHandoff), "operator handoff constraints are non-authoritative and no-secret");
  addCheck(checks, "boundary", verifyBoundary(manifest.boundary), "manifest boundary assertions preserve projection-only behavior");

  for (const check of checks) {
    if (!check.ok) {
      failedReasons.push(check.message);
    }
  }

  return {
    schemaVersion: 1,
    reportType: "dark-factory-first-provider-handoff-verification",
    generatedAt: new Date().toISOString(),
    ok: failedReasons.length === 0,
    failedReasons,
    artifacts: {
      evidence: {
        path: safeText(evidencePath),
        sha256: expectedEvidenceHash,
      },
      sessionPacket: {
        path: safeText(packetPath),
        sha256: expectedPacketHash,
      },
      manifest: {
        path: safeText(manifestPath),
        sha256: expectedManifestHash,
      },
    },
    checks,
    boundary: {
      truthSource: manifest.boundary?.truthSource ?? null,
      authoritative: manifest.boundary?.authoritative ?? null,
      terminalStateAdvanced: manifest.boundary?.terminalStateAdvanced ?? null,
      doesAuthorizeRemoteExecution: manifest.boundary?.doesAuthorizeRemoteExecution ?? null,
      shouldContactRemoteProviderDuringDryRun: manifest.boundary?.shouldContactRemoteProviderDuringDryRun ?? null,
      noResolvedCredentialValues: manifest.boundary?.noResolvedCredentialValues ?? null,
    },
    operatorHandoff: {
      includeRawCommandOutputTails: false,
      includeResolvedCredentialValues: false,
      doesAuthorizeRemoteExecution: false,
    },
    truthStatement: "Dark Factory Journal remains truth source.",
  };
}

function addCheck(checks, id, ok, message) {
  checks.push({
    id,
    ok,
    status: ok ? "pass" : "fail",
    message,
  });
}

function hasRequiredCommandOrder(order) {
  if (!Array.isArray(order)) return false;
  const required = [
    "pnpm preflight:first-provider",
    "pnpm packet:first-provider",
    "pnpm bundle:first-provider",
    "export DARK_FACTORY_REMOTE_INTEGRATION=1 only after operator approval",
    "pnpm test -- tests/remote-gated-integration.spec.ts",
  ];
  return required.every((command, index) => order[index] === command);
}

function verifyOperatorHandoff(value) {
  return value?.packetRequired === true
    && value?.endpointHostOnly === true
    && value?.credentialReferenceNameOnly === true
    && value?.includeRawCommandOutputTails === false
    && value?.includeResolvedCredentialValues === false
    && value?.doesAuthorizeRemoteExecution === false;
}

function verifyBoundary(value) {
  return value?.truthSource === "dark-factory-journal"
    && value?.authoritative === false
    && value?.terminalStateAdvanced === false
    && value?.doesAuthorizeRemoteExecution === false
    && value?.shouldContactRemoteProviderDuringDryRun === false
    && value?.noResolvedCredentialValues === true;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeText(value) {
  if (value === null || value === undefined) return value;
  return String(value)
    .replace(/(api[_-]?key|token|password|secret|connection_string)\s*[:=]\s*["']?[^"'\s,}]+/gi, "$1=<redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer <redacted>");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
