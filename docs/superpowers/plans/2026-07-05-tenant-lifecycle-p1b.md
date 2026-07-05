# Tenant Lifecycle P1-B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first safe platform-level tenant lifecycle slice: platform admins can list tenants, create a tenant with an initial tenant admin, and suspend/reactivate tenants.

**Architecture:** Introduce a `platform_admin` role while preserving the existing tenant-scoped `system_admin`, `agent_admin`, and `merchant` contracts. Keep the first slice backend-only and API-focused: shared DTOs, Prisma enum migration, a new Nest `TenantModule`, and focused tests. Password login remains `tenantCode + username`, so platform admins are normal users in a platform tenant but are the only role allowed to manage tenant lifecycle endpoints.

**Tech Stack:** NestJS, Prisma, PostgreSQL enum migration, Zod DTOs, Vitest, TypeScript, pnpm workspace.

---

## Scope

This plan implements P1-B from the user-system analysis:

1. Add a real platform-level role named `platform_admin`.
2. Add backend APIs for tenant listing, tenant creation with initial `system_admin`, and tenant status changes.
3. Make tenant lifecycle APIs accessible only to `platform_admin`.
4. Keep `system_admin` as tenant-scoped administrator, not platform administrator.

This plan intentionally does not build the frontend tenant-management page, user-group permission enforcement, or a separate ordinary-member role.

## File Structure

- Modify: `packages/shared/src/enums/index.ts`
  - Responsibility: Add the `platform_admin` role constant.
- Create: `packages/shared/src/dto/tenant.dto.ts`
  - Responsibility: Define tenant lifecycle request/response contracts.
- Modify: `packages/shared/src/index.ts`
  - Responsibility: Export tenant DTOs.
- Modify: `packages/backend/prisma/schema.prisma`
  - Responsibility: Add `platform_admin` to Prisma `Role` enum.
- Create: `packages/backend/prisma/migrations/20260705170000_platform_admin_role/migration.sql`
  - Responsibility: Add enum value in PostgreSQL.
- Create: `packages/backend/src/modules/tenant/tenant.service.ts`
  - Responsibility: Tenant lifecycle business rules and Prisma writes.
- Create: `packages/backend/src/modules/tenant/tenant.controller.ts`
  - Responsibility: HTTP routes and role boundary.
- Create: `packages/backend/src/modules/tenant/tenant.module.ts`
  - Responsibility: Wire controller and service.
- Create: `packages/backend/src/modules/tenant/tenant.service.spec.ts`
  - Responsibility: TDD coverage for create/list/status tenant lifecycle behavior.
- Create: `packages/backend/src/modules/tenant/tenant.controller.spec.ts`
  - Responsibility: Verify controller role metadata and delegation.
- Create: `packages/backend/src/common/guards/roles.guard.spec.ts`
  - Responsibility: Verify `platform_admin` route metadata rejects `system_admin`.
- Modify: `packages/backend/src/app.module.ts`
  - Responsibility: Register `TenantModule`.
- Modify: `packages/backend/prisma/seed.ts`
  - Responsibility: Create a deterministic platform tenant and `platform_admin` seed account.

---

### Task 1: Shared Contracts and Role Enum

**Files:**
- Modify: `packages/shared/src/enums/index.ts`
- Create: `packages/shared/src/dto/tenant.dto.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/backend/prisma/schema.prisma`
- Create: `packages/backend/prisma/migrations/20260705170000_platform_admin_role/migration.sql`

- [x] **Step 1: Write shared role and tenant DTO changes**

In `packages/shared/src/enums/index.ts`, change the `Role` constant to:

```typescript
export const Role = {
  PLATFORM_ADMIN: 'platform_admin',
  SYSTEM_ADMIN: 'system_admin',
  AGENT_ADMIN: 'agent_admin',
  MERCHANT: 'merchant',
} as const;
```

Create `packages/shared/src/dto/tenant.dto.ts`:

```typescript
import { z } from 'zod';

export const tenantStatusSchema = z.enum(['active', 'suspended']);
export type TenantStatus = z.infer<typeof tenantStatusSchema>;

export const createTenantSchema = z.object({
  name: z.string().min(1).max(128),
  code: z.string().min(2).max(64).regex(/^[A-Za-z0-9_-]+$/),
  adminUsername: z.string().min(3).max(64),
  adminDisplayName: z.string().min(1).max(64),
  adminPhone: z.string().max(20).optional(),
}).strict();
export type CreateTenantDto = z.infer<typeof createTenantSchema>;

export const setTenantStatusSchema = z.object({
  status: tenantStatusSchema,
});
export type SetTenantStatusInput = z.infer<typeof setTenantStatusSchema>;

export const tenantListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  status: tenantStatusSchema,
  createdAt: z.string(),
  userCount: z.number(),
  agentCount: z.number(),
});
export type TenantListItem = z.infer<typeof tenantListItemSchema>;

export const createTenantResponseSchema = tenantListItemSchema.extend({
  adminUser: z.object({
    id: z.string(),
    username: z.string(),
    role: z.literal('system_admin'),
    displayName: z.string(),
  }),
  initialPassword: z.string(),
});
export type CreateTenantResponse = z.infer<typeof createTenantResponseSchema>;
```

