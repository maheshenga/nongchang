# User Group Truthfulness P3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the user-group UI match current role-only authorization truth.

**Architecture:** Keep backend behavior unchanged. User groups still store `permissions` as future metadata, but the web page must not tell operators that group permissions are enforced today.

**Tech Stack:** pnpm 10.33.2, React 19, Vitest, Testing Library.

---

## Scope Boundary

This implements the short-term version of Phase 3 from `docs/superpowers/specs/2026-07-04-production-hardening-design.md`.

It does not add `@Permission`, `PermissionGuard`, permission caches, or per-action authorization. Those are the full permission design and need a separate plan.

## File Structure

- Create `packages/web/src/components/UserGroups.spec.tsx`: proves production wording does not claim enforced group permissions and that permission values remain saved as metadata.
- Modify `packages/web/src/components/UserGroups.tsx`: rename visible labels from "permissions" to "permission remarks"/"reserved metadata" and remove enforced-authorization claims.

## Task 1: User Group UI Truthfulness

**Files:**
- Create: `packages/web/src/components/UserGroups.spec.tsx`
- Modify: `packages/web/src/components/UserGroups.tsx`

- [ ] **Step 1: Write the failing UI truthfulness test**

Create `packages/web/src/components/UserGroups.spec.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserGroupView } from '@nongchang/shared';

const listUserGroupsMock = vi.fn();
const createUserGroupMock = vi.fn();
const updateUserGroupMock = vi.fn();
const deleteUserGroupMock = vi.fn();

vi.mock('../api/user-group', () => ({
  listUserGroups: () => listUserGroupsMock(),
  createUserGroup: (...args: unknown[]) => createUserGroupMock(...args),
  updateUserGroup: (...args: unknown[]) => updateUserGroupMock(...args),
  deleteUserGroup: (...args: unknown[]) => deleteUserGroupMock(...args),
}));

import UserGroups from './UserGroups';

const groups: UserGroupView[] = [
  {
    id: 'group-1',
    name: '记录员',
    isDefault: true,
    permissions: ['record:create'],
    createdAt: '2026-07-04T00:00:00.000Z',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  listUserGroupsMock.mockResolvedValue(groups);
  createUserGroupMock.mockResolvedValue(groups[0]);
  updateUserGroupMock.mockResolvedValue(groups[0]);
  deleteUserGroupMock.mockResolvedValue({ ok: true });
});

describe('UserGroups production wording', () => {
  it('does not claim group permission metadata is enforced authorization', async () => {
    render(<UserGroups />);
    await screen.findByText('记录员');

    expect(screen.getByRole('heading', { name: '用户分组' })).toBeTruthy();
    expect(screen.getByText(/当前系统仍以角色作为接口鉴权依据/)).toBeTruthy();
    expect(screen.getByText(/权限备注暂不参与接口放行/)).toBeTruthy();
    expect(screen.queryByText(/用户组与权限/)).toBeNull();
    expect(screen.queryByText(/按组内权限放行/)).toBeNull();
    expect(screen.queryByText(/叠加式/)).toBeNull();
  });

  it('still saves permission metadata for future rollout', async () => {
    render(<UserGroups />);
    await screen.findByText('记录员');

    fireEvent.click(screen.getByRole('button', { name: /新建用户组/ }));
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '采收员' } });
    fireEvent.click(screen.getByLabelText('创建农事记录'));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(createUserGroupMock).toHaveBeenCalledWith({
        name: '采收员',
        isDefault: false,
        permissions: ['record:create'],
      });
    });
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
corepack pnpm@10.33.2 --filter web test -- packages/web/src/components/UserGroups.spec.tsx
```

Expected: FAIL because the current page says user groups and permissions are enforced.

- [ ] **Step 3: Update visible wording only**

In `packages/web/src/components/UserGroups.tsx`:

- Change the page heading to `用户分组`.
- Change the explanatory paragraph to `微信新注册用户默认进入「默认用户组」。当前系统仍以角色作为接口鉴权依据；下方权限备注暂不参与接口放行，仅作为后续精细权限上线前的分组元数据。`
- Change the table header `权限` to `权限备注`.
- Change the empty permission label from `无` to `未备注`.
- Change the modal label `权限点` to `权限备注（暂不参与接口鉴权）`.
- Keep the stored `permissions` array and API payload unchanged.

- [ ] **Step 4: Run focused web test and lint**

Run:

```bash
corepack pnpm@10.33.2 --filter web test -- packages/web/src/components/UserGroups.spec.tsx
corepack pnpm@10.33.2 --filter web lint
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git -c safe.directory=E:/code/nongchang/.worktrees/production-user-groups-p3 add docs/superpowers/plans/2026-07-04-user-group-truthfulness-p3.md packages/web/src/components/UserGroups.tsx packages/web/src/components/UserGroups.spec.tsx
git -c safe.directory=E:/code/nongchang/.worktrees/production-user-groups-p3 commit -m "fix(web): make user group permissions truthful"
```

## Task 2: Final Verification

- [ ] **Step 1: Run P3 focused checks**

```bash
corepack pnpm@10.33.2 --filter web test -- packages/web/src/components/UserGroups.spec.tsx
corepack pnpm@10.33.2 --filter web lint
```

- [ ] **Step 2: Run full unit suite**

```bash
corepack pnpm@10.33.2 test:unit
```

- [ ] **Step 3: Audit diff**

```bash
git -c safe.directory=E:/code/nongchang/.worktrees/production-user-groups-p3 status --short
git -c safe.directory=E:/code/nongchang/.worktrees/production-user-groups-p3 diff --stat codex/production-surface-phase-1-2..HEAD
```
