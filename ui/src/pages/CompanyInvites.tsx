import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, MailPlus } from "lucide-react";
import { accessApi } from "@/api/access";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { Link } from "@/lib/router";
import { queryKeys } from "@/lib/queryKeys";

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

const INVITE_ROLE_LABELS: Record<string, string> = Object.fromEntries(
  inviteRoleOptions.map((option) => [option.value, option.label]),
);

const INVITE_STATE_LABELS: Record<"active" | "accepted" | "expired" | "revoked", string> = {
  active: "活跃",
  accepted: "已接受",
  expired: "已过期",
  revoked: "已撤销",
};

const INVITE_HISTORY_PAGE_SIZE = 5;

function isInviteHistoryRow(value: unknown): value is Awaited<ReturnType<typeof accessApi.listInvites>>["invites"][number] {
  if (!value || typeof value !== "object") return false;
  return "id" in value && "state" in value && "createdAt" in value;
}

export function CompanyInvites() {
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [humanRole, setHumanRole] = useState<"owner" | "admin" | "operator" | "viewer">("operator");
  const [latestInviteUrl, setLatestInviteUrl] = useState<string | null>(null);
  const [latestInviteCopied, setLatestInviteCopied] = useState(false);

  useEffect(() => {
    if (!latestInviteCopied) return;
    const timeout = window.setTimeout(() => {
      setLatestInviteCopied(false);
    }, 1600);
    return () => window.clearTimeout(timeout);
  }, [latestInviteCopied]);

  async function copyInviteUrl(url: string) {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        return true;
      }
    } catch {
      // Fall through to the unavailable message below.
    }

    pushToast({
      title: "剪贴板不可用",
      body: "请从下方字段手动复制邀请链接。",
      tone: "warn",
    });
    return false;
  }

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? "公司", href: "/dashboard" },
      { label: "设置", href: "/company/settings" },
      { label: "邀请" },
    ]);
  }, [selectedCompany?.name, setBreadcrumbs]);

  const inviteHistoryQueryKey = queryKeys.access.invites(selectedCompanyId ?? "", "all", INVITE_HISTORY_PAGE_SIZE);
  const invitesQuery = useInfiniteQuery({
    queryKey: inviteHistoryQueryKey,
    queryFn: ({ pageParam }) =>
      accessApi.listInvites(selectedCompanyId!, {
        limit: INVITE_HISTORY_PAGE_SIZE,
        offset: pageParam,
      }),
    enabled: !!selectedCompanyId,
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
  });
  const inviteHistory = useMemo(
    () =>
      invitesQuery.data?.pages.flatMap((page) =>
        Array.isArray(page?.invites) ? page.invites.filter(isInviteHistoryRow) : [],
      ) ?? [],
    [invitesQuery.data?.pages],
  );

  const createInviteMutation = useMutation({
    mutationFn: () =>
      accessApi.createCompanyInvite(selectedCompanyId!, {
        allowedJoinTypes: "human",
        humanRole,
        agentMessage: null,
      }),
    onSuccess: async (invite) => {
      setLatestInviteUrl(invite.inviteUrl);
      setLatestInviteCopied(false);
      const copied = await copyInviteUrl(invite.inviteUrl);

      await queryClient.invalidateQueries({ queryKey: inviteHistoryQueryKey });
      pushToast({
        title: "邀请已创建",
        body: copied ? "邀请链接已生成，并已复制到剪贴板。" : "邀请链接已生成，请在下方查看。",
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: "创建邀请失败",
        body: error instanceof Error ? error.message : "未知错误",
        tone: "error",
      });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (inviteId: string) => accessApi.revokeInvite(inviteId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: inviteHistoryQueryKey });
      pushToast({ title: "邀请已撤销", tone: "success" });
    },
    onError: (error) => {
      pushToast({
        title: "撤销邀请失败",
        body: error instanceof Error ? error.message : "未知错误",
        tone: "error",
      });
    },
  });

  if (!selectedCompanyId) {
    return <div className="text-sm text-muted-foreground">请选择公司以管理邀请。</div>;
  }

  if (invitesQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">正在加载邀请...</div>;
  }

  if (invitesQuery.error) {
    const message =
      invitesQuery.error instanceof ApiError && invitesQuery.error.status === 403
        ? "你没有管理公司邀请的权限。"
        : invitesQuery.error instanceof Error
          ? invitesQuery.error.message
          : "加载邀请失败。";
    return <div className="text-sm text-destructive">{message}</div>;
  }

  return (
    <div className="max-w-5xl space-y-8">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <MailPlus className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">公司邀请</h1>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          创建用于公司访问的人类成员邀请链接。新邀请链接生成后会自动复制到剪贴板。
        </p>
      </div>

      <section className="space-y-4 rounded-xl border border-border p-5">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">创建邀请</h2>
          <p className="text-sm text-muted-foreground">
            生成一个人类成员邀请链接，并选择默认申请的访问角色。
          </p>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">选择角色</legend>
          <div className="rounded-xl border border-border">
            {inviteRoleOptions.map((option, index) => {
              const checked = humanRole === option.value;
              return (
                <label
                  key={option.value}
                  className={`flex cursor-pointer gap-3 px-4 py-4 ${index > 0 ? "border-t border-border" : ""}`}
                >
                  <input
                    type="radio"
                    name="invite-role"
                    value={option.value}
                    checked={checked}
                    onChange={() => setHumanRole(option.value)}
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
              );
            })}
          </div>
        </fieldset>

        <div className="rounded-lg border border-border px-4 py-3 text-sm text-muted-foreground">
          每个邀请链接只能使用一次。首次成功使用后会消耗该链接，并在审批前创建或复用匹配的加入请求。
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => createInviteMutation.mutate()} disabled={createInviteMutation.isPending}>
            {createInviteMutation.isPending ? "正在创建..." : "创建邀请"}
          </Button>
          <span className="text-sm text-muted-foreground">下方邀请历史会保留审计记录。</span>
        </div>

        {latestInviteUrl ? (
          <div className="space-y-3 rounded-lg border border-border px-4 py-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium">最新邀请链接</div>
                {latestInviteCopied ? (
                  <div className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
                    <Check className="h-3.5 w-3.5" />
                    已复制
                  </div>
                ) : null}
              </div>
              <div className="text-sm text-muted-foreground">
                此 URL 包含服务器返回的当前 Paperclip 域名。
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                const copied = await copyInviteUrl(latestInviteUrl);
                setLatestInviteCopied(copied);
              }}
              className="w-full rounded-md border border-border bg-muted/60 px-3 py-2 text-left text-sm break-all transition-colors hover:bg-background"
            >
              {latestInviteUrl}
            </button>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" asChild>
                <a href={latestInviteUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  打开邀请
                </a>
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-border">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">邀请历史</h2>
            <p className="text-sm text-muted-foreground">
              查看邀请状态、角色、邀请人以及关联的加入请求。
            </p>
          </div>
          <Link to="/inbox/requests" className="text-sm underline underline-offset-4">
            打开加入请求队列
          </Link>
        </div>

        {inviteHistory.length === 0 ? (
          <div className="border-t border-border px-5 py-8 text-sm text-muted-foreground">
            此公司尚未创建任何邀请。
          </div>
        ) : (
          <div className="border-t border-border">
            <div className="overflow-x-auto">
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
                          {formatInviteState(invite.state)}
                        </span>
                      </td>
                      <td className="px-5 py-3 align-top">
                        {invite.humanRole ? INVITE_ROLE_LABELS[invite.humanRole] : "—"}
                      </td>
                      <td className="px-5 py-3 align-top">
                        <div>{invite.invitedByUser?.name || invite.invitedByUser?.email || "未知邀请人"}</div>
                        {invite.invitedByUser?.email && invite.invitedByUser.name ? (
                          <div className="text-xs text-muted-foreground">{invite.invitedByUser.email}</div>
                        ) : null}
                      </td>
                      <td className="px-5 py-3 align-top text-muted-foreground">
                        {new Date(invite.createdAt).toLocaleString()}
                      </td>
                      <td className="px-5 py-3 align-top">
                        {invite.relatedJoinRequestId ? (
                          <Link to="/inbox/requests" className="underline underline-offset-4">
                            查看请求
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right align-top">
                        {invite.state === "active" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => revokeMutation.mutate(invite.id)}
                            disabled={revokeMutation.isPending}
                          >
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
            {invitesQuery.hasNextPage ? (
              <div className="flex justify-center border-t border-border px-5 py-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => invitesQuery.fetchNextPage()}
                  disabled={invitesQuery.isFetchingNextPage}
                >
                  {invitesQuery.isFetchingNextPage ? "正在加载更多..." : "查看更多"}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

function formatInviteState(state: "active" | "accepted" | "expired" | "revoked") {
  return INVITE_STATE_LABELS[state];
}
