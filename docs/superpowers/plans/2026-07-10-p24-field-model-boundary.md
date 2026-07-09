# P24 Field Model Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract pure field create/list/enrichment helpers out of `FieldService` while preserving owner scoping, pagination, and PostGIS coordinate behavior.

**Architecture:** Keep `FieldService` responsible for Prisma calls, `ScopeService` authorization, and raw SQL execution. Move deterministic create data, list query args, owner/coordinate merge, and constants into `field.model.ts` with focused Vitest coverage.

**Tech Stack:** NestJS, TypeScript, Prisma, Vitest, pnpm via `corepack pnpm@10.33.2`, existing `@nongchang/shared` DTO types.

## Global Constraints

- Repository root: `E:\code\nongchang`.
- Branch: `codex/p1-truthful-product-copy`.
- Use CodeGraph before code discovery because `.codegraph/` exists.
- No API route, DTO schema, database schema, or dependency changes.
- Keep `ScopeService.resolveOwnerId` and `ScopeService.ownedScopeWhere` in the service layer.
- Keep raw PostGIS SQL text and parameter order unchanged.
- Run focused tests, backend build, backend unit tests, source scan, diff checks, and read-only review before commit.

---

## File Structure

- Create `packages/backend/src/modules/field/field.model.ts`
  - Owns `DEFAULT_FIELD_LIST_CAP`, `FieldRow`, `FieldOwnerRow`, `FieldCoordinateRow`, `buildFieldCreateData`, `buildFieldListFindManyArgs`, `buildFieldPagination`, `buildFieldOwnerIds`, `buildFieldIds`, and `enrichFieldRows`.
- Create `packages/backend/src/modules/field/field.model.spec.ts`
  - Tests create data defaults, list cap/pagination args, id extraction, owner de-duplication, and enrichment fallback behavior.
- Modify `packages/backend/src/modules/field/field.service.ts`
  - Imports model helpers; keeps Prisma, scope checks, transactions, owner lookup, coordinate SQL query, and return contract.
- Modify `packages/backend/src/modules/field/field.service.spec.ts`
  - Add list/enrichment regression coverage because existing tests cover only `create`.

---

### Task 1: Field Pure Model

**Files:**
- Create: `packages/backend/src/modules/field/field.model.ts`
- Create: `packages/backend/src/modules/field/field.model.spec.ts`

**Interfaces:**
- Consumes: `CreateFieldDto` from `@nongchang/shared`.
- Produces:
  - `const DEFAULT_FIELD_LIST_CAP = 500`
  - `interface FieldRow`
  - `interface FieldOwnerRow`
  - `interface FieldCoordinateRow`
  - `function buildFieldCreateData(input: { tenantId: string; ownerId: string; dto: CreateFieldDto }): FieldCreateData`
  - `function buildFieldListFindManyArgs(input: { where: Record<string, unknown>; page?: number; pageSize?: number }): Record<string, unknown>`
  - `function buildFieldPagination(input?: { page?: number; pageSize?: number }): { page: number; pageSize: number; skip: number; take: number }`
  - `function buildFieldOwnerIds(fields: FieldRow[]): string[]`
  - `function buildFieldIds(fields: FieldRow[]): string[]`
  - `function enrichFieldRows(input: { fields: FieldRow[]; owners: FieldOwnerRow[]; coords: FieldCoordinateRow[] }): Array<FieldRow & { ownerName: string | null; lng: number | null; lat: number | null }>`

- [ ] **Step 1: Write failing model tests**

