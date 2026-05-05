import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCompanyService = vi.hoisted(() => ({
  list: vi.fn(),
  stats: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  archive: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("../services/index.js", () => ({
  companyService: () => mockCompanyService,
  companyPortabilityService: () => ({
    exportBundle: vi.fn(),
    previewExport: vi.fn(),
    previewImport: vi.fn(),
    importBundle: vi.fn(),
  }),
  accessService: () => ({
    canUser: vi.fn(),
    ensureMembership: vi.fn(),
  }),
  budgetService: () => ({
    upsertPolicy: vi.fn(),
  }),
  agentService: () => ({
    getById: vi.fn(),
  }),
  feedbackService: () => ({
    listIssueVotesForUser: vi.fn(),
    listFeedbackTraces: vi.fn(),
    getFeedbackTraceById: vi.fn(),
    saveIssueVote: vi.fn(),
  }),
  logActivity: vi.fn(),
}));

async function createApp(actor: Express.Request["actor"]) {
  const [{ companyRoutes }, { errorHandler }] = await Promise.all([
    import("../routes/companies.js"),
    import("../middleware/index.js"),
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.actor = actor;
    next();
  });
  app.use("/api/companies", companyRoutes({} as any));
  app.use(errorHandler);
  return app;
}

describe("company delete route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCompanyService.remove.mockResolvedValue({
      id: "company-1",
      name: "Paperclip",
    });
  });

  it("allows instance admins to permanently delete companies without a company membership", async () => {
    const app = await createApp({
      type: "board",
      userId: "admin-1",
      source: "session",
      isInstanceAdmin: true,
      companyIds: [],
      memberships: [],
    });

    const res = await request(app).delete("/api/companies/company-1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockCompanyService.remove).toHaveBeenCalledWith("company-1");
  });

  it("still rejects non-admin board users without access to the target company", async () => {
    const app = await createApp({
      type: "board",
      userId: "user-1",
      source: "session",
      isInstanceAdmin: false,
      companyIds: [],
      memberships: [],
    });

    const res = await request(app).delete("/api/companies/company-1");

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("User does not have access to this company");
    expect(mockCompanyService.remove).not.toHaveBeenCalled();
  });
});
