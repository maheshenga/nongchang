# Farm Records Fluent UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Web farm records workspace into the Microsoft/Fluent UI system while preserving real farm-record list, filter, create, complete, gallery, deviation-alert, and toast behavior.

**Architecture:** Keep this as a bounded component refactor of `FarmRecords.tsx`, because the API contract and App navigation already work. Reuse existing Fluent primitives from `packages/web/src/ui/fluent.ts` and shared state components from `packages/web/src/ui/state.tsx`; add one focused component spec to lock behavior and the visual boundary.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, Tailwind utility classes, lucide-react, existing `useApi` hook, existing farm records/batches/phenology API clients.

## Global Constraints

- Use CodeGraph before grep/file discovery because `.codegraph/` exists at the repository root.
- Use `corepack pnpm@10.33.2 ...` for verification commands.
- Use TDD: write the failing test, run it red, implement, then run it green.
- Keep the farm records API contract unchanged: `listFarmRecords(query)`, `createFarmRecord(dto)`, `updateFarmRecordStatus(id, status)`, `listBatches()`, and `listDeviations()` stay unchanged.
- Preserve create payload: `batchId`, batch-derived `fieldId`, `action`, `detail.desc`, `detail.material`, `detail.labor`, `recordedAt`, `source: FarmRecordSource.WEB`, and `status: 'pending'`.
- Preserve status transition: completing a pending record calls `updateFarmRecordStatus(id, 'completed')` and reloads records.
- Preserve server-side filtering: action search and status filter produce `ListFarmRecordsQuery`.
- Preserve deviation alert event dispatch: when alert deviations exist, dispatch `farm-deviation-alert`.
- Do not change backend, database schema, API clients, DTOs, or app navigation in this P1 slice.
- Replace old visual language in `FarmRecords.tsx`: no `slate-`, `emerald-`, `rose-`, `rounded-2xl`, `rounded-xl`, `rounded-lg`, `shadow-xl`, `shadow-2xl`, `bg-emerald`, `hover:bg-emerald`, `text-emerald`, or `focus:ring-emerald`.
- Use existing Fluent helpers: `fluentButton`, `fluentInput`, `fluentSelect`, `fluentStatusTag`, `LoadingState`, `ErrorState`, and `EmptyState`.
- Add accessible labels for toolbar search/status and modal fields.

---

### Task 1: FarmRecords Fluent UI Regression Test

**Files:**
- Create: `packages/web/src/components/FarmRecords.fluent-ui.spec.tsx`
- Read-only reference: `packages/web/src/components/FarmRecords.tsx`
- Read-only reference: `packages/web/src/api/farm-records.ts`
- Read-only reference: `packages/web/src/api/batches.ts`
- Read-only reference: `packages/web/src/api/phenology.ts`

