# P6 AI Request Model Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract deterministic AI prompt, request body, and billing reference construction out of `AiService` so AI behavior is easier to test without changing routes, provider calls, billing semantics, or response shapes.

**Architecture:** `AiService` remains the orchestration boundary for Prisma, scope checks, provider lookup, billing reservation, Xfyun, and HTTP fetch. A new `ai.model.ts` owns pure transformations: chat/advice/ask/diagnose request bodies and operation reference generation from an injected digest. This follows the existing P2-P5 pattern of model helpers beside the service.

**Tech Stack:** NestJS service, Vitest, TypeScript, pnpm workspace, existing `@nongchang/shared` types.

## Global Constraints

- Do not change AI controller routes, DTO schemas, provider selection, billing weights, reservation/confirm/release order, fetch URL, timeout, headers, or exception classes.
- Do not change Xfyun transcribe behavior except moving the idempotency reference construction into a pure helper.
- Preserve operation key format: `<kind>:<tenantId>:<userId>:<16 lowercase hex chars>`.
- Preserve advice prompt wording and ask/diagnose body shapes exactly except for equivalent extraction into helpers.
- New production code must follow TDD: add failing tests first, verify RED, implement minimal code, verify GREEN.

---

## File Structure

- Create `packages/backend/src/modules/ai/ai.model.ts`
  - Pure helper interfaces and functions for AI request bodies and billing refs.
  - No Nest, Prisma, fetch, randomUUID, billing, or provider imports.
- Create `packages/backend/src/modules/ai/ai.model.spec.ts`
  - Direct unit tests for prompt/body/reference helpers.
- Modify `packages/backend/src/modules/ai/ai.service.ts`
  - Replace inline body/prompt/ref construction with helper calls.
  - Keep `createHash(randomUUID())` digest generation inside the service.

---

### Task 1: Add AI Model Helper Tests

**Files:**
- Create: `packages/backend/src/modules/ai/ai.model.spec.ts`

**Interfaces:**
- Consumes: none.
- Produces expected future exports:
  - `buildAiOperationRef(kind: AiOperationKind, user: AuthUser, digest: string, refId?: string): AiOperationRef`
  - `buildChatCompletionBody(model: string, content: string): ChatCompletionBody`
  - `buildAdviceChatBody(model: string, input: AdvicePromptInput, nowMs: number): ChatCompletionBody`
  - `buildAskChatBody(model: string, batches: AskBatchSnapshot[], question: string, nowMs: number): ChatCompletionBody`
  - `buildDiagnoseChatBody(model: string, input: AiDiagnoseInput): VisionChatCompletionBody`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, expect, it } from 'vitest';
import { Role, type AuthUser } from '@nongchang/shared';
import {
  buildAdviceChatBody,
  buildAiOperationRef,
  buildAskChatBody,
  buildChatCompletionBody,
  buildDiagnoseChatBody,
} from './ai.model';

const user: AuthUser = {
  userId: 'u1',
  tenantId: 't1',
  role: Role.MERCHANT,
  agentId: null,
  ownerId: 'u1',
  sessionVersion: 0,
};

describe('ai.model operation refs', () => {
  it('builds operation refs with the existing key format', () => {
    expect(buildAiOperationRef('ai.advice', user, 'abcdef0123456789', 'b1')).toEqual({
      refType: 'ai.advice',
      refId: 'b1',
      idempotencyKey: 'ai.advice:t1:u1:abcdef0123456789',
    });
  });

  it('omits refId when the operation has no resource id', () => {
    expect(buildAiOperationRef('ai.chat', user, 'abcdef0123456789')).toEqual({
      refType: 'ai.chat',
      idempotencyKey: 'ai.chat:t1:u1:abcdef0123456789',
    });
  });
});

