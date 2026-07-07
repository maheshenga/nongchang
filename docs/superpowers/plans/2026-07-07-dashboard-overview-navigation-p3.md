# Production Overview Navigation P3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Expose the real-data production dashboard summary through a safe `overview` navigation tab while keeping legacy demo-only `dashboard`, `mobile`, and `warehouse` tabs isolated.

**Architecture:** Add a new production `overview` tab to the role navigation contract and render the existing `Dashboard` component from the authenticated app shell. `Dashboard` remains production-first by default; the legacy simulated dashboard stays reachable only through its explicit in-component demo opt-in.

**Tech Stack:** React, TypeScript, Vite, Vitest, Testing Library, lucide-react, existing `Dashboard` API-backed summary.

## Global Constraints

- Do not restore or export a legacy `dashboard` tab id.
- Do not restore `MobileView` or `warehouse` surfaces.
- `overview` is available only to tenant/business roles: `system_admin`, `agent_admin`, and `merchant_admin`.
- `platform_admin` remains limited to tenant lifecycle navigation.
- `member` remains limited to local settings.
- Use the existing lazy route mounting pattern in `packages/web/src/App.tsx`.
- Keep tests focused on navigation truthfulness and role isolation.

---

## File Structure

- Modify `packages/web/src/navigation.ts`: add `overview` to `AppTab`, import `LayoutDashboard`, and include the production overview nav item for tenant/business roles.
- Modify `packages/web/src/App.tsx`: lazy-load `Dashboard`, initialize the shell on `overview`, and mount it under the existing tab rendering pattern.
- Modify `packages/web/src/navigation.spec.ts`: prove `overview` is present only for allowed roles, legacy tabs are still absent, and legacy `dashboard` requests fall back safely.
- Modify `packages/web/src/App.spec.tsx`: mock `Dashboard` and prove tenant roles can open production overview while platform/member roles cannot.

---

### Task 1: Navigation Contract For Production Overview

**Files:**
- Modify: `packages/web/src/navigation.ts`
- Test: `packages/web/src/navigation.spec.ts`

**Interfaces:**
- Consumes: existing `SystemRole`, `AppTab`, `getNavItems`, `firstAllowedTab`, `flattenNavItems`.
- Produces: new `AppTab` literal `'overview'`, nav item label for production overview, and `firstAllowedTab(..., 'dashboard')` fallback to `overview` for tenant/business roles.

- [x] **Step 1: Write the failing navigation tests**

Update `packages/web/src/navigation.spec.ts` with assertions that:

```ts
expect(idsFor('system_admin')[0]).toBe('overview');
expect(idsFor('agent_admin')[0]).toBe('overview');
expect(idsFor('merchant_admin')[0]).toBe('overview');
expect(idsFor('platform_admin')).not.toContain('overview');
expect(idsFor('member')).not.toContain('overview');
expect(firstAllowedTab('merchant_admin', 'dashboard')).toBe('overview');
expect(firstAllowedTab('system_admin', 'dashboard')).toBe('overview');
expect(firstAllowedTab('agent_admin', 'dashboard')).toBe('overview');
expect(firstAllowedTab('platform_admin', 'dashboard')).toBe('tenants');
expect(firstAllowedTab('member', 'dashboard')).toBe('settings');
```

Also update the existing production shell hygiene assertion so `Dashboard` is allowed as a production component while `MobileView` and `warehouse` remain blocked:

```ts
expect(appSource).not.toMatch(/MobileView|warehouse/);
```

- [x] **Step 2: Run navigation tests and verify they fail**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/navigation.spec.ts
```

Expected before implementation: fail because `overview` is not in `AppTab` or role navigation yet, and fallback still returns older first tabs.

- [x] **Step 3: Implement the navigation contract**

In `packages/web/src/navigation.ts`, add `LayoutDashboard` to the lucide import:

```ts
LayoutDashboard,
```

Add `overview` to `AppTab`:

```ts
export type AppTab =
  | 'overview'
  | 'tenants'
  | 'fields'
```

Add the overview nav item as the first flattened item for `system_admin`, `agent_admin`, and `merchant_admin`:

```ts
{ id: 'overview', label: 'production overview label', icon: LayoutDashboard }
```

- [x] **Step 4: Run navigation tests and verify they pass**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/navigation.spec.ts
```

