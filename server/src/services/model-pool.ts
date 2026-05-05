import { randomUUID } from "node:crypto";
import type { Db } from "@paperclipai/db";
import { instanceSettings } from "@paperclipai/db";
import {
  EMPTY_MODEL_POOL,
  MODEL_CAPABILITIES,
  MODEL_COST_TIERS,
  type CeoModelConfig,
  type FetchModelsResult,
  type ModelCapability,
  type ModelCostTier,
  type ModelEntry,
  type ModelPoolState,
  type ModelProvider,
  type ProviderConnectionTestResult,
} from "@paperclipai/shared";
import { eq } from "drizzle-orm";
import { notFound, unprocessable } from "../errors.js";
import { localEncryptedProvider } from "../secrets/local-encrypted-provider.js";
import type { StoredSecretVersionMaterial } from "../secrets/types.js";

const DEFAULT_SINGLETON_KEY = "default";
const MODEL_POOL_ENV_KEYS = [
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_API_BASE",
  "OPENAI_API_BASE_URL",
] as const;

type StoredModelProvider = Omit<ModelProvider, "apiKey" | "apiKeyMasked" | "hasApiKey"> & {
  apiKeyMaterial?: StoredSecretVersionMaterial | null;
  apiKeyFingerprint?: string | null;
  apiKeyHint?: string | null;
};

type StoredModelPoolState = {
  providers: StoredModelProvider[];
  ceoModel: CeoModelConfig | null;
  version: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function uid(value: unknown): string {
  const existing = asString(value).trim();
  return existing || randomUUID();
}

function normalizeCostTier(value: unknown): ModelCostTier {
  return MODEL_COST_TIERS.includes(value as ModelCostTier)
    ? value as ModelCostTier
    : "medium";
}

function normalizeCapability(value: unknown): ModelCapability | null {
  return MODEL_CAPABILITIES.includes(value as ModelCapability)
    ? value as ModelCapability
    : null;
}

function normalizeModelEntry(input: unknown): ModelEntry | null {
  const raw = asRecord(input);
  if (!raw) return null;
  const modelId = asString(raw.modelId).trim();
  if (!modelId) return null;
  const maxTokens =
    typeof raw.maxTokens === "number" && Number.isFinite(raw.maxTokens) && raw.maxTokens > 0
      ? Math.trunc(raw.maxTokens)
      : undefined;
  return {
    id: uid(raw.id),
    modelId,
    displayName: asString(raw.displayName).trim() || modelId,
    capabilities: Array.isArray(raw.capabilities)
      ? raw.capabilities.flatMap((capability) => {
          const normalized = normalizeCapability(capability);
          return normalized ? [normalized] : [];
        })
      : [],
    costTier: normalizeCostTier(raw.costTier),
    ...(maxTokens ? { maxTokens } : {}),
    enabled: asBoolean(raw.enabled, true),
  };
}

function looksLikeSecretMaterial(value: unknown): value is StoredSecretVersionMaterial {
  const record = asRecord(value);
  return Boolean(
    record &&
      record.scheme === "local_encrypted_v1" &&
      typeof record.iv === "string" &&
      typeof record.tag === "string" &&
      typeof record.ciphertext === "string",
  );
}

function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 8) return "***";
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

function publicProvider(provider: StoredModelProvider): ModelProvider {
  return {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    apiKeyMasked: provider.apiKeyHint ?? "",
    hasApiKey: Boolean(provider.apiKeyMaterial),
    models: provider.models,
    isActive: provider.isActive,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  };
}

function normalizeStoredProvider(input: unknown): StoredModelProvider | null {
  const raw = asRecord(input);
  if (!raw) return null;
  const name = asString(raw.name).trim();
  const baseUrl = asString(raw.baseUrl).trim();
  const models = Array.isArray(raw.models)
    ? raw.models.flatMap((model) => {
        const normalized = normalizeModelEntry(model);
        return normalized ? [normalized] : [];
      })
    : [];
  const material = looksLikeSecretMaterial(raw.apiKeyMaterial) ? raw.apiKeyMaterial : null;
  const timestamp = nowIso();
  if (!name && !baseUrl && !material && models.length === 0) return null;
  return {
    id: uid(raw.id),
    name: name || "Unnamed provider",
    baseUrl,
    apiKeyMaterial: material,
    apiKeyFingerprint: asString(raw.apiKeyFingerprint).trim() || null,
    apiKeyHint: asString(raw.apiKeyHint).trim() || null,
    models,
    isActive: asBoolean(raw.isActive, true),
    createdAt: asString(raw.createdAt).trim() || timestamp,
    updatedAt: asString(raw.updatedAt).trim() || timestamp,
  };
}

