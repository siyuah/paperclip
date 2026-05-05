import type {
  FetchModelsResult,
  ModelPoolState,
  ProviderConnectionTestResult,
} from "@paperclipai/shared";
import { api } from "./client";

export const modelPoolApi = {
  get: () => api.get<ModelPoolState>("/instance/model-pool"),
  update: (state: ModelPoolState) => api.put<ModelPoolState>("/instance/model-pool", state),
  fetchModels: (providerId: string) =>
    api.post<FetchModelsResult>(
      `/instance/model-pool/providers/${providerId}/fetch-models`,
      {},
    ),
  testConnection: (providerId: string, modelId: string) =>
    api.post<ProviderConnectionTestResult>(
      `/instance/model-pool/providers/${providerId}/test-connection`,
      { modelId },
    ),
};
