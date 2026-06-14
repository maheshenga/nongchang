# 子系统 A 实现计划：后端 AI 模块 + OSS 配置入库

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:subagent-driven-development 逐任务执行。步骤用 `- [ ]` 跟踪。

**Goal:** 后端新增 AI 服务商与阿里云 OSS 的租户级加密配置管理，并提供 AI 文本对话 / 图像病害诊断的后端代理端点。

**Architecture:** 沿用 service+controller+module 模式注册进 AppModule；租户隔离用 tenantId；凭据 AES-256-GCM 加密入库、读取脱敏；AI 走 OpenAI 兼容协议；OSS 改为优先读 DB 配置回退 env。

**Tech Stack:** NestJS 10, Prisma 5, PostgreSQL, zod, ali-oss, Node crypto, Jest, supertest。

**关键约定（全任务通用）：**
- 所有后端命令前缀：`cd /e/code/nongchang/packages/backend`
- shared 改动后需 `pnpm --filter @nongchang/shared build` 再编译 backend
- git 提交身份：`git -c user.name='nongchang' -c user.email='noreply@local' commit`，禁止 `--no-verify`
- 面向用户文本一律中文

---

## Task 1: shared AI/OSS DTO 契约

**Files:**
- Create: `packages/shared/src/dto/ai.dto.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 写 DTO schema**

创建 `packages/shared/src/dto/ai.dto.ts`：

```ts
import { z } from 'zod';

export const createAiProviderSchema = z.object({
  name: z.string().min(1).max(64),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  textModel: z.string().min(1).max(64),
  visionModel: z.string().max(64).optional(),
  enabled: z.boolean().optional(),
});
export type CreateAiProviderInput = z.infer<typeof createAiProviderSchema>;

// 编辑时 apiKey 可空(空=不改)
export const updateAiProviderSchema = createAiProviderSchema.partial().extend({
  apiKey: z.string().optional(),
});
export type UpdateAiProviderInput = z.infer<typeof updateAiProviderSchema>;

export const aiProviderViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  baseUrl: z.string(),
  apiKeyMasked: z.string(),
  textModel: z.string(),
  visionModel: z.string().nullable(),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AiProviderView = z.infer<typeof aiProviderViewSchema>;

export const aiChatSchema = z.object({ message: z.string().min(1).max(2000) });
export type AiChatInput = z.infer<typeof aiChatSchema>;
export type AiChatResponse = { answer: string };

export const aiDiagnoseSchema = z.object({
  imageUrl: z.string().url().optional(),
  imageBase64: z.string().optional(),
  note: z.string().max(500).optional(),
}).refine(d => !!d.imageUrl || !!d.imageBase64, { message: '需提供 imageUrl 或 imageBase64' });
export type AiDiagnoseInput = z.infer<typeof aiDiagnoseSchema>;
export type AiDiagnoseResponse = { result: string };

export const ossConfigSchema = z.object({
  region: z.string().min(1),
  bucket: z.string().min(1),
  accessKeyId: z.string().min(1),
  accessKeySecret: z.string().optional(), // 空=不改
  baseUrl: z.string().url().optional(),
  enabled: z.boolean().optional(),
});
export type OssConfigInput = z.infer<typeof ossConfigSchema>;

export const ossConfigViewSchema = z.object({
  region: z.string(),
  bucket: z.string(),
  accessKeyId: z.string(),
  accessKeySecretMasked: z.string(),
  baseUrl: z.string().nullable(),
  enabled: z.boolean(),
});
export type OssConfigView = z.infer<typeof ossConfigViewSchema>;

