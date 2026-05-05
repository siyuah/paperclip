import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  agents,
  approvals,
  budgetIncidents,
  budgetPolicies,
  companies,
  costEvents,
  createDb,
  financeEvents,
  goals,
  heartbeatRuns,
  projects,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { companyService } from "../services/companies.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres company removal tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("companyService.remove", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-company-remove-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("permanently deletes companies with projects, goals, run costs, and budget incidents", async () => {
    const companyId = randomUUID();
    const agentId = randomUUID();
    const goalId = randomUUID();
    const projectId = randomUUID();
    const heartbeatRunId = randomUUID();
    const costEventId = randomUUID();
    const financeEventId = randomUUID();
    const approvalId = randomUUID();
    const budgetPolicyId = randomUUID();
    const budgetIncidentId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Permanent Delete Co",
      issuePrefix: `D${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });

    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "Delete Runner",
      role: "engineer",
      status: "active",
      adapterType: "codex_local",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });

    await db.insert(goals).values({
      id: goalId,
      companyId,
      title: "Build deletion coverage",
      status: "planned",
      ownerAgentId: agentId,
    });

    await db.insert(projects).values({
      id: projectId,
      companyId,
      goalId,
      name: "Delete chain project",
      status: "active",
      leadAgentId: agentId,
    });

    await db.insert(heartbeatRuns).values({
      id: heartbeatRunId,
      companyId,
      agentId,
      invocationSource: "assignment",
      status: "succeeded",
      createdAt: new Date("2026-05-06T00:00:00.000Z"),
    });

    await db.insert(costEvents).values({
      id: costEventId,
      companyId,
      agentId,
      projectId,
      goalId,
      heartbeatRunId,
      provider: "openai",
      biller: "openai",
      billingType: "metered_api",
      model: "gpt-5",
      inputTokens: 10,
      outputTokens: 2,
      costCents: 25,
      occurredAt: new Date("2026-05-06T00:01:00.000Z"),
    });

    await db.insert(financeEvents).values({
      id: financeEventId,
      companyId,
      agentId,
      projectId,
      goalId,
      heartbeatRunId,
      costEventId,
      eventKind: "model_usage",
      direction: "debit",
      biller: "openai",
      provider: "openai",
      model: "gpt-5",
      amountCents: 25,
      occurredAt: new Date("2026-05-06T00:01:00.000Z"),
    });

    await db.insert(approvals).values({
      id: approvalId,
      companyId,
      type: "budget_override",
      requestedByAgentId: agentId,
      status: "pending",
      payload: {},
    });

    await db.insert(budgetPolicies).values({
      id: budgetPolicyId,
      companyId,
      scopeType: "company",
      scopeId: companyId,
      metric: "billed_cents",
      windowKind: "monthly",
      amount: 1000,
    });

    await db.insert(budgetIncidents).values({
      id: budgetIncidentId,
      companyId,
      policyId: budgetPolicyId,
      scopeType: "company",
      scopeId: companyId,
      metric: "billed_cents",
      windowKind: "monthly",
      windowStart: new Date("2026-05-01T00:00:00.000Z"),
      windowEnd: new Date("2026-06-01T00:00:00.000Z"),
      thresholdType: "hard",
      amountLimit: 1000,
      amountObserved: 1250,
      status: "open",
      approvalId,
    });

    const removed = await companyService(db).remove(companyId);

    expect(removed?.id).toBe(companyId);
    await expect(db.select().from(companies).where(eq(companies.id, companyId))).resolves.toEqual([]);
    await expect(db.select().from(projects).where(eq(projects.companyId, companyId))).resolves.toEqual([]);
    await expect(db.select().from(goals).where(eq(goals.companyId, companyId))).resolves.toEqual([]);
    await expect(db.select().from(financeEvents).where(eq(financeEvents.companyId, companyId))).resolves.toEqual([]);
    await expect(db.select().from(costEvents).where(eq(costEvents.companyId, companyId))).resolves.toEqual([]);
    await expect(db.select().from(heartbeatRuns).where(eq(heartbeatRuns.companyId, companyId))).resolves.toEqual([]);
    await expect(db.select().from(budgetIncidents).where(eq(budgetIncidents.companyId, companyId))).resolves.toEqual([]);
    await expect(db.select().from(budgetPolicies).where(eq(budgetPolicies.companyId, companyId))).resolves.toEqual([]);
    await expect(db.select().from(approvals).where(eq(approvals.companyId, companyId))).resolves.toEqual([]);
    await expect(db.select().from(agents).where(eq(agents.companyId, companyId))).resolves.toEqual([]);
  });
});
