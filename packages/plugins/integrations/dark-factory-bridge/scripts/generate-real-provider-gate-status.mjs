#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(scriptDir, "..");
const repoRoot = resolve(pluginRoot, "../../../..");
const defaultOutDir = join(repoRoot, "output/dark-factory-real-provider-gate-status");
const gatedAttemptEvidencePath = join(pluginRoot, "docs/real-provider-gated-attempt-evidence.json");
const stableGeneratedAt = "2026-05-03T00:00:00.000Z";

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outDir = resolve(options.outDir ?? defaultOutDir);
  const reportPath = options.reportPath
    ? resolve(options.reportPath)
    : join(outDir, "GATE_STATUS.json");

  const packageJson = JSON.parse(await readFile(join(pluginRoot, "package.json"), "utf8"));
  const gatedAttemptEvidence = await readJsonFile(gatedAttemptEvidencePath);
  const status = buildGateStatus({
    generatedAt: options.generatedAt ?? stableGeneratedAt,
    packageJson,
    env: process.env,
    gatedAttemptEvidence,
  });

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(status, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    ok: true,
    reportPath,
    gatedTestWillRun: status.decisions.gatedTestWillRun,
    defaultSkipExpected: status.decisions.defaultSkipExpected,
    readyForOperatorGatedAttempt: status.decisions.readyForOperatorGatedAttempt,
    productionReady: status.productionReady,
    productionBlockers: status.productionBlockers,
  }, null, 2));

  if (options.requireReady && !status.decisions.readyForOperatorGatedAttempt) {
    process.exit(2);
  }
}

export function buildGateStatus({ generatedAt, packageJson, env, gatedAttemptEvidence = null }) {
  const integrationFlag = envSignal(env, "DARK_FACTORY_REMOTE_INTEGRATION", {
    includeLength: true,
    includeEqualsOne: true,
  });
  const endpoint = envSignal(env, "DARK_FACTORY_REMOTE_ENDPOINT", {
    includeLength: true,
  });
  const directCredential = envSignal(env, "DARK_FACTORY_REMOTE_API_KEY", {
    includeLength: false,
    redactReason: "credential value is never printed or persisted",
  });
  const credentialReference = envSignal(env, "DARK_FACTORY_REMOTE_API_KEY_ENV", {
    includeLength: true,
    redactReason: "credential reference value is not printed",
  });
  const credentialProvided = directCredential.present || credentialReference.present;
  const gatedTestWillRun = integrationFlag.equalsOne === true && endpoint.present && credentialProvided;
  const recordedGatedAttempt = normalizeRecordedGatedAttempt(gatedAttemptEvidence);
  const productionBlockers = collectProductionBlockers({
    gatedTestWillRun,
    recordedGatedAttempt,
  });

  return {
    schemaVersion: 1,
    reportType: "dark-factory-real-provider-gate-status",
    generatedAt,
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    gatedTest: "tests/remote-gated-integration.spec.ts",
    inputSignals: {
      integrationFlag,
      endpoint,
      directCredential,
      credentialReference,
    },
    decisions: {
      gatedTestWillRun,
      defaultSkipExpected: !gatedTestWillRun,
      readyForOperatorGatedAttempt: gatedTestWillRun,
      shouldContactRemoteProviderIfGatedTestRuns: gatedTestWillRun,
      realProviderGatedAttemptResultRecorded: recordedGatedAttempt.recorded,
      realProviderGatedAttemptPassed: recordedGatedAttempt.passed,
    },
    productionReady: false,
    productionBlockers,
    recordedGatedAttempt,
    operatorCommands: {
      status: "pnpm gate:provider-status",
      requireReady: "pnpm gate:provider-status -- --require-ready",
      gatedTest: "pnpm test -- tests/remote-gated-integration.spec.ts",
      runbook: "docs/dark-factory/DARK_FACTORY_FIRST_REAL_PROVIDER_GATED_ATTEMPT_RUNBOOK.md",
    },
    boundary: {
      truthSource: "dark-factory-journal",
      authoritative: false,
      terminalStateAdvanced: false,
      doesAuthorizeRemoteExecution: false,
      shouldContactRemoteProvider: false,
      noResolvedCredentialValues: true,
    },
  };
}

async function readJsonFile(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

function normalizeRecordedGatedAttempt(evidence) {
  const passed = evidence?.reportType === "dark-factory-real-provider-gated-attempt-evidence"
    && evidence?.gatedTest?.passed === true
    && evidence?.productionDecision?.realProviderGatedAttemptResultRecorded === true
    && evidence?.boundary?.truthSource === "dark-factory-journal"
    && evidence?.boundary?.authoritative === false
    && evidence?.boundary?.terminalStateAdvanced === false
    && evidence?.boundary?.noResolvedCredentialValues === true;
  return {
    recorded: Boolean(evidence),
    passed,
    evidence: evidence ? {
      reportType: evidence.reportType,
      recordedAt: evidence.recordedAt,
      attemptKind: evidence.attemptKind,
      providerBackendKind: evidence.providerBackend?.kind,
      model: evidence.providerBackend?.model,
      bridgeEndpointKind: evidence.bridgeEndpoint?.kind,
      testsPassed: evidence.gatedTest?.testsPassed,
      testFilesPassed: evidence.gatedTest?.testFilesPassed,
      credentialValuesRedacted: evidence.boundary?.credentialValuesRedacted === true,
    } : null,
  };
}

function collectProductionBlockers({ gatedTestWillRun, recordedGatedAttempt }) {
  if (recordedGatedAttempt.passed) {
    return [
      {
        code: "provider_shim_not_operationalized",
        severity: "blocker",
        message: "The first gated attempt passed through the local LinghuCall shim, but production install still needs an operationalized provider/shim deployment and monitoring plan.",
      },
    ];
  }
  if (gatedTestWillRun) {
    return [
      {
        code: "real_provider_gated_attempt_result_not_recorded",
        severity: "blocker",
        message: "Gate inputs are present, but the real provider gated test result has not been recorded.",
      },
    ];
  }
  return [
    {
      code: "real_provider_gated_attempt_not_completed",
      severity: "blocker",
      message: "Real provider gated attempt has not been run with an operator-controlled endpoint.",
    },
  ];
}

function parseArgs(args) {
  const parsed = {
    requireReady: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
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
    if (arg === "--generated-at") {
      parsed.generatedAt = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--require-ready") {
      parsed.requireReady = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: pnpm gate:provider-status [--out DIR] [--report PATH] [--generated-at ISO] [--require-ready]");
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function envSignal(env, key, options = {}) {
  const value = env[key] ?? "";
  const present = value.length > 0;
  return {
    key,
    present,
    ...(options.includeLength ? { length: value.length } : {}),
    ...(options.includeEqualsOne ? { equalsOne: value === "1" } : {}),
    valueRedacted: true,
    ...(options.redactReason ? { redactReason: options.redactReason } : {}),
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
