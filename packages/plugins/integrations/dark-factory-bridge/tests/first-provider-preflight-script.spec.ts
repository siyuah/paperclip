import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };

describe("first provider preflight evidence script", () => {
  it("is exposed as a package script and references the required validation commands", async () => {
    const source = await readScript();

    expect(packageJson.scripts["preflight:first-provider"]).toBe("tsx scripts/run-first-provider-preflight.mjs");
    expect(source).toContain("pnpm\", \"typecheck");
    expect(source).toContain("pnpm\", \"build");
    expect(source).toContain("pnpm\", \"test");
    expect(source).toContain("pnpm\", \"smoke:ui:browser");
    expect(source).toContain("python3\", \"tools/validate_v3_bundle.py");
    expect(source).toContain("tests/remote-gated-integration.spec.ts");
  });

  it("scrubs remote provider environment variables for the default-skip check", async () => {
    const source = await readScript();

    expect(source).toContain("DARK_FACTORY_REMOTE_INTEGRATION");
    expect(source).toContain("DARK_FACTORY_REMOTE_ENDPOINT");
    expect(source).toContain("DARK_FACTORY_REMOTE_API_KEY");
    expect(source).toContain("DARK_FACTORY_REMOTE_API_KEY_ENV");
    expect(source).toContain("skippedByDefault");
    expect(source).toContain("1 skipped");
  });

  it("redacts secret-like output and emits non-authoritative boundary evidence", async () => {
    const source = await readScript();

    expect(source).toContain("sanitizeOutput");
    expect(source).toContain("Bearer <redacted>");
    expect(source).toContain("<redacted>");
    expect(source).toContain("truthSource: \"dark-factory-journal\"");
    expect(source).toContain("authoritative: false");
    expect(source).toContain("terminalStateAdvanced: false");
    expect(source).toContain("doesAuthorizeRemoteExecution: false");
    expect(source).toContain("shouldContactRemoteProviderDuringDryRun: false");
  });

  it("writes an evidence JSON file in skip-heavy mode without enabling real provider integration", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "df-first-provider-preflight-"));
    try {
      const result = await run(["pnpm", "preflight:first-provider", "--", "--skip-heavy", "--out", outDir], {
        DARK_FACTORY_REMOTE_INTEGRATION: "1",
        DARK_FACTORY_REMOTE_ENDPOINT: "https://should-not-run.example.test",
        DARK_FACTORY_REMOTE_API_KEY: "should-not-appear",
        DARK_FACTORY_REMOTE_API_KEY_ENV: "DARK_FACTORY_REMOTE_API_KEY",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain("should-not-appear");
      const evidence = JSON.parse(await readFile(join(outDir, "evidence.json"), "utf8"));

      expect(evidence).toMatchObject({
        schemaVersion: 1,
        gatedIntegrationDefaultSkip: true,
        boundary: {
          truthSource: "dark-factory-journal",
          authoritative: false,
          terminalStateAdvanced: false,
          doesAuthorizeRemoteExecution: false,
          shouldContactRemoteProviderDuringDryRun: false,
          noResolvedCredentialValues: true,
        },
      });
      expect(evidence.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "typecheck", status: "skipped" }),
        expect.objectContaining({ id: "build", status: "skipped" }),
        expect.objectContaining({ id: "test", status: "skipped" }),
        expect.objectContaining({ id: "ui_browser_smoke", status: "skipped" }),
        expect.objectContaining({ id: "v3_bundle_validation", status: "skipped" }),
        expect.objectContaining({
          id: "gated_integration_default_skip",
          ok: true,
          skippedByDefault: true,
        }),
      ]));
      expect(JSON.stringify(evidence)).not.toContain("should-not-appear");
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  }, 20_000);
});

async function readScript(): Promise<string> {
  return readFile("scripts/run-first-provider-preflight.mjs", "utf8");
}

function run(command: string[], envOverrides: Record<string, string>): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolveRun) => {
    const child = spawn(command[0]!, command.slice(1), {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...envOverrides,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (exitCode) => {
      resolveRun({
        exitCode: exitCode ?? 1,
        stdout,
        stderr,
      });
    });
  });
}
