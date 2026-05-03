#!/usr/bin/env node

import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { pluginManifestV1Schema } from "@paperclipai/shared";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(scriptDir, "..");
const repoRoot = resolve(pluginRoot, "../../../..");
const defaultOutDir = join(repoRoot, "output/dark-factory-install-readiness");
const uiBetaEvidencePath = join(pluginRoot, "docs/ui-beta-install-evidence.json");
const alphaInstallHandoffPath = join(pluginRoot, "docs/alpha-install-handoff-manifest.json");

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outDir = resolve(options.outDir ?? defaultOutDir);
  const reportPath = options.reportPath
    ? resolve(options.reportPath)
    : join(outDir, "INSTALL_READINESS.json");
  const checks = [];

  await mkdir(dirname(reportPath), { recursive: true });

  if (!options.skipBuild) {
    const build = await run(["pnpm", "build"], pluginRoot);
    checks.push({
      id: "build",
      ok: build.exitCode === 0,
      status: build.exitCode === 0 ? "pass" : "fail",
      message: "plugin build command completes",
      durationMs: build.durationMs,
    });
  } else {
    checks.push({
      id: "build",
      ok: true,
      status: "skipped",
      message: "skipped by --skip-build",
      durationMs: 0,
    });
  }

  const packageJson = JSON.parse(await readFile(join(pluginRoot, "package.json"), "utf8"));
  const installPolicy = await readInstallPolicy();
  const manifestPath = resolve(pluginRoot, packageJson.paperclipPlugin?.manifest ?? "");
  const workerPath = resolve(pluginRoot, packageJson.paperclipPlugin?.worker ?? "");
  const uiDir = resolve(pluginRoot, packageJson.paperclipPlugin?.ui ?? "");
  const manifestModule = await import(`${pathToFileURL(manifestPath).href}?t=${Date.now()}`);
  const manifest = manifestModule.default;
  const manifestParse = pluginManifestV1Schema.safeParse(manifest);

  checks.push(check("package_name", packageJson.name === "@paperclipai/plugin-dark-factory-bridge", "package name is product integration package name"));
  checks.push(check("package_private", packageJson.private === true, "package remains private for fork-local workspace distribution"));
  checks.push(check("install_distribution_policy", isValidInstallPolicy({ installPolicy, packageJson }), "fork-local install distribution policy is present and matches package privacy"));
  checks.push(check("manifest_pointer", await exists(manifestPath), "paperclipPlugin.manifest points to built manifest"));
  checks.push(check("worker_pointer", await exists(workerPath), "paperclipPlugin.worker points to built worker"));
  checks.push(check("ui_pointer", await exists(join(uiDir, "index.js")), "paperclipPlugin.ui points to built UI entry"));
  checks.push(check("manifest_schema", manifestParse.success, "built manifest satisfies Paperclip manifest schema"));
  checks.push(check("worker_entrypoint", manifest.entrypoints?.worker === "./dist/worker.js", "manifest worker entrypoint matches package pointer"));
  checks.push(check("ui_entrypoint", manifest.entrypoints?.ui === "./dist/ui", "manifest UI entrypoint matches package pointer"));
  checks.push(check("environment_driver_capability", Array.isArray(manifest.capabilities) && manifest.capabilities.includes("environment.drivers.register"), "manifest registers environment driver capability"));
  checks.push(check("api_routes", Array.isArray(manifest.apiRoutes) && manifest.apiRoutes.length >= 5, "manifest exposes expected bridge API routes"));
  checks.push(check("ui_slots", Array.isArray(manifest.ui?.slots) && manifest.ui.slots.length >= 3, "manifest exposes dashboard, detail, and settings UI slots"));
  checks.push(check("database_namespace", manifest.database?.namespaceSlug === "dark_factory_bridge", "manifest declares production bridge namespace"));
  checks.push(check("migration_file", await exists(join(pluginRoot, "migrations/001_dark_factory_projection.sql")), "database migration file is present"));
  checks.push(check("mock_driver", Array.isArray(manifest.environmentDrivers) && manifest.environmentDrivers.some((driver) => driver.driverKey === "dark-factory-mock"), "dark-factory-mock driver declaration is present"));
  checks.push(check("host_secret_resolver_contract", await fileContains(join(pluginRoot, "src/remote-provider-host-secret-resolver.ts"), [
    "secret://",
    "host-secret://",
    "shouldPersistResolvedCredentialValues: false",
    "doesAuthorizeRemoteExecution: false",
  ]), "host-managed secret resolver contract is present and non-persistent"));
  const uiBetaEvidence = await readJsonFile(uiBetaEvidencePath);
  checks.push(check("ui_beta_install_evidence", isValidUiBetaEvidence({ uiBetaEvidence, packageJson, manifest }), "UI internal beta install evidence is present and boundary-safe"));
  const alphaInstallHandoff = await readJsonFile(alphaInstallHandoffPath);
  checks.push(check("alpha_install_handoff_manifest", isValidAlphaInstallHandoff({ alphaInstallHandoff, packageJson, manifest }), "alpha install handoff manifest is present and keeps production gate explicit"));

  const productionBlockers = collectProductionBlockers({ manifest });
  const installableAlphaReady = checks.every((item) => item.ok || item.status === "skipped");
  const productionReady = installableAlphaReady && productionBlockers.length === 0;
  const report = {
    schemaVersion: 1,
    reportType: "dark-factory-install-readiness",
    generatedAt: new Date().toISOString(),
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    manifestId: manifest.id,
    installableAlphaReady,
    productionReady,
    checks,
    productionBlockers,
    artifacts: {
      manifest: relativeToPlugin(manifestPath),
      worker: relativeToPlugin(workerPath),
      ui: relativeToPlugin(uiDir),
      migration: "migrations/001_dark_factory_projection.sql",
      installDistributionPolicy: "docs/install-distribution-policy.json",
      uiBetaInstallEvidence: "docs/ui-beta-install-evidence.json",
      alphaInstallHandoff: "docs/alpha-install-handoff-manifest.json",
    },
    installDistributionPolicy: {
      distributionMode: installPolicy?.distributionMode ?? null,
      packagePrivateExpected: installPolicy?.packagePrivateExpected ?? null,
      npmPublish: installPolicy?.npmPublish ?? null,
    },
    boundary: {
      truthSource: "dark-factory-journal",
      authoritative: false,
      terminalStateAdvanced: false,
      doesAuthorizeRemoteExecution: false,
      noResolvedCredentialValues: true,
    },
    installNotes: [
      "This report is an offline install-readiness check for controlled alpha/internal testing.",
      "It does not contact a real Dark Factory provider.",
      "Production install is blocked until productionBlockers is empty.",
    ],
  };

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    ok: installableAlphaReady,
    reportPath,
    installableAlphaReady,
    productionReady,
    productionBlockers,
    failedChecks: checks.filter((item) => !item.ok && item.status !== "skipped").map((item) => item.id),
  }, null, 2));

  if (!installableAlphaReady && !options.allowNotReady) {
    process.exit(2);
  }
}

