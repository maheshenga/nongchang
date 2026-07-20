# Production Verification Gates

For encrypted PostgreSQL backup, restore, RPO/RTO, and quarterly drill procedures, see [disaster-recovery.md](./disaster-recovery.md).

This document is the release checklist for the production-hardening roadmap in `docs/superpowers/specs/2026-07-04-production-hardening-design.md`.

## Web/API Immutable Release Gate

The formal `v*` release runs in the protected GitHub Environment `production-web`. It builds on Linux x64 and must pass all of the following before the archive/manifest pair is uploaded:

- `pnpm verify:release:web` for shared/backend/Web build, typecheck, lint, unit, e2e, and audit;
- `pnpm test:browser` and `pnpm test:accessibility`;
- `pnpm --filter @nongchang/backend db:query-plans`;
- `pnpm backup:verify-restore`;
- `pnpm audit:prod` and `pnpm release:test`;
- `pnpm release:artifact -- --target web` followed by archive extraction verification with the expected SHA and `target=web`.

The artifact contract excludes miniapp output and includes only the runtime scripts/configuration needed by Web/API. `VITE_PUBLIC_SALES_CONTACT` is a protected public build variable. E2E and backup credentials are GitHub secret references; Baota runtime secrets never enter the workflow or repository.

Production verification follows this immutable order: archive/manifest verification, server preflight, encrypted off-host backup confirmation, forward-only migration, inactive candidate readiness/live SHA smoke, atomic Nginx switch, public smoke, worker restart/health, and application-only state commit. See [Baota deployment](../deploy/baota.md) and [release runbook](./release-runbook.md).

Rollback selects the previous verified application artifact and uses the same switch gates. It never resets or migrates the database down, executes reverse SQL, uses `DROP`/`TRUNCATE`, or accepts database rollback flags.

## Local Non-E2E Gate

Run before committing production-hardening changes:

```powershell
$env:TARO_APP_API='https://api.ci.invalid/api'
$env:TARO_APP_WX_APPID='wx0000000000000000'
corepack pnpm@10.33.2 verify:local
```

This expands to:

- shared and backend builds
- web typecheck and monorepo-wide warning-free ESLint
- `pnpm test:unit`
- web and production miniapp builds
- `pnpm audit --prod --audit-level high`

The miniapp build rejects missing variables, non-HTTPS API URLs, placeholder hosts,
API paths that do not end in `/api`, and malformed WeChat AppIDs. Replace the CI
values above with the real production API URL and AppID for a release build.

## Full Production Gate

Start the local PostGIS database and Redis:

```powershell
docker compose -f docker-compose.dev.yml up -d db redis
```

Prepare the database:

```powershell
$env:DATABASE_URL='postgresql://nongchang:nongchang@127.0.0.1:5544/nongchang?schema=public'
Get-Content packages/backend/prisma/audit-data-consistency.sql -Raw | docker exec -i nongchang-postgis psql -U nongchang -d nongchang
corepack pnpm@10.33.2 --filter @nongchang/backend prisma:deploy
corepack pnpm@10.33.2 --filter @nongchang/backend prisma:seed
```

The consistency audit must return zero rows. The tenant-consistency migration repeats
the same preflight and aborts with a stable `tenant_consistency_*` name when historical
rows disagree on tenant, owner, field, batch, supply, trace, or credit-account ownership.
Back up and repair those rows before retrying the migration; do not disable the trigger
or foreign-key checks.

Run the full gate:

```powershell
$env:DATABASE_URL='postgresql://nongchang:nongchang@127.0.0.1:5544/nongchang?schema=public'
$env:TARO_APP_API='https://api.ci.invalid/api'
$env:TARO_APP_WX_APPID='wx0000000000000000'
corepack pnpm@10.33.2 verify:production
```

Run the browser and accessibility gates with credentials supplied only in the current shell:

```powershell
$env:E2E_TENANT_CODE='DEMO'
$env:E2E_USERNAME='<seed-user>'
$env:E2E_PASSWORD='<seed-password>'
$env:E2E_BILLING_USERNAME='<seed-agent-user>'
corepack pnpm@10.33.2 test:browser
corepack pnpm@10.33.2 test:accessibility
```

These gates start the real NestJS and Vite services against seeded PostGIS. The UI login/logout test disables tracing, screenshots, and video because it types a password. Authenticated critical flows and accessibility checks also disable tracing so session cookies and access-token responses are not written into trace archives. Other screenshots and videos are retained only for failures.

The browser gate covers the public landing/login entry, UI login/logout, merchant role-restricted navigation, field creation, batch creation, farm-record creation, trace-code generation, public trace scanning, and an agent billing-purchase start. The payment handoff is intentionally stopped inside Playwright after the real order is created so the test never leaves the local environment or contacts an external payment page.

To check database readiness without running all e2e tests:

```powershell
$env:DATABASE_URL='postgresql://nongchang:nongchang@127.0.0.1:5544/nongchang?schema=public'
corepack pnpm@10.33.2 --filter @nongchang/backend e2e:check-db
```

## PostgreSQL Pooling And Query Plans

Production should place PgBouncer in transaction-pooling mode using `ops/pgbouncer/pgbouncer.ini`. Generate `userlist.txt` outside the repository from the production SCRAM verifier; never commit a database password or verifier. The Prisma connection string must include `pgbouncer=true`, `connection_limit` matching `DATABASE_POOL_MAX`, and `pool_timeout` matching `DATABASE_POOL_TIMEOUT_SECONDS`.

PostgreSQL must start with `shared_preload_libraries=pg_stat_statements`. Apply the versioned observability setup and run the slow-query report as a database administrator:

```powershell
Get-Content ops/postgres/enable-observability.sql -Raw | docker exec -i nongchang-postgis psql -U nongchang -d nongchang
Get-Content ops/postgres/slow-query-report.sql -Raw | docker exec -i nongchang-postgis psql -U nongchang -d nongchang
```

Run the index and EXPLAIN regression gate against the release database:

```powershell
$env:DATABASE_URL='postgresql://nongchang:nongchang@127.0.0.1:5544/nongchang?schema=public'
corepack pnpm@10.33.2 --filter @nongchang/backend db:query-plans
```

The gate verifies required indexes, checks `pg_stat_statements`, and rejects estimated sequential scans above 1,000 rows on anti-fake, reconciliation, and primary paginated read paths. It intentionally avoids machine-specific execution-time thresholds.

When multiple worktrees need isolated local services, override the fixed defaults without touching another checkout's containers:

```powershell
$env:POSTGRES_CONTAINER_NAME='nongchang-postgis-r4'
$env:POSTGRES_HOST_PORT='5545'
$env:REDIS_CONTAINER_NAME='nongchang-redis-r4'
$env:REDIS_HOST_PORT='57380'
docker compose -p nongchang-r4 -f docker-compose.dev.yml up -d db redis
```

## Deployment Health And Logging Smoke Checks

After PM2 has started the built backend, verify liveness and readiness through the same HTTPS origin used by clients:

```powershell
$baseUrl = 'https://example.com'
$live = Invoke-RestMethod "$baseUrl/api/health/live"
$ready = Invoke-RestMethod "$baseUrl/api/health/ready"
$live
$ready
```

Expected results:

- liveness returns HTTP `200` with `status=ok`, numeric `uptimeSeconds`, and a version string;
- readiness returns HTTP `200` with `status=ready` while PostgreSQL is reachable;
- when PostgreSQL is unavailable, readiness returns HTTP `503` with `status=not_ready`, while liveness can remain `200`.

A readiness `503` must remove the instance from traffic or block it from joining the load-balancer pool. Do not restart PM2 solely for a transient database outage; restart only when the process/liveness policy calls for it. Re-admit the instance after readiness returns `200` again.

During a controlled `SIGTERM`, readiness must change to `503` before the process exits. Confirm the load balancer stops new traffic, in-flight requests finish within the PM2 shutdown window, and the replacement instance reaches `ready` before it is admitted.

