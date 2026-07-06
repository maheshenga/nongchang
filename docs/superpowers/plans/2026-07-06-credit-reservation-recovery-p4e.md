# Credit Reservation Recovery P4-E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an auditable recovery path for stale `RESERVED` credit reservations so failed confirmation/release paths can be found and safely released by an operator.

**Architecture:** Keep recovery out of public product APIs. Add testable `BillingService` methods that list stale reservations and release them by reservation id using compare-and-set updates, then expose those methods through a small `tsx` operator script. Extend the existing read-only audit SQL so operators can inspect both legacy consume/refund mismatches and current reservation state.

**Tech Stack:** NestJS service layer, Prisma Client, Vitest, pnpm 10.33.2, PowerShell-friendly `tsx` script.

---

## Scope Boundary

This P4-E slice implements Phase 4 staged path item 5: stale reservation recovery.

It does not solve AI same-payload retry after a `RELEASED` idempotency key. That needs a later request-key/result-cache or reservation-attempt schema slice because the current schema has uniqueness on `(accountId, resource, idempotencyKey)` and ledger uniqueness on `(accountId, reason, idempotencyKey)`.

## File Structure

- Modify: `packages/backend/src/modules/billing/billing.service.ts`
  - Add `listStaleReservations` and `releaseStaleReservations`.
  - Release by reservation id instead of `AuthUser`, because recovery is an operator/system task over persisted reservations.
- Modify: `packages/backend/src/modules/billing/billing.service.spec.ts`
  - Extend the in-memory Prisma mock for `creditReservation.findMany` and `findUnique`.
  - Cover stale listing, dry-run release, successful release, idempotent skip after another worker releases first, and confirmed reservation refusal.
- Create: `packages/backend/scripts/recover-stale-reservations.ts`
  - Parse `--older-than-minutes`, `--limit`, `--dry-run`, `--resource`, and `--ref-type`.
  - Print JSON recovery results and exit non-zero if item-level errors occur.
- Modify: `packages/backend/package.json`
  - Add `billing:recover-reservations`.
- Modify: `packages/backend/tsconfig.json`
  - Include `scripts` so the recovery script is covered by backend typecheck.
- Modify: `docs/ops/credit-ledger-audit.sql`
  - Add read-only queries for stale `RESERVED` reservations and reservation/ledger mismatches.

## Task 1: Add BillingService Recovery Tests

**Files:**
- Modify: `packages/backend/src/modules/billing/billing.service.spec.ts`

- [ ] **Step 1: Extend the reservation mock**

In `makeService`, change the options type to:

```ts
function makeService(opts: { aiBalance?: number; codeBalance?: number; account?: any; now?: Date } = {}) {
```

Add `createdAt`/`updatedAt` defaults in `creditReservation.create`:

```ts
const now = opts.now ?? new Date('2026-07-06T00:00:00.000Z');
const row = {
  id: `res${reservations.length + 1}`,
  createdAt: now,
  updatedAt: now,
  ...a.data,
};
```

Add methods:

```ts
findMany: async (a: any) => reservations
  .filter((r) => {
    if (a.where?.status && r.status !== a.where.status) return false;
    if (a.where?.resource && r.resource !== a.where.resource) return false;
    if (a.where?.refType && r.refType !== a.where.refType) return false;
    if (a.where?.createdAt?.lt && !(new Date(r.createdAt) < a.where.createdAt.lt)) return false;
    return true;
  })
  .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
  .slice(0, a.take ?? reservations.length)
  .map((r) => ({
    ...r,
    account: { ownerType: accountRow.ownerType, ownerId: accountRow.ownerId },
  })),
findUnique: async (a: any) => {
  const row = reservations.find((r) => r.id === a.where.id);
  return row ? { ...row, account: { ownerType: accountRow.ownerType, ownerId: accountRow.ownerId } } : null;
},
```

- [ ] **Step 2: Add failing recovery tests**

Add these tests to `describe('BillingService reservation model', ...)`:

