# Billing Module Fluent and Text Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the P1 billing UI slice by moving the remaining billing surfaces to shared Fluent primitives and ensuring all user-visible billing text is readable Chinese.

**Architecture:** Keep this as a narrow UI integrity refactor. Source-boundary tests prevent legacy card tokens and mojibake from returning, while focused behavior tests preserve plan management, ledger filtering, Alipay configuration, and payment-result polling.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Vitest 2, Testing Library, existing billing API wrappers, `packages/web/src/ui/fluent.ts`, `packages/web/src/ui/state.tsx`, and existing pagination helpers.

## Global Constraints

- Use CodeGraph before grep/file search for code discovery because `.codegraph/` exists and `AGENTS.md` requires it.
- Use TDD: add or update failing tests first, verify RED, then change production code.
- Do not change billing API contracts, polling intervals, payment semantics, or Alipay config save semantics.
- Do not introduce new dependencies.
- Keep edits scoped to this P1 plan and billing UI/test files.
- Repair mojibake text in touched billing surfaces; no `鏀`, `濂`, `璐`, `绠`, `鐮`, `鐘`, `椤`, `鈥`, `姝`, `灏`, `閺`, `婵`, `鐠`, `缁`, `閻`, `妞`, or `閳` artifacts should remain in the touched billing files unless part of a test fixture explicitly asserting absence.
- Run focused tests, `web lint`, `web test`, `web build`, residue scans, encoding checks, and `git diff --check` before commit.

---

## File Structure

- Create: `packages/web/src/components/BillingFluentSurfaces.spec.tsx`
  - Source-boundary and text-integrity tests for `BillingPlans.tsx`, `BillingLedger.tsx`, `BillingAlipayConfig.tsx`, and `PayResult.tsx`.
- Modify: `packages/web/src/components/BillingPlans.spec.tsx`
  - Preserve pagination behavior and add readable Chinese assertions only if needed.
- Modify: `packages/web/src/components/PayResult.spec.tsx`
  - Assert readable Chinese payment-result text.
- Modify: `packages/web/src/components/BillingPlans.tsx`
  - Use shared Fluent buttons, fields, table, status tags, and state helpers.
- Modify: `packages/web/src/components/BillingLedger.tsx`
  - Use shared Fluent filters, table, pagination controls, and state helpers.
- Modify: `packages/web/src/components/BillingAlipayConfig.tsx`
  - Use shared Fluent form controls, status tags, loading/error states, and save action.
- Modify: `packages/web/src/components/PayResult.tsx`
  - Use Fluent result shell and action buttons while preserving polling.

---

### Task 1: Add P1 Billing UI Boundary Tests

**Files:**
- Create: `packages/web/src/components/BillingFluentSurfaces.spec.tsx`
- Modify: `packages/web/src/components/PayResult.spec.tsx`

**Interfaces:**
- Consumes source files as UTF-8 text.
- Produces a regression boundary for Fluent usage and readable Chinese copy.

- [ ] **Step 1: Add source-boundary tests**

Create `BillingFluentSurfaces.spec.tsx` with:

```typescript
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const files = ['BillingPlans.tsx', 'BillingLedger.tsx', 'BillingAlipayConfig.tsx', 'PayResult.tsx'];
const legacyTokens = ['rounded-xl', 'rounded-2xl', 'bg-emerald-600', 'hover:bg-emerald-700', 'border-slate', 'text-slate', 'bg-slate'];
const mojibakeTokens = ['鏀', '濂', '璐', '绠', '鐮', '鐘', '椤', '鈥', '姝', '灏', '閺', '婵', '鐠', '缁', '閻', '妞', '閳'];

describe('billing Fluent surface boundaries', () => {
  for (const file of files) {
    it(`${file} uses shared Fluent primitives and readable text`, () => {
      const source = readFileSync(resolve(__dirname, file), 'utf8');

      expect(source).toContain("from '../ui/fluent'");
      expect(source).toMatch(/fluent(Button|Input|Select|Table|StatusTag)/);
      for (const token of legacyTokens) expect(source).not.toContain(token);
      for (const token of mojibakeTokens) expect(source).not.toContain(token);
    });
  }
});
```

- [ ] **Step 2: Update PayResult expectations**

In `PayResult.spec.tsx`, use readable Chinese assertions:

```typescript
expect(screen.getByText('正在确认支付结果')).toBeTruthy();
expect(screen.getByText('支付成功')).toBeTruthy();
expect(screen.queryByText('尚未确认到账')).toBeNull();
expect(screen.getByText('尚未确认到账')).toBeTruthy();
```

- [ ] **Step 3: Verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/BillingFluentSurfaces.spec.tsx src/components/PayResult.spec.tsx src/components/BillingPlans.spec.tsx
```

Expected:
- Boundary tests fail because the remaining billing components still contain legacy tokens or lack Fluent imports.
- PayResult assertions fail if the component renders mojibake rather than readable Chinese.

---

### Task 2: Migrate BillingPlans

**Files:**
- Modify: `packages/web/src/components/BillingPlans.tsx`
- Test: `packages/web/src/components/BillingPlans.spec.tsx`
- Test: `packages/web/src/components/BillingFluentSurfaces.spec.tsx`

**Interfaces:**
- Consumes existing plan CRUD API wrappers.
- Produces a Fluent-styled plan table/form with readable Chinese labels.

- [ ] **Step 1: Replace imports**

Use:

```typescript
import { fluentButton, fluentInput, fluentSelect, fluentStatusTag, fluentTable } from '../ui/fluent';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';
```

- [ ] **Step 2: Replace old UI tokens**

Use `fluentTable` for the plans table, `fluentButton` for actions, `fluentInput`/`fluentSelect` for form fields, `fluentStatusTag` for active/inactive/type labels, and shared state helpers for loading/empty/error.

- [ ] **Step 3: Preserve behavior**

Keep these calls:

```typescript
listCreditPlans({ page, pageSize: MANAGEMENT_PAGE_SIZE });
createCreditPlan(dto);
updateCreditPlan(editing.id, dto);
removeCreditPlan(p.id);
```

- [ ] **Step 4: Verify**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/BillingPlans.spec.tsx src/components/BillingFluentSurfaces.spec.tsx
```

