// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstanceAccess } from "./InstanceAccess";

const searchAdminUsersMock = vi.hoisted(() => vi.fn());
const getUserCompanyAccessMock = vi.hoisted(() => vi.fn());
const setUserCompanyAccessMock = vi.hoisted(() => vi.fn());
const promoteInstanceAdminMock = vi.hoisted(() => vi.fn());
const demoteInstanceAdminMock = vi.hoisted(() => vi.fn());
const removeCompanyMock = vi.hoisted(() => vi.fn());
const pushToastMock = vi.hoisted(() => vi.fn());
const setSelectedCompanyIdMock = vi.hoisted(() => vi.fn());

vi.mock("@/api/access", () => ({
  accessApi: {
    searchAdminUsers: (search: string) => searchAdminUsersMock(search),
    getUserCompanyAccess: (userId: string) => getUserCompanyAccessMock(userId),
    setUserCompanyAccess: (userId: string, companyIds: string[]) =>
      setUserCompanyAccessMock(userId, companyIds),
    promoteInstanceAdmin: (userId: string) => promoteInstanceAdminMock(userId),
    demoteInstanceAdmin: (userId: string) => demoteInstanceAdminMock(userId),
  },
}));

vi.mock("@/api/companies", () => ({
  companiesApi: {
    remove: (companyId: string) => removeCompanyMock(companyId),
  },
}));

vi.mock("@/context/CompanyContext", () => ({
  useCompany: () => ({
    companies: [
      {
        id: "company-1",
        name: "Paperclip",
        issuePrefix: "PAP",
        status: "active",
      },
      {
        id: "company-2",
        name: "Sandbox",
        issuePrefix: "SAN",
        status: "active",
      },
    ],
    selectedCompanyId: "company-1",
    setSelectedCompanyId: setSelectedCompanyIdMock,
  }),
}));

vi.mock("@/context/BreadcrumbContext", () => ({
  useBreadcrumbs: () => ({ setBreadcrumbs: vi.fn() }),
}));

vi.mock("@/context/ToastContext", () => ({
  useToast: () => ({ pushToast: pushToastMock }),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  );
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

describe("InstanceAccess", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    searchAdminUsersMock.mockResolvedValue([
      {
        id: "user-1",
        email: "admin@paperclip.local",
        name: "Admin User",
        isInstanceAdmin: true,
        activeCompanyMembershipCount: 1,
      },
    ]);
    getUserCompanyAccessMock.mockResolvedValue({
      companyAccess: [
        {
          id: "membership-1",
          companyId: "company-1",
          companyName: "Paperclip",
          membershipRole: "owner",
          status: "active",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
    });
    removeCompanyMock.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    container.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("requires the company name before permanently deleting from the instance access page", async () => {
    const root = createRoot(container);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <InstanceAccess />
        </QueryClientProvider>,
      );
    });
    await flushReact();
    await flushReact();

    const deleteButtons = Array.from(container.querySelectorAll("button")).filter(
      (button) => button.title === "永久删除公司",
    );
    expect(deleteButtons).toHaveLength(2);

    await act(async () => {
      deleteButtons[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    expect(document.body.textContent).toContain("永久删除公司");
    expect(document.body.textContent).toContain("输入公司名称：Paperclip");

    const confirmButton = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "确认永久删除",
    ) as HTMLButtonElement | undefined;
    expect(confirmButton).toBeTruthy();
    expect(confirmButton!.disabled).toBe(true);

    const input = document.body.querySelector("input[placeholder='Paperclip']") as HTMLInputElement | null;
    expect(input).toBeTruthy();

    await act(async () => {
      setInputValue(input!, "Paperclip");
    });
    await flushReact();

    const enabledConfirmButton = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "确认永久删除",
    ) as HTMLButtonElement | undefined;
    expect(enabledConfirmButton).toBeTruthy();
    expect(enabledConfirmButton!.disabled).toBe(false);

    await act(async () => {
      enabledConfirmButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    expect(removeCompanyMock).toHaveBeenCalledWith("company-1");
    expect(setSelectedCompanyIdMock).toHaveBeenCalledWith("company-2");
    expect(pushToastMock).toHaveBeenCalledWith({
      title: "公司已永久删除",
      tone: "success",
    });

    await act(async () => {
      root.unmount();
    });
  });
});
