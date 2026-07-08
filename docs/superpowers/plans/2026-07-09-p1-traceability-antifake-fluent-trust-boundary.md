# Traceability Anti-Fake Fluent Trust Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the public traceability page and anti-fake monitor into the Fluent trust system while removing over-claiming copy from visible trace and scan-risk surfaces.

**Architecture:** Keep this as a web-only UI and test slice. Do not change backend endpoints, shared DTOs, trace scan detection thresholds, public trace API behavior, or anti-fake write operations. Add component tests that prove the pages still consume the real API wrappers and that legacy visual tokens and misleading production claims do not return.

**Tech Stack:** React 19, Vite, TypeScript, Vitest, Testing Library, Tailwind utilities, lucide-react, existing local Fluent helpers.

## Global Constraints

- Use CodeGraph before grep/file search for code discovery because `.codegraph/` exists.
- Use TDD: add failing tests first, verify RED, then change production code.
- Do not change backend APIs, shared DTOs, public trace response shape, anti-fake API wrappers, or detection thresholds.
- Do not introduce new dependencies.
- Public trace copy must not claim blockchain, signatures, or guaranteed authenticity unless the implementation proves those claims.
- Anti-fake monitor copy must describe the caller-visible scope, not "global network" coverage.
- Touched production files must use `../ui/fluent` and `../ui/state`, and must not contain dominant legacy tokens: `rounded-xl`, `rounded-2xl`, `bg-emerald`, `hover:bg-emerald`, `border-slate`, `text-slate`, `bg-slate`, `shadow-2xl`.
- Preserve real API behavior:
  - `TraceabilityPage` calls `fetchPublicTrace(code)` when opened and renders returned batch, events, scan count, map key, and credentials.
  - `AntiFakeMonitor` calls `listScans()`, `listAlerts()`, `freezeCode(code)`, and `unfreezeCode(code)` through `../api/anti-fake`.

---

## File Structure

- Create: `packages/web/src/components/TraceabilityPage.spec.tsx`
  - Covers real public trace fetch rendering, credential links, frozen code state, source-level no-overclaim/no-legacy boundaries.
- Create: `packages/web/src/components/AntiFakeMonitor.spec.tsx`
  - Covers alert/scans rendering, freeze/unfreeze API calls, empty/error states, source-level Fluent/no-global/no-legacy boundaries.
- Modify: `packages/web/src/components/TraceabilityPage.tsx`
  - Replace green marketing-style surface with neutral Fluent trust layout.
  - Replace over-claiming copy with verifiable public-trace wording.
- Modify: `packages/web/src/components/AntiFakeMonitor.tsx`
  - Replace card-heavy legacy monitor with Fluent split table/list layout.
  - Use shared loading, empty, and error states.
- Verify: `docs/superpowers/plans/2026-07-09-p1-traceability-antifake-fluent-trust-boundary.md`

---

### Task 1: Add Public Traceability Regression Tests

**Files:**
- Create: `packages/web/src/components/TraceabilityPage.spec.tsx`
- Modify later: `packages/web/src/components/TraceabilityPage.tsx`

**Interfaces:**
- Consumes mocked `../api/trace` with `fetchPublicTrace` and `TraceNotFoundError`.
- Produces tests for source boundaries and public trace rendering.

- [x] **Step 1: Write the failing tests**

Create `packages/web/src/components/TraceabilityPage.spec.tsx` with tests equivalent to:

```tsx
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TraceabilityPage from './TraceabilityPage';

const traceMocks = vi.hoisted(() => ({
  fetchPublicTrace: vi.fn(),
  TraceNotFoundError: class TraceNotFoundError extends Error {},
}));

vi.mock('../api/trace', () => traceMocks);
vi.mock('./TiandituMap', () => ({ default: () => <div>Origin map</div> }));

const source = () => readFileSync(join(process.cwd(), 'src/components/TraceabilityPage.tsx'), 'utf8');

const publicTrace = {
  frozen: false,
  scanCount: 7,
  tiandituKey: 'tdt-key',
  batch: {
    batchNo: 'B-TRACE-1',
    cropName: 'Peony',
    fieldName: 'Field A',
    fieldLng: 102.1,
    fieldLat: 25.1,
    region: 'Yunnan',
  },
  events: [
    {
      type: 'planting',
      title: 'Planting',
      actor: 'Operator A',
      location: 'Field A',
      occurredAt: '2026-07-01T08:00:00.000Z',
      payload: { desc: 'Seedling record', tag: 'farm-record' },
    },
  ],
  credentials: [
    {
      type: 'certificate',
      title: 'Organic Cert',
      issuer: 'Agency',
      serialNo: 'CERT-1',
      issuedAt: '2026-07-02T00:00:00.000Z',
      fileUrl: 'https://cdn.example.test/cert.pdf',
    },
  ],
};

describe('TraceabilityPage Fluent trust boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    traceMocks.fetchPublicTrace.mockResolvedValue(publicTrace);
  });

  it('uses Fluent primitives and excludes legacy marketing and overclaiming copy', () => {
    const text = source();
    expect(text).toContain("from '../ui/fluent'");
    expect(text).toContain("from '../ui/state'");
    expect(text).not.toContain('rounded-xl');
    expect(text).not.toContain('rounded-2xl');
    expect(text).not.toContain('bg-emerald');
    expect(text).not.toContain('hover:bg-emerald');
    expect(text).not.toContain('border-slate');
    expect(text).not.toContain('text-slate');
    expect(text).not.toContain('bg-slate');
    expect(text).not.toContain('shadow-2xl');
    expect(text).not.toContain('block integrity');
    expect(text).not.toContain('signatures');
    expect(text).not.toContain('正品认证通过');
    expect(text).not.toContain('真实有效');
  });

  it('renders public trace data and credential evidence from the real fetch result', async () => {
    render(<TraceabilityPage code="TRACE-1" />);
    expect(await screen.findByText('Peony')).toBeTruthy();
    expect(traceMocks.fetchPublicTrace).toHaveBeenCalledWith('TRACE-1');
    expect(screen.getByText('B-TRACE-1')).toBeTruthy();
    expect(screen.getByText('Planting')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '凭证' }));
    expect(await screen.findByText('Organic Cert')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Organic Cert/ }).getAttribute('href')).toBe('https://cdn.example.test/cert.pdf');
  });

  it('renders a frozen-code boundary without implying successful authenticity', async () => {
    traceMocks.fetchPublicTrace.mockResolvedValue({ ...publicTrace, frozen: true });
    render(<TraceabilityPage code="TRACE-FROZEN" />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText(/TRACE-FROZEN/)).toBeTruthy();
  });
});
```

- [x] **Step 2: Run tests to verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/TraceabilityPage.spec.tsx
```

Expected: FAIL because `TraceabilityPage.tsx` still lacks Fluent/state imports, contains legacy tokens, and includes over-claiming copy.

---

### Task 2: Add Anti-Fake Monitor Regression Tests

**Files:**
- Create: `packages/web/src/components/AntiFakeMonitor.spec.tsx`
- Modify later: `packages/web/src/components/AntiFakeMonitor.tsx`

**Interfaces:**
- Consumes mocked `../api/anti-fake` and real `useApi` behavior.
- Produces tests for scan/alert rendering, freeze/unfreeze behavior, empty/error states, and source boundaries.

- [x] **Step 1: Write the failing tests**

Create `packages/web/src/components/AntiFakeMonitor.spec.tsx` with tests equivalent to:

```tsx
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AntiFakeMonitor from './AntiFakeMonitor';

const antiFakeMocks = vi.hoisted(() => ({
  listScans: vi.fn(),
  listAlerts: vi.fn(),
  freezeCode: vi.fn(),
  unfreezeCode: vi.fn(),
}));

vi.mock('../api/anti-fake', () => antiFakeMocks);
vi.mock('../hooks/useToast', () => ({ showToast: vi.fn() }));

const source = () => readFileSync(join(process.cwd(), 'src/components/AntiFakeMonitor.tsx'), 'utf8');

