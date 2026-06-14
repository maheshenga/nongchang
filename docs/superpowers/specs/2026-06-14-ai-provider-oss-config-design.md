# 子系统 A：后端 AI 模块 + OSS 配置入库 设计文档

> 日期：2026-06-14　范围：后端（NestJS + Prisma）。本子系统为 B（web 后台管理页）、C（小程序 AI 接入）的依赖前置。

## 目标

为平台增加「AI 服务商」与「阿里云 OSS」两类**租户级凭据配置**，凭据加密入库、后台可管理；并提供 AI 文本对话与图像病害诊断的**后端代理端点**（密钥永不下发前端）。

## 架构概述

- 沿用现有模块模式：`service + controller + module`，注册进 `AppModule`。
- 租户隔离：所有配置表带 `tenantId` + `@@index([tenantId])`，查询经 `CurrentUser` 限定本租户。
- AI 服务商统一走 **OpenAI 兼容协议**（`POST {baseUrl}/chat/completions`）：文本与多模态（图像）同协议，多模态把图片以 base64 data URL 放进 message。
- 凭据（apiKey / OSS accessKeySecret）用 **AES-256-GCM 加密**后入库；读取列表时**脱敏**（如 `sk-****1234`），仅调用时在后端内部解密。
- 加密主密钥来自环境变量 `APP_ENCRYPTION_KEY`（32 字节，base64 或 hex）。缺失时启动报错（fail-fast），避免明文落库。

## 数据模型（Prisma 新增）

```prisma
model AiProvider {
  id          String   @id @default(uuid())
  tenantId    String   @map("tenant_id")
  name        String                              // 展示名，如 "通义千问"
  baseUrl     String   @map("base_url")           // OpenAI 兼容端点，如 https://dashscope.aliyuncs.com/compatible-mode/v1
  apiKeyEnc   String   @map("api_key_enc")        // AES-256-GCM 密文(含 iv:tag:cipher)
  textModel   String   @map("text_model")         // 如 qwen-plus
  visionModel String?  @map("vision_model")       // 如 qwen-vl-plus，可空(不做诊断时)
  enabled     Boolean  @default(false)
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@index([tenantId])
  @@map("ai_providers")
}

model OssConfig {
  id              String   @id @default(uuid())
  tenantId        String   @unique @map("tenant_id")   // 每租户一条
  region          String
  bucket          String
  accessKeyId     String   @map("access_key_id")
  accessKeySecEnc String   @map("access_key_sec_enc")  // AES 密文
  baseUrl         String?  @map("base_url")            // CDN/自定义域名，可空
  enabled         Boolean  @default(false)
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  @@map("oss_configs")
}
```

**同租户启用唯一性**：AiProvider 允许多条但同租户仅一条 `enabled=true`（在 service 层事务保证，启用某条时把同租户其他条置 false）。OssConfig 每租户唯一（`tenantId @unique`）。

## 加密工具（新建 `common/crypto/encryption.service.ts`）

- `encrypt(plain: string): string` → `ivHex:tagHex:cipherHex`
- `decrypt(enc: string): string`
- `maskSecret(plain: string): string` → 保留尾 4 位，前缀 `****`
- 算法 AES-256-GCM；key 从 `APP_ENCRYPTION_KEY` 读取并校验长度。
- 作为可注入 provider，被 AiProviderService / OssConfigService 复用。

## 接口设计

### AI 服务商管理（`/api/ai-providers`，仅 SYSTEM_ADMIN）

| 方法 | 路径 | 说明 | 返回 |
|------|------|------|------|
| GET | `/ai-providers` | 列出本租户服务商 | 列表（apiKey 脱敏） |
| POST | `/ai-providers` | 新增 | 创建结果（脱敏） |
| PATCH | `/ai-providers/:id` | 编辑（apiKey 为空则不改） | 更新结果（脱敏） |
| DELETE | `/ai-providers/:id` | 删除 | `{ ok: true }` |
| POST | `/ai-providers/:id/test` | 测试连接（发一条最小 chat 请求） | `{ ok, latencyMs, error? }` |

### OSS 配置管理（`/api/oss-config`，仅 SYSTEM_ADMIN）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/oss-config` | 获取本租户 OSS 配置（secret 脱敏；无则返回 null） |
| PUT | `/oss-config` | 创建或更新（upsert，secret 为空则不改） |
| POST | `/oss-config/test` | 测试连接（尝试列 bucket / putObject 探测） |

