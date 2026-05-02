import {
  DARK_FACTORY_PROJECTION_SOURCE,
  DARK_FACTORY_TRUTH_SOURCE,
  PROJECTION_AUTHORITATIVE,
  RUNTIME_OBSERVATION_SOURCE,
} from "./runtime-contract.js";
import {
  adaptRemoteProviderHostContext,
  type RemoteProviderHostContextAdapterResult,
} from "./remote-provider-host-context-adapter.js";
import {
  buildRemoteProviderHostContextBridge,
  type RemoteProviderHostContextBridgeResult,
} from "./remote-provider-host-context-bridge.js";
import type {
  RemoteProviderPreflightStep,
  RemoteProviderReadinessReport,
} from "./remote-provider-readiness.js";

type ProjectionBoundary = {
  source: typeof DARK_FACTORY_PROJECTION_SOURCE;
  authoritative: typeof PROJECTION_AUTHORITATIVE;
  truthSource: typeof DARK_FACTORY_TRUTH_SOURCE;
};

export type RemoteProviderDryRunDecision = "allowed" | "review_required" | "blocked";

export type RemoteProviderDryRunGuardResult = ProjectionBoundary & {
  observationSource: typeof RUNTIME_OBSERVATION_SOURCE;
  runtimeMode: "remote";
  guardKind: "remote_provider_pre_execution_dry_run";
  targetHook: RemoteProviderPreflightStep["hook"];
  decision: RemoteProviderDryRunDecision;
  dryRunOnly: true;
  shouldContactRemoteProvider: false;
  doesAuthorizeRemoteExecution: false;
  terminalStateAdvanced: false;
  adapter: RemoteProviderHostContextAdapterResult;
  bridge: RemoteProviderHostContextBridgeResult;
  readiness: RemoteProviderReadinessReport;
  matchedPreflightStep: RemoteProviderPreflightStep;
  blockingCodes: string[];
  guardReceipt: {
    receiptId: string;
    digest: string;
    digestAlgorithm: "fnv1a32";
    targetHook: RemoteProviderPreflightStep["hook"];
    decision: RemoteProviderDryRunDecision;
    readinessStatus: RemoteProviderReadinessReport["readinessStatus"];
    nextSafeHook: RemoteProviderReadinessReport["nextSafeHook"];
    readinessReceiptId: string;
    doesAuthorizeRemoteExecution: false;
    terminalStateAdvanced: false;
  };
  operatorSummary: {
    checkedAt: string;
    readinessStatus: RemoteProviderReadinessReport["readinessStatus"];
    nextSafeHook: RemoteProviderReadinessReport["nextSafeHook"];
    credentialOk: boolean;
    breakerState: string;
    sampledObservationCount: number;
    alertCount: number;
    requiresOperatorReview: boolean;
    journalTruthSource: typeof DARK_FACTORY_TRUTH_SOURCE;
  };
  archiveHints: {
    outputDataKey: "remote-provider-dry-run-guard";
    shouldPersistInPluginDb: false;
    allowedPersistence: "projection/cache/cursor/receipt/request metadata only";
  };
};

export function buildRemoteProviderDryRunGuard(
  params: Record<string, unknown>,
): RemoteProviderDryRunGuardResult {
  const targetHook = targetHookFrom(params.targetHook);
  const adapter = adaptRemoteProviderHostContext(params);
  const bridge = buildRemoteProviderHostContextBridge({
    activeContext: adapter.activeContext,
  });
  const readiness = bridge.readiness;
  const matchedPreflightStep = readiness.preflightPlan.find((step) => step.hook === targetHook)
    ?? readiness.preflightPlan[0];
  if (!matchedPreflightStep) {
    throw new Error("remote provider readiness preflight plan is empty");
  }
  const decision = dryRunDecisionFor(matchedPreflightStep);
  const blockingCodes = [...matchedPreflightStep.blockingCodes].sort();
  const digest = fnv1a32(stableStringify({
    targetHook,
    decision,
    blockingCodes,
    readinessStatus: readiness.readinessStatus,
    nextSafeHook: readiness.nextSafeHook,
    readinessReceiptId: readiness.readinessReceipt.receiptId,
    readinessReceiptDigest: readiness.readinessReceipt.digest,
    adapterSummary: adapter.adapterSummary,
  }));

  return {
    ...projectionBoundary(),
    observationSource: RUNTIME_OBSERVATION_SOURCE,
    runtimeMode: "remote",
    guardKind: "remote_provider_pre_execution_dry_run",
    targetHook,
    decision,
    dryRunOnly: true,
    shouldContactRemoteProvider: false,
    doesAuthorizeRemoteExecution: false,
    terminalStateAdvanced: false,
    adapter,
    bridge,
    readiness,
    matchedPreflightStep,
    blockingCodes,
    guardReceipt: {
      receiptId: `df-remote-dry-run-${digest}`,
      digest,
      digestAlgorithm: "fnv1a32",
      targetHook,
      decision,
      readinessStatus: readiness.readinessStatus,
      nextSafeHook: readiness.nextSafeHook,
      readinessReceiptId: readiness.readinessReceipt.receiptId,
      doesAuthorizeRemoteExecution: false,
      terminalStateAdvanced: false,
    },
    operatorSummary: {
      checkedAt: readiness.checkedAt,
      readinessStatus: readiness.readinessStatus,
      nextSafeHook: readiness.nextSafeHook,
      credentialOk: readiness.credentialOk,
      breakerState: readiness.breakerState,
      sampledObservationCount: readiness.sampledObservationCount,
      alertCount: readiness.alertCount,
      requiresOperatorReview: decision !== "allowed",
      journalTruthSource: DARK_FACTORY_TRUTH_SOURCE,
    },
    archiveHints: {
      outputDataKey: "remote-provider-dry-run-guard",
      shouldPersistInPluginDb: false,
      allowedPersistence: "projection/cache/cursor/receipt/request metadata only",
    },
  };
}

function targetHookFrom(value: unknown): RemoteProviderPreflightStep["hook"] {
  return value === "onEnvironmentValidateConfig"
    || value === "onEnvironmentProbe"
    || value === "onEnvironmentAcquireLease"
    || value === "onEnvironmentExecute"
    ? value
    : "onEnvironmentExecute";
}

function dryRunDecisionFor(step: RemoteProviderPreflightStep): RemoteProviderDryRunDecision {
  if (step.status === "allowed") return "allowed";
  if (step.status === "review_required") return "review_required";
  return "blocked";
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function projectionBoundary(): ProjectionBoundary {
  return {
    source: DARK_FACTORY_PROJECTION_SOURCE,
    authoritative: PROJECTION_AUTHORITATIVE,
    truthSource: DARK_FACTORY_TRUTH_SOURCE,
  };
}
