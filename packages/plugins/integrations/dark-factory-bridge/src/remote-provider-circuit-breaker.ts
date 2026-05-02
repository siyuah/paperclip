import {
  DARK_FACTORY_PROJECTION_SOURCE,
  DARK_FACTORY_TRUTH_SOURCE,
  PROJECTION_AUTHORITATIVE,
  RUNTIME_OBSERVATION_SOURCE,
  type BreakerState,
  type FailureClass,
  type ProviderRuntimeImpact,
} from "./runtime-contract.js";
import type { RemoteProviderObservation } from "./remote-provider-observability.js";

type ProjectionBoundary = {
  source: typeof DARK_FACTORY_PROJECTION_SOURCE;
  authoritative: typeof PROJECTION_AUTHORITATIVE;
  truthSource: typeof DARK_FACTORY_TRUTH_SOURCE;
};

export type RemoteCircuitBreakerPolicy = {
  failureThreshold: number;
  cooldownMs: number;
  halfOpenSuccessThreshold: number;
};

export type RemoteCircuitBreakerEvaluation = ProjectionBoundary & {
  observationSource: typeof RUNTIME_OBSERVATION_SOURCE;
  runtimeMode: "remote";
  breakerState: BreakerState;
  previousBreakerState: BreakerState;
  consecutiveFailures: number;
  consecutiveHalfOpenSuccesses: number;
  openedAt: string | null;
  cooldownUntil: string | null;
  openReason: string | null;
  lastFailureClass: FailureClass;
  runtimeImpact: ProviderRuntimeImpact;
  terminalStateAdvanced: false;
};

export type RemoteCircuitBreakerInput = {
  previous?: Partial<RemoteCircuitBreakerEvaluation> | null;
  observations: RemoteProviderObservation[];
  evaluatedAt: string;
  policy?: Partial<RemoteCircuitBreakerPolicy>;
};

const defaultPolicy: RemoteCircuitBreakerPolicy = {
  failureThreshold: 3,
  cooldownMs: 30_000,
  halfOpenSuccessThreshold: 1,
};

export function evaluateRemoteCircuitBreaker(input: RemoteCircuitBreakerInput): RemoteCircuitBreakerEvaluation {
  const policy = normalizePolicy(input.policy);
  const evaluatedAtMs = Date.parse(input.evaluatedAt);
  const evaluatedAt = Number.isNaN(evaluatedAtMs) ? new Date(0).toISOString() : new Date(evaluatedAtMs).toISOString();
  let breakerState = input.previous?.breakerState ?? "closed";
  let consecutiveFailures = input.previous?.consecutiveFailures ?? 0;
  let consecutiveHalfOpenSuccesses = input.previous?.consecutiveHalfOpenSuccesses ?? 0;
  let openedAt = input.previous?.openedAt ?? null;
  let cooldownUntil = input.previous?.cooldownUntil ?? null;
  let openReason = input.previous?.openReason ?? null;
  let lastFailureClass = input.previous?.lastFailureClass ?? "none";
  const previousBreakerState = breakerState;

  if (breakerState === "open" && cooldownExpired(cooldownUntil, evaluatedAt)) {
    breakerState = "half_open";
    consecutiveHalfOpenSuccesses = 0;
  }

  for (const observation of input.observations) {
    if (isSuccess(observation)) {
      if (breakerState === "half_open") {
        consecutiveHalfOpenSuccesses += 1;
        if (consecutiveHalfOpenSuccesses >= policy.halfOpenSuccessThreshold) {
          breakerState = "closed";
          consecutiveFailures = 0;
          consecutiveHalfOpenSuccesses = 0;
          openedAt = null;
          cooldownUntil = null;
          openReason = null;
          lastFailureClass = "none";
        }
      } else if (breakerState === "closed") {
        consecutiveFailures = 0;
        lastFailureClass = "none";
      }
      continue;
    }

    lastFailureClass = observation.failureClass;
    consecutiveFailures += 1;
    consecutiveHalfOpenSuccesses = 0;
    if (breakerState === "half_open" || consecutiveFailures >= policy.failureThreshold) {
      breakerState = "open";
      openedAt = evaluatedAt;
      cooldownUntil = new Date(Date.parse(evaluatedAt) + policy.cooldownMs).toISOString();
      openReason = observation.errorCode ?? observation.failureClass;
    }
  }

  return {
    ...projectionBoundary(),
    observationSource: RUNTIME_OBSERVATION_SOURCE,
    runtimeMode: "remote",
    breakerState,
    previousBreakerState,
    consecutiveFailures,
    consecutiveHalfOpenSuccesses,
    openedAt,
    cooldownUntil,
    openReason,
    lastFailureClass,
    runtimeImpact: runtimeImpactForBreakerState(breakerState, openReason),
    terminalStateAdvanced: false,
  };
}

function normalizePolicy(policy: Partial<RemoteCircuitBreakerPolicy> | null | undefined): RemoteCircuitBreakerPolicy {
  return {
    failureThreshold: positiveInteger(policy?.failureThreshold) ?? defaultPolicy.failureThreshold,
    cooldownMs: positiveInteger(policy?.cooldownMs) ?? defaultPolicy.cooldownMs,
    halfOpenSuccessThreshold: positiveInteger(policy?.halfOpenSuccessThreshold) ?? defaultPolicy.halfOpenSuccessThreshold,
  };
}

function isSuccess(observation: RemoteProviderObservation): boolean {
  return observation.status !== null && observation.status >= 200 && observation.status < 400 && observation.failureClass === "none";
}

function cooldownExpired(cooldownUntil: string | null, evaluatedAt: string): boolean {
  if (!cooldownUntil) return false;
  return Date.parse(evaluatedAt) >= Date.parse(cooldownUntil);
}

function runtimeImpactForBreakerState(breakerState: BreakerState, reason: string | null): ProviderRuntimeImpact {
  if (breakerState === "open") {
    return {
      mode: "blocked",
      severity: "critical",
      operatorAction: "pause_external_execution_and_reconcile_journal",
      paperclipTerminalState: "unchanged",
      terminalStateAdvanced: false,
      reason,
    };
  }
  if (breakerState === "half_open") {
    return {
      mode: "degraded",
      severity: "warning",
      operatorAction: "verify_fallback_projection_before_retry",
      paperclipTerminalState: "unchanged",
      terminalStateAdvanced: false,
      reason: reason ?? "circuit_breaker_half_open",
    };
  }
  return {
    mode: "available",
    severity: "info",
    operatorAction: "monitor",
    paperclipTerminalState: "unchanged",
    terminalStateAdvanced: false,
    reason: null,
  };
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function projectionBoundary(): ProjectionBoundary {
  return {
    source: DARK_FACTORY_PROJECTION_SOURCE,
    authoritative: PROJECTION_AUTHORITATIVE,
    truthSource: DARK_FACTORY_TRUTH_SOURCE,
  };
}
