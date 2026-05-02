import {
  DARK_FACTORY_PROJECTION_SOURCE,
  DARK_FACTORY_TRUTH_SOURCE,
  PROJECTION_AUTHORITATIVE,
  RUNTIME_OBSERVATION_SOURCE,
  type BreakerState,
  type FailureClass,
} from "./runtime-contract.js";
import type {
  RemoteProviderNextSafeHook,
  RemoteProviderReadinessStatus,
} from "./remote-provider-readiness.js";
import type {
  RemoteProviderObservation,
  RemoteProviderOperation,
} from "./remote-provider-observability.js";
import type { RemoteCircuitBreakerPolicy } from "./remote-provider-circuit-breaker.js";
import {
  buildRemoteProviderActiveContext,
  type RemoteProviderActiveContext,
} from "./remote-provider-active-context.js";

type ProjectionBoundary = {
  source: typeof DARK_FACTORY_PROJECTION_SOURCE;
  authoritative: typeof PROJECTION_AUTHORITATIVE;
  truthSource: typeof DARK_FACTORY_TRUTH_SOURCE;
};

export type HostObservationScenario =
  | "healthy"
  | "warning_latency"
  | "blocked_failures"
  | "stale_readiness";

export type HostObservationFixtureEntry = RemoteProviderObservation & {
  observedAt: string;
  hostObservationId: string;
};

export type HostObservationFixtureEnvelope = ProjectionBoundary & {
  observationSource: typeof RUNTIME_OBSERVATION_SOURCE;
  runtimeMode: "remote";
  scenario: HostObservationScenario;
  hostContextId: string;
  activeContext: {
    checkedAt: string;
    evaluatedAt: string;
    environmentConfig: {
      mode: "remote";
      endpoint: string;
      apiKeySecretRef: string;
    };
    journal: {
      expectedSequenceNo: number;
    };
    sampledObservations: HostObservationFixtureEntry[];
    breakerEvidence: {
      breakerState: BreakerState;
      consecutiveFailures: number;
      consecutiveHalfOpenSuccesses: number;
      openedAt: string | null;
      cooldownUntil: string | null;
      openReason: string | null;
      lastFailureClass: FailureClass;
    };
    readinessEvidence: {
      readinessStatus: RemoteProviderReadinessStatus;
      nextSafeHook: RemoteProviderNextSafeHook;
      receiptDigest: string;
      receiptId: string;
      checkedAt: string;
    };
    alertThresholds: {
      errorRateWarningThreshold: number;
      latencyWarningThresholdMs: number;
      cursorLagWarningThreshold: number;
    };
    circuitBreakerPolicy: RemoteCircuitBreakerPolicy;
  };
  terminalStateAdvanced: false;
};

export type HostObservationReplayResult = ProjectionBoundary & {
  observationSource: typeof RUNTIME_OBSERVATION_SOURCE;
  runtimeMode: "remote";
  scenario: HostObservationScenario;
  hostContextId: string;
  activeContext: RemoteProviderActiveContext;
  replayedObservationCount: number;
  terminalStateAdvanced: false;
};

const baseCheckedAt = "2026-05-03T03:00:00.000Z";
const defaultEndpoint = "https://dark-factory.example.test";
const defaultCredentialRef = "env:DARK_FACTORY_HOST_OBSERVATION_FIXTURE";

export function createHostObservationFixture(
  scenario: HostObservationScenario,
  options: {
    endpoint?: string;
    apiKeySecretRef?: string;
    checkedAt?: string;
  } = {},
): HostObservationFixtureEnvelope {
  const checkedAt = options.checkedAt ?? baseCheckedAt;
  const sampledObservations = fixtureObservations(scenario, checkedAt);
  const expectedSequenceNo = expectedSequenceNoFor(scenario, sampledObservations);
  const breakerEvidence = breakerEvidenceFor(scenario);
  const readinessEvidence = readinessEvidenceFor(scenario, checkedAt);

  return {
    ...projectionBoundary(),
    observationSource: RUNTIME_OBSERVATION_SOURCE,
    runtimeMode: "remote",
    scenario,
    hostContextId: `df-host-context-${scenario}`,
    activeContext: {
      checkedAt,
      evaluatedAt: checkedAt,
      environmentConfig: {
        mode: "remote",
        endpoint: options.endpoint ?? defaultEndpoint,
        apiKeySecretRef: options.apiKeySecretRef ?? defaultCredentialRef,
      },
      journal: {
        expectedSequenceNo,
      },
      sampledObservations,
      breakerEvidence,
      readinessEvidence,
      alertThresholds: {
        errorRateWarningThreshold: 0.5,
        latencyWarningThresholdMs: 5_000,
        cursorLagWarningThreshold: 5,
      },
      circuitBreakerPolicy: {
        failureThreshold: 2,
        cooldownMs: 10_000,
        halfOpenSuccessThreshold: 1,
      },
    },
    terminalStateAdvanced: false,
  };
}

