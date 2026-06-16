# AI 算力 & 二维码额度计费系统设计

日期:2026-06-16
状态:已确认,待实现

## 1. 背景与目标

系统当前计费基础设施为零:`Tenant` 仅 id/name/status,无套餐/配额;AI 三端点(chat/diagnose/transcribe)与 `TraceService.generateCodes` 均无任何计量。本设计新增一套**预付额度池**计费体系,对两类资源计量收费,并在后台 web 与小程序端植入相关 AI 功能。

两类计费资源:
- **AI 算力**:按调用次数计量(chat=1、diagnose=3、transcribe=2)。
- **二维码生成数量**:生成时按个数扣减。

核心计费决策(已与用户确认):
- 计费模型:预付额度池(非套餐周期)。
- AI 计量口径:按调用次数(加权)。
- 二维码扣减点:生成时扣减。
- 配额层级:平台 → 代理商 → 商户三级。
- 额度耗尽:硬熔断(余额不足直接拒绝调用)。
- 账本架构:双表(账户 + 流水)。
- 分配语义:转账制,总量守恒。

## 2. 数据模型

新增两张表与若干枚举,不改动现有表结构。

### 枚举

```
enum CreditOwnerType { PLATFORM | AGENT | MERCHANT }
enum CreditResource  { AI | CODE }
enum LedgerReason    { RECHARGE | ALLOCATE_IN | ALLOCATE_OUT | CONSUME | REFUND }
```

### CreditAccount(额度账户)

每个额度持有者唯一一个账户。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | String | 主键 |
| ownerType | CreditOwnerType | PLATFORM / AGENT / MERCHANT |
| ownerId | String | 平台=固定常量 `PLATFORM`;代理商=agentId;商户=userId |
| tenantId | String | 所属租户(平台账户为系统租户) |
| aiBalance | Int @default(0) | AI 算力余额(次) |
| codeBalance | Int @default(0) | 二维码余额(个) |
| createdAt / updatedAt | DateTime | |

约束:`@@unique([ownerType, ownerId])`。

### CreditLedger(额度流水,不可变)

每一笔余额变动一条记录。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | String | 主键 |
| accountId | String | 关联 CreditAccount |
| resource | CreditResource | AI / CODE |
| delta | Int | 正=入账,负=出账 |
| balanceAfter | Int | 该笔后余额(对账用) |
| reason | LedgerReason | RECHARGE/ALLOCATE_IN/ALLOCATE_OUT/CONSUME/REFUND |
| refType | String? | 业务来源:ai.chat/ai.diagnose/ai.transcribe/trace.generate |
| refId | String? | 业务对象 id(如 batchId) |
| operatorId | String? | 触发者 |
| note | String? | 备注 |
| createdAt | DateTime | |

索引:`@@index([accountId, createdAt])`。

## 3. 计费核心逻辑

### 转账制总量守恒

平台→代理商→商户的分配本质是「转出账户 -N + 转入账户 +N」,在同一 `$transaction` 写两笔流水(ALLOCATE_OUT / ALLOCATE_IN)。转出方做余额非负校验,失败整体回滚。商户消费只扣自己账户(CONSUME)。系统内额度总量恒定,只在平台 RECHARGE 时增加。

### 原子扣费(并发安全)

```
$transaction:
  1. UPDATE CreditAccount SET aiBalance = aiBalance - n
     WHERE id = ? AND aiBalance >= n
  2. 若影响行数 = 0 → 抛 ForbiddenException('AI 算力额度不足,请联系上级充值')  // 硬熔断
  3. INSERT CreditLedger(delta = -n, balanceAfter = ..., reason = CONSUME)
```

用「条件 WHERE + 影响行数判断」保证并发下不会扣成负数。

## 4. 后端实现

### 新模块 billing(packages/backend/src/modules/billing/)

`billing.service.ts`:
- `getAccount(ownerType, ownerId)` / `ensureAccount(...)` — 取或建账户。
- `consume(account, resource, n, ref)` — 原子条件递减 + 写流水,余额不足抛 ForbiddenException。
- `allocate(fromAccount, toAccount, resource, n, operator)` — 转账制,同事务两笔流水,转出方非负校验。
- `recharge(account, resource, n, operator)` — 仅平台账户可被充值。
- `resolveConsumerAccount(user)` — 按 role 决定扣谁:MERCHANT→自己;AGENT_ADMIN→代理商账户;SYSTEM_ADMIN→平台账户。
- `summary(user)` / `ledger(user, query)` — 余额与流水查询,走 ScopeService 隔离。

