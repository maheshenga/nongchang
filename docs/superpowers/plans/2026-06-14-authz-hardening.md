# 租户内授权硬化 Implementation Plan(#23 / #24 / #27)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复三处租户内权限提升 / fail-open 授权漏洞,使所有创建与跨实体操作 fail-closed。

**Architecture:** 在 `ScopeService` 新增三个 fail-closed 助手(`assertInScope` 校验 batch/field 归属、`assertOwnerInScope` 校验目标 merchant 归属、`resolveOwnerId` 统一 create 的 ownerId 语义),各 service 调用助手取代「信任 DTO / 手写 where 短路」。复用既有 `ownedScopeWhere`(已 fail-closed)。

**Tech Stack:** NestJS 10 + Prisma + PostgreSQL/PostGIS;测试 Vitest(单元 mock prisma,e2e 打真实 PG);`@nongchang/shared` zod DTO + 枚举。

**前置约定:**
- 工作分支 `feat/authz-hardening`(从 main 切出)。
- 所有 git 命令用内联身份:`git -c user.name='nongchang' -c user.email='noreply@local' ...`。不用 `git config`,不用 `--no-verify`。
- 后端单测命令:`pnpm --filter backend test`(Vitest)。后端无 `lint`,类型检查靠 `pnpm --filter backend build`(nest build)。
- 基线:backend 73 测试全绿。本计划预计净增约 14 个单元 + 3 个 e2e。

---

## 文件结构

| 文件 | 职责 | 动作 |
|---|---|---|
| `packages/backend/src/common/scope/scope.service.ts` | 新增 assertInScope / assertOwnerInScope / resolveOwnerId | Modify |
| `packages/backend/src/common/scope/scope.service.spec.ts` | 三助手单元测试 | Modify |
| `packages/backend/src/modules/batch/batch.service.ts` | #23 create ownerId 语义 | Modify |
| `packages/backend/src/modules/batch/batch.service.spec.ts` | batch create 单测 | Create |
| `packages/backend/src/modules/field/field.service.ts` | #23 create ownerId 语义 | Modify |
| `packages/backend/src/modules/field/field.service.spec.ts` | field create 单测 | Create |
| `packages/backend/src/modules/trace/trace.service.ts` | #24 batch 归属校验 | Modify |
| `packages/backend/src/modules/trace/trace.service.spec.ts` | trace 归属单测 | Create |
| `packages/backend/src/modules/farm-record/farm-record.service.ts` | #24 batch/field 归属校验 | Modify |
| `packages/backend/src/modules/farm-record/farm-record.service.spec.ts` | 补归属单测 | Modify |
| `packages/backend/src/modules/user/user.service.ts` | #27 fail-closed | Modify |
| `packages/backend/src/modules/user/user.service.spec.ts` | user.list 单测 | Create |
| `packages/backend/src/modules/agent/agent.service.ts` | #27 fail-closed | Modify |
| `packages/backend/src/modules/agent/agent.service.spec.ts` | 补 agentId=null 单测 | Modify |
| `packages/backend/test/isolation.e2e-spec.ts` | 越权 e2e 场景 | Modify |

---

## Task 0: 切工作分支

**Files:** 无(git 操作)

- [ ] **Step 1: 从 main 切出分支**

```bash
cd "E:/code/nongchang"
git checkout main
git checkout -b feat/authz-hardening
git branch --show-current
```
Expected: 输出 `feat/authz-hardening`

---

## Task 1: ScopeService 新增三助手(核心,TDD)

在 `ScopeService` 增加三个 fail-closed 助手。`assertInScope` 校验 batch/field 在范围内;`assertOwnerInScope` 校验目标 merchant 在范围内;`resolveOwnerId` 统一 create 的 ownerId 语义(merchant 强制 self,agent/sysadmin 采纳并校验 dto.ownerId)。

**Files:**
- Modify: `packages/backend/src/common/scope/scope.service.ts`
- Test: `packages/backend/src/common/scope/scope.service.spec.ts`

- [ ] **Step 1: 在 spec 末尾追加失败测试**

在 `packages/backend/src/common/scope/scope.service.spec.ts` 文件末尾追加:

