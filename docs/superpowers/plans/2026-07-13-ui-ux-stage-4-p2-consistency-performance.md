# UI/UX Stage 4 P2 Consistency And Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the approved P2 shell consistency and performance scope with Chinese controls, collapsible remembered navigation, neutral account loading, bounded page retention, safe query retries, lazy-boundary checks, and rendered QA.

**Architecture:** Add pure models for navigation preferences and retained-page selection, then keep `App` as the shell coordinator. TanStack Query owns one retry for transient read failures; mutations remain non-retrying. Existing route components stay lazy and heavy pages opt out of inactive retention.

**Tech Stack:** React 19, TypeScript 5.8, TanStack Query 5, Vitest 4, Playwright 1.61, Axe 4, Vite 8.

## Global Constraints

- Chinese remains the default product language; recognized technical names such as AI and AppID remain unchanged.
- The active page is mounted; at most two eligible inactive pages are retained.
- `fields`, `aiAssistant`, and `batches` are active-only because they own map, AI, or print-heavy workflows.
- Only transient read failures retry once; `ApiError` 4xx and every mutation remain non-retrying.
- Do not reintroduce a second billing shortcut or flash a raw user ID while profile data loads.

---

### Task 1: Localize shared pagination and remove duplicate shell actions

**Files:**

- Create: `packages/web/src/ui/pagination.spec.tsx`
- Modify: `packages/web/src/ui/pagination.tsx`
- Modify: `packages/web/src/components/AgentManagement.spec.tsx`
- Modify: `packages/web/src/components/BillingAdmin.spec.tsx`
- Modify: `packages/web/src/components/BillingPlans.spec.tsx`
- Modify: `packages/web/src/components/MerchantManagement.spec.tsx`
- Modify: `packages/web/src/components/TenantManagement.spec.tsx`
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/App.spec.tsx`
- Modify: `e2e/web/responsive-p0.spec.ts`

- [x] **Step 1: Add failing localization and shell tests**

Require `第 1 / 3 页`, `共 201 条`, `上一页`, `下一页`, Chinese navigation aria labels, no `Open billing resources` shortcut, and `账户加载中` when `profile` is null. Keep the ordinary billing navigation item reachable for allowed roles.

- [x] **Step 2: Run focused tests to verify red**

```powershell
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter web exec vitest run src/ui/pagination.spec.tsx src/App.spec.tsx src/components/AgentManagement.spec.tsx src/components/BillingAdmin.spec.tsx src/components/BillingPlans.spec.tsx src/components/MerchantManagement.spec.tsx src/components/TenantManagement.spec.tsx
```

- [x] **Step 3: Implement Chinese controls and neutral identity**

Translate pagination copy and labels. Translate mobile navigation aria labels. Remove both bottom billing shortcut blocks and their unused icon/state. Render `profile?.displayName ?? '账户加载中'`; never use `user.userId` as visible fallback.

- [x] **Step 4: Verify and commit**

```powershell
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter web exec vitest run src/ui/pagination.spec.tsx src/App.spec.tsx src/components/AgentManagement.spec.tsx src/components/BillingAdmin.spec.tsx src/components/BillingPlans.spec.tsx src/components/MerchantManagement.spec.tsx src/components/TenantManagement.spec.tsx
$env:CI='true'; corepack.cmd pnpm@10.33.2 typecheck:web
git add packages/web/src/ui/pagination.tsx packages/web/src/ui/pagination.spec.tsx packages/web/src/components/AgentManagement.spec.tsx packages/web/src/components/BillingAdmin.spec.tsx packages/web/src/components/BillingPlans.spec.tsx packages/web/src/components/MerchantManagement.spec.tsx packages/web/src/components/TenantManagement.spec.tsx packages/web/src/App.tsx packages/web/src/App.spec.tsx e2e/web/responsive-p0.spec.ts
git commit -m "feat(web): localize shell navigation and pagination"
```

---

### Task 2: Add remembered collapsible navigation groups

**Files:**

- Create: `packages/web/src/navigation-preferences.ts`
- Create: `packages/web/src/navigation-preferences.spec.ts`
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/App.spec.tsx`

**Interfaces:**

```ts
export function navigationPreferenceKey(role: SystemRole): string;
export function loadOpenNavigationCategories(raw: string | null, categories: readonly string[]): Set<string>;
export function serializeOpenNavigationCategories(open: ReadonlySet<string>): string;
export function toggleNavigationCategory(open: ReadonlySet<string>, category: string): Set<string>;
```

- [x] **Step 1: Add failing preference model and shell tests**

Assert invalid storage opens every category, serialized valid categories restore, toggling does not mutate the original set, group buttons expose `aria-expanded`, collapsing hides child items, and remounting restores the saved state for the same role.

- [x] **Step 2: Run focused tests to verify red**

```powershell
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter web exec vitest run src/navigation-preferences.spec.ts src/App.spec.tsx
```

- [x] **Step 3: Implement category controls and persistence**

Replace static category labels with buttons using `ChevronDown`/`ChevronRight`. Initialize from the role-specific localStorage key, persist after user toggles, and keep mobile and desktop navigation synchronized through the same state.

- [x] **Step 4: Verify and commit**

```powershell
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter web exec vitest run src/navigation-preferences.spec.ts src/App.spec.tsx src/navigation.spec.ts
$env:CI='true'; corepack.cmd pnpm@10.33.2 typecheck:web
git add packages/web/src/navigation-preferences.ts packages/web/src/navigation-preferences.spec.ts packages/web/src/App.tsx packages/web/src/App.spec.tsx
git commit -m "feat(web): remember collapsible navigation groups"
```

