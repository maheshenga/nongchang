# 芍药溯源农事系统重构 — 子项目 2:溯源闭环设计

> 范围:整体平台重构的第二个子项目(共 5 个)。在子项目 1(SaaS Core 后端)地基上,打通"消费者扫码 → 看到批次真实溯源链路"的**读闭环**。

## 1. 背景与目标

子项目 1 已交付:多租户后端、`trace_codes`/`trace_events` 建表 + 受登录保护的录入接口(`POST /api/trace/codes/:batchId` 生码、`POST /api/trace/events` 录事件),以及一个写死 `MOCK_JOURNEY` 的消费者溯源页 `TraceabilityPage.tsx`。

本子项目目标:**扫码 → 真实链路** 的端到端闭环。交付一个免登录公开只读 API 和把消费者页切到真实数据。

**不做**(留后续子项目):
- 管理端"生码 / 打印二维码"UI(子项目 4 Web 真实化)。
- 公开接口限流(部署层 Nginx 或后续防护批)。
- 溯源事件自动生成 / 农事记录自动转事件(子项目 3/5)。
- "数据图表"tab(子项目 5 IoT/AI)。
- 微信登录联调(子项目 3)。

## 2. 架构与范围

两个改动面:

1. **后端** `@nongchang/backend` —— 新增**独立公开模块** `PublicTraceModule`,单一只读端点 `GET /api/public/trace/:code`:
   - 免登录,用 `@Public()` 跳过全局 JWT 守卫。
   - 按 `trace_codes.code` 反查批次,返回脱敏批次信息 + 按 `occurredAt` 升序的事件链路。
   - 成功命中 `scan_count` 原子 +1。
   - 找不到 code → 404。

2. **前端** `@nongchang/web` —— `TraceabilityPage.tsx` 从 `MOCK_JOURNEY` 切到真实 API,渲染真实链路。

**关键边界**:
- 公开接口是**独立模块**,不复用受登录保护的 `TraceController`——脱敏逻辑与受保护逻辑分离,职责清晰、好测。
- **严格脱敏**:公开响应用专门的 public DTO 显式列字段(白名单),绝不直接吐 Prisma 实体,绝不出现 `tenant_id / owner_id / 内部 userId / 价格 / 手机号`。

## 3. 数据契约(Public DTO 白名单)

放 `@nongchang/shared`(zod schema + 类型),供前后端共用。

```
PublicTraceResponse {
  code: string                  // 溯源码本身,回显
  scanCount: number             // 本次 +1 后的累计扫码次数
  batch: {
    cropName: string
    batchNo: string
    plantDate: string           // ISO
    expectedHarvest: string     // ISO
    status: BatchStatus         // Planting|Growing|Harvested|Distributed
    fieldName: string           // 地块名(产地展示)
    region: string | null       // 产地地区:取批次 owner 所属代理商的 region
  }
  events: PublicTraceEvent[]    // 按 occurredAt 升序
}

PublicTraceEvent {
  type: TraceEventType          // origin|farm|harvest|warehouse|logistics|retail
  title: string
  actor: string
  location: string
  occurredAt: string            // ISO
  payload: object | null        // 富信息(图片/天气/温度/等级/IoT 读数),前端按 key 读取
}
```

**显式排除**(绝不出现在响应):`tenantId`、`ownerId`、内部 `userId`、`fieldId`/`batchId` 等内部主键、价格、手机号、用户名。

**决策**:
- `region` 取**批次 owner 所属代理商的 `region`**(如"云南")。`fields` 表无独立 region 字段(只有 PostGIS 坐标),`agents` 表有 `region`。
- `payload` **原样透传**整个 JSONB(YAGNI:payload 本就是为展示而存的非敏感富信息,录入方自觉不塞敏感数据)。

## 4. 后端实现

**新文件** `packages/backend/src/modules/public-trace/`:
- `public-trace.service.ts` —— 查询逻辑
- `public-trace.controller.ts` —— 单一公开端点
- `public-trace.module.ts` —— 模块声明
- `public-trace.service.spec.ts` —— 单元测试(TDD)

**shared 新增** `packages/shared/src/dto/`:`PublicTraceResponse` / `PublicTraceEvent` 的 zod schema + 类型。

**Service `getByCode(code)`**:
1. `traceCode.findUnique({ where: { code } })` → 没有则抛 `NotFoundException`(→ 404),不自增。
2. 取 `batchId`,查批次(含 field → field.owner → owner 所属 agent 的 region)、查该批次 `traceEvents`(按 `occurredAt` 升序)。
3. **原子自增**:`traceCode.update({ where: { code }, data: { scanCount: { increment: 1 } } })`,用返回值的新 `scanCount`。
4. 经映射函数 `toPublicResponse(...)` **显式挑字段**组装成白名单 DTO 返回。

