# 商户管理与代理商管理功能完善 — 设计文档

日期:2026-06-15
状态:已确认设计,待评审

## 背景与目标

农场 SaaS 平台的组织结构为三层:`system_admin → agent_admin（代理商) → merchant（商户/农户)`。当前后台的两块管理功能存在明显缺口:

- **商户管理**:存在两个屏(`AgentPlatform.tsx`「辖区内入驻商家管理」、`MerchantManagement.tsx`「商户管理与档案」),渲染同一份 `listMerchants` 数据,只是列不同。两屏均只展示真实的姓名+账号,其余字段(电话/地块数/面积/状态/入驻时间)全部写死;所有操作按钮(邀请/审批/挂起/注销/编辑)均为假 toast。
- **代理商管理**:根本没有界面。`api/agents.ts` 中已有 `listAgents`/`createAgent` 客户端,但无任何 UI 调用;后端 `/agents` 端点存在但缺更新/状态变更能力。

**目标**:把两块管理功能做实——商户管理合并为一屏,补真实字段展示 + 新增 + 编辑 + 启用/停用;新建代理商管理屏,支持列表 + 新增 + 编辑 + 启用/停用。顺带做掉硬化项 #71(商户创建写死 `password123`)。

## 范围

**做**:
- 商户管理:合并为单屏(保留 `MerchantManagement.tsx`,从导航移除 `AgentPlatform`);真实字段展示(含聚合:地块数、确权面积合计);新增商户(后端生成随机初始密码并一次性返回);编辑资料(displayName/phone);启用/停用。
- 代理商管理:新建 `AgentManagement.tsx`(仅 system_admin 可见);列表(含聚合:下辖商户数);新增(name/region);编辑(name/region);启用/停用。
- 硬化 #71:商户创建不再写死 `password123`,后端随机生成并 bcrypt 入库,响应一次性返回明文初始密码。

**不做(留后)**:
- #25 用户名改租户内唯一(基础 schema 决策,独立处理)。
- #26 登录校验 status=active:仅当"停用商户后登录被拒"的 e2e 用例需要时顺带补;否则保持独立记录。
- 商户审核流(pending/rejected)已由子系统 G 的 PendingUsers 屏单独管理,本屏只管 active/suspended 两态,不重叠。
- MerchantAdmin.tsx(批次/赋码屏,与商户管理无关)不在本范围。

## 状态约定

`status` 在本两屏统一用 `'active' | 'suspended'` 两态(与现有 DB 默认 `active` 一致)。审核流的 `pending`/`rejected` 由 PendingUsers 屏负责,本屏列表默认展示非 pending 用户,以 active/suspended 为操作对象。

## 设计一:后端

### User 模块(`packages/backend/src/modules/user/`)

