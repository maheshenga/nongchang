# UI/UX Stage 2 P1 Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the approved P1 Web workflows: friendly identities, role-specific workspaces, safer batch/farm-record actions, public trace recovery, quota-aware trace generation, task-based AI, and recoverable integration settings.

**Architecture:** Keep the existing API and feature boundaries, but add small pure view-model helpers for identities, dashboard composition, AI history, and integration dirty-state tracking. Extend shared/backend response contracts only where the approved UI requires real data that is not currently exposed (`operatorName` and public `merchantName`). Reuse `ModalSurface`, `confirmDialog`, TanStack Query-backed `useApi`, existing idempotency keys, and role-filtered `AppTab` navigation.

**Tech Stack:** React 19, TypeScript, TanStack Query, Tailwind CSS, NestJS, Prisma, Zod shared contracts, Vitest, Testing Library, Playwright, Axe.

## Global Constraints

- Preserve all tenant authorization boundaries, trace-code idempotency behavior, credit reservation/confirmation rules, and demo/production truthfulness.
- Do not modify or discard the unrelated `packages/web/src/api/trace.spec.ts` change in the main checkout.
- Chinese is the default product language; technical product names may remain English.
- Destructive and credit-consuming mutations never retry automatically.
- Technical IDs are diagnostics, not primary labels; missing relations use neutral business fallbacks.
- Every blocking dialog uses `ModalSurface`; mutations in progress cannot be closed accidentally.
- Role-specific actions must exist in that role's `getNavItems()` result before they are rendered.
- Public trace copy must describe matched records, not claim authenticity beyond the API response.
- Integration settings must never echo or replace masked secrets when the corresponding input is blank.
- Use `$env:CI='true'; corepack.cmd pnpm@10.33.2 ...` for every pnpm command.
- Use focused red-green-refactor cycles and commit each independently reviewable task.

---

## File Structure

- `packages/web/src/ui/identity.ts`: friendly identity, short diagnostic ID, and label-map helpers.
- `packages/web/src/ui/identity.spec.ts`: missing-label and mapping behavior.
- `packages/shared/src/dto/resource-views.dto.ts`: add nullable `operatorName` to farm-record responses.
- `packages/backend/src/modules/farm-record/farm-record.model.ts`: enrich farm records with operator display names.
- `packages/backend/src/modules/farm-record/farm-record.service.ts`: fetch owner and operator identities together.
- `packages/web/src/components/BatchAdmin.model.ts`: resolve field names before rendering/filtering/exporting.
- `packages/web/src/components/FarmRecords.tsx`: show batch/operator labels and completion confirmation/undo.
- `packages/web/src/components/dashboard/dashboard-workspace.ts`: pure role-specific copy, metrics, and quick-action composition.
- `packages/web/src/components/Dashboard.tsx`: role-specific API surfaces and navigation callbacks.
- `packages/web/src/App.tsx`: pass role/navigation/context and guard unsaved navigation.
- `packages/web/src/components/batch-admin/BatchTable.tsx`: consolidate desktop actions to the same three-level model as mobile.
- `packages/shared/src/dto/public-trace.dto.ts`: expose public `merchantName` without identifiers.
- `packages/backend/src/modules/public-trace/public-trace.model.ts`: serialize merchant display name.
- `packages/backend/src/modules/public-trace/public-trace.service.ts`: fetch the batch owner safely.
- `packages/web/src/components/PublicLanding.tsx`: public trace lookup form.
- `packages/web/src/api/trace.ts`: typed not-found/network trace errors.
- `packages/web/src/components/TraceabilityPage.tsx`: trust guidance, merchant identity, verification time, and lookup-again recovery.
- `packages/web/src/components/batch-admin/BatchLabelWorkspace.tsx`: portal workspace with quota preview and generic wording.
- `packages/web/src/components/AiAssistant.model.ts`: AI task/history/context view model.
- `packages/web/src/components/AiAssistant.tsx`: task tabs, readiness strip, retained session results.
- `packages/web/src/ui/unsaved-changes.ts`: one active internal-navigation guard.
- `packages/web/src/components/IntegrationSettings.model.ts`: pure baselines, dirty checks, and validation.
- `packages/web/src/components/IntegrationSettings.tsx`: changed-section badges, validation, and unsaved-change recovery.
- `e2e/web/p1-web-workflows.spec.ts`: role, public trace, batch generation, AI, and unsaved-change browser coverage.
- `e2e/web/accessibility.spec.ts`: role dashboard, lookup form, and AI tabs Axe coverage.

---