export function replayHostObservationFixture(
  fixture: HostObservationFixtureEnvelope,
  overrides: Record<string, unknown> = {},
): HostObservationReplayResult {
  const activeContext = buildRemoteProviderActiveContext({
    activeContext: fixture.activeContext,
    ...overrides,
  });
  return {
    ...projectionBoundary(),
    observationSource: RUNTIME_OBSERVATION_SOURCE,
    runtimeMode: "remote",
    scenario: fixture.scenario,
    hostContextId: fixture.hostContextId,
    activeContext,
    replayedObservationCount: activeContext.sampledObservationCount,
    terminalStateAdvanced: false,
  };
}

function fixtureObservations(scenario: HostObservationScenario, checkedAt: string): HostObservationFixtureEntry[] {
  switch (scenario) {
    case "healthy":
      return [
        observation(scenario, 1, checkedAt, { operation: "probe", durationMs: 40, lastSequenceNo: 10 }),
        observation(scenario, 2, checkedAt, { operation: "acquire", durationMs: 55, lastSequenceNo: 11 }),
        observation(scenario, 3, checkedAt, { operation: "execute", durationMs: 70, lastSequenceNo: 12 }),
      ];
    case "warning_latency":
      return [
        observation(scenario, 1, checkedAt, { operation: "probe", durationMs: 40, lastSequenceNo: 20 }),
        observation(scenario, 2, checkedAt, { operation: "execute", durationMs: 6_200, lastSequenceNo: 21 }),
      ];
    case "blocked_failures":
      return [
        observation(scenario, 1, checkedAt, {
          operation: "execute",
          status: 503,
          durationMs: 80,
          retryable: true,
          failureClass: "transient_provider",
          errorCode: "bad_gateway",
          lastSequenceNo: 30,
        }),
        observation(scenario, 2, checkedAt, {
          operation: "execute",
          status: 503,
          durationMs: 90,
          attempt: 1,
          retryable: true,
          failureClass: "transient_provider",
          errorCode: "unavailable",
          lastSequenceNo: 31,
        }),
      ];
    case "stale_readiness":
      return [
        observation(scenario, 1, checkedAt, { operation: "probe", durationMs: 35, lastSequenceNo: 40 }),
      ];
  }
}

function observation(
  scenario: HostObservationScenario,
  sequence: number,
  checkedAt: string,
  overrides: Partial<RemoteProviderObservation>,
): HostObservationFixtureEntry {
  const lastSequenceNo = overrides.lastSequenceNo ?? sequence;
  return {
    runtimeMode: "remote",
    operation: overrides.operation ?? "execute",
    status: overrides.status ?? 200,
    durationMs: overrides.durationMs ?? 25,
    attempt: overrides.attempt ?? 0,
    retryable: overrides.retryable ?? false,
    failureClass: overrides.failureClass ?? "none",
    errorCode: overrides.errorCode ?? null,
    journalCursor: overrides.journalCursor ?? `dark-factory://journal/${scenario}#${lastSequenceNo}`,
    lastSequenceNo,
    terminalStateAdvanced: false,
    observedAt: checkedAt,
    hostObservationId: `df-host-observation-${scenario}-${sequence}`,
  };
}

function expectedSequenceNoFor(
  scenario: HostObservationScenario,
  observations: HostObservationFixtureEntry[],
): number {
  const lastSequenceNo = observations.at(-1)?.lastSequenceNo ?? 0;
  return scenario === "stale_readiness" ? lastSequenceNo + 8 : lastSequenceNo;
}

function breakerEvidenceFor(scenario: HostObservationScenario): HostObservationFixtureEnvelope["activeContext"]["breakerEvidence"] {
  if (scenario === "blocked_failures") {
    return {
      breakerState: "closed",
      consecutiveFailures: 0,
      consecutiveHalfOpenSuccesses: 0,
      openedAt: null,
      cooldownUntil: null,
      openReason: null,
      lastFailureClass: "none",
    };
  }
  return {
    breakerState: "closed",
    consecutiveFailures: 0,
    consecutiveHalfOpenSuccesses: 0,
    openedAt: null,
    cooldownUntil: null,
    openReason: null,
    lastFailureClass: "none",
  };
}

function readinessEvidenceFor(
  scenario: HostObservationScenario,
  checkedAt: string,
): HostObservationFixtureEnvelope["activeContext"]["readinessEvidence"] {
  if (scenario === "stale_readiness") {
    return {
      readinessStatus: "ready",
      nextSafeHook: "onEnvironmentExecute",
      receiptDigest: "stale000",
      receiptId: "df-readiness-stale000",
      checkedAt: "2026-05-03T02:00:00.000Z",
    };
  }
  if (scenario === "blocked_failures") {
    return {
      readinessStatus: "ready",
      nextSafeHook: "onEnvironmentExecute",
      receiptDigest: "prev0000",
      receiptId: "df-readiness-prev0000",
      checkedAt,
    };
  }
  return {
    readinessStatus: "needs_attention",
    nextSafeHook: "onEnvironmentProbe",
    receiptDigest: "prev1111",
    receiptId: "df-readiness-prev1111",
    checkedAt,
  };
}

function projectionBoundary(): ProjectionBoundary {
  return {
    source: DARK_FACTORY_PROJECTION_SOURCE,
    authoritative: PROJECTION_AUTHORITATIVE,
    truthSource: DARK_FACTORY_TRUTH_SOURCE,
  };
}