function normalizeStoredPool(input: unknown): StoredModelPoolState {
  const raw = asRecord(input) ?? {};
  const providers = Array.isArray(raw.providers)
    ? raw.providers.flatMap((provider) => {
        const normalized = normalizeStoredProvider(provider);
        return normalized ? [normalized] : [];
      })
    : [];
  return {
    providers,
    ceoModel: normalizeCeoModel(raw.ceoModel, providers),
    version:
      typeof raw.version === "number" && Number.isFinite(raw.version) && raw.version > 0
        ? Math.trunc(raw.version)
        : EMPTY_MODEL_POOL.version,
  };
}

function normalizeCeoModel(input: unknown, providers: StoredModelProvider[]): CeoModelConfig | null {
  const raw = asRecord(input);
  if (!raw) return null;
  const providerId = asString(raw.providerId).trim();
  const modelId = asString(raw.modelId).trim();
  if (!providerId || !modelId) return null;
  const provider = providers.find((item) => item.id === providerId);
  if (!provider?.isActive) return null;
  const model = provider.models.find((item) => item.modelId === modelId);
  if (!model?.enabled) return null;
  return { providerId, modelId, lockedByUser: true };
}

async function encryptApiKey(apiKey: string) {
  const prepared = await localEncryptedProvider.createVersion({
    value: apiKey,
    externalRef: null,
  });
  return {
    material: prepared.material,
    fingerprint: prepared.valueSha256,
    hint: maskApiKey(apiKey),
  };
}

async function decryptApiKey(provider: StoredModelProvider): Promise<string> {
  if (!provider.apiKeyMaterial) {
    throw unprocessable(`Provider "${provider.name}" does not have an API key`);
  }
  return localEncryptedProvider.resolveVersion({
    material: provider.apiKeyMaterial,
    externalRef: null,
  });
}

async function inputProviderToStored(
  input: ModelProvider,
  existing: StoredModelProvider | null,
): Promise<StoredModelProvider | null> {
  const normalized = normalizeStoredProvider(input);
  if (!normalized) return null;
  const rawApiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  if (rawApiKey) {
    const encrypted = await encryptApiKey(rawApiKey);
    normalized.apiKeyMaterial = encrypted.material;
    normalized.apiKeyFingerprint = encrypted.fingerprint;
    normalized.apiKeyHint = encrypted.hint;
  } else {
    normalized.apiKeyMaterial = existing?.apiKeyMaterial ?? normalized.apiKeyMaterial ?? null;
    normalized.apiKeyFingerprint = existing?.apiKeyFingerprint ?? normalized.apiKeyFingerprint ?? null;
    normalized.apiKeyHint = existing?.apiKeyHint ?? normalized.apiKeyHint ?? null;
  }
  return normalized;
}

function buildModelsUrl(baseUrl: string): string {
  const url = baseUrl.replace(/\/+$/, "");
  if (url.endsWith("/v1")) return `${url}/models`;
  if (url.includes("/v1/")) return url.replace(/\/v1\/.*$/, "/v1/models");
  return `${url}/v1/models`;
}

function buildChatUrl(baseUrl: string): string {
  const url = baseUrl.replace(/\/+$/, "");
  if (url.endsWith("/v1")) return `${url}/chat/completions`;
  if (url.includes("/v1/")) return url.replace(/\/v1\/.*$/, "/v1/chat/completions");
  return `${url}/v1/chat/completions`;
}

function parseOpenAiModelsPayload(payload: unknown): string[] {
  const data = asRecord(payload)?.data;
  if (!Array.isArray(data)) return [];
  return data
    .map((item) => asString(asRecord(item)?.id).trim())
    .filter(Boolean)
    .sort();
}

function clearModelPoolEnv(env: Record<string, unknown>): Record<string, unknown> {
  const next = { ...env };
  for (const key of MODEL_POOL_ENV_KEYS) {
    delete next[key];
  }
  return next;
}

function parseEnv(config: Record<string, unknown>): Record<string, unknown> {
  const env = asRecord(config.env);
  return env ? { ...env } : {};
}

