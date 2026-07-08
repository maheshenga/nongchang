# Logistics Tracker Fluent UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `LogisticsTracker` into the current Microsoft Fluent-style SaaS console UI while preserving supply inbound, issue, delete, reload, toast, and merchant-only write semantics.

**Architecture:** Keep this as a focused web UI slice. The component remains the single owner of its modal state and API orchestration, but it must render through shared `../ui/fluent` primitives and `../ui/state` state components so the page matches the rest of the P1 Fluent refactor work. Backend APIs, DTOs, navigation, and role definitions are not changed.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Tailwind utility classes, `@nongchang/shared`, existing web API helpers.

## Global Constraints

- Do not modify backend modules, Prisma schema, shared DTOs, API helpers, routing, or navigation in this slice.
- Preserve `issueSupply(issuePayload.supplyId, { batchId: issuePayload.batchId, amount: issuePayload.amount })`; the batch select option value must be `batch.id`, not `batch.batchNo`.
- Preserve `createSupply({ name, unit, amount })`, `deleteSupply(item.id)`, `reloadSupplies()`, and existing toast feedback semantics.
- Only merchants (`Role.MERCHANT`) may see or use inbound, issue, and delete controls; all other roles see a read-only state.
- Use `fluentButton`, `fluentInput`, `fluentSelect`, `fluentStatusTag`, `LoadingState`, `ErrorState`, and `EmptyState`.
- Remove legacy page styling tokens from `LogisticsTracker.tsx`: `text-slate-`, `bg-slate-`, `border-slate-`, `ring-slate-`, `text-cyan-`, `bg-cyan-`, `border-cyan-`, `focus:ring-cyan-`, `text-red-`, `bg-red-`, `border-red-`, `rounded-xl`, `rounded-lg`, `shadow-xl`, `shadow-2xl`.
- Keep Chinese user-facing copy readable and aligned with actual functionality; do not imply unsupported automatic farm-record reconciliation beyond real inventory issue binding.
- Manual edits must use `apply_patch`.

---

### Task 1: Lock LogisticsTracker UI Boundary and Business Flow Tests

**Files:**
- Create: `packages/web/src/components/LogisticsTracker.fluent-ui.spec.tsx`
- Modify: `packages/web/src/components/LogisticsTracker.spec.tsx`

**Interfaces:**
- Consumes: `LogisticsTracker` default export, mocked `listSupplies`, `listBatches`, `createSupply`, `issueSupply`, `deleteSupply`, mocked `useAuth`.
- Produces: Regression coverage that proves Fluent boundary, merchant write controls, read-only non-merchant controls, inbound payload shape, and issue payload `batchId` shape.

- [ ] **Step 1: Write the failing Fluent source boundary test**

Create `packages/web/src/components/LogisticsTracker.fluent-ui.spec.tsx` with a source test that reads `LogisticsTracker.tsx`, asserts shared Fluent/state helpers are imported or referenced, and rejects legacy class tokens:

```tsx
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourcePath = resolve(dirname(fileURLToPath(import.meta.url)), 'LogisticsTracker.tsx');

describe('LogisticsTracker Fluent UI', () => {
  it('keeps the supply workflow inside the Fluent UI boundary', () => {
    const source = readFileSync(sourcePath, 'utf8');

    expect(source).toContain("from '../ui/fluent'");
    expect(source).toContain("from '../ui/state'");
    expect(source).toContain('fluentButton');
    expect(source).toContain('fluentInput');
    expect(source).toContain('fluentSelect');
    expect(source).toContain('fluentStatusTag');
    expect(source).toContain('LoadingState');
    expect(source).toContain('ErrorState');
    expect(source).toContain('EmptyState');

    const forbiddenClassTokens = [
      'text-slate-',
      'bg-slate-',
      'border-slate-',
      'ring-slate-',
      'text-cyan-',
      'bg-cyan-',
      'border-cyan-',
      'focus:ring-cyan-',
      'text-red-',
      'bg-red-',
      'border-red-',
      'rounded-xl',
      'rounded-lg',
      'shadow-xl',
      'shadow-2xl',
    ];

    for (const token of forbiddenClassTokens) {
      expect(source).not.toContain(token);
    }
  });
});
```

