# MerchantAdmin Fluent Trust Boundary P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the routed merchant trace-code management surface into the Microsoft Fluent SaaS console system while preserving real batch loading, trace-code generation, retry idempotency, and print-preview behavior.

**Architecture:** Keep this as a web-only UI and test-integrity slice. `MerchantAdmin.tsx` remains the owner of batch list adaptation, selected-batch state, trace-code generation, toast feedback, and print preview. Tests move away from CSS-token selectors toward accessible role/name queries, then a source-boundary test prevents legacy emerald/slate card styling and unsupported trust claims from returning.

**Tech Stack:** React 19, Vite, TypeScript, Vitest, Testing Library, qrcode.react, lucide-react, existing `packages/web/src/ui/fluent.ts`, existing `packages/web/src/ui/state.tsx`, and existing API wrappers `listBatches`, `generateCodes`, and `createTraceGenerationRequestKey`.

## Global Constraints

- Use CodeGraph before file-level discovery because `.codegraph/` exists.
- Use TDD: add or update failing tests first, verify RED, then change production code.
- Do not change backend APIs, shared DTOs, trace-code generation API contracts, billing semantics, route names, role navigation, or print-launch behavior.
- Preserve these real flows exactly:
  - `listBatches()` loads batches and maps them to the local crop presentation model.
  - "新增芍药繁育生产批次" calls `onNavigate?.('batches')`.
  - side-panel generation calls `generateCodes(activeCrop.id, qrAmount, requestKey)`.
  - failed generation retries reuse the same request key until success.
  - print preview generates one real trace code per selected batch and shows the generated code in the label.
- Replace CSS-token test selectors with accessible role/name queries before changing production styling.
- `MerchantAdmin.tsx` must import shared Fluent helpers and state helpers.
- Touched production source must not contain legacy visual tokens: `rounded-xl`, `rounded-2xl`, `bg-emerald`, `hover:bg-emerald`, `border-slate`, `text-slate`, `bg-slate`, `shadow-xl`, `shadow-2xl`, `bg-gradient-to-r`, `shadow-emerald`.
- Touched production copy must not claim unsupported certification, cryptographic, geographic-indication, or global uniqueness capabilities.
- Run focused tests, `web lint`, web tests, residue scan, and `git diff --check` before commit.

---

## File Structure

- Create: `packages/web/src/components/MerchantAdmin.fluent-trust.spec.tsx`
  - Source-level Fluent/no-legacy/no-overclaim boundary for `MerchantAdmin.tsx`.
- Modify: `packages/web/src/components/MerchantAdmin.actions.spec.tsx`
  - Replace class-name selector helpers with role/name helpers.
  - Keep existing behavior coverage for navigation, generation, retry idempotency, invalid amount blocking, unavailable actions, and print preview.
- Modify: `packages/web/src/components/MerchantAdmin.tsx`
  - Import `fluentButton`, `fluentInput`, `fluentStatusTag`, and `fluentTable`.
  - Import `EmptyState`, `ErrorState`, and `LoadingState`.
  - Convert the list panel, side panel, toast, and print preview to Fluent-compatible surfaces.
  - Preserve all API calls and state transitions.
- Create: `docs/superpowers/plans/2026-07-09-p1-merchant-admin-fluent-trust-boundary.md`
  - Tracks this P1 execution.

---

### Task 1: Add MerchantAdmin Fluent Boundary Tests

**Files:**
- Create: `packages/web/src/components/MerchantAdmin.fluent-trust.spec.tsx`
- Modify later: `packages/web/src/components/MerchantAdmin.tsx`

**Interfaces:**
- Consumes: `MerchantAdmin.tsx` source text.
- Produces: a regression boundary requiring shared Fluent helpers and rejecting old green/card-heavy UI tokens and unsupported trust claims.

- [x] **Step 1: Write the failing source-boundary test**

Create `packages/web/src/components/MerchantAdmin.fluent-trust.spec.tsx`:

```typescript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = () => readFileSync(join(process.cwd(), 'src/components/MerchantAdmin.tsx'), 'utf8');

const legacyTokens = [
  'rounded-xl',
  'rounded-2xl',
  'bg-emerald',
  'hover:bg-emerald',
  'border-slate',
  'text-slate',
  'bg-slate',
  'shadow-xl',
  'shadow-2xl',
  'bg-gradient-to-r',
  'shadow-emerald',
];

const unsupportedClaims = [
  '权威质检',
  'PASSED',
  'zero-knowledge',
  'OAUTH',
  '地理标志',
  '全网唯一',
  '加密证明能力',
];

describe('MerchantAdmin Fluent trust boundary', () => {
  it('uses shared Fluent primitives and avoids legacy styling or unsupported trace-label claims', () => {
    const text = source();

    expect(text).toContain("from '../ui/fluent'");
    expect(text).toContain("from '../ui/state'");
    expect(text).toMatch(/fluent(Button|Input|StatusTag|Table)/);
    expect(text).toMatch(/(LoadingState|EmptyState|ErrorState)/);

    for (const token of legacyTokens) expect(text).not.toContain(token);
    for (const claim of unsupportedClaims) expect(text).not.toContain(claim);
  });
});
```