export type AiTestResponse = { ok: boolean; latencyMs?: number; error?: string };
```

- [ ] **Step 2: 导出**

在 `packages/shared/src/index.ts` 末尾追加：

```ts
export {
  createAiProviderSchema, updateAiProviderSchema, aiProviderViewSchema,
  aiChatSchema, aiDiagnoseSchema, ossConfigSchema, ossConfigViewSchema,
} from './dto/ai.dto';
export type {
  CreateAiProviderInput, UpdateAiProviderInput, AiProviderView,
  AiChatInput, AiChatResponse, AiDiagnoseInput, AiDiagnoseResponse,
  OssConfigInput, OssConfigView, AiTestResponse,
} from './dto/ai.dto';
```

- [ ] **Step 3: 构建验证**

Run: `cd /e/code/nongchang && pnpm --filter @nongchang/shared build`
Expected: 构建成功，无类型错误。

- [ ] **Step 4: 提交**

```bash
cd /e/code/nongchang
git add packages/shared/src/dto/ai.dto.ts packages/shared/src/index.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(shared): add AI provider/OSS config DTO contracts"
```

---

## Task 2: Prisma 模型 + 迁移

**Files:**
- Modify: `packages/backend/prisma/schema.prisma`
- Modify: `packages/backend/.env.example`

- [ ] **Step 1: 加模型**

在 `schema.prisma` 末尾追加 `AiProvider` 与 `OssConfig` 两个 model（字段见设计文档「数据模型」一节，完整照抄）。

- [ ] **Step 2: 生成迁移**

Run: `cd /e/code/nongchang/packages/backend && pnpm prisma migrate dev --name add_ai_provider_oss_config`
Expected: 迁移文件生成，client 重新生成，无错误。

- [ ] **Step 3: 加环境变量示例**

在 `.env.example` 追加：

```
# 32 字节加密主密钥(hex 64 位或 base64)。用于加密 AI/OSS 凭据。缺失则启动报错。
APP_ENCRYPTION_KEY=
```

- [ ] **Step 4: 提交**

```bash
cd /e/code/nongchang
git add packages/backend/prisma packages/backend/.env.example
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(backend): add AiProvider/OssConfig prisma models + migration"
```

---

## Task 3: 加密工具 EncryptionService（TDD）

**Files:**
- Create: `packages/backend/src/common/crypto/encryption.service.ts`
- Test: `packages/backend/src/common/crypto/encryption.service.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest';
import { EncryptionService } from './encryption.service';

