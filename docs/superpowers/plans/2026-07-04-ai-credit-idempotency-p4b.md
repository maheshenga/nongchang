# AI Credit Idempotency P4-B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI credit consumption idempotent by attaching stable business keys to billing consume references.

**Architecture:** Reuse P4-A ledger idempotency in `BillingService`. Keep AI flow synchronous and unchanged except for reference metadata.

**Tech Stack:** pnpm 10.33.2, NestJS, Vitest, Node `crypto`.

---

## Task 1: AI Billing Reference Tests

**Files:**
- Modify: `packages/backend/src/modules/ai/ai.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Add assertions that AI consume refs include stable idempotency keys:

```ts
expect(consume).toHaveBeenCalledWith(
  user,
  'AI',
  AI_WEIGHT.chat,
  expect.objectContaining({
    refType: 'ai.chat',
    idempotencyKey: expect.stringMatching(/^ai\.chat:t1:u1:[a-f0-9]{16}$/),
  }),
);
```

Add one duplicate chat assertion:

```ts
await svc.chat(user, 'hello');
await svc.chat(user, 'hello');
expect(consume.mock.calls[0][3].idempotencyKey).toBe(consume.mock.calls[1][3].idempotencyKey);
```

Add exact/prefix assertions for `advice`, `ask`, `diagnose`, and `transcribe`.

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/ai/ai.service.spec.ts
```

Expected: fails because current refs do not include `idempotencyKey`.

## Task 2: AI Idempotency Keys

**Files:**
- Modify: `packages/backend/src/modules/ai/ai.service.ts`

- [ ] **Step 1: Implement minimal helper**

Import `createHash` and add a private helper:

```ts
private idempotencyKey(kind: string, user: AuthUser, value: string | Buffer): string {
  const digest = createHash('sha256').update(value).digest('hex').slice(0, 16);
  return `${kind}:${user.tenantId}:${user.userId}:${digest}`;
}
```

- [ ] **Step 2: Attach refs**

Use keys in existing refs:

```ts
const ref = { refType: 'ai.chat', idempotencyKey: this.idempotencyKey('ai.chat', user, message) };
const ref = { refType: 'ai.advice', refId: input.batchId, idempotencyKey: `ai.advice:${user.tenantId}:${user.userId}:${input.batchId}` };
const ref = { refType: 'ai.ask', idempotencyKey: this.idempotencyKey('ai.ask', user, input.question) };
const ref = { refType: 'ai.diagnose', idempotencyKey: this.idempotencyKey('ai.diagnose', user, `${imgUrl}\n${input.note ?? ''}`) };
const ref = { refType: 'ai.transcribe', idempotencyKey: this.idempotencyKey('ai.transcribe', user, audio) };
```

- [ ] **Step 3: Run test to verify GREEN**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/ai/ai.service.spec.ts
```

Expected: AI service tests pass.

## Task 3: Final Verification

Run serially:

```bash
corepack pnpm@10.33.2 --filter @nongchang/shared build
corepack pnpm@10.33.2 --filter @nongchang/backend build
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit -- src/modules/ai/ai.service.spec.ts src/modules/billing/billing.service.spec.ts src/modules/trace/trace.service.spec.ts
corepack pnpm@10.33.2 test:unit
git -c safe.directory=E:/code/nongchang/.worktrees/ai-credit-idempotency-p4b status --short
```

Expected: all builds/tests pass, and the only changed files are the P4-B docs plus AI service/test files.
