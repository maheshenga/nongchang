# 商户管理与代理商管理功能完善 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把商户管理合并为单屏并补真实字段/新增/编辑/启停,新建代理商管理屏(列表/新增/编辑/启停),顺带做掉硬化项 #71。

**Architecture:** 后端 User/Agent 模块补 update/setStatus 方法 + PATCH/status 端点,list 带 Prisma `_count` 聚合;shared 新增 update/status/列表视图 DTO;web 合并商户屏、新建代理商屏,API 客户端补新函数。所有数据访问走 ScopeService fail-closed。

**Tech Stack:** NestJS 10 + Prisma 5.22 + Zod;React19 + Vite + Tailwind v4;vitest 2.1.9;后端 e2e 打真实 PostgreSQL(docker nongchang-postgis,localhost:5432,库 nongchang,种子用户密码 password123)。

**约定:**
- 状态两态 `'active' | 'suspended'`;`pending`/`rejected` 归 PendingUsers 屏。
- 所有面向用户文案用中文。
- Write/Edit 单次 < 13000 字符。
- 后端用 vitest(单 `test` 脚本即 `vitest run`,`include` 同时覆盖 `src/**/*.spec.ts` 与 `test/**/*.e2e-spec.ts`,**无单独 test:e2e**)。跑单文件:`pnpm --filter @nongchang/backend test -- <文件名片段>`;跑全量:`pnpm --filter @nongchang/backend test`(含 e2e,需 docker PostgreSQL)。
- web 测试:`pnpm --filter web vitest run`(勿用 `pnpm test run`)。
- 后端 spec 已有约定:`import { describe, it, expect, vi } from 'vitest';` 显式引入;e2e 用 `import request from 'supertest';`(默认导入)+ `import { describe, it, expect, beforeAll, afterAll } from 'vitest';`。
- `user.service.spec.ts` 与 `agent.service.spec.ts` **已存在**(含 `ctx(o)` 构造 AuthUser 的辅助函数)——本计划是**追加** describe 块,不是新建文件;复用其 `ctx` 辅助而非重定义 sysAdmin。

---

## 文件结构

**shared:**
- Modify `packages/shared/src/dto/entities.dto.ts` — 新增 update/status/列表视图 schema。
- Modify `packages/shared/src/index.ts` — 导出新 schema/类型。

**backend:**
- Modify `packages/backend/src/modules/user/user.service.ts` — 注入 ScopeService;update/setStatus;list 聚合;create 随机密码。
- Modify `packages/backend/src/modules/user/user.controller.ts` — PATCH/:id、POST/:id/status。
- Modify `packages/backend/src/modules/agent/agent.service.ts` — update/setStatus;list `_count.users`。
- Modify `packages/backend/src/modules/agent/agent.controller.ts` — PATCH/:id、POST/:id/status。
- Test: `packages/backend/src/modules/user/user.service.spec.ts`、`packages/backend/src/modules/agent/agent.service.spec.ts`(若不存在则创建)。
- Test e2e: `packages/backend/test/merchant-agent-mgmt.e2e-spec.ts`(新建)。

**web:**
- Modify `packages/web/src/api/users.ts` — listMerchants 改指 /users;updateUser/setUserStatus;createUser 响应加 initialPassword。
- Modify `packages/web/src/api/agents.ts` — listAgents 返回 AgentListItem;updateAgent/setAgentStatus。
- Modify `packages/web/src/components/MerchantManagement.tsx` — 接真实字段 + 编辑/启停/新增。
- Create `packages/web/src/components/AgentManagement.tsx` — 代理商管理屏。
- Modify `packages/web/src/App.tsx` — 移除 AgentPlatform tab,新增代理商管理 tab。
- Test: `packages/web/src/api/users.spec.ts`、`packages/web/src/api/agents.spec.ts`(若不存在则创建)。

---

## Task 1: shared 新增 update/status/列表视图 DTO

**Files:**
- Modify: `packages/shared/src/dto/entities.dto.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 在 entities.dto.ts 末尾追加 schema**

在 `packages/shared/src/dto/entities.dto.ts` 文件末尾追加:

```typescript
// ---- 商户管理(User)更新/状态/列表视图 ----
export const updateUserSchema = z.object({
  displayName: z.string().min(2).max(64).optional(),
  phone: z.string().max(20).nullable().optional(),
});
export type UpdateUserDto = z.infer<typeof updateUserSchema>;

export const setUserStatusSchema = z.object({
  status: z.enum(['active', 'suspended']),
});
export type SetUserStatusInput = z.infer<typeof setUserStatusSchema>;

export const merchantListItemSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  phone: z.string().nullable(),
  status: z.string(),
  agentId: z.string().nullable(),
  createdAt: z.string(),
  fieldCount: z.number(),
  totalArea: z.number(),
});
export type MerchantListItem = z.infer<typeof merchantListItemSchema>;

export const createUserResponseSchema = z.object({
  id: z.string(),
  username: z.string(),
  role: z.string(),
  agentId: z.string().nullable(),
  displayName: z.string(),
  initialPassword: z.string(),
});
export type CreateUserResponse = z.infer<typeof createUserResponseSchema>;

// ---- 代理商管理(Agent)更新/状态/列表视图 ----
export const updateAgentSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  region: z.string().max(64).optional(),
});
export type UpdateAgentDto = z.infer<typeof updateAgentSchema>;

export const setAgentStatusSchema = z.object({
  status: z.enum(['active', 'suspended']),
});
export type SetAgentStatusInput = z.infer<typeof setAgentStatusSchema>;

