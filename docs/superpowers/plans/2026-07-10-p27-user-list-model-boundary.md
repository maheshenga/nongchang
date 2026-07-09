# P27 User List Model Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move user list query construction, pagination envelope creation, merchant list filters, pending merchant filters, and merchant aggregate projection out of `UserService` into `user.model.ts` helpers.

**Architecture:** Keep Prisma execution, transactions, password hashing, existence checks, and exceptions that already exist in service/model at their current responsibility boundaries. `user.model.ts` will expose deterministic helpers for list args and merchant projections; `UserService` remains responsible for calling Prisma and deciding when to query aggregates.

**Tech Stack:** NestJS service, Prisma-style query args, Vitest, shared `AuthUser`, `ListQuery`, `Paginated`, `Role`, and `isPaginated`.

## Global Constraints

- Do not change public API routes, DTO schemas, response keys, or role/permission behavior.
- Preserve backward compatibility: `list`, `listMerchants`, and `listPending` return bare arrays when no `page/pageSize` is supplied.
- Preserve default non-paginated cap: `500`.
- Preserve pagination defaults: page `1`, pageSize `20`, `skip = (page - 1) * pageSize`.
- Preserve `listMerchants` response projection: `createdAt` is ISO string, `fieldCount` defaults to `0`, `totalArea` defaults to `0`.
- Preserve `list` and `listPending` raw Prisma row shapes; do not add new projection transforms for them.
- Do not move Prisma calls into `user.model.ts`.
- Use TDD: write failing model tests first, verify RED, implement minimal code, verify GREEN.

---

### Task 1: User list model helpers

**Files:**
- Modify: `packages/backend/src/modules/user/user.model.spec.ts`
- Modify: `packages/backend/src/modules/user/user.model.ts`
- Modify: `packages/backend/src/modules/user/user.service.ts`

**Interfaces:**
- Consumes: existing `buildUserScopedWhere(actor)`, `AuthUser`, `ListQuery`, `Paginated`, `Role`, and `isPaginated`.
- Produces:
  - `DEFAULT_USER_LIST_CAP = 500`
  - `USER_LIST_SELECT`
  - `MERCHANT_USER_LIST_SELECT`
  - `PENDING_USER_LIST_SELECT`
  - `resolveUserListPagination(query?: ListQuery): { paginated: boolean; page: number; pageSize: number; skip: number; take: number }`
  - `buildUserListFindManyArgs(where: Record<string, unknown>, query?: ListQuery)`
  - `buildMerchantListWhere(actor: AuthUser): Record<string, unknown>`
  - `buildMerchantListFindManyArgs(where: Record<string, unknown>, query?: ListQuery)`
  - `buildPendingMerchantListWhere(actor: AuthUser): Record<string, unknown>`
  - `buildPendingMerchantListFindManyArgs(where: Record<string, unknown>, query?: ListQuery)`
  - `toPaginatedUserList<T>(items: T[], total: number, query?: ListQuery): Paginated<T>`
  - `getMerchantIds(merchants: Array<{ id: string }>): string[]`
  - `buildMerchantFieldAggregateWhere(tenantId: string, merchantIds: string[]): { tenantId: string; ownerId: { in: string[] } } | null`
  - `toMerchantListItems(merchants: MerchantListRow[], aggregates: MerchantFieldAggregateRow[]): any[]`

- [ ] **Step 1: Write failing model tests**

Add these imports in `packages/backend/src/modules/user/user.model.spec.ts`:

```typescript
  DEFAULT_USER_LIST_CAP,
  MERCHANT_USER_LIST_SELECT,
  PENDING_USER_LIST_SELECT,
  USER_LIST_SELECT,
  buildMerchantFieldAggregateWhere,
  buildMerchantListFindManyArgs,
  buildMerchantListWhere,
  buildPendingMerchantListFindManyArgs,
  buildPendingMerchantListWhere,
  buildUserListFindManyArgs,
  getMerchantIds,
  resolveUserListPagination,
  toMerchantListItems,
  toPaginatedUserList,
```

Add these tests:

```typescript
describe('user.model list helpers', () => {
  it('builds capped and paginated general user list args', () => {
    const where = { tenantId: 't1' };

    expect(resolveUserListPagination()).toEqual({
      paginated: false,
      page: 1,
      pageSize: 20,
      skip: 0,
      take: DEFAULT_USER_LIST_CAP,
    });
    expect(buildUserListFindManyArgs(where)).toEqual({
      where,
      select: USER_LIST_SELECT,
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: DEFAULT_USER_LIST_CAP,
    });
    expect(buildUserListFindManyArgs(where, { page: 3, pageSize: 25 })).toEqual({
      where,
      select: USER_LIST_SELECT,
      orderBy: { createdAt: 'desc' },
      skip: 50,
      take: 25,
    });
  });

  it('builds merchant and pending merchant list where clauses inside actor scope', () => {
    expect(buildMerchantListWhere(actor({ role: Role.AGENT_ADMIN, agentId: 'a1' }))).toEqual({
      tenantId: 't1',
      agentId: 'a1',
      role: Role.MERCHANT,
      status: { not: 'pending' },
    });
    expect(buildPendingMerchantListWhere(actor({ role: Role.SYSTEM_ADMIN }))).toEqual({
      tenantId: 't1',
      role: Role.MERCHANT,
      status: 'pending',
    });
  });

  it('builds merchant and pending findMany args with stable selects', () => {
    const merchantWhere = { tenantId: 't1', role: Role.MERCHANT, status: { not: 'pending' } };
    const pendingWhere = { tenantId: 't1', role: Role.MERCHANT, status: 'pending' };

    expect(buildMerchantListFindManyArgs(merchantWhere, { page: 2, pageSize: 10 })).toEqual({
      where: merchantWhere,
      orderBy: { createdAt: 'desc' },
      select: MERCHANT_USER_LIST_SELECT,
      skip: 10,
      take: 10,
    });
    expect(buildPendingMerchantListFindManyArgs(pendingWhere)).toEqual({
      where: pendingWhere,
      orderBy: { createdAt: 'desc' },
      select: PENDING_USER_LIST_SELECT,
      skip: 0,
      take: DEFAULT_USER_LIST_CAP,
    });
  });

  it('builds paginated envelopes without transforming raw user rows', () => {
    const items = [{ id: 'u1', createdAt: new Date('2026-07-06T00:00:00.000Z') }];

    expect(toPaginatedUserList(items, 5, { page: 2, pageSize: 1 })).toEqual({
      items,
      total: 5,
      page: 2,
      pageSize: 1,
    });
  });

  it('projects merchant aggregate fields and skips empty aggregate queries', () => {
    const merchants = [
      {
        id: 'm1',
        username: 'u1',
        displayName: 'Merchant 1',
        phone: null,
        status: 'active',
        agentId: 'a1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: 'm2',
        username: 'u2',
        displayName: 'Merchant 2',
        phone: '13800000002',
        status: 'active',
        agentId: null,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ];

    expect(getMerchantIds(merchants)).toEqual(['m1', 'm2']);
    expect(buildMerchantFieldAggregateWhere('t1', [])).toBeNull();
    expect(buildMerchantFieldAggregateWhere('t1', ['m1', 'm2'])).toEqual({
      tenantId: 't1',
      ownerId: { in: ['m1', 'm2'] },
    });
    expect(toMerchantListItems(merchants, [
      { ownerId: 'm1', _count: { _all: 3 }, _sum: { area: 12.5 } },
    ])).toEqual([
      {
        id: 'm1',
        username: 'u1',
        displayName: 'Merchant 1',
        phone: null,
        status: 'active',
        agentId: 'a1',
        createdAt: '2026-01-01T00:00:00.000Z',
        fieldCount: 3,
        totalArea: 12.5,
      },
      {
        id: 'm2',
        username: 'u2',
        displayName: 'Merchant 2',
        phone: '13800000002',
        status: 'active',
        agentId: null,
        createdAt: '2026-01-02T00:00:00.000Z',
        fieldCount: 0,
        totalArea: 0,
      },
    ]);
  });
});
```

- [ ] **Step 2: Run RED test**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/user/user.model.spec.ts
```

Expected: FAIL because the new list helper exports do not exist yet.

- [ ] **Step 3: Implement pure helpers**

Update `packages/backend/src/modules/user/user.model.ts` imports:

```typescript
import { AuthUser, CreateUserDto, ListQuery, Paginated, ReviewUserInput, Role, isPaginated } from '@nongchang/shared';
```

Add these exports after `buildUserScopedWhere`:

```typescript
export const DEFAULT_USER_LIST_CAP = 500;

