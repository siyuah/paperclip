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
    expect(translateZhCnText("Open company menu")).toBe("打开公司菜单");
    expect(translateZhCnText("Open Dark Factory Browser POST menu"))
      .toBe("打开 Dark Factory Browser POST 菜单");
    expect(translateZhCnText("打开 Dark Factory Browser POST menu"))
      .toBe("打开 Dark Factory Browser POST 菜单");
    expect(translateZhCnText("Add company")).toBe("添加公司");
    expect(translateZhCnText("添加 company")).toBe("添加公司");
    expect(translateZhCnText("New project")).toBe("新建项目");
    expect(translateZhCnText("新版本 project")).toBe("新建项目");
    expect(translateZhCnText("Select company")).toBe("选择公司");
    expect(translateZhCnText("Invite people")).toBe("邀请成员");
    expect(translateZhCnText("Invite people to Dark Factory Browser POST"))
      .toBe("邀请成员加入 Dark Factory Browser POST");
    expect(translateZhCnText("Create your first company")).toBe("创建第一个公司");
    expect(translateZhCnText("GitHub URL")).toBe("GitHub 地址");
    expect(translateZhCnText("Get started by creating a company.")).toBe("先创建一个公司即可开始。");
    expect(translateZhCnText("Ask them to visit Company Settings → Access to approve your request."))
      .toBe("请对方进入 公司设置 → 访问权限 审批你的请求。");
  });

  it("translates common product pages, dialogs, and controls", () => {
    expect(translateZhCnText("Routines")).toBe("例程");
    expect(translateZhCnText("Goals")).toBe("目标");
    expect(translateZhCnText("Org")).toBe("组织");
    expect(translateZhCnText("Costs")).toBe("成本");
    expect(translateZhCnText("Invites")).toBe("邀请");
    expect(translateZhCnText("Heartbeats")).toBe("心跳");
    expect(translateZhCnText("Scheduler Heartbeats")).toBe("调度心跳");
    expect(translateZhCnText("Plugin Manager")).toBe("插件管理器");
    expect(translateZhCnText("Plugins are alpha.")).toBe("插件功能仍处于测试阶段。");
    expect(translateZhCnText("The plugin runtime and API surface are still changing. Expect breaking changes while this feature settles."))
      .toBe("插件运行时和 API 面仍在变化。该能力稳定前可能出现破坏性变更。");
    expect(translateZhCnText("Company Environments")).toBe("公司环境");
    expect(translateZhCnText("Environment support by adapter")).toBe("按适配器查看环境支持");
    expect(translateZhCnText("Run ledger")).toBe("运行账本");
    expect(translateZhCnText("Revision history")).toBe("修订历史");
    expect(translateZhCnText("Join Request Queue")).toBe("加入请求队列");
    expect(translateZhCnText("Workspaces")).toBe("工作区");
    expect(translateZhCnText("WORKSPACES")).toBe("工作区");
    expect(translateZhCnText("Loading plugin details...")).toBe("正在加载插件详情...");
    expect(translateZhCnText("No results found.")).toBe("未找到结果。");
  });

  it("translates onboarding wizard flow copy and mixed partial translations", () => {
    expect(translateZhCnText("Company")).toBe("公司");
    expect(translateZhCnText("Agent")).toBe("代理");
    expect(translateZhCnText("Task")).toBe("任务");
    expect(translateZhCnText("Launch")).toBe("启动");
    expect(translateZhCnText("Name your company")).toBe("为公司命名");
    expect(translateZhCnText("名称 your company")).toBe("为公司命名");
    expect(translateZhCnText("This is the organization your agents will work for."))
      .toBe("这是你的代理将为之工作的组织。");
    expect(translateZhCnText("Mission / goal (optional)")).toBe("使命 / 目标（可选）");
    expect(translateZhCnText("What is this company trying to achieve?"))
      .toBe("这家公司想要实现什么目标？");
    expect(translateZhCnText("Create your first agent")).toBe("创建你的第一个代理");
    expect(translateZhCnText("Choose how this agent will run tasks."))
      .toBe("选择这个代理将如何运行任务。");
    expect(translateZhCnText("选择 how this 代理 will run 任务."))
      .toBe("选择这个代理将如何运行任务。");
    expect(translateZhCnText("Agent name")).toBe("代理名称");
    expect(translateZhCnText("Adapter type")).toBe("适配器类型");
    expect(translateZhCnText("Recommended")).toBe("推荐");
    expect(translateZhCnText("More Agent Adapter Types")).toBe("更多代理适配器类型");
    expect(translateZhCnText("更多 代理 Adapter Types")).toBe("更多代理适配器类型");
    expect(translateZhCnText("Adapter environment check")).toBe("适配器环境检查");
    expect(translateZhCnText("适配器 environment check")).toBe("适配器环境检查");
    expect(translateZhCnText("Runs a live probe that asks the adapter CLI to respond with hello."))
      .toBe("运行实时探测，要求适配器 CLI 回复 hello。");
    expect(translateZhCnText("Testing...")).toBe("正在测试...");
    expect(translateZhCnText("Test now")).toBe("立即测试");
    expect(translateZhCnText("Give it something to do")).toBe("给它安排一件事");
    expect(translateZhCnText("Give your agent a small task to start with — a bug fix, a research question, writing a script."))
      .toBe("给你的代理一个小任务开始，例如修复 bug、研究问题或编写脚本。");
    expect(translateZhCnText("Task title")).toBe("任务标题");
    expect(translateZhCnText("Description (optional)")).toBe("描述（可选）");
    expect(translateZhCnText("Add more detail about what the agent should do..."))
      .toBe("补充说明代理应该做什么...");
    expect(translateZhCnText("Ready to launch")).toBe("准备启动");
    expect(translateZhCnText("就绪 to launch")).toBe("准备启动");
    expect(translateZhCnText("Everything is set up. Launching now will create the starter task, wake the agent, and open the issue."))
      .toBe("一切已设置完毕。现在启动会创建初始任务、唤醒代理，并打开事项。");
    expect(translateZhCnText("Create & Open Issue")).toBe("创建并打开事项");
    expect(translateZhCnText("新建 & 打开 Issue")).toBe("创建并打开事项");
    expect(translateZhCnText("Creating...")).toBe("正在创建...");
  });

  it("translates browser-audited settings and empty-state copy", () => {
    expect(translateZhCnText("Skip to Main Content")).toBe("跳到主内容");
    expect(translateZhCnText("Create your first agent to get started.")).toBe("创建你的第一个代理即可开始。");
    expect(translateZhCnText("No organizational hierarchy defined.")).toBe("尚未定义组织层级。");
    expect(translateZhCnText("Control how your account appears in the sidebar and other board surfaces."))
      .toBe("控制你的账户在侧边栏和其他看板界面的显示方式。");
    expect(translateZhCnText("Configure instance-wide preferences including log display, keyboard shortcuts, backup retention, and data sharing."))
      .toBe("配置实例级偏好，包括日志显示、键盘快捷键、备份保留和数据共享。");
    expect(translateZhCnText("Opt into features that are still being evaluated before they become default behavior."))
      .toBe("启用仍在评估中、尚未成为默认行为的功能。");
    expect(translateZhCnText("No scheduler heartbeats match the current criteria."))
      .toBe("没有符合当前条件的调度心跳。");
    expect(translateZhCnText("Auth readiness")).toBe("认证就绪状态");
    expect(translateZhCnText("Bootstrap status")).toBe("引导状态");
    expect(translateZhCnText("Hide the username segment in home-directory paths and similar operator-visible log output. Standalone username mentions outside of paths are not yet masked in the live transcript view. This is off by default."))
      .toBe("隐藏主目录路径和类似操作员可见日志输出中的用户名片段。实时转录视图中路径之外的独立用户名暂未遮蔽。默认关闭。");
    expect(translateZhCnText("Configure how long automatic database backups are retained. Backups run roughly every hour and are compressed with gzip. Within the daily window all backups are kept; beyond that, one backup per week and one per month are preserved."))
      .toBe("配置自动数据库备份的保留时长。备份大约每小时运行一次，并使用 gzip 压缩。在每日窗口内会保留全部备份；超过该窗口后，每周和每月各保留一份。");
  });

  it("translates browser-audited dashboard, costs, adapters, and access pages", () => {
    expect(translateZhCnText("You have no agents. New one here")).toBe("你还没有代理。在这里新建一个");
    expect(translateZhCnText("No recent agent runs.")).toBe("暂无最近的代理运行。");
    expect(translateZhCnText("Tasks In Progress")).toBe("进行中的任务");
    expect(translateZhCnText("Month Spend")).toBe("本月花费");
    expect(translateZhCnText("Pending Approvals")).toBe("待处理审批");
    expect(translateZhCnText("Issues by Priority")).toBe("按优先级查看事项");
    expect(translateZhCnText("Live runs")).toBe("实时运行");
    expect(translateZhCnText("No active or recent agent runs.")).toBe("暂无活跃或最近的代理运行。");
    expect(translateZhCnText("Alpha")).toBe("测试阶段");
    expect(translateZhCnText(translateZhCnText("Alpha"))).toBe("测试阶段");
    expect(translateZhCnText("External adapters are alpha.")).toBe("外部适配器仍处于测试阶段。");
    expect(translateZhCnText("The adapter plugin system is under active development. APIs and storage format may change. Use the power icon to hide adapters from agent menus without removing them."))
      .toBe("适配器插件系统正在活跃开发中。API 和存储格式可能变化。可使用电源图标将适配器从代理菜单中隐藏，而无需移除它们。");
    expect(translateZhCnText("Install an adapter package to extend model support.")).toBe("安装适配器包以扩展模型支持。");
    expect(translateZhCnText("Inference spend, platform fees, credits, and live quota windows."))
      .toBe("推理花费、平台费用、抵扣和实时配额窗口。");
    expect(translateZhCnText("No finance events yet. Add account-level charges once biller invoices or credits land."))
      .toBe("暂无财务事件。计费方发票或抵扣到账后，可添加账户级费用。");
    expect(translateZhCnText("$0.00 debits · $0.00 credits")).toBe("$0.00 借记 · $0.00 贷记");
    expect(translateZhCnText("$0.00 estimated in range")).toBe("$0.00 范围内预估");
    expect(translateZhCnText("0 running, 0 paused, 0 errors")).toBe("0 运行中，0 已暂停，0 错误");
    expect(translateZhCnText("0 运行中, 0 已暂停, 0 errors")).toBe("0 运行中，0 已暂停，0 错误");
    expect(translateZhCnText("1 open, 0 blocked")).toBe("1 打开，0 已阻断");
    expect(translateZhCnText("1 open, 0 已阻断")).toBe("1 打开，0 已阻断");
    expect(translateZhCnText("ACTIVE / RECENT")).toBe("活跃 / 最近");
    expect(translateZhCnText("活跃 / RECENT")).toBe("活跃 / 最近");
    expect(translateZhCnText("Last 7 days")).toBe("最近 7 天");
    expect(translateZhCnText("0 tokens across request-scoped events")).toBe("0 个 token，来自请求级事件");
    expect(translateZhCnText("Estimated debits that are not yet invoice-authoritative"))
      .toBe("尚未以发票为准的预估借记");
    expect(translateZhCnText("Search users, manage instance-admin status, and control which companies they can access."))
      .toBe("搜索用户、管理实例管理员状态，并控制其可访问的公司。");
    expect(translateZhCnText("Manage company user memberships, membership status, and explicit permission grants for Dark Factory Browser POST."))
      .toBe("管理 Dark Factory Browser POST 的公司用户成员关系、成员状态和显式权限授权。");
    expect(translateZhCnText("No explicit grants")).toBe("没有显式授权");
    expect(translateZhCnText("Loading company access…")).toBe("正在加载公司访问权限...");
    expect(translateZhCnText("Loading invites…")).toBe("正在加载邀请...");
    expect(translateZhCnText("Loading join requests…")).toBe("正在加载加入请求...");
    expect(translateZhCnText("Loading general settings...")).toBe("正在加载通用设置...");
    expect(translateZhCnText("正在加载 general settings...")).toBe("正在加载通用设置...");
    expect(translateZhCnText("Loading experimental settings...")).toBe("正在加载实验性设置...");
    expect(translateZhCnText("正在加载 experimental settings...")).toBe("正在加载实验性设置...");
    expect(translateZhCnText("No workspace activity yet.")).toBe("暂无工作区活动。");
    expect(translateZhCnText("3 workspaces")).toBe("3 个工作区");
    expect(translateZhCnText("Claude Code (local)")).toBe("Claude 代码（本地）");
    expect(translateZhCnText("Provider")).toBe("提供方");
    expect(translateZhCnText("All providers")).toBe("全部提供方");
    expect(translateZhCnText("Provider 状态")).toBe("提供方状态");
    expect(translateZhCnText("主执行 Provider (primary_execution)")).toBe("主执行提供方 (primary_execution)");
    expect(translateZhCnText("公司 PACKAGES")).toBe("公司包");
    expect(translateZhCnText("公司 packages")).toBe("公司包");
    expect(translateZhCnText("最近 TASKS")).toBe("最近任务");
    expect(translateZhCnText("最近 Tasks")).toBe("最近任务");
    expect(translateZhCnText("recent tasks")).toBe("最近任务");
    expect(translateZhCnText("主色 MODEL")).toBe("主色模型");
    expect(translateZhCnText("主色 model")).toBe("主色模型");
    expect(translateZhCnText("WORK")).toBe("工作");
    expect(translateZhCnText("Work")).toBe("工作");
    expect(translateZhCnText("PROJECTS")).toBe("项目");
    expect(translateZhCnText("Projects")).toBe("项目");
    expect(translateZhCnText("APPEARANCE")).toBe("外观");
    expect(translateZhCnText("Appearance")).toBe("外观");
    expect(translateZhCnText("Hiring")).toBe("招聘");
    expect(translateZhCnText("Grants")).toBe("授权");
    expect(translateZhCnText("Action")).toBe("操作");
    expect(translateZhCnText("公司 Packages")).toBe("公司包");
    expect(translateZhCnText("GRANTS")).toBe("授权");
    expect(translateZhCnText("ACTION")).toBe("操作");
    expect(translateZhCnText("0 routines")).toBe("0 例程");
    expect(translateZhCnText("10 models")).toBe("10 个模型");
    expect(translateZhCnText("公司 access")).toBe("公司访问权限");
    expect(translateZhCnText("1 活跃 company memberships")).toBe("1 个活跃公司成员身份");
    expect(translateZhCnText("just now")).toBe("刚刚");
  });

  it("translates browser-audited company settings and invite flows", () => {
    expect(translateZhCnText("Company name")).toBe("公司名称");
    expect(translateZhCnText("Brand color")).toBe("品牌颜色");
    expect(translateZhCnText("Attachment size limit")).toBe("附件大小限制");
    expect(translateZhCnText("Local zip")).toBe("本地压缩包");
    expect(translateZhCnText("Require board approval for new hires")).toBe("新成员加入需要看板审批");
    expect(translateZhCnText("Generate an OpenClaw agent invite snippet.")).toBe("生成 OpenClaw 代理邀请片段。");
    expect(translateZhCnText("Import and export have moved to dedicated pages accessible from the Org Chart header."))
      .toBe("导入和导出已移至专用页面，可从组织图表头部进入。");
    expect(translateZhCnText("导入 and export have moved to dedicated pages accessible from the 组织 Chart header."))
      .toBe("导入和导出已移至专用页面，可从组织图表头部进入。");
    expect(translateZhCnText("导入 and export have moved to dedicated pages accessible from the"))
      .toBe("导入和导出已移至专用页面，可从");
    expect(translateZhCnText("组织 Chart")).toBe("组织图表");
    expect(translateZhCnText("header.")).toBe("头部进入。");
    expect(translateZhCnText("Archive this company to hide it from the sidebar. This persists in the database."))
      .toBe("归档该公司以从侧边栏隐藏。此操作会持久化到数据库。");
    expect(translateZhCnText("Generate a human invite link and choose the default access it should request."))
      .toBe("生成人工邀请链接，并选择其默认请求的访问权限。");
    expect(translateZhCnText("Everything in Admin, plus managing members and permission grants."))
      .toBe("包含管理员的全部权限，并可管理成员和权限授权。");
    expect(translateZhCnText("Each invite link is single-use. The first successful use consumes the link and creates or reuses the matching join request before approval."))
      .toBe("每个邀请链接只能使用一次。首次成功使用会消耗该链接，并在审批前创建或复用匹配的加入请求。");
    expect(translateZhCnText("Review human and agent join requests outside the mixed inbox feed. This queue uses the same approval mutations as the inline inbox cards."))
      .toBe("在混合收件箱流之外复核人工和代理加入请求。此队列使用与内联收件箱卡片相同的审批变更。");
    expect(translateZhCnText("No routines yet. Use New routine to define the first recurring workflow."))
      .toBe("暂无例程。请使用“新建例程”定义第一个周期性工作流。");
    expect(translateZhCnText("暂无例程。 Use 新建 例程 to define the first recurring workflow."))
      .toBe("暂无例程。请使用“新建例程”定义第一个周期性工作流。");
    expect(translateZhCnText("Recurring work definitions that materialize into auditable execution issues."))
      .toBe("会转化为可审计执行事项的周期性工作定义。");
  });

  it("translates audited dynamic sentences before generic word replacements", () => {
    expect(translateZhCnText('No company matches prefix "ORG".')).toBe("没有公司匹配前缀“ORG”。");
    expect(translateZhCnText("This route does not exist.")).toBe("此路由不存在。");
    expect(translateZhCnText("Requested path:")).toBe("请求路径：");
    expect(translateZhCnText("Requested path: /org/dashboard")).toBe("请求路径：/org/dashboard");
    expect(translateZhCnText("Current window: last 24 hours.")).toBe("当前窗口：最近 24 小时。");
    expect(translateZhCnText("当前 window: last 24 小时.")).toBe("当前窗口：最近 24 小时。");
    expect(translateZhCnText("window: last 24 hours.")).toBe("窗口：最近 24 小时。");
    expect(translateZhCnText("Save hours")).toBe("保存小时数");
    expect(translateZhCnText("Run now")).toBe("立即运行");
    expect(translateZhCnText("Click the avatar to upload a new image. Stored in Paperclip file storage for Dark Factory Browser POST."))
      .toBe("点击头像上传新图片。文件会存储在 Dark Factory Browser POST 的 Paperclip 文件存储中。");
    expect(translateZhCnText("Click the avatar to upload a new image.")).toBe("点击头像上传新图片。");
    expect(translateZhCnText("Stored in Paperclip file storage for Dark Factory Browser POST."))
      .toBe("文件会存储在 Dark Factory Browser POST 的 Paperclip 文件存储中。");
    expect(translateZhCnText("No built-in grants.")).toBe("没有内置授权。");
    expect(translateZhCnText("Permissions & Configuration")).toBe("权限与配置");
    expect(translateZhCnText("Files")).toBe("文件");
    expect(translateZhCnText("Copy instructions file as markdown")).toBe("复制指令文件为 Markdown");
    expect(translateZhCnText("Copy as markdown")).toBe("复制为 Markdown");
    expect(translateZhCnText("editable markdown")).toBe("可编辑 Markdown");
    expect(translateZhCnText("Copied")).toBe("已复制");
    expect(translateZhCnText("Deprecated virtual file")).toBe("已弃用的虚拟文件");
    expect(translateZhCnText("New file in this bundle")).toBe("此包中的新文件");
    expect(translateZhCnText("File contents")).toBe("文件内容");
    expect(translateZhCnText("Copy snippet")).toBe("复制片段");
    expect(translateZhCnText("Copied snippet")).toBe("已复制片段");
    expect(translateZhCnText("Optional skills from the company library. Built-in Paperclip runtime skills are added automatically."))
      .toBe("来自公司技能库的可选技能。内置 Paperclip 运行时技能会自动添加。");
    expect(translateZhCnText("本地 trusted")).toBe("本地受信任");
    expect(translateZhCnText("plugin installed")).toBe("插件已安装");
    expect(translateZhCnText("created company")).toBe("已创建公司");
    expect(translateZhCnText("issue read marked")).toBe("事项已标记为已读");
    expect(translateZhCnText("created company Dark Factory Browser POST")).toBe("已创建公司 Dark Factory Browser POST");
    expect(translateZhCnText("created DAR-1— Dark Factory host UI verification issue"))
      .toBe("已创建 DAR-1 — Dark Factory 主机 UI 验证事项");
    expect(translateZhCnText("This issue conversation is empty. Start with a message below."))
      .toBe("此事项对话为空。请在下方发送第一条消息。");
    expect(translateZhCnText("Dark Factory Bridge 插件：以中文界面显示投影、Journal 游标、Provider 健康和 rehydrate receipt；不会成为权威执行记录。"))
      .toBe("Dark Factory Bridge 插件：以中文界面显示投影、日志游标、提供方健康和重建回执；不会成为权威执行记录。");
    expect(translateZhCnText("Dark Factory environment driver：支持确定性 mock mode、本地 HTTP mode 和 remote provider alpha mode。所有投影均非权威；Dark Factory Journal remains truth source。"))
      .toBe("Dark Factory 环境驱动：支持确定性模拟模式、本地 HTTP 模式和远程提供方 alpha 模式。所有投影均非权威；Dark Factory 日志仍是事实来源。");
    expect(translateZhCnText("Dark Factory 环境驱动：支持确定性模拟模式、本地 HTTP mode 和远程提供方 alpha 模式。所有投影均非权威；Dark Factory Journal remains truth source。"))
      .toBe("Dark Factory 环境驱动：支持确定性模拟模式、本地 HTTP 模式和远程提供方 alpha 模式。所有投影均非权威；Dark Factory 日志仍是事实来源。");
    expect(translateZhCnText("HTTP endpoint：HTTP 或远程模式使用的 Dark Factory HTTP 端点"))
      .toBe("HTTP 端点：HTTP 或远程模式使用的 Dark Factory HTTP 端点");
    expect(translateZhCnText("Journal 游标、Provider 健康和 rehydrate receipt；"))
      .toBe("日志游标、提供方健康和重建回执；");
    expect(translateZhCnText("Used when a run requests the cheap profile (e.g. routine summaries). The primary model stays unchanged."))
      .toBe("当运行请求低成本配置（例如例程摘要）时使用。主模型保持不变。");
    expect(translateZhCnText("你 cannot remove yourself.")).toBe("不能移除你自己。");
    expect(translateZhCnText("Enable Environments in instance experimental settings to manage company execution targets."))
      .toBe("请在实例实验性设置中启用环境，以管理公司执行目标。");
    expect(translateZhCnText("启用环境 in instance experimental settings to manage company execution targets."))
      .toBe("请在实例实验性设置中启用环境，以管理公司执行目标。");
  });

  it("translates known phrases embedded in dynamic shell text", () => {
    expect(translateZhCnText("Loading plugin details...")).toBe("正在加载插件详情...");
    expect(translateZhCnText("Open board now")).toBe("打开看板 now");
    expect(translateZhCnText("Company Environments are enabled")).toBe("公司环境已启用");
    expect(translateZhCnText("Search for a command to run...")).toBe("搜索要运行的命令...");
  });

  it("translates browser-audited design guide sample copy while preserving technical identifiers", () => {
    expect(translateZhCnText("Design Guide")).toBe("设计指南");
    expect(translateZhCnText("Buttons")).toBe("按钮");
    expect(translateZhCnText("StatusIcon (interactive)")).toBe("状态图标（可交互）");
    expect(translateZhCnText("Page Title — text-xl font-bold")).toBe("页面标题 - text-xl font-bold");
    expect(translateZhCnText("Click the icon to change status (current: todo)"))
      .toBe("点击图标更改状态（当前：待处理）");
    expect(translateZhCnText("Last run succeeded 24s ago. Next timer run in 9m."))
      .toBe("上次运行在 24s 前成功。下次定时运行将在 9m 后开始。");
    expect(translateZhCnText("No items to show. Create your first one to get started."))
      .toBe("暂无可显示项目。创建第一个项目即可开始。");
    expect(translateZhCnText("Component Coverage")).toBe("组件覆盖");
    expect(translateZhCnText("Sizes")).toBe("尺寸");
    expect(translateZhCnText("Clear all")).toBe("全部清除");
    expect(translateZhCnText("running idle archived planned achieved completed failed timed out"))
      .toBe("运行中 空闲 已归档 已计划 已达成 已完成 失败 已超时");
    expect(translateZhCnText("backlog todo in progress in review done cancelled"))
      .toBe("待办 待处理 进行中 复核中 完成 已取消");
    expect(translateZhCnText("timer assignment on_demand automation")).toBe("定时器 分配 按需 自动化");
    expect(translateZhCnText("Config Details Comments Comment")).toBe("配置 详情 评论 评论");
    expect(translateZhCnText("Textarea")).toBe("文本域");
    expect(translateZhCnText("Click to edit this text")).toBe("点击编辑此文本");
    expect(translateZhCnText("This is an editable description. Click to edit it — the textarea auto-sizes to fit the content without layout shift."))
      .toBe("这是一段可编辑描述。点击即可编辑，文本域会自动调整高度，避免布局跳动。");
    expect(translateZhCnText("Heartbeat run #3: completed successfully")).toBe("心跳运行 #3：已成功完成");
    expect(translateZhCnText("INFO Agent started successfully")).toBe("INFO 代理已成功启动");
    expect(translateZhCnText("[12:00:01] INFO Agent started successfully")).toBe("[12:00:01] INFO 代理已成功启动");
    expect(translateZhCnText("ERROR Connection timeout to upstream service")).toBe("ERROR 连接上游服务超时");
    expect(translateZhCnText("Card Title — text-sm font-medium")).toBe("卡片标题 - text-sm font-medium");
    expect(translateZhCnText("Cmd+K / Ctrl+K")).toBe("Cmd+K / Ctrl+K");
    expect(translateZhCnText("--background")).toBe("--background");
  });

  it("leaves unknown protocol and product identifiers unchanged", () => {
    expect(translateZhCnText("onEnvironmentExecute")).toBe("onEnvironmentExecute");
    expect(translateZhCnText("dark-factory-journal")).toBe("dark-factory-journal");
    expect(translateZhCnText("Paperclip")).toBe("Paperclip");
  });
});
