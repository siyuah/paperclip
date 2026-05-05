import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { modelPoolApi } from "@/api/modelPool";
import { queryKeys } from "./queryKeys";

export type {
  CeoModelConfig,
  FetchModelsResult,
  ModelCapability,
  ModelCostTier,
  ModelEntry,
  ModelPoolState,
  ModelProvider,
  ProviderConnectionTestResult,
};

export const EMPTY_POOL = EMPTY_MODEL_POOL;

const STORAGE_KEY = "paperclip:persistent:model-pool";
const LEGACY_STORAGE_KEY = "paperclip.model-pool";
const MODEL_POOL_EVENT = "paperclip:model-pool-changed";

function cloneEmptyPool(): ModelPoolState {
  return {
    providers: [],
    ceoModel: null,
    version: 1,
  };
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
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
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const modelId = normalizeString(raw.modelId).trim();
  if (!modelId) return null;

  const capabilities = Array.isArray(raw.capabilities)
    ? raw.capabilities.flatMap((capability) => {
        const normalized = normalizeCapability(capability);
        return normalized ? [normalized] : [];
      })
    : [];
  const maxTokens =
    typeof raw.maxTokens === "number" && Number.isFinite(raw.maxTokens) && raw.maxTokens > 0
      ? Math.trunc(raw.maxTokens)
      : undefined;

  return {
    id: normalizeString(raw.id) || uid(),
    modelId,
    displayName: normalizeString(raw.displayName) || modelId,
    capabilities,
    costTier: normalizeCostTier(raw.costTier),
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    enabled: normalizeBoolean(raw.enabled, true),
  };
}

function normalizeProvider(input: unknown): ModelProvider | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const id = normalizeString(raw.id) || uid();
  const name = normalizeString(raw.name).trim();
  const baseUrl = normalizeString(raw.baseUrl).trim();
  const apiKey = normalizeString(raw.apiKey);
  const apiKeyMasked = normalizeString(raw.apiKeyMasked);
  const models = Array.isArray(raw.models)
    ? raw.models.flatMap((model) => {
        const normalized = normalizeModelEntry(model);
        return normalized ? [normalized] : [];
      })
    : [];
  const now = new Date().toISOString();
  const hasApiKey = normalizeBoolean(raw.hasApiKey, Boolean(apiKey || apiKeyMasked));

  if (!name && !baseUrl && !apiKey && !apiKeyMasked && models.length === 0) return null;

  return {
    id,
    name: name || "Unnamed provider",
    baseUrl,
    ...(apiKey ? { apiKey } : {}),
    apiKeyMasked: apiKeyMasked || (apiKey ? maskApiKeyValue(apiKey) : ""),
    hasApiKey,
    models,
    isActive: normalizeBoolean(raw.isActive, true),
    createdAt: normalizeString(raw.createdAt) || now,
    updatedAt: normalizeString(raw.updatedAt) || now,
  };
}

function normalizePool(input: unknown): ModelPoolState {
  const raw = input && typeof input === "object"
    ? input as Record<string, unknown>
    : {};
  const providers = Array.isArray(raw.providers)
    ? raw.providers.flatMap((provider) => {
        const normalized = normalizeProvider(provider);
        return normalized ? [normalized] : [];
      })
    : [];
  const ceoModel = raw.ceoModel && typeof raw.ceoModel === "object"
    ? raw.ceoModel as Record<string, unknown>
    : null;

  return {
    providers,
    ceoModel: ceoModel?.providerId && ceoModel.modelId
      ? {
          providerId: normalizeString(ceoModel.providerId),
          modelId: normalizeString(ceoModel.modelId),
          lockedByUser: true,
        }
      : null,
    version: typeof raw.version === "number" && Number.isFinite(raw.version)
      ? raw.version
      : 1,
  };
}

export function loadModelPool(): ModelPoolState {
  if (typeof window === "undefined") return cloneEmptyPool();

  const current = parseStoredModelPool(localStorage.getItem(STORAGE_KEY));
  if (current) return current;

  const legacy = parseStoredModelPool(localStorage.getItem(LEGACY_STORAGE_KEY));
  if (legacy) return legacy;

  return cloneEmptyPool();
}

