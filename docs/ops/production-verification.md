# Production Verification Gates

This document is the release checklist for the production-hardening roadmap in `docs/superpowers/specs/2026-07-04-production-hardening-design.md`.

## Local Non-E2E Gate

Run before committing production-hardening changes:

```powershell
corepack pnpm@10.33.2 verify:local
```

This expands to:

- `pnpm --filter @nongchang/shared build`
- `pnpm --filter @nongchang/backend build`
- `pnpm --filter web lint`
- `pnpm test:unit`

## Full Production Gate

Start the local PostGIS database:

```powershell
docker compose -f docker-compose.dev.yml up -d
```

Prepare the database:

```powershell
$env:DATABASE_URL='postgresql://nongchang:nongchang@127.0.0.1:5544/nongchang?schema=public'
corepack pnpm@10.33.2 --filter @nongchang/backend prisma:deploy
corepack pnpm@10.33.2 --filter @nongchang/backend prisma:seed
```

Run the full gate:

```powershell
$env:DATABASE_URL='postgresql://nongchang:nongchang@127.0.0.1:5544/nongchang?schema=public'
corepack pnpm@10.33.2 verify:production
```

To check database readiness without running all e2e tests:

```powershell
$env:DATABASE_URL='postgresql://nongchang:nongchang@127.0.0.1:5544/nongchang?schema=public'
corepack pnpm@10.33.2 --filter @nongchang/backend e2e:check-db
```

## Binding Production Cutover Gate

The farm-record publication migration requires one atomic database/backend cutover. Passing local verification does not waive this gate:

1. Restore a current production backup into a separate rehearsal database. Record the `trace_events` row count and `pg_total_relation_size('trace_events')`, migration duration, and observed lock behavior. The operator must accept the result for the maintenance window before production proceeds.
2. Enable maintenance mode or equivalent write quiescence, then stop all PM2 backend instances before `prisma:deploy`.
3. Verify no old backend process is listening on port `3001`. Old and new versions must never accept writes concurrently.
4. With writes still stopped, take and verify a pre-cutover database backup, run `prisma:deploy`, and start only the new build.
5. Run readiness plus focused farm-record completion and public-trace smoke checks before removing maintenance mode.
6. If any step fails before traffic is reopened, keep writes stopped and restore the pre-cutover database backup together with the old build.
7. Once the new build accepts any production write, do not roll back to a pre-feature backend and do not drop the relation. Re-enter maintenance mode if needed and forward-fix. Historical pending records lack a completion timestamp that could safely distinguish a mixed-version missed publication from intentional historical non-backfill.

Do not run a broad historical reconciler or automatic backfill as part of this release. Keep production credentials and backup locations in restricted server configuration.

## E2E Blocker Interpretation

If the precheck reports `ECONNREFUSED 127.0.0.1:5544` or says it cannot reach `127.0.0.1:5544`, the local database is not running or is not mapped to the expected port. Start Docker Compose, rerun migrations and seed, then rerun the gate.

Do not report e2e as passing until `corepack pnpm@10.33.2 test:e2e` exits `0`.

## Phase 1-6 Coverage Matrix

| Roadmap item | Evidence |
| --- | --- |
| Supply issuance sends the selected `batchId`; merchant-scoped supply management is enforced; system admin mutation paths remain constrained by backend authorization | `packages/web/src/api/supply.spec.ts`, `packages/backend/src/modules/supply/supply.service.spec.ts`, `packages/backend/test/supply.e2e-spec.ts` |
| Production navigation does not expose demo dashboards or simulated mobile flows by default | `packages/web/src/navigation.spec.ts`, `packages/web/src/App.spec.tsx` |
| Settings no longer presents unimplemented IoT, blockchain, or push features as active system capabilities | `packages/web/src/components/Settings.spec.tsx`, `packages/web/src/App.spec.tsx` |
| User group permission behavior matches the enforced `PermissionsGuard` design | `packages/backend/src/common/guards/permissions.guard.spec.ts`, `packages/backend/src/modules/farm-record/farm-record.controller.spec.ts`, `packages/backend/src/modules/field/field.controller.spec.ts`, `packages/backend/src/modules/batch/batch.controller.spec.ts`, `packages/backend/src/modules/trace/trace.controller.spec.ts`, `packages/web/src/components/UserGroups.spec.tsx` |
| Credit reservation behavior prevents duplicate charges and releases failed operations | `packages/backend/src/modules/billing/billing.service.spec.ts`, `packages/backend/src/modules/trace/trace.service.spec.ts`, `packages/backend/src/modules/ai/ai.service.spec.ts`, `docs/ops/credit-ledger-audit.sql` |
| WeChat tenant-scoped OpenID behavior is covered | `packages/backend/src/auth/auth.service.spec.ts`, `packages/backend/test/integration-wechat.e2e-spec.ts`, `packages/backend/prisma/migrations/20260706130000_wechat_openid_tenant_unique/migration.sql` |
| Session revocation rejects stale, disabled-user, and disabled-tenant tokens | `packages/backend/src/auth/jwt.strategy.spec.ts`, `packages/backend/src/auth/auth.service.spec.ts`, `packages/backend/src/modules/user/user.service.spec.ts` |
