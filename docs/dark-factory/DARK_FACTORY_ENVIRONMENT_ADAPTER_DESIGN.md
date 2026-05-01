# Dark Factory Environment Adapter Design

## 1. 目标

本文设计 Dark Factory runtime adapter 以 Plugin-hosted environment driver 的方式接入 Paperclip plugin SDK。目标是在 mock 阶段把 Dark Factory Run 的生命周期挂载到 Paperclip environment lifecycle hooks 上，让插件自己提供环境驱动、lease 管理、执行返回和 projection 写入边界，而不是把 Dark Factory 做成 Paperclip core 的内建 adapter。

选择 Plugin-hosted environment driver 的原因：

- 环境生命周期已经是 SDK 的扩展点。Dark Factory 的 Run/lease/execute/release 模型可以直接映射到 `onEnvironmentAcquireLease`、`onEnvironmentExecute`、`onEnvironmentReleaseLease` 等 hook。
- 插件可以独立演进。mock 阶段只需要插件包、manifest capability 和 worker hooks，不需要修改 Paperclip Task/Issue 主模型。
- truth source 边界更清楚。Paperclip 只保存 projection/cache/cursor/receipt/request metadata；Dark Factory Journal remains truth source。
- 测试半径更小。可以先在 plugin tests 中验证 mock lifecycle，再进入真实 provider 集成测试。

传统 Adapter 路径的优点是可以复用既有 adapter execution 管线、事件格式和 provider 成本统计字段；缺点是更容易把 Dark Factory 误建模成普通命令执行 provider，并诱导修改 Paperclip core 或 Task/Issue 主模型。Plugin-hosted environment driver 的优点是隔离性强、与 SDK 生命周期一致、适合渐进实现；缺点是需要补齐 manifest declaration、worker hook、lease metadata 约定，以及 AdapterExecutionResult 到 run event metadata 的清晰映射。

## 2. SDK 接口映射

| Dark Factory 操作 | Plugin SDK Hook | 说明 |
| --- | --- | --- |
| 创建 Run | `onEnvironmentAcquireLease` | lease = Dark Factory Run 的生命周期绑定 |
| 执行 Run | `onEnvironmentExecute` | 调用 Dark Factory 执行（mock 模式返回确定性 projection） |
| 恢复 Run | `onEnvironmentResumeLease` | 重连已有 Run 的 lease |
| 释放 Run | `onEnvironmentReleaseLease` | 正常结束 |
| 强制终止 | `onEnvironmentDestroyLease` | 异常终止 |
| 验证配置 | `onEnvironmentValidateConfig` | 检查 endpoint、mode、projection 参数 |
| 探测可达性 | `onEnvironmentProbe` | mock 模式直接 ready |

SDK 当前 environment lifecycle 类型签名摘要：

- `PluginEnvironmentValidateConfigParams`: `driverKey`, `config`。
- `PluginEnvironmentValidationResult`: `ok`, optional `warnings`, `errors`, `normalizedConfig`。
- `PluginEnvironmentProbeParams`: `driverKey`, `companyId`, `environmentId`, `config`。
- `PluginEnvironmentProbeResult`: `ok`, optional `summary`, `diagnostics`, `metadata`。
- `PluginEnvironmentAcquireLeaseParams`: base params plus `runId`, optional `workspaceMode`, `requestedCwd`。
- `PluginEnvironmentLease`: `providerLeaseId`, optional `metadata`, `expiresAt`。
- `PluginEnvironmentResumeLeaseParams`: base params plus `providerLeaseId`, optional `leaseMetadata`。
- `PluginEnvironmentReleaseLeaseParams`: base params plus `providerLeaseId`, optional `leaseMetadata`。
- `PluginEnvironmentDestroyLeaseParams`: same shape as release params。
- `PluginEnvironmentRealizeWorkspaceParams`: base params plus `lease`, `workspace` with optional local/remote path, mode, metadata。
- `PluginEnvironmentRealizeWorkspaceResult`: `cwd`, optional `metadata`。
- `PluginEnvironmentExecuteParams`: base params plus `lease`, `command`, optional `args`, `cwd`, `env`, `stdin`, `timeoutMs`。
- `PluginEnvironmentExecuteResult`: `exitCode`, optional `signal`, `timedOut`, `stdout`, `stderr`, optional `metadata`。

