# AI Credit Reservation P4-D Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert all AI credit-consuming calls from consume/refund compensation to the durable credit reservation, confirmation, and release model introduced for trace-code generation.

**Architecture:** Keep AI provider execution synchronous and do not add a response replay cache in this slice. `AiService` reserves AI credits before calling the external provider, confirms the reservation after the provider succeeds, and releases the reservation when the provider call fails. Existing stable idempotency keys remain the operation identity so repeated payloads cannot double-charge, while provider-configuration and input-validation failures still happen before reservation.

**Tech Stack:** NestJS, Vitest, pnpm 10.33.2, existing `BillingService.reserve/confirmReservation/releaseReservation`, OpenAI-compatible AI provider calls, Xfyun transcription adapter.

---

## File Structure

- Modify: `packages/backend/src/modules/ai/ai.service.spec.ts`
  - Replace `consume/refund` billing mock expectations with `reserve/confirmReservation/releaseReservation`.
  - Cover all AI-consuming methods: `chat`, `advice`, `ask`, `diagnose`, and `transcribe`.
  - Cover provider-failure release and pre-paid-call validation paths.
- Modify: `packages/backend/src/modules/ai/ai.service.ts`
  - Replace direct `billing.consume` calls with a reservation helper.
  - Replace `callWithRefund` with `callWithReservation`.
  - Replace the `transcribe` refund path with reservation release.
- No schema migration is required; P4-C already added `CreditReservation`, `RESERVED`, `CONFIRMED`, and `RELEASED`.

## Task 1: Update AI Service Tests to Reservation Semantics

**Files:**
- Modify: `packages/backend/src/modules/ai/ai.service.spec.ts`

- [ ] **Step 1: Replace the billing mock helper**

Change:

```typescript
function billingSvc() { return { consume: vi.fn().mockResolvedValue({ balanceAfter: 0 }), refund: vi.fn().mockResolvedValue({ balanceAfter: 0 }) } as any; }
```

to:

```typescript
function billingSvc() {
  return {
    reserve: vi.fn().mockResolvedValue({ reservationId: 'res1', balanceAfter: 0 }),
    confirmReservation: vi.fn().mockResolvedValue({ reservationId: 'res1', balanceAfter: 0 }),
    releaseReservation: vi.fn().mockResolvedValue({ reservationId: 'res1', balanceAfter: 0 }),
  } as any;
}
```

- [ ] **Step 2: Update chat success and stable-key tests**

Replace the chat success test in `describe('AiService ... billing ...')` with:

```typescript
it('chat success reserves and confirms AI 1', async () => {
  const billing = billingSvc();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'answer' } }] }) })));
  const svc = new AiService(providerSvc({ baseUrl: 'https://x.com/v1', apiKey: 'k', textModel: 'm', visionModel: null }), integrationSvc(), billing, {} as any, {} as any);

  const res = await svc.chat(user, 'hello');

  expect(res.answer).toBe('answer');
  expect(billing.reserve).toHaveBeenCalledWith(user, 'AI', AI_WEIGHT.chat, expect.objectContaining({
    refType: 'ai.chat',
    idempotencyKey: expect.stringMatching(keyPattern('ai.chat')),
  }));
  expect(billing.confirmReservation).toHaveBeenCalledWith(user, 'AI', expect.objectContaining({
    refType: 'ai.chat',
    idempotencyKey: expect.stringMatching(keyPattern('ai.chat')),
  }));
  expect(billing.releaseReservation).not.toHaveBeenCalled();
});
```

Replace the stable-key test with:

```typescript
it('chat repeats use the same reservation idempotency key for the same payload', async () => {
  const billing = billingSvc();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) })));
  const svc = new AiService(providerSvc({ baseUrl: 'https://x.com/v1', apiKey: 'k', textModel: 'm', visionModel: null }), integrationSvc(), billing, {} as any, {} as any);

  await svc.chat(user, 'same-payload');
  await svc.chat(user, 'same-payload');

  expect(billing.reserve.mock.calls[0][3].idempotencyKey).toBe(billing.reserve.mock.calls[1][3].idempotencyKey);
  expect(billing.confirmReservation.mock.calls[0][2].idempotencyKey).toBe(billing.confirmReservation.mock.calls[1][2].idempotencyKey);
});
```