In `packages/shared/src/index.ts`, export the new DTOs:

```typescript
export {
  tenantStatusSchema,
  createTenantSchema,
  setTenantStatusSchema,
  tenantListItemSchema,
  createTenantResponseSchema,
} from './dto/tenant.dto';
export type {
  TenantStatus,
  CreateTenantDto,
  SetTenantStatusInput,
  TenantListItem,
  CreateTenantResponse,
} from './dto/tenant.dto';
```

In `packages/backend/prisma/schema.prisma`, update enum `Role` to include `platform_admin` before `system_admin`:

```prisma
enum Role {
  platform_admin
  system_admin
  agent_admin
  merchant
}
```

Create `packages/backend/prisma/migrations/20260705170000_platform_admin_role/migration.sql`:

```sql
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'platform_admin';
```

- [x] **Step 2: Verify shared package compiles**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/shared build
```

Expected: exit code 0.

---

### Task 2: Tenant Service TDD

**Files:**
- Create: `packages/backend/src/modules/tenant/tenant.service.spec.ts`
- Create: `packages/backend/src/modules/tenant/tenant.service.ts`

- [x] **Step 1: Write failing service tests**

Create `packages/backend/src/modules/tenant/tenant.service.spec.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role, type AuthUser } from '@nongchang/shared';
import { TenantService } from './tenant.service';

const platformAdmin: AuthUser = {
  userId: 'platform-user',
  tenantId: 'platform-tenant',
  role: Role.PLATFORM_ADMIN,
  agentId: null,
  ownerId: null,
};

function makePrisma() {
  const tx = {
    tenant: { create: vi.fn() },
    user: { create: vi.fn() },
    userGroup: { create: vi.fn() },
  };
  return {
    tenant: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn((fn: any) => fn(tx)),
    __tx: tx,
  } as any;
}

