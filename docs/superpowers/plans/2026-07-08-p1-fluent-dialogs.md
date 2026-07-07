# P1 Fluent Confirmation And Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace production `window.alert`, `window.confirm`, and bare `confirm` calls with a shared Fluent-style confirmation and alert dialog system.

**Architecture:** Add a tiny global dialog module similar to the existing global toast module. Components call promise-based `confirmDialog(...)` or `alertDialog(...)`; `DialogHost` is mounted once in `App.tsx`. Existing API calls, role checks, pagination, and data mutations stay unchanged.

**Tech Stack:** React 19, Vite 6, Tailwind 4, Vitest, Testing Library, TypeScript, pnpm 10.33.2.

## Global Constraints

- No backend behavior changes.
- No API contract changes.
- Keep existing destructive-action safeguards.
- Keep existing component tests meaningful; update them to interact with the new dialog instead of mocking browser dialogs.
- After implementation, production component and UI sources must not contain `window.alert`, `window.confirm`, or bare `confirm(` calls outside test files.

---

## File Map

- `packages/web/src/hooks/useDialog.tsx`: new global dialog functions and `DialogHost`.
- `packages/web/src/hooks/useDialog.spec.tsx`: tests for confirm, cancel, alert, and unmount behavior.
- `packages/web/src/App.tsx`: mount `DialogHost` once near `ToastBanner`.
- `packages/web/src/components/AgentManagement.tsx`: replace native alerts and confirms.
- `packages/web/src/components/AiProviders.tsx`: replace native alerts and confirms.
- `packages/web/src/components/BillingPlans.tsx`: replace bare `confirm` and local toast error with shared dialog where appropriate.
- `packages/web/src/components/LogisticsTracker.tsx`: replace inline `window.confirm`.
- `packages/web/src/components/MerchantManagement.tsx`: replace initial-password alert and status confirms.
- `packages/web/src/components/PendingUsers.tsx`: replace review confirm.
- `packages/web/src/components/QuickTemplates.tsx`: replace delete confirm and alert.
- `packages/web/src/components/UserGroups.tsx`: replace delete confirm and alert.
- Existing component specs for these surfaces: update only where native dialog mocks are asserted.

## Task 1: Dialog Runtime

**Files:**
- Create: `packages/web/src/hooks/useDialog.tsx`
- Create: `packages/web/src/hooks/useDialog.spec.tsx`
- Modify: `packages/web/src/App.tsx`

**Interfaces:**
- Produces: `confirmDialog(options: DialogOptions | string): Promise<boolean>`
- Produces: `alertDialog(options: AlertDialogOptions | string): Promise<void>`
- Produces: `DialogHost(): JSX.Element | null`

- [x] **Step 1: Write failing dialog tests**

Test that `confirmDialog` renders a dialog, resolves `true` when the primary button is clicked, resolves `false` when the cancel button is clicked, and that `alertDialog` resolves after acknowledgment.

- [x] **Step 2: Verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/hooks/useDialog.spec.tsx
```

Expected: fail because `useDialog.tsx` does not exist.

- [x] **Step 3: Implement dialog runtime**

Create a small module with a listener set, one current request, promise resolvers, Fluent-style modal DOM, icon-less text buttons, focus-safe roles, and stable labels.

- [x] **Step 4: Mount host**

Import `DialogHost` in `App.tsx` and render it once next to `ToastBanner`.

- [x] **Step 5: Verify GREEN**

Run focused hook spec.

## Task 2: Replace Native Dialog Calls

**Files:** component files listed above.

- [x] **Step 1: Write failing scan test**

Add or update `useDialog.spec.tsx` to scan production component, hook, and UI source files and reject native dialog calls.

- [x] **Step 2: Verify RED**

Run the dialog spec and confirm the scan fails on current components.

- [x] **Step 3: Replace components**

Import `confirmDialog` and `alertDialog` where needed. Convert handlers to async as needed. Preserve existing confirmation copy and error messages.

- [x] **Step 4: Update affected specs**

Remove `window.confirm` and `window.alert` mocks where they are asserting native dialogs. Interact with the rendered Fluent dialog instead.

- [x] **Step 5: Verify GREEN**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/hooks/useDialog.spec.tsx src/components/AgentManagement.spec.tsx src/components/AiProviders.spec.tsx src/components/MerchantManagement.spec.tsx src/components/PendingUsers.spec.tsx src/components/QuickTemplates.spec.tsx src/components/UserGroups.spec.tsx src/components/LogisticsTracker.spec.tsx src/components/BillingPlans.spec.tsx
```

## Task 3: Verification And Review

- [x] **Step 1: Run focused tests**

Use the focused command from Task 2.

- [x] **Step 2: Run web typecheck**

```powershell
corepack pnpm@10.33.2 --filter web lint
```

- [x] **Step 3: Run full web tests**

```powershell
corepack pnpm@10.33.2 --filter web test
```

- [x] **Step 4: Scan native dialog calls**

```powershell
rg -n "window\.alert|window\.confirm|\bconfirm\(|alert\(" packages/web/src/components packages/web/src/hooks packages/web/src/ui -g "!*.spec.ts" -g "!*.spec.tsx"
```

Expected: no output.

- [x] **Step 5: Review diff and commit**

```powershell
git -c safe.directory=E:/code/nongchang diff --check
git -c safe.directory=E:/code/nongchang diff --stat
git add docs/superpowers/plans/2026-07-08-p1-fluent-dialogs.md packages/web/src
git commit -m "feat(web): unify confirmation dialogs"
```

## Self-Review

- Spec coverage: Covers the P1 UX issue from the SaaS/UI audit: native browser dialogs in production flows.
- Placeholder scan: No placeholder steps remain.
- Type consistency: The promise-based dialog interface is stable and component-independent.
