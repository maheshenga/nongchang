# Logistics Operation Boundaries P3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `LogisticsTracker.tsx` business-operation complexity by moving deterministic inventory display math and form validation/payload construction into tested model helpers.

**Architecture:** Keep the existing LogisticsTracker UI, API calls, dialog flow, role gating, toast handling, and modal state in the component. Add `LogisticsTracker.model.ts` beside the component for pure helpers that can be tested without rendering React. The component consumes these helpers but still owns all side effects.

**Tech Stack:** React 19, TypeScript, Vitest, existing web component/model helper pattern.

## Global Constraints

- Do not change backend APIs, DTOs, navigation, role permissions, supply issue behavior, or modal UI.
- Do not split visual JSX in this P3 slice.
- Follow TDD: add failing model tests before production helper implementation.
- Preserve current validation copy: `当前视图只读`, `请输入完整信息`, `请选择关联批次`.
- Preserve current submit payload semantics:
  - issue: `issueSupply(supplyId, { batchId, amount })`
  - inbound: `createSupply({ name, unit, amount })`
- Preserve current inventory progress semantics: clamp total at `0`, use `0` percent when total is not positive, otherwise `Math.min(100, Math.round((used / total) * 100))`.

---

## File Structure

- Create: `packages/web/src/components/LogisticsTracker.model.ts`
  - Owns pure inventory display math and submit payload validation/building.
- Create: `packages/web/src/components/LogisticsTracker.model.spec.ts`
  - Covers model helpers with RED/GREEN tests.
- Modify: `packages/web/src/components/LogisticsTracker.tsx`
  - Replaces inline validation and inventory percent math with model helpers.
- Add: `docs/superpowers/plans/2026-07-09-p3-logistics-operation-boundaries.md`
  - Tracks this P3 execution.

## Task 1: Add RED Model Tests

**Files:**
- Create: `packages/web/src/components/LogisticsTracker.model.spec.ts`

**Interfaces:**
- Consumes: `getSupplyUsedPercent(item: Pick<SupplyItem, 'total' | 'used'>): number`
- Consumes: `buildIssueSupplySubmission(payload: IssueSupplyDraft, isMerchant: boolean): IssueSupplySubmission`
- Consumes: `buildInboundSupplySubmission(payload: InboundSupplyDraft, isMerchant: boolean): InboundSupplySubmission`
- Produces: tests for deterministic logic currently embedded in `LogisticsTracker.tsx`.

- [ ] **Step 1: Write failing tests**

Create `packages/web/src/components/LogisticsTracker.model.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildInboundSupplySubmission,
  buildIssueSupplySubmission,
  getSupplyUsedPercent,
} from './LogisticsTracker.model';

describe('LogisticsTracker model helpers', () => {
  it('clamps inventory used percent with the existing table semantics', () => {
    expect(getSupplyUsedPercent({ total: 100, used: 20 })).toBe(20);
    expect(getSupplyUsedPercent({ total: 3, used: 2 })).toBe(67);
    expect(getSupplyUsedPercent({ total: 0, used: 5 })).toBe(0);
    expect(getSupplyUsedPercent({ total: -10, used: 5 })).toBe(0);
    expect(getSupplyUsedPercent({ total: 100, used: 140 })).toBe(100);
  });

  it('builds issue supply payloads and preserves existing validation messages', () => {
    expect(buildIssueSupplySubmission({ supplyId: '', amount: 1, batchId: 'batch-1' }, true)).toEqual({
      ok: false,
      message: '请输入完整信息',
    });
    expect(buildIssueSupplySubmission({ supplyId: 'supply-1', amount: 0, batchId: 'batch-1' }, true)).toEqual({
      ok: false,
      message: '请输入完整信息',
    });
    expect(buildIssueSupplySubmission({ supplyId: 'supply-1', amount: 2, batchId: '' }, true)).toEqual({
      ok: false,
      message: '请选择关联批次',
    });
    expect(buildIssueSupplySubmission({ supplyId: 'supply-1', amount: 2, batchId: 'batch-1' }, false)).toEqual({
      ok: false,
      message: '当前视图只读',
    });
    expect(buildIssueSupplySubmission({ supplyId: 'supply-1', amount: 2, batchId: 'batch-1' }, true)).toEqual({
      ok: true,
      supplyId: 'supply-1',
      input: { batchId: 'batch-1', amount: 2 },
    });
  });

  it('builds inbound supply payloads and preserves existing validation messages', () => {
    expect(buildInboundSupplySubmission({ name: '', amount: 10, unit: '箱' }, true)).toEqual({
      ok: false,
      message: '请输入完整信息',
    });
    expect(buildInboundSupplySubmission({ name: '复合肥', amount: 0, unit: '箱' }, true)).toEqual({
      ok: false,
      message: '请输入完整信息',
    });
    expect(buildInboundSupplySubmission({ name: '复合肥', amount: 10, unit: '箱' }, false)).toEqual({
      ok: false,
      message: '当前视图只读',
    });
    expect(buildInboundSupplySubmission({ name: '复合肥', amount: 10, unit: '箱' }, true)).toEqual({
      ok: true,
      input: { name: '复合肥', unit: '箱', amount: 10 },
    });
  });
});
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/LogisticsTracker.model.spec.ts
```

