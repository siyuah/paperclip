import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  Brain,
  Check,
  CircleDollarSign,
  Code2,
  Eye,
  KeyRound,
  MessageSquare,
  Plus,
  RefreshCw,
  Server,
  Sparkles,
  Trash2,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  fetchModelsFromProvider,
  testProviderConnection,
  uid,
  useModelPool,
  type CeoModelConfig,
  type ModelCapability,
  type ModelEntry,
  type ModelProvider,
} from "@/lib/model-pool";

const CAPABILITY_OPTIONS: Array<{ value: ModelCapability; label: string; icon: LucideIcon }> = [
  { value: "reasoning", label: "推理", icon: Brain },
  { value: "code", label: "代码", icon: Code2 },
  { value: "creative", label: "创作", icon: Sparkles },
  { value: "analysis", label: "分析", icon: CircleDollarSign },
  { value: "conversation", label: "对话", icon: MessageSquare },
  { value: "vision", label: "视觉", icon: Eye },
  { value: "fast", label: "快速", icon: Zap },
];

const COST_TIER_LABELS: Record<ModelEntry["costTier"], string> = {
  low: "低",
  medium: "中",
  high: "高",
};

type ProviderDraft = {
  name: string;
  baseUrl: string;
  apiKey: string;
};

type ModelDraft = {
  modelId: string;
  displayName: string;
  capabilities: ModelCapability[];
  costTier: ModelEntry["costTier"];
  maxTokens: string;
};

type FetchStatus = {
  providerId: string;
  tone: "success" | "error";
  message: string;
} | null;

type TestStatus = {
  modelKey: string;
  tone: "success" | "error";
  message: string;
} | null;

const EMPTY_PROVIDER_DRAFT: ProviderDraft = {
  name: "",
  baseUrl: "",
  apiKey: "",
};

