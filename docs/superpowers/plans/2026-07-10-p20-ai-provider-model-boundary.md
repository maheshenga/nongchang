# P20 AI Provider Model Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract deterministic AI provider helpers from `AiProviderService` so view projection, create/update payload construction, enabled-provider selection, and decrypted credential projection are directly tested.

**Architecture:** `AiProviderService` remains responsible for Prisma reads/writes, transactions, encryption/decryption, and live provider connectivity checks. A new `ai-provider.model.ts` owns pure row projection, create/update data builders, enabled-row selection, and decrypted provider projection with no database, network, or crypto side effects. The existing AI provider service spec contains mojibake test descriptions and one corrupted provider name; repair those while keeping assertions and behavior unchanged.

**Tech Stack:** NestJS service, Vitest, TypeScript, existing `@nongchang/shared` AI provider DTO and response types.

## Global Constraints

- Do not change `AiProviderController` routes, DTO schemas, API response shape, Prisma query shape, `EncryptionService` usage, or provider test network behavior.
- Preserve `AiProviderView` shape: `id`, `name`, `baseUrl`, `apiKeyMasked`, `textModel`, `visionModel`, `enabled`, `createdAt`, `updatedAt`.
- Preserve masking behavior: encrypted `apiKeyEnc` is decrypted and masked by service before passing to model.
- Preserve create behavior: `enabled = dto.enabled ?? false`; `visionModel = dto.visionModel ?? null`; `apiKeyEnc` is encrypted by service.
- Preserve update behavior: include only fields explicitly present in `UpdateAiProviderInput`; `visionModel` explicitly maps `undefined` to no change and present nullish value to `null`; `apiKeyEnc` is included only when `dto.apiKey` is truthy; final `enabled = dto.enabled ?? existing.enabled`.
- Preserve uniqueness behavior: when final/create enabled is true, service still disables all tenant providers inside the existing transaction before create/update.
- Preserve enabled provider behavior: return the first enabled row from the tenant rows, or `null` if none; service decrypts `apiKeyEnc` before model projection.
- Preserve test endpoint behavior and copy: missing row throws `AI 服务商不存在`, HTTP failure returns `连接失败(HTTP <status>)`, network/provider failure returns `连接失败`.
- Repair mojibake only in `packages/backend/src/modules/ai-provider/ai-provider.service.spec.ts`; do not alter assertions or production copy for this repair.

---

## File Structure

- Create `packages/backend/src/modules/ai-provider/ai-provider.model.ts`
  - Pure helpers for row projection, create/update data, enabled provider selection, and decrypted provider projection.
- Create `packages/backend/src/modules/ai-provider/ai-provider.model.spec.ts`
  - Direct helper tests for view projection, data builders, enabled selection, and credential projection.
- Modify `packages/backend/src/modules/ai-provider/ai-provider.service.ts`
  - Replace inline pure logic with imports from `ai-provider.model.ts`.
- Modify `packages/backend/src/modules/ai-provider/ai-provider.service.spec.ts`
  - Repair corrupted Chinese test descriptions and provider display name.

---

### Task 1: Add AI Provider Model Tests

**Files:**
- Create: `packages/backend/src/modules/ai-provider/ai-provider.model.spec.ts`

**Interfaces:**
- Future exports:
  - `AiProviderRow`
  - `EnabledAiProvider`
  - `buildAiProviderView(input: { row: AiProviderRow; apiKeyMasked: string }): AiProviderView`
  - `buildAiProviderCreateData(input: { tenantId: string; name: string; baseUrl: string; apiKeyEnc: string; textModel: string; visionModel?: string | null; enabled?: boolean })`
  - `buildAiProviderUpdateData(input: { dto: UpdateAiProviderInput; existingEnabled: boolean; apiKeyEnc: string | null }): { data: Record<string, unknown>; finalEnabled: boolean }`
  - `findEnabledAiProviderRow(rows: AiProviderRow[]): AiProviderRow | null`
  - `buildEnabledAiProvider(input: { row: AiProviderRow; apiKey: string }): EnabledAiProvider`

- [ ] **Step 1: Write failing tests**

Create `packages/backend/src/modules/ai-provider/ai-provider.model.spec.ts` with tests that import the future helpers and cover:

```typescript
import { describe, expect, it } from 'vitest';
import {
  buildAiProviderCreateData,
  buildAiProviderUpdateData,
  buildAiProviderView,
  buildEnabledAiProvider,
  findEnabledAiProviderRow,
  type AiProviderRow,
} from './ai-provider.model';

describe('ai provider model helpers', () => {
  const baseRow: AiProviderRow = {
    id: 'p1',
    tenantId: 't1',
    name: 'Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKeyEnc: 'ENC(api-key)',
    textModel: 'qwen-plus',
    visionModel: null,
    enabled: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  };

  it('projects AI provider views with masked API key supplied by service', () => {
    expect(buildAiProviderView({ row: baseRow, apiKeyMasked: '****1234' })).toEqual({
      id: 'p1',
      name: 'Qwen',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKeyMasked: '****1234',
      textModel: 'qwen-plus',
      visionModel: null,
      enabled: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
  });

  it('builds create data with default disabled state and null vision model', () => {
    expect(buildAiProviderCreateData({
      tenantId: 't1',
      name: 'Qwen',
      baseUrl: 'https://example.com/v1',
      apiKeyEnc: 'ENC(key)',
      textModel: 'qwen-plus',
    })).toEqual({
      tenantId: 't1',
      name: 'Qwen',
      baseUrl: 'https://example.com/v1',
      apiKeyEnc: 'ENC(key)',
      textModel: 'qwen-plus',
      visionModel: null,
      enabled: false,
    });

    expect(buildAiProviderCreateData({
      tenantId: 't1',
      name: 'Qwen Vision',
      baseUrl: 'https://example.com/v1',
      apiKeyEnc: 'ENC(key)',
      textModel: 'qwen-plus',
      visionModel: 'qwen-vl-plus',
      enabled: true,
    }).enabled).toBe(true);
  });

  it('builds sparse update data and preserves existing enabled by default', () => {
    expect(buildAiProviderUpdateData({
      dto: { name: 'Updated', visionModel: undefined },
      existingEnabled: true,
      apiKeyEnc: null,
    })).toEqual({
      finalEnabled: true,
      data: { name: 'Updated', enabled: true },
    });

    expect(buildAiProviderUpdateData({
      dto: {
        baseUrl: 'https://new.example.com/v1',
        textModel: 'deepseek-chat',
        visionModel: null,
        enabled: false,
        apiKey: 'new-key',
      },
      existingEnabled: true,
      apiKeyEnc: 'ENC(new-key)',
    })).toEqual({
      finalEnabled: false,
      data: {
        baseUrl: 'https://new.example.com/v1',
        textModel: 'deepseek-chat',
        visionModel: null,
        apiKeyEnc: 'ENC(new-key)',
        enabled: false,
      },
    });
  });

  it('selects first enabled provider row and projects decrypted credentials', () => {
    expect(findEnabledAiProviderRow([])).toBeNull();
    expect(findEnabledAiProviderRow([{ ...baseRow, enabled: false }])).toBeNull();
    expect(findEnabledAiProviderRow([{ ...baseRow, id: 'disabled', enabled: false }, baseRow])).toBe(baseRow);

    expect(buildEnabledAiProvider({ row: baseRow, apiKey: 'plain-key' })).toEqual({
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: 'plain-key',
      textModel: 'qwen-plus',
      visionModel: null,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/ai-provider/ai-provider.model.spec.ts
```

Expected: FAIL because `./ai-provider.model` does not exist.

---

### Task 2: Implement AI Provider Model Helpers

**Files:**
- Create: `packages/backend/src/modules/ai-provider/ai-provider.model.ts`

**Interfaces:**
- Produces helpers consumed by Task 3 exactly as named in Task 1.

- [ ] **Step 1: Implement helpers**

Create `packages/backend/src/modules/ai-provider/ai-provider.model.ts`:

```typescript
import type { AiProviderView, UpdateAiProviderInput } from '@nongchang/shared';

export interface AiProviderRow {
  id: string;
  tenantId: string;
  name: string;
  baseUrl: string;
  apiKeyEnc: string;
  textModel: string;
  visionModel: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface EnabledAiProvider {
  baseUrl: string;
  apiKey: string;
  textModel: string;
  visionModel: string | null;
}

export function buildAiProviderView(input: { row: AiProviderRow; apiKeyMasked: string }): AiProviderView {
  return {
    id: input.row.id,
    name: input.row.name,
    baseUrl: input.row.baseUrl,
    apiKeyMasked: input.apiKeyMasked,
    textModel: input.row.textModel,
    visionModel: input.row.visionModel ?? null,
    enabled: input.row.enabled,
    createdAt: input.row.createdAt.toISOString(),
    updatedAt: input.row.updatedAt.toISOString(),
  };
}

export function buildAiProviderCreateData(input: {
  tenantId: string;
  name: string;
  baseUrl: string;
  apiKeyEnc: string;
  textModel: string;
  visionModel?: string | null;
  enabled?: boolean;
}) {
  return {
    tenantId: input.tenantId,
    name: input.name,
    baseUrl: input.baseUrl,
    apiKeyEnc: input.apiKeyEnc,
    textModel: input.textModel,
    visionModel: input.visionModel ?? null,
    enabled: input.enabled ?? false,
  };
}

export function buildAiProviderUpdateData(input: {
  dto: UpdateAiProviderInput;
  existingEnabled: boolean;
  apiKeyEnc: string | null;
}): { data: Record<string, unknown>; finalEnabled: boolean } {
  const data: Record<string, unknown> = {};
  if (input.dto.name !== undefined) data.name = input.dto.name;
  if (input.dto.baseUrl !== undefined) data.baseUrl = input.dto.baseUrl;
  if (input.dto.textModel !== undefined) data.textModel = input.dto.textModel;
  if (input.dto.visionModel !== undefined) data.visionModel = input.dto.visionModel ?? null;
  if (input.apiKeyEnc) data.apiKeyEnc = input.apiKeyEnc;

  const finalEnabled = input.dto.enabled ?? input.existingEnabled;
  data.enabled = finalEnabled;
  return { data, finalEnabled };
}

export function findEnabledAiProviderRow(rows: AiProviderRow[]): AiProviderRow | null {
  return rows.find((row) => row.enabled) ?? null;
}

export function buildEnabledAiProvider(input: { row: AiProviderRow; apiKey: string }): EnabledAiProvider {
  return {
    baseUrl: input.row.baseUrl,
    apiKey: input.apiKey,
    textModel: input.row.textModel,
    visionModel: input.row.visionModel ?? null,
  };
}
```