export const agentListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  region: z.string(),
  status: z.string(),
  createdAt: z.string(),
  merchantCount: z.number(),
});
export type AgentListItem = z.infer<typeof agentListItemSchema>;
```

- [ ] **Step 2: 在 index.ts 导出**

在 `packages/shared/src/index.ts` 的 entities.dto 导出块(`createTraceEventSchema,` 那组)里追加 schema 值导出与类型导出。在现有的:

```typescript
export {
  createUserSchema,
  createAgentSchema,
  createFieldSchema,
  createBatchSchema,
  createFarmRecordSchema,
  createTraceEventSchema,
} from './dto/entities.dto';
```

改为追加新增项:

```typescript
export {
  createUserSchema,
  createAgentSchema,
  createFieldSchema,
  createBatchSchema,
  createFarmRecordSchema,
  createTraceEventSchema,
  updateUserSchema,
  setUserStatusSchema,
  merchantListItemSchema,
  createUserResponseSchema,
  updateAgentSchema,
  setAgentStatusSchema,
  agentListItemSchema,
} from './dto/entities.dto';
```

并在对应的 `export type { ... } from './dto/entities.dto';` 块追加:

```typescript
  UpdateUserDto,
  SetUserStatusInput,
  MerchantListItem,
  CreateUserResponse,
  UpdateAgentDto,
  SetAgentStatusInput,
  AgentListItem,
```

- [ ] **Step 3: 构建 shared 验证类型导出**

Run: `pnpm --filter @nongchang/shared build`
Expected: 构建成功,无 TS 错误。

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/dto/entities.dto.ts packages/shared/src/index.ts
git commit -m "feat(shared): 商户/代理商管理 update/status/列表视图 DTO 契约"
```

---

## Task 2: 后端 UserService — update/setStatus/list 聚合/create 随机密码(TDD)

**Files:**
- Modify: `packages/backend/src/modules/user/user.service.ts`
- Test: `packages/backend/src/modules/user/user.service.spec.ts`(若不存在则创建)

设计要点:
- `UserService` 注入 `ScopeService`(构造参数加 `private scope: ScopeService`)。
- 复用现有 `scopedWhere` 私有方法做归属过滤(它已 fail-closed:agent_admin 缺 agentId 抛错)。
- `update`/`setStatus` 先 `findFirst({ ...scopedWhere, id })` 不存在抛 `ForbiddenException`。
- `list` 改聚合:查 role=merchant 的商户(注意现有 list 不限 role,但商户屏只要 merchant;保留 list 给 UserGroups 等其它调用方——故新增独立方法 `listMerchants` 供商户屏,而非改 list)。**为避免破坏 #144 用户组页对 `GET /users` 的依赖,新增 `listMerchants` 方法 + 列表聚合,不动现有 `list`。**
- `create` 去掉调用方传入密码依赖:改为后端用 `crypto.randomBytes(8).toString('base64url')` 生成初始密码,bcrypt 入库,响应返回 `initialPassword`。注意 `CreateUserDto` 仍含 password 字段(供其它潜在调用),但 create 忽略它、用随机密码——**保持 DTO 不变,password 字段在 controller 仍可选传但 service 不使用**。为简化,create 直接生成随机密码,响应附带它。

- [ ] **Step 1: 写失败测试**

`packages/backend/src/modules/user/user.service.spec.ts` **已存在**(含 `ctx(o)` 辅助、顶部 `import { describe, it, expect, vi } from 'vitest';`)。在文件末尾**追加**一个新 describe 块(复用文件已有的 `ctx`,不要重定义 import):

```typescript
describe('UserService 管理能力(商户管理)', () => {
  const sysAdmin = ctx({ role: Role.SYSTEM_ADMIN, agentId: null });

  function makePrisma() {
    return {
      user: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), findMany: vi.fn() },
      field: { groupBy: vi.fn() },
    } as any;
  }

  it('update 目标不在范围内抛 Forbidden', async () => {
    const prisma = makePrisma();
    prisma.user.findFirst.mockResolvedValue(null);
    const svc = new UserService(prisma, new ScopeService());
    await expect(svc.update(sysAdmin, 'm1', { displayName: '新名字' }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('update 在范围内则更新 displayName/phone', async () => {
    const prisma = makePrisma();
    prisma.user.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.user.update.mockResolvedValue({ id: 'm1', displayName: '新名字' });
    const svc = new UserService(prisma, new ScopeService());
    await svc.update(sysAdmin, 'm1', { displayName: '新名字', phone: null });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'm1' }, data: { displayName: '新名字', phone: null },
      select: expect.anything(),
    });
  });

  it('setStatus 在范围内则改 status', async () => {
    const prisma = makePrisma();
    prisma.user.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.user.update.mockResolvedValue({ id: 'm1', status: 'suspended' });
    const svc = new UserService(prisma, new ScopeService());
    const r = await svc.setStatus(sysAdmin, 'm1', 'suspended');
    expect(r.status).toBe('suspended');
  });

  it('create 生成随机初始密码并返回 initialPassword', async () => {
    const prisma = makePrisma();
    prisma.user.create.mockResolvedValue({ id: 'm9', username: 'u9', role: 'merchant', agentId: null, displayName: '商户9' });
    const svc = new UserService(prisma, new ScopeService());
    const r = await svc.create(sysAdmin, { username: 'u9', password: 'ignored', role: Role.MERCHANT, displayName: '商户9' } as any);
    expect(typeof r.initialPassword).toBe('string');
    expect(r.initialPassword.length).toBeGreaterThan(6);
  });

  it('listMerchants 聚合 fieldCount/totalArea', async () => {
    const prisma = makePrisma();
    prisma.user.findMany.mockResolvedValue([
      { id: 'm1', username: 'u1', displayName: '商户1', phone: null, status: 'active', agentId: null, createdAt: new Date('2026-01-01') },
    ]);
    prisma.field.groupBy.mockResolvedValue([{ ownerId: 'm1', _count: { _all: 3 }, _sum: { area: 12.5 } }]);
    const svc = new UserService(prisma, new ScopeService());
    const rows = await svc.listMerchants(sysAdmin);
    expect(rows[0]).toMatchObject({ id: 'm1', fieldCount: 3, totalArea: 12.5 });
  });
});
```

