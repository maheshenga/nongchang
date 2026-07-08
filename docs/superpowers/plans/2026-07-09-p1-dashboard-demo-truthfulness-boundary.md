# Dashboard Demo Truthfulness Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the demo dashboard clearly behave and read as a demo surface, so simulated AI, PDF, refresh, alerts, and generated metrics cannot be mistaken for real SaaS production capabilities.

**Architecture:** Keep the existing lazy production/demo split in `Dashboard.tsx`. This slice only edits `DashboardDemo.tsx` and a focused truthfulness spec; it does not attempt a full visual rewrite of the large demo dashboard. Replace nondeterministic demo metrics and unsupported capability labels with explicit demo/sample language while preserving demo interactivity.

**Tech Stack:** React, TypeScript, Vitest source-boundary tests, existing Tailwind classes, existing demo-only chart/layout dependencies.

## Global Constraints

- Do not modify backend modules, API helpers, shared DTOs, navigation, or production dashboard behavior in this slice.
- Keep `DashboardDemo` lazy-loaded and accessible only after explicit production-dashboard opt-in.
- Demo-only AI, PDF, email, auto-refresh, and alert surfaces must include explicit demo/sample wording.
- Do not use `Math.random()` in `DashboardDemo.tsx`; demo values and task ids must be deterministic or timestamp-derived.
- Do not claim real AI analysis, real Gemini alerts, real PDF generation, or real automatic refresh unless the component calls a real backend/API for that capability.
- Preserve existing demo affordances where possible: CSV export, Gantt image export, presentation mode, AI sidebar, PDF modal, task interactions, topology interactions.
- Manual edits must use `apply_patch`.

---

### Task 1: Lock Demo Truthfulness Boundary With a Failing Test

**Files:**
- Create: `packages/web/src/components/DashboardDemo.truthfulness.spec.tsx`

**Interfaces:**
- Consumes: `DashboardDemo.tsx` source text.
- Produces: A source-level regression test that prevents fake or nondeterministic demo behavior from returning.

- [ ] **Step 1: Add source-boundary test**

Create `packages/web/src/components/DashboardDemo.truthfulness.spec.tsx`:

```tsx
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourcePath = resolve(dirname(fileURLToPath(import.meta.url)), 'DashboardDemo.tsx');

describe('DashboardDemo truthfulness boundary', () => {
  it('does not present simulated demo capabilities as real production features', () => {
    const source = readFileSync(sourcePath, 'utf8');

    expect(source).not.toContain('Math.random');
    expect(source).not.toContain('智能种植顾问 (AI)');
    expect(source).not.toContain('年度溯源决策报告 (PDF)');
    expect(source).not.toContain('自动刷新: 开启');
    expect(source).not.toContain('自动刷新: 关闭');
    expect(source).not.toContain('Gemini AI 植保风险自动预警');
    expect(source).not.toContain('生成合并 PDF 中');

    expect(source).toContain('演示种植顾问');
    expect(source).toContain('演示经营简报');
    expect(source).toContain('演示刷新标记');
    expect(source).toContain('AI 示例');
    expect(source).toContain('PDF 示例');
  });
});
```