### Task 1: Establish the friendly identity boundary

**Files:**

- Create: `packages/web/src/ui/identity.ts`
- Create: `packages/web/src/ui/identity.spec.ts`
- Modify: `packages/shared/src/dto/resource-views.dto.ts`
- Modify: `packages/shared/src/dto/resource-views.dto.spec.ts`
- Modify: `packages/backend/src/modules/farm-record/farm-record.model.ts`
- Modify: `packages/backend/src/modules/farm-record/farm-record.model.spec.ts`
- Modify: `packages/backend/src/modules/farm-record/farm-record.service.ts`
- Modify: `packages/backend/src/modules/farm-record/farm-record.service.spec.ts`
- Modify: `packages/web/src/components/BatchAdmin.model.ts`
- Modify: `packages/web/src/components/BatchAdmin.model.spec.ts`
- Modify: `packages/web/src/components/BatchAdmin.tsx`
- Modify: `packages/web/src/components/batch-admin/BatchCommandBar.tsx`
- Modify: `packages/web/src/components/FarmRecords.tsx`
- Modify: `packages/web/src/components/FarmRecords.fluent-ui.spec.tsx`
- Modify: `packages/web/src/components/TiandituMap.tsx`
- Modify: `packages/web/src/components/FarmFields.tsx`
- Modify: `packages/web/src/components/FarmFields.spec.tsx`
- Modify: `packages/web/src/App.tsx`

**Interfaces:**

- Produces:

```ts
export interface FriendlyIdentity {
  label: string;
  technicalId: string;
  shortId: string;
  isFallback: boolean;
}

export function friendlyIdentity(input: {
  id: string | null | undefined;
  label?: string | null;
  fallback: string;
}): FriendlyIdentity;

export function buildIdentityMap<T>(
  items: readonly T[],
  idOf: (item: T) => string,
  labelOf: (item: T) => string | null | undefined,
): ReadonlyMap<string, string>;
```

- Extends `FarmRecordView` with `operatorName: string | null`.
- Extends `ViewBatch` with `fieldId: string`; `house` becomes the friendly field label.

- [x] **Step 1: Write the failing identity and contract tests**

Add tests that assert:

```ts
expect(friendlyIdentity({ id: 'field-abcdef1234', label: '东区一号田', fallback: '未知地块' })).toEqual({
  label: '东区一号田', technicalId: 'field-abcdef1234', shortId: 'field-ab', isFallback: false,
});
expect(friendlyIdentity({ id: 'field-abcdef1234', label: null, fallback: '未知地块' })).toMatchObject({
  label: '未知地块', shortId: 'field-ab', isFallback: true,
});
expect(farmRecordViewSchema.parse({ ...record, operatorName: '张三' }).operatorName).toBe('张三');
```

Update farm-record model tests so `enrichFarmRecordRows` receives an operator row and returns both `ownerName` and `operatorName`. Update `BatchAdmin.model.spec.ts` so `toViewBatch(batch, new Map([['field-1', '东区一号田']]))` renders `house: '东区一号田'` and filters by `fieldId` rather than an eight-character prefix.

Add a map-recovery test: system administrators receive a `前往第三方集成` action, while merchants receive `请联系租户系统管理员配置天地图` and no inaccessible navigation action.

- [x] **Step 2: Run the tests to verify red**

```powershell
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter web exec vitest run src/ui/identity.spec.ts src/components/BatchAdmin.model.spec.ts src/components/FarmRecords.fluent-ui.spec.tsx
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter @nongchang/shared test -- resource-views.dto.spec.ts
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter @nongchang/backend test -- farm-record.model.spec.ts farm-record.service.spec.ts
```

Expected: FAIL because the helper, `operatorName`, and field-name mapping do not exist.

- [x] **Step 3: Implement the pure helper and response enrichment**

Create `identity.ts` with:

```ts
export interface FriendlyIdentity {
  label: string;
  technicalId: string;
  shortId: string;
  isFallback: boolean;
}

export function friendlyIdentity({ id, label, fallback }: {
  id: string | null | undefined;
  label?: string | null;
  fallback: string;
}): FriendlyIdentity {
  const technicalId = id?.trim() ?? '';
  const resolved = label?.trim();
  return {
    label: resolved || fallback,
    technicalId,
    shortId: technicalId ? technicalId.slice(0, 8) : '无编号',
    isFallback: !resolved,
  };
}

export function buildIdentityMap<T>(items: readonly T[], idOf: (item: T) => string, labelOf: (item: T) => string | null | undefined) {
  return new Map(items.map(item => [idOf(item), labelOf(item)?.trim() || '']));
}
```

