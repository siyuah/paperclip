# Dark Factory Bridge Production Readiness Assessment

Date: 2026-05-02  
Scope: `paperclip_upstream` Dark Factory bridge plugin plus the companion Dark Factory V3 HTTP server in the `123` repository.  
Implementation state assessed: deterministic mock mode plus live-local HTTP mode (`mode: "http"`) connected to the local Dark Factory V3 FastAPI service, with MVP batch 1 hardening applied.

## Executive Summary

**Production readiness conclusion: CONDITIONAL YES for MVP internal preview**

The Path B implementation is now past the local integration milestone and has the minimum controls needed for a constrained MVP internal preview: API key authentication, request logging with redaction, JSONL journal file locking, bridge HTTP retries, Docker packaging, and dedicated security/lock/retry tests.

It is still not ready for broad production or untrusted multi-tenant use. HTTPS/TLS, production secret management, backup/restore, load testing, and a real circuit breaker remain open. The recommended launch posture is a single-tenant, access-controlled internal preview behind trusted network boundaries.

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

Notes:

- The provider failures, repair attempts, and archive endpoints are facades in the HTTP server. They satisfy route shape for local integration but are not yet backed by full V3 event families or operational workflows.
- Live-local naming in project discussion maps to the implemented bridge `mode: "http"`.

## 2. Security

- [ ] Credential management: live-local now supports an API key, but production still needs secret references, rotation, and host-side resolution. No token/password/API key storage should be added to plugin namespace state.
- [x] Log redaction: server request logs recursively redact sensitive body fields; bridge HTTP logging does not emit request bodies or API keys.
- [ ] HTTPS: current integration path is HTTP-only and localhost-oriented.
- [x] Authentication/authorization: API key authentication is enforced for all non-health requests; `/api/health` remains unauthenticated for probes. This is sufficient for internal preview, not full production authorization.
- [ ] Input validation and injection resistance: Pydantic models and protocol enum validation provide a baseline, but production needs stricter schema parity, payload limits, allowlists, and abuse controls.

Security assessment: acceptable for a constrained internal preview behind trusted network boundaries. HTTPS, secret rotation, and deeper authorization remain blocking for broader production.

## 3. Reliability

- [x] Timeout handling: bridge HTTP client uses request timeouts.
- [x] Retry logic: bridge HTTP client has bounded exponential backoff for retryable 502/503/504 responses by default.
- [ ] Circuit breaker: provider health projections include breaker-shaped fields, but live-local HTTP mode does not implement an actual circuit breaker.
- [x] Graceful degradation: HTTP probe and execute paths map failures to non-authoritative metadata without advancing Paperclip terminal state.
- [x] Data persistence: Dark Factory server supports JSONL file-backed journal and uses POSIX file locks for shared/exclusive access where `fcntl` is available.

Reliability assessment: acceptable for single-node internal preview. Circuit breaker behavior, backpressure, and production-grade append storage remain open.

## 4. Observability

- [x] Structured logs: server emits JSON request logs with method/path/status/duration/trace/client IP; bridge emits structured JSON request summaries via console logging.
- [ ] Metrics: no request latency, error rate, queue depth, journal append, or projection replay metrics.
- [x] Trace IDs: `traceId` is present in protocol payloads and propagated through HTTP calls.
- [ ] Alerting rules: no alerts for server unavailability, journal append failures, replay failures, high error rates, or stale projections.

Observability assessment: internal-preview logging is in place. Metrics and alerting remain required for production operations.

## 5. Operability

- [x] Docker deployment: `123` now includes a Dockerfile, `.dockerignore`, and pinned HTTP server requirements for internal preview packaging.
- [x] Health check: `/api/health` and `/health` are available.
- [ ] Configuration management: bridge config schema supports endpoint/timeout/workload defaults, but production environment management, secret references, and policy validation are not defined.
- [ ] Backup and restore: JSONL persistence exists, but no backup, restore, compaction, or retention process is documented or automated.
- [ ] Horizontal scaling: not supported. File-backed append-only journal has process-level file locks, but multi-node coordination still requires a production append store.

Operability assessment: enough for single-node internal preview; broader production operations still need configuration, backup/restore, and scaling design.