```ts
describe('ScopeService.assertInScope', () => {
  const merchant = ctx({ role: Role.MERCHANT, ownerId: 'm1' });
  it('实体在范围内:通过', async () => {
    const prisma = { batch: { findFirst: vi.fn().mockResolvedValue({ id: 'b1' }) } } as any;
    await expect(new ScopeService().assertInScope(prisma, merchant, 'batch', 'b1')).resolves.toBeUndefined();
    expect(prisma.batch.findFirst).toHaveBeenCalledWith({
      where: { id: 'b1', tenantId: 't1', ownerId: 'm1' }, select: { id: true },
    });
  });
  it('实体不在范围内:抛 Forbidden', async () => {
    const prisma = { field: { findFirst: vi.fn().mockResolvedValue(null) } } as any;
    await expect(new ScopeService().assertInScope(prisma, merchant, 'field', 'f9'))
      .rejects.toThrow();
  });
  it('merchant 缺 ownerId:fail-closed 抛错(不查库)', async () => {
    const prisma = { batch: { findFirst: vi.fn() } } as any;
    await expect(new ScopeService().assertInScope(prisma, ctx({ role: Role.MERCHANT, ownerId: null }), 'batch', 'b1'))
      .rejects.toThrow();
    expect(prisma.batch.findFirst).not.toHaveBeenCalled();
  });
});

describe('ScopeService.assertOwnerInScope', () => {
  it('merchant 自身 ownerId 命中:通过', async () => {
    const prisma = { user: { findFirst: vi.fn().mockResolvedValue({ id: 'm1' }) } } as any;
    await expect(new ScopeService().assertOwnerInScope(prisma, ctx({ role: Role.MERCHANT, ownerId: 'm1' }), 'm1'))
      .resolves.toBeUndefined();
  });
  it('目标 owner 不在范围:抛 Forbidden', async () => {
    const prisma = { user: { findFirst: vi.fn().mockResolvedValue(null) } } as any;
    await expect(new ScopeService().assertOwnerInScope(prisma, ctx({ role: Role.SYSTEM_ADMIN, ownerId: null }), 'mX'))
      .rejects.toThrow();
  });
  it('sysadmin 校验:where 不含 ownerId 维度约束,仅锁 id+role+tenantId', async () => {
    const prisma = { user: { findFirst: vi.fn().mockResolvedValue({ id: 'mX' }) } } as any;
    await new ScopeService().assertOwnerInScope(prisma, ctx({ role: Role.SYSTEM_ADMIN, ownerId: null }), 'mX');
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { AND: [{ id: 'mX', role: Role.MERCHANT, tenantId: 't1' }, {}] }, select: { id: true },
    });
  });
});

describe('ScopeService.resolveOwnerId', () => {
  it('merchant:忽略 dto.ownerId,强制返回 self', async () => {
    const prisma = { user: { findFirst: vi.fn() } } as any;
    const id = await new ScopeService().resolveOwnerId(prisma, ctx({ role: Role.MERCHANT, ownerId: 'm1' }), 'someoneElse');
    expect(id).toBe('m1');
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
  it('merchant 缺 ownerId:抛错', async () => {
    const prisma = { user: { findFirst: vi.fn() } } as any;
    await expect(new ScopeService().resolveOwnerId(prisma, ctx({ role: Role.MERCHANT, ownerId: null }), 'x'))
      .rejects.toThrow();
  });
  it('agent:采纳 dto.ownerId,但须经 assertOwnerInScope 校验(命中)', async () => {
    const prisma = { user: { findFirst: vi.fn().mockResolvedValue({ id: 'm1' }), findMany: vi.fn().mockResolvedValue([{ id: 'm1' }]) } } as any;
    const id = await new ScopeService().resolveOwnerId(prisma, ctx({ role: Role.AGENT_ADMIN, agentId: 'a1' }), 'm1');
    expect(id).toBe('m1');
  });
  it('agent:dto.ownerId 不在范围:抛错', async () => {
    const prisma = { user: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) } } as any;
    await expect(new ScopeService().resolveOwnerId(prisma, ctx({ role: Role.AGENT_ADMIN, agentId: 'a1' }), 'mX'))
      .rejects.toThrow();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter backend test scope.service`
Expected: FAIL,报 `assertInScope is not a function` 等(方法未定义)。

- [ ] **Step 3: 实现三个助手**

在 `packages/backend/src/common/scope/scope.service.ts` 的 `ownedScopeWhere` 方法之后(类闭合 `}` 之前)追加:

```ts
  /** 校验某 batch/field 在调用方作用域内。缺归属即 fail-closed(ownedScopeWhere 抛错)。 */
  async assertInScope(prisma: any, user: AuthUser, entity: 'batch' | 'field', id: string): Promise<void> {
    const scopeWhere = await this.ownedScopeWhere(prisma, user);
    const found = await prisma[entity].findFirst({
      where: { id, ...scopeWhere }, select: { id: true },
    });
    if (!found) throw new ForbiddenException(`${entity} 不在可操作范围内`);
  }

  /** 校验目标 ownerId(role=merchant 的 User)在调用方作用域内。 */
  async assertOwnerInScope(prisma: any, user: AuthUser, ownerId: string): Promise<void> {
    const scopeWhere = await this.ownedScopeWhere(prisma, user);
    // ownedScopeWhere 的 ownerId 维度即 User.id;用 AND 数组避免 id 键冲突。
    const { ownerId: ownerConstraint, ...rest } = scopeWhere;
    const found = await prisma.user.findFirst({
      where: {
        AND: [
          { id: ownerId, role: Role.MERCHANT, ...rest },
          ownerConstraint !== undefined ? { id: ownerConstraint } : {},
        ],
      },
      select: { id: true },
    });
    if (!found) throw new ForbiddenException('目标商家不在可管理范围内');
  }

  /** 统一 create 的 ownerId 语义:merchant 强制 self;agent/sysadmin 采纳 dto.ownerId 并校验范围。 */
  async resolveOwnerId(prisma: any, user: AuthUser, dtoOwnerId: string): Promise<string> {
    if (user.role === Role.MERCHANT) {
      if (!user.ownerId) throw new ForbiddenException('merchant 缺少 ownerId,拒绝创建');
      return user.ownerId;
    }
    await this.assertOwnerInScope(prisma, user, dtoOwnerId);
    return dtoOwnerId;
  }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter backend test scope.service`
Expected: PASS,全部 scope 测试绿(原有 + 新增 ~9 个)。

- [ ] **Step 5: 提交**

```bash
git add packages/backend/src/common/scope/scope.service.ts packages/backend/src/common/scope/scope.service.spec.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(scope): add assertInScope/assertOwnerInScope/resolveOwnerId fail-closed helpers"
```

---

## Task 2: #23 batch.service create ownerId 语义

`BatchService.create` 改为 async,经 `resolveOwnerId` 决定 ownerId(merchant 强制 self,agent/sysadmin 校验后采纳)。

**Files:**
- Modify: `packages/backend/src/modules/batch/batch.service.ts`
- Test: `packages/backend/src/modules/batch/batch.service.spec.ts` (Create)

- [ ] **Step 1: 新建失败测试**

创建 `packages/backend/src/modules/batch/batch.service.spec.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { BatchService } from './batch.service';
import { ScopeService } from '../../common/scope/scope.service';
import { Role, BatchStatus, type AuthUser, type CreateBatchDto } from '@nongchang/shared';

const merchant: AuthUser = { userId: 'op1', tenantId: 't1', role: Role.MERCHANT, agentId: null, ownerId: 'm1' };
const sysadmin: AuthUser = { userId: 's', tenantId: 't1', role: Role.SYSTEM_ADMIN, agentId: null, ownerId: null };
const dto: CreateBatchDto = {
  ownerId: 'someoneElse', fieldId: 'f1', batchNo: 'B1', cropName: '白芍',
  plantDate: '2026-01-01T00:00:00.000Z', expectedHarvest: '2026-06-01T00:00:00.000Z',
  status: BatchStatus.PLANTING,
};

function make() {
  let created: any;
  const prisma = {
    batch: { create: async (a: any) => { created = a; return { id: 'b1', ...a.data }; } },
    user: { findFirst: vi.fn().mockResolvedValue({ id: 'mX' }), findMany: vi.fn().mockResolvedValue([]) },
  };
  return { svc: new BatchService(prisma as any, new ScopeService()), get created() { return created; } };
}

describe('BatchService.create #23', () => {
  it('merchant:忽略 dto.ownerId,强制 ownerId=self', async () => {
    const h = make();
    await h.svc.create(merchant, dto);
    expect(h.created.data.ownerId).toBe('m1');
  });
  it('sysadmin:目标 owner 校验通过则采纳 dto.ownerId', async () => {
    const h = make();
    await h.svc.create(sysadmin, dto);
    expect(h.created.data.ownerId).toBe('someoneElse');
  });
  it('sysadmin:目标 owner 不在范围则抛 Forbidden', async () => {
    let created: any;
    const prisma = {
      batch: { create: async (a: any) => { created = a; return { id: 'b1', ...a.data }; } },
      user: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
    } as any;
    const svc = new BatchService(prisma, new ScopeService());
    await expect(svc.create(sysadmin, dto)).rejects.toThrow();
    expect(created).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter backend test batch.service`
Expected: FAIL(merchant 用例:ownerId 仍为 'someoneElse' 而非 'm1')。

- [ ] **Step 3: 改 batch.service.ts**

