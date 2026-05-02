import { definePlugin, runWorker, type PluginApiRequestInput } from "@paperclipai/plugin-sdk";
import {
  DARK_FACTORY_PROJECTION_SOURCE,
  DARK_FACTORY_TRUTH_SOURCE,
  DARK_FACTORY_PROTOCOL_RELEASE_TAG,
  PROJECTION_AUTHORITATIVE,
  PROJECTION_DISCLAIMER,
  RUNTIME_OBSERVATION_SOURCE,
} from "./runtime-contract.js";
import {
  acquireHttpLease,
  buildHttpProjectionSummary,
  classifyHttpFailure,
  executeHttpEnvironment,
  httpRuntimeModeFromConfig,
  isDarkFactoryHttpRuntimeMode,
  mapHttpError,
  normalizeHttpEnvironmentConfig,
  probeHttpEnvironment,
  resumeHttpLease,
  validateHttpCredentialConfig,
} from "./http-runtime-adapter.js";
import {
  createMockCallbackReceipt,
  createMockRehydrateRequest,
  getMockJournalCursor,
  getMockJournalReplayEntries,
  getMockProviderHealth,
  getMockRunAttemptMetadata,
  getMockRuntimeProjection,
  getProviderRuntimeMode,
  replayMockJournal,
} from "./mock-runtime-adapter.js";
import {
  buildRemoteProviderAlertCandidates,
  buildRemoteProviderMetricsSnapshot,
  type RemoteProviderObservation,
  type RemoteProviderOperation,
} from "./remote-provider-observability.js";
import {
  evaluateRemoteCircuitBreaker,
  type RemoteCircuitBreakerEvaluation,
} from "./remote-provider-circuit-breaker.js";
import {
  buildRemoteProviderReadinessReport,
  type RemoteCredentialDiagnosticsForReadiness,
} from "./remote-provider-readiness.js";

export { PROJECTION_DISCLAIMER } from "./runtime-contract.js";

type ProjectionSummary = {
  source: typeof DARK_FACTORY_PROJECTION_SOURCE;
  truthSource: typeof DARK_FACTORY_TRUTH_SOURCE;
  authoritative: typeof PROJECTION_AUTHORITATIVE;
  disclaimer: typeof PROJECTION_DISCLAIMER;
  journalCursor: ReturnType<typeof getMockJournalCursor>;
  lastSequenceNo: number;
  projectionStatus: ReturnType<typeof getMockRuntimeProjection>["projectionStatus"];
  callbackReceiptId: string;
  staleReason: string | null;
  degradedReason: string | null;
  blockedReason: string | null;
  projection: ReturnType<typeof getMockRuntimeProjection>;
  providerHealth: ReturnType<typeof getMockProviderHealth>;
  runtimeImpact: ReturnType<typeof getProviderRuntimeMode>;
  runAttemptMetadata: ReturnType<typeof getMockRunAttemptMetadata>;
};

function buildSummary(issueId: string): ProjectionSummary {
  const projection = getMockRuntimeProjection(issueId);
  const providerHealth = getMockProviderHealth(issueId);
  return {
    source: DARK_FACTORY_PROJECTION_SOURCE,
    truthSource: DARK_FACTORY_TRUTH_SOURCE,
    authoritative: PROJECTION_AUTHORITATIVE,
    disclaimer: PROJECTION_DISCLAIMER,
    journalCursor: projection.journalCursorMetadata,
    lastSequenceNo: projection.lastSequenceNo,
    projectionStatus: projection.projectionStatus,
    callbackReceiptId: projection.callbackReceiptId,
    staleReason: projection.staleReason,
    degradedReason: projection.degradedReason,
    blockedReason: projection.blockedReason,
    projection,
    providerHealth,
    runtimeImpact: getProviderRuntimeMode(providerHealth),
    runAttemptMetadata: getMockRunAttemptMetadata(issueId),
  };
}

function projectionBoundary() {
  return {
    source: DARK_FACTORY_PROJECTION_SOURCE,
    authoritative: PROJECTION_AUTHORITATIVE,
    truthSource: DARK_FACTORY_TRUTH_SOURCE,
  } as const;
}

function normalizeEnvironmentConfig(config: Record<string, unknown>): Record<string, unknown> {
  if (isDarkFactoryHttpRuntimeMode(config.mode)) {
    return normalizeHttpEnvironmentConfig(config);
  }
  const { mode: _mode, ...rest } = config;
  return {
    mode: "mock",
    ...rest,
  };
}

function mockIssueIdForRun(runId: string): string {
  return runId.trim().length > 0 ? runId.trim() : "dark-factory-mock-run";
}