```ts
it('listStaleReservations returns only old RESERVED rows', async () => {
  const { svc, reservations } = makeService({ codeBalance: 10 });
  reservations.push(
    {
      id: 'old-reserved',
      tenantId: 't1',
      accountId: 'acc1',
      resource: 'CODE',
      amount: 5,
      balanceAfter: 5,
      status: 'RESERVED',
      refType: 'trace.generate',
      refId: 'b1',
      idempotencyKey: 'trace:old',
      operatorId: 'u3',
      note: null,
      createdAt: new Date('2026-07-06T00:00:00.000Z'),
      updatedAt: new Date('2026-07-06T00:00:00.000Z'),
    },
    {
      id: 'fresh-reserved',
      tenantId: 't1',
      accountId: 'acc1',
      resource: 'CODE',
      amount: 2,
      balanceAfter: 8,
      status: 'RESERVED',
      refType: 'trace.generate',
      refId: 'b2',
      idempotencyKey: 'trace:fresh',
      operatorId: 'u3',
      note: null,
      createdAt: new Date('2026-07-06T00:55:00.000Z'),
      updatedAt: new Date('2026-07-06T00:55:00.000Z'),
    },
  );

  const rows = await svc.listStaleReservations({
    olderThanMinutes: 30,
    now: new Date('2026-07-06T01:00:00.000Z'),
  });

  expect(rows.map((row) => row.id)).toEqual(['old-reserved']);
  expect(rows[0]).toMatchObject({
    resource: 'CODE',
    amount: 5,
    refType: 'trace.generate',
    ownerType: 'MERCHANT',
    ownerId: 'm1',
  });
});
```

```ts
it('releaseStaleReservations dry-run reports candidates without changing balance', async () => {
  const { svc, state, ledgers } = makeService({ codeBalance: 10 });
  await svc.reserve(merchant, 'CODE', 5, { refType: 'trace.generate', idempotencyKey: 'trace:dry' });

  const out = await svc.releaseStaleReservations({
    olderThanMinutes: 30,
    now: new Date('2026-07-06T01:00:00.000Z'),
    dryRun: true,
  });

  expect(out).toMatchObject({ scanned: 1, released: 0, skipped: 1, errors: [] });
  expect(state.codeBalance).toBe(5);
  expect(ledgers.filter((ledger) => ledger.reason === 'RELEASED')).toHaveLength(0);
});
```

```ts
it('releaseStaleReservations releases stale RESERVED rows once', async () => {
  const { svc, state, ledgers, reservations } = makeService({ codeBalance: 10 });
  await svc.reserve(merchant, 'CODE', 5, { refType: 'trace.generate', idempotencyKey: 'trace:release' });

  const out = await svc.releaseStaleReservations({
    olderThanMinutes: 30,
    now: new Date('2026-07-06T01:00:00.000Z'),
  });

  expect(out).toMatchObject({ scanned: 1, released: 1, skipped: 0, errors: [] });
  expect(state.codeBalance).toBe(10);
  expect(reservations[0].status).toBe('RELEASED');
  expect(ledgers.find((ledger) => ledger.reason === 'RELEASED')).toMatchObject({
    resource: 'CODE',
    delta: 5,
    idempotencyKey: 'trace:release',
    operatorId: 'system:reservation-recovery',
  });
});
```

```ts
it('releaseStaleReservations skips rows no longer RESERVED', async () => {
  const { svc, state, prisma } = makeService({ codeBalance: 10 });
  await svc.reserve(merchant, 'CODE', 5, { refType: 'trace.generate', idempotencyKey: 'trace:race' });
  prisma.creditReservation.updateMany = async () => ({ count: 0 });

  const out = await svc.releaseStaleReservations({
    olderThanMinutes: 30,
    now: new Date('2026-07-06T01:00:00.000Z'),
  });

  expect(out).toMatchObject({ scanned: 1, released: 0, skipped: 1, errors: [] });
  expect(state.codeBalance).toBe(5);
});
```

- [ ] **Step 3: Run RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/billing/billing.service.spec.ts
```

Expected: FAIL because `listStaleReservations` and `releaseStaleReservations` do not exist.

## Task 2: Implement BillingService Recovery

**Files:**
- Modify: `packages/backend/src/modules/billing/billing.service.ts`

- [ ] **Step 1: Add local recovery types**

Near the existing internal interfaces, add:

```ts
interface StaleReservationQuery {
  olderThanMinutes?: number;
  now?: Date;
  take?: number;
  dryRun?: boolean;
  resource?: CreditResource;
  refType?: string;
}

