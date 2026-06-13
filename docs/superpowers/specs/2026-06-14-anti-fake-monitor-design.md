## 来源与脉络

平台级重构的子项目 5「实时与 AI 子系统」范围过大（IoT/物流/防伪RFID/AI/系统监控），经与用户对齐，**拆分为多个可独立交付的小项**，各走「设计→计划→实现」闭环。本文档是其中**首战：防伪监控真实化**。

子项目 1-4 已完成：多租户 SaaS 后端地基、公开溯源闭环、农户小程序、web 后台去 mock 化。web 后台的 `AntiFakeMonitor.tsx` 当前仍是 mock 数据 + 「演示数据/待接入」徽标，本项将其真实化。

---

## 1. 范围

**目标**：把防伪监控从前端 `setInterval` 模拟流，改造为「每次消费者扫码落明细 → 异常聚合检测 → 管理员手动冻结 → 公开溯源端点拦截被冻结码」的真实闭环。

**现有地基**：
- `TraceCode`（含 `code @unique`、`batchId`、`scanCount`）
- 公开溯源端点 `GET /api/public/trace/:code` 已上线，扫码时原子自增 `scanCount`
- 全局 `JwtAuthGuard` + `RolesGuard` + `ScopeService`（`ownedWhere`/`ownedScopeWhere`，均 fail-closed）
- `@Public()` 装饰器跳过全局 JWT

**本项交付范围**：
- 每次扫码落逐条明细（IP + UA + 时间）
- 异常检测：同一码在滑动时间窗内来自 ≥N 个不同 IP（可叠加次数门槛）
- 冻结机制：管理员手动冻结/解冻，冻结后公开端点拦截
- `AntiFakeMonitor.tsx` 切真实轮询，去 mock + 去徽标

**不包含（排后续）**：
- 地理位置 IP 反查 / 城市级定位（明细先只存 IP+UA+时间）
- 真实地图坐标（监控屏地图保持 SVG 装饰）
- WebSocket/SSE 实时推送（用轮询；WS 留给后续 IoT 小项统一设计）
- 自动冻结（仅人工冻结）
- 其余 Tier 2 屏幕（IoT/物流/Dashboard/RFID/系统监控）的真实化

---

## 2. 数据模型

沿用现有 schema 风格（无显式关系、靠 id 手工关联、每表带 `tenantId`）。

**改动 1 — `TraceCode` 加冻结状态字段：**
```prisma
model TraceCode {
  // ...现有字段...
  status  String  @default("active")  // active | frozen
}
```
公开溯源端点据此拦截 `frozen` 的码。

**改动 2 — 新建扫码明细表 `TraceScan`：**
```prisma
model TraceScan {
  id         String   @id @default(uuid())
  tenantId   String                       // 冗余存,便于按租户作用域查询
  code       String                       // = TraceCode.code,手工关联
  batchId    String                       // 冗余存,便于按批次/owner 作用域
  ip         String
  userAgent  String?
  scannedAt  DateTime @default(now())

  @@index([tenantId])
  @@index([code, scannedAt])              // 异常检测按 code+时间窗扫描
  @@index([batchId])
}
```

**为什么冗余存 `tenantId`/`batchId`**：检测与作用域过滤需频繁按租户/批次/时间窗聚合；公开扫码时已从 `TraceCode` 拿到 `batchId`，顺手取批次 `tenantId`/`ownerId` 一并写入，避免查询时多次 join，与现有「靠 id 手工关联、读时各自 findUnique」风格一致。

**告警不单独建表**：告警是「对最近扫码明细按 code 聚合 + 多 IP/次数规则」的派生结果，由查询实时算出（轮询场景足够），不持久化，避免告警表与明细表状态同步问题。冻结动作直接改 `TraceCode.status`，是唯一持久化的「处置结果」。

**迁移**：一条 Prisma migration（`TraceScan` 建表 + 索引、`TraceCode.status` 加列）。

---

## 3. 后端 API 与检测逻辑

**新增独立模块 `AntiFakeModule`**（与 PublicTrace/Upload 平级），含 service + controller。

**改动 A — 公开扫码入口落明细（改现有 `PublicTraceService`）：**
- 取到 `TraceCode` 后，若 `status === 'frozen'` → 返回「该溯源码已被冻结/疑似异常」的特定响应（带 `frozen` 标志，HTTP 200）；否则正常返回。
- 正常路径下**异步写一条 `TraceScan`**：从批次拿 `tenantId`/`batchId`，IP 取 `X-Forwarded-For` 首段 fallback socket 地址，UA 取 header。落明细失败不阻断溯源响应（best-effort，try/catch 吞掉）。
- 该端点 `@Public`，无 JWT，采集纯靠请求元数据。
- `scanCount` 仍原子自增（不回归子项目 2）。

