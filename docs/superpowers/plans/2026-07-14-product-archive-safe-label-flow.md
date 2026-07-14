# Product Archive Safe Label Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the product archive's unsafe QR generation and nested mobile layout with the shared confirmed label workspace and responsive product cards.

**Architecture:** Harden `BatchLabelWorkspace` as the single Web debit-intent boundary, then reduce `MerchantAdmin` to a searchable batch coordinator that opens that workspace. Keep backend APIs and idempotency semantics unchanged, and add a 390px Playwright regression that proves confirmation precedes generation.

**Tech Stack:** React 19, TypeScript, TanStack Query, Vitest, Testing Library, Playwright, Tailwind CSS, pnpm 10.33.2

## Global Constraints

- Work only in `E:\code\nongchang\.worktrees\baota-production-launch-p0`.
- Do not change backend trace, billing, authorization, or database code.
- Use `BatchLabelWorkspace` as the only interactive Web component that initiates trace-code generation.
- Default generation quantity is exactly `1`; maximum remains `10_000`.
- Unknown, loading, or failed quota state disables generation.
- Every generation requires an explicit confirmation before `generateCodes` runs.
- Retain the same idempotency key after a failed request and clear it only after success.
- Treat post-generation batch and billing refreshes as non-blocking; refresh failure must not masquerade as generation failure.
- Product archive mobile UI uses cards and page scrolling, not the desktop table or a stacked side-panel scroll region.
- `进入批次管理` is generic navigation and must not claim that selected-batch intent is preserved.
- Use `corepack pnpm@10.33.2` for every pnpm command.
- Follow RED-GREEN-REFACTOR for every behavior change.

---

### Task 1: Harden the shared label workspace quota boundary

**Files:**
- Modify: `packages/web/src/components/batch-admin/BatchLabelWorkspace.spec.tsx`
- Modify: `packages/web/src/components/batch-admin/BatchLabelWorkspace.tsx`
- Modify: `packages/web/src/components/BatchAdmin.tsx`

**Interfaces:**
- Extends `BatchLabelWorkspaceProps` with:
  - `quotaLoading: boolean`
  - `quotaError: string | null`
  - `onRetryQuota(): void`
- Preserves `onGenerate(count: number): Promise<string[]>`
- Preserves `requestConfirmation(action: PendingAction): void`

- [ ] **Step 1: Rewrite the shared-workspace tests for the safe default and quota states**

In `BatchLabelWorkspace.spec.tsx`, replace the existing tests with these six behaviors. Every render must supply the new required quota props, while retaining the existing portal-layer and public batch-identity assertions.

