# Full Hardening Release 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add distributed runtime state, bounded background jobs, PostgreSQL operational checks, low-cardinality telemetry, executable disaster recovery, immutable release automation, and dependency lifecycle gates.

**Architecture:** A global runtime module selects Redis in production and an in-memory adapter in unit tests, while preserving fail-closed security and financial invariants. BullMQ workers reuse the existing reconciliation and cleanup services, operational scripts remain executable fallbacks, and observability/backup/release tooling is implemented as versioned code with integration gates instead of documentation-only promises.

**Tech Stack:** NestJS, ioredis, BullMQ, PostgreSQL/PostGIS, Prisma, OpenTelemetry, prom-client, Node.js scripts, Docker Compose, GitHub Actions, Vitest.

## Global Constraints

- Production must fail startup when `REDIS_URL` is absent or unreachable; unit tests may use the in-memory adapter.
- Cache entries must never contain credentials, prompts, media, authorization headers, cookies, payment payloads, or raw scan client details.
- Metric labels must not contain tenant IDs, user IDs, trace codes, object keys, prompt text, or unbounded URLs.
- Jobs must be idempotent, bounded, retry-safe, and safe with multiple workers.
- Database changes and indexes require diagnostic preflight and versioned SQL.
- Backup artifacts must live outside the repository, be encrypted and checksummed, and be verified through a disposable restore database.
- Rollback automation may roll back application artifacts but must never claim destructive database migrations are reversible.
- Every behavior change starts with a failing focused test and ends with a green focused test.
- Use `corepack pnpm@10.33.2` for installation and verification.

---

### Task 1: Global Redis runtime state and distributed throttling

**Files:**
- Modify: `docker-compose.dev.yml`
- Modify: `.env.example`
- Modify: `packages/backend/package.json`
- Modify: `packages/backend/src/app.module.ts`
- Modify: `packages/backend/src/common/config/validate-env.ts`
- Modify: `packages/backend/src/common/config/validate-env.spec.ts`
- Create: `packages/backend/src/common/runtime/runtime-state.types.ts`
- Create: `packages/backend/src/common/runtime/memory-runtime-state.service.ts`
- Create: `packages/backend/src/common/runtime/redis-runtime-state.service.ts`
- Create: `packages/backend/src/common/runtime/runtime-state.module.ts`
- Create: `packages/backend/src/common/runtime/runtime-state.service.spec.ts`
- Create: `packages/backend/src/common/runtime/redis-throttler.storage.ts`
- Create: `packages/backend/src/common/runtime/redis-throttler.storage.spec.ts`
- Modify: `packages/backend/src/modules/health/health.service.ts`
- Modify: `packages/backend/src/modules/health/health.service.spec.ts`

**Interfaces:**
- Produces `RUNTIME_STATE` implementing `getJson<T>`, `setJson`, `delete`, `deleteByPrefix`, `increment`, `acquireLock`, `releaseLock`, `ping`, and `close`.
- Produces `RedisThrottlerStorage.increment(key, ttl, limit, blockDuration, throttlerName)` using Redis atomic counters.
- Adds readiness dependency state without exposing Redis URLs.

- [ ] **Step 1: Install dependencies and write failing configuration/runtime tests**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend add ioredis@^5 bullmq@^5 @nestjs/bullmq@^11
```

Tests must assert production rejects missing `REDIS_URL`, test mode selects memory, Redis connection errors make readiness `not_ready`, increments share state across two adapters, and only the lock owner can release a lock.

- [ ] **Step 2: Verify RED**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/common/runtime src/common/config/validate-env.spec.ts src/modules/health/health.service.spec.ts
```

Expected: missing runtime module, Redis storage, and production validation failures.

- [ ] **Step 3: Implement the runtime interface and Redis lifecycle**

```ts
export interface RuntimeStateStore {
  getJson<T>(key: string): Promise<T | null>;
  setJson(key: string, value: unknown, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
  deleteByPrefix(prefix: string): Promise<number>;
  increment(key: string, ttlMs: number): Promise<number>;
  acquireLock(key: string, owner: string, ttlMs: number): Promise<boolean>;
  releaseLock(key: string, owner: string): Promise<boolean>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}
```

Use `SET key owner PX ttl NX` for acquisition and a compare-and-delete Lua script for release. Prefix all keys with `nongchang:` and do not silently replace Redis with memory in production.

- [ ] **Step 4: Wire Redis throttling, Docker health, and readiness**

