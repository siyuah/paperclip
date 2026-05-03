import { describe, expect, it } from "vitest";
import {
  translateZhCnText,
} from "./zhCnLocalization";

describe("zh-CN localization layer", () => {
  it("translates common shell, onboarding, and settings phrases", () => {
    expect(translateZhCnText("Home")).toBe("首页");
    expect(translateZhCnText("Issues")).toBe("事项");
    expect(translateZhCnText("Create")).toBe("新建");
    expect(translateZhCnText("Keyboard shortcuts")).toBe("键盘快捷键");
    expect(translateZhCnText("Open account menu")).toBe("打开账户菜单");
    expect(translateZhCnText("Create your first company")).toBe("创建第一个公司");
    expect(translateZhCnText("Get started by creating a company.")).toBe("先创建一个公司即可开始。");
    expect(translateZhCnText("Ask them to visit Company Settings → Access to approve your request."))
      .toBe("请对方进入 公司设置 → 访问权限 审批你的请求。");
  });

  it("translates common product pages, dialogs, and controls", () => {
    expect(translateZhCnText("Plugin Manager")).toBe("插件管理器");
    expect(translateZhCnText("Plugins are alpha.")).toBe("插件功能仍处于 alpha 阶段。");
    expect(translateZhCnText("The plugin runtime and API surface are still changing. Expect breaking changes while this feature settles."))
      .toBe("插件运行时和 API 面仍在变化。该能力稳定前可能出现破坏性变更。");
    expect(translateZhCnText("Company Environments")).toBe("公司环境");
    expect(translateZhCnText("Environment support by adapter")).toBe("按适配器查看环境支持");
    expect(translateZhCnText("Run ledger")).toBe("运行账本");
    expect(translateZhCnText("Revision history")).toBe("修订历史");
    expect(translateZhCnText("Join Request Queue")).toBe("加入请求队列");
    expect(translateZhCnText("Loading plugin details...")).toBe("正在加载插件详情...");
    expect(translateZhCnText("No results found.")).toBe("未找到结果。");
  });

  it("translates known phrases embedded in dynamic shell text", () => {
    expect(translateZhCnText("Loading plugin details...")).toBe("正在加载插件详情...");
    expect(translateZhCnText("Open board now")).toBe("打开看板 now");
    expect(translateZhCnText("Company Environments are enabled")).toBe("公司环境 are enabled");
    expect(translateZhCnText("Search for a command to run...")).toBe("搜索要运行的命令...");
  });

  it("leaves unknown protocol and product identifiers unchanged", () => {
    expect(translateZhCnText("onEnvironmentExecute")).toBe("onEnvironmentExecute");
    expect(translateZhCnText("dark-factory-journal")).toBe("dark-factory-journal");
    expect(translateZhCnText("Paperclip")).toBe("Paperclip");
  });
});
