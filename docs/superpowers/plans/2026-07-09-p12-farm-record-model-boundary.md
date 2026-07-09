# P12 Farm Record Model Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract deterministic farm-record helpers from `FarmRecordService` so record create data, supply quota checks, Decimal serialization, and list owner enrichment are directly tested.

**Architecture:** `FarmRecordService` remains responsible for scope checks, batch/field/supply ownership queries, Prisma transactions, row locks, and database writes. A new `farm-record.model.ts` owns pure data transformations and quota-threshold validation with no database side effects.

**Tech Stack:** NestJS service, Prisma Decimal, Vitest, TypeScript, existing `@nongchang/shared` farm-record DTO types.

## Global Constraints

- Do not change farm-record controller routes, DTO schemas, query shapes, response shapes, scope checks, transaction order, row-lock order, or supply ownership checks.
- Preserve create data fields: `tenantId`, `batchId`, `fieldId`, `operatorId`, `action`, `detail`, `images`, `location`, `recordedAt`, `source`, `status`, `supplyId`, `supplyAmount`.
- Preserve default status: `completed`.
- Preserve optional payload behavior: `detail` and `images` become `undefined` when missing; `location` becomes `null` when missing.
- Preserve supply quota path condition: only when `dto.supplyId` is truthy and `dto.supplyAmount != null`.
- Preserve quota fuse: actual cumulative usage greater than 110% of issued quota throws `BadRequestException('实际用量超过领用配额 110%,核销熔断')`.
- Preserve Decimal serialization: `supplyAmount` returns as number when non-null, otherwise `null`.
- Preserve list owner enrichment: records map `batchId -> ownerId -> displayName`, missing owner name returns `null`.

---

## File Structure

- Create `packages/backend/src/modules/farm-record/farm-record.model.ts`
  - Pure helpers for serialization, create data, quota-path detection, quota fuse, and owner-name enrichment.
- Create `packages/backend/src/modules/farm-record/farm-record.model.spec.ts`
  - Direct helper tests.
- Modify `packages/backend/src/modules/farm-record/farm-record.service.ts`
  - Replace inline pure logic with imports from `farm-record.model.ts`.

---

### Task 1: Add Farm Record Model Tests

**Files:**
- Create: `packages/backend/src/modules/farm-record/farm-record.model.spec.ts`

**Interfaces:**
- Future exports:
  - `serializeFarmRecord<T extends { supplyAmount: Prisma.Decimal | number | null }>(record: T)`
  - `buildFarmRecordCreateData(input: { tenantId: string; operatorId: string; dto: CreateFarmRecordDto })`
  - `shouldApplySupplyQuota(dto: Pick<CreateFarmRecordDto, 'supplyId' | 'supplyAmount'>): boolean`
  - `assertSupplyQuotaWithinLimit(input: { quota: Prisma.Decimal | number; consumed: Prisma.Decimal | number; requested: Prisma.Decimal | number }): void`
  - `enrichFarmRecordRows(items: any[], batches: any[], owners: any[]): any[]`

- [x] **Step 1: Write failing tests**

Use these tests:

```typescript
import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import type { CreateFarmRecordDto } from '@nongchang/shared';
import {
  assertSupplyQuotaWithinLimit,
  buildFarmRecordCreateData,
  enrichFarmRecordRows,
  serializeFarmRecord,
  shouldApplySupplyQuota,
} from './farm-record.model';

const dto: CreateFarmRecordDto = {
  batchId: 'b1',
  fieldId: 'f1',
  action: 'fertilize',
  recordedAt: '2026-01-02T00:00:00.000Z',
  source: 'manual',
};

describe('farm record model helpers', () => {
  it('serializes supplyAmount Decimal to number without mutating the source row', () => {
    const row = { id: 'r1', supplyAmount: new Prisma.Decimal('12.5') };
    const out = serializeFarmRecord(row);

    expect(out).toEqual({ id: 'r1', supplyAmount: 12.5 });
    expect(row.supplyAmount).toBeInstanceOf(Prisma.Decimal);
  });

  it('keeps null supplyAmount as null', () => {
    expect(serializeFarmRecord({ id: 'r1', supplyAmount: null })).toEqual({ id: 'r1', supplyAmount: null });
  });

  it('builds create data with defaults and optional payload fallbacks', () => {
    expect(buildFarmRecordCreateData({ tenantId: 't1', operatorId: 'op1', dto })).toEqual({
      tenantId: 't1',
      batchId: 'b1',
      fieldId: 'f1',
      operatorId: 'op1',
      action: 'fertilize',
      detail: undefined,
      images: undefined,
      location: null,
      recordedAt: new Date('2026-01-02T00:00:00.000Z'),
      source: 'manual',
      status: 'completed',
      supplyId: undefined,
      supplyAmount: undefined,
    });
  });

  it('builds create data with explicit status and supply fields', () => {
    const out = buildFarmRecordCreateData({
      tenantId: 't1',
      operatorId: 'op1',
      dto: {
        ...dto,
        status: 'pending',
        detail: { weather: 'sunny' },
        images: ['a.png'],
        location: 'field-a',
        supplyId: 's1',
        supplyAmount: 0,
      },
    });

    expect(out.status).toBe('pending');
    expect(out.detail).toEqual({ weather: 'sunny' });
    expect(out.images).toEqual(['a.png']);
    expect(out.location).toBe('field-a');
    expect(out.supplyId).toBe('s1');
    expect(out.supplyAmount).toBe(0);
  });

  it('detects quota path only when supplyId exists and supplyAmount is not nullish', () => {
    expect(shouldApplySupplyQuota({ supplyId: 's1', supplyAmount: 0 })).toBe(true);
    expect(shouldApplySupplyQuota({ supplyId: 's1', supplyAmount: 1 })).toBe(true);
    expect(shouldApplySupplyQuota({ supplyId: 's1' })).toBe(false);
    expect(shouldApplySupplyQuota({ supplyAmount: 1 })).toBe(false);
    expect(shouldApplySupplyQuota({ supplyId: '', supplyAmount: 1 })).toBe(false);
  });

  it('allows usage up to 110 percent of issued quota and rejects beyond it', () => {
    expect(() => assertSupplyQuotaWithinLimit({ quota: 100, consumed: 90, requested: 20 })).not.toThrow();
    expect(() => assertSupplyQuotaWithinLimit({ quota: 100, consumed: 90, requested: 20.01 })).toThrow('实际用量超过领用配额 110%,核销熔断');
  });

  it('enriches rows with owner names through batch owner mapping', () => {
    const out = enrichFarmRecordRows(
      [{ id: 'r1', batchId: 'b1', supplyAmount: new Prisma.Decimal('2.5') }],
      [{ id: 'b1', ownerId: 'm1' }],
      [{ id: 'm1', displayName: 'Merchant A' }],
    );

    expect(out).toEqual([{ id: 'r1', batchId: 'b1', supplyAmount: 2.5, ownerName: 'Merchant A' }]);
  });

  it('uses null ownerName when batch or owner is missing', () => {
    const out = enrichFarmRecordRows([{ id: 'r1', batchId: 'b1', supplyAmount: null }], [], []);

    expect(out).toEqual([{ id: 'r1', batchId: 'b1', supplyAmount: null, ownerName: null }]);
  });
});
```

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/farm-record/farm-record.model.spec.ts
```

Expected: FAIL because `./farm-record.model` does not exist.

---

### Task 2: Implement Farm Record Model Helpers

**Files:**
- Create: `packages/backend/src/modules/farm-record/farm-record.model.ts`

- [x] **Step 1: Implement helpers**

Use the exact current service semantics:

```typescript
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CreateFarmRecordDto } from '@nongchang/shared';

export function serializeFarmRecord<T extends { supplyAmount: Prisma.Decimal | number | null }>(record: T) {
  return { ...record, supplyAmount: record.supplyAmount != null ? new Prisma.Decimal(record.supplyAmount).toNumber() : null };
}

