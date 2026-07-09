# P14 Phenology Model Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract deterministic phenology helpers from `PhenologyService` so stage projection, create/update data, crop baseline aggregation, and deviation alert logic are directly tested.

**Architecture:** `PhenologyService` remains responsible for tenant/scope queries, existence checks, and Prisma writes. A new `phenology.model.ts` owns pure model projection and deviation calculations with no database side effects.

**Tech Stack:** NestJS service, Vitest, TypeScript, existing `@nongchang/shared` phenology DTO and response types.

## Global Constraints

- Do not change phenology controller routes, DTO schemas, query shapes, response shapes, scope filtering, or existence checks.
- Preserve deviation threshold: `7` days.
- Preserve terminal statuses: `Harvested` and `Distributed` do not alert.
- Preserve elapsed day calculation: `Math.max(0, Math.floor((now - plantDate) / 86400000))`.
- Preserve expected total days: sum `expectedDays` by `cropName`.
- Preserve no-baseline behavior: `expectedTotalDays: null`, `deviationDays: null`, `noBaseline: true`, `alert: false`.
- Preserve alert logic: not no-baseline, not terminal, and `deviationDays > 7`.
- Preserve item projection: `createdAt` is ISO string.
- Preserve update data sparse behavior while keeping `0` values.

---

## File Structure

- Create `packages/backend/src/modules/phenology/phenology.model.ts`
  - Pure helpers for item projection, create/update data, expected-day aggregation, and batch deviation calculation.
- Create `packages/backend/src/modules/phenology/phenology.model.spec.ts`
  - Direct helper tests.
- Modify `packages/backend/src/modules/phenology/phenology.service.ts`
  - Replace inline pure logic with imports from `phenology.model.ts`.

---

### Task 1: Add Phenology Model Tests

**Files:**
- Create: `packages/backend/src/modules/phenology/phenology.model.spec.ts`

**Interfaces:**
- Future exports:
  - `DEVIATION_THRESHOLD_DAYS: 7`
  - `TERMINAL_PHENOLOGY_STATUSES: ReadonlySet<string>`
  - `PhenologyRow`
  - `toPhenologyItem(row: PhenologyRow): CropPhenologyItem`
  - `buildPhenologyCreateData(input: { tenantId: string; dto: CreateCropPhenologyDto })`
  - `buildPhenologyUpdateData(dto: UpdateCropPhenologyDto)`
  - `buildExpectedDaysByCrop(rows: Array<{ cropName: string; expectedDays: number }>): Map<string, number>`
  - `buildBatchDeviation(batch: any, expectedDaysByCrop: Map<string, number>, nowMs?: number): BatchDeviation`

- [x] **Step 1: Write failing tests**

Use these tests:

```typescript
import { describe, expect, it } from 'vitest';
import {
  DEVIATION_THRESHOLD_DAYS,
  TERMINAL_PHENOLOGY_STATUSES,
  buildBatchDeviation,
  buildExpectedDaysByCrop,
  buildPhenologyCreateData,
  buildPhenologyUpdateData,
  toPhenologyItem,
} from './phenology.model';

const nowMs = new Date('2026-06-15T00:00:00.000Z').getTime();
const daysAgo = (days: number) => new Date(nowMs - days * 86400000);

describe('phenology model helpers', () => {
  it('keeps deviation threshold and terminal statuses stable', () => {
    expect(DEVIATION_THRESHOLD_DAYS).toBe(7);
    expect(TERMINAL_PHENOLOGY_STATUSES.has('Harvested')).toBe(true);
    expect(TERMINAL_PHENOLOGY_STATUSES.has('Distributed')).toBe(true);
  });

  it('projects phenology rows with ISO createdAt', () => {
    expect(toPhenologyItem({
      id: 'p1',
      tenantId: 't1',
      cropName: 'Rice',
      stage: 'Seedling',
      expectedDays: 12,
      sortOrder: 2,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    })).toEqual({
      id: 'p1',
      tenantId: 't1',
      cropName: 'Rice',
      stage: 'Seedling',
      expectedDays: 12,
      sortOrder: 2,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('builds create data with tenant id', () => {
    expect(buildPhenologyCreateData({
      tenantId: 't1',
      dto: { cropName: 'Rice', stage: 'Seedling', expectedDays: 12, sortOrder: 2 },
    })).toEqual({ tenantId: 't1', cropName: 'Rice', stage: 'Seedling', expectedDays: 12, sortOrder: 2 });
  });

  it('builds sparse update data while preserving zero values', () => {
    expect(buildPhenologyUpdateData({ expectedDays: 0, sortOrder: 0 })).toEqual({
      stage: undefined,
      expectedDays: 0,
      sortOrder: 0,
    });
    expect(buildPhenologyUpdateData({ stage: 'Flowering' })).toEqual({
      stage: 'Flowering',
      expectedDays: undefined,
      sortOrder: undefined,
    });
  });

  it('aggregates expected days by crop name', () => {
    const totals = buildExpectedDaysByCrop([
      { cropName: 'Rice', expectedDays: 10 },
      { cropName: 'Rice', expectedDays: 20 },
      { cropName: 'Wheat', expectedDays: 15 },
    ]);

    expect(totals.get('Rice')).toBe(30);
    expect(totals.get('Wheat')).toBe(15);
  });

  it('builds alerting deviations when elapsed days exceed baseline by threshold', () => {
    const deviation = buildBatchDeviation(
      { id: 'b1', batchNo: 'B1', cropName: 'Rice', status: 'Growing', plantDate: daysAgo(100) },
      new Map([['Rice', 90]]),
      nowMs,
    );

    expect(deviation).toMatchObject({
      batchId: 'b1',
      batchNo: 'B1',
      cropName: 'Rice',
      status: 'Growing',
      elapsedDays: 100,
      expectedTotalDays: 90,
      deviationDays: 10,
      noBaseline: false,
      alert: true,
    });
    expect(deviation.plantDate).toBe(daysAgo(100).toISOString());
  });

  it('does not alert at or below the deviation threshold', () => {
    const deviation = buildBatchDeviation(
      { id: 'b1', batchNo: 'B1', cropName: 'Rice', status: 'Growing', plantDate: daysAgo(97) },
      new Map([['Rice', 90]]),
      nowMs,
    );

    expect(deviation.deviationDays).toBe(7);
    expect(deviation.alert).toBe(false);
  });

  it('does not alert terminal batches even when deviation is high', () => {
    const deviation = buildBatchDeviation(
      { id: 'b1', batchNo: 'B1', cropName: 'Rice', status: 'Harvested', plantDate: daysAgo(200) },
      new Map([['Rice', 90]]),
      nowMs,
    );

    expect(deviation.deviationDays).toBe(110);
    expect(deviation.alert).toBe(false);
  });

  it('marks noBaseline when crop phenology is missing', () => {
    const deviation = buildBatchDeviation(
      { id: 'b1', batchNo: 'B1', cropName: 'Unknown', status: 'Growing', plantDate: daysAgo(200) },
      new Map([['Rice', 90]]),
      nowMs,
    );

    expect(deviation.expectedTotalDays).toBeNull();
    expect(deviation.deviationDays).toBeNull();
    expect(deviation.noBaseline).toBe(true);
    expect(deviation.alert).toBe(false);
  });
});
```

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/phenology/phenology.model.spec.ts
```

Expected: FAIL because `./phenology.model` does not exist.

---

### Task 2: Implement Phenology Model Helpers

**Files:**
- Create: `packages/backend/src/modules/phenology/phenology.model.ts`

- [x] **Step 1: Implement helpers**

Use the exact current service semantics:

```typescript
import type {
  BatchDeviation,
  CreateCropPhenologyDto,
  CropPhenologyItem,
  UpdateCropPhenologyDto,
} from '@nongchang/shared';

export const DEVIATION_THRESHOLD_DAYS = 7;
export const TERMINAL_PHENOLOGY_STATUSES = new Set(['Harvested', 'Distributed']);
const DAY_MS = 86400000;

export interface PhenologyRow {
  id: string;
  tenantId: string;
  cropName: string;
  stage: string;
  expectedDays: number;
  sortOrder: number;
  createdAt: Date;
}

export function toPhenologyItem(row: PhenologyRow): CropPhenologyItem {
  return {
    id: row.id,
    tenantId: row.tenantId,
    cropName: row.cropName,
    stage: row.stage,
    expectedDays: row.expectedDays,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
  };
}

