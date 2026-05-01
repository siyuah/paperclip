import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DARK_FACTORY_PROJECTION_SOURCE,
  DARK_FACTORY_TRUTH_SOURCE,
  PROJECTION_AUTHORITATIVE,
  PROJECTION_DISCLAIMER,
  RUNTIME_OBSERVATION_SOURCE,
  type BreakerState,
  type FailureClass,
  type ProjectionBoundary,
  type ProjectionStatus,
  type ProviderHealthState,
  parseRuntimeContractSnapshot,
} from "../src/runtime-contract.js";
import {
  createMockCallbackReceipt,
  createMockRehydrateRequest,
  detectReplayGapOrOutOfOrder,
  getMockJournalCursor,
  getMockJournalReplayEntries,
  getMockProviderHealth,
  getMockRunAttemptMetadata,
  getMockRuntimeProjection,
  getProviderRuntimeMode,
  reconcileMockProjection,
  replayMockJournal,
  compareOrAdvanceCursor,
} from "../src/mock-runtime-adapter.js";

const CORE_ENUMS_PATH = "/home/siyuah/workspace/123/paperclip_darkfactory_v3_0_core_enums.yaml";

const RUNTIME_PROJECTION_STATUS_VALUES = ["current", "degraded", "blocked", "needs_approval", "stale"] as const satisfies readonly ProjectionStatus[];
const RUNTIME_FAILURE_CLASS_VALUES = ["none", "transient_provider", "provider_unavailable", "quota_exceeded", "runtime_blocked"] as const satisfies readonly FailureClass[];
const RUNTIME_BREAKER_STATE_VALUES = ["closed", "open", "half_open"] as const satisfies readonly BreakerState[];
const RUNTIME_PROVIDER_HEALTH_STATE_VALUES = ["available", "degraded", "blocked", "fallback"] as const satisfies readonly ProviderHealthState[];

type AssertNever<T extends never> = T;
type ProjectionStatusRuntimeValue = (typeof RUNTIME_PROJECTION_STATUS_VALUES)[number];
type FailureClassRuntimeValue = (typeof RUNTIME_FAILURE_CLASS_VALUES)[number];
type BreakerStateRuntimeValue = (typeof RUNTIME_BREAKER_STATE_VALUES)[number];
type ProviderHealthStateRuntimeValue = (typeof RUNTIME_PROVIDER_HEALTH_STATE_VALUES)[number];

type _ProjectionStatusCoversRuntimeValues = AssertNever<Exclude<ProjectionStatus, ProjectionStatusRuntimeValue>>;
type _ProjectionStatusRuntimeValuesAreTyped = AssertNever<Exclude<ProjectionStatusRuntimeValue, ProjectionStatus>>;
type _FailureClassCoversRuntimeValues = AssertNever<Exclude<FailureClass, FailureClassRuntimeValue>>;
type _FailureClassRuntimeValuesAreTyped = AssertNever<Exclude<FailureClassRuntimeValue, FailureClass>>;
type _BreakerStateCoversRuntimeValues = AssertNever<Exclude<BreakerState, BreakerStateRuntimeValue>>;
type _BreakerStateRuntimeValuesAreTyped = AssertNever<Exclude<BreakerStateRuntimeValue, BreakerState>>;
type _ProviderHealthStateCoversRuntimeValues = AssertNever<Exclude<ProviderHealthState, ProviderHealthStateRuntimeValue>>;
type _ProviderHealthStateRuntimeValuesAreTyped = AssertNever<Exclude<ProviderHealthStateRuntimeValue, ProviderHealthState>>;

