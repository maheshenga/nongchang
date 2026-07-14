# Agent User-Group Role UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Web user-group page read-only for `agent_admin` while preserving full group management for `system_admin`.

**Architecture:** Keep the backend and navigation contracts unchanged. `UserGroups` reads the authenticated role from `useAuth`, derives one fail-closed `canManageGroups` capability, and uses it for both rendered controls and mutation-handler guards.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, pnpm 10.33.2

## Global Constraints

- Work only in `E:\code\nongchang\.worktrees\baota-production-launch-p0`.
- Do not change backend user-group authorization, shared DTOs, database schema, or agent navigation.
- `system_admin` keeps the existing create, edit, delete, permission-editing, and confirmation behavior.
- `agent_admin` keeps list visibility but receives no create, edit, or delete affordance.
- Unknown or temporarily unavailable roles fail closed as read-only.
- Use `corepack pnpm@10.33.2` for every pnpm command.
- Follow RED-GREEN-REFACTOR: no production change before the new role test fails for the expected reason.

---

### Task 1: Enforce role-aware user-group controls

**Files:**
- Modify: `packages/web/src/components/UserGroups.spec.tsx`
- Modify: `packages/web/src/components/UserGroups.tsx`

**Interfaces:**
- Consumes: `useAuth(): AuthContextValue` from `packages/web/src/auth/auth-context.tsx`
- Consumes: `Role.SYSTEM_ADMIN` and `Role.AGENT_ADMIN` from `@nongchang/shared`
- Produces: `const canManageGroups: boolean` inside `UserGroups`
- Preserves: `listUserGroups`, `createUserGroup`, `updateUserGroup`, and `deleteUserGroup` request payloads

- [ ] **Step 1: Add an explicit authenticated-role test harness**

Add this hoisted role fixture and auth-context mock near the existing API mocks in `UserGroups.spec.tsx`:

```tsx
const authMock = vi.hoisted(() => ({
  role: 'system_admin' as 'system_admin' | 'agent_admin',
}));

vi.mock('../auth/auth-context', () => ({
  useAuth: () => ({
    user: {
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: authMock.role,
      agentId: authMock.role === 'agent_admin' ? 'agent-1' : null,
      ownerId: null,
    },
  }),
}));
```

Reset the default role in the existing `beforeEach`:

```tsx
authMock.role = 'system_admin';
```

- [ ] **Step 2: Write the failing agent read-only test**

Add this test before the existing system-administrator mutation tests:

```tsx
it('renders agent administrators as read-only without mutation controls', async () => {
  authMock.role = 'agent_admin';
  renderWithDialog();

  await screen.findByText('记录员');

  expect(screen.getByText('代理管理员可查看用户组配置；新建、编辑和删除由系统管理员负责。')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /新建用户组/ })).toBeNull();
  expect(screen.queryByRole('button', { name: '编辑 记录员' })).toBeNull();
  expect(screen.queryByRole('button', { name: '删除 记录员' })).toBeNull();
  expect(screen.queryByRole('columnheader', { name: '操作' })).toBeNull();
  expect(createUserGroupMock).not.toHaveBeenCalled();
  expect(updateUserGroupMock).not.toHaveBeenCalled();
  expect(deleteUserGroupMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/UserGroups.spec.tsx
```

Expected: the new test fails because the notice is absent and the create/edit/delete controls are still rendered for `agent_admin`; existing tests remain runnable.

- [ ] **Step 4: Add the fail-closed role capability**

In `UserGroups.tsx`, extend the shared import and add the auth hook:

```tsx
import {
  Permission,
  Role,
  type Permission as PermissionValue,
  type UserGroupInput,
  type UserGroupView,
} from '@nongchang/shared';
import { useAuth } from '../auth/auth-context';
```

At the beginning of `UserGroups`, derive the capability:

```tsx
const { user } = useAuth();
const canManageGroups = user?.role === Role.SYSTEM_ADMIN;
```

- [ ] **Step 5: Guard mutation entry points**

