# Task 13 Default Tenant Group Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New tenants and automatically-created default user groups should start with the connected production permissions needed by the real guarded interfaces.

**Architecture:** Add one backend default permission constant near the user-group module and reuse it from both tenant creation and default-group creation. Keep manual user-group create/update behavior unchanged: when an admin creates a non-default group without permissions, it still gets an empty permission list.

**Tech Stack:** NestJS 10, Prisma 5, Vitest, `@nongchang/shared` `Permission` enum, pnpm 10.33.2.

## Global Constraints

- Worktree: `E:/code/nongchang/.worktrees/saas-audit-priority-fixes`.
- Branch: `codex/saas-audit-priority-fixes`.
- One reviewed and verified commit for this task.
- Do not commit `.superpowers/` scratch files.
- Follow TDD: red test first, minimal implementation, green verification.
- Default connected permissions must be exactly: `record:create`, `record:view`, `field:view`, `batch:view`, `trace:view`.

---

## File Map

- Create: `packages/backend/src/modules/user-group/default-permissions.ts`
  - Exports `DEFAULT_USER_GROUP_PERMISSIONS`.
- Modify: `packages/backend/src/modules/tenant/tenant.service.ts`
  - Use the shared default permissions when seeding the default group for a new tenant.
- Modify: `packages/backend/src/modules/tenant/tenant.service.spec.ts`
  - Assert `tx.userGroup.create` receives the connected default permissions.
- Modify: `packages/backend/src/modules/user-group/user-group.service.ts`
  - Use the shared default permissions when `ensureDefault()` creates a missing default group.
- Modify: `packages/backend/src/modules/user-group/user-group.service.spec.ts`
  - Assert `ensureDefault()` creates the group with connected default permissions and still reuses existing default groups unchanged.

---

### Task 13: Default Tenant Group Permissions

**Files:**
- Create: `packages/backend/src/modules/user-group/default-permissions.ts`
- Modify: `packages/backend/src/modules/tenant/tenant.service.ts`
- Modify: `packages/backend/src/modules/tenant/tenant.service.spec.ts`
- Modify: `packages/backend/src/modules/user-group/user-group.service.ts`
- Modify: `packages/backend/src/modules/user-group/user-group.service.spec.ts`

**Interfaces:**
- Produces: `DEFAULT_USER_GROUP_PERMISSIONS: readonly Permission[]`.
- Consumes: `Permission` from `@nongchang/shared`.

- [x] **Step 1: Write failing tests**

In `packages/backend/src/modules/tenant/tenant.service.spec.ts`, update the create-tenant expectation:

```ts
expect(prisma.__tx.userGroup.create).toHaveBeenCalledWith({
  data: {
    tenantId: 'tenant-new',
    name: '默认用户组',
    isDefault: true,
    permissions: ['record:create', 'record:view', 'field:view', 'batch:view', 'trace:view'],
  },
});
```

In `packages/backend/src/modules/user-group/user-group.service.spec.ts`, update the `ensureDefault` test:

```ts
expect(g.permissions).toEqual(['record:create', 'record:view', 'field:view', 'batch:view', 'trace:view']);
```

- [x] **Step 2: Verify red**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/tenant/tenant.service.spec.ts src/modules/user-group/user-group.service.spec.ts
```

Expected: fail because both services currently create default groups with `permissions: []`.

- [x] **Step 3: Add shared default permission constant**

Create `packages/backend/src/modules/user-group/default-permissions.ts`:

```ts
import { Permission } from '@nongchang/shared';

export const DEFAULT_USER_GROUP_PERMISSIONS = [
  Permission.RECORD_CREATE,
  Permission.RECORD_VIEW,
  Permission.FIELD_VIEW,
  Permission.BATCH_VIEW,
  Permission.TRACE_VIEW,
] as const;
```

- [x] **Step 4: Use the constant in services**

In `packages/backend/src/modules/tenant/tenant.service.ts`, import:

```ts
import { DEFAULT_USER_GROUP_PERMISSIONS } from '../user-group/default-permissions';
```

Change default group creation to:

```ts
permissions: [...DEFAULT_USER_GROUP_PERMISSIONS],
```

In `packages/backend/src/modules/user-group/user-group.service.ts`, import the same constant and change `ensureDefault()` creation to:

```ts
permissions: [...DEFAULT_USER_GROUP_PERMISSIONS],
```

- [x] **Step 5: Verify green**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/tenant/tenant.service.spec.ts src/modules/user-group/user-group.service.spec.ts
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit
corepack pnpm@10.33.2 --filter @nongchang/backend build
git -c safe.directory=E:/code/nongchang/.worktrees/saas-audit-priority-fixes diff --check
```

Expected: all commands exit 0. `diff --check` may print LF-to-CRLF warnings only.

- [x] **Step 6: Review and commit**

Review:

```bash
git -c safe.directory=E:/code/nongchang/.worktrees/saas-audit-priority-fixes diff -- packages/backend/src/modules/user-group/default-permissions.ts packages/backend/src/modules/tenant/tenant.service.ts packages/backend/src/modules/tenant/tenant.service.spec.ts packages/backend/src/modules/user-group/user-group.service.ts packages/backend/src/modules/user-group/user-group.service.spec.ts docs/superpowers/plans/2026-07-07-task-13-default-tenant-group-permissions.md
```

Request code review for the task diff. Fix Critical or Important findings.

Commit:

```bash
git add packages/backend/src/modules/user-group/default-permissions.ts packages/backend/src/modules/tenant/tenant.service.ts packages/backend/src/modules/tenant/tenant.service.spec.ts packages/backend/src/modules/user-group/user-group.service.ts packages/backend/src/modules/user-group/user-group.service.spec.ts docs/superpowers/plans/2026-07-07-task-13-default-tenant-group-permissions.md
git commit -m "fix(tenant): seed default group permissions"
```
