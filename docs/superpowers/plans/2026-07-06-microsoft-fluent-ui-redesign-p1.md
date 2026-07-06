# Microsoft Fluent UI Redesign P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the first Microsoft Fluent 2 SaaS Console slice for the web app: reusable UI tokens/primitives, the global app shell, and the BatchAdmin primary workflow.

**Architecture:** Keep backend APIs and feature behavior unchanged. Add a small local UI layer in `packages/web/src/ui/` and `packages/web/src/index.css`, then apply it to `App.tsx` and `BatchAdmin.tsx`. Use tests to lock semantic shell/table behavior while browser screenshots verify visual fidelity.

**Tech Stack:** React 19, Vite, Tailwind v4, TypeScript, Vitest, Testing Library, lucide-react.

---

## Spec And Concept Inputs

- Design spec: `docs/superpowers/specs/2026-07-06-microsoft-fluent-ui-redesign.md`
- Concept image: `docs/superpowers/specs/assets/2026-07-06-microsoft-fluent-ui-redesign-concept.png`
- Primary implementation surface: `packages/web`
- Approved direction: `方案 A: Microsoft Fluent 2 SaaS Console`

## File Structure

- Create: `packages/web/src/ui/fluent.ts`
  - Owns shared class strings and small helpers for Fluent-style shell, buttons, inputs, tables, tags, panels, and focus states.
  - Does not import React.
- Modify: `packages/web/src/index.css`
  - Adds global font, background, scrollbar, and reusable CSS utilities that Tailwind class strings cannot express cleanly.
- Modify: `packages/web/src/App.tsx`
  - Replaces green-gradient shell with Microsoft-style top bar, left nav, content frame, role/tenant display, and Fluent skeleton.
  - Preserves auth, hash routes, active tab state, mounted tab behavior, presentation mode, pay result, public trace route, and profile settings.
- Modify: `packages/web/src/App.spec.tsx`
  - Adds shell assertions for app name, navigation active state, role/account text, and public route preservation.
- Modify: `packages/web/src/components/BatchAdmin.tsx`
  - Re-skins the primary page to match the concept: command bar, filters, dense table, status tags, selected row styling, and right inspector-style detail surfaces where practical.
  - Preserves all API calls, modal flows, export, QR generation, deletion confirmation, compliance probe, and pagination behavior.
- Create: `packages/web/src/components/BatchAdmin.spec.tsx`
  - Adds focused tests for rendering the command bar/table/filter semantics without testing visual CSS implementation details.

## Verification Commands

Run these from `E:\code\nongchang\.worktrees\microsoft-fluent-ui-redesign` unless specified:

- App shell tests: `corepack pnpm@10.33.2 --filter web test -- src/App.spec.tsx`
- BatchAdmin tests: `corepack pnpm@10.33.2 --filter web test -- src/components/BatchAdmin.spec.tsx`
- Web tests: `corepack pnpm@10.33.2 --filter web test`
- Web type check: `corepack pnpm@10.33.2 --filter web lint`
- Full unit suite: `corepack pnpm@10.33.2 test:unit`
- Dev server for screenshots: `corepack pnpm@10.33.2 --filter web dev -- --host 127.0.0.1`

## Task 1: Fluent Tokens And UI Class Helpers

**Files:**
- Create: `packages/web/src/ui/fluent.ts`
- Modify: `packages/web/src/index.css`

- [ ] **Step 1: Create the failing token/helper test by type-checking imports**

Add this import to an existing lightweight test file or create a small test in `packages/web/src/ui/fluent.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fluentButton, fluentInput, fluentStatusTag, fluentTable } from './fluent';

describe('fluent ui helpers', () => {
  it('returns Microsoft blue primary command styles', () => {
    expect(fluentButton('primary')).toContain('bg-[#0078D4]');
    expect(fluentButton('primary')).toContain('text-white');
  });

  it('returns compact input and table styles', () => {
    expect(fluentInput).toContain('h-8');
    expect(fluentTable.wrapper).toContain('border-[#E1DFDD]');
  });

  it('maps status tones to compact tags', () => {
    expect(fluentStatusTag('active')).toContain('bg-[#E5F1FB]');
    expect(fluentStatusTag('danger')).toContain('text-[#A4262C]');
  });
});
```

- [ ] **Step 2: Run the test and verify it fails because the module is missing**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/ui/fluent.spec.ts
```

Expected: FAIL with an import/module resolution error for `./fluent`.

- [ ] **Step 3: Add `packages/web/src/ui/fluent.ts`**

Create this file:

```ts
type ButtonVariant = 'primary' | 'secondary' | 'subtle' | 'danger' | 'icon';
type StatusTone = 'active' | 'success' | 'warning' | 'neutral' | 'danger';

