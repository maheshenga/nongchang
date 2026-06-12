# 芍药溯源农事系统重构 — 子项目 1:后端地基(SaaS Core)设计

> 日期:2026-06-13
> 状态:已确认,待用户复核
> 范围:整体平台重构的第一个子项目(共 5 个),交付多租户 SaaS 后端地基。

## 1. 背景与整体重构目标

现有 `nongchang`(AgriTrace SaaS)是从 Google AI Studio 导出的前端原型:React 19 + Vite + Tailwind,
配一个 Express(`server.ts`)调用 Gemini AI。核心业务数据(批次、扫码、物流、商户)全部是前端
Mock 或随机生成,无真实数据库,登录为前端 `setIsAuthenticated` 假认证,无权限隔离。

本次为**完整平台级重构**,目标是建成:真实多租户 SaaS 后端 + 多端统一小程序(消费者扫码溯源 +
农户农事录入)+ Web 后台真实化。

### 全局技术决策

| 维度 | 决策 |
|------|------|
| 后端 | NestJS (TypeScript) |
| 数据库 | PostgreSQL + 共享库 `tenant_id` 行级隔离 |
| ORM | Prisma |
| Web 前端 | 沿用 React 19 + Vite + Tailwind(重构而非重写) |
| 小程序 | Taro + React + TS(多端:微信/支付宝/H5) |
| 认证 | 自建 JWT(Web 账号密码 + 小程序农户微信授权登录 + 消费者免登录) |
| DTO 校验 | zod(类型 + 运行时校验一体) |
| 仓库结构 | pnpm workspace Monorepo |
| 部署 | 宝塔服务器(Nginx + PM2 + 面板 PostgreSQL,无 Docker) |

### 平台子项目拆分(5 阶段)

1. **后端地基(SaaS Core)** — 本文档。所有端的依赖根基。
2. **溯源闭环** — 二维码/批次生成 → 溯源 API → 消费者扫码页 + Web 溯源页。
3. **农户小程序** — Taro 农户端:微信登录、农事记录(拍照/语音)、扫码巡检、病害识别。
4. **Web 后台真实化** — 现有 React 组件从 Mock 切真实 API + 组件拆分瘦身。
5. **实时与 AI 子系统** — IoT/防伪/RFID/物流(WebSocket)+ Gemini AI 接口修正与真实化。

每个子项目独立走 设计 → 计划 → 实现 闭环。

## 2. 组织层级与角色模型

三层组织结构:

```
总系统管理员 (system_admin)
   └── 代理商 (agent_admin)        # 有独立后台,管理自己发展的农户
          └── 商家=农户=用户 (merchant)   # 三者合一:既是种植农户,也是被管理的商家
```

- 代理商**单级**(无多级嵌套)。
- 一个用户即一个商家;农户与商家是同一实体。
- 角色用 `users.role` 单字段枚举表达(无独立 roles / user_roles 关联表)。
- 代理商(`agents`)是组织记录;`role=agent_admin` 且 `agent_id` 指向该代理商的 user 是其登录账号。

### 数据隔离规则

| 角色 | 可见数据范围 |
|------|--------------|
| system_admin | 整个租户(`tenant_id` 匹配) |
| agent_admin | `tenant_id` + `agent_id` = 自己代理商的数据(旗下所有商家及其地块/批次/农事/溯源) |
| merchant | `tenant_id` + `owner_id` = 自己的数据 |

## 3. 数据模型(Prisma / PostgreSQL)

所有业务表带 `tenant_id` 做行级隔离。

### 租户与组织
- `tenants` — `id, name, status, created_at`
- `agents`(代理商,组织记录)— `id, tenant_id, name, region, status`(无 parent_id)

### 用户与权限
- `users`(用户=商家=农户)— `id, tenant_id, role(system_admin|agent_admin|merchant),
  agent_id(归属代理商;merchant 与 agent_admin 必填,system_admin 可空),
  username, password_hash(bcrypt), phone, wx_openid(可空,小程序农户绑定),
  display_name, status, created_at`

### 生产与溯源核心
- `fields`(地块)— `id, tenant_id, owner_id, name, area, location(PostGIS geography),
  iot_device_id(可空)`
- `batches`(批次)— `id, tenant_id, owner_id, field_id, batch_no, crop_name, plant_date,
  expected_harvest, status(Planting|Growing|Harvested|Distributed)`
- `farm_records`(农事记录)— `id, tenant_id, batch_id, field_id, operator_id, action,
  detail(JSONB), images(JSONB 数组), location, recorded_at, source(web|miniapp|voice)`
- `trace_codes`(溯源码)— `id, tenant_id, batch_id, code(唯一), created_at, scan_count`
- `trace_events`(溯源链路事件)— `id, tenant_id, batch_id,
  type(origin|farm|harvest|warehouse|logistics|retail), title, actor, location,
  occurred_at, payload(JSONB)`

### 设计说明与取舍
- `farm_records.detail` / `trace_events.payload` 用 JSONB 承载不定结构数据(语音转写、图片、传感器读数),契合 PG。
- 地块用 PostGIS `geography`,为子项目 5 的地理围栏/防伪定位铺路。Prisma 以 `Unsupported` 类型 + 原生 SQL 处理地理字段。
- 子项目 1 只**建表 + 基础 CRUD**;溯源扫码展示逻辑留子项目 2;IoT 时序表 `iot_readings` 留子项目 5。
- `owner_id` 指向 `users` 表中 role=merchant 的用户(原型里叫 merchant_id,改名以贴合"用户=商家"语义)。