function parseStoredModelPool(raw: string | null): ModelPoolState | null {
  if (!raw) return null;
  try {
    return normalizePool(JSON.parse(raw) as ModelPoolState);
  } catch {
    return null;
  }
}

export function saveModelPool(state: ModelPoolState): void {
  if (typeof window === "undefined") return;

  const nextState = normalizePool({
    ...state,
    version: state.version + 1,
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  window.dispatchEvent(new Event(MODEL_POOL_EVENT));
}

function clearLocalModelPoolStorage() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  window.dispatchEvent(new Event(MODEL_POOL_EVENT));
}

export function uid(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function maskApiKeyValue(apiKey: string) {
  const trimmed = apiKey.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 8) return "***";
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

export interface ModelPoolOption {
  id: string;
  label: string;
  providerId: string;
  providerName: string;
  baseUrl: string;
  modelId: string;
}

export interface ModelOptionLike {
  id: string;
  label: string;
}

export interface ModelPoolSelection {
  providerId: string;
  providerName: string;
  baseUrl: string;
  modelId: string;
}

export function listEnabledModelPoolOptions(state: ModelPoolState): ModelPoolOption[] {
  return state.providers.flatMap((provider) => {
    if (!provider.isActive) return [];
    return provider.models
      .filter((model) => model.enabled)
      .map((model) => ({
        id: model.modelId,
        label: `${provider.name} / ${model.displayName || model.modelId}`,
        providerId: provider.id,
        providerName: provider.name,
        baseUrl: provider.baseUrl,
        modelId: model.modelId,
      }));
  });
}

export function isModelPoolOption(model: ModelOptionLike): model is ModelPoolOption {
  return (
    "providerId" in model &&
    typeof (model as { providerId?: unknown }).providerId === "string" &&
    "modelId" in model &&
    typeof (model as { modelId?: unknown }).modelId === "string"
  );
}

export function modelPoolOptionKey(option: ModelPoolOption): string {
  return `${option.providerId}:${option.modelId}`;
}

export function modelOptionKey(option: ModelOptionLike): string {
  return isModelPoolOption(option) ? modelPoolOptionKey(option) : option.id;
}

export function modelPoolSelectionFromOption(option: ModelPoolOption): ModelPoolSelection {
  return {
    providerId: option.providerId,
    providerName: option.providerName,
    baseUrl: option.baseUrl,
    modelId: option.modelId,
  };
}

export function isSelectedModelOption(
  option: ModelOptionLike,
  modelId: string,
  providerId?: string,
): boolean {
  if (option.id !== modelId) return false;
  if (!isModelPoolOption(option)) return !providerId;
  return Boolean(providerId) && option.providerId === providerId;
}

export function findModelPoolSelection(
  state: ModelPoolState,
  modelId: string,
  providerId?: string,
): ModelPoolSelection | null {
  const trimmedModelId = modelId.trim();
  const trimmedProviderId = providerId?.trim();
  if (!trimmedModelId || !trimmedProviderId) return null;

  for (const option of listEnabledModelPoolOptions(state)) {
    if (
      option.modelId === trimmedModelId &&
      option.providerId === trimmedProviderId
    ) {
      return modelPoolSelectionFromOption(option);
    }
  }

  return null;
}

export function mergeModelPoolOptions<T extends { id: string; label: string }>(
  models: T[],
  poolOptions: ModelPoolOption[],
): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  const poolModelIds = new Set<string>();

  for (const option of poolOptions) {
    const key = modelPoolOptionKey(option);
    if (seen.has(key)) continue;
    seen.add(key);
    poolModelIds.add(option.id);
    merged.push({ ...option } as unknown as T);
  }

  for (const model of models) {
    if (poolModelIds.has(model.id)) continue;
    if (seen.has(model.id)) continue;
    seen.add(model.id);
    merged.push(model);
  }

  return merged;
}

const MODEL_POOL_ENV_KEYS = [
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_API_BASE",
  "OPENAI_API_BASE_URL",
] as const;

function clearModelPoolEnv<T extends Record<string, unknown> | undefined>(env: T): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(env ?? {}) };
  for (const key of MODEL_POOL_ENV_KEYS) {
    delete next[key];
  }
  return next;
}

