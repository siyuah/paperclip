import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import {
  adaptRemoteProviderHostContext,
} from "../src/remote-provider-host-context-adapter.js";
import {
  buildRemoteProviderHostContextBridge,
} from "../src/remote-provider-host-context-bridge.js";
import {
  createHostObservationFixture,
} from "../src/remote-provider-host-observation-fixtures.js";

describe("remote provider host context adapter", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("adapts combined host settings and runtime context into active context input", () => {
    vi.stubEnv("DARK_FACTORY_HOST_CONTEXT_ADAPTER", "adapter-resolved-key");
    const fixture = createHostObservationFixture("healthy", {
      apiKeySecretRef: "env:DARK_FACTORY_HOST_CONTEXT_ADAPTER",
      checkedAt: "2026-05-03T08:00:00.000Z",
    });

    const adapted = adaptRemoteProviderHostContext({
      hostSettingsContext: {
        environmentConfig: fixture.activeContext.environmentConfig,
        alertThresholds: fixture.activeContext.alertThresholds,
        circuitBreakerPolicy: fixture.activeContext.circuitBreakerPolicy,
      },
      hostRuntimeContext: {
        checkedAt: fixture.activeContext.checkedAt,
        evaluatedAt: fixture.activeContext.evaluatedAt,
        journal: fixture.activeContext.journal,
        sampledObservations: fixture.activeContext.sampledObservations,
        breakerEvidence: fixture.activeContext.breakerEvidence,
        readinessEvidence: fixture.activeContext.readinessEvidence,
      },
    });

    expect(adapted).toMatchObject({
      source: "dark-factory-projection",
      truthSource: "dark-factory-journal",
      authoritative: false,
      observationSource: "runtime_observation",
      runtimeMode: "remote",
      adapterKind: "host_settings_runtime_context",
      inputSource: "combined",
      doesAuthorizeRemoteExecution: false,
      terminalStateAdvanced: false,
      adapterSummary: {
        settingsSupplied: true,
        runtimeSupplied: true,
        environmentConfigSupplied: true,
        observationCount: 3,
        previousBreakerSupplied: true,
        previousReadinessSupplied: true,
        expectedSequenceNo: 12,
        checkedAt: "2026-05-03T08:00:00.000Z",
        evaluatedAt: "2026-05-03T08:00:00.000Z",
      },
    });
    expect(adapted.activeContext).toMatchObject({
      environmentConfig: fixture.activeContext.environmentConfig,
      sampledObservations: fixture.activeContext.sampledObservations,
      journal: fixture.activeContext.journal,
    });
    expect(JSON.stringify(adapted)).not.toContain("adapter-resolved-key");
  });

  it("feeds adapted context into the host context bridge and readiness report", () => {
    vi.stubEnv("DARK_FACTORY_HOST_CONTEXT_ADAPTER", "adapter-resolved-key");
    const fixture = createHostObservationFixture("blocked_failures", {
      apiKeySecretRef: "env:DARK_FACTORY_HOST_CONTEXT_ADAPTER",
      checkedAt: "2026-05-03T08:10:00.000Z",
    });
    const adapted = adaptRemoteProviderHostContext({
      settingsContext: {
        driverConfig: fixture.activeContext.environmentConfig,
        thresholds: fixture.activeContext.alertThresholds,
        breakerPolicy: fixture.activeContext.circuitBreakerPolicy,
      },
      runtimeContext: {
        checkedAt: fixture.activeContext.checkedAt,
        evaluatedAt: fixture.activeContext.evaluatedAt,
        journal: fixture.activeContext.journal,
        observations: fixture.activeContext.sampledObservations,
        previousBreaker: fixture.activeContext.breakerEvidence,
        previousReadiness: fixture.activeContext.readinessEvidence,
      },
    });

    const bridge = buildRemoteProviderHostContextBridge({
      activeContext: adapted.activeContext,
    });

    expect(bridge.hostContextSummary).toMatchObject({
      readinessStatus: "blocked",
      nextSafeHook: "onEnvironmentProbe",
      breakerState: "open",
      credentialOk: true,
      doesAuthorizeRemoteExecution: false,
    });
    expect(bridge.archiveHints.requiresOperatorReview).toBe(true);
    expect(JSON.stringify(bridge)).not.toContain("adapter-resolved-key");
  });

  it("supports settings-only context as credential diagnostics preview", () => {
    const adapted = adaptRemoteProviderHostContext({
      environmentSettingsContext: {
        config: {
          mode: "remote",
          endpoint: "https://dark-factory.example.test",
        },
        checkedAt: "2026-05-03T08:20:00.000Z",
      },
    });

    expect(adapted.inputSource).toBe("host_settings_context");
    expect(adapted.adapterSummary).toMatchObject({
      settingsSupplied: true,
      runtimeSupplied: false,
      environmentConfigSupplied: true,
      observationCount: 0,
      previousBreakerSupplied: false,
      previousReadinessSupplied: false,
      expectedSequenceNo: null,
      checkedAt: "2026-05-03T08:20:00.000Z",
      evaluatedAt: "1970-01-01T00:00:00.000Z",
    });
    const bridge = buildRemoteProviderHostContextBridge({
      activeContext: adapted.activeContext,
    });
    expect(bridge.hostContextSummary).toMatchObject({
      readinessStatus: "blocked",
      credentialOk: false,
      sampledObservationCount: 0,
      doesAuthorizeRemoteExecution: false,
    });
  });

  it("exposes the adapter through plugin data without contacting a provider", async () => {
    vi.stubEnv("DARK_FACTORY_HOST_CONTEXT_ADAPTER", "adapter-plugin-resolved-key");
    const fixture = createHostObservationFixture("warning_latency", {
      apiKeySecretRef: "env:DARK_FACTORY_HOST_CONTEXT_ADAPTER",
      checkedAt: "2026-05-03T08:30:00.000Z",
    });
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    const adapted = await harness.getData<ReturnType<typeof adaptRemoteProviderHostContext>>(
      "remote-provider-host-context-adapter",
      {
        companyId: "company-host-context-adapter",
        hostSettingsContext: {
          environmentConfig: fixture.activeContext.environmentConfig,
          alertThresholds: fixture.activeContext.alertThresholds,
        },
        hostRuntimeContext: {
          checkedAt: fixture.activeContext.checkedAt,
          sampledObservations: fixture.activeContext.sampledObservations,
          journal: fixture.activeContext.journal,
        },
      },
    );

    expect(adapted).toMatchObject({
      source: "dark-factory-projection",
      truthSource: "dark-factory-journal",
      authoritative: false,
      inputSource: "combined",
      adapterSummary: {
        settingsSupplied: true,
        runtimeSupplied: true,
        observationCount: 2,
        expectedSequenceNo: 21,
      },
      doesAuthorizeRemoteExecution: false,
      terminalStateAdvanced: false,
    });
    expect(JSON.stringify(adapted)).not.toContain("adapter-plugin-resolved-key");
  });
});
