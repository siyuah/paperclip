/**
 * @fileoverview Plugin Manager page — admin UI for discovering,
 * installing, enabling/disabling, and uninstalling plugins.
 *
 * @see PLUGIN_SPEC.md §9 — Plugin Marketplace / Manager
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { PluginRecord } from "@paperclipai/shared";
import { Link } from "@/lib/router";
import { AlertTriangle, FlaskConical, Plus, Power, Puzzle, Settings, Trash } from "lucide-react";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { pluginsApi } from "@/api/plugins";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToastActions } from "@/context/ToastContext";
import { cn } from "@/lib/utils";

function firstNonEmptyLine(value: string | null | undefined): string | null {
  if (!value) return null;
  const line = value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find(Boolean);
  return line ?? null;
}

function getPluginErrorSummary(plugin: PluginRecord): string {
  return firstNonEmptyLine(plugin.lastError) ?? "插件进入错误状态，但没有存储错误消息。";
}

/**
 * PluginManager page component.
 *
 * Provides a management UI for the Paperclip plugin system:
 * - Lists all installed plugins with their status, version, and category badges.
 * - Allows installing new plugins by npm package name.
 * - Provides per-plugin actions: enable, disable, navigate to settings.
 * - Uninstall with a two-step confirmation dialog to prevent accidental removal.
 *
 * Data flow:
 * - Reads from `GET /api/plugins` via `pluginsApi.list()`.
 * - Mutations (install / uninstall / enable / disable) invalidate
 *   `queryKeys.plugins.all` so the list refreshes automatically.
 *
 * @see PluginSettings — linked from the Settings icon on each plugin row.
 * @see doc/plugins/PLUGIN_SPEC.md §3 — Plugin Lifecycle for status semantics.
 */
