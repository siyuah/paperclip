import {
  DARK_FACTORY_PROJECTION_SOURCE,
  DARK_FACTORY_TRUTH_SOURCE,
  PROJECTION_AUTHORITATIVE,
  RUNTIME_OBSERVATION_SOURCE,
} from "./runtime-contract.js";
import {
  buildRemoteProviderActiveContext,
  type RemoteProviderActiveContext,
} from "./remote-provider-active-context.js";
import {
  buildRemoteProviderReadinessReport,
  type RemoteProviderReadinessReport,
} from "./remote-provider-readiness.js";

type ProjectionBoundary = {
  source: typeof DARK_FACTORY_PROJECTION_SOURCE;
  authoritative: typeof PROJECTION_AUTHORITATIVE;
  truthSource: typeof DARK_FACTORY_TRUTH_SOURCE;
};

export type RemoteProviderHostContextBridgeResult = ProjectionBoundary & {
  observationSource: typeof RUNTIME_OBSERVATION_SOURCE;
  runtimeMode: "remote";
  bridgeKind: "host_active_context";
  contextAccepted: boolean;
  inputSource: RemoteProviderActiveContext["inputSource"];
  hostContextSupplied: boolean;
  activeContext: RemoteProviderActiveContext;
  readiness: RemoteProviderReadinessReport;
  hostContextSummary: {
    checkedAt: string;
    evaluatedAt: string;
    expectedSequenceNo: number | null;
    sampledObservationCount: number;
    credentialOk: boolean;
    credentialSource: string | null;
    breakerState: string;
    readinessStatus: string;
    nextSafeHook: string;
    alertCount: number;
    receiptId: string;
    doesAuthorizeRemoteExecution: false;
  };
  archiveHints: {
    outputDataKey: "remote-provider-host-context-bridge";
    shouldPersistInPluginDb: false;
    allowedPersistence: "projection/cache/cursor/receipt/request metadata only";
    requiresOperatorReview: boolean;
  };
  terminalStateAdvanced: false;
};

export function buildRemoteProviderHostContextBridge(
  params: Record<string, unknown>,
): RemoteProviderHostContextBridgeResult {
  const activeContext = buildRemoteProviderActiveContext(params);
  const readiness = buildRemoteProviderReadinessReport(activeContext.readinessInput);
  const requiresOperatorReview = readiness.readinessStatus !== "ready";

  return {
    ...projectionBoundary(),
    observationSource: RUNTIME_OBSERVATION_SOURCE,
    runtimeMode: "remote",
    bridgeKind: "host_active_context",
    contextAccepted: true,
    inputSource: activeContext.inputSource,
    hostContextSupplied: activeContext.hostContextSupplied,
    activeContext,
    readiness,
    hostContextSummary: {
      checkedAt: activeContext.checkedAt,
      evaluatedAt: activeContext.evaluatedAt,
      expectedSequenceNo: activeContext.expectedSequenceNo,
      sampledObservationCount: activeContext.sampledObservationCount,
      credentialOk: activeContext.credentialDiagnostics.ok,
      credentialSource: activeContext.credentialDiagnostics.credentialSource,
      breakerState: activeContext.breakerEvaluation.breakerState,
      readinessStatus: readiness.readinessStatus,
      nextSafeHook: readiness.nextSafeHook,
      alertCount: readiness.alertCount,
      receiptId: readiness.readinessReceipt.receiptId,
      doesAuthorizeRemoteExecution: false,
    },
    archiveHints: {
      outputDataKey: "remote-provider-host-context-bridge",
      shouldPersistInPluginDb: false,
      allowedPersistence: "projection/cache/cursor/receipt/request metadata only",
      requiresOperatorReview,
    },
    terminalStateAdvanced: false,
  };
}

function projectionBoundary(): ProjectionBoundary {
  return {
    source: DARK_FACTORY_PROJECTION_SOURCE,
    authoritative: PROJECTION_AUTHORITATIVE,
    truthSource: DARK_FACTORY_TRUTH_SOURCE,
  };
}
