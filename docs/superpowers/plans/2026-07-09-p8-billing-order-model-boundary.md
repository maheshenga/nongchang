# P8 Billing Order Model Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract deterministic billing order ownership and order-view helpers so self-service purchase, manual pay, cancel, list/get order, and Alipay payment authorization use one tested rule set.

**Architecture:** `BillingService` and `AlipayService` continue to own Prisma, transactions, SDK calls, payment callbacks, and exception flow. A new `billing.model.ts` owns pure purchase/payment buyer resolution, buyer-scoped order filters, and `CreditOrderView` projection.

**Tech Stack:** NestJS services, Vitest, TypeScript, Prisma mocks, existing `@nongchang/shared` billing DTO types.

## Global Constraints

- Do not change billing controller routes, DTO schemas, payment callback behavior, Alipay SDK parameters, transaction bodies, balance/ledger writes, or Prisma select/include shapes.
- Preserve self-service buyer rules: only `AGENT_ADMIN` and `MERCHANT` can buy/pay/cancel their own orders.
- Preserve fail-closed ownership rules: agent admin requires `agentId`; merchant requires `ownerId`; unsupported roles throw `ForbiddenException`.
- Preserve payment authorization: Alipay payment can only be created for an order whose `ownerType` and `ownerId` match the current buyer.
- Preserve order view shape: `planId` defaults to `null`, `planName` is nullable, `paidAt` is ISO string or `null`, `createdAt` is ISO string.
- New production code must follow TDD: failing tests first, verify RED, implement minimal code, verify GREEN.

---

## File Structure

- Create `packages/backend/src/modules/billing/billing.model.ts`
  - Pure helpers for purchase/payment buyer ownership, buyer order filters, and order view projection.
- Create `packages/backend/src/modules/billing/billing.model.spec.ts`
  - Direct tests for helper behavior.
- Modify `packages/backend/src/modules/billing/billing.service.ts`
  - Replace private `resolveBuyer` and `toOrderView` calls with helpers.
- Modify `packages/backend/src/modules/billing/alipay.service.ts`
  - Replace duplicate private `resolveBuyer` with shared helper.

---

### Task 1: Add Billing Model Tests

**Files:**
- Create: `packages/backend/src/modules/billing/billing.model.spec.ts`

**Interfaces:**
- Produces future exports:
  - `resolveBillingBuyer(user: AuthUser, context?: 'purchase' | 'payment'): { ownerType: 'AGENT' | 'MERCHANT'; ownerId: string }`
  - `buildBuyerOrderWhere(user: AuthUser, id?: string): Record<string, string>`
  - `toCreditOrderView(row: CreditOrderRow, planName?: string | null): CreditOrderView`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { Role, type AuthUser } from '@nongchang/shared';
import { buildBuyerOrderWhere, resolveBillingBuyer, toCreditOrderView } from './billing.model';

const actor = (overrides: Partial<AuthUser>): AuthUser => ({
  userId: 'u1',
  tenantId: 't1',
  role: Role.MERCHANT,
  agentId: null,
  ownerId: 'm1',
  sessionVersion: 0,
  ...overrides,
});

describe('billing.model buyer resolution', () => {
  it('resolves agent admin purchases to the agent account', () => {
    expect(resolveBillingBuyer(actor({ role: Role.AGENT_ADMIN, agentId: 'a1', ownerId: null }))).toEqual({
      ownerType: 'AGENT',
      ownerId: 'a1',
    });
  });

  it('resolves merchant purchases to the merchant account', () => {
    expect(resolveBillingBuyer(actor({ role: Role.MERCHANT, ownerId: 'm1' }))).toEqual({
      ownerType: 'MERCHANT',
      ownerId: 'm1',
    });
  });

  it('rejects agent admin purchases without agentId', () => {
    expect(() => resolveBillingBuyer(actor({ role: Role.AGENT_ADMIN, agentId: null, ownerId: null })))
      .toThrow(ForbiddenException);
  });

  it('rejects merchant purchases without ownerId', () => {
    expect(() => resolveBillingBuyer(actor({ role: Role.MERCHANT, ownerId: null })))
      .toThrow(ForbiddenException);
  });

  it('rejects tenant admins from self-service buying', () => {
    expect(() => resolveBillingBuyer(actor({ role: Role.SYSTEM_ADMIN, ownerId: null })))
      .toThrow(ForbiddenException);
  });
});

