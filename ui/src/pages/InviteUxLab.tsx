import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CompanyPatternIcon } from "@/components/CompanyPatternIcon";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  Check,
  Clock3,
  ExternalLink,
  FlaskConical,
  KeyRound,
  Link2,
  Loader2,
  MailPlus,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";

const inviteRoleOptions = [
  {
    value: "viewer",
    label: "查看者",
    description: "可以查看公司工作并跟进进展，但没有操作权限。",
    gets: "没有内置授权。",
  },
  {
    value: "operator",
    label: "操作员",
    description: "适合需要协助执行工作、但不管理访问权限的成员。",
    gets: "可以分配任务。",
  },
  {
    value: "admin",
    label: "管理员",
    description: "适合需要邀请成员、创建代理并审批加入请求的操作员。",
    gets: "可以创建代理、邀请用户、分配任务并审批加入请求。",
  },
  {
    value: "owner",
    label: "所有者",
    description: "完整公司访问权限，包括成员和权限管理。",
    gets: "包含管理员的全部权限，并可管理成员和权限授权。",
  },
] as const;

const inviteHistory = [
  {
    id: "invite-active",
    state: "活跃",
    humanRole: "操作员",
    invitedBy: "Board User 25",
    email: "board25@paperclip.local",
    createdAt: "Apr 25, 2026, 9:00 AM",
    action: "撤销",
    relatedLabel: "查看请求",
  },
  {
    id: "invite-accepted",
    state: "已接受",
    humanRole: "查看者",
    invitedBy: "Board User 24",
    email: "board24@paperclip.local",
    createdAt: "Apr 24, 2026, 8:15 AM",
    action: "非活跃",
    relatedLabel: "—",
  },
  {
    id: "invite-revoked",
    state: "已撤销",
    humanRole: "管理员",
    invitedBy: "Board User 20",
    email: "board20@paperclip.local",
    createdAt: "Apr 20, 2026, 2:45 PM",
    action: "非活跃",
    relatedLabel: "—",
  },
  {
    id: "invite-expired",
    state: "已过期",
    humanRole: "所有者",
    invitedBy: "Board User 19",
    email: "board19@paperclip.local",
    createdAt: "Apr 19, 2026, 7:10 PM",
    action: "非活跃",
    relatedLabel: "—",
  },
] as const;

const fieldClassName =
  "w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500";
const panelClassName = "border border-zinc-800 bg-zinc-950/95 p-6";

function LabSection({
  eyebrow,
  title,
  description,
  accentClassName,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  accentClassName?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-[28px] border border-border/70 bg-background/80 p-4 shadow-[0_24px_60px_rgba(15,23,42,0.08)] sm:p-5",
        accentClassName,
      )}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {eyebrow}
          </div>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function StatusCard({
  icon,
  title,
  body,
  tone = "default",
}: {
  icon: ReactNode;
  title: string;
  body: string;
  tone?: "default" | "warn" | "success" | "error";
}) {
  const toneClassName = {
    default: "border-border/70 bg-background/85",
    warn: "border-amber-400/40 bg-amber-500/[0.08]",
    success: "border-emerald-400/40 bg-emerald-500/[0.08]",
    error: "border-rose-400/40 bg-rose-500/[0.08]",
  }[tone];

  return (
    <Card className={cn("rounded-[24px] shadow-none", toneClassName)}>
      <CardHeader className="space-y-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-current/10 bg-background/70 text-muted-foreground">
          {icon}
        </div>
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription className="mt-2 text-sm leading-6">{body}</CardDescription>
        </div>
      </CardHeader>
    </Card>
  );
}

function InviteLandingShell({
  left,
  right,
}: {
  left: ReactNode;
  right: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-zinc-800 bg-zinc-950 shadow-[0_30px_80px_rgba(2,6,23,0.55)]">
      <div className="grid gap-px bg-zinc-800 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <section className={cn(panelClassName, "space-y-6 bg-zinc-950")}>{left}</section>
        <section className={cn(panelClassName, "h-full bg-zinc-950")}>{right}</section>
      </div>
    </div>
  );
}

