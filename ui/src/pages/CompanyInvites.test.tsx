// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompanyInvites } from "./CompanyInvites";
import { queryKeys } from "@/lib/queryKeys";

const listInvitesMock = vi.hoisted(() => vi.fn());
const createCompanyInviteMock = vi.hoisted(() => vi.fn());
const revokeInviteMock = vi.hoisted(() => vi.fn());
const pushToastMock = vi.hoisted(() => vi.fn());
const setBreadcrumbsMock = vi.hoisted(() => vi.fn());
const clipboardWriteTextMock = vi.hoisted(() => vi.fn());

vi.mock("@/api/access", () => ({
  accessApi: {
    listInvites: (companyId: string, options?: unknown) => listInvitesMock(companyId, options),
    createCompanyInvite: (companyId: string, input: unknown) =>
      createCompanyInviteMock(companyId, input),
    revokeInvite: (inviteId: string) => revokeInviteMock(inviteId),
  },
}));

vi.mock("@/context/CompanyContext", () => ({
  useCompany: () => ({
    selectedCompanyId: "company-1",
    selectedCompany: { id: "company-1", name: "Paperclip", issuePrefix: "PAP" },
  }),
}));

vi.mock("@/context/BreadcrumbContext", () => ({
  useBreadcrumbs: () => ({ setBreadcrumbs: setBreadcrumbsMock }),
}));

