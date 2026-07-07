# BatchAdmin Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the maintenance risk in the 108KB `BatchAdmin.tsx` page by extracting stable batch model/filter/export helpers into a focused, tested module without changing user-visible behavior.

**Architecture:** Keep the rendered BatchAdmin UI intact for this slice, but move pure transformation and calculation logic into `BatchAdmin.model.ts`. The component will remain the owner of API calls, modals, generated-code state, and event handlers, while the new model module owns `ViewBatch`, status labeling, filtering, pagination, margin calculation, export row construction, and status tone mapping.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Vitest 2, `@nongchang/shared` batch status types, existing `web` package scripts.

## Global Constraints

- Use CodeGraph before grep/file search for code discovery because `.codegraph/` exists and `AGENTS.md` requires it.
- Use TDD: write the failing test, verify RED, then write production code.
- Do not change BatchAdmin user-visible behavior in this slice.
- Do not introduce new dependencies.
- Keep edits scoped to `packages/web/src/components/BatchAdmin*` and this plan file.
- Preserve Microsoft Fluent UI alignment already present in `BatchAdmin.tsx`.
- Use UTF-8 without BOM for newly written files.
- Run focused tests, `web lint`, `web test`, `web build`, and `git diff --check` before commit.

---

## File Structure

- Create: `packages/web/src/components/BatchAdmin.model.ts`
  - Owns pure batch display helpers and exported types.
  - Exports `PAGE_SIZE`, `STATUS_LABEL`, `ViewBatch`, `BatchFilterState`, `BatchExportRow`, `toViewBatch`, `filterBatches`, `paginateBatches`, `marginText`, `calculateMargin`, `statusTone`, and `toBatchExportRows`.
- Create: `packages/web/src/components/BatchAdmin.model.spec.ts`
  - Unit tests for model conversion, filter behavior, pagination, status tone, and CSV export row generation.
- Modify: `packages/web/src/components/BatchAdmin.tsx`
  - Remove local duplicate pure helpers and import them from `BatchAdmin.model.ts`.
  - Keep API state, modal state, and rendering behavior in place.
- Existing regression tests:
  - `packages/web/src/components/BatchAdmin.spec.tsx`
  - Continue to prove the rendered command bar, table columns, and visible filtering still work.

---

### Task 1: Extract Tested Batch Model Helpers

**Files:**
- Create: `packages/web/src/components/BatchAdmin.model.spec.ts`
- Create: `packages/web/src/components/BatchAdmin.model.ts`

**Interfaces:**
- Consumes: `Batch` from `packages/web/src/api/batches.ts` and `BatchStatus` from `@nongchang/shared`.
- Produces:
  - `export const PAGE_SIZE = 10`
  - `export interface ViewBatch { id: string; code: string; type: string; date: string; house: string; owner: string; stage: string; color: string; inputCost: number; laborCost: number; sellPrice: number; generated: number; scanTotal: number }`
  - `export interface BatchFilterState { searchCode: string; filterType: string; filterHouse: string; filterDateRange: string }`
  - `export type BatchExportRow = Array<string | number>`
  - `export function toViewBatch(batch: Batch): ViewBatch`
  - `export function filterBatches(batches: ViewBatch[], filters: BatchFilterState): ViewBatch[]`
  - `export function paginateBatches(batches: ViewBatch[], page: number, pageSize?: number): ViewBatch[]`
  - `export function marginText(input: number, labor: number, sell: number): string`
  - `export function calculateMargin(input: number, labor: number, sell: number): { margin: number; text: string; expectedSell: number }`
  - `export function statusTone(stage: string): 'active' | 'success' | 'warning' | 'neutral' | 'danger'`
  - `export function toBatchExportRows(batches: ViewBatch[]): BatchExportRow[]`

- [ ] **Step 1: Write the failing model test**

