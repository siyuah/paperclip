import { describe, expect, it } from "vitest";
import {
  FIXTURE_DUPLICATE,
  FIXTURE_GAP_SEQUENCE,
  FIXTURE_NORMAL_SEQUENCE,
  FIXTURE_OUT_OF_ORDER,
  JournalReceiptSimulator,
  simulateCallbackSequence,
} from "../src/journal-receipt-simulator.js";
import plugin from "../src/worker.js";

const driverParams = {
  driverKey: "dark-factory-mock",
  companyId: "company-dark-factory",
  environmentId: "env-dark-factory-smoke",
  config: { mode: "mock", endpoint: "https://dark-factory.invalid/mock-only" },
};

function apiInput(routeKey: string, issueId: string, body: unknown = undefined, headers: Record<string, string> = {}) {
  return {
    routeKey,
    method: routeKey === "rehydrate-request" ? "POST" : "GET",
    path: `/issues/${issueId}/dark-factory/${routeKey}`,
    params: { issueId },
    query: {},
    body,
    actor: {
      actorType: "user" as const,
      actorId: "user-smoke",
      userId: "user-smoke",
    },
    companyId: driverParams.companyId,
    headers,
  };
}

function expectProjectionBoundary(value: Record<string, unknown> | undefined): void {
  expect(value).toMatchObject({
    source: "dark-factory-projection",
    authoritative: false,
    truthSource: "dark-factory-journal",
  });
}

function collectFieldValues(fieldName: string, value: unknown, values: unknown[] = []): unknown[] {
  if (!value || typeof value !== "object") return values;

  if (fieldName in value) {
    values.push((value as Record<string, unknown>)[fieldName]);
  }

  if (Array.isArray(value)) {
    for (const item of value) collectFieldValues(fieldName, item, values);
    return values;
  }

  for (const nestedValue of Object.values(value)) {
    collectFieldValues(fieldName, nestedValue, values);
  }

  return values;
}

function expectAllTerminalStateUnchanged(value: unknown): void {
  const values = collectFieldValues("terminalStateAdvanced", value);
  expect(values.length).toBeGreaterThan(0);
  expect(values.every((fieldValue) => fieldValue === false)).toBe(true);
}

function expectAllNonAuthoritative(value: unknown): void {
  const values = collectFieldValues("authoritative", value);
  expect(values.length).toBeGreaterThan(0);
  expect(values.every((fieldValue) => fieldValue === false)).toBe(true);
}