`billing.controller.ts`(`@Controller('billing')`):
- `GET /billing/summary` — 当前用户可见账户余额。
- `GET /billing/ledger` — 流水明细(分页 + 筛选 resource/reason)。
- `GET /billing/accounts` — 下级账户列表(代理商看旗下商户,平台看代理商)。
- `POST /billing/allocate` — 分配额度给下级(`@Roles SYSTEM_ADMIN, AGENT_ADMIN`)。
- `POST /billing/recharge` — 平台充值(`@Roles SYSTEM_ADMIN`)。

`billing.module.ts` — 导出 BillingService 供 ai/trace 模块注入。

### 扣费插桩点(仅改 2 文件)

`ai.service.ts` — chat/diagnose/transcribe 方法开头 `resolveConsumerAccount(user)`,**外部 AI 成功返回后**调用 `consume(acct, 'AI', WEIGHT[type], {...})`。权重:chat=1、diagnose=3、transcribe=2。失败不扣(扣费置于成功之后)。

`trace.service.ts` — `generateCodes` 在 `scope.assertInScope` 之后、`createMany` 之前 `consume(acct, 'CODE', count, {refType:'trace.generate', refId:batchId})`,额度不足直接拒绝不产码。生码与扣费放同一 `$transaction`,任一失败整体回滚。

设计理由:避免「扣费但 AI 报错」「扣费但码没生成」的资损。AI 无法与外部调用同事务,故「成功后扣」;产码为本地 DB 操作,可同事务强一致。

## 5. 后台 Web(4 项 AI 功能 + 额度仪表板)

沿用现有 lazy-load + activeTab + Nav 模式。

1. **额度仪表板 + 分配**(新组件 `BillingAdmin.tsx`,新栏目「算力与额度」):顶部 AI/码余额卡 + 低额预警;下级账户表格;分配弹窗(选下级+资源+数量→`POST /billing/allocate`);平台多「充值」入口;流水明细 Tab。
2. **AI 农事建议**:选批次→后端将近期农事记录+物候偏离喂 AI(`ai.chat`,扣 1)→返回浇水/施肥/防病建议。
3. **批量 AI 诊断报告**:多图上传→逐张 `ai.diagnose`(各扣 3)→汇总病害报告;额度不足中途硬熔断并提示已诊断 N 张。
4. **AI 数据问答**:自然语言问题→后端取用户范围内 deviations/batches 摘要拼 prompt→`ai.chat`(扣 1)。范围严格走 ScopeService。

Nav:SYSTEM_ADMIN_NAV 与 AGENT_ADMIN_NAV 加「算力与额度」;MERCHANT 在 AI 助手内看自己余额,无分配权。

shared DTO:新增 `billing.dto.ts`(creditAccountSchema、creditLedgerSchema、allocateSchema、rechargeSchema、billingSummarySchema)。

所有 AI/生码调用前端先读 `/billing/summary`,余额为 0 时按钮禁用并提示,避免无谓熔断报错。

## 6. 小程序端(余额条 + 3 功能 + 用量中心)

沿用 work/trace/me 三 tab + AiPanel/RecordForm 模式。

1. **余额展示条**:工作台顶部横幅显示 AI/码余额,低于 10% 变黄告警;进页面拉 `GET /billing/summary`,AI 按钮按余额禁用。
2. **记一笔 AI 推荐**:RecordForm 选完批次/作物后「AI 推荐动作」→`ai.chat`(扣 1)→一键填入表单。
3. **拍照问 AI 增强**:`AiPanel mode='diagnose'` 结果追加「处理建议」「是否需立即处理」,仍走 `ai.diagnose`(扣 3)。
4. **用量中心**:「我的」tab 入口→新页 `pages/usage`,显示本月 AI/码用量、剩余额度、最近流水(summary + ledger)。

每次调用后刷新 summary,余额条实时更新。熔断错误统一弹「额度不足,请联系上级充值」。

## 7. 测试策略

- 后端单测(vitest):`billing.service` 重点测——并发扣费不扣成负数、转账总量守恒(两笔流水加总为 0)、余额不足抛 ForbiddenException、balanceAfter 正确;`ai.service`/`trace.service` 测插桩(成功扣、失败不扣、产码与扣费同事务回滚)。
- 前端:web vitest 测 BillingAdmin 渲染与分配表单校验;miniapp 余额条阈值告警。
- 端到端冒烟:登录 sysadmin→充值→分配给代理商→代理商分配给商户→商户调 AI/生码→验证三级流水与余额。

## 8. 不做的事(YAGNI)

- 不做周期套餐/自动重置(本期为纯预付额度池)。
- 不做 Token 级精确计费(按调用次数加权)。
- 不做透支/负余额。
- 不做发票/支付网关对接(充值为平台管理员手工录入)。
- 不做月度 UsageSnapshot 聚合表(报表直接从流水聚合,后续需要再加)。