export const fluent = {
  blue: '#0078D4',
  blueHover: '#106EBE',
  border: '#E1DFDD',
  borderStrong: '#C8C6C4',
  page: '#F5F5F5',
  surface: '#FFFFFF',
  text: '#242424',
  textMuted: '#605E5C',
};

export const fluentFocus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0078D4]/40 focus-visible:ring-offset-1';

export function fluentButton(variant: ButtonVariant = 'secondary'): string {
  const base = `inline-flex h-8 items-center justify-center gap-1.5 rounded-[4px] border px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${fluentFocus}`;
  const variants: Record<ButtonVariant, string> = {
    primary: 'border-[#0078D4] bg-[#0078D4] text-white hover:bg-[#106EBE]',
    secondary: 'border-[#C8C6C4] bg-white text-[#242424] hover:bg-[#F3F2F1]',
    subtle: 'border-transparent bg-transparent text-[#242424] hover:bg-[#F3F2F1]',
    danger: 'border-[#A4262C] bg-[#A4262C] text-white hover:bg-[#8E1F25]',
    icon: 'h-8 w-8 border-transparent bg-transparent p-0 text-[#605E5C] hover:bg-[#F3F2F1] hover:text-[#242424]',
  };

  return `${base} ${variants[variant]}`;
}

export const fluentInput = `h-8 rounded-[4px] border border-[#C8C6C4] bg-white px-3 text-sm text-[#242424] placeholder:text-[#8A8886] shadow-none transition-colors focus:border-[#0078D4] ${fluentFocus}`;

export const fluentSelect = `${fluentInput} pr-8`;

export const fluentTable = {
  wrapper: 'overflow-hidden border border-[#E1DFDD] bg-white',
  table: 'w-full border-collapse text-sm',
  thead: 'border-b border-[#E1DFDD] bg-[#FAFAFA] text-left text-xs font-semibold uppercase tracking-normal text-[#605E5C]',
  th: 'h-9 px-3 align-middle font-semibold',
  row: 'border-b border-[#EDEBE9] text-[#242424] hover:bg-[#F5F9FF]',
  rowSelected: 'border-l-2 border-l-[#0078D4] bg-[#EFF6FC]',
  td: 'h-11 px-3 align-middle',
};

export function fluentStatusTag(tone: StatusTone): string {
  const base = 'inline-flex h-5 items-center rounded-[4px] px-2 text-xs font-semibold';
  const tones: Record<StatusTone, string> = {
    active: 'bg-[#E5F1FB] text-[#005A9E]',
    success: 'bg-[#DFF6DD] text-[#107C10]',
    warning: 'bg-[#FFF4CE] text-[#8A6A00]',
    neutral: 'bg-[#F3F2F1] text-[#605E5C]',
    danger: 'bg-[#FDE7E9] text-[#A4262C]',
  };

  return `${base} ${tones[tone]}`;
}
```

- [ ] **Step 4: Add global Fluent CSS**

Append this to `packages/web/src/index.css` after the Tailwind import:

```css
:root {
  font-family: "Segoe UI", "Microsoft YaHei", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  color: #242424;
  background: #f5f5f5;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  background: #f5f5f5;
}

button,
input,
select,
textarea {
  font: inherit;
}

.fluent-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: #c8c6c4 transparent;
}

.fluent-scrollbar::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

.fluent-scrollbar::-webkit-scrollbar-thumb {
  background: #c8c6c4;
  border: 3px solid transparent;
  border-radius: 999px;
  background-clip: padding-box;
}
```

- [ ] **Step 5: Run helper test and web lint**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/ui/fluent.spec.ts
corepack pnpm@10.33.2 --filter web lint
```

Expected: both exit 0.

- [ ] **Step 6: Commit Task 1**

```powershell
git add packages/web/src/ui/fluent.ts packages/web/src/ui/fluent.spec.ts packages/web/src/index.css
git commit -m "feat(web): add fluent ui design tokens"
```

## Task 2: Microsoft-Style App Shell

**Files:**
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/App.spec.tsx`
- Uses: `packages/web/src/ui/fluent.ts`

- [ ] **Step 1: Add failing App shell tests**

Add tests to `packages/web/src/App.spec.tsx` that assert:

```tsx
it('renders the Fluent console shell for authenticated users', async () => {
  render(<App />);

  expect(await screen.findByText('农场溯源管理')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('搜索资源、菜单和功能')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /退出/ })).toBeInTheDocument();
});