- [x] **Step 2: Verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/MerchantAdmin.fluent-trust.spec.tsx
```

Expected: FAIL because `MerchantAdmin.tsx` does not import shared Fluent/state helpers and still contains legacy emerald/slate/rounded card tokens.

---

### Task 2: Make MerchantAdmin Behavior Tests Semantic

**Files:**
- Modify: `packages/web/src/components/MerchantAdmin.actions.spec.tsx`

**Interfaces:**
- Consumes: existing mocked `listBatches`, `generateCodes`, and `createTraceGenerationRequestKey`.
- Produces: behavior tests that survive the Fluent class-name refactor.

- [x] **Step 1: Replace CSS-token button helpers**

Remove `getCreateBatchButton` and `getSidePanelGenerateButton`. Use accessible role/name queries in each test:

```typescript
const createBatchButton = screen.getByRole('button', { name: /新增芍药繁育生产批次/ });
const generateButton = screen.getByRole('button', { name: /^生成溯源码$/ });
```

For the print preview command:

```typescript
fireEvent.click(screen.getByRole('button', { name: /打印追溯标签/ }));
```

- [x] **Step 2: Keep behavior assertions unchanged**

Keep these expectations:

```typescript
expect(onNavigate).toHaveBeenCalledWith('batches');
expect(generateCodesMock).toHaveBeenCalledWith('batch-1', 5, expect.any(String));
expect(generateCodesMock.mock.calls[1][2]).toBe(generateCodesMock.mock.calls[0][2]);
expect(generateCodesMock).not.toHaveBeenCalled();
expect(generateCodesMock).toHaveBeenCalledWith('batch-1', 1, expect.any(String));
```

- [x] **Step 3: Verify RED or GREEN before production changes**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/MerchantAdmin.actions.spec.tsx src/components/MerchantAdmin.fluent-trust.spec.tsx
```

Expected:
- Behavior tests should pass or only need query-label correction.
- Fluent boundary test remains RED until `MerchantAdmin.tsx` is refactored.

---

### Task 3: Refactor MerchantAdmin to Fluent Without Changing Trace-Code Semantics

**Files:**
- Modify: `packages/web/src/components/MerchantAdmin.tsx`
- Test: `packages/web/src/components/MerchantAdmin.actions.spec.tsx`
- Test: `packages/web/src/components/MerchantAdmin.fluent-trust.spec.tsx`

**Interfaces:**
- Consumes: `listBatches`, `generateCodes`, `createTraceGenerationRequestKey`, `onNavigate`.
- Produces: same merchant trace-code workflow with Fluent visual structure and stable accessibility labels.

- [x] **Step 1: Import shared UI helpers**

Add:

```typescript
import { fluentButton, fluentInput, fluentStatusTag, fluentTable } from '../ui/fluent';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';
```

- [x] **Step 2: Add local tone helpers**

Keep `statusLabel`, then add:

```typescript
function statusTone(status: Crop['status']) {
  if (status === 'Harvested') return 'success';
  if (status === 'Growing') return 'active';
  if (status === 'Planting') return 'warning';
  return 'neutral';
}
```

- [x] **Step 3: Replace list panel shell and table**

Use Fluent-style structure:

```tsx
<div className="grid h-full gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
  <section className="flex min-w-0 flex-col overflow-hidden border border-[#E1DFDD] bg-white">
    <div className="flex flex-col gap-3 border-b border-[#E1DFDD] bg-[#FAFAFA] p-4 xl:flex-row xl:items-center xl:justify-between">
      ...
      <input className={`${fluentInput} w-full pl-8 sm:w-72`} ... />
      <button type="button" className={fluentButton('primary')}>新增芍药繁育生产批次</button>
    </div>
    {loading && <LoadingState label="加载批次档案" />}
    {error && <ErrorState message={error} onRetry={() => void reload()} />}
    {!loading && !error && filteredCrops.length === 0 && <EmptyState title="暂无批次档案" description="请先在批次管理中创建生产批次。" />}
    {!loading && !error && filteredCrops.length > 0 && (
      <div className={fluentTable.wrapper}>
        <table className={fluentTable.table}>...</table>
      </div>
    )}
  </section>
</div>
```

