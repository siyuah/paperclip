import { afterEach, describe, expect, it, vi } from "vitest";
import { DarkFactoryHttpClient, classifyHttpFailure, httpClientFromConfig, normalizeHttpEnvironmentConfig } from "../src/http-runtime-adapter.js";

const runView = {
  protocolReleaseTag: "v3.0-agent-control-r1",
  runId: "run-retry-test",
  runState: "planning",
  traceId: "trace-retry-test",
  activeAttemptId: "attempt-retry-test",
  blockedBy: [],
  routeDecisionId: "rd-run-retry-test",
  journalCursor: "dark-factory://journal/test#3",
  lastSequenceNo: 3,
  sourceJournalRef: "file:///tmp/journal.jsonl",
};

describe("DarkFactoryHttpClient hardening", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends the API key header and retries retryable statuses", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ errorCode: "temporary", message: "try again" }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(runView), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const client = new DarkFactoryHttpClient({
      mode: "http",
      endpoint: "http://127.0.0.1:9701",
      timeoutMs: 1000,
      requestedBy: "test",
      workloadClass: "code",
      apiKey: "secret-api-key",
      retry: {
        maxRetries: 1,
        baseDelayMs: 1,
        maxDelayMs: 1,
        retryableStatuses: [503],
      },
    });
    const result = await client.getExternalRun("run-retry-test");

    expect(result).toEqual(runView);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(firstHeaders["x-api-key"]).toBe("secret-api-key");
    expect(firstHeaders["x-protocol-release-tag"]).toBe("v3.0-agent-control-r1");
    const logLines = [
      ...(vi.mocked(console.warn).mock.calls.map((call) => String(call[0]))),
      ...(vi.mocked(console.info).mock.calls.map((call) => String(call[0]))),
    ];
    expect(logLines.join("\n")).not.toContain("secret-api-key");
    expect(JSON.parse(logLines[0] ?? "{}")).toMatchObject({
      component: "dark-factory-http-client",
      status: 503,
      error_type: "DarkFactoryHttpError",
      error_message: "try again",
    });
  });

  it("normalizes secret references without sending them as API keys", async () => {
    const normalized = normalizeHttpEnvironmentConfig({
      mode: "http",
      endpoint: "https://127.0.0.1:9702",
      apiKeySecretRef: "secret://dark-factory/api-key",
    });
    expect(normalized).toMatchObject({
      endpoint: "https://127.0.0.1:9702",
      apiKeySecretRef: "secret://dark-factory/api-key",
    });
    expect(normalized).not.toHaveProperty("apiKey");

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(runView), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const client = new DarkFactoryHttpClient({
      mode: "http",
      endpoint: "https://127.0.0.1:9702",
      timeoutMs: 1000,
      requestedBy: "test",
      workloadClass: "code",
      apiKeySecretRef: "secret://dark-factory/api-key",
      retry: {
        maxRetries: 0,
        baseDelayMs: 1,
        maxDelayMs: 1,
        retryableStatuses: [503],
      },
    });
    await client.getExternalRun("run-retry-test");

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBeUndefined();
  });

  it("resolves env secret references at request time without normalizing the secret value", async () => {
    vi.stubEnv("DARK_FACTORY_TEST_API_KEY", "env-resolved-api-key");
    const normalized = normalizeHttpEnvironmentConfig({
      mode: "remote",
      endpoint: "https://127.0.0.1:9702",
      apiKeySecretRef: "env:DARK_FACTORY_TEST_API_KEY",
    });
    expect(normalized).toMatchObject({
      mode: "remote",
      endpoint: "https://127.0.0.1:9702",
      apiKeySecretRef: "env:DARK_FACTORY_TEST_API_KEY",
    });
    expect(JSON.stringify(normalized)).not.toContain("env-resolved-api-key");

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(runView), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const client = httpClientFromConfig({
      mode: "remote",
      endpoint: "https://127.0.0.1:9702",
      timeoutMs: 1000,
      requestedBy: "test",
      workloadClass: "code",
      apiKeySecretRef: "env:DARK_FACTORY_TEST_API_KEY",
      retry: {
        maxRetries: 0,
        baseDelayMs: 1,
        maxDelayMs: 1,
        retryableStatuses: [503],
      },
    });
    await client.getExternalRun("run-retry-test");

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("env-resolved-api-key");
    const logText = vi.mocked(console.info).mock.calls.map((call) => String(call[0])).join("\n");
    expect(logText).not.toContain("env-resolved-api-key");
  });

  it("ignores unsupported secret reference schemes", async () => {
    vi.stubEnv("DARK_FACTORY_TEST_API_KEY", "env-resolved-api-key");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(runView), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const client = new DarkFactoryHttpClient({
      mode: "remote",
      endpoint: "https://127.0.0.1:9702",
      timeoutMs: 1000,
      requestedBy: "test",
      workloadClass: "code",
      apiKeySecretRef: "secret://dark-factory/api-key",
      retry: {
        maxRetries: 0,
        baseDelayMs: 1,
        maxDelayMs: 1,
        retryableStatuses: [503],
      },
    });
    await client.getExternalRun("run-retry-test");

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBeUndefined();
  });

  it.each([
    [{ code: "unauthorized", status: 401 }, "runtime_blocked", false],
    [{ code: "forbidden", status: 403 }, "runtime_blocked", false],
    [{ code: "quota_exceeded", status: 429 }, "quota_exceeded", true],
    [{ code: "provider_unavailable", status: 500 }, "transient_provider", true],
    [{ code: "bad_gateway", status: 502 }, "transient_provider", true],
    [{ code: "unavailable", status: 503 }, "transient_provider", true],
    [{ code: "dark_factory_http_timeout", status: 504 }, "transient_provider", true],
    [{ code: "dark_factory_invalid_json", status: 200 }, "provider_unavailable", true],
  ] as const)("classifies remote provider error %o", (input, failureClass, retryable) => {
    expect(classifyHttpFailure(input)).toMatchObject({
      failureClass,
      retryable,
      runtimeImpact: {
        paperclipTerminalState: "unchanged",
        terminalStateAdvanced: false,
        reason: input.code,
      },
    });
  });
});