确保文件顶部 import 含 `ScopeService`(`import { ScopeService } from '../../common/scope/scope.service';`)与 `ForbiddenException`(`import { ForbiddenException } from '@nestjs/common';`);若缺则补。`UserService` 构造现需两参 `(prisma, scope)`——文件中既有的旧测试如用 `new UserService(prisma as any)` 单参,需同步补第二参 `new ScopeService()`(否则 TS 报错)。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @nongchang/backend test -- user.service.spec`
Expected: FAIL(update/setStatus/listMerchants 未定义,create 无 initialPassword)。

- [ ] **Step 3: 实现 UserService 改动**

编辑 `packages/backend/src/modules/user/user.service.ts`:顶部加 `import { randomBytes } from 'crypto';` 与 `import { ScopeService } from '../../common/scope/scope.service';` 和 `UpdateUserDto`;构造器注入 ScopeService;改 create 用随机密码并返回 initialPassword;新增 update/setStatus/listMerchants。完整新文件见下:

```typescript
import { Injectable, ForbiddenException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { AuthUser, CreateUserDto, ReviewUserInput, UpdateUserDto, Role } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService, private scope: ScopeService) {}

  async create(actor: AuthUser, dto: CreateUserDto) {
    let agentId = dto.agentId ?? null;
    if (actor.role === Role.AGENT_ADMIN) {
      if (dto.role !== Role.MERCHANT) throw new ForbiddenException('代理商只能创建商家账号');
      agentId = actor.agentId;
    }
    const initialPassword = randomBytes(8).toString('base64url');
    const passwordHash = await bcrypt.hash(initialPassword, 10);
    const created = await this.prisma.user.create({
      data: {
        tenantId: actor.tenantId, role: dto.role, agentId,
        username: dto.username, passwordHash, phone: dto.phone ?? null,
        displayName: dto.displayName,
      },
      select: { id: true, username: true, role: true, agentId: true, displayName: true },
    });
    return { ...created, initialPassword };
  }

  list(actor: AuthUser) {
    const where = this.scopedWhere(actor);
    return this.prisma.user.findMany({
      where, select: { id: true, username: true, role: true, agentId: true, displayName: true, status: true },
    });
  }

  // 商户管理屏:仅 role=merchant,带地块数/确权面积聚合,排除待审核 pending。
  async listMerchants(actor: AuthUser) {
    const where = { ...this.scopedWhere(actor), role: Role.MERCHANT, status: { not: 'pending' } };
    const merchants = await this.prisma.user.findMany({
      where, orderBy: { createdAt: 'desc' },
      select: { id: true, username: true, displayName: true, phone: true, status: true, agentId: true, createdAt: true },
    });
    const ids = merchants.map(m => m.id);
    const agg = ids.length
      ? await this.prisma.field.groupBy({
          by: ['ownerId'], where: { tenantId: actor.tenantId, ownerId: { in: ids } },
          _count: { _all: true }, _sum: { area: true },
        })
      : [];
    const byOwner = new Map(agg.map(a => [a.ownerId, a]));
    return merchants.map(m => {
      const a = byOwner.get(m.id);
      return {
        id: m.id, username: m.username, displayName: m.displayName,
        phone: m.phone, status: m.status, agentId: m.agentId,
        createdAt: m.createdAt.toISOString(),
        fieldCount: a?._count._all ?? 0,
        totalArea: a?._sum.area ?? 0,
      };
    });
  }

  async update(actor: AuthUser, id: string, dto: UpdateUserDto) {
    if (!id) throw new ForbiddenException('缺少用户 id');
    const target = await this.prisma.user.findFirst({ where: { ...this.scopedWhere(actor), id } });
    if (!target) throw new ForbiddenException('目标用户不存在或不在可管理范围');
    const data: Record<string, unknown> = {};
    if (dto.displayName !== undefined) data.displayName = dto.displayName;
    if (dto.phone !== undefined) data.phone = dto.phone;
    return this.prisma.user.update({
      where: { id }, data,
      select: { id: true, username: true, displayName: true, phone: true, status: true },
    });
  }

  async setStatus(actor: AuthUser, id: string, status: 'active' | 'suspended') {
    if (!id) throw new ForbiddenException('缺少用户 id');
    const target = await this.prisma.user.findFirst({ where: { ...this.scopedWhere(actor), id } });
    if (!target) throw new ForbiddenException('目标用户不存在或不在可管理范围');
    return this.prisma.user.update({
      where: { id }, data: { status },
      select: { id: true, status: true },
    });
  }

  private scopedWhere(actor: AuthUser): Record<string, string> {
    const where: Record<string, string> = { tenantId: actor.tenantId };
    if (actor.role === Role.AGENT_ADMIN) {
      if (!actor.agentId) throw new ForbiddenException('代理管理员缺少 agentId,拒绝访问');
      where.agentId = actor.agentId;
    }
    return where;
  }

  async listPending(actor: AuthUser) {
    const where = { ...this.scopedWhere(actor), status: 'pending' };
    return this.prisma.user.findMany({
      where, orderBy: { createdAt: 'desc' },
      select: { id: true, displayName: true, phone: true, createdAt: true },
    });
  }

  async review(actor: AuthUser, userId: string, dto: ReviewUserInput) {
    const target = await this.prisma.user.findFirst({
      where: { ...this.scopedWhere(actor), id: userId, status: 'pending' },
    });
    if (!target) throw new ForbiddenException('目标用户不存在或不在可管理范围');
    const status = dto.action === 'approve' ? 'active' : 'rejected';
    await this.prisma.user.update({ where: { id: userId }, data: { status } });
    return { id: userId, status };
  }
}
```

注意:`UserService` 现注入 `ScopeService`,需确保其 module 的 providers 含 `ScopeService`(见 Task 4 controller/module 校验)。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @nongchang/backend test -- user.service.spec`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/modules/user/user.service.ts packages/backend/src/modules/user/user.service.spec.ts
git commit -m "feat(backend): UserService 商户管理 update/setStatus/listMerchants 聚合 + 随机初始密码(#71)"
```

---

## Task 3: 后端 AgentService — update/setStatus/list 聚合(TDD)

**Files:**
- Modify: `packages/backend/src/modules/agent/agent.service.ts`
- Test: `packages/backend/src/modules/agent/agent.service.spec.ts`(若不存在则创建)

设计要点:Agent 仅 system_admin 管(controller @Roles 已限),service 内仍按 `tenantId` 限定。update/setStatus 先 `findFirst({ tenantId, id })` 不存在抛 Forbidden。list 带 `_count.users` 映射为 merchantCount。

- [ ] **Step 1: 写失败测试**

`packages/backend/src/modules/agent/agent.service.spec.ts` **已存在**(含 `ctx(o)` 辅助、`import { describe, it, expect, vi } from 'vitest';`)。在文件末尾**追加**新 describe 块(复用既有 `ctx`):

```typescript
describe('AgentService 管理能力', () => {
  const sysAdmin = ctx({ role: Role.SYSTEM_ADMIN, agentId: null });

  function makePrisma() {
    return { agent: { findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn() } } as any;
  }

  it('update 目标不在租户内抛 Forbidden', async () => {
    const prisma = makePrisma();
    prisma.agent.findFirst.mockResolvedValue(null);
    const svc = new AgentService(prisma, new ScopeService());
    await expect(svc.update(sysAdmin, 'a1', { name: '新代理' }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('update 在租户内则更新', async () => {
    const prisma = makePrisma();
    prisma.agent.findFirst.mockResolvedValue({ id: 'a1' });
    prisma.agent.update.mockResolvedValue({ id: 'a1', name: '新代理', region: '华东' });
    const svc = new AgentService(prisma, new ScopeService());
    await svc.update(sysAdmin, 'a1', { name: '新代理', region: '华东' });
    expect(prisma.agent.update).toHaveBeenCalledWith({
      where: { id: 'a1' }, data: { name: '新代理', region: '华东' },
    });
  });

  it('setStatus 改 status', async () => {
    const prisma = makePrisma();
    prisma.agent.findFirst.mockResolvedValue({ id: 'a1' });
    prisma.agent.update.mockResolvedValue({ id: 'a1', status: 'suspended' });
    const svc = new AgentService(prisma, new ScopeService());
    const r = await svc.setStatus(sysAdmin, 'a1', 'suspended');
    expect(r.status).toBe('suspended');
  });

  it('list 带 merchantCount', async () => {
    const prisma = makePrisma();
    prisma.agent.findMany.mockResolvedValue([
      { id: 'a1', name: '代理1', region: '华东', status: 'active', createdAt: new Date('2026-01-01'), _count: { users: 5 } },
    ]);
    const svc = new AgentService(prisma, new ScopeService());
    const rows = await svc.list(sysAdmin);
    expect(rows[0]).toMatchObject({ id: 'a1', merchantCount: 5 });
  });
});
```

确保文件顶部 import 含 `ForbiddenException`(`@nestjs/common`)。`AgentService` 构造本就是 `(prisma, scope)`,既有测试若用单参需补 `new ScopeService()`。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @nongchang/backend test -- agent.service.spec`
Expected: FAIL(update/setStatus 未定义,list 无 merchantCount)。

- [ ] **Step 3: 给 Agent 加 createdAt 并迁移**

编辑 `packages/backend/prisma/schema.prisma` 的 `model Agent`,在 status 行后加:

```prisma
  createdAt DateTime @default(now())
```

生成迁移:

```bash
cd packages/backend && npx prisma migrate dev --name agent_created_at && cd ../..
```

Expected: 迁移文件生成,prisma client 重新生成。

- [ ] **Step 4: 实现 AgentService**

完整新文件 `packages/backend/src/modules/agent/agent.service.ts`:

```typescript
import { Injectable, ForbiddenException } from '@nestjs/common';
import { AuthUser, CreateAgentDto, UpdateAgentDto, Role } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';

@Injectable()
export class AgentService {
  constructor(private prisma: PrismaService, private scope: ScopeService) {}

  create(user: AuthUser, dto: CreateAgentDto) {
    return this.prisma.agent.create({ data: { tenantId: user.tenantId, ...dto } });
  }

  async list(user: AuthUser) {
    const rows = await this.prisma.agent.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, region: true, status: true, createdAt: true,
        _count: { select: { users: true } },
      },
    });
    return rows.map(a => ({
      id: a.id, name: a.name, region: a.region, status: a.status,
      createdAt: a.createdAt.toISOString(), merchantCount: a._count.users,
    }));
  }

  async update(user: AuthUser, id: string, dto: UpdateAgentDto) {
    if (!id) throw new ForbiddenException('缺少代理商 id');
    const target = await this.prisma.agent.findFirst({ where: { tenantId: user.tenantId, id } });
    if (!target) throw new ForbiddenException('代理商不存在或不在可管理范围');
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.region !== undefined) data.region = dto.region;
    return this.prisma.agent.update({ where: { id }, data });
  }

  async setStatus(user: AuthUser, id: string, status: 'active' | 'suspended') {
    if (!id) throw new ForbiddenException('缺少代理商 id');
    const target = await this.prisma.agent.findFirst({ where: { tenantId: user.tenantId, id } });
    if (!target) throw new ForbiddenException('代理商不存在或不在可管理范围');
    return this.prisma.agent.update({ where: { id }, data: { status } });
  }

  listMerchants(user: AuthUser) {
    const where: Record<string, string> = { tenantId: user.tenantId, role: Role.MERCHANT };
    if (user.role === Role.AGENT_ADMIN) {
      if (!user.agentId) throw new ForbiddenException('代理管理员缺少 agentId,拒绝访问');
      where.agentId = user.agentId;
    }
    return this.prisma.user.findMany({ where });
  }
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm --filter @nongchang/backend test -- agent.service.spec`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/modules/agent/agent.service.ts packages/backend/src/modules/agent/agent.service.spec.ts packages/backend/prisma/
git commit -m "feat(backend): AgentService update/setStatus + list merchantCount 聚合 + Agent.createdAt"
```

---

## Task 4: 后端 Controller 端点 + Module providers 校验

**Files:**
- Modify: `packages/backend/src/modules/user/user.controller.ts`
- Modify: `packages/backend/src/modules/agent/agent.controller.ts`
- 检查: `packages/backend/src/modules/user/user.module.ts`、`agent.module.ts`(确保 providers 含 ScopeService)

- [ ] **Step 1: 检查两个 module 是否提供 ScopeService**

Run: `grep -n "ScopeService\|providers" packages/backend/src/modules/user/user.module.ts packages/backend/src/modules/agent/agent.module.ts`
Expected: agent.module 已含 ScopeService(AgentService 原本就注入它);user.module 此前未注入 → **需要加**。若 user.module 的 providers 不含 ScopeService,在 providers 数组加入 `ScopeService` 并 import。

- [ ] **Step 2: 改 user.controller.ts**

完整新文件 `packages/backend/src/modules/user/user.controller.ts`:

```typescript
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  AuthUser, CreateUserDto, createUserSchema, ReviewUserInput, reviewUserSchema,
  UpdateUserDto, updateUserSchema, SetUserStatusInput, setUserStatusSchema, Role,
} from '@nongchang/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { UserService } from './user.service';

@Controller('users')
export class UserController {
  constructor(private svc: UserService) {}

  @Post() @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN)
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createUserSchema)) dto: CreateUserDto) {
    return this.svc.create(user, dto);
  }

  @Get() @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN)
  list(@CurrentUser() user: AuthUser) { return this.svc.list(user); }

  @Get('merchants') @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN)
  merchants(@CurrentUser() user: AuthUser) { return this.svc.listMerchants(user); }

  @Get('pending') @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN)
  listPending(@CurrentUser() user: AuthUser) { return this.svc.listPending(user); }

  @Patch(':id') @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) dto: UpdateUserDto) {
    return this.svc.update(user, id, dto);
  }

  @Post(':id/status') @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN)
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string,
    @Body(new ZodValidationPipe(setUserStatusSchema)) dto: SetUserStatusInput) {
    return this.svc.setStatus(user, id, dto.status);
  }

  @Post(':id/review') @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN)
  review(@CurrentUser() user: AuthUser, @Param('id') id: string,
    @Body(new ZodValidationPipe(reviewUserSchema)) dto: ReviewUserInput) {
    return this.svc.review(user, id, dto);
  }
}
```

注意路由顺序:`@Get('merchants')`、`@Get('pending')` 必须在任何 `:id` 动态段之前声明(它们是 GET 这里无冲突,但保持字面量在前是好习惯)。`@Patch(':id')` 与 `@Post(':id/status')` 路径不冲突。

- [ ] **Step 3: 改 agent.controller.ts**

完整新文件 `packages/backend/src/modules/agent/agent.controller.ts`:

```typescript
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  AuthUser, CreateAgentDto, createAgentSchema, UpdateAgentDto, updateAgentSchema,
  SetAgentStatusInput, setAgentStatusSchema, Role,
} from '@nongchang/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AgentService } from './agent.service';

