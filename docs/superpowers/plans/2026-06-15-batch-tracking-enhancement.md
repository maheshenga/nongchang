# 全域批次追踪功能完善 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 把全域批次追踪屏四处占位能力真实化（防伪码总数、生命周期下钻、状态流转、利润大盘），并补齐后端聚合/状态/编辑端点。

**Architecture:** NestJS + Prisma + Zod + JWT，ScopeService fail-closed 守护。inputCost 运行时由农资领用聚合（领用时锁定单价），laborCost/sellPrice 落 Batch 列并经编辑端点维护。web BatchAdmin 接真实聚合字段。

**Tech Stack:** `@nongchang/shared`(zod), `@nongchang/backend`(NestJS10/Prisma5.22/PG), `web`(React19/Vite). 测试 vitest。

设计文档：`docs/superpowers/specs/2026-06-15-batch-tracking-enhancement-design.md`

---

## Task 1: Prisma 模型 + 迁移

**Files:**
- Modify: `packages/backend/prisma/schema.prisma`（Batch 加两列、SupplyIssue 加一列、TraceCode 加索引）

- [ ] **Step 1: 改 schema**

`model Batch` 在 `status String` 之后、`createdAt` 之前加：
```prisma
  laborCost       Float    @default(0) @map("labor_cost")
  sellPrice       Float    @default(0) @map("sell_price")
```

`model SupplyIssue` 在 `amount Float` 之后加：
```prisma
  unitPrice Float    @default(0) @map("unit_price")
```

`model TraceCode` 把 `@@index([tenantId])` 之后追加一行：
```prisma
  @@index([batchId])
```

- [ ] **Step 2: 生成迁移**

Run: `cd /e/code/nongchang/packages/backend && npx prisma migrate dev --name add_batch_costs_supply_unitprice_tracecode_batch_index`
Expected: 新建 migration 目录，client 重新生成，无错误。

若无 DB 连接，退化为 `npx prisma migrate dev --create-only --name ...` 仅生成 SQL，并在说明中标注需 DB apply。

- [ ] **Step 3: 验证 client 类型**

Run: `cd /e/code/nongchang/packages/backend && npx prisma generate`
Expected: 成功，`Batch.laborCost/sellPrice`、`SupplyIssue.unitPrice` 出现在生成类型中。

- [ ] **Step 4: Commit**

```bash
git add packages/backend/prisma/schema.prisma packages/backend/prisma/migrations
git commit -m "feat(backend): batch cost columns + supply issue unitPrice + trace_code batchId index"
```

---

## Task 2: shared DTO 契约

**Files:**
- Modify: `packages/shared/src/dto/entities.dto.ts`（批次状态/编辑 schema + BatchListItem 类型）
- Modify: `packages/shared/src/dto/supply.dto.ts`（issue 加 unitPrice）
- Modify: `packages/shared/src/index.ts`（导出）

- [ ] **Step 1: entities.dto.ts 追加**

在 `CreateBatchDto` 定义之后追加：
```typescript
export const updateBatchStatusSchema = z.object({
  status: z.enum([BatchStatus.PLANTING, BatchStatus.GROWING, BatchStatus.HARVESTED, BatchStatus.DISTRIBUTED]),
});
export type UpdateBatchStatusDto = z.infer<typeof updateBatchStatusSchema>;

export const updateBatchCostSchema = z.object({
  laborCost: z.number().min(0).optional(),
  sellPrice: z.number().min(0).optional(),
}).refine(d => d.laborCost != null || d.sellPrice != null, {
  message: 'laborCost 与 sellPrice 至少提供一项', path: ['laborCost'],
});
export type UpdateBatchCostDto = z.infer<typeof updateBatchCostSchema>;

// 批次列表项:基础批次 + 运行时聚合(防伪码数/累计扫码/投入成本)。
export type BatchListItem = {
  id: string; tenantId: string; ownerId: string; fieldId: string;
  batchNo: string; cropName: string; plantDate: string; expectedHarvest: string;
  status: string; laborCost: number; sellPrice: number; createdAt: string;
  codeCount: number; scanTotal: number; inputCost: number;
};

// 单批次全生命周期下钻聚合。
export type BatchLifecycle = {
  batch: BatchListItem;
  farmRecords: Array<Record<string, unknown>>;
  traceEvents: Array<Record<string, unknown>>;
  codeCount: number; scanTotal: number;
  recentScans: Array<{ scannedAt: string }>;
};
```