Expected: `BillingPlans.spec.tsx` passes; boundary failures remain only for components not yet migrated.

---

### Task 3: Migrate BillingLedger and BillingAlipayConfig

**Files:**
- Modify: `packages/web/src/components/BillingLedger.tsx`
- Modify: `packages/web/src/components/BillingAlipayConfig.tsx`
- Test: `packages/web/src/components/BillingFluentSurfaces.spec.tsx`

**Interfaces:**
- Consumes existing `getLedger`, `getAlipayConfig`, and `saveAlipayConfig` wrappers.
- Produces Fluent tables/forms and readable Chinese text.

- [ ] **Step 1: BillingLedger**

Use `fluentSelect`, `fluentTable`, `fluentButton`, `LoadingState`, `EmptyState`, and `ErrorState`. Keep resource/reason filters, page state, `getLedger` query shape, and previous/next pagination behavior.

- [ ] **Step 2: BillingAlipayConfig**

Use `fluentInput`, `fluentButton`, `fluentStatusTag`, `LoadingState`, and `ErrorState`. Preserve first-time validation requiring app id, private key, and Alipay public key; preserve partial key updates by omitting blank key fields.

- [ ] **Step 3: Verify**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/BillingFluentSurfaces.spec.tsx
```

Expected: boundary failures remain only for `PayResult.tsx`.

---

### Task 4: Migrate PayResult

**Files:**
- Modify: `packages/web/src/components/PayResult.tsx`
- Test: `packages/web/src/components/PayResult.spec.tsx`
- Test: `packages/web/src/components/BillingFluentSurfaces.spec.tsx`

**Interfaces:**
- Consumes `getOrder(orderId)` and `onBack`.
- Produces readable result states while preserving polling, timeout, retry, and cancelled/paid branches.

- [ ] **Step 1: Replace result UI**

Use Fluent colors and `fluentButton` for retry/back actions. Avoid legacy emerald/slate tokens and repair all visible Chinese copy.

- [ ] **Step 2: Preserve polling behavior**

Keep:

```typescript
const POLL_MS = 2000;
const TIMEOUT_MS = 60000;
timer = setTimeout(() => { void poll(); }, POLL_MS);
```

- [ ] **Step 3: Verify focused GREEN**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/BillingFluentSurfaces.spec.tsx src/components/PayResult.spec.tsx src/components/BillingPlans.spec.tsx src/components/BillingPurchase.spec.tsx src/components/BillingAdmin.spec.tsx
```

Expected: all focused billing tests pass.

---

### Task 5: Verify, Review, and Commit P1

**Files:**
- Review all modified files from `git diff --stat` and `git diff --check`.

- [ ] **Step 1: Run validation**

Run:

```powershell
corepack pnpm@10.33.2 --filter web lint
corepack pnpm@10.33.2 --filter web test
corepack pnpm@10.33.2 --filter web build
```

Expected:
- Lint passes.
- Web tests pass.
- Build passes. Existing `DashboardDemo` chunk-size warning may remain.

- [ ] **Step 2: Run residue and encoding checks**

Run:

```powershell
rg -n "rounded-xl|rounded-2xl|bg-emerald-600|hover:bg-emerald-700|border-slate|text-slate|bg-slate|鏀|濂|璐|绠|鐮|鐘|椤|鈥|姝|灏|閺|婵|鐠|缁|閻|妞|閳" packages/web/src/components/BillingPlans.tsx packages/web/src/components/BillingLedger.tsx packages/web/src/components/BillingAlipayConfig.tsx packages/web/src/components/PayResult.tsx
git -c safe.directory=E:/code/nongchang diff --check
```

Expected:
- No residue matches in touched billing components.
- `git diff --check` reports no whitespace errors.

- [ ] **Step 3: Commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p1-billing-fluent-text-integrity.md packages/web/src/components/BillingFluentSurfaces.spec.tsx packages/web/src/components/BillingPlans.spec.tsx packages/web/src/components/PayResult.spec.tsx packages/web/src/components/BillingPlans.tsx packages/web/src/components/BillingLedger.tsx packages/web/src/components/BillingAlipayConfig.tsx packages/web/src/components/PayResult.tsx
git -c safe.directory=E:/code/nongchang commit -m "refactor(web): unify billing Fluent surfaces"
```

---

## Self-Review

**Spec coverage:** The plan addresses the next priority after P0: remaining billing UI completion, interaction consistency, and visible text reliability.

**Placeholder scan:** No task uses TBD/TODO/fill-in placeholders; each task includes concrete files, commands, expected outcomes, and behavior invariants.

**Type consistency:** Billing API names match `packages/web/src/api/billing.ts`; Fluent helper names match `packages/web/src/ui/fluent.ts`; state helper names match `packages/web/src/ui/state.tsx`.

## Execution Choice

Subagent tools are not exposed in this Codex App session, so this plan will be executed inline using `superpowers:executing-plans` with TDD checkpoints and verification gates.