interface StaleReservationItem {
  id: string;
  tenantId: string;
  accountId: string;
  ownerType: CreditOwnerType;
  ownerId: string;
  resource: CreditResource;
  amount: number;
  balanceAfter: number;
  refType: string | null;
  refId: string | null;
  idempotencyKey: string;
  operatorId: string | null;
  createdAt: string;
}

interface ReservationRecoveryResult {
  scanned: number;
  released: number;
  skipped: number;
  errors: { reservationId: string; message: string }[];
}
```

- [ ] **Step 2: Add cutoff and query helpers**

Inside `BillingService`, add:

```ts
  private staleReservationCutoff(query: StaleReservationQuery): Date {
    const minutes = query.olderThanMinutes ?? 60;
    if (!Number.isFinite(minutes) || minutes <= 0) {
      throw new BadRequestException('olderThanMinutes must be a positive number');
    }
    const now = query.now ?? new Date();
    return new Date(now.getTime() - minutes * 60_000);
  }

  private staleReservationTake(query: StaleReservationQuery): number {
    const take = query.take ?? 100;
    if (!Number.isInteger(take) || take <= 0 || take > 1000) {
      throw new BadRequestException('take must be an integer between 1 and 1000');
    }
    return take;
  }

  private staleReservationWhere(query: StaleReservationQuery) {
    return {
      status: 'RESERVED' as const,
      createdAt: { lt: this.staleReservationCutoff(query) },
      ...(query.resource ? { resource: query.resource } : {}),
      ...(query.refType ? { refType: query.refType } : {}),
    };
  }
```

- [ ] **Step 3: Add listStaleReservations**

Add:

```ts
  async listStaleReservations(query: StaleReservationQuery = {}): Promise<StaleReservationItem[]> {
    const rows = await this.prisma.creditReservation.findMany({
      where: this.staleReservationWhere(query),
      orderBy: { createdAt: 'asc' },
      take: this.staleReservationTake(query),
      select: {
        id: true,
        tenantId: true,
        accountId: true,
        resource: true,
        amount: true,
        balanceAfter: true,
        refType: true,
        refId: true,
        idempotencyKey: true,
        operatorId: true,
        createdAt: true,
        account: { select: { ownerType: true, ownerId: true } },
      },
    });
    return rows.map((row: any) => ({
      id: row.id,
      tenantId: row.tenantId,
      accountId: row.accountId,
      ownerType: row.account.ownerType,
      ownerId: row.account.ownerId,
      resource: row.resource,
      amount: row.amount,
      balanceAfter: row.balanceAfter,
      refType: row.refType,
      refId: row.refId,
      idempotencyKey: row.idempotencyKey,
      operatorId: row.operatorId,
      createdAt: row.createdAt.toISOString(),
    }));
  }
```

- [ ] **Step 4: Add releaseStaleReservations**

Add:

```ts
  async releaseStaleReservations(query: StaleReservationQuery = {}): Promise<ReservationRecoveryResult> {
    const candidates = await this.listStaleReservations(query);
    const result: ReservationRecoveryResult = { scanned: candidates.length, released: 0, skipped: 0, errors: [] };
    if (query.dryRun) {
      result.skipped = candidates.length;
      return result;
    }
    for (const candidate of candidates) {
      try {
        const released = await this.releaseReservedReservationById(candidate.id);
        if (released) result.released += 1;
        else result.skipped += 1;
      } catch (err) {
        result.errors.push({ reservationId: candidate.id, message: err instanceof Error ? err.message : String(err) });
      }
    }
    return result;
  }
