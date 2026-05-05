export const MODEL_CAPABILITIES = [
  "reasoning",
  "code",
  "creative",
  "analysis",
  "conversation",
  "vision",
  "fast",
] as const;

export const MODEL_COST_TIERS = ["low", "medium", "high"] as const;

export type ModelCapability = (typeof MODEL_CAPABILITIES)[number];
export type ModelCostTier = (typeof MODEL_COST_TIERS)[number];

export interface ModelEntry {
  id: string;
  modelId: string;
  displayName: string;
  capabilities: ModelCapability[];
  costTier: ModelCostTier;
  maxTokens?: number;
  enabled: boolean;
}

export interface ModelProvider {
  id: string;
  name: string;
  baseUrl: string;
  /**
   * Write-only input used when saving/importing providers. API responses never
   * include the raw value.
   */
  apiKey?: string;
  apiKeyMasked: string;
  hasApiKey: boolean;
  models: ModelEntry[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

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

export interface FetchModelsResult {
  models: string[];
  error?: string;
}

export interface ProviderConnectionTestResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export const EMPTY_MODEL_POOL: ModelPoolState = {
  providers: [],
  ceoModel: null,
  version: 1,
};
