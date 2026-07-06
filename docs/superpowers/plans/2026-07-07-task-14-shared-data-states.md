# Task 14 Shared Empty Error Loading States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize loading, error, and empty states across high-traffic web admin pages with accessible Fluent-styled UI.

**Architecture:** Add a small presentational module in `packages/web/src/ui/state.tsx`. Keep data fetching, retry callbacks, table rendering, filtering, and mutation flows unchanged. Adopt the shared states in `TenantManagement`, `AgentManagement`, `MerchantManagement`, and the child-account section of `BillingAdmin`.

**Tech Stack:** React 19, Vite 6, Tailwind 4, Vitest, Testing Library, Lucide icons, pnpm 10.33.2.

## Global Constraints

- Worktree: `E:/code/nongchang/.worktrees/saas-audit-priority-fixes`.
- Branch: `codex/saas-audit-priority-fixes`.
- One reviewed and verified commit for this task.
- Do not commit `.superpowers/` scratch files.
- Follow TDD: red test first, minimal implementation, green verification.
- Do not change API contracts, `useApi`, route visibility, table columns, or mutation behavior.
- Use compact Fluent styling; no marketing copy, no card-in-card layouts.

---

## File Map

- Create: `packages/web/src/ui/state.tsx`
  - Exports `LoadingState`, `ErrorState`, `EmptyState`.
- Create: `packages/web/src/ui/state.spec.tsx`
  - Tests accessibility roles, labels, retry callback, and optional description.
- Modify: `packages/web/src/components/TenantManagement.tsx`
  - Replace inline tenant loading/error/empty state blocks.
- Modify: `packages/web/src/components/AgentManagement.tsx`
  - Replace inline agent loading/error/empty state blocks.
- Modify: `packages/web/src/components/MerchantManagement.tsx`
  - Replace inline merchant loading/error/empty state blocks.
- Modify: `packages/web/src/components/BillingAdmin.tsx`
  - Replace child account loading/error/empty state blocks.
- Update existing focused component specs only if text/role assertions need to follow the new state semantics.

---

### Task 14: Shared Empty Error Loading States

**Files:**
- Create: `packages/web/src/ui/state.tsx`
- Create: `packages/web/src/ui/state.spec.tsx`
- Modify: `packages/web/src/components/TenantManagement.tsx`
- Modify: `packages/web/src/components/AgentManagement.tsx`
- Modify: `packages/web/src/components/MerchantManagement.tsx`
- Modify: `packages/web/src/components/BillingAdmin.tsx`

**Interfaces:**
- Produces:
  - `LoadingState(props: { label?: string; className?: string }): JSX.Element`
  - `ErrorState(props: { title?: string; message: string; onRetry?: () => void; retryLabel?: string; className?: string }): JSX.Element`
  - `EmptyState(props: { title: string; description?: string; className?: string }): JSX.Element`

- [x] **Step 1: Write failing shared component tests**

Create `packages/web/src/ui/state.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState, ErrorState, LoadingState } from './state';

describe('shared data states', () => {
  it('renders an accessible loading state with a custom label', () => {
    render(<LoadingState label="Loading tenants" />);
    expect(screen.getByRole('status', { name: 'Loading tenants' })).toBeTruthy();
  });

  it('renders an accessible empty state with optional description', () => {
    render(<EmptyState title="No accounts" description="Create one first." />);
    expect(screen.getByRole('status', { name: 'No accounts' })).toBeTruthy();
    expect(screen.getByText('Create one first.')).toBeTruthy();
  });

  it('renders an accessible error state and calls retry', () => {
    const retry = vi.fn();
    render(<ErrorState message="Network failed" onRetry={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Network failed');
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
```

- [x] **Step 2: Verify red**

Run:

```bash
corepack pnpm@10.33.2 --filter web exec vitest run src/ui/state.spec.tsx
```

Expected: fail because `./state` does not exist.

- [x] **Step 3: Implement shared state components**

Create `packages/web/src/ui/state.tsx` using Lucide icons:

- `LoadingState`: `role="status"`, `aria-label={label}`, spinner icon, muted text.
- `EmptyState`: `role="status"`, `aria-label={title}`, `Inbox` icon, title and optional description.
- `ErrorState`: `role="alert"`, red-tinted border/background, title, message, optional retry button using `fluentButton('secondary')`.

- [x] **Step 4: Verify component green**

Run:

```bash
corepack pnpm@10.33.2 --filter web exec vitest run src/ui/state.spec.tsx
```

Expected: pass.

- [x] **Step 5: Adopt in TenantManagement**

Replace:

- top inline error banner with `<ErrorState message={error} onRetry={reload} />`.
- table loading row content with `<LoadingState label="加载租户列表" />`.
- empty tenant row content with `<EmptyState title="暂无租户" description="新建租户后会显示在这里。" />`.

- [x] **Step 6: Adopt in AgentManagement and MerchantManagement**

Replace:

- loading divs with `<LoadingState label="加载代理商列表" />` and `<LoadingState label="加载商户列表" />`.
- error divs with `<ErrorState message={error} onRetry={reload} />`.
- empty table row content with `<EmptyState title="暂无匹配代理商" />` and `<EmptyState title="暂无匹配商户" />`.

- [x] **Step 7: Adopt in BillingAdmin child account section**

Replace:

- account loading block with `<LoadingState label="加载下级账户" />`.
- account error block with `<ErrorState message={acc.error} onRetry={acc.reload} />`.
- account empty block with `<EmptyState title="暂无下级账户" description="创建代理商或商户后会显示额度账户。" />`.

- [x] **Step 8: Verify affected UI**

Run:

```bash
corepack pnpm@10.33.2 --filter web exec vitest run src/ui/state.spec.tsx src/components/TenantManagement.spec.tsx src/components/AgentManagement.spec.tsx src/components/MerchantManagement.spec.tsx src/components/BillingAdmin.spec.tsx
corepack pnpm@10.33.2 --filter web test
corepack pnpm@10.33.2 --filter web lint
corepack pnpm@10.33.2 --filter web build
git -c safe.directory=E:/code/nongchang/.worktrees/saas-audit-priority-fixes diff --check
```

Expected: all commands exit 0. `diff --check` may print LF-to-CRLF warnings only.

- [x] **Step 9: Review and commit**

Review:

```bash
git -c safe.directory=E:/code/nongchang/.worktrees/saas-audit-priority-fixes diff -- packages/web/src/ui/state.tsx packages/web/src/ui/state.spec.tsx packages/web/src/components/TenantManagement.tsx packages/web/src/components/AgentManagement.tsx packages/web/src/components/MerchantManagement.tsx packages/web/src/components/BillingAdmin.tsx docs/superpowers/plans/2026-07-07-task-14-shared-data-states.md
```

Request code review for the task diff. Fix Critical or Important findings.

Commit:

```bash
git add packages/web/src/ui/state.tsx packages/web/src/ui/state.spec.tsx packages/web/src/components/TenantManagement.tsx packages/web/src/components/AgentManagement.tsx packages/web/src/components/MerchantManagement.tsx packages/web/src/components/BillingAdmin.tsx docs/superpowers/plans/2026-07-07-task-14-shared-data-states.md
git commit -m "refactor(web): standardize data states"
```
