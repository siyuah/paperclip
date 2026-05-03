#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(scriptDir, "..");
const repoRoot = resolve(pluginRoot, "../../../..");
const defaultEvidencePath = join(repoRoot, "output/dark-factory-first-provider-preflight/evidence.json");
const defaultOutDir = join(repoRoot, "output/dark-factory-first-provider-session");

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const evidencePath = resolve(options.evidencePath ?? defaultEvidencePath);
  const outDir = resolve(options.outDir ?? defaultOutDir);
  const packetPath = options.packetPath
    ? resolve(options.packetPath)
    : join(outDir, "SESSION_PACKET.md");

  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  const assessment = assessEvidence(evidence);
  const packet = renderPacket(evidence, assessment, evidencePath);

  await mkdir(dirname(packetPath), { recursive: true });
  await writeFile(packetPath, packet, "utf8");

  console.log(JSON.stringify({
    ok: assessment.readyForGatedAttempt,
    packetPath,
    evidencePath,
    readyForGatedAttempt: assessment.readyForGatedAttempt,
    failedReasons: assessment.failedReasons,
    boundary: assessment.boundary,
  }, null, 2));

  if (!assessment.readyForGatedAttempt && !options.allowNotReady) {
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
    if (arg === "--out") {
      parsed.outDir = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--packet") {
      parsed.packetPath = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--allow-not-ready") {
      parsed.allowNotReady = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: pnpm packet:first-provider [--evidence PATH] [--out DIR] [--packet PATH] [--allow-not-ready]");
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function assessEvidence(evidence) {
  const checks = Array.isArray(evidence.checks) ? evidence.checks : [];
  const failedReasons = [];
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
    failedReasons.push("preflight evidence must not authorize remote execution");
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

function renderPacket(evidence, assessment, evidencePath) {
  const checks = Array.isArray(evidence.checks) ? evidence.checks : [];
  return `${[
    "# Dark Factory First Provider Operator Session Packet",
    "",
    "Status: operator review packet",
    `Generated at: ${safeText(new Date().toISOString())}`,
    "",
    "This packet is generated from local preflight evidence. It is a human review artifact only.",
    "It does not authorize remote execution and must not contain resolved credential values.",
    "",
    "## Source Evidence",
    "",
    `- evidence path: \`${safeText(evidencePath)}\``,
    `- evidence generated at: ${safeText(evidence.generatedAt ?? "unknown")}`,
    `- branch: \`${safeText(evidence.branch ?? "unknown")}\``,
    `- commit: \`${safeText(evidence.commit ?? "unknown")}\``,
    `- schema version: ${safeText(String(evidence.schemaVersion ?? "unknown"))}`,
    "",
    "## Readiness Assessment",
    "",
    `- ready for gated attempt: ${assessment.readyForGatedAttempt ? "yes" : "no"}`,
    `- gated integration default skip confirmed: ${evidence.gatedIntegrationDefaultSkip === true ? "yes" : "no"}`,
    "",
    assessment.failedReasons.length > 0
      ? `Failed reasons:\n\n${assessment.failedReasons.map((reason) => `- ${safeText(reason)}`).join("\n")}`
      : "Failed reasons: none",
    "",
    "## Check Summary",
    "",
    "| Check | Status | OK |",
    "| --- | --- | --- |",
    ...checks.map((check) => `| \`${safeText(check?.id ?? "unknown")}\` | ${safeText(check?.status ?? "unknown")} | ${check?.ok === true ? "yes" : "no"} |`),
    "",
    "Raw command output tails are intentionally omitted from this packet. Keep detailed logs in local operator notes only after reviewing redaction.",
    "",
    "## Boundary Assertions",
    "",
    "| Field | Value | Required |",
    "| --- | --- | --- |",
    `| truthSource | \`${safeText(assessment.boundary.truthSource ?? "null")}\` | \`dark-factory-journal\` |`,
    `| authoritative | \`${safeText(String(assessment.boundary.authoritative))}\` | \`false\` |`,
    `| terminalStateAdvanced | \`${safeText(String(assessment.boundary.terminalStateAdvanced))}\` | \`false\` |`,
    `| doesAuthorizeRemoteExecution | \`${safeText(String(assessment.boundary.doesAuthorizeRemoteExecution))}\` | \`false\` |`,
    `| shouldContactRemoteProviderDuringDryRun | \`${safeText(String(assessment.boundary.shouldContactRemoteProviderDuringDryRun))}\` | \`false\` |`,
    `| noResolvedCredentialValues | \`${safeText(String(assessment.boundary.noResolvedCredentialValues))}\` | \`true\` |`,
    "",
    "## Dry-Run Summary",
    "",
    `- available: ${evidence.dryRunSummary?.available === true ? "yes" : "no"}`,
    `- ok: ${evidence.dryRunSummary?.ok === true ? "yes" : "no"}`,
    `- scenario count: ${safeText(String(evidence.dryRunSummary?.scenarioCount ?? 0))}`,
    `- truth source: \`${safeText(evidence.dryRunSummary?.truthSource ?? "unknown")}\``,
    `- authoritative: \`${safeText(String(evidence.dryRunSummary?.authoritative ?? "unknown"))}\``,
    `- terminal state advanced: \`${safeText(String(evidence.dryRunSummary?.terminalStateAdvanced ?? "unknown"))}\``,
    "",
    "## Operator Fill-In Fields",
    "",
    "- operator:",
    "- review time:",
    "- provider endpoint host only:",
    "- credential reference name only:",
    "- dry-run guard receipt id:",
    "- readiness receipt id:",
    "- decision: proceed / hold",
    "- gated integration result:",
    "- rollback completed: yes / no / not applicable",
    "- notes:",
    "",
    "Never write a resolved API key, bearer token, password, or connection string in this packet.",
    "",
    "## Stop Conditions",
    "",
    "- stop if any readiness assessment field above is `no`",
    "- stop if `authoritative` is not `false`",
    "- stop if `terminalStateAdvanced` is not `false`",
    "- stop if dry-run evidence contacts a remote provider",
    "- stop if the operator cannot identify the endpoint host",
    "- stop if any resolved credential value appears in logs, docs, notes, or artifacts",
    "",
    "Dark Factory Journal remains truth source.",
  ].join("\n")}\n`;
}

function safeText(value) {
  return String(value)
    .replace(/(api[_-]?key|token|password|secret|connection_string)\s*[:=]\s*["']?[^"'\s,}]+/gi, "$1=<redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer <redacted>");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
