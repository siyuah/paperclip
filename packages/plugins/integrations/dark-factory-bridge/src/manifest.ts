import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "paperclipai.dark-factory-bridge",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Dark Factory Bridge（中文）",
  description: "Dark Factory Bridge 插件：以中文界面显示投影、日志游标、提供方健康和重建回执；不会成为权威执行记录。",
  author: "Paperclip",
  categories: ["automation", "ui"],
  capabilities: [
    "api.routes.register",
    "database.namespace.migrate",
    "database.namespace.read",
    "database.namespace.write",
    "environment.drivers.register",
    "issues.read",
    "ui.dashboardWidget.register",
    "ui.detailTab.register",
    "instance.settings.register"
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui"
  },
  database: {
    namespaceSlug: "dark_factory_bridge",
    migrationsDir: "migrations",
    coreReadTables: ["issues"]
  },
  environmentDrivers: [
    {
      driverKey: "dark-factory-mock",
      kind: "environment_driver",
      displayName: "Dark Factory Bridge（中文）",
      description: "Dark Factory 环境驱动：支持确定性模拟模式、本地 HTTP mode 和远程提供方 alpha 模式。所有投影均非权威；Dark Factory Journal remains truth source。",
      configSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          mode: {
            type: "string",
            enum: ["mock", "http", "remote"],
            default: "mock"
          },
          endpoint: {
            type: "string",
            description: "HTTP endpoint：HTTP 或远程模式使用的 Dark Factory HTTP 端点，例如 http://127.0.0.1:9701 或可信远程 URL。"
          },
          projectionMode: {
            type: "string",
            enum: ["deterministic"],
            default: "deterministic"
          },
          timeoutMs: {
            type: "number",
            default: 10000
          },
          apiKey: {
            type: "string",
            description: "仅供本地预览使用的内联 API key。本地开发之外请优先使用 apiKeySecretRef。"
          },
          apiKeySecretRef: {
            type: "string",
            description: "Dark Factory API key 的密钥引用。支持旧版 env:NAME/env://NAME 以及宿主托管的 secret://NAME/host-secret://NAME 引用。插件只保存引用，不保存密钥值。"
          },
          requestedBy: {
            type: "string",
            default: "paperclip-dark-factory-bridge"
          },
          workloadClass: {
            type: "string",
            enum: ["chat", "code", "reasoning", "vision", "memory_maintenance", "repair", "operator_adjudication"],
            default: "code"
          },
          routePolicyRef: {
            type: "string"
          },
          retryMaxRetries: {
            type: "number",
            default: 3
          },
          retryBaseDelayMs: {
            type: "number",
            default: 500
          },
          retryMaxDelayMs: {
            type: "number",
            default: 5000
          },
          retryableStatuses: {
            type: "array",
            items: { type: "number" },
            default: [502, 503, 504]
          }
        },
        required: ["mode"]
      }
    }
  ],
  apiRoutes: [
    {
      routeKey: "projection",
      method: "GET",
      path: "/issues/:issueId/dark-factory/projection",
      auth: "board-or-agent",
      capability: "api.routes.register",
      companyResolution: { from: "issue", param: "issueId" }
    },
    {
      routeKey: "journal-cursor",
      method: "GET",
      path: "/issues/:issueId/dark-factory/journal-cursor",
      auth: "board-or-agent",
      capability: "api.routes.register",
      companyResolution: { from: "issue", param: "issueId" }
    },
    {
      routeKey: "provider-health",
      method: "GET",
      path: "/issues/:issueId/dark-factory/provider-health",
      auth: "board-or-agent",
      capability: "api.routes.register",
      companyResolution: { from: "issue", param: "issueId" }
    },
    {
      routeKey: "runtime-capability-snapshot",
      method: "GET",
      path: "/issues/:issueId/dark-factory/runtime-capability-snapshot",
      auth: "board-or-agent",
      capability: "api.routes.register",
      companyResolution: { from: "issue", param: "issueId" }
    },
    {
      routeKey: "rehydrate-request",
      method: "POST",
      path: "/issues/:issueId/dark-factory/rehydrate-request",
      auth: "board-or-agent",
      capability: "api.routes.register",
      companyResolution: { from: "issue", param: "issueId" }
    }
  ],
  ui: {
    slots: [
      {
        type: "dashboardWidget",
        id: "dark-factory-provider-health",
        displayName: "Dark Factory 提供方健康",
        exportName: "DashboardWidget"
      },
      {
        type: "taskDetailView",
        id: "dark-factory-projection",
        displayName: "Dark Factory 投影",
        exportName: "IssuePanel",
        entityTypes: ["issue"]
      },
      {
        type: "settingsPage",
        id: "settings",
        displayName: "Dark Factory Bridge 设置",
        exportName: "SettingsPage"
      }
    ]
  }
};

export default manifest;
