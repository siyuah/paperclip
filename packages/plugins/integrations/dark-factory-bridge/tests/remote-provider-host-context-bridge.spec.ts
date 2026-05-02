import { describe, expect, it, vi, afterEach } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import {
  buildRemoteProviderHostContextBridge,
} from "../src/remote-provider-host-context-bridge.js";
import {
  createHostObservationFixture,
} from "../src/remote-provider-host-observation-fixtures.js";

describe("remote provider host context bridge", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("normalizes host active context into archive-ready readiness evidence", () => {
    vi.stubEnv("DARK_FACTORY_HOST_OBSERVATION_FIXTURE", "host-context-bridge-resolved-key");
    const fixture = createHostObservationFixture("healthy", {
      checkedAt: "2026-05-03T06:30:00.000Z",
    });

    const result = buildRemoteProviderHostContextBridge({
      hostActiveContext: fixture.activeContext,
    });

    expect(result).toMatchObject({
      source: "dark-factory-projection",
      truthSource: "dark-factory-journal",
      authoritative: false,
      observationSource: "runtime_observation",
      runtimeMode: "remote",
      bridgeKind: "host_active_context",
      contextAccepted: true,
      inputSource: "host_active_context",
      hostContextSupplied: true,
      terminalStateAdvanced: false,
      hostContextSummary: {
        checkedAt: "2026-05-03T06:30:00.000Z",
        evaluatedAt: "2026-05-03T06:30:00.000Z",
        expectedSequenceNo: 12,
        sampledObservationCount: 3,
        credentialOk: true,
        credentialSource: "env",
        breakerState: "closed",
        readinessStatus: "ready",
        nextSafeHook: "onEnvironmentExecute",
        alertCount: 0,
        receiptId: expect.stringMatching(/^df-readiness-[0-9a-f]{8}$/),
        doesAuthorizeRemoteExecution: false,
      },
      archiveHints: {
        outputDataKey: "remote-provider-host-context-bridge",
        shouldPersistInPluginDb: false,
        allowedPersistence: "projection/cache/cursor/receipt/request metadata only",
        requiresOperatorReview: false,
      },
    });
    expect(result.readiness.ready).toBe(true);
    expect(result.activeContext.sampledObservationCount).toBe(3);
    expect(JSON.stringify(result)).not.toContain("host-context-bridge-resolved-key");
  });

  it("marks warning or blocked host context as requiring operator review", () => {
    vi.stubEnv("DARK_FACTORY_HOST_OBSERVATION_FIXTURE", "host-context-bridge-resolved-key");
    const warning = buildRemoteProviderHostContextBridge({
      remoteProviderActiveContext: createHostObservationFixture("warning_latency").activeContext,
    });
    const blocked = buildRemoteProviderHostContextBridge({
      activeContext: createHostObservationFixture("blocked_failures").activeContext,
    });

    expect(warning.hostContextSummary).toMatchObject({
      readinessStatus: "needs_attention",
      nextSafeHook: "onEnvironmentProbe",
      breakerState: "closed",
      doesAuthorizeRemoteExecution: false,
    });
    expect(warning.archiveHints.requiresOperatorReview).toBe(true);
    expect(blocked.hostContextSummary).toMatchObject({
      readinessStatus: "blocked",
      nextSafeHook: "onEnvironmentProbe",
      breakerState: "open",
      doesAuthorizeRemoteExecution: false,
    });
    expect(blocked.archiveHints.requiresOperatorReview).toBe(true);
    expect(warning.terminalStateAdvanced).toBe(false);
    expect(blocked.terminalStateAdvanced).toBe(false);
  });

  it("lets direct params override host context fields and records merged input source", () => {
    const result = buildRemoteProviderHostContextBridge({
      hostActiveContext: createHostObservationFixture("healthy").activeContext,
      checkedAt: "2026-05-03T06:45:00.000Z",
      observations: [
        {
          operation: "execute",
          status: 503,
          durationMs: 120,
          attempt: 0,
          retryable: true,
          failureClass: "transient_provider",
          errorCode: "direct_override_failure",
          lastSequenceNo: 4,
          terminalStateAdvanced: true,
        },
      ],
      config: {
        mode: "remote",
        endpoint: "https://dark-factory.example.test",
      },
    });

    expect(result.inputSource).toBe("merged");
    expect(result.hostContextSummary).toMatchObject({
      checkedAt: "2026-05-03T06:45:00.000Z",
      sampledObservationCount: 1,
      credentialOk: false,
      readinessStatus: "blocked",
      doesAuthorizeRemoteExecution: false,
    });
    expect(result.activeContext.observations[0]).toMatchObject({
      operation: "execute",
      failureClass: "transient_provider",
      errorCode: "direct_override_failure",
      terminalStateAdvanced: false,
    });
    expect(result.archiveHints.requiresOperatorReview).toBe(true);
  });

  it("exposes the bridge through plugin data without contacting a provider", async () => {
    vi.stubEnv("DARK_FACTORY_HOST_OBSERVATION_FIXTURE", "plugin-host-context-bridge-resolved-key");
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.getData<ReturnType<typeof buildRemoteProviderHostContextBridge>>(
      "remote-provider-host-context-bridge",
      {
        companyId: "company-host-context-bridge",
        activeContext: createHostObservationFixture("stale_readiness").activeContext,
      },
    );

    expect(result).toMatchObject({
      source: "dark-factory-projection",
      truthSource: "dark-factory-journal",
      authoritative: false,
      runtimeMode: "remote",
      hostContextSummary: {
        readinessStatus: "needs_attention",
        nextSafeHook: "onEnvironmentProbe",
        doesAuthorizeRemoteExecution: false,
      },
      archiveHints: {
        outputDataKey: "remote-provider-host-context-bridge",
        shouldPersistInPluginDb: false,
        requiresOperatorReview: true,
      },
      terminalStateAdvanced: false,
    });
    expect(JSON.stringify(result)).not.toContain("plugin-host-context-bridge-resolved-key");
  });
});