export function applyModelPoolSelectionToConfig<T extends {
  model: string;
  envBindings?: Record<string, unknown>;
  modelPoolProviderId?: string;
  modelPoolProviderName?: string;
  modelPoolBaseUrl?: string;
  modelPoolModelId?: string;
}>(
  values: T,
  selection: ModelPoolSelection | null,
): T {
  const envBindings = clearModelPoolEnv(values.envBindings);

  if (!selection) {
    return {
      ...values,
      ...(Object.keys(envBindings).length > 0 ? { envBindings } : { envBindings: {} }),
      modelPoolProviderId: "",
      modelPoolProviderName: "",
      modelPoolBaseUrl: "",
      modelPoolModelId: "",
    };
  }

  return {
    ...values,
    model: selection.modelId,
    modelPoolProviderId: selection.providerId,
    modelPoolProviderName: selection.providerName,
    modelPoolBaseUrl: selection.baseUrl,
    modelPoolModelId: selection.modelId,
    envBindings,
  };
}

export function applyModelPoolSelectionToAdapterConfig(
  adapterConfig: Record<string, unknown>,
  selection: ModelPoolSelection | null,
): Record<string, unknown> {
  const env =
    typeof adapterConfig.env === "object" &&
    adapterConfig.env !== null &&
    !Array.isArray(adapterConfig.env)
      ? { ...(adapterConfig.env as Record<string, unknown>) }
      : {};
  const nextEnv = clearModelPoolEnv(env);

  if (!selection) {
    return {
      ...adapterConfig,
      modelPoolProviderId: undefined,
      modelPoolProviderName: undefined,
      modelPoolBaseUrl: undefined,
      modelPoolModelId: undefined,
      ...(Object.keys(nextEnv).length > 0 ? { env: nextEnv } : { env: undefined }),
    };
  }

  return {
    ...adapterConfig,
    model: selection.modelId,
    modelPoolProviderId: selection.providerId,
    modelPoolProviderName: selection.providerName,
    modelPoolBaseUrl: selection.baseUrl,
    modelPoolModelId: selection.modelId,
    ...(Object.keys(nextEnv).length > 0 ? { env: nextEnv } : { env: undefined }),
  };
}

export function useModelPool(): [
  ModelPoolState,
  (updater: ModelPoolState | ((state: ModelPoolState) => ModelPoolState)) => void,
] {
  const queryClient = useQueryClient();
  const migratedLocalState = useRef(false);
  const localFallback = useRef<ModelPoolState>(loadModelPool());
  const query = useQuery({
    queryKey: queryKeys.instance.modelPool,
    queryFn: modelPoolApi.get,
    initialData: localFallback.current,
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: (state: ModelPoolState) => modelPoolApi.update(normalizePool(state)),
    onSuccess: (serverState) => {
      queryClient.setQueryData(queryKeys.instance.modelPool, normalizePool(serverState));
      clearLocalModelPoolStorage();
    },
    onError: (error) => {
      console.error("Failed to save model pool", error);
    },
  });

  useEffect(() => {
    if (migratedLocalState.current || !query.isFetched) return;
    const serverState = normalizePool(query.data);
    const legacyState = loadModelPool();
    if (serverState.providers.length > 0 || legacyState.providers.length === 0) return;
    migratedLocalState.current = true;
    saveMutation.mutate(legacyState);
  }, [query.data, query.isFetched, saveMutation]);

  const updateState = useCallback(
    (updater: ModelPoolState | ((state: ModelPoolState) => ModelPoolState)) => {
      const current = normalizePool(
        queryClient.getQueryData<ModelPoolState>(queryKeys.instance.modelPool) ?? query.data ?? EMPTY_MODEL_POOL,
      );
      const next = normalizePool(typeof updater === "function" ? updater(current) : updater);
      queryClient.setQueryData(queryKeys.instance.modelPool, next);
      saveMutation.mutate(next);
    },
    [query.data, queryClient, saveMutation],
  );

  return [normalizePool(query.data), updateState];
}

export async function fetchModelsFromProvider(providerId: string): Promise<FetchModelsResult> {
  return modelPoolApi.fetchModels(providerId);
}

export async function testProviderConnection(
  providerId: string,
  modelId: string,
): Promise<ProviderConnectionTestResult> {
  return modelPoolApi.testConnection(providerId, modelId);
}
