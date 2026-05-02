import { describe, expect, it } from "vitest";
import { evaluateRemoteCircuitBreaker } from "../src/remote-provider-circuit-breaker.js";
import {
  buildRemoteProviderAlertCandidates,
  buildRemoteProviderMetricsSnapshot,
  type RemoteProviderObservation,
} from "../src/remote-provider-observability.js";
import {
  buildRemoteProviderReadinessReport,
  type RemoteCredentialDiagnosticsForReadiness,
} from "../src/remote-provider-readiness.js";

function observation(overrides: Partial<RemoteProviderObservation> = {}): RemoteProviderObservation {
  return {
    runtimeMode: "remote",
    operation: "execute",
    status: 200,
    durationMs: 25,
    attempt: 0,
    retryable: false,
    failureClass: "none",
    errorCode: null,
    journalCursor: "dark-factory://journal/readiness#3",
    lastSequenceNo: 3,
    terminalStateAdvanced: false,
    ...overrides,
  };
}

function credentials(ok: boolean, code = "dark_factory_remote_credential_ready"): RemoteCredentialDiagnosticsForReadiness {
  return {
    source: "dark-factory-projection",
    authoritative: false,
    truthSource: "dark-factory-journal",
    observationSource: "runtime_observation",
    runtimeMode: "remote",
    ok,
    diagnostics: [
      {
        severity: ok ? "info" : "error",
        code,
        message: ok ? "Remote credential check passed" : "Remote credential check failed",
        remediation: ok ? ["No credential remediation is needed."] : ["Resolve credential configuration before remote execution."],
      },
    ],
    terminalStateAdvanced: false,
  };
}

