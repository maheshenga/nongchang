# P25 User Group Model Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract pure user-group view/data/scope helpers out of `UserGroupService` while preserving tenant isolation, default-group behavior, and assignment authorization.

**Architecture:** Keep `UserGroupService` responsible for Prisma reads/writes, `NotFoundException`, `ForbiddenException`, and default-group side effects. Move deterministic row serialization, create/update data, default group data, tenant where, and assign-user scope construction into a focused model module with tests.

**Tech Stack:** NestJS, TypeScript, Vitest, pnpm via `corepack pnpm@10.33.2`, existing `@nongchang/shared` DTO types.

## Global Constraints

- Repository root: `E:\code\nongchang`.
- Branch: `codex/p1-truthful-product-copy`.
- Use CodeGraph before code discovery because `.codegraph/` exists.
- No API route, DTO schema, database schema, default permission list, or dependency changes.
- Keep Prisma calls and exceptions in `UserGroupService`.
- Preserve `agent_admin` fail-closed assignment behavior when `agentId` is missing.
- Run focused tests, backend build, backend unit tests, source scan, diff checks, and read-only review before commit.

---

## File Structure

- Create `packages/backend/src/modules/user-group/user-group.model.ts`
  - Owns `UserGroupRow`, `buildUserGroupView`, `buildUserGroupCreateData`, `buildUserGroupUpdateData`, `buildDefaultUserGroupCreateData`, `buildUserGroupTenantWhere`, and `buildAssignUserScope`.
- Create `packages/backend/src/modules/user-group/user-group.model.spec.ts`
  - Tests view serialization, non-array permissions fallback, create/update/default data, tenant where including empty id, and assignment scope for system/admin/agent.
- Modify `packages/backend/src/modules/user-group/user-group.service.ts`
  - Imports model helpers; keeps Prisma calls and exceptions.
- Modify `packages/backend/src/modules/user-group/user-group.service.spec.ts`
  - Add regression coverage for missing `agentId` fail-closed assignment and tenant where empty-id behavior if practical through service.

---

### Task 1: User Group Pure Model

**Files:**
- Create: `packages/backend/src/modules/user-group/user-group.model.ts`
- Create: `packages/backend/src/modules/user-group/user-group.model.spec.ts`

**Interfaces:**
- Consumes: `AuthUser`, `Role`, `UserGroupInput`, `UserGroupView` from `@nongchang/shared`.
- Produces:
  - `interface UserGroupRow`
  - `function buildUserGroupView(row: UserGroupRow): UserGroupView`
  - `function buildUserGroupCreateData(input: { tenantId: string; dto: UserGroupInput }): UserGroupCreateData`
  - `function buildUserGroupUpdateData(dto: UserGroupInput): UserGroupUpdateData`
  - `function buildDefaultUserGroupCreateData(input: { tenantId: string; permissions: string[] }): UserGroupCreateData`
  - `function buildUserGroupTenantWhere(input: { tenantId: string; id?: string; isDefault?: boolean }): Record<string, string | boolean>`
  - `function buildAssignUserScope(user: AuthUser): Record<string, string>`

- [ ] **Step 1: Write failing model tests**

```typescript
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { Role, type AuthUser } from '@nongchang/shared';
import {
  buildAssignUserScope,
  buildDefaultUserGroupCreateData,
  buildUserGroupCreateData,
  buildUserGroupTenantWhere,
  buildUserGroupUpdateData,
  buildUserGroupView,
  type UserGroupRow,
} from './user-group.model';

const row: UserGroupRow = {
  id: 'g1',
  tenantId: 't1',
  name: '默认农户',
  isDefault: true,
  permissions: ['record:create'],
  createdAt: new Date('2026-06-14T10:00:00.000Z'),
};

const systemUser: AuthUser = { userId: 'u1', tenantId: 't1', role: Role.SYSTEM_ADMIN, agentId: null, ownerId: null };
const agentUser: AuthUser = { userId: 'u2', tenantId: 't1', role: Role.AGENT_ADMIN, agentId: 'a1', ownerId: null };

describe('user-group.model', () => {
  it('serializes group rows to the shared view contract', () => {
    expect(buildUserGroupView(row)).toEqual({
      id: 'g1',
      name: '默认农户',
      isDefault: true,
      permissions: ['record:create'],
      createdAt: '2026-06-14T10:00:00.000Z',
    });
    expect(buildUserGroupView({ ...row, permissions: null }).permissions).toEqual([]);
  });

  it('builds create/default/update data', () => {
    expect(buildUserGroupCreateData({ tenantId: 't1', dto: { name: '农户', permissions: ['field:view'] } })).toEqual({
      tenantId: 't1',
      name: '农户',
      isDefault: false,
      permissions: ['field:view'],
    });
    expect(buildDefaultUserGroupCreateData({ tenantId: 't1', permissions: ['record:view'] })).toEqual({
      tenantId: 't1',
      name: '默认用户组',
      isDefault: true,
      permissions: ['record:view'],
    });
    expect(buildUserGroupUpdateData({ name: 'A2', permissions: ['trace:view'] })).toEqual({
      name: 'A2',
      permissions: ['trace:view'],
    });
  });

  it('builds tenant where without dropping empty ids', () => {
    expect(buildUserGroupTenantWhere({ tenantId: 't1' })).toEqual({ tenantId: 't1' });
    expect(buildUserGroupTenantWhere({ tenantId: 't1', id: '' })).toEqual({ tenantId: 't1', id: '' });
    expect(buildUserGroupTenantWhere({ tenantId: 't1', isDefault: true })).toEqual({ tenantId: 't1', isDefault: true });
  });

  it('builds assignment scope and fails closed for invalid agent admin', () => {
    expect(buildAssignUserScope(systemUser)).toEqual({ tenantId: 't1' });
    expect(buildAssignUserScope(agentUser)).toEqual({ tenantId: 't1', agentId: 'a1' });
    expect(() => buildAssignUserScope({ ...agentUser, agentId: null })).toThrow(ForbiddenException);
  });
});
```