Change the three mutation entry points so an internal invocation cannot open or submit management behavior for a read-only role:

```tsx
const openCreate = () => {
  if (!canManageGroups) return;
  setErr(null);
  setEdit({ ...EMPTY });
};

const openEdit = (group: UserGroupView) => {
  if (!canManageGroups) return;
  setErr(null);
  setEdit({
    id: group.id,
    name: group.name,
    isDefault: group.isDefault,
    permissions: knownPermissions(group.permissions),
  });
};

const onSubmit = async (event: FormEvent) => {
  event.preventDefault();
  if (!canManageGroups || !edit) return;
  setSubmitting(true);
  setErr(null);
  const dto: UserGroupInput = {
    name: edit.name.trim(),
    isDefault: edit.isDefault,
    permissions: edit.permissions,
  };
  try {
    if (edit.id) await updateUserGroup(edit.id, dto);
    else await createUserGroup(dto);
    setEdit(null);
    await reload();
  } catch (error) {
    setErr(error instanceof Error ? error.message : '保存失败');
  } finally {
    setSubmitting(false);
  }
};

const onDelete = async (group: UserGroupView) => {
  if (!canManageGroups) return;
  if (!(await confirmDialog({
    title: '删除用户组',
    message: `确认删除用户组「${group.name}」？如果仍有关联用户，后端可能拒绝删除。`,
    confirmLabel: '删除',
    tone: 'danger',
  }))) return;
  try {
    await deleteUserGroup(group.id);
    await reload();
  } catch (error) {
    await alertDialog({
      title: '删除失败',
      message: error instanceof Error ? error.message : '删除失败',
      tone: 'danger',
    });
  }
};
```

- [ ] **Step 6: Render the role-truthful UI**

Render the header action only for managers:

```tsx
{canManageGroups && (
  <button type="button" onClick={openCreate} className={fluentButton('primary')}>
    <Plus className="h-4 w-4" /> 新建用户组
  </button>
)}
```

Add the read-only notice after the header:

```tsx
{!canManageGroups && (
  <div role="note" className="border border-[#C8C6C4] bg-[#F5F5F5] px-4 py-3 text-sm text-[#605E5C]">
    代理管理员可查看用户组配置；新建、编辑和删除由系统管理员负责。
  </div>
)}
```

Render both the operations header and operations cells only when `canManageGroups` is true:

```tsx
{canManageGroups && <th className={`${fluentTable.th} text-right`}>操作</th>}
```

```tsx
{canManageGroups && (
  <td className={`${fluentTable.td} text-right`}>
    <div className="inline-flex gap-2">
      <button type="button" onClick={() => openEdit(g)} aria-label={`编辑 ${g.name}`} className={fluentButton('subtle')}>编辑</button>
      <button type="button" onClick={() => void onDelete(g)} aria-label={`删除 ${g.name}`} className={fluentButton('danger')}>
        <Trash2 className="h-4 w-4" /> 删除
      </button>
    </div>
  </td>
)}
```

- [ ] **Step 7: Run the focused test and verify GREEN**

Run:

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/UserGroups.spec.tsx
```

Expected: all `UserGroups.spec.tsx` tests pass, including the new agent read-only test and the existing system-administrator mutation tests.

- [ ] **Step 8: Run Web regression gates**

Run:

```powershell
corepack pnpm@10.33.2 --filter web lint
corepack pnpm@10.33.2 --filter web test
corepack pnpm@10.33.2 --filter web build
```

Expected: every command exits zero. Existing warnings are reported honestly and are not treated as failures.

- [ ] **Step 9: Review the diff and commit**

Run:

```powershell
git diff --check
git diff -- packages/web/src/components/UserGroups.tsx packages/web/src/components/UserGroups.spec.tsx
git status --short
```

Expected: only the planned component and test changes are present, with no whitespace errors.

Commit:

```powershell
git add -- packages/web/src/components/UserGroups.tsx packages/web/src/components/UserGroups.spec.tsx
git commit -m "fix(web): align user-group controls with roles"
```
