import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "paperclipai.dark-factory-bridge-example",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Dark Factory Bridge Projection Example",
  description: "Mock bridge plugin that displays Dark Factory projection, cursor, provider health, and rehydrate receipts without becoming an authoritative execution record.",
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
    namespaceSlug: "dark_factory_bridge_poc",
    migrationsDir: "migrations",
    coreReadTables: ["issues"]
  },
  environmentDrivers: [
    {
      driverKey: "dark-factory-mock",
      kind: "environment_driver",
      displayName: "Dark Factory Mock",
      description: "mock-only Dark Factory environment driver. Projection is non-authoritative; Dark Factory Journal remains truth source.",
      configSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          mode: {
            type: "string",
            enum: ["mock"],
            default: "mock"
          },
          endpoint: {
            type: "string",
            description: "Optional Dark Factory endpoint placeholder ignored by mock-only mode."
          },
          projectionMode: {
            type: "string",
            enum: ["deterministic"],
            default: "deterministic"
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
        displayName: "Dark Factory Provider Health",
        exportName: "DashboardWidget"
      },
      {
        type: "taskDetailView",
        id: "dark-factory-projection",
        displayName: "Dark Factory Projection",
        exportName: "IssuePanel",
        entityTypes: ["issue"]
      },
      {
        type: "settingsPage",
        id: "settings",
        displayName: "Dark Factory Bridge",
        exportName: "SettingsPage"
      }
    ]
  }
};

export default manifest;