Add a Redis 7 service on host port `56379`, configure a shared throttler storage provider, and have readiness check PostgreSQL plus Redis. Development may set `RUNTIME_STATE_DRIVER=memory`; production requires `redis`.

- [ ] **Step 5: Run multi-instance Redis integration and commit**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/common/runtime src/modules/health
corepack pnpm@10.33.2 --filter @nongchang/backend test:e2e -- test/runtime-state.e2e-spec.ts test/throttler.e2e-spec.ts
```

Commit: `feat(runtime): add redis distributed state`

### Task 2: Distributed caches, session validation, and idempotency locks

**Files:**
- Modify: `packages/backend/src/modules/public-trace/public-trace-cache.service.ts`
- Modify: `packages/backend/src/modules/public-trace/public-trace-cache.service.spec.ts`
- Modify: `packages/backend/src/modules/public-trace/public-trace.service.ts`
- Create: `packages/backend/src/auth/session-validation-cache.service.ts`
- Create: `packages/backend/src/auth/session-validation-cache.service.spec.ts`
- Modify: `packages/backend/src/auth/auth.module.ts`
- Modify: `packages/backend/src/auth/jwt.strategy.ts`
- Modify: `packages/backend/src/auth/jwt.strategy.spec.ts`
- Modify: `packages/backend/src/auth/auth.service.ts`
- Modify: `packages/backend/src/modules/user/user.service.ts`
- Modify: `packages/backend/src/modules/tenant/tenant.service.ts`
- Modify: `packages/backend/src/modules/agent/agent.service.ts`
- Create: `packages/backend/src/common/runtime/idempotency-lock.service.ts`
- Create: `packages/backend/src/common/runtime/idempotency-lock.service.spec.ts`
- Modify: `packages/backend/src/modules/trace/trace.service.ts`
- Modify: `packages/backend/src/modules/ai/ai.service.ts`

**Interfaces:**
- Public trace cache keys: `cache:public-trace:code:<code>` and batch/tenant membership sets for invalidation.
- Session keys: `cache:session:<userId>:<sessionVersion>` with a maximum 15-second TTL.
- Lock keys: `lock:<operationKind>:<tenantId>:<userId>:<idempotencyKey>` with an owner UUID and bounded TTL.

- [ ] **Step 1: Write failing two-instance cache/invalidation tests**

Prove one service instance populates and another reads the public cache, a user/password/tenant/agent mutation invalidates session state, and two concurrent idempotency lock contenders produce one winner.

- [ ] **Step 2: Verify RED**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/public-trace src/auth/session-validation-cache.service.spec.ts src/common/runtime/idempotency-lock.service.spec.ts
```

- [ ] **Step 3: Implement distributed caches without weakening database guarantees**

The session cache stores only `{ userId, tenantId, role, agentId, ownerId, sessionVersion }`. Cache miss reads PostgreSQL; cache hit never extends beyond the access-token validation window. Mutation services delete user keys after the database commit.

- [ ] **Step 4: Wrap billable/trace idempotency coordination**

Acquire a short lock before the existing database unique-key/transaction path, reread durable operation state when the lock is busy, and always release only the owned lock. Redis failure must not skip database idempotency or charge logic.

- [ ] **Step 5: Verify and commit**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/auth src/modules/public-trace src/modules/trace src/modules/ai src/common/runtime
```

Commit: `feat(runtime): distribute caches and coordination`

### Task 3: BullMQ operational jobs

**Files:**
- Create: `packages/backend/src/modules/operations/operations.constants.ts`
- Create: `packages/backend/src/modules/operations/operations.module.ts`
- Create: `packages/backend/src/modules/operations/operations.scheduler.ts`
- Create: `packages/backend/src/modules/operations/operations.processor.ts`
- Create: `packages/backend/src/modules/operations/operations.processor.spec.ts`
- Create: `packages/backend/src/modules/operations/operations-audit.service.ts`
- Create: `packages/backend/src/modules/operations/operations-audit.service.spec.ts`
- Modify: `packages/backend/src/app.module.ts`
- Modify: `packages/backend/src/modules/billing/ai-billing-coordinator.ts`
- Modify: `packages/backend/src/modules/upload/upload-quota.service.ts`
- Modify: `packages/backend/package.json`
- Create: `packages/backend/test/operations-queue.e2e-spec.ts`

**Interfaces:**
- Queue `platform-operations` with jobs `ai-reconcile`, `upload-cleanup`, and `operational-audit`.
- Each job payload contains only bounded options: `{ cutoffIso, limit, dryRun }`.
- Job IDs are deterministic per schedule window to prevent duplicate execution.

- [ ] **Step 1: Write failing processor idempotency/concurrency tests**

Assert two workers receiving the same deterministic job ID produce one durable reconciliation, cleanup processes at most `limit`, and job failures contain only stable categories.

- [ ] **Step 2: Verify RED**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/operations
```