describe('TenantService', () => {
  it('lists tenants with user and agent counts for platform admins', async () => {
    const prisma = makePrisma();
    prisma.tenant.findMany.mockResolvedValue([
      {
        id: 't1',
        name: 'Tenant A',
        code: 'TENANT_A',
        status: 'active',
        createdAt: new Date('2026-07-05T00:00:00.000Z'),
        _count: { users: 2, agents: 1 },
      },
    ]);
    const rows = await new TenantService(prisma).list();
    expect(rows).toEqual([
      {
        id: 't1',
        name: 'Tenant A',
        code: 'TENANT_A',
        status: 'active',
        createdAt: '2026-07-05T00:00:00.000Z',
        userCount: 2,
        agentCount: 1,
      },
    ]);
  });

  it('creates a tenant with an initial tenant system_admin and default group', async () => {
    const prisma = makePrisma();
    prisma.tenant.findUnique.mockResolvedValue(null);
    prisma.__tx.tenant.create.mockResolvedValue({
      id: 'tenant-new',
      name: 'New Tenant',
      code: 'NEW_TENANT',
      status: 'active',
      createdAt: new Date('2026-07-05T01:00:00.000Z'),
    });
    prisma.__tx.user.create.mockResolvedValue({
      id: 'admin-new',
      username: 'admin',
      role: Role.SYSTEM_ADMIN,
      displayName: 'Tenant Admin',
    });
    const result = await new TenantService(prisma).create({
      name: 'New Tenant',
      code: 'new_tenant',
      adminUsername: 'admin',
      adminDisplayName: 'Tenant Admin',
      adminPhone: '13800000000',
    });

    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({ where: { code: 'NEW_TENANT' } });
    expect(prisma.__tx.tenant.create).toHaveBeenCalledWith({
      data: { name: 'New Tenant', code: 'NEW_TENANT', status: 'active' },
    });
    expect(prisma.__tx.user.create.mock.calls[0][0].data).toMatchObject({
      tenantId: 'tenant-new',
      username: 'admin',
      role: Role.SYSTEM_ADMIN,
      displayName: 'Tenant Admin',
      phone: '13800000000',
      status: 'active',
    });
    expect(prisma.__tx.userGroup.create).toHaveBeenCalledWith({
      data: { tenantId: 'tenant-new', name: '默认用户组', isDefault: true, permissions: [] },
    });
    expect(result.initialPassword.length).toBeGreaterThan(10);
    expect(result.adminUser).toMatchObject({ id: 'admin-new', username: 'admin', role: Role.SYSTEM_ADMIN });
  });

  it('rejects duplicate tenant codes before creating anything', async () => {
    const prisma = makePrisma();
    prisma.tenant.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(new TenantService(prisma).create({
      name: 'Duplicate',
      code: 'DUP',
      adminUsername: 'admin',
      adminDisplayName: 'Admin',
    })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('updates tenant status but refuses to suspend the actor tenant', async () => {
    const prisma = makePrisma();
    prisma.tenant.findFirst.mockResolvedValue({ id: 'tenant-a', name: 'Tenant A', code: 'TENANT_A' });
    prisma.tenant.update.mockResolvedValue({ id: 'tenant-a', status: 'suspended' });
    const result = await new TenantService(prisma).setStatus(platformAdmin, 'tenant-a', 'suspended');
    expect(result).toEqual({ id: 'tenant-a', status: 'suspended' });

    await expect(new TenantService(prisma).setStatus(platformAdmin, 'platform-tenant', 'suspended'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws NotFound when changing status for a missing tenant', async () => {
    const prisma = makePrisma();
    prisma.tenant.findFirst.mockResolvedValue(null);
    await expect(new TenantService(prisma).setStatus(platformAdmin, 'missing', 'active'))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [x] **Step 2: Run service tests to verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/tenant/tenant.service.spec.ts
```

Expected: fail because `TenantService` does not exist.

- [x] **Step 3: Implement minimal tenant service**

Create `packages/backend/src/modules/tenant/tenant.service.ts`:

```typescript
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import {
  AuthUser,
  CreateTenantDto,
  CreateTenantResponse,
  Role,
  TenantListItem,
  TenantStatus,
} from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';

interface TenantRow {
  id: string;
  name: string;
  code: string;
  status: string;
  createdAt: Date;
  _count?: { users: number; agents: number };
}

@Injectable()
export class TenantService {
  constructor(private prisma: PrismaService) {}

  private toListItem(row: TenantRow): TenantListItem {
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      status: row.status as TenantStatus,
      createdAt: row.createdAt.toISOString(),
      userCount: row._count?.users ?? 0,
      agentCount: row._count?.agents ?? 0,
    };
  }

  list(): Promise<TenantListItem[]> {
    return this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        code: true,
        status: true,
        createdAt: true,
        _count: { select: { users: true, agents: true } },
      },
    }).then(rows => rows.map(row => this.toListItem(row as TenantRow)));
  }

  async create(dto: CreateTenantDto): Promise<CreateTenantResponse> {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.tenant.findUnique({ where: { code } });
    if (existing) throw new ConflictException('Tenant code already exists');

    const initialPassword = randomBytes(12).toString('base64url');
    const passwordHash = await bcrypt.hash(initialPassword, 10);
    return this.prisma.$transaction(async tx => {
      const tenant = await tx.tenant.create({
        data: { name: dto.name, code, status: 'active' },
      });
      const admin = await tx.user.create({
        data: {
          tenantId: tenant.id,
          username: dto.adminUsername,
          passwordHash,
          role: Role.SYSTEM_ADMIN,
          displayName: dto.adminDisplayName,
          phone: dto.adminPhone ?? null,
          status: 'active',
        },
        select: { id: true, username: true, role: true, displayName: true },
      });
      await tx.userGroup.create({
        data: { tenantId: tenant.id, name: '默认用户组', isDefault: true, permissions: [] },
      });
      return {
        ...this.toListItem({ ...tenant, _count: { users: 1, agents: 0 } }),
        adminUser: {
          id: admin.id,
          username: admin.username,
          role: Role.SYSTEM_ADMIN,
          displayName: admin.displayName,
        },
        initialPassword,
      };
    });
  }

  async setStatus(actor: AuthUser, tenantId: string, status: TenantStatus): Promise<{ id: string; status: TenantStatus }> {
    if (tenantId === actor.tenantId && status === 'suspended') {
      throw new ForbiddenException('Cannot suspend the current platform tenant');
    }
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status },
      select: { id: true, status: true },
    });
    return { id: updated.id, status: updated.status as TenantStatus };
  }
}
```

- [x] **Step 4: Run service tests to verify GREEN**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/tenant/tenant.service.spec.ts
```

Expected: tenant service tests pass.

---

### Task 3: Tenant Controller, Module, and Role Boundary

**Files:**
- Create: `packages/backend/src/modules/tenant/tenant.controller.ts`
- Create: `packages/backend/src/modules/tenant/tenant.module.ts`
- Create: `packages/backend/src/modules/tenant/tenant.controller.spec.ts`
- Create: `packages/backend/src/common/guards/roles.guard.spec.ts`
- Modify: `packages/backend/src/app.module.ts`

- [x] **Step 1: Write failing controller and guard tests**

Create `packages/backend/src/modules/tenant/tenant.controller.spec.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { Role, type AuthUser } from '@nongchang/shared';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { TenantController } from './tenant.controller';

const platformAdmin: AuthUser = {
  userId: 'platform-user',
  tenantId: 'platform-tenant',
  role: Role.PLATFORM_ADMIN,
  agentId: null,
  ownerId: null,
};

describe('TenantController', () => {
  it('requires platform_admin at controller level', () => {
    const reflector = new Reflector();
    const roles = reflector.get<Role[]>(ROLES_KEY, TenantController);
    expect(roles).toEqual([Role.PLATFORM_ADMIN]);
  });

  it('delegates tenant lifecycle actions to the service', async () => {
    const svc = {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 't1' }),
      setStatus: vi.fn().mockResolvedValue({ id: 't1', status: 'suspended' }),
    };
    const controller = new TenantController(svc as any);
    await expect(controller.list()).resolves.toEqual([]);
    await expect(controller.create({
      name: 'Tenant A',
      code: 'TENANT_A',
      adminUsername: 'admin',
      adminDisplayName: 'Admin',
    })).resolves.toEqual({ id: 't1' });
    await expect(controller.setStatus(platformAdmin, 't1', { status: 'suspended' }))
      .resolves.toEqual({ id: 't1', status: 'suspended' });
    expect(svc.setStatus).toHaveBeenCalledWith(platformAdmin, 't1', 'suspended');
  });
});
```

Create `packages/backend/src/common/guards/roles.guard.spec.ts`:

```typescript
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { Role } from '@nongchang/shared';
import { RolesGuard } from './roles.guard';

function contextWith(role: Role, required: Role[]) {
  const handler = () => undefined;
  Reflect.defineMetadata('roles', required, handler);
  return {
    getHandler: () => handler,
    getClass: () => class TestController {},
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as any;
}

describe('RolesGuard', () => {
  it('allows platform_admin on platform-only routes', () => {
    const guard = new RolesGuard(new Reflector());
    expect(guard.canActivate(contextWith(Role.PLATFORM_ADMIN, [Role.PLATFORM_ADMIN]))).toBe(true);
  });

  it('rejects tenant system_admin on platform-only routes', () => {
    const guard = new RolesGuard(new Reflector());
    expect(() => guard.canActivate(contextWith(Role.SYSTEM_ADMIN, [Role.PLATFORM_ADMIN])))
      .toThrow(ForbiddenException);
  });
});
```

- [x] **Step 2: Run controller and guard tests to verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/tenant/tenant.controller.spec.ts src/common/guards/roles.guard.spec.ts
```

Expected: fail because `TenantController` does not exist.

- [x] **Step 3: Implement controller and module**

Create `packages/backend/src/modules/tenant/tenant.controller.ts`:

```typescript
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  AuthUser,
  CreateTenantDto,
  createTenantSchema,
  Role,
  SetTenantStatusInput,
  setTenantStatusSchema,
} from '@nongchang/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { TenantService } from './tenant.service';

@Controller('tenants')
@Roles(Role.PLATFORM_ADMIN)
export class TenantController {
  constructor(private svc: TenantService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Post()
  create(@Body(new ZodValidationPipe(createTenantSchema)) dto: CreateTenantDto) {
    return this.svc.create(dto);
  }

  @Post(':id/status')
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setTenantStatusSchema)) dto: SetTenantStatusInput,
  ) {
    return this.svc.setStatus(user, id, dto.status);
  }
}
```

Create `packages/backend/src/modules/tenant/tenant.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';

