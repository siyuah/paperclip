#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(scriptDir, "..");
const repoRoot = resolve(pluginRoot, "../../../..");
const workspaceRoot = resolve(repoRoot, "..");
const v3Root = resolve(workspaceRoot, "123");
const defaultOutDir = join(repoRoot, "output/dark-factory-first-provider-preflight");

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outDir = resolve(options.outDir ?? defaultOutDir);
  const startedAt = new Date().toISOString();
  const checks = [];

  await mkdir(outDir, { recursive: true });

  if (options.skipHeavy) {
    checks.push(skippedCheck("typecheck", "Skipped by --skip-heavy"));
    checks.push(skippedCheck("build", "Skipped by --skip-heavy"));
    checks.push(skippedCheck("test", "Skipped by --skip-heavy"));
    checks.push(skippedCheck("ui_browser_smoke", "Skipped by --skip-heavy"));
    checks.push(skippedCheck("v3_bundle_validation", "Skipped by --skip-heavy"));
  } else {
    checks.push(await runCheck("typecheck", ["pnpm", "typecheck"], pluginRoot));
    checks.push(await runCheck("build", ["pnpm", "build"], pluginRoot));
    checks.push(await runCheck("test", ["pnpm", "test"], pluginRoot, { redactHttpLogs: true }));
    checks.push(await runCheck("ui_browser_smoke", ["pnpm", "smoke:ui:browser", "--", "--no-screenshots"], pluginRoot, {
      parseJson: true,
    }));
    checks.push(await runCheck("v3_bundle_validation", ["python3", "tools/validate_v3_bundle.py"], v3Root, {
      parseJson: true,
    }));
  }

  const gated = await runCheck("gated_integration_default_skip", [
    "pnpm",
    "test",
    "--",
    "tests/remote-gated-integration.spec.ts",
  ], pluginRoot, {
    scrubEnv: [
      "DARK_FACTORY_REMOTE_INTEGRATION",
      "DARK_FACTORY_REMOTE_ENDPOINT",
      "DARK_FACTORY_REMOTE_API_KEY",
      "DARK_FACTORY_REMOTE_API_KEY_ENV",
    ],
  });
  checks.push({
    ...gated,
    skippedByDefault: gated.exitCode === 0 && /1 skipped/.test(gated.outputTail),
  });

  const dryRunSummary = dryRunSummaryFromSmoke(checks.find((check) => check.id === "ui_browser_smoke"));
  const evidence = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    startedAt,
    completedAt: new Date().toISOString(),
    branch: await gitOutput(["rev-parse", "--abbrev-ref", "HEAD"], repoRoot),
    commit: await gitOutput(["rev-parse", "HEAD"], repoRoot),
    checks,
    dryRunSummary,
    gatedIntegrationDefaultSkip: checks.find((check) => check.id === "gated_integration_default_skip")?.skippedByDefault === true,
    boundary: {
      truthSource: "dark-factory-journal",
      authoritative: false,
      terminalStateAdvanced: false,
      doesAuthorizeRemoteExecution: false,
      shouldContactRemoteProviderDuringDryRun: false,
      noResolvedCredentialValues: true,
    },
    instructions: {
      runbook: "docs/dark-factory/DARK_FACTORY_FIRST_REAL_PROVIDER_GATED_ATTEMPT_RUNBOOK.md",
      evidenceUse: "Attach this JSON to operator notes. Do not add secrets.",
    },
  };

  const evidencePath = join(outDir, "evidence.json");
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    ok: checks.every((check) => check.ok || check.status === "skipped") && evidence.gatedIntegrationDefaultSkip,
    evidencePath,
    checks: checks.map((check) => ({
      id: check.id,
      ok: check.ok,
      status: check.status,
      skippedByDefault: check.skippedByDefault,
    })),
    boundary: evidence.boundary,
  }, null, 2));
}

function parseArgs(args) {
  const parsed = {
    skipHeavy: false,
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
    if (arg === "--skip-heavy") {
      parsed.skipHeavy = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: pnpm preflight:first-provider [--out DIR] [--skip-heavy]");
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function skippedCheck(id, message) {
  return {
    id,
    ok: true,
    status: "skipped",
    exitCode: 0,
    durationMs: 0,
    message,
    outputTail: "",
  };
}

async function runCheck(id, command, cwd, options = {}) {
  const startedAt = Date.now();
  const result = await run(command, cwd, options.scrubEnv);
  const output = `${result.stdout}\n${result.stderr}`.trim();
  const parsedJson = options.parseJson ? parseLastJsonObject(output) : null;
  return {
    id,
    ok: result.exitCode === 0,
    status: result.exitCode === 0 ? "pass" : "fail",
    command: commandForEvidence(command),
    cwd,
    exitCode: result.exitCode,
    durationMs: Date.now() - startedAt,
    outputTail: sanitizeOutput(tailLines(output, options.redactHttpLogs ? 12 : 20)),
    ...(parsedJson ? { parsedJson: redactParsedJson(parsedJson) } : {}),
  };
}

function run(command, cwd, scrubEnv = []) {
  return new Promise((resolveRun) => {
    const env = { ...process.env };
    for (const key of scrubEnv) {
      delete env[key];
    }
    const child = spawn(command[0], command.slice(1), {
      cwd,
      env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (exitCode) => {
      resolveRun({
        exitCode: exitCode ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

async function gitOutput(args, cwd) {
  const result = await run(["git", ...args], cwd);
  return result.exitCode === 0 ? result.stdout.trim() : null;
}

function commandForEvidence(command) {
  return command.map((part) => {
    if (/API_KEY|TOKEN|PASSWORD|SECRET|CONNECTION_STRING/i.test(part)) return "<redacted>";
    return part;
  });
}

function sanitizeOutput(value) {
  return value
    .replace(/(api[_-]?key|token|password|secret|connection_string)\s*[:=]\s*["']?[^"'\s,}]+/gi, "$1=<redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer <redacted>");
}

function tailLines(value, maxLines) {
  return value.split(/\r?\n/).slice(-maxLines).join("\n");
}

function parseLastJsonObject(output) {
  const trimmed = output.trim();
  const start = trimmed.lastIndexOf("\n{");
  const jsonText = start >= 0 ? trimmed.slice(start + 1) : trimmed.startsWith("{") ? trimmed : "";
  if (!jsonText) return null;
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function redactParsedJson(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redactParsedJson(item));
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => {
    if (/api[_-]?key|token|password|secret|connection_string/i.test(key)) {
      return [key, "<redacted>"];
    }
    return [key, redactParsedJson(nested)];
  }));
}

function dryRunSummaryFromSmoke(check) {
  const smoke = check?.parsedJson;
  if (!smoke || typeof smoke !== "object") {
    return {
      source: "ui_browser_smoke",
      available: false,
    };
  }
  return {
    source: "ui_browser_smoke",
    available: true,
    ok: smoke.ok === true,
    scenarioCount: Array.isArray(smoke.scenarios) ? smoke.scenarios.length : 0,
    truthSource: smoke.boundary?.truthSource ?? null,
    authoritative: smoke.boundary?.authoritative ?? null,
    terminalStateAdvanced: smoke.boundary?.terminalStateAdvanced ?? null,
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