**Interfaces:**
- Consumes: `listFarmRecords(query?: ListFarmRecordsQuery): Promise<FarmRecord[]>`
- Consumes: `createFarmRecord(dto: CreateFarmRecordDto): Promise<FarmRecord>`
- Consumes: `updateFarmRecordStatus(id: string, status: 'pending' | 'completed'): Promise<FarmRecord>`
- Consumes: `listBatches(): Promise<Batch[]>`
- Consumes: `listDeviations(): Promise<BatchDeviation[]>`
- Produces: a component regression spec proving the Fluent UI boundary and behavior-preserving farm-record interactions.

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/components/FarmRecords.fluent-ui.spec.tsx` with this content:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FarmRecordSource } from '@nongchang/shared';
import FarmRecords from './FarmRecords';

const apiMocks = vi.hoisted(() => ({
  listFarmRecords: vi.fn(),
  createFarmRecord: vi.fn(),
  updateFarmRecordStatus: vi.fn(),
  listBatches: vi.fn(),
  listDeviations: vi.fn(),
}));

vi.mock('../api/farm-records', () => ({
  listFarmRecords: apiMocks.listFarmRecords,
  createFarmRecord: apiMocks.createFarmRecord,
  updateFarmRecordStatus: apiMocks.updateFarmRecordStatus,
}));

vi.mock('../api/batches', () => ({ listBatches: apiMocks.listBatches }));
vi.mock('../api/phenology', () => ({ listDeviations: apiMocks.listDeviations }));

const sourcePath = resolve(dirname(fileURLToPath(import.meta.url)), 'FarmRecords.tsx');

const records = [
  {
    id: 'rec-pending',
    tenantId: 'tenant-1',
    batchId: 'batch-1',
    fieldId: 'field-1',
    operatorId: 'operator-abcdef',
    ownerName: '大理基地',
    action: '温室浇水',
    detail: { desc: '完成 A 区滴灌', material: '水 2T', labor: 1 },
    images: [],
    location: null,
    recordedAt: '2026-07-08T08:30:00.000Z',
    source: 'WEB',
    status: 'pending',
    createdAt: '2026-07-08T08:30:00.000Z',
  },
  {
    id: 'rec-done',
    tenantId: 'tenant-1',
    batchId: 'batch-2',
    fieldId: 'field-2',
    operatorId: 'operator-ghijkl',
    ownerName: '上海基地',
    action: '采收质检',
    detail: { desc: '完成 A 级花材抽检', material: '质检表', labor: 2 },
    images: ['https://cdn.example.com/record.jpg'],
    location: null,
    recordedAt: '2026-07-07T10:00:00.000Z',
    source: 'WEB',
    status: 'completed',
    createdAt: '2026-07-07T10:00:00.000Z',
  },
];

const batches = [
  {
    id: 'batch-1',
    tenantId: 'tenant-1',
    ownerId: 'owner-1',
    ownerName: '大理基地',
    fieldId: 'field-1',
    batchNo: 'PA-2026-001',
    cropName: '白芍',
    plantDate: '2026-01-01T00:00:00.000Z',
    expectedHarvest: '2026-09-01T00:00:00.000Z',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    laborCost: 0,
    sellPrice: 0,
    codeCount: 0,
    scanTotal: 0,
    inputCost: 0,
  },
];

describe('FarmRecords Fluent UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.listFarmRecords.mockResolvedValue(records);
    apiMocks.listBatches.mockResolvedValue(batches);
    apiMocks.listDeviations.mockResolvedValue([]);
    apiMocks.createFarmRecord.mockResolvedValue(records[0]);
    apiMocks.updateFarmRecordStatus.mockResolvedValue({ ...records[0], status: 'completed' });
  });

  it('keeps the source inside the Fluent UI boundary', () => {
    const source = readFileSync(sourcePath, 'utf8');
    expect(source).toContain('fluentButton');
    expect(source).toContain('fluentInput');
    expect(source).toContain('fluentSelect');
    expect(source).toContain('LoadingState');
    expect(source).toContain('ErrorState');
    expect(source).toContain('EmptyState');
    expect(source).toContain('fluentStatusTag');
    expect(source).not.toMatch(/slate-|emerald-|rose-|rounded-2xl|rounded-xl|rounded-lg|shadow-xl|shadow-2xl|bg-emerald|hover:bg-emerald|text-emerald|focus:ring-emerald/);
  });

  it('filters records, completes a pending record, and creates a real farm record payload', async () => {
    render(<FarmRecords />);

    expect(await screen.findByText('温室浇水')).toBeTruthy();
    expect(screen.getByText('采收质检')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('按作业类型搜索'), { target: { value: ' 浇水 ' } });
    fireEvent.change(screen.getByLabelText('状态筛选'), { target: { value: 'pending' } });
    fireEvent.click(screen.getByRole('button', { name: '筛选' }));

    await waitFor(() => {
      expect(apiMocks.listFarmRecords).toHaveBeenCalledWith({ action: '浇水', status: 'pending' });
    });

    fireEvent.click(screen.getByRole('button', { name: '标记完成 温室浇水' }));
    await waitFor(() => expect(apiMocks.updateFarmRecordStatus).toHaveBeenCalledWith('rec-pending', 'completed'));

    fireEvent.click(screen.getByRole('button', { name: '快捷农事实录' }));
    fireEvent.change(await screen.findByLabelText('关联批次'), { target: { value: 'batch-1' } });
    fireEvent.change(screen.getByLabelText('作业类型'), { target: { value: ' 施肥 ' } });
    fireEvent.change(screen.getByLabelText('执行描述'), { target: { value: ' 追施有机肥 ' } });
    fireEvent.change(screen.getByLabelText('物料消耗'), { target: { value: ' 有机肥 20kg ' } });
    fireEvent.change(screen.getByLabelText('预估工时'), { target: { value: '2.5' } });
    fireEvent.click(screen.getByRole('button', { name: '保存记录' }));

    await waitFor(() => {
      expect(apiMocks.createFarmRecord).toHaveBeenCalledWith(expect.objectContaining({
        batchId: 'batch-1',
        fieldId: 'field-1',
        action: ' 施肥 ',
        detail: { desc: ' 追施有机肥 ', material: ' 有机肥 20kg ', labor: 2.5 },
        source: FarmRecordSource.WEB,
        status: 'pending',
      }));
    });
    expect(apiMocks.createFarmRecord.mock.calls[0][0].recordedAt).toEqual(expect.any(String));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
corepack pnpm@10.33.2 --filter web exec vitest run src/components/FarmRecords.fluent-ui.spec.tsx
```