- [ ] **Step 3: Update insufficient-credit and provider-failure tests**

Replace the old consume/refund failure tests with:

```typescript
it('reserve failure does not start the external AI call or release', async () => {
  const billing = billingSvc();
  billing.reserve.mockRejectedValueOnce(new Error('insufficient'));
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  const svc = new AiService(providerSvc({ baseUrl: 'https://x.com/v1', apiKey: 'k', textModel: 'm', visionModel: null }), integrationSvc(), billing, {} as any, {} as any);

  await expect(svc.chat(user, 'hello')).rejects.toThrow('insufficient');

  expect(fetchMock).not.toHaveBeenCalled();
  expect(billing.releaseReservation).not.toHaveBeenCalled();
  expect(billing.confirmReservation).not.toHaveBeenCalled();
});

it('chat releases the reservation when the external provider fails', async () => {
  const billing = billingSvc();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
  const svc = new AiService(providerSvc({ baseUrl: 'https://x.com/v1', apiKey: 'k', textModel: 'm', visionModel: null }), integrationSvc(), billing, {} as any, {} as any);

  await expect(svc.chat(user, 'hello')).rejects.toBeTruthy();

  expect(billing.reserve).toHaveBeenCalledTimes(1);
  expect(billing.releaseReservation).toHaveBeenCalledWith(user, 'AI', AI_WEIGHT.chat, expect.objectContaining({
    refType: 'ai.chat',
    idempotencyKey: expect.stringMatching(keyPattern('ai.chat')),
  }));
  expect(billing.confirmReservation).not.toHaveBeenCalled();
});
```

- [ ] **Step 4: Update diagnose and transcribe tests**

Replace the diagnose billing test with:

```typescript
it('diagnose reservation ref includes a stable idempotency key', async () => {
  const billing = billingSvc();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) })));
  const svc = new AiService(providerSvc({ baseUrl: 'https://x.com/v1', apiKey: 'k', textModel: 'm', visionModel: 'vm' }), integrationSvc(), billing, {} as any, {} as any);

  await svc.diagnose(user, { imageBase64: 'AAAA', note: 'leaf' });

  expect(billing.reserve).toHaveBeenCalledWith(user, 'AI', AI_WEIGHT.diagnose, expect.objectContaining({
    refType: 'ai.diagnose',
    idempotencyKey: expect.stringMatching(keyPattern('ai.diagnose')),
  }));
  expect(billing.confirmReservation).toHaveBeenCalledWith(user, 'AI', expect.objectContaining({
    refType: 'ai.diagnose',
    idempotencyKey: expect.stringMatching(keyPattern('ai.diagnose')),
  }));
});
```

Replace the transcribe billing test with:

```typescript
it('transcribe reservation ref includes a stable idempotency key', async () => {
  const billing = billingSvc();
  const svc = new AiService(noProv, integrationSvc({ appId: 'a', apiKey: 'k', apiSecret: 's' }), billing, {} as any, {} as any);
  const factory = makeWsFactory([{ code: 0, data: { status: 2, result: { ws: [{ cw: [{ w: 'ok' }] }] } } }]);

  await svc.transcribe(user, Buffer.from('audio'), factory);

  expect(billing.reserve).toHaveBeenCalledWith(user, 'AI', AI_WEIGHT.transcribe, expect.objectContaining({
    refType: 'ai.transcribe',
    idempotencyKey: expect.stringMatching(keyPattern('ai.transcribe')),
  }));
  expect(billing.confirmReservation).toHaveBeenCalledWith(user, 'AI', expect.objectContaining({
    refType: 'ai.transcribe',
    idempotencyKey: expect.stringMatching(keyPattern('ai.transcribe')),
  }));
});
```

Add this transcribe provider-failure test:

```typescript
it('transcribe releases the reservation when Xfyun fails', async () => {
  const billing = billingSvc();
  const svc = new AiService(noProv, integrationSvc({ appId: 'a', apiKey: 'k', apiSecret: 's' }), billing, {} as any, {} as any);
  const factory = makeWsFactory([{ code: 10001, message: 'bad' }]);

  await expect(svc.transcribe(user, Buffer.from('audio'), factory)).rejects.toBeInstanceOf(BadGatewayException);

  expect(billing.releaseReservation).toHaveBeenCalledWith(user, 'AI', AI_WEIGHT.transcribe, expect.objectContaining({
    refType: 'ai.transcribe',
    idempotencyKey: expect.stringMatching(keyPattern('ai.transcribe')),
  }));
  expect(billing.confirmReservation).not.toHaveBeenCalled();
});
```

