const ZH_CN_ATTRIBUTE_NAMES = [
  "aria-label",
  "title",
  "placeholder",
  "alt",
] as const;

const EXACT_TRANSLATIONS: Record<string, string> = {
  "Home": "首页",
  "Issues": "事项",
  "Create": "新建",
  "Agents": "代理",
  "Inbox": "收件箱",
  "Dashboard": "仪表盘",
  "Settings": "设置",
  "Instance Settings": "实例设置",
  "Instance settings": "实例设置",
  "Company Settings": "公司设置",
  "Company settings": "公司设置",
  "Access": "访问权限",
  "Plugins": "插件",
  "Plugins are alpha.": "插件功能仍处于 alpha 阶段。",
  "Plugin Settings": "插件设置",
  "Environments": "环境",
  "Adapters": "适配器",
  "Profile": "个人资料",
  "Edit profile": "编辑个人资料",
  "View profile": "查看个人资料",
  "Documentation": "文档",
  "Sign out": "退出登录",
  "Signing out...": "正在退出登录...",
  "Sign in": "登录",
  "Sign in to continue": "登录后继续",
  "Sign in and continue": "登录并继续",
  "Create account": "创建账户",
  "Create account and continue": "创建账户并继续",
  "Create your account": "创建你的账户",
  "Create your Paperclip account": "创建 Paperclip 账户",
  "Sign in to Paperclip": "登录 Paperclip",
  "Create your first company": "创建第一个公司",
  "Create another company": "创建另一个公司",
  "Create invite": "创建邀请",
  "Invite created": "邀请已创建",
  "New Company": "新建公司",
  "New issue": "新建事项",
  "New Issue": "新建事项",
  "Search": "搜索",
  "Search for a command to run...": "搜索要运行的命令...",
  "Search by name or email": "按姓名或邮箱搜索",
  "Keyboard shortcuts": "键盘快捷键",
  "Open account menu": "打开账户菜单",
  "Skip to Main content": "跳到主内容",
  "Skip to Main 内容": "跳到主内容",
  "Open Paperclip docs in a new tab.": "在新标签页打开 Paperclip 文档。",
  "Jump back to the last settings page you opened.": "返回上次打开的设置页。",
  "Update your display name and avatar.": "更新显示名称和头像。",
  "Open your activity, task, and usage ledger.": "打开你的活动、任务和用量记录。",
  "Toggle the app appearance.": "切换应用外观。",
  "End this browser session.": "结束当前浏览器会话。",
  "Switch to light mode": "切换到浅色模式",
  "Switch to dark mode": "切换到深色模式",
  "Local workspace board": "本地工作区看板",
  "Account": "账户",
  "Board": "看板",
  "Loading...": "正在加载...",
  "Loading": "正在加载",
  "Saving...": "正在保存...",
  "Saving…": "正在保存...",
  "Save": "保存",
  "Cancel": "取消",
  "Delete": "删除",
  "Archive": "归档",
  "Unarchive": "取消归档",
  "Refresh": "刷新",
  "Retry": "重试",
  "Close": "关闭",
  "Copied!": "已复制",
  "Copy": "复制",
  "Open": "打开",
  "Continue": "继续",
  "Back": "返回",
  "Next": "下一步",
  "Done": "完成",
  "Configure": "配置",
  "Command Palette": "命令面板",
  "Examples": "示例",
  "Example": "示例",
  "Not installed": "未安装",
  "Installed Plugins": "已安装插件",
  "Installed 插件": "已安装插件",
  "Install Example": "安装示例",
  "Hello World Widget (Example)": "Hello World Widget（示例）",
  "File Browser (Example)": "File Browser（示例）",
  "Kitchen Sink (Example)": "Kitchen Sink（示例）",
  "Orchestration Smoke (Example)": "Orchestration Smoke（示例）",
  "Reference UI plugin that adds a simple Hello World widget to the Paperclip dashboard.": "参考 UI 插件：在 Paperclip 仪表盘中添加一个简单的 Hello World 小组件。",
  "Example plugin that adds a Files link in project navigation plus a project detail file browser.": "示例插件：在项目导航中添加文件入口，并在项目详情中提供文件浏览器。",
  "Reference plugin that demonstrates the current Paperclip plugin API surface, bridge flows, UI extension surfaces, jobs, webhooks, tools, streams, and trusted local workspace/process demos.": "参考插件：演示当前 Paperclip 插件 API、bridge 流程、UI 扩展面、任务、webhook、工具、流式能力，以及受信任本地工作区/进程示例。",
  "Acceptance fixture for scoped plugin routes, restricted database namespaces, issue orchestration, documents, wakeups, summaries, and UI status surfaces.": "验收 fixture：覆盖受限插件路由、受限数据库命名空间、事项编排、文档、唤醒、摘要和 UI 状态面。",
  "The plugin runtime and API surface are still changing. Expect breaking changes while this feature settles.": "插件运行时和 API 面仍在变化。该能力稳定前可能出现破坏性变更。",
  "ready": "就绪",
  "blocked": "已阻断",
  "needs attention": "需要处理",
  "Resume": "继续",
  "Pause": "暂停",
  "Stop": "停止",
  "Edit": "编辑",
  "Upload": "上传",
  "Download": "下载",
  "Remove item": "移除项目",
  "Choose a role": "选择角色",
  "Select an agent": "选择代理",
  "Select a file to inspect.": "选择一个文件进行检查。",
  "Search users": "搜索用户",
  "No results found.": "未找到结果。",
  "No companies": "暂无公司",
  "No goals.": "暂无目标。",
  "No revisions yet": "暂无修订记录",
  "No labels": "无标签",
  "No project": "无项目",
  "No parent": "无父项",
  "No assignee": "未分配负责人",
  "Unassigned": "未分配",
  "Unlimited budget": "无限预算",
  "Uploading logo...": "正在上传标志...",
  "Saved": "已保存",
  "Rejected": "已拒绝",
  "Approved": "已批准",
  "Confirmed": "已确认",
  "Declined": "已拒绝",
  "Passed": "已通过",
  "Fixed": "固定",
  "True": "是",
  "False": "否",
  "Old": "旧版本",
  "New": "新版本",
  "Content": "内容",
  "Plain": "明文",
  "Secret": "密钥",
  "Source": "来源",
  "Key": "键",
  "Mode": "模式",
  "Label": "标签",
  "Type": "类型",
  "Name": "名称",
  "Email": "邮箱",
  "Password": "密码",
  "Role": "角色",
  "Status": "状态",
  "Priority": "优先级",
  "Assignee": "负责人",
  "Creator": "创建者",
  "Reviewer": "复核人",
  "Approver": "审批人",
  "Description": "描述",
  "Summary": "摘要",
  "Title": "标题",
  "Risks": "风险",
  "Skills": "技能",
  "Capabilities": "能力",
  "Properties": "属性",
  "Documents": "文档",
  "Attachments": "附件",
  "Runs": "运行",
  "Workspace": "工作区",
  "Workspace card": "工作区卡片",
  "Workspace commands": "工作区命令",
  "Workspace facts": "工作区事实",
  "Services and jobs": "服务与任务",
  "Workspace settings": "工作区设置",
  "Source control": "源码控制",
  "Paths": "路径",
  "Branch": "分支",
  "Path": "路径",
  "Service": "服务",
  "Current state": "当前状态",
  "Advanced runtime JSON": "高级运行时 JSON",
  "General": "通用",
  "Experimental": "实验性",
  "Enable Environments": "启用环境",
  "Enable Isolated Workspaces": "启用隔离工作区",
  "Auto-Restart Dev Server When Idle": "空闲时自动重启开发服务器",
  "Auto-Create Issue Recovery Tasks": "自动创建事项恢复任务",
  "Deployment and auth": "部署与认证",
  "Backup retention": "备份保留",
  "Daily": "每日",
  "Weekly": "每周",
  "Instance Access": "实例访问权限",
  "Company Access": "公司访问权限",
  "Company Invites": "公司邀请",
  "Join Request Queue": "加入请求队列",
  "Company Environments": "公司环境",
  "Environment support by adapter": "按适配器查看环境支持",
  "Local": "本地",
  "SSH": "SSH",
  "Sandbox": "沙箱",
  "Plugin Manager": "插件管理器",
  "Install Plugin": "安装插件",
  "Available Plugins": "可用插件",
  "Loading plugins...": "正在加载插件...",
  "Failed to load plugins.": "加载插件失败。",
  "About": "关于",
  "Author": "作者",
  "Categories": "分类",
  "Configure this plugin from Company Environments.": "请从公司环境中配置此插件。",
  "Loading plugin details...": "正在加载插件详情...",
  "Reinstall Adapter": "重新安装适配器",
  "Package": "包",
  "Current": "当前",
  "Latest on npm": "npm 最新版本",
  "Install External Adapter": "安装外部适配器",
  "Loading adapters...": "正在加载适配器...",
  "Activity": "活动",
  "Recent financial events": "最近财务事件",
  "Financial event mix": "财务事件组合",
  "Finance ledger": "财务账本",
  "Providers": "Provider",
  "Billers": "计费方",
  "Budgets": "预算",
  "All providers": "全部 Provider",
  "All billers": "全部计费方",
  "No finance events in this period.": "此期间暂无财务事件。",
  "Top-ups, fees, credits, commitments, and other non-request charges.": "充值、费用、抵扣、承诺用量及其他非请求费用。",
  "Account-level charges grouped by event kind.": "按事件类型分组的账户级费用。",
  "Run ledger": "运行账本",
  "Run": "运行",
  "Child work": "子工作",
  "Elapsed": "已用时间",
  "Last useful action": "上次有效动作",
  "Next action:": "下一步动作：",
  "Runtime logs": "运行日志",
  "Run routine": "运行例程",
  "New routine": "新建例程",
  "Variables": "变量",
  "Default value": "默认值",
  "No default": "无默认值",
  "Options": "选项",
  "Schedule": "计划",
  "Signing mode": "签名模式",
  "Replay window (seconds)": "重放窗口（秒）",
  "Advanced delivery settings": "高级投递设置",
  "Sort": "排序",
  "Group": "分组",
  "For": "对象",
  "Project": "项目",
  "Sub-issue": "子事项",
  "Sub-issues": "子事项",
  "Sub-issue of": "父事项",
  "New document": "新建文档",
  "Revision history": "修订历史",
  "Loading revisions...": "正在加载修订记录...",
  "Select two revisions to compare.": "请选择两个修订版本进行比较。",
  "Both sides are the same revision.": "两侧是同一个修订版本。",
  "Upload attachment": "上传附件",
  "Filters": "筛选",
  "Quick filters": "快速筛选",
  "All categories": "全部分类",
  "My recent issues": "我最近的事项",
  "Join requests": "加入请求",
  "Failed runs": "失败运行",
  "Alerts": "告警",
  "All approval statuses": "全部审批状态",
  "Pending approval": "待审批",
  "Request type": "请求类型",
  "Pending human joins": "待处理人工加入",
  "Humans": "人员",
  "User account": "用户账户",
  "Current memberships": "当前成员关系",
  "Invite history": "邀请历史",
  "Latest invite link": "最新邀请链接",
  "Invite history below keeps the audit trail.": "下方邀请历史会保留审计轨迹。",
  "Create new company": "创建新公司",
  "Rename on conflict": "冲突时重命名",
  "Skip on conflict": "冲突时跳过",
  "Replace existing": "替换已有内容",
  "Package files": "包文件",
  "Import source": "导入来源",
  "Display name": "显示名称",
  "Loading profile...": "正在加载个人资料...",
  "Tokens": "Token",
  "Spend": "花费",
  "Created": "创建时间",
  "Last 14 days": "最近 14 天",
  "Recent tasks": "最近任务",
  "No touched tasks yet.": "尚无接触过的任务。",
  "New Agent": "新建代理",
  "Add a new agent": "添加新代理",
  "Company skills": "公司技能",
  "Identity": "身份",
  "Execution": "执行",
  "Company default (Local)": "公司默认（本地）",
  "Adapter": "适配器",
  "No icons match": "没有匹配的图标",
  "Unsaved changes": "有未保存更改",
  "Specify path manually": "手动指定路径",
  "Find the folder in Finder.": "在 Finder 中找到文件夹。",
  "Paste the result into the path input.": "将结果粘贴到路径输入框。",
  "Windows (File Explorer)": "Windows（文件资源管理器）",
  "How to get a full path": "如何获取完整路径",
  "Open issue": "打开事项",
  "Open board": "打开看板",
  "Go home": "返回首页",
  "Sign in required": "需要登录",
  "Sign in / Create account": "登录 / 创建账户",
  "Approve Paperclip CLI access": "批准 Paperclip CLI 访问",
  "Invalid CLI auth URL.": "CLI 认证 URL 无效。",
  "Loading CLI auth challenge...": "正在加载 CLI 认证挑战...",
  "CLI auth challenge unavailable": "CLI 认证挑战不可用",
  "CLI auth challenge unavailable.": "CLI 认证挑战不可用。",
  "CLI access approved": "CLI 访问已批准",
  "Invalid board claim URL.": "看板认领 URL 无效。",
  "Loading claim challenge...": "正在加载认领挑战...",
  "Claim challenge unavailable": "认领挑战不可用",
  "Claim challenge unavailable.": "认领挑战不可用。",
  "Board ownership claimed": "看板所有权已认领",
  "Invalid invite token.": "邀请 token 无效。",
  "Loading invite...": "正在加载邀请...",
  "Checking your access...": "正在检查你的访问权限...",
  "Invite not available": "邀请不可用",
  "Opening company...": "正在打开公司...",
  "Approval page": "审批页面",
  "Claim secret": "认领密钥",
  "Message from inviter": "邀请人留言",
  "Submit agent details": "提交代理详情",
  "Agent name": "代理名称",
  "Adapter type": "适配器类型",
  "Issue chat review surface": "事项聊天评审界面",
  "Issue documents": "事项文档",
  "Baseline metrics": "基线指标",
  "Fixture shape": "Fixture 形态",
  "Working": "工作中",
  "What to evaluate on this page": "此页面需要评估的内容",
  "Run Transcript Fixtures": "运行转录 Fixture",
  "User": "用户",
  "Input": "输入",
  "Result": "结果",
  "More": "更多",
  "Company rail": "公司栏",
  "Main company nav": "公司主导航",
  "Instance sidebar": "实例侧边栏",
  "Company settings sidebar": "公司设置侧边栏",
  "Breadcrumbs": "面包屑",
  "Account menu": "账户菜单",
  "Design Guide": "设计指南",
  "Restart Required": "需要重启",
  "Auto-Restart On": "自动重启已开启",
  "Worktree": "工作树",
  "Changed": "已变更",
  "Pending migrations": "待执行迁移",
  "Dismiss notification": "关闭通知",
  "Mobile navigation": "移动端导航",
  "Ask them to visit Company Settings → Access to approve your request.": "请对方进入 公司设置 → 访问权限 审批你的请求。",
  "Press": "按下",
  "to close": "关闭",
  "then": "然后",
};