function InviteSummaryPanel({
  title,
  description,
  inviteMessage,
  requestedAccess,
  signedInLabel,
}: {
  title: string;
  description: string;
  inviteMessage?: string;
  requestedAccess: string;
  signedInLabel?: string;
}) {
  return (
    <>
      <div className="flex items-start gap-4">
        <CompanyPatternIcon
          companyName="Acme Robotics"
          logoUrl="/api/invites/pcp_invite_test/logo"
          brandColor="#114488"
          className="h-16 w-16 rounded-none border border-zinc-800"
        />
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">你已受邀加入 Paperclip</p>
          <h3 className="mt-2 text-2xl font-semibold text-zinc-100">{title}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">{description}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <MetaCard label="公司" value="Acme Robotics" />
        <MetaCard label="邀请人" value="Board User" />
        <MetaCard label="请求的访问权限" value={requestedAccess} />
        <MetaCard label="邀请过期时间" value="2027 年 3 月 7 日" />
      </div>

      {inviteMessage ? (
        <div className="border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="text-xs uppercase tracking-[0.2em] text-amber-200/80">邀请人留言</div>
          <p className="mt-2 text-sm leading-6 text-amber-50">{inviteMessage}</p>
        </div>
      ) : null}

      {signedInLabel ? (
        <div className="border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-50">
          当前登录为 <span className="font-medium">{signedInLabel}</span>。
        </div>
      ) : null}
    </>
  );
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-zinc-800 p-3">
      <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">{label}</div>
      <div className="mt-1 text-sm text-zinc-100">{value}</div>
    </div>
  );
}

function InlineAuthPreview({
  mode,
  feedback,
  working,
}: {
  mode: "sign_up" | "sign_in";
  feedback?: { tone: "info" | "error"; text: string };
  working?: boolean;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-zinc-100">
          {mode === "sign_up" ? "创建账户" : "登录后继续"}
        </h3>
        <p className="mt-1 text-sm text-zinc-400">
          {mode === "sign_up"
            ? "请先创建 Paperclip 账户。完成后会回到这里接受 Acme Robotics 的邀请。"
            : "请使用与此邀请匹配的 Paperclip 账户登录。如果你还没有账户，请切回创建账户。"}
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className={cn(
            "flex-1 border px-3 py-2 text-sm transition-colors",
            mode === "sign_up"
              ? "border-zinc-100 bg-zinc-100 text-zinc-950"
              : "border-zinc-800 text-zinc-300 hover:border-zinc-600",
          )}
        >
          创建账户
        </button>
        <button
          type="button"
          className={cn(
            "flex-1 border px-3 py-2 text-sm transition-colors",
            mode === "sign_in"
              ? "border-zinc-100 bg-zinc-100 text-zinc-950"
              : "border-zinc-800 text-zinc-300 hover:border-zinc-600",
          )}
        >
          我已有账户
        </button>
      </div>

      <form className="space-y-4">
        {mode === "sign_up" ? (
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-400">姓名</span>
            <input name="name" className={fieldClassName} defaultValue="Jane Example" readOnly />
          </label>
        ) : null}
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-400">邮箱</span>
          <input name="email" type="email" className={fieldClassName} defaultValue="jane@example.com" readOnly />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-400">密码</span>
          <input name="password" type="password" className={fieldClassName} defaultValue="supersecret" readOnly />
        </label>
        {feedback ? (
          <p className={cn("text-xs", feedback.tone === "info" ? "text-amber-300" : "text-red-400")}>
            {feedback.text}
          </p>
        ) : null}
        <Button type="button" className="w-full rounded-none" disabled={working}>
          {working ? "处理中..." : mode === "sign_in" ? "登录并继续" : "创建账户并继续"}
        </Button>
      </form>

      <p className="text-xs leading-5 text-zinc-500">
        {mode === "sign_up"
          ? "之前已经注册过？请改用已有账户选项，确保邀请关联到正确的 Paperclip 用户。"
          : "还没有账户？请切回创建账户，用新登录身份接受邀请。"}
      </p>
    </div>
  );
}

function AgentRequestPreview() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-zinc-100">提交代理信息</h3>
        <p className="mt-1 text-sm text-zinc-400">
          此邀请会为 Acme Robotics 中的新代理创建一条审批请求。
        </p>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block text-zinc-400">代理名称</span>
        <input className={fieldClassName} defaultValue="Acme Ops Agent" readOnly />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-zinc-400">适配器类型</span>
        <select className={fieldClassName} defaultValue="codex_local" disabled>
          <option value="codex_local">Codex</option>
          <option value="claude_local">Claude Code</option>
          <option value="cursor">Cursor</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-zinc-400">能力说明</span>
        <textarea
          className={fieldClassName}
          rows={4}
          defaultValue="查看邀请、分流请求，并保持看板队列推进。"
          readOnly
        />
      </label>
      <Button type="button" className="w-full rounded-none">
        提交请求
      </Button>
    </div>
  );
}

