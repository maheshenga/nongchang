# UI/UX Stage 3 P1 Miniapp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the miniapp field-work and registration workflows with functional quick actions, honest offline behavior, durable drafts, confirmation, receipts, and truthful application status.

**Architecture:** Keep `Work` as the page orchestrator and expose named imperative actions from `RecordForm`. Put decision logic and draft serialization in pure model files, while small receipt/review components own presentation. Registration continues using the current backend contract and explicitly states that no tracking number is available.

**Tech Stack:** Taro 4.2, React 18, TypeScript 5.8, Vitest 2, SCSS, shared Zod DTOs.

## Global Constraints

- Do not invent offline synchronization, application IDs, AI readiness, or successful submissions.
- Persist only non-secret form fields and uploaded asset URLs.
- Mutations and AI/upload calls must not run while offline.
- Preserve existing farm-record DTOs, idempotency behavior, tenant scope, and credit charging.
- Default generic copy is `田间工作台`; real `cropName` remains visible when supplied by the API.

---

### Task 1: Make quick actions functional and offline-aware

**Files:**

- Create: `packages/miniapp/src/pages/work/quick-actions.model.ts`
- Create: `packages/miniapp/src/pages/work/quick-actions.model.spec.ts`
- Modify: `packages/miniapp/src/pages/work/components/WorkQuickActions.tsx`
- Modify: `packages/miniapp/src/pages/work/components/truthfulness.spec.ts`
- Modify: `packages/miniapp/src/pages/work/index.tsx`
- Modify: `packages/miniapp/src/pages/work/index.scss`
- Modify: `packages/miniapp/src/components/RecordForm/index.tsx`

**Interfaces:**

```ts
export type WorkQuickAction = 'chat' | 'diagnose' | 'manual' | 'location';
export interface WorkQuickActionDeps {
  offline: boolean;
  aiBalance: number | null;
  openAi(mode: 'chat' | 'diagnose'): void;
  openManual(): void;
  openLocation(): void;
  notify(message: string): void;
}
export function runWorkQuickAction(action: WorkQuickAction, deps: WorkQuickActionDeps): void;

export interface RecordFormHandle {
  applyTemplate(template: QuickTemplateView): void;
  openManual(): void;
  openLocation(): void;
}
```

- [x] **Step 1: Add failing quick-action tests**

Assert manual calls `openManual`, location calls `openLocation`, offline AI calls only `notify('离线状态下无法使用 AI，请恢复网络后重试')`, zero AI balance keeps the existing recharge guidance, and online AI calls `openAi`.

- [x] **Step 2: Run the focused tests to verify red**

```powershell
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter @nongchang/miniapp exec vitest run src/pages/work/quick-actions.model.spec.ts src/pages/work/components/truthfulness.spec.ts
```

- [x] **Step 3: Implement real quick-action routing**

`WorkQuickActions` delegates named actions to `runWorkQuickAction`. `Work` passes `isOffline`, `formRef.current?.openManual()`, and `formRef.current?.openLocation()`. Templates still call `applyTemplate`, and every form-opening action scrolls to the changed section.

- [x] **Step 4: Add truthful offline and generic workspace copy**

Change `芍药工作台` to `田间工作台` and the hard-coded fallback group to `基地生产组`. Render `离线：草稿会保存在本机，提交、上传、语音转写与 AI 需要网络` when disconnected. Pass `isOffline` into `RecordForm` and block AI advice, image upload, voice transcription, and final submission with visible guidance.

- [x] **Step 5: Verify and commit**

```powershell
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter @nongchang/miniapp exec vitest run src/pages/work/quick-actions.model.spec.ts src/pages/work/components/truthfulness.spec.ts
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter @nongchang/miniapp exec tsc --noEmit
git add packages/miniapp/src/pages/work/quick-actions.model.ts packages/miniapp/src/pages/work/quick-actions.model.spec.ts packages/miniapp/src/pages/work/components/WorkQuickActions.tsx packages/miniapp/src/pages/work/components/truthfulness.spec.ts packages/miniapp/src/pages/work/index.tsx packages/miniapp/src/pages/work/index.scss packages/miniapp/src/components/RecordForm/index.tsx
git commit -m "feat(miniapp): make field quick actions functional"
```

---

### Task 2: Add draft protection, submission review, and a durable receipt

**Files:**

- Create: `packages/miniapp/src/components/RecordForm/draft.ts`
- Create: `packages/miniapp/src/components/RecordForm/draft.spec.ts`
- Create: `packages/miniapp/src/components/RecordForm/RecordSubmissionReview.tsx`
- Create: `packages/miniapp/src/components/RecordForm/RecordReceipt.tsx`
- Modify: `packages/miniapp/src/components/RecordForm/index.tsx`
- Modify: `packages/miniapp/src/components/RecordForm/index.scss`
- Modify: `packages/miniapp/test/taro-mock.ts`

**Interfaces:**

```ts
export const RECORD_DRAFT_KEY = 'farm_record_draft_v1';
export interface RecordDraft {
  batchId: string;
  action: string;
  note: string;
  cost: string;
  labor: string;
  images: string[];
  location: string;
  supplyId: string;
  supplyAmount: string;
}
export function parseRecordDraft(value: unknown): RecordDraft | null;
export function isMeaningfulRecordDraft(draft: RecordDraft): boolean;

export interface RecordReceiptView {
  recordId: string;
  batchId: string;
  batchNo: string;
  cropName: string;
  action: string;
  recordedAt: string;
}
```

- [x] **Step 1: Add failing draft model tests**

