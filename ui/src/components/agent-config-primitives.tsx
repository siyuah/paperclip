import { useState, useRef, useEffect, useCallback } from "react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HelpCircle, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";
import { AGENT_ROLE_LABELS } from "@paperclipai/shared";

/* ---- Help text for (?) tooltips ---- */
export const help: Record<string, string> = {
  name: "该代理的显示名称。",
  title: "组织图中显示的职位名称。",
  role: "组织角色。用于决定位置和能力边界。",
  reportsTo: "该代理在组织层级中汇报给谁。",
  capabilities: "描述这个代理能做什么，会显示在组织图中，并用于任务路由。",
  adapterType: "该代理的运行方式：本地 CLI（Claude/Codex/OpenCode）、OpenClaw Gateway、派生进程或通用 HTTP webhook。",
  cwd: "已弃用的本地适配器旧工作目录兜底。现有代理可能仍保留该值，新配置应改用项目工作区。",
  promptTemplate: "每次心跳都会发送。请保持简短和动态，用于当前任务 framing，而不是大型静态指令。支持 {{ agent.id }}、{{ agent.name }}、{{ agent.role }} 等模板变量。",
  model: "覆盖适配器默认使用的模型。",
  thinkingEffort: "控制模型推理深度。不同适配器和模型支持的取值可能不同。",
  chrome: "通过 --chrome 启用 Claude 的 Chrome 集成。",
  dangerouslySkipPermissions: "在适配器支持时，自动批准权限提示以无人值守运行。",
  dangerouslyBypassSandbox: "让 Codex 无沙盒限制运行。需要访问文件系统或网络时使用。",
  search: "允许运行期间使用 Codex 网络搜索能力。",
  fastMode: "启用 Codex Fast 模式。该模式会更快消耗 credits/tokens，支持 GPT-5.4 和手动 Codex 模型 ID。",
  workspaceStrategy: "Paperclip 如何为该代理实现执行工作区。常规 cwd 执行使用 project_primary；按事项隔离检出使用 git_worktree。",
  workspaceBaseRef: "创建 worktree 分支时使用的基础 git ref。留空则使用解析出的工作区 ref 或 HEAD。",
  workspaceBranchTemplate: "派生分支命名模板。支持 {{issue.identifier}}、{{issue.title}}、{{agent.name}}、{{project.id}}、{{workspace.repoRef}} 和 {{slug}}。",
  worktreeParentDir: "派生 worktree 的创建目录。支持绝对路径、~ 前缀路径和仓库相对路径。",
  runtimeServicesJson: "可选的工作区运行时服务定义。用于绑定到工作区的共享应用服务器、worker 或其他长期伴随进程。",
  maxTurnsPerRun: "每次心跳运行允许的最大代理轮次（工具调用）。",
  command: "要执行的命令，例如 node 或 python。",
  localCommand: "覆盖适配器要调用的 CLI 命令路径，例如 /usr/local/bin/claude、codex、opencode。",
  args: "命令行参数，用逗号分隔。",
  extraArgs: "本地适配器的额外 CLI 参数，用逗号分隔。",
  envVars: "注入到适配器进程的环境变量。可使用明文值或 secret 引用。",
  bootstrapPrompt: "只在 Paperclip 启动新会话时发送。用于稳定的启动说明，不会在每次心跳重复发送。",
  payloadTemplateJson: "可选 JSON，在 Paperclip 添加标准唤醒和工作区字段前合并到远程适配器请求体中。",
  webhookUrl: "代理被调用时接收 POST 请求的 URL。",
  heartbeatInterval: "按定时器自动运行该代理。适合周期性检查新工作等任务。",
  intervalSec: "两次自动心跳调用之间的秒数。",
  timeoutSec: "一次运行被终止前允许的最长秒数。0 表示不超时。",
  graceSec: "发送中断后等待多少秒再强制结束进程。",
  wakeOnDemand: "允许通过任务分配、API 调用、UI 操作或自动化系统唤醒该代理。",
  cooldownSec: "连续两次心跳运行之间的最小间隔秒数。",
  maxConcurrentRuns: "该代理可同时执行的最大心跳运行数。",
  budgetMonthlyCents: "月度支出上限，单位为美分。0 表示不限制。",
};

import { getAdapterLabels } from "../adapters/adapter-display-registry";

export const adapterLabels = getAdapterLabels();

export const roleLabels = AGENT_ROLE_LABELS as Record<string, string>;

/* ---- Primitive components ---- */

export function HintIcon({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex text-muted-foreground/50 hover:text-muted-foreground transition-colors">
          <HelpCircle className="h-3 w-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <label className="text-xs text-muted-foreground">{label}</label>
        {hint && <HintIcon text={hint} />}
      </div>
      {children}
    </div>
  );
}

