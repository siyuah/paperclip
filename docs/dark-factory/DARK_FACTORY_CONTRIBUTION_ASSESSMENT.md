# Dark Factory Contribution Assessment

## 1. Commit 清单

Base for this assessment: `master` / `origin/master` at `685ee84e`.

| Commit | Message | Files changed | LOC change | Summary |
| --- | --- | ---: | ---: | --- |
| `3c40f9c9` | Harden Dark Factory bridge projection boundaries | 18 | +2382 / -0 | Adds the initial Dark Factory bridge plugin as an example, projection/runtime contract, mock adapter, UI, migration, tests, docs draft, workflow check, and workspace glob. |
| `2785964b` | docs: add Dark Factory environment adapter design document | 1 | +239 / -0 | Adds a Dark Factory environment lifecycle design document. |
| `cc1ec4d5` | refactor: move dark-factory bridge plugin to integrations | 18 | +257 / -26 | Moves the plugin from `examples/` to `integrations/`, renames the package, updates workspace/doc references, and carries migration/test files to the product-oriented path. |
| `d42d1425` | feat: add environment lifecycle hooks for Dark Factory mock adapter (Step 1-4) | 3 | +321 / -0 | Adds environment driver manifest declaration and validate/probe/acquire/execute hooks plus lifecycle tests. |
| `518da36d` | feat: add environment lifecycle hooks Step 5-6 (resume/release/destroy + tests) | 2 | +188 / -0 | Adds resume/release/destroy lifecycle hooks and tests. |
| `937b1ea1` | docs: add adapter contract design for Dark Factory request/response mapping | 1 | +289 / -0 | Documents mapping between Paperclip execution inputs and Dark Factory request/response envelopes. |
| `0fc85006` | feat: add journal receipt simulator fixtures and tests | 2 | +347 / -0 | Adds deterministic Journal receipt simulator fixtures and tests. |
| `f0f272fb` | test: add Dark Factory bridge smoke harness | 1 | +324 / -0 | Adds in-process smoke tests connecting API routes, lifecycle hooks, and Journal simulator. |

Total assessed delta: 46 files changed, +4347 / -26 across fork-only Dark Factory work and one existing workflow/workspace touch.

## 2. 分类评估

### A 类：推荐 upstream PR

No commit is recommended as a direct upstream PR without prior discussion.

Reasoning:

- The contribution guide favors small, focused PRs with the smallest possible file surface.
- The Dark Factory bridge is a domain-specific integration rather than a general Paperclip fix.
- Several commits build on earlier fork-specific decisions and are easier to review as a coherent fork feature than as isolated upstream patches.
- The initial bridge commit also touches workflow and workspace configuration, which makes it broader than the low-risk path described by `CONTRIBUTING.md`.

### B 类：可选 upstream PR（需讨论）

These commits could become an upstream contribution only after Discord `#dev` discussion and maintainer agreement that a domain-specific plugin integration is useful as an example/reference.

| Commit | Why optional | Potential concern | Suggested PR framing |
| --- | --- | --- | --- |
| `2785964b` | Shows how plugin-hosted environment lifecycle hooks can host an execution driver. | Dark Factory-specific, not a generic SDK guide. | "docs: add reference design for plugin-hosted environment driver" after generalizing names or moving to a reference/examples area. |
| `d42d1425` | Exercises SDK environment driver hooks in a concrete integration. | Vendor/domain-specific plugin may not belong in upstream product tree. | "examples: add mock environment driver integration" if maintainers want example coverage. |
| `518da36d` | Completes the lifecycle semantics with resume/release/destroy and tests. | Depends on the Step 1-4 integration. | Same PR as Step 1-4 or follow-up only if Step 1-4 is accepted. |
| `0fc85006` | Provides deterministic receipt/replay fixtures useful for adapter testing patterns. | Journal semantics are Dark Factory-specific. | "test: add deterministic receipt replay fixture pattern" only after generalization. |
| `f0f272fb` | Demonstrates in-process smoke testing across plugin API, lifecycle hooks, and fixture simulator. | Strongly tied to the Dark Factory plugin shape. | "test: add in-process smoke coverage for reference environment driver" if the plugin is accepted. |

Suggested discussion point: ask maintainers whether upstream wants a concrete plugin-hosted environment driver example. If yes, submit a smaller generalized example rather than the full Dark Factory product integration.

### C 类：保留在 fork

| Commit | Reason to keep fork-only |
| --- | --- |
| `3c40f9c9` | Large domain-specific integration with UI, DB migration, API routes, contract types, workflow check, and workspace glob. It is the seed of the fork product line and is too broad for an uncoordinated upstream PR. |
| `cc1ec4d5` | Productizes the plugin by moving it from examples to integrations and renaming the package. This reflects the fork's product status rather than upstream's roadmap. |
| `937b1ea1` | Adapter contract design is tied to Dark Factory request/response envelopes and fork-specific execution semantics. Useful as fork documentation; upstream value depends on prior acceptance of the integration. |

## 3. 评估标准

