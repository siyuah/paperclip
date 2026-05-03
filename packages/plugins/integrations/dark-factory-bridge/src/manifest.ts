import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "paperclipai.dark-factory-bridge",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Dark Factory Bridge（中文）",
  description: "Dark Factory Bridge 插件：以中文界面显示投影、Journal 游标、Provider 健康和 rehydrate receipt；不会成为权威执行记录。",
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
      description: "Dark Factory environment driver with deterministic mock mode, live-local HTTP mode, and remote provider alpha mode. Projection is non-authoritative; Dark Factory Journal remains truth source.",
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
            description: "Dark Factory HTTP endpoint for http or remote mode, for example http://127.0.0.1:9701 or a trusted remote URL."
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
            description: "Inline API key for local preview only. Prefer apiKeySecretRef outside local development."
          },
          apiKeySecretRef: {
            type: "string",
            description: "Secret reference for the Dark Factory API key. Supports legacy env:NAME/env://NAME and host-managed secret://NAME/host-secret://NAME references. The plugin stores only the reference, not the secret value."
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
        displayName: "Dark Factory Provider 健康",
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
