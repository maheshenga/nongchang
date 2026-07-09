# P29 Billing Account List Model Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract `BillingService.listAccounts()` pure query/projection logic into billing model helpers while preserving account list behavior.

**Architecture:** Keep Prisma calls, transactions, and role branching in `BillingService`. Move deterministic pagination, subordinate where/select construction, credit-account balance where construction, and `CreditAccountItem` projection into `billing.model.ts`.

**Tech Stack:** NestJS service, Prisma-style args, Vitest, shared `AuthUser`, `CreditOwnerType`, `CreditAccountItem`, `ListQuery`, `Paginated`, `Role`.

## Global Constraints

- Do not change billing routes, DTO schemas, authorization, balance semantics, payment, ledger, orders, plans, or webhooks.
- Preserve `SYSTEM_ADMIN`: list agents in current tenant and show their `AGENT` balances.
- Preserve `AGENT_ADMIN`: require `agentId`, list merchants under that agent and show their `MERCHANT` balances.
- Preserve `MERCHANT`: no subordinates, return `[]` or paginated empty envelope.
- Preserve non-paginated cap: `500`.
- Preserve pagination defaults: page `1`, pageSize `20`.
- Preserve pending ids for missing account rows: `pending:AGENT:<id>` and `pending:MERCHANT:<id>`.
- Keep Prisma execution in service.
- Use TDD: write failing model tests first, verify RED, implement minimal code, verify GREEN.

---

### Task 1: Billing account list helpers

**Files:**
- Modify: `packages/backend/src/modules/billing/billing.model.spec.ts`
- Modify: `packages/backend/src/modules/billing/billing.model.ts`
- Modify: `packages/backend/src/modules/billing/billing.service.ts`

**Interfaces:**
- Produces:
  - `DEFAULT_BILLING_ACCOUNT_LIST_CAP`
  - `ACCOUNT_AGENT_SELECT`
  - `ACCOUNT_MERCHANT_SELECT`
  - `resolveBillingAccountListPagination(query?: ListQuery)`
  - `buildSubordinateAgentListWhere(user: AuthUser)`
  - `buildSubordinateMerchantListWhere(user: AuthUser)`
  - `buildSubordinateAgentListFindManyArgs(where, query?)`
  - `buildSubordinateMerchantListFindManyArgs(where, query?)`
  - `getSubordinateOwnerIds(rows)`
  - `buildCreditAccountBalanceWhere(ownerType, ownerIds, tenantId)`
  - `toAgentCreditAccountItems(rows, balances)`
  - `toMerchantCreditAccountItems(rows, balances)`
  - `toPaginatedCreditAccountItems(items, total, query?)`

- [x] **Step 1: Write failing model tests**

Add imports in `billing.model.spec.ts`:

```typescript
  ACCOUNT_AGENT_SELECT,
  ACCOUNT_MERCHANT_SELECT,
  DEFAULT_BILLING_ACCOUNT_LIST_CAP,
  buildCreditAccountBalanceWhere,
  buildSubordinateAgentListFindManyArgs,
  buildSubordinateAgentListWhere,
  buildSubordinateMerchantListFindManyArgs,
  buildSubordinateMerchantListWhere,
  getSubordinateOwnerIds,
  resolveBillingAccountListPagination,
  toAgentCreditAccountItems,
  toMerchantCreditAccountItems,
  toPaginatedCreditAccountItems,
```

Add tests:

