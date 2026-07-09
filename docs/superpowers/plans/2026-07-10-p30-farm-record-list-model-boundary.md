# P30 Farm Record List Model Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract `FarmRecordService.list()` deterministic list query, pagination, owner lookup, and response envelope logic into `farm-record.model.ts` while preserving API and permission behavior.

**Architecture:** Keep scope checks, Prisma calls, and transactions in `FarmRecordService`. Move pure construction helpers into `farm-record.model.ts`: list `where`, `findMany` args, owner lookup filters, id extraction, and paginated response projection.

**Tech Stack:** NestJS service, Prisma-style args, Vitest, shared `AuthUser` and `FarmRecordQueryDto`, existing `ScopeService`, existing farm-record model serializers.

---

## Global Constraints

- Do not change routes, DTO schemas, roles, permissions, or `ScopeService` ownership checks.
- Preserve `batchId` behavior: when query contains `batchId`, service must still call `scope.assertInScope()` before querying.
- Preserve no-`batchId` behavior: service must still call `scope.ownedScopeWhere()` and limit records to scoped batch ids.
- Preserve `action` fuzzy filter: `{ contains: action, mode: 'insensitive' }`.
- Preserve `status` exact filter.
- Preserve ordering: `recordedAt desc`.
- Preserve pagination math: `skip = (page - 1) * pageSize`, `take = pageSize`.
- Preserve owner enrichment path: record `batchId` -> batch `ownerId` -> user `displayName`.
- Preserve empty result behavior: `{ items: [], total, page, pageSize }` without extra owner lookups.
- Use TDD: write failing model tests first, verify RED, implement minimal code, verify GREEN.

### Task 1: Farm record list helpers

**Files:**
- Modify: `packages/backend/src/modules/farm-record/farm-record.model.spec.ts`
- Modify: `packages/backend/src/modules/farm-record/farm-record.model.ts`
- Modify: `packages/backend/src/modules/farm-record/farm-record.service.ts`

**Interfaces:**
- Produces:
  - `FARM_RECORD_LIST_ORDER_BY`
  - `FARM_RECORD_OWNER_BATCH_SELECT`
  - `FARM_RECORD_OWNER_SELECT`
  - `FarmRecordListRow`
  - `FarmRecordOwnerBatchRow`
  - `FarmRecordOwnerRow`
  - `buildFarmRecordListWhere(user, query, scopedBatchIds?)`
  - `buildFarmRecordListFindManyArgs(where, query)`
  - `getFarmRecordBatchIds(rows)`
  - `buildFarmRecordOwnerBatchWhere(rows)`
  - `getFarmRecordOwnerIds(rows)`
  - `buildFarmRecordOwnerWhere(rows)`
  - `toPaginatedFarmRecords(items, total, query)`

- [x] **Step 1: Write failing model tests**

Add imports in `farm-record.model.spec.ts`:

```typescript
  FARM_RECORD_LIST_ORDER_BY,
  FARM_RECORD_OWNER_BATCH_SELECT,
  FARM_RECORD_OWNER_SELECT,
  buildFarmRecordListFindManyArgs,
  buildFarmRecordListWhere,
  buildFarmRecordOwnerBatchWhere,
  buildFarmRecordOwnerWhere,
  getFarmRecordBatchIds,
  getFarmRecordOwnerIds,
  toPaginatedFarmRecords,
```

Add `Role` to the shared import:

```typescript
import { Role, type AuthUser, type CreateFarmRecordDto } from '@nongchang/shared';
```

Add this helper and tests:

```typescript
const actor = (overrides: Partial<AuthUser> = {}): AuthUser => ({
  userId: 'u1',
  tenantId: 't1',
  role: Role.MERCHANT,
  ownerId: 'm1',
  agentId: null,
  ...overrides,
});

describe('farm record list model helpers', () => {
  it('builds scoped list filters from batch, action, and status query fields', () => {
    expect(buildFarmRecordListWhere(actor(), {
      batchId: 'b1',
      action: 'water',
      status: 'completed',
      page: 2,
      pageSize: 10,
    })).toEqual({
      tenantId: 't1',
      batchId: 'b1',
      action: { contains: 'water', mode: 'insensitive' },
      status: 'completed',
    });

    expect(buildFarmRecordListWhere(actor(), {
      page: 1,
      pageSize: 20,
    }, ['b1', 'b2'])).toEqual({
      tenantId: 't1',
      batchId: { in: ['b1', 'b2'] },
    });
  });

  it('builds paginated farm record findMany args with stable ordering', () => {
    const where = buildFarmRecordListWhere(actor(), {
      page: 3,
      pageSize: 15,
    }, ['b1']);

    expect(buildFarmRecordListFindManyArgs(where, { page: 3, pageSize: 15 })).toEqual({
      where,
      orderBy: FARM_RECORD_LIST_ORDER_BY,
      skip: 30,
      take: 15,
    });
  });

  it('builds owner lookup filters from listed farm record rows', () => {
    const rows = [
      { id: 'r1', batchId: 'b1', supplyAmount: null },
      { id: 'r2', batchId: 'b1', supplyAmount: null },
      { id: 'r3', batchId: 'b2', supplyAmount: null },
    ];
    const batches = [
      { id: 'b1', ownerId: 'm1' },
      { id: 'b2', ownerId: 'm2' },
      { id: 'b3', ownerId: 'm1' },
    ];

    expect(getFarmRecordBatchIds(rows)).toEqual(['b1', 'b2']);
    expect(buildFarmRecordOwnerBatchWhere(rows)).toEqual({
      where: { id: { in: ['b1', 'b2'] } },
      select: FARM_RECORD_OWNER_BATCH_SELECT,
    });
    expect(getFarmRecordOwnerIds(batches)).toEqual(['m1', 'm2']);
    expect(buildFarmRecordOwnerWhere(batches)).toEqual({
      where: { id: { in: ['m1', 'm2'] } },
      select: FARM_RECORD_OWNER_SELECT,
    });
    expect(buildFarmRecordOwnerBatchWhere([])).toBeNull();
    expect(buildFarmRecordOwnerWhere([])).toBeNull();
  });

  it('builds paginated farm record envelopes', () => {
    const items = [{ id: 'r1', batchId: 'b1', supplyAmount: null, ownerName: null }];

    expect(toPaginatedFarmRecords(items, 7, { page: 2, pageSize: 3 })).toEqual({
      items,
      total: 7,
      page: 2,
      pageSize: 3,
    });
  });
});
```

- [x] **Step 2: Run RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/farm-record/farm-record.model.spec.ts
```

Expected: FAIL because the new list helpers are not exported yet.

- [x] **Step 3: Implement helpers**

Add these helpers to `farm-record.model.ts`:

```typescript
export const FARM_RECORD_LIST_ORDER_BY = { recordedAt: 'desc' as const };

export const FARM_RECORD_OWNER_BATCH_SELECT = { id: true, ownerId: true } as const;

export const FARM_RECORD_OWNER_SELECT = { id: true, displayName: true } as const;

export interface FarmRecordListRow {
  batchId: string;
  supplyAmount: Prisma.Decimal | number | null;
}

export interface FarmRecordOwnerBatchRow {
  id: string;
  ownerId: string;
}

export interface FarmRecordOwnerRow {
  id: string;
  displayName: string | null;
}

export function buildFarmRecordListWhere(
  user: Pick<AuthUser, 'tenantId'>,
  query: FarmRecordQueryDto,
  scopedBatchIds?: string[],
): Prisma.FarmRecordWhereInput {
  const where: Prisma.FarmRecordWhereInput = { tenantId: user.tenantId };
  if (query.batchId) where.batchId = query.batchId;
  else where.batchId = { in: scopedBatchIds ?? [] };
  if (query.action) where.action = { contains: query.action, mode: 'insensitive' };
  if (query.status) where.status = query.status;
  return where;
}