- [ ] **Step 3: Implement scheduler and processors**

Register repeatable jobs only when `OPERATIONS_WORKERS_ENABLED=true`. Use one queue connection, bounded attempts with exponential backoff, `removeOnComplete`/`removeOnFail` count caps, and concurrency from validated `OPERATIONS_WORKER_CONCURRENCY`.

- [ ] **Step 4: Preserve CLI fallbacks and add queue commands**

Keep `billing:recover-reservations` and `upload:cleanup`; add `operations:enqueue` for an operator-controlled one-off job.

- [ ] **Step 5: Verify Redis queue integration and commit**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend test:e2e -- test/operations-queue.e2e-spec.ts
```

Commit: `feat(operations): add bullmq maintenance jobs`

### Task 4: PostgreSQL pooling, slow-query reports, and EXPLAIN gates

**Files:**
- Modify: `docker-compose.dev.yml`
- Modify: `.env.example`
- Modify: `packages/backend/src/common/config/validate-env.ts`
- Modify: `packages/backend/src/common/config/validate-env.spec.ts`
- Create: `ops/pgbouncer/pgbouncer.ini`
- Create: `ops/pgbouncer/userlist.txt.example`
- Create: `ops/postgres/enable-observability.sql`
- Create: `ops/postgres/slow-query-report.sql`
- Create: `packages/backend/scripts/check-query-plans.ts`
- Create: `packages/backend/scripts/check-query-plans.spec.ts`
- Create: `packages/backend/scripts/seed-query-plan-fixture.ts`
- Modify: `packages/backend/package.json`
- Modify: `docs/ops/production-verification.md`

**Interfaces:**
- Validates `DATABASE_POOL_MAX`, `DATABASE_POOL_TIMEOUT_SECONDS`, and `DATABASE_STATEMENT_TIMEOUT_MS` as bounded positive integers.
- Adds `db:query-plans` that fails when named plans regress to unbounded sequential scans over representative fixtures.

- [ ] **Step 1: Write failing pool validation and plan parser tests**

Tests cover invalid zero/negative/non-integer values and a JSON EXPLAIN tree containing an unacceptable large `Seq Scan`.

- [ ] **Step 2: Verify RED**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/common/config/validate-env.spec.ts scripts/check-query-plans.spec.ts
```

- [ ] **Step 3: Add PgBouncer and pg_stat_statements configuration**

Use transaction pooling, `max_client_conn=500`, `default_pool_size=20`, `reserve_pool_size=5`, `server_reset_query=DISCARD ALL`, and Prisma connection guidance with `pgbouncer=true&connection_limit=<n>&pool_timeout=<seconds>`.

- [ ] **Step 4: Add versioned report and EXPLAIN checks**

Check anti-fake aggregation, stale AI reconciliation, billing orders, batches, fields, and farm-record pagination. Seed a bounded representative volume and parse `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` without hard-coding machine-specific timing.

- [ ] **Step 5: Verify and commit**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend db:query-plans
```

Commit: `perf(postgres): add pooling and query plan gates`

### Task 5: OpenTelemetry, Prometheus metrics, and alert rules

**Files:**
- Modify: `packages/backend/package.json`
- Create: `packages/backend/src/telemetry/telemetry.bootstrap.ts`
- Create: `packages/backend/src/telemetry/telemetry.config.ts`
- Create: `packages/backend/src/telemetry/telemetry.config.spec.ts`
- Create: `packages/backend/src/telemetry/metrics.service.ts`
- Create: `packages/backend/src/telemetry/metrics.service.spec.ts`
- Create: `packages/backend/src/telemetry/metrics.controller.ts`
- Create: `packages/backend/src/telemetry/telemetry.module.ts`
- Create: `packages/backend/src/telemetry/outbound-span.ts`
- Modify: `packages/backend/src/main.ts`
- Modify: `packages/backend/src/common/logging/request-logging.interceptor.ts`
- Modify: AI, OSS, payment, Redis, and BullMQ boundary services
- Create: `ops/prometheus/alerts.yml`
- Create: `ops/prometheus/prometheus.yml`
- Modify: `docker-compose.dev.yml`

**Interfaces:**
- Exposes authenticated or network-restricted `GET /api/metrics` in Prometheus text format.
- Produces low-cardinality metrics for HTTP duration/errors, Prisma duration/errors, Redis availability, queue depth/age/failures, reconciliation errors, and backup age.
- Enables OTLP trace export only when `OTEL_EXPORTER_OTLP_ENDPOINT` is configured.

- [ ] **Step 1: Install telemetry dependencies and write failing label-policy tests**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend add prom-client@^15 @opentelemetry/api@^1 @opentelemetry/sdk-node@^0.200 @opentelemetry/exporter-trace-otlp-http@^0.200 @opentelemetry/auto-instrumentations-node@^0.60
```

