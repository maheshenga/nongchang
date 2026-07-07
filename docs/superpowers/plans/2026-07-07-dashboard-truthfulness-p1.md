# Dashboard Truthfulness P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent the SaaS dashboard from presenting simulated AI, simulated refresh, and hard-coded metrics as production truth.

**Architecture:** Keep the existing visual dashboard available as an explicit demo surface, but add a production-default truthfulness boundary at the top of `Dashboard`. The boundary exposes a small, tested mode helper so production mode shows real-data status and disables misleading simulated actions, while demo mode remains opt-in and visibly labelled.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, Tailwind CSS, Lucide icons.

## Global Constraints

- Work in isolated worktree `E:\code\nongchang\.worktrees\dashboard-real-data-p1` on branch `codex/dashboard-real-data-p1`.
- Use `corepack pnpm@10.33.2`.
- Use TDD: write failing tests before production code.
- Do not modify backend APIs in this P1 slice.
- Do not delete the legacy dashboard visuals; isolate and label them.
- Do not commit generated `node_modules`, `.superpowers`, or temporary QA artifacts.

---

## File Structure

- Modify: `packages/web/src/components/Dashboard.tsx`
  - Add a production-default mode boundary.
  - Add explicit demo opt-in state.
  - Gate simulated AI and auto-refresh actions behind demo mode.
  - Keep existing chart/demo content available after opt-in.
- Create: `packages/web/src/components/Dashboard.truthfulness.spec.tsx`
  - Tests production default copy, demo opt-in, and simulated action gating.
- Modify: `docs/superpowers/plans/2026-07-07-dashboard-truthfulness-p1.md`
  - Track this implementation plan only.

---

### Task 1: Add failing tests for dashboard truthfulness

**Files:**
- Create: `packages/web/src/components/Dashboard.truthfulness.spec.tsx`

**Interfaces:**
- Consumes: default export `Dashboard` from `./Dashboard`.
- Produces: test expectations for visible copy:
  - `生产数据看板`
  - `真实数据接入状态`
  - `进入演示看板`
  - `演示数据 / 待接入`
  - `智能种植顾问 (AI)`

- [x] **Step 1: Write the failing test**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Dashboard from './Dashboard';

