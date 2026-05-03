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

export type RemoteCredentialReferenceScheme =
  | "none"
  | "env"
  | "env_url"
  | "secret_url"
  | "host_secret_url"
  | "unsupported";

export type HostSecretResolverStatus =
  | "not_configured"
  | "inline_credential"
  | "legacy_env_reference"
  | "host_managed_reference"
  | "unsupported_reference";

export type HostSecretResolverContract = ProjectionBoundary & {
  observationSource: typeof RUNTIME_OBSERVATION_SOURCE;
  runtimeMode: "remote";
  resolverKind: "host_managed_secret_reference";
  supportedHostReferenceSchemes: ["secret://", "host-secret://"];
  supportedLegacyReferenceSchemes: ["env:", "env://"];
  resolvedCredentialValuePolicy: "transient_memory_only";
  shouldPersistResolvedCredentialValues: false;
  shouldPrintResolvedCredentialValues: false;
  doesAuthorizeRemoteExecution: false;
  terminalStateAdvanced: false;
};

export type HostSecretResolverEvaluation = ProjectionBoundary & {
  observationSource: typeof RUNTIME_OBSERVATION_SOURCE;
  runtimeMode: "remote";
  resolverKind: "host_managed_secret_reference";
  ok: boolean;
  status: HostSecretResolverStatus;
  credentialSource: "none" | "inline" | "env" | "host_secret_ref";
  apiKeySecretRefScheme: RemoteCredentialReferenceScheme;
  apiKeySecretRefPresent: boolean;
  hostManagedSecretRefPresent: boolean;
  requiresResolvedCredentialForNetworkCall: boolean;
  shouldPersistResolvedCredentialValues: false;
  shouldPrintResolvedCredentialValues: false;
  doesAuthorizeRemoteExecution: false;
  diagnosticCode: string;
  terminalStateAdvanced: false;
};

export function buildHostSecretResolverContract(): HostSecretResolverContract {
  return {
    ...projectionBoundary(),
    observationSource: RUNTIME_OBSERVATION_SOURCE,
    runtimeMode: "remote",
    resolverKind: "host_managed_secret_reference",
    supportedHostReferenceSchemes: ["secret://", "host-secret://"],
    supportedLegacyReferenceSchemes: ["env:", "env://"],
    resolvedCredentialValuePolicy: "transient_memory_only",
    shouldPersistResolvedCredentialValues: false,
    shouldPrintResolvedCredentialValues: false,
    doesAuthorizeRemoteExecution: false,
    terminalStateAdvanced: false,
  };
}

export function evaluateHostSecretResolverConfig(config: Record<string, unknown>): HostSecretResolverEvaluation {
  const apiKey = stringField(config.apiKey);
  const apiKeySecretRef = stringField(config.apiKeySecretRef);
  const scheme = apiKeySecretRefScheme(apiKeySecretRef);
  const hostManagedSecretRefPresent = scheme === "secret_url" || scheme === "host_secret_url";

  if (apiKey) {
    return evaluation({
      ok: true,
      status: "inline_credential",
      credentialSource: "inline",
      apiKeySecretRefScheme: scheme,
      apiKeySecretRefPresent: apiKeySecretRef !== null,
      hostManagedSecretRefPresent,
      requiresResolvedCredentialForNetworkCall: false,
      diagnosticCode: "dark_factory_remote_credential_inline_ready",
    });
  }

  if (!apiKeySecretRef) {
    return evaluation({
      ok: false,
      status: "not_configured",
      credentialSource: "none",
      apiKeySecretRefScheme: "none",
      apiKeySecretRefPresent: false,
      hostManagedSecretRefPresent: false,
      requiresResolvedCredentialForNetworkCall: true,
      diagnosticCode: "dark_factory_remote_credential_missing",
    });
  }

  if (scheme === "env" || scheme === "env_url") {
    return evaluation({
      ok: true,
      status: "legacy_env_reference",
      credentialSource: "env",
      apiKeySecretRefScheme: scheme,
      apiKeySecretRefPresent: true,
      hostManagedSecretRefPresent: false,
      requiresResolvedCredentialForNetworkCall: true,
      diagnosticCode: "dark_factory_remote_credential_env_ref_configured",
    });
  }

  if (hostManagedSecretRefPresent) {
    return evaluation({
      ok: true,
      status: "host_managed_reference",
      credentialSource: "host_secret_ref",
      apiKeySecretRefScheme: scheme,
      apiKeySecretRefPresent: true,
      hostManagedSecretRefPresent: true,
      requiresResolvedCredentialForNetworkCall: true,
      diagnosticCode: "dark_factory_remote_credential_host_secret_ref_ready",
    });
  }

  return evaluation({
    ok: false,
    status: "unsupported_reference",
    credentialSource: "none",
    apiKeySecretRefScheme: "unsupported",
    apiKeySecretRefPresent: true,
    hostManagedSecretRefPresent: false,
    requiresResolvedCredentialForNetworkCall: true,
    diagnosticCode: "dark_factory_remote_credential_ref_unsupported",
  });
}

export function apiKeySecretRefScheme(secretRef: string | null): RemoteCredentialReferenceScheme {
  if (!secretRef) return "none";
  if (secretRef.startsWith("env://")) return "env_url";
  if (secretRef.startsWith("env:")) return "env";
  if (secretRef.startsWith("secret://")) return "secret_url";
  if (secretRef.startsWith("host-secret://")) return "host_secret_url";
  return "unsupported";
}

export function isHostManagedSecretRef(secretRef: string | null): boolean {
  const scheme = apiKeySecretRefScheme(secretRef);
  return scheme === "secret_url" || scheme === "host_secret_url";
}

function evaluation(params: Omit<HostSecretResolverEvaluation, keyof ProjectionBoundary | "observationSource" | "runtimeMode" | "resolverKind" | "shouldPersistResolvedCredentialValues" | "shouldPrintResolvedCredentialValues" | "doesAuthorizeRemoteExecution" | "terminalStateAdvanced">): HostSecretResolverEvaluation {
  return {
    ...projectionBoundary(),
    observationSource: RUNTIME_OBSERVATION_SOURCE,
    runtimeMode: "remote",
    resolverKind: "host_managed_secret_reference",
    shouldPersistResolvedCredentialValues: false,
    shouldPrintResolvedCredentialValues: false,
    doesAuthorizeRemoteExecution: false,
    terminalStateAdvanced: false,
    ...params,
  };
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function projectionBoundary(): ProjectionBoundary {
  return {
    source: DARK_FACTORY_PROJECTION_SOURCE,
    authoritative: PROJECTION_AUTHORITATIVE,
    truthSource: DARK_FACTORY_TRUTH_SOURCE,
  };
}