const KEY = '0'.repeat(64); // 32 bytes hex
describe('EncryptionService', () => {
  const svc = new EncryptionService(KEY);
  it('round-trips encrypt/decrypt', () => {
    const enc = svc.encrypt('sk-secret-1234');
    expect(enc).not.toContain('sk-secret');
    expect(svc.decrypt(enc)).toBe('sk-secret-1234');
  });
  it('masks secret keeping last 4', () => {
    expect(svc.maskSecret('sk-abcdef1234')).toBe('****1234');
  });
  it('throws on bad key length', () => {
    expect(() => new EncryptionService('short')).toThrow();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /e/code/nongchang/packages/backend && pnpm vitest run encryption.service`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

```ts
import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

@Injectable()
export class EncryptionService {
  private key: Buffer;
  constructor(rawKey = process.env.APP_ENCRYPTION_KEY ?? '') {
    const buf = /^[0-9a-fA-F]{64}$/.test(rawKey)
      ? Buffer.from(rawKey, 'hex')
      : Buffer.from(rawKey, 'base64');
    if (buf.length !== 32) throw new Error('APP_ENCRYPTION_KEY 必须为 32 字节(hex64 或 base64)');
    this.key = buf;
  }
  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
  }
  decrypt(payload: string): string {
    const [ivHex, tagHex, dataHex] = payload.split(':');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
  }
  maskSecret(plain: string): string {
    return '****' + plain.slice(-4);
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd /e/code/nongchang/packages/backend && pnpm jest encryption.service --silent`
Expected: PASS（3 个）。

- [ ] **Step 5: 提交**

```bash
cd /e/code/nongchang
git add packages/backend/src/common/crypto
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(backend): add AES-256-GCM EncryptionService (TDD)"
```

---

## Task 4: AiProviderService（TDD）

**Files:**
- Create: `packages/backend/src/modules/ai-provider/ai-provider.service.ts`
- Test: `packages/backend/src/modules/ai-provider/ai-provider.service.spec.ts`

业务规则：
- `create/list/update/remove` 全部限定 `tenantId = user.tenantId`。
- 存储时 `apiKeyEnc = enc.encrypt(dto.apiKey)`。
- `toView` 转 `AiProviderView`，`apiKeyMasked = enc.maskSecret(decrypt(apiKeyEnc))`，不回明文。
- `update` 时 `dto.apiKey` 为空/未传则保留原 `apiKeyEnc`。
- enable 唯一性：create/update 的 `enabled=true` 时，事务里先把同租户其他 provider 置 `enabled=false`。
- `getEnabled(user)`：返回含解密 apiKey 的内部对象（供 AiService 用，不对外暴露）。

- [ ] **Step 1: 写失败测试**（fake PrismaService + 真实 EncryptionService）

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { AiProviderService } from './ai-provider.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import type { AuthUser } from '@nongchang/shared';

const enc = new EncryptionService('0'.repeat(64));
const user = { userId: 'u1', tenantId: 't1', role: 'system_admin' } as AuthUser;

function makePrisma() {
  const rows: any[] = [];
  return {
    rows,
    aiProvider: {
      create: async ({ data }: any) => { const r = { id: 'p' + (rows.length + 1), createdAt: new Date(), updatedAt: new Date(), visionModel: null, ...data }; rows.push(r); return r; },
      findMany: async ({ where }: any) => rows.filter(r => r.tenantId === where.tenantId),
      findFirst: async ({ where }: any) => rows.find(r => r.id === where.id && r.tenantId === where.tenantId) ?? null,
      update: async ({ where, data }: any) => { const r = rows.find(x => x.id === where.id); Object.assign(r, data); return r; },
      updateMany: async ({ where, data }: any) => { rows.filter(r => r.tenantId === where.tenantId).forEach(r => Object.assign(r, data)); return { count: 0 }; },
      delete: async ({ where }: any) => { const i = rows.findIndex(r => r.id === where.id); rows.splice(i, 1); return {}; },
    },
    $transaction: async (fn: any) => fn(),
  } as any;
}

describe('AiProviderService', () => {
  let prisma: any; let svc: AiProviderService;
  beforeEach(() => { prisma = makePrisma(); svc = new AiProviderService(prisma, enc); });

  it('create 加密存储且 view 脱敏', async () => {
    const v = await svc.create(user, { name: '通义', baseUrl: 'https://x.com/v1', apiKey: 'sk-abcd1234', textModel: 'qwen-plus' });
    expect(v.apiKeyMasked).toBe('****1234');
    expect((v as any).apiKey).toBeUndefined();
    expect(prisma.rows[0].apiKeyEnc).not.toContain('sk-abcd');
  });

  it('list 仅本租户', async () => {
    await svc.create(user, { name: 'a', baseUrl: 'https://x.com/v1', apiKey: 'sk-1111', textModel: 'm' });
    prisma.rows.push({ id: 'pX', tenantId: 't2', name: 'other', baseUrl: '', apiKeyEnc: enc.encrypt('sk-2222'), textModel: 'm', visionModel: null, enabled: false, createdAt: new Date(), updatedAt: new Date() });
    const list = await svc.list(user);
    expect(list).toHaveLength(1);
  });

  it('enable 唯一: 启用新的会置反其他', async () => {
    const a = await svc.create(user, { name: 'a', baseUrl: 'https://x.com/v1', apiKey: 'sk-1111', textModel: 'm', enabled: true });
    await svc.create(user, { name: 'b', baseUrl: 'https://x.com/v1', apiKey: 'sk-2222', textModel: 'm', enabled: true });
    const reloaded = prisma.rows.find((r: any) => r.id === a.id);
    expect(reloaded.enabled).toBe(false);
  });

  it('update apiKey 为空则不改密钥', async () => {
    const a = await svc.create(user, { name: 'a', baseUrl: 'https://x.com/v1', apiKey: 'sk-keep9999', textModel: 'm' });
    const before = prisma.rows.find((r: any) => r.id === a.id).apiKeyEnc;
    const v = await svc.update(user, a.id, { name: 'a2' });
    expect(prisma.rows.find((r: any) => r.id === a.id).apiKeyEnc).toBe(before);
    expect(v.name).toBe('a2');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /e/code/nongchang/packages/backend && pnpm vitest run ai-provider.service`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 service**

按规则实现，构造注入 `PrismaService` 与 `EncryptionService`。`toView` 不含明文 apiKey。

- [ ] **Step 4: 运行确认通过**

Run: `cd /e/code/nongchang/packages/backend && pnpm vitest run ai-provider.service`
Expected: PASS（4 个）。

- [ ] **Step 5: 提交**

```bash
cd /e/code/nongchang
git add packages/backend/src/modules/ai-provider/ai-provider.service.ts packages/backend/src/modules/ai-provider/ai-provider.service.spec.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(backend): AiProviderService with encryption + tenant isolation (TDD)"
```

---

## Task 5: AiService（chat/diagnose，OpenAI 兼容，TDD）

**Files:**
- Create: `packages/backend/src/modules/ai/ai.service.ts`
- Test: `packages/backend/src/modules/ai/ai.service.spec.ts`

业务规则：
- `chat(user, message)`：取本租户 enabled provider；无则抛 `BadRequestException('未配置可用的 AI 服务商')`。POST `{baseUrl}/chat/completions`，body `{ model: textModel, messages: [{role:'user',content:message}] }`，Header `Authorization: Bearer <解密 apiKey>`。返回 `{ answer: choices[0].message.content }`。
- `diagnose(user, input)`：需 `provider.visionModel`，否则抛 `BadRequestException('未配置视觉模型')`。messages content 为多模态数组：`[{type:'text',text:'请诊断作物病害...'+note},{type:'image_url',image_url:{url: imageUrl||'data:image/jpeg;base64,'+imageBase64}}]`。返回 `{ result }`。
- HTTP 用全局 `fetch`（Node 18+），超时 30s（AbortController）。失败抛 `BadGatewayException`，错误信息不含密钥。
- 注入 `AiProviderService`，调 `getEnabled` 取配置；测试 mock `getEnabled` 与 `fetch`（vi.stubGlobal）。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiService } from './ai.service';
import { BadRequestException } from '@nestjs/common';
import type { AuthUser } from '@nongchang/shared';

const user = { userId: 'u1', tenantId: 't1', role: 'merchant' } as AuthUser;
function providerSvc(enabled: any) { return { getEnabled: async () => enabled } as any; }

describe('AiService', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('无 provider 抛业务错误', async () => {
    const svc = new AiService(providerSvc(null));
    await expect(svc.chat(user, 'hi')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('chat 返回模型回答', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '你好' } }] }) })));
    const svc = new AiService(providerSvc({ baseUrl: 'https://x.com/v1', apiKey: 'sk-1', textModel: 'm', visionModel: null }));
    const r = await svc.chat(user, 'hi');
    expect(r.answer).toBe('你好');
  });

  it('diagnose 无 visionModel 抛错', async () => {
    const svc = new AiService(providerSvc({ baseUrl: 'https://x.com/v1', apiKey: 'sk-1', textModel: 'm', visionModel: null }));
    await expect(svc.diagnose(user, { imageUrl: 'https://x.com/a.jpg' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('diagnose 用 visionModel 返回结果', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '叶片缺氮' } }] }) })));
    const svc = new AiService(providerSvc({ baseUrl: 'https://x.com/v1', apiKey: 'sk-1', textModel: 'm', visionModel: 'vm' }));
    const r = await svc.diagnose(user, { imageBase64: 'AAAA' });
    expect(r.result).toBe('叶片缺氮');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /e/code/nongchang/packages/backend && pnpm vitest run ai.service`
Expected: FAIL。

- [ ] **Step 3: 实现**

- [ ] **Step 4: 运行确认通过**

Run: `cd /e/code/nongchang/packages/backend && pnpm vitest run ai.service`
Expected: PASS（4 个）。

- [ ] **Step 5: 提交**

```bash
cd /e/code/nongchang
git add packages/backend/src/modules/ai/ai.service.ts packages/backend/src/modules/ai/ai.service.spec.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(backend): AiService chat/diagnose via OpenAI-compatible API (TDD)"
```

---

## Task 6: OssConfigService（TDD）

**Files:**
- Create: `packages/backend/src/modules/oss-config/oss-config.service.ts`
- Test: `packages/backend/src/modules/oss-config/oss-config.service.spec.ts`

业务规则：
- 每租户一条（`tenantId @unique`）。`get(user)` 返回 view（secret 脱敏）或 null。
- `upsert(user, dto)`：存在则更新（secret 为空不改），不存在则创建（需 secret，缺失抛 `BadRequestException`）。
- `accessKeySecEnc = enc.encrypt(dto.accessKeySecret)`。
- `getCredentials(tenantId)`：返回解密后的凭据（供 OssService 用），无配置或未启用返回 null。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { OssConfigService } from './oss-config.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import type { AuthUser } from '@nongchang/shared';

const enc = new EncryptionService('0'.repeat(64));
const user = { userId: 'u1', tenantId: 't1', role: 'system_admin' } as AuthUser;

function makePrisma() {
  let row: any = null;
  return {
    get row() { return row; },
    ossConfig: {
      findUnique: async ({ where }: any) => (row && row.tenantId === where.tenantId ? row : null),
      upsert: async ({ create, update }: any) => { row = row ? { ...row, ...update } : { id: 'o1', ...create }; return row; },
    },
  } as any;
}

describe('OssConfigService', () => {
  let prisma: any; let svc: OssConfigService;
  beforeEach(() => { prisma = makePrisma(); svc = new OssConfigService(prisma, enc); });

  it('无配置返回 null', async () => {
    expect(await svc.get(user)).toBeNull();
  });

  it('upsert 创建并脱敏', async () => {
    const v = await svc.upsert(user, { region: 'cn', bucket: 'b', accessKeyId: 'AK', accessKeySecret: 'SECRET1234' });
    expect(v.accessKeySecretMasked).toBe('****1234');
    expect(prisma.row.accessKeySecEnc).not.toContain('SECRET');
  });

  it('upsert secret 为空不改', async () => {
    await svc.upsert(user, { region: 'cn', bucket: 'b', accessKeyId: 'AK', accessKeySecret: 'SECRET1234' });
    const before = prisma.row.accessKeySecEnc;
    await svc.upsert(user, { region: 'cn2', bucket: 'b', accessKeyId: 'AK' });
    expect(prisma.row.accessKeySecEnc).toBe(before);
    expect(prisma.row.region).toBe('cn2');
  });

  it('getCredentials 解密(启用时)', async () => {
    await svc.upsert(user, { region: 'cn', bucket: 'b', accessKeyId: 'AK', accessKeySecret: 'SECRET1234', enabled: true });
    const c = await svc.getCredentials('t1');
    expect(c?.accessKeySecret).toBe('SECRET1234');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /e/code/nongchang/packages/backend && pnpm vitest run oss-config.service`
