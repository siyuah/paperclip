import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRemoteProviderReadinessReport } from "../src/remote-provider-readiness.js";
import { buildRemoteProviderActiveContext } from "../src/remote-provider-active-context.js";

describe("remote provider active context", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("normalizes active readiness inputs from params without advancing terminal state", () => {
    vi.stubEnv("DARK_FACTORY_CONTEXT_SPEC_CREDENTIAL", "context-spec-resolved-key");
    const context = buildRemoteProviderActiveContext({
      checkedAt: "2026-05-03T01:00:00.000Z",
      evaluatedAt: "2026-05-03T01:00:01.000Z",
      expectedSequenceNo: "8",
      failureThreshold: "2",
      cooldownMs: "10000",
      config: {
        mode: "remote",
        endpoint: "https://dark-factory.example.test",
        apiKeySecretRef: "env:DARK_FACTORY_CONTEXT_SPEC_CREDENTIAL",
      },
      previousBreaker: {
        breakerState: "closed",
        consecutiveFailures: 1,
      },
      previousReadiness: {
        readinessStatus: "blocked",
        nextSafeHook: "onEnvironmentValidateConfig",
        receiptDigest: "00000000",
        receiptId: "df-readiness-00000000",
        checkedAt: "2026-05-03T00:59:00.000Z",
      },
      observations: [
        {
          runtimeMode: "remote",
          operation: "probe",
          status: "200",
          durationMs: "25",
          attempt: "0",
          retryable: false,
          failureClass: "none",
          errorCode: null,
          journalCursor: "dark-factory://journal/context#7",
          lastSequenceNo: "7",
          terminalStateAdvanced: true,
        },
      ],
    });

    expect(context).toMatchObject({
      source: "dark-factory-projection",
      authoritative: false,
      truthSource: "dark-factory-journal",
      observationSource: "runtime_observation",
      runtimeMode: "remote",
      inputSource: "params",
      hostContextSupplied: false,
      checkedAt: "2026-05-03T01:00:00.000Z",
      evaluatedAt: "2026-05-03T01:00:01.000Z",
      expectedSequenceNo: 8,
      sampledObservationCount: 1,
      terminalStateAdvanced: false,
      credentialDiagnostics: {
        ok: true,
        credentialSource: "env",
        checkedConfig: {
          configSupplied: true,
          mode: "remote",
          endpointPresent: true,
          apiKeyPresent: false,
          apiKeySecretRefPresent: true,
          apiKeySecretRefScheme: "env",
        },
        terminalStateAdvanced: false,
      },
      metricsSnapshot: {
        requestCount: 1,
        successCount: 1,
        failureCount: 0,
        latestJournalCursor: "dark-factory://journal/context#7",
        latestSequenceNo: 7,
        cursorLag: 1,
        terminalStateAdvanced: false,
      },
      breakerEvaluation: {
        breakerState: "closed",
        previousBreakerState: "closed",
        consecutiveFailures: 0,
        terminalStateAdvanced: false,
      },
      previousReadiness: {
        readinessStatus: "blocked",
        nextSafeHook: "onEnvironmentValidateConfig",
        receiptDigest: "00000000",
        receiptId: "df-readiness-00000000",
        checkedAt: "2026-05-03T00:59:00.000Z",
      },
    });
    expect(context.observations).toEqual([
      expect.objectContaining({
        runtimeMode: "remote",
        operation: "probe",
        status: 200,
        durationMs: 25,
        attempt: 0,
        failureClass: "none",
        lastSequenceNo: 7,
        terminalStateAdvanced: false,
      }),
    ]);
    expect(context.readinessInput).toMatchObject({
      checkedAt: "2026-05-03T01:00:00.000Z",
      sampledObservationCount: 1,
      previousReadiness: {
        readinessStatus: "blocked",
        receiptDigest: "00000000",
      },
    });
    expect(JSON.stringify(context)).not.toContain("context-spec-resolved-key");
  });

  it("normalizes host-supplied active context envelope into readiness inputs", () => {
    vi.stubEnv("DARK_FACTORY_HOST_CONTEXT_CREDENTIAL", "host-context-resolved-key");
    const context = buildRemoteProviderActiveContext({
      activeContext: {
        checkedAt: "2026-05-03T02:00:00.000Z",
        evaluatedAt: "2026-05-03T02:00:01.000Z",
        environmentConfig: {
          mode: "remote",
          endpoint: "https://dark-factory.example.test",
          apiKeySecretRef: "env:DARK_FACTORY_HOST_CONTEXT_CREDENTIAL",
        },
        journal: {
          expectedSequenceNo: 12,
        },
        sampledObservations: [
          {
            operation: "execute",
            status: 200,
            durationMs: 30,
            attempt: 0,
            retryable: false,
            failureClass: "none",
            journalCursor: "dark-factory://journal/host-context#12",
            lastSequenceNo: 12,
            terminalStateAdvanced: true,
          },
        ],
        breakerEvidence: {
          breakerState: "closed",
          consecutiveFailures: 1,
        },
        readinessEvidence: {
          readinessStatus: "needs_attention",
          nextSafeHook: "onEnvironmentProbe",
          receiptDigest: "11111111",
        },
        alertThresholds: {
          errorRateWarningThreshold: 0.9,
          latencyWarningThresholdMs: 1000,
          cursorLagWarningThreshold: 2,
        },
        circuitBreakerPolicy: {
          failureThreshold: 2,
          cooldownMs: 10000,
          halfOpenSuccessThreshold: 1,
        },
      },
    });

    expect(context).toMatchObject({
      source: "dark-factory-projection",
      authoritative: false,
      truthSource: "dark-factory-journal",
      observationSource: "runtime_observation",
      runtimeMode: "remote",
      inputSource: "host_active_context",
      hostContextSupplied: true,
      checkedAt: "2026-05-03T02:00:00.000Z",
      evaluatedAt: "2026-05-03T02:00:01.000Z",
      expectedSequenceNo: 12,
      sampledObservationCount: 1,
      credentialDiagnostics: {
        ok: true,
        credentialSource: "env",
        checkedConfig: {
          endpointPresent: true,
          apiKeySecretRefPresent: true,
          apiKeySecretRefScheme: "env",
        },
      },
      metricsSnapshot: {
        latestJournalCursor: "dark-factory://journal/host-context#12",
        latestSequenceNo: 12,
        cursorLag: 0,
      },
      previousReadiness: {
        readinessStatus: "needs_attention",
        nextSafeHook: "onEnvironmentProbe",
        receiptDigest: "11111111",
      },
      terminalStateAdvanced: false,
    });
    expect(context.observations[0]?.terminalStateAdvanced).toBe(false);
    expect(context.readinessInput.previousReadiness).toEqual(context.previousReadiness);
    expect(JSON.stringify(context)).not.toContain("host-context-resolved-key");
  });

  it("lets direct params override host active context fields", () => {
    const context = buildRemoteProviderActiveContext({
      activeContext: {
        checkedAt: "2026-05-03T02:10:00.000Z",
        evaluatedAt: "2026-05-03T02:10:00.000Z",
        environmentConfig: {
          mode: "remote",
          endpoint: "https://host.example.test",
        },
        sampledObservations: [
          {
            operation: "probe",
            status: 200,
            durationMs: 10,
            attempt: 0,
            retryable: false,
            failureClass: "none",
            lastSequenceNo: 1,
          },
        ],
      },
      checkedAt: "2026-05-03T02:11:00.000Z",
      config: {
        mode: "remote",
        endpoint: "https://direct.example.test",
      },
      observations: [
        {
          operation: "execute",
          status: 503,
          durationMs: 20,
          attempt: 1,
          retryable: true,
          failureClass: "transient_provider",
          errorCode: "direct_failure",
          lastSequenceNo: 2,
        },
      ],
    });

    expect(context).toMatchObject({
      inputSource: "merged",
      hostContextSupplied: true,
      checkedAt: "2026-05-03T02:11:00.000Z",
      evaluatedAt: "2026-05-03T02:10:00.000Z",
      credentialDiagnostics: {
        ok: false,
        checkedConfig: {
          endpointPresent: true,
          apiKeySecretRefPresent: false,
        },
      },
      metricsSnapshot: {
        requestCount: 1,
        failureCount: 1,
        latestErrorCode: "direct_failure",
        latestSequenceNo: 2,
      },
    });
    expect(context.observations).toEqual([
      expect.objectContaining({
        operation: "execute",
        status: 503,
        attempt: 1,
        failureClass: "transient_provider",
        errorCode: "direct_failure",
      }),
    ]);
  });

  it("builds the same readiness report as manually supplied active context fields", () => {
    const params = {
      checkedAt: "2026-05-03T01:05:00.000Z",
      evaluatedAt: "2026-05-03T01:05:00.000Z",
      config: { mode: "remote", endpoint: "https://dark-factory.example.test" },
      observations: [
        {
          operation: "execute",
          status: 503,
          durationMs: 50,
          attempt: 0,
          retryable: true,
          failureClass: "transient_provider",
          errorCode: "unavailable",
          terminalStateAdvanced: false,
        },
      ],
    };

    const context = buildRemoteProviderActiveContext(params);
    const fromContext = buildRemoteProviderReadinessReport(context.readinessInput);
    const manual = buildRemoteProviderReadinessReport({
      credentialDiagnostics: context.credentialDiagnostics,
      metricsSnapshot: context.metricsSnapshot,
      alertCandidates: context.alertCandidates,
      breakerEvaluation: context.breakerEvaluation,
      sampledObservationCount: context.sampledObservationCount,
      checkedAt: context.checkedAt,
      previousReadiness: context.previousReadiness,
    });

    expect(fromContext).toEqual(manual);
    expect(fromContext.authoritative).toBe(false);
    expect(fromContext.terminalStateAdvanced).toBe(false);
  });

  it("is deterministic for the same params and keeps invalid inputs safe", () => {
    const params = {
      checkedAt: "not-a-date",
      evaluatedAt: "not-a-date",
      expectedSequenceNo: "not-a-number",
      previousBreaker: {
        breakerState: "invalid",
        lastFailureClass: "invalid",
      },
      previousReadiness: {
        readinessStatus: "invalid",
        nextSafeHook: "invalid",
        digest: "abc123",
      },
      observations: [
        {
          operation: "invalid",
          status: "not-a-number",
          durationMs: "not-a-number",
          attempt: "not-a-number",
          retryable: "yes",
          failureClass: "invalid",
          terminalStateAdvanced: true,
        },
      ],
    };

    const first = buildRemoteProviderActiveContext(params);
    const second = buildRemoteProviderActiveContext(params);

    expect(first).toEqual(second);
    expect(first.expectedSequenceNo).toBeNull();
    expect(first.observations).toEqual([
      expect.objectContaining({
        operation: "execute",
        status: null,
        durationMs: 0,
        attempt: 0,
        retryable: false,
        failureClass: "none",
        terminalStateAdvanced: false,
      }),
    ]);
    expect(first.previousReadiness).toEqual({
      receiptDigest: "abc123",
      receiptId: null,
      checkedAt: null,
    });
    expect(first.readinessInput.checkedAt).toBe("not-a-date");
    expect(first.terminalStateAdvanced).toBe(false);
  });
});