- [ ] **Step 2: Run RED**

Run: `corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/user-group/user-group.model.spec.ts`

Expected: FAIL because `./user-group.model` does not exist.

- [ ] **Step 3: Implement minimal model helpers**

```typescript
import { ForbiddenException } from '@nestjs/common';
import type { AuthUser, UserGroupInput, UserGroupView } from '@nongchang/shared';
import { Role } from '@nongchang/shared';

export interface UserGroupRow {
  id: string;
  tenantId: string;
  name: string;
  isDefault: boolean;
  permissions: unknown;
  createdAt: Date;
}

export interface UserGroupCreateData {
  tenantId: string;
  name: string;
  isDefault: boolean;
  permissions: string[];
}

export type UserGroupUpdateData = Partial<Omit<UserGroupCreateData, 'tenantId'>>;

export function buildUserGroupView(row: UserGroupRow): UserGroupView {
  return {
    id: row.id,
    name: row.name,
    isDefault: row.isDefault,
    permissions: Array.isArray(row.permissions) ? (row.permissions as string[]) : [],
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

export function buildUserGroupCreateData(input: { tenantId: string; dto: UserGroupInput }): UserGroupCreateData {
  return {
    tenantId: input.tenantId,
    name: input.dto.name,
    isDefault: input.dto.isDefault ?? false,
    permissions: input.dto.permissions ?? [],
  };
}

export function buildUserGroupUpdateData(dto: UserGroupInput): UserGroupUpdateData {
  const data: UserGroupUpdateData = {};
  if (dto.name !== undefined) data.name = dto.name;
  if (dto.isDefault !== undefined) data.isDefault = dto.isDefault;
  if (dto.permissions !== undefined) data.permissions = dto.permissions;
  return data;
}

export function buildDefaultUserGroupCreateData(input: { tenantId: string; permissions: string[] }): UserGroupCreateData {
  return {
    tenantId: input.tenantId,
    name: '默认用户组',
    isDefault: true,
    permissions: [...input.permissions],
  };
}

export function buildUserGroupTenantWhere(input: { tenantId: string; id?: string; isDefault?: boolean }): Record<string, string | boolean> {
  const where: Record<string, string | boolean> = { tenantId: input.tenantId };
  if (input.id !== undefined) where.id = input.id;
  if (input.isDefault !== undefined) where.isDefault = input.isDefault;
  return where;
}

export function buildAssignUserScope(user: AuthUser): Record<string, string> {
  const scope: Record<string, string> = { tenantId: user.tenantId };
  if (user.role === Role.AGENT_ADMIN) {
    if (!user.agentId) throw new ForbiddenException('代理管理员缺少 agentId,拒绝操作');
    scope.agentId = user.agentId;
  }
  return scope;
}
```

- [ ] **Step 4: Run GREEN**

Run: `corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/user-group/user-group.model.spec.ts`

Expected: PASS, 1 file and 4 tests.

---

### Task 2: Wire UserGroupService To Model Helpers

**Files:**
- Modify: `packages/backend/src/modules/user-group/user-group.service.ts`
- Modify: `packages/backend/src/modules/user-group/user-group.service.spec.ts`

**Interfaces:**
- Consumes model helpers from Task 1.
- Produces unchanged service methods:
  - `list(user): Promise<UserGroupView[]>`
  - `create(user, dto): Promise<UserGroupView>`
  - `update(user, id, dto): Promise<UserGroupView>`
  - `remove(user, id): Promise<void>`
  - `ensureDefault(tenantId): Promise<UserGroupView>`
  - `assignUserGroup(user, dto): Promise<void>`

