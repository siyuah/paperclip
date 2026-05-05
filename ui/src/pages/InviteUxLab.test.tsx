// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InviteUxLab } from "./InviteUxLab";

vi.mock("@/components/CompanyPatternIcon", () => ({
  CompanyPatternIcon: ({ companyName }: { companyName: string }) => (
    <div aria-label={`${companyName} logo`}>{companyName}</div>
  ),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("InviteUxLab", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("renders the invite/signup review sections", async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(<InviteUxLab />);
    });

    expect(container.textContent).toContain("邀请与注册 UX 预览面板");
    expect(container.textContent).toContain("/tests/ux/invites");
    expect(container.textContent).toContain("落地页状态覆盖");
    expect(container.textContent).toContain("分屏邀请流程");
    expect(container.textContent).toContain("审批与完成页面");
    expect(container.textContent).toContain("认证页状态");
    expect(container.textContent).toContain("公司邀请管理");
    expect(container.textContent).toContain("创建账户");
    expect(container.textContent).toContain("邀请历史");

    await act(async () => {
      root.unmount();
    });
  });
});
