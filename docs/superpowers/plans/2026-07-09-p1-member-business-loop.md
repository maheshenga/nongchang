# P1 Member Business Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give ordinary `member` users a real post-login business path instead of dropping them into local browser preferences only.

**Architecture:** Add a small Web-only `MemberCenter` surface that uses the existing public trace hash route (`#/trace/:code`) for real溯源码查询. Wire it as the first `member` navigation tab while preserving the existing safe `settings` tab and keeping production/admin tabs hidden.

**Tech Stack:** React 19, Vite, Vitest, Testing Library, lucide-react, existing Fluent helper classes in `packages/web/src/ui/fluent.ts`.

## Global Constraints

- Do not change backend APIs or role authorization for this slice.
- Do not expose tenant/admin production tabs to ordinary `member` users.
- Use the existing hash route `#/trace/:code` rather than adding a router dependency.
- Follow TDD: every production code change must be preceded by a failing test.
- Keep the Fluent/MS-style console visual language already used in `packages/web/src/ui/fluent.ts`.

---

### Task 1: Add Member Navigation Contract

**Files:**
- Modify: `packages/web/src/navigation.ts`
- Test: `packages/web/src/navigation.spec.ts`

**Interfaces:**
- Consumes: existing `SystemRole`, `AppTab`, `getNavItems`, `firstAllowedTab`
- Produces: new `AppTab` value `'memberHome'`; `member` role nav order `['memberHome', 'settings']`

- [ ] **Step 1: Write the failing navigation tests**

Update the existing ordinary member tests in `packages/web/src/navigation.spec.ts`:

```ts
  it('gives ordinary members a safe trace-query home plus local settings', () => {
    expect(idsFor('member')).toEqual(['memberHome', 'settings']);
    expect(firstAllowedTab('member', 'fields')).toBe('memberHome');
    expect(firstAllowedTab('member', 'settings')).toBe('settings');
  });
```

Also update the fallback expectation in the existing "falls back to the first allowed production tab" test:

```ts
    expect(firstAllowedTab('member', 'dashboard')).toBe('memberHome');
```

- [ ] **Step 2: Run test to verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/navigation.spec.ts
```

Expected: FAIL because `memberHome` is not part of `AppTab` and `idsFor('member')` still returns `['settings']`.

- [ ] **Step 3: Implement the navigation change**

Update `packages/web/src/navigation.ts`:

```ts
import { Home, ... } from 'lucide-react';

export type AppTab =
  | 'overview'
  | 'memberHome'
  | 'tenants'
  ...

const MEMBER_NAV: NavCategory[] = [
  {
    category: '个人中心',
    items: [
      { id: 'memberHome', label: '会员中心', icon: Home },
      { id: 'settings', label: '本地偏好', icon: SettingsIcon },
    ],
  },
];
```

- [ ] **Step 4: Run test to verify GREEN**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/navigation.spec.ts
```

Expected: PASS.

---

### Task 2: Add Member Center Component

**Files:**
- Create: `packages/web/src/components/MemberCenter.tsx`
- Create: `packages/web/src/components/MemberCenter.spec.tsx`

**Interfaces:**
- Consumes: `useAuth()` from `packages/web/src/auth/auth-context.tsx`; `fluentButton`, `fluentInput`, `fluentStatusTag` from `packages/web/src/ui/fluent.ts`
- Produces: default React component `MemberCenter`

- [ ] **Step 1: Write the failing component tests**

Create `packages/web/src/components/MemberCenter.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.hoisted(() => ({
  user: { userId: 'member-1', tenantId: 'tenant-1', role: 'member', agentId: null, ownerId: null },
  profile: { displayName: '普通会员' },
}));

vi.mock('../auth/auth-context', () => ({
  useAuth: () => ({
    user: authMock.user,
    profile: authMock.profile,
  }),
}));

import MemberCenter from './MemberCenter';

describe('MemberCenter', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  it('renders a real trace query workflow for ordinary members', () => {
    render(<MemberCenter />);

    expect(screen.getByRole('heading', { name: '会员中心' })).toBeTruthy();
    expect(screen.getByText('普通会员')).toBeTruthy();
    expect(screen.getByLabelText('溯源码')).toBeTruthy();
    expect(screen.getByText('查询后会打开真实公开溯源记录，不生成演示数据。')).toBeTruthy();
  });

  it('opens the existing public trace route with a trimmed encoded code', () => {
    render(<MemberCenter />);

    fireEvent.change(screen.getByLabelText('溯源码'), { target: { value: '  ORC 8901/测试  ' } });
    fireEvent.click(screen.getByRole('button', { name: '查询溯源' }));

    expect(window.location.hash).toBe('#/trace/ORC%208901%2F%E6%B5%8B%E8%AF%95');
  });

  it('keeps the member on the page when the trace code is empty', () => {
    render(<MemberCenter />);

    fireEvent.click(screen.getByRole('button', { name: '查询溯源' }));

    expect(window.location.hash).toBe('');
    expect(screen.getByText('请输入溯源码')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/MemberCenter.spec.tsx
```

Expected: FAIL because `./MemberCenter` does not exist.

- [ ] **Step 3: Implement the component**

Create `packages/web/src/components/MemberCenter.tsx`:

```tsx
import { FormEvent, useState } from 'react';
import { Search, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '../auth/auth-context';
import { fluentButton, fluentInput, fluentStatusTag } from '../ui/fluent';

export default function MemberCenter() {
  const { profile, user } = useAuth();
  const [traceCode, setTraceCode] = useState('');
  const [error, setError] = useState('');
  const displayName = profile?.displayName ?? user?.userId ?? '普通会员';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const code = traceCode.trim();
    if (!code) {
      setError('请输入溯源码');
      return;
    }
    setError('');
    window.location.hash = `#/trace/${encodeURIComponent(code)}`;
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <header className="flex shrink-0 flex-col gap-3 border border-[#E1DFDD] bg-white px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-[#242424]">
            <UserRound className="h-5 w-5 text-[#0078D4]" />
            会员中心
          </h2>
          <p className="mt-1 text-sm text-[#605E5C]">查询购买商品的公开溯源记录，并管理当前账户偏好。</p>
        </div>
        <span className={fluentStatusTag('active')}>普通会员</span>
      </header>

      <main className="fluent-scrollbar min-h-0 flex-1 overflow-y-auto">
        <section className="max-w-2xl border border-[#E1DFDD] bg-white">
          <div className="border-b border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#242424]">
              <ShieldCheck className="h-4 w-4 text-[#0078D4]" />
              溯源码查询
            </div>
            <p className="mt-1 text-xs leading-5 text-[#605E5C]">查询后会打开真实公开溯源记录，不生成演示数据。</p>
          </div>

          <form onSubmit={submit} className="space-y-4 p-5">
            <div>
              <label htmlFor="member-trace-code" className="mb-1.5 block text-sm font-semibold text-[#323130]">溯源码</label>
              <input
                id="member-trace-code"
                value={traceCode}
                onChange={(event) => {
                  setTraceCode(event.target.value);
                  if (error) setError('');
                }}
                className={`${fluentInput} w-full`}
                placeholder="输入商品包装上的溯源码"
              />
            </div>
            {error && <p className="text-sm font-semibold text-[#A4262C]">{error}</p>}
            <button type="submit" className={fluentButton('primary')}>
              <Search className="h-4 w-4" />
              查询溯源
            </button>
          </form>

          <div className="border-t border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4 text-xs leading-5 text-[#605E5C]">
            当前账户: <span className="font-semibold text-[#242424]">{displayName}</span>
          </div>
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify GREEN**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/MemberCenter.spec.tsx
```

Expected: PASS.

---

### Task 3: Wire Member Center Into App Shell

**Files:**
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/App.spec.tsx`

**Interfaces:**
- Consumes: `AppTab` value `'memberHome'` from Task 1; `MemberCenter` from Task 2
- Produces: App shell lazy rendering for `memberHome`

- [ ] **Step 1: Write failing App tests**

Update `packages/web/src/App.spec.tsx`:

```tsx
vi.mock('./components/MemberCenter', () => ({ default: () => <div>Member Center View</div> }));
```

Replace the existing member test with:

```tsx
  it('starts ordinary members on the safe member center and keeps admin surfaces hidden', async () => {
    authMock.role = 'member';

    render(<App />);

    expect(await screen.findByText('Member Center View')).toBeTruthy();
    expect(screen.queryByText('Settings View')).toBeNull();
    expect(screen.queryByText('Merchant Management View')).toBeNull();
    expect(screen.queryByText('Farm Fields View')).toBeNull();
    expect(screen.queryByText('12K')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open billing resources' })).toBeNull();
  });
```

Update member fallback tests to expect `Member Center View` instead of `Settings View` when the role is `member` or an unknown future role falls back to member.

- [ ] **Step 2: Run App test to verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/App.spec.tsx
```

Expected: FAIL because `App.tsx` does not lazy load or render `memberHome`.

- [ ] **Step 3: Implement App wiring**

Update `packages/web/src/App.tsx`:

```tsx
const MemberCenter = lazy(() => import('./components/MemberCenter'));
```

Add render branch near `settings`:

```tsx
{isMounted('memberHome') && <div className={`h-full transition-opacity duration-300 ${activeTab === 'memberHome' ? 'opacity-100 block' : 'opacity-0 hidden'}`}><MemberCenter /></div>}
```

- [ ] **Step 4: Run focused tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/navigation.spec.ts src/components/MemberCenter.spec.tsx src/App.spec.tsx
```

Expected: PASS.

---

### Task 4: Verification, Review, Commit

**Files:**
- Verify all files changed in Tasks 1-3

**Interfaces:**
- Consumes: completed Tasks 1-3
- Produces: committed P1 slice

- [ ] **Step 1: Run Web lint**

Run:

```powershell
corepack pnpm@10.33.2 --filter web lint
```

Expected: PASS.

- [ ] **Step 2: Run full Web tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test
```

Expected: PASS.

- [ ] **Step 3: Check whitespace and diff**

Run:

```powershell
git -c safe.directory=E:/code/nongchang diff --check
git -c safe.directory=E:/code/nongchang diff -- packages/web/src/navigation.ts packages/web/src/navigation.spec.ts packages/web/src/components/MemberCenter.tsx packages/web/src/components/MemberCenter.spec.tsx packages/web/src/App.tsx packages/web/src/App.spec.tsx docs/superpowers/plans/2026-07-09-p1-member-business-loop.md
```

Expected: `diff --check` exits 0; diff only contains this P1 member business loop.

- [ ] **Step 4: Stage and commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p1-member-business-loop.md packages/web/src/navigation.ts packages/web/src/navigation.spec.ts packages/web/src/components/MemberCenter.tsx packages/web/src/components/MemberCenter.spec.tsx packages/web/src/App.tsx packages/web/src/App.spec.tsx
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang commit -m "feat(web): add member trace center"
```

Expected: commit succeeds.

## Self-Review

- Spec coverage: The plan addresses the P1 gap where ordinary members had no post-login business workflow. It keeps admin surfaces hidden and uses the existing real public trace route.
- Placeholder scan: No TBD/TODO/fill-in placeholders remain.
- Type consistency: `memberHome` is introduced in `AppTab`, consumed by `MEMBER_NAV`, and rendered in `App.tsx`.