Expected: FAIL because `LogisticsTracker.model.ts` does not exist yet.

## Task 2: Implement Model Helpers

**Files:**
- Create: `packages/web/src/components/LogisticsTracker.model.ts`

**Interfaces:**
- Produces: `IssueSupplyDraft`
- Produces: `InboundSupplyDraft`
- Produces: `IssueSupplySubmission`
- Produces: `InboundSupplySubmission`
- Produces: `getSupplyUsedPercent()`
- Produces: `buildIssueSupplySubmission()`
- Produces: `buildInboundSupplySubmission()`

- [ ] **Step 1: Add minimal helper implementation**

Create `packages/web/src/components/LogisticsTracker.model.ts`:

```ts
import type { CreateSupplyInput, IssueSupplyInput, SupplyItem } from '@nongchang/shared';

export interface IssueSupplyDraft {
  supplyId: string;
  amount: number;
  batchId: string;
}

export interface InboundSupplyDraft {
  name: string;
  amount: number;
  unit: string;
}

export type IssueSupplySubmission =
  | { ok: true; supplyId: string; input: IssueSupplyInput }
  | { ok: false; message: string };

export type InboundSupplySubmission =
  | { ok: true; input: CreateSupplyInput }
  | { ok: false; message: string };

export function getSupplyUsedPercent(item: Pick<SupplyItem, 'total' | 'used'>): number {
  const total = Math.max(item.total, 0);
  return total > 0 ? Math.min(100, Math.round((item.used / total) * 100)) : 0;
}

export function buildIssueSupplySubmission(payload: IssueSupplyDraft, isMerchant: boolean): IssueSupplySubmission {
  if (!isMerchant) return { ok: false, message: '当前视图只读' };
  if (!payload.supplyId || payload.amount <= 0) return { ok: false, message: '请输入完整信息' };
  if (!payload.batchId) return { ok: false, message: '请选择关联批次' };
  return { ok: true, supplyId: payload.supplyId, input: { batchId: payload.batchId, amount: payload.amount } };
}

export function buildInboundSupplySubmission(payload: InboundSupplyDraft, isMerchant: boolean): InboundSupplySubmission {
  if (!isMerchant) return { ok: false, message: '当前视图只读' };
  if (!payload.name || payload.amount <= 0) return { ok: false, message: '请输入完整信息' };
  return { ok: true, input: { name: payload.name, unit: payload.unit, amount: payload.amount } };
}
```