把 `packages/backend/src/modules/batch/batch.service.ts` 的 `create` 方法替换为:

```ts
  async create(user: AuthUser, dto: CreateBatchDto) {
    const ownerId = await this.scope.resolveOwnerId(this.prisma, user, dto.ownerId);
    return this.prisma.batch.create({
      data: {
        tenantId: user.tenantId, ownerId, fieldId: dto.fieldId,
        batchNo: dto.batchNo, cropName: dto.cropName,
        plantDate: new Date(dto.plantDate), expectedHarvest: new Date(dto.expectedHarvest),
        status: dto.status,
      },
    });
  }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter backend test batch.service`
Expected: PASS(3 个用例全绿)。

- [ ] **Step 5: 提交**

```bash
git add packages/backend/src/modules/batch/batch.service.ts packages/backend/src/modules/batch/batch.service.spec.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "fix(batch): enforce ownerId scope on create (#23)"
```

---

## Task 3: #23 field.service create ownerId 语义

同 batch,`FieldService.create` 已是 async,改用 `resolveOwnerId`。

**Files:**
- Modify: `packages/backend/src/modules/field/field.service.ts`
- Test: `packages/backend/src/modules/field/field.service.spec.ts` (Create)

- [ ] **Step 1: 新建失败测试**

创建 `packages/backend/src/modules/field/field.service.spec.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { FieldService } from './field.service';
import { ScopeService } from '../../common/scope/scope.service';
import { Role, type AuthUser, type CreateFieldDto } from '@nongchang/shared';

const merchant: AuthUser = { userId: 'op1', tenantId: 't1', role: Role.MERCHANT, agentId: null, ownerId: 'm1' };
const sysadmin: AuthUser = { userId: 's', tenantId: 't1', role: Role.SYSTEM_ADMIN, agentId: null, ownerId: null };
const dto: CreateFieldDto = { ownerId: 'someoneElse', name: 'A区', area: 10, lng: 100, lat: 25 };

function make(ownerFound = true) {
  let created: any;
  const prisma = {
    field: { create: async (a: any) => { created = a; return { id: 'f1', ...a.data }; } },
    user: { findFirst: vi.fn().mockResolvedValue(ownerFound ? { id: 'mX' } : null), findMany: vi.fn().mockResolvedValue([]) },
    $executeRawUnsafe: async () => 1,
  };
  return { svc: new FieldService(prisma as any, new ScopeService()), get created() { return created; } };
}

describe('FieldService.create #23', () => {
  it('merchant:强制 ownerId=self', async () => {
    const h = make();
    await h.svc.create(merchant, dto);
    expect(h.created.data.ownerId).toBe('m1');
  });
  it('sysadmin:目标 owner 命中则采纳 dto.ownerId', async () => {
    const h = make(true);
    await h.svc.create(sysadmin, dto);
    expect(h.created.data.ownerId).toBe('someoneElse');
  });
  it('sysadmin:目标 owner 不在范围则抛 Forbidden(不创建)', async () => {
    const h = make(false);
    await expect(h.svc.create(sysadmin, dto)).rejects.toThrow();
    expect(h.created).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter backend test field.service`
Expected: FAIL(merchant 用例:ownerId 仍为 'someoneElse')。

- [ ] **Step 3: 改 field.service.ts**

把 `packages/backend/src/modules/field/field.service.ts` 的 `create` 方法替换为:

```ts
  async create(user: AuthUser, dto: CreateFieldDto) {
    const { lng, lat, ...rest } = dto;
    const ownerId = await this.scope.resolveOwnerId(this.prisma, user, rest.ownerId);
    const field = await this.prisma.field.create({
      data: { tenantId: user.tenantId, name: rest.name, area: rest.area,
        ownerId, iotDeviceId: rest.iotDeviceId ?? null },
    });
    await this.prisma.$executeRawUnsafe(
      `UPDATE fields SET location = ST_SetSRID(ST_MakePoint($1,$2),4326) WHERE id = $3`,
      lng, lat, field.id,
    );
    return field;
  }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter backend test field.service`
Expected: PASS(3 个用例全绿)。

- [ ] **Step 5: 提交**

```bash
git add packages/backend/src/modules/field/field.service.ts packages/backend/src/modules/field/field.service.spec.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "fix(field): enforce ownerId scope on create (#23)"
```

---

## Task 4: #24 trace.service batch 归属校验

`generateCode` / `addEvent` / `listEvents` 三方法在操作前 `assertInScope(prisma, user, 'batch', batchId)`。三方法已透传 `user`,无需改 controller。`generateCode` / `addEvent` 当前是同步返回 prisma promise,改为 async 先 await 校验。