```tsx
it('defaults to one code and asks for confirmation before generation', () => {
  const onGenerate = vi.fn();
  const requestConfirmation = vi.fn();
  render(
    <BatchLabelWorkspace
      batch={batch}
      codeBalance={50}
      quotaLoading={false}
      quotaError={null}
      billingAvailable
      generating={false}
      onGenerate={onGenerate}
      requestConfirmation={requestConfirmation}
      onOpenBilling={vi.fn()}
      onRetryQuota={vi.fn()}
      onClose={vi.fn()}
    />,
  );

  const dialog = screen.getByRole('dialog', { name: '溯源码标签配置' });
  expect(dialog.closest('[data-modal-layer="true"]')?.parentElement).toBe(document.body);
  expect(screen.getByText('B-001')).toBeTruthy();
  expect(screen.getByText('番茄')).toBeTruthy();
  expect(screen.getByText('东区一号田')).toBeTruthy();
  expect(screen.getByText('当前额度 50')).toBeTruthy();
  expect(screen.getByText('本次申请 1')).toBeTruthy();
  expect(screen.getByText('预计剩余 49')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '生成真实溯源码' }));

  expect(requestConfirmation).toHaveBeenCalledWith(expect.objectContaining({
    affectedCount: 1,
    description: expect.stringContaining('生成 1 枚唯一溯源码'),
  }));
  expect(requestConfirmation.mock.calls[0][0].description).toContain('批次 B-001（番茄，东区一号田）');
  expect(requestConfirmation.mock.calls[0][0].description).not.toContain('batch-internal-id');
  expect(onGenerate).not.toHaveBeenCalled();
});

it('blocks generation beyond the known balance', () => {
  const onOpenBilling = vi.fn();
  render(
    <BatchLabelWorkspace
      batch={batch}
      codeBalance={50}
      quotaLoading={false}
      quotaError={null}
      billingAvailable
      generating={false}
      onGenerate={vi.fn()}
      requestConfirmation={vi.fn()}
      onOpenBilling={onOpenBilling}
      onRetryQuota={vi.fn()}
      onClose={vi.fn()}
    />,
  );

  fireEvent.change(screen.getByLabelText('预设批量总数'), { target: { value: '60' } });
  expect(screen.getByText('预计剩余 -10（额度不足）')).toBeTruthy();
  expect((screen.getByRole('button', { name: '生成真实溯源码' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '前往计费中心' }));
  expect(onOpenBilling).toHaveBeenCalledTimes(1);
});

it('blocks generation while quota is loading', () => {
  render(
    <BatchLabelWorkspace
      batch={batch}
      codeBalance={null}
      quotaLoading
      quotaError={null}
      billingAvailable={false}
      generating={false}
      onGenerate={vi.fn()}
      requestConfirmation={vi.fn()}
      onOpenBilling={vi.fn()}
      onRetryQuota={vi.fn()}
      onClose={vi.fn()}
    />,
  );

  expect(screen.getByText('额度加载中')).toBeTruthy();
  expect(screen.getByText('当前额度 加载中')).toBeTruthy();
  expect((screen.getByRole('button', { name: '生成真实溯源码' }) as HTMLButtonElement).disabled).toBe(true);
});

it('shows a retry action when quota loading fails', () => {
  const onRetryQuota = vi.fn();
  render(
    <BatchLabelWorkspace
      batch={batch}
      codeBalance={null}
      quotaLoading={false}
      quotaError="额度余额加载失败"
      billingAvailable={false}
      generating={false}
      onGenerate={vi.fn()}
      requestConfirmation={vi.fn()}
      onOpenBilling={vi.fn()}
      onRetryQuota={onRetryQuota}
      onClose={vi.fn()}
    />,
  );

  expect(screen.getByRole('alert').textContent).toContain('额度余额加载失败');
  expect((screen.getByRole('button', { name: '生成真实溯源码' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '重试额度' }));
  expect(onRetryQuota).toHaveBeenCalledTimes(1);
});

it('blocks generation when quota is unavailable without a known balance', () => {
  const requestConfirmation = vi.fn();
  render(
    <BatchLabelWorkspace
      batch={batch}
      codeBalance={null}
      quotaLoading={false}
      quotaError={null}
      billingAvailable={false}
      generating={false}
      onGenerate={vi.fn()}
      requestConfirmation={requestConfirmation}
      onOpenBilling={vi.fn()}
      onRetryQuota={vi.fn()}
      onClose={vi.fn()}
    />,
  );

  expect(screen.getByText('当前额度 暂不可用')).toBeTruthy();
  expect(screen.getByText('预计剩余 暂不可用')).toBeTruthy();
  expect((screen.getByRole('button', { name: '生成真实溯源码' }) as HTMLButtonElement).disabled).toBe(true);
  expect(requestConfirmation).not.toHaveBeenCalled();
});

it('rejects fractional generation quantities instead of rounding them', () => {
  const requestConfirmation = vi.fn();
  render(
    <BatchLabelWorkspace
      batch={batch}
      codeBalance={50}
      quotaLoading={false}
      quotaError={null}
      billingAvailable={false}
      generating={false}
      onGenerate={vi.fn()}
      requestConfirmation={requestConfirmation}
      onOpenBilling={vi.fn()}
      onRetryQuota={vi.fn()}
      onClose={vi.fn()}
    />,
  );

  fireEvent.change(screen.getByLabelText('预设批量总数'), { target: { value: '1.5' } });
  expect(screen.getByText('生成数量须为 1 到 10000 的整数')).toBeTruthy();
  expect((screen.getByRole('button', { name: '生成真实溯源码' }) as HTMLButtonElement).disabled).toBe(true);
  expect(requestConfirmation).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the shared-workspace test and verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/batch-admin/BatchLabelWorkspace.spec.tsx
```