vi.mock("@/context/ToastContext", () => ({
  useToast: () => ({ pushToast: pushToastMock }),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

describe("CompanyInvites", () => {
  let container: HTMLDivElement;
  const inviteHistory = Array.from({ length: 25 }, (_, index) => {
    const inviteNumber = 25 - index;
    const isActive = inviteNumber === 25;
    return {
      id: `invite-${inviteNumber}`,
      companyId: "company-1",
      inviteType: "company_join",
      tokenHash: `hash-${inviteNumber}`,
      allowedJoinTypes: "human",
      defaultsPayload: null,
      expiresAt: "2026-04-20T00:00:00.000Z",
      invitedByUserId: "user-1",
      revokedAt: null,
      acceptedAt: isActive ? null : "2026-04-11T00:00:00.000Z",
      createdAt: `2026-04-${String(inviteNumber).padStart(2, "0")}T00:00:00.000Z`,
      updatedAt: `2026-04-${String(inviteNumber).padStart(2, "0")}T00:00:00.000Z`,
      companyName: "Paperclip",
      humanRole: isActive ? "operator" : "viewer",
      inviteMessage: null,
      state: isActive ? "active" : "accepted",
      invitedByUser: {
        id: "user-1",
        name: `Board User ${inviteNumber}`,
        email: `board${inviteNumber}@paperclip.local`,
        image: null,
      },
      relatedJoinRequestId: isActive ? "join-1" : null,
    };
  });

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);

    listInvitesMock.mockImplementation((_companyId: string, options?: { limit?: number; offset?: number }) => {
      const limit = options?.limit ?? 20;
      const offset = options?.offset ?? 0;
      const invites = inviteHistory.slice(offset, offset + limit);
      const nextOffset = offset + invites.length < inviteHistory.length ? offset + invites.length : null;
      return Promise.resolve({ invites, nextOffset });
    });

    createCompanyInviteMock.mockResolvedValue({
      inviteUrl: "https://paperclip.local/invite/new-token",
      onboardingTextUrl: null,
      onboardingTextPath: null,
      humanRole: "viewer",
      allowedJoinTypes: "human",
    });

    revokeInviteMock.mockResolvedValue(undefined);

    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: { writeText: clipboardWriteTextMock },
    });
  });

  afterEach(() => {
    container.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("renders a human-only invite flow and keeps invite history in a table", async () => {
    const root = createRoot(container);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <QueryClientProvider client={queryClient}>
            <CompanyInvites />
          </QueryClientProvider>
        </MemoryRouter>,
      );
    });
    await flushReact();
    await flushReact();

    expect(container.textContent).toContain("公司邀请");
    expect(container.textContent).toContain("创建邀请");
    expect(container.textContent).toContain("邀请历史");
    expect(container.textContent).toContain("Board User 25");
    expect(container.textContent).toContain("Board User 21");
    expect(container.textContent).not.toContain("Board User 20");
    expect(container.textContent).toContain("查看请求");
    expect(container.textContent).toContain("查看更多");
    expect(container.textContent).not.toContain("Human or agent");
    expect(container.textContent).not.toContain("Invite message");
    expect(container.textContent).not.toContain("Latest generated invite");
    expect(container.textContent).not.toContain("Active invites");
    expect(container.textContent).not.toContain("Consumed invites");
    expect(container.textContent).not.toContain("Expired invites");
    expect(container.textContent).not.toContain("OpenClaw shortcut");

    expect(container.textContent).toContain("选择角色");
    expect(container.textContent).toContain("每个邀请链接只能使用一次。");
    expect(container.textContent).toContain("可以创建代理、邀请用户、分配任务并审批加入请求。");
    expect(container.textContent).toContain("包含管理员的全部权限，并可管理成员和权限授权。");
    expect(listInvitesMock).toHaveBeenCalledWith("company-1", { limit: 5, offset: 0 });

    const viewMoreButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "查看更多",
    );

    await act(async () => {
      viewMoreButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();
    await flushReact();

    expect(listInvitesMock).toHaveBeenCalledWith("company-1", { limit: 5, offset: 5 });
    expect(container.textContent).toContain("Board User 20");
    expect(container.textContent).toContain("Board User 16");
    expect(container.textContent).toContain("查看更多");

    await act(async () => {
      const viewerRadio = container.querySelector('input[type="radio"][value="viewer"]') as HTMLInputElement | null;
      viewerRadio?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      viewerRadio?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    const createButton = buttons.find((button) => button.textContent === "创建邀请");
    const revokeButton = buttons.find((button) => button.textContent === "撤销");

    expect(createButton).toBeTruthy();
    expect(revokeButton).toBeTruthy();

    await act(async () => {
      createButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();
    await flushReact();

    expect(createCompanyInviteMock).toHaveBeenCalledWith("company-1", {
      allowedJoinTypes: "human",
      humanRole: "viewer",
      agentMessage: null,
    });
    expect(clipboardWriteTextMock).toHaveBeenCalledWith("https://paperclip.local/invite/new-token");
    expect(container.textContent).toContain("最新邀请链接");
    expect(container.textContent).toContain("此 URL 包含服务器返回的当前 Paperclip 域名。");
    expect(container.textContent).toContain("https://paperclip.local/invite/new-token");
    expect(container.textContent).toContain("打开邀请");
    expect(pushToastMock).toHaveBeenCalledWith({
      title: "邀请已创建",
      body: "邀请链接已生成，并已复制到剪贴板。",
      tone: "success",
    });

    const inviteFieldButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("https://paperclip.local/invite/new-token"),
    );

    await act(async () => {
      inviteFieldButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    expect(clipboardWriteTextMock).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("已复制");

    await act(async () => {
      revokeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    expect(revokeInviteMock).toHaveBeenCalledWith("invite-25");

    await act(async () => {
      root.unmount();
    });
  });

  it("ignores legacy cached invite arrays and refetches paginated history", async () => {
    const root = createRoot(container);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(["access", "invites", "company-1", "all"], inviteHistory.slice(0, 2));

    await act(async () => {
      root.render(
        <MemoryRouter>
          <QueryClientProvider client={queryClient}>
            <CompanyInvites />
          </QueryClientProvider>
        </MemoryRouter>,
      );
    });
    await flushReact();
    await flushReact();

    expect(container.textContent).toContain("Board User 25");
    expect(container.textContent).not.toContain("Board User 20");
    expect(listInvitesMock).toHaveBeenCalledWith("company-1", { limit: 5, offset: 0 });
    expect(queryClient.getQueryData(queryKeys.access.invites("company-1", "all", 5))).toMatchObject({
      pages: [
        {
          invites: expect.any(Array),
          nextOffset: 5,
        },
      ],
    });

    await act(async () => {
      root.unmount();
    });
  });
});