- [ ] **Step 2: Verify GREEN for model tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/LogisticsTracker.model.spec.ts
```

Expected: PASS.

## Task 3: Replace Inline Logic In LogisticsTracker

**Files:**
- Modify: `packages/web/src/components/LogisticsTracker.tsx`

**Interfaces:**
- Consumes: `buildIssueSupplySubmission()`
- Consumes: `buildInboundSupplySubmission()`
- Consumes: `getSupplyUsedPercent()`

- [ ] **Step 1: Update imports**

Add:

```ts
import {
  buildInboundSupplySubmission,
  buildIssueSupplySubmission,
  getSupplyUsedPercent,
} from './LogisticsTracker.model';
```

- [ ] **Step 2: Replace issue submission validation**

Replace the three inline guard returns in `handleIssueSubmit` with:

```ts
const submission = buildIssueSupplySubmission(issuePayload, isMerchant);
if (!submission.ok) return showToast(submission.message);
```

Then replace:

```ts
await issueSupply(issuePayload.supplyId, { batchId: issuePayload.batchId, amount: issuePayload.amount });
```

with:

```ts
await issueSupply(submission.supplyId, submission.input);
```

- [ ] **Step 3: Replace inbound submission validation**

Replace the two inline guard returns in `handleInboundSubmit` with:

```ts
const submission = buildInboundSupplySubmission(inboundPayload, isMerchant);
if (!submission.ok) return showToast(submission.message);
```

Then replace:

```ts
await createSupply({ name: inboundPayload.name, unit: inboundPayload.unit, amount: inboundPayload.amount });
```

with:

```ts
await createSupply(submission.input);
```

- [ ] **Step 4: Replace inventory used percent math**

Replace:

```ts
const total = Math.max(item.total, 0);
const usedPercent = total > 0 ? Math.min(100, Math.round((item.used / total) * 100)) : 0;
```

with:

```ts
const usedPercent = getSupplyUsedPercent(item);
```

- [ ] **Step 5: Run focused tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/LogisticsTracker.model.spec.ts src/components/LogisticsTracker.spec.tsx src/components/LogisticsTracker.fluent-ui.spec.tsx
```

Expected: PASS.

## Task 4: Verify, Review, And Commit

**Files:**
- Verify: `packages/web/src/components/LogisticsTracker.model.ts`
- Verify: `packages/web/src/components/LogisticsTracker.model.spec.ts`
- Verify: `packages/web/src/components/LogisticsTracker.tsx`
- Verify: `docs/superpowers/plans/2026-07-09-p3-logistics-operation-boundaries.md`

**Interfaces:**
- Produces: one committed P3 maintainability slice.

- [ ] **Step 1: Run web gates**

Run:

```powershell
corepack pnpm@10.33.2 --filter web lint
corepack pnpm@10.33.2 --filter web test
corepack pnpm@10.33.2 --filter web build
git -c safe.directory=E:/code/nongchang diff --check
```

Expected: all commands exit 0.

- [ ] **Step 2: Request review**

Use a reviewer subagent to inspect the P3 diff against this plan. Fix Critical or Important findings before committing.

- [ ] **Step 3: Inspect, stage, and commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang diff --stat
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p3-logistics-operation-boundaries.md packages/web/src/components/LogisticsTracker.model.ts packages/web/src/components/LogisticsTracker.model.spec.ts packages/web/src/components/LogisticsTracker.tsx
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang commit -m "refactor(web): extract logistics operation model helpers"
```

Expected: commit succeeds.

## Self-Review

- Spec coverage: The plan addresses the next frontend complexity hotspot without changing user-visible behavior or API calls.
- Placeholder scan: No TBD/TODO/fill-in steps remain.
- Type consistency: `IssueSupplyDraft`, `InboundSupplyDraft`, `IssueSupplySubmission`, `InboundSupplySubmission`, `getSupplyUsedPercent`, `buildIssueSupplySubmission`, and `buildInboundSupplySubmission` are named consistently across tests, model, and component.