Add `operatorName: z.string().nullable().default(null)` to `farmRecordViewSchema`. In the backend, fetch users whose IDs occur in `items.map(item => item.operatorId)`, and extend `enrichFarmRecordRows(items, batches, owners, operators)` with an operator map. Do not expose usernames or any new IDs.

- [x] **Step 4: Resolve field, batch, and operator labels in Web view models**

Change `toViewBatch` to accept `ReadonlyMap<string, string>` and return:

```ts
const field = friendlyIdentity({ id: batch.fieldId, label: fieldNames.get(batch.fieldId), fallback: '未知地块' });
return { ...existing, fieldId: batch.fieldId, house: field.label };
```

Build the map from `fields` in `BatchAdmin`, use full field IDs in `BatchCommandBar` option values, and compare `batch.fieldId === filterHouse`. In `FarmRecords`, build a batch-number map and render `batchNo` plus `operatorName`; expose the short ID only in `title`/diagnostic copy when the friendly name is unavailable.

Add a typed recovery prop to `TiandituMap`:

```ts
type MapRecovery = { message: string; actionLabel?: string; onAction?: () => void };
```

`FarmFields` receives `onNavigate?: (tab: AppTab) => void`. For `system_admin`, pass an action that opens `integrations`; for other roles, pass only the actor-specific message. Wire `App` with `<FarmFields onNavigate={requestTabChange} />` once Task 7 introduces the guarded navigation function; until then use `setActiveTab` with the same prop signature.

- [x] **Step 5: Run focused tests and type checks**

```powershell
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter web exec vitest run src/ui/identity.spec.ts src/components/BatchAdmin.model.spec.ts src/components/BatchAdmin.spec.tsx src/components/FarmRecords.fluent-ui.spec.tsx src/components/FarmFields.spec.tsx
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter @nongchang/shared test -- resource-views.dto.spec.ts
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter @nongchang/backend test -- farm-record.model.spec.ts farm-record.service.spec.ts
$env:CI='true'; corepack.cmd pnpm@10.33.2 typecheck:web
```

Expected: PASS.

- [x] **Step 6: Commit**

```powershell
git add packages/web/src/ui/identity.ts packages/web/src/ui/identity.spec.ts packages/shared/src/dto/resource-views.dto.ts packages/shared/src/dto/resource-views.dto.spec.ts packages/backend/src/modules/farm-record/farm-record.model.ts packages/backend/src/modules/farm-record/farm-record.model.spec.ts packages/backend/src/modules/farm-record/farm-record.service.ts packages/backend/src/modules/farm-record/farm-record.service.spec.ts packages/web/src/components/BatchAdmin.model.ts packages/web/src/components/BatchAdmin.model.spec.ts packages/web/src/components/BatchAdmin.tsx packages/web/src/components/batch-admin/BatchCommandBar.tsx packages/web/src/components/FarmRecords.tsx packages/web/src/components/FarmRecords.fluent-ui.spec.tsx packages/web/src/components/TiandituMap.tsx packages/web/src/components/FarmFields.tsx packages/web/src/components/FarmFields.spec.tsx packages/web/src/App.tsx
git commit -m "feat(web): resolve friendly business identities"
```

---

### Task 2: Build role-specific production workspaces

**Files:**

- Create: `packages/web/src/components/dashboard/dashboard-workspace.ts`
- Create: `packages/web/src/components/dashboard/dashboard-workspace.spec.ts`
- Modify: `packages/web/src/components/Dashboard.tsx`
- Modify: `packages/web/src/components/Dashboard.truthfulness.spec.tsx`
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/App.spec.tsx`

**Interfaces:**

```ts
export interface DashboardProps {
  role: SystemRole;
  onNavigate(tab: AppTab): void;
}

export interface DashboardQuickAction {
  tab: AppTab;
  label: string;
  description: string;
}