```typescript
describe('billing.model account list helpers', () => {
  it('builds subordinate list args for platform and agent admins', () => {
    const sysWhere = buildSubordinateAgentListWhere(actor({ role: Role.SYSTEM_ADMIN }));
    const merchantWhere = buildSubordinateMerchantListWhere(actor({ role: Role.AGENT_ADMIN, agentId: 'a1', ownerId: null }));

    expect(resolveBillingAccountListPagination()).toEqual({
      paginated: false,
      page: 1,
      pageSize: 20,
      skip: 0,
      take: DEFAULT_BILLING_ACCOUNT_LIST_CAP,
    });
    expect(buildSubordinateAgentListFindManyArgs(sysWhere, { page: 2, pageSize: 10 })).toEqual({
      where: { tenantId: 't1' },
      orderBy: { createdAt: 'desc' },
      skip: 10,
      take: 10,
      select: ACCOUNT_AGENT_SELECT,
    });
    expect(buildSubordinateMerchantListFindManyArgs(merchantWhere)).toEqual({
      where: { tenantId: 't1', role: Role.MERCHANT, agentId: 'a1' },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: DEFAULT_BILLING_ACCOUNT_LIST_CAP,
      select: ACCOUNT_MERCHANT_SELECT,
    });
  });

  it('rejects agent account listing without agentId before querying', () => {
    expect(() => buildSubordinateMerchantListWhere(actor({ role: Role.AGENT_ADMIN, agentId: null, ownerId: null })))
      .toThrow(ForbiddenException);
  });

  it('builds balance lookup where and account list projections', () => {
    const balances = new Map([
      ['a1', { id: 'accA1', aiBalance: 30, codeBalance: 40 }],
      ['m2', { id: 'accM2', aiBalance: 5, codeBalance: 0 }],
    ]);

    expect(getSubordinateOwnerIds([{ id: 'a1' }, { id: 'a2' }])).toEqual(['a1', 'a2']);
    expect(buildCreditAccountBalanceWhere('AGENT', [], 't1')).toBeNull();
    expect(buildCreditAccountBalanceWhere('AGENT', ['a1', 'a2'], 't1')).toEqual({
      tenantId: 't1',
      ownerType: 'AGENT',
      ownerId: { in: ['a1', 'a2'] },
    });
    expect(toAgentCreditAccountItems([
      { id: 'a1', name: 'Agent One' },
      { id: 'a2', name: 'Agent Two' },
    ], balances)).toEqual([
      { id: 'accA1', ownerType: 'AGENT', ownerId: 'a1', ownerName: 'Agent One', aiBalance: 30, codeBalance: 40 },
      { id: 'pending:AGENT:a2', ownerType: 'AGENT', ownerId: 'a2', ownerName: 'Agent Two', aiBalance: 0, codeBalance: 0 },
    ]);
    expect(toMerchantCreditAccountItems([
      { id: 'm1', displayName: null },
      { id: 'm2', displayName: 'Merchant Two' },
    ], balances)).toEqual([
      { id: 'pending:MERCHANT:m1', ownerType: 'MERCHANT', ownerId: 'm1', ownerName: 'm1', aiBalance: 0, codeBalance: 0 },
      { id: 'accM2', ownerType: 'MERCHANT', ownerId: 'm2', ownerName: 'Merchant Two', aiBalance: 5, codeBalance: 0 },
    ]);
  });

  it('builds paginated account envelopes', () => {
    const items = [{ id: 'accA1', ownerType: 'AGENT' as const, ownerId: 'a1', ownerName: 'Agent One', aiBalance: 1, codeBalance: 2 }];

    expect(toPaginatedCreditAccountItems(items, 3, { page: 2, pageSize: 1 })).toEqual({
      items,
      total: 3,
      page: 2,
      pageSize: 1,
    });
  });
});
```

- [x] **Step 2: Run RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/billing/billing.model.spec.ts
```

Expected: FAIL because new account list helpers do not exist.

- [x] **Step 3: Implement helpers and refactor service**

Add helpers to `billing.model.ts` and update `BillingService.listAccounts()`/`loadBalances()` to use them. Service should still branch by role and execute Prisma calls.

- [x] **Step 4: Verify**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/billing/billing.model.spec.ts src/modules/billing/billing.service.spec.ts
corepack pnpm@10.33.2 --filter @nongchang/backend build
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit
```

- [x] **Step 5: Review, stage, commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang diff --check
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-10-p29-billing-account-list-model-boundary.md packages/backend/src/modules/billing/billing.model.ts packages/backend/src/modules/billing/billing.model.spec.ts packages/backend/src/modules/billing/billing.service.ts
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang commit -m "refactor(backend): extract billing account list helpers"
```

## Self-Review

- Spec coverage: Covers role-specific account list args, missing agentId fail-closed behavior, balance lookup where, missing-account pending ids, paginated envelope, verification, and commit.
- Placeholder scan: No TBD/TODO/fill-in-later placeholders are present.
- Type consistency: Helper names in tests match the planned service imports.
