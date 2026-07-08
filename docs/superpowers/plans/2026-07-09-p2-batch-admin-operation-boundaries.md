# BatchAdmin Operation Boundaries P2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for recovery and review.

**Goal:** Reduce remaining `BatchAdmin.tsx` business-operation complexity by moving pure compliance scoring and trace-report row construction into tested model helpers.

**Architecture:** Keep the existing `BatchAdmin` UI, API calls, modal state, and side effects in place. Extract only deterministic data transformations from the component into `BatchAdmin.model.ts`: `buildBatchComplianceReport()` for lifecycle-based compliance scoring, and `buildBatchTraceReportRows()` for CSV report rows. The component continues to own async loading, toast handling, downloads, and modal state.

**Tech Stack:** React 19, TypeScript, Vitest, existing `BatchAdmin.model.ts` helper pattern.

## Global Constraints

- Do not change backend APIs, DTOs, navigation, role permissions, trace-code generation, CSV download behavior, or modal UI.
- Do not split visual JSX in this P2 slice.
- Follow TDD: add failing tests for the extracted helpers before production code changes.
- Preserve the existing report row labels and ordering.
- Preserve the existing compliance score semantics: four checks, 25 points each.

## File Structure

- Modify: `packages/web/src/components/BatchAdmin.model.spec.ts`
  - Adds tests for compliance score and report row construction.
- Modify: `packages/web/src/components/BatchAdmin.model.ts`
  - Adds `BatchLifecycleSnapshot`, `BatchComplianceReport`, `buildBatchComplianceReport()`, and `buildBatchTraceReportRows()`.
- Modify: `packages/web/src/components/BatchAdmin.tsx`
  - Replaces inline compliance scoring and report row loops with the model helpers.
- Add: `docs/superpowers/plans/2026-07-09-p2-batch-admin-operation-boundaries.md`
  - Tracks this P2 execution.

## Task 1: Add RED Model Tests

**Files:**
- Modify: `packages/web/src/components/BatchAdmin.model.spec.ts`

**Interfaces:**
- Consumes: `buildBatchComplianceReport(lifecycle: BatchLifecycleSnapshot): BatchComplianceReport`.
- Consumes: `buildBatchTraceReportRows(batch: Pick<ViewBatch, 'code' | 'type' | 'date' | 'stage'> | undefined, batchId: string, lifecycle: BatchLifecycleSnapshot): Array<Array<unknown>>`.
- Produces: regression coverage for the operations that leave `BatchAdmin.tsx`.

- [x] **Step 1: Add the failing tests**

Add imports:

```ts
  buildBatchComplianceReport,
  buildBatchTraceReportRows,
```

Add tests covering:

```ts
expect(buildBatchComplianceReport({
  farmRecords: [{ id: 'record-1' }],
  codeCount: 12,
  traceEvents: [{ id: 'event-1' }],
  scanTotal: 3,
})).toEqual({
  score: 100,
  checks: [
    { label: '农事记录已归档(种植/施肥/检测留痕)', ok: true },
    { label: '防伪溯源码已签发并可供扫验', ok: true },
    { label: '溯源链路事件节点完整可追', ok: true },
    { label: '终端消费者已产生有效扫码核验', ok: true },
  ],
});

expect(buildBatchTraceReportRows(viewBatch(), 'batch-1', {
  codeCount: 2,
  scanTotal: 5,
  farmRecords: [
    { recordedAt: '2026-07-09T08:00:00.000Z', action: '施肥', note: '有机肥 20kg' },
  ],
  traceEvents: [
    { occurredAt: '2026-07-10T09:30:00.000Z', eventType: 'PACKED', description: '包装完成' },
  ],
})).toEqual([
  ['溯源报告', 'B20240520001'],
  ['品种', '阳光玫瑰'],
  ['种植日期', '2024-05-20'],
  ['当前阶段', BatchStatus.GROWING],
  ['已签发码数', 2],
  ['累计扫码', 5],
  [],
  ['农事记录明细'],
  ['时间', '动作', '备注'],
  ['2026-07-09', '施肥', '有机肥 20kg'],
  [],
  ['溯源链路事件'],
  ['时间', '事件', '描述'],
  ['2026-07-10', 'PACKED', '包装完成'],
]);
```

- [x] **Step 2: Verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/BatchAdmin.model.spec.ts
```

Expected RED: fail because `buildBatchComplianceReport` and `buildBatchTraceReportRows` are not exported yet.

## Task 2: Implement Model Helpers

**Files:**
- Modify: `packages/web/src/components/BatchAdmin.model.ts`

**Interfaces:**
- Produces: `BatchLifecycleSnapshot`
- Produces: `BatchComplianceReport`
- Produces: `buildBatchComplianceReport()`
- Produces: `buildBatchTraceReportRows()`

- [x] **Step 1: Add types and helpers**

Add:

```ts
export interface BatchLifecycleSnapshot {
  farmRecords?: Array<Record<string, unknown>>;
  traceEvents?: Array<Record<string, unknown>>;
  codeCount?: number | null;
  scanTotal?: number | null;
}