Expected: TypeScript/render failures report missing quota props, and the safe-default assertion fails because the current amount is `100`.

- [ ] **Step 3: Extend the workspace props and derive fail-closed quota state**

In `BatchLabelWorkspace.tsx`, add the required props and destructuring:

```tsx
export interface BatchLabelWorkspaceProps {
  batch: ViewBatch;
  codeBalance: number | null;
  quotaLoading: boolean;
  quotaError: string | null;
  billingAvailable: boolean;
  generating: boolean;
  onGenerate(count: number): Promise<string[]>;
  requestConfirmation(action: PendingAction): void;
  onOpenBilling(): void;
  onRetryQuota(): void;
  onClose(): void;
}
```

Change the initial amount and quota derivation:

```tsx
const [amount, setAmount] = useState(1);
const valid = Number.isInteger(amount) && amount >= 1 && amount <= MAX_CODES;
const remaining = codeBalance === null ? null : codeBalance - amount;
const quotaExceeded = remaining !== null && remaining < 0;
const quotaUnavailable = quotaLoading || quotaError !== null || codeBalance === null;
const quotaStatus = quotaLoading
  ? '额度加载中'
  : quotaError
    ? '额度加载失败'
    : quotaExceeded
      ? '额度不足'
      : '额度可用';
```

Keep the user's numeric input exact instead of silently rounding a fractional debit request:

```tsx
onChange={event => setAmount(Number(event.target.value))}
```

- [ ] **Step 4: Render loading, failure, retry, and known quota truthfully**

Replace the quota status and facts with:

```tsx
<span className={fluentStatusTag(
  quotaExceeded || quotaError
    ? 'danger'
    : quotaLoading || codeBalance === null
      ? 'neutral'
      : 'success'
)}>
  {quotaStatus}
</span>
```

```tsx
<QuotaFact text={`当前额度 ${quotaLoading ? '加载中' : quotaError ? '加载失败' : codeBalance ?? '暂不可用'}`} />
<QuotaFact text={`本次申请 ${amount}`} />
<QuotaFact
  danger={quotaExceeded}
  text={`预计剩余 ${quotaLoading ? '加载中' : quotaError ? '暂不可用' : remaining === null ? '暂不可用' : `${remaining}${quotaExceeded ? '（额度不足）' : ''}`}`}
/>
```

Render the retry state below the facts:

```tsx
{quotaError && (
  <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 border border-[#F1B8BD] bg-[#FDE7E9] px-3 py-2 text-xs text-[#A4262C]">
    <span>{quotaError}</span>
    <button type="button" onClick={onRetryQuota} className={fluentButton('secondary')}>
      重试额度
    </button>
  </div>
)}
```

Keep the existing insufficient-quota warning. Replace the old null-balance paragraph with:

```tsx
{!quotaLoading && !quotaError && codeBalance === null && (
  <p className="mt-3 text-xs leading-5 text-[#605E5C]">
    暂未取得额度汇总，额度加载完成前不能生成溯源码。
  </p>
)}
```

- [ ] **Step 5: Disable generation whenever quota is unavailable**

Change the generation button condition to:

```tsx
disabled={!valid || quotaUnavailable || quotaExceeded || generating}
```

- [ ] **Step 6: Supply quota state from BatchAdmin**

In the existing `BatchLabelWorkspace` render in `BatchAdmin.tsx`, add:

```tsx
quotaLoading={billing.loading}
quotaError={billing.error}
onRetryQuota={() => void billing.reload()}
```

- [ ] **Step 7: Run the shared-workspace test and verify GREEN**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/batch-admin/BatchLabelWorkspace.spec.tsx
```

Expected: all six quota-boundary tests pass.

- [ ] **Step 8: Commit the shared safety boundary**

Run `git diff --check`, inspect the three planned files, then commit:

```powershell
git add -- packages/web/src/components/batch-admin/BatchLabelWorkspace.tsx packages/web/src/components/batch-admin/BatchLabelWorkspace.spec.tsx packages/web/src/components/BatchAdmin.tsx
git commit -m "fix(web): fail closed before label generation"
```

---

### Task 2: Replace MerchantAdmin direct generation with the shared workspace

**Files:**
- Modify: `packages/web/src/components/MerchantAdmin.actions.spec.tsx`
- Modify: `packages/web/src/components/MerchantAdmin.tsx`
- Modify: `e2e/web/responsive-p0.spec.ts`
- Verify: `packages/web/src/components/MerchantAdmin.fluent-trust.spec.tsx`

**Interfaces:**
- Consumes: `toViewBatch(batch, fieldNames): ViewBatch`
- Consumes: `BatchLabelWorkspace`
- Consumes: `confirmDialog`
- Consumes: `listBatches`, `listFields`, and `getBillingSummary`
- Produces: mobile list `role="list"` with accessible name `产品档案列表`
- Produces: per-batch command `配置溯源标签 <batch code>`

- [ ] **Step 1: Replace MerchantAdmin action tests with the safe-flow contract**

Add field and billing mocks:

```tsx
const listFieldsMock = vi.fn();
const getBillingSummaryMock = vi.fn();

vi.mock('../api/fields', () => ({
  listFields: () => listFieldsMock(),
}));

vi.mock('../api/billing', () => ({
  getBillingSummary: () => getBillingSummaryMock(),
}));
```

Import `DialogHost` and use this renderer:

```tsx
import { DialogHost } from '../hooks/useDialog';

const renderArchive = (onNavigate = vi.fn()) => render(
  <>
    <MerchantAdmin onNavigate={onNavigate} />
    <DialogHost />
  </>,
);
```

Add defaults in `beforeEach`:

```tsx
listFieldsMock.mockResolvedValue([{ id: 'field-1', name: '东区一号田' }]);
getBillingSummaryMock.mockResolvedValue({ aiBalance: 100, codeBalance: 50 });
```

Keep the existing batch-navigation test and replace the direct-generation and print tests with:

```tsx
it('exposes responsive product records with the same safe label command', async () => {
  renderArchive();
  await screen.findAllByText('Peony');

  expect(screen.getByRole('list', { name: '产品档案列表' })).toBeTruthy();
  expect(screen.getByRole('listitem', { name: '产品档案 BATCH-001' })).toBeTruthy();
  expect(screen.getAllByRole('button', { name: '配置溯源标签 BATCH-001' })).toHaveLength(2);
  expect(screen.queryByRole('button', { name: /打印追溯标签/ })).toBeNull();
  expect(generateCodesMock).not.toHaveBeenCalled();
});

it('opens the shared workspace and confirms before generating one code', async () => {
  renderArchive();
  await screen.findAllByText('Peony');

  fireEvent.click(screen.getAllByRole('button', { name: '配置溯源标签 BATCH-001' })[0]);
  expect(screen.getByRole('dialog', { name: '溯源码标签配置' })).toBeTruthy();
  expect(screen.getByText('东区一号田')).toBeTruthy();
  expect(screen.getByText('本次申请 1')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: '生成真实溯源码' }));
  expect(generateCodesMock).not.toHaveBeenCalled();

  const confirmation = await screen.findByRole('dialog', { name: '批量生成并导出溯源标签矩阵' });
  fireEvent.click(within(confirmation).getByRole('button', { name: '确认生成' }));

  await waitFor(() => {
    expect(generateCodesMock).toHaveBeenCalledWith('batch-1', 1, expect.any(String));
  });
  expect(createTraceGenerationRequestKeyMock).toHaveBeenCalledWith('product-archive-label', 'batch-1', 1);
});

