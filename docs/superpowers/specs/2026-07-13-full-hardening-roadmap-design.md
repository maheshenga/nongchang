# Full Hardening Roadmap Design

**Status:** Approved for implementation by the user on 2026-07-13

## Context

The previous project-hardening program completed its original Stage A through Stage C scope: production gates, HttpOnly web refresh sessions, durable AI operation states, tenant consistency constraints, shorter public-trace transactions, health endpoints, structured request logs, frontend decomposition, and initial shared runtime response schemas. The latest `main` baseline passes `pnpm verify:production` with 13 shared tests, 646 backend unit tests, 298 web tests, 62 miniapp tests, and 85 database-backed E2E tests.

The follow-up audit found no verified P0 defect, but it identified remaining production-scale gaps that the original design explicitly deferred: proxy-aware throttling, agent-owned authorization boundaries, upload accounting, atomic AI reservation creation, client-supplied AI idempotency, bounded public reads, database-side anti-fake aggregation, complete response validation, browser E2E, distributed runtime state, query observability, disaster recovery automation, and major dependency lifecycle work.

This design supersedes the remaining-work section of the earlier audit. It does not replace the completed `2026-07-13-project-hardening-1-7-design.md`; it builds on that verified baseline.

## Delivery Approaches Considered

### Approach A: one large platform rewrite

Introduce Redis, queues, OpenTelemetry, new auth/session storage, upload accounting, AI idempotency, and frontend data-layer changes in a single release. This minimizes transitional code but creates an unacceptably large migration and rollback surface.

### Approach B: four independently deployable vertical releases

Deliver security boundaries first, AI financial correctness second, read-path/contracts/UI verification third, and distributed operations last. Each release has its own migrations, compatibility rules, focused tests, and production gate. This is the selected approach because failures remain isolated and every stage moves the production system toward the final target.

### Approach C: configuration and documentation only

Document proxy, backup, Redis, and PgBouncer recommendations without implementing application support. This is insufficient because the verified defects are in executable authorization, accounting, idempotency, and query behavior.

## Global Invariants

- Existing miniapp bearer-token endpoints remain compatible.
- Existing web HttpOnly refresh-cookie behavior remains compatible.
- Tenant and owner checks remain fail-closed.
- Ambiguous external AI outcomes never result in automatic credit release.
- No raw prompt, image, audio, credential, authorization header, cookie, or payment payload enters logs, traces, metrics, or operation tables.
- Database migrations run a diagnostic preflight before adding enforcing constraints.
- Every behavior change follows a red-green-refactor test cycle.
- Every release keeps `pnpm verify:production` green against PostgreSQL/PostGIS.
- Production Redis is optional only during the Phase 1 transition; quarterly completion requires Redis-backed distributed state in production mode.

## Release 1: Security Boundaries and Process Safety

### Proxy-aware client identity and throttling

Create a single trusted-proxy configuration module that parses `TRUST_PROXY_HOPS`, rejects unsafe production values, configures Express `trust proxy`, and exposes a client-IP resolver for throttling and public scan analytics. Throttling must distinguish client IPs behind the documented Nginx topology and must not trust arbitrary leftmost `X-Forwarded-For` values.

The initial implementation continues using the Nest throttler's local store. The tracker key format is stable so the distributed Redis store can replace only the storage layer later.

### User-group ownership boundary

User-group CRUD is platform/tenant administration, not agent-local administration. `SYSTEM_ADMIN` retains CRUD and default-group management. `AGENT_ADMIN` may list groups required for assigning one to its own merchants and may assign an existing tenant group to an in-scope merchant, but cannot create, update, delete, or change the default group.

Default-group changes execute transactionally. PostgreSQL enforces at most one default group per tenant with a partial unique index. Concurrent `ensureDefault` calls recover from unique conflicts by rereading the winning row.

### Upload authorization, accounting, and quota

Every uploaded object receives a durable `UploadAsset` record containing tenant, user, purpose, object key, URL, size, checksum, lifecycle status, and timestamps. Object keys start with the tenant ID and purpose. Purpose authorization is explicit:

- `farm-record`: requires `record:create`.
- `credential`: requires `SYSTEM_ADMIN` or `AGENT_ADMIN`; attaching the returned URL to a credential remains protected by the existing batch-scope check.
- `ai-diagnose`: requires an authenticated tenant user and is covered by the AI resource limit.

Unknown purposes are rejected. A transactionally checked database quota limits daily bytes and active stored bytes per tenant. Default limits come from validated environment variables and can be overridden by a future tenant-plan layer without changing the upload interface.

If OSS succeeds but asset persistence fails, the service attempts object deletion. Failed cleanup is recorded as a structured operational error without credentials. A cleanup command identifies stale pending assets and orphan candidates.

### Graceful shutdown

The Nest application enables shutdown hooks, stops accepting traffic on `SIGTERM`, allows in-flight requests a bounded drain period, and disconnects Prisma and Redis clients. Liveness may remain up during normal operation; readiness changes to not-ready once shutdown starts.

## Release 2: Atomic and Idempotent AI Operations

### Client idempotency contract

All billable AI endpoints require a valid `Idempotency-Key` header. Web and miniapp clients create a key once per user action and retain it until a terminal response. The key is scoped by tenant, user, operation kind, and an optional resource reference.

Repeated requests behave as follows:

- `CONFIRMED`: return the stored sanitized result envelope when the endpoint supports replay, otherwise return the stable operation result metadata.
- `RESERVED`, `IN_FLIGHT`, or `SUCCEEDED`: return HTTP 202 with operation status and retry guidance.
- `FAILED` or `RELEASED`: return the terminal failure; a new user action must use a new key.
- `REVIEW_REQUIRED`: return HTTP 409 and require operator resolution.

### Atomic reservation and operation creation

Credit-account conditional decrement, reservation creation, debit ledger creation, and `AiOperation` creation run inside one database transaction. The coordinator receives an existing operation/reservation pair and owns only provider-state transitions afterward. A unique-key race rereads the existing operation instead of releasing another request's reservation.

The operation stores only sanitized result metadata required for replay. Provider payloads and user content remain excluded.

### Orphan and stale recovery

The recovery command scans both operation rows and AI reservations with no linked operation. Orphans older than the grace period become `REVIEW_REQUIRED` unless the system can prove the provider was never invoked. No orphan AI reservation is silently released.

Recovery uses bounded batches, `FOR UPDATE SKIP LOCKED`, stable counters, and idempotent transitions so multiple workers can run safely.

## Release 3: Bounded Reads, Contracts, UI Boundaries, and Browser Verification

### Public trace limits and caching

Public trace responses return bounded event and credential collections plus total counts. The default limits are explicit shared constants. The static portion of a trace response is cached by trace code with a short TTL and invalidated after trace event, credential, batch, field, or agent mutations. Scan count and scan-detail recording remain live and are not served from cache.

### Database-side anti-fake aggregation

Anti-fake alerts use a parameterized PostgreSQL aggregate query with tenant/owner scope, time window, minimum scan count, minimum distinct IP count, deterministic ordering, and Top-N. Add indexes that match the measured predicate and order. Service memory use is bounded by the requested result limit rather than the number of raw scans.

### Runtime response contracts

Every web and miniapp API wrapper parses unknown JSON with a shared Zod response schema. Priority modules are auth, AI, billing, supply, user groups, quick templates, integration configuration, OSS configuration, upload, and phenology. The generic request helpers remain transport-only and never claim that JSON is valid solely through `request<T>`.

### Frontend decomposition and data fetching

Split `AiAssistant`, `App`, and miniapp `Me` by business responsibility while preserving rendered copy and navigation. Replace the custom global `useApi` cache with TanStack Query so cancellation, deduplication, mutation invalidation, retries, and stale-time policy are explicit. Query keys are resource-based and tenant/session changes clear the client cache.

### Browser and accessibility E2E

Add Playwright coverage for public landing/login, field and batch creation, farm-record creation, trace-code generation, public scan, billing purchase start, logout, and role-restricted navigation. Add axe assertions for public, login, and primary admin surfaces. CI records screenshots, trace, and video only on failure and never embeds credentials.

## Release 4: Quarterly Platform Operations

### Redis-backed distributed runtime state

