# P13 Supply Model Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract deterministic supply inventory helpers from `SupplyService` so stock projection, create data, issue update guards, issue ledger data, and issue response math are directly tested.

**Architecture:** `SupplyService` remains responsible for scope checks, owner resolution, batch ownership validation, Prisma transactions, row locking, and delete guards. A new `supply.model.ts` owns pure Decimal math and data-shaping helpers with no database side effects.

**Tech Stack:** NestJS service, Prisma Decimal, Vitest, TypeScript, existing `@nongchang/shared` supply DTO types.

## Global Constraints

- Do not change supply controller routes, DTO schemas, query shapes, response shapes, scope checks, transaction order, row-lock order, or delete guard behavior.
- Preserve low-stock threshold: `10`.
- Preserve list default cap: `500`.
- Preserve `SupplyItem` projection: `id`, `name`, `unit`, numeric `total`, numeric `used`, numeric `remaining`, boolean `alert`, ISO `createdAt`.
- Preserve alert logic: `remaining < 10`.
- Preserve create data fields: `tenantId`, `ownerId`, `name`, `unit`, `total: input.amount`, `used: 0`.
- Preserve issue guard condition: update only when `used <= total - input.amount`.
- Preserve issue ledger data fields: `tenantId`, `ownerId`, `supplyId`, `batchId`, `amount`, `unitPrice: input.unitPrice ?? 0`.
- Preserve issue response: `{ supplyId, used, remaining }` with Decimal math.

---

## File Structure

- Create `packages/backend/src/modules/supply/supply.model.ts`
  - Pure helpers for Decimal conversion, item projection, create data, issue update where/data, issue ledger data, and issue response.
- Create `packages/backend/src/modules/supply/supply.model.spec.ts`
  - Direct helper tests.
- Modify `packages/backend/src/modules/supply/supply.service.ts`
  - Replace inline helper/data construction logic with imports from `supply.model.ts`.

---

### Task 1: Add Supply Model Tests

**Files:**
- Create: `packages/backend/src/modules/supply/supply.model.spec.ts`

**Interfaces:**
- Future exports:
  - `LOW_STOCK_THRESHOLD: 10`
  - `DEFAULT_SUPPLY_LIST_CAP: 500`
  - `SupplyRow`
  - `toSupplyItem(row: SupplyRow): SupplyItem`
  - `buildSupplyCreateData(input: { tenantId: string; ownerId: string; input: CreateSupplyInput })`
  - `buildSupplyIssueUpdate(input: { supplyId: string; total: Prisma.Decimal | number; amount: number })`
  - `buildSupplyIssueCreateData(input: { tenantId: string; ownerId: string; supplyId: string; batchId: string; issue: IssueSupplyInput })`
  - `toSupplyIssueResponse(supplyId: string, row: { total: Prisma.Decimal | number; used: Prisma.Decimal | number }): SupplyIssueResponse`

- [x] **Step 1: Write failing tests**

Use these tests:

