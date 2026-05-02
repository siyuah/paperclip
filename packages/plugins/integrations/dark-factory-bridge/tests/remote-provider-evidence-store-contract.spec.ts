import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildRemoteProviderHostContextBridge,
} from "../src/remote-provider-host-context-bridge.js";
import {
  createRemoteProviderEvidenceStoreRecord,
  replayRemoteProviderEvidenceStoreRecord,
} from "../src/remote-provider-evidence-store-contract.js";
import {
  createHostObservationFixture,
} from "../src/remote-provider-host-observation-fixtures.js";

describe("remote provider evidence store contract", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates a non-persisted previous evidence record from a host context bridge result", () => {
    vi.stubEnv("DARK_FACTORY_HOST_OBSERVATION_FIXTURE", "evidence-store-resolved-key");
    const bridge = buildRemoteProviderHostContextBridge({
      activeContext: createHostObservationFixture("healthy", {
        checkedAt: "2026-05-03T07:00:00.000Z",
      }).activeContext,
    });

    const record = createRemoteProviderEvidenceStoreRecord(bridge);

    expect(record).toMatchObject({
      source: "dark-factory-projection",
      truthSource: "dark-factory-journal",
      authoritative: false,
      observationSource: "runtime_observation",
      runtimeMode: "remote",
      recordKind: "remote_provider_previous_evidence",
      storageStatus: "contract_only_not_persisted",
      storageKey: expect.stringMatching(/^df-remote-evidence-[0-9a-f]{8}$/),
      createdAt: "2026-05-03T07:00:00.000Z",
      retentionScope: "plugin_namespace_projection_metadata",
      canSeedNextActiveContext: true,
      shouldPersistResolvedCredentialValues: false,
      doesAuthorizeRemoteExecution: false,
      breakerEvidence: {
        breakerState: "closed",
        consecutiveFailures: 0,
        consecutiveHalfOpenSuccesses: 0,
        openedAt: null,
        cooldownUntil: null,
        openReason: null,
        lastFailureClass: "none",
      },
      readinessEvidence: {
        readinessStatus: "ready",
        nextSafeHook: "onEnvironmentExecute",
        receiptDigest: bridge.readiness.readinessReceipt.digest,
        receiptId: bridge.readiness.readinessReceipt.receiptId,
        checkedAt: "2026-05-03T07:00:00.000Z",
      },
      summary: {
        readinessStatus: "ready",
        nextSafeHook: "onEnvironmentExecute",
        sampledObservationCount: 3,
        alertCount: 0,
        breakerState: "closed",
      },
      terminalStateAdvanced: false,
    });
    expect(JSON.stringify(record)).not.toContain("evidence-store-resolved-key");
  });

  it("replays previous evidence into an active context seed without authorizing execution", () => {
    vi.stubEnv("DARK_FACTORY_HOST_OBSERVATION_FIXTURE", "evidence-store-resolved-key");
    const bridge = buildRemoteProviderHostContextBridge({
      activeContext: createHostObservationFixture("blocked_failures", {
        checkedAt: "2026-05-03T07:10:00.000Z",
      }).activeContext,
    });
    const record = createRemoteProviderEvidenceStoreRecord(bridge, {
      storageKey: "df-remote-evidence-blocked-fixture",
      createdAt: "not-a-date",
    });

    const replay = replayRemoteProviderEvidenceStoreRecord(record);

    expect(record.createdAt).toBe("1970-01-01T00:00:00.000Z");
    expect(replay).toMatchObject({
      source: "dark-factory-projection",
      truthSource: "dark-factory-journal",
      authoritative: false,
      observationSource: "runtime_observation",
      runtimeMode: "remote",
      replayKind: "previous_evidence_to_active_context_seed",
      sourceStorageKey: "df-remote-evidence-blocked-fixture",
      doesAuthorizeRemoteExecution: false,
      terminalStateAdvanced: false,
      previousBreaker: {
        breakerState: "open",
        consecutiveFailures: 2,
        lastFailureClass: "transient_provider",
      },
      previousReadiness: {
        readinessStatus: "blocked",
        nextSafeHook: "onEnvironmentProbe",
        receiptDigest: record.readinessEvidence.receiptDigest,
        receiptId: record.readinessEvidence.receiptId,
        checkedAt: "2026-05-03T07:10:00.000Z",
      },
    });
    expect(JSON.stringify(replay)).not.toContain("evidence-store-resolved-key");
  });

  it("feeds replayed evidence into the next host context bridge and reports a transition", () => {
    vi.stubEnv("DARK_FACTORY_HOST_OBSERVATION_FIXTURE", "evidence-store-resolved-key");
    const blockedRecord = createRemoteProviderEvidenceStoreRecord(
      buildRemoteProviderHostContextBridge({
        activeContext: createHostObservationFixture("blocked_failures", {
          checkedAt: "2026-05-03T07:20:00.000Z",
        }).activeContext,
      }),
    );
    const replay = replayRemoteProviderEvidenceStoreRecord(blockedRecord);

    const recovered = buildRemoteProviderHostContextBridge({
      activeContext: createHostObservationFixture("healthy", {
        checkedAt: "2026-05-03T07:25:00.000Z",
      }).activeContext,
      previousBreaker: replay.previousBreaker,
      previousReadiness: replay.previousReadiness,
    });

    expect(recovered.readiness.readinessStatus).toBe("ready");
    expect(recovered.readiness.readinessTransition).toMatchObject({
      transitionKind: "improved",
      previousStatus: "blocked",
      currentStatus: "ready",
      previousNextSafeHook: "onEnvironmentProbe",
      currentNextSafeHook: "onEnvironmentExecute",
      previousReceiptDigest: blockedRecord.readinessEvidence.receiptDigest,
      receiptChanged: true,
      terminalStateAdvanced: false,
    });
    expect(recovered.hostContextSummary.doesAuthorizeRemoteExecution).toBe(false);
  });

  it("is deterministic for the same bridge result and storage options", () => {
    vi.stubEnv("DARK_FACTORY_HOST_OBSERVATION_FIXTURE", "evidence-store-resolved-key");
    const bridge = buildRemoteProviderHostContextBridge({
      activeContext: createHostObservationFixture("warning_latency", {
        checkedAt: "2026-05-03T07:30:00.000Z",
      }).activeContext,
    });

    const first = createRemoteProviderEvidenceStoreRecord(bridge, {
      storageKey: "df-remote-evidence-warning",
      createdAt: "2026-05-03T07:30:30.000Z",
    });
    const second = createRemoteProviderEvidenceStoreRecord(bridge, {
      storageKey: "df-remote-evidence-warning",
      createdAt: "2026-05-03T07:30:30.000Z",
    });

    expect(second).toEqual(first);
    expect(first.summary).toMatchObject({
      readinessStatus: "needs_attention",
      nextSafeHook: "onEnvironmentProbe",
      alertCount: 1,
      breakerState: "closed",
    });
    expect(first.shouldPersistResolvedCredentialValues).toBe(false);
    expect(first.terminalStateAdvanced).toBe(false);
  });
});
