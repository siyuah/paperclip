#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(scriptDir, "..");
const defaultReportPath = join(pluginRoot, "docs/supervised-shim-gated-attempt-evidence.json");
const stableRecordedAt = "2026-05-03T00:00:00.000Z";

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.inputPath) {
    throw new Error("--input is required and must point to a sanitized supervised verifier JSON report");
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
    supervisedShimGatedAttemptRecorded: evidence.productionDecision.supervisedShimGatedAttemptRecorded,
    productionReady: evidence.productionDecision.productionReady,
    productionBlockers: evidence.productionDecision.remainingProductionBlockers,
  }, null, 2));
}

export function buildEvidence({ packageJson, sourceReport, recordedAt = stableRecordedAt }) {
  const validation = validateSourceReport(sourceReport);
  if (!validation.ok) {
    throw new Error(`Supervised shim verifier report is not acceptable: ${validation.errors.join(", ")}`);
  }

  const checkStatuses = Object.fromEntries(sourceReport.checks.map((item) => [item.id, item.status]));
  const healthDetails = sourceReport.checks.find((item) => item.id === "shim_health_ready")?.details ?? {};

  return {
    schemaVersion: 1,
    reportType: "linghucall-supervised-shim-gated-attempt-evidence",
    recordedAt,
    packageName: packageJson.name,
    sourceReport: {
      reportType: sourceReport.reportType,
      checkedAt: sourceReport.checkedAt,
      status: sourceReport.status,
      endpoint: sourceReport.endpoint,
      serviceName: sourceReport.serviceName,
    },
    supervisedService: {
      serviceName: sourceReport.serviceName,
      active: checkStatuses.systemd_user_service_active === "pass",
      operatorEnvFilePrivate: checkStatuses.operator_env_file_private === "pass",
      bridgeKeyFilePrivate: checkStatuses.bridge_key_file_private === "pass",
    },
    healthcheck: {
      ok: checkStatuses.shim_health_ready === "pass",
      endpointHost: healthDetails.endpointHost ?? null,
      status: healthDetails.status ?? null,
      protocolReleaseTag: healthDetails.protocolReleaseTag ?? null,
      providerKind: healthDetails.providerKind ?? null,
      providerCredentialValueRedacted: healthDetails.providerCredentialValueRedacted === true,
    },
    paperclipGate: {
      attempted: sourceReport.paperclipGateAttempted === true,
      providerStatusPassed: checkStatuses.paperclip_provider_status_gate_passed === "pass",
      remoteGatedIntegrationPassed: checkStatuses.paperclip_remote_gated_test_passed === "pass",
    },
    productionDecision: {
      supervisedShimGatedAttemptRecorded: true,
      supervisedShimGatedAttemptPassed: true,
      productionReady: false,
      remainingProductionBlockers: [
        {
          code: "production_deployment_plan_not_recorded",
          severity: "blocker",
          message: "The supervised shim gated attempt passed, but production deployment, monitoring, rollback, and retention evidence has not yet been recorded.",
        },
      ],
    },
    boundary: {
      truthSource: "dark-factory-journal",
      authoritative: false,
      terminalStateAdvanced: false,
      noResolvedCredentialValues: true,
      credentialValuesRedacted: true,
      sourceVerifierNoCredentialValuesRead: sourceReport.boundary?.noCredentialValuesRead === true,
      sourceVerifierNoCredentialValuesPrinted: sourceReport.boundary?.noCredentialValuesPrinted === true,
    },
  };
}

function validateSourceReport(sourceReport) {
  const errors = [];
  if (sourceReport?.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1");
  }
  if (sourceReport?.reportType !== "linghucall-provider-shim-supervised-attempt") {
    errors.push("reportType must be linghucall-provider-shim-supervised-attempt");
  }
  if (sourceReport?.ok !== true || sourceReport?.status !== "pass") {
    errors.push("source report must pass");
  }
  if (sourceReport?.paperclipGateAttempted !== true) {
    errors.push("paperclip gate must be attempted");
  }
  if (!Array.isArray(sourceReport?.checks)) {
    errors.push("checks must be an array");
  } else {
    const requiredChecks = [
      "systemd_user_service_active",
      "operator_env_file_private",
      "bridge_key_file_private",
      "shim_health_ready",
      "paperclip_provider_status_gate_passed",
      "paperclip_remote_gated_test_passed",
    ];
    const statuses = Object.fromEntries(sourceReport.checks.map((item) => [item.id, item.status]));
    for (const requiredCheck of requiredChecks) {
      if (statuses[requiredCheck] !== "pass") {
        errors.push(`${requiredCheck} must pass`);
      }
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
  if (sourceReport?.boundary?.noCredentialValuesRead !== true) {
    errors.push("source verifier must not read credential values");
  }
  if (sourceReport?.boundary?.noCredentialValuesPrinted !== true) {
    errors.push("source verifier must not print credential values");
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
      console.log("Usage: pnpm evidence:supervised-shim-gate -- --input PATH [--report PATH] [--recorded-at ISO]");
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
