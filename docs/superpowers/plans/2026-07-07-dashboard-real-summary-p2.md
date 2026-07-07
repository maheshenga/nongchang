# Dashboard Real Summary P2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the production dashboard placeholder with a small real-data summary backed by existing batch, field, and farm-record API clients.

**Architecture:** Keep the P1 production/demo boundary intact. `Dashboard` remains a thin mode wrapper, `DashboardDemo` keeps all legacy simulated visuals, and `ProductionDashboardStatus` becomes the only production-default surface. It reads existing frontend API clients through `useApi`, shows truthful counts, loading/error/empty states, and keeps demo mode as explicit opt-in.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, Tailwind CSS, Lucide icons, existing `useApi` and `packages/web/src/api/*` clients.

## Global Constraints

- Work in isolated worktree `E:\code\nongchang\.worktrees\dashboard-real-data-p1` on branch `codex/dashboard-real-data-p1`.
- Use `corepack pnpm@10.33.2`.
- Use TDD: write failing tests before production code.
- Do not modify backend APIs in this P2 slice.
- Do not delete the legacy dashboard visuals; keep them behind explicit demo opt-in.
- Do not introduce fake metrics, fake health scores, AI claims, or unsupported dashboard actions in production mode.
- Do not commit generated `node_modules`, `.superpowers`, or build output.

---

## File Structure

- Modify: `packages/web/src/components/Dashboard.tsx`
  - Import existing API clients and shared state components.
  - Load batches, fields, and farm records in production mode.
  - Render truthful summary counts, latest record, loading/error/empty states, and a real retry action.
- Modify: `packages/web/src/components/Dashboard.truthfulness.spec.tsx`
  - Mock real API clients.
  - Assert production mode reads API-backed data and still hides demo-only controls.
  - Assert failed API loading shows an error with retry behavior.
- Add: `docs/superpowers/plans/2026-07-07-dashboard-real-summary-p2.md`
  - Track this P2 implementation plan.

---

### Task 1: Add failing tests for the real production summary

**Files:**
- Modify: `packages/web/src/components/Dashboard.truthfulness.spec.tsx`

**Interfaces:**
- Consumes: default export `Dashboard` from `./Dashboard`.
- Consumes mocked API functions:
  - `listBatches(): Promise<Batch[]>`
  - `listFields(): Promise<Field[]>`
  - `listFarmRecords(): Promise<FarmRecord[]>`
- Produces test expectations for visible copy:
  - `数据来源：真实业务 API`
  - `在管批次 2`
  - `地块数量 1`
  - `农事记录 1`
  - `累计扫码 7`
  - `最近农事记录`
  - `生产看板数据加载失败`

- [x] **Step 1: Mock production API clients**

Add hoisted mocks before importing `Dashboard`:

```tsx
const apiMocks = vi.hoisted(() => ({
  listBatches: vi.fn(),
  listFields: vi.fn(),
  listFarmRecords: vi.fn(),
}));

vi.mock('../api/batches', () => ({ listBatches: apiMocks.listBatches }));
vi.mock('../api/fields', () => ({ listFields: apiMocks.listFields }));
vi.mock('../api/farm-records', () => ({ listFarmRecords: apiMocks.listFarmRecords }));
```

- [x] **Step 2: Seed default API responses before each test**

Add:

```tsx
beforeEach(() => {
  apiMocks.listBatches.mockResolvedValue([
    { id: 'b1', batchNo: 'B-001', cropName: '番茄', status: 'growing', scanTotal: 4 },
    { id: 'b2', batchNo: 'B-002', cropName: '黄瓜', status: 'harvested', scanTotal: 3 },
  ]);
  apiMocks.listFields.mockResolvedValue([{ id: 'f1', name: 'A 区', area: 12 }]);
  apiMocks.listFarmRecords.mockResolvedValue([
    { id: 'r1', action: '施肥', status: 'completed', recordedAt: '2026-07-07T08:00:00.000Z' },
  ]);
});
```

- [x] **Step 3: Assert production summary uses real API data**

Add to the default production test:

```tsx
expect(await screen.findByText('数据来源：真实业务 API')).toBeTruthy();
expect(screen.getByLabelText('在管批次 2')).toBeTruthy();
expect(screen.getByLabelText('地块数量 1')).toBeTruthy();
expect(screen.getByLabelText('农事记录 1')).toBeTruthy();
expect(screen.getByLabelText('累计扫码 7')).toBeTruthy();
expect(screen.getByText('最近农事记录')).toBeTruthy();
expect(screen.getByText('施肥')).toBeTruthy();
```

- [x] **Step 4: Assert error and retry behavior**

Add a focused test:

```tsx
it('shows a retryable error when production data fails to load', async () => {
  apiMocks.listBatches.mockRejectedValueOnce(new Error('Batch API down'));

  render(<Dashboard />);

  expect(await screen.findByRole('alert')).toHaveTextContent('生产看板数据加载失败');
  fireEvent.click(screen.getByRole('button', { name: '重试' }));

  await waitFor(() => expect(apiMocks.listBatches).toHaveBeenCalledTimes(2));
});
```