export const USER_LIST_SELECT = {
  id: true,
  username: true,
  role: true,
  agentId: true,
  displayName: true,
  status: true,
} as const;

export const MERCHANT_USER_LIST_SELECT = {
  id: true,
  username: true,
  displayName: true,
  phone: true,
  status: true,
  agentId: true,
  createdAt: true,
} as const;

export const PENDING_USER_LIST_SELECT = {
  id: true,
  displayName: true,
  phone: true,
  createdAt: true,
} as const;

export interface MerchantListRow {
  id: string;
  username: string;
  displayName: string;
  phone: string | null;
  status: string;
  agentId: string | null;
  createdAt: Date;
}

export interface MerchantFieldAggregateRow {
  ownerId: string;
  _count: { _all: number };
  _sum: { area: number | null };
}

export function resolveUserListPagination(query?: ListQuery): { paginated: boolean; page: number; pageSize: number; skip: number; take: number } {
  const paginated = isPaginated(query);
  const page = query?.page ?? 1;
  const pageSize = query?.pageSize ?? 20;
  return {
    paginated,
    page,
    pageSize,
    skip: paginated ? (page - 1) * pageSize : 0,
    take: paginated ? pageSize : DEFAULT_USER_LIST_CAP,
  };
}

export function buildUserListFindManyArgs(where: Record<string, unknown>, query?: ListQuery) {
  const pagination = resolveUserListPagination(query);
  return { where, select: USER_LIST_SELECT, orderBy: { createdAt: 'desc' as const }, skip: pagination.skip, take: pagination.take };
}

export function buildMerchantListWhere(actor: AuthUser): Record<string, unknown> {
  return { ...buildUserScopedWhere(actor), role: Role.MERCHANT, status: { not: 'pending' } };
}

export function buildMerchantListFindManyArgs(where: Record<string, unknown>, query?: ListQuery) {
  const pagination = resolveUserListPagination(query);
  return { where, orderBy: { createdAt: 'desc' as const }, select: MERCHANT_USER_LIST_SELECT, skip: pagination.skip, take: pagination.take };
}

export function buildPendingMerchantListWhere(actor: AuthUser): Record<string, unknown> {
  return { ...buildUserScopedWhere(actor), role: Role.MERCHANT, status: 'pending' };
}

export function buildPendingMerchantListFindManyArgs(where: Record<string, unknown>, query?: ListQuery) {
  const pagination = resolveUserListPagination(query);
  return { where, orderBy: { createdAt: 'desc' as const }, select: PENDING_USER_LIST_SELECT, skip: pagination.skip, take: pagination.take };
}

export function toPaginatedUserList<T>(items: T[], total: number, query?: ListQuery): Paginated<T> {
  const { page, pageSize } = resolveUserListPagination(query);
  return { items, total, page, pageSize };
}

export function getMerchantIds(merchants: Array<{ id: string }>): string[] {
  return merchants.map(merchant => merchant.id);
}

export function buildMerchantFieldAggregateWhere(tenantId: string, merchantIds: string[]): { tenantId: string; ownerId: { in: string[] } } | null {
  return merchantIds.length ? { tenantId, ownerId: { in: merchantIds } } : null;
}

export function toMerchantListItems(merchants: MerchantListRow[], aggregates: MerchantFieldAggregateRow[]) {
  const byOwner = new Map(aggregates.map(aggregate => [aggregate.ownerId, aggregate]));
  return merchants.map(merchant => {
    const aggregate = byOwner.get(merchant.id);
    return {
      id: merchant.id,
      username: merchant.username,
      displayName: merchant.displayName,
      phone: merchant.phone,
      status: merchant.status,
      agentId: merchant.agentId,
      createdAt: merchant.createdAt.toISOString(),
      fieldCount: aggregate?._count._all ?? 0,
      totalArea: aggregate?._sum.area ?? 0,
    };
  });
}
```

- [ ] **Step 4: Run GREEN model test**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/user/user.model.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Refactor UserService list methods**

Update `packages/backend/src/modules/user/user.service.ts` imports from `./user.model`:

```typescript
  MerchantFieldAggregateRow,
  MerchantListRow,
  buildMerchantFieldAggregateWhere,
  buildMerchantListFindManyArgs,
  buildMerchantListWhere,
  buildPendingMerchantListFindManyArgs,
  buildPendingMerchantListWhere,
  buildUserListFindManyArgs,
  buildUserScopedWhere,
  buildUserStatusUpdateData,
  getMerchantIds,
  resolveCreateUserAgentId,
  resolveUserListPagination,
  reviewActionToStatus,
  toMerchantListItems,
  toPaginatedUserList,
