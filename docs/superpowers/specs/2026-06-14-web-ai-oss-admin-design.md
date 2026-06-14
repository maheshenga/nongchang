# 子系统 B：web 后台 AI 服务商管理 + 系统设置 设计文档

> 日期：2026-06-14　范围：web 后台（React 19 + Vite 6 + Tailwind v4）。依赖子系统 A 已就绪的后端端点。

## 目标

为 web 后台（仅 SYSTEM_ADMIN）增加三块能力：
1. **AI 服务商管理页**：对 `/api/ai-providers` 做 CRUD + 启用切换 + 测试连接。
2. **系统设置页**：管理 `/api/oss-config`（单条 upsert + 测试连接）。
3. **AI 在线试用面板**：配好服务商后，管理员可直接发文本对话 / 上传图片诊断，端到端验证 `/api/ai/chat`、`/api/ai/diagnose`。

## 架构概述

- 纯前端，无新后端改动。复用现有基础设施：`api/request.ts`（自动 `/api` 前缀 + Bearer + 401 刷新）、`hooks/useApi.ts`（`{data,loading,error,reload}`）、`auth/auth-context.tsx`（`useAuth()`）、同文件内受控 Modal 表单模式（参照 `SystemAdmin.tsx` 的 `CreateAgentModal`）。
- 导航：web 用自定义 tab 切换（非 react-router），菜单是 `App.tsx` 内按角色的数组常量。新页面只加进 `SYSTEM_ADMIN_NAV`，天然限 system_admin；后端 `@Roles(SYSTEM_ADMIN)` 为第二道保证。
- 表单校验：**沿用现有「后端校验 + catch 显示 message」模式**，web 不引入 zod 依赖（保持与全站一致、零新依赖）。
- 凭据安全：列表/详情只显示后端返回的脱敏值（`apiKeyMasked` / `accessKeySecretMasked`，形如 `****1234`）。编辑时密钥输入框留空 = 不修改（提交时不传该字段）。前端任何时候都拿不到明文。

## 新建/修改文件

**新建：**
- `packages/web/src/api/ai-provider.ts`：`listAiProviders / createAiProvider / updateAiProvider / deleteAiProvider / testAiProvider`
- `packages/web/src/api/oss-config.ts`：`getOssConfig / upsertOssConfig / testOssConfig`
- `packages/web/src/api/ai.ts`：`aiChat / aiDiagnose`
- `packages/web/src/components/AiProviders.tsx`：服务商列表 + 新增/编辑 Modal + 启用切换 + 删除 + 测试连接 + AI 试用面板
- `packages/web/src/components/SystemSettings.tsx`：OSS 配置表单（get/upsert + 测试连接）

**修改：**
- `packages/web/src/App.tsx`：① `activeTab` 联合类型加 `'aiProviders' | 'systemSettings'`；② 顶部加两个 `lazy(() => import(...))`；③ `SYSTEM_ADMIN_NAV` 的「移动端与系统」分类加两菜单项（图标用 lucide：Sparkles / Settings）；④ 渲染区加两行 `{mountedTabs.has('aiProviders') && <div ...><AiProviders /></div>}` 同款懒挂载。

## API 客户端契约（照 `api/supply.ts` 薄函数风格，类型从 `@nongchang/shared` 导入）

```ts
// ai-provider.ts
listAiProviders(): Promise<AiProviderView[]>                       // GET /ai-providers
createAiProvider(input: CreateAiProviderInput): Promise<AiProviderView>   // POST /ai-providers
updateAiProvider(id, input: UpdateAiProviderInput): Promise<AiProviderView> // PATCH /ai-providers/:id
deleteAiProvider(id): Promise<{ ok: true }>                        // DELETE /ai-providers/:id
testAiProvider(id): Promise<AiTestResponse>                        // POST /ai-providers/:id/test

// oss-config.ts
getOssConfig(): Promise<OssConfigView | null>                      // GET /oss-config
upsertOssConfig(input: OssConfigInput): Promise<OssConfigView>     // PUT /oss-config
testOssConfig(): Promise<AiTestResponse>                           // POST /oss-config/test

// ai.ts
aiChat(message: string): Promise<AiChatResponse>                   // POST /ai/chat  body {message}
aiDiagnose(input: AiDiagnoseInput): Promise<AiDiagnoseResponse>    // POST /ai/diagnose
```

