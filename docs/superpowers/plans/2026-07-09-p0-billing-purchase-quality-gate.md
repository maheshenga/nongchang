# BillingPurchase P0 Quality Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the web quality gate by fixing the `BillingPurchase` regression tests and aligning the tenant purchase surface with the shared Microsoft Fluent UI primitives without changing payment behavior.

**Architecture:** Keep the purchase flow inside `BillingPurchase.tsx` for this P0 slice, because the component already owns plan loading, order loading, purchase, retry payment, and cancel actions. The test file becomes the executable contract for the commercial path: fixed-plan purchase, pending-order retry/cancel, and Fluent source boundary.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Vitest 2, Testing Library, existing `web` package scripts, existing `packages/web/src/ui/fluent.ts` and `packages/web/src/ui/state.tsx`.

## Global Constraints

- Use CodeGraph before grep/file search for code discovery because `.codegraph/` exists and `AGENTS.md` requires it.
- Use TDD: verify the current tests fail before production changes, then make the smallest component changes that satisfy them.
- Do not change billing API contracts or payment launch semantics.
- Do not introduce new dependencies.
- Keep edits scoped to this plan, `BillingPurchase.tsx`, and `BillingPurchase.spec.tsx`.
- Preserve payment behavior: `createOrder` first, `createPayment` second, then launch via `redirectToAlipayUrl` for `payUrl` or `submitAlipayForm` for `formHtml`.
- Run focused tests, `web lint`, `web test`, `web build`, residue scans, encoding checks, and `git diff --check` before commit.

---

## File Structure

- Create: `docs/superpowers/plans/2026-07-09-p0-billing-purchase-quality-gate.md`
  - Documents this P0 plan and verification gates.
- Modify: `packages/web/src/components/BillingPurchase.spec.tsx`
  - Fix the `CreditOrderView` fixture to match shared DTO types.
  - Use unambiguous Testing Library queries so behavior tests prove the flow rather than failing on duplicate text.
  - Keep the source-boundary test that requires Fluent primitives and rejects legacy emerald/slate tokens.
- Modify: `packages/web/src/components/BillingPurchase.tsx`
  - Import shared Fluent and state helpers.
  - Replace legacy emerald/slate card styles with `fluentButton`, `fluentInput`, `fluentSelect`, `fluentStatusTag`, `fluentTable`, `LoadingState`, `EmptyState`, and `ErrorState`.
  - Preserve all order/payment/cancel behavior.

---

### Task 1: Stabilize the Failing Regression Tests

**Files:**
- Modify: `packages/web/src/components/BillingPurchase.spec.tsx`

**Interfaces:**
- Consumes: `CreditOrderView` from `@nongchang/shared`.
- Produces: a focused regression suite that compiles and fails only on the still-unimplemented Fluent boundary before component changes.

- [x] **Step 1: Verify current RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/BillingPurchase.spec.tsx
corepack pnpm@10.33.2 --filter web lint
```

Expected:
- Vitest fails because duplicate `AI Pack 100` text makes `findByText` ambiguous and the source-boundary test cannot find `../ui/fluent`.
- Lint fails because the order fixture contains `tenantId`, which is not part of `CreditOrderView`.

- [x] **Step 2: Fix the test fixture**

Update `pendingOrder` to use the exact shared DTO shape:

```typescript
const pendingOrder: CreditOrderView = {
  id: 'order-pending-1',
  ownerId: 'owner-1',
  ownerType: 'MERCHANT',
  planId: 'plan-ai-100',
  planName: 'AI Pack 100',
  resource: 'AI',
  quantity: 100,
  amountCents: 1000,
  status: 'PENDING',
  paidAt: null,
  createdAt: '2026-07-01T00:00:00.000Z',
};
```

Update the cancel mock status to the DTO spelling:

```typescript
billingApiMock.cancelOrder.mockResolvedValue({ ...pendingOrder, status: 'CANCELLED' });
```

- [x] **Step 3: Fix ambiguous queries**

For fixed-plan purchase, use the first visible purchase command:

```typescript
await screen.findAllByText('AI Pack 100');
const purchaseButton = screen.getAllByRole('button', { name: /购买/ })[0];
fireEvent.click(purchaseButton);
```

For pending-order actions, find the text node that belongs to a table row:

```typescript
await screen.findAllByText('AI Pack 100');
const orderRow = screen.getAllByText('AI Pack 100').find((node) => node.closest('tr'))?.closest('tr');
expect(orderRow).toBeTruthy();
const rowButtons = within(orderRow as HTMLElement).getAllByRole('button');
```

- [x] **Step 4: Verify the test is now a useful RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/BillingPurchase.spec.tsx
```

Expected:
- Purchase and pending-order behavior tests pass against the current component.
- Source-boundary test still fails because `BillingPurchase.tsx` still lacks Fluent imports and contains legacy style tokens.

---

