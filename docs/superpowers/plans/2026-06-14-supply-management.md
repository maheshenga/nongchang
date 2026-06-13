# 农资投入品管理真实化 实现计划(子项目 5-2a/b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 web 后台 `LogisticsTracker.tsx` 的「农资投入品管理」Tab 从前端 mock 改造为「商家维度库存 → 领用即出库 → 农户打卡核销熔断」的真实闭环。

**Architecture:** 新增独立 `SupplyModule`(service+controller),走全局 JwtAuthGuard + ScopeService(merchant 作用域,fail-closed)。新建 `Supply`/`SupplyIssue` 两表 + `FarmRecord` 加两列。`FarmRecordService.create` 加核销熔断(DB 端 `_sum` 聚合)。web 农资 Tab 与小程序记一笔页接真实 API。

**Tech Stack:** NestJS 10 + Prisma + PostgreSQL,zod(shared DTO),React 19 + Vite(web),Taro(miniapp),Vitest。

**关键既有契约(实现时严格对齐):**
- `ScopeService.ownedScopeWhere(prisma, user)` —— async,返回带 ownerId 的 where(merchant→`ownerId=self`、agent→`ownerId in[旗下]`、sysadmin→`{tenantId}`),fail-closed 抛 `ForbiddenException`。
- Controller:`@CurrentUser() user: AuthUser`,无需手写 `@Roles` 也受全局 JwtAuthGuard 保护;写端点按需加 `@Roles`。
- `ZodValidationPipe`:`@Body(new ZodValidationPipe(schema)) dto`。
- Module:`@Module({ providers: [XxxService, ScopeService], controllers: [XxxController] })`(PrismaService 是 @Global)。
- shared `index.ts`:value 与 type 分开显式命名导出(rollup CJS 静态分析需要)。
- web 客户端:模块级稳定函数,走 `request<T>(path, init?)`(自动加 `/api` 前缀 + JWT + 401 刷新)。
- 种子账号:merchantA(ownerId=自身 userId、agentId=agentA)、merchantB(agentId=agentB),均 password123。批次 batchA 归 merchantA。

**测试基线**:后端现 55/55,web 现 20/20,不可回归。

---

### Task 1: shared 包新增农资 DTO + FarmRecord 核销字段

**Files:**
- Create: `packages/shared/src/dto/supply.dto.ts`
- Modify: `packages/shared/src/dto/entities.dto.ts:41-51`(createFarmRecordSchema 加两个可选字段)
- Modify: `packages/shared/src/index.ts:6-21`(加 supply 导出)

- [ ] **Step 1: 创建 supply.dto.ts**

```ts
import { z } from 'zod';

export const supplyItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  unit: z.string(),
  total: z.number(),
  used: z.number(),
  remaining: z.number(),
  alert: z.boolean(),
  createdAt: z.string(),
});
export type SupplyItem = z.infer<typeof supplyItemSchema>;

export const createSupplyInputSchema = z.object({
  name: z.string().min(1).max(128),
  unit: z.string().min(1).max(32),
  amount: z.number().positive(),
});
export type CreateSupplyInput = z.infer<typeof createSupplyInputSchema>;

export const issueSupplyInputSchema = z.object({
  batchId: z.string().uuid(),
  amount: z.number().positive(),
});
export type IssueSupplyInput = z.infer<typeof issueSupplyInputSchema>;

export const supplyIssueResponseSchema = z.object({
  supplyId: z.string(),
  used: z.number(),
  remaining: z.number(),
});
export type SupplyIssueResponse = z.infer<typeof supplyIssueResponseSchema>;
```

- [ ] **Step 2: 给 createFarmRecordSchema 加两个可选字段**

在 `entities.dto.ts` 的 `createFarmRecordSchema` 对象里(`source:` 行之后、`})` 之前)加:

```ts
  supplyId: z.string().uuid().optional(),
  supplyAmount: z.number().positive().optional(),
```

- [ ] **Step 3: 在 index.ts 加导出**

在 anti-fake 导出块之后(第 42 行后)加:

```ts
export {
  supplyItemSchema,
  createSupplyInputSchema,
  issueSupplyInputSchema,
  supplyIssueResponseSchema,
} from './dto/supply.dto';
export type {
  SupplyItem,
  CreateSupplyInput,
  IssueSupplyInput,
  SupplyIssueResponse,
} from './dto/supply.dto';
```

- [ ] **Step 4: 构建 shared 验证**

Run: `pnpm --filter @nongchang/shared build`
Expected: 构建成功,无 TS 错误,`dist/` 更新。

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/dto/supply.dto.ts packages/shared/src/dto/entities.dto.ts packages/shared/src/index.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(shared): add supply DTOs + farm-record verification fields"
```

---

### Task 2: Prisma schema 加 Supply/SupplyIssue 表 + FarmRecord 两列 + 迁移

**Files:**
- Modify: `packages/backend/prisma/schema.prisma`(FarmRecord 加两列 + 两个新 model)
- Create: `packages/backend/prisma/migrations/20260614100000_supply/migration.sql`

- [ ] **Step 1: FarmRecord model 加两列**

在 `packages/backend/prisma/schema.prisma` 的 `FarmRecord` model 里,`source String` 行之后加:

```prisma
  supplyId     String?  @map("supply_id")
  supplyAmount Float?   @map("supply_amount")
```

- [ ] **Step 2: 文件末尾追加两个 model**

```prisma
model Supply {
  id        String   @id @default(uuid())
  tenantId  String   @map("tenant_id")
  ownerId   String   @map("owner_id")
  name      String
  unit      String
  total     Float    @default(0)
  used      Float    @default(0)
  createdAt DateTime @default(now()) @map("created_at")

  @@index([tenantId])
  @@index([ownerId])
  @@map("supplies")
}