describe('ai.model chat bodies', () => {
  it('builds a text chat completion body', () => {
    expect(buildChatCompletionBody('text-model', 'hello')).toEqual({
      model: 'text-model',
      messages: [{ role: 'user', content: 'hello' }],
    });
  });

  it('builds the existing advice prompt from batch records and phenology', () => {
    const body = buildAdviceChatBody(
      'text-model',
      {
        batch: { cropName: 'tomato', status: 'Growing', plantDate: new Date('2026-01-01') },
        records: [{ action: 'water' }, { action: 'fertilize' }],
        phenology: [{ expectedDays: 30 }, { expectedDays: 20 }],
      },
      Date.parse('2026-01-11T00:00:00Z'),
    );

    expect(body).toEqual({
      model: 'text-model',
      messages: [{
        role: 'user',
        content: '你是农技专家。作物:tomato;当前状态:Growing;已种植10天;标准全周期50天。近期农事:water、fertilize。请给出未来一周的浇水、施肥、病虫害防治建议,简明分点。',
      }],
    });
  });

  it('uses fallback advice context when batch data is missing', () => {
    const body = buildAdviceChatBody(
      'text-model',
      { batch: null, records: [], phenology: [] },
      Date.parse('2026-01-11T00:00:00Z'),
    );

    expect(body.messages[0].content).toBe('你是农技专家。作物:undefined;当前状态:undefined;已种植0天;标准全周期未知天。近期农事:无。请给出未来一周的浇水、施肥、病虫害防治建议,简明分点。');
  });

  it('builds the existing ask prompt from visible batch summaries', () => {
    const body = buildAskChatBody(
      'text-model',
      [{ batchNo: 'B1', cropName: 'corn', status: 'Growing', plantDate: new Date('2026-01-01') }],
      'current batches?',
      Date.parse('2026-01-11T00:00:00Z'),
    );

    expect(body).toEqual({
      model: 'text-model',
      messages: [{
        role: 'user',
        content: '以下是用户可见的批次数据:B1(corn,Growing,种植10天)。请根据数据回答问题:current batches?',
      }],
    });
  });

  it('uses empty-data ask prompt when no batches are visible', () => {
    const body = buildAskChatBody('text-model', [], 'anything?', Date.parse('2026-01-11T00:00:00Z'));

    expect(body.messages[0].content).toBe('以下是用户可见的批次数据:无数据。请根据数据回答问题:anything?');
  });

  it('builds diagnose body from imageUrl and note', () => {
    expect(buildDiagnoseChatBody('vision-model', { imageUrl: 'https://img.test/a.jpg', note: 'yellow leaf' })).toEqual({
      model: 'vision-model',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: '请诊断该作物可能的病害并给出处理建议。 备注:yellow leaf' },
          { type: 'image_url', image_url: { url: 'https://img.test/a.jpg' } },
        ],
      }],
    });
  });

  it('builds diagnose body from base64 input', () => {
    const body = buildDiagnoseChatBody('vision-model', { imageBase64: 'AAAA' });

    expect(body.messages[0].content[1]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/jpeg;base64,AAAA' },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/ai/ai.model.spec.ts`

Expected: FAIL because `./ai.model` does not exist.

---

### Task 2: Implement AI Model Helpers

**Files:**
- Create: `packages/backend/src/modules/ai/ai.model.ts`

**Interfaces:**
- Consumes: `AuthUser`, `AiDiagnoseInput` from `@nongchang/shared`.
- Produces:
  - `AiOperationKind`
  - `AiOperationRef`
  - `ChatCompletionBody`
  - `VisionChatCompletionBody`
  - `AdvicePromptInput`
  - `AskBatchSnapshot`
  - helper functions listed in Task 1.

- [ ] **Step 1: Write minimal implementation**

```typescript
import type { AiDiagnoseInput, AuthUser } from '@nongchang/shared';

export type AiOperationKind = 'ai.chat' | 'ai.advice' | 'ai.ask' | 'ai.diagnose' | 'ai.transcribe';

export interface AiOperationRef {
  refType: AiOperationKind;
  refId?: string;
  idempotencyKey: string;
}

export interface ChatCompletionBody {
  model: string;
  messages: Array<{ role: 'user'; content: string }>;
}

export interface VisionChatCompletionBody {
  model: string;
  messages: Array<{
    role: 'user';
    content: Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    >;
  }>;
}

export interface AdvicePromptInput {
  batch: { cropName: string; status: string; plantDate: Date | string } | null;
  records: Array<{ action: string }>;
  phenology: Array<{ expectedDays: number }>;
}

export interface AskBatchSnapshot {
  batchNo: string;
  cropName: string;
  status: string;
  plantDate: Date | string;
}

export function buildAiOperationRef(
  kind: AiOperationKind,
  user: AuthUser,
  digest: string,
  refId?: string,
): AiOperationRef {
  return {
    refType: kind,
    ...(refId ? { refId } : {}),
    idempotencyKey: `${kind}:${user.tenantId}:${user.userId}:${digest}`,
  };
}

export function buildChatCompletionBody(model: string, content: string): ChatCompletionBody {
  return {
    model,
    messages: [{ role: 'user', content }],
  };
}

export function buildAdviceChatBody(model: string, input: AdvicePromptInput, nowMs = Date.now()): ChatCompletionBody {
  const totalDays = input.phenology.reduce((s, p) => s + p.expectedDays, 0);
  const elapsed = input.batch
    ? Math.floor((nowMs - new Date(input.batch.plantDate).getTime()) / 86400000)
    : 0;
  const actions = input.records.map((r) => r.action).join('、') || '无';
  const prompt = `你是农技专家。作物:${input.batch?.cropName};当前状态:${input.batch?.status};已种植${elapsed}天;标准全周期${totalDays || '未知'}天。近期农事:${actions}。请给出未来一周的浇水、施肥、病虫害防治建议,简明分点。`;
  return buildChatCompletionBody(model, prompt);
}

export function buildAskChatBody(
  model: string,
  batches: AskBatchSnapshot[],
  question: string,
  nowMs = Date.now(),
): ChatCompletionBody {
  const ctx = batches
    .map((b) => `${b.batchNo}(${b.cropName},${b.status},种植${Math.floor((nowMs - new Date(b.plantDate).getTime()) / 86400000)}天)`)
    .join(';');
  return buildChatCompletionBody(model, `以下是用户可见的批次数据:${ctx || '无数据'}。请根据数据回答问题:${question}`);
}

export function buildDiagnoseChatBody(model: string, input: AiDiagnoseInput): VisionChatCompletionBody {
  const imgUrl = input.imageUrl ?? (`data:image/jpeg;base64,${input.imageBase64}`);
  return {
    model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: `请诊断该作物可能的病害并给出处理建议。${input.note ? ` 备注:${input.note}` : ''}` },
          { type: 'image_url', image_url: { url: imgUrl } },
        ],
      },
    ],
  };
}
```

- [ ] **Step 2: Run model tests to verify GREEN**

Run: `corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/ai/ai.model.spec.ts`

Expected: PASS.

---

### Task 3: Wire AiService to Helpers

**Files:**
- Modify: `packages/backend/src/modules/ai/ai.service.ts`
- Test: `packages/backend/src/modules/ai/ai.service.spec.ts`
- Test: `packages/backend/src/modules/ai/ai.model.spec.ts`

**Interfaces:**
- Consumes Task 2 helpers.
- Produces unchanged public `AiService` behavior.

- [ ] **Step 1: Modify imports**

Add this import to `packages/backend/src/modules/ai/ai.service.ts`:

```typescript
import {
  buildAdviceChatBody,
  buildAiOperationRef,
  buildAskChatBody,
  buildChatCompletionBody,
  buildDiagnoseChatBody,
  type AiOperationKind,
} from './ai.model';
```

- [ ] **Step 2: Replace inline model construction**

Use the following service shape for the changed methods:

```typescript
async chat(user: AuthUser, message: string): Promise<AiChatResponse> {
  const p = await this.providers.getEnabled(user);
  if (!p) throw new BadRequestException('未配置可用的 AI 服务商');
  const body = buildChatCompletionBody(p.textModel, message);
  const ref = this.operationRef('ai.chat', user);
  const answer = await this.callWithReservation(user, AI_WEIGHT.chat, ref, () => this.callChatCompletions(p, body));
  return { answer };
}

async advice(user: AuthUser, input: AiAdviceInput): Promise<AiChatResponse> {
  await this.scope.assertInScope(this.prisma, user, 'batch', input.batchId);
  const batch = await this.prisma.batch.findFirst({ where: { id: input.batchId }, select: { cropName: true, status: true, plantDate: true } });
  const records = await this.prisma.farmRecord.findMany({ where: { batchId: input.batchId }, orderBy: { createdAt: 'desc' }, take: 10, select: { action: true } });
  const phen = await this.prisma.cropPhenology.findMany({ where: { tenantId: user.tenantId, cropName: batch?.cropName }, select: { expectedDays: true } });
  const p = await this.providers.getEnabled(user);
  if (!p) throw new BadRequestException('未配置可用的 AI 服务商');
  const ref = this.operationRef('ai.advice', user, input.batchId);
  const answer = await this.callWithReservation(user, AI_WEIGHT.chat, ref, () => this.callChatCompletions(p, buildAdviceChatBody(p.textModel, { batch, records, phenology: phen })));
  return { answer };
}

async ask(user: AuthUser, input: AiAskInput): Promise<AiChatResponse> {
  const where = await this.scope.ownedScopeWhere(this.prisma, user);
  const batches = await this.prisma.batch.findMany({ where, select: { batchNo: true, cropName: true, status: true, plantDate: true }, take: 50 });
  const p = await this.providers.getEnabled(user);
  if (!p) throw new BadRequestException('未配置可用的 AI 服务商');
  const ref = this.operationRef('ai.ask', user);
  const answer = await this.callWithReservation(user, AI_WEIGHT.chat, ref, () => this.callChatCompletions(p, buildAskChatBody(p.textModel, batches, input.question)));
  return { answer };
}

async diagnose(user: AuthUser, input: AiDiagnoseInput): Promise<AiDiagnoseResponse> {
  const p = await this.providers.getEnabled(user);
  if (!p) throw new BadRequestException('未配置可用的 AI 服务商');
  if (!p.visionModel) throw new BadRequestException('未配置视觉模型');
  const ref = this.operationRef('ai.diagnose', user);
  const result = await this.callWithReservation(user, AI_WEIGHT.diagnose, ref, () => this.callChatCompletions(p, buildDiagnoseChatBody(p.visionModel, input)));
  return { result };
}

async transcribe(user: AuthUser, audio: Buffer, factory?: WebSocketFactory): Promise<AiTranscribeResponse> {
  if (!audio || audio.length === 0) throw new BadRequestException('音频为空');
  const creds = await this.integrations.getEnabledXfyun(user.tenantId);
  if (!creds) throw new BadRequestException('未配置讯飞语音');
  const ref = this.operationRef('ai.transcribe', user);
  const text = await this.callWithReservation(user, AI_WEIGHT.transcribe, ref, async () => {
    try {
      return await transcribeWithXfyun(creds, audio, factory);
    } catch {
      throw new BadGatewayException('语音转写失败');
    }
  });
  return { text };
}

private operationRef(kind: AiOperationKind, user: AuthUser, refId?: string) {
  const digest = createHash('sha256').update(randomUUID()).digest('hex').slice(0, 16);
  return buildAiOperationRef(kind, user, digest, refId);
}
```

- [ ] **Step 3: Run focused AI tests**

Run: `corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/ai/ai.model.spec.ts src/modules/ai/ai.service.spec.ts src/modules/ai/xfyun-iat.spec.ts`

Expected: PASS.

---

### Task 4: Verify, Review, and Commit

**Files:**
- Review: `docs/superpowers/plans/2026-07-09-p6-ai-request-model-boundary.md`
- Review: `packages/backend/src/modules/ai/ai.model.ts`
- Review: `packages/backend/src/modules/ai/ai.model.spec.ts`
- Review: `packages/backend/src/modules/ai/ai.service.ts`

- [ ] **Step 1: Run full backend verification**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend build
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit
git -c safe.directory=E:/code/nongchang diff --check
```

Expected: backend build exits 0; backend test suite passes; diff check has no errors other than possible CRLF warnings.

- [ ] **Step 2: Request code review**

Send the reviewer this scope:

```text
Review P6 AI request model boundary. Ensure no route/DTO/provider/billing/fetch/timeout/exception behavior changed. Confirm operation key format remains <kind>:<tenantId>:<userId>:<16 lowercase hex chars>. Confirm advice/ask/diagnose body shapes and prompt wording are preserved. Confirm model helpers are deterministic and pure except receiving Date.now-compatible nowMs from callers/tests.
```

- [ ] **Step 3: Commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p6-ai-request-model-boundary.md packages/backend/src/modules/ai/ai.model.ts packages/backend/src/modules/ai/ai.model.spec.ts packages/backend/src/modules/ai/ai.service.ts
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang commit -m "refactor(backend): extract ai request model helpers"
```

Expected: commit succeeds after review issues are resolved.

---

## Self-Review

- Spec coverage: The plan covers AI prompt/body construction, operation refs, service wiring, verification, review, and commit. It explicitly avoids billing/provider/route behavior changes.
- Placeholder scan: No TBD/TODO/fill-in placeholders. All commands and code snippets are concrete.
- Type consistency: Function names and return types are consistent across tasks; `phenology` is the model input property and maps from service variable `phen`.
