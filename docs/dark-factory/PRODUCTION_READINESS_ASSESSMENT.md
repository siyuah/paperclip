# Dark Factory Bridge Production Readiness Assessment

Date: 2026-05-05
Scope: `paperclip_upstream` Dark Factory bridge plugin plus the companion Dark Factory V3 HTTP server in the `123` repository.  
Implementation state assessed: deterministic mock mode plus live-local HTTP mode (`mode: "http"`) connected to the local Dark Factory V3 FastAPI service, with MVP internal-preview hardening plus Batch 1-5 workflow, readiness, provider-health, route-reason, guardrail, fault-playbook, structured-fact, drift-detection, handoff, and security-boundary layers applied.

## Executive Summary

**Production readiness conclusion: CONDITIONAL YES for MVP internal preview**

The Path B implementation is now past the local integration milestone and has the controls needed for a constrained MVP internal preview: API key authentication, request logging with redaction, JSONL journal file locking, bridge HTTP retries, Docker/Caddy packaging, secret-file deployment, journal backup/restore/retention tooling, and dedicated security/lock/retry/concurrency tests.

Since the previous assessment, the capability baseline has expanded substantially: ProviderHealthRecord, route-decision reason codes, guardrail decisions, fault playbooks, structured Journal facts, contract drift detection, review readiness aggregation, AI workflow entry points, handoff packets, and security-boundary documentation are now present and tested. These additions improve reviewability and operator readiness, but they remain derived/non-authoritative support surfaces. Dark Factory Journal remains truth source.

It is still not ready for broad production or untrusted multi-tenant use. Metrics/alerts, a real circuit breaker, durable multi-node append storage, and full event-backed provider failure/repair/archive workflows remain open. The recommended launch posture is a single-tenant, access-controlled internal preview behind trusted network boundaries.

## 1. Functionality

- [x] Mock mode lifecycle hooks (7): validate config, probe, acquire lease, resume lease, release lease, destroy lease, execute.
- [x] Live-local mode lifecycle hooks: validate config, probe, acquire lease, resume lease, execute, release/destroy no-op semantics. Implemented as `mode: "http"` against a local Dark Factory server.
- [x] Dark Factory HTTP server: FastAPI facade wraps `ControlPlane`, `Journal`, and `Projection`; implements external run create/get/park/rehydrate, route decisions, health, projection, and lightweight provider-failure/repair/archive facade endpoints.
- [x] HTTP client with error handling: endpoint validation, timeout via `AbortController`, HTTP error mapping, invalid JSON mapping, and projection-boundary wrapping.
- [x] Plugin UI components (3): dashboard widget, issue/detail panel, and settings page are present in the bridge UI entrypoint.
- [x] V3 contract validation / parity guard: protocol release tag is carried through runtime constants and HTTP requests; existing V3 tests validate core bundle/protocol behavior.
- [x] Journal replay and reconciliation: mock adapter includes replay/reconciliation classification; Dark Factory server exposes projection from the append-only journal.
- [x] Journal receipt simulator: covered by dedicated simulator and tests.
- [x] End-to-end smoke harness: existing smoke harness plus live-local HTTP integration test.
- [x] Provider health monitoring: `ProviderHealthRecord` and `providerHealthState` are part of the V3 binding baseline with 6 states (`healthy`, `degraded`, `exhausted`, `unreachable`, `rate_limited`, `unknown`).
- [x] Route decision explainability: `RouteDecisionReason` records standardized route rationale with 10 reason codes.
- [x] Guardrail decision model: P0/P1/P2 approval levels are represented for high-risk operation gating.
- [x] Fault playbooks: `FaultPlaybook` registry covers 8 common provider/runtime failure patterns.
- [x] Structured Journal facts: `StructuredJournalFact` extracts non-authoritative facts from Journal events for review and handoff.
- [x] Contract drift detection: `tools/v3_contract_drift_report.py` checks protocol tag, event, schema-enum, Batch 4 definition, bundle, and generated-summary parity.
- [x] Review readiness dashboard: `tools/df_review_readiness.py` aggregates 6 static checks plus 2 evidence inputs.
- [x] Handoff packet generator: `tools/df_handoff_packet.py` generates a redacted, non-authoritative handoff packet.
- [x] AI workflow entry: `123/AGENTS.md` and `123/docs/ai_workflows.md` define fixed collaboration workflows and file boundaries.
- [x] Security boundary documentation: `123/docs/security_boundaries.md` records the three-layer API boundary and scoped-token design preview.

