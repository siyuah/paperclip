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
  executeHttpEnvironment,
  mapHttpError,
  normalizeHttpEnvironmentConfig,
  probeHttpEnvironment,
  resumeHttpLease,
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
  if (config.mode === "http") {
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

function recordBody(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") return null;
  if (Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function idempotencyKeyFrom(input: PluginApiRequestInput, body: Record<string, unknown> | null): string | null {
  return stringField(body?.idempotencyKey) ?? stringField(input.headers?.["idempotency-key"]) ?? stringField(input.headers?.["Idempotency-Key"]);
}

function isHttpMode(config: Record<string, unknown>): boolean {
  return config.mode === "http";
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
    if (params.config.mode === "http") {
      try {
        return {
          ok: true,
          normalizedConfig: normalizeEnvironmentConfig(params.config),
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
        return {
          exitCode: null,
          timedOut: mapped.code === "dark_factory_http_timeout",
          stdout: "",
          stderr: mapped.message,
          metadata: {
            ...projectionBoundary(),
            runtimeMode: "http",
            terminalStateAdvanced: false,
            errorCode: mapped.code,
            errorStatus: mapped.status,
            errorDetails: mapped.details,
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