@Controller('agents')
export class AgentController {
  constructor(private svc: AgentService) {}

  @Post() @Roles(Role.SYSTEM_ADMIN)
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createAgentSchema)) dto: CreateAgentDto) {
    return this.svc.create(user, dto);
  }

  @Get() @Roles(Role.SYSTEM_ADMIN)
  list(@CurrentUser() user: AuthUser) { return this.svc.list(user); }

  @Get('merchants') @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN)
  merchants(@CurrentUser() user: AuthUser) { return this.svc.listMerchants(user); }

  @Patch(':id') @Roles(Role.SYSTEM_ADMIN)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAgentSchema)) dto: UpdateAgentDto) {
    return this.svc.update(user, id, dto);
  }

  @Post(':id/status') @Roles(Role.SYSTEM_ADMIN)
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string,
    @Body(new ZodValidationPipe(setAgentStatusSchema)) dto: SetAgentStatusInput) {
    return this.svc.setStatus(user, id, dto.status);
  }
}
```

- [ ] **Step 4: 构建后端确认编译**

Run: `pnpm --filter @nongchang/backend build`
Expected: 编译通过。

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/modules/user/ packages/backend/src/modules/agent/
git commit -m "feat(backend): users/agents PATCH:id 与 POST:id/status 端点 + user.module 注入 ScopeService"
```

