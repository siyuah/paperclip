import {
  DARK_FACTORY_PROJECTION_SOURCE,
  DARK_FACTORY_TRUTH_SOURCE,
  PROJECTION_AUTHORITATIVE,
  RUNTIME_OBSERVATION_SOURCE,
} from "./runtime-contract.js";

type ProjectionBoundary = {
  source: typeof DARK_FACTORY_PROJECTION_SOURCE;
  authoritative: typeof PROJECTION_AUTHORITATIVE;
  truthSource: typeof DARK_FACTORY_TRUTH_SOURCE;
};

export type RemoteProviderHostContextAdapterInputSource =
  | "host_settings_context"
  | "host_runtime_context"
  | "combined";

export type RemoteProviderHostContextAdapterResult = ProjectionBoundary & {
  observationSource: typeof RUNTIME_OBSERVATION_SOURCE;
  runtimeMode: "remote";
  adapterKind: "host_settings_runtime_context";
  inputSource: RemoteProviderHostContextAdapterInputSource;
  activeContext: Record<string, unknown>;
  adapterSummary: {
    settingsSupplied: boolean;
    runtimeSupplied: boolean;
    environmentConfigSupplied: boolean;
    observationCount: number;
    previousBreakerSupplied: boolean;
    previousReadinessSupplied: boolean;
    expectedSequenceNo: number | null;
    checkedAt: string;
    evaluatedAt: string;
  };
  doesAuthorizeRemoteExecution: false;
  terminalStateAdvanced: false;
};

export function adaptRemoteProviderHostContext(
  params: Record<string, unknown>,
): RemoteProviderHostContextAdapterResult {
  const settings = firstRecord(
    params.hostSettingsContext,
    params.settingsContext,
    params.environmentSettingsContext,
  );
  const runtime = firstRecord(
    params.hostRuntimeContext,
    params.runtimeContext,
    params.environmentRuntimeContext,
  );
  const settingsConfig = firstRecord(
    settings?.environmentConfig,
    settings?.activeEnvironmentConfig,
    settings?.config,
    settings?.driverConfig,
  );
  const runtimeConfig = firstRecord(
    runtime?.environmentConfig,
    runtime?.activeEnvironmentConfig,
    runtime?.config,
  );
  const activeContext = compactRecord({
    checkedAt: stringField(params.checkedAt) ?? stringField(runtime?.checkedAt) ?? stringField(settings?.checkedAt),
    evaluatedAt: stringField(params.evaluatedAt) ?? stringField(runtime?.evaluatedAt) ?? stringField(settings?.evaluatedAt),
    environmentConfig: settingsConfig ?? runtimeConfig,
    journal: firstRecord(runtime?.journal, settings?.journal),
    sampledObservations: arrayField(runtime?.sampledObservations)
      ?? arrayField(runtime?.observations)
      ?? arrayField(runtime?.remoteObservations),
    breakerEvidence: firstRecord(runtime?.breakerEvidence, runtime?.previousBreaker),
    readinessEvidence: firstRecord(runtime?.readinessEvidence, runtime?.previousReadiness),
    alertThresholds: firstRecord(settings?.alertThresholds, settings?.thresholds),
    circuitBreakerPolicy: firstRecord(settings?.circuitBreakerPolicy, settings?.breakerPolicy),
  });
  const inputSource: RemoteProviderHostContextAdapterInputSource = settings && runtime
    ? "combined"
    : settings
      ? "host_settings_context"
      : "host_runtime_context";
  const observations = arrayField(activeContext.sampledObservations) ?? [];

  return {
    ...projectionBoundary(),
    observationSource: RUNTIME_OBSERVATION_SOURCE,
    runtimeMode: "remote",
    adapterKind: "host_settings_runtime_context",
    inputSource,
    activeContext,
    adapterSummary: {
      settingsSupplied: settings !== null,
      runtimeSupplied: runtime !== null,
      environmentConfigSupplied: firstRecord(activeContext.environmentConfig) !== null,
      observationCount: observations.length,
      previousBreakerSupplied: firstRecord(activeContext.breakerEvidence) !== null,
      previousReadinessSupplied: firstRecord(activeContext.readinessEvidence) !== null,
      expectedSequenceNo: numberField(firstRecord(activeContext.journal)?.expectedSequenceNo),
      checkedAt: stringField(activeContext.checkedAt) ?? new Date(0).toISOString(),
      evaluatedAt: stringField(activeContext.evaluatedAt) ?? new Date(0).toISOString(),
    },
    doesAuthorizeRemoteExecution: false,
    terminalStateAdvanced: false,
  };
}

function firstRecord(...values: unknown[]): Record<string, unknown> | null {
  for (const value of values) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

function arrayField(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberField(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== null && value !== undefined));
}

function projectionBoundary(): ProjectionBoundary {
  return {
    source: DARK_FACTORY_PROJECTION_SOURCE,
    authoritative: PROJECTION_AUTHORITATIVE,
    truthSource: DARK_FACTORY_TRUTH_SOURCE,
  };
}
