import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import {
  apiKeySecretRefScheme,
  buildHostSecretResolverContract,
  evaluateHostSecretResolverConfig,
} from "../src/remote-provider-host-secret-resolver.js";

describe("remote provider host secret resolver contract", () => {
  it("declares host-managed resolver boundaries without resolving credential values", () => {
    expect(buildHostSecretResolverContract()).toMatchObject({
      source: "dark-factory-projection",
      truthSource: "dark-factory-journal",
      authoritative: false,
      observationSource: "runtime_observation",
      runtimeMode: "remote",
      resolverKind: "host_managed_secret_reference",
      supportedHostReferenceSchemes: ["secret://", "host-secret://"],
      supportedLegacyReferenceSchemes: ["env:", "env://"],
      resolvedCredentialValuePolicy: "transient_memory_only",
      shouldPersistResolvedCredentialValues: false,
      shouldPrintResolvedCredentialValues: false,
      doesAuthorizeRemoteExecution: false,
      terminalStateAdvanced: false,
    });
  });

  it("classifies host-managed references as ready for readiness without authorizing network execution", () => {
    const result = evaluateHostSecretResolverConfig({
      mode: "remote",
      endpoint: "https://dark-factory.example.test",
      apiKeySecretRef: "secret://dark-factory/api-key",
    });

    expect(result).toMatchObject({
      ok: true,
      status: "host_managed_reference",
      credentialSource: "host_secret_ref",
      apiKeySecretRefScheme: "secret_url",
      apiKeySecretRefPresent: true,
      hostManagedSecretRefPresent: true,
      requiresResolvedCredentialForNetworkCall: true,
      shouldPersistResolvedCredentialValues: false,
      shouldPrintResolvedCredentialValues: false,
      doesAuthorizeRemoteExecution: false,
      diagnosticCode: "dark_factory_remote_credential_host_secret_ref_ready",
      terminalStateAdvanced: false,
    });
  });

  it("keeps legacy env references and unsupported references explicit", () => {
    expect(apiKeySecretRefScheme("env:DARK_FACTORY_REMOTE_API_KEY")).toBe("env");
    expect(apiKeySecretRefScheme("env://DARK_FACTORY_REMOTE_API_KEY")).toBe("env_url");
    expect(apiKeySecretRefScheme("secret://dark-factory/api-key")).toBe("secret_url");
    expect(apiKeySecretRefScheme("host-secret://dark-factory/api-key")).toBe("host_secret_url");
    expect(apiKeySecretRefScheme("vault://dark-factory/api-key")).toBe("unsupported");

    expect(evaluateHostSecretResolverConfig({
      apiKeySecretRef: "env:DARK_FACTORY_REMOTE_API_KEY",
    })).toMatchObject({
      ok: true,
      status: "legacy_env_reference",
      credentialSource: "env",
      hostManagedSecretRefPresent: false,
    });

    expect(evaluateHostSecretResolverConfig({
      apiKeySecretRef: "vault://dark-factory/api-key",
    })).toMatchObject({
      ok: false,
      status: "unsupported_reference",
      credentialSource: "none",
      diagnosticCode: "dark_factory_remote_credential_ref_unsupported",
    });
  });

  it("exposes the contract through plugin data", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    const contract = await harness.getData<ReturnType<typeof buildHostSecretResolverContract>>(
      "remote-provider-host-secret-resolver-contract",
      { companyId: "company-resolver-contract" },
    );

    expect(contract).toEqual(buildHostSecretResolverContract());
    expect(JSON.stringify(contract)).not.toContain("resolved-key");
  });
});