Tests reject forbidden label names (`tenantId`, `userId`, `traceCode`, `url`, `objectKey`, `prompt`) and verify only normalized route/method/status-class labels are exported.

- [ ] **Step 2: Verify RED**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/telemetry
```

- [ ] **Step 3: Implement bootstrap and boundary spans**

Start telemetry before Nest imports, disable payload capture, record route templates instead of raw URLs, and wrap outbound calls with operation/provider/status attributes only.

- [ ] **Step 4: Add alerts**

Rules cover readiness failures, 5xx rate, p95 latency, database pool saturation, Redis availability, oldest queue job age, reconciliation errors, and backup age. Every rule includes a stable severity and runbook URL.

- [ ] **Step 5: Verify exports and commit**

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/telemetry src/common/logging
```

Commit: `feat(observability): add metrics traces and alerts`

### Task 6: Encrypted backup, restore, and quarterly drill

**Files:**
- Create: `scripts/lib/backup-format.mjs`
- Create: `scripts/lib/backup-format.test.mjs`
- Create: `scripts/backup-postgres.mjs`
- Create: `scripts/restore-postgres.mjs`
- Create: `scripts/verify-backup-restore.mjs`
- Modify: `package.json`
- Create: `docs/ops/disaster-recovery.md`
- Modify: `docs/ops/production-verification.md`

**Interfaces:**
- `backup:postgres -- --output-dir <absolute-path>` writes `<timestamp>.dump.enc`, `<timestamp>.manifest.json`, and `<timestamp>.sha256` outside the repository.
- Uses AES-256-GCM with `BACKUP_ENCRYPTION_KEY` supplied at runtime; the key is never written to disk or logs.
- `backup:verify-restore` restores into a disposable database, applies verification SQL, and drops it in `finally`.

- [ ] **Step 1: Write failing format/checksum/retention tests**

Use a deterministic test key and fixture bytes to prove decrypt(encrypt(bytes)) round-trips, tampering fails authentication, checksums detect changes, and retention keeps the newest requested count.

- [ ] **Step 2: Verify RED**

```powershell
node --test scripts/lib/backup-format.test.mjs
```

- [ ] **Step 3: Implement encrypted streaming backup and restore**

Invoke `pg_dump --format=custom --no-owner --no-acl`, encrypt with a random 12-byte IV and 16-byte auth tag, write atomically, and create a manifest containing schema version, database name, Git SHA, creation time, checksum, and tool versions without connection credentials.

- [ ] **Step 4: Implement disposable restore verification and runbook**

The drill creates `nongchang_restore_<timestamp>`, restores the decrypted dump, runs counts plus tenant-consistency audits, then drops the database even on failure. Document RPO 24 hours, RTO 4 hours, on-call owner, escalation, and quarterly evidence retention.

- [ ] **Step 5: Run an actual restore drill and commit**

```powershell
$env:BACKUP_ENCRYPTION_KEY='<runtime-hex64>'
corepack pnpm@10.33.2 backup:verify-restore -- --output-dir "$env:TEMP\nongchang-backup-drill"
```

Commit: `feat(ops): add encrypted backup restore drill`

### Task 7: Immutable release artifacts, rollout, smoke, and rollback

**Files:**
- Create: `scripts/release/build-artifact.mjs`
- Create: `scripts/release/build-artifact.test.mjs`
- Create: `scripts/release/migration-preflight.mjs`
- Create: `scripts/release/smoke.mjs`
- Create: `scripts/release/rollback.mjs`
- Modify: `package.json`
- Create: `.github/workflows/release.yml`
- Create: `.github/dependency-review-config.yml`
- Create: `.github/codeql-config.yml`
- Modify: `.github/workflows/ci.yml`
- Create: `docs/ops/release-runbook.md`