function AcceptInvitePreview({
  autoAccept,
  isCurrentMember,
  error,
}: {
  autoAccept?: boolean;
  isCurrentMember?: boolean;
  error?: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-zinc-100">接受公司邀请</h3>
        <p className="mt-1 text-sm text-zinc-400">
          {autoAccept
            ? "正在提交你加入 Acme Robotics 的请求。"
            : isCurrentMember
              ? "此账户已属于 Acme Robotics。"
              : "这会提交或完成你加入 Acme Robotics 的请求。"}
        </p>
      </div>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
      {autoAccept ? (
        <div className="text-sm text-zinc-400">正在提交请求...</div>
      ) : (
        <Button type="button" className="w-full rounded-none" disabled={isCurrentMember}>
          接受邀请
        </Button>
      )}
    </div>
  );
}

function InviteResultPreview({
  title,
  description,
  claimSecret,
  onboardingTextUrl,
  joinedNow = false,
}: {
  title: string;
  description: string;
  claimSecret?: string;
  onboardingTextUrl?: string;
  joinedNow?: boolean;
}) {
  return (
    <div className="mx-auto max-w-md border border-zinc-800 bg-zinc-950 p-6 text-zinc-100">
      <div className="flex items-center gap-3">
        <CompanyPatternIcon
          companyName="Acme Robotics"
          logoUrl="/api/invites/pcp_invite_test/logo"
          brandColor="#114488"
          className="h-12 w-12 rounded-none border border-zinc-800"
        />
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      <div className="mt-4 space-y-3">
        <p className="text-sm text-zinc-400">{description}</p>
        {joinedNow ? (
          <Button type="button" className="w-full rounded-none">
            打开看板
          </Button>
        ) : (
          <>
            <div className="border border-zinc-800 p-3">
            <p className="mb-1 text-xs text-zinc-500">审批页面</p>
              <a className="text-sm text-zinc-200 underline underline-offset-2" href="/company/settings/access">
                公司设置 → 访问权限
              </a>
            </div>
            <p className="text-xs text-zinc-500">
              通过审批后刷新此页面，系统会自动跳转。
            </p>
          </>
        )}
        {claimSecret ? (
          <div className="space-y-1 border border-zinc-800 p-3 text-xs text-zinc-400">
            <div className="text-zinc-200">领取密钥</div>
            <div className="font-mono break-all">{claimSecret}</div>
            <div className="font-mono break-all">POST /api/agents/claim-api-key</div>
          </div>
        ) : null}
        {onboardingTextUrl ? (
          <div className="text-xs text-zinc-400">
            引导说明：<span className="font-mono break-all">{onboardingTextUrl}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AuthScreenPreview({ mode, error }: { mode: "sign_in" | "sign_up"; error?: string }) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-border/70 bg-background shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
      <div className="grid gap-px bg-border/60 md:grid-cols-2">
        <div className="flex min-h-[420px] flex-col justify-center bg-background px-8 py-10">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-8 flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Paperclip</span>
            </div>
            <h3 className="text-xl font-semibold">
              {mode === "sign_in" ? "登录 Paperclip" : "创建 Paperclip 账户"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "sign_in"
                ? "使用邮箱和密码访问此实例。"
                : "为此实例创建账户。当前版本不要求邮箱确认。"}
            </p>
            <div className="mt-6 space-y-4">
              {mode === "sign_up" ? (
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">姓名</span>
                  <input
                    className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
                    defaultValue="Jane Example"
                    readOnly
                  />
                </label>
              ) : null}
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">邮箱</span>
                <input
                  className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
                  defaultValue="jane@example.com"
                  readOnly
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">密码</span>
                <input
                  className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
                  defaultValue="supersecret"
                  readOnly
                />
              </label>
              {error ? <p className="text-xs text-destructive">{error}</p> : null}
              <Button type="button" className="w-full">
                {mode === "sign_in" ? "登录" : "创建账户"}
              </Button>
            </div>
            <div className="mt-5 text-sm text-muted-foreground">
              {mode === "sign_in" ? "还没有账户？" : "已有账户？"}{" "}
              <span className="font-medium text-foreground underline underline-offset-2">
                {mode === "sign_in" ? "创建账户" : "登录"}
              </span>
            </div>
          </div>
        </div>
        <div className="hidden min-h-[420px] items-center justify-center bg-[radial-gradient(circle_at_top,rgba(8,145,178,0.18),transparent_48%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,1))] px-8 py-10 md:flex">
          <div className="max-w-sm space-y-4 text-zinc-200">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-500/[0.08] px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-cyan-200">
              Auth preview
            </div>
            <div className="text-2xl font-semibold">Side-by-side signup styling review</div>
            <p className="text-sm leading-6 text-zinc-400">
              This frame mirrors the production auth surface so spacing, label density, button treatments, and desktop composition are easy to compare.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompanyInvitesPreview() {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
      <Card className="rounded-[28px] shadow-none">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MailPlus className="h-4 w-4" />
            公司邀请
          </div>
          <div>
            <CardTitle>创建邀请</CardTitle>
            <CardDescription className="mt-2">
              生成一个人类成员邀请链接，并选择默认申请的访问角色。
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">选择角色</legend>
            <div className="rounded-2xl border border-border">
              {inviteRoleOptions.map((option, index) => (
                <label
                  key={option.value}
                  className={cn("flex cursor-default gap-3 px-4 py-4", index > 0 && "border-t border-border")}
                >
                  <input
                    type="radio"
                    readOnly
                    checked={option.value === "operator"}
                    className="mt-1 h-4 w-4 border-border text-foreground"
                  />
                  <span className="min-w-0 space-y-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{option.label}</span>
                      {option.value === "operator" ? (
                        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                          默认
                        </span>
                      ) : null}
                    </span>
                    <span className="block max-w-2xl text-sm text-muted-foreground">{option.description}</span>
                    <span className="block text-sm text-foreground">{option.gets}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground">
            每个邀请链接只能使用一次。首次成功使用后会消耗该链接，并在审批前创建或复用匹配的加入请求。
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button">创建邀请</Button>
            <span className="text-sm text-muted-foreground">下方邀请历史会保留审计记录。</span>
          </div>

          <div className="space-y-3 rounded-2xl border border-border px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">最新邀请链接</div>
                <div className="text-sm text-muted-foreground">
                  此 URL 包含服务器返回的当前 Paperclip 域名。
                </div>
              </div>
              <div className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
                <Check className="h-3.5 w-3.5" />
                已复制
              </div>
            </div>
            <button
              type="button"
              className="w-full rounded-md border border-border bg-muted/60 px-3 py-2 text-left text-sm break-all"
            >
              https://paperclip.local/invite/new-token
            </button>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline">
                <ExternalLink className="h-4 w-4" />
                打开邀请
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[28px] shadow-none">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>邀请历史</CardTitle>
              <CardDescription className="mt-2">
                查看邀请状态、角色、邀请人以及关联的加入请求。
              </CardDescription>
            </div>
            <a href="/inbox/requests" className="text-sm underline underline-offset-4">
              打开加入请求队列
            </a>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 font-medium text-muted-foreground">状态</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">角色</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">邀请人</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">创建时间</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">加入请求</th>
                  <th className="px-5 py-3 text-right font-medium text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody>
                {inviteHistory.map((invite) => (
                  <tr key={invite.id} className="border-b border-border last:border-b-0">
                    <td className="px-5 py-3 align-top">
                      <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                        {invite.state}
                      </span>
                    </td>
                    <td className="px-5 py-3 align-top">{invite.humanRole}</td>
                    <td className="px-5 py-3 align-top">
                      <div>{invite.invitedBy}</div>
                      <div className="text-xs text-muted-foreground">{invite.email}</div>
                    </td>
                    <td className="px-5 py-3 align-top text-muted-foreground">{invite.createdAt}</td>
                    <td className="px-5 py-3 align-top">
                      {invite.relatedLabel === "查看请求" ? (
                        <a href="/inbox/requests" className="underline underline-offset-4">
                          {invite.relatedLabel}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">{invite.relatedLabel}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right align-top">
                      {invite.action === "撤销" ? (
                        <Button type="button" size="sm" variant="outline">
                          撤销
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">非活跃</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-border p-4">
              <div className="text-sm font-medium">空历史状态</div>
              <div className="mt-2 text-sm text-muted-foreground">
                此公司尚未创建任何邀请。
              </div>
            </div>
            <div className="rounded-2xl border border-rose-400/40 bg-rose-500/[0.07] p-4">
              <div className="text-sm font-medium text-foreground">权限错误</div>
              <div className="mt-2 text-sm text-muted-foreground">
                你没有管理公司邀请的权限。
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function InviteUxLab() {
  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-[32px] border border-border/70 bg-[linear-gradient(135deg,rgba(8,145,178,0.10),transparent_28%),linear-gradient(180deg,rgba(245,158,11,0.10),transparent_44%),var(--background)] shadow-[0_30px_80px_rgba(15,23,42,0.10)]">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_320px]">
          <div className="p-6 sm:p-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/25 bg-cyan-500/[0.08] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-700 dark:text-cyan-300">
              <FlaskConical className="h-3.5 w-3.5" />
              Invite UX Lab
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">邀请与注册 UX 预览面板</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
              此页面集中展示当前邀请落地页、注册、审批结果和公司邀请管理状态，便于在不手动复现后端条件的情况下检查样式变化。
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.18em]">
                /tests/ux/invites
              </Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.18em]">
                注册 + 邀请状态
              </Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.18em]">
                固定数据预览
              </Badge>
            </div>
          </div>

          <aside className="border-t border-border/60 bg-background/70 p-6 lg:border-l lg:border-t-0">
            <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              覆盖状态
            </div>
            <div className="space-y-3">
              {[
                "邀请加载、访问检查、缺少令牌和不可用状态",
                "内嵌账户创建与登录形态，包括反馈和错误文案",
                "人工接受、代理请求和自动接受流程",
                "待审批、已加入、领取密钥和引导结果页面",
                "公司邀请创建、链接复制、历史、空状态和权限错误状态",
              ].map((highlight) => (
                <div
                  key={highlight}
                  className="rounded-2xl border border-border/70 bg-background/85 px-4 py-3 text-sm text-muted-foreground"
                >
                  {highlight}
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>

      <LabSection
        eyebrow="顶层状态"
        title="落地页状态覆盖"
        description="这些小卡片覆盖不渲染完整分屏布局的快速返回邀请状态。"
        accentClassName="bg-[linear-gradient(180deg,rgba(59,130,246,0.05),transparent_30%),var(--background)]"
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatusCard
            icon={<Loader2 className="h-4 w-4 animate-spin" />}
            title="正在加载邀请"
            body="当邀请摘要、部署模式或认证会话数据仍在加载时显示。"
          />
          <StatusCard
            icon={<Clock3 className="h-4 w-4" />}
            title="正在检查访问权限"
            body="登录后，应用验证当前用户是否已属于受邀公司时显示。"
          />
          <StatusCard
            icon={<KeyRound className="h-4 w-4" />}
            title="邀请令牌无效"
            body="令牌完全缺失，因此页面会在任何邀请查询之前直接返回。"
            tone="error"
          />
          <StatusCard
            icon={<Link2 className="h-4 w-4" />}
            title="邀请不可用"
            body="用于过期、撤销、已消耗或其他缺失的邀请。"
            tone="warn"
          />
          <StatusCard
            icon={<ShieldCheck className="h-4 w-4" />}
            title="引导设置已完成"
            body="引导 CEO 邀请成功接受后的结果页面。"
            tone="success"
          />
          <StatusCard
            icon={<ArrowRight className="h-4 w-4" />}
            title="正在自动接受"
            body="已登录的人类用户会跳过额外按钮点击，直接进入加入请求提交。"
          />
          <StatusCard
            icon={<Users className="h-4 w-4" />}
            title="已是成员"
            body="接受操作保持禁用，确认成员身份后页面会跳转到公司。"
          />
          <StatusCard
            icon={<UserPlus className="h-4 w-4" />}
            title="邀请结果界面"
            body="下方同时包含待审批和已加入确认，并展示领取与引导补充信息。"
            tone="success"
          />
        </div>
      </LabSection>

      <LabSection
        eyebrow="邀请落地页"
        title="分屏邀请流程"
        description="这些画面尽量贴近生产邀请界面，便于在固定数据下检查间距、层级和控件状态。"
        accentClassName="bg-[linear-gradient(180deg,rgba(234,179,8,0.06),transparent_28%),var(--background)]"
      >
        <div className="space-y-5">
          <InviteLandingShell
            left={
              <InviteSummaryPanel
                title="加入 Acme Robotics"
                description="请先创建 Paperclip 账户。如果你已有账户，请切换到登录，并使用同一个邮箱继续处理邀请。"
                inviteMessage="欢迎加入。"
                requestedAccess="操作员"
              />
            }
            right={<InlineAuthPreview mode="sign_up" />}
          />

          <InviteLandingShell
            left={
              <InviteSummaryPanel
                title="加入 Acme Robotics"
                description="请先创建 Paperclip 账户。如果你已有账户，请切换到登录，并使用同一个邮箱继续处理邀请。"
                inviteMessage="欢迎加入。"
                requestedAccess="操作员"
              />
            }
            right={
              <InlineAuthPreview
                mode="sign_in"
                feedback={{
                  tone: "info",
                  text: "jane@example.com 已有账户。请在下方登录，以继续处理此邀请。",
                }}
              />
            }
          />

          <InviteLandingShell
            left={
              <InviteSummaryPanel
                title="加入 Acme Robotics"
                description="你的账户已准备好。请查看邀请详情，然后接受邀请继续。"
                inviteMessage="欢迎加入。"
                requestedAccess="操作员"
                signedInLabel="Jane Example"
              />
            }
            right={<AcceptInvitePreview autoAccept />}
          />

          <InviteLandingShell
            left={
              <InviteSummaryPanel
                title="加入 Acme Robotics"
                description="请先查看邀请详情，然后在下方提交代理信息以发起加入请求。"
                requestedAccess="代理加入请求"
              />
            }
            right={<AgentRequestPreview />}
          />

          <InviteLandingShell
            left={
              <InviteSummaryPanel
                title="加入 Acme Robotics"
                description="你的账户已准备好。请查看邀请详情，然后接受邀请继续。"
                requestedAccess="操作员"
                signedInLabel="Jane Example"
              />
            }
            right={<AcceptInvitePreview error="此账户已属于该公司。" isCurrentMember />}
          />
        </div>
      </LabSection>

      <LabSection
        eyebrow="结果状态"
        title="审批与完成页面"
        description="这些是接受邀请后返回的提交后状态，包括可选的领取与引导元数据。"
        accentClassName="bg-[linear-gradient(180deg,rgba(16,185,129,0.06),transparent_30%),var(--background)]"
      >
        <div className="grid gap-5 xl:grid-cols-3">
          <InviteResultPreview
            title="申请加入 Acme Robotics"
            description="需要 Board User 批准你的加入请求。"
            claimSecret="pcp_claim_secret_demo"
            onboardingTextUrl="/api/invites/pcp_invite_test/onboarding.txt"
          />
          <InviteResultPreview
            title="你已加入公司"
            description="你的账户已匹配通过审批的邀请，因此可以立即打开看板。"
            joinedNow
          />
          <InviteResultPreview
            title="申请加入 Acme Robotics"
            description="请对方进入公司设置 → 访问权限审批你的请求。"
          />
        </div>
      </LabSection>

      <LabSection
        eyebrow="独立认证"
        title="认证页状态"
        description="通用 `/auth` 页面使用不同于邀请落地页的构图。这里同时保留登录和注册预览。"
        accentClassName="bg-[linear-gradient(180deg,rgba(168,85,247,0.06),transparent_28%),var(--background)]"
      >
        <div className="space-y-5">
          <AuthScreenPreview mode="sign_in" error="邮箱或密码不正确，请检查后重试。" />
          <AuthScreenPreview mode="sign_up" />
        </div>
      </LabSection>

      <LabSection
        eyebrow="公司设置"
        title="公司邀请管理"
        description="本节展示看板侧邀请创建流程、已复制链接状态、审计表格，以及较难手动搭建的边缘状态。"
        accentClassName="bg-[linear-gradient(180deg,rgba(244,114,182,0.06),transparent_28%),var(--background)]"
      >
        <CompanyInvitesPreview />
      </LabSection>
    </div>
  );
}
