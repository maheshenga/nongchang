# Full hardening requirement audit

Audit date: 2026-07-13. The authoritative design is `docs/superpowers/specs/2026-07-13-full-hardening-roadmap-design.md`. A requirement is marked PASS only when it has executable evidence; documentation alone is not used to prove runtime behavior.

## Global invariants

| Requirement | Status | Implementation evidence | Executable evidence |
| --- | --- | --- | --- |
| Miniapp bearer-token APIs remain compatible | PASS | `packages/miniapp/src/api/request.ts`, auth/API contract tests | `pnpm --filter @nongchang/miniapp test` |
| Web HttpOnly refresh-cookie behavior remains compatible | PASS | `packages/backend/src/auth/web-session.ts`, `packages/backend/test/web-session.e2e-spec.ts` | `pnpm --filter @nongchang/backend test:e2e` |
| Tenant and owner checks fail closed | PASS | `packages/backend/src/common/scope/scope.service.ts` and cross-tenant E2E suites | `pnpm --filter @nongchang/backend test:e2e` |
| Ambiguous external AI outcomes never auto-release credit | PASS | `ai-billing-coordinator.ts`, stale reconciliation and orphan recovery | backend unit plus AI reconciliation E2E in `verify:production` |
| Logs, operations, metrics, and traces exclude sensitive payloads | PASS | request logging allowlist, sanitized AI operation model, telemetry label policy | `vitest run src/common/logging src/telemetry src/modules/billing/ai-operation.model.spec.ts` |
| Enforcing migrations have diagnostic preflight | PASS | `scripts/release/migration-preflight.mjs` | `pnpm release:preflight` |
| Production Redis is required at quarterly completion | PASS | runtime-state driver validation and readiness probe | runtime-state E2E plus `verify:production` |

## Release 1: security boundaries and process safety

| Requirement | Status | Implementation evidence | Executable evidence |
| --- | --- | --- | --- |
| Trusted proxy parsing, safe XFF resolution, and stable throttling identity | PASS | trusted-proxy module, client-IP resolver, Nginx operations docs | trusted-proxy unit tests and production E2E |
| User-group CRUD is system-admin owned; agent assignment remains scoped | PASS | user-group controller/service authorization and partial unique default-group index | user-group security E2E |
| Upload purpose authorization is explicit and unknown purposes fail | PASS | upload model/controller authorization policy | upload authorization unit and E2E suites |
| Upload assets, checksums, lifecycle, quota, compensation, and cleanup are durable | PASS | UploadAsset migrations, quota/accounting services, cleanup command | upload unit/E2E and `verify:production` |
| SIGTERM changes readiness and drains dependencies | PASS | shutdown hooks, HealthService shutdown state, Prisma/Redis shutdown hooks | health unit tests and production gate |

## Release 2: atomic and idempotent AI operations

| Requirement | Status | Implementation evidence | Executable evidence |
| --- | --- | --- | --- |
| All billable AI actions use scoped client idempotency keys | PASS | AI controllers/models and web/miniapp idempotency helpers | AI controller/model/client tests |
| Debit, reservation, ledger, and operation creation are atomic | PASS | BillingService transaction and AiBillingCoordinator | billing/coordinator unit tests and PostgreSQL E2E |
| Duplicate requests cause one provider execution and stable replay/status | PASS | durable unique operation keys plus distributed coordination lock | AI reconciliation/idempotency E2E |
| Stale and orphan recovery is bounded, lock-safe, and never silently releases ambiguity | PASS | `reconcileStale`, `FOR UPDATE SKIP LOCKED`, CLI and BullMQ job | AI reconciliation E2E and operations queue E2E |

## Release 3: bounded reads, contracts, UI boundaries, and browser verification

