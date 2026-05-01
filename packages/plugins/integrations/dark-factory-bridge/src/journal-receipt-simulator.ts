import {
  DARK_FACTORY_PROJECTION_SOURCE,
  DARK_FACTORY_TRUTH_SOURCE,
  PROJECTION_AUTHORITATIVE,
  PROJECTION_DISCLAIMER,
  type CallbackReceipt,
  type JournalReplayEntry,
  type JournalReplayResult,
  type ProjectionBoundary,
  type ProjectionStalenessReason,
} from "./runtime-contract.js";
import {
  createMockCallbackReceipt,
  replayMockJournal,
} from "./mock-runtime-adapter.js";

export type JournalReceiptSimulatorConfig = {
  startSequenceNo?: number;
};

export type SimulatedCallback = ProjectionBoundary & {
  entry: JournalReplayEntry;
  receipt: CallbackReceipt;
  terminalStateAdvanced: false;
};

export type SimulatedCallbackSequenceResult = ProjectionBoundary & {
  disclaimer: typeof PROJECTION_DISCLAIMER;
  issueId: string;
  runId: string;
  entries: JournalReplayEntry[];
  receipts: CallbackReceipt[];
  callbacks: SimulatedCallback[];
  replay: JournalReplayResult;
  replayStatus: JournalReplayResult["replayStatus"];
  staleReason: ProjectionStalenessReason | null;
  terminalStateAdvanced: false;
};

function projectionBoundary(): ProjectionBoundary {
  return {
    source: DARK_FACTORY_PROJECTION_SOURCE,
    authoritative: PROJECTION_AUTHORITATIVE,
    truthSource: DARK_FACTORY_TRUTH_SOURCE,
  };
}

function issuePrefix(issueId: string): string {
  return issueId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 8).padEnd(8, "0");
}

function runIdFor(issueId: string): string {
  return `df-run-${issuePrefix(issueId)}`;
}

function eventKindFor(index: number): JournalReplayEntry["eventKind"] {
  return (["run_started", "projection_observed", "callback_observed", "run_degraded"] as const)[index % 4];
}

function observedAtFor(sequenceNo: number): string {
  return new Date(Date.UTC(2026, 4, 2, 0, sequenceNo % 60, 0)).toISOString();
}

function buildEntry(issueId: string, runId: string, sequenceNo: number, index: number): JournalReplayEntry {
  const eventKind = eventKindFor(index);
  return {
    issueId,
    runId,
    sequenceNo,
    eventId: `df-fixture-${issuePrefix(issueId)}-${sequenceNo}-${eventKind}`,
    eventKind,
    journalRef: `dark-factory://journal/${runId}#${sequenceNo}`,
    observedAt: observedAtFor(sequenceNo),
    payload: {
      projectionOnly: true,
      truthSource: DARK_FACTORY_TRUTH_SOURCE,
      terminalStateAdvanced: false,
      fixtureIndex: index,
    },
  };
}

function normalizeReceiptTimestamp(receipt: CallbackReceipt, observedAt: string): CallbackReceipt {
  return {
    ...receipt,
    createdAt: observedAt,
  };
}

function normalizeReplayTimestamps(replay: JournalReplayResult): JournalReplayResult {
  const stableTimestamp = observedAtFor(replay.lastSequenceNo);
  return {
    ...replay,
    cursor: {
      ...replay.cursor,
      reconciledAt: stableTimestamp,
    },
    projection: {
      ...replay.projection,
      lastUpdatedAt: stableTimestamp,
    },
  };
}

function buildSequence(issueId: string, sequenceNumbers: number[]): JournalReplayEntry[] {
  const runId = runIdFor(issueId);
  return sequenceNumbers.map((sequenceNo, index) => buildEntry(issueId, runId, sequenceNo, index));
}

function defaultIssueId(entries: JournalReplayEntry[]): string {
  return entries[0]?.issueId ?? "journal-empty";
}

export function FIXTURE_NORMAL_SEQUENCE(issueId: string): JournalReplayEntry[] {
  return buildSequence(issueId, [100, 101, 102, 103]);
}

export function FIXTURE_GAP_SEQUENCE(issueId: string): JournalReplayEntry[] {
  return buildSequence(issueId, [100, 101, 104, 105]);
}

export function FIXTURE_OUT_OF_ORDER(issueId: string): JournalReplayEntry[] {
  return buildSequence(issueId, [100, 101, 99, 102]);
}

export function FIXTURE_DUPLICATE(issueId: string): JournalReplayEntry[] {
  return buildSequence(issueId, [100, 101, 101, 102]);
}

export function FIXTURE_EMPTY(_issueId: string): JournalReplayEntry[] {
  return [];
}

export function simulateCallbackSequence(entries: JournalReplayEntry[]): SimulatedCallbackSequenceResult {
  const issueId = defaultIssueId(entries);
  const runId = entries.at(-1)?.runId ?? entries[0]?.runId ?? runIdFor(issueId);
  const callbacks = entries.map((entry) => {
    const receipt = normalizeReceiptTimestamp(createMockCallbackReceipt({
      issueId: entry.issueId,
      runId: entry.runId,
      requestKind: "callback",
      idempotencyKey: `${entry.runId}:${entry.sequenceNo}:${entry.eventId}`,
    }), entry.observedAt);
    return {
      ...projectionBoundary(),
      entry,
      receipt,
      terminalStateAdvanced: false,
    } satisfies SimulatedCallback;
  });
  const replay = normalizeReplayTimestamps(replayMockJournal(issueId, entries));

  return {
    ...projectionBoundary(),
    disclaimer: PROJECTION_DISCLAIMER,
    issueId,
    runId,
    entries,
    receipts: callbacks.map((callback) => callback.receipt),
    callbacks,
    replay,
    replayStatus: replay.replayStatus,
    staleReason: replay.staleReason,
    terminalStateAdvanced: false,
  };
}

export class JournalReceiptSimulator {
  readonly issueId: string;
  readonly startSequenceNo: number;

  constructor(issueId: string, config: JournalReceiptSimulatorConfig = {}) {
    this.issueId = issueId;
    this.startSequenceNo = config.startSequenceNo ?? 100;
  }

  normal(count = 4): JournalReplayEntry[] {
    return buildSequence(this.issueId, Array.from({ length: count }, (_value, index) => this.startSequenceNo + index));
  }

  gap(): JournalReplayEntry[] {
    return buildSequence(this.issueId, [
      this.startSequenceNo,
      this.startSequenceNo + 1,
      this.startSequenceNo + 4,
      this.startSequenceNo + 5,
    ]);
  }

  outOfOrder(): JournalReplayEntry[] {
    return buildSequence(this.issueId, [
      this.startSequenceNo,
      this.startSequenceNo + 1,
      this.startSequenceNo - 1,
      this.startSequenceNo + 3,
    ]);
  }

  duplicate(): JournalReplayEntry[] {
    return buildSequence(this.issueId, [
      this.startSequenceNo,
      this.startSequenceNo + 1,
      this.startSequenceNo + 1,
      this.startSequenceNo + 2,
    ]);
  }

  empty(): JournalReplayEntry[] {
    return [];
  }

  simulate(entries: JournalReplayEntry[]): SimulatedCallbackSequenceResult {
    return simulateCallbackSequence(entries);
  }
}