### AI 业务端点

| 方法 | 路径 | 角色 | 说明 |
|------|------|------|------|
| POST | `/ai/chat` | 认证用户 | body `{ message: string }`；后端取本租户 enabled provider 的 textModel，调用 chat/completions，返回 `{ answer }` |
| POST | `/ai/diagnose` | 认证用户 | body `{ imageUrl?: string, imageBase64?: string, note?: string }`；用 visionModel 做病害识别，返回 `{ result }` |

- 无启用的 provider / 未配 visionModel 时返回明确业务错误（如 400 `未配置可用的 AI 服务商`），前端据此降级提示。
- 调用失败（超时/鉴权失败）统一捕获，返回 502 + 简短原因，不暴露密钥。

## OSS 改造（让 upload 走数据库配置）

现有 `OssService` 从 `process.env` 读取凭据。改为：
- `OssService.put(key, buffer, tenantId)`：优先从 `OssConfig`（本租户、enabled）读取并解密凭据构造 client；**回退**到环境变量（兼容旧部署）。
- client 按 tenantId 缓存，配置更新后失效（简单实现：每次 put 时若配置 updatedAt 变化则重建；或不缓存，按需创建——首版不缓存，保持简单）。
- `UploadService.upload` 透传 `user.tenantId`。

## shared 契约（新增 `dto/ai.dto.ts`）

- `createAiProviderSchema` / `updateAiProviderSchema`（zod）：name、baseUrl(url)、apiKey、textModel、visionModel?、enabled
- `aiChatSchema`：message(min1)
- `aiDiagnoseSchema`：imageUrl? / imageBase64? / note?（二选一校验）
- `ossConfigSchema`：region、bucket、accessKeyId、accessKeySecret、baseUrl?、enabled
- 响应类型：`AiProviderView`（apiKey 脱敏字段 `apiKeyMasked`）、`OssConfigView`、`AiChatResponse`、`AiDiagnoseResponse`

## 文件结构

- 新建：
  - `prisma/schema.prisma`（+2 模型）→ migration
  - `packages/shared/src/dto/ai.dto.ts` + 入口导出
  - `packages/backend/src/common/crypto/encryption.service.ts` (+spec)
  - `packages/backend/src/modules/ai-provider/{ai-provider.service,ai-provider.controller,ai-provider.module}.ts` (+service spec)
  - `packages/backend/src/modules/oss-config/{oss-config.service,oss-config.controller,oss-config.module}.ts` (+spec)
  - `packages/backend/src/modules/ai/{ai.service,ai.controller,ai.module}.ts`（chat/diagnose；ai.service 负责调 OpenAI 兼容 API）(+spec)
  - e2e：`test/ai-provider.e2e-spec.ts`（CRUD+租户隔离+脱敏）
- 修改：
  - `app.module.ts`（注册 3 个新模块）
  - `upload/oss.service.ts`、`upload/upload.service.ts`（走 DB 配置 + 回退 env）
  - `.env.example`（+ `APP_ENCRYPTION_KEY`）

## 测试策略

- 加密工具单测：encrypt→decrypt 往返、maskSecret、错误 key。
- AiProviderService 单测：create 加密、list 脱敏、enable 唯一性（启用一条置反其他）、租户隔离。
- e2e（真实 PG）：sysadmin 增删改查、跨租户不可见、apiKey 不明文返回。
- AI 调用：ai.service 的 HTTP 调用用 mock（不依赖真实外部 API）；业务错误路径（无 provider）用真实 service 验证。
- 全量：`pnpm --filter @nongchang/backend build` + `test` + e2e。

## 安全要点

- apiKey / accessKeySecret 全程 AES-256-GCM 加密，列表/详情一律脱敏。
- AI 与 OSS 凭据仅在后端解密使用，不进任何前端响应、不写日志。
- 管理端点限 SYSTEM_ADMIN；业务端点（chat/diagnose）限认证用户且按租户取配置。
- `APP_ENCRYPTION_KEY` 缺失时 fail-fast 启动报错。

## 非目标（本子系统不做）

- web 后台界面（子系统 B）
- 小程序 UI 与接入（子系统 C）
- AI 用量计费/限流（预留 service 结构，首版不实现）
- 传感器、区块链