- [ ] **Step 5: Update advice and ask tests**

Change the advice test setup to use `const billing = billingSvc();`, pass `billing` into `new AiService(...)`, and assert:

```typescript
expect(billing.reserve).toHaveBeenCalledWith(user, 'AI', AI_WEIGHT.chat, {
  refType: 'ai.advice',
  refId: 'b1',
  idempotencyKey: 'ai.advice:t1:u1:b1',
});
expect(billing.confirmReservation).toHaveBeenCalledWith(user, 'AI', {
  refType: 'ai.advice',
  refId: 'b1',
  idempotencyKey: 'ai.advice:t1:u1:b1',
});
```

Change the ask test setup to use `const billing = billingSvc();`, pass `billing` into `new AiService(...)`, and assert:

```typescript
expect(billing.reserve).toHaveBeenCalledWith(user, 'AI', AI_WEIGHT.chat, expect.objectContaining({
  refType: 'ai.ask',
  idempotencyKey: expect.stringMatching(keyPattern('ai.ask')),
}));
expect(billing.confirmReservation).toHaveBeenCalledWith(user, 'AI', expect.objectContaining({
  refType: 'ai.ask',
  idempotencyKey: expect.stringMatching(keyPattern('ai.ask')),
}));
```

- [ ] **Step 6: Run the AI service test and verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/ai/ai.service.spec.ts
```

Expected: FAIL because `AiService` still calls `consume/refund` instead of `reserve/confirmReservation/releaseReservation`.

## Task 2: Implement AI Reservation Flow

**Files:**
- Modify: `packages/backend/src/modules/ai/ai.service.ts`

- [ ] **Step 1: Add a reservation helper**

Replace the private `callWithRefund` helper with:

```typescript
  private async callWithReservation<T>(
    user: AuthUser,
    amount: number,
    ref: { refType?: string; refId?: string; idempotencyKey?: string },
    fn: () => Promise<T>,
  ): Promise<T> {
    await this.billing.reserve(user, 'AI', amount, ref);
    let result: T;
    try {
      result = await fn();
    } catch (err) {
      await this.billing.releaseReservation(user, 'AI', amount, ref);
      throw err;
    }
    await this.billing.confirmReservation(user, 'AI', ref);
    return result;
  }
```

- [ ] **Step 2: Convert chat, advice, ask, and diagnose**

For `chat`, delete:

```typescript
    await this.billing.consume(user, 'AI', AI_WEIGHT.chat, ref);
```

and replace:

```typescript
    const answer = await this.callWithRefund(user, AI_WEIGHT.chat, ref, () => this.callChatCompletions(p, body));
```

with:

```typescript
    const answer = await this.callWithReservation(user, AI_WEIGHT.chat, ref, () => this.callChatCompletions(p, body));
```

Apply the same pattern to:

```typescript
advice: AI_WEIGHT.chat
ask: AI_WEIGHT.chat
diagnose: AI_WEIGHT.diagnose
```

- [ ] **Step 3: Convert transcribe**

Change `transcribe` from:

```typescript
    await this.billing.consume(user, 'AI', AI_WEIGHT.transcribe, ref);
    try {
      const text = await transcribeWithXfyun(creds, audio, factory);
      return { text };
    } catch {
      await this.billing.refund(user, 'AI', AI_WEIGHT.transcribe, ref);
      throw new BadGatewayException('...');
    }
```

to:

```typescript
    try {
      const text = await this.callWithReservation(user, AI_WEIGHT.transcribe, ref, () => transcribeWithXfyun(creds, audio, factory));
      return { text };
    } catch {
      throw new BadGatewayException('...');
    }
