# P10 Trace Generation Model Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract deterministic trace-code generation helpers from `TraceService.generateCodes` so idempotency, retry-count validation, billing ref construction, and trace-code row construction are directly tested.

**Architecture:** `TraceService` remains responsible for scope checks, Prisma reads/writes, transactions, reservation lifecycle calls, and random code generation. A new `trace.model.ts` owns pure validation and data-shaping helpers that have no database or billing side effects.

**Tech Stack:** NestJS service, Vitest, TypeScript, existing `@nongchang/shared` `AuthUser` type.

## Global Constraints

- Do not change trace controller routes, DTOs, query parameters, response shapes, Prisma query order, billing reservation order, or random code format.
- Preserve max generated codes per batch as `10000`.
- Preserve count validation: count must be an integer between 1 and `10000`, otherwise throw `ForbiddenException`.
- Preserve request-key validation: trim the provided `Idempotency-Key`; empty or missing key throws `BadRequestException`.
- Preserve idempotency key format: `trace.generate:${tenantId}:${userId}:${batchId}:${normalizedRequestKey}`.
- Preserve billing ref shape: `{ refType: 'trace.generate', refId: batchId, idempotencyKey: generationKey }`.
- Preserve duplicate retry behavior: existing generated code count must equal requested count, otherwise throw `BadRequestException`.
- Preserve trace-code create data fields: `tenantId`, `batchId`, `code`, `reservationId`, `generationKey`.
- Preserve listCodes default cap by moving the shared max constant without changing value.

---

## File Structure

- Create `packages/backend/src/modules/trace/trace.model.ts`
  - Pure helpers for generation count validation, request-key normalization, generation-key/ref creation, retry-count guard, trace-code where/order objects, and createMany rows.
- Create `packages/backend/src/modules/trace/trace.model.spec.ts`
  - Direct helper tests for all extracted behavior.
- Modify `packages/backend/src/modules/trace/trace.service.ts`
  - Replace inline validation/data construction with helpers; keep database, billing, transaction, and random UUID logic in service.

---

### Task 1: Add Trace Model Tests

**Files:**
- Create: `packages/backend/src/modules/trace/trace.model.spec.ts`

**Interfaces:**
- Future exports:
  - `MAX_CODES_PER_BATCH: 10000`
  - `assertTraceGenerationCount(count: number): void`
  - `normalizeTraceGenerationRequestKey(requestKey?: string): string`
  - `buildTraceGenerationKey(input: { tenantId: string; userId: string; batchId: string; requestKey: string }): string`
  - `buildTraceGenerationRef(batchId: string, generationKey: string): { refType: 'trace.generate'; refId: string; idempotencyKey: string }`
  - `buildTraceCodeLookup(tenantId: string, batchId: string, generationKey: string): { where: { tenantId: string; batchId: string; generationKey: string }; orderBy: { createdAt: 'asc' } }`
  - `assertTraceGenerationRetryCount(existingCount: number, requestedCount: number): void`
  - `buildTraceCodeCreateData(input: { tenantId: string; batchId: string; codes: string[]; reservationId: string; generationKey: string }): Array<{ tenantId: string; batchId: string; code: string; reservationId: string; generationKey: string }>`

- [x] **Step 1: Write failing tests**

Use this behavior coverage:

```typescript
import { describe, expect, it } from 'vitest';
import {
  MAX_CODES_PER_BATCH,
  assertTraceGenerationCount,
  assertTraceGenerationRetryCount,
  buildTraceCodeCreateData,
  buildTraceCodeLookup,
  buildTraceGenerationKey,
  buildTraceGenerationRef,
  normalizeTraceGenerationRequestKey,
} from './trace.model';

describe('trace generation model helpers', () => {
  it('keeps the code-generation cap at 10000', () => {
    expect(MAX_CODES_PER_BATCH).toBe(10000);
  });

  it('accepts only integer counts inside the generation cap', () => {
    expect(() => assertTraceGenerationCount(1)).not.toThrow();
    expect(() => assertTraceGenerationCount(MAX_CODES_PER_BATCH)).not.toThrow();
    expect(() => assertTraceGenerationCount(0)).toThrow('生成数量须为 1~10000 的整数');
    expect(() => assertTraceGenerationCount(1.5)).toThrow('生成数量须为 1~10000 的整数');
    expect(() => assertTraceGenerationCount(MAX_CODES_PER_BATCH + 1)).toThrow('生成数量须为 1~10000 的整数');
  });

  it('trims request keys and rejects missing retry keys', () => {
    expect(normalizeTraceGenerationRequestKey('  req-1  ')).toBe('req-1');
    expect(() => normalizeTraceGenerationRequestKey()).toThrow('缺少幂等键');
    expect(() => normalizeTraceGenerationRequestKey('   ')).toThrow('缺少幂等键');
  });

  it('builds stable trace generation idempotency keys and billing refs', () => {
    const generationKey = buildTraceGenerationKey({
      tenantId: 't1',
      userId: 'op1',
      batchId: 'b1',
      requestKey: 'req-1',
    });

    expect(generationKey).toBe('trace.generate:t1:op1:b1:req-1');
    expect(buildTraceGenerationRef('b1', generationKey)).toEqual({
      refType: 'trace.generate',
      refId: 'b1',
      idempotencyKey: generationKey,
    });
  });

  it('builds the existing-code lookup used before and inside the transaction', () => {
    expect(buildTraceCodeLookup('t1', 'b1', 'key1')).toEqual({
      where: { tenantId: 't1', batchId: 'b1', generationKey: 'key1' },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('rejects duplicate retries when the requested count changes', () => {
    expect(() => assertTraceGenerationRetryCount(2, 2)).not.toThrow();
    expect(() => assertTraceGenerationRetryCount(2, 5)).toThrow('幂等键已用于生成 2 个溯源码,不能以 5 个重试');
  });

  it('builds trace-code createMany rows without mutating the input code list', () => {
    const codes = ['ORC-A', 'ORC-B'];
    const rows = buildTraceCodeCreateData({
      tenantId: 't1',
      batchId: 'b1',
      codes,
      reservationId: 'res1',
      generationKey: 'key1',
    });

    expect(rows).toEqual([
      { tenantId: 't1', batchId: 'b1', code: 'ORC-A', reservationId: 'res1', generationKey: 'key1' },
      { tenantId: 't1', batchId: 'b1', code: 'ORC-B', reservationId: 'res1', generationKey: 'key1' },
    ]);
    expect(codes).toEqual(['ORC-A', 'ORC-B']);
  });
});
```

Run after creating the test file:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/trace/trace.model.spec.ts
```

Expected: FAIL because `./trace.model` does not exist.

---

### Task 2: Implement Trace Model Helpers

**Files:**
- Create: `packages/backend/src/modules/trace/trace.model.ts`

- [x] **Step 1: Implement helpers**

Use this implementation shape:

```typescript
import { BadRequestException, ForbiddenException } from '@nestjs/common';

export const MAX_CODES_PER_BATCH = 10000;
export const TRACE_GENERATION_REF_TYPE = 'trace.generate' as const;

export interface TraceGenerationKeyInput {
  tenantId: string;
  userId: string;
  batchId: string;
  requestKey: string;
}

export interface TraceCodeCreateDataInput {
  tenantId: string;
  batchId: string;
  codes: readonly string[];
  reservationId: string;
  generationKey: string;
}

export function assertTraceGenerationCount(count: number): void {
  if (!Number.isInteger(count) || count < 1 || count > MAX_CODES_PER_BATCH) {
    throw new ForbiddenException(`生成数量须为 1~${MAX_CODES_PER_BATCH} 的整数`);
  }
}

export function normalizeTraceGenerationRequestKey(requestKey?: string): string {
  const normalizedRequestKey = requestKey?.trim();
  if (!normalizedRequestKey) {
    throw new BadRequestException('缺少幂等键,请通过 Idempotency-Key 重试安全地生成溯源码');
  }
  return normalizedRequestKey;
}

export function buildTraceGenerationKey(input: TraceGenerationKeyInput): string {
  return `${TRACE_GENERATION_REF_TYPE}:${input.tenantId}:${input.userId}:${input.batchId}:${input.requestKey}`;
}

