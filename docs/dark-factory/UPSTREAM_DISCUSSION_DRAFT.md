# Upstream Discussion Draft

Template message for upstream paperclipai/paperclip Discord `#dev` or GitHub Discussions.

---

**Subject: Plugin-hosted environment driver - reference implementation interest check**

Hi team,

I've been working on a plugin that uses the Plugin SDK's environment lifecycle hooks (`onEnvironmentAcquireLease`, `onEnvironmentExecute`, `onEnvironmentReleaseLease`, etc.) to host a mock execution environment driver. The goal was to validate that the SDK's environment lifecycle interfaces work well for third-party execution providers.

**What I built:**

- A plugin implementing all 7 environment lifecycle hooks (`validateConfig`, `probe`, `acquireLease`, `execute`, `resumeLease`, `releaseLease`, `destroyLease`) with deterministic mock functions.
- A manifest declaring `environment.drivers.register` capability with a driver declaration (`dark-factory-mock`).
- A journal receipt simulator with preset fixtures for replay, gap detection, out-of-order handling, duplicate detection, and cursor monotonicity.
- End-to-end smoke harness testing full lifecycle: validate -> probe -> acquire -> execute -> replay -> release.
- 54 tests passing. Root `pnpm -r typecheck` passes on latest `master`.

**What it does NOT do:**

- Does not modify core Task/Issue models, `server/`, `ui/`, `packages/db/`, or shared contracts.
- Does not connect to any real external service or introduce external dependencies.
- All output is explicitly non-authoritative (`authoritative: false` on every return value).

**Questions:**

1. Would upstream benefit from a reference plugin-hosted environment driver example?
2. Should it go under `packages/plugins/examples/` or another location?
3. Are there upcoming SDK changes to environment lifecycle hooks I should know about?

Code: `siyuah/paperclip` branch `fork-master-product`.

---

**Adaptation notes:**
- Discord: use first paragraph + 3 questions only.
- GitHub Discussion: use full text.
- Branch: https://github.com/siyuah/paperclip/tree/fork-master-product