Expected: all `navigation.spec.ts` tests pass.

---

### Task 2: App Shell Mounting And Role Interaction

**Files:**
- Modify: `packages/web/src/App.tsx`
- Test: `packages/web/src/App.spec.tsx`

**Interfaces:**
- Consumes: `AppTab` now includes `'overview'`; `Dashboard` default export remains the production-first summary component.
- Produces: authenticated tenant/business users can open production overview from nav/search; platform/member roles still cannot mount dashboard content.

- [x] **Step 1: Write the failing App tests**

In `packages/web/src/App.spec.tsx`, add a dashboard mock:

```ts
vi.mock('./components/Dashboard', () => ({ default: () => <div>Production Overview View</div> }));
```

Add tests that:

```ts
authMock.role = 'merchant';
render(<App />);
expect(await screen.findByText('Production Overview View')).toBeTruthy();

authMock.role = 'system_admin';
render(<App />);
const overviewLabel = '\u751f\u4ea7\u603b\u89c8';
fireEvent.change(await screen.findByPlaceholderText('\u641c\u7d22\u8d44\u6e90\u3001\u83dc\u5355\u548c\u529f\u80fd'), { target: { value: overviewLabel } });
fireEvent.click(await screen.findByRole('button', { name: `\u6253\u5f00 ${overviewLabel}` }));
expect(await screen.findByText('Production Overview View')).toBeTruthy();
```

Also update the member downgrade test to assert that `Production Overview View` is unmounted after switching from merchant to member.

- [x] **Step 2: Run App tests and verify they fail**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/App.spec.tsx
```

Expected before implementation: fail because `Dashboard` is not lazy-loaded or mounted from `App.tsx` yet.

- [x] **Step 3: Implement App shell mounting**

In `packages/web/src/App.tsx`, add the lazy import:

```ts
const Dashboard = lazy(() => import('./components/Dashboard'));
```

Initialize the authenticated shell to the new first tenant tab:

```ts
const [activeTab, setActiveTab] = useState<AppTab>('overview');
```

Set logout reset to `overview` because `firstAllowedTab` still coerces platform/member roles correctly:

```ts
setActiveTab('overview');
```

Add the mounted block before `fields`:

```tsx
{isMounted('overview') && <div className={`h-full transition-opacity duration-300 ${activeTab === 'overview' ? 'opacity-100 block' : 'opacity-0 hidden'}`}><Dashboard /></div>}
```

- [x] **Step 4: Run focused App and navigation tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/navigation.spec.ts src/App.spec.tsx src/components/Dashboard.truthfulness.spec.tsx
```

Expected: all focused tests pass.

---

### Task 3: Verification, Review, And Commit

**Files:**
- Review all files changed by Tasks 1-2.

**Interfaces:**
- Consumes: completed code changes and focused passing tests.
- Produces: verified P3 commit ready for the next priority slice.

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

Expected: exit code 0.

- [x] **Step 3: Run local verification**

Run:

```powershell
corepack pnpm@10.33.2 verify:local
```

Expected: exit code 0.

- [x] **Step 4: Request code review**

Use `superpowers:requesting-code-review`. Review must specifically check:
- `overview` role exposure matches global constraints.
- legacy `dashboard`, `mobile`, and `warehouse` surfaces are still not exported as navigation tabs.
- importing `Dashboard` into `App.tsx` does not make demo mode the default surface.

- [x] **Step 5: Fix Critical or Important review findings**

For each Critical or Important finding, patch the affected file, rerun the focused test command, then rerun lint/build if the fix touches application code.

- [x] **Step 6: Commit**

Run:

```powershell
git status --short
git add docs/superpowers/plans/2026-07-07-dashboard-overview-navigation-p3.md packages/web/src/navigation.ts packages/web/src/navigation.spec.ts packages/web/src/App.tsx packages/web/src/App.spec.tsx
git commit -m "feat(web): expose production overview"
```

Expected: a new commit on `codex/dashboard-real-data-p1`.

---

## Self-Review

- Spec coverage: plan exposes the real production summary, preserves demo isolation, tests role access, verifies build/lint/local suite, and requires review before commit.
- Placeholder scan: no TBD/TODO/later placeholders remain.
- Type consistency: `overview` is consistently used as an `AppTab` value, nav item id, mounted tab id, and fallback result.