- [ ] **Step 2: Extend behavior tests before production edits**

Update `packages/web/src/components/LogisticsTracker.spec.tsx` so it uses readable labels and includes an inbound assertion:

```tsx
fireEvent.click(screen.getByRole('button', { name: '入库登记' }));
fireEvent.change(screen.getByLabelText('投入品名称'), { target: { value: '复合肥' } });
fireEvent.change(screen.getByLabelText('入库数量'), { target: { value: '50' } });
fireEvent.change(screen.getByLabelText('单位'), { target: { value: '包(50kg)' } });
fireEvent.click(screen.getByRole('button', { name: '确认入库' }));

await waitFor(() => {
  expect(createSupplyMock).toHaveBeenCalledWith({ name: '复合肥', unit: '包(50kg)', amount: 50 });
});
```

Keep the existing issue assertion:

```tsx
expect(issueSupplyMock).toHaveBeenCalledWith('supply-1', { batchId, amount: 12 });
```

- [ ] **Step 3: Run tests and verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/LogisticsTracker.fluent-ui.spec.tsx src/components/LogisticsTracker.spec.tsx
```

Expected: FAIL because `LogisticsTracker.tsx` still imports `motion/react`, lacks Fluent/state helper imports, and contains forbidden legacy class tokens.

### Task 2: Refactor LogisticsTracker to Fluent UI Without Changing API Semantics

**Files:**
- Modify: `packages/web/src/components/LogisticsTracker.tsx`

**Interfaces:**
- Consumes: `fluentButton`, `fluentInput`, `fluentSelect`, `fluentStatusTag`, `fluentTable`, `LoadingState`, `ErrorState`, `EmptyState`, existing API helpers and `Role.MERCHANT`.
- Produces: A Fluent-style inventory page with stable controls and the same submit/delete behavior as before.

- [ ] **Step 1: Replace imports**

Remove `motion` and `AnimatePresence`; add Fluent/state imports:

```tsx
import { PackageSearch, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Role } from '@nongchang/shared';
import { useApi } from '../hooks/useApi';
import { listSupplies, createSupply, issueSupply, deleteSupply } from '../api/supply';
import { listBatches } from '../api/batches';
import { useAuth } from '../auth/auth-context';
import { confirmDialog } from '../hooks/useDialog';
import { fluentButton, fluentInput, fluentSelect, fluentStatusTag, fluentTable } from '../ui/fluent';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';
```

- [ ] **Step 2: Keep submit handlers unchanged except readable copy**

Keep the same validation and API calls:

```tsx
if (!isMerchant) return showToast('当前视图只读');
if (!issuePayload.supplyId || issuePayload.amount <= 0) return showToast('请输入完整信息');
if (!issuePayload.batchId) return showToast('请选择关联批次');
await issueSupply(issuePayload.supplyId, { batchId: issuePayload.batchId, amount: issuePayload.amount });
```

For inbound:

```tsx
await createSupply({ name: inboundPayload.name, unit: inboundPayload.unit, amount: inboundPayload.amount });
```

- [ ] **Step 3: Replace the page shell with Fluent surfaces**

Use rectangular, dense SaaS console layout:

```tsx
<div className="flex h-full min-h-0 flex-col gap-4">
  <section className="border border-[#E1DFDD] bg-white px-5 py-4">
    ...
  </section>
  <section className="flex min-h-0 flex-1 flex-col overflow-hidden border border-[#E1DFDD] bg-white">
    ...
  </section>