export function dashboardQuickActions(role: SystemRole): DashboardQuickAction[];
export function dashboardTitle(role: SystemRole): string;
```

- [x] **Step 1: Add failing role-composition tests**

Assert merchant actions are `records`, `batches`, `fields`; agent actions are `merchantFiles`, `batches`, `billing`; system-admin actions include `pendingUsers`, `integrations`, `billing`; platform only opens `tenants`; member opens `memberHome` and `settings`. For every role, assert each action exists in `flattenNavItems(getNavItems(role))`.

Render `<Dashboard role="merchant_admin" onNavigate={onNavigate} />`, click `新建农事记录`, and expect `onNavigate('records')`. Render system-admin and expect pending-record, integration-gap, and credit-warning sections to use real API mock data.

- [x] **Step 2: Run dashboard tests to verify red**

```powershell
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter web exec vitest run src/components/dashboard/dashboard-workspace.spec.ts src/components/Dashboard.truthfulness.spec.tsx src/App.spec.tsx
```

- [x] **Step 3: Implement role-safe workspace composition**

Use a switch in `Dashboard` so platform/member roles never mount unauthorized production API hooks. Operational roles may reuse batches/fields/records; system-admin additionally reads pending users, three integration configurations, and billing summary; agent reads merchant count and billing summary. Every metric card either renders a button that calls `onNavigate` or carries `aria-label="信息指标"` when no drill-down exists.

Replace `Production mode` and `Loading demo dashboard` with `生产模式` and `正在加载演示看板`. Preserve the explicit demo opt-in and lazy import.

- [x] **Step 4: Wire App navigation**

Replace `<Dashboard />` with:

```tsx
<Dashboard role={navRole} onNavigate={setActiveTab} />
```

Do not render shortcuts that are absent from the current role's navigation.

- [x] **Step 5: Verify**

```powershell
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter web exec vitest run src/components/dashboard/dashboard-workspace.spec.ts src/components/Dashboard.truthfulness.spec.tsx src/App.spec.tsx src/navigation.spec.ts
$env:CI='true'; corepack.cmd pnpm@10.33.2 typecheck:web
```

- [x] **Step 6: Commit**

```powershell
git add packages/web/src/components/dashboard/dashboard-workspace.ts packages/web/src/components/dashboard/dashboard-workspace.spec.ts packages/web/src/components/Dashboard.tsx packages/web/src/components/Dashboard.truthfulness.spec.tsx packages/web/src/App.tsx packages/web/src/App.spec.tsx
git commit -m "feat(web): add role-specific production workspaces"
```

---

### Task 3: Consolidate batch actions and make completion reversible

**Files:**

- Modify: `packages/web/src/components/batch-admin/BatchTable.tsx`
- Modify: `packages/web/src/components/batch-admin/BatchActionMenu.tsx`
- Modify: `packages/web/src/components/batch-admin/BatchTable.spec.tsx`
- Modify: `packages/web/src/components/FarmRecords.tsx`
- Modify: `packages/web/src/components/FarmRecords.fluent-ui.spec.tsx`

**Interfaces:**

- Desktop and mobile both expose `查看`, `生码`, and one labelled `更多操作` menu.
- Farm-record completion calls `confirmDialog`; a successful completion exposes an `撤销完成` action that writes `pending` through the existing status endpoint.

- [ ] **Step 1: Add failing action and reversible-completion tests**

In `BatchTable.spec.tsx`, scope to the table and assert only `查看`, `生码`, and `批次 B-001 更多操作` are visible row controls; opening the menu exposes all six secondary actions.

In `FarmRecords.fluent-ui.spec.tsx`, mock `confirmDialog` to resolve `false` then `true`. Assert cancellation does not call the mutation; confirmation calls `updateFarmRecordStatus('rec-pending', 'completed')`; clicking `撤销完成` calls `updateFarmRecordStatus('rec-pending', 'pending')`.

- [ ] **Step 2: Run focused tests to verify red**

```powershell
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter web exec vitest run src/components/batch-admin/BatchTable.spec.tsx src/components/FarmRecords.fluent-ui.spec.tsx
```

- [ ] **Step 3: Reuse `BatchActionMenu` on desktop**

Replace the eight-button desktop action cell with the same visible `查看`/`生码` controls and `BatchActionMenu`. Keep the destructive menu item last and red. Preserve all callbacks and critical-flow row semantics.

- [ ] **Step 4: Add completion confirmation and undo banner**

Before status mutation, call:

```ts
const confirmed = await confirmDialog({
  title: '完成农事记录',
  message: `确认将“${task.type}”标记为已完成并归档？`,
  confirmLabel: '标记完成',
});
if (!confirmed) return;
```

After success, store `{ id, label }` in component state and render a `role="status"` banner with `撤销完成`. Undo writes `pending`, reloads, and clears the banner. Migrate the quick-create record overlay to `ModalSurface` and preserve the external form submit association.

- [ ] **Step 5: Verify and commit**

```powershell
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter web exec vitest run src/components/batch-admin/BatchTable.spec.tsx src/components/FarmRecords.fluent-ui.spec.tsx src/components/BatchAdmin.spec.tsx
$env:CI='true'; corepack.cmd pnpm@10.33.2 typecheck:web
git add packages/web/src/components/batch-admin/BatchTable.tsx packages/web/src/components/batch-admin/BatchActionMenu.tsx packages/web/src/components/batch-admin/BatchTable.spec.tsx packages/web/src/components/FarmRecords.tsx packages/web/src/components/FarmRecords.fluent-ui.spec.tsx
git commit -m "feat(web): simplify batch and farm record actions"
```

---

### Task 4: Complete public trace lookup and trust recovery

**Files:**

- Modify: `packages/shared/src/dto/public-trace.dto.ts`
- Modify: `packages/shared/src/dto/public-trace.dto.spec.ts`
- Modify: `packages/backend/src/modules/public-trace/public-trace.model.ts`
- Modify: `packages/backend/src/modules/public-trace/public-trace.model.spec.ts`
- Modify: `packages/backend/src/modules/public-trace/public-trace.service.ts`
- Modify: `packages/backend/src/modules/public-trace/public-trace.service.spec.ts`
- Modify: `packages/web/src/api/trace.ts`
- Modify: `packages/web/src/api/trace.spec.ts`
- Modify: `packages/web/src/components/PublicLanding.tsx`
- Modify: `packages/web/src/components/PublicLanding.spec.tsx`
- Modify: `packages/web/src/components/TraceabilityPage.tsx`
- Modify: `packages/web/src/components/TraceabilityPage.spec.tsx`
- Modify: `packages/web/src/App.tsx`

**Interfaces:**

```ts
export class TraceLookupError extends Error {
  constructor(public kind: 'not-found' | 'network', message: string) { super(message); }
}

