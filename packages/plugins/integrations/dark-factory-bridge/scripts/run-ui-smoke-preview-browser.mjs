#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import {
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import {
  dirname,
  join,
  resolve,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildUiSmokePreviewBrowserHarness } from "../src/ui-smoke-preview-browser-harness.ts";

const expectedScenarios = {
  healthy: "ready",
  warning_latency: "needs_attention",
  blocked_failures: "blocked",
  stale_readiness: "needs_attention",
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../../../..");
const defaultOutDir = join(repoRoot, "output/playwright/dark-factory-ui-smoke");

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outDir = resolve(options.outDir ?? defaultOutDir);
  const htmlPath = join(outDir, "index.html");
  const profileDir = join(outDir, "chromium-profile");
  const chromiumExecutable = options.chromium ?? findChromiumExecutable();

  if (!chromiumExecutable) {
    throw new Error(
      "No Chromium executable found. Set DARK_FACTORY_UI_SMOKE_CHROMIUM=/path/to/chrome or install Chromium.",
    );
  }

  await mkdir(outDir, { recursive: true });
  await rm(profileDir, { recursive: true, force: true });
  await mkdir(profileDir, { recursive: true });

  await writeFile(
    htmlPath,
    buildUiSmokePreviewBrowserHarness({
      generatedAt: new Date().toISOString(),
    }),
    "utf8",
  );

  const browser = spawn(chromiumExecutable, [
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    "--no-sandbox",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`,
    "about:blank",
  ], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  browser.stderr.setEncoding("utf8");
  browser.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  try {
    const portFile = join(profileDir, "DevToolsActivePort");
    const devtools = await readDevToolsPort(portFile);
    const cdp = await CdpConnection.connect(`ws://127.0.0.1:${devtools.port}${devtools.browserPath}`);
    const target = await cdp.send("Target.createTarget", { url: "about:blank" });
    const attached = await cdp.send("Target.attachToTarget", {
      targetId: target.targetId,
      flatten: true,
    });
    const sessionId = attached.sessionId;

    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Runtime.enable", {}, sessionId);
    const load = cdp.waitForEvent("Page.loadEventFired", sessionId, 5000);
    await cdp.send("Page.navigate", { url: pathToFileURL(htmlPath).href }, sessionId);
    await load;

    const scenarioResults = [];
    for (const [scenario, expectedStatus] of Object.entries(expectedScenarios)) {
      const pageState = await evaluateScenario(cdp, sessionId, scenario);
      assertPageState(pageState, scenario, expectedStatus);

      if (!options.noScreenshots) {
        const screenshot = await cdp.send("Page.captureScreenshot", { format: "png" }, sessionId);
        await writeFile(join(outDir, `${scenario}.png`), Buffer.from(screenshot.data, "base64"));
      }

      scenarioResults.push({
        scenario,
        expectedStatus,
        actualStatus: pageState.fields["Preview status"],
        readiness: pageState.fields.Readiness,
        nextSafeHook: pageState.fields["Next safe hook"],
        breakerState: pageState.fields["Breaker state"],
        truthSource: pageState.fields["Truth source"],
        authoritative: pageState.fields.Authoritative,
        terminalAdvanced: pageState.fields["Terminal advanced"],
        badgeCount: pageState.badges.length,
      });
    }

    await cdp.send("Browser.close");
    cdp.close();

    const result = {
      ok: true,
      htmlPath,
      outDir,
      chromiumExecutable,
      scenarios: scenarioResults,
      boundary: {
        truthSource: "dark-factory-journal",
        authoritative: false,
        terminalStateAdvanced: false,
      },
    };

    await writeFile(join(outDir, "smoke-result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    browser.kill("SIGKILL");
    if (stderr.trim()) {
      console.error(stderr.trim());
    }
    throw error;
  }
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      continue;
    } else if (arg === "--out") {
      parsed.outDir = args[index + 1];
      index += 1;
    } else if (arg === "--chromium") {
      parsed.chromium = args[index + 1];
      index += 1;
    } else if (arg === "--no-screenshots") {
      parsed.noScreenshots = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log("Usage: pnpm smoke:ui:browser [--out DIR] [--chromium PATH] [--no-screenshots]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function findChromiumExecutable() {
  const envPath = process.env.DARK_FACTORY_UI_SMOKE_CHROMIUM;
  if (envPath && isExecutableFile(envPath)) {
    return envPath;
  }

  const playwrightCache = join(homedir(), ".cache/ms-playwright");
  for (const candidate of findFiles(playwrightCache, "chrome")) {
    if (candidate.includes("chrome-linux") && isExecutableFile(candidate)) {
      return candidate;
    }
  }

  for (const binary of ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"]) {
    const result = spawnSync("which", [binary], { encoding: "utf8" });
    const candidate = result.status === 0 ? result.stdout.trim() : "";
    if (candidate && isExecutableFile(candidate)) {
      return candidate;
    }
  }

  return null;
}

function findFiles(root, fileName, maxDepth = 5) {
  if (!existsSync(root) || maxDepth < 0) {
    return [];
  }

  const found = [];
  for (const entry of readdirSync(root)) {
    const fullPath = join(root, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.isFile() && entry === fileName) {
      found.push(fullPath);
    } else if (stat.isDirectory()) {
      found.push(...findFiles(fullPath, fileName, maxDepth - 1));
    }
  }
  return found.sort();
}

function isExecutableFile(path) {
  try {
    const stat = statSync(path);
    return stat.isFile() && (stat.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

async function readDevToolsPort(filePath) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10000) {
    if (existsSync(filePath)) {
      const [port, browserPath] = (await readFile(filePath, "utf8")).trim().split("\n");
      return {
        port,
        browserPath,
      };
    }
    await sleep(100);
  }
  throw new Error("Timed out waiting for Chromium DevToolsActivePort");
}

async function evaluateScenario(cdp, sessionId, scenario) {
  const expression = `(() => {
    const scenarioSelect = document.getElementById("scenario");
    scenarioSelect.value = ${JSON.stringify(scenario)};
    scenarioSelect.dispatchEvent(new Event("change", { bubbles: true }));
    const fields = Object.fromEntries(Array.from(document.querySelectorAll(".field")).map((field) => {
      const label = field.querySelector("span")?.textContent ?? "";
      const value = field.querySelector("strong")?.textContent ?? "";
      return [label, value];
    }));
    return {
      scenario: scenarioSelect.value,
      summary: document.getElementById("summary")?.textContent ?? "",
      fields,
      badges: Array.from(document.querySelectorAll(".badge")).map((badge) => badge.textContent ?? "")
    };
  })()`;
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
  }, sessionId);
  if (result.exceptionDetails) {
    throw new Error(`Browser evaluation failed for ${scenario}`);
  }
  return result.result.value;
}

function assertPageState(pageState, scenario, expectedStatus) {
  const fields = pageState.fields;
  const checks = [
    [pageState.scenario === scenario, `scenario selector should be ${scenario}`],
    [fields["Preview status"] === expectedStatus, `${scenario} preview status should be ${expectedStatus}`],
    [fields["Truth source"] === "dark-factory-journal", `${scenario} truth source should remain Journal`],
    [fields.Authoritative === "no", `${scenario} must remain non-authoritative`],
    [fields["Terminal advanced"] === "no", `${scenario} must not advance terminal state`],
    [typeof fields["Next safe hook"] === "string" && fields["Next safe hook"].length > 0, `${scenario} should render next safe hook`],
    [typeof fields["Breaker state"] === "string" && fields["Breaker state"].length > 0, `${scenario} should render breaker state`],
    [Array.isArray(pageState.badges) && pageState.badges.includes("journal-truth-source"), `${scenario} should render Journal truth badge`],
  ];
  const failed = checks.find(([ok]) => !ok);
  if (failed) {
    throw new Error(failed[1]);
  }
}

function sleep(ms) {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

class CdpConnection {
  static connect(url) {
    return new Promise((resolveConnection, rejectConnection) => {
      const ws = new WebSocket(url);
      const connection = new CdpConnection(ws);
      ws.addEventListener("open", () => resolveConnection(connection), { once: true });
      ws.addEventListener("error", () => rejectConnection(new Error(`Failed to connect to ${url}`)), { once: true });
    });
  }

  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.eventWaiters = [];
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== undefined) {
        const pending = this.pending.get(message.id);
        if (!pending) {
          return;
        }
        this.pending.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result ?? {});
        }
        return;
      }
      this.resolveEventWaiters(message);
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId;
    this.nextId += 1;
    const payload = {
      id,
      method,
      params,
    };
    if (sessionId) {
      payload.sessionId = sessionId;
    }
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolveSend, rejectSend) => {
      this.pending.set(id, {
        resolve: resolveSend,
        reject: rejectSend,
      });
    });
  }

  waitForEvent(method, sessionId, timeoutMs) {
    return new Promise((resolveEvent, rejectEvent) => {
      const timer = setTimeout(() => {
        this.eventWaiters = this.eventWaiters.filter((waiter) => waiter !== waiterRef);
        rejectEvent(new Error(`Timed out waiting for CDP event ${method}`));
      }, timeoutMs);
      const waiterRef = {
        method,
        sessionId,
        resolve: (message) => {
          clearTimeout(timer);
          resolveEvent(message);
        },
      };
      this.eventWaiters.push(waiterRef);
    });
  }

  resolveEventWaiters(message) {
    const waiter = this.eventWaiters.find((candidate) =>
      candidate.method === message.method && candidate.sessionId === message.sessionId
    );
    if (!waiter) {
      return;
    }
    this.eventWaiters = this.eventWaiters.filter((candidate) => candidate !== waiter);
    waiter.resolve(message);
  }

  close() {
    this.ws.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