---

## Task 5: 后端 e2e — 商户/代理商管理(真实 PG)

**Files:**
- Create: `packages/backend/test/merchant-agent-mgmt.e2e-spec.ts`

参考现有 e2e(如 `test/integration-wechat.e2e-spec.ts`)的 app 引导、登录拿 token 方式。种子库:system_admin 用户名 `sysadmin` 密码 `password123`(若与现有种子不同,先 `grep -rn "username" packages/backend/prisma/seed*` 确认实际种子账户)。

- [ ] **Step 1: 写 e2e 测试**

创建 `packages/backend/test/merchant-agent-mgmt.e2e-spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../src/app.module';

// 复用既有 e2e 登录方式;按实际种子账户调整 username/password。
async function login(app: INestApplication, username: string, password = 'password123') {
  const res = await request(app.getHttpServer()).post('/api/auth/login').send({ username, password });
  return res.body.accessToken as string;
}

describe('商户/代理商管理 e2e', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  it('system_admin 新增商户拿到 initialPassword,再 PATCH 改资料', async () => {
    const token = await login(app, 'sysadmin');
    const username = 'm_e2e_' + Date.now();
    const created = await request(app.getHttpServer())
      .post('/api/users').set('Authorization', `Bearer ${token}`)
      .send({ username, password: 'unused', role: 'merchant', displayName: '测试商户' });
    expect(created.status).toBe(201);
    expect(typeof created.body.initialPassword).toBe('string');
    const id = created.body.id;

    const patched = await request(app.getHttpServer())
      .patch(`/api/users/${id}`).set('Authorization', `Bearer ${token}`)
      .send({ displayName: '改名商户', phone: '13800000000' });
    expect(patched.status).toBe(200);
    expect(patched.body.displayName).toBe('改名商户');

    const suspended = await request(app.getHttpServer())
      .post(`/api/users/${id}/status`).set('Authorization', `Bearer ${token}`)
      .send({ status: 'suspended' });
    expect(suspended.status).toBe(201);
    expect(suspended.body.status).toBe('suspended');
  });

  it('GET /api/users/merchants 返回聚合字段', async () => {
    const token = await login(app, 'sysadmin');
    const res = await request(app.getHttpServer())
      .get('/api/users/merchants').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length) {
      expect(res.body[0]).toHaveProperty('fieldCount');
      expect(res.body[0]).toHaveProperty('totalArea');
    }
  });

  it('代理商 CRUD:system_admin 创建/改/停用', async () => {
    const token = await login(app, 'sysadmin');
    const created = await request(app.getHttpServer())
      .post('/api/agents').set('Authorization', `Bearer ${token}`)
      .send({ name: '代理_e2e_' + Date.now(), region: '华东' });
    expect(created.status).toBe(201);
    const id = created.body.id;

    const list = await request(app.getHttpServer())
      .get('/api/agents').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.find((a: any) => a.id === id)).toHaveProperty('merchantCount');

    const patched = await request(app.getHttpServer())
      .patch(`/api/agents/${id}`).set('Authorization', `Bearer ${token}`)
      .send({ region: '华南' });
    expect(patched.status).toBe(200);
    expect(patched.body.region).toBe('华南');

    const suspended = await request(app.getHttpServer())
      .post(`/api/agents/${id}/status`).set('Authorization', `Bearer ${token}`)
      .send({ status: 'suspended' });
    expect(suspended.status).toBe(201);
    expect(suspended.body.status).toBe('suspended');
  });
});
```

