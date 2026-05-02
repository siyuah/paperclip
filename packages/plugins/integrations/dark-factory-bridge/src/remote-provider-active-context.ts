import {
  validateHttpCredentialConfig,
} from "./http-runtime-adapter.js";
import {
  DARK_FACTORY_PROJECTION_SOURCE,
  DARK_FACTORY_TRUTH_SOURCE,
  PROJECTION_AUTHORITATIVE,
  RUNTIME_OBSERVATION_SOURCE,
} from "./runtime-contract.js";
import {
  evaluateRemoteCircuitBreaker,
  type RemoteCircuitBreakerEvaluation,
} from "./remote-provider-circuit-breaker.js";
import {
  buildRemoteProviderAlertCandidates,
  buildRemoteProviderMetricsSnapshot,
  type RemoteProviderAlertCandidate,
  type RemoteProviderMetricsSnapshot,
  type RemoteProviderObservation,
  type RemoteProviderOperation,
} from "./remote-provider-observability.js";
import type {
  RemoteCredentialDiagnosticsForReadiness,
  RemoteProviderNextSafeHook,
  RemoteProviderReadinessInput,
  RemoteProviderReadinessStatus,
  RemoteProviderReadinessTransitionInput,
} from "./remote-provider-readiness.js";

type ProjectionBoundary = {
  source: typeof DARK_FACTORY_PROJECTION_SOURCE;
  authoritative: typeof PROJECTION_AUTHORITATIVE;
  truthSource: typeof DARK_FACTORY_TRUTH_SOURCE;
};

export type RemoteCredentialDiagnostics = RemoteCredentialDiagnosticsForReadiness & {
  credentialSource: string | null;
  checkedConfig: {
    configSupplied: boolean;
    mode: "remote";
    endpointPresent: boolean;
    apiKeyPresent: boolean;
    apiKeySecretRefPresent: boolean;
    apiKeySecretRefScheme: "none" | "env" | "env_url" | "unsupported";
  };
};

export type RemoteProviderActiveContext = ProjectionBoundary & {
  observationSource: typeof RUNTIME_OBSERVATION_SOURCE;
  runtimeMode: "remote";
  checkedAt: string;
  evaluatedAt: string;
  expectedSequenceNo: number | null;
  observations: RemoteProviderObservation[];
  sampledObservationCount: number;
  credentialDiagnostics: RemoteCredentialDiagnostics;
  metricsSnapshot: RemoteProviderMetricsSnapshot;
  alertCandidates: RemoteProviderAlertCandidate[];
  breakerEvaluation: RemoteCircuitBreakerEvaluation;
  previousReadiness: RemoteProviderReadinessTransitionInput;
  readinessInput: RemoteProviderReadinessInput;
  terminalStateAdvanced: false;
};

export function buildRemoteProviderActiveContext(params: Record<string, unknown>): RemoteProviderActiveContext {
  const observations = remoteObservationsFromParams(params);
  const expectedSequenceNo = numberField(params.expectedSequenceNo);
  const metricsSnapshot = buildRemoteProviderMetricsSnapshot(observations, {
    expectedSequenceNo,
  });
  const alertCandidates = buildRemoteProviderAlertCandidates(metricsSnapshot, {
    errorRateWarningThreshold: numberField(params.errorRateWarningThreshold) ?? undefined,
    latencyWarningThresholdMs: numberField(params.latencyWarningThresholdMs) ?? undefined,
    cursorLagWarningThreshold: numberField(params.cursorLagWarningThreshold) ?? undefined,
  });
  const evaluatedAt = stringField(params.evaluatedAt) ?? new Date(0).toISOString();
  const checkedAt = stringField(params.checkedAt) ?? evaluatedAt;
  const breakerEvaluation = evaluateRemoteCircuitBreaker({
    previous: previousBreakerFromParams(params),
    observations,
    evaluatedAt,
    policy: {
      failureThreshold: numberField(params.failureThreshold) ?? undefined,
      cooldownMs: numberField(params.cooldownMs) ?? undefined,
      halfOpenSuccessThreshold: numberField(params.halfOpenSuccessThreshold) ?? undefined,
    },
  });
  const credentialDiagnostics = remoteCredentialDiagnosticsFromParams(params);
  const previousReadiness = previousReadinessFromParams(params);

  return {
    ...projectionBoundary(),
    observationSource: RUNTIME_OBSERVATION_SOURCE,
    runtimeMode: "remote",
    checkedAt,
    evaluatedAt,
    expectedSequenceNo,
    observations,
    sampledObservationCount: observations.length,
    credentialDiagnostics,
    metricsSnapshot,
    alertCandidates,
    breakerEvaluation,
    previousReadiness,
    readinessInput: {
      credentialDiagnostics,
      metricsSnapshot,
      alertCandidates,
      breakerEvaluation,
      sampledObservationCount: observations.length,
      checkedAt,
      previousReadiness,
    },
    terminalStateAdvanced: false,
  };
}

