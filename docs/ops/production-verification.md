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

## Binding Production Cutover and Rollback Boundary

The production cutover and rollback boundary is identical across the approved design and deployment runbooks:

1. Before production, restore a current backup into a rehearsal database; record the `trace_events` row count and total relation size, migration duration, and observed lock behavior. Do not proceed without an operator-approved maintenance-window result.
2. At cutover, enable maintenance mode and write quiescence, stop every PM2 backend instance before `prisma:deploy`, and verify no old backend process listens on port `3001`; old and new versions must never serve writes concurrently.
3. While writes remain stopped, take and verify the pre-cutover database backup, deploy the migration, and start only the new build.
4. Pre-open smoke writes are allowed only as uniquely tagged, release-owned disposable fixtures; record the release ID and every created ID. Keep maintenance mode and write quiescence active while readiness and focused smoke checks run.
5. If any pre-open check fails, keep writes stopped and restore the pre-cutover backup; that restore removes the disposable smoke writes, and rollback to the old build is allowed only together with that backup restore.
6. If checks pass, remove every disposable smoke fixture in FK-safe order and verify zero residue before reopening user traffic.
7. The irreversible boundary is the first non-disposable user write accepted after maintenance mode is removed, not the controlled smoke write.
8. After that boundary, old-build/database rollback is forbidden; re-enter maintenance mode if necessary and forward-fix. Historical pending records have no completion timestamp that can safely distinguish missed mixed-version publication from intentional historical non-backfill.

No broad historical reconciler or automatic backfill is part of this cutover.

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