**Files:**
- Modify: `packages/backend/src/modules/trace/trace.service.ts`
- Test: `packages/backend/src/modules/trace/trace.service.spec.ts` (Create)

- [ ] **Step 1: 新建失败测试**

创建 `packages/backend/src/modules/trace/trace.service.spec.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { TraceService } from './trace.service';
import { ScopeService } from '../../common/scope/scope.service';
import { Role, TraceEventType, type AuthUser, type CreateTraceEventDto } from '@nongchang/shared';

const merchant: AuthUser = { userId: 'op1', tenantId: 't1', role: Role.MERCHANT, agentId: null, ownerId: 'm1' };
const evt: CreateTraceEventDto = {
  batchId: 'b1', type: TraceEventType.FARM, title: '施肥', actor: '张三',
  location: 'A区', occurredAt: '2026-06-14T10:00:00.000Z',
};

function make(batchInScope = true) {
  const prisma = {
    batch: { findFirst: vi.fn().mockResolvedValue(batchInScope ? { id: 'b1' } : null) },
    traceCode: { create: vi.fn().mockResolvedValue({ id: 'tc1' }) },
    traceEvent: {
      create: vi.fn().mockResolvedValue({ id: 'te1' }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  return { svc: new TraceService(prisma as any, new ScopeService()), prisma };
}

describe('TraceService #24 batch 归属校验', () => {
  it('addEvent:batch 在范围内则创建', async () => {
    const h = make(true);
    await h.svc.addEvent(merchant, evt);
    expect(h.prisma.traceEvent.create).toHaveBeenCalled();
  });
  it('addEvent:batch 不在范围则抛 Forbidden(不创建)', async () => {
    const h = make(false);
    await expect(h.svc.addEvent(merchant, evt)).rejects.toThrow();
    expect(h.prisma.traceEvent.create).not.toHaveBeenCalled();
  });
  it('generateCode:batch 不在范围则抛 Forbidden(不创建)', async () => {
    const h = make(false);
    await expect(h.svc.generateCode(merchant, 'b1')).rejects.toThrow();
    expect(h.prisma.traceCode.create).not.toHaveBeenCalled();
  });
  it('listEvents:batch 不在范围则抛 Forbidden(不查询事件)', async () => {
    const h = make(false);
    await expect(h.svc.listEvents(merchant, 'b1')).rejects.toThrow();
    expect(h.prisma.traceEvent.findMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter backend test trace.service`
Expected: FAIL(越权用例未抛错,create/findMany 仍被调用)。

- [ ] **Step 3: 改 trace.service.ts**

把 `packages/backend/src/modules/trace/trace.service.ts` 的三个方法替换为:

```ts
  async generateCode(user: AuthUser, batchId: string) {
    await this.scope.assertInScope(this.prisma, user, 'batch', batchId);
    const code = `ORC-${randomUUID().slice(0, 8).toUpperCase()}`;
    return this.prisma.traceCode.create({ data: { tenantId: user.tenantId, batchId, code } });
  }

  async addEvent(user: AuthUser, dto: CreateTraceEventDto) {
    await this.scope.assertInScope(this.prisma, user, 'batch', dto.batchId);
    return this.prisma.traceEvent.create({
      data: {
        tenantId: user.tenantId, batchId: dto.batchId, type: dto.type, title: dto.title,
        actor: dto.actor, location: dto.location, occurredAt: new Date(dto.occurredAt),
        payload: (dto.payload ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async listEvents(user: AuthUser, batchId: string) {
    await this.scope.assertInScope(this.prisma, user, 'batch', batchId);
    return this.prisma.traceEvent.findMany({
      where: { tenantId: user.tenantId, batchId }, orderBy: { occurredAt: 'asc' },
    });
  }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter backend test trace.service`
Expected: PASS(4 个用例全绿)。

- [ ] **Step 5: 提交**

```bash
git add packages/backend/src/modules/trace/trace.service.ts packages/backend/src/modules/trace/trace.service.spec.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "fix(trace): assert batch ownership on generateCode/addEvent/listEvents (#24)"
```

---

## Task 5: #24 farm-record.service batch/field 归属校验

`create` 在落库前 `assertInScope` 校验 `dto.batchId`(batch)与 `dto.fieldId`(field)。现有 supply 归属校验 + 配额聚合保留不变。

**Files:**
- Modify: `packages/backend/src/modules/farm-record/farm-record.service.ts`
- Test: `packages/backend/src/modules/farm-record/farm-record.service.spec.ts`