export function ToggleField({
  label,
  hint,
  checked,
  onChange,
  toggleTestId,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  toggleTestId?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        {hint && <HintIcon text={hint} />}
      </div>
      <button
        data-slot="toggle"
        data-testid={toggleTestId}
        type="button"
        className={cn(
          "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
          checked ? "bg-green-600" : "bg-muted"
        )}
        onClick={() => onChange(!checked)}
      >
        <span
          className={cn(
            "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
            checked ? "translate-x-4.5" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}

export function ToggleWithNumber({
  label,
  hint,
  checked,
  onCheckedChange,
  number,
  onNumberChange,
  numberLabel,
  numberHint,
  numberPrefix,
  showNumber,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  number: number;
  onNumberChange: (v: number) => void;
  numberLabel: string;
  numberHint?: string;
  numberPrefix?: string;
  showNumber: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{label}</span>
          {hint && <HintIcon text={hint} />}
        </div>
        <ToggleSwitch
          checked={checked}
          onCheckedChange={onCheckedChange}
        />
      </div>
      {showNumber && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {numberPrefix && <span>{numberPrefix}</span>}
          <input
            type="number"
            className="w-16 rounded-md border border-border px-2 py-0.5 bg-transparent outline-none text-xs font-mono text-center"
            value={number}
            onChange={(e) => onNumberChange(Number(e.target.value))}
          />
          <span>{numberLabel}</span>
          {numberHint && <HintIcon text={numberHint} />}
        </div>
      )}
    </div>
  );
}

export function CollapsibleSection({
  title,
  icon,
  open,
  onToggle,
  bordered,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  bordered?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(bordered && "border-t border-border")}>
      <button
        className="flex items-center gap-2 w-full px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-accent/30 transition-colors"
        onClick={onToggle}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {icon}
        {title}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

export function AutoExpandTextarea({
  value,
  onChange,
  onBlur,
  placeholder,
  minRows,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  minRows?: number;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rows = minRows ?? 3;
  const lineHeight = 20;
  const minHeight = rows * lineHeight;

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`;
  }, [minHeight]);

  useEffect(() => { adjustHeight(); }, [value, adjustHeight]);

  return (
    <textarea
      ref={textareaRef}
      className="w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40 resize-none overflow-hidden"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      style={{ minHeight }}
    />
  );
}

/**
 * Text input that manages internal draft state.
 * Calls `onCommit` on blur (and optionally on every change if `immediate` is set).
 */
export function DraftInput({
  value,
  onCommit,
  immediate,
  className,
  ...props
}: {
  value: string;
  onCommit: (v: string) => void;
  immediate?: boolean;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "className">) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <input
      className={className}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        if (immediate) onCommit(e.target.value);
      }}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      {...props}
    />
  );
}

/**
 * Auto-expanding textarea with draft state and blur-commit.
 */
export function DraftTextarea({
  value,
  onCommit,
  immediate,
  placeholder,
  minRows,
}: {
  value: string;
  onCommit: (v: string) => void;
  immediate?: boolean;
  placeholder?: string;
  minRows?: number;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rows = minRows ?? 3;
  const lineHeight = 20;
  const minHeight = rows * lineHeight;

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`;
  }, [minHeight]);

  useEffect(() => { adjustHeight(); }, [draft, adjustHeight]);

  return (
    <textarea
      ref={textareaRef}
      className="w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40 resize-none overflow-hidden"
      placeholder={placeholder}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        if (immediate) onCommit(e.target.value);
      }}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      style={{ minHeight }}
    />
  );
}

/**
 * Number input with draft state and blur-commit.
 */
export function DraftNumberInput({
  value,
  onCommit,
  immediate,
  className,
  ...props
}: {
  value: number;
  onCommit: (v: number) => void;
  immediate?: boolean;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "className" | "type">) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  return (
    <input
      type="number"
      className={className}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        if (immediate) onCommit(Number(e.target.value) || 0);
      }}
      onBlur={() => {
        const num = Number(draft) || 0;
        if (num !== value) onCommit(num);
      }}
      {...props}
    />
  );
}

/**
 * "Choose" button that opens a dialog explaining the user must manually
 * type the path due to browser security limitations.
 */
export function ChoosePathButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent/50 transition-colors shrink-0"
        onClick={() => setOpen(true)}
      >
        选择
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>手动指定路径</DialogTitle>
            <DialogDescription>
              浏览器安全限制会阻止应用通过文件选择器读取完整本地路径。
              请复制绝对路径并粘贴到输入框中。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <section className="space-y-1.5">
              <p className="font-medium">macOS（Finder）</p>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>在 Finder 中找到目标文件夹。</li>
                <li>按住 <kbd>Option</kbd> 并右键点击该文件夹。</li>
                <li>点击“复制 &lt;文件夹名称&gt; 为路径名”。</li>
                <li>将结果粘贴到路径输入框。</li>
              </ol>
              <p className="rounded-md bg-muted px-2 py-1 font-mono text-xs">
                /Users/yourname/Documents/project
              </p>
            </section>
            <section className="space-y-1.5">
              <p className="font-medium">Windows（文件资源管理器）</p>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>在文件资源管理器中找到目标文件夹。</li>
                <li>按住 <kbd>Shift</kbd> 并右键点击该文件夹。</li>
                <li>点击“复制为路径”。</li>
                <li>将结果粘贴到路径输入框。</li>
              </ol>
              <p className="rounded-md bg-muted px-2 py-1 font-mono text-xs">
                C:\Users\yourname\Documents\project
              </p>
            </section>
            <section className="space-y-1.5">
              <p className="font-medium">终端方式（macOS/Linux）</p>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>运行 <code>cd /path/to/folder</code>。</li>
                <li>运行 <code>pwd</code>。</li>
                <li>复制输出并粘贴到路径输入框。</li>
              </ol>
            </section>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              好的
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Label + input rendered on the same line (inline layout for compact fields).
 */
export function InlineField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 shrink-0">
        <label className="text-xs text-muted-foreground">{label}</label>
        {hint && <HintIcon text={hint} />}
      </div>
      <div className="w-24 ml-auto">{children}</div>
    </div>
  );
}