- [x] **Step 5: Run test to verify it fails**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/Dashboard.truthfulness.spec.tsx
```

Expected: FAIL because production mode still renders the placeholder status cards and does not call API clients.

---

### Task 2: Implement the real production summary

**Files:**
- Modify: `packages/web/src/components/Dashboard.tsx`

**Interfaces:**
- Consumes:
  - `listBatches` from `../api/batches`
  - `listFields` from `../api/fields`
  - `listFarmRecords` from `../api/farm-records`
  - `useApi` from `../hooks/useApi`
  - `LoadingState`, `ErrorState`, `EmptyState` from `../ui/state`
- Produces:
  - `<ProductionDashboardStatus onEnterDemo={...} />` with real counts and retry.

- [x] **Step 1: Add imports**

Add:

```tsx
import { listBatches } from '../api/batches';
import { listFields } from '../api/fields';
import { listFarmRecords } from '../api/farm-records';
import { useApi } from '../hooks/useApi';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';
```

- [x] **Step 2: Load production data**

Inside `ProductionDashboardStatus`, add:

```tsx
const batches = useApi(listBatches);
const fields = useApi(listFields);
const records = useApi(listFarmRecords);
```

- [x] **Step 3: Add summary derivation**

Derive:

```tsx
const batchItems = batches.data ?? [];
const fieldItems = fields.data ?? [];
const recordItems = records.data ?? [];
const totalScans = batchItems.reduce((sum, batch) => sum + (Number(batch.scanTotal) || 0), 0);
const latestRecord = [...recordItems].sort(
  (a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime(),
)[0];
```

- [x] **Step 4: Render loading, error, and empty states**

Use:

```tsx
const isLoading = batches.loading || fields.loading || records.loading;
const error = batches.error || fields.error || records.error;
const reloadAll = () => { void Promise.all([batches.reload(), fields.reload(), records.reload()]); };
```

Render `LoadingState`, `ErrorState`, and `EmptyState` in the production panel without hiding the explicit demo opt-in button.

- [x] **Step 5: Render real KPI cards**

Render four cards with exact `aria-label` values:

```tsx
aria-label={`在管批次 ${batchItems.length}`}
aria-label={`地块数量 ${fieldItems.length}`}
aria-label={`农事记录 ${recordItems.length}`}
aria-label={`累计扫码 ${totalScans}`}
```

Show `latestRecord.action`, `latestRecord.status`, and `latestRecord.recordedAt` only when a record exists.

- [x] **Step 6: Verify focused green**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/Dashboard.truthfulness.spec.tsx
```

Expected: PASS.

---

### Task 3: Verify, review, and commit P2

**Files:**
- Review: `packages/web/src/components/Dashboard.tsx`
- Review: `packages/web/src/components/Dashboard.truthfulness.spec.tsx`
- Review: `docs/superpowers/plans/2026-07-07-dashboard-real-summary-p2.md`

- [x] **Step 1: Run related tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/Dashboard.truthfulness.spec.tsx src/App.spec.tsx
```

Expected: PASS.

- [x] **Step 2: Run Web type check and build**

Run:

```powershell
corepack pnpm@10.33.2 --filter web lint
corepack pnpm@10.33.2 --filter web build
```

Expected: both PASS.

- [x] **Step 3: Run full local verification**

Run:

```powershell
corepack pnpm@10.33.2 verify:local
```

Expected: PASS.

- [x] **Step 4: Request review and fix blockers**

Request a read-only code review of the P2 diff. Fix any Critical or Important findings, then rerun focused tests.

- [x] **Step 5: Inspect diff**

Run:

```powershell
git -c safe.directory=E:/code/nongchang/.worktrees/dashboard-real-data-p1 -C E:\code\nongchang\.worktrees\dashboard-real-data-p1 diff --check
git -c safe.directory=E:/code/nongchang/.worktrees/dashboard-real-data-p1 -C E:\code\nongchang\.worktrees\dashboard-real-data-p1 diff -- packages/web/src/components/Dashboard.tsx packages/web/src/components/Dashboard.truthfulness.spec.tsx docs/superpowers/plans/2026-07-07-dashboard-real-summary-p2.md
```

Expected: no whitespace errors; diff only contains the planned P2 summary, test, and plan.

- [x] **Step 6: Commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang/.worktrees/dashboard-real-data-p1 -C E:\code\nongchang\.worktrees\dashboard-real-data-p1 add docs/superpowers/plans/2026-07-07-dashboard-real-summary-p2.md packages/web/src/components/Dashboard.tsx packages/web/src/components/Dashboard.truthfulness.spec.tsx
git -c safe.directory=E:/code/nongchang/.worktrees/dashboard-real-data-p1 -C E:\code\nongchang\.worktrees\dashboard-real-data-p1 commit -m "feat(web): show real dashboard summary"
```

Expected: commit succeeds on branch `codex/dashboard-real-data-p1`.

---

## Self-Review

- Spec coverage: P2 upgrades the production default dashboard from status copy to real API-backed summary while preserving the P1 demo boundary.
- Placeholder scan: No TBD/TODO/implement-later placeholders are present.
- Type consistency: The plan uses existing frontend API clients and `useApi` return shape consistently; no backend contract changes are required.