- [ ] **Step 2: Run model tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/ai-provider/ai-provider.model.spec.ts
```

Expected: PASS.

---

### Task 3: Wire AiProviderService and Repair Test Text

**Files:**
- Modify: `packages/backend/src/modules/ai-provider/ai-provider.service.ts`
- Modify: `packages/backend/src/modules/ai-provider/ai-provider.service.spec.ts`

**Interfaces:**
- Consumes helpers from `./ai-provider.model`.

- [ ] **Step 1: Replace inline pure logic**

Import helpers:

```typescript
import {
  buildAiProviderCreateData,
  buildAiProviderUpdateData,
  buildAiProviderView,
  buildEnabledAiProvider,
  findEnabledAiProviderRow,
  type AiProviderRow,
  type EnabledAiProvider,
} from './ai-provider.model';
export type { EnabledAiProvider } from './ai-provider.model';
```

Replace:
- Local `AiProviderRow` interface with imported type.
- Local `EnabledAiProvider` interface with re-exported type.
- `toView` implementation with `buildAiProviderView({ row: r, apiKeyMasked: this.enc.maskSecret(this.enc.decrypt(r.apiKeyEnc)) })`.
- Create `data` construction with `buildAiProviderCreateData({ tenantId: user.tenantId, name: dto.name, baseUrl: dto.baseUrl, apiKeyEnc: this.enc.encrypt(dto.apiKey), textModel: dto.textModel, visionModel: dto.visionModel, enabled: dto.enabled })`.
- Update `data` and `finalEnabled` construction with `buildAiProviderUpdateData({ dto, existingEnabled: existing.enabled, apiKeyEnc: dto.apiKey ? this.enc.encrypt(dto.apiKey) : null })`.
- `getEnabled` row selection with `findEnabledAiProviderRow(rows)`.
- `getEnabled` return projection with `buildEnabledAiProvider({ row, apiKey: this.enc.decrypt(row.apiKeyEnc) })`.

Keep:
- `NotFoundException('AI 服务商不存在')`.
- Existing transaction boundaries and `updateMany({ where: { tenantId: user.tenantId }, data: { enabled: false } })`.
- Provider test endpoint fetch, timeout, and error copy.

- [ ] **Step 2: Repair mojibake in service tests**

In `packages/backend/src/modules/ai-provider/ai-provider.service.spec.ts`, replace only corrupted human-readable text:

```typescript
it('create 加密存储且 view 脱敏', async () => {
  const v = await svc.create(user, { name: '通义', baseUrl: 'https://x.com/v1', apiKey: 'sk-abcd1234', textModel: 'qwen-plus' });
  ...
});

it('list 仅本租户', async () => {
  ...
});

it('enable 唯一: 启用新的会禁用其他', async () => {
  ...
});

it('update apiKey 为空则不改密钥', async () => {
  ...
});
```

- [ ] **Step 3: Run focused AI provider tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/ai-provider/ai-provider.model.spec.ts src/modules/ai-provider/ai-provider.service.spec.ts src/modules/ai/ai.service.spec.ts
```

Expected: PASS.

---

### Task 4: Verify, Review, and Commit

**Files:**
- Verify all files changed by Tasks 1-3.

- [ ] **Step 1: Run full verification**

Run serially:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend build
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit
git -c safe.directory=E:/code/nongchang diff --check
```

Expected:
- Build exits `0`.
- Backend unit tests exit `0`.
- `diff --check` exits `0`; LF-to-CRLF warnings are acceptable on Windows if there are no whitespace errors.

- [ ] **Step 2: Review scope**

Review P20 AI provider model boundary. Ensure no controller/DTO/query/crypto/network behavior changed. Verify view projection, masking handoff, create/update data semantics, enabled uniqueness transaction flow, enabled provider selection, decrypted provider projection, and repaired test text.

- [ ] **Step 3: Commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-10-p20-ai-provider-model-boundary.md packages/backend/src/modules/ai-provider/ai-provider.model.ts packages/backend/src/modules/ai-provider/ai-provider.model.spec.ts packages/backend/src/modules/ai-provider/ai-provider.service.ts packages/backend/src/modules/ai-provider/ai-provider.service.spec.ts
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang commit -m "refactor(backend): extract ai provider model helpers"
```

Expected: Commit succeeds.

---

## Self-Review

- Spec coverage: The plan covers AI provider view projection, create data, sparse update data, enabled row selection, decrypted provider projection, service wiring, test text repair, focused tests, full verification, review, and commit.
- Placeholder scan: No TBD/TODO placeholders.
- Type consistency: Helper names and signatures are consistent across tasks.