const PHRASE_TRANSLATIONS: Array<[RegExp, string]> = [
  [/\bHome\b/g, "首页"],
  [/\bIssues\b/g, "事项"],
  [/\bCreate\b/g, "新建"],
  [/\bAgents\b/g, "代理"],
  [/\bInbox\b/g, "收件箱"],
  [/\bDashboard\b/g, "仪表盘"],
  [/\bInstance settings\b/gi, "实例设置"],
  [/\bCompany settings\b/gi, "公司设置"],
  [/\bSettings\b/g, "设置"],
  [/\bKeyboard shortcuts\b/gi, "键盘快捷键"],
  [/\bOpen account menu\b/gi, "打开账户菜单"],
  [/\bNew issue\b/gi, "新建事项"],
  [/\bCreate your first company\b/gi, "创建第一个公司"],
  [/\bGet started by creating a company\.?/gi, "先创建一个公司即可开始。"],
  [/\bGet started by creating a company and your first agent\.?/gi, "先创建一个公司和第一个代理即可开始。"],
  [/\bRun onboarding again to create another company and seed its first agent\.?/gi, "再次运行引导流程，创建另一个公司并初始化第一个代理。"],
  [/\bRun onboarding again to add an agent and a starter task for this company\.?/gi, "再次运行引导流程，为该公司添加代理和起始任务。"],
  [/\bAdd Agent\b/g, "添加代理"],
  [/\bStart Onboarding\b/g, "开始引导"],
  [/\bNew Company\b/g, "新建公司"],
  [/\bSearch current page or quick search\b/gi, "搜索当前页面或快速搜索"],
  [/\bGo to inbox\b/gi, "转到收件箱"],
  [/\bFocus comment composer\b/gi, "聚焦评论输入框"],
  [/\bShow keyboard shortcuts\b/gi, "显示键盘快捷键"],
  [/\bToggle sidebar\b/gi, "切换侧边栏"],
  [/\bToggle panel\b/gi, "切换面板"],
  [/\bMark as read\b/gi, "标为已读"],
  [/\bMark as unread\b/gi, "标为未读"],
  [/\bQuick-archive back to inbox\b/gi, "快速归档并返回收件箱"],
  [/\bShortcuts are disabled in text fields\b/gi, "文本输入区域中快捷键已停用"],
  [/\bNo account yet\?/gi, "还没有账户？"],
  [/\bAlready signed up before\?/gi, "之前已经注册过？"],
  [/\bUse your email and password to access this instance\.?/gi, "使用邮箱和密码访问此实例。"],
  [/\bCreate an account for this instance\.?/gi, "为此实例创建账户。"],
  [/\bCompany access updated\b/gi, "公司访问权限已更新"],
  [/\bCompany access\b/gi, "公司访问权限"],
  [/\bSave company access\b/gi, "保存公司访问权限"],
  [/\bLoading user access…/g, "正在加载用户访问权限..."],
  [/\bFailed to load user access\.?/gi, "加载用户访问权限失败。"],
  [/\bSelect a user to inspect instance access\.?/gi, "选择用户以查看实例访问权限。"],
  [/\bInstance admin access is required to manage users\.?/gi, "需要实例管理员权限才能管理用户。"],
  [/\bSearch users, manage instance-admin status, and control which companies they can access\.?/gi, "搜索用户、管理实例管理员状态，并控制其可访问的公司。"],
  [/\bToggle company membership for this user\. New access defaults to an active operator membership\.?/gi, "切换该用户的公司成员身份。新增访问权限默认为活跃操作员成员。"],
  [/\bactive company memberships\b/gi, "个活跃公司成员身份"],
  [/\bThis URL includes the current Paperclip domain returned by the server\.?/gi, "该 URL 包含服务器返回的当前 Paperclip 域名。"],
  [/\bAsk them to visit Company Settings → Access to approve your request\.?/gi, "请对方进入 公司设置 → 访问权限 审批你的请求。"],
  [/\bYou've been invited to join Paperclip\b/gi, "你已受邀加入 Paperclip"],
  [/\bAccept company invite\b/gi, "接受公司邀请"],
  [/\bRequested access\b/gi, "请求的访问权限"],
  [/\bCan view company work and follow along without operational permissions\.?/gi, "可查看公司工作并跟进进展，但没有操作权限。"],
  [/\bRecommended for people who need to help run work without managing access\.?/gi, "适合协助执行工作但不管理访问权限的成员。"],
  [/\bRecommended for operators who need to invite people, create agents, and approve joins\.?/gi, "适合需要邀请成员、创建代理并审批加入请求的操作员。"],
  [/\bFull company access, including membership and permission management\.?/gi, "完整公司访问权限，包括成员和权限管理。"],
  [/\bCan create agents, invite users, assign tasks, and approve join requests\.?/gi, "可创建代理、邀请用户、分配任务并审批加入请求。"],
  [/\bSelect a company to view costs\.?/gi, "选择公司以查看成本。"],
  [/\bBy project\b/gi, "按项目"],
  [/\bNo project-attributed run costs yet\.?/gi, "暂无归属到项目的运行成本。"],
  [/\bUnattributed\b/gi, "未归属"],
  [/\bPending approvals\b/gi, "待审批"],
  [/\bPaused agents\b/gi, "已暂停代理"],
  [/\bPaused projects\b/gi, "已暂停项目"],
  [/\bProject execution blocked by budget\b/gi, "项目执行被预算阻断"],
  [/\bBudget override approvals awaiting board action\b/gi, "等待看板处理的预算覆盖审批"],
  [/\bCompany-wide monthly policy\.?/gi, "公司级月度策略。"],
  [/\bRecurring monthly spend policies for individual agents\.?/gi, "单个代理的月度周期支出策略。"],
  [/\bLifetime spend policies for execution-bound projects\.?/gi, "执行绑定项目的生命周期支出策略。"],
  [/\bNo budget policies yet\.?/gi, "尚无预算策略。"],
  [/\bRestart\b/g, "重启"],
  [/\bupdated\b/g, "更新于"],
  [/\blive run\b/g, "个实时运行"],
  [/\blive runs\b/g, "个实时运行"],
  [/\bWaiting for\b/g, "正在等待"],
  [/\bto finish\b/g, "完成"],
  [/\bAuto-restart will trigger when the instance is idle\b/gi, "实例空闲后将自动重启"],
  [/\bbackend files changed and migrations are pending\b/gi, "后端文件已变更，且存在待执行迁移"],
  [/\bpending migrations need a fresh boot\b/gi, "待执行迁移需要重新启动"],
  [/\bbackend files changed since this server booted\b/gi, "服务器启动后后端文件已变更"],
];

const VALUE_PATTERN = /^[\s\p{L}\p{N}.,:;!?'"()/_→+\-·…%]+$/u;
const EXACT_PHRASE_TRANSLATIONS = Object.entries(EXACT_TRANSLATIONS)
  .filter(([source]) => /[A-Za-z]/.test(source) && source.length > 2)
  .sort(([left], [right]) => right.length - left.length);

let observer: MutationObserver | null = null;
let scheduled = false;

export function translateZhCnText(input: string): string {
  if (!input.trim()) return input;
  const exact = EXACT_TRANSLATIONS[input.trim()];
  if (exact) return input.replace(input.trim(), exact);

  let output = translateExactPhrases(input);
  for (const [pattern, replacement] of PHRASE_TRANSLATIONS) {
    output = output.replace(pattern, replacement);
  }
  return output;
}

export function localizeDocumentZhCn(root: ParentNode = document): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = "zh-CN";
  if (document.title === "Paperclip" || /Paperclip/i.test(document.title)) {
    document.title = translateZhCnText(document.title);
  }
  localizeTextNodes(root);
  localizeAttributes(root);
}

export function installZhCnLocalization(): void {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") return;
  localizeDocumentZhCn(document);
  if (observer) return;

  observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      localizeDocumentZhCn(document);
    });
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [...ZH_CN_ATTRIBUTE_NAMES],
    childList: true,
    characterData: true,
    subtree: true,
  });
}

