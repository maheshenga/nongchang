# Dashboard Demo Split P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Keep the production overview lightweight by moving the heavy demo dashboard into a lazy-loaded module that is fetched only after explicit demo opt-in.

**Architecture:** `Dashboard.tsx` remains the production boundary and imports only production dependencies. The large chart/grid/export/demo implementation moves to `DashboardDemo.tsx`; `Dashboard.tsx` loads it with `React.lazy` inside `Suspense` after the user clicks the explicit demo entry button.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, existing web API clients and shared UI states.

## Global Constraints

- Preserve the current production-first default behavior.
- Preserve the explicit demo opt-in button and return-to-production behavior.
- Do not reintroduce `dashboard`, `mobile`, or `warehouse` navigation tabs.
- Do not load `react-grid-layout`, `recharts`, or `html2canvas` from `Dashboard.tsx`.
- Keep production dashboard data sourced from real API clients: `listBatches`, `listFields`, `listFarmRecords`.
- Keep the plan ASCII-only to avoid Windows terminal encoding damage.

---

## File Structure

- Modify `packages/web/src/components/Dashboard.tsx`: keep `ProductionDashboardStatus`, move demo code out, add lazy import of `DashboardDemo`.
- Create `packages/web/src/components/DashboardDemo.tsx`: own all heavy demo-only dependencies and the previous `DashboardDemo` implementation.
- Modify `packages/web/src/components/Dashboard.truthfulness.spec.tsx`: add a regression test that production render does not import the demo module before opt-in, then does import it after opt-in.

---

### Task 1: Lock The Lazy Demo Boundary With A Failing Test

**Files:**
- Modify: `packages/web/src/components/Dashboard.truthfulness.spec.tsx`

**Interfaces:**
- Consumes: `Dashboard` default export.
- Produces: a test that proves `./DashboardDemo` is not evaluated during default production render and is evaluated only after clicking the demo button.

- [x] **Step 1: Add a mock and lazy-boundary test**

In `packages/web/src/components/Dashboard.truthfulness.spec.tsx`, add this hoisted counter and mock before importing `Dashboard`:

```tsx
const demoModuleMock = vi.hoisted(() => ({ imports: 0 }));

vi.mock('./DashboardDemo', () => {
  demoModuleMock.imports += 1;
  return { default: ({ onExitDemo }: { onExitDemo: () => void }) => (
    <div>
      <div>Lazy Demo Dashboard</div>
      <button type="button" onClick={onExitDemo}>Return from lazy demo</button>
    </div>
  ) };
});
```

Add this test:

```tsx
it('lazy-loads the demo dashboard only after explicit opt-in', async () => {
  render(<Dashboard />);

  expect(await screen.findByText('Production mode')).toBeTruthy();
  expect(demoModuleMock.imports).toBe(0);

  fireEvent.click(screen.getByRole('button', { name: '\u8fdb\u5165\u6f14\u793a\u770b\u677f' }));

  expect(await screen.findByText('Lazy Demo Dashboard')).toBeTruthy();
  expect(demoModuleMock.imports).toBe(1);
});
```