Create `packages/web/src/components/BatchAdmin.model.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { BatchStatus } from '@nongchang/shared';
import {
  PAGE_SIZE,
  calculateMargin,
  filterBatches,
  marginText,
  paginateBatches,
  statusTone,
  toBatchExportRows,
  toViewBatch,
  type ViewBatch,
} from './BatchAdmin.model';
import type { Batch } from '../api/batches';

const rawBatch = (overrides: Partial<Batch> = {}): Batch => ({
  id: 'batch-1',
  tenantId: 'tenant-1',
  ownerId: 'owner-1',
  ownerName: null,
  fieldId: 'field-alpha-001',
  batchNo: 'B20240520001',
  cropName: '阳光玫瑰',
  plantDate: '2024-05-20T09:15:00.000Z',
  expectedHarvest: '2024-07-01T00:00:00.000Z',
  status: BatchStatus.GROWING,
  createdAt: '2024-05-20T09:15:00.000Z',
  laborCost: 1200,
  sellPrice: 5000,
  codeCount: 10000,
  scanTotal: 2345,
  inputCost: 800,
  ...overrides,
});

const viewBatch = (overrides: Partial<ViewBatch> = {}): ViewBatch => ({
  id: 'batch-1',
  code: 'B20240520001',
  type: '阳光玫瑰',
  date: '2024-05-20',
  house: 'field-al',
  owner: '张三农场',
  stage: BatchStatus.GROWING,
  color: 'emerald',
  inputCost: 800,
  laborCost: 1200,
  sellPrice: 5000,
  generated: 10000,
  scanTotal: 2345,
  ...overrides,
});

describe('BatchAdmin model helpers', () => {
  it('maps API batches into the exact view model consumed by the table', () => {
    expect(toViewBatch(rawBatch())).toEqual({
      id: 'batch-1',
      code: 'B20240520001',
      type: '阳光玫瑰',
      date: '2024-05-20',
      house: 'field-al',
      owner: '—',
      stage: BatchStatus.GROWING,
      color: 'emerald',
      inputCost: 800,
      laborCost: 1200,
      sellPrice: 5000,
      generated: 10000,
      scanTotal: 2345,
    });
  });

  it('filters by batch code case-insensitively plus type, field short code, and year', () => {
    const batches = [
      viewBatch({ id: 'batch-1', code: 'B20240520001', type: '阳光玫瑰', house: 'field-al', date: '2024-05-20' }),
      viewBatch({ id: 'batch-2', code: 'B20230518003', type: '美早', house: 'field-br', date: '2023-05-18' }),
      viewBatch({ id: 'batch-3', code: 'C20240518003', type: '美早', house: 'field-al', date: '2024-05-18' }),
    ];

    expect(filterBatches(batches, {
      searchCode: 'b2024',
      filterType: '阳光',
      filterHouse: 'field-al',
      filterDateRange: '2024',
    }).map((batch) => batch.id)).toEqual(['batch-1']);
  });

  it('paginates with the BatchAdmin page size and keeps empty pages stable', () => {
    const batches = Array.from({ length: PAGE_SIZE + 2 }, (_, index) => viewBatch({ id: `batch-${index + 1}` }));

    expect(paginateBatches(batches, 1).map((batch) => batch.id)).toHaveLength(PAGE_SIZE);
    expect(paginateBatches(batches, 2).map((batch) => batch.id)).toEqual(['batch-11', 'batch-12']);
    expect(paginateBatches(batches, 9)).toEqual([]);
  });

  it('calculates margin copy for sold and unsold batches', () => {
    expect(marginText(800, 1200, 5000)).toBe('60.0%');
    expect(calculateMargin(800, 1200, 5000)).toEqual({ margin: 60, text: '60.0%', expectedSell: 5000 });
    expect(marginText(800, 1200, 0)).toBe('待分销预测');
    expect(calculateMargin(800, 1200, 0)).toEqual({ margin: 0, text: '待分销预测', expectedSell: 3000 });
  });

  it('maps known batch stages to Fluent status tones', () => {
    expect(statusTone(BatchStatus.GROWING)).toBe('active');
    expect(statusTone(BatchStatus.PLANTING)).toBe('active');
    expect(statusTone(BatchStatus.HARVESTED)).toBe('success');
    expect(statusTone(BatchStatus.DISTRIBUTED)).toBe('success');
    expect(statusTone('future-stage')).toBe('neutral');
  });

  it('builds CSV export rows with the existing column order', () => {
    expect(toBatchExportRows([viewBatch()])).toEqual([[
      'B20240520001',
      '阳光玫瑰',
      '2024-05-20',
      'field-al',
      '张三农场',
      BatchStatus.GROWING,
      10000,
      2345,
      800,
      1200,
      5000,
      '60.0%',
    ]]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm@10.33.2 --filter web exec vitest run src/components/BatchAdmin.model.spec.ts`

Expected: FAIL because `./BatchAdmin.model` does not exist yet.

- [ ] **Step 3: Write minimal model implementation**

Create `packages/web/src/components/BatchAdmin.model.ts`:

```typescript
import { BatchStatus } from '@nongchang/shared';
import type { Batch } from '../api/batches';

export interface ViewBatch {
  id: string;
  code: string;
  type: string;
  date: string;
  house: string;
  owner: string;
  stage: string;
  color: string;
  inputCost: number;
  laborCost: number;
  sellPrice: number;
  generated: number;
  scanTotal: number;
}

export interface BatchFilterState {
  searchCode: string;
  filterType: string;
  filterHouse: string;
  filterDateRange: string;
}

export type BatchExportRow = Array<string | number>;
export type BatchStatusTone = 'active' | 'success' | 'warning' | 'neutral' | 'danger';

export const PAGE_SIZE = 10;

const STATUS_COLOR: Record<string, string> = {
  [BatchStatus.PLANTING]: 'cyan',
  [BatchStatus.GROWING]: 'emerald',
  [BatchStatus.HARVESTED]: 'amber',
  [BatchStatus.DISTRIBUTED]: 'indigo',
};

export const STATUS_LABEL: Record<string, string> = {
  [BatchStatus.PLANTING]: '种植中',
  [BatchStatus.GROWING]: '生长中',
  [BatchStatus.HARVESTED]: '已收获',
  [BatchStatus.DISTRIBUTED]: '已分销',
};

export function toViewBatch(batch: Batch): ViewBatch {
  return {
    id: batch.id,
    code: batch.batchNo,
    type: batch.cropName,
    date: batch.plantDate.slice(0, 10),
    house: batch.fieldId.slice(0, 8),
    owner: batch.ownerName ?? '—',
    stage: batch.status,
    color: STATUS_COLOR[batch.status] ?? 'slate',
    inputCost: batch.inputCost,
    laborCost: batch.laborCost,
    sellPrice: batch.sellPrice,
    generated: batch.codeCount,
    scanTotal: batch.scanTotal,
  };
}

export function filterBatches(batches: ViewBatch[], filters: BatchFilterState): ViewBatch[] {
  return batches.filter((batch) => {
    const matchCode = filters.searchCode
      ? batch.code.toLowerCase().includes(filters.searchCode.toLowerCase())
      : true;
    const matchType = filters.filterType === 'all' ? true : batch.type.includes(filters.filterType);
    const matchHouse = filters.filterHouse === 'all' ? true : batch.house.includes(filters.filterHouse);
    let matchDate = true;
    if (filters.filterDateRange === '2024') matchDate = batch.date.startsWith('2024');
    if (filters.filterDateRange === '2023') matchDate = batch.date.startsWith('2023');
    return matchCode && matchType && matchHouse && matchDate;
  });
}

export function paginateBatches(batches: ViewBatch[], page: number, pageSize = PAGE_SIZE): ViewBatch[] {
  return batches.slice((page - 1) * pageSize, page * pageSize);
}

export function marginText(input: number, labor: number, sell: number): string {
  if (sell === 0) return '待分销预测';
  return `${(((sell - (input + labor)) / sell) * 100).toFixed(1)}%`;
}

export function calculateMargin(input: number, labor: number, sell: number): { margin: number; text: string; expectedSell: number } {
  const totalCost = input + labor;
  if (sell === 0) return { margin: 0, text: '待分销预测', expectedSell: totalCost * 1.5 };
  const margin = ((sell - totalCost) / sell) * 100;
  return { margin, text: `${margin.toFixed(1)}%`, expectedSell: sell };
}

export function statusTone(stage: string): BatchStatusTone {
  if (stage === BatchStatus.HARVESTED || stage === BatchStatus.DISTRIBUTED) return 'success';
  if (stage === BatchStatus.GROWING || stage === BatchStatus.PLANTING) return 'active';
  return 'neutral';
}

export function toBatchExportRows(batches: ViewBatch[]): BatchExportRow[] {
  return batches.map((batch) => [
    batch.code,
    batch.type,
    batch.date,
    batch.house,
    batch.owner,
    batch.stage,
    batch.generated,
    batch.scanTotal,
    batch.inputCost,
    batch.laborCost,
    batch.sellPrice,
    marginText(batch.inputCost, batch.laborCost, batch.sellPrice),
  ]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm@10.33.2 --filter web exec vitest run src/components/BatchAdmin.model.spec.ts`

Expected: PASS with 6 tests.

---

### Task 2: Wire BatchAdmin to the Model Module

**Files:**
- Modify: `packages/web/src/components/BatchAdmin.tsx`
- Test: `packages/web/src/components/BatchAdmin.spec.tsx`
- Test: `packages/web/src/components/BatchAdmin.model.spec.ts`

**Interfaces:**
- Consumes the exports created in Task 1.
- Produces unchanged rendered BatchAdmin behavior and lower local component responsibility.

- [ ] **Step 1: Write the failing source-boundary test**

Add this test to `packages/web/src/components/BatchAdmin.model.spec.ts`:

```typescript
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

it('keeps BatchAdmin pure batch helpers outside the rendered component file', () => {
  const source = readFileSync(resolve(__dirname, 'BatchAdmin.tsx'), 'utf8');

  expect(source).toContain("from './BatchAdmin.model'");
  expect(source).not.toContain('function toViewBatch');
  expect(source).not.toContain('const STATUS_LABEL');
  expect(source).not.toContain('const PAGE_SIZE = 10');
  expect(source).not.toContain('const marginText =');
  expect(source).not.toContain('const calculateMargin =');
  expect(source).not.toContain('const statusTone =');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm@10.33.2 --filter web exec vitest run src/components/BatchAdmin.model.spec.ts`

