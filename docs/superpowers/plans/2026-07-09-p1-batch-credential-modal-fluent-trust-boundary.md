# Batch Credential Modal Fluent Trust Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the batch credential and inspection-file modal into the Microsoft Fluent SaaS console system while proving it still uses the real credential upload, list, create, and delete APIs.

**Architecture:** Keep this as a narrow Web UI and test slice. Refactor only `BatchCredentialModal.tsx` and add component coverage around the real API wrapper calls mocked at the module boundary. Do not touch the large `BatchAdmin.tsx` surface in this slice.

**Tech Stack:** React 19, Vite, TypeScript, Vitest, Testing Library, Tailwind utilities, lucide-react, existing local Fluent helpers.

## Global Constraints

- Use CodeGraph before grep/file search for code discovery because `.codegraph/` exists.
- Use TDD: add failing tests first, verify RED, then change production code.
- Do not change backend APIs, shared DTOs, upload behavior, trace credential API wrappers, or `BatchAdmin` wiring.
- Do not introduce new dependencies.
- Do not add fake credential rows, fake uploaded URLs, mock files in production code, or simulated verification results.
- Preserve all real API wrapper calls:
  - `listCredentials(batchId)` when the modal opens and after mutations.
  - `uploadCredentialFile(file)` before create when the user picks a credential file.
  - `createCredential({ batchId, type, title, issuer, serialNo?, issuedAt?, fileUrl })`.
  - `removeCredential(id)` for deletion.
- Touched production files must use `../ui/fluent` and `../ui/state`, and must not contain dominant legacy tokens: `rounded-xl`, `rounded-2xl`, `bg-emerald-600`, `hover:bg-emerald-700`, `border-slate`, `text-slate`, `bg-slate`.

---

## File Structure

- Create: `packages/web/src/components/BatchCredentialModal.spec.tsx`
  - Covers listing credentials, empty state, upload before create, optional field normalization, delete, and source-level Fluent/no-fake boundaries.
- Modify: `packages/web/src/components/BatchCredentialModal.tsx`
  - Replace legacy modal/card/form classes with Fluent helpers and state components.
  - Keep credential API call semantics unchanged.
- Verify: `docs/superpowers/plans/2026-07-09-p1-batch-credential-modal-fluent-trust-boundary.md`

---

### Task 1: Add Batch Credential Modal Regression Tests

**Files:**
- Create: `packages/web/src/components/BatchCredentialModal.spec.tsx`
- Modify later: `packages/web/src/components/BatchCredentialModal.tsx`

**Interfaces:**
- Consumes mocked `../api/trace-credential`.
- Produces regression coverage for source boundary, credential list rendering, upload/create flow, and delete flow.

- [x] **Step 1: Write the failing tests**

Create `packages/web/src/components/BatchCredentialModal.spec.tsx` with tests equivalent to:

```tsx
expect(source()).toContain("from '../ui/fluent'");
expect(source()).toContain("from '../ui/state'");
expect(source()).not.toContain('rounded-xl');
expect(source()).not.toContain('bg-emerald-600');
expect(source()).not.toContain('mockResult');
```

```tsx
expect(await screen.findByText('有机认证证书')).toBeTruthy();
expect(screen.getByRole('link', { name: '查看' })).toHaveAttribute('href', 'https://cdn.example.test/cert.pdf');
```

```tsx
fireEvent.click(screen.getByRole('button', { name: /新增资质/ }));
fireEvent.change(screen.getByLabelText('证明文件'), { target: { files: [file] } });
await waitFor(() => expect(uploadCredentialFile).toHaveBeenCalledWith(file));
fireEvent.click(screen.getByRole('button', { name: '保存' }));
await waitFor(() => expect(createCredential).toHaveBeenCalledWith({
  batchId: 'batch-1',
  type: 'report',
  title: '农残检测报告',
  issuer: '检测中心',
  serialNo: 'R-001',
  issuedAt: new Date('2026-07-09').toISOString(),
  fileUrl: 'https://cdn.example.test/report.pdf',
}));
```