Require safe parsing, reject malformed arrays/unknown shapes, treat an auto-selected batch alone as non-meaningful, and treat action, note, cost, labor, uploaded URLs, location, or supply data as meaningful.

- [x] **Step 2: Run the draft tests to verify red**

```powershell
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter @nongchang/miniapp exec vitest run src/components/RecordForm/draft.spec.ts
```

- [x] **Step 3: Restore and persist the local draft**

After the initial storage read, synchronize only the `RecordDraft` fields to Taro storage. Remove the key when the draft is no longer meaningful. Feature-detect `enableAlertBeforeUnload`/`disableAlertBeforeUnload` and warn with `当前农事草稿尚未提交，确认离开？` while meaningful input exists.

- [x] **Step 4: Add review and final submission states**

The primary button becomes `核对并提交`. Validation builds the existing `CreateFarmRecordDto`, then opens `RecordSubmissionReview` with batch, action, note, material, location, evidence count, cost, and labor. Only `确认提交` calls `createFarmRecord`; offline confirmation does not call the API and explains that connectivity is required.

- [x] **Step 5: Add the durable receipt**

On success, clear the draft and render `RecordReceipt` with the real returned record ID. `查看记录` navigates to `/pages/batch/index` using the selected batch identity; `再记一笔` clears the receipt and focuses the form. Failed submission preserves every draft field and uploaded URL.

- [x] **Step 6: Verify and commit**

```powershell
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter @nongchang/miniapp exec vitest run src/components/RecordForm/draft.spec.ts src/components/RecordForm/payload.spec.ts
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter @nongchang/miniapp exec tsc --noEmit
git add packages/miniapp/src/components/RecordForm/draft.ts packages/miniapp/src/components/RecordForm/draft.spec.ts packages/miniapp/src/components/RecordForm/RecordSubmissionReview.tsx packages/miniapp/src/components/RecordForm/RecordReceipt.tsx packages/miniapp/src/components/RecordForm/index.tsx packages/miniapp/src/components/RecordForm/index.scss packages/miniapp/test/taro-mock.ts
git commit -m "feat(miniapp): retain farm record drafts and receipts"
```

---

### Task 3: Replace registration toast navigation with an application-status view

**Files:**

- Modify: `packages/miniapp/src/api/auth.ts`
- Modify: `packages/miniapp/src/api/auth.spec.ts`
- Create: `packages/miniapp/src/pages/register/status.ts`
- Create: `packages/miniapp/src/pages/register/status.spec.ts`
- Modify: `packages/miniapp/src/pages/register/index.tsx`
- Modify: `packages/miniapp/src/pages/register/index.scss`

**Interfaces:**

```ts
export async function registerWechat(displayName: string, phone?: string): Promise<PendingResponse>;
export interface RegistrationStatusView {
  displayName: string;
  statusLabel: '待审核';
  applicationId: string | null;
  trackingMessage: string;
}
export function buildRegistrationStatus(displayName: string, response: PendingResponse): RegistrationStatusView;
```

- [x] **Step 1: Add failing API and status tests**

Assert `registerWechat` returns `{ status: 'pending' }` after clearing stale tokens. Assert the status model preserves the submitted display name, labels the state `待审核`, sets `applicationId` to `null`, and returns `当前接口未返回申请跟踪编号`.

- [x] **Step 2: Run the focused tests to verify red**

```powershell
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter @nongchang/miniapp exec vitest run src/api/auth.spec.ts src/pages/register/status.spec.ts
```

- [x] **Step 3: Render the durable application status**

Remove the delayed `navigateBack`. After success, replace the form with the submitted name, `待审核`, the truthful no-tracking-number message, guidance that an administrator must approve the account, and an explicit `返回登录` action.

- [x] **Step 4: Verify and commit**

```powershell
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter @nongchang/miniapp exec vitest run src/api/auth.spec.ts src/pages/register/status.spec.ts
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter @nongchang/miniapp exec tsc --noEmit
git add packages/miniapp/src/api/auth.ts packages/miniapp/src/api/auth.spec.ts packages/miniapp/src/pages/register/status.ts packages/miniapp/src/pages/register/status.spec.ts packages/miniapp/src/pages/register/index.tsx packages/miniapp/src/pages/register/index.scss
git commit -m "feat(miniapp): show registration application status"
```

---

### Task 4: Run the Stage 3 completion gate

**Files:**

- Modify: `docs/superpowers/plans/2026-07-13-ui-ux-stage-3-p1-miniapp.md`

- [ ] **Step 1: Run miniapp tests and type checking**

```powershell
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter @nongchang/miniapp test
$env:CI='true'; corepack.cmd pnpm@10.33.2 --filter @nongchang/miniapp exec tsc --noEmit
```

- [ ] **Step 2: Build the WeChat miniapp**

```powershell
$env:CI='true'; corepack.cmd pnpm@10.33.2 build:miniapp
```

- [ ] **Step 3: Run repository diff checks and commit the plan state**

```powershell
git diff --check
git status --short
git add docs/superpowers/plans/2026-07-13-ui-ux-stage-3-p1-miniapp.md
git commit -m "docs: record UI UX Stage 3 verification"
```

---

## Plan Self-Review

- Spec coverage: quick actions, offline truthfulness, local draft, discard warning, confirmation, receipt, registration status, and generic crop wording all map to tasks and tests.
- Placeholder scan: no deferred implementation or invented backend capability remains.
- Type consistency: quick-action, draft, receipt, and registration status interfaces are defined before their consumers.
- Risk boundary: farm-record DTOs and backend registration semantics remain unchanged; only the miniapp experience and the client return type become richer.