it('reuses the product-archive request key after a failed confirmed generation', async () => {
  generateCodesMock
    .mockRejectedValueOnce(new Error('confirm down'))
    .mockResolvedValueOnce([{ code: 'TRACE-001' }]);
  renderArchive();
  await screen.findAllByText('Peony');

  fireEvent.click(screen.getAllByRole('button', { name: '配置溯源标签 BATCH-001' })[0]);
  const generateButton = screen.getByRole('button', { name: '生成真实溯源码' });

  fireEvent.click(generateButton);
  fireEvent.click(within(await screen.findByRole('dialog', { name: '批量生成并导出溯源标签矩阵' })).getByRole('button', { name: '确认生成' }));
  await waitFor(() => expect(generateCodesMock).toHaveBeenCalledTimes(1));

  fireEvent.click(generateButton);
  fireEvent.click(within(await screen.findByRole('dialog', { name: '批量生成并导出溯源标签矩阵' })).getByRole('button', { name: '确认生成' }));
  await waitFor(() => expect(generateCodesMock).toHaveBeenCalledTimes(2));

  expect(generateCodesMock.mock.calls[1][2]).toBe(generateCodesMock.mock.calls[0][2]);
  expect(createTraceGenerationRequestKeyMock).toHaveBeenCalledTimes(1);
});
```

Update Testing Library imports to include `within`.

- [ ] **Step 2: Run MerchantAdmin tests and verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/MerchantAdmin.actions.spec.tsx
```

Expected: failures report the missing product card/list, missing shared workspace, and still-present direct print/generation behavior.

- [ ] **Step 3: Add and run the failing 390px browser regression**

Append this test to `e2e/web/responsive-p0.spec.ts` before changing `MerchantAdmin`:

```ts
test('product archive uses mobile cards and confirms before label generation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let generationRequests = 0;
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().includes('/api/trace/codes/')) generationRequests += 1;
  });

  await loginByApi(page);
  await page.getByRole('button', { name: '打开导航' }).click();
  await page.getByRole('button', { name: '产品档案', exact: true }).click();

  const list = page.getByRole('list', { name: '产品档案列表' });
  await expect(list).toBeVisible();
  const card = list.getByRole('listitem').first();
  await expect(card.getByRole('button', { name: /配置溯源标签/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);

  await card.getByRole('button', { name: /配置溯源标签/ }).click();
  const workspace = page.getByRole('dialog', { name: '溯源码标签配置' });
  await expect(workspace).toBeVisible();
  await expect(workspace.getByLabel('预设批量总数')).toHaveValue('1');

  await workspace.getByRole('button', { name: '生成真实溯源码' }).click();
  const confirmation = page.getByRole('dialog', { name: '批量生成并导出溯源标签矩阵' });
  await expect(confirmation).toBeVisible();
  expect(generationRequests).toBe(0);

  await confirmation.getByRole('button', { name: '取消' }).click();
  await workspace.getByRole('button', { name: '暂缓生成' }).click();
  await expect(workspace).toBeHidden();
  expect(generationRequests).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});
```

Prepare and run with the repository's local demo environment:

```powershell
$env:DATABASE_URL='postgresql://nongchang:nongchang@127.0.0.1:5544/nongchang?schema=public'
$env:JWT_SECRET='browser-test-access-secret'
$env:JWT_REFRESH_SECRET='browser-test-refresh-secret'
$env:APP_ENCRYPTION_KEY=('1' * 64)
$env:E2E_TENANT_CODE='DEMO'
$env:E2E_USERNAME='merchantA'
$env:E2E_PASSWORD='password123'
$env:E2E_BILLING_USERNAME='agentA'
corepack pnpm@10.33.2 test:browser:prepare
corepack pnpm@10.33.2 exec playwright test e2e/web/responsive-p0.spec.ts
```