```typescript
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FIELD_LIST_CAP,
  buildFieldCreateData,
  buildFieldIds,
  buildFieldListFindManyArgs,
  buildFieldOwnerIds,
  buildFieldPagination,
  enrichFieldRows,
  type FieldRow,
} from './field.model';

const fieldA: FieldRow = { id: 'f1', tenantId: 't1', ownerId: 'm1', name: 'A区', area: 10, iotDeviceId: null, createdAt: new Date('2026-06-14T10:00:00.000Z') };
const fieldB: FieldRow = { id: 'f2', tenantId: 't1', ownerId: 'm1', name: 'B区', area: 20, iotDeviceId: 'dev1', createdAt: new Date('2026-06-15T10:00:00.000Z') };

describe('field.model', () => {
  it('builds create data and normalizes optional device id', () => {
    expect(buildFieldCreateData({
      tenantId: 't1',
      ownerId: 'm1',
      dto: { ownerId: 'dto-owner', name: 'A区', area: 10, lng: 100, lat: 25 },
    })).toEqual({ tenantId: 't1', ownerId: 'm1', name: 'A区', area: 10, iotDeviceId: null });
  });

  it('preserves explicit iotDeviceId in create data', () => {
    expect(buildFieldCreateData({
      tenantId: 't1',
      ownerId: 'm1',
      dto: { ownerId: 'dto-owner', name: 'A区', area: 10, lng: 100, lat: 25, iotDeviceId: 'iot-1' },
    }).iotDeviceId).toBe('iot-1');
  });

  it('builds capped and paginated findMany args', () => {
    expect(buildFieldListFindManyArgs({ where: { tenantId: 't1' } })).toEqual({
      where: { tenantId: 't1' },
      orderBy: { createdAt: 'desc' },
      take: DEFAULT_FIELD_LIST_CAP,
    });
    expect(buildFieldPagination({ page: 3, pageSize: 10 })).toEqual({ page: 3, pageSize: 10, skip: 20, take: 10 });
    expect(buildFieldListFindManyArgs({ where: { tenantId: 't1' }, page: 3, pageSize: 10 })).toEqual({
      where: { tenantId: 't1' },
      orderBy: { createdAt: 'desc' },
      skip: 20,
      take: 10,
    });
  });

  it('extracts field and unique owner ids', () => {
    expect(buildFieldIds([fieldA, fieldB])).toEqual(['f1', 'f2']);
    expect(buildFieldOwnerIds([fieldA, fieldB])).toEqual(['m1']);
  });

  it('enriches owner names and coordinates with null fallback', () => {
    expect(enrichFieldRows({
      fields: [fieldA, fieldB],
      owners: [{ id: 'm1', displayName: '张三农场' }],
      coords: [{ id: 'f1', lng: 100.1, lat: 25.2 }],
    })).toEqual([
      { ...fieldA, ownerName: '张三农场', lng: 100.1, lat: 25.2 },
      { ...fieldB, ownerName: '张三农场', lng: null, lat: null },
    ]);
  });
});
```

- [ ] **Step 2: Run RED**

Run: `corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/field/field.model.spec.ts`

Expected: FAIL because `./field.model` does not exist.

- [ ] **Step 3: Implement minimal model helpers**

```typescript
import type { CreateFieldDto } from '@nongchang/shared';

export const DEFAULT_FIELD_LIST_CAP = 500;

export interface FieldRow {
  id: string;
  tenantId: string;
  ownerId: string;
  name: string;
  area: number;
  iotDeviceId: string | null;
  createdAt: Date;
}

export interface FieldOwnerRow {
  id: string;
  displayName: string;
}

export interface FieldCoordinateRow {
  id: string;
  lng: number | null;
  lat: number | null;
}

export interface FieldCreateData {
  tenantId: string;
  ownerId: string;
  name: string;
  area: number;
  iotDeviceId: string | null;
}

export function buildFieldCreateData(input: { tenantId: string; ownerId: string; dto: CreateFieldDto }): FieldCreateData {
  return {
    tenantId: input.tenantId,
    ownerId: input.ownerId,
    name: input.dto.name,
    area: input.dto.area,
    iotDeviceId: input.dto.iotDeviceId ?? null,
  };
}

export function buildFieldPagination(input?: { page?: number; pageSize?: number }) {
  const page = input?.page ?? 1;
  const pageSize = input?.pageSize ?? 20;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function buildFieldListFindManyArgs(input: { where: Record<string, unknown>; page?: number; pageSize?: number }): Record<string, unknown> {
  if (input.page !== undefined || input.pageSize !== undefined) {
    const { skip, take } = buildFieldPagination(input);
    return { where: input.where, orderBy: { createdAt: 'desc' }, skip, take };
  }
  return { where: input.where, orderBy: { createdAt: 'desc' }, take: DEFAULT_FIELD_LIST_CAP };
}

export function buildFieldOwnerIds(fields: FieldRow[]): string[] {
  return [...new Set(fields.map((field) => field.ownerId))];
}

export function buildFieldIds(fields: FieldRow[]): string[] {
  return fields.map((field) => field.id);
}

export function enrichFieldRows(input: { fields: FieldRow[]; owners: FieldOwnerRow[]; coords: FieldCoordinateRow[] }) {
  const ownerNameById = new Map(input.owners.map((owner) => [owner.id, owner.displayName]));
  const coordByFieldId = new Map(input.coords.map((coord) => [coord.id, coord]));
  return input.fields.map((field) => ({
    ...field,
    ownerName: ownerNameById.get(field.ownerId) ?? null,
    lng: coordByFieldId.get(field.id)?.lng ?? null,
    lat: coordByFieldId.get(field.id)?.lat ?? null,
  }));
}
```