- [x] **Step 2: Run the test and verify it fails**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/Dashboard.truthfulness.spec.tsx
```

Expected before implementation: fail because `Dashboard.tsx` still defines demo behavior inline and there is no `./DashboardDemo` module for the lazy boundary.

---

### Task 2: Extract The Heavy Demo Dashboard

**Files:**
- Modify: `packages/web/src/components/Dashboard.tsx`
- Create: `packages/web/src/components/DashboardDemo.tsx`

**Interfaces:**
- Consumes: `DashboardDemoProps = { onExitDemo: () => void }`.
- Produces: `DashboardDemo.tsx` default export that renders the existing demo dashboard and calls `onExitDemo` from the return button.

- [x] **Step 1: Move demo-only imports**

In `Dashboard.tsx`, remove demo-only imports:

```ts
import { useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import { Responsive, WidthProvider } from 'react-grid-layout';
import { AreaChart, Area, BarChart, Bar, CartesianGrid, Cell, LineChart, Line, PieChart, Pie, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import AntiFakeMonitor from './AntiFakeMonitor';
import DemoBadge from './DemoBadge';
```

Keep only the production imports in `Dashboard.tsx`:

```ts
import { lazy, Suspense, useState } from 'react';
import { listBatches } from '../api/batches';
import { listFarmRecords } from '../api/farm-records';
import { listFields } from '../api/fields';
import { useApi } from '../hooks/useApi';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';
```

- [x] **Step 2: Create the lazy demo module**

Create `packages/web/src/components/DashboardDemo.tsx` with:

```tsx
export interface DashboardDemoProps {
  onExitDemo: () => void;
}

export default function DashboardDemo({ onExitDemo }: DashboardDemoProps) {
  // Paste the previous DashboardDemo implementation here unchanged except for exported props.
}
```

All constants used only by the demo, including chart data, `ResponsiveGridLayout`, and `COLORS`, move into this file.

- [x] **Step 3: Add lazy loading to Dashboard.tsx**

In `Dashboard.tsx`, add:

```ts
const DashboardDemo = lazy(() => import('./DashboardDemo'));
```

Render demo mode with a lightweight fallback:

```tsx
return dashboardMode === 'production' ? (
  <ProductionDashboardStatus onEnterDemo={() => setDashboardMode('demo')} />
) : (
  <Suspense fallback={<LoadingState label="Loading demo dashboard" />}>
    <DashboardDemo onExitDemo={() => setDashboardMode('production')} />
  </Suspense>
);
```

- [x] **Step 4: Run focused tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/Dashboard.truthfulness.spec.tsx src/App.spec.tsx
```

Expected: all focused tests pass.

---

### Task 3: Verify Performance Boundary And Finish

**Files:**
- Review changed files and build output.

**Interfaces:**
- Consumes: extracted demo module and passing focused tests.
- Produces: verified P1 commit.

- [x] **Step 1: Run web lint**

Run:

```powershell
corepack pnpm@10.33.2 --filter web lint
```

Expected: exit code 0.

- [x] **Step 2: Run web build**

Run:

```powershell
corepack pnpm@10.33.2 --filter web build
```

Expected: exit code 0 and build output shows the production `Dashboard-*` chunk is smaller than the previous observed `789.86 kB` minified chunk because demo-only dependencies moved into a separate lazy chunk.

- [x] **Step 3: Run local verification**

Run:

```powershell
corepack pnpm@10.33.2 verify:local
```

Expected: exit code 0.

- [x] **Step 4: Request code review**

Use `superpowers:requesting-code-review`. Review must check:
- `Dashboard.tsx` no longer statically imports heavy demo dependencies.
- Demo entry remains explicit and reversible.
- Production dashboard still uses real APIs and keeps truthfulness boundaries.
- Tests cover the lazy boundary.

- [x] **Step 5: Fix Critical or Important findings**

Patch any Critical or Important review findings, rerun focused tests, then rerun `web lint`, `web build`, and `verify:local` if app code changed.

- [x] **Step 6: Commit**

Run:

```powershell
git status --short
git add docs/superpowers/plans/2026-07-07-dashboard-demo-split-p1.md packages/web/src/components/Dashboard.tsx packages/web/src/components/DashboardDemo.tsx packages/web/src/components/Dashboard.truthfulness.spec.tsx
git commit -m "refactor(web): lazy load dashboard demo"
```

Expected: one commit on `codex/dashboard-demo-split-p1`.

---

## Self-Review

- Spec coverage: plan reduces production dashboard load by splitting demo code, preserves explicit demo opt-in, verifies tests/build/local suite, and requires review before commit.
- Placeholder scan: no TBD/TODO/later placeholders remain.
- Type consistency: `DashboardDemoProps` and `onExitDemo` are consistently used by the lazy module and parent.
