# User Group Permissions P2-B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make user-group permission metadata participate in backend authorization for a first, narrow set of farm-record APIs without changing tenant/admin role boundaries.

**Architecture:** Keep existing role authorization as the coarse gate. Add an opt-in `@Permissions(...)` decorator plus a global `PermissionsGuard` that only runs when a route declares permissions; platform, system, and agent administrators bypass group permission metadata, while merchant/member-style operational users must have all declared permissions in their assigned `UserGroup`. Start with farm-record create/list coverage so the UI can truthfully say only the connected permission keys are enforced.

**Tech Stack:** NestJS guards/decorators, Prisma user-group relation, shared TypeScript permission constants, Vitest unit/component tests, React/Tailwind admin UI.

---

## File Structure

- Create `packages/backend/src/common/decorators/permissions.decorator.ts`
  - Owns `PERMISSIONS_KEY` metadata and `Permissions(...permissions)` decorator.
- Create `packages/backend/src/common/guards/permissions.guard.ts`
  - Owns runtime group-permission lookup and fail-closed enforcement for annotated routes.
- Create `packages/backend/src/common/guards/permissions.guard.spec.ts`
  - Covers bypass roles, allow/deny behavior, missing group, missing user, and malformed permission JSON.
- Modify `packages/backend/src/app.module.ts`
  - Registers `PermissionsGuard` after `RolesGuard`.
- Modify `packages/shared/src/enums/index.ts`
  - Adds shared `Permission` constants and `Permission` type for known permission keys.
- Modify `packages/backend/src/modules/farm-record/farm-record.controller.ts`
  - Adds `@Permissions(Permission.RECORD_CREATE)` to `POST /farm-records`.
  - Adds `@Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN, Role.MERCHANT)` and `@Permissions(Permission.RECORD_VIEW)` to `GET /farm-records`.
- Create `packages/backend/src/modules/farm-record/farm-record.controller.spec.ts`
  - Verifies permission metadata is attached to create/list routes.
- Modify `packages/web/src/components/UserGroups.tsx`
  - Replaces "metadata only / not enforced" wording with narrow truthful wording: only connected interfaces enforce selected permissions.
- Modify `packages/web/src/components/UserGroups.spec.tsx`
  - Updates component tests so stale "metadata only" copy cannot regress.
- Create `packages/backend/prisma/migrations/20260706103000_user_group_record_permission_backfill/migration.sql`
  - Backfills default record permissions and assigns active merchants without a group to the default group.
- Modify `packages/backend/prisma/seed.ts`
  - Keeps demo merchants assigned to a record-permission group.
- Modify `packages/backend/test/supply.e2e-spec.ts`
  - Ensures existing farm-record e2e fixtures explicitly grant record permissions before expecting merchant create/list access.

---

### Task 1: Backend Permission Guard Foundation

**Files:**
- Create: `packages/backend/src/common/decorators/permissions.decorator.ts`
- Create: `packages/backend/src/common/guards/permissions.guard.ts`
- Create: `packages/backend/src/common/guards/permissions.guard.spec.ts`
- Modify: `packages/backend/src/app.module.ts`
- Modify: `packages/shared/src/enums/index.ts`

- [ ] **Step 1: Write failing guard tests**

Add `packages/backend/src/common/guards/permissions.guard.spec.ts` with these behaviors:

```typescript
import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { Permission, Role } from '@nongchang/shared';
import { PermissionsGuard } from './permissions.guard';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

function contextWith(user: Record<string, unknown>, required: string[]) {
  const handler = () => undefined;
  Reflect.defineMetadata(PERMISSIONS_KEY, required, handler);
  return {
    getHandler: () => handler,
    getClass: () => class TestController {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
}

function makeGuard(row: unknown) {
  const prisma = {
    user: {
      findFirst: vi.fn().mockResolvedValue(row),
    },
  } as any;
  return { guard: new PermissionsGuard(new Reflector(), prisma), prisma };
}

describe('PermissionsGuard', () => {
  it('allows routes with no permission metadata without querying Prisma', async () => {
    const { guard, prisma } = makeGuard(null);
    const handler = () => undefined;
    const context = {
      getHandler: () => handler,
      getClass: () => class TestController {},
      switchToHttp: () => ({ getRequest: () => ({ user: undefined }) }),
    } as any;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('bypasses group permissions for tenant administrators', async () => {
    const { guard, prisma } = makeGuard(null);

    await expect(
      guard.canActivate(contextWith({ userId: 'admin-1', tenantId: 't1', role: Role.SYSTEM_ADMIN }, [Permission.RECORD_CREATE])),
    ).resolves.toBe(true);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('allows a merchant whose group contains all required permissions', async () => {
    const { guard, prisma } = makeGuard({ group: { permissions: [Permission.RECORD_CREATE, Permission.RECORD_VIEW] } });

    await expect(
      guard.canActivate(contextWith({ userId: 'u1', tenantId: 't1', role: Role.MERCHANT }, [Permission.RECORD_CREATE])),
    ).resolves.toBe(true);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'u1', tenantId: 't1' },
      select: { group: { select: { permissions: true } } },
    });
  });

  it('rejects a merchant missing the required group permission', async () => {
    const { guard } = makeGuard({ group: { permissions: [Permission.RECORD_VIEW] } });

    await expect(
      guard.canActivate(contextWith({ userId: 'u1', tenantId: 't1', role: Role.MERCHANT }, [Permission.RECORD_CREATE])),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects when the user has no group or malformed permissions', async () => {
    const noGroup = makeGuard({ group: null });
    await expect(
      noGroup.guard.canActivate(contextWith({ userId: 'u1', tenantId: 't1', role: Role.MERCHANT }, [Permission.RECORD_CREATE])),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const malformed = makeGuard({ group: { permissions: { bad: true } } });
    await expect(
      malformed.guard.canActivate(contextWith({ userId: 'u1', tenantId: 't1', role: Role.MERCHANT }, [Permission.RECORD_CREATE])),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
```