- [ ] **Step 4: Run GREEN**

Run: `corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/field/field.model.spec.ts`

Expected: PASS, 1 file and 5 tests.

---

### Task 2: Wire FieldService To Model Helpers

**Files:**
- Modify: `packages/backend/src/modules/field/field.service.ts`
- Modify: `packages/backend/src/modules/field/field.service.spec.ts`

**Interfaces:**
- Consumes helpers from Task 1.
- Produces unchanged service methods:
  - `create(user: AuthUser, dto: CreateFieldDto)`
  - `list(user: AuthUser, query?: ListQuery): Promise<any[] | Paginated<any>>`

- [ ] **Step 1: Import model helpers**

```typescript
import {
  buildFieldCreateData,
  buildFieldIds,
  buildFieldListFindManyArgs,
  buildFieldOwnerIds,
  buildFieldPagination,
  enrichFieldRows,
  type FieldCoordinateRow,
  type FieldOwnerRow,
  type FieldRow,
} from './field.model';
```

- [ ] **Step 2: Replace inline create data**

```typescript
const { lng, lat } = dto;
const ownerId = await this.scope.resolveOwnerId(this.prisma, user, dto.ownerId);
const field = await this.prisma.field.create({
  data: buildFieldCreateData({ tenantId: user.tenantId, ownerId, dto }),
});
```

- [ ] **Step 3: Replace list pagination args**

```typescript
const where = await this.scope.ownedScopeWhere(this.prisma, user);
if (isPaginated(query)) {
  const { page, pageSize } = buildFieldPagination(query);
  const [fields, total] = await this.prisma.$transaction([
    this.prisma.field.findMany(buildFieldListFindManyArgs({ where, page, pageSize })),
    this.prisma.field.count({ where }),
  ]);
  return { items: await this.enrich(fields as FieldRow[]), total, page, pageSize };
}
const fields = await this.prisma.field.findMany(buildFieldListFindManyArgs({ where }));
return this.enrich(fields as FieldRow[]);
```

- [ ] **Step 4: Replace enrich merge logic only**

Keep the two Prisma reads and raw SQL in `FieldService`. Use helpers only for arrays and merge:

```typescript
if (fields.length === 0) return [];
const ownerIds = buildFieldOwnerIds(fields);
const owners = (await this.prisma.user.findMany({
  where: { id: { in: ownerIds } },
  select: { id: true, displayName: true },
})) as FieldOwnerRow[];
const ids = buildFieldIds(fields);
const coords = await this.prisma.$queryRawUnsafe<FieldCoordinateRow[]>(
  `SELECT id, ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat FROM fields WHERE id::text = ANY($1)`,
  ids,
);
return enrichFieldRows({ fields, owners, coords });
```

- [ ] **Step 5: Add service list regression tests**

Append tests to `packages/backend/src/modules/field/field.service.spec.ts`:

```typescript
describe('FieldService.list', () => {
  function makeList(overrides: any = {}) {
    let findManyArgs: any;
    let countArgs: any;
    let coordIds: string[] | undefined;
    const fields = overrides.fields ?? [
      { id: 'f1', tenantId: 't1', ownerId: 'm1', name: 'A区', area: 10, iotDeviceId: null, createdAt: new Date('2026-06-14T10:00:00.000Z') },
    ];
    const prisma = {
      field: {
        findMany: async (args: any) => { findManyArgs = args; return fields; },
        count: async (args: any) => { countArgs = args; return overrides.total ?? fields.length; },
      },
      user: {
        findMany: async () => overrides.owners ?? [{ id: 'm1', displayName: '张三农场' }],
      },
      $queryRawUnsafe: async (_sql: string, ids: string[]) => {
        coordIds = ids;
        return overrides.coords ?? [{ id: 'f1', lng: 100.1, lat: 25.2 }];
      },
      $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    };
    return {
      svc: new FieldService(prisma as any, new ScopeService()),
      get findManyArgs() { return findManyArgs; },
      get countArgs() { return countArgs; },
      get coordIds() { return coordIds; },
    };
  }

  it('unpaginated list applies owned scope, default cap, and enrichment', async () => {
    const h = makeList();
    const result = await h.svc.list(merchant);
    expect(h.findManyArgs).toMatchObject({ where: { tenantId: 't1', ownerId: 'm1' }, orderBy: { createdAt: 'desc' }, take: 500 });
    expect(result[0]).toMatchObject({ ownerName: '张三农场', lng: 100.1, lat: 25.2 });
    expect(h.coordIds).toEqual(['f1']);
  });

  it('paginated list returns pagination envelope and skip/take', async () => {
    const h = makeList({ total: 21 });
    const result = await h.svc.list(merchant, { page: 3, pageSize: 10 });
    expect(h.findManyArgs.skip).toBe(20);
    expect(h.findManyArgs.take).toBe(10);
    expect(h.countArgs.where).toEqual({ tenantId: 't1', ownerId: 'm1' });
    expect(result).toMatchObject({ total: 21, page: 3, pageSize: 10 });
  });

  it('empty list skips owner and coordinate enrichment queries', async () => {
    const h = makeList({ fields: [] });
    const result = await h.svc.list(merchant);
    expect(result).toEqual([]);
    expect(h.coordIds).toBeUndefined();
  });
});
```

- [ ] **Step 6: Run focused service tests**

Run: `corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/field/field.model.spec.ts src/modules/field/field.service.spec.ts`

Expected: PASS, model and service tests all green.

---

### Task 3: Verification, Review, And Commit

**Files:**
- Stage only the P24 plan plus field model/service/spec files.

- [ ] **Step 1: Run backend build**

Run: `corepack pnpm@10.33.2 --filter @nongchang/backend build`

Expected: exit 0 after Prisma generate and Nest build.

- [ ] **Step 2: Run backend unit suite**

Run: `corepack pnpm@10.33.2 --filter @nongchang/backend test:unit`

Expected: exit 0 with all backend tests passing.

- [ ] **Step 3: Scan modified source files**

Run:

```powershell
Select-String -Path packages/backend/src/modules/field/field.service.ts,packages/backend/src/modules/field/field.service.spec.ts,packages/backend/src/modules/field/field.model.ts,packages/backend/src/modules/field/field.model.spec.ts -Pattern '�|鍔|瘑|浠|绉|鏌|缂|鐩|鏂|鍦|鏀|甯|鍗|绠|悊|疆|閽|熸|涓|澶|宸|浣|瓒|璀|喕||||||'
```

Expected: no matches.

- [ ] **Step 4: Run diff checks**

Run:

```powershell
git -c safe.directory=E:/code/nongchang diff --check
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-10-p24-field-model-boundary.md packages/backend/src/modules/field/field.model.ts packages/backend/src/modules/field/field.model.spec.ts packages/backend/src/modules/field/field.service.ts packages/backend/src/modules/field/field.service.spec.ts
git -c safe.directory=E:/code/nongchang diff --cached --check
```

Expected: exit 0. LF-to-CRLF warnings are acceptable on Windows if the exit code is 0.

- [ ] **Step 5: Request read-only review**

Dispatch a read-only reviewer for the staged P24 diff. Fix any Critical or Important findings, then rerun focused tests and build.

- [ ] **Step 6: Commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang commit -m "refactor(backend): extract field model helpers"
```

Expected: commit created on `codex/p1-truthful-product-copy`.

---

## Self-Review

- Spec coverage: Task 1 covers pure helper extraction; Task 2 covers service wiring and list regression tests; Task 3 covers verification, review, and commit.
- Placeholder scan: no deferred implementation markers are present.
- Type consistency: helper names and signatures are identical across task interfaces and code snippets.
