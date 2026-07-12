# Production Verification Gates

This document is the release checklist for the production-hardening roadmap in `docs/superpowers/specs/2026-07-04-production-hardening-design.md`.

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

Start the local PostGIS database:

```powershell
docker compose -f docker-compose.dev.yml up -d
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

To check database readiness without running all e2e tests:

```powershell
$env:DATABASE_URL='postgresql://nongchang:nongchang@127.0.0.1:5544/nongchang?schema=public'
corepack pnpm@10.33.2 --filter @nongchang/backend e2e:check-db
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
