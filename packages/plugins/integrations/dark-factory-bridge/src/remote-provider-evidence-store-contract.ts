import {
  DARK_FACTORY_PROJECTION_SOURCE,
  DARK_FACTORY_TRUTH_SOURCE,
  PROJECTION_AUTHORITATIVE,
  RUNTIME_OBSERVATION_SOURCE,
} from "./runtime-contract.js";
import type {
  RemoteProviderHostContextBridgeResult,
} from "./remote-provider-host-context-bridge.js";
import type {
  RemoteProviderReadinessTransitionInput,
} from "./remote-provider-readiness.js";
import type {
  RemoteCircuitBreakerEvaluation,
} from "./remote-provider-circuit-breaker.js";

type ProjectionBoundary = {
  source: typeof DARK_FACTORY_PROJECTION_SOURCE;
  authoritative: typeof PROJECTION_AUTHORITATIVE;
  truthSource: typeof DARK_FACTORY_TRUTH_SOURCE;
};

export type RemoteProviderEvidenceStoreRecord = ProjectionBoundary & {
  observationSource: typeof RUNTIME_OBSERVATION_SOURCE;
  runtimeMode: "remote";
  recordKind: "remote_provider_previous_evidence";
  storageStatus: "contract_only_not_persisted";
  storageKey: string;
  createdAt: string;
  retentionScope: "plugin_namespace_projection_metadata";
  canSeedNextActiveContext: true;
  shouldPersistResolvedCredentialValues: false;
  doesAuthorizeRemoteExecution: false;
  breakerEvidence: Pick<
    RemoteCircuitBreakerEvaluation,
    | "breakerState"
    | "consecutiveFailures"
    | "consecutiveHalfOpenSuccesses"
    | "openedAt"
    | "cooldownUntil"
    | "openReason"
    | "lastFailureClass"
  >;
  readinessEvidence: NonNullable<RemoteProviderReadinessTransitionInput>;
  summary: {
    readinessStatus: string;
    nextSafeHook: string;
    receiptId: string;
    receiptDigest: string;
    sampledObservationCount: number;
    alertCount: number;
    breakerState: string;
  };
  terminalStateAdvanced: false;
};

export type RemoteProviderEvidenceReplayEnvelope = ProjectionBoundary & {
  observationSource: typeof RUNTIME_OBSERVATION_SOURCE;
  runtimeMode: "remote";
  replayKind: "previous_evidence_to_active_context_seed";
  previousBreaker: RemoteProviderEvidenceStoreRecord["breakerEvidence"];
  previousReadiness: RemoteProviderEvidenceStoreRecord["readinessEvidence"];
  sourceStorageKey: string;
  doesAuthorizeRemoteExecution: false;
  terminalStateAdvanced: false;
};

export function createRemoteProviderEvidenceStoreRecord(
  bridge: RemoteProviderHostContextBridgeResult,
  options: {
    storageKey?: string;
    createdAt?: string;
  } = {},
): RemoteProviderEvidenceStoreRecord {
  const receipt = bridge.readiness.readinessReceipt;
  const breaker = bridge.activeContext.breakerEvaluation;
  const storageKey = options.storageKey
    ?? `df-remote-evidence-${receipt.digest}`;

  return {
    ...projectionBoundary(),
    observationSource: RUNTIME_OBSERVATION_SOURCE,
    runtimeMode: "remote",
    recordKind: "remote_provider_previous_evidence",
    storageStatus: "contract_only_not_persisted",
    storageKey,
    createdAt: normalizeIsoTimestamp(options.createdAt ?? bridge.hostContextSummary.checkedAt),
    retentionScope: "plugin_namespace_projection_metadata",
    canSeedNextActiveContext: true,
    shouldPersistResolvedCredentialValues: false,
    doesAuthorizeRemoteExecution: false,
    breakerEvidence: {
      breakerState: breaker.breakerState,
      consecutiveFailures: breaker.consecutiveFailures,
      consecutiveHalfOpenSuccesses: breaker.consecutiveHalfOpenSuccesses,
      openedAt: breaker.openedAt,
      cooldownUntil: breaker.cooldownUntil,
      openReason: breaker.openReason,
      lastFailureClass: breaker.lastFailureClass,
    },
    readinessEvidence: {
      readinessStatus: bridge.readiness.readinessStatus,
      nextSafeHook: bridge.readiness.nextSafeHook,
      receiptDigest: receipt.digest,
      receiptId: receipt.receiptId,
      checkedAt: receipt.checkedAt,
    },
    summary: {
      readinessStatus: bridge.readiness.readinessStatus,
      nextSafeHook: bridge.readiness.nextSafeHook,
      receiptId: receipt.receiptId,
      receiptDigest: receipt.digest,
      sampledObservationCount: bridge.activeContext.sampledObservationCount,
      alertCount: bridge.readiness.alertCount,
      breakerState: breaker.breakerState,
    },
    terminalStateAdvanced: false,
  };
}

export function replayRemoteProviderEvidenceStoreRecord(
  record: RemoteProviderEvidenceStoreRecord,
): RemoteProviderEvidenceReplayEnvelope {
  return {
    ...projectionBoundary(),
    observationSource: RUNTIME_OBSERVATION_SOURCE,
    runtimeMode: "remote",
    replayKind: "previous_evidence_to_active_context_seed",
    previousBreaker: record.breakerEvidence,
    previousReadiness: record.readinessEvidence,
    sourceStorageKey: record.storageKey,
    doesAuthorizeRemoteExecution: false,
    terminalStateAdvanced: false,
  };
}

function normalizeIsoTimestamp(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? new Date(0).toISOString() : new Date(parsed).toISOString();
}

function projectionBoundary(): ProjectionBoundary {
  return {
    source: DARK_FACTORY_PROJECTION_SOURCE,
    authoritative: PROJECTION_AUTHORITATIVE,
    truthSource: DARK_FACTORY_TRUTH_SOURCE,
  };
}
