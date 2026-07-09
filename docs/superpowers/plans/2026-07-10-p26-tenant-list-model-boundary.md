# P26 Tenant List Model Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move TenantService list projection and query option construction into pure tenant model helpers without changing route behavior or response shapes.

**Architecture:** Keep Prisma calls and exception throwing in `TenantService`. Add deterministic, side-effect-free helpers to `tenant.model.ts` for tenant list select, pagination params, findMany args, paginated response projection, and non-paginated list projection. Service becomes a thin orchestrator that calls helpers.

**Tech Stack:** NestJS service, Prisma client calls, Vitest unit tests, shared `ListQuery`, `Paginated`, `TenantListItem`, and `isPaginated`.

## Global Constraints

- Do not change public API routes, DTO schemas, response keys, or permission behavior.
- Do not move Prisma execution into model helpers; helpers only build data/options and project rows.
- Preserve non-paginated backward compatibility: return a bare array capped at `500`.
- Preserve paginated behavior: default page `1`, default pageSize `20`, `skip = (page - 1) * pageSize`, `count({})`, and response `{ items, total, page, pageSize }`.
- Keep default group creation, tenant create, and tenant status behavior unchanged.
- Use TDD: write failing model tests first, verify RED, implement minimal code, verify GREEN.

---

### Task 1: Tenant list model helpers

**Files:**
- Modify: `packages/backend/src/modules/tenant/tenant.model.spec.ts`
- Modify: `packages/backend/src/modules/tenant/tenant.model.ts`
- Modify: `packages/backend/src/modules/tenant/tenant.service.ts`

**Interfaces:**
- Consumes: `ListQuery`, `Paginated`, `TenantListItem`, `isPaginated`, and existing `TenantRow`.
- Produces:
  - `TENANT_LIST_SELECT`
  - `DEFAULT_TENANT_LIST_CAP`
  - `resolveTenantListPagination(query?: ListQuery): { page: number; pageSize: number; skip: number; take: number }`
  - `buildTenantListFindManyArgs(query?: ListQuery): { orderBy: { createdAt: 'desc' }; select: typeof TENANT_LIST_SELECT; skip: number; take: number }`
  - `toTenantListItems(rows: TenantRow[]): TenantListItem[]`
  - `toPaginatedTenantList(rows: TenantRow[], total: number, query?: ListQuery): Paginated<TenantListItem>`

- [ ] **Step 1: Write failing model tests**

Add these tests to `packages/backend/src/modules/tenant/tenant.model.spec.ts` imports:

```typescript
import {
  DEFAULT_TENANT_LIST_CAP,
  TENANT_LIST_SELECT,
  buildTenantListFindManyArgs,
  resolveTenantListPagination,
  toPaginatedTenantList,
  toTenantListItems,
} from './tenant.model';
```

Add these test cases in `describe('tenant.model', () => { ... })`:

```typescript
  it('builds capped non-paginated tenant list query args', () => {
    expect(buildTenantListFindManyArgs()).toEqual({
      orderBy: { createdAt: 'desc' },
      select: TENANT_LIST_SELECT,
      skip: 0,
      take: DEFAULT_TENANT_LIST_CAP,
    });
  });

  it('builds paginated tenant list query args', () => {
    expect(resolveTenantListPagination({ page: 3, pageSize: 25 })).toEqual({
      page: 3,
      pageSize: 25,
      skip: 50,
      take: 25,
    });
    expect(buildTenantListFindManyArgs({ page: 3, pageSize: 25 })).toEqual({
      orderBy: { createdAt: 'desc' },
      select: TENANT_LIST_SELECT,
      skip: 50,
      take: 25,
    });
  });

  it('projects tenant list rows as bare arrays and paginated envelopes', () => {
    const rows = [
      {
        id: 't1',
        name: 'Tenant A',
        code: 'TENANT_A',
        status: 'active',
        createdAt: new Date('2026-07-05T00:00:00.000Z'),
        _count: { users: 2, agents: 1 },
      },
    ];

    expect(toTenantListItems(rows)).toEqual([
      {
        id: 't1',
        name: 'Tenant A',
        code: 'TENANT_A',
        status: 'active',
        createdAt: '2026-07-05T00:00:00.000Z',
        userCount: 2,
        agentCount: 1,
      },
    ]);
    expect(toPaginatedTenantList(rows, 8, { page: 2, pageSize: 1 })).toEqual({
      items: [
        {
          id: 't1',
          name: 'Tenant A',
          code: 'TENANT_A',
          status: 'active',
          createdAt: '2026-07-05T00:00:00.000Z',
          userCount: 2,
          agentCount: 1,
        },
      ],
      total: 8,
      page: 2,
      pageSize: 1,
    });
  });
```