</div>
```

Use `fluentStatusTag('active')` for merchant write status and `fluentStatusTag('neutral')` for read-only status.

- [ ] **Step 4: Render supply records with Fluent table/state components**

Use `LoadingState`, `ErrorState`, and `EmptyState`. Render records in `fluentTable` with columns for item, total, used, remaining, status, and actions. Clamp progress width safely:

```tsx
const total = Math.max(item.total, 0);
const usedPercent = total > 0 ? Math.min(100, Math.round((item.used / total) * 100)) : 0;
```

Use status tag tones:

```tsx
<span className={fluentStatusTag(item.alert ? 'danger' : 'success')}>
  {item.alert ? '库存预警' : '库存正常'}
</span>
```

- [ ] **Step 5: Replace modals with accessible Fluent dialog surfaces**

Render modal overlays with `role="dialog"` and `aria-modal="true"`. Every form control must have a readable label that tests can find:

```tsx
<input aria-label="投入品名称" ... className={`${fluentInput} w-full`} />
<input aria-label="入库数量" type="number" ... className={`${fluentInput} w-full`} />
<select aria-label="单位" ... className={`${fluentSelect} w-full`}>...</select>
<select aria-label="选择库存物资" ... className={`${fluentSelect} w-full`}>...</select>
<select aria-label="关联生产批次" ... className={`${fluentSelect} w-full`}>...</select>
<input aria-label="本次下达/领用数量" type="number" ... className={`${fluentInput} w-full`} />
```

The batch options must keep `value={batch.id}`.

- [ ] **Step 6: Verify GREEN**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/LogisticsTracker.fluent-ui.spec.tsx src/components/LogisticsTracker.spec.tsx
```

Expected: PASS.

### Task 3: Full Verification, Review, and Commit

**Files:**
- Verify: `packages/web/src/components/LogisticsTracker.tsx`
- Verify: `packages/web/src/components/LogisticsTracker.spec.tsx`
- Verify: `packages/web/src/components/LogisticsTracker.fluent-ui.spec.tsx`
- Commit: all three files plus this plan.

**Interfaces:**
- Consumes: completed Tasks 1 and 2.
- Produces: a reviewed commit for the P1 LogisticsTracker Fluent UI slice.

- [ ] **Step 1: Run focused and broad verification**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/LogisticsTracker.fluent-ui.spec.tsx src/components/LogisticsTracker.spec.tsx
corepack pnpm@10.33.2 --filter web lint
corepack pnpm@10.33.2 --filter web test
git -c safe.directory=E:/code/nongchang diff --check
```

Expected: all commands exit 0.

- [ ] **Step 2: Perform local review**

Inspect:

```powershell
git -c safe.directory=E:/code/nongchang diff -- packages/web/src/components/LogisticsTracker.tsx packages/web/src/components/LogisticsTracker.spec.tsx packages/web/src/components/LogisticsTracker.fluent-ui.spec.tsx
```

Confirm:
- No backend/API/shared/navigation changes.
- Merchant-only controls remain merchant-only.
- `issueSupply` receives selected `batch.id`.
- `createSupply` receives `{ name, unit, amount }`.
- Delete still uses `confirmDialog`.
- Loading, error, empty states are visible.
- No forbidden class tokens remain in `LogisticsTracker.tsx`.

- [ ] **Step 3: Stage and commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p1-logistics-tracker-fluent-ui.md packages/web/src/components/LogisticsTracker.tsx packages/web/src/components/LogisticsTracker.spec.tsx packages/web/src/components/LogisticsTracker.fluent-ui.spec.tsx
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang commit -m "refactor(web): align logistics tracker with Fluent UI"
```

Expected: commit succeeds with only this P1 slice staged.

## Self-Review

- Spec coverage: The plan covers Fluent UI completion, readable copy, role-based write controls, inbound creation, issue binding by `batchId`, delete confirmation, loading/error/empty states, and verification/commit.
- Placeholder scan: No TBD, TODO, or deferred implementation placeholders are present.
- Type consistency: The plan uses existing `SupplyItem`, `Batch`, API helper names, `Role.MERCHANT`, and Fluent helper names exactly as present in the project.