Expected: FAIL because `FarmRecords.tsx` still contains old UI tokens and does not import the Fluent helpers/state components; behavior assertions may also fail due missing accessible labels or button names.

### Task 2: Refactor FarmRecords to Fluent UI

**Files:**
- Modify: `packages/web/src/components/FarmRecords.tsx`
- Test: `packages/web/src/components/FarmRecords.fluent-ui.spec.tsx`

**Interfaces:**
- Consumes: existing API clients and `useApi` hook.
- Produces: a Fluent farm records workspace preserving list, filter, create, complete, gallery, alert, and toast behavior.

- [ ] **Step 1: Replace imports and class helpers**

In `FarmRecords.tsx`, import Fluent/state helpers:

```tsx
import { fluentButton, fluentFocus, fluentInput, fluentSelect, fluentStatusTag } from '../ui/fluent';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';
```

Define helper classes:

```tsx
const panelClass = 'border border-[#E1DFDD] bg-white';
const sectionHeaderClass = 'flex min-h-11 items-center justify-between border-b border-[#E1DFDD] bg-[#FAFAFA] px-4 py-3';
const labelClass = 'mb-1 block text-xs font-semibold text-[#605E5C]';
const modalInputClass = `${fluentInput} w-full`;
```

- [ ] **Step 2: Keep business logic unchanged**

Preserve:

```tsx
const fetchRecords = useCallback(() => listFarmRecords(query), [query]);
const { data: rawRecords, loading, error, reload } = useApi<FarmRecord[]>(fetchRecords);
const { data: batches } = useApi(listBatches);
const { data: deviations } = useApi(listDeviations);
```

Preserve `applyFilters`, `handleComplete`, `handleCreateTask`, `pendingTasks`, `completedTasks`, and `galleryTasks` semantics.

- [ ] **Step 3: Replace page shell and toolbar**

Use a Fluent square page shell:

```tsx
<div className="relative flex h-full flex-col overflow-hidden border border-[#E1DFDD] bg-white">
  <div className="flex flex-col gap-3 border-b border-[#E1DFDD] bg-[#FAFAFA] px-5 py-4 xl:flex-row xl:items-start xl:justify-between">
    ...
  </div>
</div>
```

Toolbar requirements:
- Primary button name is exactly `快捷农事实录`.
- Search input label is exactly `按作业类型搜索`.
- Status select label is exactly `状态筛选`.
- Filter button name is exactly `筛选`.
- View buttons use `fluentButton(viewMode === 'list' ? 'primary' : 'secondary')` and `fluentButton(viewMode === 'gallery' ? 'primary' : 'secondary')`.

- [ ] **Step 4: Replace loading, error, and empty states**

Use:

```tsx
{loading && <LoadingState label="加载农事记录" className="w-full" />}
{error && <ErrorState title="农事记录加载失败" message={error} onRetry={() => void reload()} retryLabel="重试" className="w-full" />}
{pendingTasks.length === 0 && <EmptyState title="暂无待完成任务" description="新建农事记录后，待执行事项会出现在这里。" />}
```

Use similar `EmptyState` for completed and gallery empty states.

- [ ] **Step 5: Render list columns with Fluent panels and status tags**