function parseScalarYamlValue(rawValue: string): string {
  const value = rawValue.trim();
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function parseCoreEnumsYaml(yaml: string): Record<string, string[]> {
  const enums: Record<string, string[]> = {};
  let inEnums = false;
  let currentEnum: string | null = null;

  for (const line of yaml.split(/\r?\n/)) {
    if (/^enums:\s*$/.test(line)) {
      inEnums = true;
      continue;
    }
    if (!inEnums) continue;

    const enumMatch = /^  ([A-Za-z0-9_]+):\s*$/.exec(line);
    if (enumMatch) {
      currentEnum = enumMatch[1];
      enums[currentEnum] = [];
      continue;
    }

    const valueMatch = /^    -\s+(.+?)\s*$/.exec(line);
    if (currentEnum && valueMatch) {
      enums[currentEnum].push(parseScalarYamlValue(valueMatch[1]));
    }
  }

  return enums;
}

const v3CoreEnums = parseCoreEnumsYaml(readFileSync(CORE_ENUMS_PATH, "utf8"));

function expectProjectionBoundary(value: ProjectionBoundary): void {
  expect(value).toMatchObject({
    source: DARK_FACTORY_PROJECTION_SOURCE,
    authoritative: PROJECTION_AUTHORITATIVE,
    truthSource: DARK_FACTORY_TRUTH_SOURCE,
  });
}

function collectTerminalStateAdvancedValues(value: unknown, values: unknown[] = []): unknown[] {
  if (!value || typeof value !== "object") return values;

  if ("terminalStateAdvanced" in value) {
    values.push((value as { terminalStateAdvanced: unknown }).terminalStateAdvanced);
  }

  if (Array.isArray(value)) {
    for (const item of value) collectTerminalStateAdvancedValues(item, values);
    return values;
  }

  for (const nestedValue of Object.values(value)) {
    collectTerminalStateAdvancedValues(nestedValue, values);
  }

  return values;
}

describe("Dark Factory deterministic mock runtime adapter", () => {
  it("exports a stable runtime contract snapshot", () => {
    const snapshot = parseRuntimeContractSnapshot({
      source: DARK_FACTORY_PROJECTION_SOURCE,
      authoritative: PROJECTION_AUTHORITATIVE,
      truthSource: DARK_FACTORY_TRUTH_SOURCE,
      observationSource: RUNTIME_OBSERVATION_SOURCE,
    });

    expect(snapshot).toEqual({
      source: "dark-factory-projection",
      authoritative: false,
      truthSource: "dark-factory-journal",
      observationSource: "runtime_observation",
    });
  });

  it("returns deterministic provider health with projection-only truth boundaries", () => {
    const issueId = "issue-provider-open";
    const first = getMockProviderHealth(issueId);
    const second = getMockProviderHealth(issueId);

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      source: "dark-factory-projection",
      authoritative: false,
      truthSource: "dark-factory-journal",
      observationSource: "runtime_observation",
      providerRole: "primary_execution",
      modelRole: "execution_model",
      modelSelection: {
        policy: "role_based_runtime_selection",
        protocolMustSpecifyConcreteModel: false,
        configuredModelName: null,
      },
    });
    expect(["available", "degraded", "blocked", "fallback"]).toContain(first.providerState);
    expect(["closed", "open", "half_open"]).toContain(first.breakerState);
    expect(first.fallbackTriggered).toBe(first.providerState === "fallback");
  });

  it("derives explicit provider runtime modes without advancing Paperclip terminal state", () => {
    const available = getProviderRuntimeMode(getMockProviderHealth("issue-available-closed"));
    const degraded = getProviderRuntimeMode(getMockProviderHealth("issue-provider-half"));
    const blocked = getProviderRuntimeMode(getMockProviderHealth("issue-provider-blocked"));
    const fallback = getProviderRuntimeMode(getMockProviderHealth("issue-provider-fallback"));

    expect(available).toMatchObject({
      mode: "available",
      severity: "info",
      operatorAction: "monitor",
      paperclipTerminalState: "unchanged",
      terminalStateAdvanced: false,
      reason: null,
    });
    expect(degraded).toMatchObject({
      mode: "degraded",
      severity: "warning",
      operatorAction: "retry_or_wait_for_provider_recovery",
      paperclipTerminalState: "unchanged",
      terminalStateAdvanced: false,
      reason: "mock_half_open_probe_required",
    });
    expect(blocked).toMatchObject({
      mode: "blocked",
      severity: "critical",
      operatorAction: "pause_external_execution_and_reconcile_journal",
      paperclipTerminalState: "unchanged",
      terminalStateAdvanced: false,
      reason: "mock_provider_breaker_open",
    });
    expect(fallback).toMatchObject({
      mode: "degraded",
      severity: "warning",
      operatorAction: "verify_fallback_projection_before_retry",
      paperclipTerminalState: "unchanged",
      terminalStateAdvanced: false,
      reason: "mock_fallback_policy_triggered",
    });
  });

  it("returns deterministic run projection metadata without claiming authority", () => {
    const projection = getMockRuntimeProjection("stale-blocked-issue");

    expect(projection).toMatchObject({
      source: "dark-factory-projection",
      authoritative: false,
      truthSource: "dark-factory-journal",
      issueId: "stale-blocked-issue",
      linkedRunId: "df-run-stale-bl",
      projectionStatus: "stale",
      staleReason: "journal_cursor_lag_detected",
      terminalStateAdvanced: false,
    });
    expect(projection.journalCursor).toMatch(/^dark-factory:\/\/journal\/df-run-stale-bl#/);
    expect(projection.lastSequenceNo).toBeGreaterThanOrEqual(100);
    expect(projection.callbackReceiptId).toMatch(/^df-callback-stale-bl-/);
    expect(projection.fallbackTriggered).toBeTypeOf("boolean");
  });

  it("returns bounded run-attempt metadata and never advances terminal state", () => {
    const attempt = getMockRunAttemptMetadata("issue-attempt-fallback");

    expect(attempt).toMatchObject({
      source: "dark-factory-projection",
      authoritative: false,
      truthSource: "dark-factory-journal",
      providerRole: "primary_execution",
      modelRole: "execution_model",
      terminalStateAdvanced: false,
    });
    expect(["none", "transient_provider", "provider_unavailable", "quota_exceeded", "runtime_blocked"]).toContain(attempt.failureClass);
    expect(attempt.retryable).toBeTypeOf("boolean");
    expect(attempt.fallbackTriggered).toBeTypeOf("boolean");
  });

  it("keeps journal cursor monotonicity metadata and Dark Factory Journal truth source", () => {
    const cursor = getMockJournalCursor("issue-cursor-monotonic");
    const repeated = getMockJournalCursor("issue-cursor-monotonic");

    expect(repeated).toEqual(cursor);
    expect(cursor).toMatchObject({
      source: "dark-factory-projection",
      authoritative: false,
      truthSource: "dark-factory-journal",
      monotonic: true,
      gapDetected: false,
    });
    expect(cursor.lastSequenceNo).toBe(cursor.lastJournalSequenceNo);
    expect(cursor.sourceJournalRef).toBe(cursor.journalCursor);
  });

  it("creates deterministic rehydrate receipts as request/intention only", () => {
    const input = { reason: "operator replay", idempotencyKey: "same-key" };
    const first = createMockRehydrateRequest("issue-rehydrate", input);
    const second = createMockRehydrateRequest("issue-rehydrate", input);
    const different = createMockRehydrateRequest("issue-rehydrate", { ...input, idempotencyKey: "other-key" });

    expect(second).toEqual(first);
    expect(different.receipt.receiptId).not.toEqual(first.receipt.receiptId);
    expect(first).toMatchObject({
      source: "dark-factory-projection",
      authoritative: false,
      truthSource: "dark-factory-journal",
      requestSemantics: "receipt_only_not_terminal_success",
      requestKind: "rehydrate_projection",
      terminalStateAdvanced: false,
      doesClaimTerminalSuccess: false,
      receipt: {
        status: "requested",
        terminalStateAdvanced: false,
        idempotencyKey: "same-key",
        reason: "operator replay",
      },
    });
  });

  it("replays deterministic mock journal entries into stable non-authoritative projections", () => {
    const issueId = "issue-journal-replay";
    const entries = getMockJournalReplayEntries(issueId);
    const first = replayMockJournal(issueId, entries);
    const second = replayMockJournal(issueId, entries);

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      source: "dark-factory-projection",
      truthSource: "dark-factory-journal",
      authoritative: false,
      terminalStateAdvanced: false,
      replayStatus: "current",
      journalCursor: expect.stringMatching(/^dark-factory:\/\/journal\//),
      sourceJournalRef: expect.stringMatching(/^dark-factory:\/\/journal\//),
      lastSequenceNo: entries.at(-1)?.sequenceNo,
      cursor: expect.objectContaining({
        issueId,
        runId: expect.stringMatching(/^df-run-/),
        journalCursor: expect.stringMatching(/^dark-factory:\/\/journal\//),
        lastSequenceNo: entries.at(-1)?.sequenceNo,
        staleReason: null,
        needsReconciliation: false,
      }),
    });
    expect(first.projection.projectionStatus).toBe("current");
    expect(first.projection.authoritative).toBe(false);
  });

  it("marks journal replay gaps, out-of-order entries, and duplicates as stale/degraded/blocked without terminal success", () => {
    const issueId = "issue-gap-replay";
    const entries = getMockJournalReplayEntries(issueId);
    const gapped = [entries[0], { ...entries[2], sequenceNo: entries[0].sequenceNo + 3 }];
    const outOfOrder = [entries[1], entries[0]];
    const duplicate = [entries[0], entries[0], entries[1]];

    expect(detectReplayGapOrOutOfOrder(gapped)).toMatchObject({ ok: false, staleReason: "journal_sequence_gap_detected" });
    expect(detectReplayGapOrOutOfOrder(outOfOrder)).toMatchObject({ ok: false, staleReason: "journal_sequence_out_of_order" });
    expect(detectReplayGapOrOutOfOrder(duplicate)).toMatchObject({ ok: false, staleReason: "journal_sequence_duplicate" });

    for (const replay of [replayMockJournal(issueId, gapped), replayMockJournal(issueId, outOfOrder), replayMockJournal(issueId, duplicate)]) {
      expect(["stale", "degraded", "blocked"]).toContain(replay.replayStatus);
      expect(replay.terminalStateAdvanced).toBe(false);
      expect(replay.authoritative).toBe(false);
      expect(replay.cursor.needsReconciliation).toBe(true);
      expect(replay.projection.projectionStatus).not.toBe("current");
    }
  });

  it("keeps reconciliation cursors monotonic and refuses silent sequence rollback", () => {
    const issueId = "issue-reconcile-cursor";
    const entries = getMockJournalReplayEntries(issueId);
    const replay = reconcileMockProjection(issueId, entries);
    const advanced = compareOrAdvanceCursor(replay.cursor, { ...replay.cursor, lastSequenceNo: replay.cursor.lastSequenceNo + 1, journalCursor: `${replay.cursor.journalCursor}+1` });
    const rollback = compareOrAdvanceCursor(advanced, { ...advanced, lastSequenceNo: replay.cursor.lastSequenceNo - 1, journalCursor: "dark-factory://journal/rollback#1" });

    expect(replay.cursor).toMatchObject({
      source: "dark-factory-projection",
      truthSource: "dark-factory-journal",
      authoritative: false,
      issueId,
      runId: expect.stringMatching(/^df-run-/),
      journalCursor: expect.stringMatching(/^dark-factory:\/\/journal\//),
      lastSequenceNo: entries.at(-1)?.sequenceNo,
      sourceJournalRef: expect.stringMatching(/^dark-factory:\/\/journal\//),
      staleReason: null,
      needsReconciliation: false,
    });
    expect(Date.parse(replay.cursor.reconciledAt)).not.toBeNaN();
    expect(advanced.lastSequenceNo).toBe(replay.cursor.lastSequenceNo + 1);
    expect(rollback.lastSequenceNo).toBe(advanced.lastSequenceNo);
    expect(rollback.staleReason).toBe("journal_cursor_regression_blocked");
    expect(rollback.needsReconciliation).toBe(true);
  });

  it("creates stable callback receipts with idempotency semantics and no terminal state mutation", () => {
    const input = { issueId: "issue-callback", runId: "df-run-callback", requestKind: "callback", idempotencyKey: "same-callback-key" } as const;
    const first = createMockCallbackReceipt(input);
    const second = createMockCallbackReceipt(input);
    const different = createMockCallbackReceipt({ ...input, idempotencyKey: "other-callback-key" });

    expect(second).toEqual(first);
    expect(different.receiptId).not.toBe(first.receiptId);
    expect(first).toMatchObject({
      source: "dark-factory-projection",
      truthSource: "dark-factory-journal",
      authoritative: false,
      terminalStateAdvanced: false,
      doesClaimTerminalSuccess: false,
      requestSemantics: "receipt_only_not_terminal_success",
      receiptStatus: "observed",
      idempotency: {
        idempotencyKey: "same-callback-key",
        duplicate: false,
        stableReceipt: true,
      },
    });
  });
});

describe("runtime contract V3 parity guard", () => {
  it("keeps ProjectionStatus stable as runtime-level type (not yet in V3 binding enums)", () => {
    // ProjectionStatus is defined in runtime-contract.ts for non-authoritative
    // projection cache state. It is not yet part of V3.0 core_enums.yaml binding
    // contract. When V3.1 formalizes projection status, update this test to use
    // the V3 enum source.
    expect(v3CoreEnums).not.toHaveProperty("projectionStatus");
    expect([...RUNTIME_PROJECTION_STATUS_VALUES]).toEqual(["current", "degraded", "blocked", "needs_approval", "stale"]);
  });

  it("keeps FailureClass stable as runtime-level type (not yet in V3 binding enums)", () => {
    // FailureClass is defined in runtime-contract.ts for bridge retry/fallback
    // policy. V3.0 has providerFaultClass, but that binding enum has different
    // values and is not the same contract as this runtime-level type.
    // When V3.1 formalizes bridge failure class, update this test to use the
    // V3 enum source.
    expect(v3CoreEnums).not.toHaveProperty("failureClass");
    expect(v3CoreEnums.providerFaultClass).not.toEqual([...RUNTIME_FAILURE_CLASS_VALUES]);
    expect([...RUNTIME_FAILURE_CLASS_VALUES]).toEqual(["none", "transient_provider", "provider_unavailable", "quota_exceeded", "runtime_blocked"]);
  });

  it("keeps BreakerState stable as runtime-level type (not yet in V3 binding enums)", () => {
    // BreakerState is defined in runtime-contract.ts for Phoenix Runtime
    // capabilities. It is not yet part of V3.0 core_enums.yaml binding contract.
    // When V3.1 formalizes circuit breaker state, update this test to use the
    // V3 enum source.
    expect(v3CoreEnums).not.toHaveProperty("breakerState");
    expect(v3CoreEnums).not.toHaveProperty("circuitBreakerState");
    expect([...RUNTIME_BREAKER_STATE_VALUES]).toEqual(["closed", "open", "half_open"]);
  });

  it("keeps ProviderHealthState stable as runtime-level type (not yet in V3 binding enums)", () => {
    // ProviderHealthState is defined in runtime-contract.ts for bridge-local
    // provider projection. V3.0 capsuleHealth describes capsule preflight health,
    // not provider runtime availability. When V3.1 formalizes provider health,
    // update this test to use the V3 enum source.
    expect(v3CoreEnums).not.toHaveProperty("providerHealthState");
    expect(v3CoreEnums).not.toHaveProperty("providerState");
    expect(v3CoreEnums.capsuleHealth).not.toEqual([...RUNTIME_PROVIDER_HEALTH_STATE_VALUES]);
    expect([...RUNTIME_PROVIDER_HEALTH_STATE_VALUES]).toEqual(["available", "degraded", "blocked", "fallback"]);
  });

  it("keeps Dark Factory projection boundary constants stable", () => {
    expect(DARK_FACTORY_PROJECTION_SOURCE).toBe("dark-factory-projection");
    expect(DARK_FACTORY_TRUTH_SOURCE).toBe("dark-factory-journal");
    expect(PROJECTION_AUTHORITATIVE).toBe(false);
    expect(RUNTIME_OBSERVATION_SOURCE).toBe("runtime_observation");
    expect(PROJECTION_DISCLAIMER).toContain("Journal remains truth source");
  });

  it("returns ProjectionBoundary source, authoritative, and truthSource on mock contract objects", () => {
    const issueId = "issue-v3-parity-guard";
    const journalEntries = getMockJournalReplayEntries(issueId);
    const replay = replayMockJournal(issueId, journalEntries);
    const advancedCursor = compareOrAdvanceCursor(replay.cursor, {
      ...replay.cursor,
      lastSequenceNo: replay.cursor.lastSequenceNo + 1,
      journalCursor: `${replay.cursor.journalCursor}+guard`,
    });

    const boundaryResults = [
      getMockJournalCursor(issueId),
      getMockProviderHealth(issueId),
      getMockRuntimeProjection(issueId),
      getMockRunAttemptMetadata(issueId),
      createMockRehydrateRequest(issueId, { reason: "v3 guard", idempotencyKey: "v3-guard" }),
      createMockCallbackReceipt({ issueId, runId: replay.runId, requestKind: "callback", idempotencyKey: "v3-guard" }),
      replay,
      reconcileMockProjection(issueId, journalEntries),
      advancedCursor,
    ] satisfies ProjectionBoundary[];

    for (const result of boundaryResults) {
      expectProjectionBoundary(result);
    }
  });

  it("never advances terminal state from mock runtime return values", () => {
    const issueId = "issue-v3-terminal-guard";
    const journalEntries = getMockJournalReplayEntries(issueId);
    const replay = replayMockJournal(issueId, journalEntries);
    const providerHealth = getMockProviderHealth(issueId);
    const terminalValues = [
      getMockJournalCursor(issueId),
      providerHealth,
      getProviderRuntimeMode(providerHealth),
      getMockRuntimeProjection(issueId),
      getMockRunAttemptMetadata(issueId),
      createMockRehydrateRequest(issueId, { reason: "v3 terminal guard", idempotencyKey: "v3-terminal-guard" }),
      createMockCallbackReceipt({ issueId, runId: replay.runId, requestKind: "callback", idempotencyKey: "v3-terminal-guard" }),
      replay,
      reconcileMockProjection(issueId, journalEntries),
    ].flatMap((result) => collectTerminalStateAdvancedValues(result));

    expect(terminalValues.length).toBeGreaterThan(0);
    expect(terminalValues).toEqual(terminalValues.map(() => false));
  });
});