Use `fluentTable.thead`, `fluentTable.th`, `fluentTable.row`, `fluentTable.rowSelected`, `fluentTable.td`, `fluentButton('subtle')`, and `fluentStatusTag(statusTone(crop.status))`.

- [x] **Step 4: Replace side panel**

Use a fixed Fluent panel, but keep the numeric input and generation command:

```tsx
<aside className="flex min-h-0 flex-col border border-[#E1DFDD] bg-white">
  ...
  <input aria-label="本次生成溯源码数量" type="number" className={`${fluentInput} w-full font-mono`} ... />
  <button type="button" className={`${fluentButton('primary')} w-full`} onClick={() => void generateForActiveCrop()}>
    {generatingPrint ? '生成中...' : '生成溯源码'}
  </button>
</aside>
```

The copy must remain truthful: label preview uses only current batch data and server-generated trace code.

- [x] **Step 5: Replace print preview and toast shells**

Keep:

```typescript
window.print();
setShowPrintPreview(false);
```

Use Fluent dialog and buttons:

```tsx
<div role="dialog" aria-modal="true" aria-label="溯源码标签打印预览" ...>
  ...
  <button type="button" className={fluentButton('secondary')}>放弃打印</button>
  <button type="button" className={fluentButton('primary')}>打印当前页面</button>
</div>
```

Use a neutral toast:

```tsx
<div role="status" className="fixed bottom-6 right-6 z-50 border border-[#E1DFDD] bg-white px-4 py-3 text-sm text-[#242424] shadow-lg">
```

- [x] **Step 6: Verify focused GREEN**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/MerchantAdmin.actions.spec.tsx src/components/MerchantAdmin.fluent-trust.spec.tsx
```

Expected: all MerchantAdmin tests pass.

---

### Task 4: Verify, Review, and Commit P1

**Files:**
- Verify: `packages/web/src/components/MerchantAdmin.tsx`
- Verify: `packages/web/src/components/MerchantAdmin.actions.spec.tsx`
- Verify: `packages/web/src/components/MerchantAdmin.fluent-trust.spec.tsx`
- Verify: `docs/superpowers/plans/2026-07-09-p1-merchant-admin-fluent-trust-boundary.md`

- [x] **Step 1: Run focused and web verification**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/MerchantAdmin.actions.spec.tsx src/components/MerchantAdmin.fluent-trust.spec.tsx src/App.spec.tsx
corepack pnpm@10.33.2 --filter web lint
corepack pnpm@10.33.2 --filter web test
```

Expected:
- Focused MerchantAdmin and App tests pass.
- TypeScript lint exits 0.
- Web test suite passes.

- [x] **Step 2: Run residue scan and diff check**

Run:

```powershell
rg -n "rounded-xl|rounded-2xl|bg-emerald|hover:bg-emerald|border-slate|text-slate|bg-slate|shadow-xl|shadow-2xl|bg-gradient-to-r|shadow-emerald|权威质检|PASSED|zero-knowledge|OAUTH|地理标志|全网唯一|加密证明能力" packages/web/src/components/MerchantAdmin.tsx
git -c safe.directory=E:/code/nongchang diff --check
```

Expected:
- No residue matches in `MerchantAdmin.tsx`.
- No whitespace errors.

- [x] **Step 3: Manual diff review**

Check:
- API calls and request-key reuse are unchanged.
- Tests use accessible labels instead of Fluent class names.
- No unrelated files are modified.
- `MerchantAdmin` still navigates to `batches`.
- Print preview still includes generated `TRACE-001` style codes from the real mocked API.

- [x] **Step 4: Commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p1-merchant-admin-fluent-trust-boundary.md packages/web/src/components/MerchantAdmin.tsx packages/web/src/components/MerchantAdmin.actions.spec.tsx packages/web/src/components/MerchantAdmin.fluent-trust.spec.tsx
git -c safe.directory=E:/code/nongchang commit -m "refactor(web): align merchant trace management with Fluent UI"
```

Expected: one focused P1 commit.

---

## Self-Review

**Spec coverage:** This plan addresses the highest remaining routed web production surface found after the 1-15 SaaS audit commits and recent P1 trust-surface fixes: `MerchantAdmin` is still visually inconsistent and its tests currently depend on legacy class tokens. The plan preserves real trace-code generation, retry idempotency, print-preview labels, and batch navigation.

**Placeholder scan:** No `TBD`, `TODO`, `fill in`, or unspecified verification steps remain.

**Type consistency:** API names match `packages/web/src/api/batches.ts` and `packages/web/src/api/trace.ts`; Fluent helper names match `packages/web/src/ui/fluent.ts`; state helper names match `packages/web/src/ui/state.tsx`; `AppTab` remains the navigation type for `onNavigate`.