- [x] **Step 2: Run tests to verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/BatchCredentialModal.spec.tsx
```

Expected: FAIL because `BatchCredentialModal.tsx` lacks Fluent/state imports, contains legacy class tokens, and lacks accessible file label expected by the new spec.

---

### Task 2: Refactor BatchCredentialModal to Fluent

**Files:**
- Modify: `packages/web/src/components/BatchCredentialModal.tsx`
- Test: `packages/web/src/components/BatchCredentialModal.spec.tsx`

**Interfaces:**
- Consumes: `listCredentials`, `createCredential`, `removeCredential`, `uploadCredentialFile`.
- Produces: A Fluent-styled modal with accessible controls and no fake credential state.

- [x] **Step 1: Import Fluent helpers and state helpers**

```tsx
import { fluentButton, fluentInput, fluentSelect, fluentStatusTag } from '../ui/fluent';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';
```

- [x] **Step 2: Replace modal shell and list states**

Use Fluent-compatible shells:

```tsx
<div className="absolute inset-0 z-[80] flex items-center justify-center bg-black/35 p-4">
<div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden border border-[#E1DFDD] bg-white shadow-xl">
<LoadingState label="加载资质文件" />
<EmptyState title="暂未关联任何资质或检测文件" />
<ErrorState message={err} retryLabel="重试" onRetry={() => void reload()} />
```

- [x] **Step 3: Preserve upload and create behavior**

Keep:

```tsx
const file = e.target.files?.[0];
if (!file) return;
setFileUrl(await uploadCredentialFile(file));
await createCredential({
  batchId,
  type,
  title,
  issuer,
  serialNo: serialNo || undefined,
  issuedAt: issuedAt ? new Date(issuedAt).toISOString() : undefined,
  fileUrl,
});
```

- [x] **Step 4: Preserve delete behavior**

Keep:

```tsx
await removeCredential(id);
void reload();
```

- [x] **Step 5: Run focused test to verify GREEN**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/BatchCredentialModal.spec.tsx src/api/trace-credential.spec.ts
```

Expected: PASS.

---

### Task 3: Verify, Review, and Commit P1

**Files:**
- Verify: `packages/web/src/components/BatchCredentialModal.tsx`
- Verify: `packages/web/src/components/BatchCredentialModal.spec.tsx`
- Verify: `docs/superpowers/plans/2026-07-09-p1-batch-credential-modal-fluent-trust-boundary.md`

- [x] **Step 1: Run Web verification**

```powershell
corepack pnpm@10.33.2 --filter web lint
corepack pnpm@10.33.2 --filter web test
corepack pnpm@10.33.2 --filter web build
```

Expected: lint exits 0; all Web tests pass; build exits 0. Existing `DashboardDemo` chunk-size warning may remain.

- [x] **Step 2: Run residue scan**

```powershell
rg -n "rounded-xl|rounded-2xl|bg-emerald-600|hover:bg-emerald-700|border-slate|text-slate|bg-slate|mockResult|Simulate|fake|setTimeout\(\(\) =>" packages/web/src/components/BatchCredentialModal.tsx
git -c safe.directory=E:/code/nongchang diff --check
```

Expected: no residue matches; no whitespace errors.

- [x] **Step 3: Request review**

Ask a reviewer to inspect the diff for:

- No trace credential API contract changes.
- No fake credential, upload, or verification output paths.
- Existing credential wrapper calls preserved.
- Fluent styling applied to modal, list, and form.
- Tests cover list, empty/error states, upload before create, delete, and source boundary.

- [ ] **Step 4: Commit**

```powershell
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p1-batch-credential-modal-fluent-trust-boundary.md packages/web/src/components/BatchCredentialModal.spec.tsx packages/web/src/components/BatchCredentialModal.tsx
git -c safe.directory=E:/code/nongchang commit -m "refactor(web): align batch credentials with Fluent UI"
```

Expected: commit created successfully.

## Self-Review

Spec coverage: This plan addresses the next high-impact trust surface in the batch/traceability workflow. It intentionally leaves the very large `BatchAdmin.tsx` shell for a later slice, while improving the credential evidence workflow users rely on for consumer-facing proof.

Placeholder scan: No TBD/TODO/fill-later placeholders remain; each task names exact files, commands, expected outcomes, and API invariants.

Type consistency: API names match `packages/web/src/api/trace-credential.ts`, and Fluent helper names match `packages/web/src/ui/fluent.ts`.
