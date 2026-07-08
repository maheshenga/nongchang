# Dashboard Demo Bundle Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the heavy demo dashboard bundle by loading the screenshot export dependency only when the user explicitly exports the Gantt chart.

**Architecture:** Keep the current `DashboardDemo` UI and demo boundary intact. Replace the top-level `html2canvas` static import with an interaction-time dynamic import inside `handleExportGantt`, so the rarely used export path becomes its own async chunk while the demo dashboard still renders normally.

**Tech Stack:** React 19, Vite 6, Vitest, TypeScript, `html2canvas`, existing `packages/web` lazy-loaded dashboard surface.

## Global Constraints

- Preserve current `DashboardDemo` copy and explicit demo labels.
- Do not change backend, shared DTOs, auth, role navigation, or production dashboard behavior.
- Follow TDD: add a failing regression test before changing `DashboardDemo.tsx`.
- Use Vite dynamic `import('html2canvas')` instead of adding new dependencies.
- Run focused tests, web lint, web build, and full web tests before committing.

---

### Task 1: Defer Gantt Export Screenshot Dependency

**Files:**
- Modify: `packages/web/src/components/DashboardDemo.truthfulness.spec.tsx`
- Modify: `packages/web/src/components/DashboardDemo.tsx`
- Create: none

**Interfaces:**
- Consumes: `handleExportGantt()` currently calls `html2canvas(element, options)`.
- Produces: `handleExportGantt()` dynamically imports `html2canvas` and calls the module default export with the same element and options.

- [ ] **Step 1: Write the failing regression test**

Add this test to `packages/web/src/components/DashboardDemo.truthfulness.spec.tsx`:

```ts
  it('loads html2canvas only when the demo Gantt export is requested', () => {
    const source = readFileSync(sourcePath, 'utf8');

    expect(source).not.toMatch(/import\s+html2canvas\s+from\s+['"]html2canvas['"]/);
    expect(source).toContain("import('html2canvas')");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm@10.33.2 --filter web exec vitest run src/components/DashboardDemo.truthfulness.spec.tsx`

Expected: FAIL because `DashboardDemo.tsx` still has `import html2canvas from 'html2canvas';`.

- [ ] **Step 3: Write minimal implementation**

Modify `packages/web/src/components/DashboardDemo.tsx`:

```ts
- import html2canvas from 'html2canvas';
```

Inside `handleExportGantt`:

```ts
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(ganttRef.current, { backgroundColor: '#ffffff', scale: 2 } as any);
```

- [ ] **Step 4: Run focused test to verify it passes**

Run: `corepack pnpm@10.33.2 --filter web exec vitest run src/components/DashboardDemo.truthfulness.spec.tsx`

Expected: PASS, with both DashboardDemo truthfulness tests green.

- [ ] **Step 5: Verify the bundle split**

Run: `corepack pnpm@10.33.2 --filter web build`

Expected: PASS, and `html2canvas` should no longer be statically tied to the initial `DashboardDemo` module. A separate async chunk may appear depending on Vite chunking.

- [ ] **Step 6: Run broader web gates**

Run:

```powershell
corepack pnpm@10.33.2 --filter web lint
corepack pnpm@10.33.2 --filter web test
git -c safe.directory=E:/code/nongchang diff --check
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit**

```powershell
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p1-dashboard-demo-bundle-split.md packages/web/src/components/DashboardDemo.truthfulness.spec.tsx packages/web/src/components/DashboardDemo.tsx
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang commit -m "perf(web): defer dashboard demo export dependency"
```

## Self-Review

Spec coverage: covers the P1 performance issue found in the SaaS UI completion audit by deferring a heavy export-only dependency.

Placeholder scan: no TBD, TODO, or vague test instructions remain.

Type consistency: `html2canvas` remains the same default export function, now loaded through dynamic import before invocation.