- [ ] **Step 1: 在 spec 中补失败测试**

先把 `packages/backend/src/modules/farm-record/farm-record.service.spec.ts` 的 `makeService` 内 prisma 对象补上 batch/field 的 findFirst(用于 assertInScope)。把现有 `prisma` 字面量替换为:

```ts
  const prisma = {
    batch: { findFirst: async () => (overrides.batchScoped === false ? null : { id: 'b1' }) },
    field: { findFirst: async () => (overrides.fieldScoped === false ? null : { id: 'f1' }) },
    farmRecord: {
      create: async (a: any) => { created = a; return { id: 'fr1', ...a.data }; },
      aggregate: async () => ({ _sum: { supplyAmount: overrides.consumed ?? 0 } }),
    },
    supplyIssue: { aggregate: async () => ({ _sum: { amount: overrides.quota ?? 0 } }) },
    supply: { findFirst: async () => (overrides.supplyScoped === false ? null : { id: 'sup1' }) },
  };
```

> 注意:`assertInScope` 与 farm-record 现有 supply 校验都调用 `ownedScopeWhere`,后者对 merchant 会读 `user.ownerId`('m1',已在测试常量中给定),不查库,故无需额外 mock。`batch`/`field` 的 `findFirst` 返回非 null 即视为在范围内。

然后在 `describe('FarmRecordService.create 核销', ...)` 块末尾(最后一个 `it` 之后、`})` 之前)追加:

```ts
  it('batch 不在作用域内:抛 Forbidden(不创建)', async () => {
    const h = makeService({ batchScoped: false });
    await expect(h.svc.create(merchant, { ...base })).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.created).toBeUndefined();
  });
  it('field 不在作用域内:抛 Forbidden(不创建)', async () => {
    const h = makeService({ fieldScoped: false });
    await expect(h.svc.create(merchant, { ...base })).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.created).toBeUndefined();
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter backend test farm-record.service`
Expected: FAIL(新增两个越权用例未抛错,因 create 尚未校验 batch/field)。

- [ ] **Step 3: 改 farm-record.service.ts**

在 `packages/backend/src/modules/farm-record/farm-record.service.ts` 的 `create` 方法最开头(`async create(user, dto) {` 之后第一行)插入归属校验:

```ts
    await this.scope.assertInScope(this.prisma, user, 'batch', dto.batchId);
    await this.scope.assertInScope(this.prisma, user, 'field', dto.fieldId);
```

(其余 supply 校验、配额熔断、create 逻辑保持不变。)

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter backend test farm-record.service`
Expected: PASS(原 5 个 + 新增 2 个全绿)。

- [ ] **Step 5: 提交**

```bash
git add packages/backend/src/modules/farm-record/farm-record.service.ts packages/backend/src/modules/farm-record/farm-record.service.spec.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "fix(farm-record): assert batch/field ownership on create (#24)"
```

---

## Task 6: #27 user.service.list fail-closed

`UserService.list` 的 `if (actor.role === AGENT_ADMIN && actor.agentId)` 短路改为显式:缺 agentId 抛错,不静默放开整租户。

**Files:**
- Modify: `packages/backend/src/modules/user/user.service.ts`
- Test: `packages/backend/src/modules/user/user.service.spec.ts` (Create)

- [ ] **Step 1: 新建失败测试**

创建 `packages/backend/src/modules/user/user.service.spec.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { UserService } from './user.service';
import { Role, type AuthUser } from '@nongchang/shared';

const ctx = (o: Partial<AuthUser>): AuthUser => ({ userId: 'u', tenantId: 't1', role: Role.AGENT_ADMIN, agentId: 'a1', ownerId: null, ...o });