function mockRunIdFromLease(providerLeaseId: string | null | undefined, leaseMetadata?: Record<string, unknown>): string {
  const metadataRunId = stringField(leaseMetadata?.runId);
  if (metadataRunId) return metadataRunId;
  const leaseRunId = stringField(providerLeaseId)?.replace(/^df-lease-/, "");
  return mockIssueIdForRun(leaseRunId ?? "dark-factory-mock-run");
}

function mockLeaseId(runId: string): string {
  return `df-lease-${runId.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
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

function booleanField(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function breakerState(value: unknown): RemoteCircuitBreakerEvaluation["breakerState"] | null {
  return value === "closed" || value === "open" || value === "half_open" ? value : null;
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

function remoteCredentialDiagnosticsFromParams(params: Record<string, unknown>): RemoteCredentialDiagnosticsForReadiness & {
  credentialSource: string | null;
  checkedConfig: {
    configSupplied: boolean;
    mode: "remote";
    endpointPresent: boolean;
    apiKeyPresent: boolean;
    apiKeySecretRefPresent: boolean;
    apiKeySecretRefScheme: "none" | "env" | "env_url" | "unsupported";
  };
} {
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

function apiKeySecretRefScheme(secretRef: string | null): "none" | "env" | "env_url" | "unsupported" {
  if (!secretRef) return "none";
  if (secretRef.startsWith("env://")) return "env_url";
  if (secretRef.startsWith("env:")) return "env";
  return "unsupported";
}

function idempotencyKeyFrom(input: PluginApiRequestInput, body: Record<string, unknown> | null): string | null {
  return stringField(body?.idempotencyKey) ?? stringField(input.headers?.["idempotency-key"]) ?? stringField(input.headers?.["Idempotency-Key"]);
}

function isHttpMode(config: Record<string, unknown>): boolean {
  return isDarkFactoryHttpRuntimeMode(config.mode);
}

const plugin = definePlugin({
  async setup(ctx) {
    ctx.data.register("projection-summary", async (params) => {
      const issueId = stringField(params.issueId) ?? "dashboard-overview";
      if (isHttpMode(params)) {
        return buildHttpProjectionSummary(issueId, params);
      }
      return buildSummary(issueId);
    });

    ctx.data.register("remote-observability-snapshot", async (params) => {
      const observations = remoteObservationsFromParams(params);
      const snapshot = buildRemoteProviderMetricsSnapshot(observations, {
        expectedSequenceNo: numberField(params.expectedSequenceNo),
      });
      return {
        ...projectionBoundary(),
        observationSource: RUNTIME_OBSERVATION_SOURCE,
        runtimeMode: "remote",
        sampledObservationCount: observations.length,
        snapshot,
        alerts: buildRemoteProviderAlertCandidates(snapshot, {
          errorRateWarningThreshold: numberField(params.errorRateWarningThreshold) ?? undefined,
          latencyWarningThresholdMs: numberField(params.latencyWarningThresholdMs) ?? undefined,
          cursorLagWarningThreshold: numberField(params.cursorLagWarningThreshold) ?? undefined,
        }),
        terminalStateAdvanced: false,
      };
    });

    ctx.data.register("remote-credential-diagnostics", async (params) => {
      return remoteCredentialDiagnosticsFromParams(params);
    });

    ctx.data.register("remote-breaker-evaluation", async (params) => {
      return evaluateRemoteCircuitBreaker({
        previous: previousBreakerFromParams(params),
        observations: remoteObservationsFromParams(params),
        evaluatedAt: stringField(params.evaluatedAt) ?? new Date(0).toISOString(),
        policy: {
          failureThreshold: numberField(params.failureThreshold) ?? undefined,
          cooldownMs: numberField(params.cooldownMs) ?? undefined,
          halfOpenSuccessThreshold: numberField(params.halfOpenSuccessThreshold) ?? undefined,
        },
      });
    });

    ctx.data.register("remote-provider-readiness", async (params) => {
      const observations = remoteObservationsFromParams(params);
      const snapshot = buildRemoteProviderMetricsSnapshot(observations, {
        expectedSequenceNo: numberField(params.expectedSequenceNo),
      });
      const alerts = buildRemoteProviderAlertCandidates(snapshot, {
        errorRateWarningThreshold: numberField(params.errorRateWarningThreshold) ?? undefined,
        latencyWarningThresholdMs: numberField(params.latencyWarningThresholdMs) ?? undefined,
        cursorLagWarningThreshold: numberField(params.cursorLagWarningThreshold) ?? undefined,
      });
      const breakerEvaluation = evaluateRemoteCircuitBreaker({
        previous: previousBreakerFromParams(params),
        observations,
        evaluatedAt: stringField(params.evaluatedAt) ?? new Date(0).toISOString(),
        policy: {
          failureThreshold: numberField(params.failureThreshold) ?? undefined,
          cooldownMs: numberField(params.cooldownMs) ?? undefined,
          halfOpenSuccessThreshold: numberField(params.halfOpenSuccessThreshold) ?? undefined,
        },
      });
      return buildRemoteProviderReadinessReport({
        credentialDiagnostics: remoteCredentialDiagnosticsFromParams(params),
        metricsSnapshot: snapshot,
        alertCandidates: alerts,
        breakerEvaluation,
        sampledObservationCount: observations.length,
        checkedAt: stringField(params.checkedAt) ?? stringField(params.evaluatedAt) ?? new Date(0).toISOString(),
      });
    });

    ctx.actions.register("request-rehydrate", async (params) => {
      const issueId = stringField(params.issueId);
      if (!issueId) throw new Error("issueId is required");
      return createMockRehydrateRequest(issueId, {
        reason: stringField(params.reason),
        idempotencyKey: stringField(params.idempotencyKey),
      });
    });
  },

  async onApiRequest(input: PluginApiRequestInput) {
    const issueId = stringField(input.params.issueId);
    if (!issueId) {
      return {
        status: 400,
        body: { error: "issueId is required" },
      };
    }

    if (input.routeKey === "projection") {
      return { status: 200, body: getMockRuntimeProjection(issueId) };
    }

    if (input.routeKey === "journal-cursor") {
      const projection = getMockRuntimeProjection(issueId);
      return {
        status: 200,
        body: {
          ...projection,
          cursor: projection.journalCursorMetadata,
        },
      };
    }

    if (input.routeKey === "provider-health") {
      const projection = getMockRuntimeProjection(issueId);
      const providerHealth = getMockProviderHealth(issueId);
      return {
        status: 200,
        body: {
          ...projection,
          observationSource: RUNTIME_OBSERVATION_SOURCE,
          providerRole: providerHealth.providerRole,
          modelRole: providerHealth.modelRole,
          modelSelection: providerHealth.modelSelection,
          breakerState: providerHealth.breakerState,
          providerState: providerHealth.providerState,
          degraded: providerHealth.degraded,
          blocked: providerHealth.blocked,
          fallbackTriggered: providerHealth.fallbackTriggered,
          providerHealth,
          runtimeImpact: getProviderRuntimeMode(providerHealth),
          runAttemptMetadata: getMockRunAttemptMetadata(issueId),
        },
      };
    }

    if (input.routeKey === "runtime-capability-snapshot") {
      return {
        status: 200,
        body: buildSummary(issueId),
      };
    }

    if (input.routeKey === "rehydrate-request") {
      const body = recordBody(input.body);
      return {
        status: 202,
        body: createMockRehydrateRequest(issueId, {
          reason: stringField(body?.reason),
          idempotencyKey: idempotencyKeyFrom(input, body),
        }),
      };
    }

    return {
      status: 404,
      body: {
        error: {
          code: "dark_factory_route_not_found",
          message: "Unknown Dark Factory bridge route",
          routeKey: input.routeKey,
        },
        source: DARK_FACTORY_PROJECTION_SOURCE,
        truthSource: DARK_FACTORY_TRUTH_SOURCE,
        authoritative: PROJECTION_AUTHORITATIVE,
        terminalStateAdvanced: false,
      },
    };
  },

  async onHealth() {
    return {
      status: "ok",
      message: "Dark Factory bridge runtime adapter is running in projection-only mode",
      details: {
        source: DARK_FACTORY_PROJECTION_SOURCE,
        truthSource: DARK_FACTORY_TRUTH_SOURCE,
        authoritative: PROJECTION_AUTHORITATIVE,
        observationSource: RUNTIME_OBSERVATION_SOURCE,
        protocolReleaseTag: DARK_FACTORY_PROTOCOL_RELEASE_TAG,
      },
    };
  },

  async onEnvironmentValidateConfig(params) {
    if (isDarkFactoryHttpRuntimeMode(params.config.mode)) {
      try {
        const normalizedConfig = normalizeEnvironmentConfig(params.config);
        const credentialValidation = validateHttpCredentialConfig(params.config);
        if (!credentialValidation.ok) {
          return {
            ok: false,
            errors: [credentialValidation.message],
          };
        }
        return {
          ok: true,
          normalizedConfig,
        };
      } catch (error) {
        return {
          ok: false,
          errors: [(error as Error).message],
        };
      }
    }

    if (params.config.mode !== "mock") {
      return {
        ok: false,
        errors: ["Only mock mode is supported in this version"],
      };
    }

    return {
      ok: true,
      normalizedConfig: normalizeEnvironmentConfig(params.config),
    };
  },

  async onEnvironmentProbe(params) {
    if (isHttpMode(params.config)) {
      return probeHttpEnvironment(params);
    }

    const issueId = mockIssueIdForRun(params.environmentId);
    const providerHealth = getMockProviderHealth(issueId);

    return {
      ok: true,
      summary: "Dark Factory mock environment ready",
      metadata: {
        ...projectionBoundary(),
        observationSource: RUNTIME_OBSERVATION_SOURCE,
        driverKey: params.driverKey,
        environmentId: params.environmentId,
        runtimeMode: "mock",
        providerHealth,
        runtimeImpact: getProviderRuntimeMode(providerHealth),
        terminalStateAdvanced: false,
      },
    };
  },

  async onEnvironmentAcquireLease(params) {
    if (isHttpMode(params.config)) {
      return acquireHttpLease(params);
    }

    const runId = mockIssueIdForRun(params.runId);
    const projection = getMockRuntimeProjection(runId);
    const cursor = getMockJournalCursor(runId);
    const providerHealth = getMockProviderHealth(runId);

    return {
      providerLeaseId: mockLeaseId(runId),
      metadata: {
        ...projectionBoundary(),
        driverKey: params.driverKey,
        environmentId: params.environmentId,
        runId,
        runtimeMode: "mock",
        projection,
        journalCursor: cursor,
        providerHealth,
        runtimeImpact: getProviderRuntimeMode(providerHealth),
        terminalStateAdvanced: false,
      },
      expiresAt: null,
    };
  },

  async onEnvironmentResumeLease(params) {
    if (isHttpMode(params.config)) {
      return resumeHttpLease(params);
    }

    const runId = mockRunIdFromLease(params.providerLeaseId, params.leaseMetadata);
    const projection = getMockRuntimeProjection(runId);
    const cursor = getMockJournalCursor(runId);
    const providerHealth = getMockProviderHealth(runId);

    return {
      providerLeaseId: params.providerLeaseId,
      metadata: {
        ...projectionBoundary(),
        driverKey: params.driverKey,
        environmentId: params.environmentId,
        runId,
        runtimeMode: "mock",
        resumedLease: true,
        projection,
        journalCursor: cursor,
        providerHealth,
        runtimeImpact: getProviderRuntimeMode(providerHealth),
        terminalStateAdvanced: false,
      },
      expiresAt: null,
    };
  },

  async onEnvironmentReleaseLease(_params) {
    // Lease release is intentionally a no-op for both mock and HTTP mode:
    // Dark Factory terminal state remains Journal-owned.
  },

  async onEnvironmentDestroyLease(_params) {
    // Lease destroy is intentionally a no-op for both mock and HTTP mode:
    // no Paperclip terminal state is advanced.
  },

  async onEnvironmentExecute(params) {
    if (isHttpMode(params.config)) {
      try {
        return await executeHttpEnvironment(params);
      } catch (error) {
        const mapped = mapHttpError(error);
        const failure = classifyHttpFailure(mapped);
        const runtimeMode = httpRuntimeModeFromConfig(params.config);
        return {
          exitCode: null,
          timedOut: mapped.code === "dark_factory_http_timeout",
          stdout: "",
          stderr: mapped.message,
          metadata: {
            ...projectionBoundary(),
            runtimeMode,
            terminalStateAdvanced: false,
            errorCode: mapped.code,
            errorStatus: mapped.status,
            errorDetails: mapped.details,
            failureClass: failure.failureClass,
            retryable: failure.retryable,
            runtimeImpact: failure.runtimeImpact,
          },
        };
      }
    }

    const runId = stringField(params.lease.metadata?.runId) ?? stringField(params.lease.providerLeaseId)?.replace(/^df-lease-/, "") ?? mockIssueIdForRun(params.environmentId);
    const projection = getMockRuntimeProjection(runId);
    const runAttemptMetadata = getMockRunAttemptMetadata(runId);
    const cursor = getMockJournalCursor(runId);
    const providerHealth = getMockProviderHealth(runId);
    const replay = replayMockJournal(runId, getMockJournalReplayEntries(runId));
    const receipt = createMockCallbackReceipt({
      issueId: runId,
      runId: projection.runId,
      requestKind: "callback",
      idempotencyKey: `${projection.runId}:${params.command}:${(params.args ?? []).join(":")}`,
    });
    const summary = {
      ...projectionBoundary(),
      runtimeMode: "mock",
      runId,
      projectionStatus: projection.projectionStatus,
      journalCursor: cursor.journalCursor,
      receiptId: receipt.receiptId,
      terminalStateAdvanced: false,
    };

    return {
      exitCode: 0,
      timedOut: false,
      stdout: JSON.stringify(summary),
      stderr: "",
      metadata: {
        ...projectionBoundary(),
        projection,
        cursor,
        receipt,
        replay,
        runtimeMode: "mock",
        providerHealth,
        runtimeImpact: getProviderRuntimeMode(providerHealth),
        runAttemptMetadata,
        terminalStateAdvanced: false,
        disclaimer: PROJECTION_DISCLAIMER,
      },
    };
  }
});

export default plugin;
runWorker(plugin, import.meta.url);