- [ ] **Step 2: Run test and verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/DashboardDemo.truthfulness.spec.tsx
```

Expected: FAIL because `DashboardDemo.tsx` currently contains `Math.random`, unsupported real-sounding AI/PDF labels, and no-op auto-refresh labels.

### Task 2: Make Demo Metrics and Capability Copy Truthful

**Files:**
- Modify: `packages/web/src/components/DashboardDemo.tsx`

**Interfaces:**
- Consumes: existing demo state and UI.
- Produces: deterministic demo data and explicit demo/sample copy.

- [ ] **Step 1: Replace nondeterministic demo values**

Replace `Math.random()` in `yieldTrendData` with deterministic values:

```tsx
const yieldTrendData = Array.from({ length: 30 }, (_, i) => {
  const d = new Date('2026-07-09T00:00:00.000Z');
  d.setDate(d.getDate() - (29 - i));
  return {
    date: `${d.getMonth() + 1}/${d.getDate()}`,
    采收产量: 112 + i * 5 + ((i % 5) * 7),
  };
});
```

Replace task ids created by `Math.random().toString()` with a timestamp-derived deterministic prefix:

```tsx
id: `record-${batchId}-${Date.now()}`
```

- [ ] **Step 2: Remove no-op auto-refresh behavior**

Remove the `useEffect` interval that only runs a no-op. Rename button copy from automatic refresh to explicit demo marker:

```tsx
{autoRefresh ? '演示刷新标记: 开启' : '演示刷新标记: 关闭'}
```

When toggling, only update state; do not imply fresh data is fetched.

- [ ] **Step 3: Rename simulated AI/PDF surfaces**

Change top action labels:

```tsx
演示经营简报 (PDF 示例)
演示种植顾问 (AI 示例)
```

Change alert/header copy:

```tsx
AI 示例检测到近期上传叶片异常。
Gemini AI 示例植保风险提示
```

Change PDF modal labels:

```tsx
导出演示经营简报 (PDF 示例)
PDF 示例版式自定义选项：
生成 PDF 示例中...
确认导出演示报告
```

- [ ] **Step 4: Make simulated handler outputs explicit**

In `handleAiChat`, `handleAiPredict`, and `handleAiAnalysis`, prepend demo/sample wording so generated text cannot be read as live AI output:

```tsx
setAiChatResponse(`【演示样例】系统展示如何把描述关联到批次...`);
setScheduleReport(`【演示样例】以下为排期预测展示文本...`);
setAiReport(`【演示样例】以下为长势评估展示文本...`);
```

In `handlePdfExport`, preserve modal close behavior, but do not claim a real PDF file was produced. The button text already clarifies this is a PDF sample.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/DashboardDemo.truthfulness.spec.tsx src/components/Dashboard.truthfulness.spec.tsx
```

Expected: PASS.

### Task 3: Full Verification, Review, and Commit

**Files:**
- Verify: `packages/web/src/components/DashboardDemo.tsx`
- Verify: `packages/web/src/components/DashboardDemo.truthfulness.spec.tsx`
- Commit: both files plus this plan.

**Interfaces:**
- Consumes: completed Tasks 1 and 2.
- Produces: a reviewed commit for the P1 DashboardDemo truthfulness slice.

- [ ] **Step 1: Run verification**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/DashboardDemo.truthfulness.spec.tsx src/components/Dashboard.truthfulness.spec.tsx
corepack pnpm@10.33.2 --filter web lint
corepack pnpm@10.33.2 --filter web test
git -c safe.directory=E:/code/nongchang diff --check
```

Expected: all commands exit 0.

- [ ] **Step 2: Perform local review**

Inspect:

```powershell
git -c safe.directory=E:/code/nongchang diff -- packages/web/src/components/DashboardDemo.tsx packages/web/src/components/DashboardDemo.truthfulness.spec.tsx
```

Confirm:
- No production dashboard behavior changed.
- No backend/API/shared/navigation files changed.
- No `Math.random` remains in `DashboardDemo.tsx`.
- AI/PDF/auto-refresh language is explicitly demo/sample language.
- Existing demo controls remain present.

- [ ] **Step 3: Stage and commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p1-dashboard-demo-truthfulness-boundary.md packages/web/src/components/DashboardDemo.tsx packages/web/src/components/DashboardDemo.truthfulness.spec.tsx
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang commit -m "refactor(web): clarify demo dashboard truthfulness"
```

Expected: commit succeeds with only this P1 slice staged.

## Self-Review

- Spec coverage: The plan covers deterministic demo data, no fake auto-refresh, explicit demo/sample labels for AI/PDF/alerts, focused tests, verification, review, and commit.
- Placeholder scan: No TBD, TODO, or deferred implementation placeholders are present.
- Type consistency: The plan uses existing `DashboardDemo.tsx` local state and handler names exactly as present in the component.
