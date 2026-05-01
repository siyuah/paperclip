import { describe, expect, it } from "vitest";
import {
  FIXTURE_DUPLICATE,
  FIXTURE_EMPTY,
  FIXTURE_GAP_SEQUENCE,
  FIXTURE_NORMAL_SEQUENCE,
  FIXTURE_OUT_OF_ORDER,
  JournalReceiptSimulator,
  simulateCallbackSequence,
} from "../src/journal-receipt-simulator.js";

function collectFieldValues(fieldName: string, value: unknown, values: unknown[] = []): unknown[] {
  if (!value || typeof value !== "object") return values;

  if (fieldName in value) {
    values.push((value as Record<string, unknown>)[fieldName]);
  }

  if (Array.isArray(value)) {
    for (const item of value) collectFieldValues(fieldName, item, values);
    return values;
  }

  for (const nestedValue of Object.values(value)) {
    collectFieldValues(fieldName, nestedValue, values);
  }

  return values;
}

describe("journal receipt simulator", () => {
  it("replays a normal sequence as current without stale reason", () => {
    const entries = FIXTURE_NORMAL_SEQUENCE("df-issue-normal");
    const result = simulateCallbackSequence(entries);

    expect(entries).toHaveLength(4);
    expect(result).toMatchObject({
      replayStatus: "current",
      staleReason: null,
      authoritative: false,
      terminalStateAdvanced: false,
    });
    expect(result.replay.cursor.needsReconciliation).toBe(false);
  });

  it("marks a gap sequence as stale with journal_sequence_gap_detected", () => {
    const entries = FIXTURE_GAP_SEQUENCE("df-issue-gap");
    const result = simulateCallbackSequence(entries);

    expect(entries.map((entry) => entry.sequenceNo)).toEqual([100, 101, 104, 105]);
    expect(result).toMatchObject({
      replayStatus: "stale",
      staleReason: "journal_sequence_gap_detected",
    });
  });

  it("marks an out-of-order sequence as blocked with journal_sequence_out_of_order", () => {
    const entries = FIXTURE_OUT_OF_ORDER("df-issue-out-of-order");
    const result = simulateCallbackSequence(entries);

    expect(entries.map((entry) => entry.sequenceNo)).toEqual([100, 101, 99, 102]);
    expect(result).toMatchObject({
      replayStatus: "blocked",
      staleReason: "journal_sequence_out_of_order",
    });
  });

  it("marks a duplicate sequence as degraded with journal_sequence_duplicate", () => {
    const entries = FIXTURE_DUPLICATE("df-issue-duplicate");
    const result = simulateCallbackSequence(entries);

    expect(entries.map((entry) => entry.sequenceNo)).toEqual([100, 101, 101, 102]);
    expect(result).toMatchObject({
      replayStatus: "degraded",
      staleReason: "journal_sequence_duplicate",
    });
  });

  it("marks an empty sequence as stale with journal_empty", () => {
    const entries = FIXTURE_EMPTY("df-issue-empty");
    const result = simulateCallbackSequence(entries);

    expect(entries).toHaveLength(0);
    expect(result).toMatchObject({
      issueId: "journal-empty",
      replayStatus: "stale",
      staleReason: "journal_empty",
    });
  });

  it("is deterministic for identical input", () => {
    const entries = FIXTURE_NORMAL_SEQUENCE("df-issue-idempotent");
    const first = simulateCallbackSequence(entries);
    const second = simulateCallbackSequence(entries);

    expect(second).toEqual(first);
  });

  it("keeps every output non-authoritative without terminal advancement", () => {
    const result = simulateCallbackSequence(FIXTURE_DUPLICATE("df-issue-boundary"));
    const authoritativeValues = collectFieldValues("authoritative", result);
    const terminalValues = collectFieldValues("terminalStateAdvanced", result);

    expect(authoritativeValues.length).toBeGreaterThan(0);
    expect(authoritativeValues.every((value) => value === false)).toBe(true);
    expect(terminalValues.length).toBeGreaterThan(0);
    expect(terminalValues.every((value) => value === false)).toBe(true);
  });

  it("uses stable receipt idempotency keys", () => {
    const entries = FIXTURE_NORMAL_SEQUENCE("df-issue-receipt-keys");
    const first = simulateCallbackSequence(entries);
    const second = simulateCallbackSequence(entries);

    expect(first.receipts.map((receipt) => receipt.idempotency.idempotencyKey)).toEqual([
      "df-run-df-issue:100:df-fixture-df-issue-100-run_started",
      "df-run-df-issue:101:df-fixture-df-issue-101-projection_observed",
      "df-run-df-issue:102:df-fixture-df-issue-102-callback_observed",
      "df-run-df-issue:103:df-fixture-df-issue-103-run_degraded",
    ]);
    expect(second.receipts.map((receipt) => receipt.receiptId)).toEqual(first.receipts.map((receipt) => receipt.receiptId));
  });

  it("provides a class API with configurable deterministic sequence starts", () => {
    const simulator = new JournalReceiptSimulator("df-issue-class-api", { startSequenceNo: 200 });
    const result = simulator.simulate(simulator.gap());

    expect(simulator.normal(3).map((entry) => entry.sequenceNo)).toEqual([200, 201, 202]);
    expect(result.entries.map((entry) => entry.sequenceNo)).toEqual([200, 201, 204, 205]);
    expect(result.staleReason).toBe("journal_sequence_gap_detected");
  });
});
