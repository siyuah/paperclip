import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import plugin from "../src/worker.js";

const DARK_FACTORY_ROOT = "/home/siyuah/workspace/123";
const DARK_FACTORY_PYTHON = `${DARK_FACTORY_ROOT}/.venv312/bin/python`;
const SERVER_PORT = 9781;
const SERVER_ENDPOINT = `http://127.0.0.1:${SERVER_PORT}`;
const SERVER_API_KEY = "test-dark-factory-api-key";

const driverParams = {
  driverKey: "dark-factory-mock",
  companyId: "company-dark-factory",
  environmentId: "env-dark-factory-http",
  config: {
    mode: "http",
    endpoint: SERVER_ENDPOINT,
    timeoutMs: 5000,
    apiKey: SERVER_API_KEY,
    retryMaxRetries: 0,
    requestedBy: "paperclip-http-integration-test",
    workloadClass: "code",
  },
};

let server: ChildProcessWithoutNullStreams | null = null;
let tempDir: string | null = null;
let serverOutput = "";

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${SERVER_ENDPOINT}/api/health`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Dark Factory HTTP server did not become ready. Output:\n${serverOutput}`);
}

describe("Dark Factory HTTP integration", () => {
  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "dark-factory-http-integration-"));
    server = spawn(
      DARK_FACTORY_PYTHON,
      [
        "server.py",
        "--host",
        "127.0.0.1",
        "--port",
        String(SERVER_PORT),
        "--journal",
        join(tempDir, "journal.jsonl"),
      ],
      {
        cwd: DARK_FACTORY_ROOT,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1",
          DF_API_KEY: SERVER_API_KEY,
        },
      },
    );
    server.stdout.on("data", (chunk) => {
      serverOutput += chunk.toString();
    });
    server.stderr.on("data", (chunk) => {
      serverOutput += chunk.toString();
    });
    await waitForServer();
  }, 15_000);

  afterAll(async () => {
    if (server) {
      server.kill("SIGTERM");
      await new Promise((resolve) => server?.once("exit", resolve));
      server = null;
    }
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("runs probe, lease, park, rehydrate, and resume against the real HTTP service", async () => {
    const validation = await plugin.definition.onEnvironmentValidateConfig?.({
      driverKey: driverParams.driverKey,
      config: driverParams.config,
    });
    expect(validation).toMatchObject({ ok: true });

    const probe = await plugin.definition.onEnvironmentProbe?.(driverParams);
    expect(probe).toMatchObject({
      ok: true,
      summary: "Dark Factory HTTP environment ready",
      metadata: {
        source: "dark-factory-projection",
        authoritative: false,
        truthSource: "dark-factory-journal",
        runtimeMode: "http",
        terminalStateAdvanced: false,
      },
    });

    const lease = await plugin.definition.onEnvironmentAcquireLease?.({
      ...driverParams,
      runId: "df-run-http-integration",
    });
    expect(lease).toMatchObject({
      providerLeaseId: "df-http-lease-df-run-http-integration",
      expiresAt: null,
      metadata: {
        runId: "df-run-http-integration",
        runtimeMode: "http",
        terminalStateAdvanced: false,
        run: {
          runState: "planning",
          routeDecisionId: "rd-df-run-http-integration",
        },
      },
    });

    const park = await plugin.definition.onEnvironmentExecute?.({
      ...driverParams,
      lease: lease!,
      command: "dark-factory-http-park",
      args: ["integration_operator_review"],
    });
    expect(park).toMatchObject({
      exitCode: 0,
      timedOut: false,
      stderr: "",
      metadata: {
        runtimeMode: "http",
        terminalStateAdvanced: false,
        runAfter: {
          runState: "parked_manual",
        },
        projection: {
          projectionStatus: "needs_approval",
          terminalStateAdvanced: false,
        },
      },
    });

    const rehydrate = await plugin.definition.onEnvironmentExecute?.({
      ...driverParams,
      lease: lease!,
      command: "dark-factory-http-rehydrate",
    });
    expect(rehydrate).toMatchObject({
      exitCode: 0,
      timedOut: false,
      metadata: {
        runtimeMode: "http",
        terminalStateAdvanced: false,
        runAfter: {
          runState: "planning",
        },
        projection: {
          projectionStatus: "current",
          terminalStateAdvanced: false,
        },
      },
    });

    const resumed = await plugin.definition.onEnvironmentResumeLease?.({
      ...driverParams,
      providerLeaseId: lease!.providerLeaseId!,
      leaseMetadata: lease!.metadata,
    });
    expect(resumed).toMatchObject({
      providerLeaseId: "df-http-lease-df-run-http-integration",
      metadata: {
        resumedLease: true,
        runtimeMode: "http",
        terminalStateAdvanced: false,
        run: {
          runState: "planning",
        },
      },
    });
  }, 20_000);
});