Notes:

- The provider failures, repair attempts, and archive endpoints are facades in the HTTP server. They satisfy route shape for local integration but are not yet backed by full V3 event families or operational workflows.
- Live-local naming in project discussion maps to the implemented bridge `mode: "http"`.

## 2. Security

- [x] Credential management: server supports `DF_API_KEY_FILE` for mounted secrets and `DF_API_KEY` for local development; bridge config now supports `apiKeySecretRef` so production config can store a host-resolved reference instead of the secret value. Rotation remains operational, not automatic.
- [x] Log redaction: server request logs recursively redact sensitive body fields; bridge HTTP logging does not emit request bodies or API keys.
- [x] HTTPS: internal-preview TLS is handled by the included Caddy reverse proxy (`Caddyfile`) on port `9702`; FastAPI remains HTTP-only behind the private proxy boundary.
- [x] Authentication/authorization: API key authentication is enforced for all non-health requests; `/api/health` remains unauthenticated for probes. This is sufficient for internal preview, not full production authorization.
- [ ] Input validation and injection resistance: Pydantic models and protocol enum validation provide a baseline, but production needs stricter schema parity, payload limits, allowlists, and abuse controls.

Security assessment: acceptable for a constrained internal preview behind trusted network boundaries. Automatic secret rotation, deeper authorization, abuse controls, and formal threat modeling remain blocking for broader production.

## 3. Reliability

- [x] Timeout handling: bridge HTTP client uses request timeouts.
- [x] Retry logic: bridge HTTP client has bounded exponential backoff for retryable 502/503/504 responses by default.
- [ ] Circuit breaker: provider health projections include breaker-shaped fields, but live-local HTTP mode does not implement an actual circuit breaker.
- [x] Graceful degradation: HTTP probe and execute paths map failures to non-authoritative metadata without advancing Paperclip terminal state.
- [x] Data persistence: Dark Factory server supports JSONL file-backed journal, uses POSIX file locks for shared/exclusive access where `fcntl` is available, and now serializes in-process mutations per journal path.
- [x] Backup/restore/retention: `tools/journal_admin.py` validates JSONL backups, restores via atomic replacement, and prunes backups by count/age for internal preview.

Reliability assessment: acceptable for single-node internal preview. Circuit breaker behavior, backpressure, and production-grade append storage remain open.

## 4. Observability

- [x] Structured logs: server emits JSON request logs with method/path/status/duration/trace/client IP; bridge emits structured JSON request summaries via console logging.
- [ ] Metrics: no request latency, error rate, queue depth, journal append, or projection replay metrics.
- [x] Trace IDs: `traceId` is present in protocol payloads and propagated through HTTP calls.
- [ ] Alerting rules: no alerts for server unavailability, journal append failures, replay failures, high error rates, or stale projections.

Observability assessment: internal-preview logging is in place. Metrics and alerting remain required for production operations.

## 5. Operability

- [x] Docker deployment: `123` now includes a Dockerfile, `.dockerignore`, `docker-compose.yml`, Caddy TLS reverse proxy config, and pinned HTTP server requirements for internal preview packaging.
- [x] Health check: `/api/health` and `/health` are available.
- [x] Configuration management: bridge config schema supports endpoint/timeout/workload/retry defaults plus `apiKeySecretRef`; `123/docs/internal_preview_runbook.md` documents transport, secret, and journal operations for MVP preview.
- [x] Backup and restore: JSONL backup, restore, and retention commands are documented and tested for MVP preview.
- [ ] Horizontal scaling: not supported. File-backed append-only journal has process-level file locks, but multi-node coordination still requires a production append store.

Operability assessment: enough for single-node internal preview; broader production operations still need configuration, backup/restore, and scaling design.

## 6. Test Coverage

### Current Passing Tests

Bridge plugin test suite:

| Test scope | Test count | Status |
| --- | ---: | --- |
| Bridge plugin suite | 185 | Pass |
| Skipped tests | 1 | Skip |
| Test files | 35 | 34 pass, 1 skip |
| **Total executed assertions** | **185** | **185 pass, 0 failed, 1 skipped** |

Dark Factory V3 / `123` checks observed after Batch 1-5:

| Test group | Test count | Status |
| --- | ---: | --- |
| Full Python test suite | 122 | Pass |
| V3 bundle validation | 12 checks | Pass |
| Contract drift report | 6 checks | Pass |
| Review readiness dashboard | 6 static checks + 2 evidence inputs | Conditional ready: 6 pass, 2 warn |
| **Python total** | **122** | **122/122 pass** |

The 2 review readiness warnings are expected when smoke and bridge evidence JSON paths are not supplied to `df_review_readiness.py`; they are not test failures.

### Tooling Baseline

| Tool | Coverage / purpose | Status |
| --- | --- | --- |
| `tools/df_review_readiness.py` | 6 static checks plus 2 optional evidence inputs | Present and tested |
| `tools/v3_contract_drift_report.py` | 6 drift checks: protocol tags, event parity, schema-enum parity, Batch 4 definitions, bundle validation, generated summary freshness | Present and tested |
| `tools/df_handoff_packet.py` | Generates redacted handoff packets with git state, validation summaries, progress archives, and next AI command | Present and tested |

### Coverage Assessment

- Unit coverage is strong for deterministic mock projections, receipt simulation, plugin API routes, environment lifecycle behavior, and core V3 control-plane primitives.
- Integration coverage now includes a real local HTTP server process and bridge lifecycle path through probe, acquire lease, park, rehydrate, and resume.
- Coverage now includes API key authentication, sensitive field redaction, journal lock timeout, bridge retry/API-key behavior, secret reference normalization, concurrent HTTP run creation, and JSONL backup/restore/retention. It is still not sufficient for production incidents, full authorization, external CA TLS, multi-node durability, or persistent journal recovery under partial-write/corruption scenarios.

### Missing Test Scenarios

- High-concurrency park/rehydrate requests against the same JSONL journal.
- Duplicate idempotency requests across process restarts.
- External CA TLS deployment behavior.
- Circuit-breaker behavior for transient network/server failures.
- Journal corruption, partial writes, and projection rebuild.
- Payload size limits and malformed request fuzzing.
- Multi-tenant isolation and secret redaction tests.
- Performance/load tests for projection replay as journal size grows.

## 7. Gap Analysis

| Gap | Severity | Fix effort | Blocks production? |
| --- | --- | --- | --- |
| No metrics or alerts | Medium | 2-4 days | Yes for operated production |
| No real circuit breaker in live-local HTTP mode | Medium | 1-3 days | Yes for unreliable networks |
| No durable multi-node append store | Medium | 1-3 weeks | Yes for horizontal production |
| Provider failure, repair, and archive endpoints are facade-only | Medium | 1-2 weeks | Depends on launch scope |
| Limited load/performance tests | Medium | 2-4 days | Yes for capacity confidence beyond MVP preview |
| UI is projection-focused and not yet production operator workflow complete | Low | 3-5 days | No for API-only MVP |

## 8. Launch Recommendation

### Minimum Viable Version

A constrained MVP can now launch as a local or single-tenant internal preview if these operating conditions are enforced:

1. Run through the included Caddy reverse proxy or another trusted TLS terminator.
2. Set `DF_API_KEY_FILE` from a mounted secret; use inline `DF_API_KEY` only for local development.
3. Use a single-node JSONL journal volume; do not run multiple writers across nodes.
4. Keep `/api/health` as the only unauthenticated endpoint.
5. Capture structured logs in the preview environment.
6. Run journal backup and retention before and after preview windows.
7. Treat provider failure, repair, and archive endpoints as facade-only.

Estimated remaining MVP internal-preview hardening effort: **0-1 day**, mostly environment-specific wiring, certificate trust setup, and operator rehearsal.

### Complete Production Version

A full production version should additionally include:

1. Durable journal backend with backup, restore, retention, compaction, and replay validation.
2. Metrics and alerts for latency, error rate, replay failures, stale projections, and journal append failures.
3. Circuit breaker implementation connected to provider/runtime health state.
4. Full V3 event-backed implementations for provider failures, repair attempts, archive restore/search, and reconciliation workflows.
5. Load, concurrency, fuzz, and security test suites.
6. Multi-tenant isolation review and formal threat model.
7. Operator runbooks for incident response and data recovery.

Estimated full production effort: **4-8 engineering weeks**, depending on persistence backend and security requirements.

## Final Answer

**CONDITIONAL YES**, this implementation is ready for a constrained MVP internal preview.

It should still not be exposed to broad production traffic or untrusted networks until metrics/alerts, circuit breaker behavior, stronger authorization, broader load testing, and a durable production append store are complete.