Pending column:
- Header text: `待完成任务`
- Count uses `fluentStatusTag('neutral')`
- Each pending card uses `border border-[#E1DFDD] bg-white p-4`
- Complete button accessible name: `标记完成 ${task.type}`

Completed column:
- Header text: `已完成（已归档）`
- Count uses `fluentStatusTag('success')`
- Cards use subdued Fluent surface, not old opacity/line-through heavy styling.

- [ ] **Step 6: Render gallery with Fluent panel and safe image layout**

Gallery:
- Header text: `农事影像库`
- Use `EmptyState` for no image records.
- Image anchors keep `target="_blank"` and `rel="noopener noreferrer"`.
- Images keep descriptive `alt={`${task.type} 现场照片 ${i + 1}`}`.

- [ ] **Step 7: Refactor create modal**

Modal requirements:
- Shell: `border border-[#E1DFDD] bg-white`, no old rounded/shadow tokens.
- Title id remains `fr-modal-title`.
- Close button `aria-label="关闭"` and class `fluentButton('icon')`.
- Template buttons use `fluentButton('secondary')`.
- Inputs/select/textarea use `fluentInput`/`fluentSelect`.
- Labels keep exact text: `关联批次`, `作业类型`, `执行描述`, `物料消耗`, `预估工时`.
- Submit button text remains `保存记录`.
- Cancel button text remains `取消`.

- [ ] **Step 8: Refactor deviation alert and toast**

Deviation alert:
- Use Fluent danger colors: `border-[#F1B8BD] bg-[#FDE7E9] text-[#A4262C]`
- Close button uses `fluentButton('icon')`.

Toast:
- Use `border border-[#E1DFDD] bg-white text-[#242424]`
- Keep showing message for 3000ms.

- [ ] **Step 9: Run focused green test**

Run:

```bash
corepack pnpm@10.33.2 --filter web exec vitest run src/components/FarmRecords.fluent-ui.spec.tsx
```

Expected: PASS.

### Task 3: Verification, Review, and Commit

**Files:**
- Verify: `packages/web/src/components/FarmRecords.tsx`
- Verify: `packages/web/src/components/FarmRecords.fluent-ui.spec.tsx`
- Verify: `docs/superpowers/plans/2026-07-09-p1-farm-records-fluent-ui.md`

**Interfaces:**
- Consumes: completed Task 1 and Task 2.
- Produces: a reviewed and committed P1 slice.

- [ ] **Step 1: Run broad web verification**

Run:

```bash
corepack pnpm@10.33.2 --filter web lint
corepack pnpm@10.33.2 --filter web test
git -c safe.directory=E:/code/nongchang diff --check
```

Expected: all commands exit 0.

- [ ] **Step 2: Perform local review**

Review the diff:

```bash
git -c safe.directory=E:/code/nongchang diff -- packages/web/src/components/FarmRecords.tsx packages/web/src/components/FarmRecords.fluent-ui.spec.tsx docs/superpowers/plans/2026-07-09-p1-farm-records-fluent-ui.md
```

Checklist:
- `FarmRecords.tsx` no longer contains old visual tokens listed in Global Constraints.
- Existing API behavior is preserved: list, filter, create, complete, reload, alert event, toast.
- No backend/API/schema/navigation changes are present.
- The component remains bounded and does not add new dependencies.

- [ ] **Step 3: Commit**

Run:

```bash
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p1-farm-records-fluent-ui.md packages/web/src/components/FarmRecords.tsx packages/web/src/components/FarmRecords.fluent-ui.spec.tsx
git -c safe.directory=E:/code/nongchang commit -m "refactor(web): align farm records with Fluent UI"
```

Expected: commit succeeds with only the plan, test, and `FarmRecords.tsx` changes.

## Self-Review

- Spec coverage: The plan covers the requested P-first workflow, uses Superpowers planning, requires TDD, preserves farm-record behavior, performs verification, reviews the diff, and commits.
- Placeholder scan: No `TBD`, `TODO`, `implement later`, or incomplete generic testing instructions remain.
- Type consistency: Test mocks use the same `FarmRecord`, `Batch`, `BatchDeviation`, `CreateFarmRecordDto`, `ListFarmRecordsQuery`, and `FarmRecordSource.WEB` shapes consumed by the component and API clients.
