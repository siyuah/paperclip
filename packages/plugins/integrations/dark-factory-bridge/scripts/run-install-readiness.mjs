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
  const manifestPath = resolve(pluginRoot, packageJson.paperclipPlugin?.manifest ?? "");
  const workerPath = resolve(pluginRoot, packageJson.paperclipPlugin?.worker ?? "");
  const uiDir = resolve(pluginRoot, packageJson.paperclipPlugin?.ui ?? "");
  const manifestModule = await import(`${pathToFileURL(manifestPath).href}?t=${Date.now()}`);
  const manifest = manifestModule.default;
  const manifestParse = pluginManifestV1Schema.safeParse(manifest);

  checks.push(check("package_name", packageJson.name === "@paperclipai/plugin-dark-factory-bridge", "package name is product integration package name"));
  checks.push(check("package_private", packageJson.private === true, "package remains private until publish policy is decided"));
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

  const productionBlockers = collectProductionBlockers({ manifest, packageJson });
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

function collectProductionBlockers({ manifest, packageJson }) {
  const blockers = [];
  if (/example/i.test(manifest.id) || /example/i.test(manifest.displayName)) {
    blockers.push({
      code: "manifest_identity_contains_example",
      severity: "blocker",
      message: "Manifest id/displayName still carries example wording; rename before production install.",
    });
  }
  if (packageJson.private === true) {
    blockers.push({
      code: "package_private_publish_policy_pending",
      severity: "review",
      message: "Package is private; publish/install distribution policy is not finalized.",
    });
  }
  blockers.push({
    code: "real_provider_gated_attempt_not_completed",
    severity: "blocker",
    message: "Real provider gated attempt has not been run with an operator-controlled endpoint.",
  });
  blockers.push({
    code: "host_secret_resolver_pending",
    severity: "blocker",
    message: "Remote alpha still relies on env/env:// secret references until host-managed secret resolver is available.",
  });
  blockers.push({
    code: "ui_full_internal_beta_not_completed",
    severity: "review",
    message: "UI is ready for controlled preview smoke, but full internal beta installation flow has not been exercised.",
  });
  return blockers;
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