Add a global Redis module with health reporting and fail-fast production configuration. Redis stores distributed throttle counters, short-lived session validation cache entries, public-trace cache entries, idempotency coordination locks, and BullMQ job state. Security-sensitive cache entries use short TTLs and explicit invalidation on user, tenant, agent, password, or session-version changes.

Production mode does not silently fall back to local memory when Redis is configured as required. Development and unit tests may use an in-memory adapter behind the same interfaces.

### Background jobs

BullMQ workers handle AI reconciliation, stale upload cleanup, and periodic operational audits. Jobs are idempotent, bounded, observable, and safe for multiple workers. The synchronous CLI commands remain available as operator-controlled fallbacks.

### PostgreSQL connection and query operations

Provide PgBouncer transaction-pooling configuration, Prisma-compatible connection guidance, explicit pool/time-out environment validation, `pg_stat_statements` enablement, and versioned slow-query reports. Add explain-based regression checks for anti-fake aggregation, stale reconciliation, and primary paginated lists using representative seeded volumes.

### Metrics, traces, and alerts

Instrument HTTP requests, Prisma queries, Redis, BullMQ, and outbound AI/OSS/payment calls with OpenTelemetry. Export Prometheus-compatible metrics and OTLP traces. Metric labels exclude tenant IDs, user IDs, trace codes, prompts, URLs containing secrets, and other high-cardinality values.

Ship Prometheus alert rules for readiness failures, error rate, latency, database pool saturation, Redis availability, queue age, reconciliation errors, and backup age.

### Disaster recovery and release automation

Add executable backup, restore, and restore-verification scripts. Backup artifacts are encrypted outside the repository, checksummed, retention-managed, and tested through a disposable restore database. Documentation defines RPO, RTO, ownership, escalation, and a quarterly drill.

Release automation builds immutable artifacts, applies migration preflight, records the deployed Git SHA, performs readiness-gated rollout, runs smoke tests, and supports application rollback without pretending that destructive database migrations are reversible.

### Dependency lifecycle

Upgrade NestJS, Prisma, Vite/Vitest, Taro, and associated build chains in separate compatibility commits. Each major upgrade must retain all production gates, browser E2E, migration generation, and miniapp production validation. CI adds dependency review, CodeQL, lockfile policy, and a tracked moderate-advisory budget with expiry dates.

## Data and Migration Strategy

- New tables and columns are additive before enforcement.
- Backfills are restartable and bounded.
- Partial unique indexes are created only after preflight queries prove consistency.
- Large indexes use PostgreSQL-compatible online deployment guidance; local E2E may use ordinary index creation.
- Redis and queue integration is introduced behind interfaces so unit tests do not require network services.
- Application code remains compatible with a rolling deployment whenever schema changes permit it.

## Error Handling

- Invalid proxy, quota, Redis, pool, or telemetry production configuration fails at startup with the variable name and expected shape.
- Authorization failures return 403 without revealing whether out-of-scope resources exist.
- Quota exhaustion returns 429 with stable machine-readable error code and limit metadata.
- Duplicate AI requests never invoke the provider twice.
- Cache, telemetry, and cleanup failures do not bypass security or financial invariants.
- Readiness reports dependency failures without leaking connection strings or credentials.

## Verification and Completion Evidence

Release 1 is complete only when proxy E2E, user-group authorization E2E, upload quota/permission tests, migration constraints, and graceful-shutdown tests pass.

Release 2 is complete only when concurrent duplicate AI requests produce one provider call and one debit, crash-window tests leave no unrecoverable reservation, orphan recovery is covered, and all AI endpoints enforce idempotency.

Release 3 is complete only when public responses are bounded, anti-fake aggregation is database-side, all client API modules parse shared schemas, the named frontend files are decomposed, and Playwright/axe critical flows pass in CI.

Release 4 is complete only when Redis-backed throttling and caches pass multi-instance tests, BullMQ jobs pass concurrency tests, PostgreSQL operational checks run, telemetry exports are verified, backup restore drills are executable, release automation is documented and tested, and dependency upgrades leave zero critical/high production advisories.

The whole roadmap is complete only after a requirement-by-requirement audit finds no missing item and fresh `pnpm verify:production`, browser E2E, Redis/queue integration tests, backup restore verification, and production dependency audit all exit zero from a clean worktree.