注:supertest `POST` 成功默认 201,`PATCH` 成功默认 200(NestJS 默认状态码)。若实际登录响应字段非 `accessToken`,按既有 e2e 调整。

- [ ] **Step 2: 运行 e2e**

Run: `pnpm --filter @nongchang/backend test -- merchant-agent-mgmt`
Expected: PASS(需 docker PostgreSQL 运行 + 种子已灌)。

- [ ] **Step 3: Commit**

```bash
git add packages/backend/test/merchant-agent-mgmt.e2e-spec.ts
git commit -m "test(backend): 商户/代理商管理 e2e(create/patch/status/聚合)"
```

---

## Task 6: web API 客户端 — users/agents 新增函数(TDD)

**Files:**
- Modify: `packages/web/src/api/users.ts`
- Modify: `packages/web/src/api/agents.ts`
- Test: `packages/web/src/api/users.spec.ts`、`packages/web/src/api/agents.spec.ts`(若不存在则创建)

- [ ] **Step 1: 写失败测试**

创建/编辑 `packages/web/src/api/users.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as req from './request';
import { listMerchants, updateUser, setUserStatus, createUser } from './users';

describe('users api', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('listMerchants 打 GET /users/merchants', async () => {
    const spy = vi.spyOn(req, 'request').mockResolvedValue([] as any);
    await listMerchants();
    expect(spy).toHaveBeenCalledWith('/users/merchants');
  });

  it('updateUser 打 PATCH /users/:id', async () => {
    const spy = vi.spyOn(req, 'request').mockResolvedValue({} as any);
    await updateUser('m1', { displayName: '新名' });
    expect(spy).toHaveBeenCalledWith('/users/m1', { method: 'PATCH', body: JSON.stringify({ displayName: '新名' }) });
  });

  it('setUserStatus 打 POST /users/:id/status', async () => {
    const spy = vi.spyOn(req, 'request').mockResolvedValue({} as any);
    await setUserStatus('m1', 'suspended');
    expect(spy).toHaveBeenCalledWith('/users/m1/status', { method: 'POST', body: JSON.stringify({ status: 'suspended' }) });
  });
});
```

创建/编辑 `packages/web/src/api/agents.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as req from './request';
import { listAgents, updateAgent, setAgentStatus } from './agents';

describe('agents api', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('listAgents 打 GET /agents', async () => {
    const spy = vi.spyOn(req, 'request').mockResolvedValue([] as any);
    await listAgents();
    expect(spy).toHaveBeenCalledWith('/agents');
  });

  it('updateAgent 打 PATCH /agents/:id', async () => {
    const spy = vi.spyOn(req, 'request').mockResolvedValue({} as any);
    await updateAgent('a1', { region: '华南' });
    expect(spy).toHaveBeenCalledWith('/agents/a1', { method: 'PATCH', body: JSON.stringify({ region: '华南' }) });
  });

  it('setAgentStatus 打 POST /agents/:id/status', async () => {
    const spy = vi.spyOn(req, 'request').mockResolvedValue({} as any);
    await setAgentStatus('a1', 'active');
    expect(spy).toHaveBeenCalledWith('/agents/a1/status', { method: 'POST', body: JSON.stringify({ status: 'active' }) });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter web vitest run src/api/users.spec.ts src/api/agents.spec.ts`
Expected: FAIL(函数未导出)。

- [ ] **Step 3: 改 users.ts**

完整新文件 `packages/web/src/api/users.ts`:

```typescript
import type {
  CreateUserDto, PendingUserView, ReviewUserInput,
  UpdateUserDto, MerchantListItem, CreateUserResponse,
} from '@nongchang/shared';
import { request } from './request';

export interface UserListItem {
  id: string;
  username: string;
  role: string;
  agentId: string | null;
  displayName: string;
  status: string;
}

export function listUsers(): Promise<UserListItem[]> {
  return request<UserListItem[]>('/users');
}

export function listMerchants(): Promise<MerchantListItem[]> {
  return request<MerchantListItem[]>('/users/merchants');
}

export function createUser(dto: CreateUserDto): Promise<CreateUserResponse> {
  return request<CreateUserResponse>('/users', { method: 'POST', body: JSON.stringify(dto) });
}

export function updateUser(id: string, dto: UpdateUserDto): Promise<MerchantListItem> {
  return request<MerchantListItem>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(dto) });
}

export function setUserStatus(id: string, status: 'active' | 'suspended'): Promise<{ id: string; status: string }> {
  return request(`/users/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) });
}

// 待审核(微信自助注册)用户
export function listPendingUsers(): Promise<PendingUserView[]> {
  return request<PendingUserView[]>('/users/pending');
}

export function reviewUser(id: string, input: ReviewUserInput): Promise<{ id: string; status: string }> {
  return request(`/users/${id}/review`, { method: 'POST', body: JSON.stringify(input) });
}
```

注意:删除了原 `CreatedUser` interface(改用 shared 的 `CreateUserResponse`)。Task 7 的 MerchantManagement 需相应改引用。**先 `grep -rn "CreatedUser" packages/web/src` 确认其它引用方,若有则一并改为 `CreateUserResponse`。**

- [ ] **Step 4: 改 agents.ts**

完整新文件 `packages/web/src/api/agents.ts`:

```typescript
import type { CreateAgentDto, AgentListItem, UpdateAgentDto } from '@nongchang/shared';
import { request } from './request';

export interface MerchantUser {
  id: string;
  username: string;
  role: string;
  agentId: string | null;
  displayName: string;
}

export function listAgents(): Promise<AgentListItem[]> {
  return request<AgentListItem[]>('/agents');
}

export function createAgent(dto: CreateAgentDto): Promise<AgentListItem> {
  return request<AgentListItem>('/agents', { method: 'POST', body: JSON.stringify(dto) });
}

export function updateAgent(id: string, dto: UpdateAgentDto): Promise<AgentListItem> {
  return request<AgentListItem>(`/agents/${id}`, { method: 'PATCH', body: JSON.stringify(dto) });
}

