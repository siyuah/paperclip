import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRemoteProviderReadinessReport } from "../src/remote-provider-readiness.js";
import {
  createHostObservationFixture,
  replayHostObservationFixture,
  type HostObservationScenario,
} from "../src/remote-provider-host-observation-fixtures.js";

const scenarios: HostObservationScenario[] = [
  "healthy",
  "warning_latency",
  "blocked_failures",
  "stale_readiness",
];

describe("remote provider host observation fixtures", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates deterministic host active context envelopes for all scenarios", () => {
    for (const scenario of scenarios) {
      const first = createHostObservationFixture(scenario);
      const second = createHostObservationFixture(scenario);

      expect(first).toEqual(second);
      expect(first).toMatchObject({
        source: "dark-factory-projection",
        authoritative: false,
        truthSource: "dark-factory-journal",
        observationSource: "runtime_observation",
        runtimeMode: "remote",
        scenario,
        hostContextId: `df-host-context-${scenario}`,
        terminalStateAdvanced: false,
      });
      expect(first.activeContext.sampledObservations.length).toBeGreaterThan(0);
      expect(first.activeContext.sampledObservations.every((entry) => entry.terminalStateAdvanced === false)).toBe(true);
    }
  });

  it("replays healthy host observations into a ready active context", () => {
    vi.stubEnv("DARK_FACTORY_HOST_OBSERVATION_FIXTURE", "host-fixture-resolved-key");
    const fixture = createHostObservationFixture("healthy");
    const replay = replayHostObservationFixture(fixture);
    const readiness = buildRemoteProviderReadinessReport(replay.activeContext.readinessInput);

    expect(replay).toMatchObject({
      source: "dark-factory-projection",
      authoritative: false,
      truthSource: "dark-factory-journal",
      observationSource: "runtime_observation",
      runtimeMode: "remote",
      scenario: "healthy",
      hostContextId: "df-host-context-healthy",
      replayedObservationCount: 3,
      terminalStateAdvanced: false,
      activeContext: {
        inputSource: "host_active_context",
        hostContextSupplied: true,
        sampledObservationCount: 3,
        credentialDiagnostics: {
          ok: true,
          credentialSource: "env",
        },
        metricsSnapshot: {
          requestCount: 3,
          successCount: 3,
          failureCount: 0,
          cursorLag: 0,
        },
      },
    });
    expect(readiness).toMatchObject({
      readinessStatus: "ready",
      nextSafeHook: "onEnvironmentExecute",
      ready: true,
      terminalStateAdvanced: false,
    });
    expect(JSON.stringify(replay)).not.toContain("host-fixture-resolved-key");
  });

  it("replays latency fixture into needs_attention readiness", () => {
    vi.stubEnv("DARK_FACTORY_HOST_OBSERVATION_FIXTURE", "host-fixture-resolved-key");
    const replay = replayHostObservationFixture(createHostObservationFixture("warning_latency"));
    const readiness = buildRemoteProviderReadinessReport(replay.activeContext.readinessInput);

    expect(replay.activeContext.alertCandidates.map((alert) => alert.code)).toContain("dark_factory_remote_latency_high");
    expect(readiness).toMatchObject({
      readinessStatus: "needs_attention",
      nextSafeHook: "onEnvironmentProbe",
      ready: false,
      terminalStateAdvanced: false,
    });
    expect(readiness.preflightPlan).toEqual(expect.arrayContaining([
      expect.objectContaining({
        hook: "onEnvironmentProbe",
        status: "review_required",
        terminalStateAdvanced: false,
      }),
      expect.objectContaining({
        hook: "onEnvironmentExecute",
        status: "blocked",
        blockingCodes: expect.arrayContaining(["dark_factory_remote_latency_high"]),
        terminalStateAdvanced: false,
      }),
    ]));
  });

  it("replays failure fixture into blocked readiness and open breaker", () => {
    vi.stubEnv("DARK_FACTORY_HOST_OBSERVATION_FIXTURE", "host-fixture-resolved-key");
    const replay = replayHostObservationFixture(createHostObservationFixture("blocked_failures"));
    const readiness = buildRemoteProviderReadinessReport(replay.activeContext.readinessInput);

    expect(replay.activeContext.breakerEvaluation).toMatchObject({
      breakerState: "open",
      consecutiveFailures: 2,
      openReason: "unavailable",
      terminalStateAdvanced: false,
    });
    expect(readiness).toMatchObject({
      readinessStatus: "blocked",
      nextSafeHook: "onEnvironmentProbe",
      ready: false,
      terminalStateAdvanced: false,
    });
    expect(readiness.signals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        category: "breaker",
        severity: "critical",
        code: "dark_factory_remote_breaker_open",
      }),
    ]));
  });

  it("replays stale readiness fixture into cursor-lag warning without changing terminal state", () => {
    vi.stubEnv("DARK_FACTORY_HOST_OBSERVATION_FIXTURE", "host-fixture-resolved-key");
    const replay = replayHostObservationFixture(createHostObservationFixture("stale_readiness"));
    const readiness = buildRemoteProviderReadinessReport(replay.activeContext.readinessInput);

    expect(replay.activeContext.metricsSnapshot).toMatchObject({
      latestSequenceNo: 40,
      cursorLag: 8,
      terminalStateAdvanced: false,
    });
    expect(readiness).toMatchObject({
      readinessStatus: "needs_attention",
      readinessTransition: {
        previousStatus: "ready",
        currentStatus: "needs_attention",
        transitionKind: "regressed",
        terminalStateAdvanced: false,
      },
      terminalStateAdvanced: false,
    });
    expect(readiness.signals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "dark_factory_remote_cursor_lag_high",
        severity: "warning",
      }),
    ]));
  });

  it("supports direct replay overrides for targeted harness cases", () => {
    vi.stubEnv("DARK_FACTORY_HOST_OBSERVATION_FIXTURE", "host-fixture-resolved-key");
    const replay = replayHostObservationFixture(createHostObservationFixture("healthy"), {
      expectedSequenceNo: 20,
      observations: [
        {
          operation: "execute",
          status: 503,
          durationMs: 25,
          attempt: 0,
          retryable: true,
          failureClass: "transient_provider",
          errorCode: "override_failure",
          lastSequenceNo: 12,
        },
      ],
    });

    expect(replay.activeContext).toMatchObject({
      inputSource: "merged",
      hostContextSupplied: true,
      sampledObservationCount: 1,
      expectedSequenceNo: 20,
      metricsSnapshot: {
        failureCount: 1,
        latestErrorCode: "override_failure",
        cursorLag: 8,
      },
      terminalStateAdvanced: false,
    });
  });
});