- `UserService` 注入 `ScopeService`,把现有手写 `scopedWhere` 替换为 ScopeService 调用(顺带收口 #27 同类手写范围)。
- 新增方法:
  - `update(actor, id, dto)`:先 `findFirst({ scopedWhere, id })` 确认归属(不在范围抛 `ForbiddenException`),再改 `displayName`/`phone`。
  - `setStatus(actor, id, status)`:同样先校验归属,改 `status`(active|suspended)。
- `list(actor)` 改为返回聚合:用 Prisma `_count` 带出每个商户的 `fields`(地块数);确权面积 `totalArea` 为该商户名下 `field.area` 求和(service 内按 ownerId 聚合,例如对查得的商户集合用一次 `field.groupBy({ by: ['ownerId'], _sum: { area }, _count })`,再合并进列表行)。
- `create`:去掉 `password123` 硬编码(#71)。后端用 `crypto.randomBytes` 生成随机初始密码(如 10~12 位),bcrypt 入库,并在响应里**一次性**返回明文初始密码 `initialPassword` 供管理员转交。
- 端点(`user.controller.ts`):新增 `PATCH /users/:id`、`POST /users/:id/status`,均 `@Roles(SYSTEM_ADMIN, AGENT_ADMIN)`,body 经对应 zod schema 校验。

### Agent 模块(`packages/backend/src/modules/agent/`)

- `AgentService` 真正使用注入的 `ScopeService`(目前 `create` 未用)。
- 新增 `update(actor, id, dto)`、`setStatus(actor, id, status)`,均 tenant 内校验(先 `findFirst({ tenantId, id })` 不存在抛 Forbidden/NotFound)。
- `list(actor)` 带 `_count.users`(下辖商户数)映射为 `merchantCount`。
- 端点:新增 `PATCH /agents/:id`、`POST /agents/:id/status`,均 `@Roles(SYSTEM_ADMIN)`(代理商仅系统管理员管)。

所有新方法走 ScopeService fail-closed,创建/更新均盖 `tenantId`。

## 设计二:Shared DTO 契约

`packages/shared/src/dto/` 新增/扩展(全部 zod schema + 推导类型,面向用户文案中文):

### User 相关
- `updateUserSchema`:`displayName`(2-64 可选)、`phone`(≤20 可选,可清空)。→ `UpdateUserDto`
- `setUserStatusSchema`:`status: 'active' | 'suspended'`。→ `SetUserStatusInput`
- `merchantListItemSchema`(列表行视图):`id`、`username`、`displayName`、`phone`(nullable)、`status`、`agentId`(nullable)、`createdAt`、`fieldCount`(number)、`totalArea`(number,确权面积合计)。→ `MerchantListItem`
- `createUserResponseSchema`:在现有创建响应字段基础上加 `initialPassword`(string,后端生成的一次性明文初始密码)。→ `CreateUserResponse`

### Agent 相关
- `updateAgentSchema`:`name`(1-128 可选)、`region`(≤64 可选)。→ `UpdateAgentDto`
- `setAgentStatusSchema`:`status: 'active' | 'suspended'`。→ `SetAgentStatusInput`
- `agentListItemSchema`(列表行视图):`id`、`name`、`region`、`status`、`createdAt`、`merchantCount`(number,下辖商户数)。→ `AgentListItem`

## 设计三:Web 前端

### 合并商户屏(保留 `MerchantManagement.tsx`,从导航移除 `AgentPlatform`)
- 数据源切到 `listMerchants()` → `GET /users`(返回 `MerchantListItem[]`,只取 role=merchant 且非 pending)。
- 列:商户编号、企业名称、联系人/电话、地块数、确权面积(亩)、状态、入驻时间、操作。
- 操作列:编辑(弹窗改 displayName/phone)、启用/停用(切 status,带确认)。
- 新增商户弹窗:成功后用一次性 `initialPassword` 弹出提示("初始密码:xxx,请转交商户并提醒尽快修改")。
- 状态筛选按钮接真实过滤(active/suspended)。

### 新建代理商屏(`AgentManagement.tsx`,挂到 system_admin 导航新 tab「代理商管理」)
- 数据源 `listAgents()` → `GET /agents`(返回 `AgentListItem[]`)。
- 列:代理商名称、辖区、下辖商户数、状态、创建时间、操作。
- 新增代理商弹窗(name/region)、编辑弹窗(name/region)、启用/停用。

### API 客户端
- `api/users.ts`:`listMerchants` 改指 `/users` 返回 `MerchantListItem[]`;新增 `updateUser`、`setUserStatus`;`createUser` 响应类型加 `initialPassword`。
- `api/agents.ts`:`listAgents` 返回 `AgentListItem[]`;新增 `updateAgent`、`setAgentStatus`。

`App.tsx`:移除 `AgentPlatform` tab,新增「代理商管理」tab(仅 system_admin)。

## 设计四:测试与验证

### 后端(TDD)
- `UserService` 单元:`update`/`setStatus` 归属校验(范围内成功、跨范围抛 Forbidden)、`list` 聚合返回 fieldCount/totalArea、`create` 不再写死密码且返回 initialPassword。
- `AgentService` 单元:`update`/`setStatus` tenant 校验、`list` 返回 merchantCount。
- e2e(真实 PG):
  - 商户:create→拿到 initialPassword、PATCH 改资料、跨 owner/跨 agent 越权 PATCH/状态返回 403。
  - 代理商:仅 system_admin 可 create/update/status,agent_admin 调用 403。

### Web
- `api/users.ts`、`api/agents.ts` 客户端单测(新增函数的 URL/method/body)。
- 组件测试按现有模式覆盖列表渲染 + 操作触发(若现有组件无测试则不强加)。

### 全量验证
shared build → backend 全量测试 → web vitest + build → miniapp 不受影响。

### 附带处理的硬化项
- #71(password123):本设计直接做掉。
- #26(登录校验 status):若"停用商户后登录被拒"用例需要会顺带补,否则留记录。
- #25(用户名租户内唯一):不在本范围。