Verify request-ID propagation with a safe, recognizable value:

```powershell
$requestId = "release-$([guid]::NewGuid().ToString('N'))"
$response = Invoke-WebRequest "$baseUrl/api/health/live" -Headers @{ 'X-Request-Id' = $requestId }
$response.Headers['X-Request-Id']
```

The response header must equal the supplied ID. Find the same ID in the PM2 application log and confirm the completion entry is one JSON object containing `requestId`, `method`, `path`, `status`, and `durationMs`; authenticated requests may also contain `tenantId` and `userId`.

Before release, use a non-production sentinel request to confirm logs do **not** contain Authorization values, cookies, request or response bodies, query secrets, AI messages/media, or integration credentials. The logger is intentionally allowlist-only; do not enable raw request dumps during troubleshooting.

## E2E Blocker Interpretation

If the precheck reports `ECONNREFUSED 127.0.0.1:5544` or says it cannot reach `127.0.0.1:5544`, the local database is not running or is not mapped to the expected port. Start Docker Compose, rerun migrations and seed, then rerun the gate.

Do not report e2e as passing until `corepack pnpm@10.33.2 test:e2e` exits `0`.

## AI Credit Reconciliation

All billable AI requests must include an `Idempotency-Key` header containing 16
to 128 characters from `A-Z`, `a-z`, `0-9`, `.`, `_`, `:`, or `-`. A client
creates the key once for a user action and reuses it for transport retries. A
new user action must use a new key.

Duplicate requests have a stable contract:

- confirmed operations replay the stored sanitized result envelope;
- reserved, in-flight, or provider-succeeded operations return HTTP `202` with
  `code=AI_OPERATION_IN_PROGRESS`, the operation ID/status, and retry guidance;
- review-required operations return HTTP `409` with
  `code=AI_OPERATION_REVIEW_REQUIRED`;
- terminal failures and non-replayable confirmed rows return HTTP `409` and
  require a new user action/key.

The reservation, debit ledger, and AI operation row are created atomically.
Generic stale-reservation recovery must not release AI-owned reservations.
An aged AI reservation without an operation row is converted into a
`REVIEW_REQUIRED` operation so an ambiguous provider outcome cannot silently
restore credit.

Preview stale reservations and AI operations without changing balances:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend billing:recover-reservations -- --older-than-minutes=60 --limit=100
```

Execute AI reconciliation only after reviewing the preview:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend billing:recover-reservations -- --execute --resource=AI --older-than-minutes=60 --limit=100
```

Interpret `result.ai` as follows:

- `released`: provider work never started or a failure was durably recorded; reserved credit was restored.
- `confirmed`: provider success was durably recorded; the existing debit was confirmed.
- `reviewRequired`: the operation remained `IN_FLIGHT`, so the provider outcome is ambiguous. Credit is intentionally unchanged. Compare provider telemetry, request IDs, and the credit ledger before an explicit manual decision.
- `errors`: reconciliation could not complete safely. Keep the row and investigate; never bulk-release these operations.

Reconciliation rows contain only operation identity, status, provider ID, and a stable
error category. Prompts, images, audio, provider credentials, and provider response
bodies must never be copied into `ai_operations`.

## Upload Quota And Cleanup

Production must set and review these tenant-wide limits:

```env
TRUST_PROXY_HOPS=1
UPLOAD_DAILY_BYTES_LIMIT=104857600
UPLOAD_ACTIVE_BYTES_LIMIT=5368709120
UPLOAD_PENDING_MAX_AGE_MINUTES=60
```

Quota exhaustion returns HTTP `429` with a stable body containing `code=UPLOAD_QUOTA_EXCEEDED`, `scope` (`daily` or `active`), `limitBytes`, and `usedBytes`. Do not retry in a tight loop; surface the limit to the operator or wait for UTC day rollover for a daily limit.