**Interfaces:**
- Artifact name includes Git SHA; manifest includes SHA-256 hashes for backend, web, shared, Prisma migrations, and lockfile.
- Migration preflight runs consistency SQL and `prisma migrate status` before deploy.
- Smoke checks `/api/health/live`, `/api/health/ready`, public trace, and authenticated read-only endpoints.
- Rollback switches to a previous immutable application artifact and refuses database rollback commands.

- [ ] **Step 1: Write failing manifest/smoke/rollback policy tests**

Tests reject a dirty worktree, a manifest with mismatched SHA, readiness timeout, and any rollback argument that attempts `prisma migrate reset`, down migrations, or SQL reversal.

- [ ] **Step 2: Verify RED**

```powershell
node --test scripts/release/*.test.mjs
```

- [ ] **Step 3: Implement artifact and rollout scripts**

Build once, hash once, deploy the same archive, record `DEPLOYED_GIT_SHA`, wait for readiness before traffic admission, and run smoke checks before marking the rollout complete.

- [ ] **Step 4: Add CI security/lifecycle gates**

Add browser/axe jobs with Redis and PostGIS services, dependency review for pull requests, weekly CodeQL, frozen-lockfile enforcement, production audit, and a checked-in moderate-advisory budget file containing package, advisory, owner, reason, and expiry date.

- [ ] **Step 5: Verify and commit**

```powershell
node --test scripts/release/*.test.mjs
corepack pnpm@10.33.2 audit:prod
```

Commit: `feat(release): add immutable rollout automation`

### Task 8: Dependency lifecycle upgrades and final release audit

**Files:**
- Modify: root and package `package.json` files
- Modify: `pnpm-lock.yaml`
- Create: `docs/ops/dependency-advisory-budget.json`
- Create: `docs/ops/full-hardening-requirements.md`

**Interfaces:**
- Production audit must report zero high/critical advisories.
- Moderate advisory exceptions require owner, reason, compensating control, and expiry no more than 90 days away.
- Requirement audit maps every Release 1-4 item to executable evidence.

- [ ] **Step 1: Capture current dependency and advisory baseline**

```powershell
corepack pnpm@10.33.2 outdated -r
corepack pnpm@10.33.2 audit --prod --json
```

- [ ] **Step 2: Upgrade one compatibility family at a time**

Upgrade NestJS, then Prisma, then Vite/Vitest, then Taro. After each family run build, unit tests, migration generation/status, web build/browser tests, and miniapp production build before committing the family.

- [ ] **Step 3: Run all Release 4 integration gates**

```powershell
corepack pnpm@10.33.2 verify:production
corepack pnpm@10.33.2 test:browser
corepack pnpm@10.33.2 test:accessibility
corepack pnpm@10.33.2 --filter @nongchang/backend test:e2e -- test/runtime-state.e2e-spec.ts test/operations-queue.e2e-spec.ts
corepack pnpm@10.33.2 --filter @nongchang/backend db:query-plans
corepack pnpm@10.33.2 backup:verify-restore -- --output-dir "$env:TEMP\nongchang-final-backup-drill"
corepack pnpm@10.33.2 audit:prod
```

- [ ] **Step 4: Complete requirement-by-requirement audit**

Map each approved roadmap sentence to a file and a passing command. Mark unmet requirements as failures; do not treat documentation as executable evidence when the spec requires runtime behavior.

- [ ] **Step 5: Commit**

Commit: `chore(deps): complete platform lifecycle upgrades`

## Self-Review

- Spec coverage: Redis fail-fast/health, distributed throttling/cache/session/idempotency, BullMQ jobs, PgBouncer/pool/timeouts/pg_stat_statements/EXPLAIN, OpenTelemetry/Prometheus/alerts, encrypted backup/restore drill, RPO/RTO, immutable artifacts/preflight/deployed SHA/readiness/smoke/rollback, dependency review/CodeQL/advisory budget, dependency upgrades, and final audit all have tasks and executable gates.
- Placeholder scan: no deferred implementation placeholders are used; each task has files, exact interfaces, red/green commands, and a commit boundary.
- Type consistency: `RuntimeStateStore` is the shared state boundary for caches, locks, health, and throttling; queue job names/payloads and backup/release artifact formats remain stable across tasks.
