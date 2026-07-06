# Trace Credit Reservation P4-C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert trace-code generation from consume/refund compensation to auditable credit reservation, confirmation, and release.

**Architecture:** Add a durable `credit_reservations` state table and keep `credit_ledgers` as the audit trail. A reservation decrements available balance once, confirmation writes a zero-delta finalization row, and release increments balance once; trace codes also store a `generationKey` so the same client idempotency key returns the same generated codes instead of creating new free codes.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Vitest, pnpm 10.33.2, shared Zod DTOs.

---

## File Structure

- Modify `packages/backend/prisma/schema.prisma` to add `LedgerReason`, `CreditReservationStatus`, `CreditReservation`, and trace-code `reservationId/generationKey`.
- Create `packages/backend/prisma/migrations/20260706160000_credit_reservation_reasons/migration.sql` to alter the PostgreSQL enum, create the reservation table, and add trace-code idempotency columns.
- Modify `packages/shared/src/dto/billing.dto.ts` so API validation and web filters accept reservation rows.
- Modify `packages/backend/src/modules/billing/billing.service.ts` to add `reserve`, `confirmReservation`, and `releaseReservation`.
- Modify `packages/backend/src/modules/billing/billing.service.spec.ts` to cover reserve/confirm/release idempotency and release-before-reserve refusal.
- Modify `packages/backend/src/modules/trace/trace.service.ts` to replace `consume/refund` in `generateCodes`.
- Modify `packages/backend/src/modules/trace/trace.service.spec.ts` to assert reserve/confirm/release behavior.
- Modify `packages/backend/src/modules/trace/trace.controller.ts` to accept optional `Idempotency-Key`.
- Modify `packages/web/src/api/trace.ts` to optionally send `Idempotency-Key`.
- Modify `packages/web/src/components/BillingLedger.tsx` to label the new ledger reasons.

## Task 1: Schema and Shared Contract

**Files:**
- Modify: `packages/backend/prisma/schema.prisma`
- Create: `packages/backend/prisma/migrations/20260706160000_credit_reservation_reasons/migration.sql`
- Modify: `packages/shared/src/dto/billing.dto.ts`

- [ ] **Step 1: Add Prisma enum values**

Change `packages/backend/prisma/schema.prisma`:

```prisma
enum LedgerReason {
  RECHARGE
  ALLOCATE_IN
  ALLOCATE_OUT
  CONSUME
  REFUND
  PURCHASE
  RESERVED
  CONFIRMED
  RELEASED
}

enum CreditReservationStatus {
  RESERVED
  CONFIRMED
  RELEASED
}
```

Add `CreditReservation` and trace-code idempotency fields:

```prisma
model CreditReservation {
  id             String                  @id @default(uuid())
  tenantId       String                  @map("tenant_id")
  accountId      String                  @map("account_id")
  account        CreditAccount           @relation(fields: [accountId], references: [id])
  resource       CreditResource
  amount         Int
  balanceAfter   Int                     @map("balance_after")
  status         CreditReservationStatus @default(RESERVED)
  refType        String?                 @map("ref_type")
  refId          String?                 @map("ref_id")
  idempotencyKey String                  @map("idempotency_key")
  operatorId     String?                 @map("operator_id")
  note           String?
  confirmedAt    DateTime?               @map("confirmed_at")
  releasedAt     DateTime?               @map("released_at")
  createdAt      DateTime                @default(now()) @map("created_at")
  updatedAt      DateTime                @updatedAt @map("updated_at")
  traceCodes     TraceCode[]

  @@unique([accountId, resource, idempotencyKey])
  @@index([tenantId, status, createdAt])
  @@index([refType, refId])
  @@map("credit_reservations")
}

// TraceCode additions:
reservationId String?            @map("reservation_id")
generationKey String?            @map("generation_key")
reservation   CreditReservation? @relation(fields: [reservationId], references: [id])
@@index([tenantId, batchId, generationKey])
```

- [ ] **Step 2: Add migration**

Create `packages/backend/prisma/migrations/20260706160000_credit_reservation_reasons/migration.sql`:

```sql
ALTER TYPE "LedgerReason" ADD VALUE IF NOT EXISTS 'RESERVED';
ALTER TYPE "LedgerReason" ADD VALUE IF NOT EXISTS 'CONFIRMED';
ALTER TYPE "LedgerReason" ADD VALUE IF NOT EXISTS 'RELEASED';
CREATE TYPE "CreditReservationStatus" AS ENUM ('RESERVED', 'CONFIRMED', 'RELEASED');
CREATE TABLE "credit_reservations" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "resource" "CreditResource" NOT NULL,
  "amount" INTEGER NOT NULL,
  "balance_after" INTEGER NOT NULL,
  "status" "CreditReservationStatus" NOT NULL DEFAULT 'RESERVED',
  "ref_type" TEXT,
  "ref_id" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "operator_id" TEXT,
  "note" TEXT,
  "confirmed_at" TIMESTAMP(3),
  "released_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "credit_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "credit_reservations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "credit_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
ALTER TABLE "trace_codes" ADD COLUMN "reservation_id" TEXT;
ALTER TABLE "trace_codes" ADD COLUMN "generation_key" TEXT;
```

- [ ] **Step 3: Add shared ledger reasons**

Change `packages/shared/src/dto/billing.dto.ts`:

```typescript
export const ledgerReasonSchema = z.enum([
  'RECHARGE', 'ALLOCATE_IN', 'ALLOCATE_OUT', 'CONSUME', 'REFUND', 'PURCHASE',
  'RESERVED', 'CONFIRMED', 'RELEASED',
]);
```

- [ ] **Step 4: Verify schema and shared build**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec prisma validate --schema prisma/schema.prisma
corepack pnpm@10.33.2 --filter @nongchang/shared build
```

Expected: both commands exit 0.

## Task 2: Billing Reservation API

**Files:**
- Modify: `packages/backend/src/modules/billing/billing.service.spec.ts`
- Modify: `packages/backend/src/modules/billing/billing.service.ts`

- [ ] **Step 1: Write failing reserve/confirm/release tests**

Add tests for:

```typescript
await svc.reserve(merchant, 'CODE', 5, ref);
await svc.confirmReservation(merchant, 'CODE', ref);
await svc.releaseReservation(merchant, 'CODE', 5, ref);
```

Assertions:

- `RESERVED` decrements balance and is idempotent for the same key.
- `CONFIRMED` writes one zero-delta row and is idempotent.
- `RELEASED` increments balance once and is idempotent.
- releasing without `RESERVED` throws `BadRequestException`.
- confirmed reservations cannot be released, and released reservations cannot be confirmed.

- [ ] **Step 2: Run test to verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/billing/billing.service.spec.ts
```

Expected: FAIL because `reserve`, `confirmReservation`, and `releaseReservation` do not exist.

- [ ] **Step 3: Implement minimal billing reservation methods**

Add `CreditOperationRef` and three public methods:

- `reserve(user, resource, amount, ref)` resolves account, checks existing `CreditReservation`, decrements balance, creates `CreditReservation(status=RESERVED)`, then writes `RESERVED` ledger.
- `confirmReservation(user, resource, ref)` requires the key, requires reservation, rejects already `RELEASED`, updates status to `CONFIRMED`, then writes one zero-delta `CONFIRMED`.
- `releaseReservation(user, resource, amount, ref)` requires the key, requires reservation, rejects already `CONFIRMED`, updates status to `RELEASED`, increments balance, then writes one `RELEASED`.

- [ ] **Step 4: Run billing test to verify GREEN**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/billing/billing.service.spec.ts
```

Expected: PASS.

## Task 3: Trace Code Generation Uses Reservation

**Files:**
- Modify: `packages/backend/src/modules/trace/trace.service.spec.ts`
- Modify: `packages/backend/src/modules/trace/trace.service.ts`

- [ ] **Step 1: Write failing trace tests**

Update `make()` billing mock to:

```typescript
const billing = {
  reserve: vi.fn().mockResolvedValue({ balanceAfter: 0 }),
  confirmReservation: vi.fn().mockResolvedValue({ balanceAfter: 0 }),
  releaseReservation: vi.fn().mockResolvedValue({ balanceAfter: 0 }),
};
```

Update expectations so successful generation calls `reserve` and `confirmReservation`, write failure calls `releaseReservation`, read-after-write failure does not release, and duplicate `Idempotency-Key` returns the already-created codes without reserving or creating again.

- [ ] **Step 2: Run trace test to verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/trace/trace.service.spec.ts
```

