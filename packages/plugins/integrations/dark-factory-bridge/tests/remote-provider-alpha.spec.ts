import { afterEach, describe, expect, it, vi } from "vitest";
import plugin from "../src/worker.js";

const runId = "df-run-remote-alpha";
const endpoint = "https://dark-factory.example.test";
const apiKey = "remote-alpha-test-key";

const driverParams = {
  driverKey: "dark-factory-mock",
  companyId: "company-dark-factory",
  environmentId: "env-dark-factory-remote",
  config: {
    mode: "remote",
    endpoint,
    timeoutMs: 1000,
    apiKey,
    retryMaxRetries: 0,
    requestedBy: "paperclip-remote-provider-alpha-test",
    workloadClass: "code",
  },
};

const runView = {
  protocolReleaseTag: "v3.0-agent-control-r1",
  runId,
  runState: "planning",
  traceId: `trace-lease-${runId}`,
  activeAttemptId: `attempt-${runId}`,
  blockedBy: [],
  routeDecisionId: `rd-${runId}`,
  journalCursor: `dark-factory://journal/${runId}#3`,
  lastSequenceNo: 3,
  sourceJournalRef: "dark-factory-remote",
};

const routeDecision = {
  protocolReleaseTag: "v3.0-agent-control-r1",
  routeDecisionId: `rd-${runId}`,
  runId,
  workloadClass: "code",
  selectedExecutorClass: "code",
  fallbackDepth: 0,
  decisionReason: "remote_provider_alpha_contract_test",
  routeDecisionState: "selected",
  attemptId: `attempt-${runId}`,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function expectBoundary(value: Record<string, unknown> | undefined): void {
  expect(value).toMatchObject({
    source: "dark-factory-projection",
    authoritative: false,
    truthSource: "dark-factory-journal",
    terminalStateAdvanced: false,
  });
}

function setupRemoteFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const parsed = new URL(url);
    const method = init?.method ?? "GET";
    if (method === "GET" && parsed.pathname === "/api/health") {
      return jsonResponse({
        ok: true,
        protocolReleaseTag: "v3.0-agent-control-r1",
        journal: "remote-alpha-journal",
        events: 3,
      });
    }
    if (method === "POST" && parsed.pathname === "/api/external-runs") {
      return jsonResponse(runView);
    }
    if (method === "GET" && parsed.pathname === `/api/external-runs/${runId}`) {
      return jsonResponse(runView);
    }
    if (method === "GET" && parsed.pathname === `/api/external-runs/${runId}/route-decisions`) {
      return jsonResponse([routeDecision]);
    }
    return jsonResponse({ errorCode: "not_found", message: `${method} ${parsed.pathname}` }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  return fetchMock;
}

describe("Dark Factory remote provider alpha", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("validates remote config and preserves secret references without connecting", async () => {
    vi.stubEnv("DARK_FACTORY_REMOTE_ALPHA_TEST_API_KEY", "remote-alpha-env-key");
    const ok = await plugin.definition.onEnvironmentValidateConfig?.({
      driverKey: driverParams.driverKey,
      config: {
        mode: "remote",
        endpoint,
        timeoutMs: 2500,
        apiKeySecretRef: "env:DARK_FACTORY_REMOTE_ALPHA_TEST_API_KEY",
      },
    });
    const rejected = await plugin.definition.onEnvironmentValidateConfig?.({
      driverKey: driverParams.driverKey,
      config: { mode: "remote" },
    });

    expect(ok).toMatchObject({
      ok: true,
      normalizedConfig: {
        mode: "remote",
        endpoint,
        timeoutMs: 2500,
        apiKeySecretRef: "env:DARK_FACTORY_REMOTE_ALPHA_TEST_API_KEY",
      },
    });
    expect(rejected).toEqual({
      ok: false,
      errors: ["endpoint is required for remote mode"],
    });
  });

  it("rejects remote credential misconfiguration before provider network calls", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const missing = await plugin.definition.onEnvironmentValidateConfig?.({
      driverKey: driverParams.driverKey,
      config: { mode: "remote", endpoint },
    });
    const unsupported = await plugin.definition.onEnvironmentValidateConfig?.({
      driverKey: driverParams.driverKey,
      config: { mode: "remote", endpoint, apiKeySecretRef: "secret://dark-factory/api-key" },
    });
    const unresolved = await plugin.definition.onEnvironmentValidateConfig?.({
      driverKey: driverParams.driverKey,
      config: { mode: "remote", endpoint, apiKeySecretRef: "env:DARK_FACTORY_REMOTE_ALPHA_MISSING_KEY" },
    });

    expect(missing).toEqual({
      ok: false,
      errors: ["apiKey or apiKeySecretRef is required for remote mode"],
    });
    expect(unsupported).toEqual({
      ok: false,
      errors: ["apiKeySecretRef must use env:NAME or env://NAME in remote alpha"],
    });
    expect(unresolved).toEqual({
      ok: false,
      errors: ["apiKeySecretRef environment variable is not set: DARK_FACTORY_REMOTE_ALPHA_MISSING_KEY"],
    });

    const probe = await plugin.definition.onEnvironmentProbe?.({
      ...driverParams,
      config: { mode: "remote", endpoint, apiKeySecretRef: "env:DARK_FACTORY_REMOTE_ALPHA_MISSING_KEY" },
    });
    expect(probe).toMatchObject({
      ok: false,
      summary: "Dark Factory remote environment unavailable",
      diagnostics: [
        {
          code: "dark_factory_remote_credential_unresolved",
        },
      ],
      metadata: {
        runtimeMode: "remote",
        terminalStateAdvanced: false,
      },
    });

    await expect(plugin.definition.onEnvironmentAcquireLease?.({
      ...driverParams,
      config: { mode: "remote", endpoint, apiKeySecretRef: "env:DARK_FACTORY_REMOTE_ALPHA_MISSING_KEY" },
      runId,
    })).rejects.toThrow("apiKeySecretRef environment variable is not set: DARK_FACTORY_REMOTE_ALPHA_MISSING_KEY");

    const lease = {
      providerLeaseId: `df-remote-lease-${runId}`,
      expiresAt: null,
      metadata: {
        source: "dark-factory-projection",
        authoritative: false,
        truthSource: "dark-factory-journal",
        runtimeMode: "remote",
        runId,
      },
    };
    const execution = await plugin.definition.onEnvironmentExecute?.({
      ...driverParams,
      config: { mode: "remote", endpoint, apiKeySecretRef: "env:DARK_FACTORY_REMOTE_ALPHA_MISSING_KEY" },
      lease,
      command: "dark-factory-remote-observe",
    });
    expect(execution).toMatchObject({
      exitCode: null,
      stderr: "apiKeySecretRef environment variable is not set: DARK_FACTORY_REMOTE_ALPHA_MISSING_KEY",
      metadata: {
        runtimeMode: "remote",
        errorCode: "dark_factory_remote_credential_unresolved",
        failureClass: "runtime_blocked",
        retryable: false,
        terminalStateAdvanced: false,
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("runs remote provider alpha lifecycle through the HTTP contract without terminal advancement", async () => {
    const fetchMock = setupRemoteFetch();

    const probe = await plugin.definition.onEnvironmentProbe?.(driverParams);
    expect(probe).toMatchObject({
      ok: true,
      summary: "Dark Factory remote environment ready",
      metadata: {
        runtimeMode: "remote",
        health: { ok: true },
      },
    });
    expectBoundary(probe?.metadata);

    const lease = await plugin.definition.onEnvironmentAcquireLease?.({
      ...driverParams,
      runId,
    });
    expect(lease).toMatchObject({
      providerLeaseId: `df-remote-lease-${runId}`,
      expiresAt: null,
      metadata: {
        runId,
        runtimeMode: "remote",
        journalCursor: {
          runtimeMode: "remote",
          sourceJournalRef: "dark-factory-remote",
        },
      },
    });
    expectBoundary(lease?.metadata);

    const execution = await plugin.definition.onEnvironmentExecute?.({
      ...driverParams,
      lease: lease!,
      command: "dark-factory-remote-observe",
      args: ["projection-only"],
    });
    expect(execution).toMatchObject({
      exitCode: 0,
      timedOut: false,
      stderr: "",
      metadata: {
        runtimeMode: "remote",
        projection: {
          runtimeMode: "remote",
          authoritative: false,
          terminalStateAdvanced: false,
          callbackReceipt: {
            idempotencyKey: `remote:${runId}:3`,
          },
        },
        cursor: {
          runtimeMode: "remote",
          sourceJournalRef: "dark-factory-remote",
        },
      },
    });
    expectBoundary(execution?.metadata);

    const stdout = JSON.parse(execution?.stdout ?? "{}") as Record<string, unknown>;
    expect(stdout).toMatchObject({
      runtimeMode: "remote",
      authoritative: false,
      terminalStateAdvanced: false,
    });

    const resumed = await plugin.definition.onEnvironmentResumeLease?.({
      ...driverParams,
      providerLeaseId: lease!.providerLeaseId!,
      leaseMetadata: lease!.metadata,
    });
    expect(resumed).toMatchObject({
      providerLeaseId: `df-remote-lease-${runId}`,
      metadata: {
        runtimeMode: "remote",
        resumedLease: true,
        terminalStateAdvanced: false,
      },
    });
    expectBoundary(resumed?.metadata);

    const headers = fetchMock.mock.calls.map((call) => call[1]?.headers as Record<string, string>);
    expect(headers.every((item) => item["x-api-key"] === apiKey)).toBe(true);
    const logText = [
      ...vi.mocked(console.info).mock.calls.map((call) => String(call[0])),
      ...vi.mocked(console.warn).mock.calls.map((call) => String(call[0])),
    ].join("\n");
    expect(logText).not.toContain(apiKey);
  });

  it("maps remote provider execution errors without advancing terminal state", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const parsed = new URL(url);
      if (parsed.pathname === `/api/external-runs/${runId}`) {
        return jsonResponse({ errorCode: "quota_exceeded", message: "provider quota exceeded" }, 429);
      }
      return jsonResponse({ errorCode: "unexpected_route", message: parsed.pathname }, 500);
    }));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const execution = await plugin.definition.onEnvironmentExecute?.({
      ...driverParams,
      lease: {
        providerLeaseId: `df-remote-lease-${runId}`,
        expiresAt: null,
        metadata: {
          source: "dark-factory-projection",
          authoritative: false,
          truthSource: "dark-factory-journal",
          runtimeMode: "remote",
          runId,
        },
      },
      command: "dark-factory-remote-observe",
    });

    expect(execution).toMatchObject({
      exitCode: null,
      timedOut: false,
      stdout: "",
      stderr: "provider quota exceeded",
      metadata: {
        source: "dark-factory-projection",
        authoritative: false,
        truthSource: "dark-factory-journal",
        runtimeMode: "remote",
        terminalStateAdvanced: false,
        errorCode: "quota_exceeded",
        errorStatus: 429,
        failureClass: "quota_exceeded",
        retryable: true,
        runtimeImpact: {
          paperclipTerminalState: "unchanged",
          terminalStateAdvanced: false,
          reason: "quota_exceeded",
        },
      },
    });

    const logText = vi.mocked(console.warn).mock.calls.map((call) => String(call[0])).join("\n");
    expect(logText).not.toContain(apiKey);
  });
});
