# 农资投入品管理真实化 设计文档(子项目 5-2a/b)

## 来源与脉络

平台级重构子项目 5「实时与 AI 子系统」过大,已拆分为多个可独立交付的小项。子项目 5-1「防伪监控真实化」已完成并合入 main。

本文档是子项目 5-2:web 后台 `LogisticsTracker.tsx` 真实化。该屏捆绑三个独立功能 Tab:**实时追踪(物流运单)**、**路径优化(AI 装饰)**、**农资投入品管理**。经与用户对齐:

- 本战(5-2a/b)只做 **农资投入品管理 Tab** 真实化:库存 + 领用 + 打卡核销全链。
- **路径优化 Tab** 是纯装饰假 AI,依赖 Gemini 接入,留给后续 AI 战;本战保留 mock + DemoBadge。
- **实时追踪 Tab**(物流运单/轨迹)缺乏真实数据源(未对接第三方快递),留作后续独立小战 **5-2c**;本战保留 mock + DemoBadge。

---

## 1. 范围

**目标**:把农资投入品管理从前端本地 state 模拟(`MOCK_SUPPLIES` + 前端模拟熔断文案),改造为「商家维度库存台账 → 领用即出库扣减 → 农户打卡填用量 → 批次+农资维度核销熔断」的真实闭环。

**本项交付范围**:
- 商家维度农资库存 CRUD(入库登记、删除、台账列表带剩余/预警)
- 领用下达:领用即出库(`Supply.used += amount`),超量(`amount > 剩余`)熔断
- 打卡核销:农户记一笔时可选农资 + 填用量,写入 `FarmRecord`;实际累计消耗 > 该批次该农资配额×110% 时熔断打卡提交
- `LogisticsTracker.tsx` 农资 Tab 切真实 API,去 mock、去该 Tab 的 DemoBadge
- 小程序记一笔页加可选农资核销选择器

**不包含(排后续)**:
- 物流运单/轨迹(实时追踪 Tab)→ 子项目 5-2c
- AI 路径优化/碳减排(路径优化 Tab)→ 后续 Gemini AI 战
- 预留/实际双重扣减的严谨仓储模型(本战用「领用即出库」单账 + 打卡核销比对)
- 农资品类的租户级字典(本战品类与库存合一,商家各自维护)

**现有地基**:
- 多租户 SaaS:全局 `JwtAuthGuard` + `RolesGuard`,`@CurrentUser()` 装饰器
- `ScopeService.ownedWhere`(merchant→自己、agent→旗下、sysadmin→全租户,均 fail-closed)
- `FarmRecord`(农事打卡,现有 `action`/`detail Json?`/`batchId`/`fieldId`)
- 小程序记一笔页 `record/index.tsx`(现 action + note + 图)

---

## 2. 数据模型

沿用现有 schema 风格(无显式关系、靠 id 手工关联、每表带 `tenantId`、snake_case `@map`)。

**新表 `Supply`(农资库存,商家维度):**
```prisma
model Supply {
  id        String   @id @default(uuid())
  tenantId  String   @map("tenant_id")
  ownerId   String   @map("owner_id")   // = merchant 的 ownerId,作用域过滤
  name      String                       // 复合肥 / 多菌灵...
  unit      String                       // 箱 / 包(50kg) / 桶(20L)
  total     Float    @default(0)         // 入库总量(累计)
  used      Float    @default(0)         // 已领用出库累计
  createdAt DateTime @default(now()) @map("created_at")
  @@index([tenantId])
  @@index([ownerId])
  @@map("supplies")
}
```

**新表 `SupplyIssue`(领用单 = 给某批次某农资的配额,领用即出库):**
```prisma
model SupplyIssue {
  id        String   @id @default(uuid())
  tenantId  String   @map("tenant_id")
  ownerId   String   @map("owner_id")
  supplyId  String   @map("supply_id")  // 手工关联 Supply
  batchId   String   @map("batch_id")   // 关联溯源批次(核销维度)
  amount    Float                        // 本次领用/配额量
  createdAt DateTime @default(now()) @map("created_at")
  @@index([tenantId])
  @@index([ownerId])
  @@index([supplyId])
  @@index([batchId, supplyId])           // 核销聚合:按批次+农资查配额
  @@map("supply_issues")
}
```

**改 `FarmRecord` 加两列(打卡核销):**
```prisma
supplyId     String?  @map("supply_id")
supplyAmount Float?   @map("supply_amount")
```

