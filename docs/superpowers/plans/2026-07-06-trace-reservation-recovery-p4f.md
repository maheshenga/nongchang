# Trace Reservation Recovery P4F Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Make trace-code credit reservations recover safely and align the trace-code billing e2e gate with the reservation ledger model.

**Architecture:** Treat trace-code generation as an idempotent business operation keyed by a required client `Idempotency-Key`. If codes already exist for a key, the same `count` replays and confirms; a different `count` is rejected. Stale reservation recovery must not refund reservations that already produced trace codes; it should confirm those reservations instead. E2E assertions should verify `RESERVED` and `CONFIRMED` ledgers rather than the old `CONSUME` ledger.

**Tech Stack:** NestJS, Prisma, Vitest, Supertest, existing billing and trace services.

## File Structure

- Modify: `packages/backend/src/modules/trace/trace.service.spec.ts`
  - Add RED tests for required request key and count mismatch.
  - Update generate-code tests to pass request keys.
- Modify: `packages/backend/src/modules/trace/trace.service.ts`
  - Require `requestKey` for trace generation.
  - Reject repeated key with a changed `count`.
- Modify: `packages/backend/src/modules/billing/billing.service.spec.ts`
  - Extend fake Prisma with `traceCode.count`.
  - Add RED test proving stale trace reservations with persisted codes are confirmed, not released/refunded.
- Modify: `packages/backend/src/modules/billing/billing.service.ts`
  - In stale recovery, detect persisted `traceCode` rows for trace generation reservations and write a `CONFIRMED` terminal ledger instead of `RELEASED`.
- Modify: `packages/backend/test/billing.e2e-spec.ts`
  - Send `Idempotency-Key` on trace generation.
  - Assert `RESERVED` and `CONFIRMED` ledger rows.
  - Assert duplicate-key replay does not duplicate charges or codes.
- Modify: `packages/web/src/api/trace.ts` and `packages/web/src/api/trace.spec.ts`
  - Tighten web client typing so production callers must pass a request key.

## Task 1: TraceService idempotency contract

**Files:**
- `packages/backend/src/modules/trace/trace.service.spec.ts`
- `packages/backend/src/modules/trace/trace.service.ts`

- [x] Write a failing test that missing `requestKey` rejects before reserve/create.
- [x] Write a failing test that reusing the same key with a different `count` rejects and does not reserve, confirm, or create codes.
- [x] Update successful generation tests to pass stable request keys.
- [x] Implement `BadRequestException` for missing keys.
- [x] Derive `generationKey` from required `requestKey` only.
- [x] Guard existing-code replay and in-transaction duplicate checks against count mismatch.
- [x] Return generated rows by `generationKey` after confirmation.

Verification command:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/trace/trace.service.spec.ts
```

Expected: pass after implementation.

## Task 2: Trace-aware stale reservation recovery

**Files:**
- `packages/backend/src/modules/billing/billing.service.spec.ts`
- `packages/backend/src/modules/billing/billing.service.ts`

- [x] Extend the billing service fake with a `traceCodes` store and `traceCode.count`.
- [x] Add a recovery test where a reserved trace generation already has persisted codes.
- [x] Select `tenantId` for stale reservation recovery.
- [x] Before releasing a stale trace generation reservation, count codes by `reservationId`, `tenantId`, optional `batchId`, and optional `generationKey`.
- [x] If codes exist, atomically flip the reservation to `CONFIRMED`, write a zero-delta `CONFIRMED` ledger, avoid balance refund, and report it as skipped rather than released.

Verification command:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/billing/billing.service.spec.ts
```

Expected: pass after implementation.

## Task 3: E2E gate and web API alignment

**Files:**
- `packages/backend/test/billing.e2e-spec.ts`
- `packages/web/src/api/trace.ts`
- `packages/web/src/api/trace.spec.ts`

- [x] Update trace-code billing e2e to send `Idempotency-Key`.
- [x] Retry with the same key and assert same codes plus unchanged balance.
- [x] Assert `RESERVED` delta `-count` and `CONFIRMED` delta `0` ledgers with `refType: trace.generate`.
- [x] Update insufficient-balance e2e to send `Idempotency-Key`.
- [x] Make `generateCodes` require `requestKey: string`.
- [x] Remove the obsolete web API test that allowed omitted headers.

Verification commands:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/trace/trace.service.spec.ts src/modules/billing/billing.service.spec.ts
corepack pnpm@10.33.2 --filter @nongchang/backend exec tsc --noEmit
corepack pnpm@10.33.2 --filter web exec tsc --noEmit
corepack pnpm@10.33.2 --filter @nongchang/backend e2e:check-db
```

Expected: affected tests and type checks pass. If the DB precheck cannot reach `127.0.0.1:5544`, record the blocker and do not claim e2e passed.

## Task 4: Verification, review, commit

- [x] Run full local verification with `corepack pnpm@10.33.2 verify:local`.
- [x] Run `git diff --check`.
- [x] Request code review for P4F.
- [x] Fix Critical/Important findings from review:
  - Updated trace-code e2e generation/authz requests to send `Idempotency-Key`.
  - Added explicit missing-key 400 e2e coverage.
  - Tightened billing e2e ledger verification by derived generation key and exact ledger count.
  - Added unrelated-code stale recovery regression for different `reservationId`.
  - Added web client blank-key guard.
- [x] Re-request focused review and confirm no remaining Critical/Important findings.
- [x] Commit with message `fix(billing): make trace reservation recovery safe`.

## Self-Review Checklist

- [x] Fixes the high risk where stale trace generation recovery could refund reservations even though valid trace codes exist.
- [x] Fixes count mismatch under the same client request key.
- [x] Aligns e2e billing ledger expectations with `RESERVED` plus `CONFIRMED`.
- [x] Tightens the API boundary so trace generation cannot accidentally use a random server key.
- [x] Leaves e2e status explicit: runnable only after the PostgreSQL/PostGIS precheck succeeds.
- [x] Review follow-up keeps authorization-path e2e tests aligned with required idempotency.