export interface PublicLandingProps {
  onLogin(): void;
  onTraceLookup?(code: string): void;
  salesContact?: string | null;
}
```

- Extends `PublicTraceBatch` with `merchantName: string` only; no public owner ID or username.

- [ ] **Step 1: Add failing shared/backend tests**

Require `merchantName` in the open public response schema. Update model tests so `buildPublicTraceResponse` receives `owner: { displayName: '大理基地' }` and returns `batch.merchantName === '大理基地'`. Update service tests to expect a scoped user lookup by the batch owner ID.

- [ ] **Step 2: Add failing Web workflow tests**

Test landing form normalization (`' ORC-ABC '` -> `ORC-ABC`) and hash routing. Test distinct not-found and network states, frozen state, merchant identity, query timestamp, scan-count explanation, lookup-again form, `报告异常` guidance, and empty events/credentials without authenticity overclaims.

- [ ] **Step 3: Implement the safe public contract**

Fetch only `{ displayName: true }` for the batch owner in `PublicTraceService`. Serialize `merchantName` and keep existing cache/event/credential limits intact.

- [ ] **Step 4: Implement lookup and recovery UI**

Add a labelled trace-code form to the landing hero. In `App`, pass:

```tsx
onTraceLookup={code => { window.location.hash = `#/trace/${encodeURIComponent(code)}`; }}
```

In `TraceabilityPage`, capture the successful response time locally and label it `本次查询时间`. Explain that scan count is cumulative and unusually high counts warrant contacting the displayed merchant. Add a `报告异常` disclosure that shows the trace code, merchant name, and a copyable support summary without transmitting data. Error/frozen views always include a lookup-again input; network errors also include `重新查询`. Do not use browser-history-only recovery.

- [ ] **Step 5: Verify and commit**

```powershell
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter @nongchang/shared test -- public-trace.dto.spec.ts
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter @nongchang/backend test -- public-trace.model.spec.ts public-trace.service.spec.ts
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter web exec vitest run src/api/trace.spec.ts src/components/PublicLanding.spec.tsx src/components/TraceabilityPage.spec.tsx src/App.spec.tsx
$env:CI='true'; corepack.cmd pnpm@10.33.2 typecheck:web
git add packages/shared/src/dto/public-trace.dto.ts packages/shared/src/dto/public-trace.dto.spec.ts packages/backend/src/modules/public-trace/public-trace.model.ts packages/backend/src/modules/public-trace/public-trace.model.spec.ts packages/backend/src/modules/public-trace/public-trace.service.ts packages/backend/src/modules/public-trace/public-trace.service.spec.ts packages/web/src/api/trace.ts packages/web/src/api/trace.spec.ts packages/web/src/components/PublicLanding.tsx packages/web/src/components/PublicLanding.spec.tsx packages/web/src/components/TraceabilityPage.tsx packages/web/src/components/TraceabilityPage.spec.tsx packages/web/src/App.tsx
git commit -m "feat(web): complete public trace recovery"
```

---

### Task 5: Make trace generation quota-aware and generic

**Files:**

- Modify: `packages/web/src/components/BatchAdmin.tsx`
- Modify: `packages/web/src/components/BatchAdmin.spec.tsx`
- Modify: `packages/web/src/components/batch-admin/BatchLabelWorkspace.tsx`
- Create: `packages/web/src/components/batch-admin/BatchLabelWorkspace.spec.tsx`
- Modify: `packages/web/src/navigation.ts`
- Modify: `packages/web/src/navigation.spec.ts`
- Modify: `packages/web/src/components/MerchantAdmin.tsx`
- Modify: `packages/web/src/components/FarmRecords.tsx`

**Interfaces:**

```ts
interface BatchLabelWorkspaceProps {
  batch: ViewBatch;
  codeBalance: number | null;
  billingAvailable: boolean;
  generating: boolean;
  onGenerate(count: number): Promise<string[]>;
  requestConfirmation(action: PendingAction): void;
  onOpenBilling(): void;
  onClose(): void;
}
```

- [ ] **Step 1: Add failing balance and wording tests**

Assert current balance, requested count, expected remaining balance, batch number/crop/field, and `每生成 1 枚溯源码扣减 1 个二维码额度`. With balance 50 and amount 100, assert generation is disabled and the role-permitted `前往计费中心` action is shown. Assert navigation uses `产品档案`, not `我的芍药档案`, and default record/template copy does not claim every crop is peony.

- [ ] **Step 2: Run focused tests to verify red**

```powershell
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter web exec vitest run src/components/batch-admin/BatchLabelWorkspace.spec.tsx src/components/BatchAdmin.spec.tsx src/navigation.spec.ts
```

- [ ] **Step 3: Fetch and present real quota**

In `BatchAdmin`, load `getBillingSummary()` and pass `codeBalance`. Preserve the current trace-generation idempotency key and do not retry generation. Compute remaining balance as `codeBalance - amount` only when the summary is available; otherwise label quota `暂不可用` and let the backend remain authoritative.

- [ ] **Step 4: Portal and restyle the workspace**

Render the configuration screen through `ModalSurface` with `maxWidthClassName="max-w-6xl"`, Fluent tokens, a responsive single-column mobile layout, and a nested `ModalSurface` for print preview. `closeDisabled={generating}`. Replace internal batch IDs in copy with batch number and field label.

- [ ] **Step 5: Apply generic product wording**

Use `产品档案` and `田间工作台` as defaults. Keep actual `batch.cropName` where data supplies it. Replace crop-specific template sentences with neutral examples without changing saved API values.

- [ ] **Step 6: Verify and commit**

```powershell
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter web exec vitest run src/components/batch-admin/BatchLabelWorkspace.spec.tsx src/components/BatchAdmin.spec.tsx src/navigation.spec.ts src/components/FarmRecords.fluent-ui.spec.tsx
$env:CI='true'; corepack.cmd pnpm@10.33.2 typecheck:web
git add packages/web/src/components/BatchAdmin.tsx packages/web/src/components/BatchAdmin.spec.tsx packages/web/src/components/batch-admin/BatchLabelWorkspace.tsx packages/web/src/components/batch-admin/BatchLabelWorkspace.spec.tsx packages/web/src/navigation.ts packages/web/src/navigation.spec.ts packages/web/src/components/MerchantAdmin.tsx packages/web/src/components/FarmRecords.tsx
git commit -m "feat(web): make trace generation quota aware"
```

---

### Task 6: Convert AI into a retained task workspace

**Files:**

- Create: `packages/web/src/components/AiAssistant.model.ts`
- Create: `packages/web/src/components/AiAssistant.model.spec.ts`
- Modify: `packages/web/src/components/AiAssistant.tsx`
- Modify: `packages/web/src/components/AiAssistant.spec.tsx`
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/components/BatchAdmin.tsx`
- Modify: `packages/web/src/components/FarmFields.tsx`