Expected: FAIL。

- [ ] **Step 3: 实现**

- [ ] **Step 4: 运行确认通过**

Run: `cd /e/code/nongchang/packages/backend && pnpm vitest run oss-config.service`
Expected: PASS（4 个）。

- [ ] **Step 5: 提交**

```bash
cd /e/code/nongchang
git add packages/backend/src/modules/oss-config/oss-config.service.ts packages/backend/src/modules/oss-config/oss-config.service.spec.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(backend): OssConfigService with encryption (TDD)"
```

---

## Task 7: Controllers + Modules + 注册 AppModule

**Files:**
- Create: `packages/backend/src/modules/ai-provider/{ai-provider.controller,ai-provider.module}.ts`
- Create: `packages/backend/src/modules/ai/{ai.controller,ai.module}.ts`
- Create: `packages/backend/src/modules/oss-config/{oss-config.controller,oss-config.module}.ts`
- Create: `packages/backend/src/common/crypto/crypto.module.ts`（全局 module，provide EncryptionService）
- Modify: `packages/backend/src/app.module.ts`

- [ ] **Step 1: CryptoModule（全局）**

```ts
import { Global, Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';

@Global()
@Module({
  providers: [{ provide: EncryptionService, useFactory: () => new EncryptionService() }],
  exports: [EncryptionService],
})
export class CryptoModule {}
```