Expected: FAIL because `TraceService.generateCodes` still calls `consume/refund`.

- [ ] **Step 3: Implement trace reservation flow**

Change `generateCodes`:

```typescript
const generationKey = `trace.generate:${user.tenantId}:${user.userId}:${batchId}:${count}:${requestKey ?? randomUUID()}`;
if (requestKey) {
  const existingCodes = await this.prisma.traceCode.findMany({
    where: { tenantId: user.tenantId, batchId, generationKey },
    orderBy: { createdAt: 'asc' },
  });
  if (existingCodes.length > 0) return existingCodes;
}
const reservation = await this.billing.reserve(user, 'CODE', count, ref);
try {
  await this.prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM batches WHERE id = ${batchId} FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundException('批次不存在');
    await tx.traceCode.createMany({
      data: codes.map((code) => ({ tenantId: user.tenantId, batchId, code, reservationId: reservation.reservationId, generationKey })),
    });
  });
} catch (err) {
  await this.billing.releaseReservation(user, 'CODE', count, ref);
  throw err;
}
await this.billing.confirmReservation(user, 'CODE', ref);
return this.prisma.traceCode.findMany({ where: { tenantId: user.tenantId, code: { in: codes } } });
```

- [ ] **Step 4: Run trace test to verify GREEN**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/trace/trace.service.spec.ts
```

Expected: PASS.

## Task 4: Verification, Review, and Commit

**Files:**
- Review all modified files.

- [ ] **Step 1: Run full verification gates**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/shared build
corepack pnpm@10.33.2 --filter @nongchang/backend exec prisma validate --schema prisma/schema.prisma
corepack pnpm@10.33.2 --filter @nongchang/backend exec prisma generate --schema prisma/schema.prisma
corepack pnpm@10.33.2 --filter @nongchang/backend exec tsc -p tsconfig.json --noEmit
corepack pnpm@10.33.2 --filter @nongchang/backend build
corepack pnpm@10.33.2 test:unit
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 2: Try e2e gate and record environment status**

Run:

```powershell
corepack pnpm@10.33.2 test:e2e
```

Expected in this environment may remain blocked if local PostgreSQL/PostGIS at `127.0.0.1:5544` is not running. If blocked, record the exact connection error and do not claim e2e passed.

- [ ] **Step 3: Request code review**

Use `superpowers:requesting-code-review` with:

- Description: P4-C converts trace-code generation from consume/refund to reservation/confirmation/release.
- Requirements: this plan and Phase 4 credit reliability acceptance criteria for trace generation.
- Base SHA: `4b1d6a9`
- Head SHA: current `HEAD`.

Fix Critical and Important findings before committing.

- [ ] **Step 4: Commit**

Run:

```powershell
git status --short
git add docs/superpowers/plans/2026-07-06-trace-credit-reservation-p4c.md packages/backend/prisma/schema.prisma packages/backend/prisma/migrations/20260706160000_credit_reservation_reasons/migration.sql packages/shared/src/dto/billing.dto.ts packages/backend/src/modules/billing/billing.service.ts packages/backend/src/modules/billing/billing.service.spec.ts packages/backend/src/modules/trace/trace.service.ts packages/backend/src/modules/trace/trace.service.spec.ts packages/backend/src/modules/trace/trace.controller.ts packages/web/src/api/trace.ts packages/web/src/components/BillingLedger.tsx
git commit -m "fix(billing): reserve trace code credits"
```

Expected: commit succeeds on branch `codex/user-group-permissions-p2b`.

## Self-Review

- Spec coverage: Implements Phase 4 staged path item 3 for trace-code generation, including business-result idempotency for client request keys. AI provider reservation and stale reservation recovery are intentionally later P items, because this P4-C plan is a safe trace-only slice.
- Placeholder scan: No TBD/TODO placeholders are present.
- Type consistency: Method names are `reserve`, `confirmReservation`, and `releaseReservation`; tests and implementation steps use the same names.
