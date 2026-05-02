import { describe, expect, it } from "vitest";
import {
  buildRemoteProviderAlertCandidates,
  buildRemoteProviderMetricsSnapshot,
  type RemoteProviderObservation,
} from "../src/remote-provider-observability.js";

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
    journalCursor: "dark-factory://journal/run-observe#3",
    lastSequenceNo: 3,
    terminalStateAdvanced: false,
    ...overrides,
  };
}

describe("remote provider observability", () => {
  it("builds a non-authoritative metrics snapshot from successful observations", () => {
    const snapshot = buildRemoteProviderMetricsSnapshot([
      observation({ operation: "probe", durationMs: 10, journalCursor: null, lastSequenceNo: null }),
      observation({ operation: "acquire", durationMs: 20, attempt: 1 }),
      observation({ operation: "execute", durationMs: 30, lastSequenceNo: 7, journalCursor: "dark-factory://journal/run-observe#7" }),
    ], { expectedSequenceNo: 9 });

    expect(snapshot).toMatchObject({
      source: "dark-factory-projection",
      authoritative: false,
      truthSource: "dark-factory-journal",
      observationSource: "runtime_observation",
      runtimeMode: "remote",
      requestCount: 3,
      successCount: 3,
      failureCount: 0,
      retryCount: 1,
      retryableFailureCount: 0,
      averageLatencyMs: 20,
      maxLatencyMs: 30,
      failureClassCounts: {
        none: 3,
        transient_provider: 0,
        provider_unavailable: 0,
        quota_exceeded: 0,
        runtime_blocked: 0,
      },
      latestErrorCode: null,
      latestJournalCursor: "dark-factory://journal/run-observe#7",
      latestSequenceNo: 7,
      cursorLag: 2,
      terminalStateAdvanced: false,
    });
  });

  it("summarizes failure classes and latest error code deterministically", () => {
    const snapshot = buildRemoteProviderMetricsSnapshot([
      observation({ status: 503, durationMs: 100, retryable: true, failureClass: "transient_provider", errorCode: "provider_unavailable" }),
      observation({ status: 429, durationMs: 50, attempt: 1, retryable: true, failureClass: "quota_exceeded", errorCode: "quota_exceeded" }),
      observation({ status: 401, durationMs: 20, retryable: false, failureClass: "runtime_blocked", errorCode: "unauthorized" }),
    ]);

    expect(snapshot).toMatchObject({
      requestCount: 3,
      successCount: 0,
      failureCount: 3,
      retryCount: 1,
      retryableFailureCount: 2,
      latestErrorCode: "unauthorized",
      failureClassCounts: {
        none: 0,
        transient_provider: 1,
        provider_unavailable: 0,
        quota_exceeded: 1,
        runtime_blocked: 1,
      },
      terminalStateAdvanced: false,
    });
  });

  it("creates alert candidates for high error rate, latency, and cursor lag", () => {
    const snapshot = buildRemoteProviderMetricsSnapshot([
      observation({ status: 503, durationMs: 6200, retryable: true, failureClass: "transient_provider", errorCode: "unavailable", lastSequenceNo: 2 }),
      observation({ status: 503, durationMs: 5800, retryable: true, failureClass: "transient_provider", errorCode: "unavailable", lastSequenceNo: 3 }),
    ], { expectedSequenceNo: 12 });

    const alerts = buildRemoteProviderAlertCandidates(snapshot, {
      errorRateWarningThreshold: 0.5,
      latencyWarningThresholdMs: 5000,
      cursorLagWarningThreshold: 5,
    });

    expect(alerts.map((alert) => alert.code)).toEqual([
      "dark_factory_remote_error_rate_high",
      "dark_factory_remote_latency_high",
      "dark_factory_remote_cursor_lag_high",
    ]);
    expect(alerts).toEqual(alerts.map((alert) => expect.objectContaining({
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
    })));
  });

  it("returns no alerts for an empty observation set", () => {
    const snapshot = buildRemoteProviderMetricsSnapshot([]);

    expect(snapshot).toMatchObject({
      requestCount: 0,
      successCount: 0,
      failureCount: 0,
      averageLatencyMs: 0,
      maxLatencyMs: 0,
      cursorLag: null,
      terminalStateAdvanced: false,
    });
    expect(buildRemoteProviderAlertCandidates(snapshot)).toEqual([]);
  });

  it("is deterministic for the same observation input", () => {
    const observations = [
      observation({ operation: "probe", durationMs: 11 }),
      observation({ operation: "execute", status: 500, durationMs: 44, retryable: true, failureClass: "transient_provider", errorCode: "bad_gateway" }),
    ];

    expect(buildRemoteProviderMetricsSnapshot(observations)).toEqual(buildRemoteProviderMetricsSnapshot(observations));
    expect(buildRemoteProviderAlertCandidates(buildRemoteProviderMetricsSnapshot(observations))).toEqual(
      buildRemoteProviderAlertCandidates(buildRemoteProviderMetricsSnapshot(observations)),
    );
  });
});
