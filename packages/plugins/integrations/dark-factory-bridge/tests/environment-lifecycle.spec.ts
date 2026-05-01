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

describe("Dark Factory environment lifecycle hooks", () => {
  it("declares a mock environment driver in the manifest", () => {
    expect(manifest.capabilities).toContain("environment.drivers.register");
    expect(manifest.environmentDrivers).toEqual([
      expect.objectContaining({
        driverKey: "dark-factory-mock",
        kind: "environment_driver",
        displayName: "Dark Factory Mock",
        description: expect.stringContaining("mock-only"),
        configSchema: expect.objectContaining({
          type: "object",
          properties: expect.objectContaining({
            endpoint: expect.objectContaining({
              description: expect.stringContaining("mock-only"),
            }),
            mode: expect.objectContaining({
              enum: ["mock"],
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
});