```typescript
import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_SUPPLY_LIST_CAP,
  LOW_STOCK_THRESHOLD,
  buildSupplyCreateData,
  buildSupplyIssueCreateData,
  buildSupplyIssueUpdate,
  toSupplyIssueResponse,
  toSupplyItem,
} from './supply.model';

describe('supply model helpers', () => {
  it('keeps list cap and low-stock threshold stable', () => {
    expect(DEFAULT_SUPPLY_LIST_CAP).toBe(500);
    expect(LOW_STOCK_THRESHOLD).toBe(10);
  });

  it('projects supply rows with numeric Decimal fields and ISO createdAt', () => {
    const item = toSupplyItem({
      id: 's1',
      name: 'Fertilizer',
      unit: 'bag',
      total: new Prisma.Decimal('100.5'),
      used: new Prisma.Decimal('95.25'),
      createdAt: new Date('2026-06-14T10:00:00.000Z'),
    });

    expect(item).toEqual({
      id: 's1',
      name: 'Fertilizer',
      unit: 'bag',
      total: 100.5,
      used: 95.25,
      remaining: 5.25,
      alert: true,
      createdAt: '2026-06-14T10:00:00.000Z',
    });
  });

  it('does not alert when remaining equals the threshold', () => {
    const item = toSupplyItem({
      id: 's1',
      name: 'Fertilizer',
      unit: 'bag',
      total: new Prisma.Decimal(100),
      used: new Prisma.Decimal(90),
      createdAt: new Date('2026-06-14T10:00:00.000Z'),
    });

    expect(item.remaining).toBe(10);
    expect(item.alert).toBe(false);
  });

  it('builds supply create data with owner and zero used amount', () => {
    expect(buildSupplyCreateData({
      tenantId: 't1',
      ownerId: 'm1',
      input: { name: 'Seed', unit: 'kg', amount: 50 },
    })).toEqual({
      tenantId: 't1',
      ownerId: 'm1',
      name: 'Seed',
      unit: 'kg',
      total: 50,
      used: 0,
    });
  });

  it('builds conditional issue update with Decimal-safe remaining guard', () => {
    const update = buildSupplyIssueUpdate({ supplyId: 's1', total: new Prisma.Decimal('100.5'), amount: 30 });

    expect(update.data).toEqual({ used: { increment: 30 } });
    expect(update.where.id).toBe('s1');
    expect(update.where.used.lte).toBeInstanceOf(Prisma.Decimal);
    expect(update.where.used.lte.toString()).toBe('70.5');
  });

  it('builds issue ledger data and defaults unitPrice to zero', () => {
    expect(buildSupplyIssueCreateData({
      tenantId: 't1',
      ownerId: 'm1',
      supplyId: 's1',
      batchId: 'b1',
      issue: { batchId: 'b1', amount: 30 },
    })).toEqual({
      tenantId: 't1',
      ownerId: 'm1',
      supplyId: 's1',
      batchId: 'b1',
      amount: 30,
      unitPrice: 0,
    });
  });

  it('preserves explicit issue unitPrice zero and positive values', () => {
    expect(buildSupplyIssueCreateData({
      tenantId: 't1',
      ownerId: 'm1',
      supplyId: 's1',
      batchId: 'b1',
      issue: { batchId: 'b1', amount: 30, unitPrice: 0 },
    }).unitPrice).toBe(0);
    expect(buildSupplyIssueCreateData({
      tenantId: 't1',
      ownerId: 'm1',
      supplyId: 's1',
      batchId: 'b1',
      issue: { batchId: 'b1', amount: 30, unitPrice: 2.5 },
    }).unitPrice).toBe(2.5);
  });

  it('builds issue response with numeric used and remaining values', () => {
    expect(toSupplyIssueResponse('s1', {
      total: new Prisma.Decimal(100),
      used: new Prisma.Decimal(45.5),
    })).toEqual({ supplyId: 's1', used: 45.5, remaining: 54.5 });
  });
});
```

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/supply/supply.model.spec.ts
```

Expected: FAIL because `./supply.model` does not exist.

---

### Task 2: Implement Supply Model Helpers

**Files:**
- Create: `packages/backend/src/modules/supply/supply.model.ts`

- [x] **Step 1: Implement helpers**

Use the exact current service semantics:

```typescript
import { Prisma } from '@prisma/client';
import type { CreateSupplyInput, IssueSupplyInput, SupplyIssueResponse, SupplyItem } from '@nongchang/shared';

export const LOW_STOCK_THRESHOLD = 10;
export const DEFAULT_SUPPLY_LIST_CAP = 500;

type DecimalLike = Prisma.Decimal | number;
const dec = (value: DecimalLike) => new Prisma.Decimal(value);

export interface SupplyRow {
  id: string;
  name: string;
  unit: string;
  total: Prisma.Decimal | number;
  used: Prisma.Decimal | number;
  createdAt: Date;
}

export function toSupplyItem(row: SupplyRow): SupplyItem {
  const remaining = dec(row.total).minus(row.used);
  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
    total: dec(row.total).toNumber(),
    used: dec(row.used).toNumber(),
    remaining: remaining.toNumber(),
    alert: remaining.lessThan(LOW_STOCK_THRESHOLD),
    createdAt: row.createdAt.toISOString(),
  };
}

