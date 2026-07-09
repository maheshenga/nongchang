# P11 Batch Model Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract deterministic batch model helpers from `BatchService` so batch creation data, decimal serialization, status progression, cost update data, and list enrichment are directly tested.

**Architecture:** `BatchService` remains responsible for auth scope checks, owner/field validation, Prisma queries, transactions, deletion protection, and lifecycle fetches. A new `batch.model.ts` owns pure data transformations and status validation with no database side effects.

**Tech Stack:** NestJS service, Prisma Decimal, Vitest, TypeScript, existing `@nongchang/shared` `BatchStatus` and DTO types.

## Global Constraints

- Do not change batch controller routes, DTO schemas, query shapes, response shapes, authorization/scope checks, deletion behavior, or lifecycle query order.
- Preserve list default cap: `500`.
- Preserve status order: `PLANTING -> GROWING -> HARVESTED -> DISTRIBUTED`.
- Preserve status validation: only forward jumps are allowed; same-status and backward transitions throw `BadRequestException('非法的状态流转')`.
- Preserve create data fields: `tenantId`, `ownerId`, `fieldId`, `batchNo`, `cropName`, `plantDate`, `expectedHarvest`, `status`.
- Preserve decimal serialization: `laborCost` and `sellPrice` are converted through `Prisma.Decimal(...).toNumber()` when non-null.
- Preserve list enrichment fields: `ownerName`, `codeCount`, `scanTotal`, `inputCost`.
- Preserve empty list enrichment: return `[]` and do not trigger enrichment queries.

---

## File Structure

- Create `packages/backend/src/modules/batch/batch.model.ts`
  - Pure helpers for serialization, create/update data, status progression, and list enrichment.
- Create `packages/backend/src/modules/batch/batch.model.spec.ts`
  - Direct helper tests.
- Modify `packages/backend/src/modules/batch/batch.service.ts`
  - Replace inline helper/data construction logic with imports from `batch.model.ts`.

---

### Task 1: Add Batch Model Tests

**Files:**
- Create: `packages/backend/src/modules/batch/batch.model.spec.ts`

**Interfaces:**
- Future exports:
  - `DEFAULT_BATCH_LIST_CAP: 500`
  - `BATCH_STATUS_ORDER: readonly BatchStatus[]`
  - `serializeBatch<T extends Record<string, any> | null>(batch: T): T`
  - `buildBatchCreateData(input: { tenantId: string; ownerId: string; dto: CreateBatchDto })`
  - `buildBatchCostUpdateData(dto: { laborCost?: number; sellPrice?: number })`
  - `assertBatchStatusProgression(currentStatus: string, nextStatus: string): void`
  - `enrichBatchRows(batches: any[], codeAgg: any[], issues: any[], owners: any[]): any[]`

- [x] **Step 1: Write failing tests**

Use these tests:

```typescript
import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { BatchStatus, type CreateBatchDto } from '@nongchang/shared';
import {
  BATCH_STATUS_ORDER,
  DEFAULT_BATCH_LIST_CAP,
  assertBatchStatusProgression,
  buildBatchCostUpdateData,
  buildBatchCreateData,
  enrichBatchRows,
  serializeBatch,
} from './batch.model';

const dto: CreateBatchDto = {
  ownerId: 'ignored',
  fieldId: 'f1',
  batchNo: 'B1',
  cropName: 'Rice',
  plantDate: '2026-01-01T00:00:00.000Z',
  expectedHarvest: '2026-06-01T00:00:00.000Z',
  status: BatchStatus.PLANTING,
};

describe('batch model helpers', () => {
  it('keeps batch list cap and lifecycle status order stable', () => {
    expect(DEFAULT_BATCH_LIST_CAP).toBe(500);
    expect(BATCH_STATUS_ORDER).toEqual([
      BatchStatus.PLANTING,
      BatchStatus.GROWING,
      BatchStatus.HARVESTED,
      BatchStatus.DISTRIBUTED,
    ]);
  });

  it('serializes decimal money fields without mutating the source row', () => {
    const row = {
      id: 'b1',
      laborCost: new Prisma.Decimal('12.50'),
      sellPrice: new Prisma.Decimal('30.25'),
      cropName: 'Rice',
    };

    const serialized = serializeBatch(row);

    expect(serialized).toEqual({ id: 'b1', laborCost: 12.5, sellPrice: 30.25, cropName: 'Rice' });
    expect(row.laborCost).toBeInstanceOf(Prisma.Decimal);
  });

  it('returns null batch rows unchanged', () => {
    expect(serializeBatch(null)).toBeNull();
  });

  it('builds create data with resolved owner and Date values', () => {
    expect(buildBatchCreateData({ tenantId: 't1', ownerId: 'm1', dto })).toEqual({
      tenantId: 't1',
      ownerId: 'm1',
      fieldId: 'f1',
      batchNo: 'B1',
      cropName: 'Rice',
      plantDate: new Date('2026-01-01T00:00:00.000Z'),
      expectedHarvest: new Date('2026-06-01T00:00:00.000Z'),
      status: BatchStatus.PLANTING,
    });
  });

  it('builds sparse cost update data and preserves zero values', () => {
    expect(buildBatchCostUpdateData({ laborCost: 0 })).toEqual({ laborCost: 0 });
    expect(buildBatchCostUpdateData({ sellPrice: 200 })).toEqual({ sellPrice: 200 });
    expect(buildBatchCostUpdateData({ laborCost: 100, sellPrice: 200 })).toEqual({ laborCost: 100, sellPrice: 200 });
    expect(buildBatchCostUpdateData({})).toEqual({});
  });

  it('allows forward status jumps and rejects same/backward transitions', () => {
    expect(() => assertBatchStatusProgression(BatchStatus.PLANTING, BatchStatus.GROWING)).not.toThrow();
    expect(() => assertBatchStatusProgression(BatchStatus.PLANTING, BatchStatus.HARVESTED)).not.toThrow();
    expect(() => assertBatchStatusProgression(BatchStatus.GROWING, BatchStatus.GROWING)).toThrow('非法的状态流转');
    expect(() => assertBatchStatusProgression(BatchStatus.HARVESTED, BatchStatus.GROWING)).toThrow('非法的状态流转');
  });

  it('enriches list rows with owner, trace counts, scan total, and input cost', () => {
    const out = enrichBatchRows(
      [{ id: 'b1', ownerId: 'm1', laborCost: 0, sellPrice: 0 }],
      [{ batchId: 'b1', _count: { _all: 3 }, _sum: { scanCount: 12 } }],
      [
        { batchId: 'b1', amount: 10, unitPrice: 5 },
        { batchId: 'b1', amount: 2, unitPrice: 3 },
      ],
      [{ id: 'm1', displayName: 'Merchant A' }],
    );

    expect(out).toEqual([
      {
        id: 'b1',
        ownerId: 'm1',
        laborCost: 0,
        sellPrice: 0,
        ownerName: 'Merchant A',
        codeCount: 3,
        scanTotal: 12,
        inputCost: 56,
      },
    ]);
  });

  it('uses null/zero defaults when enrichment data is missing', () => {
    const out = enrichBatchRows([{ id: 'b1', ownerId: 'm1', laborCost: 0, sellPrice: 0 }], [], [], []);

    expect(out[0].ownerName).toBeNull();
    expect(out[0].codeCount).toBe(0);
    expect(out[0].scanTotal).toBe(0);
    expect(out[0].inputCost).toBe(0);
  });
});
```

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/batch/batch.model.spec.ts
```

Expected: FAIL because `./batch.model` does not exist.

---

### Task 2: Implement Batch Model Helpers

**Files:**
- Create: `packages/backend/src/modules/batch/batch.model.ts`

- [x] **Step 1: Implement helpers**

Use the exact current semantics from `BatchService`:

```typescript
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BatchStatus, type CreateBatchDto } from '@nongchang/shared';

export const BATCH_STATUS_ORDER = [
  BatchStatus.PLANTING,
  BatchStatus.GROWING,
  BatchStatus.HARVESTED,
  BatchStatus.DISTRIBUTED,
] as const;

export const DEFAULT_BATCH_LIST_CAP = 500;

export function serializeBatch<T extends Record<string, any> | null>(batch: T): T {
  if (!batch) return batch;
  const out: any = { ...batch };
  if (out.laborCost != null) out.laborCost = new Prisma.Decimal(out.laborCost).toNumber();
  if (out.sellPrice != null) out.sellPrice = new Prisma.Decimal(out.sellPrice).toNumber();
  return out;
}