Expected: the new test fails because `产品档案列表` and the mobile product cards do not exist.

- [ ] **Step 4: Replace MerchantAdmin imports and resource setup**

Use these imports at the top of `MerchantAdmin.tsx`:

```tsx
import { useMemo, useRef, useState } from 'react';
import { Layers, Plus, QrCode, Search } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { confirmDialog } from '../hooks/useDialog';
import { showToast } from '../hooks/useToast';
import { listBatches } from '../api/batches';
import { getBillingSummary } from '../api/billing';
import { listFields } from '../api/fields';
import { createTraceGenerationRequestKey, generateCodes } from '../api/trace';
import type { AppTab } from '../navigation';
import { fluentButton, fluentInput, fluentStatusTag, fluentTable } from '../ui/fluent';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';
import { buildIdentityMap } from '../ui/identity';
import { STATUS_LABEL, statusTone, toViewBatch } from './BatchAdmin.model';
import { BatchLabelWorkspace } from './batch-admin/BatchLabelWorkspace';
import type { PendingAction } from './batch-admin/BatchAnalysisDialogs';
```

At the start of the component, replace crop state with:

```tsx
const batchesApi = useApi(listBatches, { cacheKey: 'batches' });
const fieldsApi = useApi(listFields, { cacheKey: 'fields' });
const billing = useApi(getBillingSummary, { cacheKey: 'billing-summary' });
const fieldNames = useMemo(
  () => buildIdentityMap(fieldsApi.data ?? [], field => field.id, field => field.name),
  [fieldsApi.data],
);
const batches = useMemo(
  () => (batchesApi.data ?? []).map(batch => toViewBatch(batch, fieldNames)),
  [batchesApi.data, fieldNames],
);
const [searchQuery, setSearchQuery] = useState('');
const [labelBatchId, setLabelBatchId] = useState<string | null>(null);
const [generating, setGenerating] = useState(false);
const generationRequestKeys = useRef<Record<string, string>>({});
const filteredBatches = batches.filter(batch =>
  batch.type.toLowerCase().includes(searchQuery.toLowerCase())
  || batch.code.toLowerCase().includes(searchQuery.toLowerCase())
  || batch.id.toLowerCase().includes(searchQuery.toLowerCase())
);
const labelBatch = batches.find(batch => batch.id === labelBatchId);
```

Delete the old `Crop` mapping helpers, selection state, local toast state, QR preview state, direct amount state, direct side-panel generation, and print-preview generation.

- [ ] **Step 5: Add confirmed generation coordination**

Add:

```tsx
const requestConfirmation = (action: PendingAction) => {
  void confirmDialog({
    title: action.title,
    message: action.description,
    confirmLabel: '确认生成',
    cancelLabel: '取消',
    tone: 'danger',
  }).then(confirmed => confirmed ? action.onConfirm() : undefined);
};

const handleGenerateCodes = async (count: number): Promise<string[]> => {
  if (!labelBatchId) return [];
  const operation = `product-archive-label:${labelBatchId}:${count}`;
  generationRequestKeys.current[operation] ??= createTraceGenerationRequestKey(
    'product-archive-label',
    labelBatchId,
    count,
  );
  setGenerating(true);
  try {
    const codes = await generateCodes(labelBatchId, count, generationRequestKeys.current[operation]);
    delete generationRequestKeys.current[operation];
    void Promise.allSettled([batchesApi.reload(), billing.reload()]);
    return codes.map(code => code.code);
  } catch (error) {
    showToast(error instanceof Error ? `生成真实溯源码失败:${error.message}` : '生成真实溯源码失败');
    return [];
  } finally {
    setGenerating(false);
  }
};
```

- [ ] **Step 6: Render one desktop table and one mobile card list**

Use a root `div` without `h-full` or nested list scrolling:

```tsx
<div className="flex min-w-0 flex-col gap-4">
```

Render the search, batch navigation, resource states, and desktop table exactly as follows:

```tsx
<header className="flex flex-col gap-3 border border-[#E1DFDD] bg-[#FAFAFA] p-4 md:flex-row md:items-center md:justify-between">
  <div className="relative min-w-0 md:w-80">
    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#605E5C]" />
    <input
      type="search"
      aria-label="搜索批次或作物名称"
      placeholder="搜索批次或作物名称..."
      value={searchQuery}
      onChange={event => setSearchQuery(event.target.value)}
      className={`${fluentInput} w-full pl-8`}
    />
  </div>
  <button type="button" onClick={() => onNavigate?.('batches')} className={fluentButton('primary')}>
    <Plus className="h-4 w-4" /> 新增生产批次
  </button>
</header>

{batchesApi.loading && <LoadingState label="加载批次档案" />}
{batchesApi.error && <ErrorState message={batchesApi.error} onRetry={() => void batchesApi.reload()} />}
{!batchesApi.loading && !batchesApi.error && filteredBatches.length === 0 && (
  <EmptyState title="暂无批次档案" description="请先在批次管理中创建生产批次。" />
)}

{!batchesApi.loading && !batchesApi.error && filteredBatches.length > 0 && (
  <div className="hidden md:block">
    <div className={fluentTable.wrapper}>
      <table className={`${fluentTable.table} min-w-[760px]`}>
        <thead className={fluentTable.thead}>
          <tr>
            <th className={fluentTable.th}>产品</th>
            <th className={fluentTable.th}>批次号</th>
            <th className={fluentTable.th}>生命周期</th>
            <th className={`${fluentTable.th} text-right`}>已生成</th>
            <th className={`${fluentTable.th} text-right`}>操作</th>
          </tr>
        </thead>
        <tbody>
          {filteredBatches.map(batch => (
            <tr key={batch.id} className={fluentTable.row}>
              <td className={`${fluentTable.td} font-semibold text-[#242424]`}>{batch.type}</td>
              <td className={`${fluentTable.td} font-mono text-xs text-[#605E5C]`}>{batch.code}</td>
              <td className={fluentTable.td}>
                <span className={fluentStatusTag(statusTone(batch.stage))}>
                  {STATUS_LABEL[batch.stage] ?? batch.stage}
                </span>
              </td>
              <td className={`${fluentTable.td} text-right font-mono font-semibold`}>{batch.generated}</td>
              <td className={`${fluentTable.td} text-right`}>
                <div className="inline-flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`配置溯源标签 ${batch.code}`}
                    onClick={() => setLabelBatchId(batch.id)}
                    className={fluentButton('primary')}
                  >
                    <QrCode className="h-4 w-4" /> 配置溯源标签
                  </button>
                  <button
                    type="button"
                    aria-label={`进入批次管理 ${batch.code}`}
                    onClick={() => onNavigate?.('batches')}
                    className={fluentButton('secondary')}
                  >
                    <Layers className="h-4 w-4" /> 进入批次管理
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
)}
```

Do not retain a second side panel, multi-select checkbox, or print action. The desktop row commands above are the complete action set.

Render the mobile list only when the same successful non-empty condition is true:

```tsx
{!batchesApi.loading && !batchesApi.error && filteredBatches.length > 0 && (
  <div role="list" aria-label="产品档案列表" className="grid gap-3 md:hidden">
    {filteredBatches.map(batch => (
      <article
        key={batch.id}
        role="listitem"
        aria-label={`产品档案 ${batch.code}`}
        className="border border-[#E1DFDD] bg-white p-4"
      >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-[#242424]">{batch.type}</div>
          <div className="mt-1 font-mono text-xs text-[#605E5C]">{batch.code}</div>
        </div>
        <span className={fluentStatusTag(statusTone(batch.stage))}>
          {STATUS_LABEL[batch.stage] ?? batch.stage}
        </span>
      </div>
      <div className="mt-3 border border-[#E1DFDD] bg-[#FAFAFA] px-3 py-2 text-sm text-[#605E5C]">
        已生成 <span className="font-mono font-semibold text-[#242424]">{batch.generated}</span> 枚溯源码
      </div>
      <div className="mt-3 grid gap-2">
        <button type="button" aria-label={`配置溯源标签 ${batch.code}`} onClick={() => setLabelBatchId(batch.id)} className={`${fluentButton('primary')} w-full`}>
          <QrCode className="h-4 w-4" /> 配置溯源标签
        </button>
        <button type="button" aria-label={`进入批次管理 ${batch.code}`} onClick={() => onNavigate?.('batches')} className={`${fluentButton('secondary')} w-full`}>
          <Layers className="h-4 w-4" /> 进入批次管理
        </button>
      </div>
      </article>
    ))}
  </div>
)}
```

- [ ] **Step 7: Render the shared workspace**

After the list, render:

```tsx
{labelBatch && (
  <BatchLabelWorkspace
    batch={labelBatch}
    codeBalance={billing.data?.codeBalance ?? null}
    quotaLoading={billing.loading}
    quotaError={billing.error}
    billingAvailable={false}
    generating={generating}
    onGenerate={handleGenerateCodes}
    requestConfirmation={requestConfirmation}
    onOpenBilling={() => undefined}
    onRetryQuota={() => void billing.reload()}
    onClose={() => setLabelBatchId(null)}
  />
)}
```

- [ ] **Step 8: Run MerchantAdmin tests and verify GREEN**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/MerchantAdmin.actions.spec.tsx src/components/MerchantAdmin.fluent-trust.spec.tsx
```

Expected: safe-flow actions, confirmation, retry-key reuse, and Fluent trust tests pass.

- [ ] **Step 9: Commit the product archive refactor and browser test**

Run `git diff --check`, inspect only the planned component and tests, then commit:

```powershell
git add -- packages/web/src/components/MerchantAdmin.tsx packages/web/src/components/MerchantAdmin.actions.spec.tsx e2e/web/responsive-p0.spec.ts
git commit -m "fix(web): unify product archive label generation"
```

---

### Task 3: Verify the 390px product archive regression and Web gates

**Files:**
- Verify: `e2e/web/responsive-p0.spec.ts`

**Interfaces:**
- Consumes: seeded merchant account through `loginByApi`
- Observes: POST requests whose URL contains `/api/trace/codes/`
- Produces: regression proof for mobile cards, horizontal overflow, modal closure, and pre-debit confirmation

- [ ] **Step 1: Run the responsive test and verify GREEN**

Use the exact local demo environment from Task 2 Step 3 and run:

```powershell
corepack pnpm@10.33.2 exec playwright test e2e/web/responsive-p0.spec.ts
```

Expected: all three responsive P0 tests pass and no trace-code POST occurs before confirmation.

- [ ] **Step 2: Run complete Web verification**

Run:

```powershell
corepack pnpm@10.33.2 --filter web lint
corepack pnpm@10.33.2 --filter web test
corepack pnpm@10.33.2 --filter web build
```

Expected: every command exits zero.

- [ ] **Step 3: Confirm no uncommitted regression changes remain**

Run `git diff --check` and `git status --short`.

Expected: the worktree is clean because the browser regression was committed with Task 2.

---

### Task 4: Final diff and targeted verification audit

**Files:**
- Verify only; no planned production changes

- [ ] **Step 1: Confirm worktree scope**

Run:

```powershell
git status --short
git log -6 --oneline
git diff --check HEAD~3..HEAD
```

Expected: clean worktree and exactly the shared workspace, product archive, tests, design, and plan commits from this subproject plus the earlier approved role-UI commits.

- [ ] **Step 2: Record verification evidence**

Report exact counts from focused tests, full Web tests, build, and Playwright. Do not claim production-server verification or miniapp coverage from this subproject.