export function buildFarmRecordListFindManyArgs(where: Prisma.FarmRecordWhereInput, query: FarmRecordQueryDto) {
  return {
    where,
    orderBy: FARM_RECORD_LIST_ORDER_BY,
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  };
}

export function getFarmRecordBatchIds(rows: Array<{ batchId: string }>): string[] {
  return [...new Set(rows.map(row => row.batchId))];
}

export function buildFarmRecordOwnerBatchWhere(rows: Array<{ batchId: string }>) {
  const batchIds = getFarmRecordBatchIds(rows);
  if (!batchIds.length) return null;
  return { where: { id: { in: batchIds } }, select: FARM_RECORD_OWNER_BATCH_SELECT };
}

export function getFarmRecordOwnerIds(rows: Array<{ ownerId: string }>): string[] {
  return [...new Set(rows.map(row => row.ownerId))];
}

export function buildFarmRecordOwnerWhere(rows: Array<{ ownerId: string }>) {
  const ownerIds = getFarmRecordOwnerIds(rows);
  if (!ownerIds.length) return null;
  return { where: { id: { in: ownerIds } }, select: FARM_RECORD_OWNER_SELECT };
}

export function toPaginatedFarmRecords<T>(items: T[], total: number, query: FarmRecordQueryDto): PaginatedFarmRecords<T> {
  return { items, total, page: query.page, pageSize: query.pageSize };
}
```

Also update the shared imports in `farm-record.model.ts`:

```typescript
import type { AuthUser, CreateFarmRecordDto, FarmRecordQueryDto, PaginatedFarmRecords } from '@nongchang/shared';
```

- [x] **Step 4: Refactor service to call helpers**

Update `FarmRecordService.list()` so it keeps scope checks in service and delegates pure construction:

```typescript
async list(user: AuthUser, query: FarmRecordQueryDto) {
  let scopedBatchIds: string[] | undefined;
  if (query.batchId) {
    await this.scope.assertInScope(this.prisma, user, 'batch', query.batchId);
  } else {
    const batchWhere = await this.scope.ownedScopeWhere(this.prisma, user);
    const batches = await this.prisma.batch.findMany({ where: batchWhere, select: { id: true } });
    scopedBatchIds = batches.map(batch => batch.id);
  }
  const where = buildFarmRecordListWhere(user, query, scopedBatchIds);
  const [items, total] = await this.prisma.$transaction([
    this.prisma.farmRecord.findMany(buildFarmRecordListFindManyArgs(where, query)),
    this.prisma.farmRecord.count({ where }),
  ]);
  if (items.length === 0) return toPaginatedFarmRecords(items, total, query);
  const batchLookup = buildFarmRecordOwnerBatchWhere(items);
  const batches = batchLookup ? await this.prisma.batch.findMany(batchLookup) : [];
  const ownerLookup = buildFarmRecordOwnerWhere(batches);
  const owners = ownerLookup ? await this.prisma.user.findMany(ownerLookup) : [];
  const withOwner = enrichFarmRecordRows(items, batches, owners);
  return toPaginatedFarmRecords(withOwner, total, query);
}
```

- [x] **Step 5: Verify GREEN**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/farm-record/farm-record.model.spec.ts src/modules/farm-record/farm-record.service.spec.ts
```

Expected: PASS.

- [x] **Step 6: Full verification**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend build
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit
```

Expected: both exit 0.

- [x] **Step 7: Review, stage, commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang diff --check
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-10-p30-farm-record-list-model-boundary.md packages/backend/src/modules/farm-record/farm-record.model.ts packages/backend/src/modules/farm-record/farm-record.model.spec.ts packages/backend/src/modules/farm-record/farm-record.service.ts
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang commit -m "refactor(backend): extract farm record list helpers"
```

## Self-Review

- Spec coverage: Covers list `where`, pagination args, owner batch/user lookup filters, deduplicated ids, paginated envelope, service scope preservation, verification, and commit.
- Placeholder scan: No TBD/TODO/fill-in-later placeholders are present.
- Type consistency: Helper names in tests match planned exports and planned service imports.