**Interfaces:**

```ts
export type AiTaskId = 'knowledge' | 'vision' | 'data' | 'advice' | 'batch';
export interface AiWorkspaceContext { batchId?: string; fieldId?: string; task?: AiTaskId; }
export interface AiHistoryEntry { id: string; task: AiTaskId; title: string; result: string; createdAt: string; }
export function appendAiHistory(history: readonly AiHistoryEntry[], entry: AiHistoryEntry, limit?: number): AiHistoryEntry[];
```

- [ ] **Step 1: Add failing model and component tests**

Assert task switching retains prior answers, history is newest-first and capped at 20, incoming batch context preselects the batch/advice task, provider readiness is `已配置` only when the current role can read a real enabled provider, and unavailable readiness is labelled `执行时验证` rather than invented. Assert AI balance and charging/privacy copy come from `getBillingSummary()` and static truthful wording.

- [ ] **Step 2: Run focused tests to verify red**

```powershell
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter web exec vitest run src/components/AiAssistant.model.spec.ts src/components/AiAssistant.spec.tsx src/App.spec.tsx
```

- [ ] **Step 3: Implement task tabs and retained results**

Render one task panel at a time with tabs: `知识问答`, `视觉诊断`, `数据问答`, `农事建议`, `批次诊断`. Do not clear another task's answer when switching. On success, append a history entry. Keep batch image diagnosis sequential so quota failures stop honestly at the completed count.