describe('billing.model order filters', () => {
  it('builds buyer-scoped order list filters', () => {
    expect(buildBuyerOrderWhere(actor({ role: Role.MERCHANT, ownerId: 'm1' }))).toEqual({
      tenantId: 't1',
      ownerType: 'MERCHANT',
      ownerId: 'm1',
    });
  });

  it('builds buyer-scoped order detail filters', () => {
    expect(buildBuyerOrderWhere(actor({ role: Role.AGENT_ADMIN, agentId: 'a1', ownerId: null }), 'o1')).toEqual({
      id: 'o1',
      tenantId: 't1',
      ownerType: 'AGENT',
      ownerId: 'a1',
    });
  });
});

describe('billing.model order views', () => {
  it('projects credit order rows to API views', () => {
    expect(toCreditOrderView({
      id: 'o1',
      ownerType: 'MERCHANT',
      ownerId: 'm1',
      planId: 'p1',
      resource: 'AI',
      quantity: 100,
      amountCents: 1000,
      status: 'PAID',
      paidAt: new Date('2026-01-02T03:04:05.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    }, 'Starter')).toEqual({
      id: 'o1',
      ownerType: 'MERCHANT',
      ownerId: 'm1',
      planId: 'p1',
      planName: 'Starter',
      resource: 'AI',
      quantity: 100,
      amountCents: 1000,
      status: 'PAID',
      paidAt: '2026-01-02T03:04:05.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('normalizes missing planId and paidAt to null', () => {
    const view = toCreditOrderView({
      id: 'o2',
      ownerType: 'AGENT',
      ownerId: 'a1',
      planId: null,
      resource: 'CODE',
      quantity: 10,
      amountCents: 99,
      status: 'PENDING',
      paidAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(view.planId).toBeNull();
    expect(view.planName).toBeNull();
    expect(view.paidAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run RED**

Run: `corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/billing/billing.model.spec.ts`

Expected: FAIL because `./billing.model` does not exist.

---

### Task 2: Implement Billing Model Helpers

**Files:**
- Create: `packages/backend/src/modules/billing/billing.model.ts`

**Interfaces:**
- Consumes: `AuthUser`, `CreditOrderView`, `CreditOwnerType`, `CreditResource`, `Role`.
- Produces helper functions listed in Task 1.

- [ ] **Step 1: Write minimal implementation**

```typescript
import { ForbiddenException } from '@nestjs/common';
import type { AuthUser, CreditOrderView, CreditOwnerType, CreditResource } from '@nongchang/shared';
import { Role } from '@nongchang/shared';

export type BillingBuyer = { ownerType: 'AGENT' | 'MERCHANT'; ownerId: string };
export type BillingBuyerContext = 'purchase' | 'payment';

export interface CreditOrderRow {
  id: string;
  ownerType: CreditOwnerType;
  ownerId: string;
  planId?: string | null;
  resource: CreditResource;
  quantity: number;
  amountCents: number;
  status: string;
  paidAt?: Date | null;
  createdAt: Date;
}

export function resolveBillingBuyer(user: AuthUser, context: BillingBuyerContext = 'purchase'): BillingBuyer {
  if (user.role === Role.AGENT_ADMIN) {
    if (!user.agentId) {
      throw new ForbiddenException(context === 'payment' ? 'agent_admin 缺少 agentId' : 'agent_admin 缺少 agentId,拒绝购买');
    }
    return { ownerType: 'AGENT', ownerId: user.agentId };
  }
  if (user.role === Role.MERCHANT) {
    if (!user.ownerId) {
      throw new ForbiddenException(context === 'payment' ? 'merchant 缺少 ownerId' : 'merchant 缺少 ownerId,拒绝购买');
    }
    return { ownerType: 'MERCHANT', ownerId: user.ownerId };
  }
  throw new ForbiddenException(context === 'payment' ? '当前角色不支持支付' : '当前角色不支持自助购买额度');
}

export function buildBuyerOrderWhere(user: AuthUser, id?: string): Record<string, string> {
  const buyer = resolveBillingBuyer(user);
  return {
    ...(id ? { id } : {}),
    tenantId: user.tenantId,
    ownerType: buyer.ownerType,
    ownerId: buyer.ownerId,
  };
}

export function toCreditOrderView(row: CreditOrderRow, planName: string | null = null): CreditOrderView {
  return {
    id: row.id,
    ownerType: row.ownerType,
    ownerId: row.ownerId,
    planId: row.planId ?? null,
    planName,
    resource: row.resource,
    quantity: row.quantity,
    amountCents: row.amountCents,
    status: row.status,
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
```

- [ ] **Step 2: Run GREEN**

Run: `corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/billing/billing.model.spec.ts`

Expected: PASS.

---

### Task 3: Wire BillingService and AlipayService

**Files:**
- Modify: `packages/backend/src/modules/billing/billing.service.ts`
- Modify: `packages/backend/src/modules/billing/alipay.service.ts`
- Test: `packages/backend/src/modules/billing/billing.model.spec.ts`
- Test: `packages/backend/src/modules/billing/billing.service.spec.ts`
- Test: `packages/backend/src/modules/billing/alipay.service.spec.ts`

**Interfaces:**
- Consumes Task 2 helpers.
- Produces unchanged billing and payment behavior.

- [ ] **Step 1: Update imports**

In `billing.service.ts` import:

```typescript
import { buildBuyerOrderWhere, resolveBillingBuyer, toCreditOrderView } from './billing.model';
```

In `alipay.service.ts` import:

```typescript
import { resolveBillingBuyer } from './billing.model';
```

- [ ] **Step 2: Replace duplicate buyer/view logic**

Apply these substitutions:

```typescript
// BillingService.createOrder/payOrder/cancelOrder:
const buyer = resolveBillingBuyer(user);

// BillingService.listOrders:
const where: any = buildBuyerOrderWhere(user);
if (query.status) where.status = query.status;

// BillingService.getOrder:
where: buildBuyerOrderWhere(user, id)

// BillingService order projections:
return toCreditOrderView(order, planName);

// AlipayService.createPayment:
const buyer = resolveBillingBuyer(user, 'payment');
```

Remove the private `BillingService.resolveBuyer`, private `BillingService.toOrderView`, and private `AlipayService.resolveBuyer` methods after replacing all call sites.

- [ ] **Step 3: Run focused tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/billing/billing.model.spec.ts src/modules/billing/billing.service.spec.ts src/modules/billing/alipay.service.spec.ts
```

Expected: PASS.

---

### Task 4: Verify, Review, and Commit

**Files:**
- Review: `docs/superpowers/plans/2026-07-09-p8-billing-order-model-boundary.md`
- Review: `packages/backend/src/modules/billing/billing.model.ts`
- Review: `packages/backend/src/modules/billing/billing.model.spec.ts`
- Review: `packages/backend/src/modules/billing/billing.service.ts`
- Review: `packages/backend/src/modules/billing/alipay.service.ts`

- [ ] **Step 1: Run full backend verification**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend build
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit
git -c safe.directory=E:/code/nongchang diff --check
```

Expected: build exits 0; backend unit suite passes; diff check has no errors other than possible CRLF warnings.

- [ ] **Step 2: Request code review**

Reviewer scope:

```text
Review P8 billing order model boundary. Ensure no route/DTO/Alipay SDK/payment callback/transaction/balance/ledger behavior changed. Verify BillingService and AlipayService now share buyer resolution without changing self-service purchase/payment authorization. Verify order view output shape remains unchanged.
```

- [ ] **Step 3: Commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p8-billing-order-model-boundary.md packages/backend/src/modules/billing/billing.model.ts packages/backend/src/modules/billing/billing.model.spec.ts packages/backend/src/modules/billing/billing.service.ts packages/backend/src/modules/billing/alipay.service.ts
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang commit -m "refactor(backend): extract billing order model helpers"
```

Expected: commit succeeds after review issues are resolved.

---

## Self-Review

- Spec coverage: The plan covers shared buyer resolution, buyer-scoped order filters, order view projection, service wiring, payment authorization reuse, verification, review, and commit.
- Placeholder scan: No TBD/TODO/fill-in placeholders. All commands and code snippets are concrete.
- Type consistency: Helper names and signatures match across tests, implementation, service wiring, and review scope.