Preview stale `PENDING` assets:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend upload:cleanup -- --older-than-minutes 60 --limit 100
```

After reviewing the bounded dry-run result, execute cleanup:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend upload:cleanup -- --older-than-minutes 60 --limit 100 --execute
```

The command deletes the OSS object before marking the asset `DELETED` and releasing counters. It is idempotent; a non-zero exit status means some objects or rows remain for investigation. Never delete upload ledger rows manually to hide quota drift.

## Phase 1-6 And Stage C Coverage Matrix

| Roadmap item | Evidence |
| --- | --- |
| Supply issuance sends the selected `batchId`; merchant-scoped supply management is enforced; system admin mutation paths remain constrained by backend authorization | `packages/web/src/api/supply.spec.ts`, `packages/backend/src/modules/supply/supply.service.spec.ts`, `packages/backend/test/supply.e2e-spec.ts` |
| Production navigation does not expose demo dashboards or simulated mobile flows by default | `packages/web/src/navigation.spec.ts`, `packages/web/src/App.spec.tsx` |
| Settings no longer presents unimplemented IoT, blockchain, or push features as active system capabilities | `packages/web/src/components/Settings.spec.tsx`, `packages/web/src/App.spec.tsx` |
| User group permission behavior matches the enforced `PermissionsGuard` design | `packages/backend/src/common/guards/permissions.guard.spec.ts`, `packages/backend/src/modules/farm-record/farm-record.controller.spec.ts`, `packages/backend/src/modules/field/field.controller.spec.ts`, `packages/backend/src/modules/batch/batch.controller.spec.ts`, `packages/backend/src/modules/trace/trace.controller.spec.ts`, `packages/web/src/components/UserGroups.spec.tsx` |
| Credit reservation behavior prevents duplicate charges and releases failed operations | `packages/backend/src/modules/billing/billing.service.spec.ts`, `packages/backend/src/modules/trace/trace.service.spec.ts`, `packages/backend/src/modules/ai/ai.service.spec.ts`, `docs/ops/credit-ledger-audit.sql` |
| WeChat tenant-scoped OpenID behavior is covered | `packages/backend/src/auth/auth.service.spec.ts`, `packages/backend/test/integration-wechat.e2e-spec.ts`, `packages/backend/prisma/migrations/20260706130000_wechat_openid_tenant_unique/migration.sql` |
| Session revocation rejects stale, disabled-user, and disabled-tenant tokens | `packages/backend/src/auth/jwt.strategy.spec.ts`, `packages/backend/src/auth/auth.service.spec.ts`, `packages/backend/src/modules/user/user.service.spec.ts` |
| Web refresh sessions stay in HttpOnly cookies and rotate/revoke correctly | `packages/backend/test/web-session.e2e-spec.ts`, `packages/web/src/auth/auth-context.spec.tsx`, `packages/web/src/api/request.spec.ts` |
| AI reservation outcomes are durable and ambiguous calls are quarantined | `packages/backend/src/modules/billing/ai-billing-coordinator.spec.ts`, `packages/backend/test/ai-reconciliation.e2e-spec.ts` |
| PostgreSQL rejects cross-tenant and cross-owner writes | `packages/backend/test/tenant-constraints.e2e-spec.ts`, `packages/backend/prisma/audit-data-consistency.sql` |
| Liveness/readiness distinguish process health from PostgreSQL traffic readiness | `packages/backend/src/modules/health/health.service.spec.ts`, `packages/backend/src/modules/health/health.controller.spec.ts` |
| Completion logs propagate request IDs while excluding secrets and request content | `packages/backend/src/common/logging/request-id.spec.ts`, `packages/backend/src/common/logging/request-logging.interceptor.spec.ts` |
| Web and miniapp resource responses are runtime-validated through shared contracts | `packages/shared/src/dto/resource-views.dto.spec.ts`, `packages/web/src/api/batches.spec.ts`, `packages/web/src/api/fields.spec.ts`, `packages/web/src/api/farm-records.spec.ts`, `packages/miniapp/src/api/farm.spec.ts`, `packages/miniapp/src/api/trace.spec.ts` |
