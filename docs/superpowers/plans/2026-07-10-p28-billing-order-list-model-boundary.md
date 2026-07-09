# P28 Billing Order List Model Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract `/billing/orders` list query and response projection helpers from `BillingService.listOrders()` into `billing.model.ts`.

**Architecture:** Keep Prisma execution and `Promise.all` orchestration in `BillingService`. Move deterministic query where merging, include/select constants, pagination args, and paginated order response projection into `billing.model.ts`.

**Tech Stack:** NestJS service, Prisma-style args, Vitest, shared `OrderQuery`, `PaginatedOrders`, `CreditOrderView`, `AuthUser`.

## Global Constraints

- Do not change billing routes, DTO schemas, authorization, payment, settlement, plan, account, ledger, or webhook behavior.
- Preserve buyer scoping through `buildBuyerOrderWhere(user)`.
- Preserve optional status filter: only add `where.status` when `query.status` is present.
- Preserve pagination: `skip = (query.page - 1) * query.pageSize`, `take = query.pageSize`, envelope `{ items, total, page, pageSize }`.
- Preserve plan include: `{ plan: { select: { name: true } } }`.
- Keep Prisma calls in `BillingService`.
- Use TDD: write failing model/service tests first, verify RED, implement minimal code, verify GREEN.

---

### Task 1: Billing order list helpers

**Files:**
- Modify: `packages/backend/src/modules/billing/billing.model.spec.ts`
- Modify: `packages/backend/src/modules/billing/billing.service.spec.ts`
- Modify: `packages/backend/src/modules/billing/billing.model.ts`
- Modify: `packages/backend/src/modules/billing/billing.service.ts`

**Interfaces:**
- Consumes: `AuthUser`, `OrderQuery`, `PaginatedOrders`, existing `CreditOrderRow`, `buildBuyerOrderWhere`, `toCreditOrderView`.
- Produces:
  - `CREDIT_ORDER_PLAN_INCLUDE`
  - `buildBuyerOrderListWhere(user: AuthUser, query: Pick<OrderQuery, 'status'>): Record<string, unknown>`
  - `buildBuyerOrderListFindManyArgs(where: Record<string, unknown>, query: OrderQuery)`
  - `toPaginatedCreditOrders(rows: CreditOrderWithPlanRow[], total: number, query: OrderQuery): PaginatedOrders`

- [ ] **Step 1: Write failing model tests**

Update `packages/backend/src/modules/billing/billing.model.spec.ts` imports:

```typescript
import {
  CREDIT_ORDER_PLAN_INCLUDE,
  buildBuyerOrderListFindManyArgs,
  buildBuyerOrderListWhere,
  buildBuyerOrderWhere,
  resolveBillingBuyer,
  toCreditOrderView,
  toPaginatedCreditOrders,
} from './billing.model';
```

Add tests:

```typescript
describe('billing.model order list helpers', () => {
  it('adds optional order status to buyer-scoped list filters', () => {
    expect(buildBuyerOrderListWhere(actor({ role: Role.MERCHANT, ownerId: 'm1' }), { status: 'PAID' })).toEqual({
      tenantId: 't1',
      ownerType: 'MERCHANT',
      ownerId: 'm1',
      status: 'PAID',
    });
    expect(buildBuyerOrderListWhere(actor({ role: Role.MERCHANT, ownerId: 'm1' }), {})).toEqual({
      tenantId: 't1',
      ownerType: 'MERCHANT',
      ownerId: 'm1',
    });
  });

  it('builds order list findMany args with plan include and pagination', () => {
    const where = { tenantId: 't1', ownerType: 'MERCHANT', ownerId: 'm1', status: 'PENDING' };

    expect(buildBuyerOrderListFindManyArgs(where, { status: 'PENDING', page: 3, pageSize: 25 })).toEqual({
      where,
      orderBy: { createdAt: 'desc' },
      skip: 50,
      take: 25,
      include: CREDIT_ORDER_PLAN_INCLUDE,
    });
  });

  it('projects paginated orders with plan names', () => {
    expect(toPaginatedCreditOrders([
      {
        id: 'o1',
        ownerType: 'MERCHANT',
        ownerId: 'm1',
        planId: 'p1',
        resource: 'AI',
        quantity: 100,
        amountCents: 1000,
        status: 'PAID',
        paidAt: new Date('2026-01-02T00:00:00.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        plan: { name: 'Starter' },
      },
      {
        id: 'o2',
        ownerType: 'MERCHANT',
        ownerId: 'm1',
        planId: null,
        resource: 'CODE',
        quantity: 10,
        amountCents: 99,
        status: 'PENDING',
        paidAt: null,
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
        plan: null,
      },
    ], 7, { page: 2, pageSize: 2 })).toEqual({
      items: [
        expect.objectContaining({ id: 'o1', planName: 'Starter', paidAt: '2026-01-02T00:00:00.000Z' }),
        expect.objectContaining({ id: 'o2', planName: null, paidAt: null }),
      ],
      total: 7,
      page: 2,
      pageSize: 2,
    });
  });
});
```

- [ ] **Step 2: Write failing service test**

Add a `BillingService.listOrders` block before `BillingService.getOrder` in `packages/backend/src/modules/billing/billing.service.spec.ts`:

