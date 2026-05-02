import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const contractPath = resolve(
  process.cwd(),
  "docs/remote-provider-previous-evidence-storage-contract.sql",
);

describe("remote provider previous evidence storage contract", () => {
  it("keeps previous evidence SQL as a contract file outside active migrations", async () => {
    const sql = await readContractSql();
    const migration = await readFile(
      resolve(process.cwd(), "migrations/001_dark_factory_projection.sql"),
      "utf8",
    );

    expect(contractPath).toContain("/docs/");
    expect(contractPath).not.toContain("/migrations/");
    expect(sql).toContain("Contract-only");
    expect(sql).toContain("remote_provider_previous_evidence");
    expect(migration).not.toContain("remote_provider_previous_evidence");
  });

  it("declares only projection metadata fields and no credential storage", async () => {
    const sql = await readContractSql();

    expect(sql).toContain("readiness_receipt_id text NOT NULL");
    expect(sql).toContain("readiness_receipt_digest text NOT NULL");
    expect(sql).toContain("breaker_state text NOT NULL");
    expect(sql).toContain("last_failure_class text NOT NULL DEFAULT 'none'");
    expect(sql).toContain("evidence_payload jsonb NOT NULL");
    expect(sql).not.toMatch(/\b(api_key|password|token|credential|connection_string|secret)\b/i);
  });

  it("locks projection boundary and terminal-state constraints", async () => {
    const sql = await readContractSql();

    expect(sql).toContain("source text NOT NULL DEFAULT 'dark-factory-projection'");
    expect(sql).toContain("truth_source text NOT NULL DEFAULT 'dark-factory-journal'");
    expect(sql).toContain("authoritative boolean NOT NULL DEFAULT false CHECK (authoritative IS false)");
    expect(sql).toContain("does_authorize_remote_execution boolean NOT NULL DEFAULT false CHECK (does_authorize_remote_execution IS false)");
    expect(sql).toContain("terminal_state_advanced boolean NOT NULL DEFAULT false CHECK (terminal_state_advanced IS false)");
    expect(sql).toContain("Dark Factory Journal remains truth source");
  });

  it("declares deterministic lookup indexes for storage key, issue, and receipt digest", async () => {
    const sql = await readContractSql();

    expect(sql).toContain("remote_provider_previous_evidence_storage_key_idx");
    expect(sql).toContain("(company_id, storage_key)");
    expect(sql).toContain("remote_provider_previous_evidence_issue_idx");
    expect(sql).toContain("(company_id, issue_id, environment_id)");
    expect(sql).toContain("remote_provider_previous_evidence_receipt_idx");
    expect(sql).toContain("(company_id, readiness_receipt_digest)");
  });
});

async function readContractSql(): Promise<string> {
  return readFile(contractPath, "utf8");
}