## 3. Mock 模式实现方案

mock 模式只使用现有 `mock-runtime-adapter.ts` 的确定性函数，不连接真实 Dark Factory，不读取 secrets，不把任何外部凭据放入 stdout、stderr、metadata 或 plugin DB。

所有 hook 返回的 projection 或 metadata 中都必须携带 projection boundary 三元组：

```json
{
  "source": "dark-factory-projection",
  "authoritative": false,
  "truthSource": "dark-factory-journal"
}
```

所有 mock 返回值中的 `terminalStateAdvanced` 必须始终为 `false`。该字段表达“插件 projection 没有推进 Dark Factory 终态”，避免 Paperclip 把 projection 当成终态控制权。

各 hook 行为：

- `onEnvironmentValidateConfig`: 验证 `driverKey`、`mode`、projection 相关配置。mock 模式接受 `mode = "mock"` 或缺省 mock 配置，返回 `ok: true` 与 normalized config。未知 mode 返回 validation error。
- `onEnvironmentProbe`: mock 模式直接返回 `ok: true`、`summary: "ready"`，metadata 中包含三元组、`terminalStateAdvanced: false`、runtime mode 与 provider health projection。
- `onEnvironmentAcquireLease`: 为 `params.runId` 创建 mock lease，`providerLeaseId` 建议使用稳定前缀加 runId。metadata 包含 runId、driverKey、journal cursor、provider health、runtime mode、三元组、`terminalStateAdvanced: false`。
- `onEnvironmentResumeLease`: 从 `providerLeaseId` 和 `leaseMetadata` 恢复 mock lease。若 metadata 可用则原样保留 cursor/receipt 摘要；若缺失则生成 deterministic rehydrate request，并返回三元组与 `terminalStateAdvanced: false`。
- `onEnvironmentReleaseLease`: 正常释放 mock lease，只返回 hook 成功，不推进 Dark Factory 终态。必要 metadata 只记录 release receipt/cache cursor。
- `onEnvironmentDestroyLease`: 异常终止 mock lease，记录 destroy request metadata 与 receipt 摘要，但仍不声明 Dark Factory terminal state 已推进。
- `onEnvironmentRealizeWorkspace`: Dark Factory mock 阶段通常不需要 workspace 物化。若 SDK 调用该 hook，返回请求中的 localPath/remotePath 或一个插件私有 mock cwd，并在 metadata 中声明 `workspaceRealized: false`。
- `onEnvironmentExecute`: 使用 `getMockRuntimeProjection`、`getMockRunAttemptMetadata`、`createMockCallbackReceipt`、`compareOrAdvanceCursor`、`replayMockJournal`、`reconcileMockProjection` 等确定性函数，返回 `exitCode: 0`、`timedOut: false`、结构化 stdout 或空 stdout，metadata 中放 projection/cursor/receipt 摘要、三元组、`terminalStateAdvanced: false`。mock 阶段 stderr 应为空，除非显式测试错误分支。

## 4. Manifest 变更

插件需要声明 environment driver 注册能力。建议新增：

- `capabilities`: 增加 `"environment.drivers.register"`。
- `environmentDrivers`: 增加一个 driver declaration。
- `driverKey`: 建议 `"dark-factory-mock"`。
- `kind`: 建议 `"environment_driver"`。
- `displayName`: 建议 `"Dark Factory Mock"`。
- `description`: 说明 mock-only、projection-only、Journal truth source。
- `configSchema`: 描述 mock 模式允许的 endpoint/mode/projection 参数；真实凭据字段在 mock 阶段禁止出现。

