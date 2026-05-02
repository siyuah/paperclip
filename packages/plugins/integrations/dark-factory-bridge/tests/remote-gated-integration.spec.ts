import { describe, expect, it } from "vitest";
import plugin from "../src/worker.js";

const endpoint = process.env.DARK_FACTORY_REMOTE_ENDPOINT;
const apiKey = process.env.DARK_FACTORY_REMOTE_API_KEY;
const runGated = process.env.DARK_FACTORY_REMOTE_INTEGRATION === "1" && endpoint && apiKey;

const maybeDescribe = runGated ? describe : describe.skip;

maybeDescribe("Dark Factory gated remote provider integration", () => {
  it("runs validate, probe, acquire, execute, resume, and release against an operator-provided endpoint", async () => {
    const params = {
      driverKey: "dark-factory-mock",
      companyId: "company-dark-factory",
      environmentId: "env-dark-factory-remote-gated",
      config: {
        mode: "remote",
        endpoint: endpoint!,
        apiKey: apiKey!,
        timeoutMs: 5000,
        retryMaxRetries: 1,
        retryBaseDelayMs: 50,
        retryMaxDelayMs: 100,
        requestedBy: "paperclip-remote-gated-integration",
        workloadClass: "code",
      },
    };

    const validation = await plugin.definition.onEnvironmentValidateConfig?.({
      driverKey: params.driverKey,
      config: params.config,
    });
    expect(validation).toMatchObject({
      ok: true,
      normalizedConfig: {
        mode: "remote",
      },
    });

    const probe = await plugin.definition.onEnvironmentProbe?.(params);
    expect(probe).toMatchObject({
      ok: true,
      metadata: {
        runtimeMode: "remote",
        authoritative: false,
        terminalStateAdvanced: false,
      },
    });

    const runId = `df-run-remote-gated-${Date.now()}`;
    const lease = await plugin.definition.onEnvironmentAcquireLease?.({
      ...params,
      runId,
    });
    expect(lease).toMatchObject({
      providerLeaseId: `df-remote-lease-${runId}`,
      metadata: {
        runId,
        runtimeMode: "remote",
        authoritative: false,
        terminalStateAdvanced: false,
      },
    });

    const execution = await plugin.definition.onEnvironmentExecute?.({
      ...params,
      lease: lease!,
      command: "dark-factory-remote-observe",
      args: ["gated"],
    });
    expect(execution).toMatchObject({
      exitCode: 0,
      timedOut: false,
      metadata: {
        runtimeMode: "remote",
        authoritative: false,
        terminalStateAdvanced: false,
      },
    });

    const resumed = await plugin.definition.onEnvironmentResumeLease?.({
      ...params,
      providerLeaseId: lease!.providerLeaseId!,
      leaseMetadata: lease!.metadata,
    });
    expect(resumed).toMatchObject({
      providerLeaseId: lease!.providerLeaseId,
      metadata: {
        runtimeMode: "remote",
        authoritative: false,
        terminalStateAdvanced: false,
      },
    });

    await expect(plugin.definition.onEnvironmentReleaseLease?.({
      ...params,
      providerLeaseId: lease!.providerLeaseId,
      leaseMetadata: lease!.metadata,
    })).resolves.toBeUndefined();
  }, 20_000);
});