describe('Dashboard truthfulness boundary', () => {
  it('defaults to a production status surface instead of showing simulated dashboard actions', () => {
    render(<Dashboard />);

    expect(screen.getByText('生产数据看板')).toBeInTheDocument();
    expect(screen.getByText('真实数据接入状态')).toBeInTheDocument();
    expect(screen.getByText('进入演示看板')).toBeInTheDocument();
    expect(screen.queryByText('智能种植顾问 (AI)')).not.toBeInTheDocument();
  });

  it('requires explicit demo opt-in before simulated AI and demo metrics are visible', () => {
    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: '进入演示看板' }));

    expect(screen.getByText(/演示数据 \/ 待接入/)).toBeInTheDocument();
    expect(screen.getByText('智能种植顾问 (AI)')).toBeInTheDocument();
    expect(screen.getByText('返回生产状态')).toBeInTheDocument();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/Dashboard.truthfulness.spec.tsx
```

Expected: FAIL because `Dashboard.truthfulness.spec.tsx` is new and the current Dashboard still renders the simulated action bar by default.

---

### Task 2: Implement the production-default dashboard boundary

**Files:**
- Modify: `packages/web/src/components/Dashboard.tsx`

**Interfaces:**
- Produces local UI state:
  - `const [dashboardMode, setDashboardMode] = useState<'production' | 'demo'>('production');`
  - `ProductionDashboardStatus` local component with `onEnterDemo: () => void`.
- Existing demo dashboard remains in the same component body after the production-mode early return.

- [x] **Step 1: Add a local production status component near the top of `Dashboard.tsx`**

Add after `const COLORS = ...`:

```tsx
function ProductionDashboardStatus({ onEnterDemo }: { onEnterDemo: () => void }) {
  return (
    <div className="flex h-full min-h-[520px] flex-col gap-4 bg-white p-6">
      <div className="rounded-lg border border-[#E1DFDD] bg-[#FAFAFA] p-5">
        <div className="text-xs font-semibold uppercase text-[#605E5C]">Production mode</div>
        <h2 className="mt-2 text-2xl font-semibold text-[#242424]">生产数据看板</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#605E5C]">
          当前页面已进入生产默认模式。系统不会把模拟 AI 预测、模拟自动刷新或硬编码经营指标展示为真实运营数据。
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-lg border border-[#E1DFDD] bg-white p-4">
          <h3 className="text-sm font-semibold text-[#242424]">真实数据接入状态</h3>
          <p className="mt-2 text-sm text-[#605E5C]">批次、农事、溯源扫码、额度消耗等数据已有业务模块承载。</p>
        </section>
        <section className="rounded-lg border border-[#E1DFDD] bg-white p-4">
          <h3 className="text-sm font-semibold text-[#242424]">模拟能力隔离</h3>
          <p className="mt-2 text-sm text-[#605E5C]">AI 预测、PDF 报告、自动预警等演示动作仅在显式进入演示看板后出现。</p>
        </section>
        <section className="rounded-lg border border-[#E1DFDD] bg-white p-4">
          <h3 className="text-sm font-semibold text-[#242424]">下一步接入</h3>
          <p className="mt-2 text-sm text-[#605E5C]">后续可新增真实聚合 API，把这里替换为生产 KPI、趋势图和告警。</p>
        </section>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        演示看板仍可用于售前或内部评审，但必须带有演示标识，避免和生产数据混淆。
      </div>

      <div>
        <button
          type="button"
          onClick={onEnterDemo}
          className="inline-flex h-9 items-center rounded-[4px] bg-[#0078D4] px-4 text-sm font-semibold text-white hover:bg-[#106EBE]"
        >
          进入演示看板
        </button>
      </div>
    </div>
  );
}
```

- [x] **Step 2: Add production mode state at the start of `Dashboard`**

Add immediately after `export default function Dashboard() {`:

```tsx
  const [dashboardMode, setDashboardMode] = useState<'production' | 'demo'>('production');
  if (dashboardMode === 'production') {
    return <ProductionDashboardStatus onEnterDemo={() => setDashboardMode('demo')} />;
  }
```

- [x] **Step 3: Add a demo escape action to the demo action bar**

In the action button group that already contains `年度溯源决策报告 (PDF)`, `智能种植顾问 (AI)`, and `自动刷新`, add this button before the PDF button:

```tsx
          <button
             type="button"
             onClick={() => setDashboardMode('production')}
             className="flex items-center gap-1.5 rounded border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
             <ArrowLeft className="h-3 w-3" /> 返回生产状态
          </button>
```

- [x] **Step 4: Ensure `ArrowLeft` is imported from `lucide-react`**

Update the lucide import list in `Dashboard.tsx` to include:

```tsx
  ArrowLeft,
```

- [x] **Step 5: Run the focused test and verify it passes**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/Dashboard.truthfulness.spec.tsx
```

Expected: PASS.

---

### Task 3: Verify integration, build, and review

**Files:**
- Review: `packages/web/src/components/Dashboard.tsx`
- Review: `packages/web/src/components/Dashboard.truthfulness.spec.tsx`

**Interfaces:**
- Consumes: Task 1 and Task 2 outputs.
- Produces: verified P1 commit.

- [x] **Step 1: Run related tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/Dashboard.truthfulness.spec.tsx src/App.spec.tsx
```

Expected: PASS.

- [x] **Step 2: Run Web type check and build**

Run:

```powershell
corepack pnpm@10.33.2 --filter web lint
corepack pnpm@10.33.2 --filter web build
```

Expected: both PASS.

- [x] **Step 3: Run full local verification**

Run:

```powershell
corepack pnpm@10.33.2 verify:local
```

Expected: PASS.

- [x] **Step 4: Inspect diff**

Run:

```powershell
git -c safe.directory=E:/code/nongchang/.worktrees/dashboard-real-data-p1 -C E:\code\nongchang\.worktrees\dashboard-real-data-p1 diff --check
git -c safe.directory=E:/code/nongchang/.worktrees/dashboard-real-data-p1 -C E:\code\nongchang\.worktrees\dashboard-real-data-p1 diff -- packages/web/src/components/Dashboard.tsx packages/web/src/components/Dashboard.truthfulness.spec.tsx
```

Expected: no whitespace errors; diff only contains the planned dashboard boundary and test.

- [x] **Step 5: Commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang/.worktrees/dashboard-real-data-p1 -C E:\code\nongchang\.worktrees\dashboard-real-data-p1 add docs/superpowers/plans/2026-07-07-dashboard-truthfulness-p1.md packages/web/src/components/Dashboard.tsx packages/web/src/components/Dashboard.truthfulness.spec.tsx
git -c safe.directory=E:/code/nongchang/.worktrees/dashboard-real-data-p1 -C E:\code\nongchang\.worktrees\dashboard-real-data-p1 commit -m "fix(web): gate dashboard demo mode"
```

Expected: commit succeeds on branch `codex/dashboard-real-data-p1`.

---

## Self-Review

- Spec coverage: The plan addresses P1 dashboard truthfulness by making production mode the default, keeping demo mode explicit, and adding tests.
- Placeholder scan: No TBD/TODO/implement-later placeholders are present.
- Type consistency: `dashboardMode` is a local union state and `ProductionDashboardStatus` receives `onEnterDemo: () => void`; tests assert visible user-facing copy only.