export function setAgentStatus(id: string, status: 'active' | 'suspended'): Promise<{ id: string; status: string }> {
  return request(`/agents/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) });
}

export function listMerchants(): Promise<MerchantUser[]> {
  return request<MerchantUser[]>('/agents/merchants');
}
```

注意:原 `Agent` interface 删除(改用 shared `AgentListItem`)。**先 `grep -rn "import.*Agent.*from.*api/agents" packages/web/src` 与 `grep -rn "\bAgent\b" packages/web/src/components` 确认 AgentPlatform 等引用方;AgentPlatform 将在 Task 8 从导航移除,但文件若仍 import `Agent` 需保留兼容或一并处理。** 简单起见:保留 `createAgent` 返回类型用 AgentListItem;若 AgentPlatform 仍编译引用旧 `Agent`,Task 8 删除其 import。

- [ ] **Step 5: 运行确认通过**

Run: `pnpm --filter web vitest run src/api/users.spec.ts src/api/agents.spec.ts`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/api/users.ts packages/web/src/api/agents.ts packages/web/src/api/users.spec.ts packages/web/src/api/agents.spec.ts
git commit -m "feat(web): users/agents API 客户端补 update/setStatus + listMerchants 聚合"
```

---

## Task 7: web 商户管理屏接真实字段 + 编辑/启停/新增

**Files:**
- Modify: `packages/web/src/components/MerchantManagement.tsx`

实现者须知:先完整 `Read` 当前 `MerchantManagement.tsx`(约 230 行)了解现有结构(useApi、Merchant 本地类型、表格、新增弹窗 handleAddSubmit)。本任务做定向改造,不重写整文件外观,只替换数据映射与操作逻辑。

改造点(逐项落实):

1. **数据源切换**:`useApi(listMerchants)` 现返回 `MerchantListItem[]`(含真实 status/phone/createdAt/fieldCount/totalArea)。删除把字段写死为 `'—'`/`0` 的本地映射(原 L22-31),直接用 API 行。本地 `Merchant` 类型改为复用 `MerchantListItem`(从 `@nongchang/shared` import 类型)。
2. **列展示**:列改为 商户编号(id 截断显示,如 `id.slice(0,8)`)、企业名称(displayName)、联系人/电话(username / phone ?? '未填')、地块数(fieldCount)、确权面积(totalArea.toFixed(1) + ' 亩')、状态(active→绿色"正常"、suspended→灰色"已停用")、入驻时间(new Date(createdAt).toLocaleDateString())、操作。
3. **状态筛选**:顶部筛选按钮接真实过滤(全部/正常 active/已停用 suspended),用本地 state `statusFilter` 过滤渲染数组。
4. **新增商户弹窗**:`handleAddSubmit` 调 `createUser({ username, password: '', role: Role.MERCHANT, displayName, phone })`(password 字段后端忽略,传空串即可通过 zod min(6)? — 注意 createUserSchema password min(6)。**传一个占位满足校验**:`password: 'placeholder'`,后端会用随机密码覆盖)。成功后用返回的 `initialPassword` 弹窗提示:`window.alert('商户已创建。初始密码:' + res.initialPassword + ',请转交商户并提醒尽快修改。')`,然后 reload 列表。移除原先收集但丢弃 location 字段的逻辑(不再收集 location)。
5. **编辑操作**:行操作区加"编辑"按钮,打开弹窗(可复用新增弹窗结构,区分 mode)。提交调 `updateUser(id, { displayName, phone })`,成功后 reload。
6. **启停操作**:行操作区加"停用"/"启用"按钮(据当前 status 切换文案),`window.confirm` 后调 `setUserStatus(id, next)`,成功后 reload。把原先无 handler 的 `MoreVertical` 按钮替换为这组操作按钮。

- [ ] **Step 1: 读现有组件并改造**

先 `Read packages/web/src/components/MerchantManagement.tsx`,据上述 6 点用 `Edit` 定向修改(import Role 与类型、改 useApi 行映射、改列、加筛选 state、改 handleAddSubmit、加 handleEdit/handleToggleStatus、替换行操作按钮)。reload 方式沿用组件内 useApi 的 reload(若 useApi 返回 `{ data, reload }`,先确认其签名:`grep -n "useApi" packages/web/src/hooks/useApi.ts` 或其定义)。

- [ ] **Step 2: 构建确认编译**

Run: `pnpm --filter web build`
Expected: 编译通过(若 createUser 返回类型变更导致旧引用报错,一并修正)。

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/MerchantManagement.tsx
git commit -m "feat(web): 商户管理屏接真实字段 + 新增/编辑/启停"
```

---

## Task 8: web 新建代理商管理屏 + App.tsx 接线(移除 AgentPlatform tab)

**Files:**
- Create: `packages/web/src/components/AgentManagement.tsx`
- Modify: `packages/web/src/App.tsx`

实现者须知:先 `Read packages/web/src/components/MerchantManagement.tsx`(改造后)作为同构参照,新建的 AgentManagement 沿用同样的表格/弹窗/按钮风格(Tailwind 类名风格一致),保证视觉统一。

- [ ] **Step 1: 创建 AgentManagement.tsx**

新建 `packages/web/src/components/AgentManagement.tsx`,要点:
- `import { listAgents, createAgent, updateAgent, setAgentStatus } from '../api/agents';`
- `import type { AgentListItem } from '@nongchang/shared';`
- `useApi(listAgents)` 取列表(确认 useApi 签名后使用)。
- 列:代理商名称(name)、辖区(region)、下辖商户数(merchantCount)、状态(active→"正常"/suspended→"已停用")、创建时间(createdAt toLocaleDateString)、操作(编辑/启停)。
- 顶部"新增代理商"按钮 → 弹窗(name 必填、region 必填)→ `createAgent({ name, region })` → reload。
- 编辑弹窗 → `updateAgent(id, { name, region })` → reload。
- 启停 → `window.confirm` → `setAgentStatus(id, next)` → reload。
- 标题"代理商管理",用 lucide 图标(如 `Building2`/`Plus`/`RefreshCw`),文案全中文。

因组件较大,分多次 `Write`/`Edit`(单次 < 13000 字符)。结构参照 MerchantManagement:外层卡片 + 工具栏 + table + 受控弹窗(本地 useState 管理 open/form/editingId)。

- [ ] **Step 2: App.tsx 接线**

先 `Read packages/web/src/App.tsx` 找到:`AgentPlatform` 的 import、lazy、activeTab union、SYSTEM_ADMIN_NAV/相关 NAV 数组里的 agents 项、渲染块。改造:
- 移除 `AgentPlatform` 的 import 与 lazy(若其它地方无引用)。
- 新增 `const AgentManagement = lazy(() => import('./components/AgentManagement'));`
- activeTab union 保留 `'agents'`(复用原 tab id),把原指向 AgentPlatform 的渲染块改为渲染 `<AgentManagement />`。
- 导航项:原"辖区内入驻商家管理"类标签改为「代理商管理」,确保仅 `system_admin` 导航含此项(代理商仅系统管理员管)。若原 agents 项在 agent_admin 导航里,移除之。
- 渲染块 mountedTabs 模式沿用现有写法。

注意:确认 AgentPlatform 是否被其它 tab 引用;若仅此一处,删除其 import 即可,文件本身可保留不删(避免误删),但不再挂载。

- [ ] **Step 3: 构建确认编译**

Run: `pnpm --filter web build`
Expected: 编译通过。

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/AgentManagement.tsx packages/web/src/App.tsx
git commit -m "feat(web): 新建代理商管理屏 + App 导航接线(替换 AgentPlatform)"
```

---

## Task 9: 全量验证 + memory 更新

- [ ] **Step 1: shared 构建**

Run: `pnpm --filter @nongchang/shared build`
Expected: 通过。

- [ ] **Step 2: 后端全量测试**

Run: `pnpm --filter @nongchang/backend test && pnpm --filter @nongchang/backend test:e2e`
Expected: 全绿(需 docker PostgreSQL)。

- [ ] **Step 3: web 测试 + 构建**

Run: `pnpm --filter web vitest run && pnpm --filter web build`
Expected: 全绿。

- [ ] **Step 4: miniapp 不受影响确认**

Run: `pnpm --filter @nongchang/miniapp build:weapp`
Expected: 通过(本次未改 miniapp,确认无回归)。

- [ ] **Step 5: 更新 memory**

编辑 `C:\Users\Administrator\.claude\projects\E--code-nongchang\memory\project_saas_refactor.md`,追加一段记录本子系统:范围(商户管理合并为单屏 + 真实字段/新增/编辑/启停;代理商管理新屏 CRUD+启停;做掉 #71)、关键决策(状态两态 active/suspended;`GET /users/merchants` 聚合 fieldCount/totalArea;create 随机初始密码一次性返回;Agent 加 createdAt 迁移)、基线测试数。把 #71 标记为已完成。

- [ ] **Step 6: 最终 commit**

```bash
git add -A
git commit -m "chore: 商户/代理商管理 全量验证通过 + memory 更新"
```

---

## 备注:本计划做掉/未做的硬化项
- **做掉**:#71(商户创建写死 password123 → 随机初始密码)。
- **可能顺带**:#26(登录校验 status=active)未强制做;若希望"停用商户后无法登录"真正生效,需在 AuthService.login 加 `status === 'active'` 校验(本计划 e2e 未断言登录被拒,故未纳入;如需请追加一个 Task)。当前停用仅阻止管理操作维度,不阻止登录。
- **未做**:#25 用户名租户内唯一、#20 FK、#22 refresh 吊销、#28 隔离深度。