describe("Dark Factory bridge smoke harness", () => {
  it("runs the full happy path across API routes, environment hooks, and journal simulator", async () => {
    const issueId = "df-smoke-happy";
    const validation = await plugin.definition.onEnvironmentValidateConfig?.({
      driverKey: driverParams.driverKey,
      config: driverParams.config,
    });
    const probe = await plugin.definition.onEnvironmentProbe?.(driverParams);
    const lease = await plugin.definition.onEnvironmentAcquireLease?.({
      ...driverParams,
      runId: issueId,
    });
    const execution = await plugin.definition.onEnvironmentExecute?.({
      ...driverParams,
      lease: lease!,
      command: "dark-factory-mock-execute",
      args: ["smoke", "happy"],
    });
    const projectionResponse = await plugin.definition.onApiRequest?.(apiInput("projection", issueId));
    const cursorResponse = await plugin.definition.onApiRequest?.(apiInput("journal-cursor", issueId));
    const providerHealthResponse = await plugin.definition.onApiRequest?.(apiInput("provider-health", issueId));
    const runtimeSnapshotResponse = await plugin.definition.onApiRequest?.(apiInput("runtime-capability-snapshot", issueId));
    const rehydrateResponse = await plugin.definition.onApiRequest?.(
      apiInput("rehydrate-request", issueId, {
        reason: "smoke_harness_projection_refresh",
        idempotencyKey: "smoke-happy-rehydrate",
      }),
    );
    const journalSimulation = simulateCallbackSequence(FIXTURE_NORMAL_SEQUENCE(issueId));

    await expect(plugin.definition.onEnvironmentReleaseLease?.({
      ...driverParams,
      providerLeaseId: lease!.providerLeaseId,
      leaseMetadata: lease!.metadata,
    })).resolves.toBeUndefined();

    expect(validation).toMatchObject({ ok: true });
    expect(probe).toMatchObject({ ok: true });
    expect(lease).toMatchObject({
      providerLeaseId: "df-lease-df-smoke-happy",
      metadata: { runId: issueId, runtimeMode: "mock" },
    });
    expect(execution).toMatchObject({
      exitCode: 0,
      timedOut: false,
      stderr: "",
      metadata: {
        runtimeMode: "mock",
        disclaimer: expect.stringContaining("Journal remains truth source"),
        receipt: expect.objectContaining({
          requestSemantics: "receipt_only_not_terminal_success",
          doesClaimTerminalSuccess: false,
        }),
      },
    });
    expect(JSON.parse(execution?.stdout ?? "{}")).toMatchObject({
      source: "dark-factory-projection",
      authoritative: false,
      truthSource: "dark-factory-journal",
      terminalStateAdvanced: false,
    });

    expect(projectionResponse).toMatchObject({ status: 200, body: { issueId } });
    expect(cursorResponse).toMatchObject({ status: 200, body: { cursor: expect.objectContaining({ authoritative: false }) } });
    expect(providerHealthResponse).toMatchObject({ status: 200, body: { observationSource: "runtime_observation" } });
    expect(runtimeSnapshotResponse).toMatchObject({ status: 200, body: { disclaimer: expect.stringContaining("Journal remains truth source") } });
    expect(rehydrateResponse).toMatchObject({
      status: 202,
      body: {
        requestKind: "rehydrate_projection",
        doesClaimTerminalSuccess: false,
        idempotency: { idempotencyKey: "smoke-happy-rehydrate", stableReceipt: true },
      },
    });
    expect(journalSimulation).toMatchObject({
      replayStatus: "current",
      staleReason: null,
      receipts: expect.arrayContaining([
        expect.objectContaining({
          requestSemantics: "receipt_only_not_terminal_success",
        }),
      ]),
    });

    for (const value of [
      probe?.metadata,
      lease?.metadata,
      execution?.metadata,
      projectionResponse?.body as Record<string, unknown>,
      cursorResponse?.body as Record<string, unknown>,
      providerHealthResponse?.body as Record<string, unknown>,
      runtimeSnapshotResponse?.body as Record<string, unknown>,
      rehydrateResponse?.body as Record<string, unknown>,
      journalSimulation,
    ]) {
      expectProjectionBoundary(value);
    }
    expectAllNonAuthoritative([
      probe,
      lease,
      execution,
      projectionResponse,
      cursorResponse,
      providerHealthResponse,
      runtimeSnapshotResponse,
      rehydrateResponse,
      journalSimulation,
    ]);
    expectAllTerminalStateUnchanged([
      probe,
      lease,
      execution,
      projectionResponse,
      cursorResponse,
      providerHealthResponse,
      runtimeSnapshotResponse,
      rehydrateResponse,
      journalSimulation,
    ]);
  });

  it("keeps lifecycle execution deterministic while simulator receipts remain stable", async () => {
    const issueId = "df-smoke-deterministic";
    const lease = await plugin.definition.onEnvironmentAcquireLease?.({
      ...driverParams,
      runId: issueId,
    });
    const executionInput = {
      ...driverParams,
      lease: lease!,
      command: "dark-factory-mock-execute",
      args: ["same", "request"],
    };
    const firstExecution = await plugin.definition.onEnvironmentExecute?.(executionInput);
    const secondExecution = await plugin.definition.onEnvironmentExecute?.(executionInput);
    const firstSimulation = simulateCallbackSequence(FIXTURE_NORMAL_SEQUENCE(issueId));
    const secondSimulation = simulateCallbackSequence(FIXTURE_NORMAL_SEQUENCE(issueId));

    expect(secondExecution).toEqual(firstExecution);
    expect(secondSimulation).toEqual(firstSimulation);
    expect(secondExecution?.metadata?.receipt).toEqual(firstExecution?.metadata?.receipt);
    expect(secondSimulation.receipts.map((receipt) => receipt.receiptId)).toEqual(firstSimulation.receipts.map((receipt) => receipt.receiptId));
    expectAllTerminalStateUnchanged([firstExecution, secondExecution, firstSimulation, secondSimulation]);
  });

  it("surfaces journal anomaly fixtures without giving Paperclip terminal authority", async () => {
    const issueId = "df-smoke-anomaly";
    const gap = simulateCallbackSequence(FIXTURE_GAP_SEQUENCE(`${issueId}-gap`));
    const outOfOrder = simulateCallbackSequence(FIXTURE_OUT_OF_ORDER(`${issueId}-order`));
    const duplicate = simulateCallbackSequence(FIXTURE_DUPLICATE(`${issueId}-duplicate`));
    const projectionResponse = await plugin.definition.onApiRequest?.(apiInput("projection", issueId));

    expect(gap).toMatchObject({
      replayStatus: "stale",
      staleReason: "journal_sequence_gap_detected",
    });
    expect(outOfOrder).toMatchObject({
      replayStatus: "blocked",
      staleReason: "journal_sequence_out_of_order",
    });
    expect(duplicate).toMatchObject({
      replayStatus: "degraded",
      staleReason: "journal_sequence_duplicate",
    });
    expect(projectionResponse).toMatchObject({
      status: 200,
      body: {
        issueId,
        authoritative: false,
        terminalStateAdvanced: false,
      },
    });
    expectAllNonAuthoritative([gap, outOfOrder, duplicate, projectionResponse]);
    expectAllTerminalStateUnchanged([gap, outOfOrder, duplicate, projectionResponse]);
  });

  it("resumes, releases, destroys, and still serves projection-only API state", async () => {
    const issueId = "df-smoke-lifecycle";
    const lease = await plugin.definition.onEnvironmentAcquireLease?.({
      ...driverParams,
      runId: issueId,
    });
    const resumed = await plugin.definition.onEnvironmentResumeLease?.({
      ...driverParams,
      providerLeaseId: lease!.providerLeaseId!,
      leaseMetadata: lease!.metadata,
    });

    await expect(plugin.definition.onEnvironmentReleaseLease?.({
      ...driverParams,
      providerLeaseId: lease!.providerLeaseId,
      leaseMetadata: lease!.metadata,
    })).resolves.toBeUndefined();
    await expect(plugin.definition.onEnvironmentDestroyLease?.({
      ...driverParams,
      providerLeaseId: lease!.providerLeaseId,
      leaseMetadata: lease!.metadata,
    })).resolves.toBeUndefined();

    const projectionResponse = await plugin.definition.onApiRequest?.(apiInput("projection", issueId));
    const simulator = new JournalReceiptSimulator(issueId);
    const replayAfterDestroy = simulator.simulate(simulator.normal());

    expect(resumed).toMatchObject({
      providerLeaseId: lease!.providerLeaseId,
      metadata: {
        runId: issueId,
        resumedLease: true,
        terminalStateAdvanced: false,
      },
    });
    expect(projectionResponse).toMatchObject({
      status: 200,
      body: {
        issueId,
        authoritative: false,
        terminalStateAdvanced: false,
      },
    });
    expect(replayAfterDestroy).toMatchObject({
      replayStatus: "current",
      terminalStateAdvanced: false,
    });
    expectAllTerminalStateUnchanged([resumed, projectionResponse, replayAfterDestroy]);
  });

  it("rejects non-mock config and unknown API routes without external side effects", async () => {
    const rejected = await plugin.definition.onEnvironmentValidateConfig?.({
      driverKey: driverParams.driverKey,
      config: { mode: "live" },
    });
    const unknownRoute = await plugin.definition.onApiRequest?.(apiInput("unknown-route", "df-smoke-unknown"));

    expect(rejected).toEqual({
      ok: false,
      errors: ["Only mock mode is supported in this version"],
    });
    expect(unknownRoute).toMatchObject({
      status: 404,
      body: {
        error: { code: "dark_factory_route_not_found" },
        source: "dark-factory-projection",
        authoritative: false,
        truthSource: "dark-factory-journal",
        terminalStateAdvanced: false,
      },
    });
  });
});