```

Remove local `DEFAULT_LIST_CAP`.

Replace `list()`:

```typescript
  async list(actor: AuthUser, query?: ListQuery): Promise<any[] | Paginated<any>> {
    const where = this.scopedWhere(actor);
    const pagination = resolveUserListPagination(query);
    if (pagination.paginated) {
      const [items, total] = await this.prisma.$transaction([
        this.prisma.user.findMany(buildUserListFindManyArgs(where, query)),
        this.prisma.user.count({ where }),
      ]);
      return toPaginatedUserList(items, total, query);
    }
    return this.prisma.user.findMany(buildUserListFindManyArgs(where, query));
  }
```

Replace `listMerchants()`:

```typescript
  async listMerchants(actor: AuthUser, query?: ListQuery): Promise<any[] | Paginated<any>> {
    const where = buildMerchantListWhere(actor);
    const pagination = resolveUserListPagination(query);
    let merchants: MerchantListRow[];
    let total: number | null = null;
    if (pagination.paginated) {
      const [rows, count] = await this.prisma.$transaction([
        this.prisma.user.findMany(buildMerchantListFindManyArgs(where, query)),
        this.prisma.user.count({ where }),
      ]);
      merchants = rows as MerchantListRow[];
      total = count;
    } else {
      merchants = await this.prisma.user.findMany(buildMerchantListFindManyArgs(where, query)) as MerchantListRow[];
    }
    const items = await this.enrichMerchants(actor, merchants);
    return total === null ? items : toPaginatedUserList(items, total, query);
  }
```

Replace `enrichMerchants()`:

```typescript
  private async enrichMerchants(actor: AuthUser, merchants: MerchantListRow[]): Promise<any[]> {
    const aggregateWhere = buildMerchantFieldAggregateWhere(actor.tenantId, getMerchantIds(merchants));
    const aggregates = aggregateWhere
      ? await this.prisma.field.groupBy({
          by: ['ownerId'],
          where: aggregateWhere,
          _count: { _all: true },
          _sum: { area: true },
        })
      : [];
    return toMerchantListItems(merchants, aggregates as MerchantFieldAggregateRow[]);
  }
```

Replace `listPending()`:

```typescript
  async listPending(actor: AuthUser, query?: ListQuery): Promise<any[] | Paginated<any>> {
    const where = buildPendingMerchantListWhere(actor);
    const pagination = resolveUserListPagination(query);
    if (pagination.paginated) {
      const [items, total] = await this.prisma.$transaction([
        this.prisma.user.findMany(buildPendingMerchantListFindManyArgs(where, query)),
        this.prisma.user.count({ where }),
      ]);
      return toPaginatedUserList(items, total, query);
    }
    return this.prisma.user.findMany(buildPendingMerchantListFindManyArgs(where, query));
  }
```

- [ ] **Step 6: Run focused user tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/user/user.model.spec.ts src/modules/user/user.service.spec.ts
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
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-10-p27-user-list-model-boundary.md packages/backend/src/modules/user/user.model.ts packages/backend/src/modules/user/user.model.spec.ts packages/backend/src/modules/user/user.service.ts
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang commit -m "refactor(backend): extract user list model helpers"
```

Expected: diff checks exit 0 and commit succeeds.

## Self-Review

- Spec coverage: The plan covers general user list args, merchant list where/select/aggregation projection, pending merchant list args, pagination envelopes, service refactor, verification, review, and commit.
- Placeholder scan: No TBD/TODO/fill-in-later placeholders are present.
- Type consistency: Helper names in the implementation and service refactor steps match the test imports and interfaces.