it('keeps batch navigation reachable from the shell', async () => {
  render(<App />);

  const batchTab = await screen.findByRole('button', { name: /批次管理/ });
  await userEvent.click(batchTab);
  expect(batchTab).toHaveAttribute('aria-pressed', 'true');
});
```

If the existing test setup mocks auth differently, adapt only the setup values; keep these visible shell expectations.

- [ ] **Step 2: Run App tests and verify red**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/App.spec.tsx
```

Expected: FAIL because the current shell does not expose the new global search placeholder and Fluent app name structure.

- [ ] **Step 3: Rework `ViewSkeleton`**

In `packages/web/src/App.tsx`, change `ViewSkeleton` to a Fluent loading state:

```tsx
const ViewSkeleton = () => (
  <div className="h-full w-full animate-pulse bg-white p-5">
    <div className="mb-5 h-7 w-64 rounded-[4px] bg-[#EDEBE9]" />
    <div className="mb-4 flex gap-2">
      <div className="h-8 w-28 rounded-[4px] bg-[#EDEBE9]" />
      <div className="h-8 w-24 rounded-[4px] bg-[#EDEBE9]" />
      <div className="h-8 w-24 rounded-[4px] bg-[#EDEBE9]" />
    </div>
    <div className="overflow-hidden border border-[#E1DFDD]">
      <div className="h-9 border-b border-[#E1DFDD] bg-[#FAFAFA]" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-11 border-b border-[#EDEBE9] bg-white" />
      ))}
    </div>
  </div>
);
```

- [ ] **Step 4: Rework authenticated shell markup**

Keep the existing state and route logic. Replace only the authenticated layout JSX with this anatomy:

```tsx
<div className="flex h-screen bg-[#F5F5F5] text-[#242424]">
  <aside className="hidden w-58 shrink-0 border-r border-[#E1DFDD] bg-[#FAFAFA] md:flex md:flex-col">
    <div className="flex h-12 items-center gap-3 border-b border-[#E1DFDD] px-4">
      <div className="grid h-7 w-7 place-items-center rounded-[4px] bg-[#0078D4] text-white">
        <Leaf className="h-4 w-4" />
      </div>
      <span className="text-sm font-semibold">农场溯源管理</span>
    </div>
    <nav className="fluent-scrollbar flex-1 overflow-y-auto py-2">
      {availableTabs.map((item) => {
        const active = activeTab === item.key;
        return (
          <button
            key={item.key}
            type="button"
            aria-pressed={active}
            onClick={() => setActiveTab(item.key)}
            className={`flex h-10 w-full items-center gap-3 border-l-2 px-4 text-left text-sm transition-colors ${
              active
                ? 'border-l-[#0078D4] bg-[#EFF6FC] text-[#005A9E]'
                : 'border-l-transparent text-[#323130] hover:bg-[#F3F2F1]'
            }`}
          >
            <Icon name={item.icon} className="h-4 w-4" />
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </nav>
  </aside>
  <div className="flex min-w-0 flex-1 flex-col">
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[#E1DFDD] bg-white px-4">
      <button type="button" aria-label="打开导航" className={fluentButton('icon')}>
        <Menu className="h-4 w-4" />
      </button>
      <div className="relative hidden flex-1 max-w-xl sm:block">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#605E5C]" />
        <input className={`${fluentInput} w-full pl-8`} placeholder="搜索资源、菜单和功能" />
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-2 text-xs text-[#605E5C]">
        <span className="hidden truncate sm:inline">{profile?.displayName ?? user?.userId}</span>
        <span className="hidden rounded-[4px] bg-[#F3F2F1] px-2 py-1 font-semibold text-[#323130] sm:inline">{systemRole}</span>
        <button type="button" onClick={() => setProfileOpen(true)} className={fluentButton('subtle')}>账户</button>
        <button type="button" onClick={logout} className={fluentButton('secondary')}>退出</button>
      </div>
    </header>
    <main className="fluent-scrollbar min-h-0 flex-1 overflow-auto p-4 md:p-6">
      <Suspense fallback={<ViewSkeleton />}>{activeView}</Suspense>
    </main>
  </div>
</div>
```

Use the real variable names from `App.tsx`: `availableTabs`, `activeView`, `Icon`, `systemRole`, `profile`, `user`, `logout`, and existing modal/profile route blocks. If the file currently names the filtered tab array differently, keep the existing name.

- [ ] **Step 5: Preserve route branches**

Confirm these branches remain before authenticated shell rendering:

```tsx
if (traceCode) return <TraceabilityPage code={traceCode} />;
if (payResultOrderId) return <PayResult orderId={payResultOrderId} />;
if (!isAuthenticated) return <AppLogin />;
```

- [ ] **Step 6: Run App tests and web lint**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/App.spec.tsx
corepack pnpm@10.33.2 --filter web lint
```

Expected: both exit 0.

- [ ] **Step 7: Commit Task 2**

```powershell
git add packages/web/src/App.tsx packages/web/src/App.spec.tsx
git commit -m "feat(web): redesign app shell with fluent layout"
```

## Task 3: BatchAdmin Command Bar, Filters, And Dense Table

**Files:**
- Modify: `packages/web/src/components/BatchAdmin.tsx`
- Create: `packages/web/src/components/BatchAdmin.spec.tsx`
- Uses: `packages/web/src/ui/fluent.ts`

- [ ] **Step 1: Add failing BatchAdmin tests**

Create `packages/web/src/components/BatchAdmin.spec.tsx` with API mocks for `listBatches`, `listFields`, and related functions. The key assertions should be:

```tsx
it('renders Fluent batch command bar and table columns', async () => {
  render(<BatchAdmin />);

  expect(await screen.findByRole('heading', { name: /批次全生命周期管理/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /新建批次/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /导出/ })).toBeInTheDocument();
  expect(screen.getByPlaceholderText('按批次号搜索')).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: /批次号/ })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: /签发码数/ })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: /扫码量/ })).toBeInTheDocument();
});