```typescript
describe('BillingService.listOrders', () => {
  const baseOrder = {
    id: 'o1',
    tenantId: 't1',
    ownerType: 'MERCHANT',
    ownerId: 'm1',
    planId: 'p1',
    resource: 'AI',
    quantity: 100,
    amountCents: 1000,
    status: 'PAID',
    paidAt: new Date('2026-07-07T00:00:00.000Z'),
    createdAt: new Date('2026-07-06T00:00:00.000Z'),
    plan: { name: 'AI100' },
  };

  function listOrdersPrisma(rows = [baseOrder], total = rows.length) {
    return {
      creditOrder: {
        findMany: vi.fn().mockResolvedValue(rows),
        count: vi.fn().mockResolvedValue(total),
      },
    } as any;
  }

  it('lists current buyer orders with optional status and pagination', async () => {
    const prisma = listOrdersPrisma([baseOrder], 3);
    const out = await new BillingService(prisma).listOrders(merchant, { status: 'PAID', page: 2, pageSize: 1 });

    expect(prisma.creditOrder.findMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', ownerType: 'MERCHANT', ownerId: 'm1', status: 'PAID' },
      orderBy: { createdAt: 'desc' },
      skip: 1,
      take: 1,
      include: { plan: { select: { name: true } } },
    });
    expect(prisma.creditOrder.count).toHaveBeenCalledWith({
      where: { tenantId: 't1', ownerType: 'MERCHANT', ownerId: 'm1', status: 'PAID' },
    });
    expect(out).toEqual({
      items: [expect.objectContaining({ id: 'o1', planName: 'AI100', status: 'PAID' })],
      total: 3,
      page: 2,
      pageSize: 1,
    });
  });
});
```

- [ ] **Step 3: Run RED tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/billing/billing.model.spec.ts src/modules/billing/billing.service.spec.ts
```

Expected: FAIL because the new billing model list helper exports do not exist.

- [ ] **Step 4: Implement helpers**

Add to `packages/backend/src/modules/billing/billing.model.ts` imports:

```typescript
import type { AuthUser, CreditOrderView, OrderQuery, PaginatedOrders } from '@nongchang/shared';
```

Add after `CreditOrderRow`:

```typescript
export interface CreditOrderWithPlanRow extends CreditOrderRow {
  plan?: { name: string } | null;
}

export const CREDIT_ORDER_PLAN_INCLUDE = { plan: { select: { name: true } } } as const;

export function buildBuyerOrderListWhere(user: AuthUser, query: Pick<OrderQuery, 'status'>): Record<string, unknown> {
  return { ...buildBuyerOrderWhere(user), ...(query.status ? { status: query.status } : {}) };
}

export function buildBuyerOrderListFindManyArgs(where: Record<string, unknown>, query: OrderQuery) {
  return {
    where,
    orderBy: { createdAt: 'desc' as const },
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
    include: CREDIT_ORDER_PLAN_INCLUDE,
  };
}

export function toPaginatedCreditOrders(rows: CreditOrderWithPlanRow[], total: number, query: OrderQuery): PaginatedOrders {
  return {
    items: rows.map(row => toCreditOrderView(row, row.plan?.name ?? null)),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}
```

- [ ] **Step 5: Refactor service**

Update `packages/backend/src/modules/billing/billing.service.ts` import from `./billing.model`:

```typescript
import {
  CreditOrderWithPlanRow,
  buildBuyerOrderListFindManyArgs,
  buildBuyerOrderListWhere,
  buildBuyerOrderWhere,
  resolveBillingBuyer,
  toCreditOrderView,
  toPaginatedCreditOrders,
} from './billing.model';
```

Replace `listOrders()`:

```typescript
  async listOrders(user: AuthUser, query: OrderQuery): Promise<PaginatedOrders> {
    const where = buildBuyerOrderListWhere(user, query);
    const [rows, total] = await Promise.all([
      this.prisma.creditOrder.findMany(buildBuyerOrderListFindManyArgs(where, query)),
      this.prisma.creditOrder.count({ where }),
    ]);
    return toPaginatedCreditOrders(rows as CreditOrderWithPlanRow[], total, query);
  }
```

- [ ] **Step 6: Verify focused and full backend**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/billing/billing.model.spec.ts src/modules/billing/billing.service.spec.ts
corepack pnpm@10.33.2 --filter @nongchang/backend build
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit
```

Expected: all commands exit 0.

- [ ] **Step 7: Review, stage, and commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang diff --check
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-10-p28-billing-order-list-model-boundary.md packages/backend/src/modules/billing/billing.model.ts packages/backend/src/modules/billing/billing.model.spec.ts packages/backend/src/modules/billing/billing.service.ts packages/backend/src/modules/billing/billing.service.spec.ts
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang commit -m "refactor(backend): extract billing order list helpers"
```

Expected: diff checks exit 0 and commit succeeds.

## Self-Review

- Spec coverage: Plan covers order list status filters, findMany args, plan include, response projection, service orchestration, verification, and commit.
- Placeholder scan: No TBD/TODO/fill-in-later placeholders are present.
- Type consistency: Helper names and signatures match imports, tests, and service refactor steps.