## 6. Test Coverage

### Current Passing Tests

Bridge plugin test suite:

| Test file | Test count | Status |
| --- | ---: | --- |
| `tests/journal-receipt-simulator.spec.ts` | 9 | Pass |
| `tests/mock-runtime-adapter.spec.ts` | 18 | Pass |
| `tests/environment-lifecycle.spec.ts` | 10 | Pass |
| `tests/smoke-harness.spec.ts` | 5 | Pass |
| `tests/plugin.spec.ts` | 13 | Pass |
| `tests/http-integration.spec.ts` | 1 | Pass |
| `tests/http-runtime-adapter.spec.ts` | 1 | Pass |
| **Total** | **57** | **57/57 pass** |

Dark Factory V3 core checks observed during Path B:

| Test group | Test count | Status |
| --- | ---: | --- |
| `tests/test_v3_runtime.py` | 43 | Pass |
| `tests/test_v3_journal_verification.py` | 1 | Pass |
| `tests/test_validate_v3_bundle.py` | 2 | Pass |
| `tests/test_v3_http_server_security.py` | 5 | Pass |
| **Core subset total** | **51** | **51/51 pass** |

Full `123` pytest note after MVP batch 1: 75 tests passed and 3 release-evidence tests failed while the current hardening changes were uncommitted. Those failures were caused by release-evidence clean-tree gating, not by runtime, security, journal lock, or HTTP server behavior.

### Coverage Assessment

- Unit coverage is strong for deterministic mock projections, receipt simulation, plugin API routes, environment lifecycle behavior, and core V3 control-plane primitives.
- Integration coverage now includes a real local HTTP server process and bridge lifecycle path through probe, acquire lease, park, rehydrate, and resume.
- Coverage now includes API key authentication, sensitive field redaction, journal lock timeout, and bridge retry/API-key behavior. It is still not sufficient for production incidents, load, full authorization, TLS, backup/restore, or persistent journal recovery.

### Missing Test Scenarios

- High-concurrency create/park/rehydrate requests against the same JSONL journal.
- Duplicate idempotency requests across process restarts.
- TLS/HTTPS deployment behavior.
- Circuit-breaker behavior for transient network/server failures.
- Journal corruption, partial writes, backup restore, and projection rebuild.
- Payload size limits and malformed request fuzzing.
- Multi-tenant isolation and secret redaction tests.
- Performance/load tests for projection replay as journal size grows.

## 7. Gap Analysis

| Gap | Severity | Fix effort | Blocks production? |
| --- | --- | --- | --- |
| No HTTPS/TLS transport | High | 1-2 days | Yes for production, no for localhost internal preview |
| No production credential/secret model | High | 2-4 days | Yes for production, no for manually configured internal preview |
| No backup/restore/retention policy for JSONL journal | Medium | 2-4 days | Yes for durable production |
| No metrics or alerts | Medium | 2-4 days | Yes for operated production |
| No real circuit breaker in live-local HTTP mode | Medium | 1-3 days | Yes for unreliable networks |
| Provider failure, repair, and archive endpoints are facade-only | Medium | 1-2 weeks | Depends on launch scope |
| No load/performance tests | Medium | 2-4 days | Yes for capacity confidence |
| UI is projection-focused and not yet production operator workflow complete | Low | 3-5 days | No for API-only MVP |

## 8. Launch Recommendation

### Minimum Viable Version

A constrained MVP can now launch as a local or single-tenant internal preview if these operating conditions are enforced:

1. Run only on localhost, a private network, or behind a trusted reverse proxy.
2. Set `DF_API_KEY` explicitly and distribute it only through internal secret handling.
3. Use a single-node JSONL journal volume; do not run multiple writers across nodes.
4. Keep `/api/health` as the only unauthenticated endpoint.
5. Capture structured logs in the preview environment.
6. Treat provider failure, repair, and archive endpoints as facade-only.

Estimated remaining MVP internal-preview hardening effort: **1-3 days**, mostly deployment wiring and operator runbook work.

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

It should still not be exposed to broad production traffic or untrusted networks until HTTPS, production secret management, backup/restore, metrics/alerts, load testing, and a durable production append store are complete.