it('filters visible rows by batch code', async () => {
  render(<BatchAdmin />);

  await screen.findByText('B20240520001');
  await userEvent.type(screen.getByPlaceholderText('按批次号搜索'), '18003');

  expect(screen.queryByText('B20240520001')).not.toBeInTheDocument();
  expect(screen.getByText('B20240518003')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run BatchAdmin tests and verify red**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/components/BatchAdmin.spec.tsx
```

Expected: FAIL because the new heading, button labels, placeholder, or test file do not yet exist.

- [ ] **Step 3: Import Fluent helpers in `BatchAdmin.tsx`**

Add:

```tsx
import { fluentButton, fluentInput, fluentSelect, fluentStatusTag, fluentTable } from '../ui/fluent';
```

- [ ] **Step 4: Rename visible BatchAdmin page title and helper text**

Use:

```tsx
<h1 className="text-2xl font-semibold text-[#242424]">批次全生命周期管理</h1>
<p className="mt-1 text-sm text-[#605E5C]">管理种植、采收、包装、溯源码签发与扫码核验链路。</p>
```

- [ ] **Step 5: Replace header action styling with Fluent command bar**

Preserve existing handlers. Use these labels:

```tsx
<button onClick={() => setShowCreateModal(true)} className={fluentButton('primary')}>
  <Plus className="h-4 w-4" /> 新建批次
</button>
<button onClick={() => setExportDropdownOpen(!exportDropdownOpen)} disabled={isExporting !== null} className={fluentButton('secondary')}>
  {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
  导出
</button>
<button onClick={() => setShowAdvancedFilter(!showAdvancedFilter)} className={fluentButton('secondary')}>
  <Filter className="h-4 w-4" /> 筛选
</button>
<button onClick={() => void reload()} className={fluentButton('subtle')}>
  <RefreshCw className="h-4 w-4" /> 刷新
</button>
```

If `RefreshCw` is not imported, import it from `lucide-react`.

- [ ] **Step 6: Replace search and filter controls**

Use the existing filter state. Search placeholder must be:

```tsx
placeholder="按批次号搜索"
className={`${fluentInput} w-full pl-8`}
```

Selects should use:

```tsx
className={`${fluentSelect} w-full`}
```

- [ ] **Step 7: Replace table shell and row styling**

Keep the same `pagedData.map` and row action handlers. Use:

```tsx
<div className={fluentTable.wrapper}>
  <table className={fluentTable.table}>
    <thead className={fluentTable.thead}>
      <tr>
        <th className={fluentTable.th}>批次号</th>
        <th className={fluentTable.th}>品种</th>
        <th className={fluentTable.th}>地块</th>
        <th className={fluentTable.th}>状态</th>
        <th className={`${fluentTable.th} text-right`}>签发码数</th>
        <th className={`${fluentTable.th} text-right`}>扫码量</th>
        <th className={fluentTable.th}>最近更新</th>
        <th className={`${fluentTable.th} text-right`}>操作</th>
      </tr>
    </thead>
  </table>
</div>
```

Status tone mapping:

```ts
const statusTone = (stage: string) => {
  if (stage === BatchStatus.HARVESTED || stage === BatchStatus.DISTRIBUTED) return 'success';
  if (stage === BatchStatus.GROWING || stage === BatchStatus.PLANTING) return 'active';
  return 'neutral';
};
```

- [ ] **Step 8: Keep dialogs functional but restyle visible shells only**

For create/detail/delete/QR/credential/compliance dialogs, keep existing state, submit handlers, and API calls. Replace only dominant container classes:

```tsx
className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-[6px] border border-[#E1DFDD] bg-white shadow-xl"
```

Do not change generated trace code data, delete force behavior, CSV export, or QR generation.

- [ ] **Step 9: Run BatchAdmin tests, App tests, and web lint**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/components/BatchAdmin.spec.tsx
corepack pnpm@10.33.2 --filter web test -- src/App.spec.tsx
corepack pnpm@10.33.2 --filter web lint
```

Expected: all exit 0.

- [ ] **Step 10: Commit Task 3**

```powershell
git add packages/web/src/components/BatchAdmin.tsx packages/web/src/components/BatchAdmin.spec.tsx
git commit -m "feat(web): redesign batch admin fluent console"
```

## Task 4: Browser Fidelity QA And Final Verification

**Files:**
- Modify only if screenshot QA reveals fixable visual issues in Task 1-3 files.
- Do not create persistent screenshot artifacts unless needed for review evidence.

- [ ] **Step 1: Run complete web verification**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test
corepack pnpm@10.33.2 --filter web lint
```

Expected: both exit 0.

- [ ] **Step 2: Run full unit suite**

Run:

```powershell
corepack pnpm@10.33.2 test:unit
```

Expected: backend, web, and miniapp unit suites exit 0. If PostgreSQL/PostGIS e2e remains unavailable, report it separately and do not claim e2e passed.

- [ ] **Step 3: Start web dev server**

Run:

```powershell
corepack pnpm@10.33.2 --filter web dev -- --host 127.0.0.1
```

Expected: Vite reports a local URL such as `http://127.0.0.1:5173/`.

- [ ] **Step 4: Capture browser screenshots**

Use the browser tooling to inspect:

- Desktop viewport around `1440x900`.
- Mobile viewport around `390x844`.
- Authenticated shell if test/dev auth state is available.
- `BatchAdmin` page after clicking `批次管理`.

Compare against:

```text
docs/superpowers/specs/assets/2026-07-06-microsoft-fluent-ui-redesign-concept.png
```

- [ ] **Step 5: Fix visual blockers**

Fix only blockers that violate the accepted concept or spec:

- green-gradient shell still dominates.
- primary page content is clipped.
- command buttons overlap.
- table cells or filters overflow.
- text is unreadable.
- mobile navigation is unusable.
- fake metrics or fake features were introduced.

After each fix, rerun:

```powershell
corepack pnpm@10.33.2 --filter web test -- src/App.spec.tsx src/components/BatchAdmin.spec.tsx
corepack pnpm@10.33.2 --filter web lint
```

- [ ] **Step 6: Commit final QA fixes if any**

If Task 4 changed files:

```powershell
git add packages/web/src/App.tsx packages/web/src/App.spec.tsx packages/web/src/components/BatchAdmin.tsx packages/web/src/components/BatchAdmin.spec.tsx packages/web/src/index.css packages/web/src/ui/fluent.ts packages/web/src/ui/fluent.spec.ts
git commit -m "fix(web): polish fluent console responsive qa"
```

If Task 4 made no file changes, do not create an empty commit.

## Review Requirements

After all tasks:

- Run a spec compliance review against `docs/superpowers/specs/2026-07-06-microsoft-fluent-ui-redesign.md`.
- Run a code-quality review focused on:
  - No backend/API contract changes.
  - No tenant, billing, or permission behavior changes.
  - No fake UI facts.
  - Reusable class helpers are not over-engineered.
  - BatchAdmin behavior was preserved while styling changed.
- Use `superpowers:verification-before-completion` before claiming success.

## Self-Review

Spec coverage:

- Visual system: Task 1.
- App shell: Task 2.
- Batch management primary screen: Task 3.
- Responsive and screenshot QA: Task 4.
- Data reliability and function truthfulness: preserved by limiting code changes to Web UI and explicitly reviewing API/behavior boundaries.

Placeholder scan: no unresolved placeholder markers remain.

Type consistency: `fluentButton`, `fluentInput`, `fluentSelect`, `fluentStatusTag`, and `fluentTable` are defined in Task 1 and used by Tasks 2-3 with matching names.
