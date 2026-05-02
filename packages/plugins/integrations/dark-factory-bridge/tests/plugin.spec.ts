import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pluginManifestV1Schema } from "@paperclipai/shared";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin, { PROJECTION_DISCLAIMER } from "../src/worker.js";

type ApiResponseBody<T> = { body: T };
type RehydrateReceiptBody = {
  receipt: {
    receiptId: string;
    status: string;
    terminalStateAdvanced: boolean;
    idempotencyKey: string;
    reason: string;
  };
  requestSemantics: string;
};

type ProviderHealthBody = {
  providerHealth: { providerState: string; breakerState: string };
  runtimeImpact: {
    mode: string;
    severity: string;
    operatorAction: string;
    paperclipTerminalState: string;
    terminalStateAdvanced: boolean;
  };
};

type RemoteObservabilityBody = {
  source: string;
  truthSource: string;
  authoritative: boolean;
  observationSource: string;
  runtimeMode: string;
  sampledObservationCount: number;
  terminalStateAdvanced: boolean;
  snapshot: {
    requestCount: number;
    successCount: number;
    failureCount: number;
    retryCount: number;
    retryableFailureCount: number;
    maxLatencyMs: number;
    cursorLag: number | null;
    latestErrorCode: string | null;
    terminalStateAdvanced: boolean;
    failureClassCounts: Record<string, number>;
  };
  alerts: Array<{
    code: string;
    severity: string;
    failureClass: string;
    terminalStateAdvanced: boolean;
  }>;
};

type RemoteCredentialDiagnosticsBody = {
  source: string;
  truthSource: string;
  authoritative: boolean;
  observationSource: string;
  runtimeMode: string;
  ok: boolean;
  credentialSource: string | null;
  terminalStateAdvanced: boolean;
  checkedConfig: {
    configSupplied: boolean;
    mode: string;
    endpointPresent: boolean;
    apiKeyPresent: boolean;
    apiKeySecretRefPresent: boolean;
    apiKeySecretRefScheme: string;
  };
  diagnostics: Array<{
    severity: string;
    code: string;
    message: string;
    details?: Record<string, unknown>;
    remediation: string[];
  }>;
};

type RemoteBreakerEvaluationBody = {
  source: string;
  truthSource: string;
  authoritative: boolean;
  observationSource: string;
  runtimeMode: string;
  breakerState: string;
  previousBreakerState: string;
  consecutiveFailures: number;
  consecutiveHalfOpenSuccesses: number;
  openedAt: string | null;
  cooldownUntil: string | null;
  openReason: string | null;
  lastFailureClass: string;
  terminalStateAdvanced: boolean;
  runtimeImpact: {
    mode: string;
    severity: string;
    operatorAction: string;
    paperclipTerminalState: string;
    terminalStateAdvanced: boolean;
    reason: string | null;
  };
};

type RemoteProviderReadinessBody = {
  source: string;
  truthSource: string;
  authoritative: boolean;
  observationSource: string;
  runtimeMode: string;
  checkedAt: string;
  readinessStatus: string;
  ready: boolean;
  summary: string;
  recommendedAction: string;
  nextSafeHook: string;
  credentialOk: boolean;
  breakerState: string;
  sampledObservationCount: number;
  alertCount: number;
  terminalStateAdvanced: boolean;
  signals: Array<{
    category: string;
    severity: string;
    code: string;
    message: string;
    remediation: string[];
    terminalStateAdvanced: boolean;
  }>;
  readinessChecklist: Array<{
    category: string;
    status: string;
    code: string;
    label: string;
    message: string;
    requiredBefore: string;
    terminalStateAdvanced: boolean;
  }>;
};

function apiInput(routeKey: string, issueId: string, companyId: string, method: "GET" | "POST" = "GET", body: unknown = null) {
  return {
    routeKey,
    method,
    path: `/issues/${issueId}/dark-factory/${routeKey}`,
    params: { issueId },
    query: {},
    body,
    actor: {
      actorType: "user" as const,
      actorId: "board",
      userId: "board",
      agentId: null,
      runId: null,
    },
    companyId,
    headers: {},
  };
}