export function buildBatchCreateData(input: { tenantId: string; ownerId: string; dto: CreateBatchDto }) {
  return {
    tenantId: input.tenantId,
    ownerId: input.ownerId,
    fieldId: input.dto.fieldId,
    batchNo: input.dto.batchNo,
    cropName: input.dto.cropName,
    plantDate: new Date(input.dto.plantDate),
    expectedHarvest: new Date(input.dto.expectedHarvest),
    status: input.dto.status,
  };
}

export function buildBatchCostUpdateData(dto: { laborCost?: number; sellPrice?: number }) {
  return {
    ...(dto.laborCost != null ? { laborCost: dto.laborCost } : {}),
    ...(dto.sellPrice != null ? { sellPrice: dto.sellPrice } : {}),
  };
}

export function assertBatchStatusProgression(currentStatus: string, nextStatus: string): void {
  if (BATCH_STATUS_ORDER.indexOf(nextStatus as BatchStatus) <= BATCH_STATUS_ORDER.indexOf(currentStatus as BatchStatus)) {
    throw new BadRequestException('非法的状态流转');
  }
}

export function enrichBatchRows(batches: any[], codeAgg: any[], issues: any[], owners: any[]) {
  const codeMap = new Map(codeAgg.map((c: any) => [c.batchId, { codeCount: c._count._all, scanTotal: c._sum.scanCount ?? 0 }]));
  const nameMap = new Map(owners.map((o: any) => [o.id, o.displayName]));
  const costMap = new Map<string, Prisma.Decimal>();
  for (const it of issues as any[]) {
    const add = new Prisma.Decimal(it.amount).times(it.unitPrice);
    costMap.set(it.batchId, (costMap.get(it.batchId) ?? new Prisma.Decimal(0)).plus(add));
  }
  return batches.map((batch: any) => ({
    ...batch,
    laborCost: new Prisma.Decimal(batch.laborCost).toNumber(),
    sellPrice: new Prisma.Decimal(batch.sellPrice).toNumber(),
    ownerName: nameMap.get(batch.ownerId) ?? null,
    codeCount: codeMap.get(batch.id)?.codeCount ?? 0,
    scanTotal: codeMap.get(batch.id)?.scanTotal ?? 0,
    inputCost: (costMap.get(batch.id) ?? new Prisma.Decimal(0)).toNumber(),
  }));
}
```

- [x] **Step 2: Run model tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/batch/batch.model.spec.ts
```

Expected: PASS.

---

### Task 3: Wire BatchService

**Files:**
- Modify: `packages/backend/src/modules/batch/batch.service.ts`

- [x] **Step 1: Replace inline pure logic**

Import helpers:

```typescript
import {
  DEFAULT_BATCH_LIST_CAP,
  assertBatchStatusProgression,
  buildBatchCostUpdateData,
  buildBatchCreateData,
  enrichBatchRows,
  serializeBatch,
} from './batch.model';
```

Replace:
- `DEFAULT_LIST_CAP` with `DEFAULT_BATCH_LIST_CAP`.
- Inline `batch.create({ data: ... })` with `buildBatchCreateData({ tenantId: user.tenantId, ownerId, dto })`.
- Inline `STATUS_ORDER.indexOf(...)` with `assertBatchStatusProgression(cur.status, status)`.
- Inline cost update object with `buildBatchCostUpdateData(dto)`.
- Inline `enrich` map construction with `enrichBatchRows(batches, codeAgg, issues, owners)`.

Keep:
- `scope.resolveOwnerId`, `scope.assertInScope`, field ownership query, transaction and delete logic exactly in service.
- `if (batches.length === 0) return []` before enrichment queries.

- [x] **Step 2: Run focused batch tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/batch/batch.model.spec.ts src/modules/batch/batch.service.spec.ts src/modules/batch/batch.controller.spec.ts
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
Review P11 batch model boundary. Ensure no controller/DTO/query/response/scope/delete behavior changed. Verify decimal serialization, create data date conversion, sparse cost update data, status progression guard, list enrichment defaults, and list cap match previous behavior.
```

Commit:

```powershell
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p11-batch-model-boundary.md packages/backend/src/modules/batch/batch.model.ts packages/backend/src/modules/batch/batch.model.spec.ts packages/backend/src/modules/batch/batch.service.ts
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang commit -m "refactor(backend): extract batch model helpers"
```

---

## Self-Review

- Spec coverage: The plan covers decimal serialization, create data, cost update data, status progression, list enrichment, service wiring, focused tests, full verification, review, and commit.
- Placeholder scan: No TBD/TODO placeholders.
- Type consistency: Helper names and signatures are consistent across tasks.
