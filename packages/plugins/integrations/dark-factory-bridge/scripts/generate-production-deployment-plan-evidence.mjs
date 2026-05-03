#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(scriptDir, "..");
const defaultReportPath = join(pluginRoot, "docs/production-deployment-plan-evidence.json");
const stableGeneratedAt = "2026-05-03T00:00:00.000Z";

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const reportPath = resolve(options.reportPath ?? defaultReportPath);
  const packageJson = JSON.parse(await readFile(join(pluginRoot, "package.json"), "utf8"));
  const evidence = buildEvidence({
    packageJson,
    generatedAt: options.generatedAt ?? stableGeneratedAt,
  });

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    ok: true,
    reportPath,
    planStatus: evidence.planStatus,
    productionReady: evidence.productionDecision.productionReady,
    nextProductionBlocker: evidence.productionDecision.nextProductionBlocker,
  }, null, 2));
}

export function buildEvidence({ packageJson, generatedAt = stableGeneratedAt }) {
  return {
    schemaVersion: 1,
    reportType: "dark-factory-production-deployment-plan-evidence",
    generatedAt,
    packageName: packageJson.name,
    planStatus: "ready-for-supervised-cutover",
    deploymentTargets: {
      bridgePlugin: {
        branch: "fork-master-product",
        packageName: packageJson.name,
        installMode: "fork-local-workspace",
      },
      providerShim: {
        kind: "linghucall-systemd-user-service",
        serviceName: "linghucall-provider-shim.service",
        endpoint: "http://127.0.0.1:9791",
        sourceRepository: "/home/siyuah/workspace/123",
      },
    },
    monitoringPlan: {
      healthcheckCommand: ".venv312/bin/python tools/check_linghucall_provider_shim_health.py --endpoint http://127.0.0.1:9791 --require-ready",
      supervisedVerifierCommand: ".venv312/bin/python tools/verify_linghucall_provider_shim_supervised.py --include-paperclip-gate --require-pass",
      installReadinessCommand: "pnpm install:readiness -- --skip-build",
      expectedProviderStatus: "ready",
      credentialLoggingPolicy: "redacted_presence_only",
    },
    rollbackPlan: {
      stopServiceCommand: "systemctl --user stop linghucall-provider-shim.service",
      disableServiceCommand: "systemctl --user disable linghucall-provider-shim.service",
      bridgeRevertAction: "unset gated provider environment variables and return to mock/http preview mode",
      journalReconciliationRequired: true,
      terminalStateAdvancedDuringRollback: false,
    },
    retentionPlan: {
      truthSource: "dark-factory-journal",
      journalBackupCommand: "python3 tools/journal_admin.py backup",
      journalRetentionCommand: "python3 tools/journal_admin.py retain",
      pluginDbScope: "projection/cache/cursor/receipt/request metadata only",
    },
    operatorChecklist: [
      "Start supervised LinghuCall shim service.",
      "Run supervised verifier with Paperclip gate enabled.",
      "Generate supervised shim gated attempt evidence from sanitized verifier JSON.",
      "Run install readiness and confirm blocker advances to production cutover result.",
      "Archive non-sensitive evidence only.",
    ],
    productionDecision: {
      productionDeploymentPlanRecorded: true,
      productionReady: false,
      nextProductionBlocker: {
        code: "production_cutover_result_not_recorded",
        severity: "blocker",
        message: "Deployment, monitoring, rollback, and retention plan exists, but production cutover result evidence has not yet been recorded.",
      },
    },
    boundary: {
      truthSource: "dark-factory-journal",
      authoritative: false,
      terminalStateAdvanced: false,
      doesAuthorizeRemoteExecution: false,
      noResolvedCredentialValues: true,
      credentialValuesRedacted: true,
      doesInstallService: false,
      doesStartService: false,
    },
  };
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--report") {
      parsed.reportPath = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--generated-at") {
      parsed.generatedAt = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: pnpm evidence:production-plan [--report PATH] [--generated-at ISO]");
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
