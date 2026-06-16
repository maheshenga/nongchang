# AI 算力 & 二维码额度计费系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为农场 SaaS 新增预付额度池计费体系,对 AI 算力(按调用次数加权)与二维码生成数量(按个数)计量收费,支持平台→代理商→商户三级转账制分配与硬熔断,并在后台 web 与小程序植入 AI 功能。

**Architecture:** 新增 `CreditAccount`(账户)+ `CreditLedger`(不可变流水)双表 + 3 个枚举。新建 `billing` 模块封装 consume/allocate/recharge/summary/ledger。在 `ai.service` 与 `trace.service` 两处插桩扣费(AI 成功后扣、生码同事务扣)。前端新增额度 API 客户端、后台 BillingAdmin 栏目与 3 项 AI 增强、小程序余额条+用量中心。

**Tech Stack:** NestJS 10 + Prisma 5.22 + PostgreSQL;React 19 + Vite 6 + Tailwind v4;Taro 小程序;Zod + TypeScript(@nongchang/shared);vitest 测试。

**约定(来自现有代码,务必遵守):**
- 后端单测:`cd /e/code/nongchang/packages/backend && npx vitest run src/modules/billing/billing.service.spec.ts`
- 后端构建:`pnpm --filter @nongchang/backend build`
- web 构建:`pnpm --filter web build`;web 测试:`pnpm --filter web test`
- 后端 dev:`packages/backend` 内 `npm run start:dev`(监听 **3001** 端口)
- 种子账号:sysadmin / agentA / agentB / merchantA / merchantB,密码均 `password123`
- AuthUser = `{ userId, tenantId, role, agentId, ownerId }`
- 角色枚举值:`system_admin` / `agent_admin` / `merchant`(`Role.SYSTEM_ADMIN` 等)
- BatchStatus 字符串:Planting/Growing/Harvested/Distributed
- Write/Edit 单次必须 < 13000 字符
- 所有面向用户文本用中文

**AI 扣费权重:** chat=1、diagnose=3、transcribe=2(常量 `AI_WEIGHT`)。
**低额预警阈值:** 余额 < 初始额度 10%(前端展示用,后端不强制)。
**平台账户固定 ownerId:** 常量 `PLATFORM_OWNER_ID = 'PLATFORM'`。

---

## 文件结构

**后端**
- `packages/backend/prisma/schema.prisma` — 加 `CreditAccount`、`CreditLedger` 两 model + 三枚举
- `packages/backend/prisma/migrations/<ts>_credit_billing/migration.sql` — 迁移
- `packages/backend/src/modules/billing/billing.service.ts` — 核心逻辑
- `packages/backend/src/modules/billing/billing.service.spec.ts` — 单测
- `packages/backend/src/modules/billing/billing.controller.ts` — REST 端点
- `packages/backend/src/modules/billing/billing.module.ts` — 模块,导出 service
- `packages/backend/src/modules/billing/billing.constants.ts` — 常量(权重/平台 id)
- `packages/backend/src/app.module.ts` — 注册 BillingModule
- `packages/backend/src/modules/ai/ai.service.ts` + `ai.module.ts` — 注入 BillingService + 插桩
- `packages/backend/src/modules/trace/trace.service.ts` + `trace.module.ts` — 注入 + 插桩
- `packages/backend/test/billing.e2e.spec.ts` — 端到端(若 test 目录存在 e2e 习惯)

**shared**
- `packages/shared/src/dto/billing.dto.ts` — zod 契约
- `packages/shared/src/index.ts` — 导出

**web**
- `packages/web/src/api/billing.ts` — API 客户端
- `packages/web/src/components/BillingAdmin.tsx` — 额度仪表板+分配+流水
- `packages/web/src/components/AiAssistant.tsx` — 加 AI 数据问答 + 批量诊断
- `packages/web/src/components/FarmRecords.tsx` — 加 AI 农事建议入口(或放 AiAssistant)
- `packages/web/src/App.tsx` — 新栏目接线

**miniapp**
- `packages/miniapp/src/api/billing.ts` — summary/ledger 客户端
- `packages/miniapp/src/pages/usage/*` — 用量中心页
- 工作台页 — 余额条;RecordForm — AI 推荐;AiPanel — diagnose 增强

---

## 阶段一:数据模型与 shared 契约

### Task 1: shared DTO 契约

**Files:**
- Create: `packages/shared/src/dto/billing.dto.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 写 billing.dto.ts**

```typescript
import { z } from 'zod';

export const creditOwnerTypeSchema = z.enum(['PLATFORM', 'AGENT', 'MERCHANT']);
export type CreditOwnerType = z.infer<typeof creditOwnerTypeSchema>;

export const creditResourceSchema = z.enum(['AI', 'CODE']);
export type CreditResource = z.infer<typeof creditResourceSchema>;

export const ledgerReasonSchema = z.enum([
  'RECHARGE', 'ALLOCATE_IN', 'ALLOCATE_OUT', 'CONSUME', 'REFUND',
]);
export type LedgerReason = z.infer<typeof ledgerReasonSchema>;

// 当前用户可见账户的余额摘要。
export const billingSummarySchema = z.object({
  ownerType: creditOwnerTypeSchema,
  ownerId: z.string(),
  aiBalance: z.number(),
  codeBalance: z.number(),
});
export type BillingSummary = z.infer<typeof billingSummarySchema>;

// 下级账户列表项(平台看代理商 / 代理商看商户)。
export const creditAccountItemSchema = z.object({
  id: z.string(),
  ownerType: creditOwnerTypeSchema,
  ownerId: z.string(),
  ownerName: z.string(),       // 代理商名/商户显示名
  aiBalance: z.number(),
  codeBalance: z.number(),
});
export type CreditAccountItem = z.infer<typeof creditAccountItemSchema>;

