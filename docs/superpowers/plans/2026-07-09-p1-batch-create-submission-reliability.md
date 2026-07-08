# P1 Batch Create Submission Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent duplicate batch creation and lock the create-batch form while the real create request is pending.

**Architecture:** Keep `BatchAdmin` and the nested `CreateBatchModal` in the existing file. Add a local synchronous in-flight guard with `useRef`, reuse the existing `submitting` state for visual feedback, and disable create form controls while the request is pending. This is a Web-only reliability slice and does not change batch APIs, DTOs, list loading, QR generation, exports, or delete workflows.

**Tech Stack:** React 19, Vite, Vitest, Testing Library, existing Fluent helper classes in `packages/web/src/ui/fluent.ts`.

## Global Constraints

- Do not change backend batch APIs or shared `CreateBatchDto`.
- Do not change QR generation, export, delete, credential, or lifecycle-detail behavior.
- Follow TDD: production code changes must be preceded by a failing test.
- Keep current create-batch field labels and button copy: `所属地块`, `批次号`, `品种`, `种植日期`, `预计收获`, `创建`, `提交中…`.
- Do not introduce broad component splits in this slice; keep edits narrowly scoped to create-batch submission reliability.

---

### Task 1: Prevent Duplicate Create-Batch Submissions

**Files:**
- Modify: `packages/web/src/components/BatchAdmin.spec.tsx`
- Modify: `packages/web/src/components/BatchAdmin.tsx`

**Interfaces:**
- Consumes: `createBatch(dto: CreateBatchDto): Promise<Batch>`
- Produces: `CreateBatchModal` behavior where only the first pending submit can call `createBatch`, and all editable create controls are disabled while `submitting` is true.

- [ ] **Step 1: Write the failing duplicate-submit test**

Append this test inside the existing `describe('BatchAdmin Fluent console', () => { ... })` block in `packages/web/src/components/BatchAdmin.spec.tsx`:

```tsx
it('locks create batch form and ignores duplicate submits while creation is pending', async () => {
  fieldApiMock.listFields.mockResolvedValue([
    {
      id: '11111111-1111-4111-8111-111111111111',
      tenantId: 'tenant-1',
      ownerId: '22222222-2222-4222-8222-222222222222',
      ownerName: '张三农场',
      name: 'A区葡萄园',
      area: 12,
      lng: 120.1,
      lat: 30.2,
      iotDeviceId: null,
      createdAt: '2024-01-01T00:00:00.000Z',
    },
  ]);
  let resolveCreate: (() => void) | undefined;
  batchApiMock.createBatch.mockImplementation(() => new Promise<void>((resolve) => { resolveCreate = resolve; }));

  render(<BatchAdmin />);

  fireEvent.click(await screen.findByRole('button', { name: /新建批次/ }));
  fireEvent.change(screen.getByLabelText('批次号'), { target: { value: 'B20260709001' } });
  fireEvent.change(screen.getByLabelText('品种'), { target: { value: '阳光玫瑰' } });
  fireEvent.change(screen.getByLabelText('种植日期'), { target: { value: '2026-07-01' } });
  fireEvent.change(screen.getByLabelText('预计收获'), { target: { value: '2026-09-01' } });

  const submit = screen.getByRole('button', { name: '创建' });
  fireEvent.click(submit);
  fireEvent.submit(submit.closest('form')!);

  expect(batchApiMock.createBatch).toHaveBeenCalledTimes(1);
  expect((screen.getByRole('button', { name: '提交中…' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByLabelText('所属地块') as HTMLSelectElement).disabled).toBe(true);
  expect((screen.getByLabelText('批次号') as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByLabelText('品种') as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByLabelText('种植日期') as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByLabelText('预计收获') as HTMLInputElement).disabled).toBe(true);

  resolveCreate?.();
  await waitFor(() => {
    expect(screen.queryByRole('dialog', { name: '新建批次' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/BatchAdmin.spec.tsx
```

Expected: FAIL because a direct second form submit can call `createBatch` again before React state disables the submit button, and create controls are not disabled while submitting.

- [ ] **Step 3: Implement synchronous in-flight guard and disabled controls**

Update the nested `CreateBatchModal` in `packages/web/src/components/BatchAdmin.tsx`.

Add a ref beside the existing state:

```tsx
const submittingRef = useRef(false);
```

Update `submit`:

```tsx
const submit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (submittingRef.current) return;
  submittingRef.current = true;
  setErr(null);
  const field = fields.find((f) => f.id === fieldId);
  if (!field) {
    submittingRef.current = false;
    setErr('请选择地块');
    return;
  }
  setSubmitting(true);
  try {
    const dto: CreateBatchDto = {
      ownerId: field.ownerId,
      fieldId: field.id,
      batchNo,
      cropName,
      plantDate: new Date(plantDate).toISOString(),
      expectedHarvest: new Date(expectedHarvest).toISOString(),
      status: BatchStatus.PLANTING,
    };
    await createBatch(dto);
    onCreated();
  } catch (e2) {
    setErr(e2 instanceof Error ? e2.message : '创建失败');
  } finally {
    submittingRef.current = false;
    setSubmitting(false);
  }
};
```

Add `disabled={submitting}` to the select and four inputs. Add `disabled={submitting}` to the cancel button so the user cannot close the modal while the create request is in flight:

```tsx
<select ... disabled={submitting}>
```

```tsx
<input ... disabled={submitting} />
```

```tsx
<button type="button" onClick={onClose} disabled={submitting} ...>
  取消
</button>
```

- [ ] **Step 4: Run focused tests to verify GREEN**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/BatchAdmin.spec.tsx
```

Expected: PASS.

---

### Task 2: Verification, Review, Commit

**Files:**
- Verify all files changed in Task 1 and this plan file.

**Interfaces:**
- Consumes: completed Task 1
- Produces: committed P1 batch-create reliability slice.

- [ ] **Step 1: Run focused regression tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/BatchAdmin.spec.tsx src/components/BatchAdmin.model.spec.ts src/components/BatchAdmin.fluent-depth.spec.tsx
```

Expected: PASS.

- [ ] **Step 2: Run Web lint**

Run:

```powershell
corepack pnpm@10.33.2 --filter web lint
```

Expected: PASS.

- [ ] **Step 3: Run full Web tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter web test
```

Expected: PASS.

- [ ] **Step 4: Check whitespace and diff**

Run:

```powershell
git -c safe.directory=E:/code/nongchang diff --check
git -c safe.directory=E:/code/nongchang diff -- docs/superpowers/plans/2026-07-09-p1-batch-create-submission-reliability.md packages/web/src/components/BatchAdmin.tsx packages/web/src/components/BatchAdmin.spec.tsx
```

Expected: `diff --check` exits 0; diff only contains this batch-create reliability slice.

- [ ] **Step 5: Stage and commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p1-batch-create-submission-reliability.md packages/web/src/components/BatchAdmin.tsx packages/web/src/components/BatchAdmin.spec.tsx
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang commit -m "fix(web): harden batch creation submit state"
```

Expected: commit succeeds.

## Self-Review

- Spec coverage: The plan addresses a P1 reliability gap in a core business write operation: creating a batch.
- Placeholder scan: No TBD/TODO/fill-in placeholders remain.
- Type consistency: The plan keeps `CreateBatchDto`, `createBatch`, `BatchAdmin`, and `CreateBatchModal` contracts unchanged.