- [ ] **Step 2: AiProviderController**（仅 SYSTEM_ADMIN，参照 SupplyController 用 `@Roles(Role.SYSTEM_ADMIN)`、`@CurrentUser()`、`ZodValidationPipe`）

路由：`@Controller('ai-providers')`，GET `/`、POST `/`(createAiProviderSchema)、PATCH `/:id`(updateAiProviderSchema)、DELETE `/:id`、POST `/:id/test`。

- [ ] **Step 3: AiController**（认证用户，不加 @Roles）

`@Controller('ai')`，POST `/chat`(aiChatSchema)、POST `/diagnose`(aiDiagnoseSchema)。

- [ ] **Step 4: OssConfigController**（仅 SYSTEM_ADMIN）

`@Controller('oss-config')`，GET `/`、PUT `/`(ossConfigSchema)、POST `/test`。

- [ ] **Step 5: 三个 Module**

`AiProviderModule`(providers: AiProviderService; controllers; exports: AiProviderService)、`AiModule`(imports: AiProviderModule; providers: AiService; controllers)、`OssConfigModule`(providers: OssConfigService; controllers; exports: OssConfigService)。

- [ ] **Step 6: 注册 AppModule**

在 `app.module.ts` imports 加入 `CryptoModule, AiProviderModule, AiModule, OssConfigModule`。