- [ ] **Step 2: Run RED test**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/tenant/tenant.model.spec.ts
```

Expected: FAIL because `DEFAULT_TENANT_LIST_CAP`, `TENANT_LIST_SELECT`, `buildTenantListFindManyArgs`, `resolveTenantListPagination`, `toTenantListItems`, and `toPaginatedTenantList` are not exported yet.

- [ ] **Step 3: Implement pure helpers**

Add to `packages/backend/src/modules/tenant/tenant.model.ts` imports:

```typescript
  ListQuery,
  Paginated,
  isPaginated,
```

Add these exports near `TenantRow`:

```typescript
export const DEFAULT_TENANT_LIST_CAP = 500;

export const TENANT_LIST_SELECT = {
  id: true,
  name: true,
  code: true,
  status: true,
  createdAt: true,
  _count: { select: { users: true, agents: true } },
} as const;

export function resolveTenantListPagination(query?: ListQuery): { page: number; pageSize: number; skip: number; take: number } {
  const page = query?.page ?? 1;
  const pageSize = query?.pageSize ?? 20;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function buildTenantListFindManyArgs(query?: ListQuery) {
  if (isPaginated(query)) {
    const { skip, take } = resolveTenantListPagination(query);
    return { orderBy: { createdAt: 'desc' as const }, select: TENANT_LIST_SELECT, skip, take };
  }
  return { orderBy: { createdAt: 'desc' as const }, select: TENANT_LIST_SELECT, skip: 0, take: DEFAULT_TENANT_LIST_CAP };
}

export function toTenantListItems(rows: TenantRow[]): TenantListItem[] {
  return rows.map(row => toTenantListItem(row));
}

export function toPaginatedTenantList(rows: TenantRow[], total: number, query?: ListQuery): Paginated<TenantListItem> {
  const { page, pageSize } = resolveTenantListPagination(query);
  return { items: toTenantListItems(rows), total, page, pageSize };
}
```

- [ ] **Step 4: Run GREEN model test**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/tenant/tenant.model.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Refactor TenantService list orchestration**

Update `packages/backend/src/modules/tenant/tenant.service.ts`:

```typescript
import {
  assertCanSetTenantStatus,
  buildDefaultTenantGroupCreateData,
  buildTenantAdminCreateData,
  buildTenantCreateData,
  buildTenantListFindManyArgs,
  normalizeTenantCode,
  TenantRow,
  toPaginatedTenantList,
  toTenantListItem,
  toTenantListItems,
  toTenantStatusResult,
} from './tenant.model';
```

Remove local `DEFAULT_LIST_CAP` and the private `toListItem()` method.

Replace `list()` with:

```typescript
  async list(query?: ListQuery): Promise<TenantListItem[] | Paginated<TenantListItem>> {
    if (isPaginated(query)) {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.tenant.findMany(buildTenantListFindManyArgs(query)),
        this.prisma.tenant.count({}),
      ]);
      return toPaginatedTenantList(rows as TenantRow[], total, query);
    }
    const rows = await this.prisma.tenant.findMany(buildTenantListFindManyArgs(query));
    return toTenantListItems(rows as TenantRow[]);
  }
```

Replace the create response spread with:

```typescript
        ...toTenantListItem({ ...tenant, _count: { users: 1, agents: 0 } }),
```

- [ ] **Step 6: Run focused tenant tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/tenant/tenant.model.spec.ts src/modules/tenant/tenant.service.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Run backend build and unit suite**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend build
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit
```

Expected: both commands exit 0.

- [ ] **Step 8: Review, stage, and commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang diff --check
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-10-p26-tenant-list-model-boundary.md packages/backend/src/modules/tenant/tenant.model.ts packages/backend/src/modules/tenant/tenant.model.spec.ts packages/backend/src/modules/tenant/tenant.service.ts
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang commit -m "refactor(backend): extract tenant list model helpers"
```

Expected: diff checks exit 0 and commit succeeds.

## Self-Review

- Spec coverage: The plan covers tenant list query option construction, row projection, paginated envelope projection, service orchestration cleanup, tests, build, unit verification, and commit.
- Placeholder scan: No TBD/TODO/fill-in-later placeholders are present.
- Type consistency: Helper names and return shapes match the service refactor steps and test expectations.
