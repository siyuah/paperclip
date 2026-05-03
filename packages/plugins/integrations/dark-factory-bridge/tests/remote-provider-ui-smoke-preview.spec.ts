import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import {
  buildAllUiSmokePreviews,
  buildUiSmokePreview,
  UI_SMOKE_PREVIEW_SCENARIOS,
  type UiSmokePreview,
} from "../src/remote-provider-ui-smoke-preview.js";

function collectFieldValues(fieldName: string, value: unknown, values: unknown[] = []): unknown[] {
  if (!value || typeof value !== "object") return values;

  if (fieldName in value) {
    values.push((value as Record<string, unknown>)[fieldName]);
  }

  if (Array.isArray(value)) {
    for (const item of value) collectFieldValues(fieldName, item, values);
    return values;
  }

  for (const nestedValue of Object.values(value)) {
    collectFieldValues(fieldName, nestedValue, values);
  }

  return values;
}

function expectAllTerminalStateUnchanged(value: unknown): void {
  const values = collectFieldValues("terminalStateAdvanced", value);
  expect(values.length).toBeGreaterThan(0);
  expect(values.every((fieldValue) => fieldValue === false)).toBe(true);
}

function expectAllNonAuthoritative(value: unknown): void {
  const values = collectFieldValues("authoritative", value);
  expect(values.length).toBeGreaterThan(0);
  expect(values.every((fieldValue) => fieldValue === false)).toBe(true);
}