**Controller**:
```
@Controller('public/trace')
export class PublicTraceController {
  @Public()
  @Get(':code')
  get(@Param('code') code: string) { return this.svc.getByCode(code); }
}
```
- 全局 `JwtAuthGuard` 已有 `@Public()` 旁路(子项目 1);`RolesGuard` 无 `@Roles` 时放行。故公开端点不受守卫阻挡。
- 注册进 `AppModule` 的 imports。

**安全实现点**:公开响应必须经 `toPublicResponse` 映射,杜绝整对象透传导致泄露。

## 5. 前端改造(消费者页切真实 API)

**改动文件**:`packages/web/src/components/TraceabilityPage.tsx`(261 行,纯展示组件,签名 `({ code, onBack })`)。

1. **数据获取** —— 用 `code` 调 `GET /api/public/trace/:code`:
   - 加载中:保留现有"区块链验证中"loading 动画,改为真实请求挂起态。
   - 成功:`batch` 填头部(作物名/产地/批次),`events` 渲染时间线。
   - 失败(404/网络):新增友好降级页"溯源码无效或不存在"。

2. **事件 → 视觉映射**:
   - **图标**:由 `type` 查表(origin→Sprout, farm→Leaf, harvest→Sun, warehouse→Hexagon, logistics→Truck, retail→Store)。
   - **富信息**:`weather/temp/tag/image/data` 等从 `payload[key]` 按需读取,缺失则不渲染该块(优雅降级)。

3. **API 层** —— 新建 `packages/web/src/api/trace.ts`,导出 `fetchPublicTrace(code)` + base URL 配置(开发同源 `/api`,经 Vite proxy 转发;生产 Nginx 同源 `/api`)。这是 web 包第一个真实 API 调用,子项目 4 复用扩展。

4. **tab 调整** —— 保留"溯源档案"(主时间线)、"防伪验证"(展示 `code` + `scanCount` + 有效性);移除"数据图表"tab 及 mock 数据。

**开发跨域**:`vite.config.ts` 加 `server.proxy`,把 `/api` 转发到 `http://localhost:3001`,前端统一用同源 `/api/...`,与生产 Nginx 行为一致,无需 CORS。

## 6. 测试与验收

**后端单元测试** `public-trace.service.spec.ts`(TDD,Vitest + mock prisma):
- 有效 code → 返回组装好的 `PublicTraceResponse`,字段正确。
- **脱敏断言(关键)**:响应对象不含 `tenantId/ownerId/userId/fieldId/batchId` 等内部键(直接断言 key 不存在)。
- 无效 code → 抛 `NotFoundException`。
- `scanCount` 自增:`traceCode.update` 被以 `{ increment: 1 }` 调用,新计数透传。
- 事件按 `occurredAt` 升序。

**后端 e2e** `test/public-trace.e2e-spec.ts`(真实 PG,延续子项目 1 隔离 e2e 风格):
- 扩充 `seed.ts`:给演示批次预置溯源码 + 完整 7 节点链路(种苗→移栽→采收→入库→物流→零售)。
- 免登录 `GET /api/public/trace/:code` → 200,链路节点数与顺序正确。
- 不存在的 code → 404。
- 连续两次请求,`scanCount` 递增。
- **脱敏**:断言响应 body 搜不到任何 `tenantId`/`ownerId` 值。

**前端**:web 包当前无测试框架,本轮**不引入**前端测试栈(留子项目 4)。正确性靠:① 后端 e2e 保证 API 契约;② 手动验证(消费者页渲染真实链路 + 降级页)——计划里写明手动步骤。

**验收标准**:
- `pnpm --filter @nongchang/backend test` 全绿(新增单元 + e2e)。
- 免登录扫码可见真实链路;无效码见降级页;`scanCount` 随扫码递增。
- 公开响应零敏感字段泄露(单元 + e2e 双重断言)。
- 三处构建(shared/backend/web)仍全绿。

## 7. 事件链路数据来源

本子项目聚焦**读闭环**。溯源事件仍靠子项目 1 已有的 `POST /api/trace/events` 录入,或种子数据预置。在 `seed.ts` 给演示批次预置一条完整 7 节点链路,支撑端到端演示。自动化(批次状态触发、农事记录转事件)留子项目 3/5。