manifest diff 示意：

```diff
 export const manifest = {
   ...
   capabilities: [
     ...
+    "environment.drivers.register",
   ],
+  environmentDrivers: [
+    {
+      driverKey: "dark-factory-mock",
+      kind: "environment_driver",
+      displayName: "Dark Factory Mock",
+      description:
+        "Mock-only Dark Factory environment driver. Projection is non-authoritative; Dark Factory Journal remains truth source.",
+      configSchema: {
+        type: "object",
+        additionalProperties: false,
+        properties: {
+          mode: { type: "string", enum: ["mock"] },
+          endpoint: { type: "string" },
+          projectionMode: { type: "string", enum: ["deterministic"] }
+        }
+      }
+    }
+  ],
 } satisfies PluginManifest;
```

该变更只描述未来实现；本文不修改 `manifest.ts`。

## 5. AdapterExecutionResult 映射

Dark Factory 的 receipt、cursor、projection 应进入 Paperclip 执行结果的可审计 metadata，而不是进入 Task/Issue 主模型。

建议进入 `AdapterExecutionResult.resultJson` 的字段：

- `projection`: runtime projection 的只读快照，包含 source/authoritative/truthSource。
- `cursor`: 当前 journal cursor 摘要，包括 sequence、observedAt、gap/out-of-order 检测结果。
- `receipt`: callback receipt 摘要，包括 receipt id、status、observedAt。
- `runtimeMode`: mock runtime mode。
- `providerHealth`: provider health projection。
- `terminalStateAdvanced`: 固定 `false`。
- `disclaimer`: 包含 Journal remains truth source 的 projection disclaimer。

建议进入 run event metadata 的字段：

- `driverKey`
- `environmentId`
- `providerLeaseId`
- `runId`
- `requestId`
- `cursorBefore`
- `cursorAfter`
- `receiptId`
- `projectionSource`
- `truthSource`
- `authoritative`

建议只进入 plugin namespace DB 的字段：

- projection cache
- journal cursor cache
- receipt cache
- request metadata
- replay/reconcile diagnostics
- rehydrate request metadata

需要单独架构评审才能触碰的字段：

- Paperclip Task/Issue 主模型状态字段。
- 核心 run 状态机的终态推进规则。
- Phoenix Runtime control-plane 字段或调度权。
- 跨插件共享的 provider billing/cost authority。

## 6. 边界约束

- Dark Factory Journal remains truth source：所有 projection 都必须声明 `authoritative: false` 与 `truthSource: "dark-factory-journal"`，并带 disclaimer。
- Plugin DB 只存 projection/cache/cursor/receipt/request metadata：不把 projection 写回 Paperclip 主模型，也不把 plugin cache 当成 journal。
- 不修改 Paperclip Task/Issue 主模型：environment hooks 只返回 lease、execute result 与 metadata。
- 不把 Phoenix Runtime 做成第二 control plane：Dark Factory run lifecycle 由 Dark Factory Journal 表达，Paperclip plugin 只观察、请求和缓存。
- 不连接真实 Dark Factory（mock 阶段）：mock hooks 只调用确定性 mock 函数，probe 直接 ready。
- 不读取/打印/存储 secrets：mock 配置不需要真实凭据，日志、stdout、stderr、metadata、plugin DB 都禁止保存敏感凭据。

## 7. 验证计划

单元测试覆盖：

- `onEnvironmentValidateConfig` 对合法 mock config 返回 normalized config，对未知 mode 返回 errors。
- `onEnvironmentProbe` mock 模式返回 ready，并包含三元组与 `terminalStateAdvanced: false`。
- `onEnvironmentAcquireLease` 返回稳定 lease id、runId、cursor/health/runtime metadata。
- `onEnvironmentExecute` 返回 deterministic projection、receipt、cursor，并保持 non-authoritative。
- `onEnvironmentResumeLease` 在 metadata 存在和 metadata 缺失两种情况下都能返回可审计 lease。
- `onEnvironmentReleaseLease` 与 `onEnvironmentDestroyLease` 不推进终态，不连接真实服务。
- `onEnvironmentRealizeWorkspace` 若实现，则明确返回 mock cwd 与 `workspaceRealized: false`。