export const creditLedgerItemSchema = z.object({
  id: z.string(),
  resource: creditResourceSchema,
  delta: z.number(),
  balanceAfter: z.number(),
  reason: ledgerReasonSchema,
  refType: z.string().nullable(),
  refId: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type CreditLedgerItem = z.infer<typeof creditLedgerItemSchema>;

export const ledgerQuerySchema = z.object({
  resource: creditResourceSchema.optional(),
  reason: ledgerReasonSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type LedgerQuery = z.infer<typeof ledgerQuerySchema>;

export const paginatedLedgerSchema = z.object({
  items: z.array(creditLedgerItemSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type PaginatedLedger = z.infer<typeof paginatedLedgerSchema>;

// 分配额度给下级:转账制。targetOwnerId 为下级 account 的 ownerId。
export const allocateSchema = z.object({
  targetOwnerType: z.enum(['AGENT', 'MERCHANT']),
  targetOwnerId: z.string().min(1),
  resource: creditResourceSchema,
  amount: z.number().int().min(1),
});
export type AllocateInput = z.infer<typeof allocateSchema>;

// 平台充值(仅 system_admin)。
export const rechargeSchema = z.object({
  resource: creditResourceSchema,
  amount: z.number().int().min(1),
});
export type RechargeInput = z.infer<typeof rechargeSchema>;
```

- [ ] **Step 2: 在 index.ts 导出**

在 `packages/shared/src/index.ts` 末尾追加:

```typescript
export {
  creditOwnerTypeSchema, creditResourceSchema, ledgerReasonSchema,
  billingSummarySchema, creditAccountItemSchema, creditLedgerItemSchema,
  ledgerQuerySchema, paginatedLedgerSchema, allocateSchema, rechargeSchema,
} from './dto/billing.dto';
export type {
  CreditOwnerType, CreditResource, LedgerReason, BillingSummary,
  CreditAccountItem, CreditLedgerItem, LedgerQuery, PaginatedLedger,
  AllocateInput, RechargeInput,
} from './dto/billing.dto';
```

- [ ] **Step 3: 构建 shared 验证类型**

Run: `pnpm --filter @nongchang/shared build`
Expected: 构建成功,无 TS 错误

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/dto/billing.dto.ts packages/shared/src/index.ts
git commit -m "feat(shared): 计费额度 DTO 契约"
```

### Task 2: Prisma 模型 + 迁移

**Files:**
- Modify: `packages/backend/prisma/schema.prisma`
- Create: `packages/backend/prisma/migrations/<timestamp>_credit_billing/migration.sql`(由 prisma migrate 生成)

- [ ] **Step 1: 在 schema.prisma 末尾(其他 model 之后)加枚举与两 model**

```prisma
enum CreditOwnerType {
  PLATFORM
  AGENT
  MERCHANT
}

enum CreditResource {
  AI
  CODE
}

enum LedgerReason {
  RECHARGE
  ALLOCATE_IN
  ALLOCATE_OUT
  CONSUME
  REFUND
}

model CreditAccount {
  id          String          @id @default(uuid())
  ownerType   CreditOwnerType @map("owner_type")
  ownerId     String          @map("owner_id")
  tenantId    String          @map("tenant_id")
  aiBalance   Int             @default(0) @map("ai_balance")
  codeBalance Int             @default(0) @map("code_balance")
  createdAt   DateTime        @default(now()) @map("created_at")
  updatedAt   DateTime        @updatedAt @map("updated_at")
  ledgers     CreditLedger[]

  @@unique([ownerType, ownerId])
  @@index([tenantId])
  @@map("credit_accounts")
}

model CreditLedger {
  id           String         @id @default(uuid())
  accountId    String         @map("account_id")
  account      CreditAccount  @relation(fields: [accountId], references: [id])
  resource     CreditResource
  delta        Int
  balanceAfter Int            @map("balance_after")
  reason       LedgerReason
  refType      String?        @map("ref_type")
  refId        String?        @map("ref_id")
  operatorId   String?        @map("operator_id")
  note         String?
  createdAt    DateTime       @default(now()) @map("created_at")

  @@index([accountId, createdAt])
  @@map("credit_ledgers")
}
```

- [ ] **Step 2: 生成迁移**

Run: `cd /e/code/nongchang/packages/backend && npx prisma migrate dev --name credit_billing`
Expected: 新迁移创建,Prisma Client 重新生成,无错误

- [ ] **Step 3: 验证 Client 类型**

Run: `pnpm --filter @nongchang/backend build`
Expected: 构建成功(Prisma Client 已含 creditAccount/creditLedger)

- [ ] **Step 4: Commit**

```bash
git add packages/backend/prisma/schema.prisma packages/backend/prisma/migrations
git commit -m "feat(billing): CreditAccount/CreditLedger 模型与迁移"
```

---

## 阶段二:后端 billing 模块

### Task 3: billing 常量

**Files:**
- Create: `packages/backend/src/modules/billing/billing.constants.ts`

- [ ] **Step 1: 写常量**

```typescript
import type { CreditResource } from '@nongchang/shared';

// 平台账户的固定 ownerId(全局唯一一个平台账户)。
export const PLATFORM_OWNER_ID = 'PLATFORM';

// AI 各能力单次调用扣减权重。
export const AI_WEIGHT = {
  chat: 1,
  diagnose: 3,
  transcribe: 2,
} as const;

export type AiKind = keyof typeof AI_WEIGHT;

// 余额字段名映射:资源 → CreditAccount 列。
export const BALANCE_FIELD: Record<CreditResource, 'aiBalance' | 'codeBalance'> = {
  AI: 'aiBalance',
  CODE: 'codeBalance',
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/backend/src/modules/billing/billing.constants.ts
git commit -m "feat(billing): 常量(权重/平台id/字段映射)"
```

### Task 4: BillingService(核心,TDD)

**Files:**
- Create: `packages/backend/src/modules/billing/billing.service.ts`
- Test: `packages/backend/src/modules/billing/billing.service.spec.ts`

BillingService 公开方法:
- `ensureAccount(ownerType, ownerId, tenantId)` → CreditAccount(无则建)
- `consume(user, resource, amount, ref)` → 解析消费账户 + 原子条件递减 + 写 CONSUME 流水;余额不足抛 ForbiddenException
- `allocate(user, dto)` → 转账制:转出账户 -amount(ALLOCATE_OUT)+ 转入账户 +amount(ALLOCATE_IN),同事务
- `recharge(user, dto)` → 平台账户 +amount(RECHARGE),仅 system_admin
- `summary(user)` → BillingSummary(当前用户账户余额)
- `listAccounts(user)` → CreditAccountItem[](下级账户)
- `ledger(user, query)` → PaginatedLedger

`resolveConsumerAccount(user)` 私有:MERCHANT→(MERCHANT, user.ownerId);AGENT_ADMIN→(AGENT, user.agentId);SYSTEM_ADMIN→(PLATFORM, PLATFORM_OWNER_ID)。缺归属 id fail-closed 抛 ForbiddenException。

- [ ] **Step 1: 写失败测试 billing.service.spec.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { BillingService } from './billing.service';
import { Role, type AuthUser } from '@nongchang/shared';

const sysadmin: AuthUser = { userId: 'u1', tenantId: 't1', role: Role.SYSTEM_ADMIN, agentId: null, ownerId: null };
const agent: AuthUser = { userId: 'u2', tenantId: 't1', role: Role.AGENT_ADMIN, agentId: 'a1', ownerId: null };
const merchant: AuthUser = { userId: 'u3', tenantId: 't1', role: Role.MERCHANT, agentId: null, ownerId: 'm1' };

// 以可变 state 模拟条件原子递减:updateMany 仅在 balance>=amount 时命中(count=1)。
function makeService(opts: { aiBalance?: number; codeBalance?: number; account?: any } = {}) {
  const state: any = { aiBalance: opts.aiBalance ?? 0, codeBalance: opts.codeBalance ?? 0 };
  const ledgers: any[] = [];
  const accountRow = opts.account ?? { id: 'acc1', ownerType: 'MERCHANT', ownerId: 'm1', tenantId: 't1' };
  const tx = {
    creditAccount: {
      updateMany: async (a: any) => {
        const field = a.data.aiBalance ? 'aiBalance' : 'codeBalance';
        const dec = (a.data.aiBalance ?? a.data.codeBalance).decrement;
        const min = field === 'aiBalance' ? a.where.aiBalance.gte : a.where.codeBalance.gte;
        if (state[field] >= min) { state[field] -= dec; return { count: 1 }; }
        return { count: 0 };
      },
      update: async (a: any) => {
        const field = a.data.aiBalance ? 'aiBalance' : 'codeBalance';
        state[field] += (a.data.aiBalance ?? a.data.codeBalance).increment;
        return { ...accountRow, ...state };
      },
      findFirst: async () => ({ ...accountRow, ...state }),
      findUnique: async () => ({ ...accountRow, ...state }),
    },
    creditLedger: { create: async (a: any) => { ledgers.push(a.data); return a.data; } },
  };
  const prisma: any = {
    ...tx,
    $transaction: async (fn: any) => fn(tx),
  };
  const svc = new BillingService(prisma);
  return { svc, state, ledgers, prisma };
}

describe('BillingService.consume', () => {
  it('余额充足:AI 扣减并写 CONSUME 流水', async () => {
    const { svc, state, ledgers } = makeService({ aiBalance: 10 });
    await svc.consume(merchant, 'AI', 3, { refType: 'ai.diagnose' });
    expect(state.aiBalance).toBe(7);
    expect(ledgers[0]).toMatchObject({ resource: 'AI', delta: -3, balanceAfter: 7, reason: 'CONSUME', refType: 'ai.diagnose' });
  });
  it('余额不足:抛 Forbidden 且余额不变、无流水', async () => {
    const { svc, state, ledgers } = makeService({ aiBalance: 2 });
    await expect(svc.consume(merchant, 'AI', 3, { refType: 'ai.diagnose' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(state.aiBalance).toBe(2);
    expect(ledgers).toHaveLength(0);
  });
  it('merchant 缺 ownerId fail-closed', async () => {
    const { svc } = makeService({ aiBalance: 10 });
    const bad = { ...merchant, ownerId: null } as AuthUser;
    await expect(svc.consume(bad, 'AI', 1, {})).rejects.toBeInstanceOf(ForbiddenException);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /e/code/nongchang/packages/backend && npx vitest run src/modules/billing/billing.service.spec.ts`
Expected: FAIL(BillingService 未定义)

- [ ] **Step 3: 写 billing.service.ts(核心扣费 + 账户解析)**

```typescript
import { ForbiddenException, Injectable } from '@nestjs/common';
import type {
  AuthUser, CreditResource, CreditOwnerType, BillingSummary,
  CreditAccountItem, LedgerQuery, PaginatedLedger, AllocateInput, RechargeInput,
} from '@nongchang/shared';
import { Role } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { PLATFORM_OWNER_ID, BALANCE_FIELD } from './billing.constants';

interface ConsumeRef { refType?: string; refId?: string; operatorId?: string; note?: string }

@Injectable()
export class BillingService {
  constructor(private prisma: PrismaService) {}

  // 按角色解析消费账户归属。缺归属 id fail-closed。
  private resolveConsumer(user: AuthUser): { ownerType: CreditOwnerType; ownerId: string } {
    if (user.role === Role.SYSTEM_ADMIN) return { ownerType: 'PLATFORM', ownerId: PLATFORM_OWNER_ID };
    if (user.role === Role.AGENT_ADMIN) {
      if (!user.agentId) throw new ForbiddenException('agent_admin 缺少 agentId,拒绝计费');
      return { ownerType: 'AGENT', ownerId: user.agentId };
    }
    if (user.role === Role.MERCHANT) {
      if (!user.ownerId) throw new ForbiddenException('merchant 缺少 ownerId,拒绝计费');
      return { ownerType: 'MERCHANT', ownerId: user.ownerId };
    }
    throw new ForbiddenException('未知角色,拒绝计费');
  }

  async ensureAccount(ownerType: CreditOwnerType, ownerId: string, tenantId: string) {
    const found = await this.prisma.creditAccount.findUnique({ where: { ownerType_ownerId: { ownerType, ownerId } } });
    if (found) return found;
    return this.prisma.creditAccount.create({ data: { ownerType, ownerId, tenantId } });
  }

  // 原子条件递减 + 写流水。余额不足抛 Forbidden(硬熔断)。
  async consume(user: AuthUser, resource: CreditResource, amount: number, ref: ConsumeRef) {
    const { ownerType, ownerId } = this.resolveConsumer(user);
    const acct = await this.ensureAccount(ownerType, ownerId, user.tenantId);
    const field = BALANCE_FIELD[resource];
    return this.prisma.$transaction(async (tx) => {
      const upd = await tx.creditAccount.updateMany({
        where: { id: acct.id, [field]: { gte: amount } },
        data: { [field]: { decrement: amount } },
      });
      if (upd.count === 0) {
        const label = resource === 'AI' ? 'AI 算力' : '二维码';
        throw new ForbiddenException(`${label}额度不足,请联系上级充值`);
      }
      const after = await tx.creditAccount.findUnique({ where: { id: acct.id } });
      const balanceAfter = (after as any)[field] as number;
      await tx.creditLedger.create({
        data: {
          accountId: acct.id, resource, delta: -amount, balanceAfter, reason: 'CONSUME',
          refType: ref.refType ?? null, refId: ref.refId ?? null,
          operatorId: ref.operatorId ?? user.userId, note: ref.note ?? null,
        },
      });
      return { balanceAfter };
    });
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd /e/code/nongchang/packages/backend && npx vitest run src/modules/billing/billing.service.spec.ts`
Expected: PASS(3 个 consume 用例)

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/modules/billing/billing.service.ts packages/backend/src/modules/billing/billing.service.spec.ts
git commit -m "feat(billing): BillingService.consume 原子扣费(TDD)"
```

### Task 5: BillingService.allocate / recharge(转账制,TDD)

**Files:**
- Modify: `packages/backend/src/modules/billing/billing.service.ts`
- Test: `packages/backend/src/modules/billing/billing.service.spec.ts`

`allocate` 语义:from = 调用方账户(平台/代理商),to = 目标下级账户。同一 `$transaction`:from 条件递减(不足抛 Forbidden,ALLOCATE_OUT 流水),to 递增(ALLOCATE_IN 流水)。权限:system_admin 可分配给 AGENT;agent_admin 可分配给其旗下 MERCHANT(校验 target 商户的 agentId=user.agentId)。`recharge` 仅 system_admin,给平台账户加额(RECHARGE)。

- [ ] **Step 1: 追加失败测试**

```typescript
describe('BillingService.allocate', () => {
  it('总量守恒:转出 -N(ALLOCATE_OUT)+ 转入 +N(ALLOCATE_IN)', async () => {
    // from=平台账户(余额100),to=代理商账户(余额0)
    const fromState: any = { aiBalance: 100, codeBalance: 0 };
    const toState: any = { aiBalance: 0, codeBalance: 0 };
    const ledgers: any[] = [];
    const accounts: Record<string, any> = {
      PLATFORM: { id: 'accP', ownerType: 'PLATFORM', ownerId: 'PLATFORM', tenantId: 't1', state: fromState },
      a1: { id: 'accA', ownerType: 'AGENT', ownerId: 'a1', tenantId: 't1', state: toState },
    };
    const tx: any = {
      creditAccount: {
        updateMany: async (a: any) => {
          const acc = a.where.id === 'accP' ? fromState : toState;
          if (a.data.aiBalance?.decrement != null) {
            if (acc.aiBalance >= a.where.aiBalance.gte) { acc.aiBalance -= a.data.aiBalance.decrement; return { count: 1 }; }
            return { count: 0 };
          }
          acc.aiBalance += a.data.aiBalance.increment; return { count: 1 };
        },
        findUnique: async (a: any) => (a.where.id === 'accP' ? { ...accounts.PLATFORM, ...fromState } : { ...accounts.a1, ...toState }),
        findFirst: async (a: any) => {
          const ot = a.where.ownerType, oi = a.where.ownerId;
          if (ot === 'PLATFORM') return { ...accounts.PLATFORM, ...fromState };
          if (oi === 'a1') return { ...accounts.a1, ...toState };
          return null;
        },
        create: async (a: any) => ({ id: 'accNew', ...a.data }),
      },
      creditLedger: { create: async (a: any) => { ledgers.push(a.data); return a.data; } },
    };
    const prisma: any = { ...tx, $transaction: async (fn: any) => fn(tx),
      user: { findFirst: async () => ({ id: 'a1' }) } };
    const { BillingService } = await import('./billing.service');
    const svc = new BillingService(prisma);
    await svc.allocate(sysadmin, { targetOwnerType: 'AGENT', targetOwnerId: 'a1', resource: 'AI', amount: 30 });
    expect(fromState.aiBalance).toBe(70);
    expect(toState.aiBalance).toBe(30);
    const out = ledgers.find((l) => l.reason === 'ALLOCATE_OUT');
    const inn = ledgers.find((l) => l.reason === 'ALLOCATE_IN');
    expect(out.delta + inn.delta).toBe(0); // 总量守恒
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /e/code/nongchang/packages/backend && npx vitest run src/modules/billing/billing.service.spec.ts -t allocate`
Expected: FAIL(allocate 未定义)

- [ ] **Step 3: 实现 allocate / recharge / ensureAccount 目标解析**

在 BillingService 内追加(`consume` 方法之后):

```typescript
  // 校验 target 下级在调用方范围内,返回 {ownerType, ownerId, tenantId, displayName}
  private async resolveTarget(user: AuthUser, targetOwnerType: 'AGENT' | 'MERCHANT', targetOwnerId: string) {
    if (user.role === Role.SYSTEM_ADMIN) {
      if (targetOwnerType !== 'AGENT') throw new ForbiddenException('平台仅可分配给代理商');
      const agent = await this.prisma.agent.findFirst({ where: { id: targetOwnerId, tenantId: user.tenantId }, select: { id: true } });
      if (!agent) throw new ForbiddenException('目标代理商不存在');
      return { ownerType: 'AGENT' as const, ownerId: targetOwnerId };
    }
    if (user.role === Role.AGENT_ADMIN) {
      if (!user.agentId) throw new ForbiddenException('agent_admin 缺少 agentId');
      if (targetOwnerType !== 'MERCHANT') throw new ForbiddenException('代理商仅可分配给旗下商户');
      const m = await this.prisma.user.findFirst({ where: { id: targetOwnerId, tenantId: user.tenantId, role: Role.MERCHANT, agentId: user.agentId }, select: { id: true } });
      if (!m) throw new ForbiddenException('目标商户不在管理范围');
      return { ownerType: 'MERCHANT' as const, ownerId: targetOwnerId };
    }
    throw new ForbiddenException('无分配权限');
  }

  async allocate(user: AuthUser, dto: AllocateInput) {
    const from = this.resolveConsumer(user);
    const fromAcct = await this.ensureAccount(from.ownerType, from.ownerId, user.tenantId);
    const target = await this.resolveTarget(user, dto.targetOwnerType, dto.targetOwnerId);
    const toAcct = await this.ensureAccount(target.ownerType, target.ownerId, user.tenantId);
    const field = BALANCE_FIELD[dto.resource];
    return this.prisma.$transaction(async (tx) => {
      const out = await tx.creditAccount.updateMany({
        where: { id: fromAcct.id, [field]: { gte: dto.amount } },
        data: { [field]: { decrement: dto.amount } },
      });
      if (out.count === 0) throw new ForbiddenException('可分配额度不足');
      const fromAfter = await tx.creditAccount.findUnique({ where: { id: fromAcct.id } });
      await tx.creditLedger.create({ data: { accountId: fromAcct.id, resource: dto.resource, delta: -dto.amount, balanceAfter: (fromAfter as any)[field], reason: 'ALLOCATE_OUT', operatorId: user.userId, refType: 'allocate', refId: toAcct.id } });
      await tx.creditAccount.updateMany({ where: { id: toAcct.id }, data: { [field]: { increment: dto.amount } } });
      const toAfter = await tx.creditAccount.findUnique({ where: { id: toAcct.id } });
      await tx.creditLedger.create({ data: { accountId: toAcct.id, resource: dto.resource, delta: dto.amount, balanceAfter: (toAfter as any)[field], reason: 'ALLOCATE_IN', operatorId: user.userId, refType: 'allocate', refId: fromAcct.id } });
      return { ok: true };
    });
  }

  async recharge(user: AuthUser, dto: RechargeInput) {
    if (user.role !== Role.SYSTEM_ADMIN) throw new ForbiddenException('仅平台管理员可充值');
    const acct = await this.ensureAccount('PLATFORM', PLATFORM_OWNER_ID, user.tenantId);
    const field = BALANCE_FIELD[dto.resource];
    return this.prisma.$transaction(async (tx) => {
      await tx.creditAccount.updateMany({ where: { id: acct.id }, data: { [field]: { increment: dto.amount } } });
      const after = await tx.creditAccount.findUnique({ where: { id: acct.id } });
      await tx.creditLedger.create({ data: { accountId: acct.id, resource: dto.resource, delta: dto.amount, balanceAfter: (after as any)[field], reason: 'RECHARGE', operatorId: user.userId } });
      return { ok: true };
    });
  }
```

并在文件顶部 import 补 `AllocateInput, RechargeInput`(已在 Task4 的 import 列表中)。

- [ ] **Step 4: 运行确认通过**

Run: `cd /e/code/nongchang/packages/backend && npx vitest run src/modules/billing/billing.service.spec.ts`
Expected: PASS(consume + allocate 全部)

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/modules/billing/billing.service.ts packages/backend/src/modules/billing/billing.service.spec.ts
git commit -m "feat(billing): allocate 转账制 + recharge(TDD)"
```

### Task 6: BillingService 查询(summary / listAccounts / ledger)

**Files:**
- Modify: `packages/backend/src/modules/billing/billing.service.ts`
- Test: `packages/backend/src/modules/billing/billing.service.spec.ts`

- [ ] **Step 1: 追加失败测试**

```typescript
describe('BillingService.summary', () => {
  it('返回当前用户账户余额', async () => {
    const prisma: any = {
      creditAccount: {
        findUnique: async () => ({ id: 'acc1', ownerType: 'MERCHANT', ownerId: 'm1', aiBalance: 5, codeBalance: 8 }),
        create: async () => ({}),
      },
    };
    const { BillingService } = await import('./billing.service');
    const svc = new BillingService(prisma);
    const s = await svc.summary(merchant);
    expect(s).toEqual({ ownerType: 'MERCHANT', ownerId: 'm1', aiBalance: 5, codeBalance: 8 });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /e/code/nongchang/packages/backend && npx vitest run src/modules/billing/billing.service.spec.ts -t summary`
Expected: FAIL

- [ ] **Step 3: 实现查询方法**

在 BillingService 追加:

```typescript
  async summary(user: AuthUser): Promise<BillingSummary> {
    const { ownerType, ownerId } = this.resolveConsumer(user);
    const acct = await this.ensureAccount(ownerType, ownerId, user.tenantId);
    return { ownerType, ownerId, aiBalance: acct.aiBalance, codeBalance: acct.codeBalance };
  }

  // 下级账户列表:平台看代理商;代理商看旗下商户;商户无下级返回空。
  async listAccounts(user: AuthUser): Promise<CreditAccountItem[]> {
    if (user.role === Role.SYSTEM_ADMIN) {
      const agents = await this.prisma.agent.findMany({ where: { tenantId: user.tenantId }, select: { id: true, name: true } });
      return Promise.all(agents.map(async (a) => {
        const acc = await this.ensureAccount('AGENT', a.id, user.tenantId);
        return { id: acc.id, ownerType: 'AGENT' as const, ownerId: a.id, ownerName: a.name, aiBalance: acc.aiBalance, codeBalance: acc.codeBalance };
      }));
    }
    if (user.role === Role.AGENT_ADMIN) {
      if (!user.agentId) throw new ForbiddenException('agent_admin 缺少 agentId');
      const merchants = await this.prisma.user.findMany({ where: { tenantId: user.tenantId, role: Role.MERCHANT, agentId: user.agentId }, select: { id: true, displayName: true } });
      return Promise.all(merchants.map(async (m) => {
        const acc = await this.ensureAccount('MERCHANT', m.id, user.tenantId);
        return { id: acc.id, ownerType: 'MERCHANT' as const, ownerId: m.id, ownerName: m.displayName ?? m.id, aiBalance: acc.aiBalance, codeBalance: acc.codeBalance };
      }));
    }
    return [];
  }

  async ledger(user: AuthUser, query: LedgerQuery): Promise<PaginatedLedger> {
    const { ownerType, ownerId } = this.resolveConsumer(user);
    const acct = await this.ensureAccount(ownerType, ownerId, user.tenantId);
    const where: any = { accountId: acct.id };
    if (query.resource) where.resource = query.resource;
    if (query.reason) where.reason = query.reason;
    const [rows, total] = await Promise.all([
      this.prisma.creditLedger.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.creditLedger.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({ id: r.id, resource: r.resource, delta: r.delta, balanceAfter: r.balanceAfter, reason: r.reason, refType: r.refType, refId: r.refId, note: r.note, createdAt: r.createdAt.toISOString() })),
      total, page: query.page, pageSize: query.pageSize,
    };
  }
```

- [ ] **Step 4: 运行确认通过**

Run: `cd /e/code/nongchang/packages/backend && npx vitest run src/modules/billing/billing.service.spec.ts`
Expected: PASS(全部)

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/modules/billing/billing.service.ts packages/backend/src/modules/billing/billing.service.spec.ts
git commit -m "feat(billing): summary/listAccounts/ledger 查询"
```

---

### Task 7: BillingController + BillingModule + 注册

**Files:**
- Create: `packages/backend/src/modules/billing/billing.controller.ts`
- Create: `packages/backend/src/modules/billing/billing.module.ts`
- Modify: `packages/backend/src/app.module.ts`

- [ ] **Step 1: 写 billing.controller.ts**

```typescript
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  AuthUser, Role, allocateSchema, AllocateInput, rechargeSchema, RechargeInput,
  ledgerQuerySchema, LedgerQuery,
} from '@nongchang/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BillingService } from './billing.service';

@Controller('billing')
export class BillingController {
  constructor(private svc: BillingService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.svc.summary(user);
  }

  @Get('accounts')
  accounts(@CurrentUser() user: AuthUser) {
    return this.svc.listAccounts(user);
  }

  @Get('ledger')
  ledger(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(ledgerQuerySchema)) query: LedgerQuery) {
    return this.svc.ledger(user, query);
  }

  @Post('allocate') @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN)
  allocate(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(allocateSchema)) dto: AllocateInput) {
    return this.svc.allocate(user, dto);
  }

  @Post('recharge') @Roles(Role.SYSTEM_ADMIN)
  recharge(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(rechargeSchema)) dto: RechargeInput) {
    return this.svc.recharge(user, dto);
  }
}
```

- [ ] **Step 2: 写 billing.module.ts**

```typescript
import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';

@Module({ providers: [BillingService], controllers: [BillingController], exports: [BillingService] })
export class BillingModule {}
```

- [ ] **Step 3: 在 app.module.ts 注册**

import 加 `import { BillingModule } from './modules/billing/billing.module';`;imports 数组在 `PhenologyModule,` 后加 `BillingModule,`。

- [ ] **Step 4: 构建验证**

Run: `pnpm --filter @nongchang/backend build`
Expected: 成功

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/modules/billing/billing.controller.ts packages/backend/src/modules/billing/billing.module.ts packages/backend/src/app.module.ts
git commit -m "feat(billing): Controller + Module + AppModule 注册"
```

## 阶段三:扣费插桩

### Task 8: AI 扣费插桩(ai.service + ai.module,TDD)

**Files:**
- Modify: `packages/backend/src/modules/ai/ai.service.ts`
- Modify: `packages/backend/src/modules/ai/ai.module.ts`
- Test: `packages/backend/src/modules/ai/ai.service.spec.ts`(已存在,追加用例)

策略:chat/diagnose/transcribe 在外部调用**成功返回后**调用 `billing.consume(user, 'AI', AI_WEIGHT[kind], {refType})`。失败不扣(consume 在 try 成功分支之后)。

- [ ] **Step 1: 追加失败测试**(在 ai.service.spec.ts)

```typescript
import { AI_WEIGHT } from '../billing/billing.constants';

describe('AiService 扣费插桩', () => {
  it('chat 成功后扣 AI 1', async () => {
    const consume = vi.fn().mockResolvedValue({ balanceAfter: 9 });
    const billing: any = { consume };
    const providers: any = { getEnabled: async () => ({ baseUrl: 'http://x', apiKey: 'k', textModel: 'm' }) };
    const integrations: any = {};
    const svc = new AiService(providers, integrations, billing);
    // mock fetch 返回 choices
    (globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: '答' } }] }) });
    const res = await svc.chat(merchant, '你好');
    expect(res.answer).toBe('答');
    expect(consume).toHaveBeenCalledWith(merchant, 'AI', AI_WEIGHT.chat, { refType: 'ai.chat' });
  });
  it('chat 外部失败则不扣费', async () => {
    const consume = vi.fn();
    const billing: any = { consume };
    const providers: any = { getEnabled: async () => ({ baseUrl: 'http://x', apiKey: 'k', textModel: 'm' }) };
    const svc = new AiService(providers, {} as any, billing);
    (globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: false });
    await expect(svc.chat(merchant, '你好')).rejects.toBeTruthy();
    expect(consume).not.toHaveBeenCalled();
  });
});
```

(测试顶部需 `import { vi } from 'vitest'` 与 `const merchant: AuthUser = {...}`,若文件已有则复用。)

- [ ] **Step 2: 运行确认失败**

Run: `cd /e/code/nongchang/packages/backend && npx vitest run src/modules/ai/ai.service.spec.ts -t 扣费`
Expected: FAIL(构造函数参数不符 / consume 未调用)

- [ ] **Step 3: 改 ai.service.ts**

构造函数注入 BillingService:

```typescript
import { BillingService } from '../billing/billing.service';
import { AI_WEIGHT } from '../billing/billing.constants';
// ...
  constructor(
    private providers: AiProviderService,
    private integrations: IntegrationConfigService,
    private billing: BillingService,
  ) {}
```

chat:`const answer = await this.callChatCompletions(p, body);` 之后、`return` 之前加:
```typescript
    await this.billing.consume(user, 'AI', AI_WEIGHT.chat, { refType: 'ai.chat' });
```

diagnose:`const result = await this.callChatCompletions(p, body);` 之后加:
```typescript
    await this.billing.consume(user, 'AI', AI_WEIGHT.diagnose, { refType: 'ai.diagnose' });
```

transcribe:`const text = await transcribeWithXfyun(...)` 成功后(try 内、return 前)加:
```typescript
      await this.billing.consume(user, 'AI', AI_WEIGHT.transcribe, { refType: 'ai.transcribe' });
```

- [ ] **Step 4: 改 ai.module.ts 导入 BillingModule**

```typescript
import { BillingModule } from '../billing/billing.module';
// @Module imports 加入 BillingModule(若 ai.module 无 imports 字段则新增 imports: [BillingModule])
```

- [ ] **Step 5: 运行测试 + 构建**

Run: `cd /e/code/nongchang/packages/backend && npx vitest run src/modules/ai/ai.service.spec.ts`
Expected: PASS
Run: `pnpm --filter @nongchang/backend build`
Expected: 成功

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/modules/ai
git commit -m "feat(billing): AI 调用成功后扣费插桩(TDD)"
```

---

### Task 9: 二维码扣费插桩(trace.service + trace.module,TDD)

**Files:**
- Modify: `packages/backend/src/modules/trace/trace.service.ts`
- Modify: `packages/backend/src/modules/trace/trace.module.ts`
- Test: `packages/backend/src/modules/trace/trace.service.spec.ts`(已存在,追加)

策略:`generateCodes` 在 `assertInScope` 之后、产码之前 `consume(user, 'CODE', count, {refType:'trace.generate', refId:batchId})`。额度不足直接抛 Forbidden,不产码。

- [ ] **Step 1: 追加失败测试**

```typescript
describe('TraceService.generateCodes 扣费', () => {
  it('额度不足:抛 Forbidden 且不产码', async () => {
    const consume = vi.fn().mockRejectedValue(new ForbiddenException('二维码额度不足,请联系上级充值'));
    const createMany = vi.fn();
    const prisma: any = { traceCode: { createMany, findMany: async () => [] } };
    const scope: any = { assertInScope: async () => {} };
    const billing: any = { consume };
    const svc = new TraceService(prisma, scope, billing);
    await expect(svc.generateCodes(merchant, BATCH, 5)).rejects.toBeInstanceOf(ForbiddenException);
    expect(createMany).not.toHaveBeenCalled();
  });
  it('额度充足:先扣 count 再产码', async () => {
    const calls: string[] = [];
    const consume = vi.fn().mockImplementation(async () => { calls.push('consume'); });
    const prisma: any = { traceCode: { createMany: async () => { calls.push('create'); }, findMany: async () => [{ id: 'c1' }] } };
    const scope: any = { assertInScope: async () => {} };
    const svc = new TraceService(prisma, scope, { consume } as any);
    await svc.generateCodes(merchant, BATCH, 3);
    expect(consume).toHaveBeenCalledWith(merchant, 'CODE', 3, { refType: 'trace.generate', refId: BATCH });
    expect(calls).toEqual(['consume', 'create']);
  });
});
```

(顶部需 `import { vi } from 'vitest'`、`ForbiddenException`、`const merchant`、`const BATCH`,复用已有。)

- [ ] **Step 2: 运行确认失败**

Run: `cd /e/code/nongchang/packages/backend && npx vitest run src/modules/trace/trace.service.spec.ts -t 扣费`
Expected: FAIL(构造函数参数 / consume 未调用)

- [ ] **Step 3: 改 trace.service.ts**

```typescript
import { BillingService } from '../billing/billing.service';
// ...
  constructor(private prisma: PrismaService, private scope: ScopeService, private billing: BillingService) {}
```

`generateCodes` 内,`await this.scope.assertInScope(...)` 之后、`const codes = ...` 之前加:
```typescript
    await this.billing.consume(user, 'CODE', count, { refType: 'trace.generate', refId: batchId });
```

- [ ] **Step 4: 改 trace.module.ts 导入 BillingModule**

```typescript
import { BillingModule } from '../billing/billing.module';
@Module({ imports: [BillingModule], providers: [TraceService, ScopeService], controllers: [TraceController] })
export class TraceModule {}
```

- [ ] **Step 5: 运行测试 + 构建**

Run: `cd /e/code/nongchang/packages/backend && npx vitest run src/modules/trace/trace.service.spec.ts`
Expected: PASS
Run: `pnpm --filter @nongchang/backend build`
Expected: 成功

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/modules/trace
git commit -m "feat(billing): 二维码生成前扣费插桩(TDD)"
```

## 阶段四:后台 Web

### Task 10: web 额度 API 客户端

**Files:**
- Create: `packages/web/src/api/billing.ts`

- [ ] **Step 1: 写 billing.ts**

```typescript
import type {
  BillingSummary, CreditAccountItem, PaginatedLedger, LedgerQuery,
  AllocateInput, RechargeInput,
} from '@nongchang/shared';
import { request } from './request';

export function getBillingSummary(): Promise<BillingSummary> {
  return request<BillingSummary>('/billing/summary');
}

export function listCreditAccounts(): Promise<CreditAccountItem[]> {
  return request<CreditAccountItem[]>('/billing/accounts');
}

export function listLedger(query: Partial<LedgerQuery> = {}): Promise<PaginatedLedger> {
  const qs = new URLSearchParams();
  if (query.resource) qs.set('resource', query.resource);
  if (query.reason) qs.set('reason', query.reason);
  qs.set('page', String(query.page ?? 1));
  qs.set('pageSize', String(query.pageSize ?? 20));
  return request<PaginatedLedger>(`/billing/ledger?${qs.toString()}`);
}

export function allocateCredit(dto: AllocateInput): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/billing/allocate', { method: 'POST', body: JSON.stringify(dto) });
}

export function rechargeCredit(dto: RechargeInput): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/billing/recharge', { method: 'POST', body: JSON.stringify(dto) });
}
```

- [ ] **Step 2: 构建验证**

Run: `pnpm --filter web build`
Expected: 成功

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/api/billing.ts
git commit -m "feat(web): 计费额度 API 客户端"
```

---

### Task 11: BillingAdmin 组件(额度仪表板 + 分配 + 流水)

**Files:**
- Create: `packages/web/src/components/BillingAdmin.tsx`

参考 `PhenologyAdmin.tsx` 的结构(useApi + 表格 + Modal)。**注意单文件 < 13000 字符**;若超出,把流水明细拆成子组件 `BillingLedger.tsx`。

- [ ] **Step 1: 写 BillingAdmin.tsx 骨架**

要点:
- `const { data: summary } = useApi(getBillingSummary)` — 顶部两张余额卡(AI/二维码),余额 < 阈值显示黄色预警标识(阈值用本地常量 `LOW = 100`,余额 < LOW 高亮)。
- `const { data: accounts, reload } = useApi(listCreditAccounts)` — 下级账户表格:列「名称 / AI 余额 / 二维码余额 / 操作(分配)」。
- 平台管理员显示「充值」按钮(顶部),打开充值 Modal(选资源 AI/CODE + 数量)→ `rechargeCredit` → reload + 刷新 summary。
- 「分配」按钮打开分配 Modal:目标为该行账户(targetOwnerType/targetOwnerId 预填),选资源 + 数量 → `allocateCredit` → reload。
- 流水明细区:`listLedger` 分页,筛选 resource/reason 下拉;reason 中文映射 `{ RECHARGE:'充值', ALLOCATE_IN:'转入', ALLOCATE_OUT:'转出', CONSUME:'消费', REFUND:'退还' }`,resource 映射 `{ AI:'AI算力', CODE:'二维码' }`。
- 角色判断:从 auth-context 读当前 role(参考 BatchAdmin 等现有组件如何取 role);agent_admin 不显示充值按钮。
- 所有文案中文。图标用 lucide-react(如 `Wallet, Zap, QrCode, Plus, ArrowRightLeft, Loader2, X`)。

- [ ] **Step 2: 构建验证**

Run: `pnpm --filter web build`
Expected: 成功,产出新 chunk

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/BillingAdmin.tsx
git commit -m "feat(web): 额度仪表板 + 分配 + 流水组件"
```

---

### Task 12: App.tsx 接线「算力与额度」栏目

**Files:**
- Modify: `packages/web/src/App.tsx`

参考 06f4b03 中 AiAssistant/PhenologyAdmin 的接线方式。

- [ ] **Step 1: lazy 导入**

在其他 lazy 导入旁加:
```typescript
const BillingAdmin = lazy(() => import('./components/BillingAdmin'));
```

- [ ] **Step 2: activeTab 联合类型加 `| 'billing'`**

- [ ] **Step 3: Nav 增项**

`SYSTEM_ADMIN_NAV` 与 `AGENT_ADMIN_NAV` 加:
```typescript
{ id: 'billing', label: '算力与额度', icon: Wallet },
```
(从 lucide-react 导入 `Wallet`。)

- [ ] **Step 4: 渲染分支**

```tsx
{mountedTabs.has('billing') && <div className={activeTab === 'billing' ? '' : 'hidden'}><BillingAdmin /></div>}
```
(对齐现有 mountedTabs 渲染写法。)

- [ ] **Step 5: 构建验证**

Run: `pnpm --filter web build`
Expected: 成功

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/App.tsx
git commit -m "feat(web): 算力与额度栏目接线"
```

### Task 13: AI 农事建议 + 数据问答(后端端点,TDD)

这两项都基于现有 `ai.chat`(扣 AI 1),区别在于后端先拼接业务上下文再调 chat。新增 service 方法 + 端点。

**Files:**
- Modify: `packages/backend/src/modules/ai/ai.service.ts`
- Modify: `packages/backend/src/modules/ai/ai.controller.ts`
- Modify: `packages/backend/src/modules/ai/ai.module.ts`(注入 PrismaService、ScopeService 以读批次/偏离)
- Modify: `packages/shared/src/dto/ai.dto.ts` + `index.ts`(新增请求/响应 schema)
- Test: `packages/backend/src/modules/ai/ai.service.spec.ts`

> 说明:为避免 ai.service 直接依赖 PhenologyService 造成循环,农事建议所需的「物候偏离」通过传入的 batchId 在 ai.service 内用 prisma 读 batch + cropPhenology 自行汇总(与 PhenologyService.deviations 同口径,但只针对单批次)。

- [ ] **Step 1: shared 加 DTO**

在 `packages/shared/src/dto/ai.dto.ts` 追加:
```typescript
export const aiAdviceSchema = z.object({ batchId: z.string().min(1) });
export type AiAdviceInput = z.infer<typeof aiAdviceSchema>;
export const aiAskSchema = z.object({ question: z.string().min(1).max(500) });
export type AiAskInput = z.infer<typeof aiAskSchema>;
// 复用 aiChat 的响应结构 { answer }
```
在 `index.ts` 的 ai.dto 导出块补 `aiAdviceSchema, aiAskSchema` 与类型 `AiAdviceInput, AiAskInput`。

- [ ] **Step 2: 写失败测试**

```typescript
describe('AiService.advice', () => {
  it('拼接批次+农事记录上下文后调用 chat 并扣费', async () => {
    const consume = vi.fn().mockResolvedValue({ balanceAfter: 9 });
    const prisma: any = {
      batch: { findFirst: async () => ({ id: 'b1', cropName: '白芍', status: 'Growing', plantDate: new Date('2026-01-01') }) },
      farmRecord: { findMany: async () => [{ action: '浇水', detail: {} }] },
      cropPhenology: { findMany: async () => [{ cropName: '白芍', expectedDays: 30 }] },
    };
    const providers: any = { getEnabled: async () => ({ baseUrl: 'http://x', apiKey: 'k', textModel: 'm' }) };
    const scope: any = { assertInScope: async () => {} };
    const svc = new AiService(providers, {} as any, { consume } as any, prisma, scope);
    (globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: '建议浇水' } }] }) });
    const res = await svc.advice(merchant, { batchId: 'b1' });
    expect(res.answer).toContain('建议');
    expect(consume).toHaveBeenCalledWith(merchant, 'AI', 1, { refType: 'ai.advice', refId: 'b1' });
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `cd /e/code/nongchang/packages/backend && npx vitest run src/modules/ai/ai.service.spec.ts -t advice`
Expected: FAIL

- [ ] **Step 4: 实现 advice / ask**

构造函数追加 `private prisma: PrismaService, private scope: ScopeService`(放在 billing 之后)。新增:
```typescript
  async advice(user: AuthUser, input: AiAdviceInput): Promise<AiChatResponse> {
    await this.scope.assertInScope(this.prisma, user, 'batch', input.batchId);
    const batch = await this.prisma.batch.findFirst({ where: { id: input.batchId }, select: { cropName: true, status: true, plantDate: true } });
    const records = await this.prisma.farmRecord.findMany({ where: { batchId: input.batchId }, orderBy: { createdAt: 'desc' }, take: 10, select: { action: true } });
    const phen = await this.prisma.cropPhenology.findMany({ where: { tenantId: user.tenantId, cropName: batch?.cropName }, select: { expectedDays: true } });
    const totalDays = phen.reduce((s, p) => s + p.expectedDays, 0);
    const elapsed = batch ? Math.floor((Date.now() - new Date(batch.plantDate).getTime()) / 86400000) : 0;
    const prompt = `你是农技专家。作物:${batch?.cropName};当前状态:${batch?.status};已种植${elapsed}天;标准全周期${totalDays || '未知'}天。近期农事:${records.map((r) => r.action).join('、') || '无'}。请给出未来一周的浇水、施肥、病虫害防治建议,简明分点。`;
    const p = await this.providers.getEnabled(user);
    if (!p) throw new BadRequestException('未配置可用的 AI 服务商');
    const answer = await this.callChatCompletions(p, { model: p.textModel, messages: [{ role: 'user', content: prompt }] });
    await this.billing.consume(user, 'AI', AI_WEIGHT.chat, { refType: 'ai.advice', refId: input.batchId });
    return { answer };
  }

  async ask(user: AuthUser, input: AiAskInput): Promise<AiChatResponse> {
    const where = await this.scope.ownedScopeWhere(this.prisma, user);
    const batches = await this.prisma.batch.findMany({ where, select: { batchNo: true, cropName: true, status: true, plantDate: true }, take: 50 });
    const ctx = batches.map((b) => `${b.batchNo}(${b.cropName},${b.status},种植${Math.floor((Date.now() - new Date(b.plantDate).getTime()) / 86400000)}天)`).join(';');
    const prompt = `以下是用户可见的批次数据:${ctx || '无数据'}。请根据数据回答问题:${input.question}`;
    const p = await this.providers.getEnabled(user);
    if (!p) throw new BadRequestException('未配置可用的 AI 服务商');
    const answer = await this.callChatCompletions(p, { model: p.textModel, messages: [{ role: 'user', content: prompt }] });
    await this.billing.consume(user, 'AI', AI_WEIGHT.chat, { refType: 'ai.ask' });
    return { answer };
  }
```
顶部 import 补 `AiAdviceInput, AiAskInput`、`PrismaService`、`ScopeService`。

- [ ] **Step 5: ai.controller.ts 加端点**

```typescript
@Post('advice')
advice(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(aiAdviceSchema)) dto: AiAdviceInput) {
  return this.svc.advice(user, dto);
}
@Post('ask')
ask(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(aiAskSchema)) dto: AiAskInput) {
  return this.svc.ask(user, dto);
}
```
(import 补 aiAdviceSchema/aiAskSchema/类型/ZodValidationPipe,若已有则复用。)

- [ ] **Step 6: ai.module.ts 确保 ScopeService 在 providers、PrismaModule 可用**

ai.module providers 加 `ScopeService`(若未注入);PrismaService 由全局 PrismaModule 提供。

- [ ] **Step 7: 测试 + 构建**

Run: `cd /e/code/nongchang/packages/backend && npx vitest run src/modules/ai/ai.service.spec.ts`
Expected: PASS
Run: `pnpm --filter @nongchang/backend build`
Expected: 成功

- [ ] **Step 8: Commit**

```bash
git add packages/backend/src/modules/ai packages/shared/src/dto/ai.dto.ts packages/shared/src/index.ts
git commit -m "feat(ai): 农事建议 + 数据问答端点(扣费,TDD)"
```

### Task 14: web AI 功能(数据问答 + 批量诊断 + 农事建议入口)

**Files:**
- Modify: `packages/web/src/api/ai.ts`(加 aiAdvice/aiAsk 客户端)
- Modify: `packages/web/src/components/AiAssistant.tsx`(加「AI 数据问答」区 + 批量诊断模式)
- Modify: `packages/web/src/components/FarmRecords.tsx`(选中批次行加「AI 农事建议」按钮)

> 若 AiAssistant.tsx 改后超 13000 字符,把「数据问答」拆为 `AiDataQa.tsx` 子组件。

- [ ] **Step 1: ai.ts 加客户端**

```typescript
import type { AiAdviceInput, AiAskInput, AiChatResponse } from '@nongchang/shared';
export function aiAdvice(dto: AiAdviceInput): Promise<AiChatResponse> {
  return request<AiChatResponse>('/ai/advice', { method: 'POST', body: JSON.stringify(dto) });
}
export function aiAsk(dto: AiAskInput): Promise<AiChatResponse> {
  return request<AiChatResponse>('/ai/ask', { method: 'POST', body: JSON.stringify(dto) });
}
```
(沿用文件已有 request import 与风格。)

- [ ] **Step 2: AiAssistant 加「AI 数据问答」区**

新增一个 grid 区块(参考已有「AI 植保百科」区):textarea 输入问题 → 按钮调 `aiAsk({question})` → 显示 answer;loading/error 状态。文案中文,图标 `MessageSquareText`。

- [ ] **Step 3: AiAssistant 视觉诊断区加「批量」模式**

允许多选图片(file input multiple),逐张上传 OSS → 逐张 `aiDiagnose({imageUrl})` → 汇总每张结果列表;捕获额度不足(请求失败带「额度不足」文案)时停止并提示「已诊断 N 张,额度不足」。

- [ ] **Step 4: FarmRecords 加农事建议入口**

在批次相关区域(或顶部工具栏)加按钮「AI 农事建议」,需先选定 batchId(可复用现有批次筛选的选中值);点击 → `aiAdvice({batchId})` → 弹出/展示 answer。若 FarmRecords 无现成 batchId 选择,改为放到 AiAssistant 里加一个「农事建议」区,用批次下拉(调 listBatches)选批次。**实现时二选一,优先 FarmRecords 已有批次上下文的位置。**

- [ ] **Step 5: 构建 + 测试**

Run: `pnpm --filter web build`
Expected: 成功
Run: `pnpm --filter web test`
Expected: 现有测试全过(45/45 或更多)

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/api/ai.ts packages/web/src/components/AiAssistant.tsx packages/web/src/components/FarmRecords.tsx
git commit -m "feat(web): AI 数据问答 + 批量诊断 + 农事建议"
```

---

## 阶段五:小程序端

### Task 15: 小程序额度 API + 余额条

**Files:**
- Create: `packages/miniapp/src/api/billing.ts`
- Modify: 工作台页(`packages/miniapp/src/pages/work/*`)

- [ ] **Step 1: billing.ts**

参考 `packages/miniapp/src/api/ai.ts` 的 request 封装,写:
```typescript
import type { BillingSummary, PaginatedLedger } from '@nongchang/shared';
import { request } from './request'; // 对齐 miniapp 实际 request 路径
export function getBillingSummary(): Promise<BillingSummary> {
  return request<BillingSummary>('/billing/summary');
}
export function listLedger(page = 1, pageSize = 20): Promise<PaginatedLedger> {
  return request<PaginatedLedger>(`/billing/ledger?page=${page}&pageSize=${pageSize}`);
}
```
(先读 miniapp 现有 api 文件确认 request 的导入路径与签名。)

- [ ] **Step 2: 工作台顶部余额条**

进页面 `useEffect`/`useLoad` 调 getBillingSummary → 顶部横幅显示「AI 算力:N 次 · 二维码:M 个」;任一余额 < 阈值(本地常量,如 100)文字变橙色加「余额偏低」。AI/生码相关按钮在余额=0 时禁用并提示。

- [ ] **Step 3: 构建/类型检查**

Run: `pnpm --filter @nongchang/miniapp build`(或 miniapp 实际 build 命令;先查 package.json scripts)
Expected: 成功

- [ ] **Step 4: Commit**

```bash
git add packages/miniapp/src/api/billing.ts packages/miniapp/src/pages/work
git commit -m "feat(miniapp): 额度 API + 工作台余额条"
```

---

### Task 16: 小程序 AI 推荐 + 诊断增强 + 用量中心

**Files:**
- Modify: RecordForm 组件(记一笔 AI 推荐)
- Modify: AiPanel 组件(diagnose 结果增强,后端已在 Task13/现有 diagnose 提供建议文本)
- Create: `packages/miniapp/src/pages/usage/*`(用量中心页 + 路由注册)

- [ ] **Step 1: RecordForm AI 推荐**

选定批次/作物后显示「AI 推荐动作」按钮 → 调 `aiAdvice({batchId})`(在 miniapp ai.ts 加 aiAdvice 客户端,参考 web)→ 把返回 answer 填入备注/动作输入或弹层展示。余额不足走统一错误提示。

- [ ] **Step 2: AiPanel diagnose 展示增强**

诊断返回 result 文本中已含「处理建议」(prompt 已要求)。前端把结果分段展示更友好即可,无需后端改动。

- [ ] **Step 3: 用量中心页**

新页 `pages/usage`:顶部 summary(AI/码余额),下方 ledger 列表(reason/resource 中文映射,delta 正负着色)。在 app 配置注册路由,「我的」tab 加入口跳转。

- [ ] **Step 4: 构建**

Run: miniapp build 命令
Expected: 成功

- [ ] **Step 5: Commit**

```bash
git add packages/miniapp/src
git commit -m "feat(miniapp): 记一笔AI推荐 + 诊断增强 + 用量中心"
```

## 阶段六:种子、端到端与全量验证

### Task 17: 种子预置额度 + 端到端冒烟

**Files:**
- Modify: `packages/backend/prisma/seed.ts`(为平台/各代理商/各商户预置初始额度,便于演示)
- Create: `packages/backend/test/billing.e2e.spec.ts`(若项目 e2e 在 test/ 目录;否则放 src 下 *.e2e.spec.ts,参考现有 e2e 文件位置)

- [ ] **Step 1: seed 预置额度**

在 seed.ts 现有 upsert 之后,为平台账户充值较大额度,并给代理商/商户分配初始额度。示例:
```typescript
// 平台账户 + 初始额度(演示用)
await prisma.creditAccount.upsert({
  where: { ownerType_ownerId: { ownerType: 'PLATFORM', ownerId: 'PLATFORM' } },
  update: {}, create: { ownerType: 'PLATFORM', ownerId: 'PLATFORM', tenantId: <系统租户id>, aiBalance: 100000, codeBalance: 1000000 },
});
// 代理商/商户账户初始额度(按 seed 已创建的 agent/user id)
```
(用 seed 中已有的 tenant/agent/user 变量;商户 ownerId = merchant 用户的 id。)

- [ ] **Step 2: 跑种子**

Run: `cd /e/code/nongchang/packages/backend && npx prisma db seed`
Expected: 成功,无错误

- [ ] **Step 3: 写 e2e(参考现有 *.e2e.spec.ts 的 bootstrap 方式)**

覆盖:登录 sysadmin → `POST /billing/recharge` → `POST /billing/allocate`(给 agentA)→ 登录 agentA → allocate 给旗下 merchant → 登录 merchant → `GET /billing/summary` 余额正确 → 调 `POST /ai/chat`(余额减 1)→ `GET /billing/ledger` 有 CONSUME 流水 → 余额耗尽后再调返回 403。

- [ ] **Step 4: 跑 e2e**

Run: `cd /e/code/nongchang/packages/backend && npx vitest run <e2e 文件路径>`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/backend/prisma/seed.ts packages/backend/test
git commit -m "test(billing): 种子预置额度 + 三级分配/消费/熔断 e2e"
```

---

### Task 18: 全量验证

- [ ] **Step 1: 后端全量单测**

Run: `cd /e/code/nongchang/packages/backend && npx vitest run`
Expected: 全部 PASS

- [ ] **Step 2: 后端构建**

Run: `pnpm --filter @nongchang/backend build`
Expected: 成功

- [ ] **Step 3: shared 构建**

Run: `pnpm --filter @nongchang/shared build`
Expected: 成功

- [ ] **Step 4: web 构建 + 测试**

Run: `pnpm --filter web build && pnpm --filter web test`
Expected: 构建成功,测试全过

- [ ] **Step 5: miniapp 构建**

Run: miniapp build 命令
Expected: 成功

- [ ] **Step 6: 真实后端冒烟(可选,需启动 dev)**

启动后端(3001),sysadmin 登录,验证 `/api/billing/summary`、`/api/billing/recharge`、`/api/billing/allocate` 返回正常;merchant 调 AI/生码余额递减;余额为 0 时 403。

- [ ] **Step 7: 更新 memory**

把「计费体系已落地(CreditAccount/CreditLedger 双表、billing 模块、ai/trace 扣费插桩、转账制三级分配、硬熔断)」追加到 `project_saas_refactor.md`,在 MEMORY.md 不新增条目(已有该文件指针)。

- [ ] **Step 8: 最终 Commit(若有未提交收尾)**

```bash
git add -A && git commit -m "chore(billing): 全量验证通过 + memory 更新"
```

---

## 验收标准

- 平台可充值、按三级转账制分配额度,总量守恒(分配不凭空增减)。
- AI 三端点(chat/diagnose/transcribe)成功后按权重扣 AI 额度;失败不扣。
- 生码按个数扣二维码额度,额度不足拒绝且不产码。
- 余额不足硬熔断(403,中文提示)。
- 并发扣费不会扣成负数(条件递减 + 影响行数判断)。
- 流水可查、可对账(balanceAfter 正确,reason/refType 完整)。
- 后台 4 项 AI 功能 + 额度仪表板可用;小程序余额条 + 3 功能 + 用量中心可用。
- 所有面向用户文本中文。