@Module({ controllers: [TenantController], providers: [TenantService] })
export class TenantModule {}
```

In `packages/backend/src/app.module.ts`, import and register `TenantModule`:

```typescript
import { TenantModule } from './modules/tenant/tenant.module';
```

Add `TenantModule` to the `imports` array near `UserModule`.

- [x] **Step 4: Run controller and guard tests to verify GREEN**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/tenant/tenant.controller.spec.ts src/common/guards/roles.guard.spec.ts
```

Expected: controller and guard tests pass.

---

### Task 4: Seed Platform Admin

**Files:**
- Modify: `packages/backend/prisma/seed.ts`

- [x] **Step 1: Write failing seed behavior check**

No standalone seed test exists. Verify by TypeScript build after changing the Role enum. The behavior required in code is:

```typescript
const platformTenant =
  (await prisma.tenant.findFirst({ where: { code: 'PLATFORM' } })) ??
  (await prisma.tenant.create({ data: { name: 'Platform Tenant', code: 'PLATFORM' } }));

await prisma.user.upsert({
  where: { tenantId_username: { tenantId: platformTenant.id, username: 'platform' } },
  update: { role: 'platform_admin', displayName: 'Platform Admin', agentId: null, status: 'active' },
  create: {
    tenantId: platformTenant.id,
    username: 'platform',
    passwordHash: pwd,
    role: 'platform_admin',
    displayName: 'Platform Admin',
    status: 'active',
  },
});
```

