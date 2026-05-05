import { useCallback, useSyncExternalStore } from "react";

// ============================================================
// Model configuration center - data model and storage layer
// ============================================================

export interface ModelProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: ModelEntry[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ModelEntry {
  id: string;
  modelId: string;
  displayName: string;
  capabilities: ModelCapability[];
  costTier: "low" | "medium" | "high";
  maxTokens?: number;
  enabled: boolean;
}

export type ModelCapability =
  | "reasoning"
  | "code"
  | "creative"
  | "analysis"
  | "conversation"
  | "vision"
  | "fast";

export interface CeoModelConfig {
  providerId: string;
  modelId: string;
  lockedByUser: true;
}

export interface ModelPoolState {
  providers: ModelProvider[];
  ceoModel: CeoModelConfig | null;
  version: number;
}

export const EMPTY_POOL: ModelPoolState = {
  providers: [],
  ceoModel: null,
  version: 1,
};

const STORAGE_KEY = "paperclip.model-pool";
const MODEL_POOL_EVENT = "paperclip:model-pool-changed";

function cloneEmptyPool(): ModelPoolState {
  return {
    providers: [],
    ceoModel: null,
    version: 1,
  };
}

function normalizePool(input: ModelPoolState): ModelPoolState {
  const providers = Array.isArray(input.providers) ? input.providers : [];
  const ceoModel = input.ceoModel ?? null;

  return {
    providers,
    ceoModel: ceoModel?.providerId && ceoModel.modelId
      ? { providerId: ceoModel.providerId, modelId: ceoModel.modelId, lockedByUser: true }
      : null,
    version: Number.isFinite(input.version) ? input.version : 1,
  };
}

export function loadModelPool(): ModelPoolState {
  if (typeof window === "undefined") return cloneEmptyPool();

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneEmptyPool();
    return normalizePool(JSON.parse(raw) as ModelPoolState);
  } catch {
    return cloneEmptyPool();
  }
}

export function saveModelPool(state: ModelPoolState): void {
  if (typeof window === "undefined") return;

  const nextState = {
    ...state,
    version: state.version + 1,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  window.dispatchEvent(new Event(MODEL_POOL_EVENT));
}

export function uid(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useModelPool(): [ModelPoolState, (updater: ModelPoolState | ((state: ModelPoolState) => ModelPoolState)) => void] {
  const state = useSyncExternalStore(
    subscribeModelPool,
    loadModelPool,
    cloneEmptyPool,
  );

  const setState = useCallback(
    (updater: ModelPoolState | ((state: ModelPoolState) => ModelPoolState)) => {
      const current = loadModelPool();
      const next = typeof updater === "function" ? updater(current) : updater;
      saveModelPool(next);
    },
    [],
  );

  return [state, setState];
}

function subscribeModelPool(onStoreChange: () => void) {
  window.addEventListener(MODEL_POOL_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);

  return () => {
    window.removeEventListener(MODEL_POOL_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

// ============================================================
// Model discovery - GET /v1/models (OpenAI compatible)
// ============================================================

export interface FetchModelsResult {
  models: string[];
  error?: string;
}

export async function fetchModelsFromProvider(
  baseUrl: string,
  apiKey: string,
): Promise<FetchModelsResult> {
  try {
    const url = baseUrl.replace(/\/+$/, "");
    const modelsUrl = url.endsWith("/v1")
      ? `${url}/models`
      : url.includes("/v1/")
        ? `${url.replace(/\/v1\/.*$/, "/v1/models")}`
        : `${url}/v1/models`;

    const resp = await fetch(modelsUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!resp.ok) {
      return { models: [], error: `HTTP ${resp.status}: ${resp.statusText}` };
    }

    const data = await resp.json();
    const models = (data.data ?? [])
      .map((model: { id: string }) => model.id)
      .filter(Boolean)
      .sort();

    return { models };
  } catch (err) {
    return {
      models: [],
      error: err instanceof Error ? err.message : "Failed to fetch model list",
    };
  }
}

// ============================================================
// Connectivity test - POST /v1/chat/completions
// ============================================================

export async function testProviderConnection(
  baseUrl: string,
  apiKey: string,
  modelId: string,
): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const url = baseUrl.replace(/\/+$/, "");
  const chatUrl = url.endsWith("/v1")
    ? `${url}/chat/completions`
    : `${url}/v1/chat/completions`;

  const start = performance.now();
  try {
    const resp = await fetch(chatUrl, {
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
    const latencyMs = Math.round(performance.now() - start);
    return {
      ok: false,
      latencyMs,
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}
