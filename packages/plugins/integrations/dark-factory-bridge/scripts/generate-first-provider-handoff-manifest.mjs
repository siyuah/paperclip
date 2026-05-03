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
const defaultOutDir = join(repoRoot, "output/dark-factory-first-provider-handoff");

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const evidencePath = resolve(options.evidencePath ?? defaultEvidencePath);
  const packetPath = resolve(options.packetPath ?? defaultPacketPath);
  const outDir = resolve(options.outDir ?? defaultOutDir);
  const manifestPath = options.manifestPath
    ? resolve(options.manifestPath)
    : join(outDir, "MANIFEST.json");

  const evidenceText = await readFile(evidencePath, "utf8");
  const packetText = await readFile(packetPath, "utf8");
  const evidence = JSON.parse(evidenceText);
  const assessment = assessHandoff(evidence, packetText);
  const manifest = renderManifest({
    evidence,
    evidencePath,
    evidenceText,
    packetPath,
    packetText,
    assessment,
  });

  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    ok: manifest.readyForGatedAttempt,
    manifestPath,
    evidencePath,
    packetPath,
    readyForGatedAttempt: manifest.readyForGatedAttempt,
    failedReasons: manifest.failedReasons,
    boundary: manifest.boundary,
  }, null, 2));

  if (!manifest.readyForGatedAttempt && !options.allowNotReady) {
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
    if (arg === "--out") {
      parsed.outDir = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--manifest") {
      parsed.manifestPath = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--allow-not-ready") {
      parsed.allowNotReady = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: pnpm bundle:first-provider [--evidence PATH] [--packet PATH] [--out DIR] [--manifest PATH] [--allow-not-ready]");
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function assessHandoff(evidence, packetText) {
  const failedReasons = [];
  const checks = Array.isArray(evidence.checks) ? evidence.checks : [];
  const boundary = {
    truthSource: evidence.boundary?.truthSource ?? null,
    authoritative: evidence.boundary?.authoritative ?? null,
    terminalStateAdvanced: evidence.boundary?.terminalStateAdvanced ?? null,
    doesAuthorizeRemoteExecution: evidence.boundary?.doesAuthorizeRemoteExecution ?? null,
    shouldContactRemoteProviderDuringDryRun: evidence.boundary?.shouldContactRemoteProviderDuringDryRun ?? null,
    noResolvedCredentialValues: evidence.boundary?.noResolvedCredentialValues ?? null,
  };

  for (const check of checks) {
    if (check?.ok !== true && check?.status !== "skipped") {
      failedReasons.push(`check ${check?.id ?? "unknown"} did not pass`);
    }
  }
  if (evidence.gatedIntegrationDefaultSkip !== true) {
    failedReasons.push("gated integration default skip was not confirmed");
  }
  if (!packetText.includes("ready for gated attempt: yes")) {
    failedReasons.push("session packet does not mark the gated attempt ready");
  }
  if (!packetText.includes("Dark Factory Journal remains truth source")) {
    failedReasons.push("session packet does not restate Journal truth boundary");
  }
  if (boundary.truthSource !== "dark-factory-journal") {
    failedReasons.push("truth source is not dark-factory-journal");
  }
  if (boundary.authoritative !== false) {
    failedReasons.push("authoritative boundary is not false");
  }
  if (boundary.terminalStateAdvanced !== false) {
    failedReasons.push("terminalStateAdvanced boundary is not false");
  }
  if (boundary.doesAuthorizeRemoteExecution !== false) {
    failedReasons.push("handoff must not authorize remote execution");
  }
  if (boundary.shouldContactRemoteProviderDuringDryRun !== false) {
    failedReasons.push("dry run must not contact remote provider");
  }
  if (boundary.noResolvedCredentialValues !== true) {
    failedReasons.push("evidence did not assert absence of resolved credential values");
  }

  return {
    readyForGatedAttempt: failedReasons.length === 0,
    failedReasons,
    boundary,
  };
}

function renderManifest({ evidence, evidencePath, evidenceText, packetPath, packetText, assessment }) {
  const checks = Array.isArray(evidence.checks) ? evidence.checks : [];
  return {
    schemaVersion: 1,
    manifestType: "dark-factory-first-provider-handoff",
    generatedAt: new Date().toISOString(),
    readyForGatedAttempt: assessment.readyForGatedAttempt,
    failedReasons: assessment.failedReasons,
    source: {
      branch: safeText(evidence.branch ?? null),
      commit: safeText(evidence.commit ?? null),
      evidenceGeneratedAt: safeText(evidence.generatedAt ?? null),
      evidenceSchemaVersion: evidence.schemaVersion ?? null,
    },
    artifacts: {
      evidence: {
        path: safeText(evidencePath),
        sha256: sha256(evidenceText),
      },
      sessionPacket: {
        path: safeText(packetPath),
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
    checks: checks.map((check) => ({
      id: safeText(check?.id ?? "unknown"),
      status: safeText(check?.status ?? "unknown"),
      ok: check?.ok === true,
      skippedByDefault: check?.skippedByDefault === true ? true : undefined,
    })),
    gatedIntegrationDefaultSkip: evidence.gatedIntegrationDefaultSkip === true,
    dryRunSummary: {
      available: evidence.dryRunSummary?.available === true,
      ok: evidence.dryRunSummary?.ok === true,
      scenarioCount: evidence.dryRunSummary?.scenarioCount ?? 0,
      truthSource: safeText(evidence.dryRunSummary?.truthSource ?? null),
      authoritative: evidence.dryRunSummary?.authoritative ?? null,
      terminalStateAdvanced: evidence.dryRunSummary?.terminalStateAdvanced ?? null,
    },
    boundary: assessment.boundary,
    operatorHandoff: {
      packetRequired: true,
      endpointHostOnly: true,
      credentialReferenceNameOnly: true,
      includeRawCommandOutputTails: false,
      includeResolvedCredentialValues: false,
      doesAuthorizeRemoteExecution: false,
    },
    stopConditions: [
      "stop if readyForGatedAttempt is false",
      "stop if authoritative is not false",
      "stop if terminalStateAdvanced is not false",
      "stop if dry-run evidence contacts a remote provider",
      "stop if gated integration default skip is not confirmed",
      "stop if a resolved credential value appears in any artifact",
      "stop if the operator cannot identify the endpoint host",
    ],
    runbook: "docs/dark-factory/DARK_FACTORY_FIRST_REAL_PROVIDER_GATED_ATTEMPT_RUNBOOK.md",
    truthStatement: "Dark Factory Journal remains truth source.",
  };
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