- [ ] **Step 4: Add readiness/context wiring**

Pass `role` and optional `context` from `App`. System admins may read the existing AI-provider list; other roles show provider readiness as `执行时验证`. All roles may read their own billing summary. Add `用 AI 分析` callbacks from field/batch surfaces that set `{ fieldId }` or `{ batchId, task: 'batch' }` and navigate to `aiAssistant` only if that tab is allowed.

- [ ] **Step 5: Verify and commit**

```powershell
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter web exec vitest run src/components/AiAssistant.model.spec.ts src/components/AiAssistant.spec.tsx src/components/BatchAdmin.spec.tsx src/components/FarmFields.spec.tsx src/App.spec.tsx
$env:CI='true'; corepack.cmd pnpm@10.33.2 typecheck:web
git add packages/web/src/components/AiAssistant.model.ts packages/web/src/components/AiAssistant.model.spec.ts packages/web/src/components/AiAssistant.tsx packages/web/src/components/AiAssistant.spec.tsx packages/web/src/App.tsx packages/web/src/components/BatchAdmin.tsx packages/web/src/components/FarmFields.tsx
git commit -m "feat(web): add retained AI task workspace"
```

---

### Task 7: Add integration validation and unsaved-change recovery

**Files:**

- Create: `packages/web/src/ui/unsaved-changes.ts`
- Create: `packages/web/src/ui/unsaved-changes.spec.ts`
- Create: `packages/web/src/components/IntegrationSettings.model.ts`
- Create: `packages/web/src/components/IntegrationSettings.model.spec.ts`
- Modify: `packages/web/src/components/IntegrationSettings.tsx`
- Modify: `packages/web/src/components/IntegrationSettings.fluent-ui.spec.tsx`
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/App.spec.tsx`

**Interfaces:**

```ts
export function registerUnsavedChangesGuard(check: () => boolean): () => void;
export async function confirmUnsavedNavigation(): Promise<boolean>;

