# Production Visible Action Closure P2C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining Phase 2 production-surface gaps where visible web controls are inert, fake, or only report "coming soon" after click.

**Architecture:** Keep this as a web-only correction. Existing production workflows stay unchanged; visible controls either navigate to an existing real page or render as disabled unavailable actions with no placeholder completion side effect. No backend contract changes are introduced.

**Tech Stack:** React, Vite/Vitest, Testing Library, pnpm workspace.

---

## File Structure

- Modify `packages/web/src/App.spec.tsx`: cover the resource shortcut behavior.
- Modify `packages/web/src/App.tsx`: only show the resource shortcut to roles with `billing` access, route it to the real billing tab, and mark notifications unavailable instead of leaving an inert header button.
- Create `packages/web/src/components/AiPlayground.spec.tsx`: cover the disabled voice input state.
- Modify `packages/web/src/components/AiPlayground.tsx`: remove the enabled alert-only voice action.
- Modify `packages/web/src/components/MerchantAdmin.actions.spec.tsx`: cover the disabled lifecycle archive row action.
- Modify `packages/web/src/components/MerchantAdmin.tsx`: mark lifecycle archive unavailable instead of leaving an enabled inert button.

---

### Task 1: Sidebar Resource Shortcut Truthfulness

**Files:**
- Modify: `packages/web/src/App.spec.tsx`
- Modify: `packages/web/src/App.tsx`

- [x] **Step 1: Write failing tests**

Add a `BillingAdmin` mock and tests proving:

```tsx
expect(screen.queryByText('12K')).toBeNull();
expect(screen.queryByRole('button', { name: 'Open billing resources' })).toBeNull();
```

for `member`, and proving `agent_admin` can click:

```tsx
fireEvent.click(await screen.findByRole('button', { name: 'Open billing resources' }));
expect(await screen.findByText('Billing Admin View')).toBeTruthy();
```

- [x] **Step 2: Run test to verify RED**

Run:

```bash
corepack pnpm@10.33.2 --filter web exec vitest run src/App.spec.tsx
```

Expected: fails because `12K` is visible and no accessible billing shortcut exists.

- [x] **Step 3: Implement minimal code**

Add:

```tsx
const canOpenBilling = allowedTabs.includes('billing');
```

Render the sidebar shortcut only when `canOpenBilling` is true. Remove the static quota count and wire:

```tsx
aria-label="Open billing resources"
onClick={() => setActiveTab('billing')}
```

- [x] **Step 4: Run test to verify GREEN**

Run the same App spec. Expected: pass.

---

### Task 2: AI Playground Voice Control Truthfulness

**Files:**
- Create: `packages/web/src/components/AiPlayground.spec.tsx`
- Modify: `packages/web/src/components/AiPlayground.tsx`

- [x] **Step 1: Write failing test**

Test that the voice control is disabled and does not call `window.alert`:

```tsx
const voiceButton = screen.getByRole('button', { name: 'Voice input unavailable' });
expect((voiceButton as HTMLButtonElement).disabled).toBe(true);
fireEvent.click(voiceButton);
expect(alertSpy).not.toHaveBeenCalled();
```

- [x] **Step 2: Run test to verify RED**

Run:

```bash
corepack pnpm@10.33.2 --filter web exec vitest run src/components/AiPlayground.spec.tsx
```

Expected: fails because the old button is enabled and alert-only.

- [x] **Step 3: Implement minimal code**

Remove the `window.alert` click handler and render the voice button as disabled with:

```tsx
aria-label="Voice input unavailable"
disabled
```

- [x] **Step 4: Run test to verify GREEN**

Run the same AiPlayground spec. Expected: pass.

---

### Task 3: Merchant Lifecycle Archive Action Truthfulness

**Files:**
- Modify: `packages/web/src/components/MerchantAdmin.actions.spec.tsx`
- Modify: `packages/web/src/components/MerchantAdmin.tsx`

- [x] **Step 1: Write failing test**

Add coverage:

```tsx
const archiveButton = screen.getByRole('button', { name: 'Lifecycle trace archive unavailable' });
expect((archiveButton as HTMLButtonElement).disabled).toBe(true);
```

- [x] **Step 2: Run test to verify RED**

Run:

```bash
corepack pnpm@10.33.2 --filter web exec vitest run src/components/MerchantAdmin.actions.spec.tsx
```

Expected: fails because the old row action is enabled and inert.

- [x] **Step 3: Implement minimal code**

Render the lifecycle archive button as disabled with:

```tsx
aria-label="Lifecycle trace archive unavailable"
disabled
```

- [x] **Step 4: Run test to verify GREEN**

Run the same MerchantAdmin actions spec. Expected: pass.

---

### Task 4: Verification and Review

**Files:**
- All files above.

- [ ] **Step 1: Focused verification**

Run:

```bash
corepack pnpm@10.33.2 --filter web exec vitest run src/App.spec.tsx src/components/AiPlayground.spec.tsx src/components/MerchantAdmin.actions.spec.tsx
```

Expected: pass.

### Review Fix: Header Notification Action

**Files:**
- Modify: `packages/web/src/App.spec.tsx`
- Modify: `packages/web/src/App.tsx`

- [x] **Step 1: Write failing test**

Add a test proving the visible notification control is not an inert enabled button:

```tsx
const notificationButton = await screen.findByRole('button', { name: 'Notifications unavailable' });
expect((notificationButton as HTMLButtonElement).disabled).toBe(true);
```

- [x] **Step 2: Run test to verify RED**

Run:

```bash
corepack pnpm@10.33.2 --filter web exec vitest run src/App.spec.tsx
```

Expected: fail because the header bell has no unavailable accessible name and is enabled.

- [x] **Step 3: Implement minimal code**

In `packages/web/src/App.tsx`, mark the header bell as disabled with:

```tsx
aria-label="Notifications unavailable"
disabled
```

Remove the active red notification dot because it implies an available live notification workflow.

- [x] **Step 4: Run test to verify GREEN**

Run the same App spec. Expected: pass.

- [ ] **Step 2: Local gate**

Run:

```bash
corepack pnpm@10.33.2 verify:local
```

Expected: pass.

- [ ] **Step 3: E2E DB precheck**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/backend e2e:check-db
```

Expected in this environment while PostGIS is down: fail with `Cannot reach PostgreSQL/PostGIS at 127.0.0.1:5544`. Do not claim e2e passes unless the database is reachable and the e2e suite exits 0.

- [ ] **Step 4: Code review**

Review requirements:

```text
No default production visible enabled button should be inert or only complete with local alert/toast.
Billing shortcut must open the real billing tab only for roles that have billing access.
AI voice and merchant lifecycle archive must be visibly disabled.
Tests must cover all three regressions.
```

- [ ] **Step 5: Commit**

After review and verification:

```bash
git add packages/web/src/App.tsx packages/web/src/App.spec.tsx packages/web/src/components/AiPlayground.tsx packages/web/src/components/AiPlayground.spec.tsx packages/web/src/components/MerchantAdmin.tsx packages/web/src/components/MerchantAdmin.actions.spec.tsx docs/superpowers/plans/2026-07-06-production-visible-action-closure-p2c.md
git commit -m "fix(web): close fake production actions"
```

---

## Self-Review

- Spec coverage: Covers all three Phase 2 gaps found by the read-only review.
- Placeholder scan: No TBD/TODO placeholders remain.
- Type consistency: Uses existing `AppTab` value `billing` and stable accessible labels in tests.
