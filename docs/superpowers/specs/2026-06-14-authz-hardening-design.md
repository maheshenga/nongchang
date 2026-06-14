# 租户内授权硬化设计(#23 / #24 / #27)

> 子项目:SaaS 核心后端安全硬化(子项目1 遗留项的第一批)
> 日期:2026-06-14
> 分支:`feat/authz-hardening`(从 main 切出)

## 背景与动机

子项目1 合并时记录了一批非阻塞安全硬化项。经代码核查,以下三处为**真实的租户内权限提升 / fail-open 授权漏洞**,且零测试覆盖,优先修复:

- **#23** — `batch.service.ts:13`、`field.service.ts:14` 的 create 直接信任 `dto.ownerId`,merchant 可把数据挂到任意他人名下。
- **#24** — `trace.service.ts`(addEvent/generateCode/listEvents)、`farm-record.service.ts` create 不校验目标 `batchId`/`fieldId` 归属,只盖 `tenantId`;任意合法 UUID 即可跨 owner 读写。
- **#27** — `user.service.ts:27-32` list、`agent.service.ts:18-22` listMerchants 用 `if (role===AGENT_ADMIN && user.agentId)` 短路,agentId 为 null 时 where 退化为只剩 `{ tenantId }`,**返回全租户数据**(fail-open)。

**Why**:这是多租户分销平台,授权必须 fail-closed。当前 ScopeService 本身 fail-closed,但上述路径绕过了它(create 信任 DTO、手写 where 短路)。

## 组织模型(授权语义前提)

三层:`system_admin` → `agent_admin`(代理商,管理名下 merchant)→ `merchant`(=农户=用户,合一)。
AuthUser = `{ userId, tenantId, role, agentId, ownerId }`。

## 架构:核心新增(ScopeService)

在 `src/common/scope/scope.service.ts` 增加两个 fail-closed 断言助手,作为本次硬化的统一基础:

### assertInScope —— 校验某实体在调用方作用域内
```ts
async assertInScope(
  prisma: PrismaService,
  user: AuthUser,
  entity: 'batch' | 'field',
  id: string,
): Promise<void> {
  const scopeWhere = await this.ownedScopeWhere(prisma, user); // 缺归属即抛 Forbidden
  const found = await (prisma as any)[entity].findFirst({
    where: { id, ...(scopeWhere as object) },
    select: { id: true },
  });
  if (!found) throw new ForbiddenException(`${entity} 不在可操作范围内`);
}
```
- 复用 `ownedScopeWhere` 既有 fail-closed 语义(merchant 缺 ownerId、agent 缺 agentId → 抛错)。
- 与 5-2 supply 的 `scopedSupply` 同思路;supply 暂保留其局部实现,不强制重构(控制改动面)。

### assertOwnerInScope —— 校验目标 ownerId(merchant)在调用方作用域内
```ts
async assertOwnerInScope(
  prisma: PrismaService,
  user: AuthUser,
  ownerId: string,
): Promise<void> {
  const scopeWhere = await this.ownedScopeWhere(prisma, user);
  // scopeWhere: merchant={tenantId,ownerId:self}、agent={tenantId,ownerId:{in:[名下]}}、sysadmin={tenantId}
  // 目标 owner 是 role=merchant 的 User;ownerId 维度恰好对应 User.id,故把它作为附加 id 约束反查。
  const { ownerId: ownerConstraint, ...rest } = scopeWhere; // rest 仅含 tenantId
  const found = await prisma.user.findFirst({
    where: {
      AND: [
        { id: ownerId, role: Role.MERCHANT, ...(rest as object) },
        ownerConstraint !== undefined ? { id: ownerConstraint as any } : {},
      ],
    },
    select: { id: true },
  });
  if (!found) throw new ForbiddenException('目标商家不在可管理范围内');
}
```
> 映射已按 User schema 核对定稿:`ownedScopeWhere` 的 `ownerId` 维度即 `User.id`(agent 的 `{in: ids}` 由 `merchantIdsForAgent` 按 `agentId` 反查得到,已含 agent 约束)。用 `AND` 数组避免 `id` 键冲突:第一项锁定目标本身(id+role+tenantId),第二项叠加范围约束(merchant=self 字符串、agent=`{in:[...]}`、sysadmin 无此键即跳过)。

## 各漏洞修复方案