export function buildPhenologyCreateData(input: { tenantId: string; dto: CreateCropPhenologyDto }) {
  return {
    tenantId: input.tenantId,
    cropName: input.dto.cropName,
    stage: input.dto.stage,
    expectedDays: input.dto.expectedDays,
    sortOrder: input.dto.sortOrder,
  };
}

export function buildPhenologyUpdateData(dto: UpdateCropPhenologyDto) {
  return {
    stage: dto.stage ?? undefined,
    expectedDays: dto.expectedDays ?? undefined,
    sortOrder: dto.sortOrder ?? undefined,
  };
}

export function buildExpectedDaysByCrop(rows: Array<{ cropName: string; expectedDays: number }>): Map<string, number> {
  const totalByCrop = new Map<string, number>();
  for (const row of rows) {
    totalByCrop.set(row.cropName, (totalByCrop.get(row.cropName) ?? 0) + row.expectedDays);
  }
  return totalByCrop;
}

export function buildBatchDeviation(batch: any, expectedDaysByCrop: Map<string, number>, nowMs = Date.now()): BatchDeviation {
  const elapsedDays = Math.max(0, Math.floor((nowMs - new Date(batch.plantDate).getTime()) / DAY_MS));
  const expectedTotalDays = expectedDaysByCrop.has(batch.cropName) ? (expectedDaysByCrop.get(batch.cropName) as number) : null;
  const noBaseline = expectedTotalDays == null;
  const deviationDays = noBaseline ? null : elapsedDays - (expectedTotalDays as number);
  const alert = !noBaseline
    && !TERMINAL_PHENOLOGY_STATUSES.has(batch.status)
    && (deviationDays as number) > DEVIATION_THRESHOLD_DAYS;
  return {
    batchId: batch.id,
    batchNo: batch.batchNo,
    cropName: batch.cropName,
    status: batch.status,
    plantDate: new Date(batch.plantDate).toISOString(),
    elapsedDays,
    expectedTotalDays,
    deviationDays,
    noBaseline,
    alert,
  };
}
```

- [x] **Step 2: Run model tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/phenology/phenology.model.spec.ts
```

Expected: PASS.

---

### Task 3: Wire PhenologyService

**Files:**
- Modify: `packages/backend/src/modules/phenology/phenology.service.ts`

- [x] **Step 1: Replace inline pure logic**

Import helpers:

```typescript
import {
  PhenologyRow,
  buildBatchDeviation,
  buildExpectedDaysByCrop,
  buildPhenologyCreateData,
  buildPhenologyUpdateData,
  toPhenologyItem,
} from './phenology.model';
```

Replace:
- `toItem` with `toPhenologyItem`.
- Inline create data with `buildPhenologyCreateData({ tenantId: user.tenantId, dto })`.
- Inline update data with `buildPhenologyUpdateData(dto)`.
- Inline expected-days aggregation with `buildExpectedDaysByCrop(phenologies)`.
- Inline batch deviation map with `batches.map(batch => buildBatchDeviation(batch, totalByCrop))`.

Keep:
- Tenant filter and ordering in `list`.
- Existence checks and `ForbiddenException` messages in `update`/`remove`.
- Scope query in `deviations`.
- Early return `[]` when there are no batches.

- [x] **Step 2: Run focused phenology tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/phenology/phenology.model.spec.ts src/modules/phenology/phenology.service.spec.ts
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
Review P14 phenology model boundary. Ensure no controller/DTO/query/response/scope behavior changed. Verify item projection, create/update data, expected-day aggregation, no-baseline behavior, terminal-status suppression, threshold alert logic, elapsed-day calculation, and early empty-batch return match previous behavior.
```

Commit:

```powershell
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p14-phenology-model-boundary.md packages/backend/src/modules/phenology/phenology.model.ts packages/backend/src/modules/phenology/phenology.model.spec.ts packages/backend/src/modules/phenology/phenology.service.ts
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang commit -m "refactor(backend): extract phenology model helpers"
```

---

## Self-Review

- Spec coverage: The plan covers item projection, create/update data, expected-day aggregation, deviation calculation, no-baseline behavior, terminal status suppression, focused tests, full verification, review, and commit.
- Placeholder scan: No TBD/TODO placeholders.
- Type consistency: Helper names and signatures are consistent across tasks.
