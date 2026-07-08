# Dashboard Demo Vendor Chunk Split P2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the remaining production build warning caused by the oversized opt-in `DashboardDemo` chunk by splitting demo-only chart/layout/animation vendors into stable async chunks.

**Architecture:** Keep the existing production/dashboard demo boundary unchanged: `Dashboard` still lazy-loads `DashboardDemo`, and users still explicitly enter demo mode. Add a tiny tested Vite manual-chunk helper that only groups known demo-heavy vendor packages (`recharts`, `d3-*`, `react-grid-layout`, `react-resizable`, and `motion`) away from the `DashboardDemo` module. Do not change UI behavior, backend APIs, routes, or demo copy.

**Tech Stack:** Vite 6, Rollup `output.manualChunks`, React 19, TypeScript, Vitest.

## Global Constraints

- Do not change `Dashboard.tsx` production-mode behavior or the explicit demo opt-in.
- Do not remove `DashboardDemo` features in this P2 slice.
- Do not add dependencies.
- Keep chunking rules deterministic and covered by unit tests.
- Build verification must prove there is no `Some chunks are larger than 500 kB` warning.
- Existing `html2canvas` dynamic import must remain intact.

---

## File Structure

- Create: `packages/web/src/config/manual-chunks.ts`
  - Exports `dashboardDemoManualChunk(id: string): string | undefined`.
- Create: `packages/web/src/config/manual-chunks.spec.ts`
  - Tests known demo-heavy vendor package ids and non-demo ids.
- Modify: `packages/web/vite.config.ts`
  - Wires `dashboardDemoManualChunk` into `build.rollupOptions.output.manualChunks` while preserving existing `commonjsOptions`.
- Modify: `docs/superpowers/plans/2026-07-09-p2-dashboard-demo-vendor-chunks.md`
  - Tracks this P2 execution plan.

## Task 1: Add Manual Chunk Contract Tests

**Files:**
- Create: `packages/web/src/config/manual-chunks.spec.ts`

**Interfaces:**
- Consumes: `dashboardDemoManualChunk(id: string): string | undefined`.
- Produces: a focused regression contract for Vite manual chunk routing.

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/config/manual-chunks.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dashboardDemoManualChunk } from './manual-chunks';

describe('dashboardDemoManualChunk', () => {
  it('splits demo chart packages into a chart vendor chunk', () => {
    expect(dashboardDemoManualChunk('E:/code/nongchang/packages/web/node_modules/recharts/es6/chart/AreaChart.js')).toBe(
      'dashboard-demo-charts',
    );
    expect(dashboardDemoManualChunk('E:/code/nongchang/packages/web/node_modules/d3-scale/src/index.js')).toBe(
      'dashboard-demo-charts',
    );
  });

  it('splits demo grid and animation packages into focused chunks', () => {
    expect(
      dashboardDemoManualChunk('E:/code/nongchang/packages/web/node_modules/react-grid-layout/build/ResponsiveReactGridLayout.js'),
    ).toBe('dashboard-demo-layout');
    expect(dashboardDemoManualChunk('E:/code/nongchang/packages/web/node_modules/react-resizable/build/Resizable.js')).toBe(
      'dashboard-demo-layout',
    );
    expect(dashboardDemoManualChunk('E:/code/nongchang/packages/web/node_modules/motion/dist/es/index.mjs')).toBe(
      'dashboard-demo-motion',
    );
  });

  it('leaves shared app dependencies in Vite default chunks', () => {
    expect(dashboardDemoManualChunk('E:/code/nongchang/packages/web/src/components/DashboardDemo.tsx')).toBeUndefined();
    expect(dashboardDemoManualChunk('E:/code/nongchang/packages/web/node_modules/react/index.js')).toBeUndefined();
    expect(dashboardDemoManualChunk('E:/code/nongchang/packages/web/node_modules/lucide-react/dist/esm/icons/mail.js')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run focused test to verify it fails**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/config/manual-chunks.spec.ts
```

Expected: FAIL because `packages/web/src/config/manual-chunks.ts` does not exist.

## Task 2: Implement Manual Chunk Helper And Vite Wiring

**Files:**
- Create: `packages/web/src/config/manual-chunks.ts`
- Modify: `packages/web/vite.config.ts`

**Interfaces:**
- Produces: `dashboardDemoManualChunk(id: string): string | undefined`.
- Vite consumes: `build.rollupOptions.output.manualChunks`.

- [ ] **Step 1: Create the helper**

Create `packages/web/src/config/manual-chunks.ts`:

```ts
export function dashboardDemoManualChunk(id: string): string | undefined {
  const normalized = id.replaceAll('\\', '/');
  if (!normalized.includes('/node_modules/')) return undefined;

  if (normalized.includes('/recharts/') || /\/node_modules\/d3-[^/]+\//.test(normalized)) {
    return 'dashboard-demo-charts';
  }

  if (normalized.includes('/react-grid-layout/') || normalized.includes('/react-resizable/')) {
    return 'dashboard-demo-layout';
  }

  if (normalized.includes('/motion/')) {
    return 'dashboard-demo-motion';
  }

  return undefined;
}
```

- [ ] **Step 2: Wire the helper into Vite**

Modify `packages/web/vite.config.ts`:

```ts
import { dashboardDemoManualChunk } from './src/config/manual-chunks';
```

Inside `build`, keep `commonjsOptions` and add:

```ts
      rollupOptions: {
        output: {
          manualChunks: dashboardDemoManualChunk,
        },
      },
```

- [ ] **Step 3: Run focused test to verify it passes**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/config/manual-chunks.spec.ts
```

Expected: PASS.

## Task 3: Verify Bundle Warning Is Gone

**Files:**
- Verify: `packages/web/vite.config.ts`
- Verify: `packages/web/src/config/manual-chunks.ts`
- Verify: `packages/web/src/config/manual-chunks.spec.ts`

**Interfaces:**
- Produces: clean build output without the large chunk warning.

- [ ] **Step 1: Run production build and inspect warning**

Run:

```powershell
corepack pnpm@10.33.2 --filter web build
```

Expected: exit 0 and output does not contain `Some chunks are larger than 500 kB`.

- [ ] **Step 2: Run full web gates**

Run:

```powershell
corepack pnpm@10.33.2 --filter web lint
corepack pnpm@10.33.2 --filter web test
git -c safe.directory=E:/code/nongchang diff --check
```

Expected: all commands exit 0.

- [ ] **Step 3: Review and commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang diff --stat
git -c safe.directory=E:/code/nongchang diff -- packages/web/vite.config.ts packages/web/src/config/manual-chunks.ts packages/web/src/config/manual-chunks.spec.ts docs/superpowers/plans/2026-07-09-p2-dashboard-demo-vendor-chunks.md
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p2-dashboard-demo-vendor-chunks.md packages/web/vite.config.ts packages/web/src/config/manual-chunks.ts packages/web/src/config/manual-chunks.spec.ts
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang commit -m "perf(web): split dashboard demo vendor chunks"
```

Expected: one focused P2 commit.

## Self-Review

- Spec coverage: This plan targets the next current performance defect observed in build output after all existing P1-P7 plans were found committed: the opt-in demo dashboard still emits a chunk-size warning.
- Placeholder scan: No TBD/TODO/fill-in steps remain.
- Type consistency: `dashboardDemoManualChunk(id: string): string | undefined` is defined once and used consistently by tests and Vite.