describe("Dark Factory bridge projection plugin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("declares projection-only bridge surfaces without Paperclip task mutation capabilities", () => {
    const parsed = pluginManifestV1Schema.parse(manifest);

    expect(parsed).toMatchObject({
      id: "paperclipai.dark-factory-bridge-example",
      database: {
        namespaceSlug: "dark_factory_bridge_poc",
        migrationsDir: "migrations",
        coreReadTables: ["issues"],
      },
    });
    expect(parsed.displayName).toMatch(/Bridge|Projection/i);
    expect(parsed.description).toMatch(/projection/i);
    expect(parsed.description).not.toMatch(/truth source/i);
    expect(parsed.capabilities).toEqual(expect.arrayContaining([
      "api.routes.register",
      "database.namespace.migrate",
      "database.namespace.read",
      "database.namespace.write",
      "issues.read",
      "ui.dashboardWidget.register",
      "ui.detailTab.register",
      "instance.settings.register",
    ]));
    const forbiddenWriteCapabilities = [
      ["issues", "create"].join("."),
      ["issues", "wakeup"].join("."),
      ["issue", "relations", "write"].join("."),
      ["issue", "documents", "write"].join("."),
      ["issue", "subtree", "write"].join("."),
      ["issues", "orchestration", "write"].join("."),
    ];
    expect(parsed.capabilities).not.toEqual(expect.arrayContaining(forbiddenWriteCapabilities));
    expect(parsed.apiRoutes?.map((route) => `${route.method} ${route.path}`)).toEqual([
      "GET /issues/:issueId/dark-factory/projection",
      "GET /issues/:issueId/dark-factory/journal-cursor",
      "GET /issues/:issueId/dark-factory/provider-health",
      "GET /issues/:issueId/dark-factory/runtime-capability-snapshot",
      "POST /issues/:issueId/dark-factory/rehydrate-request",
    ]);
  });

  it("rejects API requests with missing or invalid issueId before building projection state", async () => {
    const companyId = randomUUID();
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    const missingIssueId = await plugin.definition.onApiRequest?.({
      ...apiInput("projection", "issue-placeholder", companyId),
      params: {},
    });
    expect(missingIssueId).toMatchObject({
      status: 400,
      body: {
        error: "issueId is required",
      },
    });

    const invalidIssueId = await plugin.definition.onApiRequest?.({
      ...apiInput("journal-cursor", "issue-placeholder", companyId),
      params: { issueId: undefined as unknown as string },
    });
    expect(invalidIssueId).toMatchObject({
      status: 400,
      body: {
        error: "issueId is required",
      },
    });
  });

  it("dispatches projection, cursor, provider health, and rehydrate API routes as authoritative:false projection responses", async () => {
    const companyId = randomUUID();
    const issueId = randomUUID();
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    const projection = await plugin.definition.onApiRequest?.(apiInput("projection", issueId, companyId));
    expect(projection).toMatchObject({
      status: 200,
      body: {
        source: "dark-factory-projection",
        truthSource: "dark-factory-journal",
        authoritative: false,
        disclaimer: PROJECTION_DISCLAIMER,
        issueId,
        linkedRunId: expect.stringMatching(/^df-run-/),
        runId: expect.stringMatching(/^df-run-/),
        journalCursorMetadata: expect.objectContaining({ source: "dark-factory-projection" }),
        lastSequenceNo: expect.any(Number),
        projectionStatus: expect.stringMatching(/degraded|blocked|needs_approval|current|stale/),
        callbackReceiptId: expect.stringMatching(/^df-callback-/),
        staleReason: null,
      },
    });

    const cursor = await plugin.definition.onApiRequest?.(apiInput("journal-cursor", issueId, companyId));
    expect(cursor).toMatchObject({
      status: 200,
      body: {
        source: "dark-factory-projection",
        truthSource: "dark-factory-journal",
        authoritative: false,
        journalCursorMetadata: expect.objectContaining({
          source: "dark-factory-projection",
          truthSource: "dark-factory-journal",
          authoritative: false,
          lastSequenceNo: expect.any(Number),
          journalCursor: expect.stringMatching(/^dark-factory:\/\/journal\//),
          sourceJournalRef: expect.stringMatching(/^dark-factory:\/\/journal\//),
          monotonic: true,
        }),
        lastSequenceNo: expect.any(Number),
        projectionStatus: expect.any(String),
        callbackReceiptId: expect.stringMatching(/^df-callback-/),
        staleReason: null,
      },
    });

    const health = await plugin.definition.onApiRequest?.(apiInput("provider-health", issueId, companyId));
    expect(health).toMatchObject({
      status: 200,
      body: {
        source: "dark-factory-projection",
        truthSource: "dark-factory-journal",
        authoritative: false,
        observationSource: "runtime_observation",
        journalCursorMetadata: expect.any(Object),
        lastSequenceNo: expect.any(Number),
        projectionStatus: expect.any(String),
        callbackReceiptId: expect.stringMatching(/^df-callback-/),
        staleReason: null,
        providerRole: "primary_execution",
        modelRole: "execution_model",
        modelSelection: expect.objectContaining({
          policy: "role_based_runtime_selection",
          protocolMustSpecifyConcreteModel: false,
          configuredModelName: null,
        }),
        breakerState: expect.stringMatching(/closed|open|half_open/),
        providerHealth: expect.objectContaining({
          breakerState: expect.stringMatching(/closed|open|half_open/),
          providerRole: "primary_execution",
          modelRole: "execution_model",
          modelSelection: expect.objectContaining({
            policy: "role_based_runtime_selection",
            protocolMustSpecifyConcreteModel: false,
            configuredModelName: null,
          }),
        }),
      },
    });

    const rehydrate = await plugin.definition.onApiRequest?.(apiInput("rehydrate-request", issueId, companyId, "POST", { reason: "operator requested mock refresh" }));
    const repeatedRehydrate = await plugin.definition.onApiRequest?.(apiInput("rehydrate-request", issueId, companyId, "POST", { reason: "operator requested mock refresh" }));
    expect(rehydrate).toMatchObject({
      status: 202,
      body: {
        source: "dark-factory-projection",
        truthSource: "dark-factory-journal",
        authoritative: false,
        journalCursor: expect.any(Object),
        lastSequenceNo: expect.any(Number),
        projectionStatus: expect.any(String),
        callbackReceiptId: expect.stringMatching(/^df-rehydrate-/),
        staleReason: null,
        requestSemantics: "receipt_only_not_terminal_success",
        receipt: expect.objectContaining({
          receiptId: expect.stringMatching(/^df-rehydrate-/),
          status: "requested",
          terminalStateAdvanced: false,
          idempotencyKey: expect.stringContaining(":rehydrate-request"),
        }),
      },
    });
    const rehydrateBody = (rehydrate as ApiResponseBody<RehydrateReceiptBody>).body;
    const repeatedRehydrateBody = (repeatedRehydrate as ApiResponseBody<RehydrateReceiptBody>).body;
    expect(repeatedRehydrateBody.receipt).toMatchObject(rehydrateBody.receipt);
    expect(repeatedRehydrateBody.requestSemantics).toBe("receipt_only_not_terminal_success");
  });

  it("surfaces provider runtime impact for degraded and blocked modes as non-terminal observations", async () => {
    const companyId = randomUUID();
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    const degraded = await plugin.definition.onApiRequest?.(apiInput("provider-health", "issue-provider-half", companyId));
    const blocked = await plugin.definition.onApiRequest?.(apiInput("provider-health", "issue-provider-blocked", companyId));

    expect(degraded).toMatchObject({
      status: 200,
      body: {
        source: "dark-factory-projection",
        truthSource: "dark-factory-journal",
        authoritative: false,
        observationSource: "runtime_observation",
        providerHealth: expect.objectContaining({ providerState: "degraded", breakerState: "half_open" }),
        runtimeImpact: {
          mode: "degraded",
          severity: "warning",
          operatorAction: "retry_or_wait_for_provider_recovery",
          paperclipTerminalState: "unchanged",
          terminalStateAdvanced: false,
        },
      },
    });
    expect(blocked).toMatchObject({
      status: 200,
      body: {
        providerHealth: expect.objectContaining({ providerState: "blocked", breakerState: "open" }),
        runtimeImpact: {
          mode: "blocked",
          severity: "critical",
          operatorAction: "pause_external_execution_and_reconcile_journal",
          paperclipTerminalState: "unchanged",
          terminalStateAdvanced: false,
        },
      },
    });

    for (const response of [degraded, blocked]) {
      const body = (response as ApiResponseBody<ProviderHealthBody>).body;
      expect(body.runtimeImpact.terminalStateAdvanced).toBe(false);
      expect(body.runtimeImpact.paperclipTerminalState).toBe("unchanged");
    }
  });

  it("returns hardened non-authoritative API errors for unknown routes", async () => {
    const companyId = randomUUID();
    const issueId = randomUUID();
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    const response = await plugin.definition.onApiRequest?.(apiInput("unknown-route", issueId, companyId));

    expect(response).toMatchObject({
      status: 404,
      body: {
        error: {
          code: "dark_factory_route_not_found",
          message: "Unknown Dark Factory bridge route",
          routeKey: "unknown-route",
        },
        source: "dark-factory-projection",
        truthSource: "dark-factory-journal",
        authoritative: false,
        terminalStateAdvanced: false,
      },
    });
  });

  it("treats non-object rehydrate request route bodies as receipt-only requests with the default reason", async () => {
    const companyId = randomUUID();
    const issueId = randomUUID();
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    for (const body of ["operator refresh", ["operator refresh"], null]) {
      const response = await plugin.definition.onApiRequest?.(apiInput("rehydrate-request", issueId, companyId, "POST", body));
      const responseBody = (response as ApiResponseBody<RehydrateReceiptBody>).body;

      expect(response).toMatchObject({
        status: 202,
        body: {
          source: "dark-factory-projection",
          truthSource: "dark-factory-journal",
          authoritative: false,
          requestSemantics: "receipt_only_not_terminal_success",
          receipt: {
            status: "requested",
            terminalStateAdvanced: false,
            reason: "operator_requested_projection_refresh",
          },
        },
      });
      expect(responseBody.receipt.terminalStateAdvanced).toBe(false);
      expect(responseBody.requestSemantics).toBe("receipt_only_not_terminal_success");
    }
  });

  it("surfaces stale projection metadata without treating the projection as authoritative", async () => {
    const companyId = randomUUID();
    const issueId = "stale-phase2-issue";
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    const projection = await plugin.definition.onApiRequest?.(apiInput("projection", issueId, companyId));

    expect(projection).toMatchObject({
      status: 200,
      body: {
        source: "dark-factory-projection",
        truthSource: "dark-factory-journal",
        authoritative: false,
        projectionStatus: "stale",
        staleReason: "journal_cursor_lag_detected",
        degradedReason: "projection_lag_exceeds_mock_threshold",
        blockedReason: null,
      },
    });
  });

  it("keeps journal cursor rows unique per company and issue in the plugin namespace migration", async () => {
    const migration = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../migrations/001_dark_factory_projection.sql", import.meta.url), "utf8"));

    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS dark_factory_bridge_poc_journal_cursors_company_issue_unique");
    expect(migration).toContain("ON dark_factory_bridge_poc.journal_cursors (company_id, issue_id)");
  });


  it("uses bounded relative mock timestamps anchored to the current runtime clock", async () => {
    const companyId = randomUUID();
    const issueId = randomUUID();
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    const before = Date.now();
    const summary = await harness.getData<{
      projection: { lastUpdatedAt: string };
      providerHealth: { lastUpdatedAt: string; lastSuccessAt: string | null; lastFailureAt: string | null; cooldownUntil: string | null };
    }>("projection-summary", { companyId, issueId });
    const after = Date.now();
    const lowerBound = before - 2 * 60 * 60_000;
    const upperBound = after + 2 * 60 * 60_000;

    for (const value of [
      summary.projection.lastUpdatedAt,
      summary.providerHealth.lastUpdatedAt,
      summary.providerHealth.lastSuccessAt,
      summary.providerHealth.lastFailureAt,
      summary.providerHealth.cooldownUntil,
    ].filter((value): value is string => value !== null)) {
      const timestamp = Date.parse(value);
      expect(Number.isNaN(timestamp)).toBe(false);
      expect(timestamp).toBeGreaterThanOrEqual(lowerBound);
      expect(timestamp).toBeLessThanOrEqual(upperBound);
    }

    expect(summary.projection.lastUpdatedAt).not.toMatch(/^2026-01-15T/);
  });

  it("keeps migration namespace explicit and forbids authoritative journal or secret storage", async () => {
    const migration = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../migrations/001_dark_factory_projection.sql", import.meta.url), "utf8"));

    expect(migration).toContain("CREATE SCHEMA IF NOT EXISTS dark_factory_bridge_poc");
    expect(migration).toContain("projection/cache/cursor/receipt data");
    expect(migration).toMatch(/CHECK \(authoritative IS false\)/);
    expect(migration).not.toMatch(/\b(api_key|password_hash|access_token|refresh_token|connection_string)\b/i);
  });

  it("documents Phase 2 as a product-branch draft without stale CI or HEAD claims", async () => {
    const draft = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../../../../../docs/dark-factory/DARK_FACTORY_BRIDGE_PHASE2_PR_DRAFT.md", import.meta.url), "utf8"));

    expect(draft).toContain("Branch: dark-factory-product-main");
    expect(draft).toContain("Status: product-branch draft only");
    expect(draft).not.toMatch(/Current remote HEAD/i);
    expect(draft).not.toMatch(/CI passed/i);
    expect(draft).toContain("fork 当前 CI 不可见或未触发");
  });

  it("returns projection summary through getData for dashboard/detail tabs", async () => {
    const companyId = randomUUID();
    const issueId = randomUUID();
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    const summary = await harness.getData<{
      source: string;
      truthSource: string;
      authoritative: boolean;
      disclaimer: string;
      projection: { linkedRunId: string; projectionStatus: string; callbackReceipt: { status: string } };
      providerHealth: { breakerState: string; lastUpdatedAt: string };
    }>("projection-summary", { companyId, issueId });

    expect(summary).toMatchObject({
      source: "dark-factory-projection",
      truthSource: "dark-factory-journal",
      authoritative: false,
      disclaimer: PROJECTION_DISCLAIMER,
      projection: expect.objectContaining({
        linkedRunId: expect.stringMatching(/^df-run-/),
        projectionStatus: expect.any(String),
        callbackReceipt: expect.objectContaining({ status: expect.any(String) }),
      }),
      providerHealth: expect.objectContaining({
        breakerState: expect.any(String),
        lastUpdatedAt: expect.any(String),
      }),
    });
  });

  it("returns remote observability snapshots through getData for settings UI", async () => {
    const companyId = randomUUID();
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    const snapshot = await harness.getData<RemoteObservabilityBody>("remote-observability-snapshot", {
      companyId,
      expectedSequenceNo: 9,
      observations: [
        {
          runtimeMode: "remote",
          operation: "probe",
          status: 200,
          durationMs: 50,
          attempt: 0,
          retryable: false,
          failureClass: "none",
          errorCode: null,
          journalCursor: "dark-factory://journal/settings#4",
          lastSequenceNo: 4,
          terminalStateAdvanced: false,
        },
        {
          runtimeMode: "remote",
          operation: "execute",
          status: 503,
          durationMs: 6200,
          attempt: 1,
          retryable: true,
          failureClass: "transient_provider",
          errorCode: "unavailable",
          journalCursor: "dark-factory://journal/settings#4",
          lastSequenceNo: 4,
          terminalStateAdvanced: false,
        },
      ],
      errorRateWarningThreshold: 0.5,
      latencyWarningThresholdMs: 5000,
      cursorLagWarningThreshold: 5,
    });

    expect(snapshot).toMatchObject({
      source: "dark-factory-projection",
      truthSource: "dark-factory-journal",
      authoritative: false,
      observationSource: "runtime_observation",
      runtimeMode: "remote",
      sampledObservationCount: 2,
      terminalStateAdvanced: false,
      snapshot: {
        requestCount: 2,
        successCount: 1,
        failureCount: 1,
        retryCount: 1,
        retryableFailureCount: 1,
        maxLatencyMs: 6200,
        cursorLag: 5,
        latestErrorCode: "unavailable",
        terminalStateAdvanced: false,
        failureClassCounts: {
          none: 1,
          transient_provider: 1,
        },
      },
      alerts: expect.arrayContaining([
        expect.objectContaining({
          code: "dark_factory_remote_error_rate_high",
          severity: "warning",
          failureClass: "transient_provider",
          terminalStateAdvanced: false,
        }),
        expect.objectContaining({
          code: "dark_factory_remote_latency_high",
          terminalStateAdvanced: false,
        }),
        expect.objectContaining({
          code: "dark_factory_remote_cursor_lag_high",
          terminalStateAdvanced: false,
        }),
      ]),
    });
  });

  it("returns an empty remote observability snapshot before sampled observations exist", async () => {
    const companyId = randomUUID();
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    const snapshot = await harness.getData<RemoteObservabilityBody>("remote-observability-snapshot", {
      companyId,
    });

    expect(snapshot).toMatchObject({
      source: "dark-factory-projection",
      truthSource: "dark-factory-journal",
      authoritative: false,
      sampledObservationCount: 0,
      terminalStateAdvanced: false,
      snapshot: {
        requestCount: 0,
        successCount: 0,
        failureCount: 0,
        cursorLag: null,
        terminalStateAdvanced: false,
      },
      alerts: [],
    });
  });

  it("returns a default closed remote breaker evaluation through getData", async () => {
    const companyId = randomUUID();
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.getData<RemoteBreakerEvaluationBody>("remote-breaker-evaluation", {
      companyId,
      evaluatedAt: "2026-05-02T12:00:00.000Z",
    });

    expect(result).toMatchObject({
      source: "dark-factory-projection",
      truthSource: "dark-factory-journal",
      authoritative: false,
      observationSource: "runtime_observation",
      runtimeMode: "remote",
      breakerState: "closed",
      previousBreakerState: "closed",
      consecutiveFailures: 0,
      consecutiveHalfOpenSuccesses: 0,
      openedAt: null,
      cooldownUntil: null,
      openReason: null,
      lastFailureClass: "none",
      terminalStateAdvanced: false,
      runtimeImpact: {
        mode: "available",
        severity: "info",
        operatorAction: "monitor",
        paperclipTerminalState: "unchanged",
        terminalStateAdvanced: false,
        reason: null,
      },
    });
  });

  it("returns an open remote breaker evaluation from sampled failures through getData", async () => {
    const companyId = randomUUID();
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.getData<RemoteBreakerEvaluationBody>("remote-breaker-evaluation", {
      companyId,
      evaluatedAt: "2026-05-02T12:00:00.000Z",
      failureThreshold: 2,
      cooldownMs: 10_000,
      observations: [
        {
          runtimeMode: "remote",
          operation: "execute",
          status: 503,
          durationMs: 50,
          attempt: 0,
          retryable: true,
          failureClass: "transient_provider",
          errorCode: "bad_gateway",
          journalCursor: "dark-factory://journal/breaker#4",
          lastSequenceNo: 4,
          terminalStateAdvanced: false,
        },
        {
          runtimeMode: "remote",
          operation: "execute",
          status: 503,
          durationMs: 50,
          attempt: 1,
          retryable: true,
          failureClass: "transient_provider",
          errorCode: "unavailable",
          journalCursor: "dark-factory://journal/breaker#4",
          lastSequenceNo: 4,
          terminalStateAdvanced: false,
        },
      ],
    });

    expect(result).toMatchObject({
      source: "dark-factory-projection",
      truthSource: "dark-factory-journal",
      authoritative: false,
      observationSource: "runtime_observation",
      runtimeMode: "remote",
      breakerState: "open",
      previousBreakerState: "closed",
      consecutiveFailures: 2,
      openedAt: "2026-05-02T12:00:00.000Z",
      cooldownUntil: "2026-05-02T12:00:10.000Z",
      openReason: "unavailable",
      lastFailureClass: "transient_provider",
      terminalStateAdvanced: false,
      runtimeImpact: {
        mode: "blocked",
        severity: "critical",
        operatorAction: "pause_external_execution_and_reconcile_journal",
        paperclipTerminalState: "unchanged",
        terminalStateAdvanced: false,
        reason: "unavailable",
      },
    });
  });

  it("returns a blocked remote provider readiness report from missing credentials and sampled failures", async () => {
    const companyId = randomUUID();
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.getData<RemoteProviderReadinessBody>("remote-provider-readiness", {
      companyId,
      checkedAt: "2026-05-02T12:00:00.000Z",
      evaluatedAt: "2026-05-02T12:00:00.000Z",
      failureThreshold: 2,
      config: { mode: "remote", endpoint: "https://dark-factory.example.test" },
      observations: [
        {
          runtimeMode: "remote",
          operation: "execute",
          status: 503,
          durationMs: 50,
          attempt: 0,
          retryable: true,
          failureClass: "transient_provider",
          errorCode: "bad_gateway",
          journalCursor: "dark-factory://journal/readiness#4",
          lastSequenceNo: 4,
          terminalStateAdvanced: false,
        },
        {
          runtimeMode: "remote",
          operation: "execute",
          status: 503,
          durationMs: 50,
          attempt: 1,
          retryable: true,
          failureClass: "transient_provider",
          errorCode: "unavailable",
          journalCursor: "dark-factory://journal/readiness#4",
          lastSequenceNo: 4,
          terminalStateAdvanced: false,
        },
      ],
    });

    expect(result).toMatchObject({
      source: "dark-factory-projection",
      truthSource: "dark-factory-journal",
      authoritative: false,
      observationSource: "runtime_observation",
      runtimeMode: "remote",
      checkedAt: "2026-05-02T12:00:00.000Z",
      readinessStatus: "blocked",
      ready: false,
      nextSafeHook: "onEnvironmentValidateConfig",
      credentialOk: false,
      breakerState: "open",
      sampledObservationCount: 2,
      terminalStateAdvanced: false,
      signals: expect.arrayContaining([
        expect.objectContaining({
          category: "credentials",
          severity: "critical",
          code: "dark_factory_remote_credential_missing",
          terminalStateAdvanced: false,
        }),
        expect.objectContaining({
          category: "breaker",
          severity: "critical",
          code: "dark_factory_remote_breaker_open",
          terminalStateAdvanced: false,
        }),
      ]),
      readinessChecklist: expect.arrayContaining([
        expect.objectContaining({
          category: "credentials",
          status: "fail",
          requiredBefore: "onEnvironmentProbe",
          terminalStateAdvanced: false,
        }),
        expect.objectContaining({
          category: "breaker",
          status: "fail",
          requiredBefore: "onEnvironmentExecute",
          terminalStateAdvanced: false,
        }),
      ]),
    });
  });

  it("returns a ready remote provider readiness report without exposing resolved credential values", async () => {
    const companyId = randomUUID();
    const harness = createTestHarness({ manifest });
    vi.stubEnv("DARK_FACTORY_PLUGIN_SPEC_CREDENTIAL", "plugin-spec-resolved-key");
    await plugin.definition.setup(harness.ctx);

    const result = await harness.getData<RemoteProviderReadinessBody>("remote-provider-readiness", {
      companyId,
      checkedAt: "2026-05-02T12:00:00.000Z",
      config: {
        mode: "remote",
        endpoint: "https://dark-factory.example.test",
        apiKeySecretRef: "env:DARK_FACTORY_PLUGIN_SPEC_CREDENTIAL",
      },
      observations: [
        {
          runtimeMode: "remote",
          operation: "probe",
          status: 200,
          durationMs: 25,
          attempt: 0,
          retryable: false,
          failureClass: "none",
          errorCode: null,
          journalCursor: "dark-factory://journal/readiness#5",
          lastSequenceNo: 5,
          terminalStateAdvanced: false,
        },
      ],
    });

    expect(result).toMatchObject({
      source: "dark-factory-projection",
      truthSource: "dark-factory-journal",
      authoritative: false,
      observationSource: "runtime_observation",
      runtimeMode: "remote",
      readinessStatus: "ready",
      ready: true,
      nextSafeHook: "onEnvironmentExecute",
      credentialOk: true,
      breakerState: "closed",
      sampledObservationCount: 1,
      alertCount: 0,
      terminalStateAdvanced: false,
      readinessChecklist: expect.arrayContaining([
        expect.objectContaining({
          category: "credentials",
          status: "pass",
          terminalStateAdvanced: false,
        }),
        expect.objectContaining({
          category: "journal_boundary",
          status: "pass",
          terminalStateAdvanced: false,
        }),
      ]),
    });
    expect(result.signals.every((signal) => signal.terminalStateAdvanced === false)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("plugin-spec-resolved-key");
  });

  it("returns remote credential diagnostics for missing, unsupported, and unresolved config", async () => {
    const companyId = randomUUID();
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    const notSupplied = await harness.getData<RemoteCredentialDiagnosticsBody>("remote-credential-diagnostics", { companyId });
    const missing = await harness.getData<RemoteCredentialDiagnosticsBody>("remote-credential-diagnostics", {
      companyId,
      config: { mode: "remote", endpoint: "https://dark-factory.example.test" },
    });
    const unsupported = await harness.getData<RemoteCredentialDiagnosticsBody>("remote-credential-diagnostics", {
      companyId,
      config: { mode: "remote", endpoint: "https://dark-factory.example.test", apiKeySecretRef: "secret://dark-factory/api-key" },
    });
    const unresolved = await harness.getData<RemoteCredentialDiagnosticsBody>("remote-credential-diagnostics", {
      companyId,
      config: { mode: "remote", endpoint: "https://dark-factory.example.test", apiKeySecretRef: "env:DARK_FACTORY_PLUGIN_SPEC_MISSING_KEY" },
    });

    expect(notSupplied).toMatchObject({
      source: "dark-factory-projection",
      truthSource: "dark-factory-journal",
      authoritative: false,
      observationSource: "runtime_observation",
      runtimeMode: "remote",
      ok: false,
      credentialSource: null,
      terminalStateAdvanced: false,
      checkedConfig: {
        configSupplied: false,
        endpointPresent: false,
        apiKeyPresent: false,
        apiKeySecretRefPresent: false,
        apiKeySecretRefScheme: "none",
      },
      diagnostics: [
        expect.objectContaining({
          severity: "info",
          code: "dark_factory_remote_credential_config_not_supplied",
          remediation: expect.arrayContaining([
            expect.stringContaining("remote config sample"),
            expect.stringContaining("empty settings surface"),
          ]),
        }),
      ],
    });
    expect(missing).toMatchObject({
      ok: false,
      checkedConfig: {
        configSupplied: true,
        endpointPresent: true,
        apiKeyPresent: false,
        apiKeySecretRefPresent: false,
        apiKeySecretRefScheme: "none",
      },
      diagnostics: [
        expect.objectContaining({
          severity: "error",
          code: "dark_factory_remote_credential_missing",
          remediation: expect.arrayContaining([
            expect.stringContaining("apiKeySecretRef"),
            expect.stringContaining("inline apiKey"),
          ]),
        }),
      ],
    });
    expect(unsupported).toMatchObject({
      ok: false,
      checkedConfig: {
        apiKeySecretRefPresent: true,
        apiKeySecretRefScheme: "unsupported",
      },
      diagnostics: [
        expect.objectContaining({
          code: "dark_factory_remote_credential_ref_unsupported",
          remediation: expect.arrayContaining([
            expect.stringContaining("env:NAME"),
            expect.stringContaining("host-managed secret resolver"),
          ]),
        }),
      ],
    });
    expect(unresolved).toMatchObject({
      ok: false,
      checkedConfig: {
        apiKeySecretRefPresent: true,
        apiKeySecretRefScheme: "env",
      },
      diagnostics: [
        expect.objectContaining({
          code: "dark_factory_remote_credential_unresolved",
          details: {
            mode: "remote",
            apiKeySecretRefScheme: "env",
            envName: "DARK_FACTORY_PLUGIN_SPEC_MISSING_KEY",
          },
          remediation: expect.arrayContaining([
            expect.stringContaining("referenced environment variable"),
            expect.stringContaining("Restart or reload"),
          ]),
        }),
      ],
    });
  });

  it("reports ready remote credential diagnostics without returning resolved env values", async () => {
    const companyId = randomUUID();
    const harness = createTestHarness({ manifest });
    vi.stubEnv("DARK_FACTORY_PLUGIN_SPEC_API_KEY", "plugin-spec-resolved-key");
    await plugin.definition.setup(harness.ctx);

    const result = await harness.getData<RemoteCredentialDiagnosticsBody>("remote-credential-diagnostics", {
      companyId,
      config: {
        mode: "remote",
        endpoint: "https://dark-factory.example.test",
        apiKeySecretRef: "env:DARK_FACTORY_PLUGIN_SPEC_API_KEY",
      },
    });

    expect(result).toMatchObject({
      source: "dark-factory-projection",
      truthSource: "dark-factory-journal",
      authoritative: false,
      observationSource: "runtime_observation",
      runtimeMode: "remote",
      ok: true,
      credentialSource: "env",
      terminalStateAdvanced: false,
      checkedConfig: {
        configSupplied: true,
        endpointPresent: true,
        apiKeyPresent: false,
        apiKeySecretRefPresent: true,
        apiKeySecretRefScheme: "env",
      },
      diagnostics: [
        expect.objectContaining({
          severity: "info",
          code: "dark_factory_remote_credential_ready",
          remediation: expect.arrayContaining([
            expect.stringContaining("No credential remediation"),
            expect.stringContaining("operator-controlled environment"),
          ]),
        }),
      ],
    });
    expect(JSON.stringify(result)).not.toContain("plugin-spec-resolved-key");
  });

  it("request-rehydrate action returns a receipt and does not advance terminal success", async () => {
    const companyId = randomUUID();
    const issueId = randomUUID();
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.performAction<{
      source: string;
      truthSource: string;
      authoritative: boolean;
      receipt: { receiptId: string; status: string; terminalStateAdvanced: boolean };
    }>("request-rehydrate", { companyId, issueId, reason: "operator retry" });

    expect(result).toMatchObject({
      source: "dark-factory-projection",
      truthSource: "dark-factory-journal",
      authoritative: false,
      receipt: {
        receiptId: expect.stringMatching(/^df-rehydrate-/),
        status: "requested",
        terminalStateAdvanced: false,
      },
    });
  });
});