export function buildSupplyCreateData(input: { tenantId: string; ownerId: string; input: CreateSupplyInput }) {
  return {
    tenantId: input.tenantId,
    ownerId: input.ownerId,
    name: input.input.name,
    unit: input.input.unit,
    total: input.input.amount,
    used: 0,
  };
}

export function buildSupplyIssueUpdate(input: { supplyId: string; total: Prisma.Decimal | number; amount: number }) {
  return {
    where: { id: input.supplyId, used: { lte: dec(input.total).minus(input.amount) } },
    data: { used: { increment: input.amount } },
  };
}

export function buildSupplyIssueCreateData(input: {
  tenantId: string;
  ownerId: string;
  supplyId: string;
  batchId: string;
  issue: IssueSupplyInput;
}) {
  return {
    tenantId: input.tenantId,
    ownerId: input.ownerId,
    supplyId: input.supplyId,
    batchId: input.batchId,
    amount: input.issue.amount,
    unitPrice: input.issue.unitPrice ?? 0,
  };
}

export function toSupplyIssueResponse(supplyId: string, row: { total: Prisma.Decimal | number; used: Prisma.Decimal | number }): SupplyIssueResponse {
  return {
    supplyId,
    used: dec(row.used).toNumber(),
    remaining: dec(row.total).minus(row.used).toNumber(),
  };
}
```

- [x] **Step 2: Run model tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/supply/supply.model.spec.ts
```

Expected: PASS.

---

### Task 3: Wire SupplyService

**Files:**
- Modify: `packages/backend/src/modules/supply/supply.service.ts`

- [x] **Step 1: Replace inline pure logic**

Import helpers:

```typescript
import {
  DEFAULT_SUPPLY_LIST_CAP,
  SupplyRow,
  buildSupplyCreateData,
  buildSupplyIssueCreateData,
  buildSupplyIssueUpdate,
  toSupplyIssueResponse,
  toSupplyItem,
} from './supply.model';
```

Replace:
- `DEFAULT_LIST_CAP` with `DEFAULT_SUPPLY_LIST_CAP`.
- `toItem` mapping with `toSupplyItem`.
- Inline supply create data with `buildSupplyCreateData({ tenantId: user.tenantId, ownerId, input })`.
- Inline `updateMany` where/data with `buildSupplyIssueUpdate({ supplyId: id, total: sup.total, amount: input.amount })`.
- Inline `supplyIssue.create` data with `buildSupplyIssueCreateData({ tenantId: user.tenantId, ownerId: sup.ownerId, supplyId: id, batchId: input.batchId, issue: input })`.
- Inline issue response with `toSupplyIssueResponse(id, result)`.

Keep:
- `ownedScopeWhere` and owner fail-closed check in service.
- `scopedSupply` logic and Forbidden error.
- Batch ownership query and Forbidden error.
- Transaction boundary and batch row lock order.
- Delete guard count and error.

- [x] **Step 2: Run focused supply tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/supply/supply.model.spec.ts src/modules/supply/supply.service.spec.ts src/modules/supply/supply.controller.spec.ts
```

Expected: PASS.

---

### Task 4: Verify and Review

Run verification serially:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend build
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit
git -c safe.directory=E:/code/nongchang diff --check
```

Review scope:

```text
Review P13 supply model boundary. Ensure no controller/DTO/query/response/scope/transaction/delete behavior changed. Verify SupplyItem Decimal projection, alert threshold, create data, issue update guard, issue ledger data, issue response math, list cap, and row-lock order match previous behavior.
```

Commit:

```powershell
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p13-supply-model-boundary.md packages/backend/src/modules/supply/supply.model.ts packages/backend/src/modules/supply/supply.model.spec.ts packages/backend/src/modules/supply/supply.service.ts
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang commit -m "refactor(backend): extract supply model helpers"
```

---

## Self-Review

- Spec coverage: The plan covers item projection, thresholds, create data, issue update guard, issue ledger data, issue response, service wiring, focused tests, full verification, review, and commit.
- Placeholder scan: No TBD/TODO placeholders.
- Type consistency: Helper names and signatures are consistent across tasks.