### Task 2: Align BillingPurchase with Fluent Without Changing Semantics

**Files:**
- Modify: `packages/web/src/components/BillingPurchase.tsx`
- Test: `packages/web/src/components/BillingPurchase.spec.tsx`

**Interfaces:**
- Consumes: `fluentButton`, `fluentInput`, `fluentSelect`, `fluentStatusTag`, `fluentTable`, `LoadingState`, `EmptyState`, `ErrorState`.
- Produces: the same purchase behavior with a Fluent-styled surface and passing P0 regression tests.

- [x] **Step 1: Replace imports**

Add:

```typescript
import { fluentButton, fluentInput, fluentSelect, fluentStatusTag, fluentTable } from '../ui/fluent';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';
```

Remove the local `inputCls` helper after migrating the inputs and selects.

- [x] **Step 2: Replace legacy surfaces**

Use these mappings:

```typescript
root: 'border border-[#E1DFDD] bg-white'
header: 'border-b border-[#E1DFDD] bg-[#FAFAFA]'
primary actions: fluentButton('primary')
secondary actions: fluentButton('secondary')
subtle inline actions: fluentButton('subtle')
danger/cancel action: fluentButton('danger')
inputs: fluentInput
selects: fluentSelect
orders table: fluentTable.wrapper/table/thead/th/row/td
loading: LoadingState
empty: EmptyState
errors: ErrorState
```

- [x] **Step 3: Preserve exact payment behavior**

Keep these behavior blocks semantically unchanged:

```typescript
const order = await createOrder({ planId: plan.id });
const channel = isMobile() ? 'WAP' : 'PC';
const pay = await createPayment({ orderId: order.id, channel });
launchAlipay(pay.payUrl, pay.formHtml);
```

```typescript
const p = await createPayment({ orderId, channel });
launchAlipay(p.payUrl, p.formHtml);
```

```typescript
await cancelOrder(orderId);
await reload();
```

- [x] **Step 4: Verify focused GREEN**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/BillingPurchase.spec.tsx src/components/BillingAdmin.spec.tsx
```

Expected: all focused tests pass.

---

### Task 3: Verify, Review, and Commit P0

**Files:**
- Review all modified files from `git diff --stat` and `git diff --check`.

**Interfaces:**
- Consumes: completed Task 1 and Task 2.
- Produces: committed P0 fix.

- [x] **Step 1: Run validation**

Run:

```powershell
corepack pnpm@10.33.2 --filter web lint
corepack pnpm@10.33.2 --filter web test
corepack pnpm@10.33.2 --filter web build
```

Expected:
- Lint passes.
- Web tests pass.
- Build passes. Existing `DashboardDemo` chunk-size warning may remain and is not part of this P0.

- [x] **Step 2: Run residue and encoding checks**

Run:

```powershell
rg -n "rounded-xl|bg-emerald-600|hover:bg-emerald-700|border-slate|text-slate|bg-slate" packages/web/src/components/BillingPurchase.tsx
git -c safe.directory=E:/code/nongchang diff --check
```

Expected:
- No residue matches in `BillingPurchase.tsx`.
- `git diff --check` reports no whitespace errors.

Run a UTF-8/no-BOM/no-replacement-character check for:

```text
docs/superpowers/plans/2026-07-09-p0-billing-purchase-quality-gate.md
packages/web/src/components/BillingPurchase.tsx
packages/web/src/components/BillingPurchase.spec.tsx
```

- [x] **Step 3: Manual review**

Check:
- `BillingPurchase.tsx` imports from `../ui/fluent`.
- `BillingPurchase.tsx` keeps `createOrder`, `createPayment`, `cancelOrder`, `redirectToAlipayUrl`, and `submitAlipayForm` behavior.
- The spec covers fixed-plan purchase, pending-order retry, pending-order cancel, and Fluent boundary.
- No unrelated files are modified.

- [x] **Step 4: Commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p0-billing-purchase-quality-gate.md packages/web/src/components/BillingPurchase.tsx packages/web/src/components/BillingPurchase.spec.tsx
git -c safe.directory=E:/code/nongchang commit -m "refactor(web): stabilize billing purchase flow"
```

---

## Self-Review

**Spec coverage:** The plan addresses the highest-priority current failure: quality gate red from `BillingPurchase.spec.tsx`, plus the commercial purchase path still using legacy UI tokens.

**Placeholder scan:** No step uses TBD/TODO/fill-in placeholders; each task has exact files, commands, expected outcomes, and code snippets.

**Type consistency:** `CreditOrderView` fields match the shared DTO error reported by TypeScript: `ownerId`, `ownerType`, `paidAt`, and no `tenantId`. Fluent helper names match `packages/web/src/ui/fluent.ts`.

## Execution Choice

Subagent tools are not exposed in this Codex App session, so this plan will be executed inline using `executing-plans` with TDD checkpoints and verification gates.
