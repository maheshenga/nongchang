# Task 12 Legacy Demo Bundle Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove legacy demo tab contracts and demo-only Tailwind safelist hints from the production web navigation surface.

**Architecture:** Keep the production console keyed only by `AppTab`. Unknown or historic tab strings still fail closed through `firstAllowedTab`, but demo-only names are no longer exported as first-class production concepts. Remove dead MobileView-specific CSS safelist hints because `MobileView` is no longer imported by the production `App` shell.

**Tech Stack:** React 19, Vite 6, Tailwind 4, Vitest, pnpm 10.33.2.

## Global Constraints

- Worktree: `E:/code/nongchang/.worktrees/saas-audit-priority-fixes`.
- Branch: `codex/saas-audit-priority-fixes`.
- One reviewed and verified commit for this task.
- Do not commit `.superpowers/` scratch files.
- Follow TDD: red test first, minimal implementation, green verification.
- Keep existing role navigation behavior unchanged for real SaaS tabs.

---

## File Map

- Modify: `packages/web/src/navigation.ts`
  - Remove `LegacyDemoTab`, `AnyTab`, `LEGACY_DEMO_TABS`, and `isDemoTab` from the production module.
  - Change `firstAllowedTab` to accept unknown string input directly and return the first allowed production tab when it is not allowed.
- Modify: `packages/web/src/navigation.spec.ts`
  - Assert demo helper exports are absent at runtime.
  - Keep fallback checks for historic strings such as `dashboard`.
  - Add a source-level bundle hygiene guard for `App.tsx` and `index.css`.
- Modify: `packages/web/src/index.css`
  - Remove the `MobileView.tsx` dynamic class safelist block and related `@source inline` rules.
- Verify: `packages/web/src/App.tsx`
  - Confirm no production import/render branch references `Dashboard`, `MobileView`, or `warehouse`.

---

### Task 12: Legacy Demo Bundle Hygiene

**Files:**
- Modify: `packages/web/src/navigation.ts`
- Modify: `packages/web/src/navigation.spec.ts`
- Modify: `packages/web/src/index.css`

**Interfaces:**
- Consumes: `getNavItems(role: SystemRole): NavCategory[]`, `flattenNavItems(items: NavCategory[]): NavItem[]`.
- Produces: `firstAllowedTab(role: SystemRole, requestedTab: string | null | undefined): AppTab`.

- [x] **Step 1: Write the failing tests**

Update `packages/web/src/navigation.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as navigation from './navigation';
import { firstAllowedTab, flattenNavItems, getNavItems, type SystemRole } from './navigation';

const __dirname = dirname(fileURLToPath(import.meta.url));
```

Add assertions:

```ts
it('does not export legacy demo tab helpers from the production navigation contract', () => {
  expect(navigation).not.toHaveProperty('isDemoTab');
});

it('keeps legacy demo component hints out of the production shell and CSS bundle inputs', () => {
  const appSource = readFileSync(resolve(__dirname, 'App.tsx'), 'utf8');
  const cssSource = readFileSync(resolve(__dirname, 'index.css'), 'utf8');

  expect(appSource).not.toMatch(/Dashboard|MobileView|warehouse/);
  expect(cssSource).not.toMatch(/MobileView|themeTheme/);
  expect(cssSource).not.toContain('{bg,text,from,to,shadow}-{emerald,purple}');
  expect(cssSource).not.toContain('text-{emerald,purple}-100/90');
});
```

Update the existing fallback test so it no longer imports or calls `isDemoTab`:

```ts
it('falls back to the first allowed production tab for legacy or unauthorized tab strings', () => {
  expect(firstAllowedTab('merchant_admin', 'dashboard')).toBe('fields');
  expect(firstAllowedTab('merchant_admin', 'logistics')).toBe('logistics');
  expect(firstAllowedTab('agent_admin', 'fields')).toBe('merchantFiles');
  expect(firstAllowedTab('platform_admin', 'warehouse')).toBe('tenants');
});
```

- [x] **Step 2: Verify red**

Run:

```bash
corepack pnpm@10.33.2 --filter web exec vitest run src/navigation.spec.ts
```

Expected: fail because `isDemoTab` is still exported and `index.css` still contains the MobileView safelist block.

- [x] **Step 3: Implement production-only navigation contract**

In `packages/web/src/navigation.ts`:

```ts
export const firstAllowedTab = (
  role: SystemRole,
  requestedTab: string | null | undefined,
): AppTab => {
  const items = flattenNavItems(getNavItems(role));
  const allowed = items.find((item) => item.id === requestedTab);
  return allowed?.id ?? items[0].id;
};
```

Remove:

```ts
export type LegacyDemoTab = 'dashboard' | 'mobile' | 'warehouse';
export type AnyTab = AppTab | LegacyDemoTab;
const LEGACY_DEMO_TABS = new Set<LegacyDemoTab>(['dashboard', 'mobile', 'warehouse']);
export const isDemoTab = ...
```

- [x] **Step 4: Remove dead Tailwind demo safelist**

In `packages/web/src/index.css`, delete the `MobileView.tsx` comment and the four `@source inline(...)` rules immediately below it.

- [x] **Step 5: Verify green**

Run:

```bash
corepack pnpm@10.33.2 --filter web exec vitest run src/navigation.spec.ts
corepack pnpm@10.33.2 --filter web test
corepack pnpm@10.33.2 --filter web lint
corepack pnpm@10.33.2 --filter web build
git -c safe.directory=E:/code/nongchang/.worktrees/saas-audit-priority-fixes diff --check
```

Expected: all commands exit 0. `diff --check` may print LF-to-CRLF warnings only.

- [x] **Step 6: Review and commit**

Review:

```bash
git -c safe.directory=E:/code/nongchang/.worktrees/saas-audit-priority-fixes diff -- packages/web/src/navigation.ts packages/web/src/navigation.spec.ts packages/web/src/index.css
```

Request code review for the task diff. Fix Critical or Important findings.

Commit:

```bash
git add packages/web/src/navigation.ts packages/web/src/navigation.spec.ts packages/web/src/index.css docs/superpowers/plans/2026-07-07-task-12-legacy-demo-bundle-hygiene.md
git commit -m "chore(web): isolate legacy demo surfaces"
```