## 4. 认证与权限实现

### 认证流程(自建 JWT)

三种登录入口,统一签发 JWT:
1. **Web 后台(三角色)** — 账号密码 → 校验 bcrypt `password_hash` → 签发 access token(~2h)
   + refresh token(~7d)。
2. **小程序农户** — 微信授权 code → 后端换 openid → 按 `wx_openid` 匹配/绑定 users → 签发同款 JWT。
   (本子项目仅预留接口,完整联调在子项目 3)
3. **消费者扫码** — 免登录,溯源接口公开只读(子项目 2 使用)。

JWT payload 携带:`userId, tenantId, role, agentId, ownerId`,使请求无需查库即可获得隔离上下文。

### 多租户 + 权限三层防护(自动化)

1. **租户上下文中间件** — 从 JWT 解出 `tenantId` 注入请求上下文(nestjs-cls / AsyncLocalStorage),
   后续查询自动带租户。
2. **RolesGuard + `@Roles()` 装饰器** — 控制器方法标注允许角色,如 `@Roles('system_admin','agent_admin')`。
3. **数据范围过滤(核心)** — `ScopeService` / 查询拦截器统一在**服务/仓储层**按 role 自动追加
   where 条件(见第 2 节隔离规则表)。不散落在 controller,新增模块自动生效,避免漏写导致越权。

## 5. Monorepo 工程结构

```
nongchang/                      # pnpm workspace 根
├── pnpm-workspace.yaml
├── package.json                # 根:统一脚本、共享 devDeps
├── packages/
│   ├── shared/                 # @nongchang/shared — 全端共享类型与 DTO
│   │   └── src/{types,dto(zod),enums}/
│   ├── backend/                # @nongchang/backend — NestJS,本子项目主体
│   │   ├── prisma/{schema.prisma, migrations/}
│   │   └── src/
│   │       ├── common/{guards,decorators,scope}/   # JwtAuthGuard/RolesGuard/@CurrentUser/ScopeService
│   │       ├── modules/{auth,tenant,user,agent,field,batch,farm-record,trace}/
│   │       ├── prisma.service.ts
│   │       ├── app.module.ts
│   │       └── main.ts
│   ├── web/                    # 现有 React 迁入(本子项目不改逻辑,仅改 import 路径)
│   └── miniapp/                # Taro 占位(子项目 3 填充)
```

- **backend 是本子项目唯一实现主体**;web 仅物理迁入,import 改为 `@nongchang/shared`,逻辑与 Mock 不动。
- **shared** 承载所有实体类型 + zod DTO(类型从 schema 推导,一处定义,全端编译期一致)。
- 每个 Nest module 自带 controller/service/dto,边界清晰、单文件聚焦。
- 旧根目录 `server.ts`(Express+Gemini)由 backend 取代;`fix.cjs/replace.cjs` 评估后清理。

## 6. 部署(宝塔,无 Docker)

- **PostgreSQL**:宝塔软件商店安装,建库建用户。
- **后端**:`pnpm --filter backend build` → dist,宝塔 **PM2 管理器**守护 Node 进程(端口 3001)。
- **Web**:`pnpm --filter web build` → 静态文件,宝塔 **Nginx** 站点托管。
- **Nginx 反代**:`/api` → PM2 Node 进程;其余 → Web 静态资源。
- **环境变量**(`.env` + 同步 `.env.example`):`DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET,
  WX_APPID, WX_SECRET, GEMINI_API_KEY`。
- **迁移**:部署脚本执行 `prisma migrate deploy`。

## 7. 测试策略

- **单元测试(Vitest)**:ScopeService 数据范围过滤、JWT 签发/校验、密码哈希(安全核心,必测)。
- **集成测试**:真实测试 PG 库(Testcontainers 或本地库),验证多租户隔离——**不 mock 数据库**
  (mock 会使隔离验证失去意义)。
- **e2e(Supertest)**:auth 登录流、各模块 CRUD 权限边界(403/越权拦截)。
- **测试夹具**:种子数据含 2 个代理商 + 各自旗下商家,专门验证横向越权被拦截。

## 8. 子项目 1 交付范围

### 包含
- Monorepo 骨架 + shared 包基础类型/DTO。
- Prisma schema + 迁移 + 种子数据。
- JWT 认证(Web 密码登录 + refresh;微信换 openid 接口预留)。
- 多租户上下文 + RolesGuard + ScopeService 数据范围过滤。
- 各核心实体基础 CRUD(user/agent/field/batch/farm-record/trace 建表级)。
- 宝塔部署脚本 + 测试套件。

### 不包含(留后续子项目)
- 溯源扫码展示完整逻辑(子项目 2)。
- 小程序端(子项目 3)、Web 真实化(子项目 4)。
- IoT 实时/WebSocket/AI 修正/物流防伪(子项目 5)。
- 微信登录完整联调(子项目 3)。

## 9. 已知风险与注意

- 现有 `server.ts` 用了不存在的模型名 `gemini-3.5-flash`,AI 真实化(子项目 5)时需修正为有效模型。
- 多租户隔离是 SaaS 最易出安全事故处:务必通过集成测试验证横向越权被拦截后才视为完成。
- PostGIS 在 Prisma 中支持有限,地理字段相关操作以原生 SQL 兜底。