export function buildTraceGenerationRef(batchId: string, generationKey: string) {
  return {
    refType: TRACE_GENERATION_REF_TYPE,
    refId: batchId,
    idempotencyKey: generationKey,
  };
}

export function buildTraceCodeLookup(tenantId: string, batchId: string, generationKey: string) {
  return {
    where: { tenantId, batchId, generationKey },
    orderBy: { createdAt: 'asc' as const },
  };
}

export function assertTraceGenerationRetryCount(existingCount: number, requestedCount: number): void {
  if (existingCount !== requestedCount) {
    throw new BadRequestException(`幂等键已用于生成 ${existingCount} 个溯源码,不能以 ${requestedCount} 个重试`);
  }
}

export function buildTraceCodeCreateData(input: TraceCodeCreateDataInput) {
  return input.codes.map((code) => ({
    tenantId: input.tenantId,
    batchId: input.batchId,
    code,
    reservationId: input.reservationId,
    generationKey: input.generationKey,
  }));
}
```

- [x] **Step 2: Run model tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/trace/trace.model.spec.ts
```

Expected: PASS.

---

### Task 3: Wire TraceService

**Files:**
- Modify: `packages/backend/src/modules/trace/trace.service.ts`

- [x] **Step 1: Replace inline trace-generation logic**

Use helpers in `generateCodes` and `listCodes`:

```typescript
assertTraceGenerationCount(count);
const normalizedRequestKey = normalizeTraceGenerationRequestKey(requestKey);
await this.scope.assertInScope(this.prisma, user, 'batch', batchId);
const generationKey = buildTraceGenerationKey({
  tenantId: user.tenantId,
  userId: user.userId,
  batchId,
  requestKey: normalizedRequestKey,
});
const ref = buildTraceGenerationRef(batchId, generationKey);
const traceCodeLookup = buildTraceCodeLookup(user.tenantId, batchId, generationKey);
const existingCodes = await this.prisma.traceCode.findMany(traceCodeLookup);
if (existingCodes.length > 0) {
  assertTraceGenerationRetryCount(existingCodes.length, count);
  await this.billing.confirmReservation(user, 'CODE', ref);
  return existingCodes;
}
```

Inside the transaction, reuse `buildTraceCodeLookup(...)`, `assertTraceGenerationRetryCount(...)`, and `buildTraceCodeCreateData(...)`. Keep `randomUUID()` code generation inside the service:

```typescript
const codes = Array.from({ length: count }, () => `ORC-${randomUUID().slice(0, 12).toUpperCase()}`);
```

For `listCodes`, import `MAX_CODES_PER_BATCH` from `trace.model` and keep the default `take: MAX_CODES_PER_BATCH`.

- [x] **Step 2: Run focused trace tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/trace/trace.model.spec.ts src/modules/trace/trace.service.spec.ts src/modules/trace/trace.controller.spec.ts
```

Expected: PASS.

---

### Task 4: Verify, Review, and Commit

Run verification serially because concurrent `prisma generate` can lock the Prisma Windows DLL:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend build
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit
git -c safe.directory=E:/code/nongchang diff --check
```

Request review with this scope:

```text
Review P10 trace generation model boundary. Ensure no controller/DTO/query/response behavior changed. Verify count validation, Idempotency-Key trimming/error behavior, generationKey/ref format, duplicate retry count guard, createMany row data, billing reserve/confirm/release order, random code format, transaction lock order, and listCodes cap all match previous behavior.
```

Commit:

```powershell
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p10-trace-generation-model-boundary.md packages/backend/src/modules/trace/trace.model.ts packages/backend/src/modules/trace/trace.model.spec.ts packages/backend/src/modules/trace/trace.service.ts
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang commit -m "refactor(backend): extract trace generation model helpers"
```

---

## Self-Review

- Spec coverage: The plan covers generation count validation, request-key normalization, generationKey/ref construction, existing-code lookup, retry mismatch guard, createMany data construction, service wiring, focused tests, full verification, review, and commit.
- Placeholder scan: No TBD/TODO placeholders remain.
- Type consistency: Helper names and signatures are consistent across tasks; `readonly string[]` is used where helpers only read arrays.