| Commit | Core code changed? | New files only? | Dark Factory specific? | Upstream user value | New dependency? | Assessment |
| --- | --- | --- | --- | --- | --- | --- |
| `3c40f9c9` | No core/server/ui changes, but touches workflow/workspace config. | Mostly yes, plus config changes. | High. | Low-to-medium as a reference plugin. | No external dependency. | C |
| `2785964b` | No. | Yes. | High. | Medium if generalized as SDK guidance. | No. | B |
| `cc1ec4d5` | No core/server/ui changes, but touches workspace/lock/doc. | Move/rename plus config updates. | High. | Low unless upstream wants this integration. | No external dependency. | C |
| `d42d1425` | No. | Updates plugin files and adds tests. | High. | Medium as environment driver example. | No. | B |
| `518da36d` | No. | Updates plugin files and tests. | High. | Medium if prior lifecycle PR accepted. | No. | B |
| `937b1ea1` | No. | Yes. | High. | Low-to-medium as design reference. | No. | C |
| `0fc85006` | No. | Yes. | Medium-to-high. | Medium if generalized to adapter testing pattern. | No. | B |
| `f0f272fb` | No. | Yes. | Medium-to-high. | Medium if generalized to plugin smoke harness pattern. | No. | B |

General conclusion:

- Conflict risk is low because the code is isolated under `packages/plugins/integrations/dark-factory-bridge/` and `docs/dark-factory/`.
- Review risk is medium-to-high because the feature is domain-specific and large.
- CI risk is low for the plugin itself: targeted typecheck/build/test pass with 54 tests.
- Upstream acceptance risk is high without maintainer alignment because the contribution guide explicitly asks for discussion before larger feature work.

## 4. 建议 PR 方案

Recommended path: do not open a single large upstream PR immediately.

Preferred sequence:

1. Open a Discord `#dev` discussion.
   - Ask whether maintainers want a reference plugin-hosted environment driver example.
   - Share a concise summary of the bridge plugin, lifecycle hooks, and test coverage.
   - Be explicit that this is mock-only and does not touch core Task/Issue models.

2. If maintainers want an upstream example, prepare a small PR series:
   - PR 1: generalized docs for plugin-hosted environment driver lifecycle patterns.
   - PR 2: minimal mock environment driver example, with generic naming rather than Dark Factory branding.
   - PR 3: optional deterministic receipt/replay fixture pattern and in-process smoke harness.

3. Keep fork-only product material out of upstream unless requested:
   - Dark Factory contract docs.
   - Dark Factory-specific UI copy and migration names.
   - Product line placement under `packages/plugins/integrations/dark-factory-bridge/`.

Target branch: upstream `master`.

Reviewer suggestions:

- Plugin SDK / plugin runtime maintainer for environment lifecycle hook usage.
- Adapter/runtime maintainer for execution-result mapping and receipt/replay semantics.
- Docs reviewer if a generalized lifecycle guide is proposed.

PR size guidance:

- Avoid a single 4k+ LOC PR.
- Keep each PR focused enough that the "Path 1" contribution rules are plausible.
- Use the upstream PR template exactly, including Thinking Path, Verification, Risks, Model Used, and Checklist.

## 5. Fork-only 内容的维护策略

Recommended fork maintenance:

- Rebase `fork-master-product` onto upstream `master` regularly, preferably before opening or refreshing any PR.
- Keep Dark Factory work in isolated paths:
  - `packages/plugins/integrations/dark-factory-bridge/`
  - `docs/dark-factory/`
- Avoid touching `server/`, `ui/`, `packages/db/`, or shared core contracts unless explicitly authorized.
- Run targeted verification after every rebase:
  - `pnpm -r typecheck`
  - `cd packages/plugins/integrations/dark-factory-bridge && pnpm typecheck && pnpm build && pnpm test`
- Treat root `pnpm test:run` failures separately when they originate in upstream environment-dependent suites such as live SSH or local CLI availability.
- Watch Plugin SDK changes:
  - `packages/plugins/sdk/src/protocol.ts`
  - `packages/plugins/sdk/src/define-plugin.ts`
  - `packages/plugins/sdk/src/types.ts`
  - `packages/shared` manifest/capability declarations

## 6. 风险和限制

Upstream may reject or redirect this work because:

- It is a feature/integration rather than a small bug fix.
- The domain model is Dark Factory-specific.
- The initial integration is large and includes UI, DB migration, runtime contracts, mock adapter, and test fixtures.
- It may not match upstream roadmap priorities.

CI impact:

- Targeted bridge plugin checks pass.
- Root typecheck passes after rebase to `685ee84e`.
- Root `pnpm test:run` currently has unrelated upstream/environment failures in cursor-local/live SSH tests. This should be disclosed if a PR is opened but should not be attributed to the Dark Factory plugin.

Plugin SDK stability risk:

- The integration depends on environment lifecycle hooks exported by `@paperclipai/plugin-sdk`.
- If hook parameter or result types change, the bridge plugin will fail typecheck quickly because it calls `plugin.definition` hooks directly in tests.
- Current post-rebase verification shows no SDK signature breakage for this plugin.

Dependency risk:

- The bridge plugin introduces no new external runtime dependency.
- It uses existing workspace dependencies and deterministic mock functions.
- Real Dark Factory connectivity remains out of scope and would need a separate credential and transport review.