- [x] **Step 2: Implement seed update**

In `packages/backend/prisma/seed.ts`, after `const pwd = await bcrypt.hash('password123', 10);`, add the platform tenant and platform admin upsert shown above.

- [x] **Step 3: Verify backend build**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend build
```

Expected: exit code 0.

---

### Task 5: Verification, Review, and Commit

**Files:**
- All files changed by Tasks 1-4

- [x] **Step 1: Run focused backend tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/tenant/tenant.service.spec.ts src/modules/tenant/tenant.controller.spec.ts src/common/guards/roles.guard.spec.ts
```

Expected: all focused tests pass.

- [x] **Step 2: Build shared and backend**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/shared build
corepack pnpm@10.33.2 --filter @nongchang/backend build
```

Expected: both commands exit 0.

- [x] **Step 3: Run full unit suite**

Run:

```powershell
corepack pnpm@10.33.2 test:unit
```

Expected:
- backend tests pass.
- web tests pass.
- miniapp tests pass.

- [x] **Step 4: Run mechanical diff checks**

Run:

```powershell
git -c safe.directory=E:/code/nongchang/.worktrees/tenant-lifecycle-p1b diff --check
git -c safe.directory=E:/code/nongchang/.worktrees/tenant-lifecycle-p1b diff --stat
git -c safe.directory=E:/code/nongchang/.worktrees/tenant-lifecycle-p1b diff
```

Expected:
- `diff --check` exits 0.
- Diff is limited to shared tenant contracts, Prisma role migration, backend tenant module/tests, app wiring, seed, and this plan.

- [x] **Step 5: Local code review**

Review the final diff for:
- Tenant lifecycle routes are `@Roles(Role.PLATFORM_ADMIN)` only.
- `system_admin` remains tenant-scoped and is not granted platform lifecycle access.
- New tenant creation is atomic: tenant, initial admin, and default group are created inside one transaction.
- Tenant code is normalized before uniqueness check and create.
- Suspending the current platform tenant is refused.
- No ordinary-member role or user-group permission enforcement is included in this slice.

- [x] **Step 6: Commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang/.worktrees/tenant-lifecycle-p1b add docs/superpowers/plans/2026-07-05-tenant-lifecycle-p1b.md packages/shared/src/enums/index.ts packages/shared/src/dto/tenant.dto.ts packages/shared/src/index.ts packages/backend/prisma/schema.prisma packages/backend/prisma/migrations/20260705170000_platform_admin_role/migration.sql packages/backend/src/modules/tenant/tenant.service.ts packages/backend/src/modules/tenant/tenant.controller.ts packages/backend/src/modules/tenant/tenant.module.ts packages/backend/src/modules/tenant/tenant.service.spec.ts packages/backend/src/modules/tenant/tenant.controller.spec.ts packages/backend/src/common/guards/roles.guard.spec.ts packages/backend/src/app.module.ts packages/backend/prisma/seed.ts
git -c safe.directory=E:/code/nongchang/.worktrees/tenant-lifecycle-p1b commit -m "feat(tenant): add platform tenant lifecycle APIs"
```

Expected:
- Commit succeeds on branch `codex/tenant-lifecycle-p1b`.

---

## Self-Review

- Spec coverage: The plan covers P1-B tenant lifecycle/admin boundary only. It does not implement ordinary members or user-group permission enforcement because those were separate P2/P1-C recommendations.
- Placeholder scan: No `TBD`, `TODO`, or undefined implementation steps are present.
- Type consistency: `platform_admin`, `TenantStatus`, `CreateTenantDto`, `TenantListItem`, `CreateTenantResponse`, `TenantService`, and `TenantController` are defined before use.
- Scope control: No frontend page, member role, or permission-policy engine is added in this slice.
