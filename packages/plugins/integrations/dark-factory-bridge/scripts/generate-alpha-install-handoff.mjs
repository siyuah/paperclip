#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(scriptDir, "..");
const repoRoot = resolve(pluginRoot, "../../../..");
const defaultReportPath = join(pluginRoot, "docs/alpha-install-handoff-manifest.json");
const stableGeneratedAt = "2026-05-03T00:00:00.000Z";

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const reportPath = resolve(options.reportPath ?? defaultReportPath);

  const packageJson = JSON.parse(await readFile(join(pluginRoot, "package.json"), "utf8"));
  const manifestPath = resolve(pluginRoot, packageJson.paperclipPlugin?.manifest ?? "");
  const manifestModule = await import(`${pathToFileURL(manifestPath).href}?t=${Date.now()}`);
  const manifest = manifestModule.default;
  const installPolicy = await readJson(join(pluginRoot, "docs/install-distribution-policy.json"));
  const uiBetaEvidence = await readJson(join(pluginRoot, "docs/ui-beta-install-evidence.json"));
  const realProviderGatedAttemptEvidence = await readJson(join(pluginRoot, "docs/real-provider-gated-attempt-evidence.json"));
  const linghuCallShimOperationalizationEvidence = await readJson(join(pluginRoot, "docs/linghucall-shim-operationalization-evidence.json"));
  const supervisedShimGatedAttemptEvidence = await readJson(join(pluginRoot, "docs/supervised-shim-gated-attempt-evidence.json"));
  const productionDeploymentPlanEvidence = await readJson(join(pluginRoot, "docs/production-deployment-plan-evidence.json"));
  const productionCutoverResultEvidence = await readJson(join(pluginRoot, "docs/production-cutover-result-evidence.json"));
  const finalGateStatusPath = join(repoRoot, "docs/dark-factory/DARK_FACTORY_REAL_PROVIDER_GATE_STATUS_2026-05-03.md");
  const finalGateStatusText = await readOptionalText(finalGateStatusPath);

  const checks = [
    check("package_name", packageJson.name === "@paperclipai/plugin-dark-factory-bridge", "package name is product bridge package"),
    check("package_private", packageJson.private === true, "package remains private for fork-local internal alpha install"),
    check("manifest_identity", manifest.id === "paperclipai.dark-factory-bridge" && manifest.displayName === "Dark Factory Bridge", "manifest uses product identity"),
    check("database_namespace", manifest.database?.namespaceSlug === "dark_factory_bridge", "database namespace is product namespace"),
    check("environment_driver", Array.isArray(manifest.environmentDrivers) && manifest.environmentDrivers.some((driver) => driver.driverKey === "dark-factory-mock"), "environment driver declaration is present"),
    check("install_distribution_policy", installPolicy?.distributionMode === "fork-local-workspace" && installPolicy?.npmPublish === false, "fork-local install distribution policy is present"),
    check("ui_beta_evidence", uiBetaEvidence?.uiInternalBetaReady === true, "UI beta install evidence is present and ready"),
    check("final_gate_status", finalGateStatusText.includes("supervised_shim_gated_attempt_not_recorded") && finalGateStatusText.includes("productionReady: false"), "final real provider gate status is archived"),
    check("real_provider_gated_attempt_evidence", isValidRealProviderGatedAttemptEvidence(realProviderGatedAttemptEvidence), "real provider gated attempt evidence is present, passed, and boundary-safe"),
    check("linghucall_shim_operationalization_evidence", isValidLinghuCallShimOperationalizationEvidence(linghuCallShimOperationalizationEvidence), "LinghuCall shim operationalization evidence is present and boundary-safe"),
    check("supervised_shim_gated_attempt_evidence", supervisedShimGatedAttemptEvidence === null || isValidSupervisedShimGatedAttemptEvidence(supervisedShimGatedAttemptEvidence), "optional supervised shim gated attempt evidence is absent or boundary-safe"),
    check("production_deployment_plan_evidence", productionDeploymentPlanEvidence === null || isValidProductionDeploymentPlanEvidence(productionDeploymentPlanEvidence), "optional production deployment plan evidence is absent or boundary-safe"),
    check("production_cutover_result_evidence", productionCutoverResultEvidence === null || isValidProductionCutoverResultEvidence(productionCutoverResultEvidence), "optional production cutover result evidence is absent or boundary-safe"),
    check("boundary_policy", hasBoundary(installPolicy?.boundary) && hasBoundary(uiBetaEvidence?.boundary), "policy and UI evidence preserve non-authoritative Journal boundary"),
  ];

  const productionBlockers = collectProductionBlockers(supervisedShimGatedAttemptEvidence, productionDeploymentPlanEvidence, productionCutoverResultEvidence);

  const report = {
    schemaVersion: 1,
    manifestType: "dark-factory-alpha-install-handoff",
    generatedAt: options.generatedAt ?? stableGeneratedAt,
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    manifestId: manifest.id,
    sourceBranch: "fork-master-product",
    installableAlphaReady: checks.every((item) => item.ok),
    productionReady: false,
    productionBlockers,
    checks,
    installDistribution: {
      distributionMode: installPolicy?.distributionMode ?? null,
      packagePrivateExpected: installPolicy?.packagePrivateExpected ?? null,
      npmPublish: installPolicy?.npmPublish ?? null,
      allowedInstallSources: installPolicy?.allowedInstallSources ?? [],
    },
    uiBetaEvidence: {
      uiInternalBetaReady: uiBetaEvidence?.uiInternalBetaReady === true,
      scenarioCount: Array.isArray(uiBetaEvidence?.scenarios) ? uiBetaEvidence.scenarios.length : 0,
      scenarios: Array.isArray(uiBetaEvidence?.scenarios) ? uiBetaEvidence.scenarios.map((scenario) => scenario.scenario) : [],
    },
    pluginEntrypoints: {
      manifest: relativeToRepo(manifestPath),
      worker: relativeToRepo(resolve(pluginRoot, packageJson.paperclipPlugin?.worker ?? "")),
      ui: relativeToRepo(resolve(pluginRoot, packageJson.paperclipPlugin?.ui ?? "")),
    },
    artifacts: {
      packageJson: relativeToRepo(join(pluginRoot, "package.json")),
      manifestSource: relativeToRepo(join(pluginRoot, "src/manifest.ts")),
      workerSource: relativeToRepo(join(pluginRoot, "src/worker.ts")),
      migration: relativeToRepo(join(pluginRoot, "migrations/001_dark_factory_projection.sql")),
      installDistributionPolicy: relativeToRepo(join(pluginRoot, "docs/install-distribution-policy.json")),
      uiBetaInstallEvidence: relativeToRepo(join(pluginRoot, "docs/ui-beta-install-evidence.json")),
      realProviderGatedAttemptEvidence: relativeToRepo(join(pluginRoot, "docs/real-provider-gated-attempt-evidence.json")),
      linghuCallShimOperationalizationEvidence: relativeToRepo(join(pluginRoot, "docs/linghucall-shim-operationalization-evidence.json")),
      supervisedShimGatedAttemptEvidence: relativeToRepo(join(pluginRoot, "docs/supervised-shim-gated-attempt-evidence.json")),
      productionDeploymentPlanEvidence: relativeToRepo(join(pluginRoot, "docs/production-deployment-plan-evidence.json")),
      productionCutoverResultEvidence: relativeToRepo(join(pluginRoot, "docs/production-cutover-result-evidence.json")),
      finalRealProviderGateStatus: relativeToRepo(finalGateStatusPath),
      firstProviderRunbook: "docs/dark-factory/DARK_FACTORY_FIRST_REAL_PROVIDER_GATED_ATTEMPT_RUNBOOK.md",
    },
    operatorNotes: [
      "Install from the fork-local workspace/package during controlled alpha.",
      "The first shim-backed gated provider attempt has passed and operationalization assets exist; do not claim productionReady until the supervised shim service is re-validated.",
      "Do not put resolved credential values in docs, logs, screenshots, or committed files.",
      "Use the first-provider gated attempt runbook for the final production gate.",
    ],
    boundary: {
      truthSource: "dark-factory-journal",
      authoritative: false,
      terminalStateAdvanced: false,
      doesAuthorizeRemoteExecution: false,
      shouldContactRemoteProvider: false,
      noResolvedCredentialValues: true,
    },
  };

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    ok: report.installableAlphaReady,
    reportPath,
    installableAlphaReady: report.installableAlphaReady,
    productionReady: report.productionReady,
    productionBlockers: report.productionBlockers,
    failedChecks: checks.filter((item) => !item.ok).map((item) => item.id),
  }, null, 2));

  if (!report.installableAlphaReady && !options.allowNotReady) {
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
    if (arg === "--allow-not-ready") {
      parsed.allowNotReady = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: pnpm handoff:alpha-install [--report PATH] [--generated-at ISO] [--allow-not-ready]");
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function readOptionalText(path) {
  try {
    await access(path);
    return readFile(path, "utf8");
  } catch {
    return "";
  }
}

function hasBoundary(value) {
  return value?.truthSource === "dark-factory-journal"
    && value?.authoritative === false
    && value?.terminalStateAdvanced === false
    && value?.doesAuthorizeRemoteExecution === false
    && value?.noResolvedCredentialValues === true;
}

function isValidRealProviderGatedAttemptEvidence(value) {
  return value?.schemaVersion === 1
    && value?.reportType === "dark-factory-real-provider-gated-attempt-evidence"
    && value?.gatedTest?.passed === true
    && value?.productionDecision?.realProviderGatedAttemptResultRecorded === true
    && value?.productionDecision?.realProviderGatedAttemptPassed === true
    && value?.productionDecision?.productionReady === false
    && value?.boundary?.truthSource === "dark-factory-journal"
    && value?.boundary?.authoritative === false
    && value?.boundary?.terminalStateAdvanced === false
    && value?.boundary?.noResolvedCredentialValues === true
    && value?.boundary?.credentialValuesRedacted === true;
}

function isValidLinghuCallShimOperationalizationEvidence(value) {
  return value?.schemaVersion === 1
    && value?.reportType === "linghucall-shim-operationalization-evidence"
    && value?.status === "assets-ready"
    && value?.operationalized === false
    && value?.verification?.offlineVerifierPassed === true
    && value?.verification?.supervisedVerifierImplemented === true
    && value?.verification?.unitTestsPassed >= 11
    && value?.verification?.v3BundleValidationPassed === true
    && value?.artifacts?.supervisedVerifier === "tools/verify_linghucall_provider_shim_supervised.py"
    && value?.artifacts?.supervisedTests === "tests/test_linghucall_provider_shim_supervised.py"
    && value?.serviceTemplate?.restartPolicy === "on-failure"
    && value?.serviceTemplate?.usesEnvironmentFile === true
    && value?.serviceTemplate?.usesBridgeApiKeyFile === true
    && value?.serviceTemplate?.hasBasicHardening === true
    && value?.boundary?.truthSource === "dark-factory-journal"
    && value?.boundary?.authoritative === false
    && value?.boundary?.terminalStateAdvanced === false
    && value?.boundary?.noResolvedCredentialValues === true
    && value?.boundary?.doesContactProvider === false
    && value?.boundary?.doesInstallService === false;
}

function isValidSupervisedShimGatedAttemptEvidence(value) {
  return value?.schemaVersion === 1
    && value?.reportType === "linghucall-supervised-shim-gated-attempt-evidence"
    && value?.supervisedService?.serviceName === "linghucall-provider-shim.service"
    && value?.supervisedService?.active === true
    && value?.healthcheck?.ok === true
    && value?.paperclipGate?.providerStatusPassed === true
    && value?.paperclipGate?.remoteGatedIntegrationPassed === true
    && value?.productionDecision?.supervisedShimGatedAttemptRecorded === true
    && value?.productionDecision?.productionReady === false
    && value?.boundary?.truthSource === "dark-factory-journal"
    && value?.boundary?.authoritative === false
    && value?.boundary?.terminalStateAdvanced === false
    && value?.boundary?.noResolvedCredentialValues === true
    && value?.boundary?.credentialValuesRedacted === true;
}

function isValidProductionDeploymentPlanEvidence(value) {
  return value?.schemaVersion === 1
    && value?.reportType === "dark-factory-production-deployment-plan-evidence"
    && value?.planStatus === "ready-for-supervised-cutover"
    && value?.deploymentTargets?.providerShim?.serviceName === "linghucall-provider-shim.service"
    && value?.monitoringPlan?.supervisedVerifierCommand?.includes("verify_linghucall_provider_shim_supervised.py")
    && value?.rollbackPlan?.journalReconciliationRequired === true
    && value?.retentionPlan?.truthSource === "dark-factory-journal"
    && value?.productionDecision?.productionDeploymentPlanRecorded === true
    && value?.productionDecision?.productionReady === false
    && value?.productionDecision?.nextProductionBlocker?.code === "production_cutover_result_not_recorded"
    && value?.boundary?.truthSource === "dark-factory-journal"
    && value?.boundary?.authoritative === false
    && value?.boundary?.terminalStateAdvanced === false
    && value?.boundary?.doesAuthorizeRemoteExecution === false
    && value?.boundary?.noResolvedCredentialValues === true
    && value?.boundary?.doesInstallService === false
    && value?.boundary?.doesStartService === false;
}

function isValidProductionCutoverResultEvidence(value) {
  return value?.schemaVersion === 1
    && value?.reportType === "dark-factory-production-cutover-result-evidence"
    && value?.productionDecision?.productionCutoverResultRecorded === true
    && value?.productionDecision?.productionCutoverPassed === true
    && value?.productionDecision?.productionReady === true
    && Array.isArray(value?.productionDecision?.remainingProductionBlockers)
    && value.productionDecision.remainingProductionBlockers.length === 0
    && value?.gates?.supervisedShimGatePassed === true
    && value?.gates?.productionPlanValidated === true
    && value?.gates?.installReadinessPassed === true
    && value?.gates?.postCutoverHealthReady === true
    && value?.gates?.rollbackPlanVerified === true
    && value?.gates?.journalBackupRecorded === true
    && value?.boundary?.truthSource === "dark-factory-journal"
    && value?.boundary?.authoritative === false
    && value?.boundary?.terminalStateAdvanced === false
    && value?.boundary?.noResolvedCredentialValues === true
    && value?.boundary?.credentialValuesRedacted === true;
}

function collectProductionBlockers(supervisedShimGatedAttemptEvidence, productionDeploymentPlanEvidence, productionCutoverResultEvidence) {
  if (isValidSupervisedShimGatedAttemptEvidence(supervisedShimGatedAttemptEvidence)) {
    if (isValidProductionDeploymentPlanEvidence(productionDeploymentPlanEvidence)) {
      if (isValidProductionCutoverResultEvidence(productionCutoverResultEvidence)) {
        return [];
      }
      return [
        {
          code: "production_cutover_result_not_recorded",
          severity: "blocker",
          message: "Deployment, monitoring, rollback, and retention plan exists, but production cutover result evidence has not yet been recorded.",
        },
      ];
    }
    return [
      {
        code: "production_deployment_plan_not_recorded",
        severity: "blocker",
        message: "The supervised shim gated attempt passed, but production deployment, monitoring, rollback, and retention evidence has not yet been recorded.",
      },
    ];
  }
  return [
    {
      code: "supervised_shim_gated_attempt_not_recorded",
      severity: "blocker",
      message: "Operationalization assets exist, but the shim has not yet been started as the supervised service and re-validated with the Paperclip gated integration test.",
    },
  ];
}

function check(id, ok, message) {
  return {
    id,
    ok,
    status: ok ? "pass" : "fail",
    message,
  };
}

function relativeToRepo(path) {
  return path.startsWith(repoRoot) ? path.slice(repoRoot.length + 1) : path;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
