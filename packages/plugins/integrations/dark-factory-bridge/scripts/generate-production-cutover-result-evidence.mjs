#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(scriptDir, "..");
const defaultReportPath = join(pluginRoot, "docs/production-cutover-result-evidence.json");
const stableRecordedAt = "2026-05-03T00:00:00.000Z";

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.inputPath) {
    throw new Error("--input is required and must point to a sanitized production cutover result JSON report");
  }

  const reportPath = resolve(options.reportPath ?? defaultReportPath);
  const packageJson = JSON.parse(await readFile(join(pluginRoot, "package.json"), "utf8"));
  const sourceReport = JSON.parse(await readFile(resolve(options.inputPath), "utf8"));
  const evidence = buildEvidence({
    packageJson,
    sourceReport,
    recordedAt: options.recordedAt ?? stableRecordedAt,
  });

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    ok: true,
    reportPath,
    productionCutoverResultRecorded: evidence.productionDecision.productionCutoverResultRecorded,
    productionCutoverPassed: evidence.productionDecision.productionCutoverPassed,
    productionReady: evidence.productionDecision.productionReady,
  }, null, 2));
}

export function buildEvidence({ packageJson, sourceReport, recordedAt = stableRecordedAt }) {
  const validation = validateSourceReport(sourceReport);
  if (!validation.ok) {
    throw new Error(`Production cutover result report is not acceptable: ${validation.errors.join(", ")}`);
  }

  return {
    schemaVersion: 1,
    reportType: "dark-factory-production-cutover-result-evidence",
    recordedAt,
    packageName: packageJson.name,
    sourceReport: {
      reportType: sourceReport.reportType,
      checkedAt: sourceReport.checkedAt,
      status: sourceReport.status,
      cutoverId: sourceReport.cutoverId,
      environment: sourceReport.environment,
    },
    gates: {
      supervisedShimGatePassed: sourceReport.gates.supervisedShimGatePassed === true,
      productionPlanValidated: sourceReport.gates.productionPlanValidated === true,
      installReadinessPassed: sourceReport.gates.installReadinessPassed === true,
      postCutoverHealthReady: sourceReport.gates.postCutoverHealthReady === true,
      rollbackPlanVerified: sourceReport.gates.rollbackPlanVerified === true,
      journalBackupRecorded: sourceReport.gates.journalBackupRecorded === true,
    },
    productionDecision: {
      productionCutoverResultRecorded: true,
      productionCutoverPassed: true,
      productionReady: true,
      remainingProductionBlockers: [],
    },
    boundary: {
      truthSource: "dark-factory-journal",
      authoritative: false,
      terminalStateAdvanced: false,
      noResolvedCredentialValues: true,
      credentialValuesRedacted: true,
      doesAuthorizeRemoteExecution: false,
      cutoverReportSanitized: sourceReport.boundary?.cutoverReportSanitized === true,
    },
  };
}

function validateSourceReport(sourceReport) {
  const errors = [];
  if (sourceReport?.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1");
  }
  if (sourceReport?.reportType !== "dark-factory-production-cutover-result") {
    errors.push("reportType must be dark-factory-production-cutover-result");
  }
  if (sourceReport?.ok !== true || sourceReport?.status !== "pass") {
    errors.push("source cutover result must pass");
  }
  const requiredGates = [
    "supervisedShimGatePassed",
    "productionPlanValidated",
    "installReadinessPassed",
    "postCutoverHealthReady",
    "rollbackPlanVerified",
    "journalBackupRecorded",
  ];
  for (const gate of requiredGates) {
    if (sourceReport?.gates?.[gate] !== true) {
      errors.push(`${gate} must be true`);
    }
  }
  if (sourceReport?.boundary?.truthSource !== "dark-factory-journal") {
    errors.push("truth source must be Dark Factory Journal");
  }
  if (sourceReport?.boundary?.authoritative !== false) {
    errors.push("source report must be non-authoritative");
  }
  if (sourceReport?.boundary?.terminalStateAdvanced !== false) {
    errors.push("source report must not advance terminal state");
  }
  if (sourceReport?.boundary?.noResolvedCredentialValues !== true) {
    errors.push("source report must not contain resolved credential values");
  }
  if (sourceReport?.boundary?.credentialValuesRedacted !== true) {
    errors.push("source report must redact credential values");
  }
  if (sourceReport?.boundary?.cutoverReportSanitized !== true) {
    errors.push("source cutover report must be sanitized");
  }
  return {
    ok: errors.length === 0,
    errors,
  };
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--input") {
      parsed.inputPath = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--report") {
      parsed.reportPath = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--recorded-at") {
      parsed.recordedAt = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: pnpm evidence:production-cutover -- --input PATH [--report PATH] [--recorded-at ISO]");
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
