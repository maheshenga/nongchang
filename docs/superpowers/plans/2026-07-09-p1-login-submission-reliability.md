# P1 Login Submission Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the SaaS login form reliable during slow authentication by preventing duplicate submissions and locking editable fields while the login request is in flight.

**Architecture:** Keep the existing `AppLogin` component and `useAuth().login` API unchanged. Add a local synchronous in-flight guard with `useRef`, reuse the existing `submitting` state for visual feedback, and disable form controls while a request is pending. This is a Web-only interaction hardening slice and does not change backend auth, tokens, routing, or public landing behavior.

**Tech Stack:** React 19, Vite, Vitest, Testing Library, existing Fluent helper classes in `packages/web/src/ui/fluent.ts`.

## Global Constraints

- Do not change backend authentication APIs or token handling.
- Do not change public landing routing or `#/trace/:code` public trace behavior.
- Follow TDD: every production code change must be preceded by a failing test.
- Keep Microsoft Fluent-inspired styling and compact SaaS control surface conventions.
- The login form must keep current labels and field names: `机构编码`, `登录账号`, `密码`, `安全登录`, `登录中...`.

---

### Task 1: Prevent Duplicate Login Submissions

**Files:**
- Modify: `packages/web/src/components/AppLogin.spec.tsx`
- Modify: `packages/web/src/components/AppLogin.tsx`

**Interfaces:**
- Consumes: `useAuth().login(dto: LoginDto): Promise<void>`
- Produces: `AppLogin` behavior where only the first pending submit can call `login`, and form controls are disabled while `submitting` is true.

- [ ] **Step 1: Write the failing duplicate-submit test**

Append this test inside the existing `describe('AppLogin Fluent login', () => { ... })` block in `packages/web/src/components/AppLogin.spec.tsx`:

```tsx
it('locks the form and ignores duplicate submits while login is pending', async () => {
  let resolveLogin: (() => void) | undefined;
  loginMock.mockImplementation(() => new Promise<void>((resolve) => { resolveLogin = resolve; }));

  render(<AppLogin />);

  fireEvent.change(screen.getByLabelText('机构编码'), { target: { value: 'tenant-a' } });
  fireEvent.change(screen.getByLabelText('登录账号'), { target: { value: 'admin' } });
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'secret123' } });

  const submit = screen.getByRole('button', { name: '安全登录' });
  fireEvent.click(submit);
  fireEvent.submit(submit.closest('form')!);

  expect(loginMock).toHaveBeenCalledTimes(1);
  expect((screen.getByRole('button', { name: '登录中...' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByLabelText('机构编码') as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByLabelText('登录账号') as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByLabelText('密码') as HTMLInputElement).disabled).toBe(true);

  resolveLogin?.();
  await waitFor(() => {
    expect(screen.getByRole('button', { name: '安全登录' })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/AppLogin.spec.tsx
```

Expected: FAIL because a direct second `submit` can call `login` again before React state disables the button, and the input fields are not disabled while submitting.

- [ ] **Step 3: Implement synchronous in-flight guard and disabled controls**

Update `packages/web/src/components/AppLogin.tsx`:

```tsx
import { useRef, useState } from 'react';
```

Add a ref beside the existing state:

```tsx
const submittingRef = useRef(false);
```

Update `handleSubmit`:

```tsx
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (submittingRef.current) return;
  submittingRef.current = true;
  setError(null);
  setSubmitting(true);
  try {
    await login({ tenantCode, username, password });
  } catch (err) {
    setError(err instanceof Error ? err.message : '登录失败');
  } finally {
    submittingRef.current = false;
    setSubmitting(false);
  }
};
```

Add `disabled={submitting}` to the three inputs:

```tsx
<input
  id="login-tenant"
  ...
  disabled={submitting}
/>
```

```tsx
<input
  id="login-username"
  ...
  disabled={submitting}
/>
```

```tsx
<input
  id="login-password"
  ...
  disabled={submitting}
/>
```

- [ ] **Step 4: Run focused tests to verify GREEN**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/AppLogin.spec.tsx
```

Expected: PASS.

---

### Task 2: Verification, Review, Commit

**Files:**
- Verify all files changed in Task 1 and this plan file.

**Interfaces:**
- Consumes: completed Task 1
- Produces: committed P1 login submission reliability slice.

- [ ] **Step 1: Run focused regression tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/AppLogin.spec.tsx src/App.spec.tsx
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
git -c safe.directory=E:/code/nongchang diff -- docs/superpowers/plans/2026-07-09-p1-login-submission-reliability.md packages/web/src/components/AppLogin.tsx packages/web/src/components/AppLogin.spec.tsx
```

Expected: `diff --check` exits 0; diff only contains this login reliability slice.

- [ ] **Step 5: Stage and commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p1-login-submission-reliability.md packages/web/src/components/AppLogin.tsx packages/web/src/components/AppLogin.spec.tsx
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang commit -m "fix(web): harden login submission state"
```

Expected: commit succeeds.

## Self-Review

- Spec coverage: This plan addresses a P1 reliability gap in the unauthenticated conversion path by preventing duplicate login calls and showing a locked pending state.
- Placeholder scan: No TBD/TODO/fill-in placeholders remain.
- Type consistency: The plan keeps `AppLogin` props unchanged and uses the existing `useAuth().login` return type.
