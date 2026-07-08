# P1 MobileView Legacy Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Physically isolate the old `MobileView` demo surface from production web components so it cannot be mistaken for a routed SaaS feature.

**Architecture:** The production app already blocks `MobileView` from `App.tsx`, `navigation.ts`, and Tailwind CSS inputs. This slice keeps that behavior and adds a stronger filesystem boundary: the component moves from `packages/web/src/components/MobileView.tsx` to `packages/web/src/components/legacy/MobileView.tsx`, with a README documenting that the surface is reference-only and not production-routed.

**Tech Stack:** Vite, React 19, TypeScript, Vitest, Tailwind CSS, CodeGraph/codebase-memory for code discovery.

## Global Constraints

- Do not restore `MobileView`, `mobile`, `dashboard`, or `warehouse` as production navigation tabs.
- Do not change backend APIs, auth flows, billing flows, or role permissions.
- Do not rewrite the large legacy component in this slice.
- Preserve current web lint/test/build passing state.
- Use TDD: write and run the failing isolation test before moving the component.
- Work on the current non-main branch `codex/p1-truthful-product-copy`.

---

## File Structure

- Create: `packages/web/src/components/legacy/README.md`
  - Documents that legacy demo components are not production-routed.
- Move: `packages/web/src/components/MobileView.tsx` to `packages/web/src/components/legacy/MobileView.tsx`
  - Keeps the old source intact for reference while removing it from the production component root.
- Create: `packages/web/src/components/legacy-boundary.spec.ts`
  - Verifies `MobileView.tsx` no longer exists in `components/`, verifies the legacy copy and README exist, and verifies production shell/navigation do not import the legacy path.
- Keep: `packages/web/src/navigation.spec.ts`
  - Existing production navigation guard remains unchanged.

## Task 1: Add Legacy Boundary Test

**Files:**
- Create: `packages/web/src/components/legacy-boundary.spec.ts`

**Interfaces:**
- Consumes: Node `fs` and `path` APIs inside Vitest.
- Produces: A source-level guard named `legacy component boundary`.

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/components/legacy-boundary.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(__dirname, '..');
const componentsRoot = __dirname;

describe('legacy component boundary', () => {
  it('keeps MobileView out of the production components root', () => {
    expect(existsSync(resolve(componentsRoot, 'MobileView.tsx'))).toBe(false);
    expect(existsSync(resolve(componentsRoot, 'legacy', 'MobileView.tsx'))).toBe(true);
    expect(existsSync(resolve(componentsRoot, 'legacy', 'README.md'))).toBe(true);
  });

  it('keeps the production app shell from importing legacy demo surfaces', () => {
    const appSource = readFileSync(resolve(srcRoot, 'App.tsx'), 'utf8');
    const navigationSource = readFileSync(resolve(srcRoot, 'navigation.ts'), 'utf8');

    expect(appSource).not.toMatch(/MobileView|components\/legacy|\.\/components\/legacy/);
    expect(navigationSource).not.toMatch(/MobileView|components\/legacy|mobile|warehouse/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/legacy-boundary.spec.ts
```

Expected: FAIL because `packages/web/src/components/MobileView.tsx` still exists and `packages/web/src/components/legacy/MobileView.tsx` does not exist.

- [ ] **Step 3: Commit status**

Do not commit yet. Proceed to Task 2 after confirming the failure is for the expected boundary reason.

## Task 2: Move MobileView Into Legacy Boundary

**Files:**
- Move: `packages/web/src/components/MobileView.tsx` to `packages/web/src/components/legacy/MobileView.tsx`
- Create: `packages/web/src/components/legacy/README.md`

**Interfaces:**
- Consumes: No production imports. The moved default export remains `MobileView` for archival/reference use only.
- Produces: Physical legacy component boundary for tests and future developers.

- [ ] **Step 1: Move the component**

Use a native file move that preserves the file content:

```powershell
New-Item -ItemType Directory -Force packages\web\src\components\legacy
Move-Item -LiteralPath packages\web\src\components\MobileView.tsx -Destination packages\web\src\components\legacy\MobileView.tsx
```

- [ ] **Step 2: Add the legacy README**

Create `packages/web/src/components/legacy/README.md`:

```md
# Legacy Components

This directory contains retired or reference-only UI surfaces that are not part of the production SaaS console.

`MobileView.tsx` is kept only as historical reference for the older mobile demo. It contains simulated workflows, local-only interactions, mock sensor values, and non-production copy. Do not import it from `App.tsx`, `navigation.ts`, routed production pages, or shared production UI.

If a real mobile workflow is needed, implement it in `packages/miniapp` or behind a new production plan with real API contracts and tests.
```

- [ ] **Step 3: Run focused test to verify it passes**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/legacy-boundary.spec.ts src/navigation.spec.ts
```

Expected: PASS. The old production root path is gone, the legacy path exists, and production navigation guards still pass.

## Task 3: Full Verification And Commit

**Files:**
- Verify all files changed in Tasks 1 and 2.

**Interfaces:**
- Consumes: Current web test/build scripts.
- Produces: One committed P1 slice.

- [ ] **Step 1: Run web type check**

Run:

```powershell
corepack pnpm@10.33.2 --filter web lint
```

Expected: PASS.

- [ ] **Step 2: Run full web unit suite**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test
```

Expected: PASS with all web test files passing.

- [ ] **Step 3: Run production build**

Run:

```powershell
corepack pnpm@10.33.2 --filter web build
```

Expected: PASS. Existing large chunk warnings may remain, but no new MobileView production chunk should appear unless something imports it.

- [ ] **Step 4: Check diff hygiene**

Run:

```powershell
git -c safe.directory=E:/code/nongchang diff --check
git -c safe.directory=E:/code/nongchang status --short
```

Expected: no whitespace errors; changed files limited to the plan, test, legacy README, and MobileView move.

- [ ] **Step 5: Stage exact files**

Run:

```powershell
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p1-mobileview-legacy-isolation.md packages/web/src/components/legacy-boundary.spec.ts packages/web/src/components/legacy/README.md packages/web/src/components/legacy/MobileView.tsx packages/web/src/components/MobileView.tsx
```

Expected: files staged; deleted old path and added new path are visible in `git diff --cached --name-status`.

- [ ] **Step 6: Verify staged diff**

Run:

```powershell
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang diff --cached --stat
```

Expected: no whitespace errors; stat shows one rename/move plus new plan/test/README.

- [ ] **Step 7: Commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang commit -m "chore(web): isolate legacy mobile demo surface"
```

Expected: commit succeeds.

## Self-Review

- Spec coverage: The plan physically isolates `MobileView`, preserves production navigation constraints, avoids backend/API changes, and includes focused plus full verification.
- Placeholder scan: No `TBD`, `TODO`, `implement later`, or unresolved placeholder instructions remain.
- Type consistency: The test paths use `componentsRoot = __dirname` and `srcRoot = resolve(__dirname, '..')`, matching the actual location `packages/web/src/components/legacy-boundary.spec.ts`.