### #23 create ownerId 语义(方案 B)
`batch.service.ts` create、`field.service.ts` create 改为:
```
- merchant:    强制 ownerId = user.ownerId(忽略 dto.ownerId,最安全,无需 assert)
- agent_admin: 采纳 dto.ownerId,先 await scope.assertOwnerInScope(prisma, user, dto.ownerId)
- system_admin:采纳 dto.ownerId,assertOwnerInScope 仅校验属本租户的 merchant
```
- DTO 保留 `ownerId` 字段(不破坏 web 契约),仅 service 层对 merchant 强制覆盖。

### #24 操作目标归属校验(用 assertInScope)
```
trace.service.ts:
  addEvent(user, dto)      → await scope.assertInScope(prisma, user, 'batch', dto.batchId)
  generateCode(user, ...)  → await scope.assertInScope(prisma, user, 'batch', batchId)
  listEvents(user, batchId)→ await scope.assertInScope(prisma, user, 'batch', batchId)
farm-record.service.ts:
  create(user, dto)        → await scope.assertInScope(prisma, user, 'batch', dto.batchId)
                             await scope.assertInScope(prisma, user, 'field', dto.fieldId)
                             (现有 supply 归属校验 + 配额聚合保留不变)
```
- 任意合法 UUID 但不属作用域 → 403。
- 若 trace 某些方法签名未透传 `user`,顺带从 controller(`@CurrentUser`)透传进来。计划阶段按实际签名核对。

### #27 手写范围 fail-closed(方案 B)
`user.service.ts` list、`agent.service.ts` listMerchants 两处:
```ts
if (role === Role.AGENT_ADMIN) {
  if (!user.agentId) throw new ForbiddenException('代理管理员缺少 agentId,拒绝访问');
  where.agentId = user.agentId;
}
```
- 缺归属即拒,不再静默放开。
- 备注:未来 agent 维度范围复用增多时,再抽象到 ScopeService。

## 测试策略(TDD,真实 PG)

**单元**:
- `scope.service.spec`:assertInScope / assertOwnerInScope 命中与越权(缺归属抛错、跨范围 403)。
- batch / field service:merchant 强制 self;agent 指定他人 owner → 403;sysadmin 指定本租户 owner 通过。
- trace / farm-record service:目标 batch/field 不在范围 → 403;在范围 → 通过。
- user / agent service:agent_admin + agentId=null → 403;有 agentId → 仅名下。

**e2e**(`isolation.e2e-spec.ts` 增补):
- merchantB 用 merchantA 的 batchId 建 farm-record → 403。
- merchant 传他人 ownerId 建 batch → ownerId 被强制 self(或越权时 403)。
- (如种子支持)agent_admin agentId=null → 403。

**基线**:当前 backend 73 测试全绿。本次预计净增约 12–16 个。三处构建(shared/backend/web)须保持绿。

## 文件结构

| 文件 | 职责 |
|---|---|
| `src/common/scope/scope.service.ts` | 新增 assertInScope / assertOwnerInScope |
| `src/common/scope/scope.service.spec.ts` | 助手单元测试 |
| `src/modules/batch/batch.service.ts` (+spec) | #23 ownerId 语义 |
| `src/modules/field/field.service.ts` (+spec) | #23 ownerId 语义 |
| `src/modules/trace/trace.service.ts` (+spec) | #24 batch 归属校验 + 透传 user |
| `src/modules/farm-record/farm-record.service.ts` (+spec) | #24 batch/field 归属校验 |
| `src/modules/user/user.service.ts` (+spec) | #27 fail-closed |
| `src/modules/agent/agent.service.ts` (+spec) | #27 fail-closed |
| `test/isolation.e2e-spec.ts` | 越权 e2e 场景 |

## 执行工作流

中等规模、跨多 service 的授权改动 → subagent-driven 逐任务两阶段评审(spec 合规 + 代码质量),分支 `feat/authz-hardening`。全程 git 用内联 `-c user.name='nongchang' -c user.email='noreply@local'`,不用 git config,不用 --no-verify。

## 非目标(本次不做)

- #25 用户名租户内唯一(schema 决策)、#26 登录校验 status、#22 refresh 吊销、#20 FK、#71 password123、#83 防伪 IP —— 记入 backlog,后续批次。
- supply `scopedSupply` 重构进 assertInScope —— 暂不强制。