const EMPTY_MODEL_DRAFT: ModelDraft = {
  modelId: "",
  displayName: "",
  capabilities: ["reasoning", "code", "analysis"],
  costTier: "medium",
  maxTokens: "",
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeModelDisplayName(modelId: string) {
  return modelId
    .split(/[-_:./]+/)
    .filter(Boolean)
    .map((part) => part.length <= 3 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function modelKey(providerId: string, modelId: string) {
  return `${providerId}:${modelId}`;
}

function maskKey(apiKey: string) {
  if (!apiKey) return "未填写";
  if (apiKey.length <= 10) return "已保存";
  return `${apiKey.slice(0, 5)}...${apiKey.slice(-4)}`;
}

export function ModelConfigCenter() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const [pool, setPool] = useModelPool();
  const [providerDraft, setProviderDraft] = useState<ProviderDraft>(EMPTY_PROVIDER_DRAFT);
  const [modelDraftByProvider, setModelDraftByProvider] = useState<Record<string, ModelDraft>>({});
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>(null);
  const [testStatus, setTestStatus] = useState<TestStatus>(null);
  const [fetchingProviderId, setFetchingProviderId] = useState<string | null>(null);
  const [testingModelKey, setTestingModelKey] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([
      { label: "实例设置", href: "/instance/settings/general" },
      { label: "模型配置中心" },
    ]);
  }, [setBreadcrumbs]);

  useEffect(() => {
    if (selectedProviderId && pool.providers.some((provider) => provider.id === selectedProviderId)) return;
    setSelectedProviderId(pool.providers[0]?.id ?? null);
  }, [pool.providers, selectedProviderId]);

  const selectedProvider = useMemo(
    () => pool.providers.find((provider) => provider.id === selectedProviderId) ?? null,
    [pool.providers, selectedProviderId],
  );

  const activeProviders = pool.providers.filter((provider) => provider.isActive);
  const enabledModels = pool.providers.flatMap((provider) =>
    provider.models
      .filter((model) => provider.isActive && model.enabled)
      .map((model) => ({ provider, model })),
  );
  const ceoModel = pool.ceoModel
    ? enabledModels.find(({ provider, model }) =>
        provider.id === pool.ceoModel?.providerId && model.modelId === pool.ceoModel.modelId,
      ) ?? null
    : null;
  const delegatedModelCount = enabledModels.filter(({ provider, model }) =>
    !pool.ceoModel || provider.id !== pool.ceoModel.providerId || model.modelId !== pool.ceoModel.modelId,
  ).length;

  function addOrUpdateProvider() {
    const name = providerDraft.name.trim();
    const baseUrl = providerDraft.baseUrl.trim();
    const apiKey = providerDraft.apiKey.trim();
    if (!name || !baseUrl || !apiKey) return;

    const timestamp = nowIso();
    setPool((current) => {
      if (editingProviderId) {
        return {
          ...current,
          providers: current.providers.map((provider) =>
            provider.id === editingProviderId
              ? {
                  ...provider,
                  name,
                  baseUrl,
                  apiKey,
                  updatedAt: timestamp,
                }
              : provider,
          ),
        };
      }

      const provider: ModelProvider = {
        id: uid(),
        name,
        baseUrl,
        apiKey,
        models: [],
        isActive: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      setSelectedProviderId(provider.id);
      return {
        ...current,
        providers: [provider, ...current.providers],
      };
    });

    setProviderDraft(EMPTY_PROVIDER_DRAFT);
    setEditingProviderId(null);
  }

  function editProvider(provider: ModelProvider) {
    setEditingProviderId(provider.id);
    setProviderDraft({
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
    });
    setSelectedProviderId(provider.id);
  }

  function removeProvider(providerId: string) {
    const provider = pool.providers.find((item) => item.id === providerId);
    if (!provider) return;
    const confirmed = window.confirm(`删除 Provider "${provider.name}"？该 Provider 下的模型配置也会删除。`);
    if (!confirmed) return;

    setPool((current) => ({
      ...current,
      providers: current.providers.filter((item) => item.id !== providerId),
      ceoModel: current.ceoModel?.providerId === providerId ? null : current.ceoModel,
    }));
  }

  function toggleProvider(providerId: string) {
    setPool((current) => {
      let ceoModel = current.ceoModel;
      const providers = current.providers.map((provider) => {
        if (provider.id !== providerId) return provider;
        const nextActive = !provider.isActive;
        if (!nextActive && ceoModel?.providerId === providerId) {
          ceoModel = null;
        }
        return {
          ...provider,
          isActive: nextActive,
          updatedAt: nowIso(),
        };
      });

      return {
        ...current,
        providers,
        ceoModel,
      };
    });
  }

  function getModelDraft(providerId: string) {
    return modelDraftByProvider[providerId] ?? EMPTY_MODEL_DRAFT;
  }

  function updateModelDraft(providerId: string, patch: Partial<ModelDraft>) {
    setModelDraftByProvider((current) => ({
      ...current,
      [providerId]: {
        ...getModelDraft(providerId),
        ...patch,
      },
    }));
  }

  function addModel(providerId: string) {
    const draft = getModelDraft(providerId);
    const modelId = draft.modelId.trim();
    if (!modelId) return;

    const maxTokens = draft.maxTokens.trim() ? Number.parseInt(draft.maxTokens, 10) : undefined;
    const nextModel: ModelEntry = {
      id: uid(),
      modelId,
      displayName: draft.displayName.trim() || normalizeModelDisplayName(modelId),
      capabilities: draft.capabilities,
      costTier: draft.costTier,
      maxTokens: Number.isFinite(maxTokens) ? maxTokens : undefined,
      enabled: true,
    };

    setPool((current) => ({
      ...current,
      providers: current.providers.map((provider) => {
        if (provider.id !== providerId) return provider;
        const models = provider.models.some((model) => model.modelId === nextModel.modelId)
          ? provider.models.map((model) => model.modelId === nextModel.modelId ? { ...nextModel, id: model.id } : model)
          : [nextModel, ...provider.models];

        return {
          ...provider,
          models,
          updatedAt: nowIso(),
        };
      }),
    }));

    updateModelDraft(providerId, EMPTY_MODEL_DRAFT);
  }

  function removeModel(providerId: string, modelId: string) {
    setPool((current) => ({
      ...current,
      providers: current.providers.map((provider) =>
        provider.id === providerId
          ? {
              ...provider,
              models: provider.models.filter((model) => model.modelId !== modelId),
              updatedAt: nowIso(),
            }
          : provider,
      ),
      ceoModel: current.ceoModel?.providerId === providerId && current.ceoModel.modelId === modelId
        ? null
        : current.ceoModel,
    }));
  }

  function toggleModel(providerId: string, modelId: string) {
    setPool((current) => {
      let ceoModel = current.ceoModel;
      const providers = current.providers.map((provider) => {
        if (provider.id !== providerId) return provider;
        return {
          ...provider,
          models: provider.models.map((model) => {
            if (model.modelId !== modelId) return model;
            const enabled = !model.enabled;
            if (!enabled && ceoModel?.providerId === providerId && ceoModel.modelId === modelId) {
              ceoModel = null;
            }
            return { ...model, enabled };
          }),
          updatedAt: nowIso(),
        };
      });

      return {
        ...current,
        providers,
        ceoModel,
      };
    });
  }

  function setCeoModel(config: CeoModelConfig | null) {
    setPool((current) => ({
      ...current,
      ceoModel: config,
    }));
  }

  async function fetchModels(provider: ModelProvider) {
    setFetchingProviderId(provider.id);
    setFetchStatus(null);
    const result = await fetchModelsFromProvider(provider.baseUrl, provider.apiKey);
    setFetchingProviderId(null);

    if (result.error) {
      setFetchStatus({ providerId: provider.id, tone: "error", message: result.error });
      return;
    }

    setPool((current) => ({
      ...current,
      providers: current.providers.map((item) => {
        if (item.id !== provider.id) return item;

        const existing = new Map(item.models.map((model) => [model.modelId, model]));
        const fetchedModels = result.models.map((modelId) => {
          const existingModel = existing.get(modelId);
          if (existingModel) return existingModel;
          return {
            id: uid(),
            modelId,
            displayName: normalizeModelDisplayName(modelId),
            capabilities: inferCapabilities(modelId),
            costTier: inferCostTier(modelId),
            enabled: true,
          } satisfies ModelEntry;
        });

        return {
          ...item,
          models: fetchedModels,
          updatedAt: nowIso(),
        };
      }),
    }));

    setFetchStatus({
      providerId: provider.id,
      tone: "success",
      message: `已拉取 ${result.models.length} 个模型。`,
    });
  }

  async function testModel(provider: ModelProvider, model: ModelEntry) {
    const key = modelKey(provider.id, model.modelId);
    setTestingModelKey(key);
    setTestStatus(null);
    const result = await testProviderConnection(provider.baseUrl, provider.apiKey, model.modelId);
    setTestingModelKey(null);
    setTestStatus({
      modelKey: key,
      tone: result.ok ? "success" : "error",
      message: result.ok ? `连通，${result.latencyMs}ms` : result.error ?? "连接失败",
    });
  }

  return (
    <div className="max-w-6xl space-y-7">
      <header className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold tracking-tight">模型配置中心</h1>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          统一管理中转站、可用模型和 CEO 固定模型。CEO 使用用户锁定的模型，其他代理从启用模型池中按任务自主调配。
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <SummaryTile label="Provider" value={pool.providers.length} />
        <SummaryTile label="启用模型" value={enabledModels.length} />
        <SummaryTile label="可调配模型" value={delegatedModelCount} />
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(300px,360px)_1fr]">
        <div className="space-y-5">
          <Panel title={editingProviderId ? "编辑 Provider" : "新增 Provider"}>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="providerName">名称</Label>
                <Input
                  id="providerName"
                  value={providerDraft.name}
                  onChange={(event) => setProviderDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder="主中转站"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="providerBaseUrl">Base URL</Label>
                <Input
                  id="providerBaseUrl"
                  value={providerDraft.baseUrl}
                  onChange={(event) => setProviderDraft((current) => ({ ...current, baseUrl: event.target.value }))}
                  placeholder="https://relay.example.com/v1"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="providerApiKey">API Key</Label>
                <Input
                  id="providerApiKey"
                  type="password"
                  value={providerDraft.apiKey}
                  onChange={(event) => setProviderDraft((current) => ({ ...current, apiKey: event.target.value }))}
                  placeholder="sk-..."
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={addOrUpdateProvider}
                  disabled={!providerDraft.name.trim() || !providerDraft.baseUrl.trim() || !providerDraft.apiKey.trim()}
                >
                  {editingProviderId ? "保存 Provider" : "添加 Provider"}
                </Button>
                {editingProviderId ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingProviderId(null);
                      setProviderDraft(EMPTY_PROVIDER_DRAFT);
                    }}
                  >
                    取消
                  </Button>
                ) : null}
              </div>
            </div>
          </Panel>

          <Panel title="Provider 列表">
            {pool.providers.length === 0 ? (
              <EmptyState
                icon={Server}
                title="还没有 Provider"
                body="先录入一个中转站，再手动添加模型或自动拉取 /v1/models。"
              />
            ) : (
              <div className="space-y-2">
                {pool.providers.map((provider) => (
                  <button
                    type="button"
                    key={provider.id}
                    className={cn(
                      "w-full rounded-md border px-3 py-3 text-left transition-colors",
                      selectedProviderId === provider.id
                        ? "border-ring bg-accent/50"
                        : "border-border/60 bg-background/60 hover:bg-accent/30",
                    )}
                    onClick={() => setSelectedProviderId(provider.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{provider.name}</span>
                          <Badge variant={provider.isActive ? "default" : "secondary"}>
                            {provider.isActive ? "启用" : "停用"}
                          </Badge>
                        </div>
                        <p className="mt-1 truncate font-geek-mono text-xs text-muted-foreground">
                          {provider.baseUrl}
                        </p>
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <KeyRound className="h-3 w-3" />
                          {maskKey(provider.apiKey)} · {provider.models.length} models
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="CEO 固定模型">
            <div className="grid gap-4 md:grid-cols-[1fr_280px]">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  CEO 模型由用户固定指定，保存后不会被自动调度改写。其他代理只会从启用的非 CEO 模型池里选型。
                </p>
                {ceoModel ? (
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Check className="h-4 w-4 text-emerald-500" />
                      {ceoModel.model.displayName}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {ceoModel.provider.name} · {ceoModel.model.modelId} · 已由用户锁定
                    </p>
                  </div>
                ) : (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-muted-foreground">
                    尚未指定 CEO 模型。
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="ceoModel">选择模型</Label>
                <select
                  id="ceoModel"
                  className="h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring"
                  value={pool.ceoModel ? modelKey(pool.ceoModel.providerId, pool.ceoModel.modelId) : ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (!value) {
                      setCeoModel(null);
                      return;
                    }
                    const [providerId, ...modelIdParts] = value.split(":");
                    setCeoModel({
                      providerId: providerId!,
                      modelId: modelIdParts.join(":"),
                      lockedByUser: true,
                    });
                  }}
                >
                  <option value="">未指定</option>
                  {enabledModels.map(({ provider, model }) => (
                    <option key={modelKey(provider.id, model.modelId)} value={modelKey(provider.id, model.modelId)}>
                      {provider.name} / {model.displayName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Panel>

          {selectedProvider ? (
            <ProviderModelsPanel
              provider={selectedProvider}
              draft={getModelDraft(selectedProvider.id)}
              fetchStatus={fetchStatus?.providerId === selectedProvider.id ? fetchStatus : null}
              testStatus={testStatus}
              fetching={fetchingProviderId === selectedProvider.id}
              testingModelKey={testingModelKey}
              onDraftChange={(patch) => updateModelDraft(selectedProvider.id, patch)}
              onAddModel={() => addModel(selectedProvider.id)}
              onFetchModels={() => fetchModels(selectedProvider)}
              onToggleProvider={() => toggleProvider(selectedProvider.id)}
              onEditProvider={() => editProvider(selectedProvider)}
              onRemoveProvider={() => removeProvider(selectedProvider.id)}
              onToggleModel={(modelId) => toggleModel(selectedProvider.id, modelId)}
              onRemoveModel={(modelId) => removeModel(selectedProvider.id, modelId)}
              onTestModel={(model) => testModel(selectedProvider, model)}
              ceoModel={pool.ceoModel}
            />
          ) : (
            <Panel title="模型列表">
              <EmptyState
                icon={Bot}
                title="选择或新增一个 Provider"
                body="Provider 选中后，这里会显示该中转站下的可用模型。"
              />
            </Panel>
          )}
        </div>
      </section>
    </div>
  );
}

function ProviderModelsPanel({
  provider,
  draft,
  fetchStatus,
  testStatus,
  fetching,
  testingModelKey,
  onDraftChange,
  onAddModel,
  onFetchModels,
  onToggleProvider,
  onEditProvider,
  onRemoveProvider,
  onToggleModel,
  onRemoveModel,
  onTestModel,
  ceoModel,
}: {
  provider: ModelProvider;
  draft: ModelDraft;
  fetchStatus: FetchStatus;
  testStatus: TestStatus;
  fetching: boolean;
  testingModelKey: string | null;
  onDraftChange: (patch: Partial<ModelDraft>) => void;
  onAddModel: () => void;
  onFetchModels: () => void;
  onToggleProvider: () => void;
  onEditProvider: () => void;
  onRemoveProvider: () => void;
  onToggleModel: (modelId: string) => void;
  onRemoveModel: (modelId: string) => void;
  onTestModel: (model: ModelEntry) => void;
  ceoModel: CeoModelConfig | null;
}) {
  return (
    <Panel
      title={provider.name}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={onToggleProvider}>
            {provider.isActive ? "停用" : "启用"}
          </Button>
          <Button size="sm" variant="outline" onClick={onEditProvider}>
            编辑
          </Button>
          <Button size="icon-sm" variant="outline" onClick={onRemoveProvider} title="删除 Provider">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-[1fr_180px]">
          <div className="space-y-1.5">
            <Label>Base URL</Label>
            <div className="rounded-md border border-border/60 bg-background/70 px-3 py-2 font-geek-mono text-xs text-muted-foreground">
              {provider.baseUrl}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>API Key</Label>
            <div className="rounded-md border border-border/60 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
              {maskKey(provider.apiKey)}
            </div>
          </div>
        </div>

        <div className="rounded-md border border-border/60 bg-background/50 px-3 py-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="modelId">模型标识</Label>
              <Input
                id="modelId"
                value={draft.modelId}
                onChange={(event) => onDraftChange({ modelId: event.target.value })}
                placeholder="gpt-4o"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="displayName">显示名称</Label>
              <Input
                id="displayName"
                value={draft.displayName}
                onChange={(event) => onDraftChange({ displayName: event.target.value })}
                placeholder="GPT-4o"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="costTier">成本档位</Label>
              <select
                id="costTier"
                className="h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring"
                value={draft.costTier}
                onChange={(event) => onDraftChange({ costTier: event.target.value as ModelEntry["costTier"] })}
              >
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="maxTokens">最大 Tokens</Label>
              <Input
                id="maxTokens"
                type="number"
                min={1}
                value={draft.maxTokens}
                onChange={(event) => onDraftChange({ maxTokens: event.target.value })}
                placeholder="可选"
              />
            </div>
          </div>

          <div className="mt-3 space-y-2">
            <Label>能力标签</Label>
            <div className="flex flex-wrap gap-2">
              {CAPABILITY_OPTIONS.map((option) => {
                const Icon = option.icon;
                const selected = draft.capabilities.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                      selected
                        ? "border-ring bg-accent text-foreground"
                        : "border-border/60 text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                    )}
                    onClick={() => {
                      const next = selected
                        ? draft.capabilities.filter((value) => value !== option.value)
                        : [...draft.capabilities, option.value];
                      onDraftChange({ capabilities: next });
                    }}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={onAddModel} disabled={!draft.modelId.trim()}>
              <Plus className="h-4 w-4" />
              添加模型
            </Button>
            <Button size="sm" variant="outline" onClick={onFetchModels} disabled={fetching}>
              <RefreshCw className={cn("h-4 w-4", fetching && "animate-spin")} />
              自动拉取
            </Button>
            {fetchStatus ? (
              <span className={cn(
                "text-xs",
                fetchStatus.tone === "success" ? "text-emerald-500" : "text-destructive",
              )}>
                {fetchStatus.message}
              </span>
            ) : null}
          </div>
        </div>

        {provider.models.length === 0 ? (
          <EmptyState
            icon={Bot}
            title="还没有模型"
            body="可以手动添加模型，也可以点击自动拉取从 /v1/models 导入。"
          />
        ) : (
          <div className="divide-y rounded-md border border-border/60 bg-card/40">
            {provider.models.map((model) => {
              const isCeo = ceoModel?.providerId === provider.id && ceoModel.modelId === model.modelId;
              const key = modelKey(provider.id, model.modelId);
              const status = testStatus?.modelKey === key ? testStatus : null;

              return (
                <div key={model.id} className="flex flex-col gap-3 px-3 py-3 md:flex-row md:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("font-medium", !model.enabled && "text-muted-foreground line-through")}>
                        {model.displayName}
                      </span>
                      <Badge variant={model.enabled ? "default" : "secondary"}>
                        {model.enabled ? "启用" : "停用"}
                      </Badge>
                      {isCeo ? <Badge variant="outline" className="border-emerald-500/50 text-emerald-500">CEO 锁定</Badge> : null}
                      <Badge variant="outline">成本 {COST_TIER_LABELS[model.costTier]}</Badge>
                    </div>
                    <p className="mt-1 font-geek-mono text-xs text-muted-foreground">{model.modelId}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {model.capabilities.map((capability) => (
                        <Badge key={capability} variant="secondary">
                          {CAPABILITY_OPTIONS.find((option) => option.value === capability)?.label ?? capability}
                        </Badge>
                      ))}
                      {model.maxTokens ? <Badge variant="secondary">{model.maxTokens.toLocaleString()} tokens</Badge> : null}
                    </div>
                    {status ? (
                      <p className={cn(
                        "mt-2 text-xs",
                        status.tone === "success" ? "text-emerald-500" : "text-destructive",
                      )}>
                        {status.message}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onTestModel(model)}
                      disabled={testingModelKey === key || !model.enabled || !provider.isActive}
                    >
                      {testingModelKey === key ? "测试中" : "测试"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onToggleModel(model.modelId)}>
                      {model.enabled ? "停用" : "启用"}
                    </Button>
                    <Button size="icon-sm" variant="outline" onClick={() => onRemoveModel(model.modelId)} title="删除模型">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-3">
          <Label htmlFor="routingPolicy">其他代理调配策略</Label>
          <Textarea
            id="routingPolicy"
            className="mt-2 min-h-24 text-sm"
            readOnly
            value={[
              "CEO 代理：始终使用上方由用户锁定的模型。",
              "其他代理：CEO 根据任务需要，从启用 Provider 下的启用模型中自主调配。",
              "调配参考：reasoning/code/analysis/vision/fast 能力标签、成本档位、最大 token。",
            ].join("\n")}
          />
        </div>
      </div>
    </Panel>
  );
}

function Panel({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
        {actions}
      </div>
      <div className="rounded-md border border-border/60 bg-card/40 px-4 py-4">
        {children}
      </div>
    </section>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border/60 bg-card/40 px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border/70 bg-background/40 px-4 py-10 text-center">
      <Icon className="h-8 w-8 text-muted-foreground" />
      <p className="mt-3 text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{body}</p>
    </div>
  );
}

function inferCapabilities(modelId: string): ModelCapability[] {
  const id = modelId.toLowerCase();
  const capabilities = new Set<ModelCapability>(["conversation"]);

  if (id.includes("gpt") || id.includes("claude") || id.includes("deepseek") || id.includes("qwen")) {
    capabilities.add("reasoning");
    capabilities.add("analysis");
  }
  if (id.includes("code") || id.includes("codex") || id.includes("coder")) {
    capabilities.add("code");
  }
  if (id.includes("vision") || id.includes("vl") || id.includes("4o")) {
    capabilities.add("vision");
  }
  if (id.includes("mini") || id.includes("flash") || id.includes("haiku") || id.includes("fast")) {
    capabilities.add("fast");
  }
  if (id.includes("creative") || id.includes("opus")) {
    capabilities.add("creative");
  }

  return Array.from(capabilities);
}

function inferCostTier(modelId: string): ModelEntry["costTier"] {
  const id = modelId.toLowerCase();
  if (id.includes("mini") || id.includes("flash") || id.includes("haiku")) return "low";
  if (id.includes("opus") || id.includes("pro") || id.includes("5.5")) return "high";
  return "medium";
}