model SupplyIssue {
  id        String   @id @default(uuid())
  tenantId  String   @map("tenant_id")
  ownerId   String   @map("owner_id")
  supplyId  String   @map("supply_id")
  batchId   String   @map("batch_id")
  amount    Float
  createdAt DateTime @default(now()) @map("created_at")

  @@index([tenantId])
  @@index([ownerId])
  @@index([supplyId])
  @@index([batchId, supplyId])
  @@map("supply_issues")
}
```

- [ ] **Step 3: 写迁移 SQL**

Create `packages/backend/prisma/migrations/20260614100000_supply/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "farm_records" ADD COLUMN "supply_id" TEXT;
ALTER TABLE "farm_records" ADD COLUMN "supply_amount" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "supplies" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "used" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supplies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supply_issues" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "supply_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supply_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplies_tenant_id_idx" ON "supplies"("tenant_id");
CREATE INDEX "supplies_owner_id_idx" ON "supplies"("owner_id");
CREATE INDEX "supply_issues_tenant_id_idx" ON "supply_issues"("tenant_id");
CREATE INDEX "supply_issues_owner_id_idx" ON "supply_issues"("owner_id");
CREATE INDEX "supply_issues_supply_id_idx" ON "supply_issues"("supply_id");
CREATE INDEX "supply_issues_batch_id_supply_id_idx" ON "supply_issues"("batch_id", "supply_id");
```

- [ ] **Step 4: 应用迁移 + 重新生成 client**

Run: `cd packages/backend && pnpm prisma migrate deploy && pnpm prisma generate`
Expected: 迁移 `20260614100000_supply` 应用成功;Prisma client 重新生成含 `supply`/`supplyIssue`。
注意:必须用 `migrate deploy`(项目惯例,避免 PostGIS GIST 索引误删提示),切勿用 `migrate dev`。

- [ ] **Step 5: Commit**

```bash
git add packages/backend/prisma/schema.prisma packages/backend/prisma/migrations/20260614100000_supply/
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(backend): add supplies/supply_issues tables + farm_record verification columns"
```

---

### Task 3: SupplyService(库存列表/入库/领用/删除,TDD)

**Files:**
- Create: `packages/backend/src/modules/supply/supply.service.ts`
- Test: `packages/backend/src/modules/supply/supply.service.spec.ts`

阈值常量:`LOW_STOCK_THRESHOLD = 10`(remaining < 10 → alert)。

- [ ] **Step 1: 写失败测试** — Create `packages/backend/src/modules/supply/supply.service.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SupplyService } from './supply.service';
import { ScopeService } from '../../common/scope/scope.service';
import { Role, type AuthUser } from '@nongchang/shared';

const sysadmin: AuthUser = { userId: 'u1', tenantId: 't1', role: Role.SYSTEM_ADMIN, agentId: null, ownerId: null };
const merchant: AuthUser = { userId: 'u2', tenantId: 't1', role: Role.MERCHANT, agentId: null, ownerId: 'm1' };
const BATCH = '11111111-1111-1111-1111-111111111111';

function makeService(overrides: any = {}) {
  const prisma = {
    supply: {
      findMany: async () => [], findFirst: async () => null,
      create: async (a: any) => ({ id: 's-new', ...a.data, createdAt: new Date('2026-06-14T10:00:00Z') }),
      delete: async () => ({}),
      ...(overrides.supply ?? {}),
    },
    $transaction: async (fn: any) => fn({
      supply: { update: async (a: any) => ({ id: a.where.id, ...a.data }) },
      supplyIssue: { create: async (a: any) => a.data },
    }),
  };
  return { svc: new SupplyService(prisma as any, new ScopeService()), prisma };
}