- [ ] **Step 7: 编译验证**

Run: `cd /e/code/nongchang/packages/backend && pnpm build`
Expected: 编译成功。

- [ ] **Step 8: 提交**

```bash
cd /e/code/nongchang
git add packages/backend/src/modules/ai-provider packages/backend/src/modules/ai packages/backend/src/modules/oss-config packages/backend/src/common/crypto/crypto.module.ts packages/backend/src/app.module.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(backend): AI/OSS controllers, modules, AppModule wiring"
```

---

## Task 8: OSS 改造（走 DB 配置回退 env）

**Files:**
- Modify: `packages/backend/src/modules/upload/oss.service.ts`
- Modify: `packages/backend/src/modules/upload/upload.service.ts`
- Modify: `packages/backend/src/modules/upload/upload.module.ts`
- Modify: `packages/backend/src/modules/upload/upload.controller.ts`（透传 user.tenantId）
- Test: 更新 `upload.service.spec.ts` / `oss.service.spec.ts`（如断言签名变化）

- [ ] **Step 1: 改 OssService.put 签名**

`put(key, buffer, tenantId?)`：若传 tenantId，先 `ossConfig.getCredentials(tenantId)`；有则用之构造 client，无则回退 `process.env`。注入 `OssConfigService`（OssConfigModule 需 export 且 UploadModule import）。

- [ ] **Step 2: UploadService.upload 透传 tenantId**

`upload(file, tenantId?)` → `this.oss.put(key, file.buffer, tenantId)`。

- [ ] **Step 3: Controller 透传**

`@CurrentUser() user` → `this.svc.upload(file, user.tenantId)`。

- [ ] **Step 4: UploadModule import OssConfigModule**

- [ ] **Step 5: 更新相关单测并运行**