- [ ] **Step 1: Import model helpers and remove inline row mapper**

```typescript
import {
  buildAssignUserScope,
  buildDefaultUserGroupCreateData,
  buildUserGroupCreateData,
  buildUserGroupTenantWhere,
  buildUserGroupUpdateData,
  buildUserGroupView,
  type UserGroupRow,
} from './user-group.model';
```

- [ ] **Step 2: Replace list/create/update/remove/ensureDefault mapping**

Use:

```typescript
where: buildUserGroupTenantWhere({ tenantId: user.tenantId })
where: buildUserGroupTenantWhere({ tenantId: user.tenantId, id })
where: buildUserGroupTenantWhere({ tenantId, isDefault: true })
data: buildUserGroupCreateData({ tenantId: user.tenantId, dto })
data: buildUserGroupUpdateData(dto)
data: buildDefaultUserGroupCreateData({ tenantId, permissions: DEFAULT_USER_GROUP_PERMISSIONS })
return buildUserGroupView(row)
```

- [ ] **Step 3: Replace assignment scope construction**

```typescript
const scope = buildAssignUserScope(user);
const target = await this.prisma.user.findFirst({
  where: { ...scope, id: dto.userId },
});
```

- [ ] **Step 4: Add service regressions for agent scope and empty id**

Append to `packages/backend/src/modules/user-group/user-group.service.spec.ts`:

```typescript
it('assignUserGroup agent_admin 缺少 agentId 时 fail-closed', async () => {
  const agent = { userId: 'a', tenantId: 't1', role: Role.AGENT_ADMIN, agentId: null, ownerId: null } as AuthUser;
  await expect(svc.assignUserGroup(agent, { userId: 'mem1', groupId: null })).rejects.toThrow('代理管理员缺少 agentId');
});

it('update 空 id 不退化为租户任意组', async () => {
  await svc.create(user, { name: 'A' });
  await expect(svc.update(user, '', { name: 'B' })).rejects.toBeInstanceOf(NotFoundException);
});
```

If `Role` is not imported in the service spec, change the import to:

```typescript
import { Role, type AuthUser } from '@nongchang/shared';
```

- [ ] **Step 5: Run focused service tests**

Run: `corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/user-group/user-group.model.spec.ts src/modules/user-group/user-group.service.spec.ts`

Expected: PASS, model and service tests all green.

---

### Task 3: Verification, Review, And Commit

**Files:**
- Stage only the P25 plan plus user-group model/service/spec files.

- [ ] **Step 1: Run backend build**

Run: `corepack pnpm@10.33.2 --filter @nongchang/backend build`

Expected: exit 0 after Prisma generate and Nest build.

- [ ] **Step 2: Run backend unit suite**

Run: `corepack pnpm@10.33.2 --filter @nongchang/backend test:unit`

Expected: exit 0 with all backend tests passing.

- [ ] **Step 3: Scan modified source files**

Run:

```powershell
Select-String -Path packages/backend/src/modules/user-group/user-group.service.ts,packages/backend/src/modules/user-group/user-group.service.spec.ts,packages/backend/src/modules/user-group/user-group.model.ts,packages/backend/src/modules/user-group/user-group.model.spec.ts -Pattern '�|鍔|瘑|浠|绉|鏌|缂|鐩|鏂|鍦|鏀|甯|鍗|绠|悊|疆|閽|熸|涓|澶|宸|浣|瓒|璀|喕||||||'
```

Expected: no matches.

- [ ] **Step 4: Run diff checks**

Run:

```powershell
git -c safe.directory=E:/code/nongchang diff --check
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-10-p25-user-group-model-boundary.md packages/backend/src/modules/user-group/user-group.model.ts packages/backend/src/modules/user-group/user-group.model.spec.ts packages/backend/src/modules/user-group/user-group.service.ts packages/backend/src/modules/user-group/user-group.service.spec.ts
git -c safe.directory=E:/code/nongchang diff --cached --check
```

Expected: exit 0. LF-to-CRLF warnings are acceptable on Windows if the exit code is 0.

- [ ] **Step 5: Request read-only review**

Dispatch a read-only reviewer for the staged P25 diff. Fix any Critical or Important findings, then rerun focused tests and build.

- [ ] **Step 6: Commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang commit -m "refactor(backend): extract user-group model helpers"
```

Expected: commit created on `codex/p1-truthful-product-copy`.

---

## Self-Review

- Spec coverage: Task 1 covers pure helper extraction; Task 2 covers service wiring and assignment regressions; Task 3 covers verification, review, and commit.
- Placeholder scan: no deferred implementation markers are present.
- Type consistency: helper names and signatures are identical across task interfaces and code snippets.