| Requirement | Status | Implementation evidence | Executable evidence |
| --- | --- | --- | --- |
| Public trace collections are bounded; static cache invalidates while scan writes stay live | PASS | public trace response/cache services and invalidation hooks | public-trace unit/E2E |
| Anti-fake aggregation is parameterized and database-side with bounded Top-N | PASS | aggregate SQL service and matching indexes | anti-fake E2E plus query-plan gate |
| Priority web and miniapp responses use shared Zod schemas | PASS | shared DTO schemas and API wrapper parsers | shared/web/miniapp unit suites |
| TanStack Query owns web server state and session changes clear cache | PASS | `packages/web/src/hooks/useApi.ts` and query client wiring | web unit and browser gates |
| AiAssistant, App, and miniapp Me are split by business responsibility | PASS | extracted routed/workspace/Me components | web/miniapp typecheck, unit tests, and production builds |
| Playwright and axe cover critical public/admin flows in CI | PASS | `playwright.config.ts`, `e2e/web`, CI browser job | `pnpm test:browser` and `pnpm test:accessibility` |

## Release 4: quarterly platform operations

| Requirement | Status | Implementation evidence | Executable evidence |
| --- | --- | --- | --- |
| Redis provides fail-fast health, throttling, caches, session validation, and locks | PASS | global runtime-state module and Redis adapter | multi-instance runtime-state E2E and readiness tests |
| Sensitive cache entries have short TTLs and explicit invalidation | PASS | session/public-trace cache services and user/tenant/agent invalidation hooks | focused cache tests and E2E |
| BullMQ jobs are bounded, idempotent, concurrent-safe, observable, and retain CLI fallbacks | PASS | operations queue/processor and enqueue/cleanup/reconciliation commands | operations unit and queue E2E |
| PgBouncer, pool/timeouts, pg_stat_statements, slow reports, and EXPLAIN gates exist | PASS | `ops/pgbouncer`, `ops/postgres`, database runtime config, query-plan script | `pnpm --filter @nongchang/backend db:query-plans` |
| HTTP, Prisma, Redis, BullMQ, AI, OSS, and payment telemetry uses bounded labels | PASS | telemetry module, boundary spans, metrics service/interceptor | telemetry/logging tests and backend build |
| Prometheus alerts cover readiness, errors, latency, DB pool, Redis, queue, reconciliation, backup | PASS | `ops/prometheus/alerts.yml` | `promtool check config ops/prometheus/prometheus.yml` via Docker Compose |
| Backups are encrypted, checksummed, retained outside repo, and restored into a disposable DB | PASS | backup format and backup/restore/drill scripts | format tests plus `pnpm backup:verify-restore` |
| RPO 24h, RTO 4h, owner, escalation, and quarterly evidence are defined | PASS | `docs/ops/disaster-recovery.md` | restore drill is the executable control; timings are recorded by operations |
| Immutable SHA artifacts, migration preflight, deployed SHA, readiness, smoke, and safe rollback exist | PASS | release scripts, health SHA, release workflow/runbook | release script tests, preflight, artifact build, and smoke gates |
| Dependency review, weekly CodeQL, frozen lockfile, zero high/critical, and expiring moderate budget exist | PASS | GitHub workflows/config and advisory budget | `pnpm install --frozen-lockfile` and `pnpm audit:prod` |
| NestJS, Prisma, Vite/Vitest, and Taro were isolated into compatibility commits | PASS | commits `8a61451`, `b2be907`, `54890b4`, `5d47b1f` | package-specific tests/builds plus final production gate |

## Final executable gate

The roadmap is releasable only when all of the following exit zero from a clean worktree using the isolated PostgreSQL and Redis services:

```powershell
corepack pnpm@10.33.2 verify:production
corepack pnpm@10.33.2 test:browser
corepack pnpm@10.33.2 test:accessibility
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run -c vitest.e2e.config.ts test/runtime-state.e2e-spec.ts test/operations-queue.e2e-spec.ts
corepack pnpm@10.33.2 --filter @nongchang/backend db:query-plans
corepack pnpm@10.33.2 backup:verify-restore -- --output-dir "$env:TEMP\nongchang-final-backup-drill"
corepack pnpm@10.33.2 audit:prod
node --test scripts/lib/backup-format.test.mjs scripts/release/*.test.mjs
```

Any non-zero result reopens the matching requirement; it is not waived by this document.
