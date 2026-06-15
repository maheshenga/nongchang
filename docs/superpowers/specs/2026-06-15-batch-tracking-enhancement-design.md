# 全域批次追踪功能完善 设计文档

> 日期：2026-06-15　范围：BatchAdmin（全域批次追踪屏）后端 + web 真实化

## 目标

把「全域批次追踪」屏中四处占位/虚假能力替换为真实数据，并补充批次状态流转与全生命周期下钻：

1. **真实防伪码总数**：批次列表展示真实已签发溯源码数与累计扫码次数。
2. **批次全生命周期下钻**：单批次聚合视图（农事 + 溯源事件 + 码/扫码统计）。
3. **批次状态流转**：后端单向状态机端点（PLANTING→GROWING→HARVESTED→DISTRIBUTED）。
4. **利润大盘真实化**：投入成本由农资领用自动累加，人工/售价可编辑，毛利真实计算。

所有新端点经 `ScopeService` fail-closed 校验归属（agent_admin 限辖区、merchant 限自身）。

## 数据模型变更（单个迁移）

- `Batch`：新增 `laborCost Float @default(0) @map("labor_cost")`、`sellPrice Float @default(0) @map("sell_price")`。
  （inputCost 不落库，运行时由领用聚合得出。）
- `SupplyIssue`：新增 `unitPrice Float @default(0) @map("unit_price")`，领用时锁定当时单价。
- `TraceCode`：新增 `@@index([batchId])`（当前仅 tenantId 索引，聚合需要）。

迁移名：`add_batch_costs_supply_unitprice_tracecode_batch_index`。

## ① 真实防伪码总数

**现状**：`toViewBatch` 写死 `generated: 0`；表格列恒为 0。

**后端** `BatchService.list`：
- 现有 `findMany({where})` 取批次后，对结果 id 集合做聚合：
  - `traceCode.groupBy({ by:['batchId'], where:{ batchId:{in:ids} }, _count:{_all:true}, _sum:{scanCount:true} })`
  - `supplyIssue.findMany({ where:{ batchId:{in:ids} }, select:{batchId,amount,unitPrice} })`（供 ④ 的 inputCost 用，见 ④）
- 合并进每条批次：`codeCount`、`scanTotal`、`inputCost`。
- ids 为空时跳过聚合，返回空结果，避免 `in:[]` 全表。

**返回类型**：`BatchListItem = Batch & { codeCount:number; scanTotal:number; inputCost:number }`（shared 导出类型）。

**web**：`toViewBatch` 用 `b.codeCount` 替换 `generated`，`b.inputCost` 替换写死 0。

## ② 批次全生命周期下钻

**端点**：`GET /batches/:id/lifecycle`。

**Service** `BatchService.lifecycle(user, id)`：
- `assertInScope(prisma, user, 'batch', id)`；
- 并行查询：批次本体、`farmRecord.findMany({where:{batchId:id}, orderBy:{recordedAt:'asc'}})`、`traceEvent.findMany({where:{batchId:id}, orderBy:{occurredAt:'asc'}})`、`traceCode` 聚合（count + scanCount sum）、最近 10 条 `traceScan`（按 scannedAt desc，**脱敏：不返回完整 ip/userAgent**，仅 scannedAt）。
- 返回 `{ batch, farmRecords, traceEvents, codeCount, scanTotal, recentScans }`。

**web**：BatchAdmin 行内「下钻」入口，点开 modal 拉取该端点渲染时间线（农事 + 溯源事件按时间合并）。

## ③ 批次状态流转

**端点**：`PATCH /batches/:id/status`，body `{ status }`。

**shared**：`updateBatchStatusSchema = z.object({ status: z.enum([...四态]) })`。

**Service** `BatchService.updateStatus(user, id, status)`：
- `assertInScope('batch', id)`；
- 取当前 status，校验**单向前进**（允许跳级前进，禁止回退/不变）：顺序索引 PLANTING=0 < GROWING=1 < HARVESTED=2 < DISTRIBUTED=3，要求 `next > current`，否则 `BadRequestException('非法的状态流转')`；
- `batch.update({ where:{id}, data:{status} })`。

**web**：批次行/下钻面板按钮触发，成功后 `reload()`。

## ④ 利润大盘真实化

成本来源（已确认）：**农资领用自动累加投入，单价在领用时锁定**。

- **inputCost**（自动，不落库）：`Σ(SupplyIssue.amount × SupplyIssue.unitPrice)` per batch。
  - `SupplyIssue` 加 `unitPrice`；领用 DTO/Service 写入领用时单价。
  - `batch.list` 用 `supplyIssue.findMany({where:{batchId:{in:ids}}, select:{batchId,amount,unitPrice}})` 后在内存按 batchId 累加 `amount*unitPrice`（领用条数有限，可接受）。
- **laborCost / sellPrice**（人工）：`Batch` 新列，经 `PATCH /batches/:id`（`updateBatchCostSchema = z.object({ laborCost:z.number().min(0).optional(), sellPrice:z.number().min(0).optional() })`）编辑，`assertInScope` 守护。
- **web**：`toViewBatch` 用真实 `inputCost/laborCost/sellPrice`；`calculateMargin` 不变。

## 控制器汇总（batches）

| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| GET | `/batches` | 全部 | 列表 + 聚合（①④） |
| GET | `/batches/:id/lifecycle` | 全部 | 下钻（②） |
| PATCH | `/batches/:id/status` | SYSTEM_ADMIN, MERCHANT | 状态流转（③） |
| PATCH | `/batches/:id` | SYSTEM_ADMIN, MERCHANT | 人工/售价编辑（④） |

（read 端点沿用现有 controller 级默认鉴权；写端点 `@Roles(SYSTEM_ADMIN, MERCHANT)` 与 create 一致。）

## 测试

- **单元**（`batch.service.spec.ts`）：list 聚合合并、空 ids 跳过、lifecycle 归属校验、updateStatus 合法/非法流转、edit 守护。
- **e2e**：跨范围 fail-closed（agent 看不到他人批次下钻/状态流转 → Forbidden）。

## 范围外（YAGNI）

CSV 导入、保存视图、高级筛选、导出 PDF/Excel、极速出报告、合规性探针——本轮不动。

## 领用单价兼容性

`SupplyIssue.unitPrice` 默认 0：历史领用记录 inputCost 计为 0，符合「无单价即不计成本」。领用接口此后必须带单价（或从 Supply 取默认），具体在实现计划中明确。