describe('AntiFakeMonitor Fluent trust boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    antiFakeMocks.listScans.mockResolvedValue([
      { id: 'scan-1', code: 'TRACE-1', batchId: 'batch-1', ip: '10.0.0.1', userAgent: 'UA', scannedAt: '2026-07-09T01:00:00.000Z' },
    ]);
    antiFakeMocks.listAlerts.mockResolvedValue([
      { code: 'TRACE-1', batchId: 'batch-1', distinctIps: 3, scanCount: 5, locations: ['10.0.0.1', '10.0.0.2'], lastScanAt: '2026-07-09T01:00:00.000Z', frozen: false },
    ]);
    antiFakeMocks.freezeCode.mockResolvedValue({ code: 'TRACE-1', frozen: true });
    antiFakeMocks.unfreezeCode.mockResolvedValue({ code: 'TRACE-1', frozen: false });
  });

  it('uses Fluent primitives and avoids legacy/global-overclaim tokens', () => {
    const text = source();
    expect(text).toContain("from '../ui/fluent'");
    expect(text).toContain("from '../ui/state'");
    expect(text).not.toContain('rounded-xl');
    expect(text).not.toContain('bg-slate');
    expect(text).not.toContain('border-slate');
    expect(text).not.toContain('text-slate');
    expect(text).not.toContain('全网');
    expect(text).not.toContain('mockResult');
    expect(text).not.toContain('fake');
  });

  it('renders alert and scan data from the real anti-fake API wrappers', async () => {
    render(<AntiFakeMonitor />);
    expect(await screen.findByText('TRACE-1')).toBeTruthy();
    expect(screen.getByText('10.0.0.1')).toBeTruthy();
    expect(antiFakeMocks.listAlerts).toHaveBeenCalled();
    expect(antiFakeMocks.listScans).toHaveBeenCalled();
  });

  it('freezes and unfreezes codes through the real anti-fake API wrappers', async () => {
    const { rerender } = render(<AntiFakeMonitor />);
    fireEvent.click(await screen.findByRole('button', { name: /冻结 TRACE-1/ }));
    await waitFor(() => expect(antiFakeMocks.freezeCode).toHaveBeenCalledWith('TRACE-1'));

    antiFakeMocks.listAlerts.mockResolvedValue([
      { code: 'TRACE-1', batchId: 'batch-1', distinctIps: 3, scanCount: 5, locations: ['10.0.0.1'], lastScanAt: '2026-07-09T01:00:00.000Z', frozen: true },
    ]);
    rerender(<AntiFakeMonitor />);
    fireEvent.click(await screen.findByRole('button', { name: /解冻 TRACE-1/ }));
    await waitFor(() => expect(antiFakeMocks.unfreezeCode).toHaveBeenCalledWith('TRACE-1'));
  });

  it('shows shared empty state when there are no alerts or scans', async () => {
    antiFakeMocks.listAlerts.mockResolvedValue([]);
    antiFakeMocks.listScans.mockResolvedValue([]);
    render(<AntiFakeMonitor />);
    expect(await screen.findByRole('status', { name: '暂无异常扫码预警' })).toBeTruthy();
    expect(await screen.findByRole('status', { name: '暂无扫码日志' })).toBeTruthy();
  });
});
```

- [x] **Step 2: Run tests to verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/AntiFakeMonitor.spec.tsx
```

Expected: FAIL because `AntiFakeMonitor.tsx` still lacks Fluent/state imports, contains legacy tokens, and uses global-overclaim copy.

---

### Task 3: Refactor TraceabilityPage to Fluent Trust UI

**Files:**
- Modify: `packages/web/src/components/TraceabilityPage.tsx`
- Test: `packages/web/src/components/TraceabilityPage.spec.tsx`

**Interfaces:**
- Consumes: `fetchPublicTrace(code)`.
- Produces: A public trace page with verifiable copy and Fluent-compatible trust sections.

- [x] **Step 1: Import shared UI helpers**

Add:

```tsx
import { fluentButton, fluentStatusTag } from '../ui/fluent';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';
```

- [x] **Step 2: Replace loading/error/frozen surfaces**

Use:

```tsx
<LoadingState label="正在查询溯源记录" />
<ErrorState title="溯源码无效或暂不可查" message={error ?? `未找到溯源码 ${code}`} />
<div role="alert">该溯源码已被冻结</div>
```

Do not include `block integrity`, `signatures`, `正品认证通过`, or `真实有效`.

- [x] **Step 3: Replace main content copy and visual tokens**

Use neutral/blue Fluent surfaces:

```tsx
<h1>{batch.cropName}</h1>
<span>{batch.batchNo}</span>
<span className={fluentStatusTag('success')}>溯源记录已匹配</span>
```

Use `rounded-[4px]` or `rounded-[6px]`, `border-[#E1DFDD]`, `text-[#242424]`, and `bg-[#F5F5F5]`.

- [x] **Step 4: Preserve journey, map, and credential rendering**

Keep:

```tsx
fetchPublicTrace(code)
events.map(...)
credentials.map((c) => <a href={c.fileUrl} ...>)
originField && data.tiandituKey && <TiandituMap ... />
```