export function uninstallZhCnLocalizationForTests(): void {
  observer?.disconnect();
  observer = null;
  scheduled = false;
}

function localizeTextNodes(root: ParentNode): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (["SCRIPT", "STYLE", "CODE", "PRE", "KBD", "TEXTAREA"].includes(parent.tagName)) {
        return NodeFilter.FILTER_REJECT;
      }
      const value = node.nodeValue ?? "";
      if (!VALUE_PATTERN.test(value) || /[{}<>]/.test(value)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    nodes.push(walker.currentNode as Text);
  }
  for (const node of nodes) {
    const current = node.nodeValue ?? "";
    const translated = translateZhCnText(current);
    if (translated !== current) {
      node.nodeValue = translated;
    }
  }
}

function localizeAttributes(root: ParentNode): void {
  const elements = root instanceof Element
    ? [root, ...Array.from(root.querySelectorAll("*"))]
    : Array.from(root.querySelectorAll("*"));
  for (const element of elements) {
    for (const attribute of ZH_CN_ATTRIBUTE_NAMES) {
      const value = element.getAttribute(attribute);
      if (!value || !VALUE_PATTERN.test(value)) continue;
      const translated = translateZhCnText(value);
      if (translated !== value) {
        element.setAttribute(attribute, translated);
      }
    }
  }
}

function translateExactPhrases(input: string): string {
  let output = input;
  for (const [source, replacement] of EXACT_PHRASE_TRANSLATIONS) {
    if (!output.includes(source)) continue;
    const pattern = new RegExp(
      `(^|[^\\p{L}\\p{N}_-])${escapeRegExp(source)}(?=$|[^\\p{L}\\p{N}_-])`,
      "gu",
    );
    output = output.replace(pattern, `$1${replacement}`);
  }
  return output;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