```

- [ ] **Step 5: Add private release-by-id helper**

Add:

```ts
  private async releaseReservedReservationById(reservationId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const reservation = await tx.creditReservation.findUnique({
        where: { id: reservationId },
        select: {
          id: true,
          accountId: true,
          resource: true,
          amount: true,
          status: true,
          refType: true,
          refId: true,
          idempotencyKey: true,
        },
      });
      if (!reservation || reservation.status !== 'RESERVED') return false;
      const existingRelease = await tx.creditLedger.findFirst({
        where: { accountId: reservation.accountId, reason: 'RELEASED', idempotencyKey: reservation.idempotencyKey },
        select: { id: true },
      });
      if (existingRelease) {
        throw new BadRequestException('inconsistent reservation: RESERVED row already has RELEASED ledger');
      }
      const flip = await tx.creditReservation.updateMany({
        where: { id: reservation.id, status: 'RESERVED' },
        data: { status: 'RELEASED', releasedAt: new Date() },
      });
      if (flip.count === 0) return false;
      const field = BALANCE_FIELD[reservation.resource as CreditResource];
      await tx.creditAccount.updateMany({
        where: { id: reservation.accountId },
        data: { [field]: { increment: reservation.amount } },
      });
      const after = await tx.creditAccount.findUnique({ where: { id: reservation.accountId } });
      const balanceAfter = (after as any)[field] as number;
      await tx.creditLedger.create({
        data: {
          accountId: reservation.accountId,
          resource: reservation.resource as CreditResource,
          delta: reservation.amount,
          balanceAfter,
          reason: 'RELEASED',
          refType: reservation.refType ?? null,
          refId: reservation.refId ?? null,
          operatorId: 'system:reservation-recovery',
          note: 'stale reservation recovery',
          idempotencyKey: reservation.idempotencyKey,
        },
      });
      return true;
    });
  }
```

- [ ] **Step 6: Run GREEN**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/billing/billing.service.spec.ts
```

Expected: PASS.

## Task 3: Add Operator Script and Audit SQL

**Files:**
- Create: `packages/backend/scripts/recover-stale-reservations.ts`
- Modify: `packages/backend/package.json`
- Modify: `docs/ops/credit-ledger-audit.sql`

- [ ] **Step 1: Create the recovery script**

Create `packages/backend/scripts/recover-stale-reservations.ts`:

```ts
import { PrismaService } from '../src/prisma/prisma.service';
import { BillingService } from '../src/modules/billing/billing.service';
import type { CreditResource } from '@nongchang/shared';

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function numberArg(name: string, fallback: number): number {
  const raw = readArg(name);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number`);
  return value;
}

function resourceArg(): CreditResource | undefined {
  const raw = readArg('resource');
  if (!raw) return undefined;
  if (raw !== 'AI' && raw !== 'CODE') throw new Error('resource must be AI or CODE');
  return raw;
}