export function buildFarmRecordCreateData(input: { tenantId: string; operatorId: string; dto: CreateFarmRecordDto }) {
  return {
    tenantId: input.tenantId,
    batchId: input.dto.batchId,
    fieldId: input.dto.fieldId,
    operatorId: input.operatorId,
    action: input.dto.action,
    detail: (input.dto.detail ?? undefined) as Prisma.InputJsonValue | undefined,
    images: (input.dto.images ?? undefined) as Prisma.InputJsonValue | undefined,
    location: input.dto.location ?? null,
    recordedAt: new Date(input.dto.recordedAt),
    source: input.dto.source,
    status: input.dto.status ?? 'completed',
    supplyId: input.dto.supplyId ?? undefined,
    supplyAmount: input.dto.supplyAmount ?? undefined,
  };
}

export function shouldApplySupplyQuota(dto: Pick<CreateFarmRecordDto, 'supplyId' | 'supplyAmount'>): boolean {
  return Boolean(dto.supplyId && dto.supplyAmount != null);
}

export function assertSupplyQuotaWithinLimit(input: { quota: Prisma.Decimal | number; consumed: Prisma.Decimal | number; requested: Prisma.Decimal | number }): void {
  const quota = new Prisma.Decimal(input.quota);
  const consumed = new Prisma.Decimal(input.consumed);
  if (consumed.plus(input.requested).greaterThan(quota.times(1.1))) {
    throw new BadRequestException('实际用量超过领用配额 110%,核销熔断');
  }
}

export function enrichFarmRecordRows(items: any[], batches: any[], owners: any[]) {
  const batchOwner = new Map(batches.map((batch: any) => [batch.id, batch.ownerId]));
  const nameMap = new Map(owners.map((owner: any) => [owner.id, owner.displayName]));
  return items.map((record: any) => ({
    ...serializeFarmRecord(record),
    ownerName: nameMap.get(batchOwner.get(record.batchId) as string) ?? null,
  }));
}
```

- [x] **Step 2: Run model tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/farm-record/farm-record.model.spec.ts
```

Expected: PASS.

---

### Task 3: Wire FarmRecordService

**Files:**
- Modify: `packages/backend/src/modules/farm-record/farm-record.service.ts`

- [x] **Step 1: Replace inline pure logic**

Import helpers:

```typescript
import {
  assertSupplyQuotaWithinLimit,
  buildFarmRecordCreateData,
  enrichFarmRecordRows,
  serializeFarmRecord,
  shouldApplySupplyQuota,
} from './farm-record.model';
```

Replace:
- Private `serialize(...)` with `serializeFarmRecord(...)`.
- Inline create `data` object with `buildFarmRecordCreateData({ tenantId: user.tenantId, operatorId: user.userId, dto })`.
- `if (dto.supplyId && dto.supplyAmount != null)` with `if (shouldApplySupplyQuota(dto))`.
- Inline quota Decimal math with `assertSupplyQuotaWithinLimit({ quota: quotaAgg._sum.amount ?? 0, consumed: consumedAgg._sum.supplyAmount ?? 0, requested: dto.supplyAmount! })`.
- Inline list owner enrichment map with `enrichFarmRecordRows(items, batches, owners)`.

Keep:
- All scope checks.
- Batch/field/supply ownership queries.
- Row lock order: batch row lock first, supply row lock second.
- Transaction boundaries and Prisma aggregate queries.

- [x] **Step 2: Run focused farm-record tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/farm-record/farm-record.model.spec.ts src/modules/farm-record/farm-record.service.spec.ts src/modules/farm-record/farm-record.controller.spec.ts
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
Review P12 farm-record model boundary. Ensure no controller/DTO/query/response/scope/transaction behavior changed. Verify create data defaults, optional payload handling, quota path detection, 110% Decimal fuse, supplyAmount serialization, ownerName enrichment, and row-lock order match previous behavior.
```

Commit:

```powershell
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p12-farm-record-model-boundary.md packages/backend/src/modules/farm-record/farm-record.model.ts packages/backend/src/modules/farm-record/farm-record.model.spec.ts packages/backend/src/modules/farm-record/farm-record.service.ts
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang commit -m "refactor(backend): extract farm record model helpers"
```

---

## Self-Review

- Spec coverage: The plan covers create data, optional payloads, quota path detection, quota fuse, serialization, list owner enrichment, service wiring, focused tests, full verification, review, and commit.
- Placeholder scan: No TBD/TODO placeholders.
- Type consistency: Helper names and signatures are consistent across tasks.