function remoteObservationsFromParams(params: Record<string, unknown>): RemoteProviderObservation[] {
  return recordArray(params.observations).map((item) => ({
    runtimeMode: "remote",
    operation: remoteOperation(item.operation),
    status: numberField(item.status),
    durationMs: numberField(item.durationMs) ?? 0,
    attempt: numberField(item.attempt) ?? 0,
    retryable: booleanField(item.retryable, false),
    failureClass: failureClass(item.failureClass),
    errorCode: stringField(item.errorCode),
    journalCursor: stringField(item.journalCursor),
    lastSequenceNo: numberField(item.lastSequenceNo),
    terminalStateAdvanced: false,
  }));
}

function previousBreakerFromParams(params: Record<string, unknown>): Partial<RemoteCircuitBreakerEvaluation> | null {
  const previous = recordBody(params.previousBreaker);
  if (!previous) return null;
  return {
    breakerState: breakerState(previous.breakerState) ?? undefined,
    consecutiveFailures: numberField(previous.consecutiveFailures) ?? undefined,
    consecutiveHalfOpenSuccesses: numberField(previous.consecutiveHalfOpenSuccesses) ?? undefined,
    openedAt: stringField(previous.openedAt),
    cooldownUntil: stringField(previous.cooldownUntil),
    openReason: stringField(previous.openReason),
    lastFailureClass: failureClass(previous.lastFailureClass),
  };
}

function previousReadinessFromParams(params: Record<string, unknown>): RemoteProviderReadinessTransitionInput {
  const previous = recordBody(params.previousReadiness);
  if (!previous) return null;
  const status = readinessStatus(previous.readinessStatus);
  const nextSafeHook = readinessNextSafeHook(previous.nextSafeHook);
  return {
    ...(status ? { readinessStatus: status } : {}),
    ...(nextSafeHook ? { nextSafeHook } : {}),
    receiptDigest: stringField(previous.receiptDigest) ?? stringField(previous.digest),
    receiptId: stringField(previous.receiptId),
    checkedAt: stringField(previous.checkedAt),
  };
}

function remoteCredentialDiagnosticsFromParams(params: Record<string, unknown>): RemoteCredentialDiagnostics {
  const config = recordBody(params.config);
  if (!config) {
    const code = "dark_factory_remote_credential_config_not_supplied";
    return {
      ...projectionBoundary(),
      observationSource: RUNTIME_OBSERVATION_SOURCE,
      runtimeMode: "remote",
      ok: false,
      credentialSource: null,
      checkedConfig: {
        configSupplied: false,
        mode: "remote",
        endpointPresent: false,
        apiKeyPresent: false,
        apiKeySecretRefPresent: false,
        apiKeySecretRefScheme: "none",
      },
      diagnostics: [
        {
          severity: "info",
          code,
          message: "No remote credential config was supplied to the settings surface",
          details: { mode: "remote" },
          remediation: credentialRemediation(code),
        },
      ],
      terminalStateAdvanced: false,
    };
  }

  const remoteConfig: Record<string, unknown> = { ...config, mode: "remote" };
  const validation = validateHttpCredentialConfig(remoteConfig);
  const apiKeySecretRef = stringField(remoteConfig.apiKeySecretRef);
  const checkedConfig = {
    configSupplied: true,
    mode: "remote" as const,
    endpointPresent: stringField(remoteConfig.endpoint) !== null,
    apiKeyPresent: stringField(remoteConfig.apiKey) !== null,
    apiKeySecretRefPresent: apiKeySecretRef !== null,
    apiKeySecretRefScheme: apiKeySecretRefScheme(apiKeySecretRef),
  };

  if (validation.ok) {
    const code = "dark_factory_remote_credential_ready";
    return {
      ...projectionBoundary(),
      observationSource: RUNTIME_OBSERVATION_SOURCE,
      runtimeMode: "remote",
      ok: true,
      credentialSource: validation.credentialSource,
      checkedConfig,
      diagnostics: [
        {
          severity: "info",
          code,
          message: `Remote credential check passed using ${validation.credentialSource} credential`,
          details: { credentialSource: validation.credentialSource },
          remediation: credentialRemediation(code),
        },
      ],
      terminalStateAdvanced: false,
    };
  }

  return {
    ...projectionBoundary(),
    observationSource: RUNTIME_OBSERVATION_SOURCE,
    runtimeMode: "remote",
    ok: false,
    credentialSource: null,
    checkedConfig,
    diagnostics: [
      {
        severity: "error",
        code: validation.code,
        message: validation.message,
        details: {
          mode: "remote",
          apiKeySecretRefScheme: checkedConfig.apiKeySecretRefScheme,
          ...(stringField(validation.details.envName) ? { envName: stringField(validation.details.envName) } : {}),
        },
        remediation: credentialRemediation(validation.code),
      },
    ],
    terminalStateAdvanced: false,
  };
}