describe("remote provider readiness", () => {
  it("reports ready when credentials, observations, and breaker are clear", () => {
    const observations = [observation({ operation: "probe" }), observation({ operation: "execute" })];
    const snapshot = buildRemoteProviderMetricsSnapshot(observations);
    const report = buildRemoteProviderReadinessReport({
      credentialDiagnostics: credentials(true),
      metricsSnapshot: snapshot,
      alertCandidates: buildRemoteProviderAlertCandidates(snapshot),
      breakerEvaluation: evaluateRemoteCircuitBreaker({
        observations,
        evaluatedAt: "2026-05-02T12:00:00.000Z",
      }),
      sampledObservationCount: observations.length,
      checkedAt: "2026-05-02T12:00:00.000Z",
    });

    expect(report).toMatchObject({
      source: "dark-factory-projection",
      authoritative: false,
      truthSource: "dark-factory-journal",
      observationSource: "runtime_observation",
      runtimeMode: "remote",
      checkedAt: "2026-05-02T12:00:00.000Z",
      readinessStatus: "ready",
      ready: true,
      nextSafeHook: "onEnvironmentExecute",
      credentialOk: true,
      breakerState: "closed",
      sampledObservationCount: 2,
      alertCount: 0,
      terminalStateAdvanced: false,
    });
    expect(report.readinessChecklist).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "dark_factory_remote_readiness_credentials", status: "pass" }),
      expect.objectContaining({ code: "dark_factory_remote_readiness_observability", status: "pass" }),
      expect.objectContaining({ code: "dark_factory_remote_readiness_breaker", status: "pass" }),
      expect.objectContaining({ code: "dark_factory_remote_readiness_journal_boundary", status: "pass" }),
    ]));
    expect(report.signals.every((signal) => signal.terminalStateAdvanced === false)).toBe(true);
  });

  it("reports needs_attention for empty settings-surface credential state without claiming provider failure", () => {
    const observations: RemoteProviderObservation[] = [];
    const snapshot = buildRemoteProviderMetricsSnapshot(observations);
    const report = buildRemoteProviderReadinessReport({
      credentialDiagnostics: credentials(false, "dark_factory_remote_credential_config_not_supplied"),
      metricsSnapshot: snapshot,
      alertCandidates: buildRemoteProviderAlertCandidates(snapshot),
      breakerEvaluation: evaluateRemoteCircuitBreaker({
        observations,
        evaluatedAt: "not-a-date",
      }),
      sampledObservationCount: observations.length,
      checkedAt: "not-a-date",
    });

    expect(report).toMatchObject({
      checkedAt: "1970-01-01T00:00:00.000Z",
      readinessStatus: "needs_attention",
      ready: false,
      nextSafeHook: "onEnvironmentProbe",
      credentialOk: false,
      breakerState: "closed",
      sampledObservationCount: 0,
      terminalStateAdvanced: false,
    });
    expect(report.signals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        category: "credentials",
        severity: "warning",
        code: "dark_factory_remote_credential_config_not_supplied",
      }),
      expect.objectContaining({
        category: "observability",
        severity: "info",
        code: "dark_factory_remote_no_sampled_observations",
      }),
    ]));
    expect(report.readinessChecklist).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "credentials", status: "warn", requiredBefore: "onEnvironmentProbe" }),
      expect.objectContaining({ category: "observability", status: "warn", requiredBefore: "onEnvironmentAcquireLease" }),
      expect.objectContaining({ category: "journal_boundary", status: "pass", requiredBefore: "onEnvironmentExecute" }),
    ]));
  });

  it("reports blocked for critical credential or breaker signals", () => {
    const observations = [
      observation({ status: 503, retryable: true, failureClass: "transient_provider", errorCode: "bad_gateway" }),
      observation({ status: 503, retryable: true, failureClass: "transient_provider", errorCode: "unavailable" }),
    ];
    const snapshot = buildRemoteProviderMetricsSnapshot(observations);
    const report = buildRemoteProviderReadinessReport({
      credentialDiagnostics: credentials(false, "dark_factory_remote_credential_missing"),
      metricsSnapshot: snapshot,
      alertCandidates: buildRemoteProviderAlertCandidates(snapshot, {
        errorRateWarningThreshold: 0.5,
      }),
      breakerEvaluation: evaluateRemoteCircuitBreaker({
        observations,
        evaluatedAt: "2026-05-02T12:00:00.000Z",
        policy: { failureThreshold: 2 },
      }),
      sampledObservationCount: observations.length,
      checkedAt: "2026-05-02T12:00:00.000Z",
    });

    expect(report).toMatchObject({
      readinessStatus: "blocked",
      ready: false,
      nextSafeHook: "onEnvironmentValidateConfig",
      credentialOk: false,
      breakerState: "open",
      alertCount: 1,
      terminalStateAdvanced: false,
    });
    expect(report.signals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        category: "credentials",
        severity: "critical",
        code: "dark_factory_remote_credential_missing",
      }),
      expect.objectContaining({
        category: "breaker",
        severity: "critical",
        code: "dark_factory_remote_breaker_open",
      }),
    ]));
    expect(report.readinessChecklist).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "credentials", status: "fail" }),
      expect.objectContaining({ category: "breaker", status: "fail" }),
      expect.objectContaining({ category: "journal_boundary", status: "pass" }),
    ]));
  });

  it("is deterministic for the same readiness input", () => {
    const observations = [observation({ operation: "probe" })];
    const snapshot = buildRemoteProviderMetricsSnapshot(observations);
    const input = {
      credentialDiagnostics: credentials(true),
      metricsSnapshot: snapshot,
      alertCandidates: buildRemoteProviderAlertCandidates(snapshot),
      breakerEvaluation: evaluateRemoteCircuitBreaker({
        observations,
        evaluatedAt: "2026-05-02T12:00:00.000Z",
      }),
      sampledObservationCount: observations.length,
      checkedAt: "2026-05-02T12:00:00.000Z",
    };

    expect(buildRemoteProviderReadinessReport(input)).toEqual(buildRemoteProviderReadinessReport(input));
  });
});