**为什么这样建**:库存与品类合为 `Supply` 单表,与商家维度隔离一致(第一问 A)。领用单独立成表保留「配额」语义,`@@index([batchId, supplyId])` 支撑核销聚合。`FarmRecord` 加结构化两列(而非塞 `detail Json`),使核销可走 DB 端 `_sum` 聚合,不随记录增长劣化,与 `TraceScan` 加结构化列的风格一致。

**核销聚合查询**:
- 配额 = `supplyIssue.aggregate({ where: { batchId, supplyId }, _sum: { amount } })`
- 已消耗 = `farmRecord.aggregate({ where: { batchId, supplyId }, _sum: { supplyAmount } })`(含本次)

**迁移**:一条 Prisma migration —— 建 `supplies`、`supply_issues` 两表 + 索引,`farm_records` 加两列。用 `prisma migrate deploy`(项目惯例,避免 PostGIS GIST 索引误删提示)。

---

## 3. 后端 API 与核销逻辑

**新增独立模块 `SupplyModule`**(与 AntiFake/PublicTrace 平级),含 service + controller。全走全局 `JwtAuthGuard` + `ScopeService`(merchant 作用域,fail-closed),用 `@CurrentUser() user: AuthUser`。`PrismaService` 为 `@Global`。

**受保护端点(`SupplyController`,`@Controller('supplies')`):**

1. `GET /api/supplies` — 库存台账列表(作用域过滤,`createdAt` 倒序)。每条带派生字段 `remaining = total - used`、`alert = remaining < 10`(阈值 `LOW_STOCK_THRESHOLD` 模块常量)。
2. `POST /api/supplies` — 入库登记(新建 Supply,`total = 入库量`、`used = 0`)。merchant 强制 `ownerId = self`(取 `user.ownerId`)。
3. `POST /api/supplies/:id/issue` — 领用下达:校验 supply 在作用域内(fail-closed,越权抛 `ForbiddenException`);`amount > remaining` → 抛 `BadRequestException`「领用量超过剩余库存,超量熔断」;否则 **`prisma.$transaction` 内** `used += amount` 且写一条 `SupplyIssue`(绑 `batchId`/`supplyId`/`amount`)。
4. `DELETE /api/supplies/:id` — 删除农资档案(作用域校验,fail-closed)。

**核销逻辑(改现有 `FarmRecordService.create`):**

农户打卡若带 `supplyId` + `supplyAmount`,落库前做核销:
```
配额  = supplyIssue.aggregate({ where: { batchId, supplyId }, _sum: { amount } })
已消耗 = farmRecord.aggregate({ where: { batchId, supplyId }, _sum: { supplyAmount } })
若 (已消耗 + 本次 supplyAmount) > 配额 × 1.1
  → 抛 BadRequestException「实际用量超过领用配额 110%,核销熔断」
```
两个 `aggregate` 走 DB 端 `_sum`,不拉全表。校验通过才写 `FarmRecord`(含两列)。无 `supplyId` 的打卡走原路径,完全向后兼容(现有农事记录不受影响)。

**作用域与 fail-closed**:supply 与 SupplyIssue 的 `ownerId` 经 `ScopeService.ownedWhere` 注入 where,越权一律 fail-closed。核销聚合按 `batchId + supplyId`,批次归属由 `FarmRecord` 既有作用域保证(本战不改 FarmRecord 的作用域校验)。

**shared 包**:新增 zod DTO ——
- `supplyItemSchema` → `SupplyItem`(id/name/unit/total/used/remaining/alert/createdAt)
- `createSupplyInputSchema` → `CreateSupplyInput`(name/unit/amount)
- `issueSupplyInputSchema` → `IssueSupplyInput`(batchId/amount)
- `supplyIssueResponseSchema` → `SupplyIssueResponse`(supplyId/used/remaining)
- `createFarmRecordSchema` 加可选 `supplyId: z.string().optional()`、`supplyAmount: z.number().positive().optional()`

---

## 4. 前端改造

### A. web 后台 `LogisticsTracker.tsx`

只真实化「农资投入品管理」Tab;其余两 Tab(实时追踪、路径优化)保留 mock,各挂 `DemoBadge`。