function credentialRemediation(code: string): string[] {
  switch (code) {
    case "dark_factory_remote_credential_config_not_supplied":
      return [
        "Open the environment driver settings and provide a remote config sample before validating credentials.",
        "Treat this as an empty settings surface state, not a provider failure.",
      ];
    case "dark_factory_remote_credential_missing":
      return [
        "Set apiKeySecretRef to env:NAME or env://NAME for remote alpha.",
        "Use inline apiKey only for controlled local testing.",
      ];
    case "dark_factory_remote_credential_ref_unsupported":
      return [
        "Replace the unsupported secret reference with env:NAME or env://NAME.",
        "Wait for a host-managed secret resolver before using secret:// style references.",
      ];
    case "dark_factory_remote_credential_unresolved":
      return [
        "Create or export the referenced environment variable in the plugin host process.",
        "Restart or reload the host after updating environment variables.",
      ];
    case "dark_factory_remote_credential_ready":
      return [
        "No credential remediation is needed.",
        "Continue with probe or acquire only in an operator-controlled environment.",
      ];
    default:
      return [
        "Review the remote provider configuration and keep credential values outside plugin data surfaces.",
      ];
  }
}

function apiKeySecretRefScheme(secretRef: string | null): RemoteCredentialDiagnostics["checkedConfig"]["apiKeySecretRefScheme"] {
  if (!secretRef) return "none";
  if (secretRef.startsWith("env://")) return "env_url";
  if (secretRef.startsWith("env:")) return "env";
  return "unsupported";
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

function booleanField(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function recordBody(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") return null;
  if (Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => item !== null && typeof item === "object" && !Array.isArray(item))
    : [];
}

function remoteOperation(value: unknown): RemoteProviderOperation {
  return value === "probe" || value === "acquire" || value === "resume" || value === "execute" || value === "release" || value === "destroy"
    ? value
    : "execute";
}

function failureClass(value: unknown): RemoteProviderObservation["failureClass"] {
  return value === "none"
    || value === "transient_provider"
    || value === "provider_unavailable"
    || value === "quota_exceeded"
    || value === "runtime_blocked"
    ? value
    : "none";
}

function breakerState(value: unknown): RemoteCircuitBreakerEvaluation["breakerState"] | null {
  return value === "closed" || value === "open" || value === "half_open" ? value : null;
}

function readinessStatus(value: unknown): RemoteProviderReadinessStatus | null {
  return value === "ready" || value === "needs_attention" || value === "blocked" ? value : null;
}

function readinessNextSafeHook(value: unknown): RemoteProviderNextSafeHook | null {
  return value === "onEnvironmentValidateConfig"
    || value === "onEnvironmentProbe"
    || value === "onEnvironmentAcquireLease"
    || value === "onEnvironmentExecute"
    || value === "none"
    ? value
    : null;
}

function projectionBoundary(): ProjectionBoundary {
  return {
    source: DARK_FACTORY_PROJECTION_SOURCE,
    authoritative: PROJECTION_AUTHORITATIVE,
    truthSource: DARK_FACTORY_TRUTH_SOURCE,
  };
}