- [ ] **Step 2: supply.dto.ts 改 issue schema**

把 `issueSupplyInputSchema` 改为：
```typescript
export const issueSupplyInputSchema = z.object({
  batchId: z.string().uuid(),
  amount: z.number().positive(),
  unitPrice: z.number().min(0).optional(),
});
```

- [ ] **Step 3: index.ts 导出**

值导出块（entities）追加 `updateBatchStatusSchema, updateBatchCostSchema`。
类型导出块追加 `UpdateBatchStatusDto, UpdateBatchCostDto, BatchListItem, BatchLifecycle`。

- [ ] **Step 4: 构建 shared**

Run: `pnpm --filter @nongchang/shared build`
Expected: 无 TS 错误。

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): batch status/cost DTOs, BatchListItem/Lifecycle types, supply issue unitPrice"
```

---

## Task 3: SupplyService 领用写入 unitPrice

**Files:**
- Modify: `packages/backend/src/modules/supply/supply.service.ts:54-56`（issue 写 unitPrice）
- Test: `packages/backend/src/modules/supply/supply.service.spec.ts`（若存在则加用例，否则跳过新建）

- [ ] **Step 1: 改 issue 落 unitPrice**

`supply.service.ts` 的 `issue` 内 `tx.supplyIssue.create` 的 data 加 `unitPrice`：
```typescript
      await tx.supplyIssue.create({
        data: { tenantId: user.tenantId, ownerId: sup.ownerId, supplyId: id, batchId: input.batchId, amount: input.amount, unitPrice: input.unitPrice ?? 0 },
      });
```

- [ ] **Step 2: 构建后端类型检查**

Run: `pnpm --filter @nongchang/backend build`
Expected: 无 TS 错误（`unitPrice` 已在 Prisma client 与 IssueSupplyInput 中）。

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/modules/supply/supply.service.ts
git commit -m "feat(backend): persist supply issue unitPrice at issuance"
```

---

## Task 4: BatchService 聚合 + 状态流转 + 编辑 + 下钻（TDD）

**Files:**
- Modify: `packages/backend/src/modules/batch/batch.service.ts`
- Test: `packages/backend/src/modules/batch/batch.service.spec.ts`

- [ ] **Step 1: 写失败测试**

在 `batch.service.spec.ts` 追加 describe（参照现有 spec 的 prisma mock 风格，mock `batch.findMany/findFirst/findUnique/update`、`traceCode.groupBy`、`supplyIssue.findMany`、`farmRecord.findMany`、`traceEvent.findMany`、`traceScan.findMany`、`$transaction`）：

```typescript
describe('BatchService.list 聚合', () => {
  it('合并 codeCount/scanTotal/inputCost', async () => {
    // batch.findMany -> [{id:'b1',...}]
    // traceCode.groupBy -> [{batchId:'b1', _count:{_all:3}, _sum:{scanCount:12}}]
    // supplyIssue.findMany -> [{batchId:'b1', amount:10, unitPrice:5},{batchId:'b1',amount:2,unitPrice:3}]
    // 期望 b1.codeCount=3, scanTotal=12, inputCost=56
  });
  it('空批次集合:跳过聚合返回空数组', async () => {
    // batch.findMany -> []  期望 groupBy/findMany 不被调用,结果 []
  });
});

describe('BatchService.updateStatus 流转', () => {
  it('前进合法:PLANTING->GROWING', async () => { /* findFirst 命中归属, findUnique status=PLANTING, 期望 update 调用 */ });
  it('跳级前进合法:PLANTING->HARVESTED', async () => {});
  it('回退非法:HARVESTED->GROWING 抛 BadRequest', async () => {});
  it('原状态非法:GROWING->GROWING 抛 BadRequest', async () => {});
  it('批次不在作用域:抛 Forbidden(不 update)', async () => {});
});

describe('BatchService.updateCost 编辑', () => {
  it('在作用域内更新 laborCost/sellPrice', async () => {});
  it('不在作用域:抛 Forbidden', async () => {});
});

describe('BatchService.lifecycle 下钻', () => {
  it('归属内:返回 batch+farmRecords+traceEvents+codeCount+scanTotal+recentScans(仅 scannedAt)', async () => {});
  it('不在作用域:抛 Forbidden', async () => {});
});
```