async function main() {
  const execute = hasFlag('execute');
  const query = {
    olderThanMinutes: numberArg('older-than-minutes', 60),
    take: numberArg('limit', 100),
    dryRun: !execute,
    resource: resourceArg(),
    refType: readArg('ref-type'),
  };

  if (execute && !query.resource && !query.refType) {
    throw new Error('live recovery requires --resource=AI|CODE or --ref-type=<type>');
  }

  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const billing = new BillingService(prisma);
    const candidates = await billing.listStaleReservations(query);
    const result = await billing.releaseStaleReservations(query);
    console.log(JSON.stringify({
      mode: execute ? 'execute' : 'dry-run',
      filters: {
        olderThanMinutes: query.olderThanMinutes,
        limit: query.take,
        resource: query.resource ?? null,
        refType: query.refType ?? null,
      },
      candidateCount: candidates.length,
      result,
    }, null, 2));
    if (result.errors.length > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
```

- [ ] **Step 2: Add package script**

In `packages/backend/package.json`, add:

```json
"billing:recover-reservations": "tsx scripts/recover-stale-reservations.ts"
```

- [ ] **Step 3: Include scripts in backend typecheck**

In `packages/backend/tsconfig.json`, include scripts:

```json
"include": ["src", "prisma", "test", "scripts"]
```

- [ ] **Step 4: Extend audit SQL**

Append to `docs/ops/credit-ledger-audit.sql`:

```sql
-- Find stale RESERVED reservations that may need operator recovery.
-- Adjust the interval to match the operational SLA for provider calls.

SELECT
  r.id AS reservation_id,
  r.tenant_id,
  r.account_id,
  a.owner_type,
  a.owner_id,
  r.resource,
  r.amount,
  r.balance_after,
  r.ref_type,
  r.ref_id,
  r.idempotency_key,
  r.operator_id,
  r.created_at,
  now() - r.created_at AS reserved_for
FROM credit_reservations r
JOIN credit_accounts a ON a.id = r.account_id
WHERE r.status = 'RESERVED'
  AND r.created_at < now() - interval '60 minutes'
ORDER BY r.created_at ASC;

-- Find reservations whose terminal state has no matching ledger row.

SELECT
  r.id AS reservation_id,
  r.status,
  r.account_id,
  r.resource,
  r.amount,
  r.ref_type,
  r.ref_id,
  r.idempotency_key,
  r.created_at,
  r.updated_at
FROM credit_reservations r
WHERE r.status IN ('CONFIRMED', 'RELEASED')
  AND NOT EXISTS (
    SELECT 1
    FROM credit_ledgers l
    WHERE l.account_id = r.account_id
      AND l.resource = r.resource
      AND l.reason = r.status::text::"LedgerReason"
      AND l.idempotency_key = r.idempotency_key
  )
ORDER BY r.updated_at DESC;
```

Also add audit sections for `RESERVED` rows that already have `CONFIRMED` or `RELEASED` ledgers, and terminal reservations whose matching ledger exists but has the wrong delta or mismatched reference metadata. Use the final contents of `docs/ops/credit-ledger-audit.sql` as the source of truth.

- [ ] **Step 5: Verify script compiles through backend typecheck**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec tsc -p tsconfig.json --noEmit
```

Expected: PASS.

## Task 4: Final Verification, Review, and Commit

**Files:**
- Review all changed files.

- [ ] **Step 1: Run focused regression**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/billing/billing.service.spec.ts src/modules/trace/trace.service.spec.ts src/modules/ai/ai.service.spec.ts
corepack pnpm@10.33.2 --filter @nongchang/backend exec tsc -p tsconfig.json --noEmit
```

Expected: PASS.

- [ ] **Step 2: Run final verification gates**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/shared build
$env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5544/nongchang_test'; corepack pnpm@10.33.2 --filter @nongchang/backend exec prisma validate --schema prisma/schema.prisma
$env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5544/nongchang_test'; corepack pnpm@10.33.2 --filter @nongchang/backend exec prisma generate --schema prisma/schema.prisma
corepack pnpm@10.33.2 --filter @nongchang/backend exec tsc -p tsconfig.json --noEmit
$env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5544/nongchang_test'; corepack pnpm@10.33.2 --filter @nongchang/backend build
corepack pnpm@10.33.2 --filter web lint
$env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5544/nongchang_test'; corepack pnpm@10.33.2 test:unit
git diff --check
$env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5544/nongchang_test'; corepack pnpm@10.33.2 test:e2e
```

Expected:
- All non-e2e commands exit `0`.
- If `test:e2e` is blocked because PostgreSQL/PostGIS is not listening at `127.0.0.1:5544`, record that exact environment blocker and do not claim e2e passed.

- [ ] **Step 3: Request code review**

Ask a reviewer to check:

```text
Review P4-E stale credit reservation recovery. Requirements: stale RESERVED reservations can be listed by age/resource/refType; dry-run reports candidates without mutating balances or ledgers; recovery releases each still-RESERVED row exactly once by CAS, increments the correct account balance, writes a RELEASED ledger with the original idempotency key, skips rows changed by another worker, and does not expose a public API. Also review the operator script and audit SQL for safety.
```

Fix Critical and Important findings before committing.

- [ ] **Step 4: Commit**

Run:

```powershell
git add docs/superpowers/plans/2026-07-06-credit-reservation-recovery-p4e.md docs/ops/credit-ledger-audit.sql packages/backend/package.json packages/backend/tsconfig.json packages/backend/scripts/recover-stale-reservations.ts packages/backend/src/modules/billing/billing.service.ts packages/backend/src/modules/billing/billing.service.spec.ts
git commit -m "fix(billing): recover stale credit reservations"
```

Expected: commit succeeds on branch `codex/user-group-permissions-p2b`.

---

## Self-Review

- Spec coverage: Implements Phase 4 staged path item 5: stale reservations can be found and released by an operator path.
- Placeholder scan: No TBD/TODO placeholders are present.
- Type consistency: Recovery query/result names match across tests, service, and script.
- Scope control: No public API, no schema change, no attempt to solve AI request replay in this slice.
