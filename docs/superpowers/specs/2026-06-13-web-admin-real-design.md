# 子项目 4 设计:Web 后台真实化(de-mock)

> 状态:设计已对齐,待用户复审
> 日期:2026-06-13
> 分支:feat/saas-core-backend
> 关联:子项目 1(SaaS Core 后端)、2(溯源闭环)、3(农户小程序)已完成

## 1. 背景、范围与架构

`packages/web`(React 19 + Vite + Tailwind)目前几乎全是 mock 数据:登录不发网络
(`AppLogin` 直接 `onLogin(role)`)、无 JWT、角色靠前端演示下拉切换、各管理屏由
硬编码数组驱动,并用 `localStorage['system_batches']` 作为一条跨组件"假数据总线"。
唯一已真实化的是消费者溯源页 `TraceabilityPage.tsx`(子项目 2)。

**目标**:把后台从 mock 真实化到后端 API。本期只做 **Tier 1**(有后端端点支撑的屏)。
后端零改动 —— 纯前端,消费子项目 1/2/3 已上线的端点。

### Tier 1(本期真实化)
登录、批次(BatchAdmin)、地块(FarmFields)、农事记录(FarmRecords)、
代理商(SystemAdmin / AgentPlatform 的代理与商家列表)、商家/用户
(MerchantManagement)、二维码生成、溯源事件。

### Tier 2(本期保留 mock + "演示数据"徽标)
Dashboard 分析图表、物流(LogisticsTracker)、仓储/RFID、服务器监控、防伪 feed、
AI 识别、地图(D3GeoMap / HeatmapD3)。这些**无后端端点**,需要全新后端模块
(分析聚合、物流、仓储、AI),属新功能而非去 mock,留作后续独立子项目。

### 范围决策汇总(brainstorming 结论)

| 维度 | 决策 |
| --- | --- |
| 本期范围 | 仅 Tier 1 真实化;Tier 2 保留 mock + 徽标 |
| 登录与角色 | 真实 JWT 登录,角色从 token 解析,移除演示角色切换下拉 |
| Token 存储 | localStorage 双 token + 401 自动刷新重试一次,refresh 失败才跳登录 |
| 数据访问 | 手写轻量 authed fetch 封装 + useEffect/useState(可选 useApi hook),零新依赖 |
| 读写深度 | 读+写都真实到 POST 创建;移除 localStorage 假总线;编辑/删除后端无端点,不做 |
| Tier 2 处理 | 保留可见,顶部加"演示数据 / 待接入"徽标 |

### 架构(数据流)

```
AppLogin → POST /api/auth/login → 存 TokenPair(localStorage)
                                  → 从 access token 解出 role → 渲染对应导航
Tier1 屏 → useEffect → api/<域>.ts → request.ts(注入 Bearer)
                                    → 401 → 自动用 refresh 换新 token 重试一次
                                          → refresh 也失败 → 清 token 跳登录
         → GET 列表渲染 / POST 创建后重取(reload)
```

**关键边界:**
- 角色来自 JWT(移除演示角色切换下拉);测不同角色用不同种子账号
  (sysadmin / agentA / merchantA,密码均 password123)登录。
- 编辑/删除后端无端点,本期只到 GET 列表 + POST 创建。
- Vite dev proxy 已把 `/api` → `localhost:3001`,真实调用直接打 `/api/*`。

## 2. 鉴权与数据访问层(文件结构)

新建/改动 `packages/web/src` 下:

```
src/
  api/
    request.ts      统一 authed fetch:注入 Bearer、401 自动刷新重试一次、统一抛错
    auth.ts         login(username,password) / refresh() / logout()
    batches.ts      listBatches() / createBatch(dto)
    fields.ts       listFields() / createField(dto)
    farm-records.ts listFarmRecords() / createFarmRecord(dto)
    agents.ts       listAgents() / createAgent(dto) / listMerchants()
    users.ts        listUsers() / createUser(dto)
    trace.ts        (已有 fetchPublicTrace) + generateCode(batchId) /
                    listEvents(batchId) / createEvent(dto)
    uploads.ts      uploadImage(file)  (web 用 FormData + fetch)
  auth/
    token-store.ts    getTokens/setTokens/clearTokens(localStorage 双 token)
    decode-token.ts   解 JWT payload 取 role/tenantId/agentId/ownerId(不验签,仅读)
    auth-context.tsx  React Context:当前 AuthUser、login/logout、isAuthenticated;
                      App 顶层 Provider
  hooks/
    useApi.ts       收敛 GET 取数样板:{ data, loading, error, reload }
```

**职责边界:**
- `request.ts` 是唯一碰 fetch + token 的地方;域 API 文件只描述端点 + 类型
  (import `@nongchang/shared` DTO),不重复鉴权逻辑。
- `token-store.ts` 唯一碰 localStorage token;`decode-token.ts` 纯函数解码;
  `auth-context.tsx` 把这些组合成 React 层会话状态。
- `useApi.ts` 让各屏少写 loading/error 样板:
  `const { data, loading, error, reload } = useApi(listBatches)`。
- 写操作(create)由组件直接 `await createX(dto)` 后调 `reload()` 重取,不进 useApi。

**401 自动刷新**:`request.ts` 收到 401 → 调 refresh 端点换新 access → 重试原请求
一次;refresh 也 401 → `clearTokens()` + 通知 auth-context 登出跳登录页。用一个
模块级 `refreshing` Promise 防并发请求各自刷新(多个 401 共享同一次刷新)。

