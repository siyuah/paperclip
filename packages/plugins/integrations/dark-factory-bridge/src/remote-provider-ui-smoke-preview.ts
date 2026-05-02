import {
  DARK_FACTORY_PROJECTION_SOURCE,
  DARK_FACTORY_TRUTH_SOURCE,
  PROJECTION_AUTHORITATIVE,
  RUNTIME_OBSERVATION_SOURCE,
} from "./runtime-contract.js";
import {
  createHostObservationFixture,
  replayHostObservationFixture,
  type HostObservationScenario,
} from "./remote-provider-host-observation-fixtures.js";
import type {
  RemoteCredentialDiagnostics,
} from "./remote-provider-active-context.js";
import {
  buildRemoteProviderReadinessReport,
  type RemoteProviderReadinessReport,
} from "./remote-provider-readiness.js";
import type {
  RemoteProviderAlertCandidate,
  RemoteProviderMetricsSnapshot,
} from "./remote-provider-observability.js";
import type {
  RemoteCircuitBreakerEvaluation,
} from "./remote-provider-circuit-breaker.js";

type ProjectionBoundary = {
  source: typeof DARK_FACTORY_PROJECTION_SOURCE;
  authoritative: typeof PROJECTION_AUTHORITATIVE;
  truthSource: typeof DARK_FACTORY_TRUTH_SOURCE;
};

export type UiSmokePreviewScenario = HostObservationScenario;

export type UiSmokePreviewStatus = "ready" | "needs_attention" | "blocked";

export type UiSmokePreview = ProjectionBoundary & {
  observationSource: typeof RUNTIME_OBSERVATION_SOURCE;
  runtimeMode: "remote";
  scenario: UiSmokePreviewScenario;
  hostContextId: string;
  previewStatus: UiSmokePreviewStatus;
  uiBadges: string[];
  readiness: RemoteProviderReadinessReport;
  observability: {
    sampledObservationCount: number;
    snapshot: RemoteProviderMetricsSnapshot;
    alerts: RemoteProviderAlertCandidate[];
    terminalStateAdvanced: false;
  };
  credentialDiagnostics: RemoteCredentialDiagnostics;
  breakerEvaluation: RemoteCircuitBreakerEvaluation;
  terminalStateAdvanced: false;
};

export const UI_SMOKE_PREVIEW_SCENARIOS: UiSmokePreviewScenario[] = [
  "healthy",
  "warning_latency",
  "blocked_failures",
  "stale_readiness",
];

const defaultEndpoint = "https://dark-factory.example.test";
const uiSmokePreviewCredentialPlaceholder = "ui-smoke-preview-placeholder-not-a-secret";

export function uiSmokePreviewScenario(value: unknown): UiSmokePreviewScenario {
  return UI_SMOKE_PREVIEW_SCENARIOS.includes(value as UiSmokePreviewScenario)
    ? value as UiSmokePreviewScenario
    : "healthy";
}

export function buildUiSmokePreview(
  scenario: UiSmokePreviewScenario = "healthy",
  options: {
    endpoint?: string;
    checkedAt?: string;
  } = {},
): UiSmokePreview {
  const fixture = createHostObservationFixture(scenario, {
    endpoint: options.endpoint ?? defaultEndpoint,
    checkedAt: options.checkedAt,
  });
  const replay = replayHostObservationFixture(fixture, {
    config: {
      mode: "remote",
      endpoint: options.endpoint ?? defaultEndpoint,
      apiKey: uiSmokePreviewCredentialPlaceholder,
    },
  });
  const readiness = buildRemoteProviderReadinessReport(replay.activeContext.readinessInput);

  return {
    ...projectionBoundary(),
    observationSource: RUNTIME_OBSERVATION_SOURCE,
    runtimeMode: "remote",
    scenario,
    hostContextId: replay.hostContextId,
    previewStatus: readiness.readinessStatus,
    uiBadges: uiBadgesFor(readiness),
    readiness,
    observability: {
      sampledObservationCount: replay.activeContext.sampledObservationCount,
      snapshot: replay.activeContext.metricsSnapshot,
      alerts: replay.activeContext.alertCandidates,
      terminalStateAdvanced: false,
    },
    credentialDiagnostics: replay.activeContext.credentialDiagnostics,
    breakerEvaluation: replay.activeContext.breakerEvaluation,
    terminalStateAdvanced: false,
  };
}

export function buildAllUiSmokePreviews(options: {
  endpoint?: string;
  checkedAt?: string;
} = {}): UiSmokePreview[] {
  return UI_SMOKE_PREVIEW_SCENARIOS.map((scenario) => buildUiSmokePreview(scenario, options));
}

function uiBadgesFor(readiness: RemoteProviderReadinessReport): string[] {
  const badges = [
    readiness.readinessStatus,
    `next:${readiness.nextSafeHook}`,
    `breaker:${readiness.breakerState}`,
    `alerts:${readiness.alertCount}`,
    "journal-truth-source",
  ];
  if (readiness.ready) {
    badges.push("execute-allowed");
  }
  for (const signal of readiness.signals) {
    badges.push(signal.code);
  }
  return badges;
}

function projectionBoundary(): ProjectionBoundary {
  return {
    source: DARK_FACTORY_PROJECTION_SOURCE,
    authoritative: PROJECTION_AUTHORITATIVE,
    truthSource: DARK_FACTORY_TRUTH_SOURCE,
  };
}