- [ ] **Step 2: 运行验证失败**

Run: `cd /e/code/nongchang/packages/backend && npx vitest run src/modules/batch/batch.service.spec.ts`
Expected: 新用例 FAIL（方法未实现）。

- [ ] **Step 3: 实现 service**

`batch.service.ts` 改 `list` 并新增方法。`import { BadRequestException, ForbiddenException, NotFoundException }`，引入 `BatchStatus`：

```typescript
const STATUS_ORDER = [BatchStatus.PLANTING, BatchStatus.GROWING, BatchStatus.HARVESTED, BatchStatus.DISTRIBUTED];

async list(user: AuthUser) {
  const where = await this.scope.ownedScopeWhere(this.prisma, user);
  const batches = await this.prisma.batch.findMany({ where });
  if (batches.length === 0) return [];
  const ids = batches.map(b => b.id);
  const [codeAgg, issues] = await Promise.all([
    this.prisma.traceCode.groupBy({ by: ['batchId'], where: { batchId: { in: ids } }, _count: { _all: true }, _sum: { scanCount: true } }),
    this.prisma.supplyIssue.findMany({ where: { batchId: { in: ids } }, select: { batchId: true, amount: true, unitPrice: true } }),
  ]);
  const codeMap = new Map(codeAgg.map(c => [c.batchId, { codeCount: c._count._all, scanTotal: c._sum.scanCount ?? 0 }]));
  const costMap = new Map<string, number>();
  for (const it of issues) costMap.set(it.batchId, (costMap.get(it.batchId) ?? 0) + it.amount * it.unitPrice);
  return batches.map(b => ({
    ...b,
    codeCount: codeMap.get(b.id)?.codeCount ?? 0,
    scanTotal: codeMap.get(b.id)?.scanTotal ?? 0,
    inputCost: costMap.get(b.id) ?? 0,
  }));
}

async updateStatus(user: AuthUser, id: string, status: string) {
  await this.scope.assertInScope(this.prisma, user, 'batch', id);
  const cur = await this.prisma.batch.findUnique({ where: { id } });
  if (!cur) throw new NotFoundException('批次不存在');
  if (STATUS_ORDER.indexOf(status as any) <= STATUS_ORDER.indexOf(cur.status as any)) {
    throw new BadRequestException('非法的状态流转');
  }
  return this.prisma.batch.update({ where: { id }, data: { status } });
}

async updateCost(user: AuthUser, id: string, dto: { laborCost?: number; sellPrice?: number }) {
  await this.scope.assertInScope(this.prisma, user, 'batch', id);
  return this.prisma.batch.update({ where: { id }, data: {
    ...(dto.laborCost != null ? { laborCost: dto.laborCost } : {}),
    ...(dto.sellPrice != null ? { sellPrice: dto.sellPrice } : {}),
  } });
}

async lifecycle(user: AuthUser, id: string) {
  await this.scope.assertInScope(this.prisma, user, 'batch', id);
  const [batch, farmRecords, traceEvents, codeAgg, scans] = await Promise.all([
    this.prisma.batch.findUnique({ where: { id } }),
    this.prisma.farmRecord.findMany({ where: { batchId: id }, orderBy: { recordedAt: 'asc' } }),
    this.prisma.traceEvent.findMany({ where: { batchId: id }, orderBy: { occurredAt: 'asc' } }),
    this.prisma.traceCode.aggregate({ where: { batchId: id }, _count: { _all: true }, _sum: { scanCount: true } }),
    this.prisma.traceScan.findMany({ where: { batchId: id }, orderBy: { scannedAt: 'desc' }, take: 10, select: { scannedAt: true } }),
  ]);
  return {
    batch, farmRecords, traceEvents,
    codeCount: codeAgg._count._all, scanTotal: codeAgg._sum.scanCount ?? 0,
    recentScans: scans,
  };
}
```

- [ ] **Step 4: 运行验证通过**