---

### Task 3: Bound page retention and add safe read retries

**Files:**

- Create: `packages/web/src/page-retention.ts`
- Create: `packages/web/src/page-retention.spec.ts`
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/App.spec.tsx`
- Modify: `packages/web/src/query-client.ts`
- Modify: `packages/web/src/query-client.spec.ts`
- Modify: `packages/web/src/hooks/useApi.spec.tsx`
- Create: `packages/web/src/components/AppWorkspaceViews.lazy.spec.ts`

**Interfaces:**

```ts
export const ACTIVE_ONLY_TABS: ReadonlySet<AppTab>;
export function updateRetainedTabs(previous: readonly AppTab[], active: AppTab, allowed: readonly AppTab[], limit?: number): AppTab[];
export function shouldRetryQuery(failureCount: number, error: unknown): boolean;
```

- [ ] **Step 1: Add failing retention and retry tests**

Assert active plus two recent eligible pages, oldest eviction, removal of unauthorized pages, active-only pages disappearing after navigation, one retry for `TypeError`, HTTP 408/429/5xx, and zero retries for 4xx validation/auth failures or a second failure. Assert mutation retry remains `false`.

- [ ] **Step 2: Add lazy-boundary source tests**

Require `AppWorkspaceViews` to lazy-import `FarmFields`, `AiAssistant`, `BatchAdmin`, and `BillingAdmin`; require dashboard html2canvas to remain a dynamic import.

- [ ] **Step 3: Run focused tests to verify red**

```powershell
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter web exec vitest run src/page-retention.spec.ts src/query-client.spec.ts src/hooks/useApi.spec.tsx src/components/AppWorkspaceViews.lazy.spec.ts src/App.spec.tsx
```

- [ ] **Step 4: Implement retention and retries**

Replace the unbounded mounted-tab set with ordered retained tabs from `updateRetainedTabs`. Query defaults use `shouldRetryQuery`; `useApi` keeps GET/read orchestration only, and mutations remain untouched.

- [ ] **Step 5: Verify and commit**

```powershell
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter web exec vitest run src/page-retention.spec.ts src/query-client.spec.ts src/hooks/useApi.spec.tsx src/components/AppWorkspaceViews.lazy.spec.ts src/App.spec.tsx
$env:CI='true'; corepack.cmd pnpm@10.33.2 typecheck:web
$env:CI='true'; corepack.cmd pnpm@10.33.2 build:web
git add packages/web/src/page-retention.ts packages/web/src/page-retention.spec.ts packages/web/src/App.tsx packages/web/src/App.spec.tsx packages/web/src/query-client.ts packages/web/src/query-client.spec.ts packages/web/src/hooks/useApi.spec.tsx packages/web/src/components/AppWorkspaceViews.lazy.spec.ts
git commit -m "perf(web): bound retained pages and retry transient reads"
```

---

### Task 4: Add P2 rendered QA and run final Stage 4 gates

**Files:**

- Create: `e2e/web/p2-shell-consistency.spec.ts`
- Modify: `e2e/web/accessibility.spec.ts`
- Modify: `docs/superpowers/plans/2026-07-13-ui-ux-stage-4-p2-consistency-performance.md`

- [ ] **Step 1: Add browser tests**

Cover collapsed-category persistence after reload, billing reachable only through normal navigation, neutral account loading without raw IDs, Chinese mobile navigation labels, and no document overflow at 390/768 pixels after categories collapse/expand.

- [ ] **Step 2: Add Axe coverage**

Scan expanded and collapsed navigation states plus the localized mobile navigation dialog for serious/critical violations.

- [ ] **Step 3: Run focused browser tests**

```powershell
$env:CI='true'; $env:DATABASE_URL='postgresql://nongchang:nongchang@127.0.0.1:5545/nongchang?schema=public'; $env:REDIS_URL='redis://127.0.0.1:56379'; $env:E2E_TENANT_CODE='DEMO'; $env:E2E_USERNAME='merchantA'; $env:E2E_PASSWORD='password123'; $env:E2E_BILLING_USERNAME='agentA'; corepack.cmd pnpm@10.33.2 test:browser:prepare
$env:CI='true'; corepack.cmd pnpm@10.33.2 exec playwright test e2e/web/p2-shell-consistency.spec.ts
$env:CI='true'; corepack.cmd pnpm@10.33.2 exec playwright test e2e/web/accessibility.spec.ts --grep "P2 Web"
```

- [ ] **Step 4: Run Stage 4 completion gates**

```powershell
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter web test
$env:CI='true'; corepack.cmd pnpm@10.33.2 typecheck:web
$env:CI='true'; corepack.cmd pnpm@10.33.2 build:web
$env:CI='true'; corepack.cmd pnpm@10.33.2 test:browser
$env:CI='true'; corepack.cmd pnpm@10.33.2 test:accessibility
git diff --check
git status --short
```

- [ ] **Step 5: Commit**

```powershell
git add e2e/web/p2-shell-consistency.spec.ts e2e/web/accessibility.spec.ts docs/superpowers/plans/2026-07-13-ui-ux-stage-4-p2-consistency-performance.md
git commit -m "test(web): cover P2 shell consistency"
```

---

## Plan Self-Review

- Spec coverage: localization, collapsible preferences, account loading, duplicate action removal, bounded retention, retry policy, lazy boundaries, responsive QA, and accessibility all map to tasks.
- Placeholder scan: no speculative API or deferred implementation remains.
- Type consistency: navigation and retention models use existing `SystemRole` and `AppTab` contracts.
- Risk boundary: backend, authorization, charging, and mutation semantics are unchanged.
