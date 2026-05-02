import { describe, expect, it } from "vitest";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

const driverParams = {
  driverKey: "dark-factory-mock",
  companyId: "company-dark-factory",
  environmentId: "env-dark-factory-mock",
  config: { mode: "mock", endpoint: "https://dark-factory.invalid/mock-only" },
};

function expectProjectionBoundary(value: Record<string, unknown> | undefined): void {
  expect(value).toMatchObject({
    source: "dark-factory-projection",
    authoritative: false,
    truthSource: "dark-factory-journal",
  });
}

function collectTerminalStateAdvancedValues(value: unknown, values: unknown[] = []): unknown[] {
  if (!value || typeof value !== "object") return values;

  if ("terminalStateAdvanced" in value) {
    values.push((value as { terminalStateAdvanced: unknown }).terminalStateAdvanced);
  }

  if (Array.isArray(value)) {
    for (const item of value) collectTerminalStateAdvancedValues(item, values);
    return values;
  }

  for (const nestedValue of Object.values(value)) {
    collectTerminalStateAdvancedValues(nestedValue, values);
  }

  return values;
}

describe("Dark Factory environment lifecycle hooks", () => {
  it("declares a mock environment driver in the manifest", () => {
    expect(manifest.capabilities).toContain("environment.drivers.register");
    expect(manifest.environmentDrivers).toEqual([
      expect.objectContaining({
        driverKey: "dark-factory-mock",
        kind: "environment_driver",
        displayName: "Dark Factory Bridge",
        description: expect.stringContaining("HTTP mode"),
        configSchema: expect.objectContaining({
          type: "object",
          properties: expect.objectContaining({
            endpoint: expect.objectContaining({
              description: expect.stringContaining("HTTP endpoint"),
            }),
            mode: expect.objectContaining({
              enum: ["mock", "http"],
            }),
          }),
        }),
      }),
    ]);
    expect(manifest.environmentDrivers?.[0]?.description).toContain("Journal remains truth source");
  });

  it("validates mock mode config and rejects non-mock modes", async () => {
    const ok = await plugin.definition.onEnvironmentValidateConfig?.({
      driverKey: "dark-factory-mock",
      config: { mode: "mock", projectionMode: "deterministic" },
    });
    const rejected = await plugin.definition.onEnvironmentValidateConfig?.({
      driverKey: "dark-factory-mock",
      config: { mode: "live" },
    });

    expect(ok).toMatchObject({
      ok: true,
      normalizedConfig: {
        mode: "mock",
        projectionMode: "deterministic",
      },
    });
    expect(rejected).toEqual({
      ok: false,
      errors: ["Only mock mode is supported in this version"],
    });
  });

  it("validates HTTP mode config without external connectivity", async () => {
    const ok = await plugin.definition.onEnvironmentValidateConfig?.({
      driverKey: "dark-factory-mock",
      config: { mode: "http", endpoint: "http://127.0.0.1:9701", timeoutMs: 2500 },
    });
    const rejected = await plugin.definition.onEnvironmentValidateConfig?.({
      driverKey: "dark-factory-mock",
      config: { mode: "http" },
    });

    expect(ok).toMatchObject({
      ok: true,
      normalizedConfig: {
        mode: "http",
        endpoint: "http://127.0.0.1:9701",
        timeoutMs: 2500,
        requestedBy: "paperclip-dark-factory-bridge",
        workloadClass: "code",
        retryMaxRetries: 3,
        retryBaseDelayMs: 500,
        retryMaxDelayMs: 5000,
        retryableStatuses: [502, 503, 504],
      },
    });
    expect(rejected).toEqual({
      ok: false,
      errors: ["endpoint is required for http mode"],
    });
  });

  it("probes the mock environment without external connectivity", async () => {
    const probe = await plugin.definition.onEnvironmentProbe?.(driverParams);

    expect(probe).toMatchObject({
      ok: true,
      summary: "Dark Factory mock environment ready",
      metadata: {
        observationSource: "runtime_observation",
        terminalStateAdvanced: false,
        runtimeMode: "mock",
      },
    });
    expectProjectionBoundary(probe?.metadata);
  });

  it("acquires a deterministic mock lease with projection boundary metadata", async () => {
    const first = await plugin.definition.onEnvironmentAcquireLease?.({
      ...driverParams,
      runId: "df-run-environment-step-3",
    });
    const second = await plugin.definition.onEnvironmentAcquireLease?.({
      ...driverParams,
      runId: "df-run-environment-step-3",
    });

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      providerLeaseId: "df-lease-df-run-environment-step-3",
      expiresAt: null,
      metadata: {
        runId: "df-run-environment-step-3",
        runtimeMode: "mock",
        terminalStateAdvanced: false,
        journalCursor: expect.objectContaining({
          journalCursor: expect.stringMatching(/^dark-factory:\/\/journal\//),
        }),
        providerHealth: expect.objectContaining({
          authoritative: false,
        }),
      },
    });
    expectProjectionBoundary(first?.metadata);
  });

  it("executes a deterministic mock projection without advancing terminal state", async () => {
    const lease = await plugin.definition.onEnvironmentAcquireLease?.({
      ...driverParams,
      runId: "df-run-environment-step-4",
    });
    expect(lease).toBeDefined();

    const input = {
      ...driverParams,
      lease: lease!,
      command: "dark-factory-mock-execute",
      args: ["projection"],
    };
    const first = await plugin.definition.onEnvironmentExecute?.(input);
    const second = await plugin.definition.onEnvironmentExecute?.(input);

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      exitCode: 0,
      timedOut: false,
      stderr: "",
      metadata: {
        runtimeMode: "mock",
        terminalStateAdvanced: false,
        disclaimer: expect.stringContaining("Journal remains truth source"),
        projection: expect.objectContaining({
          authoritative: false,
          terminalStateAdvanced: false,
        }),
        receipt: expect.objectContaining({
          authoritative: false,
          terminalStateAdvanced: false,
        }),
        cursor: expect.objectContaining({
          authoritative: false,
          journalCursor: expect.stringMatching(/^dark-factory:\/\/journal\//),
        }),
      },
    });
    expectProjectionBoundary(first?.metadata);

    const stdout = JSON.parse(first?.stdout ?? "{}") as Record<string, unknown>;
    expect(stdout).toMatchObject({
      source: "dark-factory-projection",
      truthSource: "dark-factory-journal",
      authoritative: false,
      runtimeMode: "mock",
      terminalStateAdvanced: false,
    });
  });

  it("resumes a deterministic mock lease with projection boundary metadata", async () => {
    const lease = await plugin.definition.onEnvironmentAcquireLease?.({
      ...driverParams,
      runId: "df-run-environment-step-5",
    });
    expect(lease?.providerLeaseId).toBe("df-lease-df-run-environment-step-5");

    const input = {
      ...driverParams,
      providerLeaseId: lease!.providerLeaseId!,
      leaseMetadata: lease!.metadata,
    };
    const first = await plugin.definition.onEnvironmentResumeLease?.(input);
    const second = await plugin.definition.onEnvironmentResumeLease?.(input);

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      providerLeaseId: lease!.providerLeaseId,
      expiresAt: null,
      metadata: {
        runId: "df-run-environment-step-5",
        runtimeMode: "mock",
        resumedLease: true,
        terminalStateAdvanced: false,
        journalCursor: expect.objectContaining({
          authoritative: false,
          journalCursor: expect.stringMatching(/^dark-factory:\/\/journal\//),
        }),
        providerHealth: expect.objectContaining({
          authoritative: false,
        }),
      },
    });
    expectProjectionBoundary(first?.metadata);
  });

  it("releases a mock lease without mutating projection or cursor state", async () => {
    const lease = await plugin.definition.onEnvironmentAcquireLease?.({
      ...driverParams,
      runId: "df-run-environment-release",
    });
    const before = await plugin.definition.onEnvironmentExecute?.({
      ...driverParams,
      lease: lease!,
      command: "dark-factory-mock-execute",
      args: ["before-release"],
    });

    await expect(plugin.definition.onEnvironmentReleaseLease?.({
      ...driverParams,
      providerLeaseId: lease!.providerLeaseId,
      leaseMetadata: lease!.metadata,
    })).resolves.toBeUndefined();

    const after = await plugin.definition.onEnvironmentExecute?.({
      ...driverParams,
      lease: lease!,
      command: "dark-factory-mock-execute",
      args: ["before-release"],
    });

    expect(after?.metadata?.projection).toEqual(before?.metadata?.projection);
    expect(after?.metadata?.cursor).toEqual(before?.metadata?.cursor);
    expect(collectTerminalStateAdvancedValues(after).every((value) => value === false)).toBe(true);
  });

  it("destroys a mock lease without advancing terminal state", async () => {
    const lease = await plugin.definition.onEnvironmentAcquireLease?.({
      ...driverParams,
      runId: "df-run-environment-destroy",
    });

    await expect(plugin.definition.onEnvironmentDestroyLease?.({
      ...driverParams,
      providerLeaseId: lease!.providerLeaseId,
      leaseMetadata: lease!.metadata,
    })).resolves.toBeUndefined();

    const resumed = await plugin.definition.onEnvironmentResumeLease?.({
      ...driverParams,
      providerLeaseId: lease!.providerLeaseId!,
      leaseMetadata: lease!.metadata,
    });

    expect(resumed?.metadata).toMatchObject({
      authoritative: false,
      terminalStateAdvanced: false,
    });
    expect(collectTerminalStateAdvancedValues(resumed).every((value) => value === false)).toBe(true);
  });

  it("runs the full mock lifecycle without claiming authority or terminal state", async () => {
    const validation = await plugin.definition.onEnvironmentValidateConfig?.({
      driverKey: driverParams.driverKey,
      config: driverParams.config,
    });
    const probe = await plugin.definition.onEnvironmentProbe?.(driverParams);
    const lease = await plugin.definition.onEnvironmentAcquireLease?.({
      ...driverParams,
      runId: "df-run-environment-smoke",
    });
    const execution = await plugin.definition.onEnvironmentExecute?.({
      ...driverParams,
      lease: lease!,
      command: "dark-factory-mock-execute",
      args: ["smoke"],
    });

    await expect(plugin.definition.onEnvironmentReleaseLease?.({
      ...driverParams,
      providerLeaseId: lease!.providerLeaseId,
      leaseMetadata: lease!.metadata,
    })).resolves.toBeUndefined();

    expect(validation).toMatchObject({ ok: true });
    expect(probe).toMatchObject({ ok: true });
    expect(lease).toMatchObject({ providerLeaseId: "df-lease-df-run-environment-smoke" });
    expect(execution).toMatchObject({ exitCode: 0, timedOut: false });

    for (const value of [probe?.metadata, lease?.metadata, execution?.metadata]) {
      expectProjectionBoundary(value);
      expect(value?.terminalStateAdvanced).toBe(false);
    }
    expect(execution?.metadata?.disclaimer).toContain("Journal remains truth source");
    expect(collectTerminalStateAdvancedValues([probe, lease, execution]).every((value) => value === false)).toBe(true);
  });
});