Run: `cd /e/code/nongchang/packages/backend && npx vitest run src/modules/batch/batch.service.spec.ts`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/modules/batch/batch.service.ts packages/backend/src/modules/batch/batch.service.spec.ts
git commit -m "feat(backend): batch list aggregation + status transition + cost edit + lifecycle drill-down"
```

---

## Task 5: BatchController 端点

**Files:**
- Modify: `packages/backend/src/modules/batch/batch.controller.ts`

- [ ] **Step 1: 加端点**

import 追加 `Param, Patch`、`UpdateBatchStatusDto, updateBatchStatusSchema, UpdateBatchCostDto, updateBatchCostSchema`。新增方法：

```typescript
  @Get(':id/lifecycle')
  lifecycle(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.lifecycle(user, id);
  }

  @Patch(':id/status') @Roles(Role.SYSTEM_ADMIN, Role.MERCHANT)
  updateStatus(@CurrentUser() user: AuthUser, @Param('id') id: string,
    @Body(new ZodValidationPipe(updateBatchStatusSchema)) dto: UpdateBatchStatusDto) {
    return this.svc.updateStatus(user, id, dto.status);
  }

  @Patch(':id') @Roles(Role.SYSTEM_ADMIN, Role.MERCHANT)
  updateCost(@CurrentUser() user: AuthUser, @Param('id') id: string,
    @Body(new ZodValidationPipe(updateBatchCostSchema)) dto: UpdateBatchCostDto) {
    return this.svc.updateCost(user, id, dto);
  }
```

注意：`@Get(':id/lifecycle')` 须在 `@Get('by-code/:code')` 之后；`@Patch(':id')` 放在 `@Patch(':id/status')` 之后避免路由吞噬。

- [ ] **Step 2: 构建**

Run: `pnpm --filter @nongchang/backend build`
Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/modules/batch/batch.controller.ts
git commit -m "feat(backend): batch lifecycle/status/cost endpoints"
```

---

## Task 6: web BatchAdmin 接真实聚合

**Files:**
- Modify: `packages/web/src/api/batches.ts`（Batch 类型加新字段 + 三个新调用）
- Modify: `packages/web/src/components/BatchAdmin.tsx:33-47`（toViewBatch 用真实字段）

- [ ] **Step 1: 先读现状**

Read: `packages/web/src/api/batches.ts` 确认 `Batch` 接口与 `listBatches` 签名、`request` 用法（参照 `farm-records.ts` 的 `request(url,{method,body})` 风格）。

- [ ] **Step 2: 扩展 api 客户端**

`batches.ts` 的 `Batch` 接口加 `laborCost:number; sellPrice:number; codeCount:number; scanTotal:number; inputCost:number;`，并新增：
```typescript
export function updateBatchStatus(id: string, status: string) {
  return request<Batch>(`/batches/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
}
export function updateBatchCost(id: string, dto: { laborCost?: number; sellPrice?: number }) {
  return request<Batch>(`/batches/${id}`, { method: 'PATCH', body: JSON.stringify(dto) });
}
export function getBatchLifecycle(id: string) {
  return request<BatchLifecycle>(`/batches/${id}/lifecycle`);
}
```
（`BatchLifecycle` 从 `@nongchang/shared` import；request 签名以 Step 1 实读为准。）

- [ ] **Step 3: toViewBatch 用真实字段**

`BatchAdmin.tsx` 把 `inputCost:0, laborCost:0, sellPrice:0, generated:0` 改为：
```typescript
    inputCost: b.inputCost,
    laborCost: b.laborCost,
    sellPrice: b.sellPrice,
    generated: b.codeCount,
```

- [ ] **Step 4: 构建 web**

Run: `pnpm --filter web build`
Expected: 无 TS 错误。

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/api/batches.ts packages/web/src/components/BatchAdmin.tsx
git commit -m "feat(web): batch admin uses real code totals + input cost; add status/cost/lifecycle clients"
```

---

## Task 7: 全量验证

- [ ] **Step 1: 构建全部**

Run: `pnpm -r build`
Expected: shared/backend/web 全绿。

- [ ] **Step 2: 后端单元测试**

Run: `cd /e/code/nongchang/packages/backend && npx vitest run src`
Expected: 全部 PASS（含新增 batch 用例 + 既有 farm-record/supply）。

- [ ] **Step 3: web 测试**

Run: `pnpm --filter web test`
Expected: PASS。

- [ ] **Step 4: 最终复审**

由 final code reviewer 子代理审查整套改动，确认 ScopeService 守护完整、路由顺序正确、聚合空集处理无误。

---

## 范围外（YAGNI）

CSV 导入、保存视图、高级筛选、导出 PDF/Excel、极速出报告、合规性探针 —— 本轮不动。