Run: `cd /e/code/nongchang/packages/backend && pnpm vitest run upload oss.service`
Expected: PASS。

- [ ] **Step 6: 编译 + 提交**

```bash
cd /e/code/nongchang/packages/backend && pnpm build
cd /e/code/nongchang
git add packages/backend/src/modules/upload
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(backend): OSS upload reads tenant DB config, falls back to env"
```

---

## Task 9: e2e + 全量验证

**Files:**
- Create: `packages/backend/test/ai-provider.e2e-spec.ts`

前提：测试环境需设 `APP_ENCRYPTION_KEY`（在 vitest 配置或测试 setup 注入 `'0'.repeat(64)`）。先确认 `vitest.config.ts` 是否能注入 env；若不能，在 e2e 文件顶部 `process.env.APP_ENCRYPTION_KEY ||= '0'.repeat(64)`。

- [ ] **Step 1: 写 e2e（真实 PG）**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
process.env.APP_ENCRYPTION_KEY ||= '0'.repeat(64);
import { AppModule } from '../src/app.module';

let app: INestApplication;
async function token(u: string) {
  const r = await request(app.getHttpServer()).post('/api/auth/login').send({ username: u, password: 'password123' });
  return r.body.accessToken as string;
}
beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication(); app.setGlobalPrefix('api'); await app.init();
});
afterAll(async () => { await app.close(); });

describe('AI 服务商管理', () => {
  it('merchant 无权访问(403)', async () => {
    const t = await token('merchantA');
    await request(app.getHttpServer()).get('/api/ai-providers').set('Authorization', `Bearer ${t}`).expect(403);
  });
  it('sysadmin 创建后 apiKey 脱敏返回', async () => {
    const t = await token('sysadmin');
    const res = await request(app.getHttpServer()).post('/api/ai-providers').set('Authorization', `Bearer ${t}`)
      .send({ name: 'e2e通义', baseUrl: 'https://x.com/v1', apiKey: 'sk-e2e-secret-7777', textModel: 'qwen-plus' }).expect(201);
    expect(res.body.apiKeyMasked).toBe('****7777');
    expect(JSON.stringify(res.body)).not.toContain('sk-e2e-secret');
  });
  it('未配置 provider 时 chat 返回业务错误(400)', async () => {
    // 注：若上条已为该租户创建并未启用，chat 取 enabled=null → 400
    const t = await token('merchantB');
    await request(app.getHttpServer()).post('/api/ai/chat').set('Authorization', `Bearer ${t}`)
      .send({ message: '你好' }).expect(400);
  });
});
```

注：merchantA/B 与 sysadmin 是否同租户决定可见性断言，按实际 seed 调整（merchantB 属 agentB 租户，sysadmin 创建的 provider 属其租户）。若同租户导致 chat 不报 400，则改断言为「未启用时 400」并在创建时显式 `enabled:false`。

- [ ] **Step 2: 运行 e2e**

Run: `cd /e/code/nongchang/packages/backend && pnpm vitest run ai-provider.e2e`
Expected: PASS。

- [ ] **Step 3: 全量验证**

Run: `cd /e/code/nongchang/packages/backend && pnpm build && pnpm vitest run`
Expected: 编译通过，全部测试 PASS。

- [ ] **Step 4: 提交**

```bash
cd /e/code/nongchang
git add packages/backend/test/ai-provider.e2e-spec.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "test(backend): AI provider e2e (RBAC + secret masking + tenant)"
```

---

## 完成标准

- shared 导出 AI/OSS DTO；backend 编译通过；全部单测 + e2e 通过。
- AiProvider/OssConfig 凭据加密入库、列表脱敏、跨租户隔离。
- `/ai/chat`、`/ai/diagnose` 可用（mock 验证逻辑），无 provider 时优雅报错。
- OSS 上传优先用 DB 配置、回退 env。
- 子系统 A 完成后转入子系统 B（web 后台管理页）。