## 页面设计

### AiProviders.tsx
- **列表**：`useApi(listAiProviders)` → 表格列：名称 / baseUrl / textModel / visionModel / apiKeyMasked / enabled(开关) / 操作（编辑/测试/删除）。loading/error/重试照 SystemAdmin 模式。
- **新增/编辑 Modal**（同文件受控组件）：字段 name、baseUrl、apiKey（编辑时 placeholder「留空不修改」）、textModel、visionModel(可选)、enabled。提交 `try/await create|update → onSaved(); catch → setErr(message); finally setSubmitting(false)`；父级 `onSaved` 关闭 Modal + `reload()`。
- **启用切换**：行内开关调 `updateAiProvider(id, { enabled })` 后 reload（后端保证同租户唯一启用）。
- **测试连接**：行内「测试」按钮 → `testAiProvider(id)`，按钮旁显示结果：成功「✓ 连接正常 (123ms)」/失败「✗ <error>」。测试中禁用按钮。
- **AI 试用面板**（页面底部一块卡片）：
  - 对话：输入框 + 发送 → `aiChat(msg)`，展示 `answer`；无启用服务商时后端返回 400，catch 显示「未配置可用的 AI 服务商」。
  - 诊断：图片选择（转 base64）+ 可选备注 + 诊断 → `aiDiagnose({ imageBase64, note })`，展示 `result`；无 visionModel 时显示后端错误。
  - 语音按钮：占位「语音输入即将开放」（与小程序一致，不实现）。

### SystemSettings.tsx
- `useApi(getOssConfig)` 取单条（可能 null）。表单字段：region、bucket、accessKeyId、accessKeySecret（placeholder「留空不修改」，已有配置时显示 `accessKeySecretMasked`）、baseUrl(可选)、enabled。
- 保存 → `upsertOssConfig(input)`（留空的 secret 不传）→ 成功 toast + reload。
- 「测试连接」→ `testOssConfig()` 显示 `{ok, latencyMs}` 或 error。
- 顶部说明：OSS 用于小程序/后台图片上传，未配置时回退环境变量。

## 错误处理与降级

- 所有调用 `try/catch`，错误 message 直接来自后端（`request` 已把非 2xx 抛成带 message 的 Error）。
- AI 试用面板对「无服务商 400」「无 visionModel 400」「调用失败 502」均显示后端中文 message，不崩溃。
- 列表加载失败显示重试按钮（`reload`）。

## 测试策略

- web 测试用 vitest（项目已有）。重点对**新 API 客户端**做单测：mock `request`，断言路径/方法/body 正确（尤其 update 留空 secret 不传、PATCH/PUT/DELETE 方法、encodeURIComponent id）。
- 组件层：若现有有组件测试先例则补关键交互（提交、留空不改密钥、测试连接结果渲染）；若无组件测试先例，则以 API 客户端单测 + 手动联调为主，不强行引入组件测试框架。
- 全量：`pnpm --filter web build`（tsc + vite）通过；`pnpm --filter @nongchang/shared build` 不受影响。

## 安全要点

- 前端永不持有/显示明文密钥；编辑留空=不改。
- 菜单仅 system_admin 可见 + 后端 `@Roles` 双重保证；非授权用户即使手动切 tab，API 也会 403（页面显示错误而非崩溃）。
- 上传图片诊断走 base64 直传 `/ai/diagnose`（后端代理调用 AI，密钥不下发）。

## 非目标（子系统 B 不做）

- 小程序 UI（子系统 C）。
- 前端 zod 预校验（沿用后端校验）。
- AI 用量统计/计费/限流 UI。
- 传感器、区块链相关 UI（子系统 C 仅占位入口）。