- [x] **Step 5: Run focused traceability test**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/TraceabilityPage.spec.tsx
```

Expected: PASS.

---

### Task 4: Refactor AntiFakeMonitor to Fluent Trust UI

**Files:**
- Modify: `packages/web/src/components/AntiFakeMonitor.tsx`
- Test: `packages/web/src/components/AntiFakeMonitor.spec.tsx`

**Interfaces:**
- Consumes: `listScans`, `listAlerts`, `freezeCode`, `unfreezeCode`.
- Produces: A Fluent-style scoped monitor with explicit loading, empty, error, and destructive actions.

- [x] **Step 1: Import shared UI helpers**

Add:

```tsx
import { fluentButton, fluentStatusTag, fluentTable } from '../ui/fluent';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';
```

- [x] **Step 2: Replace shell and headings**

Use:

```tsx
<section className="h-full border border-[#E1DFDD] bg-white">
<h3>防伪风险监控</h3>
<p>基于当前账号可见范围内的真实扫码日志识别高频复用风险。</p>
```

Do not use the phrase `全网`.

- [x] **Step 3: Replace alert list states and actions**

Use `LoadingState`, `EmptyState`, and `ErrorState`. Action buttons must have accessible names:

```tsx
aria-label={`冻结 ${alert.code}`}
aria-label={`解冻 ${alert.code}`}
```

- [x] **Step 4: Replace scan log table**

Use `fluentTable` classes and render real scan rows only:

```tsx
<table className={fluentTable.table}>
  <td>{scan.code}</td>
  <td>{scan.ip}</td>
  <td>{scan.userAgent ?? '-'}</td>
</table>
```

- [x] **Step 5: Run focused anti-fake test**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/AntiFakeMonitor.spec.tsx src/api/anti-fake.spec.ts
```

Expected: PASS.

---

### Task 5: Verify, Review, and Commit P1

**Files:**
- Verify: `packages/web/src/components/TraceabilityPage.tsx`
- Verify: `packages/web/src/components/TraceabilityPage.spec.tsx`
- Verify: `packages/web/src/components/AntiFakeMonitor.tsx`
- Verify: `packages/web/src/components/AntiFakeMonitor.spec.tsx`
- Verify: `docs/superpowers/plans/2026-07-09-p1-traceability-antifake-fluent-trust-boundary.md`

- [x] **Step 1: Run focused verification**

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/TraceabilityPage.spec.tsx src/components/AntiFakeMonitor.spec.tsx src/api/anti-fake.spec.ts
```

Expected: PASS.

- [x] **Step 2: Run Web verification**

```powershell
corepack pnpm@10.33.2 --filter web lint
corepack pnpm@10.33.2 --filter web test
corepack pnpm@10.33.2 --filter web build
```

Expected: lint exits 0; all Web tests pass; build exits 0. Existing `DashboardDemo` chunk-size warning may remain.

- [x] **Step 3: Run residue scan**

```powershell
rg -n "rounded-xl|rounded-2xl|bg-emerald|hover:bg-emerald|border-slate|text-slate|bg-slate|shadow-2xl|block integrity|signatures|正品认证通过|真实有效|全网|mockResult|fake" packages/web/src/components/TraceabilityPage.tsx packages/web/src/components/AntiFakeMonitor.tsx
git -c safe.directory=E:/code/nongchang diff --check
```

Expected: no residue matches; no whitespace errors.

- [x] **Step 4: Request review**

Ask a reviewer to inspect the diff for:

- No backend, shared DTO, or API wrapper contract changes.
- No public trace overclaims about blockchain, signatures, or guaranteed authenticity.
- No anti-fake copy claiming global visibility beyond the current account scope.
- `fetchPublicTrace`, `listScans`, `listAlerts`, `freezeCode`, and `unfreezeCode` behavior preserved.
- Fluent styling applied to both touched surfaces.

- [x] **Step 5: Commit**

```powershell
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p1-traceability-antifake-fluent-trust-boundary.md packages/web/src/components/TraceabilityPage.spec.tsx packages/web/src/components/AntiFakeMonitor.spec.tsx packages/web/src/components/TraceabilityPage.tsx packages/web/src/components/AntiFakeMonitor.tsx
git -c safe.directory=E:/code/nongchang commit -m "refactor(web): align trace trust surfaces with Fluent UI"
```

Expected: commit created successfully.

## Self-Review

Spec coverage: This plan covers the next high-impact trust surfaces from the SaaS audit: public consumer traceability and anti-fake risk monitoring. It preserves real API contracts and narrows copy to what the system can prove.

Placeholder scan: No TBD/TODO/fill-later placeholders remain; each task names exact files, commands, expected outcomes, and API invariants.

Type consistency: API names match `packages/web/src/api/trace.ts` and `packages/web/src/api/anti-fake.ts`; UI helper names match `packages/web/src/ui/fluent.ts` and `packages/web/src/ui/state.tsx`.