集成测试条件：

- plugin manifest 已声明 `"environment.drivers.register"`。
- host 能发现 `environmentDrivers` declaration。
- host 能通过 SDK worker hooks 调用 validate/probe/acquire/execute/release。
- mock 模式不需要网络环境和外部凭据。

与现有测试的关系：

- `mock-runtime-adapter.spec.ts` 继续作为 V3 projection parity 和 deterministic mock 函数的基线测试。
- `plugin.spec.ts` 继续验证 manifest、worker 导出和插件装配。
- 新增 lifecycle tests 应放在 tests 目录，重点验证 hook 映射和 metadata 边界，不重复测试 runtime-contract enum parity。

## 8. 实施分步

Step 1: manifest capabilities 新增

- 代码量估计：10-25 LOC。
- 内容：新增 `"environment.drivers.register"` 与 `environmentDrivers` declaration。
- 验证命令：`pnpm typecheck`、`pnpm test -- plugin.spec.ts`。

Step 2: `onEnvironmentValidateConfig` + `onEnvironmentProbe`

- 代码量估计：40-80 LOC。
- 内容：实现 mock config normalization 和 ready probe。
- 验证命令：`pnpm typecheck`、`pnpm test -- environment`。

Step 3: `onEnvironmentAcquireLease` + mock lease

- 代码量估计：50-90 LOC。
- 内容：绑定 `runId` 与 `providerLeaseId`，生成 lease metadata。
- 验证命令：`pnpm typecheck`、`pnpm test -- environment`。

Step 4: `onEnvironmentExecute` + mock execution

- 代码量估计：80-140 LOC。
- 内容：调用现有 deterministic mock runtime adapter，返回 execute result metadata。
- 验证命令：`pnpm typecheck`、`pnpm test -- mock-runtime-adapter.spec.ts environment`。

Step 5: `onEnvironmentResumeLease` / `onEnvironmentReleaseLease` / `onEnvironmentDestroyLease`

- 代码量估计：70-120 LOC。
- 内容：实现恢复、正常释放、强制销毁，确保不推进 terminal state。
- 验证命令：`pnpm typecheck`、`pnpm test -- environment`。

Step 6: 测试补全

- 代码量估计：120-220 LOC。
- 内容：补齐 manifest、hook happy path、error path、metadata boundary、敏感信息卫生测试。
- 验证命令：`pnpm typecheck`、`pnpm test`。

## 9. 开放问题

- environment type name 是什么？建议使用 `dark-factory-mock`，后续真实 provider 可另设 `dark-factory` 或 `dark-factory-runtime`。
- lease metadata 需要哪些字段？建议最小集合为 runId、driverKey、environmentId、providerLeaseId、cursor、receiptId、projection source/truth source、runtimeMode、providerHealth。
- 是否需要 `onEnvironmentRealizeWorkspace`？Dark Factory mock 可能不需要 workspace 物化；如果 host 强依赖该 hook，可返回 mock cwd 和 metadata。
- `onEnvironmentExecute` 的 `command`/`args` 应如何解释？建议 mock 阶段只作为 request metadata，不把命令字符串当成 Dark Factory DSL。
- resultJson 与 run event metadata 的字段命名是否需要统一 schema？建议在实现前补一份 JSON shape fixture。
- release/destroy 是否需要生成 callback receipt？建议生成 receipt 摘要用于审计，但不声明终态推进。
- 真实 Dark Factory 接入时的连接配置如何托管？mock 阶段禁止真实连接；真实阶段需单独设计凭据引用、host 注入和日志脱敏。
