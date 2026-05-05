// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import {
  loadModelPool,
  listEnabledModelPoolOptions,
  saveModelPool,
  type ModelPoolState,
} from "./model-pool";

const STORAGE_KEY = "paperclip:persistent:model-pool";
const LEGACY_STORAGE_KEY = "paperclip.model-pool";

afterEach(() => {
  localStorage.clear();
});

describe("model pool storage", () => {
  it("falls back to an empty pool when local storage contains invalid JSON", () => {
    localStorage.setItem(STORAGE_KEY, "{bad");

    expect(loadModelPool()).toEqual({
      providers: [],
      ceoModel: null,
      version: 1,
    });
  });

  it("normalizes malformed stored provider and model data", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        providers: [
          null,
          {
            id: 123,
            name: 456,
            baseUrl: false,
            apiKey: null,
            models: null,
            isActive: "yes",
          },
          {
            id: "relay-1",
            name: "Relay",
            baseUrl: "https://relay.example.com/v1",
            apiKey: "sk-test",
            models: [
              null,
              "bad",
              { modelId: "", capabilities: ["code"] },
              {
                modelId: "gpt-test",
                displayName: 123,
                capabilities: ["code", "unknown"],
                costTier: "wild",
                enabled: "yes",
              },
            ],
            isActive: true,
          },
        ],
        ceoModel: {
          providerId: "relay-1",
          modelId: "gpt-test",
          lockedByUser: false,
        },
        version: "bad",
      }),
    );

    const state = loadModelPool();
    expect(state.version).toBe(1);
    expect(state.ceoModel).toEqual({
      providerId: "relay-1",
      modelId: "gpt-test",
      lockedByUser: true,
    });
    expect(state.providers).toHaveLength(1);
    expect(state.providers[0]?.models).toEqual([
      {
        id: expect.any(String),
        modelId: "gpt-test",
        displayName: "gpt-test",
        capabilities: ["code"],
        costTier: "medium",
        enabled: true,
      },
    ]);
    expect(listEnabledModelPoolOptions(state)).toEqual([
      {
        id: "gpt-test",
        label: "Relay / gpt-test",
        providerId: "relay-1",
        providerName: "Relay",
        baseUrl: "https://relay.example.com/v1",
        modelId: "gpt-test",
      },
    ]);
  });

  it("saves a cloned state with an incremented version", () => {
    const state: ModelPoolState = {
      providers: [],
      ceoModel: null,
      version: 4,
    };

    saveModelPool(state);

    expect(state.version).toBe(4);
    expect(loadModelPool().version).toBe(5);
  });

  it("migrates existing legacy model pool data into the persistent key", () => {
    localStorage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify({
        providers: [
          {
            id: "relay-legacy",
            name: "Legacy Relay",
            baseUrl: "https://legacy.example.com/v1",
            apiKey: "sk-legacy",
            models: [
              {
                id: "model-legacy",
                modelId: "legacy-model",
                displayName: "Legacy Model",
                capabilities: ["reasoning"],
                costTier: "high",
                enabled: true,
              },
            ],
            isActive: true,
            createdAt: "2026-05-05T00:00:00.000Z",
            updatedAt: "2026-05-05T00:00:00.000Z",
          },
        ],
        ceoModel: {
          providerId: "relay-legacy",
          modelId: "legacy-model",
          lockedByUser: true,
        },
        version: 7,
      }),
    );

    const state = loadModelPool();

    expect(state.providers[0]?.id).toBe("relay-legacy");
    expect(state.ceoModel?.modelId).toBe("legacy-model");
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