Expected: FAIL because `BatchAdmin.tsx` still defines local helpers and does not import `BatchAdmin.model`.

- [ ] **Step 3: Replace local helpers with imports**

Modify `packages/web/src/components/BatchAdmin.tsx`:

```typescript
import { type CreateBatchDto } from '@nongchang/shared';
import {
  PAGE_SIZE,
  STATUS_LABEL,
  calculateMargin,
  filterBatches,
  paginateBatches,
  statusTone,
  toBatchExportRows,
  toViewBatch,
  type ViewBatch,
} from './BatchAdmin.model';
```

Remove local definitions for:
- `interface ViewBatch`
- `STATUS_COLOR`
- `STATUS_LABEL`
- `PAGE_SIZE`
- `toViewBatch`
- local `marginText`
- local `calculateMargin`
- local `statusTone`

Update computed data:

```typescript
const filteredData = useMemo(
  () => filterBatches(batches, { searchCode, filterType, filterHouse, filterDateRange }),
  [searchCode, filterType, filterHouse, filterDateRange, batches],
);

const pagedData = useMemo(
  () => paginateBatches(filteredData, page, PAGE_SIZE),
  [filteredData, page],
);
```

Update Excel rows:

```typescript
const rows = toBatchExportRows(targets);
```

Keep the existing `header` array unchanged.

- [ ] **Step 4: Run focused tests**

Run: `corepack pnpm@10.33.2 --filter web exec vitest run src/components/BatchAdmin.model.spec.ts src/components/BatchAdmin.spec.tsx`

Expected: PASS. The model tests prove helper behavior; the existing component tests prove the command bar/table/filter still render.

---

### Task 3: Verify, Review, and Commit P1

**Files:**
- Review all modified files from `git diff --stat` and `git diff --check`.

**Interfaces:**
- Consumes: Task 1 and Task 2 outputs.
- Produces: a clean commit for P1.

- [ ] **Step 1: Run static validation**

Run: `corepack pnpm@10.33.2 --filter web lint`

Expected: PASS.

- [ ] **Step 2: Run all web tests**

Run: `corepack pnpm@10.33.2 --filter web test`

Expected: PASS.

- [ ] **Step 3: Run production build**

Run: `corepack pnpm@10.33.2 --filter web build`

Expected: PASS. The existing `DashboardDemo` chunk-size warning may still appear; it is not part of this P1 slice.

- [ ] **Step 4: Run source residue checks**

Run: `rg -n "function toViewBatch|const STATUS_LABEL|const PAGE_SIZE = 10|const marginText =|const calculateMargin =|const statusTone =" packages/web/src/components/BatchAdmin.tsx`

Expected: no matches.

Run: `node -e "const fs=require('fs'); for (const f of ['packages/web/src/components/BatchAdmin.model.ts','packages/web/src/components/BatchAdmin.model.spec.ts','packages/web/src/components/BatchAdmin.tsx']) { const b=fs.readFileSync(f); const s=b.toString('utf8'); console.log(f, {bom:b[0]===0xef&&b[1]===0xbb&&b[2]===0xbf, hasReplacement:s.includes('\\uFFFD')}); }"`

Expected: each file reports `{ bom: false, hasReplacement: false }`.

Run: `git -c safe.directory=E:/code/nongchang diff --check`

Expected: no whitespace errors.

- [ ] **Step 5: Review the change**

Check:
- `BatchAdmin.model.ts` contains only pure helpers.
- `BatchAdmin.tsx` still owns UI state and API side effects.
- CSV export column order is unchanged.
- No rendered copy or operation names changed.
- Focused and full tests passed after the final edits.

- [ ] **Step 6: Commit**

Run:

```bash
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-08-p1-batch-admin-boundaries.md packages/web/src/components/BatchAdmin.model.ts packages/web/src/components/BatchAdmin.model.spec.ts packages/web/src/components/BatchAdmin.tsx
git -c safe.directory=E:/code/nongchang commit -m "refactor(web): extract BatchAdmin model helpers"
```

Expected: commit succeeds.

---

## Self-Review

**Spec coverage:** This plan addresses the highest-priority maintainability risk from the SaaS UI audit by extracting stable pure logic out of the oversized `BatchAdmin.tsx` component. It intentionally does not change modal, print, QR generation, or API side-effect behavior in this P1 slice.

**Placeholder scan:** The plan contains concrete file paths, exports, tests, commands, and expected results. No `TBD`, `TODO`, or unspecified test steps are used.

**Type consistency:** The exported names used by Task 2 match the exact names produced in Task 1. `BatchStatusTone` matches the accepted tone values used by `fluentStatusTag`.

## Execution Choice

Subagent tools are not exposed in this Codex App session, so this plan will be executed inline using `executing-plans` with TDD checkpoints and review gates.