export type IntegrationDraft = { provider: 'wechat' | 'xfyun' | 'tianditu'; appId: string; enabled: boolean; secretChanged: boolean };
export function isIntegrationDirty(baseline: IntegrationDraft, current: IntegrationDraft): boolean;
export function validateIntegrationDraft(draft: IntegrationDraft, hasStoredSecret: boolean): string[];
```

- [ ] **Step 1: Add failing dirty-state and navigation tests**

Assert trimmed equivalent values are not dirty; changed AppID/enabled/secret are dirty; enabling a first-time secret-backed integration without a secret returns a field-specific error. In `App.spec.tsx`, register a dirty guard, request another tab, cancel the global confirmation, and assert the active tab does not change.

- [ ] **Step 2: Run focused tests to verify red**

```powershell
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter web exec vitest run src/ui/unsaved-changes.spec.ts src/components/IntegrationSettings.model.spec.ts src/components/IntegrationSettings.fluent-ui.spec.tsx src/App.spec.tsx
```

- [ ] **Step 3: Implement one navigation guard**

Keep one active checker in `unsaved-changes.ts`. `confirmUnsavedNavigation()` returns `true` immediately when clean; otherwise it calls `confirmDialog` with `放弃未保存更改` / `继续编辑`. Route sidebar, mobile sidebar, search, dashboard, and AI context navigation through one async `requestTabChange(tab)` function.

- [ ] **Step 4: Track changed integration sections**

Each card captures a normalized baseline after load/reload, reports dirty state to the parent, shows `有未保存更改`, validates before mutation, and resets its baseline only after the saved response reloads. Add `beforeunload` while any card is dirty. Keep masked secret inputs blank and never copy masked strings into mutation payloads.

Because the current backend exposes no non-mutating test endpoint for WeChat, Xfyun, or Tianditu, render truthful guidance: `当前后端无独立连接测试；保存后请通过对应登录、转写或地图页面验证。` Do not create a fake success button.

- [ ] **Step 5: Verify and commit**

```powershell
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter web exec vitest run src/ui/unsaved-changes.spec.ts src/components/IntegrationSettings.model.spec.ts src/components/IntegrationSettings.fluent-ui.spec.tsx src/App.spec.tsx
$env:CI='true'; corepack.cmd pnpm@10.33.2 typecheck:web
git add packages/web/src/ui/unsaved-changes.ts packages/web/src/ui/unsaved-changes.spec.ts packages/web/src/components/IntegrationSettings.model.ts packages/web/src/components/IntegrationSettings.model.spec.ts packages/web/src/components/IntegrationSettings.tsx packages/web/src/components/IntegrationSettings.fluent-ui.spec.tsx packages/web/src/App.tsx packages/web/src/App.spec.tsx
git commit -m "feat(web): protect integration setting changes"
```

---

### Task 8: Add P1 browser and accessibility coverage

**Files:**

- Create: `e2e/web/p1-web-workflows.spec.ts`
- Modify: `e2e/web/accessibility.spec.ts`
- Modify: `e2e/web/critical-flows.spec.ts`

**Interfaces:**

- Consumes seeded `merchantA`, `agentA`, `sysadmin`, and public trace code `ORC-DEMO0001`.
- Produces browser proof for role dashboards, friendly identities, reversible completion, public lookup, quota preview, and integration dirty-state recovery.

- [ ] **Step 1: Write browser tests**

Cover:

1. merchant dashboard quick action navigates to farm records;
2. desktop batch row exposes two visible actions plus overflow;
3. farm completion requires confirmation and offers undo;
4. public landing lookup reaches the trace page and `再次查询` works;
5. merchant trace generation shows balance/request/remaining and blocks insufficient quota;
6. AI tab switching retains a mocked successful result without exposing secrets;
7. system-admin integration edits prompt before leaving;
8. 390px and 768px viewports have no document-level horizontal overflow.

- [ ] **Step 2: Add Axe tests**

Add serious/critical Axe checks for merchant dashboard, public lookup form/result, AI task tabs, and integration unsaved-change dialog.

- [ ] **Step 3: Run focused browser tests**

```powershell
$env:CI='true'; $env:DATABASE_URL='postgresql://nongchang:nongchang@127.0.0.1:5545/nongchang?schema=public'; $env:REDIS_URL='redis://127.0.0.1:56379'; $env:E2E_TENANT_CODE='DEMO'; $env:E2E_USERNAME='merchantA'; $env:E2E_PASSWORD='password123'; $env:E2E_BILLING_USERNAME='agentA'; corepack.cmd pnpm@10.33.2 test:browser:prepare
$env:CI='true'; corepack.cmd pnpm@10.33.2 exec playwright test e2e/web/p1-web-workflows.spec.ts
$env:CI='true'; corepack.cmd pnpm@10.33.2 exec playwright test e2e/web/accessibility.spec.ts --grep "P1 Web"
```

- [ ] **Step 4: Run the Stage 2 completion gate**

```powershell
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter web test
$env:CI='true'; corepack.cmd pnpm@10.33.2 typecheck:web
$env:CI='true'; corepack.cmd pnpm@10.33.2 build:web
$env:CI='true'; corepack.cmd pnpm@10.33.2 test:browser
$env:CI='true'; corepack.cmd pnpm@10.33.2 test:accessibility
git diff --check
git status --short
```

- [ ] **Step 5: Commit**

```powershell
git add e2e/web/p1-web-workflows.spec.ts e2e/web/accessibility.spec.ts e2e/web/critical-flows.spec.ts
git commit -m "test(web): cover P1 workflow recovery"
```

---

## Plan Self-Review

- Spec coverage: friendly identity, permission-aware map recovery, role workspaces, action consolidation, reversible completion, public lookup/trust/report states, quota-aware generation, generic wording, retained AI tasks, and integration recovery each map to a task and test gate.
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation step remains.
- Type consistency: `FriendlyIdentity`, `DashboardProps`, `AiWorkspaceContext`, `TraceLookupError`, and unsaved-change interfaces are defined before consumers.
- Risk boundary: only two response contracts expand, both with nullable/display-only fields and matching shared/backend tests; no authorization or charging semantics change.
