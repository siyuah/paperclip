import { z } from "zod";
import {
  MODEL_CAPABILITIES,
  MODEL_COST_TIERS,
} from "../types/model-pool.js";

export const modelCapabilitySchema = z.enum(MODEL_CAPABILITIES);
export const modelCostTierSchema = z.enum(MODEL_COST_TIERS);

export const modelEntrySchema = z.object({
  id: z.string().min(1),
  modelId: z.string().min(1),
  displayName: z.string().min(1),
  capabilities: z.array(modelCapabilitySchema).default([]),
  costTier: modelCostTierSchema.default("medium"),
  maxTokens: z.number().int().positive().optional(),
  enabled: z.boolean().default(true),
}).strict();

export const ceoModelConfigSchema = z.object({
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  lockedByUser: z.literal(true).default(true),
}).strict();

export const modelProviderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  baseUrl: z.string().min(1),
  apiKey: z.string().optional(),
  apiKeyMasked: z.string().optional().default(""),
  hasApiKey: z.boolean().optional().default(false),
  models: z.array(modelEntrySchema).default([]),
  isActive: z.boolean().default(true),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).strict();

export const modelPoolStateSchema = z.object({
  providers: z.array(modelProviderSchema).default([]),
  ceoModel: ceoModelConfigSchema.nullable().default(null),
  version: z.number().int().positive().default(1),
}).strict();

export const fetchProviderModelsRequestSchema = z.object({}).strict();

export const testProviderConnectionRequestSchema = z.object({
  modelId: z.string().min(1),
}).strict();

export type ModelCapabilityInput = z.infer<typeof modelCapabilitySchema>;
export type ModelEntryInput = z.infer<typeof modelEntrySchema>;
export type ModelProviderInput = z.infer<typeof modelProviderSchema>;
export type ModelPoolStateInput = z.infer<typeof modelPoolStateSchema>;
export type TestProviderConnectionRequest = z.infer<typeof testProviderConnectionRequestSchema>;
