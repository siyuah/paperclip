import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Shield, ShieldCheck, Trash2 } from "lucide-react";
import { accessApi } from "@/api/access";
import { ApiError } from "@/api/client";
import { companiesApi } from "@/api/companies";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { queryKeys } from "@/lib/queryKeys";

const ACCESS_ROLE_LABELS: Record<string, string> = {
  owner: "所有者",
  admin: "管理员",
  operator: "操作员",
  viewer: "查看者",
  member: "成员",
};

const ACCESS_STATUS_LABELS: Record<string, string> = {
  active: "活跃",
  pending: "待处理",
  suspended: "已暂停",
  archived: "已归档",
  paused: "已暂停",
};

function formatAccessRole(role: string | null | undefined) {
  if (!role) return "未设置";
  return ACCESS_ROLE_LABELS[role] ?? role.replaceAll("_", " ");
}

function formatAccessStatus(status: string | null | undefined) {
  if (!status) return "未知";
  return ACCESS_STATUS_LABELS[status] ?? status.replaceAll("_", " ");
}

export function InstanceAccess() {
  const { companies, selectedCompanyId, setSelectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<Set<string>>(new Set());
  const [deleteCompanyId, setDeleteCompanyId] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  useEffect(() => {
    setBreadcrumbs([
      { label: "实例设置", href: "/instance/settings/general" },
      { label: "访问权限" },
    ]);
  }, [setBreadcrumbs]);

  const usersQuery = useQuery({
    queryKey: queryKeys.access.adminUsers(search),
    queryFn: () => accessApi.searchAdminUsers(search),
  });

  const selectedUser = useMemo(
    () => usersQuery.data?.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, usersQuery.data],
  );
  const deleteCompany = useMemo(
    () => companies.find((company) => company.id === deleteCompanyId) ?? null,
    [companies, deleteCompanyId],
  );

  const userAccessQuery = useQuery({
    queryKey: queryKeys.access.userCompanyAccess(selectedUserId ?? ""),
    queryFn: () => accessApi.getUserCompanyAccess(selectedUserId!),
    enabled: !!selectedUserId,
  });

  useEffect(() => {
    if (!selectedUserId && usersQuery.data?.[0]) {
      setSelectedUserId(usersQuery.data[0].id);
    }
  }, [selectedUserId, usersQuery.data]);

  useEffect(() => {
    if (!userAccessQuery.data) return;
    setSelectedCompanyIds(
      new Set(
        userAccessQuery.data.companyAccess
          .filter((membership) => membership.status === "active")
          .map((membership) => membership.companyId),
      ),
    );
  }, [userAccessQuery.data]);

  const updateCompanyAccessMutation = useMutation({
    mutationFn: () => accessApi.setUserCompanyAccess(selectedUserId!, [...selectedCompanyIds]),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.access.userCompanyAccess(selectedUserId!) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.access.adminUsers(search) });
      pushToast({ title: "公司访问权限已更新", tone: "success" });
    },
  });

  const setAdminMutation = useMutation({
    mutationFn: async (makeAdmin: boolean) => {
      if (!selectedUserId) throw new Error("未选择用户");
      if (makeAdmin) return accessApi.promoteInstanceAdmin(selectedUserId);
      return accessApi.demoteInstanceAdmin(selectedUserId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.access.adminUsers(search) });
      if (selectedUserId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.access.userCompanyAccess(selectedUserId) });
      }
      pushToast({ title: "实例角色已更新", tone: "success" });
    },
  });

  function getNextCompanyId(companyId: string) {
    return (
      companies.find(
        (company) =>
          company.id !== companyId && company.status !== "archived"
      )?.id ??
      companies.find((company) => company.id !== companyId)?.id ??
      null
    );
  }

  const deleteCompanyMutation = useMutation({
    mutationFn: ({
      companyId,
      nextCompanyId,
    }: {
      companyId: string;
      nextCompanyId: string | null;
    }) => companiesApi.remove(companyId).then(() => ({ companyId, nextCompanyId })),
    onSuccess: async ({ companyId, nextCompanyId }) => {
      setDeleteCompanyId(null);
      setDeleteConfirmText("");
      setSelectedCompanyIds((current) => {
        const next = new Set(current);
        next.delete(companyId);
        return next;
      });
      if (selectedCompanyId === companyId && nextCompanyId) {
        setSelectedCompanyId(nextCompanyId);
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.stats });
      await queryClient.invalidateQueries({ queryKey: queryKeys.access.currentBoardAccess });
      if (selectedUserId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.access.userCompanyAccess(selectedUserId) });
      }
      pushToast({ title: "公司已永久删除", tone: "success" });
    },
    onError: (error) => {
      pushToast({
        title: "删除公司失败",
        body: error instanceof Error ? error.message : "未知错误",
        tone: "error",
      });
    },
  });

  if (usersQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">正在加载实例用户...</div>;
  }

  if (usersQuery.error) {
    const message =
      usersQuery.error instanceof ApiError && usersQuery.error.status === 403
        ? "需要实例管理员权限才能管理用户。"
        : usersQuery.error instanceof Error
          ? usersQuery.error.message
          : "用户加载失败。";
    return <div className="text-sm text-destructive">{message}</div>;
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">实例访问权限</h1>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          搜索用户、管理实例管理员身份，并控制他们可以访问哪些公司。
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className="space-y-4 rounded-xl border border-border bg-card p-4">
          <label className="block space-y-2 text-sm">
            <span className="font-medium">搜索用户</span>
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="按姓名或邮箱搜索"
            />
          </label>
          <div className="space-y-2">
            {(usersQuery.data ?? []).map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => setSelectedUserId(user.id)}
                className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                  user.id === selectedUserId
                    ? "border-foreground bg-accent"
                    : "border-border hover:bg-accent/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{user.name || user.email || user.id}</div>
                    <div className="truncate text-sm text-muted-foreground">{user.email || user.id}</div>
                  </div>
                  {user.isInstanceAdmin ? (
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  ) : null}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {user.activeCompanyMembershipCount} 个活跃公司成员身份
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-border bg-card p-5">
          {!selectedUserId ? (
            <div className="text-sm text-muted-foreground">选择一个用户以查看实例访问权限。</div>
          ) : userAccessQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">正在加载用户访问权限...</div>
          ) : userAccessQuery.error ? (
            <div className="text-sm text-destructive">
              {userAccessQuery.error instanceof Error ? userAccessQuery.error.message : "用户访问权限加载失败。"}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold">
                    {selectedUser?.name || selectedUser?.email || selectedUserId}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {selectedUser?.email || selectedUserId}
                  </div>
                </div>
                <Button
                  variant={selectedUser?.isInstanceAdmin ? "outline" : "default"}
                  onClick={() => setAdminMutation.mutate(!(selectedUser?.isInstanceAdmin ?? false))}
                  disabled={setAdminMutation.isPending}
                >
                  {selectedUser?.isInstanceAdmin ? "移除实例管理员" : "提升为实例管理员"}
                </Button>
              </div>

              <div className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold">公司访问权限</h2>
                  <p className="text-sm text-muted-foreground">
                    为此用户开关公司成员身份。新增访问权限默认使用活跃的操作员成员身份。
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {companies.map((company) => (
                    <div
                      key={company.id}
                      className="flex items-start gap-3 rounded-lg border border-border px-3 py-3"
                    >
                      <label className="flex min-w-0 flex-1 items-start gap-3">
                        <Checkbox
                          checked={selectedCompanyIds.has(company.id)}
                          onCheckedChange={(checked) => {
                            setSelectedCompanyIds((current) => {
                              const next = new Set(current);
                              if (checked) next.add(company.id);
                              else next.delete(company.id);
                              return next;
                            });
                          }}
                        />
                        <span className="min-w-0 space-y-1">
                          <span className="block truncate text-sm font-medium">{company.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{company.issuePrefix}</span>
                          {company.status === "archived" ? (
                            <span className="block text-xs text-muted-foreground">已归档</span>
                          ) : null}
                        </span>
                      </label>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        title="永久删除公司"
                        onClick={() => {
                          setDeleteCompanyId(company.id);
                          setDeleteConfirmText("");
                        }}
                        disabled={deleteCompanyMutation.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={() => updateCompanyAccessMutation.mutate()}
                    disabled={updateCompanyAccessMutation.isPending}
                  >
                    {updateCompanyAccessMutation.isPending ? "正在保存..." : "保存公司访问权限"}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <h2 className="text-sm font-semibold">当前成员身份</h2>
                <div className="space-y-2">
                  {(userAccessQuery.data?.companyAccess ?? []).map((membership) => (
                    <div
                      key={membership.id}
                      className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                    >
                      <div>
                        <div className="font-medium">{membership.companyName || membership.companyId}</div>
                        <div className="text-muted-foreground">
                          {formatAccessRole(membership.membershipRole)} · {formatAccessStatus(membership.status)}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(membership.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      <Dialog
        open={!!deleteCompany}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteCompanyId(null);
            setDeleteConfirmText("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              永久删除公司
            </DialogTitle>
            <DialogDescription>
              这会永久删除“{deleteCompany?.name}”及其关联数据。请输入公司名称确认删除。
            </DialogDescription>
          </DialogHeader>
          {deleteCompany ? (
            <div className="space-y-3">
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-muted-foreground">
                删除会移除此公司的项目、任务、代理、权限、邀请和运行记录。此操作无法撤销。
              </div>
              <label className="space-y-2 text-sm">
                <span className="font-medium">输入公司名称：{deleteCompany.name}</span>
                <input
                  className="w-full rounded-md border border-border bg-background px-3 py-2"
                  value={deleteConfirmText}
                  onChange={(event) => setDeleteConfirmText(event.target.value)}
                  placeholder={deleteCompany.name}
                />
              </label>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteCompanyId(null);
                setDeleteConfirmText("");
              }}
              disabled={deleteCompanyMutation.isPending}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={
                !deleteCompany ||
                deleteCompanyMutation.isPending ||
                deleteConfirmText !== deleteCompany.name
              }
              onClick={() => {
                if (!deleteCompany) return;
                deleteCompanyMutation.mutate({
                  companyId: deleteCompany.id,
                  nextCompanyId: getNextCompanyId(deleteCompany.id),
                });
              }}
            >
              {deleteCompanyMutation.isPending ? "正在删除..." : "确认永久删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