- [ ] **Step 2: Run the guard test and verify RED**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/common/guards/permissions.guard.spec.ts
```

Expected: FAIL because `permissions.guard.ts`, `permissions.decorator.ts`, and shared `Permission` constants do not exist yet.

- [ ] **Step 3: Add shared permission constants**

In `packages/shared/src/enums/index.ts`, add after `Role`:

```typescript
export const Permission = {
  RECORD_CREATE: 'record:create',
  RECORD_VIEW: 'record:view',
  TRACE_VIEW: 'trace:view',
  BATCH_VIEW: 'batch:view',
  FIELD_VIEW: 'field:view',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];
```

Do not narrow `userGroupInputSchema` yet; existing groups may contain unknown strings from earlier metadata-only usage, and this P should not make editing old groups fail.

- [ ] **Step 4: Add the permission decorator**

Create `packages/backend/src/common/decorators/permissions.decorator.ts`:

```typescript
import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@nongchang/shared';

export const PERMISSIONS_KEY = 'permissions';
export const Permissions = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);
```

- [ ] **Step 5: Add the permission guard implementation**

Create `packages/backend/src/common/guards/permissions.guard.ts`:

```typescript
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission, Role } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

const BYPASS_ROLES: Role[] = [Role.PLATFORM_ADMIN, Role.SYSTEM_ADMIN, Role.AGENT_ADMIN];

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(), context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest().user;
    if (!user?.userId || !user?.tenantId || !user?.role) throw new ForbiddenException('用户组权限不足');
    if (BYPASS_ROLES.includes(user.role)) return true;

    const row = await this.prisma.user.findFirst({
      where: { id: user.userId, tenantId: user.tenantId },
      select: { group: { select: { permissions: true } } },
    }) as { group: { permissions: unknown } | null } | null;

    const granted = Array.isArray(row?.group?.permissions)
      ? row.group.permissions.filter((p): p is string => typeof p === 'string')
      : [];
    const allowed = required.every((permission) => granted.includes(permission));
    if (!allowed) throw new ForbiddenException('用户组权限不足');
    return true;
  }
}
```

- [ ] **Step 6: Register the guard globally**

Modify `packages/backend/src/app.module.ts`:

```typescript
import { PermissionsGuard } from './common/guards/permissions.guard';
```

and add it after `RolesGuard`:

```typescript
{ provide: APP_GUARD, useClass: RolesGuard },
{ provide: APP_GUARD, useClass: PermissionsGuard },
```

- [ ] **Step 7: Run tests and build for Task 1**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/common/guards/permissions.guard.spec.ts src/common/guards/roles.guard.spec.ts
corepack pnpm@10.33.2 --filter @nongchang/shared build
```

Expected: PASS.

---

### Task 2: Farm Record Permission Metadata Enforcement

**Files:**
- Modify: `packages/backend/src/modules/farm-record/farm-record.controller.ts`
- Create: `packages/backend/src/modules/farm-record/farm-record.controller.spec.ts`

- [ ] **Step 1: Write failing controller metadata tests**

Create `packages/backend/src/modules/farm-record/farm-record.controller.spec.ts`:

```typescript
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { Permission, Role } from '@nongchang/shared';
import { PERMISSIONS_KEY } from '../../common/decorators/permissions.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { FarmRecordController } from './farm-record.controller';

describe('FarmRecordController authorization metadata', () => {
  it('requires record:create permission for creating farm records', () => {
    const handler = FarmRecordController.prototype.create;

    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([Role.SYSTEM_ADMIN, Role.MERCHANT]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([Permission.RECORD_CREATE]);
  });

  it('requires record:view permission and explicit supported roles for listing farm records', () => {
    const handler = FarmRecordController.prototype.list;

    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([Role.SYSTEM_ADMIN, Role.AGENT_ADMIN, Role.MERCHANT]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([Permission.RECORD_VIEW]);
  });
});
```

- [ ] **Step 2: Run the controller test and verify RED**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/farm-record/farm-record.controller.spec.ts
```

Expected: FAIL because no `@Permissions` metadata is attached yet, and `GET /farm-records` has no explicit `@Roles`.

- [ ] **Step 3: Annotate farm-record routes**

Modify `packages/backend/src/modules/farm-record/farm-record.controller.ts` imports:

```typescript
import { AuthUser, CreateFarmRecordDto, createFarmRecordSchema, FarmRecordQueryDto, farmRecordQuerySchema, Permission, Role, UpdateFarmRecordStatusDto, updateFarmRecordStatusSchema } from '@nongchang/shared';
import { Permissions } from '../../common/decorators/permissions.decorator';
```

Apply route metadata:

```typescript
@Post() @Roles(Role.SYSTEM_ADMIN, Role.MERCHANT) @Permissions(Permission.RECORD_CREATE)
```

```typescript
@Get() @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN, Role.MERCHANT) @Permissions(Permission.RECORD_VIEW)
```

Leave `PATCH /farm-records/:id/status` role-based in this P because there is no existing UI/catalog permission key for status review yet.

- [ ] **Step 4: Run backend focused tests**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/farm-record/farm-record.controller.spec.ts src/common/guards/permissions.guard.spec.ts src/modules/farm-record/farm-record.service.spec.ts
```

Expected: PASS.

---

### Task 3: Admin UI Truthful Permission Copy

**Files:**
- Modify: `packages/web/src/components/UserGroups.tsx`
- Modify: `packages/web/src/components/UserGroups.spec.tsx`

- [ ] **Step 1: Update failing UI tests first**

Modify `packages/web/src/components/UserGroups.spec.tsx`:

```typescript
describe('UserGroups permission enforcement wording', () => {
  it('states that only connected interfaces enforce selected group permissions', async () => {
    render(<UserGroups />);
    await screen.findByText('记录员');

    expect(screen.getByRole('heading', { name: '用户分组' })).toBeTruthy();
    expect(screen.getByText(/已接入接口会按用户组权限放行/)).toBeTruthy();
    expect(screen.getByText(/当前已接入:创建农事记录、查看农事记录/)).toBeTruthy();
    expect(screen.queryByText(/当前系统仍以角色作为接口鉴权依据/)).toBeNull();
    expect(screen.queryByText(/暂不参与接口放行/)).toBeNull();
  });

  it('saves selected permissions used by connected interfaces', async () => {
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

If the file currently displays mojibake because of terminal encoding, edit against the actual UTF-8 source in the editor/worktree and keep the visible Chinese strings as proper UTF-8.

- [ ] **Step 2: Run the UI test and verify RED**

Run:

```bash
corepack pnpm@10.33.2 --filter web test -- src/components/UserGroups.spec.tsx
```

Expected: FAIL because `UserGroups.tsx` still says permissions are metadata only.

- [ ] **Step 3: Update the UI copy**

In `packages/web/src/components/UserGroups.tsx`:

```typescript
// 已接入的接口会按这些权限放行；未接入接口仍只按角色与业务范围鉴权。
const PERMISSION_OPTIONS: { value: string; label: string }[] = [
```

Replace the page note:

```tsx
<p className="text-xs text-slate-500 -mt-3">微信新注册用户默认进入「默认用户组」。已接入接口会按用户组权限放行；当前已接入:创建农事记录、查看农事记录。未接入接口仍按角色与业务范围鉴权。</p>
```

Replace table/form labels:

```tsx
<th className="text-left px-5 py-3 font-bold">接口权限</th>
```

```tsx
<td className="px-5 py-3 text-slate-500">{g.permissions.length ? g.permissions.length + ' 项' : '未配置'}</td>
```

```tsx
<label className="block text-xs font-bold text-slate-600 mb-2">接口权限（部分接口已接入）</label>
```

- [ ] **Step 4: Run web focused tests**

Run:

```bash
corepack pnpm@10.33.2 --filter web test -- src/components/UserGroups.spec.tsx
```

Expected: PASS.

---

### Task 4: Final Verification, Review, and Commit

**Files:**
- All files changed by Tasks 1-3.

- [ ] **Step 1: Run focused backend verification**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/common/guards/permissions.guard.spec.ts src/common/guards/roles.guard.spec.ts src/modules/farm-record/farm-record.controller.spec.ts src/modules/farm-record/farm-record.service.spec.ts
```

Expected: PASS.

- [ ] **Step 2: Run focused web verification**

Run:

```bash
corepack pnpm@10.33.2 --filter web test -- src/components/UserGroups.spec.tsx
```

Expected: PASS.

- [ ] **Step 3: Run builds and lint**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/shared build
corepack pnpm@10.33.2 --filter @nongchang/backend build
corepack pnpm@10.33.2 --filter web lint
```

Expected: PASS.

- [ ] **Step 4: Run regression and diff hygiene**

Run:

```bash
corepack pnpm@10.33.2 test:unit
git diff --check
```

Expected: PASS. `git diff --check` may print CRLF warnings only if the repo already has CRLF normalization warnings; no whitespace errors are acceptable.

- [ ] **Step 5: Request review**

Dispatch a code-review subagent with these acceptance criteria:

```text
Review P2-B user-group permission enforcement. Confirm role gates remain coarse authorization, group permissions only affect annotated routes, admin bypass is intentional and narrow, merchant users without a valid group fail closed on annotated routes, farm-record list/create metadata matches the UI wording, and no unrelated SaaS/user-system behavior was changed.
```

- [ ] **Step 6: Fix review issues and re-run affected verification**

If review finds issues, fix them with tests first when behavior changes. Re-run the smallest affected test, then the full verification set from Steps 1-4.

- [ ] **Step 7: Commit**

Run:

```bash
git status --short
git add packages/shared/src/enums/index.ts packages/shared/src/index.ts packages/backend/src/common/decorators/permissions.decorator.ts packages/backend/src/common/guards/permissions.guard.ts packages/backend/src/common/guards/permissions.guard.spec.ts packages/backend/src/app.module.ts packages/backend/src/modules/farm-record/farm-record.controller.ts packages/backend/src/modules/farm-record/farm-record.controller.spec.ts packages/backend/prisma/migrations/20260706103000_user_group_record_permission_backfill/migration.sql packages/backend/prisma/seed.ts packages/backend/test/supply.e2e-spec.ts packages/web/src/components/UserGroups.tsx packages/web/src/components/UserGroups.spec.tsx docs/superpowers/plans/2026-07-06-user-group-permissions-p2b.md
git commit -m "feat(authz): enforce user group permissions"
```

Expected: commit succeeds on `codex/user-group-permissions-p2b`.

---

### Review Fixes: Fail-Closed Data and Fixtures

**Files:**
- Modify: `packages/backend/src/common/guards/permissions.guard.ts`
- Modify: `packages/backend/src/common/guards/permissions.guard.spec.ts`
- Create: `packages/backend/prisma/migrations/20260706103000_user_group_record_permission_backfill/migration.sql`
- Modify: `packages/backend/prisma/seed.ts`
- Modify: `packages/backend/test/supply.e2e-spec.ts`
- Modify: `packages/web/src/components/UserGroups.tsx`

- [ ] **Fix 1: Reject partially malformed permission arrays**

Add a failing test where `permissions` is `['record:create', { bad: true }]`, then change `PermissionsGuard` so any non-string element causes `ForbiddenException('用户组权限不足')`.

- [ ] **Fix 2: Backfill existing active merchants**

Add a Prisma migration that creates or reuses each tenant's default group, ensures it contains `record:create` and `record:view`, and assigns active merchants with `group_id IS NULL` to that default group.

- [ ] **Fix 3: Keep seed/e2e fixtures permission-aware**

Update `prisma/seed.ts` so demo merchants are assigned to a record-permission group. Update `supply.e2e-spec.ts` setup so farm-record e2e expectations grant `record:create` and `record:view` explicitly.

- [ ] **Fix 4: Reduce UI/backend permission drift**

Import shared `Permission` constants in `UserGroups.tsx` for permission option values instead of repeating string literals.

---

## Self-Review

- Spec coverage: The plan adds real backend enforcement for existing user-group permission metadata, keeps role authorization intact, updates truthful UI wording, and includes tests/build/lint/regression before commit.
- Placeholder scan: No TODO/TBD/fill-later placeholders are present.
- Type consistency: `Permission` is defined in shared before backend decorator/controller/tests consume it. `PERMISSIONS_KEY` is defined before guard/controller metadata tests use it. `PermissionsGuard.canActivate` is async and all guard tests await it.
- Scope control: This P intentionally does not enforce every permission option across every module. It only connects `record:create` and `record:view`, and the UI says partial interface coverage rather than implying global ACL completeness.