**改动 B — 受保护监控端点（`AntiFakeController`，走全局 JwtAuthGuard + ScopeService）：**
1. `GET /api/anti-fake/scans` — 最近扫码明细列表（作用域过滤、分页/limit、倒序）。供监控屏「实时流」轮询。
2. `GET /api/anti-fake/alerts` — 实时聚合告警：作用域内 `TraceScan` 按 `code` 在滑动时间窗（默认 1h）分组，命中「不同 IP 数 ≥ N 且 总次数 ≥ M」的码，返回 `{code, batchId, distinctIps, scanCount, locations: ip列表, lastScanAt, frozen}`。阈值 N/M 为模块常量（可配）。
3. `POST /api/anti-fake/codes/:code/freeze` — 手动冻结：校验 code 在调用者作用域内（fail-closed，越权抛 Forbidden），置 `TraceCode.status='frozen'`。
4. `POST /api/anti-fake/codes/:code/unfreeze` — 解冻（误判恢复），同样作用域校验。

**检测逻辑实现**：用 Prisma `groupBy`/聚合在 `TraceScan` 上按 code 算 `count(*)` 与 `count(distinct ip)`，时间窗 `scannedAt >= now-1h`。作用域通过 `ScopeService.ownedScopeWhere` 注入 `where`（merchant→自己批次、agent→旗下、sysadmin→全租户）。

**shared 包**：新增白名单 DTO（zod）—— `TraceScanItem`、`AntiFakeAlert`、freeze/unfreeze 响应 DTO，前后端共用。

---

## 4. 前端改造

**目标**：`AntiFakeMonitor.tsx` 从 `setInterval` 模拟切真实轮询，去 `DemoBadge`。

**改造点：**
1. **新增 API 客户端** `packages/web/src/api/anti-fake.ts`（模块级稳定函数，配合 `useApi`）：
   - `listScans()` → `GET /api/anti-fake/scans`
   - `listAlerts()` → `GET /api/anti-fake/alerts`
   - `freezeCode(code)` / `unfreezeCode(code)` → POST 端点
   - 走现有 authed `request` 包装器（自动带 JWT + 401 刷新）。

2. **`AntiFakeMonitor.tsx`**：
   - 删除 `MOCK_SCANS` 与 3 秒 `setInterval` 模拟，删除 `<DemoBadge />`。
   - 用 `useApi(listScans)` + `useApi(listAlerts)` 拉数据；轮询用一个 `setInterval`（每 10s）调 `reload()`，卸载时 `clearInterval`。
   - 告警卡渲染真实 `alerts`（`{code, distinctIps, scanCount, locations, frozen}`），扫码流渲染真实 `scans`。
   - 「冻结溯源码」按钮改调 `freezeCode(code)`，成功后 `reload`；已冻结码显示「解冻」按钮调 `unfreezeCode`。真实写操作（不再是「待接入」toast）。
   - loading/error 态复用其他屏既定模式。
   - 保持无障碍（按钮 aria-label、告警列表语义）。

3. **公开溯源页** `TraceabilityPage.tsx`：处理新的「已冻结」响应——扫到被冻结的码时，展示「该溯源码已被冻结，疑似异常」提示页而非正常溯源信息，复用现有 404/降级页样式。

4. **不改的**：地图仍是 SVG 装饰（地理精度排后续）。

---

## 5. 测试策略

沿用项目既定体系：后端 Vitest（单元 mock Prisma + e2e 打真实 PG `nongchang-postgis`），web Vitest + Testing Library。每任务交付测试必须绿。

**后端单元**（mock Prisma）：
- `AntiFakeService.listScans` — 作用域 where 正确注入（merchant/agent/sysadmin 三态）、分页倒序。
- `AntiFakeService.listAlerts` — 检测规则：构造数据验证「不同 IP 数 ≥ N 且次数 ≥ M」才命中；边界（恰好等于阈值、单 IP 高频不告警、多 IP 低频不告警）。
- `freeze/unfreeze` — 作用域内成功改 status；越权抛 ForbiddenException（fail-closed 必测）。

**后端 e2e**（真实 PG，复用 seed + `overrideProvider`）：
- 公开扫码 `GET /api/public/trace/:code` 落一条 `TraceScan`，且 `scanCount` 仍自增。
- 扫已 `frozen` 码 → 返回冻结提示而非正常溯源数据。
- 受保护端点租户隔离：A 租户用户看不到 B 租户 scans/alerts，冻结 B 租户码被拒。
- 落明细失败不阻断溯源响应（best-effort）。

**web 单元**：
- `anti-fake.ts` 客户端：正确 URL/method、freeze/unfreeze 调用。
- `AntiFakeMonitor` 组件：渲染真实 alerts/scans、冻结按钮触发 `freezeCode` 并 reload、已冻结码显示解冻按钮、轮询 interval 卸载时清理。

**回归保护**：全量后端测试（现 43/43）+ web 全量（现 16/16）不回归。

**验证关卡**（沿用子项目 4）：shared/backend/web 三处构建全绿 + lint 干净 + 上述测试全绿，作为最终任务。