describe('UserService.list #27', () => {
  it('agent_admin 有 agentId:where 含 agentId', () => {
    const prisma = { user: { findMany: vi.fn().mockResolvedValue([]) } } as any;
    new UserService(prisma).list(ctx({ agentId: 'a1' }));
    expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 't1', agentId: 'a1' });
  });
  it('agent_admin 缺 agentId:抛 Forbidden(不查库)', () => {
    const prisma = { user: { findMany: vi.fn() } } as any;
    expect(() => new UserService(prisma).list(ctx({ agentId: null }))).toThrow();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
  it('system_admin:where 仅 tenantId(允许整租户)', () => {
    const prisma = { user: { findMany: vi.fn().mockResolvedValue([]) } } as any;
    new UserService(prisma).list(ctx({ role: Role.SYSTEM_ADMIN, agentId: null }));
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1' });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter backend test user.service`
Expected: FAIL(缺 agentId 用例未抛错,where 退化为仅 tenantId)。

- [ ] **Step 3: 改 user.service.ts**

把 `packages/backend/src/modules/user/user.service.ts` 的 `list` 方法替换为:

```ts
  list(actor: AuthUser) {
    const where: Record<string, string> = { tenantId: actor.tenantId };
    if (actor.role === Role.AGENT_ADMIN) {
      if (!actor.agentId) throw new ForbiddenException('代理管理员缺少 agentId,拒绝访问');
      where.agentId = actor.agentId;
    }
    return this.prisma.user.findMany({
      where, select: { id: true, username: true, role: true, agentId: true, displayName: true, status: true },
    });
  }
```

(`ForbiddenException` 已在该文件首行 import,无需新增。)

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter backend test user.service`
Expected: PASS(3 个用例全绿)。

- [ ] **Step 5: 提交**

```bash
git add packages/backend/src/modules/user/user.service.ts packages/backend/src/modules/user/user.service.spec.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "fix(user): fail-closed when agent_admin missing agentId in list (#27)"
```

---

## Task 7: #27 agent.service.listMerchants fail-closed

`AgentService.listMerchants` 同样把 `&& user.agentId` 短路改为显式 fail-closed。

**Files:**
- Modify: `packages/backend/src/modules/agent/agent.service.ts`
- Test: `packages/backend/src/modules/agent/agent.service.spec.ts`

- [ ] **Step 1: 在 spec 中补失败测试**

在 `packages/backend/src/modules/agent/agent.service.spec.ts` 的 `describe('AgentService.listMerchants', ...)` 块末尾(最后一个 `it` 之后)追加:

```ts
  it('agent_admin 缺 agentId:抛 Forbidden(不查库)', () => {
    const prisma = { user: { findMany: vi.fn() } } as any;
    const svc = new AgentService(prisma, new ScopeService());
    expect(() => svc.listMerchants(ctx({ role: Role.AGENT_ADMIN, agentId: null }))).toThrow();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter backend test agent.service`
Expected: FAIL(缺 agentId 用例未抛错)。

- [ ] **Step 3: 改 agent.service.ts**

在 `packages/backend/src/modules/agent/agent.service.ts` 首行 import 增补 `ForbiddenException`:

```ts
import { ForbiddenException, Injectable } from '@nestjs/common';
```

把 `listMerchants` 方法替换为:

```ts
  listMerchants(user: AuthUser) {
    const where: Record<string, string> = { tenantId: user.tenantId, role: Role.MERCHANT };
    if (user.role === Role.AGENT_ADMIN) {
      if (!user.agentId) throw new ForbiddenException('代理管理员缺少 agentId,拒绝访问');
      where.agentId = user.agentId;
    }
    return this.prisma.user.findMany({ where });
  }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter backend test agent.service`
Expected: PASS(原 2 个 + 新增 1 个全绿)。

- [ ] **Step 5: 提交**

```bash
git add packages/backend/src/modules/agent/agent.service.ts packages/backend/src/modules/agent/agent.service.spec.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "fix(agent): fail-closed when agent_admin missing agentId in listMerchants (#27)"
```

---

## Task 8: 越权 e2e 场景(真实 PG)

在 `isolation.e2e-spec.ts` 增补跨 owner 越权场景。种子已有:`merchantA`(owner 自身,旗下 agentA)拥有 batchA(batchNo `PA-2026-001`)与 fieldA(`A区露地`);`merchantB` 拥有 fieldB(`B区大棚`)。需要先用 merchantA 查到自己的 batchId/fieldId,再用 merchantB 尝试越权。

**Files:**
- Modify: `packages/backend/test/isolation.e2e-spec.ts`

- [ ] **Step 1: 确认 docker PG 运行**

Run: `docker ps --filter name=nongchang-postgis --format "{{.Names}} {{.Status}}"`
Expected: 输出 `nongchang-postgis Up ...`(healthy)。若未运行,先 `docker start nongchang-postgis` 并确保已 seed。

- [ ] **Step 2: 在 e2e 文件末尾追加越权场景**

在 `packages/backend/test/isolation.e2e-spec.ts` 的最后一个 `describe` 块闭合 `});` 之后追加:

```ts
describe('租户内跨 owner 越权(#23/#24)', () => {
  async function merchantABatchAndField() {
    const t = await token('merchantA');
    const batches = await request(app.getHttpServer())
      .get('/api/batches').set('Authorization', `Bearer ${t}`).expect(200);
    const fields = await request(app.getHttpServer())
      .get('/api/fields').set('Authorization', `Bearer ${t}`).expect(200);
    return { batchId: batches.body[0].id, fieldId: fields.body[0].id };
  }

  it('merchantB 用 merchantA 的 batchId/fieldId 建农事记录 → 403', async () => {
    const { batchId, fieldId } = await merchantABatchAndField();
    const tB = await token('merchantB');
    await request(app.getHttpServer())
      .post('/api/farm-records').set('Authorization', `Bearer ${tB}`)
      .send({
        batchId, fieldId, action: '越权施肥',
        recordedAt: '2026-06-14T10:00:00.000Z', source: 'miniapp',
      }).expect(403);
  });

  it('merchantB 用 merchantA 的 batchId 列溯源事件 → 403', async () => {
    const { batchId } = await merchantABatchAndField();
    const tB = await token('merchantB');
    await request(app.getHttpServer())
      .get(`/api/trace/events/${batchId}`).set('Authorization', `Bearer ${tB}`)
      .expect(403);
  });

  it('merchant 建 batch 传他人 ownerId → 被强制为 self(记录归属 merchantB 自己)', async () => {
    const { fieldId } = await merchantABatchAndField(); // 仅借 fieldId 形态;下面用 merchantB 自己的 field
    const tB = await token('merchantB');
    const fieldsB = await request(app.getHttpServer())
      .get('/api/fields').set('Authorization', `Bearer ${tB}`).expect(200);
    const ownFieldId = fieldsB.body[0].id;
    const res = await request(app.getHttpServer())
      .post('/api/batches').set('Authorization', `Bearer ${tB}`)
      .send({
        ownerId: '00000000-0000-0000-0000-000000000000', fieldId: ownFieldId,
        batchNo: `E2E-${Date.now()}`, cropName: '测试白芍',
        plantDate: '2026-01-01T00:00:00.000Z', expectedHarvest: '2026-06-01T00:00:00.000Z',
        status: 'Planting',
      }).expect(201);
    // ownerId 被强制覆盖为 merchantB 自身,绝不会是传入的全零 UUID
    expect(res.body.ownerId).not.toBe('00000000-0000-0000-0000-000000000000');
  });
});
```

> 说明:batch create 由 `@Roles(SYSTEM_ADMIN, MERCHANT)` 保护(参见 batch.controller),merchant 可建;`source: 'miniapp'` 对应 `FarmRecordSource.MINIAPP`。第三个用例借 merchantB 自己的 field 以通过 #24 field 归属校验,从而隔离验证 #23 的 ownerId 强制覆盖。

- [ ] **Step 3: 运行 e2e 确认通过**

Run: `pnpm --filter backend test isolation`
Expected: PASS(原有 + 新增 3 个越权用例全绿)。若 batch/field 列表为空导致 `body[0]` 取值失败,说明 DB 未 seed,先 `pnpm --filter backend exec prisma db seed`。

- [ ] **Step 4: 提交**

```bash
git add packages/backend/test/isolation.e2e-spec.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "test(e2e): tenant-internal cross-owner authz scenarios (#23/#24)"
```

---

## Task 9: 全量验证

**Files:** 无(验证)

- [ ] **Step 1: 后端全量测试**

Run: `pnpm --filter backend test`
Expected: 全绿,总数约 73 + 14 单元 + 3 e2e ≈ 90。无 fail。

- [ ] **Step 2: 三处构建**

Run: `pnpm --filter @nongchang/shared build && pnpm --filter backend build && pnpm --filter web build`
Expected: 三处均成功,无 TS 报错。

- [ ] **Step 3: 确认无遗漏改动**

Run: `git status --short`
Expected: 干净(所有改动已提交)。

---

## Self-Review 结论

- **Spec 覆盖:** #23(Task 2/3)、#24(Task 4/5)、#27(Task 6/7)、ScopeService 助手(Task 1)、e2e 越权(Task 8)、基线验证(Task 9)。设计的 `assertInScope`/`assertOwnerInScope` 均落到 Task 1;`resolveOwnerId` 是对设计「方案 B」merchant 强制 self + agent/sysadmin 校验的统一封装(设计中描述为分支逻辑,这里抽成一个助手,语义等价且更 DRY)。
- **占位符:** 无 TBD / TODO;每个改码步骤均给出完整代码。
- **类型一致:** `assertInScope(prisma, user, entity, id)`、`assertOwnerInScope(prisma, user, ownerId)`、`resolveOwnerId(prisma, user, dtoOwnerId)` 在 Task 1 定义,Task 2-5 调用签名一致;`ForbiddenException` 在 user.service 已 import、agent.service Task 7 补 import。