export function PluginManager() {
  const { selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const { pushToast } = useToastActions();

  const [installPackage, setInstallPackage] = useState("");
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [uninstallPluginId, setUninstallPluginId] = useState<string | null>(null);
  const [uninstallPluginName, setUninstallPluginName] = useState<string>("");
  const [errorDetailsPlugin, setErrorDetailsPlugin] = useState<PluginRecord | null>(null);

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? "公司", href: "/dashboard" },
      { label: "设置", href: "/instance/settings/heartbeats" },
      { label: "插件" },
    ]);
  }, [selectedCompany?.name, setBreadcrumbs]);

  const { data: plugins, isLoading, error } = useQuery({
    queryKey: queryKeys.plugins.all,
    queryFn: () => pluginsApi.list(),
  });

  const examplesQuery = useQuery({
    queryKey: queryKeys.plugins.examples,
    queryFn: () => pluginsApi.listExamples(),
  });

  const invalidatePluginQueries = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.plugins.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.plugins.examples });
    queryClient.invalidateQueries({ queryKey: queryKeys.plugins.uiContributions });
  };

  const installMutation = useMutation({
    mutationFn: (params: { packageName: string; version?: string; isLocalPath?: boolean }) =>
      pluginsApi.install(params),
    onSuccess: () => {
      invalidatePluginQueries();
      setInstallDialogOpen(false);
      setInstallPackage("");
      pushToast({ title: "插件安装成功", tone: "success" });
    },
    onError: (err: Error) => {
      pushToast({ title: "安装插件失败", body: err.message, tone: "error" });
    },
  });

  const uninstallMutation = useMutation({
    mutationFn: (pluginId: string) => pluginsApi.uninstall(pluginId),
    onSuccess: () => {
      invalidatePluginQueries();
      pushToast({ title: "插件卸载成功", tone: "success" });
    },
    onError: (err: Error) => {
      pushToast({ title: "卸载插件失败", body: err.message, tone: "error" });
    },
  });

  const enableMutation = useMutation({
    mutationFn: (pluginId: string) => pluginsApi.enable(pluginId),
    onSuccess: () => {
      invalidatePluginQueries();
      pushToast({ title: "插件已启用", tone: "success" });
    },
    onError: (err: Error) => {
      pushToast({ title: "启用插件失败", body: err.message, tone: "error" });
    },
  });

  const disableMutation = useMutation({
    mutationFn: (pluginId: string) => pluginsApi.disable(pluginId),
    onSuccess: () => {
      invalidatePluginQueries();
      pushToast({ title: "插件已禁用", tone: "info" });
    },
    onError: (err: Error) => {
      pushToast({ title: "禁用插件失败", body: err.message, tone: "error" });
    },
  });

  const installedPlugins = plugins ?? [];
  const examples = examplesQuery.data ?? [];
  const installedByPackageName = new Map(installedPlugins.map((plugin) => [plugin.packageName, plugin]));
  const examplePackageNames = new Set(examples.map((example) => example.packageName));
  const errorSummaryByPluginId = useMemo(
    () =>
      new Map(
        installedPlugins.map((plugin) => [plugin.id, getPluginErrorSummary(plugin)])
      ),
    [installedPlugins]
  );

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">正在加载插件...</div>;
  if (error) return <div className="p-4 text-sm text-destructive">加载插件失败。</div>;

  return (
    <div className="max-w-6xl space-y-7">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Puzzle className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold tracking-tight">插件管理器</h1>
        </div>
        
        <Dialog open={installDialogOpen} onOpenChange={setInstallDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              安装插件
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>安装插件</DialogTitle>
              <DialogDescription>
                输入要安装的插件 npm 包名。
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="packageName">npm 包名</Label>
                <Input
                  id="packageName"
                  placeholder="@paperclipai/plugin-example"
                  value={installPackage}
                  onChange={(e) => setInstallPackage(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInstallDialogOpen(false)}>取消</Button>
              <Button
                onClick={() => installMutation.mutate({ packageName: installPackage })}
                disabled={!installPackage || installMutation.isPending}
              >
                {installMutation.isPending ? "正在安装..." : "安装"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border border-amber-500/30 bg-amber-500/[0.08] px-4 py-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div className="space-y-1 text-sm">
            <p className="font-medium text-foreground">插件功能仍处于测试阶段。</p>
            <p className="text-muted-foreground">
              插件运行时和 API 面仍在变化。该能力稳定前可能出现破坏性变更。
            </p>
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-base font-semibold">可用插件</h2>
          <Badge variant="outline">示例</Badge>
        </div>

        {examplesQuery.isLoading ? (
          <div className="text-sm text-muted-foreground">正在加载内置示例...</div>
        ) : examplesQuery.error ? (
          <div className="text-sm text-destructive">加载内置示例失败。</div>
        ) : examples.length === 0 ? (
          <div className="rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">
            当前检出中没有找到内置示例插件。
          </div>
        ) : (
          <ul className="divide-y divide-border/60 rounded-md border border-border/60 bg-card/40">
            {examples.map((example) => {
              const installedPlugin = installedByPackageName.get(example.packageName);
              const installPending =
                installMutation.isPending &&
                installMutation.variables?.isLocalPath &&
                installMutation.variables.packageName === example.localPath;

              return (
                <li key={example.packageName} className="transition-colors hover:bg-muted/20">
                  <div className="flex items-center gap-4 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{example.displayName}</span>
                        <Badge variant="outline">示例</Badge>
                        {installedPlugin ? (
                          <Badge
                            variant={installedPlugin.status === "ready" ? "default" : "secondary"}
                            className={installedPlugin.status === "ready" ? "border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-400 hover:bg-emerald-500/[0.08]" : ""}
                          >
                            {installedPlugin.status}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">未安装</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{example.description}</p>
                      <p className="mt-1 truncate font-geek-mono text-xs text-muted-foreground">{example.packageName}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {installedPlugin ? (
                        <>
                          {installedPlugin.status !== "ready" && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={enableMutation.isPending}
                              onClick={() => enableMutation.mutate(installedPlugin.id)}
                            >
                              启用
                            </Button>
                          )}
                          <Button variant="outline" size="sm" asChild>
                            <Link to={`/instance/settings/plugins/${installedPlugin.id}`}>
                              {installedPlugin.status === "ready" ? "打开设置" : "复核"}
                            </Link>
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          disabled={installPending || installMutation.isPending}
                          onClick={() =>
                            installMutation.mutate({
                              packageName: example.localPath,
                              isLocalPath: true,
                            })
                          }
                        >
                          {installPending ? "正在安装..." : "安装示例"}
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Puzzle className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-base font-semibold">已安装插件</h2>
        </div>

        {!installedPlugins.length ? (
          <Card className="border-dashed bg-card/30">
            <CardContent className="flex flex-col items-center justify-center py-10">
              <Puzzle className="h-10 w-10 text-muted-foreground mb-4" />
              <p className="text-sm font-medium">尚未安装插件</p>
              <p className="text-xs text-muted-foreground mt-1">
                安装插件以扩展功能。
              </p>
            </CardContent>
          </Card>
        ) : (
          <ul className="divide-y divide-border/60 rounded-md border border-border/60 bg-card/40">
            {installedPlugins.map((plugin) => (
              <li key={plugin.id} className="transition-colors hover:bg-muted/20">
                <div className="flex items-start gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/instance/settings/plugins/${plugin.id}`}
                        className="block truncate font-medium hover:text-foreground/80"
                        title={plugin.manifestJson.displayName ?? plugin.packageName}
                      >
                        {plugin.manifestJson.displayName ?? plugin.packageName}
                      </Link>
                      {examplePackageNames.has(plugin.packageName) && (
                        <Badge variant="outline">示例</Badge>
                      )}
                    </div>
                    <div>
                      <p className="mt-0.5 truncate font-geek-mono text-xs text-muted-foreground" title={plugin.packageName}>
                        {plugin.packageName} · v{plugin.manifestJson.version ?? plugin.version}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground truncate mt-0.5" title={plugin.manifestJson.description}>
                      {plugin.manifestJson.description || "未提供描述。"}
                    </p>
                    {plugin.status === "error" && (
                      <div className="mt-3 rounded-md border border-destructive/25 bg-destructive/[0.08] px-3 py-2">
                        <div className="flex flex-wrap items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                              <AlertTriangle className="h-4 w-4 shrink-0" />
                              <span>插件错误</span>
                            </div>
                            <p
                              className="mt-1 break-words text-sm text-destructive/90"
                              title={plugin.lastError ?? undefined}
                            >
                              {errorSummaryByPluginId.get(plugin.id)}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-destructive/30 bg-background/60 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setErrorDetailsPlugin(plugin)}
                          >
                            查看完整错误
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 self-center">
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            plugin.status === "ready"
                              ? "default"
                              : plugin.status === "error"
                                ? "destructive"
                              : "secondary"
                          }
                          className={cn(
                            "shrink-0",
                            plugin.status === "ready" ? "border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-400 hover:bg-emerald-500/[0.08]" : ""
                          )}
                        >
                          {plugin.status}
                        </Badge>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          className="h-8 w-8"
                          title={plugin.status === "ready" ? "禁用" : "启用"}
                          onClick={() => {
                            if (plugin.status === "ready") {
                              disableMutation.mutate(plugin.id);
                            } else {
                              enableMutation.mutate(plugin.id);
                            }
                          }}
                          disabled={enableMutation.isPending || disableMutation.isPending}
                        >
                          <Power className={cn("h-4 w-4", plugin.status === "ready" ? "text-emerald-400" : "")} />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          title="卸载"
                          onClick={() => {
                            setUninstallPluginId(plugin.id);
                            setUninstallPluginName(plugin.manifestJson.displayName ?? plugin.packageName);
                          }}
                          disabled={uninstallMutation.isPending}
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      </div>
                      <Button variant="outline" size="sm" className="mt-2 h-8" asChild>
                        <Link to={`/instance/settings/plugins/${plugin.id}`}>
                          <Settings className="h-4 w-4" />
                          配置
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog
        open={uninstallPluginId !== null}
        onOpenChange={(open) => { if (!open) setUninstallPluginId(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>卸载插件</DialogTitle>
            <DialogDescription>
              确定要卸载 <strong>{uninstallPluginName}</strong> 吗？此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUninstallPluginId(null)}>取消</Button>
            <Button
              variant="destructive"
              disabled={uninstallMutation.isPending}
              onClick={() => {
                if (uninstallPluginId) {
                  uninstallMutation.mutate(uninstallPluginId, {
                    onSettled: () => setUninstallPluginId(null),
                  });
                }
              }}
            >
              {uninstallMutation.isPending ? "正在卸载..." : "卸载"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={errorDetailsPlugin !== null}
        onOpenChange={(open) => { if (!open) setErrorDetailsPlugin(null); }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>错误详情</DialogTitle>
            <DialogDescription>
              {errorDetailsPlugin?.manifestJson.displayName ?? errorDetailsPlugin?.packageName ?? "插件"} 进入了错误状态。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-destructive/25 bg-destructive/[0.08] px-4 py-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div className="space-y-1 text-sm">
                  <p className="font-medium text-destructive">
                    错误内容
                  </p>
                  <p className="break-words text-destructive/90">
                    {errorDetailsPlugin ? getPluginErrorSummary(errorDetailsPlugin) : "没有可用的错误摘要。"}
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">完整错误输出</p>
              <pre className="max-h-[50vh] overflow-auto rounded-md border border-border/60 bg-background/70 p-3 font-geek-mono text-xs leading-5 whitespace-pre-wrap break-words">
                {errorDetailsPlugin?.lastError ?? "没有存储错误消息。"}
              </pre>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setErrorDetailsPlugin(null)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
