import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import {
  buildRemoteProviderDryRunGuard,
} from "../src/remote-provider-dry-run-guard.js";
import {
  createHostObservationFixture,
} from "../src/remote-provider-host-observation-fixtures.js";

describe("remote provider dry-run guard", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows execute dry-run when host context is ready without authorizing remote execution", () => {
    vi.stubEnv("DARK_FACTORY_DRY_RUN_READY", "dry-run-ready-key");
    const fixture = createHostObservationFixture("healthy", {
      apiKeySecretRef: "env:DARK_FACTORY_DRY_RUN_READY",
      checkedAt: "2026-05-03T09:00:00.000Z",
    });

    const guard = buildRemoteProviderDryRunGuard({
      targetHook: "onEnvironmentExecute",
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

    expect(guard).toMatchObject({
      source: "dark-factory-projection",
      truthSource: "dark-factory-journal",
      authoritative: false,
      observationSource: "runtime_observation",
      runtimeMode: "remote",
      guardKind: "remote_provider_pre_execution_dry_run",
      targetHook: "onEnvironmentExecute",
      decision: "allowed",
      dryRunOnly: true,
      shouldContactRemoteProvider: false,
      doesAuthorizeRemoteExecution: false,
      terminalStateAdvanced: false,
      operatorSummary: {
        checkedAt: "2026-05-03T09:00:00.000Z",
        readinessStatus: "ready",
        nextSafeHook: "onEnvironmentExecute",
        credentialOk: true,
        breakerState: "closed",
        sampledObservationCount: 3,
        alertCount: 0,
        requiresOperatorReview: false,
        journalTruthSource: "dark-factory-journal",
      },
      guardReceipt: {
        receiptId: expect.stringMatching(/^df-remote-dry-run-[0-9a-f]{8}$/),
        digest: expect.stringMatching(/^[0-9a-f]{8}$/),
        digestAlgorithm: "fnv1a32",
        decision: "allowed",
        doesAuthorizeRemoteExecution: false,
        terminalStateAdvanced: false,
      },
    });
    expect(guard.matchedPreflightStep).toMatchObject({
      hook: "onEnvironmentExecute",
      status: "allowed",
      blockingCodes: [],
      terminalStateAdvanced: false,
    });
    expect(guard.blockingCodes).toEqual([]);
    expect(guard.archiveHints).toMatchObject({
      outputDataKey: "remote-provider-dry-run-guard",
      shouldPersistInPluginDb: false,
      allowedPersistence: "projection/cache/cursor/receipt/request metadata only",
    });
    expect(JSON.stringify(guard)).not.toContain("dry-run-ready-key");
  });

  it("requires review for probe dry-run when settings context has not supplied config", () => {
    const guard = buildRemoteProviderDryRunGuard({
      targetHook: "onEnvironmentProbe",
      environmentSettingsContext: {
        checkedAt: "2026-05-03T09:10:00.000Z",
      },
    });

    expect(guard).toMatchObject({
      targetHook: "onEnvironmentProbe",
      decision: "review_required",
      dryRunOnly: true,
      shouldContactRemoteProvider: false,
      doesAuthorizeRemoteExecution: false,
      terminalStateAdvanced: false,
      operatorSummary: {
        readinessStatus: "needs_attention",
        nextSafeHook: "onEnvironmentProbe",
        credentialOk: false,
        sampledObservationCount: 0,
        requiresOperatorReview: true,
      },
    });
    expect(guard.matchedPreflightStep).toMatchObject({
      hook: "onEnvironmentProbe",
      status: "review_required",
      terminalStateAdvanced: false,
    });
    expect(guard.blockingCodes).toEqual(expect.arrayContaining([
      "dark_factory_remote_credential_config_not_supplied",
      "dark_factory_remote_readiness_credentials",
    ]));
  });

  it("blocks execute dry-run when sampled provider failures open the breaker", () => {
    vi.stubEnv("DARK_FACTORY_DRY_RUN_BLOCKED", "dry-run-blocked-key");
    const fixture = createHostObservationFixture("blocked_failures", {
      apiKeySecretRef: "env:DARK_FACTORY_DRY_RUN_BLOCKED",
      checkedAt: "2026-05-03T09:20:00.000Z",
    });

    const guard = buildRemoteProviderDryRunGuard({
      targetHook: "onEnvironmentExecute",
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

    expect(guard).toMatchObject({
      targetHook: "onEnvironmentExecute",
      decision: "blocked",
      shouldContactRemoteProvider: false,
      doesAuthorizeRemoteExecution: false,
      terminalStateAdvanced: false,
      operatorSummary: {
        readinessStatus: "blocked",
        nextSafeHook: "onEnvironmentProbe",
        credentialOk: true,
        breakerState: "open",
        sampledObservationCount: 2,
        requiresOperatorReview: true,
      },
    });
    expect(guard.matchedPreflightStep).toMatchObject({
      hook: "onEnvironmentExecute",
      status: "blocked",
      terminalStateAdvanced: false,
    });
    expect(guard.blockingCodes).toEqual(expect.arrayContaining([
      "dark_factory_remote_breaker_open",
      "dark_factory_remote_error_rate_high",
    ]));
    expect(JSON.stringify(guard)).not.toContain("dry-run-blocked-key");
  });

  it("is deterministic for identical input and receipt evidence", () => {
    vi.stubEnv("DARK_FACTORY_DRY_RUN_DETERMINISTIC", "dry-run-deterministic-key");
    const fixture = createHostObservationFixture("warning_latency", {
      apiKeySecretRef: "env:DARK_FACTORY_DRY_RUN_DETERMINISTIC",
      checkedAt: "2026-05-03T09:30:00.000Z",
    });
    const input = {
      targetHook: "onEnvironmentExecute",
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
    };

    const first = buildRemoteProviderDryRunGuard(input);
    const second = buildRemoteProviderDryRunGuard(input);

    expect(second).toEqual(first);
    expect(first.guardReceipt.receiptId).toMatch(/^df-remote-dry-run-[0-9a-f]{8}$/);
    expect(first.terminalStateAdvanced).toBe(false);
  });

  it("exposes dry-run guard through plugin data without contacting a provider", async () => {
    vi.stubEnv("DARK_FACTORY_DRY_RUN_PLUGIN", "dry-run-plugin-key");
    const fixture = createHostObservationFixture("healthy", {
      apiKeySecretRef: "env:DARK_FACTORY_DRY_RUN_PLUGIN",
      checkedAt: "2026-05-03T09:40:00.000Z",
    });
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    const guard = await harness.getData<ReturnType<typeof buildRemoteProviderDryRunGuard>>(
      "remote-provider-dry-run-guard",
      {
        companyId: "company-dry-run-guard",
        targetHook: "onEnvironmentExecute",
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

    expect(guard).toMatchObject({
      targetHook: "onEnvironmentExecute",
      decision: "allowed",
      dryRunOnly: true,
      shouldContactRemoteProvider: false,
      doesAuthorizeRemoteExecution: false,
      terminalStateAdvanced: false,
      operatorSummary: {
        readinessStatus: "ready",
        nextSafeHook: "onEnvironmentExecute",
        journalTruthSource: "dark-factory-journal",
      },
    });
    expect(JSON.stringify(guard)).not.toContain("dry-run-plugin-key");
  });
});