async function readInstallPolicy() {
  try {
    return JSON.parse(await readFile(join(pluginRoot, "docs/install-distribution-policy.json"), "utf8"));
  } catch {
    return null;
  }
}

function parseArgs(args) {
  const parsed = {
    allowNotReady: false,
    skipBuild: false,
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
    if (arg === "--skip-build") {
      parsed.skipBuild = true;
      continue;
    }
    if (arg === "--allow-not-ready") {
      parsed.allowNotReady = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: pnpm install:readiness [--out DIR] [--report PATH] [--skip-build] [--allow-not-ready]");
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function collectProductionBlockers({ manifest }) {
  const blockers = [];
  if (/example/i.test(manifest.id) || /example/i.test(manifest.displayName)) {
    blockers.push({
      code: "manifest_identity_contains_example",
      severity: "blocker",
      message: "Manifest id/displayName still carries example wording; rename before production install.",
    });
  }
  blockers.push({
    code: "real_provider_gated_attempt_not_completed",
    severity: "blocker",
    message: "Real provider gated attempt has not been run with an operator-controlled endpoint.",
  });
  return blockers;
}

async function readJsonFile(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function fileContains(path, needles) {
  try {
    const text = await readFile(path, "utf8");
    return needles.every((needle) => text.includes(needle));
  } catch {
    return false;
  }
}

function isValidInstallPolicy({ installPolicy, packageJson }) {
  return installPolicy?.schemaVersion === 1
    && installPolicy?.policyType === "dark-factory-bridge-install-distribution"
    && installPolicy?.packageName === packageJson.name
    && installPolicy?.distributionMode === "fork-local-workspace"
    && installPolicy?.packagePrivateExpected === packageJson.private
    && installPolicy?.npmPublish === false
    && installPolicy?.boundary?.truthSource === "dark-factory-journal"
    && installPolicy?.boundary?.authoritative === false
    && installPolicy?.boundary?.terminalStateAdvanced === false
    && installPolicy?.boundary?.doesAuthorizeRemoteExecution === false
    && installPolicy?.boundary?.noResolvedCredentialValues === true;
}

function isValidUiBetaEvidence({ uiBetaEvidence, packageJson, manifest }) {
  const expectedScenarios = ["healthy", "warning_latency", "blocked_failures", "stale_readiness"];
  return uiBetaEvidence?.schemaVersion === 1
    && uiBetaEvidence?.reportType === "dark-factory-ui-beta-install-evidence"
    && uiBetaEvidence?.packageName === packageJson.name
    && uiBetaEvidence?.manifestId === manifest.id
    && uiBetaEvidence?.uiInternalBetaReady === true
    && Array.isArray(uiBetaEvidence?.checks)
    && uiBetaEvidence.checks.every((item) => item?.status === "pass")
    && Array.isArray(uiBetaEvidence?.scenarios)
    && expectedScenarios.every((scenario) => uiBetaEvidence.scenarios.some((item) => item?.scenario === scenario))
    && uiBetaEvidence?.boundary?.truthSource === "dark-factory-journal"
    && uiBetaEvidence?.boundary?.authoritative === false
    && uiBetaEvidence?.boundary?.terminalStateAdvanced === false
    && uiBetaEvidence?.boundary?.doesAuthorizeRemoteExecution === false
    && uiBetaEvidence?.boundary?.shouldContactRemoteProvider === false
    && uiBetaEvidence?.boundary?.noResolvedCredentialValues === true;
}

function isValidAlphaInstallHandoff({ alphaInstallHandoff, packageJson, manifest }) {
  return alphaInstallHandoff?.schemaVersion === 1
    && alphaInstallHandoff?.manifestType === "dark-factory-alpha-install-handoff"
    && alphaInstallHandoff?.packageName === packageJson.name
    && alphaInstallHandoff?.manifestId === manifest.id
    && alphaInstallHandoff?.installableAlphaReady === true
    && alphaInstallHandoff?.productionReady === false
    && Array.isArray(alphaInstallHandoff?.productionBlockers)
    && alphaInstallHandoff.productionBlockers.some((blocker) => blocker?.code === "real_provider_gated_attempt_not_completed")
    && alphaInstallHandoff?.installDistribution?.distributionMode === "fork-local-workspace"
    && alphaInstallHandoff?.installDistribution?.npmPublish === false
    && alphaInstallHandoff?.uiBetaEvidence?.uiInternalBetaReady === true
    && alphaInstallHandoff?.boundary?.truthSource === "dark-factory-journal"
    && alphaInstallHandoff?.boundary?.authoritative === false
    && alphaInstallHandoff?.boundary?.terminalStateAdvanced === false
    && alphaInstallHandoff?.boundary?.doesAuthorizeRemoteExecution === false
    && alphaInstallHandoff?.boundary?.shouldContactRemoteProvider === false
    && alphaInstallHandoff?.boundary?.noResolvedCredentialValues === true;
}

function check(id, ok, message) {
  return {
    id,
    ok,
    status: ok ? "pass" : "fail",
    message,
  };
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function run(command, cwd) {
  const startedAt = Date.now();
  return new Promise((resolveRun) => {
    const child = spawn(command[0], command.slice(1), {
      cwd,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.resume();
    child.stderr.resume();
    child.on("close", (exitCode) => {
      resolveRun({
        exitCode: exitCode ?? 1,
        durationMs: Date.now() - startedAt,
      });
    });
  });
}

function relativeToPlugin(path) {
  return path.startsWith(pluginRoot) ? path.slice(pluginRoot.length + 1) : path;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