describe('SupplyService.list', () => {
  it('sysadmin 按 tenantId 过滤并计算 remaining/alert', async () => {
    let captured: any;
    const { svc } = makeService({ supply: { findMany: async (a: any) => { captured = a; return [
      { id: 's1', name: '复合肥', unit: '包', total: 100, used: 95, createdAt: new Date('2026-06-14T10:00:00Z') },
    ]; } } });
    const res = await svc.list(sysadmin);
    expect(captured.where).toEqual({ tenantId: 't1' });
    expect(captured.orderBy).toEqual({ createdAt: 'desc' });
    expect(res[0]).toEqual({ id: 's1', name: '复合肥', unit: '包', total: 100, used: 95, remaining: 5, alert: true, createdAt: '2026-06-14T10:00:00.000Z' });
  });
  it('merchant 注入 ownerId 过滤', async () => {
    let captured: any;
    const { svc } = makeService({ supply: { findMany: async (a: any) => { captured = a; return []; } } });
    await svc.list(merchant);
    expect(captured.where).toEqual({ tenantId: 't1', ownerId: 'm1' });
  });
  it('merchant 缺 ownerId fail-closed 抛 Forbidden', async () => {
    const { svc } = makeService();
    await expect(svc.list({ userId: 'u', tenantId: 't1', role: Role.MERCHANT, agentId: null, ownerId: null } as AuthUser))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('SupplyService.create', () => {
  it('merchant 强制 ownerId=self,total=amount,used=0', async () => {
    let captured: any;
    const { svc } = makeService({ supply: { create: async (a: any) => { captured = a; return { id: 's-new', ...a.data, createdAt: new Date('2026-06-14T10:00:00Z') }; } } });
    await svc.create(merchant, { name: '尿素', unit: '袋', amount: 50 });
    expect(captured.data.ownerId).toBe('m1');
    expect(captured.data.tenantId).toBe('t1');
    expect(captured.data.total).toBe(50);
    expect(captured.data.used).toBe(0);
  });
});

describe('SupplyService.issue', () => {
  it('正常领用:事务内 used+=amount 且写 SupplyIssue,返回 remaining', async () => {
    const { svc } = makeService({
      supply: { findFirst: async () => ({ id: 's1', ownerId: 'm1', tenantId: 't1', total: 100, used: 20 }) },
    });
    const res = await svc.issue(merchant, 's1', { batchId: BATCH, amount: 30 });
    expect(res).toEqual({ supplyId: 's1', used: 50, remaining: 50 });
  });
  it('超量(amount>remaining)抛 BadRequest', async () => {
    const { svc } = makeService({
      supply: { findFirst: async () => ({ id: 's1', ownerId: 'm1', tenantId: 't1', total: 100, used: 95 }) },
    });
    await expect(svc.issue(merchant, 's1', { batchId: BATCH, amount: 30 }))
      .rejects.toBeInstanceOf(BadRequestException);
  });
  it('越权(supply 不在作用域)抛 Forbidden', async () => {
    const { svc } = makeService({ supply: { findFirst: async () => null } });
    await expect(svc.issue(merchant, 'other', { batchId: BATCH, amount: 1 }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('SupplyService.remove', () => {
  it('作用域内删除成功', async () => {
    let deleted: any;
    const { svc } = makeService({
      supply: { findFirst: async () => ({ id: 's1', ownerId: 'm1' }), delete: async (a: any) => { deleted = a; return {}; } },
    });
    await svc.remove(merchant, 's1');
    expect(deleted.where).toEqual({ id: 's1' });
  });
  it('越权删除抛 Forbidden', async () => {
    const { svc } = makeService({ supply: { findFirst: async () => null } });
    await expect(svc.remove(merchant, 'other')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd packages/backend && pnpm test supply.service`
Expected: FAIL(`SupplyService` 模块找不到)。

- [ ] **Step 3: 写实现** — Create `packages/backend/src/modules/supply/supply.service.ts`:

```ts
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthUser, SupplyItem, CreateSupplyInput, IssueSupplyInput, SupplyIssueResponse } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';

const LOW_STOCK_THRESHOLD = 10;

interface SupplyRow { id: string; name: string; unit: string; total: number; used: number; createdAt: Date; }

function toItem(r: SupplyRow): SupplyItem {
  const remaining = r.total - r.used;
  return { id: r.id, name: r.name, unit: r.unit, total: r.total, used: r.used,
    remaining, alert: remaining < LOW_STOCK_THRESHOLD, createdAt: r.createdAt.toISOString() };
}

@Injectable()
export class SupplyService {
  constructor(private prisma: PrismaService, private scope: ScopeService) {}

  async list(user: AuthUser): Promise<SupplyItem[]> {
    const where = await this.scope.ownedScopeWhere(this.prisma, user);
    const rows = (await this.prisma.supply.findMany({ where, orderBy: { createdAt: 'desc' } })) as SupplyRow[];
    return rows.map(toItem);
  }

  async create(user: AuthUser, input: CreateSupplyInput): Promise<SupplyItem> {
    const scopeWhere = await this.scope.ownedScopeWhere(this.prisma, user);
    const ownerId = (scopeWhere as { ownerId?: string }).ownerId;
    if (!ownerId) throw new BadRequestException('当前角色无归属,无法登记农资(需 merchant)');
    const row = (await this.prisma.supply.create({
      data: { tenantId: user.tenantId, ownerId, name: input.name, unit: input.unit, total: input.amount, used: 0 },
    })) as SupplyRow;
    return toItem(row);
  }

  /** 校验 supply 在作用域内,否则 fail-closed。 */
  private async scopedSupply(user: AuthUser, id: string): Promise<{ id: string; total: number; used: number }> {
    const where = await this.scope.ownedScopeWhere(this.prisma, user);
    const sup = await this.prisma.supply.findFirst({ where: { id, ...(where as object) } as any });
    if (!sup) throw new ForbiddenException('农资不在可操作范围内');
    return sup as { id: string; total: number; used: number };
  }

  async issue(user: AuthUser, id: string, input: IssueSupplyInput): Promise<SupplyIssueResponse> {
    const sup = await this.scopedSupply(user, id);
    const remaining = sup.total - sup.used;
    if (input.amount > remaining) throw new BadRequestException('领用量超过剩余库存,超量熔断');
    const scopeWhere = await this.scope.ownedScopeWhere(this.prisma, user);
    const ownerId = (scopeWhere as { ownerId?: string }).ownerId ?? '';
    await this.prisma.$transaction(async (tx: any) => {
      await tx.supply.update({ where: { id }, data: { used: sup.used + input.amount } });
      await tx.supplyIssue.create({
        data: { tenantId: user.tenantId, ownerId, supplyId: id, batchId: input.batchId, amount: input.amount },
      });
    });
    return { supplyId: id, used: sup.used + input.amount, remaining: remaining - input.amount };
  }

  async remove(user: AuthUser, id: string): Promise<{ id: string }> {
    await this.scopedSupply(user, id);
    await this.prisma.supply.delete({ where: { id } });
    return { id };
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd packages/backend && pnpm test supply.service`
Expected: PASS(9 个 it 全绿)。

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/modules/supply/supply.service.ts packages/backend/src/modules/supply/supply.service.spec.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(backend): SupplyService 库存列表/入库/领用熔断/删除(TDD)"
```

---

### Task 4: SupplyController + SupplyModule + 注册 AppModule

**Files:**
- Create: `packages/backend/src/modules/supply/supply.controller.ts`
- Create: `packages/backend/src/modules/supply/supply.module.ts`
- Modify: `packages/backend/src/app.module.ts:15`(import)与 `:36`(imports 数组)

- [ ] **Step 1: 写 Controller** — Create `packages/backend/src/modules/supply/supply.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { AuthUser, CreateSupplyInput, IssueSupplyInput, createSupplyInputSchema, issueSupplyInputSchema, Role } from '@nongchang/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SupplyService } from './supply.service';

@Controller('supplies')
export class SupplyController {
  constructor(private svc: SupplyService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.svc.list(user);
  }

  @Post() @Roles(Role.SYSTEM_ADMIN, Role.MERCHANT)
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createSupplyInputSchema)) dto: CreateSupplyInput) {
    return this.svc.create(user, dto);
  }

  @Post(':id/issue') @Roles(Role.SYSTEM_ADMIN, Role.MERCHANT)
  issue(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(issueSupplyInputSchema)) dto: IssueSupplyInput) {
    return this.svc.issue(user, id, dto);
  }

  @Delete(':id') @Roles(Role.SYSTEM_ADMIN, Role.MERCHANT)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.remove(user, id);
  }
}
```

- [ ] **Step 2: 写 Module** — Create `packages/backend/src/modules/supply/supply.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ScopeService } from '../../common/scope/scope.service';
import { SupplyService } from './supply.service';
import { SupplyController } from './supply.controller';

@Module({ providers: [SupplyService, ScopeService], controllers: [SupplyController] })
export class SupplyModule {}
```

- [ ] **Step 3: 注册到 AppModule**

在 `packages/backend/src/app.module.ts` 第 15 行(`import { AntiFakeModule }...`)之后加:

```ts
import { SupplyModule } from './modules/supply/supply.module';
```

在 imports 数组里 `AntiFakeModule,`(第 36 行)之后加:

```ts
    SupplyModule,
```

- [ ] **Step 4: 构建后端验证编译**

Run: `cd packages/backend && pnpm build`
Expected: 构建成功,无 TS 错误。

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/modules/supply/supply.controller.ts packages/backend/src/modules/supply/supply.module.ts packages/backend/src/app.module.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(backend): SupplyController + SupplyModule + 注册 AppModule"
```

---

### Task 5: FarmRecordService 核销熔断(TDD)

**Files:**
- Modify: `packages/backend/src/modules/farm-record/farm-record.service.ts`
- Test: `packages/backend/src/modules/farm-record/farm-record.service.spec.ts`(新建)

核销规则:打卡带 `supplyId`+`supplyAmount` 时,`(该批次该农资历史已消耗 + 本次) > 该批次该农资配额 × 1.1` → 抛 BadRequest。无 `supplyId` 走原路径。

- [ ] **Step 1: 写失败测试** — Create `packages/backend/src/modules/farm-record/farm-record.service.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { FarmRecordService } from './farm-record.service';
import { ScopeService } from '../../common/scope/scope.service';
import { Role, FarmRecordSource, type AuthUser } from '@nongchang/shared';

const merchant: AuthUser = { userId: 'op1', tenantId: 't1', role: Role.MERCHANT, agentId: null, ownerId: 'm1' };
const BATCH = '11111111-1111-1111-1111-111111111111';
const FIELD = '22222222-2222-2222-2222-222222222222';
const base = { batchId: BATCH, fieldId: FIELD, action: '施肥', recordedAt: '2026-06-14T10:00:00.000Z', source: FarmRecordSource.MINIAPP };

function makeService(overrides: any = {}) {
  let created: any;
  const prisma = {
    farmRecord: {
      create: async (a: any) => { created = a; return { id: 'fr1', ...a.data }; },
      aggregate: async () => ({ _sum: { supplyAmount: overrides.consumed ?? 0 } }),
    },
    supplyIssue: { aggregate: async () => ({ _sum: { amount: overrides.quota ?? 0 } }) },
  };
  return { svc: new FarmRecordService(prisma as any, new ScopeService()), get created() { return created; } };
}

describe('FarmRecordService.create 核销', () => {
  it('无 supplyId:走原路径,不校验配额', async () => {
    const h = makeService();
    const r = await h.svc.create(merchant, { ...base });
    expect(r.id).toBe('fr1');
    expect(h.created.data.supplyId).toBeUndefined();
  });
  it('带 supplyId 且未超配额110%:落两列', async () => {
    const h = makeService({ quota: 100, consumed: 0 });
    await h.svc.create(merchant, { ...base, supplyId: 'sup1', supplyAmount: 50 });
    expect(h.created.data.supplyId).toBe('sup1');
    expect(h.created.data.supplyAmount).toBe(50);
  });
  it('恰好等于配额110%:通过', async () => {
    const h = makeService({ quota: 100, consumed: 60 });
    await expect(h.svc.create(merchant, { ...base, supplyId: 'sup1', supplyAmount: 50 })).resolves.toBeDefined();
  });
  it('超过配额110%:抛 BadRequest', async () => {
    const h = makeService({ quota: 100, consumed: 65 });
    await expect(h.svc.create(merchant, { ...base, supplyId: 'sup1', supplyAmount: 50 }))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd packages/backend && pnpm test farm-record.service`
Expected: FAIL(`create` 仍同步、无核销逻辑,带 supplyId 用例不抛错)。

- [ ] **Step 3: 改实现** — 替换 `packages/backend/src/modules/farm-record/farm-record.service.ts` 的 `create` 方法:

```ts
  async create(user: AuthUser, dto: CreateFarmRecordDto) {
    if (dto.supplyId && dto.supplyAmount != null) {
      const quotaAgg = await this.prisma.supplyIssue.aggregate({
        where: { batchId: dto.batchId, supplyId: dto.supplyId }, _sum: { amount: true },
      });
      const consumedAgg = await this.prisma.farmRecord.aggregate({
        where: { batchId: dto.batchId, supplyId: dto.supplyId }, _sum: { supplyAmount: true },
      });
      const quota = quotaAgg._sum.amount ?? 0;
      const consumed = consumedAgg._sum.supplyAmount ?? 0;
      if (consumed + dto.supplyAmount > quota * 1.1) {
        throw new BadRequestException('实际用量超过领用配额 110%,核销熔断');
      }
    }
    return this.prisma.farmRecord.create({
      data: {
        tenantId: user.tenantId, batchId: dto.batchId, fieldId: dto.fieldId,
        operatorId: user.userId, action: dto.action,
        detail: (dto.detail ?? undefined) as Prisma.InputJsonValue | undefined,
        images: (dto.images ?? undefined) as Prisma.InputJsonValue | undefined,
        location: dto.location ?? null, recordedAt: new Date(dto.recordedAt), source: dto.source,
        supplyId: dto.supplyId ?? undefined, supplyAmount: dto.supplyAmount ?? undefined,
      },
    });
  }
```

同时在文件顶部 import 加 `BadRequestException`:

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd packages/backend && pnpm test farm-record.service`
Expected: PASS(4 个 it 全绿)。

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/modules/farm-record/farm-record.service.ts packages/backend/src/modules/farm-record/farm-record.service.spec.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(backend): FarmRecord 核销熔断(打卡消耗超配额110%拒绝,TDD)"
```

---

### Task 6: 后端 e2e(真实 PG,作用域隔离 + 熔断 + 核销)

**Files:**
- Create: `packages/backend/test/supply.e2e-spec.ts`

参考现有 `test/anti-fake.e2e-spec.ts` 的引导模式:真实 `AppModule` + supertest,`app.setGlobalPrefix('api')`,用 seed 账号登录拿 JWT。种子:merchantA(归 ORC-DEMO 的 batchA)、merchantB(不同 agent),均 password123。afterAll 清理本测试新建数据避免污染共享 PG。

实现前先读 `test/anti-fake.e2e-spec.ts` 确认 app 引导/登录辅助/PrismaService 获取的确切写法,完全照搬其 `beforeAll`/`afterAll`/登录工具,仅替换业务断言。

- [ ] **Step 1: 写 e2e 测试** — Create `packages/backend/test/supply.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

async function login(app: INestApplication, username: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login').send({ username, password: 'password123' });
  return res.body.accessToken;
}

describe('Supply e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenA: string;
  let tokenB: string;
  let batchAId: string;
  const createdSupplyIds: string[] = [];

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    tokenA = await login(app, 'merchantA');
    tokenB = await login(app, 'merchantB');
    // 取 merchantA 名下一个批次 id 供领用/核销使用
    const userA = await prisma.user.findFirst({ where: { username: 'merchantA' } });
    const batchA = await prisma.batch.findFirst({ where: { ownerId: userA!.id } });
    batchAId = batchA!.id;
  });

  afterAll(async () => {
    if (createdSupplyIds.length) {
      await prisma.supplyIssue.deleteMany({ where: { supplyId: { in: createdSupplyIds } } });
      await prisma.farmRecord.deleteMany({ where: { supplyId: { in: createdSupplyIds } } });
      await prisma.supply.deleteMany({ where: { id: { in: createdSupplyIds } } });
    }
    await app.close();
  });

  it('入库 → 领用扣减 → 列表 remaining 正确', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/supplies').set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'e2e复合肥', unit: '包', amount: 100 });
    expect(create.status).toBe(201);
    const id = create.body.id;
    createdSupplyIds.push(id);
    expect(create.body.remaining).toBe(100);

    const issue = await request(app.getHttpServer())
      .post(`/api/supplies/${id}/issue`).set('Authorization', `Bearer ${tokenA}`)
      .send({ batchId: batchAId, amount: 30 });
    expect(issue.status).toBe(201);
    expect(issue.body.used).toBe(30);
    expect(issue.body.remaining).toBe(70);

    const list = await request(app.getHttpServer())
      .get('/api/supplies').set('Authorization', `Bearer ${tokenA}`);
    const found = list.body.find((s: any) => s.id === id);
    expect(found.remaining).toBe(70);
  });

  it('领用超量 → 400 熔断,库存不变', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/supplies').set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'e2e尿素', unit: '袋', amount: 10 });
    const id = create.body.id;
    createdSupplyIds.push(id);
    const issue = await request(app.getHttpServer())
      .post(`/api/supplies/${id}/issue`).set('Authorization', `Bearer ${tokenA}`)
      .send({ batchId: batchAId, amount: 50 });
    expect(issue.status).toBe(400);
    const after = await prisma.supply.findUnique({ where: { id } });
    expect(after!.used).toBe(0);
  });

  it('作用域隔离:merchantB 看不到 A 的农资,越权领用/删除被拒', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/supplies').set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'e2e隔离品', unit: '件', amount: 20 });
    const id = create.body.id;
    createdSupplyIds.push(id);

    const listB = await request(app.getHttpServer())
      .get('/api/supplies').set('Authorization', `Bearer ${tokenB}`);
    expect(listB.body.find((s: any) => s.id === id)).toBeUndefined();

    const issueB = await request(app.getHttpServer())
      .post(`/api/supplies/${id}/issue`).set('Authorization', `Bearer ${tokenB}`)
      .send({ batchId: batchAId, amount: 1 });
    expect(issueB.status).toBe(403);

    const delB = await request(app.getHttpServer())
      .delete(`/api/supplies/${id}`).set('Authorization', `Bearer ${tokenB}`);
    expect(delB.status).toBe(403);
  });

  it('核销:领用配额后打卡超110% → 400;未超 → 201 落两列', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/supplies').set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'e2e核销品', unit: '桶', amount: 200 });
    const id = create.body.id;
    createdSupplyIds.push(id);
    // 配额 100
    await request(app.getHttpServer())
      .post(`/api/supplies/${id}/issue`).set('Authorization', `Bearer ${tokenA}`)
      .send({ batchId: batchAId, amount: 100 });
    const userA = await prisma.user.findFirst({ where: { username: 'merchantA' } });
    const batchA = await prisma.batch.findFirst({ where: { id: batchAId } });

    // 打卡消耗 100(≤110)→ 201
    const ok = await request(app.getHttpServer())
      .post('/api/farm-records').set('Authorization', `Bearer ${tokenA}`)
      .send({ batchId: batchAId, fieldId: batchA!.fieldId, action: '施肥',
        recordedAt: new Date().toISOString(), source: 'miniapp', supplyId: id, supplyAmount: 100 });
    expect(ok.status).toBe(201);
    expect(ok.body.supplyId).toBe(id);
    expect(ok.body.supplyAmount).toBe(100);

    // 再打卡消耗 20(累计 120 > 110)→ 400
    const bad = await request(app.getHttpServer())
      .post('/api/farm-records').set('Authorization', `Bearer ${tokenA}`)
      .send({ batchId: batchAId, fieldId: batchA!.fieldId, action: '施肥',
        recordedAt: new Date().toISOString(), source: 'miniapp', supplyId: id, supplyAmount: 20 });
    expect(bad.status).toBe(400);
  });
});
```

- [ ] **Step 2: 运行 e2e 确认通过**(Docker `nongchang-postgis` 须 healthy)

Run: `cd packages/backend && pnpm test supply.e2e`
Expected: PASS(4 个 it 全绿)。若 supertest POST 返回码与断言不符,先核对现有 anti-fake e2e 的状态码惯例(无 body POST → 201)再调整。

- [ ] **Step 3: 跑全量后端测试确认不回归**

Run: `cd packages/backend && pnpm test`
Expected: PASS,总数 = 55(原) + 9(Task3) + 4(Task5) + 4(Task6) = 72。

- [ ] **Step 4: Commit**

```bash
git add packages/backend/test/supply.e2e-spec.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "test(backend): supply e2e 入库/领用熔断/作用域隔离/核销(真实 PG)"
```

---

### Task 7: web supply API 客户端(TDD)

**Files:**
- Create: `packages/web/src/api/supply.ts`
- Test: `packages/web/src/api/supply.spec.ts`

参考现有 `packages/web/src/api/anti-fake.ts`(模块级稳定函数 + `request` 包装器)与 `anti-fake.spec.ts`(mock `./request`)。

- [ ] **Step 1: 写失败测试** — Create `packages/web/src/api/supply.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const requestMock = vi.fn();
vi.mock('./request', () => ({ request: (...args: any[]) => requestMock(...args) }));

import { listSupplies, createSupply, issueSupply, deleteSupply } from './supply';

beforeEach(() => requestMock.mockReset().mockResolvedValue(undefined));

describe('supply api client', () => {
  it('listSupplies GET /supplies', async () => {
    await listSupplies();
    expect(requestMock).toHaveBeenCalledWith('/supplies');
  });
  it('createSupply POST /supplies 带 body', async () => {
    await createSupply({ name: '复合肥', unit: '包', amount: 50 });
    expect(requestMock).toHaveBeenCalledWith('/supplies', {
      method: 'POST', body: JSON.stringify({ name: '复合肥', unit: '包', amount: 50 }),
    });
  });
  it('issueSupply POST /supplies/:id/issue,id 编码', async () => {
    await issueSupply('a b', { batchId: 'B1', amount: 10 });
    expect(requestMock).toHaveBeenCalledWith('/supplies/a%20b/issue', {
      method: 'POST', body: JSON.stringify({ batchId: 'B1', amount: 10 }),
    });
  });
  it('deleteSupply DELETE /supplies/:id,id 编码', async () => {
    await deleteSupply('a b');
    expect(requestMock).toHaveBeenCalledWith('/supplies/a%20b', { method: 'DELETE' });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd packages/web && pnpm test supply`
Expected: FAIL(`./supply` 模块不存在)。

- [ ] **Step 3: 写实现** — Create `packages/web/src/api/supply.ts`:

```ts
import type { SupplyItem, CreateSupplyInput, IssueSupplyInput, SupplyIssueResponse } from '@nongchang/shared';
import { request } from './request';

export function listSupplies(): Promise<SupplyItem[]> {
  return request<SupplyItem[]>('/supplies');
}

export function createSupply(input: CreateSupplyInput): Promise<SupplyItem> {
  return request<SupplyItem>('/supplies', { method: 'POST', body: JSON.stringify(input) });
}

export function issueSupply(id: string, input: IssueSupplyInput): Promise<SupplyIssueResponse> {
  return request<SupplyIssueResponse>(`/supplies/${encodeURIComponent(id)}/issue`, {
    method: 'POST', body: JSON.stringify(input),
  });
}

export function deleteSupply(id: string): Promise<{ id: string }> {
  return request<{ id: string }>(`/supplies/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd packages/web && pnpm test supply`
Expected: PASS(4 个 it 全绿)。

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/api/supply.ts packages/web/src/api/supply.spec.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(web): supply API 客户端(列表/入库/领用/删除,TDD)"
```

---

### Task 8: LogisticsTracker 农资 Tab 真实化

**Files:**
- Modify: `packages/web/src/components/LogisticsTracker.tsx`

只改农资(`supplies`)Tab:删 `MOCK_SUPPLIES` 与 `suppliesData` state,改 `useApi(listSupplies)`;入库/领用/删除调真实 API;`DemoBadge` 仅在非农资 Tab 渲染;`remaining`/`alert` 用后端字段;超量熔断改由后端错误驱动 toast。实时追踪 Tab(用 `MOCK_ROUTES`/`routes`/`markRouteDelivered`)与路径优化 Tab **保持不变**。

实现前先读当前 `LogisticsTracker.tsx` 全文确认行号锚点(本计划写就时为 573 行)。

- [ ] **Step 1: 改 import 与数据源**

顶部加:
```ts
import { useApi } from '../hooks/useApi';
import { listSupplies, createSupply, issueSupply, deleteSupply } from '../api/supply';
```
删除 `MOCK_SUPPLIES` 常量定义。
删除 `const [suppliesData, setSuppliesData] = useState(MOCK_SUPPLIES);`,替换为:
```ts
const { data: supplies, loading: suppliesLoading, error: suppliesError, reload: reloadSupplies } = useApi(listSupplies);
```
(`useApi.error` 是 string,渲染时直接用 `{suppliesError}`,不要 `.message`。)

- [ ] **Step 2: 改 DemoBadge 条件渲染**

把标题里的 `<DemoBadge />` 改为:
```tsx
{viewMode !== 'supplies' && <DemoBadge />}
```

- [ ] **Step 3: 改入库提交 `handleInboundSubmit`**

替换为真实调用(去掉本地 setSuppliesData):
```ts
const handleInboundSubmit = async () => {
  if (!inboundPayload.name || inboundPayload.amount <= 0) return showToast('请输入完整信息');
  try {
    await createSupply({ name: inboundPayload.name, unit: inboundPayload.unit, amount: inboundPayload.amount });
    setShowInboundModal(false);
    setInboundPayload({ name: '', amount: 0, unit: '箱' });
    showToast('农资入库完成');
    await reloadSupplies();
  } catch (e: any) {
    showToast(e?.message || '入库失败');
  }
};
```

- [ ] **Step 4: 改领用提交 `handleIssueSubmit`**

替换为真实调用(超量熔断改由后端返回错误驱动):
```ts
const handleIssueSubmit = async () => {
  if (!issuePayload.supplyId || issuePayload.amount <= 0) return showToast('请输入完整信息');
  if (!issuePayload.targetBatch) return showToast('请填写关联批次号');
  try {
    await issueSupply(issuePayload.supplyId, { batchId: issuePayload.targetBatch, amount: issuePayload.amount });
    setShowOutboundModal(false);
    setIssuePayload({ supplyId: '', amount: 0, targetBatch: '' });
    showToast('领用单下发成功');
    await reloadSupplies();
  } catch (e: any) {
    showToast(e?.message || '领用失败(可能超量熔断)');
  }
};
```

- [ ] **Step 5: 改删除按钮**

把农资台账列表项删除按钮的 onClick 改为真实调用:
```ts
onClick={async () => {
  if (window.confirm('确认删除此农资记录吗?')) {
    try {
      await deleteSupply(item.id);
      showToast(`已删除农资档案:${item.name}`);
      await reloadSupplies();
    } catch (e: any) {
      showToast(e?.message || '删除失败');
    }
  }
}}
```

- [ ] **Step 6: 改农资 Tab 渲染数据源**

把农资 Tab 内遍历 `suppliesData.map(...)` 改为遍历 `(supplies ?? []).map(...)`;每项的剩余量直接用 `item.remaining`、预警用 `item.alert`(删去前端 `item.total - item.used` 计算与本地 alert 推导)。领用下拉选项的「剩余」也用 `s.remaining`。进度条宽度用 `(item.used / item.total) * 100`。在农资 Tab 顶部加 loading/error 态:`{suppliesLoading && <加载中>}` 与 `{suppliesError && <span className="text-red-600">{suppliesError}</span>}`(复用其他屏既定样式)。

- [ ] **Step 7: 运行 web 全量测试 + 构建**

Run: `cd packages/web && pnpm test && pnpm build`
Expected: 测试全绿(总数 = 20 原 + 4 Task7 = 24),构建成功。LogisticsTracker 现有若无组件测试则不强制新增(契约已在 supply.spec 覆盖)。

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/components/LogisticsTracker.tsx
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(web): LogisticsTracker 农资Tab真实化(去mock/去徽标,接 supply API)"
```

---

### Task 9: 小程序记一笔页加可选农资核销

**Files:**
- Modify: `packages/miniapp/src/api/farm.ts`(加 `listSupplies`)
- Modify: `packages/miniapp/src/pages/record/index.tsx`(加农资选择器 + 用量)

小程序 `request` 风格为 `request({ url, method, data })`(见 farm.ts);`createFarmRecord(dto)` 已接受完整 DTO,加农资只需页面把 `supplyId`/`supplyAmount` 放进 dto。

- [ ] **Step 1: farm.ts 加 listSupplies**

在 `packages/miniapp/src/api/farm.ts` 顶部 import 加 `SupplyItem`:
```ts
import type { CreateFarmRecordDto, SupplyItem } from '@nongchang/shared';
```
在 `uploadImage` 之前加:
```ts
export function listSupplies(): Promise<SupplyItem[]> {
  return request<SupplyItem[]>({ url: '/supplies' });
}
```

- [ ] **Step 2: record/index.tsx 加农资状态与拉取**

在现有 import 加:
```ts
import { createFarmRecord, uploadImage, listSupplies } from '../../api/farm';
import type { SupplyItem } from '@nongchang/shared';
```
(删去原来只 import `createFarmRecord, uploadImage` 的那行,合并为上面一行。)

在 state 区(`const [submitting, ...]` 附近)加:
```ts
const [supplies, setSupplies] = useState<SupplyItem[]>([]);
const [supplyId, setSupplyId] = useState('');
const [supplyAmount, setSupplyAmount] = useState('');

useEffect(() => {
  listSupplies().then(setSupplies).catch(() => setSupplies([]));
}, []);
```
顶部 import 补 `useEffect`:`import { useState, useEffect } from 'react';`

- [ ] **Step 3: submit 带上农资字段**

把 `createFarmRecord({...})` 调用改为(在 `source` 后加两字段,仅当选了农资):
```ts
await createFarmRecord({
  batchId,
  fieldId,
  action,
  detail: note ? { note } : undefined,
  images: images.length ? images : undefined,
  recordedAt: new Date().toISOString(),
  source: FarmRecordSource.MINIAPP,
  ...(supplyId ? { supplyId, supplyAmount: Number(supplyAmount) || 0 } : {}),
});
```
保存成功/失败逻辑不变(后端核销熔断返回的错误已被现有 `catch (e: any) { Taro.showToast({ title: e.message ... }) }` 捕获显示)。

- [ ] **Step 4: 加农资选择 UI**

在「备注」Textarea 之后、「照片」之前插入:
```tsx
<Text style={{ fontSize: '28px', display: 'block', marginTop: '24px' }}>使用农资(可选)</Text>
{supplies.length === 0 ? (
  <Text style={{ color: '#999', fontSize: '24px', display: 'block', marginTop: '8px' }}>无可选农资</Text>
) : (
  <View style={{ display: 'flex', flexWrap: 'wrap', marginTop: '16px' }}>
    {supplies.map(s => (
      <View key={s.id} onClick={() => setSupplyId(supplyId === s.id ? '' : s.id)}
        style={{ padding: '12px 20px', marginRight: '12px', marginBottom: '12px', borderRadius: '24px',
          background: supplyId === s.id ? '#2e7d32' : '#fff', color: supplyId === s.id ? '#fff' : '#333' }}>
        <Text>{s.name}(剩余 {s.remaining} {s.unit})</Text>
      </View>
    ))}
  </View>
)}
{supplyId ? (
  <Textarea value={supplyAmount} onInput={e => setSupplyAmount(e.detail.value)}
    placeholder="本次用量" style={{ background: '#fff', padding: '16px', borderRadius: '8px', marginTop: '12px', width: '100%', height: '80px' }} />
) : null}
```

- [ ] **Step 5: 构建小程序确认不破**

Run: `pnpm --filter miniapp build`
Expected: 构建成功,无 TS 错误。

- [ ] **Step 6: Commit**

```bash
git add packages/miniapp/src/api/farm.ts packages/miniapp/src/pages/record/index.tsx
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(miniapp): 记一笔页加可选农资核销(选农资+填用量,触发后端核销熔断)"
```

---

### Task 10: 全量验证关卡(最终任务)

**Files:** 无新增,只验证。

- [ ] **Step 1: shared 构建**

Run: `pnpm --filter @nongchang/shared build`
Expected: 成功。

- [ ] **Step 2: backend 构建 + lint + 全量测试**

Run: `cd packages/backend && pnpm build && pnpm lint && pnpm test`
Expected: 构建/lint 干净;测试 72 全绿(55 原 + 9 + 4 + 4)。需 Docker `nongchang-postgis` healthy。

- [ ] **Step 3: web 构建 + lint + 全量测试**

Run: `cd packages/web && pnpm build && pnpm lint && pnpm test`
Expected: 构建/lint 干净;测试 24 全绿(20 原 + 4)。

- [ ] **Step 4: miniapp 构建**

Run: `pnpm --filter miniapp build`
Expected: 成功。

- [ ] **Step 5: 最终复审 commit(若验证中有修补)**

```bash
git add -A
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "chore: 子项目5-2a/b 农资管理真实化 全量验证通过"
```
(若 Step 1-4 全绿且无改动,跳过本步。)

---

## 文件结构总览

| 文件 | 职责 | Task |
|---|---|---|
| `packages/shared/src/dto/supply.dto.ts` | 农资 zod DTO | 1 |
| `packages/shared/src/dto/entities.dto.ts` | FarmRecord DTO 加核销字段 | 1 |
| `packages/backend/prisma/schema.prisma` + migration | Supply/SupplyIssue 表 + FarmRecord 两列 | 2 |
| `packages/backend/src/modules/supply/supply.service.ts` | 库存/领用/删除 + 作用域 fail-closed | 3 |
| `packages/backend/src/modules/supply/supply.controller.ts` | REST 端点 | 4 |
| `packages/backend/src/modules/supply/supply.module.ts` | 模块装配 | 4 |
| `packages/backend/src/modules/farm-record/farm-record.service.ts` | 核销熔断 | 5 |
| `packages/backend/test/supply.e2e-spec.ts` | e2e | 6 |
| `packages/web/src/api/supply.ts` | web 客户端 | 7 |
| `packages/web/src/components/LogisticsTracker.tsx` | 农资 Tab 真实化 | 8 |
| `packages/miniapp/src/api/farm.ts` + `pages/record/index.tsx` | 小程序核销 | 9 |