```

Keep the existing localized BadGateway message text in the source file.

- [ ] **Step 4: Run the AI service test and verify GREEN**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/ai/ai.service.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Add the confirm-failure invariant test**

Add this test to `packages/backend/src/modules/ai/ai.service.spec.ts`:

```typescript
it('chat does not release when provider succeeds but confirm fails', async () => {
  const billing = billingSvc();
  billing.confirmReservation.mockRejectedValueOnce(new Error('confirm down'));
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'answer' } }] }) })));
  const svc = new AiService(providerSvc({ baseUrl: 'https://x.com/v1', apiKey: 'k', textModel: 'm', visionModel: null }), integrationSvc(), billing, {} as any, {} as any);

  await expect(svc.chat(user, 'hello')).rejects.toThrow('confirm down');

  expect(billing.reserve).toHaveBeenCalledTimes(1);
  expect(billing.confirmReservation).toHaveBeenCalledTimes(1);
  expect(billing.releaseReservation).not.toHaveBeenCalled();
});
```

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/ai/ai.service.spec.ts
```

Expected: PASS.

## Task 3: Cross-Module Regression Checks

**Files:**
- Modify only if tests reveal integration drift.

- [ ] **Step 1: Run billing, trace, and AI focused tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/billing/billing.service.spec.ts src/modules/trace/trace.service.spec.ts src/modules/ai/ai.service.spec.ts
```

Expected: PASS.

- [ ] **Step 2: Run backend type check**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec tsc -p tsconfig.json --noEmit
```

Expected: PASS.

## Task 4: Final Verification, Review, and Commit

**Files:**
- Review all changed files.

- [ ] **Step 1: Run verification gates**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/shared build
$env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5544/nongchang_test'; corepack pnpm@10.33.2 --filter @nongchang/backend exec prisma validate --schema prisma/schema.prisma
$env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5544/nongchang_test'; corepack pnpm@10.33.2 --filter @nongchang/backend exec prisma generate --schema prisma/schema.prisma
corepack pnpm@10.33.2 --filter @nongchang/backend exec tsc -p tsconfig.json --noEmit
$env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5544/nongchang_test'; corepack pnpm@10.33.2 --filter @nongchang/backend build
corepack pnpm@10.33.2 --filter web lint
$env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5544/nongchang_test'; corepack pnpm@10.33.2 test:unit
git diff --check
$env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5544/nongchang_test'; corepack pnpm@10.33.2 test:e2e
```

Expected:
- All non-e2e commands exit `0`.
- If `test:e2e` is blocked because PostgreSQL/PostGIS is not listening at `127.0.0.1:5544`, record that exact environment blocker and do not claim e2e passed.

- [ ] **Step 2: Request code review**

Ask a reviewer to check:

```text
Review P4-D AI credit reservation changes. Requirements: all AI credit-consuming calls reserve AI credits before external provider calls, confirm after provider success, release after provider failure, and do not reserve when validation/provider configuration fails before a paid call. Stable existing idempotency keys must remain unchanged. Look for double-charge, unreleased-reservation, provider-failure masking, and regression risks for chat/advice/ask/diagnose/transcribe.
```

Fix Critical and Important findings before committing.

- [ ] **Step 3: Commit**

Run:

```powershell
git add docs/superpowers/plans/2026-07-06-ai-credit-reservation-p4d.md packages/backend/src/modules/ai/ai.service.ts packages/backend/src/modules/ai/ai.service.spec.ts
git commit -m "fix(billing): reserve ai credits"
```

Expected: commit succeeds on branch `codex/user-group-permissions-p2b`.

---

## Self-Review

- Spec coverage: Implements Phase 4 staged path item 4; stale reservation recovery remains the next P item.
- Placeholder scan: none found.
- Type consistency: method names match P4-C `BillingService.reserve`, `confirmReservation`, and `releaseReservation`.
- Scope control: no response replay cache, no new schema, no frontend changes; repeated successful payloads remain internally idempotent for credits but may still call the external provider again.
- Release-failure handling: provider failures remain the observable error even if releasing the reservation also fails; stale/unreleased reservations must be handled by the later recovery/audit slice.
- Required next P: payload-derived AI idempotency keys are not a full request replay model. Because the current reservation and ledger schema treats a `RELEASED` idempotency key as terminal, exact same-payload retries after provider failure can be blocked. Fix this in a later AI request-key/result-cache or reservation-attempt schema slice rather than faking audit rows in P4-D.
