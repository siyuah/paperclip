import { describe, expect, it } from "vitest";
import {
  evaluateRemoteCircuitBreaker,
  type RemoteCircuitBreakerEvaluation,
} from "../src/remote-provider-circuit-breaker.js";
import type { RemoteProviderObservation } from "../src/remote-provider-observability.js";

const now = "2026-05-02T12:00:00.000Z";

function observation(overrides: Partial<RemoteProviderObservation>): RemoteProviderObservation {
  return {
    runtimeMode: "remote",
    operation: "execute",
    status: 200,
    durationMs: 25,
    attempt: 0,
    retryable: false,
    failureClass: "none",
    errorCode: null,
    journalCursor: "dark-factory://journal/circuit#1",
    lastSequenceNo: 1,
    terminalStateAdvanced: false,
    ...overrides,
  };
}

function failure(errorCode = "unavailable"): RemoteProviderObservation {
  return observation({
    status: 503,
    retryable: true,
    failureClass: "transient_provider",
    errorCode,
  });
}

function expectBoundary(result: RemoteCircuitBreakerEvaluation): void {
  expect(result).toMatchObject({
    source: "dark-factory-projection",
    authoritative: false,
    truthSource: "dark-factory-journal",
    observationSource: "runtime_observation",
    runtimeMode: "remote",
    terminalStateAdvanced: false,
    runtimeImpact: expect.objectContaining({
      paperclipTerminalState: "unchanged",
      terminalStateAdvanced: false,
    }),
  });
}

describe("remote provider circuit breaker", () => {
  it("keeps the breaker closed for successful observations", () => {
    const result = evaluateRemoteCircuitBreaker({
      observations: [
        observation({ operation: "probe" }),
        observation({ operation: "execute" }),
      ],
      evaluatedAt: now,
    });

    expect(result).toMatchObject({
      breakerState: "closed",
      previousBreakerState: "closed",
      consecutiveFailures: 0,
      consecutiveHalfOpenSuccesses: 0,
      openedAt: null,
      cooldownUntil: null,
      openReason: null,
      lastFailureClass: "none",
      runtimeImpact: {
        mode: "available",
        severity: "info",
        operatorAction: "monitor",
      },
    });
    expectBoundary(result);
  });

  it("opens after the configured consecutive failure threshold", () => {
    const result = evaluateRemoteCircuitBreaker({
      observations: [
        failure("bad_gateway"),
        failure("unavailable"),
        failure("timeout"),
      ],
      evaluatedAt: now,
      policy: { failureThreshold: 3, cooldownMs: 10_000 },
    });

    expect(result).toMatchObject({
      breakerState: "open",
      previousBreakerState: "closed",
      consecutiveFailures: 3,
      consecutiveHalfOpenSuccesses: 0,
      openedAt: now,
      cooldownUntil: "2026-05-02T12:00:10.000Z",
      openReason: "timeout",
      lastFailureClass: "transient_provider",
      runtimeImpact: {
        mode: "blocked",
        severity: "critical",
        operatorAction: "pause_external_execution_and_reconcile_journal",
        reason: "timeout",
      },
    });
    expectBoundary(result);
  });

  it("moves from open to half_open after cooldown expires", () => {
    const result = evaluateRemoteCircuitBreaker({
      previous: {
        breakerState: "open",
        consecutiveFailures: 3,
        openedAt: "2026-05-02T11:59:00.000Z",
        cooldownUntil: "2026-05-02T11:59:30.000Z",
        openReason: "unavailable",
        lastFailureClass: "transient_provider",
      },
      observations: [],
      evaluatedAt: now,
      policy: { cooldownMs: 30_000 },
    });

    expect(result).toMatchObject({
      breakerState: "half_open",
      previousBreakerState: "open",
      consecutiveFailures: 3,
      consecutiveHalfOpenSuccesses: 0,
      openedAt: "2026-05-02T11:59:00.000Z",
      cooldownUntil: "2026-05-02T11:59:30.000Z",
      openReason: "unavailable",
      runtimeImpact: {
        mode: "degraded",
        severity: "warning",
        operatorAction: "verify_fallback_projection_before_retry",
        reason: "unavailable",
      },
    });
    expectBoundary(result);
  });

  it("closes after half-open success threshold is met", () => {
    const result = evaluateRemoteCircuitBreaker({
      previous: {
        breakerState: "half_open",
        consecutiveFailures: 3,
        consecutiveHalfOpenSuccesses: 0,
        openedAt: "2026-05-02T11:59:00.000Z",
        cooldownUntil: "2026-05-02T11:59:30.000Z",
        openReason: "unavailable",
        lastFailureClass: "transient_provider",
      },
      observations: [
        observation({ status: 200 }),
        observation({ status: 200 }),
      ],
      evaluatedAt: now,
      policy: { halfOpenSuccessThreshold: 2 },
    });

    expect(result).toMatchObject({
      breakerState: "closed",
      previousBreakerState: "half_open",
      consecutiveFailures: 0,
      consecutiveHalfOpenSuccesses: 0,
      openedAt: null,
      cooldownUntil: null,
      openReason: null,
      lastFailureClass: "none",
      runtimeImpact: {
        mode: "available",
        severity: "info",
        operatorAction: "monitor",
      },
    });
    expectBoundary(result);
  });

  it("reopens immediately when a half-open probe fails", () => {
    const result = evaluateRemoteCircuitBreaker({
      previous: {
        breakerState: "half_open",
        consecutiveFailures: 3,
        openedAt: "2026-05-02T11:59:00.000Z",
        cooldownUntil: "2026-05-02T11:59:30.000Z",
        openReason: "unavailable",
      },
      observations: [
        failure("half_open_probe_failed"),
      ],
      evaluatedAt: now,
      policy: { cooldownMs: 60_000 },
    });

    expect(result).toMatchObject({
      breakerState: "open",
      previousBreakerState: "half_open",
      consecutiveFailures: 4,
      openedAt: now,
      cooldownUntil: "2026-05-02T12:01:00.000Z",
      openReason: "half_open_probe_failed",
      runtimeImpact: {
        mode: "blocked",
        severity: "critical",
        operatorAction: "pause_external_execution_and_reconcile_journal",
        reason: "half_open_probe_failed",
      },
    });
    expectBoundary(result);
  });

  it("is deterministic for the same input", () => {
    const input = {
      observations: [failure("bad_gateway"), failure("unavailable")],
      evaluatedAt: now,
      policy: { failureThreshold: 2, cooldownMs: 10_000 },
    };

    expect(evaluateRemoteCircuitBreaker(input)).toEqual(evaluateRemoteCircuitBreaker(input));
  });
});