export interface BatchComplianceReport {
  score: number;
  checks: { label: string; ok: boolean }[];
}
```

Add pure helpers:

```ts
export function buildBatchComplianceReport(lifecycle: BatchLifecycleSnapshot): BatchComplianceReport {
  const hasRecords = (lifecycle.farmRecords?.length ?? 0) > 0;
  const hasCodes = (lifecycle.codeCount ?? 0) > 0;
  const hasEvents = (lifecycle.traceEvents?.length ?? 0) > 0;
  const hasScans = (lifecycle.scanTotal ?? 0) > 0;
  const checks = [
    { label: '农事记录已归档(种植/施肥/检测留痕)', ok: hasRecords },
    { label: '防伪溯源码已签发并可供扫验', ok: hasCodes },
    { label: '溯源链路事件节点完整可追', ok: hasEvents },
    { label: '终端消费者已产生有效扫码核验', ok: hasScans },
  ];
  return { score: checks.filter((check) => check.ok).length * 25, checks };
}
```

`buildBatchTraceReportRows()` must preserve the existing row order:

```ts
[
  ['溯源报告', batch?.code ?? batchId],
  ['品种', batch?.type ?? ''],
  ['种植日期', batch?.date ?? ''],
  ['当前阶段', batch?.stage ?? ''],
  ['已签发码数', lifecycle.codeCount ?? 0],
  ['累计扫码', lifecycle.scanTotal ?? 0],
  [],
  ['农事记录明细'],
  ['时间', '动作', '备注'],
  ...farmRecordRows,
  [],
  ['溯源链路事件'],
  ['时间', '事件', '描述'],
  ...traceEventRows,
]
```

- [x] **Step 2: Verify GREEN for model tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/BatchAdmin.model.spec.ts
```

Expected: PASS.

## Task 3: Replace Inline Logic In BatchAdmin

**Files:**
- Modify: `packages/web/src/components/BatchAdmin.tsx`

**Interfaces:**
- Consumes: `buildBatchComplianceReport()`
- Consumes: `buildBatchTraceReportRows()`

- [x] **Step 1: Update imports**

Add to the `BatchAdmin.model` import:

```ts
  buildBatchComplianceReport,
  buildBatchTraceReportRows,
```

- [x] **Step 2: Replace compliance scoring body**

In `handleScanCompliance`, replace the local `hasRecords`/`hasCodes`/`hasEvents`/`hasScans`/`checks`/`score` block with:

```ts
setComplianceData(buildBatchComplianceReport(lc));
```

- [x] **Step 3: Replace report row construction**

In `handleExportBatchReport`, replace the `rows` initialization, header pushes, and two loops with:

```ts
const rows = buildBatchTraceReportRows(batch, id, lc);
```

- [x] **Step 4: Run focused component/model tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/BatchAdmin.model.spec.ts src/components/BatchAdmin.spec.tsx src/components/BatchAdmin.fluent-depth.spec.tsx
```

Expected: PASS.

## Task 4: Verify, Review, And Commit

**Files:**
- Verify: `packages/web/src/components/BatchAdmin.model.ts`
- Verify: `packages/web/src/components/BatchAdmin.model.spec.ts`
- Verify: `packages/web/src/components/BatchAdmin.tsx`
- Verify: `docs/superpowers/plans/2026-07-09-p2-batch-admin-operation-boundaries.md`

**Interfaces:**
- Produces: one committed P2 maintainability slice.

- [x] **Step 1: Run web gates**

Run:

```powershell
corepack pnpm@10.33.2 --filter web lint
corepack pnpm@10.33.2 --filter web test
corepack pnpm@10.33.2 --filter web build
git -c safe.directory=E:/code/nongchang diff --check
```

Expected: all commands exit 0.

- [x] **Step 2: Request review**

Use a reviewer subagent to inspect the P2 diff against the plan. Fix Critical or Important findings before committing.

- [ ] **Step 3: Inspect, stage, and commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang diff --stat
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p2-batch-admin-operation-boundaries.md packages/web/src/components/BatchAdmin.model.ts packages/web/src/components/BatchAdmin.model.spec.ts packages/web/src/components/BatchAdmin.tsx
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang commit -m "refactor(web): extract batch operation model helpers"
```

Expected: commit succeeds.

## Self-Review

- Spec coverage: This plan addresses the current highest complexity hotspot reported by the code graph without changing user-visible behavior.
- Placeholder scan: No TBD/TODO/fill-in steps remain.
- Type consistency: `BatchLifecycleSnapshot`, `BatchComplianceReport`, `buildBatchComplianceReport`, and `buildBatchTraceReportRows` are named consistently across tests, model, and component.