## 3. Tier 1 各屏改造

统一模式:`useApi(listX)` 取真实数据 → 渲染列表 → 表单 `await createX(dto)` 后
`reload()`。移除 mock 数组与 `localStorage['system_batches']` 假总线。

- **登录 `AppLogin.tsx`** — 表单真调 `auth.login(username,password)`,成功存 token、
  auth-context 置登录、按 token 内 role 渲染导航。移除"快速访问"角色按钮与
  App.tsx 的角色切换下拉。注册 tab(无后端自助注册端点)隐藏或标注待接入。
- **批次 `BatchAdmin.tsx`** — `MOCK_BATCH_DATA`→`listBatches()`;新增→`createBatch(dto)`;
  二维码生成→`trace.generateCode(batchId)`。移除 localStorage 写入与
  `batches-updated` 事件派发。
- **地块 `FarmFields.tsx`** — `INITIAL_FIELDS`→`listFields()`;新增→`createField(dto)`。
  IoT 实时字段(无后端)保留静态展示或标注。
- **农事 `FarmRecords.tsx`** — `INITIAL_TASKS`→`listFarmRecords()`;
  新增→`createFarmRecord(dto)`(source 用 `web`);移除读 localStorage。
  `QUICK_TEMPLATES` 保留为前端便捷模板(纯 UI)。
- **代理商 `SystemAdmin.tsx` / `AgentPlatform.tsx`** — `MOCK_AGENTS`→`listAgents()`、
  `SUB_MERCHANTS`→`listMerchants()`;新增代理→`createAgent(dto)`。服务器监控/审批
  角标属 Tier 2,保留 mock + 徽标。
- **商家/用户 `MerchantManagement.tsx`** — `MOCK_MERCHANTS`→`listMerchants()`;
  新增商家→`createUser(dto)`(role=merchant)。
- **芍药档案 `MerchantAdmin.tsx`** — `MOCK_CROPS`→`listBatches()`(crops 即 batch
  形态);移除 localStorage 读。
- **溯源事件**(若后台某屏展示)→ `trace.listEvents(batchId)` / `createEvent(dto)`。

**Tier 2 屏**(Dashboard / Logistics / RFID / AntiFake / 服务器监控 / AI / 地图):
顶部加统一"演示数据 / 待接入"徽标组件,数据不动。

**角色可见性**:导航按 token 内 role 渲染(沿用现有 SYSTEM_ADMIN_NAV /
AGENT_ADMIN_NAV / MERCHANT_ADMIN_NAV 三套),但 role 来源改为 JWT 而非本地 state。
受 @Roles 保护的端点若返回 403,屏上友好提示(不是所有角色都能看所有屏)。

## 4. 错误处理与测试策略

**错误处理:**
- **401(未授权/过期)**:`request.ts` 自动用 refresh 换新 access 重试一次;refresh
  也失败 → 清 token + auth-context 登出 → 跳登录页。并发 401 共享同一次刷新。
- **403(角色无权)**:屏上友好提示"当前角色无权访问",不崩页。
- **网络/5xx**:`useApi` 暴露 `error`,各屏渲染错误态 + 重试按钮(调 `reload()`)。
- **表单提交(POST)失败**:捕获后 toast/inline 错误(展示后端 zod 校验 message),
  不清空已填表单。
- **加载态**:`useApi` 的 `loading` 驱动骨架/spinner。

**测试策略:**
- **纯函数单测(Vitest)**:`decode-token.ts`(解 JWT payload 取 role)、
  `token-store.ts`(存取清)、`request.ts` 的 401 刷新重试逻辑(mock fetch:
  首请求 401 → 刷新成功 → 重试成功;刷新也 401 → 抛错触发登出)。这些是真实化的
  核心风险点,值得测。需在 web 包引入 Vitest(后端已用,模式可复用)。
- **不引入 web 端 E2E / 组件测试栈**(与现有 web 一致)。屏级正确性靠:
  ① 后端契约已由后端测试保证;② 共用 `@nongchang/shared` DTO 类型保证前后端结构
  一致;③ 手动联调(本机后端 + 已 seed)。
- **构建保证**:`pnpm build`(shared+backend)+ web 的 `tsc` / `vite build` 通过,
  TypeScript 全绿即证明 DTO 契约对齐。

**验收标准:**
1. web `vite build` / `tsc` 通过,后端测试不回归(43/43)。
2. 手动:用 sysadmin / agentA / merchantA(密码 password123)分别登录,导航按真实
   role 渲染;Tier 1 各屏显示真实数据(与后端 seed 一致);新增批次/地块/农事/
   代理商/商家走真实 POST 后列表刷新可见;二维码生成调真实端点。
3. `localStorage['system_batches']` 假总线及相关 mock 数组已从 Tier 1 屏移除。
4. Tier 2 屏带"演示数据 / 待接入"徽标,数据保留但明确标注。
5. 刷新页面不掉登录(token 持久化);access 过期能自动续期;refresh 失效跳登录。
6. web 端新增的纯函数单测(decode-token / token-store / request 刷新逻辑)全绿。

**留作后续(明确不做)**:
- Tier 2 真实化(分析聚合、物流、仓储、RFID、AI、地图——各自独立子项目)。
- 编辑/删除端点(后端无 PATCH/DELETE)。
- 自助注册端点(仅 admin 受限 `POST /users`)。
- 子项目 1 遗留硬化项 #20/#22-28(触及时处理,尤其 #26 登录 status 校验、
  #25 用户名租户内唯一)。