**新增 API 客户端 `packages/web/src/api/supply.ts`**(模块级稳定函数,配合 `useApi`,走 authed `request`):
- `listSupplies()` → `GET /api/supplies`
- `createSupply(input)` → `POST /api/supplies`
- `issueSupply(id, input)` → `POST /api/supplies/:id/issue`(id 经 `encodeURIComponent`)
- `deleteSupply(id)` → `DELETE /api/supplies/:id`(id 经 `encodeURIComponent`)

**`LogisticsTracker.tsx` 改造点:**
- 删 `MOCK_SUPPLIES` 与 `suppliesData` 本地 state,改 `useApi(listSupplies)`。
- 入库 modal → `createSupply` 后 `reload`。
- 领用 modal → `issueSupply`;**超量熔断由后端返回 `BadRequest`**,前端把错误信息显示成 toast(删除前端自模拟的熔断文案分支)。
- 删除按钮 → `deleteSupply` 后 `reload`。
- `remaining`/`alert` 用后端字段,不再前端计算。
- 顶部标题 `<DemoBadge />` 仅在 `viewMode !== 'supplies'` 时渲染(农资 Tab 去徽标)。
- loading/error 态复用既定模式;modal 保持无障碍(`label htmlFor`/`id`、`aria`)。

### B. 小程序记一笔页 `record/index.tsx`

加可选农资核销:
- 新增小程序 API `getSupplies()` → `GET /api/supplies`(农户用自己 JWT,作用域返回自己的农资)。
- 页面加「使用农资(可选)」选择器 + 用量输入。
- 提交时若选了农资,带 `supplyId`/`supplyAmount` 进 `createFarmRecord`。
- 后端核销熔断(>配额110%)返回 `BadRequest`,小程序 `Taro.showToast` 错误信息,提交失败不跳转。
- 不选农资 → 走原路径,完全向后兼容。
- 若农户账号无 supply 作用域(列表为空),选择器显示「无可选农资」,打卡仍可不带农资提交。

### C. 不改的

- 实时追踪 Tab(物流运单/轨迹/地图)保持 mock + DemoBadge → 5-2c。
- 路径优化 Tab(AI/碳减排)保持 mock + DemoBadge → 后续 Gemini 战。

---

## 5. 测试策略

沿用项目既定体系:后端 Vitest(单元 mock Prisma + e2e 打真实 PG `nongchang-postgis`),web Vitest + Testing Library。小程序记一笔页现无组件测试(与现状一致),核销逻辑真值在后端测。

**后端单元(mock Prisma):**
- `SupplyService.list` — 作用域 where 正确注入(merchant/agent/sysadmin 三态)+ remaining/alert 计算 + merchant 缺 ownerId fail-closed 抛 Forbidden。
- `SupplyService.create` — merchant 强制 `ownerId = self`。
- `SupplyService.issue` — 正常扣减 `used += amount` 且写 SupplyIssue;`amount > remaining` 抛 BadRequest(熔断必测);越权(supply 不在作用域)抛 Forbidden。
- `FarmRecordService.create` 核销 — 消耗 ≤ 配额×110% 通过;> 110% 抛 BadRequest(核销熔断必测);不带 supplyId 走原路径不校验(向后兼容必测);边界(恰好 110%)。

**后端 e2e(真实 PG,复用 seed + `overrideProvider`):**
- merchantA 入库 → 领用(扣减 used + 写领用单)→ 库存正确。
- 领用超量 → 400 熔断,库存不变。
- 作用域隔离:merchantB 看不到 merchantA 的 supplies,越权领用/删除被拒(403)。
- 核销:领用配额后,打卡消耗超 110% → 400;未超 → 201 且 FarmRecord 落两列。
- afterAll 清理本测试新建的 supplies/issues/farm_records,避免污染共享 PG。

**web 单元:**
- `supply.ts` 客户端:正确 URL/method(含 issue/delete 的 `:id` 编码、create body)。
- `LogisticsTracker` 农资 Tab:渲染真实 supplies、入库触发 `createSupply`+reload、领用触发 `issueSupply`、超量后端错误显示 toast、删除触发 `deleteSupply`、农资 Tab 无 DemoBadge 而另两 Tab 有。

**回归保护**:全量后端测试(现 55/55)+ web 全量(现 20/20)不回归。

**验证关卡**(沿用前几战,作为最终任务):shared/backend/web 三处构建全绿 + lint 干净 + 上述测试全绿 + 小程序 `pnpm --filter miniapp build` 不破。