export function modelPoolService(db: Db) {
  async function getOrCreateRow() {
    const existing = await db
      .select()
      .from(instanceSettings)
      .where(eq(instanceSettings.singletonKey, DEFAULT_SINGLETON_KEY))
      .then((rows) => rows[0] ?? null);
    if (existing) return existing;

    const now = new Date();
    const [created] = await db
      .insert(instanceSettings)
      .values({
        singletonKey: DEFAULT_SINGLETON_KEY,
        general: {},
        experimental: {},
        modelPool: {},
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [instanceSettings.singletonKey],
        set: { updatedAt: now },
      })
      .returning();
    if (created) return created;

    const raced = await db
      .select()
      .from(instanceSettings)
      .where(eq(instanceSettings.singletonKey, DEFAULT_SINGLETON_KEY))
      .then((rows) => rows[0] ?? null);
    if (raced) return raced;
    throw new Error("Failed to initialize instance settings row");
  }

  async function getStored(): Promise<StoredModelPoolState> {
    const row = await getOrCreateRow();
    return normalizeStoredPool(row.modelPool);
  }

  async function findProvider(providerId: string): Promise<StoredModelProvider> {
    const stored = await getStored();
    const provider = stored.providers.find((item) => item.id === providerId);
    if (!provider) throw notFound("Model provider not found");
    return provider;
  }

  async function resolveSelection(adapterConfig: Record<string, unknown>) {
    const providerId = asString(adapterConfig.modelPoolProviderId).trim();
    if (!providerId) return null;
    const configuredModelId =
      asString(adapterConfig.modelPoolModelId).trim() ||
      asString(adapterConfig.model).trim();
    if (!configuredModelId) {
      throw unprocessable("Model pool selection is missing a model ID");
    }
    const stored = await getStored();
    const provider = stored.providers.find((item) => item.id === providerId);
    if (!provider) throw unprocessable("Selected model provider no longer exists");
    if (!provider.isActive) throw unprocessable("Selected model provider is disabled");
    const model = provider.models.find((item) => item.modelId === configuredModelId);
    if (!model) throw unprocessable("Selected model no longer exists");
    if (!model.enabled) throw unprocessable("Selected model is disabled");
    const apiKey = await decryptApiKey(provider);
    return { provider, model, apiKey };
  }

  return {
    get: async (): Promise<ModelPoolState> => {
      const stored = await getStored();
      return {
        providers: stored.providers.map(publicProvider),
        ceoModel: stored.ceoModel,
        version: stored.version,
      };
    },

    replace: async (input: ModelPoolState): Promise<ModelPoolState> => {
      const current = await getStored();
      const existingById = new Map(current.providers.map((provider) => [provider.id, provider]));
      const providers: StoredModelProvider[] = [];
      for (const provider of input.providers) {
        const stored = await inputProviderToStored(provider, existingById.get(provider.id) ?? null);
        if (stored) providers.push(stored);
      }
      const nextStored: StoredModelPoolState = {
        providers,
        ceoModel: normalizeCeoModel(input.ceoModel, providers),
        version: current.version + 1,
      };
      const row = await getOrCreateRow();
      await db
        .update(instanceSettings)
        .set({
          modelPool: nextStored as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .where(eq(instanceSettings.id, row.id));
      return {
        providers: nextStored.providers.map(publicProvider),
        ceoModel: nextStored.ceoModel,
        version: nextStored.version,
      };
    },

    fetchModelsFromProvider: async (providerId: string): Promise<FetchModelsResult> => {
      const provider = await findProvider(providerId);
      const apiKey = await decryptApiKey(provider);
      try {
        const resp = await fetch(buildModelsUrl(provider.baseUrl), {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        });
        if (!resp.ok) {
          return { models: [], error: `HTTP ${resp.status}: ${resp.statusText}` };
        }
        return { models: parseOpenAiModelsPayload(await resp.json()) };
      } catch (err) {
        return {
          models: [],
          error: err instanceof Error ? err.message : "Failed to fetch model list",
        };
      }
    },

    testProviderConnection: async (
      providerId: string,
      modelId: string,
    ): Promise<ProviderConnectionTestResult> => {
      const provider = await findProvider(providerId);
      const apiKey = await decryptApiKey(provider);
      const start = performance.now();
      try {
        const resp = await fetch(buildChatUrl(provider.baseUrl), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: modelId,
            messages: [{ role: "user", content: "hi" }],
            max_tokens: 5,
          }),
        });
        const latencyMs = Math.round(performance.now() - start);
        if (!resp.ok) {
          const body = await resp.text().catch(() => "");
          return { ok: false, latencyMs, error: `HTTP ${resp.status}: ${body.slice(0, 200)}` };
        }
        return { ok: true, latencyMs };
      } catch (err) {
        return {
          ok: false,
          latencyMs: Math.round(performance.now() - start),
          error: err instanceof Error ? err.message : "Connection failed",
        };
      }
    },

    materializeAdapterConfig: async (
      adapterConfig: Record<string, unknown>,
    ): Promise<Record<string, unknown>> => {
      const selection = await resolveSelection(adapterConfig);
      if (!selection) return adapterConfig;
      const env = clearModelPoolEnv(parseEnv(adapterConfig));
      return {
        ...adapterConfig,
        model: selection.model.modelId,
        modelPoolProviderName: selection.provider.name,
        modelPoolBaseUrl: selection.provider.baseUrl,
        modelPoolModelId: selection.model.modelId,
        env: {
          ...env,
          OPENAI_API_KEY: selection.apiKey,
          OPENAI_BASE_URL: selection.provider.baseUrl,
          OPENAI_API_BASE: selection.provider.baseUrl,
          OPENAI_API_BASE_URL: selection.provider.baseUrl,
        },
      };
    },
  };
}