describe("remote provider UI smoke preview harness", () => {
  it("builds deterministic UI previews for every host observation scenario", () => {
    const first = buildAllUiSmokePreviews();
    const second = buildAllUiSmokePreviews();

    expect(first).toEqual(second);
    expect(first.map((preview) => preview.scenario)).toEqual(UI_SMOKE_PREVIEW_SCENARIOS);
    for (const preview of first) {
      expect(preview).toMatchObject({
        source: "dark-factory-projection",
        authoritative: false,
        truthSource: "dark-factory-journal",
        observationSource: "runtime_observation",
        runtimeMode: "remote",
        hostContextId: `df-host-context-${preview.scenario}`,
        terminalStateAdvanced: false,
      });
      expect(preview.uiBadges).toContain("journal-truth-source");
      expect(preview.dryRunGuards).toHaveLength(4);
      expect(preview.dryRunGuards.map((guard) => guard.targetHook)).toEqual([
        "onEnvironmentValidateConfig",
        "onEnvironmentProbe",
        "onEnvironmentAcquireLease",
        "onEnvironmentExecute",
      ]);
      expect(preview.dryRunGuards.every((guard) => guard.dryRunOnly === true)).toBe(true);
      expect(preview.dryRunGuards.every((guard) => guard.shouldContactRemoteProvider === false)).toBe(true);
      expect(preview.dryRunGuards.every((guard) => guard.doesAuthorizeRemoteExecution === false)).toBe(true);
      expectAllNonAuthoritative(preview);
      expectAllTerminalStateUnchanged(preview);
    }
  });

  it("previews healthy readiness as ready with execute allowed", () => {
    const preview = buildUiSmokePreview("healthy");

    expect(preview).toMatchObject({
      scenario: "healthy",
      previewStatus: "ready",
      readiness: {
        readinessStatus: "ready",
        ready: true,
        nextSafeHook: "onEnvironmentExecute",
        credentialOk: true,
        breakerState: "closed",
        terminalStateAdvanced: false,
      },
      observability: {
        sampledObservationCount: 3,
        snapshot: {
          requestCount: 3,
          successCount: 3,
          failureCount: 0,
          cursorLag: 0,
        },
        alerts: [],
      },
      breakerEvaluation: {
        breakerState: "closed",
      },
    });
    expect(preview.uiBadges).toEqual(expect.arrayContaining([
      "ready",
      "next:onEnvironmentExecute",
      "breaker:closed",
      "alerts:0",
      "execute-allowed",
    ]));
    expect(preview.dryRunGuards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        targetHook: "onEnvironmentExecute",
        decision: "allowed",
        matchedPreflightStatus: "allowed",
        blockingCodes: [],
        receiptId: expect.stringMatching(/^df-remote-dry-run-[0-9a-f]{8}$/),
      }),
    ]));
  });

  it("previews latency warnings as needs_attention with execute blocked for review", () => {
    const preview = buildUiSmokePreview("warning_latency");

    expect(preview).toMatchObject({
      scenario: "warning_latency",
      previewStatus: "needs_attention",
      readiness: {
        readinessStatus: "needs_attention",
        ready: false,
        nextSafeHook: "onEnvironmentProbe",
      },
      observability: {
        sampledObservationCount: 2,
        snapshot: {
          maxLatencyMs: 6200,
          failureCount: 0,
        },
        alerts: [
          expect.objectContaining({
            code: "dark_factory_remote_latency_high",
            severity: "warning",
            terminalStateAdvanced: false,
          }),
        ],
      },
    });
    expect(preview.readiness.preflightPlan).toEqual(expect.arrayContaining([
      expect.objectContaining({
        hook: "onEnvironmentExecute",
        status: "blocked",
        blockingCodes: expect.arrayContaining(["dark_factory_remote_latency_high"]),
      }),
    ]));
    expect(preview.dryRunGuards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        targetHook: "onEnvironmentExecute",
        decision: "blocked",
        matchedPreflightStatus: "blocked",
        blockingCodes: expect.arrayContaining(["dark_factory_remote_latency_high"]),
      }),
    ]));
    expect(preview.uiBadges).toContain("dark_factory_remote_latency_high");
  });

  it("previews blocked failures as blocked with an open breaker", () => {
    const preview = buildUiSmokePreview("blocked_failures");

    expect(preview).toMatchObject({
      scenario: "blocked_failures",
      previewStatus: "blocked",
      readiness: {
        readinessStatus: "blocked",
        ready: false,
        nextSafeHook: "onEnvironmentProbe",
        breakerState: "open",
      },
      observability: {
        sampledObservationCount: 2,
        snapshot: {
          requestCount: 2,
          successCount: 0,
          failureCount: 2,
          retryableFailureCount: 2,
        },
        alerts: [
          expect.objectContaining({
            code: "dark_factory_remote_error_rate_high",
            severity: "warning",
          }),
        ],
      },
      breakerEvaluation: {
        breakerState: "open",
        openReason: "unavailable",
        runtimeImpact: {
          mode: "blocked",
          terminalStateAdvanced: false,
        },
      },
    });
    expect(preview.uiBadges).toEqual(expect.arrayContaining([
      "blocked",
      "breaker:open",
      "dark_factory_remote_breaker_open",
    ]));
    expect(preview.dryRunGuards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        targetHook: "onEnvironmentExecute",
        decision: "blocked",
        matchedPreflightStatus: "blocked",
        blockingCodes: expect.arrayContaining([
          "dark_factory_remote_breaker_open",
          "dark_factory_remote_error_rate_high",
        ]),
      }),
    ]));
  });

  it("previews stale readiness as needs_attention with a regressed transition", () => {
    const preview = buildUiSmokePreview("stale_readiness");

    expect(preview).toMatchObject({
      scenario: "stale_readiness",
      previewStatus: "needs_attention",
      readiness: {
        readinessStatus: "needs_attention",
        ready: false,
        readinessTransition: {
          previousStatus: "ready",
          currentStatus: "needs_attention",
          transitionKind: "regressed",
          terminalStateAdvanced: false,
        },
      },
      observability: {
        sampledObservationCount: 1,
        snapshot: {
          latestSequenceNo: 40,
          cursorLag: 8,
        },
      },
    });
    expect(preview.uiBadges).toContain("dark_factory_remote_cursor_lag_high");
    expect(preview.dryRunGuards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        targetHook: "onEnvironmentExecute",
        decision: "blocked",
        blockingCodes: expect.arrayContaining(["dark_factory_remote_cursor_lag_high"]),
      }),
    ]));
  });

  it("serves UI smoke preview data through the plugin getData harness", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    const preview = await harness.getData<UiSmokePreview>("remote-provider-ui-smoke-preview", {
      scenario: "blocked_failures",
    });

    expect(preview).toMatchObject({
      source: "dark-factory-projection",
      authoritative: false,
      truthSource: "dark-factory-journal",
      scenario: "blocked_failures",
      previewStatus: "blocked",
      readiness: {
        readinessStatus: "blocked",
        terminalStateAdvanced: false,
      },
      terminalStateAdvanced: false,
    });
  });

  it("does not expose resolved credential values in preview JSON", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    const preview = await harness.getData<UiSmokePreview>("remote-provider-ui-smoke-preview", {
      scenario: "healthy",
    });
    const serialized = JSON.stringify(preview);

    expect(serialized).not.toContain("ui-smoke-preview-placeholder-not-a-secret");
    expect(preview.credentialDiagnostics.checkedConfig.apiKeyPresent).toBe(true);
    expect(preview.credentialDiagnostics.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        details: { credentialSource: "inline" },
      }),
    ]));
    expectAllNonAuthoritative(preview);
    expectAllTerminalStateUnchanged(preview);
  });
});
